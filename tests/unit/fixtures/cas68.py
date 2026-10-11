"""cas68.py — les cas du chantier 68A (Claude.ai, 11/10/2026).
Usage : python3 cas68.py <fixture cas-49u2-fantome.json du dépôt> <dossier de sortie>
Écrit cas-68-ecarts.json (13 cas nouveaux) et cas-49u2-fantome.json (les 45 cas de 49-U2, attendus recalculés par ref68).
"""
import json, os, sys, ref68 as R
R.REGLES = '68'
SRC, OUT = sys.argv[1], sys.argv[2]
def kons(etat, zone, P, n, ligne, haut=None):
    nom, lo, hi = zone
    return {'etat': etat, 'zone': {'nom': nom, 'bas': lo, 'haut': hi}, 'palier': P, 'n': n,
            'ligne': {'charge': ligne[0], 'vise': ligne[1]}, 'haut': {'charge': haut[0], 'vise': haut[1], 'k': haut[2]} if haut else None}
def f(kg, reps, **x): return dict({'charge': kg, 'reps': reps}, **x)
VOL = ('volume', 10, 12); LOURD = ('lourd', 3, 5)
ROW = kons('garde', VOL, 79.0, 3, (79.0, 12), (81.3, 11, 1)); CTX = {'cran': 81.3, 'haut': None}
nouveaux = [
 ('N01', "Le rowing du 10/10 : 73 × 12, puis 79 × 10, puis le test à 81,3 — « plus léger » après 73, le plan reste affiché", ROW, CTX, 3, [f(73.0, 12), f(79.0, 10), f(81.3, 12)]),
 ('N02', "La montée par paliers : 70, 75, puis 79 — une seule phrase, après 70 ; rien après 75", kons('garde', VOL, 79.0, 4, (79.0, 12), (81.3, 11, 1)), CTX, 4, [f(70.0, 12), f(75.0, 12), f(79.0, 12)]),
 ('N03', "Une journée plus légère : 73 × 12 trois fois — la phrase une fois, les lignes restent le plan", kons('progression', VOL, 79.0, 4, (79.0, 12)), CTX, 4, [f(73.0, 12), f(73.0, 12), f(73.0, 12)]),
 ('N04', "Plus lourd qui tient : 84 × 12 sur une ligne à 79 — l'élan : les lignes suivantes à 84, le test à 81,3 compris", ROW, CTX, 3, [f(84.0, 12)]),
 ('N05', "Plus lourd qui ne tient pas : 84 × 9 — « pas encore », les lignes restent le plan", ROW, CTX, 3, [f(84.0, 9)]),
 ('N06', "Plus lourd pile au bas, sans effort noté : 84 × 10 — l'élan, et la suggestion d'effort", ROW, CTX, 3, [f(84.0, 10)]),
 ('N07', "Plus lourd pile au bas, noté à fond : 84 × 10 RPE 10 — compte 9 : « pas encore », pas d'élan", ROW, CTX, 3, [f(84.0, 10, rpe=10)]),
 ('N08', "Zone Lourd : 135 × 5 sur une ligne à 130 — une seule ligne d'élan, les autres restent à 130", kons('progression', LOURD, 130.0, 4, (130.0, 5)), {'cran': 132.5, 'haut': None}, 4, [f(135.0, 5), f(135.0, 5)]),
 ('N09', "Plus de reps (inchangé) : 79 × 15 — le test avance, la proposition prend sa charge", kons('garde', VOL, 79.0, 4, (79.0, 12), (81.3, 11, 1)), CTX, 4, [f(79.0, 15)]),
 ('N10', "« À fond » au palier (inchangé en 68-1) : 79 × 12 RPE 10 — rien", ROW, CTX, 3, [f(79.0, 12, rpe=10)]),
 ('N11', "Plus léger puis plus lourd : 73 × 12 puis 84 × 12 — « plus léger », puis l'élan", kons('progression', VOL, 79.0, 4, (79.0, 12)), CTX, 4, [f(73.0, 12), f(84.0, 12)]),
 ('N12', "L'élan après l'élan : 84 × 12 puis 88 × 12 — la suite passe à 88", kons('progression', VOL, 79.0, 4, (79.0, 12)), CTX, 4, [f(84.0, 12), f(88.0, 12)]),
 ('N13', "Plus lourd, mais la suite est déjà plus lourde : 84 × 12 avant un test à 90 — rien ne change, le coach se tait", kons('garde', VOL, 79.0, 2, (79.0, 12), (90.0, 10, 1)), {'cran': 81.3, 'haut': None}, 2, [f(84.0, 12)]),
 ('N14', "Après un refus, plus rien : 79 × 15 (proposé 81,3), 79 × 12 (refus), puis 84 × 12 — ni élan ni phrase", kons('progression', VOL, 79.0, 4, (79.0, 12)), CTX, 4, [f(79.0, 15), f(79.0, 12), f(84.0, 12)]),
 ('N15', "L'élan s'arrête : 84 × 12, puis 79 × 12 — la suite revient au plan, sans un mot", kons('progression', VOL, 79.0, 4, (79.0, 12)), CTX, 4, [f(84.0, 12), f(79.0, 12)]),
 ('N16', "Le test remis à plus tard : 79 × 12, 79 × 12, puis 79 × 15 sur la première ligne de test — pas « plus léger » : le test suit", kons('garde', VOL, 79.0, 4, (79.0, 12), (81.3, 11, 2)), CTX, 4, [f(79.0, 12), f(79.0, 12), f(79.0, 15)]),
 ('N17', "Un élan sur un élan, pile au bas : 82 × 12 puis 84 × 10 — la suggestion revient à 82, la charge d'avant", kons('progression', VOL, 79.0, 4, (79.0, 12)), CTX, 4, [f(82.0, 12), f(84.0, 10)]),
 ('N18', "Deux essais plus lourds qui ne tiennent pas : 84 × 9, puis 84 × 8 — « pas encore » une fois", kons('progression', VOL, 79.0, 4, (79.0, 12)), CTX, 4, [f(84.0, 9), f(84.0, 8)]),
]
out = []
for id_, titre, k, ctx, nb, faites in nouveaux:
    cas = {'id': id_, 'titre': titre, 'consigne': k, 'contexte': ctx, 'series': nb, 'faites': faites}
    a, v = R.attendu(*R.depuis_cas(cas), True)
    assert not v, (id_, v)
    for s in a:
        if s['message']: s['message'] = {kk: (list(vv) if isinstance(vv, tuple) else vv) for kk, vv in s['message'].items()}
    cas['attendu'] = a; out.append(cas)
data = {'version': 'le coach quand on s’écarte du plan (68-1, 11/10/2026)', 'source': 'ref68.py (REGLES = 68)',
        'regle': 'DECISIONS-SEANCE-ECARTS ; MOTEUR §9.13 bis révisé', 'cas': out}
json.dump(data, open(os.path.join(OUT, 'cas-68-ecarts.json'), 'w'), ensure_ascii=False, indent=1)
# le fichier de 49-U2, attendus recalculés (format inchangé : le message par son type)
d = json.load(open(SRC)); chg = []
for cas in d['cas']:
    a, v = R.attendu(*R.depuis_cas(cas)); assert not v
    if a != cas['attendu']: chg.append(cas['id'])
    cas['attendu'] = a
d['version'] = d.get('version', '') + ' — attendus recalculés par ref68.py (68-1, 11/10/2026)'
json.dump(d, open(os.path.join(OUT, 'cas-49u2-fantome.json'), 'w'), ensure_ascii=False, indent=1)
print(len(out), 'cas nouveaux ;', len(chg), 'cas de 49-U2 recalculés :', ' '.join(chg))
for c in out:
    print('\n', c['id'], c['titre'])
    for s in c['attendu']:
        m = s['message']
        print('   ', [(l['role'][0], l['charge']) for l in s['lignes']], '|', [None if x is None else x['charge'] for x in s['fantomes']], '|', m and m['type'])
