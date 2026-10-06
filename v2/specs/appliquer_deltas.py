#!/usr/bin/env python3
"""Applique des deltas de spec, ancre par ancre, en tout ou rien.

Usage :
  python3 appliquer_deltas.py DELTAS.md <dossier des specs> --verifier
  python3 appliquer_deltas.py DELTAS.md <dossier des specs> --appliquer
  python3 appliquer_deltas.py DELTAS.md <dossier des specs> --sortie <autre dossier>

--verifier   rejoue tous les deltas en mémoire et n'écrit rien.
--appliquer  écrit les fichiers en place, seulement si TOUS les deltas passent.
--sortie     écrit les fichiers modifiés dans un autre dossier, même condition.

Chaque ancre doit exister exactement une fois au moment où son delta s'applique.
Une ancre absente ou multiple, un fichier manquant : rien n'est écrit, code de sortie 1.
Les fins de ligne du fichier d'origine (LF ou CRLF) sont conservées.
Un bloc ouvert par quatre accents graves (````texte) peut contenir des lignes ``` : il ne se
ferme que sur une clôture de même longueur.
"""
import os
import re
import sys


def lire_deltas(chemin):
    lignes = open(chemin, encoding='utf-8').read().replace('\r\n', '\n').split('\n')
    deltas, cur, i = [], None, 0
    while i < len(lignes):
        ligne = lignes[i]
        m = re.match(r'^### ([A-Z]\d+) — (.*)$', ligne)
        if m:
            cur = {'id': m.group(1), 'titre': m.group(2), 'blocs': {}}
            deltas.append(cur)
        elif cur is not None and ligne.startswith('**Fichier** : `'):
            cur['fichier'] = ligne.split('`')[1]
        elif cur is not None and ligne.startswith('**Opération** : '):
            cur['op'] = ligne.split(' : ', 1)[1].strip()
        elif cur is not None and re.match(r'^(`{3,})(ancre|ancre-debut|ancre-fin|texte)$', ligne):
            m2 = re.match(r'^(`{3,})(.*)$', ligne)
            cloture, nom, j, contenu = m2.group(1), m2.group(2), i + 1, []
            while j < len(lignes) and lignes[j] != cloture:
                contenu.append(lignes[j])
                j += 1
            if j == len(lignes):
                raise SystemExit(f"Bloc « {nom} » non fermé dans le delta {cur['id']}")
            cur['blocs'][nom] = '\n'.join(contenu)
            i = j
        i += 1
    for d in deltas:
        manque = [k for k in ('fichier', 'op') if k not in d]
        if manque or 'texte' not in d['blocs']:
            raise SystemExit(f"Delta {d['id']} incomplet : {manque or ['texte']}")
    return deltas


def appliquer(d, texte):
    op, b = d['op'], d['blocs']
    if op == 'REMPLACER LE BLOC':
        deb, fin = b['ancre-debut'], b['ancre-fin']
        for nom, a in (('début', deb), ('fin', fin)):
            n = texte.count(a)
            if n != 1:
                raise ValueError(f"ancre de {nom} trouvée {n} fois")
        i, j = texte.index(deb), texte.index(fin)
        if j < i:
            raise ValueError("ancre de fin avant l'ancre de début")
        return texte[:i] + b['texte'] + texte[j + len(fin):]
    a = b['ancre']
    n = texte.count(a)
    if n != 1:
        raise ValueError(f"ancre trouvée {n} fois")
    if op == 'REMPLACER':
        return texte.replace(a, b['texte'])
    if op == 'INSÉRER APRÈS':
        return texte.replace(a, a + '\n\n' + b['texte'])
    if op == 'INSÉRER AVANT':
        return texte.replace(a, b['texte'] + '\n\n' + a)
    raise ValueError(f"opération inconnue : {op}")


def main(argv):
    if len(argv) < 4 or argv[3] not in ('--verifier', '--appliquer', '--sortie'):
        print(__doc__)
        return 2
    src, dossier, mode = argv[1], argv[2], argv[3]
    sortie = argv[4] if mode == '--sortie' and len(argv) > 4 else None
    if mode == '--sortie' and not sortie:
        print('--sortie demande un dossier')
        return 2

    deltas = lire_deltas(src)
    print(f"{len(deltas)} deltas lus dans {os.path.basename(src)}")

    textes, crlf, erreurs = {}, {}, 0
    for d in deltas:
        f = d['fichier']
        if f not in textes:
            chemin = os.path.join(dossier, f)
            if not os.path.isfile(chemin):
                erreurs += 1
                print(f"  ❌ {d['id']:<4} {f} : fichier absent de {dossier}")
                textes[f] = None
                continue
            brut = open(chemin, encoding='utf-8', newline='').read()
            crlf[f] = '\r\n' in brut
            textes[f] = brut.replace('\r\n', '\n')
        if textes[f] is None:
            erreurs += 1
            print(f"  ❌ {d['id']:<4} {f} : fichier absent")
            continue
        try:
            avant = textes[f]
            textes[f] = appliquer(d, avant)
            print(f"  ✅ {d['id']:<4} {d['op']:<18} {f}  ({len(textes[f]) - len(avant):+d} car.)")
        except ValueError as e:
            erreurs += 1
            print(f"  ❌ {d['id']:<4} {d['op']:<18} {f} : {e} — « {d['titre']} »")

    if erreurs:
        print(f"\n{erreurs} erreur(s) sur {len(deltas)} deltas. RIEN N'A ÉTÉ ÉCRIT.")
        return 1
    if mode == '--verifier':
        print(f"\n{len(deltas)} deltas, 0 erreur. Vérification seule : rien n'a été écrit.")
        return 0

    cible = dossier if mode == '--appliquer' else sortie
    os.makedirs(cible, exist_ok=True)
    for f, t in textes.items():
        if crlf.get(f):
            t = t.replace('\n', '\r\n')
        with open(os.path.join(cible, f), 'w', encoding='utf-8', newline='') as h:
            h.write(t)
    print(f"\n{len(deltas)} deltas, 0 erreur. {len(textes)} fichiers écrits dans {cible}.")
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
