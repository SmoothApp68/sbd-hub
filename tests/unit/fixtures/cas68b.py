"""cas68b.py — les cas du chantier 68B, « à fond » (Claude.ai, 11/10/2026).
Usage : python3 cas68b.py <cas-68-ecarts.json du dépôt> <dossier de sortie>
Écrit cas-68b-a-fond.json (12 cas nouveaux) et cas-68-ecarts.json (les 18 cas de 68A, attendus recalculés en règles 68B :
seul N10 change)."""
import json, os, sys, ref68 as R
R.REGLES = '68B'
SRC68, OUT = sys.argv[1], sys.argv[2]
def kons(etat, zone, P, n, ligne, haut=None):
    nom, lo, hi = zone
    return {'etat': etat, 'zone': {'nom': nom, 'bas': lo, 'haut': hi}, 'palier': P, 'n': n,
            'ligne': {'charge': ligne[0], 'vise': ligne[1]}, 'haut': {'charge': haut[0], 'vise': haut[1], 'k': haut[2]} if haut else None}
def f(kg, reps, **x): return dict({'charge': kg, 'reps': reps}, **x)
VOL = ('volume', 10, 12); LOURD = ('lourd', 3, 5)
CTX = {'cran': 81.3, 'haut': None}
PROG = kons('progression', VOL, 79.0, 4, (79.0, 12))
nouveaux = [
 ('B01', "À fond à la charge de travail : 79 × 12 RPE 10 — la suivante vise 11", PROG, CTX, 4, [f(79.0, 12, rpe=10)]),
 ('B02', "« Reste 0 » compte comme RPE 10 : 79 × 12 — la suivante vise 11", PROG, CTX, 4, [f(79.0, 12, ressenti='reste_0')]),
 ('B03', "Deux séries à fond de suite : 79 × 12, puis 79 × 11 — la suivante vise 11, puis 10", PROG, CTX, 4, [f(79.0, 12, rpe=10), f(79.0, 11, rpe=10)]),
 ('B04', "Plus lourd, à fond, dans la fourchette : 84 × 12 RPE 10 — pas d'élan, la suite reste au plan", PROG, CTX, 4, [f(84.0, 12, rpe=10)]),
 ('B05', "Plus lourd, à fond, sous la fourchette : 84 × 9 RPE 10 — « pas encore », comme sans effort noté", PROG, CTX, 4, [f(84.0, 9, rpe=10)]),
 ('B06', "La proposition prise, à fond : 79 × 15 puis 81,3 × 12 RPE 10 — la suite revient à 79", PROG, CTX, 4, [f(79.0, 15), f(81.3, 12, rpe=10)]),
 ('B07', "3 reps de marge, mais à fond : 79 × 16 RPE 10 — pas de proposition", PROG, CTX, 4, [f(79.0, 16, rpe=10)]),
 ('B08', "3 reps de marge à fond avant un test : 79 × 15 RPE 10 — pas de « ton test arrive avec de la marge »", kons('garde', VOL, 79.0, 3, (79.0, 12), (81.3, 11, 1)), CTX, 3, [f(79.0, 15, rpe=10)]),
 ('B09', "Plus lourd à fond, le test suit à la même charge : 81,3 × 10 RPE 10 sur la ligne à 79, test à 81,3 — le test vise 9", kons('garde', VOL, 79.0, 2, (79.0, 12), (81.3, 11, 1)), CTX, 2, [f(81.3, 10, rpe=10)]),
 ('B10', "La dernière série à fond : rien à dire", PROG, CTX, 2, [f(79.0, 12), f(79.0, 12, rpe=10)]),
 ('B11', "Un RPE 9,5 n'est pas « à fond » : 79 × 12 — rien ne change", PROG, CTX, 4, [f(79.0, 12, rpe=9.5)]),
 ('B12', "Zone Lourd : 130 × 5 RPE 10 — la suivante vise 4", kons('progression', LOURD, 130.0, 4, (130.0, 5)), {'cran': 132.5, 'haut': None}, 4, [f(130.0, 5, rpe=10)]),
]
out = []
for id_, titre, k, ctx, nb, faites in nouveaux:
    cas = {'id': id_, 'titre': titre, 'consigne': k, 'contexte': ctx, 'series': nb, 'faites': faites}
    a, v = R.attendu(*R.depuis_cas(cas), True)
    assert not v, (id_, v)
    for s in a:
        if s['message']: s['message'] = {kk: (list(vv) if isinstance(vv, tuple) else vv) for kk, vv in s['message'].items()}
    cas['attendu'] = a; out.append(cas)
data = {'version': '« à fond » : tenu, sans montée (68B, 11/10/2026)', 'source': 'ref68.py (REGLES = 68B)',
        'regle': 'MOTEUR §9.14 ter ; SIM-68B-A-FOND', 'cas': out}
json.dump(data, open(os.path.join(OUT, 'cas-68b-a-fond.json'), 'w'), ensure_ascii=False, indent=1)
print(len(out), 'cas')
for c in out:
    print('\n', c['id'], c['titre'])
    for s in c['attendu']:
        m = s['message']
        print('   ', [(l['role'][0], l['charge'], l['vise']) for l in s['lignes']], '|', [None if x is None else (x['charge'], x['reps']) for x in s['fantomes']], '|', m)

d = json.load(open(SRC68)); chg = []
for cas in d['cas']:
    a, v = R.attendu(*R.depuis_cas(cas), True); assert not v
    for st in a:
        if st['message']: st['message'] = {kk: (list(vv) if isinstance(vv, tuple) else vv) for kk, vv in st['message'].items()}
    if a != cas['attendu']: chg.append(cas['id'])
    cas['attendu'] = a
d['version'] = d.get('version', '') + ' — attendus recalculés en règles 68B (11/10/2026)'
json.dump(d, open(os.path.join(OUT, 'cas-68-ecarts.json'), 'w'), ensure_ascii=False, indent=1)
print('cas-68-ecarts : recalculés', ' '.join(chg))
