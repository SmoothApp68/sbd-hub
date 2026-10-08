"""deduit60b.py — le programme déduit (QUESTIONNAIRE-COACH-V2 §5), référence de 60-3. Claude.ai, 08/10/2026.

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

SEUIL, MIN_FOIS, FENETRE_J, RECENT_J = 0.35, 4, 84, 28


def arrondi(x):
    return int(math.floor(x + 0.5))


def mediane(v):
    s = sorted(v); n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def jour(iso):
    return dt.date.fromisoformat(iso[:10])


def jac(a, b):
    return len(a & b) / len(a | b) if a | b else 0.0


def deduire(seances, mesures):
    """seances : [{id, debut, titre, series: [{rang, exercise_slug, type_serie, reps}]}] ; mesures : {slug: mesure}."""
    muscu = lambda s: mesures.get(s) in ('charge_reps', 'reps')
    S = sorted(seances, key=lambda s: (s['debut'], s['id']))
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
        for g in groupes:
            g['m'] = []
        for s in S:
            g, j = meilleur(groupes, s['sig'])
            if j >= SEUIL:
                g['m'].append(s)
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
        titres = collections.Counter(m['titre'] for m in g['m'])
        dernier_titre = {m['titre']: m['debut'] for m in g['m']}
        nom = sorted(titres, key=lambda t: (-titres[t], -int(jour(dernier_titre[t]).strftime('%Y%m%d'))))[0]
        derniere = max(m['debut'] for m in g['m'])[:10]
        routines.append({'nom': nom, 'fois': len(g['m']), 'derniere': derniere,
                         'cochee': (fin - jour(derniere)).days <= RECENT_J,
                         'exercices': [{'exercise_slug': e, 'series': s, 'reps': r, 'chauffes': c}
                                       for _, e, s, r, c in ex]})
    routines.sort(key=lambda r: (-r['fois'], r['derniere']))
    n = collections.Counter(r['nom'] for r in routines); vus = collections.Counter()
    for r in routines:
        if n[r['nom']] > 1:
            vus[r['nom']] += 1
            r['nom'] = r['nom'] + ' ' + 'ABCDEFGH'[vus[r['nom']] - 1]
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
