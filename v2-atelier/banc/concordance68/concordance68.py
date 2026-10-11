#!/usr/bin/env python3
"""concordance68.py — la référence (ref68.py) contre le vrai plan (v2/js), sur des séances tirées au hasard.
Claude.ai, 11/10/2026. Usage, depuis v2-atelier/banc/concordance68/ :
    python3 concordance68.py <N séances> <graine> <règles 49|68>
Tire N séances (zones, états, tests k = 1 ou 2, reprise longue, charges plus légères / égales / plus lourdes, reps de
bas − 3 à haut + 5, « à fond » une fois sur sept), les rejoue par `node concordance68.js`, puis par ref68 ; compare à
chaque étape les lignes (rôle, charge, visée), les fantômes et le type du message. Attendu : « 0 écart ».
Sur main avant 68A (b9225a1), 20 000 séances, graine 7, règles 49 : 0 écart (relevé du 11/10)."""
import json, os, random, subprocess, sys, collections, tempfile
ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ICI, '..', '..', '..', 'tests', 'unit', 'fixtures'))
import ref68 as R

def tirer(N, graine):
    random.seed(graine)
    Z = {'lourd': (3, 5), 'mix': (6, 8), 'hypertrophie': (8, 10), 'volume': (10, 12)}
    cas = []
    for i in range(N):
        zn = random.choice(list(Z)); lo, hi = Z[zn]
        P = random.choice([40.0, 60.0, 79.0, 100.0, 130.0])
        cran = random.choice([P + 2.5, P + 2.5, None])
        etat = random.choice(['progression', 'attend', 'etend', 'test_propose', 'reprise_longue', 'garde'])
        n = random.randint(2, 5); vise = random.randint(lo, hi)
        ligne = {'charge': P, 'vise': vise}; haut = None
        if etat in ('attend', 'etend', 'test_propose', 'garde'):
            k = random.choice([1, 1, 2]) if n > 2 else 1
            haut = {'charge': random.choice([P + 2.5, P + 5.0, None if cran is None else P + 2.5]), 'vise': random.randint(lo, hi), 'k': k}
        if etat == 'reprise_longue':
            ligne = {'charge': round(random.choice([P * 0.95, P * 0.8]) * 2) / 2, 'vise': vise}
        ctx = {'cran': cran, 'haut': random.choice([None, {'charge': P + 5.0, 'source': 'preconisation'}])}
        L = ligne['charge']
        choix = [L - 5, L - 2.5, L, L, L, L + 2.5, L + 5, L + 10] + ([haut['charge']] if haut and haut['charge'] else [])
        faites = []
        for _ in range(random.randint(1, n)):
            f = {'charge': float(random.choice(choix)), 'reps': random.randint(max(1, lo - 3), hi + 5)}
            r = random.random()
            if r < 0.15: f['rpe'] = 10
            elif r < 0.25: f['rpe'] = random.choice([7, 8, 9])
            faites.append(f)
        cas.append({'id': 'S%05d' % i, 'titre': '', 'consigne': {'etat': etat, 'zone': {'nom': zn, 'bas': lo, 'haut': hi},
                    'palier': P, 'n': n, 'ligne': ligne, 'haut': haut}, 'contexte': ctx, 'series': n, 'faites': faites})
    return cas

def main():
    N, graine, regles = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
    R.REGLES = regles
    cas = tirer(N, graine)
    with tempfile.TemporaryDirectory() as tmp:
        e, s = os.path.join(tmp, 'e.json'), os.path.join(tmp, 's.json')
        json.dump({'cas': cas}, open(e, 'w'))
        subprocess.run(['node', os.path.join(ICI, 'concordance68.js'), e, s], check=True)
        js = json.load(open(s))
    rond = lambda x: json.loads(json.dumps(x), parse_float=lambda v: round(float(v), 2))
    ecarts = collections.Counter(); exemple = {}
    for c, x in zip(cas, js):
        if x['err']:
            ecarts['erreur JS'] += 1; exemple.setdefault('erreur JS', (c, x['err'])); continue
        a, _ = R.attendu(*R.depuis_cas(c))
        for t, (ra, rj) in enumerate(zip(a, x['etapes'])):
            for cle in ('lignes', 'fantomes', 'message'):
                if rond(ra[cle]) != rond(rj[cle]):
                    tag = cle if cle != 'message' else 'message %s / %s' % (ra[cle], rj[cle])
                    ecarts[tag] += 1; exemple.setdefault(tag, (c, t, ra[cle], rj[cle]))
    print('%d séances, règles %s : %d écart(s)' % (N, regles, sum(ecarts.values())))
    for k, v in ecarts.most_common(): print('  %6d  %s' % (v, k))
    for k, e in exemple.items(): print('\n== %s\n%s' % (k, json.dumps(e, ensure_ascii=False)[:1500]))
    sys.exit(1 if ecarts else 0)

if __name__ == '__main__':
    main()
