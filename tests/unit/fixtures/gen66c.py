#!/usr/bin/env python3
"""gen66c.py — le générateur v2, chemin « historique sans routines » : le programme déduit COMPLÉTÉ (G1-G5 de
FICHE-REGLES-GENERATEUR-V2). Référence de 66C. Claude.ai, 10/10/2026.

UNE fonction pure : `completer(entree) -> sortie`. Elle ne calcule AUCUN fait : elle lit
  · `deduit`    : le programme déduit (`faits.programmeDeduit`), `[{ nom, fois, derniere, cochee, exercices: [{
                  exercise_slug, series, reps, chauffes }] }]` ;
  · `volume`    : le fait du coach par muscle (`{ muscle: { seuil, max, … } | None }`), lu jusqu'à la semaine de la
                  dernière séance comprise ;
  · `habitudes` : `faits.habitudes` — `{ seances_par_semaine, taille_de_seance, reps: {slug}, series: {slug} }` ;
  · `fois`      : `faits.historiqueDesExercices` — `{ slug: séances }` sur la même fenêtre ;
  · `catalogue` (avec `habilete`), `profil` (`phase`), `priorites`.

Usage : python3 -I gen66c.py cas-66c-generateur.json            → rejoue les cas
        python3 -I gen66c.py cas-66c-generateur.json --ecrire   → régénère les attendus (changement de règle décidé)
"""
import json, sys

# ── Les tables (une seule fois) ───────────────────────────────────────────────────────────────────────────────────
BARRES = ['squat_barre', 'developpe_couche_barre', 'souleve_de_terre_barre', 'developpe_militaire_barre']
POIDS = {'prim': 1.0, 'sec': 0.5, 'stab': 0.25}
MUSCLES = ['pectoraux', 'grand_dorsal', 'haut_du_dos', 'trapezes', 'bas_du_dos', 'deltoide_anterieur',
           'deltoide_lateral', 'deltoide_posterieur', 'biceps', 'triceps', 'avant_bras', 'quadriceps',
           'ischio_jambiers', 'fessiers', 'mollets', 'adducteurs', 'abducteurs', 'abdominaux']
ZONES = {'poitrine': ['pectoraux'], 'dos': ['grand_dorsal', 'haut_du_dos', 'trapezes', 'bas_du_dos'],
         'epaules': ['deltoide_anterieur', 'deltoide_lateral', 'deltoide_posterieur'],
         'bras': ['biceps', 'triceps', 'avant_bras'],
         'jambes': ['quadriceps', 'ischio_jambiers', 'fessiers', 'mollets', 'adducteurs', 'abducteurs'],
         'tronc': ['abdominaux']}
ZONE_DE = {m: z for z, ms in ZONES.items() for m in ms}
# Où placer un exercice ajouté : une séance du même étage (haut du corps / bas du corps) ; le tronc va partout (C).
# Le bas du dos va avec le bas du corps (la chaîne postérieure), pas avec le dos.
ETAGE = {m: 'haut' for m in ZONES['poitrine'] + ZONES['dos'] + ZONES['epaules'] + ZONES['bras']}
ETAGE.update({m: 'bas' for m in ZONES['jambes'] + ['bas_du_dos']})
ETAGE['abdominaux'] = None
TIRAGE = {'grand_dorsal', 'haut_du_dos'}
ECART = 1.0          # G4 : un muscle « sous son habitude » = plus d'une série sous sa cible (K)
SERIES_MAX = 5       # G4 : une série de plus seulement sous 5 séries (K, D8)
PAR_SEANCE = 11.0    # G4 : ~11 séries fractionnaires d'un muscle par séance (Remmert, Pelland 2025, préprint) (s)
MARGE_SEANCE = 2     # G4 : au plus la taille habituelle d'une séance + 2 séries (K)
NOUVEAU_MIN, NOUVEAU_MAX = 2, 3   # G4 : un exercice ajouté prend ses séries habituelles, bornées à 2-3 (K)
TOURS = 200          # garde-fou de la boucle (jamais atteint sur les cas)


# ── Les définitions lues (chacune a son pareil en JS, nommé dans la spec) ─────────────────────────────────────────
def ponderes(fiche):                        # Semaine.musclesPonderes : principaux, secondaires, stabilisateurs
    out = []
    for cle, role in (('muscles_primaires', 'prim'), ('muscles_secondaires', 'sec'), ('muscles_stabilisateurs', 'stab')):
        for m in fiche.get(cle) or []:
            out.append((m, POIDS[role]))
    return out

def barre_lourde(slug, cat):               # une des quatre barres, ou un de ses frères à la barre (Modele.freresDe)
    if slug in BARRES:
        return True
    f = cat.get(slug) or {}
    if f.get('equipement') != 'barre' or not f.get('mouvement'):
        return False
    return any((cat.get(b) or {}).get('mouvement') == f['mouvement'] for b in BARRES)

def tirage(fiche):                          # la même définition que la relecture (§5 ter.4)
    return any(m in TIRAGE for m in fiche.get('muscles_primaires') or [])

def poussee(slug, cat):
    f = cat.get(slug) or {}
    if 'pectoraux' in (f.get('muscles_primaires') or []):
        return True
    mil = (cat.get('developpe_militaire_barre') or {}).get('mouvement')
    # 184 (B6) : le militaire à tout matériel (haltères…) est une poussée, comme à la barre.
    return slug == 'developpe_militaire_barre' or bool(mil and f.get('mouvement') == mil)


def completer(e):
    cat = e['catalogue']; vol = e.get('volume') or {}; hab = e['habitudes']; fois = e.get('fois') or {}
    seche = (e.get('profil') or {}).get('phase') == 'seche'
    prio = set(e.get('priorites') or [])
    # 66D — les changements que la personne a RETIRÉS dans l'aperçu : retirer ne remplace rien (QUESTIONNAIRE
    # §5 quater.5). `muscles` : rien n'est ajouté pour eux (G4) ; `reprises` : ces séances ne reviennent pas, et
    # aucune autre ne vient à leur place ; `tirage` : G5 ne joue pas. Absent : le comportement de 66C, à l'identique.
    refus = e.get('refus') or {}
    refus_muscles = set(refus.get('muscles') or []); refus_reprises = set(refus.get('reprises') or [])
    journal = []

    # G3 — les séances : les cochées, puis les décochées les plus récentes tant qu'il en manque.
    rs = [dict(nom=r['nom'], derniere=r['derniere'], exercices=[dict(x) for x in r['exercices']])
          for r in e['deduit'] if r['cochee']]
    restantes = sorted([r for r in e['deduit'] if not r['cochee']], key=lambda r: r['derniere'], reverse=True)
    sautees = 0
    for r in restantes:
        if len(rs) + sautees >= hab['seances_par_semaine']:
            break
        if r['nom'] in refus_reprises:                     # retirée : sa place reste vide
            sautees += 1
            continue
        rs.append(dict(nom=r['nom'], derniere=r['derniere'], exercices=[dict(x) for x in r['exercices']]))
        journal.append({'type': 'reprise', 'routine': r['nom']})

    def volume_semaine():
        v = {m: 0.0 for m in MUSCLES}
        for r in rs:
            for x in r['exercices']:
                for m, p in ponderes(cat.get(x['exercise_slug']) or {}):
                    v[m] += p * x['series']
        return v

    def dans_seance(r, m):
        return sum(p * x['series'] for x in r['exercices'] for mm, p in ponderes(cat.get(x['exercise_slug']) or {}) if mm == m)

    def taille(r):
        return sum(x['series'] for x in r['exercices'])

    # G2 — la cible : le 3e quartile ; prioritaire hors sèche : le plus haut ; jamais au-dessus du plus haut.
    cible = {}
    for m in MUSCLES:
        f = vol.get(m)
        if not f or m in refus_muscles:
            continue
        cible[m] = f['max'] if (ZONE_DE[m] in prio and not seche) else f['seuil']

    def permis(slug, n, v, r):
        # Ajouter n séries de `slug` dans `r` : aucun muscle au-dessus de son plus haut volume, ni de ~11 dans la séance.
        for m, p in ponderes(cat.get(slug) or {}):
            f = vol.get(m)
            if f and v[m] + p * n > f['max'] + 1e-9:
                return False
            if dans_seance(r, m) + p * n > PAR_SEANCE + 1e-9:
                return False
        return taille(r) + n <= hab['taille_de_seance'] + MARGE_SEANCE

    def comblable(slug):
        f = cat.get(slug) or {}
        return (not f.get('habilete') and not barre_lourde(slug, cat)
                and f.get('mesure') in ('charge_reps', 'reps'))

    def une_serie(m, v, motif):
        # Une série de plus là où m est principal (moins de 5 séries) : la ligne la moins chargée, puis la première.
        meilleur = None
        for i, r in enumerate(rs):
            for k, x in enumerate(r['exercices']):
                s = x['exercise_slug']
                if m not in ((cat.get(s) or {}).get('muscles_primaires') or []):
                    continue
                if x['series'] >= SERIES_MAX or not comblable(s) or not permis(s, 1, v, r):
                    continue
                cle = (x['series'], i, k)
                if meilleur is None or cle < meilleur[0]:
                    meilleur = (cle, r, x)
        if not meilleur:
            return False
        _, r, x = meilleur
        journal.append({'type': 'serie', 'motif': motif, 'muscle': m, 'routine': r['nom'],
                        'exercise_slug': x['exercise_slug'], 'de': x['series'], 'a': x['series'] + 1})
        x['series'] += 1
        return True

    def un_exercice(m, v, motif):
        # Son exercice le plus fait pour m (principal), absent du programme : dans une séance du même étage (haut ou bas
        # du corps ; le tronc partout), la moins longue, puis la première ; aucune : le muscle reste sous son habitude.
        dedans = {x['exercise_slug'] for r in rs for x in r['exercices']}
        cands = sorted([s for s in fois if s not in dedans and s in cat and comblable(s)
                        and m in (cat[s].get('muscles_primaires') or [])],
                       key=lambda s: (-fois[s], s))
        for s in cands:
            voulu = min(NOUVEAU_MAX, max(NOUVEAU_MIN, (hab.get('series') or {}).get(s, NOUVEAU_MAX)))
            places = []
            for i, r in enumerate(rs):
                # ses séries habituelles (2 à 3) ; s'il ne reste que la place de 2, 2
                n = next((k for k in range(voulu, NOUVEAU_MIN - 1, -1) if permis(s, k, v, r)), None)
                if n is None:
                    continue
                etage = ETAGE[m]
                meme = etage is None or any(ETAGE.get(mm) == etage for x in r['exercices']
                                            for mm in (cat.get(x['exercise_slug']) or {}).get('muscles_primaires') or [])
                if meme:                                    # seulement une séance du même étage
                    places.append((taille(r), i, n, r))
            if not places:
                continue
            _, _, n, r = min(places, key=lambda t: t[:2])
            reps = (hab.get('reps') or {}).get(s)
            r['exercices'].append({'exercise_slug': s, 'series': n, 'reps': reps, 'chauffes': 0})
            journal.append({'type': 'exercice', 'motif': motif, 'muscle': m, 'routine': r['nom'],
                            'exercise_slug': s, 'series': n, 'reps': reps})
            return True
        return False

    # G4 — combler les muscles sous leur cible, le plus grand écart d'abord (à égalité : l'ordre de MUSCLES).
    bloques = set()
    for _ in range(TOURS):
        v = volume_semaine()
        manque = sorted([m for m in cible if m not in bloques and v[m] < cible[m] - ECART],
                        key=lambda m: (-(cible[m] - v[m]), MUSCLES.index(m)))
        if not manque:
            break
        m = manque[0]
        if not (une_serie(m, v, 'habitude') or un_exercice(m, v, 'habitude')):
            bloques.add(m)

    # G5 — au moins autant de tirage que de poussée (séries directes), par les mêmes gestes.
    def tirage_poussee():
        t = sum(x['series'] for r in rs for x in r['exercices'] if tirage(cat.get(x['exercise_slug']) or {}))
        p = sum(x['series'] for r in rs for x in r['exercices'] if poussee(x['exercise_slug'], cat))
        return t, p
    for _ in range(0 if refus.get('tirage') else TOURS):
        t, p = tirage_poussee()
        if t >= p:
            break
        v = volume_semaine()
        if not any(une_serie(m, v, 'tirage') or un_exercice(m, v, 'tirage') for m in ('grand_dorsal', 'haut_du_dos')):
            break

    v = volume_semaine()
    t, p = tirage_poussee()
    sous = [m for m in MUSCLES if m in cible and v[m] < cible[m] - ECART]   # un muscle retiré n'y est pas (66D)
    return {'routines': [{'nom': r['nom'], 'exercices': r['exercices']} for r in rs],
            'journal': journal, 'sous_habitude': sous, 'tirage': t, 'poussee': p}


# ── Les invariants (V1 à V5) ──────────────────────────────────────────────────────────────────────────────────────
def verifier(e, s):
    cat = e['catalogue']; vol = e.get('volume') or {}; hab = e['habitudes']; fautes = []
    avant = {r['nom']: {x['exercise_slug']: x['series'] for x in r['exercices']} for r in e['deduit']}
    for r in s['routines']:
        a = avant.get(r['nom'], {})
        for x in r['exercices']:
            if x['exercise_slug'] in a and x['series'] < a[x['exercise_slug']]:
                fautes.append('V1 une série retirée')                              # le complément n'enlève rien
            if x['exercise_slug'] not in a and (cat.get(x['exercise_slug']) or {}).get('habilete'):
                fautes.append('V2 une habileté ajoutée')
            if x['exercise_slug'] not in a and barre_lourde(x['exercise_slug'], cat):
                fautes.append('V3 une barre lourde ajoutée')
        if sum(x['series'] for x in r['exercices']) > max(sum(a.values()), hab['taille_de_seance'] + MARGE_SEANCE):
            fautes.append('V4 une séance au-delà de sa taille + 2')
    tot = {m: 0.0 for m in MUSCLES}; tot0 = {m: 0.0 for m in MUSCLES}
    for r in s['routines']:
        for x in r['exercices']:
            for m, p in ponderes(cat.get(x['exercise_slug']) or {}):
                tot[m] += p * x['series']
    for r in e['deduit']:
        if r['cochee'] or any(j.get('type') == 'reprise' and j.get('routine') == r['nom'] for j in s['journal']):
            for x in r['exercices']:
                for m, p in ponderes(cat.get(x['exercise_slug']) or {}):
                    tot0[m] += p * x['series']
    for m in MUSCLES:
        f = vol.get(m)
        if f and tot[m] > max(f['max'], tot0[m]) + 1e-9:
            fautes.append('V5 %s au-dessus de son plus haut volume' % m)          # jamais par un ajout
    return fautes


def main():
    chemin = sys.argv[1]
    data = json.load(open(chemin, encoding='utf-8'))
    ecart = 0
    for cas in data['cas']:
        e = dict(cas['entree']); e['catalogue'] = data['catalogue']
        obtenu = completer(json.loads(json.dumps(e)))
        f = verifier(e, obtenu)
        if f:
            print('INVARIANT', cas['nom'], f); ecart += 1
        if '--ecrire' in sys.argv:
            cas['attendu'] = obtenu
        elif json.dumps(obtenu, sort_keys=True) != json.dumps(cas['attendu'], sort_keys=True):
            print('ÉCART', cas['nom']); ecart += 1
    if '--ecrire' in sys.argv:
        with open(chemin, 'w', encoding='utf-8') as f:
            f.write('{\n')
            cles = [k for k in data if k != 'cas']
            for k in cles:
                f.write(' %s: %s,\n' % (json.dumps(k), json.dumps(data[k], ensure_ascii=False, sort_keys=True)))
            f.write(' "cas": [\n')
            f.write(',\n'.join('  ' + json.dumps(c, ensure_ascii=False, sort_keys=True) for c in data['cas']))
            f.write('\n ]\n}\n')
        print('attendus régénérés : %d cas' % len(data['cas']))
    else:
        print('%d cas, %d écart(s)' % (len(data['cas']), ecart))
    sys.exit(1 if ecart else 0)


if __name__ == '__main__':
    main()
