"""deduit60c.py — le programme déduit (QUESTIONNAIRE-COACH-V2 §5), référence de 60-7. Claude.ai, 08/10/2026.
Ordre d'affichage à égalité de séances inversé le 09/10/2026 (60-7c, décision d'Aurélien) : la plus RÉCENTE d'abord.

Reprend deduit60b.py et y inscrit les SIX CHOIX du portage JS (#386), pour que référence et portage disent la même
chose, au caractère près :
  1. un titre vide ou absent compte pour rien ; sans aucun titre, le groupe s'appelle « Routine » (60b plantait) ;
  2. les titres sont rognés (espaces de bord) ;
  3. deux routines de même nom, casse et espaces de bord ignorés, prennent « … A », « … B » ;
  4. les routines s'ordonnent par nombre de séances, puis par l'INSTANT de leur dernière séance, la plus RÉCENTE
     d'abord (60-7c : c'était la plus ancienne d'abord) ;
  5. les jours sont ceux du calendrier LOCAL (Europe/Paris), jamais l'UTC ;
  6. une séance qu'aucun profil n'atteint à la réaffectation RESTE dans son groupe (60b la perdait) ;
et, à égalité de fréquence, le titre le plus récent est celui de la séance la plus tardive du groupe.

Reprend deduit60b.py (60-3) :

Reprend deduit60.py (07/10) et fixe ce qui était flou pour un portage exact en JS :
- entrée triée par date croissante (puis identifiant) ; fenêtre = les 84 jours qui finissent à la DERNIÈRE séance de
  la personne (pas aujourd'hui : un historique arrêté en juin se lit sur ses 12 dernières semaines) ;
- arrondi : au plus proche, .5 vers le haut (jamais l'arrondi bancaire de Python) ;
- égalités : groupe le plus ancien d'abord ; exercices par position médiane, puis slug ;
- récence : un groupe dont la dernière séance a plus de 28 jours avant la dernière séance de la personne est
  proposé DÉCOCHÉ, avec sa date ;
- noms : le titre le plus fréquent du groupe (à égalité, le plus récent) ; deux routines au même nom deviennent
  « … A », « … B » dans l'ordre d'affichage.

Usage : python3 deduit60b.py            → affiche les cinq profils
        python3 deduit60b.py --cas F     → écrit le fichier de cas (Jordan, Léa, Mélodie) dans F
"""
import json, collections, sys, datetime as dt, math
from zoneinfo import ZoneInfo

TZ = ZoneInfo('Europe/Paris')

SEUIL, MIN_FOIS, FENETRE_J, RECENT_J = 0.35, 4, 84, 28


def arrondi(x):
    return int(math.floor(x + 0.5))


def mediane(v):
    s = sorted(v); n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def instant(iso):
    return dt.datetime.fromisoformat(iso.replace('Z', '+00:00'))


def jour(iso):
    # le jour du calendrier LOCAL de la séance (choix 5)
    return instant(iso).astimezone(TZ).date()


def jac(a, b):
    return len(a & b) / len(a | b) if a | b else 0.0


def deduire(seances, mesures):
    """seances : [{id, debut, titre, series: [{rang, exercise_slug, type_serie, reps}]}] ; mesures : {slug: mesure}."""
    muscu = lambda s: mesures.get(s) in ('charge_reps', 'reps')
    S = sorted(seances, key=lambda s: (instant(s['debut']), s['id']))
    if not S:
        return []
    fin = max(jour(s['debut']) for s in S)
    S = [s for s in S if (fin - jour(s['debut'])).days < FENETRE_J]
    for s in S:
        s['sig'] = frozenset(x['exercise_slug'] for x in s['series']
                             if x['type_serie'] in ('travail', 'echec') and muscu(x['exercise_slug']))
    S = [s for s in S if len(s['sig']) >= 2]

    def profil(m):
        c = collections.Counter(e for x in m for e in x['sig'])
        return frozenset(e for e, n in c.items() if n * 2 >= len(m))

    def meilleur(groupes, sig):
        best, bj = None, -1
        for g in groupes:                    # le plus ancien gagne à égalité
            j = jac(sig, g['p'])
            if j > bj:
                best, bj = g, j
        return best, bj

    groupes = []
    for s in S:
        g, j = meilleur(groupes, s['sig'])
        if g is not None and j >= SEUIL:
            g['m'].append(s); g['p'] = profil(g['m'])
        else:
            groupes.append({'m': [s], 'p': s['sig']})
    for _ in range(2):
        ou = {id(s): g for g in groupes for s in g['m']}
        for g in groupes:
            g['m'] = []
        for s in S:
            g, j = meilleur(groupes, s['sig'])
            (g if j >= SEUIL else ou[id(s)])['m'].append(s)      # choix 6
        groupes = [g for g in groupes if g['m']]
        for g in groupes:
            g['p'] = profil(g['m'])

    routines = []
    for g in groupes:
        if len(g['m']) < MIN_FOIS:
            continue
        ex = []
        for e in g['p']:
            pos, ser, reps, ch = [], [], [], []
            for m in g['m']:
                lignes = [x for x in m['series'] if x['exercise_slug'] == e]
                if not lignes:
                    continue
                tr = [x for x in lignes if x['type_serie'] in ('travail', 'echec')]
                rmax = max(y['rang'] for y in m['series'])
                pos.append(min(x['rang'] for x in lignes) / max(1, rmax))
                ser.append(len(tr))
                ch.append(sum(1 for x in lignes if x['type_serie'] == 'echauffement'))
                reps += [x['reps'] for x in tr if x['reps']]
            ex.append((mediane(pos), e, arrondi(mediane(ser)), arrondi(mediane(reps)) if reps else None,
                       arrondi(mediane(ch))))
        ex.sort(key=lambda t: (t[0], t[1]))
        titres = collections.Counter(); dernier_rang = {}
        for k, m in enumerate(g['m']):
            t = (m.get('titre') or '').strip()                            # choix 1 et 2
            if t:
                titres[t] += 1; dernier_rang[t] = k
        nom = sorted(titres, key=lambda t: (-titres[t], -dernier_rang[t]))[0] if titres else 'Routine'
        dern = g['m'][-1]['debut']                                        # la plus tardive (S est trié)
        routines.append({'nom': nom, 'fois': len(g['m']), 'derniere': jour(dern).isoformat(), '_instant': instant(dern),
                         'cochee': (fin - jour(dern)).days <= RECENT_J,
                         'exercices': [{'exercise_slug': e, 'series': s, 'reps': r, 'chauffes': c}
                                       for _, e, s, r, c in ex]})
    routines.sort(key=lambda r: (-r['fois'], -r['_instant'].timestamp()))  # choix 4 : la plus récente d'abord (60-7c)
    cle = lambda r: r['nom'].strip().lower()                              # choix 3
    n = collections.Counter(cle(r) for r in routines); vus = collections.Counter()
    for r in routines:
        k = cle(r)
        if n[k] > 1:
            r['nom'] = r['nom'] + ' ' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[vus[k]]
            vus[k] += 1
        del r['_instant']
    return routines


def charger():
    cat = json.load(open('catalogue.json'))['ex']
    mesures = {x[0]: x[4] for x in cat}
    D = json.load(open('seances12s.json'))
    par = collections.defaultdict(list)
    for i, s in enumerate(D):
        par[s['u']].append({'id': '%s-%03d' % (s['u'], i), 'debut': s['d'], 'titre': s['t'],
                            'series': [{'rang': x[0], 'exercise_slug': x[1], 'type_serie': x[2], 'reps': x[3]}
                                       for x in (s['x'] or [])]})
    return par, mesures, {x[0]: x[1] for x in cat}


if __name__ == '__main__':
    par, mesures, noms = charger()
    if len(sys.argv) > 2 and sys.argv[1] == '--cas':
        cas = []
        for u in ['jordan', 'lea', 'melodie']:
            slugs = {x['exercise_slug'] for s in par[u] for x in s['series']}
            entree = json.loads(json.dumps(par[u]))
            cas.append({'profil': u, 'mesures': {k: mesures.get(k) for k in sorted(slugs)},
                        'seances': entree, 'attendu': deduire(par[u], mesures)})
        json.dump({'reference': 'deduit60b.py', 'cas': cas}, open(sys.argv[2], 'w'), ensure_ascii=False)
        print('cas écrits :', sys.argv[2])
    else:
        for u, ss in par.items():
            R = deduire(ss, mesures)
            print('==', u, len(R), 'routines')
            for r in R:
                print('  %s %s — %d fois, dernière %s : %s' % ('✓' if r['cochee'] else '✗', r['nom'], r['fois'],
                      r['derniere'], ' · '.join('%s %d×%s' % (noms.get(x['exercise_slug'], x['exercise_slug']),
                                                          x['series'], x['reps']) for x in r['exercices'])))
