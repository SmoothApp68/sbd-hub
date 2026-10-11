#!/usr/bin/env python3
"""ref68.py — le coach quand on s'écarte du plan (chantier 68). Claude.ai, 11/10/2026.

Le port des étapes 2 à 5 de `coach49.py` (couverture, réaction, fantôme, en-tête — le simulateur unique du coach), la
consigne étant une ENTRÉE (comme dans `cas-49u2-fantome.json`). `REGLES = '49'` rejoue la règle d'aujourd'hui (le
contrôle : les 45 cas de 49-U2 à l'identique) ; `REGLES = '68'` applique DECISIONS-SEANCE-ECARTS (68-1) :
  1. le fantôme vient TOUJOURS des lignes du plan (fin de la recopie de la dernière série, 49-U2) ;
  2. « plus léger que prévu » : un message, une fois par exercice, seulement tant que la dernière série faite est
     plus légère que sa ligne (la montée par paliers ne déclenche rien) ;
  3. l'élan : une série de travail plus lourde que sa ligne, de son propre chef, qui TIENT (reps comptées ≥ bas de la
     zone) → les lignes suivantes plus légères passent à sa charge (rôle « elan »), tests compris ; en zone Lourd, une
     seule ligne ; qui ne tient pas → les lignes restent celles du plan, message « pas encore » ;
     ni « élan » ni suggestion quand aucune ligne ne change (la suite est déjà plus lourde) — 11/10, un libellé ne
     contredit jamais son chiffre ;
  4. la suggestion d'effort : une montée qui tient PILE au bas de la zone, sans effort noté → message, une fois ;
  5. inchangé : la proposition du coach (§9.14), le refus, le test qui avance.
Les reps comptées (« à fond » = une de moins, §17.4) ne changent pas ici : c'est 68-2.
"""
import json, sys

EPS = 1e-9
SEUIL, SEUIL_DEUX = 3, 5                      # banc_reaction49 : marge pour proposer, pour une seconde charge
SILENCES = ('silence', 'bord')                # coach49 : la réaction reste active en reprise (27/09)
PLAFOND_REPLI = 0.10
REGLES = '68'

def comptees(s):                              # §17.4 (inchangé en 68-1)
    return s['reps'] - 1 if (s.get('rpe') or 0) >= 10 or s.get('ressenti') == 'reste_0' else s['reps']
def effort_note(s): return s.get('rpe') is not None or s.get('ressenti') is not None
def eq(a, b): return a is not None and b is not None and abs(a - b) < EPS
def meme_charge(a, b): return (a is None and b is None) or eq(a, b)
def base_de(x):
    while x.get('remplace'): x = x['remplace']
    return x

def consigne_figee(c):
    if c.get('etat') != 'reprise_longue' or not c.get('ligne') or c['ligne'][0] is None or not c.get('palier'): return c
    if c['ligne'][0] < c['palier'] * (1 - PLAFOND_REPLI) - EPS:
        c = dict(c); c['ligne'] = (c['palier'], c['ligne'][1]); c['repli_plafonne'] = True
    return c

def couverture(c, nb, figees):
    h = c.get('haut'); k = h[2] if h else 0
    lig = c.get('ligne')
    lignes = [dict(f) for f in figees[:nb]]
    reste = nb - len(lignes)
    k_rest = min(max(0, k - sum(1 for f in figees if f['role'] == 'test')), reste)
    for j in range(reste):
        if j >= reste - k_rest or not lig or lig[0] is None and h:
            lignes.append({'role': 'test', 'kg': h[0], 'vise': h[1], 'src': 'consigne'})
        else:
            lignes.append({'role': 'ligne', 'kg': lig[0], 'vise': lig[1], 'src': 'consigne'})
    return lignes

def reaction(c, ctx, lignes, faites):
    L = [dict(x) for x in lignes]
    if c.get('etat') in SILENCES or not c.get('zone') or not c.get('ligne') or c['ligne'][0] is None:
        return L, None, None
    nom, lo, hi = c['zone']; P = c['ligne'][0]; lourd = nom == 'lourd'
    attente = None; refus = False; monte = False; message = None
    leger_dit = False; effort_dit = False; pe_dit = False
    for i, s in enumerate(faites):
        message = None
        if i >= len(L): break
        prise_ici = False                                             # cette série est-elle la proposition, prise ?
        if attente is not None and attente['rang'] == i:
            bas = attente['charges'][0]
            ok = s['kg'] >= bas - EPS if bas is not None else s['kg'] > P + EPS
            if not ok: refus = True
            else: prise_ici = True
            attente = None
        if refus: continue
        cpt = comptees(s)
        if L[i]['role'] == 'coach':                                   # la montée proposée, faite (inchangé)
            monte = True
            if not prise_ici: continue                                # 11/10 : une autre ligne du coach ne se commente pas (JS : `clos`)
            if s['kg'] >= L[i]['kg'] - EPS if L[i]['kg'] is not None else s['kg'] > P + EPS:
                if cpt >= lo:
                    if not lourd:
                        for j in range(i + 1, len(L)):
                            if j < len(faites): continue
                            if L[j]['role'] == 'test': continue
                            if L[j]['kg'] is not None and L[j]['kg'] >= s['kg'] - EPS: continue
                            L[j] = {'role': 'coach', 'kg': s['kg'], 'vise': lo, 'src': 'coach', 'remplace': L[j].get('remplace', L[j])}
                    if i < len(L) - 1:
                        avance = meme_charge(L[i]['kg'], (c.get('haut') or (None,))[0]) and bool(c.get('haut'))
                        message = {'type': 'haut' if cpt >= hi else 'tenue', 'rang': i + 1, 'kg': s['kg'], 'reps': s['reps'], 'avance': avance}
                else:
                    for j in range(i + 1, len(L)):
                        if j >= len(faites):
                            L[j] = {'role': 'retour', 'kg': P, 'vise': c['ligne'][1], 'src': 'retour', 'remplace': L[j].get('remplace', L[j])}
                    if i < len(L) - 1:
                        message = {'type': 'pas_encore', 'rang': i + 1, 'kg': s['kg'], 'reps': s['reps'], 'palier': P}
            continue
        lig = L[i]
        # 68 (audit du 11/10) — UNE SÉRIE PLUS LÉGÈRE QUE L'ÉLAN LE TERMINE : les lignes d'élan non validées reviennent à
        # leur ligne du plan, et la série se compare à la ligne du plan qu'elle remplaçait.
        if REGLES == '68' and lig['role'] == 'elan' and s['kg'] < lig['kg'] - EPS:
            for j in range(i + 1, len(L)):
                if j >= len(faites) and L[j]['role'] == 'elan': L[j] = dict(L[j]['remplace'])
            lig = lig['remplace']
        prevue = lig['kg']
        # 68 — l'élan : plus lourd que sa ligne, de son propre chef (ni un test fait à sa charge, ni une ligne du coach)
        if REGLES == '68' and lig['role'] in ('ligne', 'test', 'retour', 'elan') and prevue is not None and s['kg'] > prevue + EPS:
            monte = True
            if cpt >= lo:
                faits_j = sum(1 for x in L if x['role'] == 'elan')    # Lourd : une ligne d'élan dans tout l'exercice, au plus
                chg = 0; retour = None
                for j in range(i + 1, len(L)):
                    if j < len(faites): continue
                    if L[j]['role'] == 'coach': continue
                    if L[j]['kg'] is not None and L[j]['kg'] >= s['kg'] - EPS: continue
                    if lourd and faits_j >= 1: break                  # Lourd : au plus une série de plus à la charge montée
                    if retour is None: retour = L[j]['kg']            # audit 11/10 : la charge de la ligne JUSTE AVANT cette série
                    L[j] = {'role': 'elan', 'kg': s['kg'], 'vise': lo, 'src': 'elan', 'remplace': L[j].get('remplace', L[j])}
                    faits_j += 1; chg += 1
                if i < len(L) - 1 and chg:                            # rien n'a changé (la suite est déjà plus lourde) : silence
                    if s['reps'] == lo and not effort_note(s) and not effort_dit:
                        message = {'type': 'effort_suggere', 'rang': i + 1, 'kg': s['kg'], 'reps': s['reps'], 'palier': P, 'retour': retour}
                        effort_dit = True
                    else:
                        message = {'type': 'elan', 'rang': i + 1, 'kg': s['kg'], 'reps': s['reps']}
            else:                                                     # audit 11/10 : une fois par exercice ; « à fond » se dit
                if i < len(L) - 1 and not pe_dit:
                    message = {'type': 'pas_encore_soi', 'rang': i + 1, 'kg': s['kg'], 'reps': s['reps'], 'palier': P, 'a_fond': s['reps'] >= lo}
                pe_dit = True
            continue
        # 68 — plus léger que sa ligne : une phrase, une fois par exercice
        # audit 11/10 : sur une ligne de test, une série À LA CHARGE DE TRAVAIL n'est pas « plus légère » : c'est le test
        # remis à plus tard, et la règle 49 s'applique (la proposition, le test qui suit)
        test_a_p = lig['role'] == 'test' and eq(s['kg'], P)
        if REGLES == '68' and prevue is not None and s['kg'] < prevue - EPS and lig['role'] in ('ligne', 'test', 'retour', 'elan') and not test_a_p:
            if not leger_dit and i < len(L) - 1:
                message = {'type': 'plus_leger', 'rang': i + 1, 'kg': s['kg'], 'reps': s['reps'], 'prevue': prevue}
            leger_dit = True
            continue
        if s['kg'] > P + EPS:                                         # une montée (règle 49 ; JS : toute charge > P)
            monte = True
            continue
        if monte: continue
        if eq(s['kg'], P) and L[i]['role'] in ('ligne', 'test') and L[i]['src'] == 'consigne' and i < len(L) - 1:
            marge = cpt - L[i]['vise']
            if marge >= SEUIL:
                if L[i + 1]['role'] == 'test':
                    message = {'type': 'test_suit', 'rang': i + 1, 'kg': s['kg'], 'reps': s['reps'], 'marge': marge, 'test': L[i + 1]['kg']}
                    continue
                cran = ctx['cran'] if ctx['cran'] is None or ctx['cran'] > P + EPS else None
                charges = [cran]
                test_plus_loin = next((base_de(L[j]) for j in range(i + 2, len(L)) if base_de(L[j])['role'] == 'test'), None)
                if test_plus_loin is not None:
                    charges = [test_plus_loin['kg']]
                elif c.get('etat') == 'reprise_longue' and c.get('palier') and c['palier'] > P + EPS:
                    charges = [c['palier']]
                elif marge >= SEUIL_DEUX and ctx['haut'] is not None: charges.append(ctx['haut'][0])
                L[i + 1] = {'role': 'coach', 'kg': charges[0], 'vise': lo, 'src': 'coach', 'remplace': L[i + 1], 'proposee': True}
                attente = {'rang': i + 1, 'charges': charges}
                message = {'type': 'propose', 'rang': i + 1, 'charges': charges, 'marge': marge, 'kg': s['kg'], 'reps': s['reps'], 'zone': (lo, hi)}
                monte = True
    if len(faites) >= len(L): message = None
    return L, message, attente

def suivie(ligne, s, P):
    if ligne['role'] == 'coach':
        return s['kg'] >= ligne['kg'] - EPS if ligne['kg'] is not None else (P is not None and s['kg'] > P + EPS)
    if ligne['kg'] is None: return P is not None and s['kg'] > P + EPS
    return eq(s['kg'], ligne['kg'])

def fantomes(c, L, faites, figees):
    P = c['ligne'][0] if c.get('ligne') else None
    source = 'plan'
    if REGLES == '49' and faites and figees:
        if not suivie(figees[len(faites) - 1], faites[-1], P): source = 'derniere'
    out = []
    for i, x in enumerate(L):
        if i < len(faites): out.append(None); continue
        if source == 'derniere':
            out.append({'kg': faites[-1]['kg'], 'reps': faites[-1]['reps'], 'source': 'derniere'})
        elif x['role'] in ('coach', 'elan'):                          # une charge pas encore faite à ce rang : la zone, reps à taper
            out.append({'kg': x['kg'], 'reps': None, 'source': 'plan'})
        else:
            out.append({'kg': x['kg'], 'reps': x['vise'], 'source': 'plan'})
    return out

def entete(c, lignes):
    out = []
    for x in lignes:
        base = x.get('remplace', x) if x.get('role') in ('coach', 'elan') else x
        if base.get('role') in ('coach', 'elan'): continue
        cle = (base['kg'], base['vise'])
        if out and out[-1][1:] == cle: out[-1] = (out[-1][0] + 1,) + cle
        else: out.append((1,) + cle)
    return out

def plan_de_seance(c, ctx, nb, faites, figees):
    c = consigne_figee(c)
    cov = couverture(c, nb, figees)
    L, message, attente = reaction(c, ctx, cov, faites)
    return {'lignes': L, 'message': message, 'attente': attente, 'entete': entete(c, cov), 'fantomes': fantomes(c, L, faites, figees)}

def verifier_68(c, plan, faites):
    """Les invariants nouveaux (68-1) : F1 le fantôme est la ligne ; F2 « plus léger » une fois au plus et seulement si la
    dernière série est plus légère que sa ligne ; F3 une ligne d'élan n'est jamais plus légère que la plus lourde série
    tenue au-dessus de sa ligne… ; F4 en Lourd, au plus une ligne d'élan."""
    v = []; L = plan['lignes']
    for i, f in enumerate(plan['fantomes']):
        if f is None: continue
        if not meme_charge(f['kg'], L[i]['kg']): v.append('F1 fantôme ≠ ligne')
    m = plan['message']
    if m and m['type'] == 'plus_leger':
        d = faites[-1]; lig = L[len(faites) - 1]
        if not (lig['kg'] is not None and d['kg'] < lig['kg'] - EPS): v.append('F2 « plus léger » sans série plus légère')
    if c.get('zone') and c['zone'][0] == 'lourd' and sum(1 for x in L if x['role'] == 'elan') > 1: v.append('F4 Lourd : plus d une ligne d élan')
    for x in L:
        if x['role'] == 'elan' and x.get('remplace') and x['remplace']['kg'] is not None and x['kg'] < x['remplace']['kg'] - EPS:
            v.append('F3 élan plus léger que la ligne remplacée')
    return v

# ── les cas au format de cas-49u2-fantome.json ──────────────────────────────────────────────────────────────────
def depuis_cas(cas):
    k = cas['consigne']; z = k.get('zone')
    c = {'etat': k.get('etat'), 'zone': (z['nom'], z['bas'], z['haut']) if z else None, 'palier': k.get('palier'), 'n': k.get('n'),
         'ligne': (k['ligne']['charge'], k['ligne']['vise']) if k.get('ligne') else None,
         'haut': (k['haut']['charge'], k['haut']['vise'], k['haut']['k']) if k.get('haut') else None}
    x = cas['contexte']
    ctx = {'cran': x.get('cran'), 'haut': ((x['haut']['charge'],) if isinstance(x['haut'], dict) else tuple(x['haut'])) if x.get('haut') else None}
    faites = [dict({'kg': f['charge'], 'reps': f['reps']}, **{k2: f[k2] for k2 in ('rpe', 'ressenti') if k2 in f}) for f in cas['faites']]
    return c, ctx, cas['series'], faites

def attendu(c, ctx, nb, faites, avec_message_complet=False):
    figees, out, viol = [], [], []
    for j in range(len(faites) + 1):
        p = plan_de_seance(c, ctx, nb, faites[:j], figees)
        viol += verifier_68(c, p, faites[:j]) if REGLES == '68' else []
        m = p['message']
        out.append({'lignes': [{'role': x['role'], 'charge': x['kg'], 'vise': x['vise']} for x in p['lignes']],
                    'fantomes': [None if f is None else {'charge': f['kg'], 'reps': f['reps'], 'source': f['source']} for f in p['fantomes']],
                    'message': (m['type'] if m else None) if not avec_message_complet else m})
        if j < len(faites): figees.append({k: p['lignes'][j][k] for k in ('role', 'kg', 'vise', 'src', 'remplace') if k in p['lignes'][j]})
    return out, viol

if __name__ == '__main__':
    global_regles = sys.argv[2] if len(sys.argv) > 2 else '49'
    REGLES = global_regles
    d = json.load(open(sys.argv[1]))
    ecarts = 0
    for cas in d['cas']:
        a, v = attendu(*depuis_cas(cas))
        if v: print('INVARIANT', cas['id'], v)
        if a != cas['attendu']:
            ecarts += 1
            if REGLES == '49': print('ÉCART', cas['id'], cas['titre'])
    print(f"{len(d['cas'])} cas, règles {REGLES} : {ecarts} différent(s) de l'attendu du fichier")
