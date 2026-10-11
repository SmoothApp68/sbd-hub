# Référence 75 — « Ton parcours » (11/10/2026). Pure, sans dépendance. Fait foi pour la concordance JS.
import math, datetime
from fractions import Fraction

ZONES = [('jambes','Jambes',['quadriceps','ischio_jambiers','fessiers','mollets','adducteurs','abducteurs']),
         ('dos','Dos',['grand_dorsal','haut_du_dos','trapezes','bas_du_dos']),
         ('bras','Bras',['biceps','triceps','avant_bras']),
         ('epaules','Épaules',['deltoide_anterieur','deltoide_lateral','deltoide_posterieur']),
         ('poitrine','Poitrine',['pectoraux']),
         ('tronc','Tronc',['abdominaux'])]
ZONE_DE = {m: z for z, _, ms in ZONES for m in ms}
LIBELLE = {z: l for z, l, _ in ZONES}
GRANDS = ['squat_barre', 'developpe_couche_barre', 'souleve_de_terre_barre', 'developpe_militaire_barre']
NOM_COURT = {'squat_barre': 'squat', 'developpe_couche_barre': 'couché',
             'souleve_de_terre_barre': 'soulevé', 'developpe_militaire_barre': 'militaire'}
RAPPORTS = [('squat_barre', 'developpe_couche_barre'),
            ('developpe_militaire_barre', 'developpe_couche_barre'),
            ('souleve_de_terre_barre', 'squat_barre')]
# Repères StrengthLog (carnets d'entraînement) : moyenne des niveaux intermédiaire et avancé, standards d'ensemble.
# Sexe non précisé : pas de repère.
REPERES = {'homme': [Fraction(121, 100), Fraction(57, 100), Fraction(125, 100)],
           'femme': [Fraction(152, 100), Fraction(63, 100), Fraction(125, 100)]}
SCORE = {'↑': 2, '↗': 1, '▬': 0, '↘': -1, '↓': -2}
MOTS = {1: 'un', 2: 'deux', 3: 'trois', 4: 'quatre', 5: 'cinq', 6: 'six'}
MIN_SEANCES = 5
JOURS_R = 182   # R : du jour J-182 à J inclus
JOURS_A = 365   # P : de J-365 à J-183 inclus

def jour(debut): return debut[:10]
def moins_jours(j, n):
    d = datetime.date.fromisoformat(j) - datetime.timedelta(days=n)
    return d.isoformat()
def fr(x):  # Fraction depuis un nombre JSON, exacte au centième
    return Fraction(str(x))

def periode(j, J):
    if j > J: return None
    if j >= moins_jours(J, JOURS_R): return 'R'
    if j >= moins_jours(J, JOURS_A): return 'P'
    return None

def verdict_reps(h, b, n):
    if h - b >= 2: return '↑'
    if b - h >= 2: return '↓'
    if h > b and b == 0 and 2 * h >= n: return '↑'
    if b > h and h == 0 and 2 * b >= n: return '↓'
    if h > b: return '↗'
    if b > h: return '↘'
    return '▬'

def verdict_ecart(d):
    if d > 0.05: return '↑'
    if d > 0.025: return '↗'
    if d < -0.05: return '↓'
    if d < -0.025: return '↘'
    return '▬'

def courbe(cellules):
    # cellules : [(periode, reps, charge)] reps<=12 ; k en millièmes de 5 à 80 ; égalité -> le plus petit k
    best = None
    for km in range(5, 81):
        k = km / 1000.0
        niv = {}
        for p, r, c in cellules:
            v = math.log(c) + math.log(1 + k * r)
            niv[p] = max(niv.get(p, -1e300), v)
        err = sum((math.log(c) + math.log(1 + k * r) - niv[p]) ** 2 for p, r, c in cellules)
        if best is None or err < best[0] - 1e-12: best = (err, km)
    km = best[1]
    k = (1 / 30.0) if km in (5, 80) else km / 1000.0
    niv = {}
    for p, r, c in cellules:
        v = math.log(c) + math.log(1 + k * r)
        niv[p] = max(niv.get(p, -1e300), v)
    return math.exp(niv['R'] - niv['P']) - 1, (None if km in (5, 80) else km)

def parcours(entree):
    J = entree['aujourdhui']
    cat = {e['slug']: e for e in entree['catalogue']}
    prios = [p for p in entree.get('priorites', []) if p in LIBELLE]
    seances = {'P': {}, 'R': {}}
    cell = {}      # slug -> {'P':{reps:charge}, 'R':{...}}
    histo = {}     # slug -> {mois: meilleure charge à 5 reps ou plus}  (grands mouvements, tout l'historique)
    for s in entree['series']:
        slug, reps, ch = s['slug'], s.get('reps'), s.get('charge')
        j = jour(s['debut'])
        if slug in GRANDS and ch is not None and ch > 0 and reps is not None and 5 <= reps <= 15 and j <= J:
            m = j[:7]; h = histo.setdefault(slug, {})
            if fr(ch) > h.get(m, Fraction(0)): h[m] = fr(ch)
        p = periode(j, J)
        if p is None: continue
        seances[p].setdefault(slug, set()).add(s['seance'])
        if ch is not None and ch > 0 and reps is not None and 1 <= reps <= 15:
            d = cell.setdefault(slug, {'P': {}, 'R': {}})[p]
            if fr(ch) > d.get(reps, Fraction(0)): d[reps] = fr(ch)
    ex = {}
    for slug in sorted(set(seances['P']) | set(seances['R'])):
        e = cat.get(slug)
        if not e or e.get('habilete'): continue
        mp = e.get('muscles_primaires') or []
        z = ZONE_DE.get(mp[0]) if mp else None
        if z is None: continue
        if slug not in cell: continue          # jamais en charge : hors parcours
        nP, nR = len(seances['P'].get(slug, ())), len(seances['R'].get(slug, ()))
        o = {'slug': slug, 'nom': e['nom'], 'zone': z, 'muscle': mp[0], 'nP': nP, 'nR': nR,
             'poids': 2 if slug in GRANDS else 1, 'etat': None, 'methode': None, 'detail': [], 'ecart': None, 'k': None}
        if nP >= MIN_SEANCES and 2 * nR < nP: o['etat'] = 'moins'
        elif nR >= MIN_SEANCES and nP < MIN_SEANCES: o['etat'] = 'nouveau'
        elif nP < MIN_SEANCES or nR < MIN_SEANCES: o['etat'] = 'peu'
        else:
            a, b = cell[slug]['P'], cell[slug]['R']
            com = sorted(set(a) & set(b))
            if len(com) >= 2:
                h = sum(1 for r in com if b[r] > a[r] * Fraction(1025, 1000))
                bb = sum(1 for r in com if b[r] < a[r] * Fraction(975, 1000))
                o['etat'] = verdict_reps(h, bb, len(com)); o['methode'] = 'reps'
                o['detail'] = [[r, str(a[r]), str(b[r])] for r in com]
            else:
                cs = [(p, r, float(c)) for p in ('P', 'R') for r, c in cell[slug][p].items() if r <= 12]
                if len({r for _, r, _ in cs}) >= 3 and any(p == 'P' for p, _, _ in cs) and any(p == 'R' for p, _, _ in cs):
                    d, km = courbe(cs)
                    o['etat'] = verdict_ecart(d); o['methode'] = 'courbe'; o['ecart'] = round(d * 1000) / 10; o['k'] = km
                else:
                    o['etat'] = 'pas comparable'
        ex[slug] = o
    # relais
    for o in ex.values():
        if o['etat'] != 'moins': continue
        e = cat[o['slug']]
        rel = []
        for x in ex.values():
            if x['slug'] == o['slug'] or x['muscle'] != o['muscle'] or x['nR'] <= x['nP'] or x['nR'] < MIN_SEANCES: continue
            ex_ = cat[x['slug']]
            meme = (e.get('mouvement') and ex_.get('mouvement') == e.get('mouvement')) or \
                   (e.get('schema_mouvement') and ex_.get('schema_mouvement') == e.get('schema_mouvement'))
            if meme: rel.append(x)
        rel.sort(key=lambda x: (-x['nR'], x['slug']))
        o['relais'] = [x['slug'] for x in rel[:2]]
    # zones
    zones = []
    for z, lib, _ in ZONES:
        vot = [o for o in ex.values() if o['zone'] == z and o['etat'] in SCORE]
        tous = [o for o in ex.values() if o['zone'] == z]
        if len(vot) >= 2:
            sc = Fraction(sum(SCORE[o['etat']] * o['poids'] for o in vot), sum(o['poids'] for o in vot))
            v = '↑' if sc >= 1 else ('↗' if sc >= Fraction(1, 4) else ('▬' if sc > Fraction(-1, 4) else ('↘' if sc > -1 else '↓')))
            zones.append({'zone': z, 'libelle': lib, 'verdict': v, 'score': str(sc), 'votants': len(vot)})
        else:
            zones.append({'zone': z, 'libelle': lib, 'verdict': None, 'score': None, 'votants': len(vot),
                          'raison': 'pas assez de séances comparables' if tous else 'pas encore suivi en charge'})
    avec = [z for z in zones if z['verdict']]
    # levier
    levier = None
    cand = [z for p in prios for z in avec if z['zone'] == p] if prios else list(avec)
    for z in cand:
        if levier is None or Fraction(z['score']) < Fraction(levier['score']): levier = z
    # rapports
    meilleur = {}
    for slug in set(s for r in RAPPORTS for s in r):
        d = {}
        for p in ('P', 'R'):
            for r, c in cell.get(slug, {}).get(p, {}).items():
                if r <= 10 and c > d.get(r, Fraction(0)): d[r] = c
        meilleur[slug] = d
    rapports = []
    reps_sexe = REPERES.get(entree.get('sexe'))
    for i, (num, den) in enumerate(RAPPORTS):
        ref = reps_sexe[i] if reps_sexe else None
        a, b = meilleur[num], meilleur[den]
        com = sorted(set(a) & set(b))
        if len(com) < 3: continue
        rs = sorted(a[r] / b[r] for r in com)
        n = len(rs); med = rs[n // 2] if n % 2 else (rs[n // 2 - 1] + rs[n // 2]) / 2
        lec = None if ref is None else ('en dessous' if med < ref * Fraction(95, 100) else ('au-dessus' if med > ref * Fraction(105, 100) else 'proche'))
        o = {'num': num, 'den': den, 'rapport': str(med), 'repere': None if ref is None else str(ref), 'lecture': lec, 'reps': com}
        q = med * 100; ent = int(q); o['affiche'] = '%d,%02d' % divmod(ent + (1 if q - ent >= Fraction(1, 2) else 0), 100)
        if lec == 'en dessous':
            g = ref * max(b.values()) - max(a.values()); ge = int(g); o['ecart_kg'] = ge + (1 if g - ge >= Fraction(1, 2) else 0)
        rapports.append(o)
    # courbes
    courbes = []
    for slug in GRANDS:
        h = histo.get(slug)
        if not h: continue
        mois = sorted(h)
        courbes.append({'slug': slug, 'mois': [[m, str(h[m])] for m in mois], 'debut': str(h[mois[0]]),
                        'meilleur': str(max(h.values())), 'maintenant': str(h[mois[-1]]),
                        'etat': ex.get(slug, {}).get('etat')})
    # phrase
    phrases = []
    if avec:
        k = sum(1 for z in avec if z['verdict'] in ('↑', '↗')); m = len(avec)
        if k == m: phrases.append('Tes six derniers mois : les %s groupes que tu suis progressent.' % MOTS[m] if m > 1 else 'Tes six derniers mois : le groupe que tu suis progresse.')
        elif k == 0: phrases.append('Tes six derniers mois : pas encore de groupe en hausse.')
        else: phrases.append('Tes six derniers mois : %s groupes sur %s progressent.' % (MOTS[k], MOTS[m]) if k > 1 else 'Tes six derniers mois : un groupe sur %s progresse.' % MOTS[m])
    if levier and len(avec) > 1: phrases.append('%s : ce qui avance le plus lentement.' % levier['libelle'])
    dessous = [r for r in rapports if r['lecture'] == 'en dessous']
    if dessous:
        r = min(dessous, key=lambda r: (Fraction(r['rapport']) / Fraction(r['repere']), RAPPORTS.index((r['num'], r['den']))))
        phrases.append('Ton %s tire devant ton %s.' % (NOM_COURT[r['den']], NOM_COURT[r['num']]))
    return {'exercices': [ex[s] for s in sorted(ex)], 'zones': zones, 'levier': levier and levier['zone'],
            'rapports': rapports, 'courbes': courbes, 'phrase': ' '.join(phrases)}
