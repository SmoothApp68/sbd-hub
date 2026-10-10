#!/usr/bin/env python3
"""Référence du jeu V1 (JEU-V1.md) — UNE seule référence : série et gels, muscles, XP, niveau, succès, titres,
cadres, le plus proche.

Usage : python3 -I jeu_ref.py cas-jeu-v1.json            # rejoue les cas et compare aux attendus
        python3 -I jeu_ref.py cas-jeu-v1.json --ecrire   # régénère les attendus (changement de règle décidé)

L'entrée d'un cas est celle de `THJeu.etatDuJeu` (JEU-V1 §8), en JSON : `aujourdhui` « AAAA-MM-JJ », `debut` en ISO.
Les historiques réels sont stockés compacts (`compact`) et dépliés ici comme dans le test JavaScript (`deplier`).
La semaine se lit à l'heure de Paris (le fuseau de Jest, `jest.globalSetup.js`).
"""
import json, math, sys, datetime as dt
from zoneinfo import ZoneInfo

PARIS = ZoneInfo('Europe/Paris')
ZONES = [('jambes', ['quadriceps', 'ischio_jambiers', 'fessiers', 'mollets', 'adducteurs', 'abducteurs']),
         ('dos', ['grand_dorsal', 'haut_du_dos', 'trapezes', 'bas_du_dos']),
         ('bras', ['biceps', 'triceps', 'avant_bras']),
         ('epaules', ['deltoide_anterieur', 'deltoide_lateral', 'deltoide_posterieur']),
         ('poitrine', ['pectoraux']),
         ('tronc', ['abdominaux'])]
ZONE_DE = {m: z for z, ms in ZONES for m in ms}
MUSCLES = ['poitrine', 'dos', 'epaules', 'bras', 'jambes', 'tronc', 'cardio']
PLAFOND_MUSCLE, COUT, NIVEAU_MAX_MUSCLE = 7500, 3, 50
XP_RECORD, XP_SEMAINE, POIDS_XP = 20, 165, 0.5
PLAFOND = 7 * PLAFOND_MUSCLE + POIDS_XP * 40000          # 72 500
K = PLAFOND / 10000                                       # 7,25
OMEGA = PLAFOND / 10                                      # 7 250
PREMIER_GEL, PAS_GEL, GELS_MAX = 12, 26, 2
POINTS = {'c': 10, 'r': 25, 'e': 50, 'm': 100}
RANG = {'c': 0, 'r': 1, 'e': 2, 'm': 3}
RANDO, SORTIE_M = 'randonnee', 20000
PALIERS = [('seances', [(10, 'c'), (50, 'c'), (100, 'r'), (250, 'r'), (500, 'e'), (1000, 'm')]),
           ('serie', [(4, 'c'), (12, 'c'), (26, 'r'), (52, 'e'), (104, 'm')]),
           ('records', [(10, 'c'), (50, 'c'), (100, 'r'), (250, 'r'), (500, 'e'), (1000, 'e'), (2500, 'm')]),
           ('rando', [(50, 'c'), (100, 'r'), (250, 'e'), (500, 'm')]),
           ('decouverte', [(10, 'c'), (25, 'c'), (50, 'r'), (100, 'e')])]
MUSCLE_PALIERS = [(10, 'c'), (20, 'c'), (30, 'r'), (40, 'e'), (50, 'm')]
TITRES = [(10, 'equilibre', 'c'), (20, 'polyvalent', 'r'), (30, 'athlete', 'e'), (40, 'accompli', 'e'), (50, 'complet', 'm')]
COLLECTIONNEUR = 50
CADRES = ['vitrine', 'niveau', 'or', 'grave']


def lundi(debut):
    t = dt.datetime.fromisoformat(debut.replace('Z', '+00:00')).astimezone(PARIS).date()
    return t - dt.timedelta(days=t.weekday())


def est_travail(s):
    return (s.get('type_serie') or 'travail') == 'travail'


def est_cardio(e):
    return bool(e) and e.get('charge') == 'aucune' and e.get('mesure') in ('temps', 'distance_temps') \
        and not (e.get('muscles_primaires') or [])


# ── §2 la série de semaines ──────────────────────────────────────────────────
def semaines(entree):
    act = sorted({lundi(s['debut']) for s in entree['seances'] if s.get('debut')})
    vide = dict(actives=0, serie=0, meilleure=0, reserve=0, gelsGagnes=0, gelsUtilises=[], prochainGel=PREMIER_GEL)
    if not act:
        return vide
    auj = dt.date.fromisoformat(entree['aujourdhui'])
    semaine_auj = auj - dt.timedelta(days=auj.weekday())
    fin = max(semaine_auj, act[-1])
    s_act = set(act)
    serie = best = reserve = gagnes = 0
    utilises = []
    d = act[0]
    while d <= fin:
        if d in s_act:
            serie += 1
            if serie == PREMIER_GEL or (serie > PREMIER_GEL and (serie - PREMIER_GEL) % PAS_GEL == 0):
                if reserve < GELS_MAX:
                    reserve += 1
                    gagnes += 1
        elif d < semaine_auj:
            if reserve > 0 and serie > 0:
                reserve -= 1
                utilises.append(d.isoformat())
            else:
                serie = 0
        best = max(best, serie)
        d += dt.timedelta(days=7)
    if reserve >= GELS_MAX:
        prochain = None
    elif serie < PREMIER_GEL:
        prochain = PREMIER_GEL - serie
    else:
        prochain = PAS_GEL - (serie - PREMIER_GEL) % PAS_GEL
    return dict(actives=len(act), serie=serie, meilleure=best, reserve=reserve, gelsGagnes=gagnes,
                gelsUtilises=utilises, prochainGel=prochain)


# ── §3 les muscles ───────────────────────────────────────────────────────────
def niveau_muscle(p):
    return min(NIVEAU_MAX_MUSCLE, int(math.floor(math.sqrt(p / COUT) + 1e-9)))


def muscles(entree):
    cat = entree['catalogue']
    pts = {m: 0.0 for m in MUSCLES}
    for s in entree['series']:
        if not est_travail(s):
            continue
        e = cat.get(s['exercise_slug'])
        if not e:
            continue
        if est_cardio(e):
            pts['cardio'] += (s.get('duree_s') or 0) / 60
            continue
        par_zone = {}
        for m in e.get('muscles_primaires') or []:
            z = ZONE_DE.get(m)
            if z:
                par_zone[z] = 1.0
        for m in e.get('muscles_secondaires') or []:
            z = ZONE_DE.get(m)
            if z and z not in par_zone:
                par_zone[z] = 0.5
        for m in e.get('muscles_stabilisateurs') or []:
            z = ZONE_DE.get(m)
            if z and z not in par_zone:
                par_zone[z] = 0.25
        for z, v in par_zone.items():
            pts[z] += v
    out = {}
    for m in MUSCLES:
        n = niveau_muscle(pts[m])
        out[m] = dict(points=round(pts[m], 6), niveau=n,
                      prochain=None if n >= NIVEAU_MAX_MUSCLE else round(COUT * (n + 1) ** 2 - pts[m], 6))
    return out


# ── §5 les succès ────────────────────────────────────────────────────────────
def compteurs(entree, sem):
    km = sum((s.get('distance_m') or 0) for s in entree['series']
             if est_travail(s) and s['exercise_slug'] == RANDO) / 1000
    sortie = any(est_travail(s) and s['exercise_slug'] == RANDO and (s.get('distance_m') or 0) > SORTIE_M
                 for s in entree['series'])
    records = len({l['set_id'] for l in entree.get('journal') or [] if l.get('set_id')})
    return dict(seances=len(entree['seances']), serie=sem['meilleure'], records=records, rando=km,
                decouverte=entree.get('exercicesFaits') or 0), sortie


def succes(entree, sem, mus):
    c, sortie = compteurs(entree, sem)
    liste = []
    for cat, paliers in PALIERS:
        for n, r in paliers:
            if c[cat] >= n:
                liste.append((f'{cat}-{n}', r))
    if sortie:
        liste.append(('rando-sortie-20', 'r'))
    for m in MUSCLES:
        for n, r in MUSCLE_PALIERS:
            if mus[m]['niveau'] >= n:
                liste.append((f'muscle-{m}-{n}', r))
    mini = min(mus[m]['niveau'] for m in MUSCLES)
    for n, _, r in TITRES:
        if mini >= n:
            liste.append((f'tous-{n}', r))
    for x in entree.get('maximums') or []:
        b, v = x['slug'], x.get('charge') or 0
        k = 40
        while k <= v + 1e-9:
            liste.append((f'cap-{b}-{k}', 'c'))
            k += 20
    return liste, c


def titres_et_cadres(liste, mus):
    mini = min(mus[m]['niveau'] for m in MUSCLES)
    titres = [t for n, t, _ in TITRES if mini >= n]
    if len(liste) >= COLLECTIONNEUR:
        titres.append('collectionneur')
    titre = ([t for t in titres if t != 'collectionneur'] or [None])[-1]
    if titre is None and 'collectionneur' in titres:
        titre = 'collectionneur'
    rangs = [RANG[r] for _, r in liste]
    cadres = []
    if len(liste) >= 10:
        cadres.append('vitrine')
    if any(x >= 1 for x in rangs):
        cadres.append('niveau')
    if any(x >= 2 for x in rangs):
        cadres.append('or')
    if 'athlete' in titres:
        cadres.append('grave')
    cadre = max(cadres, key=CADRES.index) if cadres else None
    return titres, titre, cadres, cadre


# ── §7 le plus proche ────────────────────────────────────────────────────────
def prochains(mus, c, sem):
    out = []
    for m in MUSCLES:
        n = mus[m]['niveau']
        if n >= NIVEAU_MAX_MUSCLE:
            continue
        bas, haut = COUT * n * n, COUT * (n + 1) ** 2
        p = mus[m]['points']
        out.append(dict(type='muscle', cle=m, cible=n + 1, reste=round(haut - p, 6),
                        fait=round(max(0.0, (p - bas) / (haut - bas)), 6)))
    for cat, paliers in PALIERS:
        val = c[cat]
        prec = 0
        cible = None
        for n, _ in paliers:
            if val >= n:
                prec = n
            else:
                cible = n
                break
        if cible is None:
            continue
        courant = sem['serie'] if cat == 'serie' else val
        out.append(dict(type='categorie', cle=cat, cible=cible, reste=round(cible - courant, 6),
                        fait=round(max(0.0, (courant - prec) / (cible - prec)), 6)))
    meilleur = None
    for x in out:
        if meilleur is None or x['fait'] > meilleur['fait'] + 1e-12:
            meilleur = x
    return out, meilleur


def etat_du_jeu(entree):
    sem = semaines(entree)
    mus = muscles(entree)
    liste, c = succes(entree, sem, mus)
    pts_succes = sum(POINTS[r] for _, r in liste)
    xp_records = XP_RECORD * c['records']
    xp_semaines = XP_SEMAINE * sem['actives']
    xp = xp_records + xp_semaines + pts_succes
    reserve = sum(min(mus[m]['points'], PLAFOND_MUSCLE) for m in MUSCLES) + POIDS_XP * xp
    n = min(100, int(math.floor(math.sqrt(reserve / K) + 1e-9)))
    if n >= 100:
        omega = int(math.floor((reserve - PLAFOND) / OMEGA + 1e-9))
        prochain = PLAFOND + (omega + 1) * OMEGA - reserve
    else:
        omega = None
        prochain = K * (n + 1) ** 2 - reserve
    titres, titre, cadres, cadre = titres_et_cadres(liste, mus)
    pro, plus = prochains(mus, c, sem)
    return dict(
        semaines=sem,
        muscles=mus,
        xp=dict(records=xp_records, semaines=xp_semaines, succes=pts_succes, total=xp),
        niveau=dict(reserve=round(reserve, 6), niveau=n, omega=omega, prochain=round(prochain, 6)),
        succes=dict(nombre=len(liste), points=pts_succes, ids=[i for i, _ in liste]),
        titres=titres, titre=titre, cadres=cadres, cadre=cadre,
        prochains=pro, plusProche=plus)


# ── les cas ──────────────────────────────────────────────────────────────────
def deplier(cas):
    """Les historiques sont compacts : `compact` = [[debut, [[slug, travail, autres, duree, [distances]]]]], où `slug`
    peut être un entier : le rang du slug dans les clés triées du catalogue du cas. `lundis` = une séance par lundi
    (« AAAA-MM-JJ », à 12:00 UTC, un crunch).
    Chaque série de travail est une ligne ; la première porte toute la durée de l'exercice dans la séance, la i-ème la
    i-ème distance ; les autres séries sont des chauffes. Le journal compact `{ series, lignes }` donne `series` set_id
    distincts et `lignes` lignes au total."""
    e = dict(cas['entree'])
    if isinstance(e.get('catalogue'), str):
        e['catalogue'] = cas['_catalogues'][e['catalogue']]
    if 'lundis' in e:
        e['compact'] = [[l + 'T12:00:00Z', [['crunch', 1, 0, 0, []]]] for l in e.pop('lundis')]
    if 'compact' in e:
        noms = sorted(e['catalogue'])
        seances, series = [], []
        for i, (debut, exos) in enumerate(e.pop('compact')):
            sid = f's{i + 1}'
            seances.append({'id': sid, 'debut': debut})
            for slug, n, autres, duree, dist in exos:
                slug = noms[slug] if isinstance(slug, int) else slug
                for k in range(n):
                    series.append({'session_id': sid, 'exercise_slug': slug, 'type_serie': 'travail',
                                   'duree_s': duree if k == 0 else 0,
                                   'distance_m': dist[k] if k < len(dist) else None})
                for k in range(autres):
                    series.append({'session_id': sid, 'exercise_slug': slug, 'type_serie': 'echauffement',
                                   'duree_s': None, 'distance_m': None})
        e['seances'], e['series'] = seances, series
    if isinstance(e.get('journal'), dict):
        j = e['journal']
        e['journal'] = [{'set_id': f'm{(k % j["series"]) + 1}', 'type': 'charge_max'} for k in range(j['lignes'])]
    return e


def main():
    chemin = sys.argv[1]
    data = json.load(open(chemin, encoding='utf-8'))
    ecart = 0
    for cas in data['cas']:
        cas['_catalogues'] = data['catalogues']
        obtenu = etat_du_jeu(deplier(cas))
        del cas['_catalogues']
        if '--ecrire' in sys.argv:
            cas['attendu'] = obtenu
        elif json.dumps(obtenu, sort_keys=True) != json.dumps(cas['attendu'], sort_keys=True):
            ecart += 1
            print('ÉCART', cas['nom'])
    if '--ecrire' in sys.argv:
        texte = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
        open(chemin, 'w', encoding='utf-8').write(texte.replace('{"nom":', '\n{"nom":') + '\n')
        print('attendus régénérés :', len(data['cas']), 'cas')
    else:
        print(f"{len(data['cas'])} cas, {ecart} écart(s)")
        sys.exit(1 if ecart else 0)


if __name__ == '__main__':
    main()
