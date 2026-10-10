#!/usr/bin/env python3
"""gen66d.py — le générateur v2, la fin : RANGER les exercices ajoutés (G6) et ASSOCIER en supersets quand le temps
manque (G7). Référence de 66D (QUESTIONNAIRE-COACH-V2 §5 quater.4-5). Claude.ai, 10/10/2026.

Deux fonctions pures, à la suite de `completer` (gen66c.py, la seule source des tables qu'elles lisent) :
  · `ranger(entree)`   : `{ routines, journal, catalogue }` → les routines, chaque exercice AJOUTÉ (journal `exercice`)
                         déplacé à son rang ; l'ordre de la personne ne bouge jamais.
  · `associer(entree)` : `{ routines, structures, cible_min, catalogue, refus_paires: [[routine, a, b]] }` → `{ routines, journal }` :
                         des paires antagonistes en superset, la plus grosse économie d'abord, tant que la séance
                         dépasse la cible ; `cible_min` nul → rien.
Les `structures` sont celles que l'app calcule (`Moteur.structureDeRoutine` de la routine telle qu'elle sera créée) :
la référence ne recalcule pas les repos, elle les LIT. `duree()` ci-dessous est le port de `Moteur.dureeEstimee`
(une estimation, MOTEUR §9.18) ; en JS, `associer` appelle la vraie.

Usage : python3 -I gen66d.py cas-66d-generateur.json [--ecrire]
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen66c import barre_lourde, tirage, poussee      # une seule définition (gen66c.py)
import gen66c

# ── Le port de l'estimation (MOTEUR §9.18 — Moteur.dureeExercice / dureeEstimee) ─────────────────────────────────
SERIE, CHANGEMENT, REPOS_SUPERSET, DEGRESSIVE = 60, 30, 15, 45
REPOS_ENTRE_CHAUFFES, REPOS_APRES_CHAUFFES = 60, 120
MUSCLES_POLYARTICULAIRE = 3

def nb_muscles(e):
    return len(e.get('prim') or []) + len(e.get('sec') or []) + len(e.get('stab') or [])

def duree_exercice(e):
    ch, tr, deg = e.get('ch') or 0, e.get('tr') or 0, e.get('deg') or 0
    if ch + tr + deg == 0:
        return 0
    repos = e.get('repos')
    t = CHANGEMENT
    if e.get('mesure') in ('temps', 'distance_temps'):
        return t + (e.get('duree') or 0) * tr + (repos or 0) * max(0, tr - 1)
    if ch > 0:
        t += ch * SERIE + (ch - 1) * REPOS_ENTRE_CHAUFFES + REPOS_APRES_CHAUFFES
    t += tr * (SERIE + (REPOS_SUPERSET if repos is None else repos))
    t += deg * DEGRESSIVE
    return t

def duree(structure):
    return sum(duree_exercice(e) for e in structure)


# ── G6 : le rang d'un exercice (NSCA : barres lourdes, polyarticulaires, isolations, tronc) ──────────────────────
def rang(slug, cat):
    f = cat.get(slug) or {}
    prim = f.get('muscles_primaires') or []
    s = {'prim': prim, 'sec': f.get('muscles_secondaires') or [], 'stab': f.get('muscles_stabilisateurs') or []}
    if nb_muscles(s) == 0:
        return None                                    # une sortie (cardio) : à part
    if barre_lourde(slug, cat):
        return 0
    if prim == ['abdominaux']:
        return 3                                       # le tronc : seul principal, les abdominaux
    return 1 if nb_muscles(s) >= MUSCLES_POLYARTICULAIRE else 2


def ranger(e):
    """Chaque exercice ajouté par le complément (journal `exercice`, dans l'ordre du journal) se place AVANT le premier
    exercice, à partir du 2e, de rang strictement plus grand que le sien (une sortie, à partir du 2e, compte comme la
    fin) ; aucun : à la fin. Le premier exercice de la séance reste le premier ; l'ordre de la personne ne bouge pas."""
    cat = e['catalogue']
    rs = [{'nom': r['nom'], 'exercices': [dict(x) for x in r['exercices']]} for r in e['routines']]
    for j in e.get('journal') or []:
        if j.get('type') != 'exercice':
            continue
        r = next((r for r in rs if r['nom'] == j['routine']), None)
        if r is None:
            continue
        k0 = next((k for k, x in enumerate(r['exercices']) if x['exercise_slug'] == j['exercise_slug']), None)
        if k0 is None:
            continue
        ligne = r['exercices'].pop(k0)
        mien = rang(ligne['exercise_slug'], cat)
        pos = len(r['exercices'])
        for k in range(1, len(r['exercices'])):
            autre = rang(r['exercices'][k]['exercise_slug'], cat)
            if autre is None or autre > mien:
                pos = k
                break
        r['exercices'].insert(pos, ligne)
    return rs


# ── G7 : les paires antagonistes (Zhang, Weakley et al. 2025) ────────────────────────────────────────────────────
PAIRES = [('tirage', 'poussee'), ('biceps', 'triceps'), ('quadriceps', 'ischios')]

def famille(slug, cat):
    f = cat.get(slug) or {}
    prim = f.get('muscles_primaires') or []
    if tirage(f):
        return 'tirage'
    if poussee(slug, cat):
        return 'poussee'
    if 'biceps' in prim:
        return 'biceps'
    if 'triceps' in prim:
        return 'triceps'
    if 'quadriceps' in prim and 'ischio_jambiers' not in prim:
        return 'quadriceps'
    if 'ischio_jambiers' in prim and 'quadriceps' not in prim:
        return 'ischios'
    return None

def antagonistes(a, b):
    return (a, b) in PAIRES or (b, a) in PAIRES


def associer(e):
    """Tant que l'estimation d'une séance dépasse `cible_min` : la paire permise qui économise le plus (le premier
    membre perd son repos, `tr × (repos − 15 s)`), à égalité la plus proche, puis la plus haute. Le second membre
    remonte juste après le premier. Permise : deux exercices antagonistes de même classe (polyarticulaire ou isolation),
    ni le premier exercice ni le premier polyarticulaire de la séance, ni une barre lourde, ni une habileté, ni une
    sortie, mesurés en charge × reps ou en reps, chacun dans une seule paire, aucun des deux dans une paire retirée. Aucune : la
    séance reste telle quelle (le raccourci joue ensuite, inchangé)."""
    cat = e['catalogue']; cible = e.get('cible_min')
    # Une paire retirée dans l'aperçu : ses deux exercices restent en séries classiques — ni l'un ni l'autre n'entre
    # dans une autre paire (retirer ne remplace rien, §5 quater.5).
    # `refus_paires` : `[[routine, a, b]]` — une paire se retire dans SA séance.
    refus = {(p[0], s) for p in (e.get('refus_paires') or []) for s in p[1:]}
    sortie, journal = [], []
    for r, st in zip(e['routines'], e['structures']):
        lignes = [dict(x, groupe_superset=None) for x in r['exercices']]
        S = [dict(s) for s in st]
        if cible is None:
            sortie.append({'nom': r['nom'], 'exercices': lignes}); continue
        premier = next((s['slug'] for s in S if nb_muscles(s) >= MUSCLES_POLYARTICULAIRE), None)   # son repos de 180 s
        groupe = 0
        avant = duree(S)
        while duree(S) > cible * 60:
            def apte(k):
                x = lignes[k]; s = x['exercise_slug']; f = cat.get(s) or {}
                return (k != 0 and s != premier and (r['nom'], s) not in refus and x['groupe_superset'] is None
                        and not barre_lourde(s, cat) and not f.get('habilete')
                        and f.get('mesure') in ('charge_reps', 'reps') and nb_muscles(S[k]) > 0
                        and famille(s, cat) is not None and S[k].get('repos') is not None)
            meilleur = None
            for i in range(len(lignes)):
                if not apte(i):
                    continue
                for j in range(i + 1, len(lignes)):
                    if not apte(j):
                        continue
                    a, b = lignes[i]['exercise_slug'], lignes[j]['exercise_slug']
                    if not antagonistes(famille(a, cat), famille(b, cat)):
                        continue
                    if (nb_muscles(S[i]) >= MUSCLES_POLYARTICULAIRE) != (nb_muscles(S[j]) >= MUSCLES_POLYARTICULAIRE):
                        continue
                    gain = (S[i].get('tr') or 0) * (S[i]['repos'] - REPOS_SUPERSET)
                    if gain <= 0:
                        continue
                    cle = (-gain, j - i, i)
                    if meilleur is None or cle < meilleur[0]:
                        meilleur = (cle, i, j, gain)
            if meilleur is None:
                break
            _, i, j, gain = meilleur
            groupe += 1
            lj, sj = lignes.pop(j), S.pop(j)
            lignes.insert(i + 1, lj); S.insert(i + 1, sj)
            lignes[i]['groupe_superset'] = lignes[i + 1]['groupe_superset'] = groupe
            S[i]['repos'] = None
            journal.append({'type': 'superset', 'routine': r['nom'], 'a': lignes[i]['exercise_slug'],
                            'b': lignes[i + 1]['exercise_slug'], 'gain_s': gain})
        if any(j['routine'] == r['nom'] for j in journal):
            journal.append({'type': 'duree', 'routine': r['nom'], 'de_s': avant, 'a_s': duree(S)})
        sortie.append({'nom': r['nom'], 'exercices': lignes})
    return {'routines': sortie, 'journal': journal}


# ── Les invariants (V6 à V9) ──────────────────────────────────────────────────────────────────────────────────────
def verifier(e, s):
    cat = e['catalogue']; fautes = []
    for r0, r in zip(e['routines'], s['routines']):
        if sorted((x['exercise_slug'], x['series'], x['reps']) for x in r0['exercices']) != \
           sorted((x['exercise_slug'], x['series'], x['reps']) for x in r['exercices']):
            fautes.append('V6 une ligne changée')                           # associer ne touche à aucune série
        g = {}
        for k, x in enumerate(r['exercices']):
            if x.get('groupe_superset') is not None:
                g.setdefault(x['groupe_superset'], []).append(k)
        for ks in g.values():
            if len(ks) != 2 or ks[1] != ks[0] + 1:
                fautes.append('V7 une paire non contiguë')
                continue
            a, b = (r['exercices'][k]['exercise_slug'] for k in ks)
            if barre_lourde(a, cat) or barre_lourde(b, cat):
                fautes.append('V8 une barre lourde en superset')
            if not antagonistes(famille(a, cat), famille(b, cat)):
                fautes.append('V9 une paire non antagoniste')
        if e.get('cible_min') is None and g:
            fautes.append('V7 un superset sans manque de temps')
    return fautes


def main():
    chemin = sys.argv[1]
    data = json.load(open(chemin, encoding='utf-8'))
    ecart = 0
    for cas in data['cas']:
        e = dict(cas['entree']); e['catalogue'] = data['catalogue']
        if cas['fonction'] == 'completer':                 # les refus de l'aperçu (gen66c.py, 66D)
            obtenu = gen66c.completer(json.loads(json.dumps(e)))
            f = gen66c.verifier(e, obtenu)
            if f:
                print('INVARIANT', cas['nom'], f); ecart += 1
        elif cas['fonction'] == 'ranger':
            obtenu = ranger(json.loads(json.dumps(e)))
        else:
            obtenu = associer(json.loads(json.dumps(e)))
            f = verifier(e, obtenu)
            if f:
                print('INVARIANT', cas['nom'], f); ecart += 1
        if '--ecrire' in sys.argv:
            cas['attendu'] = obtenu
        elif json.dumps(obtenu, sort_keys=True) != json.dumps(cas['attendu'], sort_keys=True):
            print('ÉCART', cas['nom']); ecart += 1
    if '--ecrire' in sys.argv:                            # une ligne par exercice du catalogue et par cas
        c = lambda o: json.dumps(o, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
        L = ['{'] + [' %s:%s,' % (json.dumps(k), c(data[k])) for k in sorted(data) if k not in ('catalogue', 'cas')]
        ks = sorted(data['catalogue'])
        L += [' "catalogue":{'] + ['  %s:%s%s' % (json.dumps(k), c(data['catalogue'][k]), ',' if i < len(ks) - 1 else '')
                                     for i, k in enumerate(ks)] + [' },', ' "cas":[']
        L += ['  %s%s' % (c(x), ',' if i < len(data['cas']) - 1 else '') for i, x in enumerate(data['cas'])] + [' ]', '}']
        open(chemin, 'w', encoding='utf-8').write('\n'.join(L) + '\n')
    print('%d cas, %d écart(s)' % (len(data['cas']), ecart))
    sys.exit(1 if ecart else 0)


if __name__ == '__main__':
    main()
