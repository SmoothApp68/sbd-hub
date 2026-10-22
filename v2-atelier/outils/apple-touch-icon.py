#!/usr/bin/env python3
"""134 (I-15, audit iPhone) — l'icône de l'écran d'accueil de l'iPhone : `v2/icons/apple-touch-icon.png`.

iOS remplit la transparence d'une icône en NOIR sous son propre masque arrondi : les coins transparents de
l'icône du manifeste (`icon-512.png`) y deviendraient des coins sombres. On la pose donc sur le fond de l'app
(`--fond`, lu dans `v2/styles.css`), opaque, en 180 × 180 (la taille que demande iOS).

Généré ici, jamais par un outil en ligne. Déterministe : relancer le script sur les mêmes entrées rend le même
fichier, octet pour octet. Usage, depuis la racine du dépôt :

    python3 v2-atelier/outils/apple-touch-icon.py            # écrit v2/icons/apple-touch-icon.png
    python3 v2-atelier/outils/apple-touch-icon.py --verifier # code 1 si le fichier versé n'est pas celui-ci

Dépendance : Pillow.
"""
import io
import os
import re
import sys

from PIL import Image

RACINE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SOURCE = os.path.join(RACINE, 'v2', 'icons', 'icon-512.png')
CIBLE = os.path.join(RACINE, 'v2', 'icons', 'apple-touch-icon.png')
STYLES = os.path.join(RACINE, 'v2', 'styles.css')
TAILLE = 180


def fond():
    with open(STYLES, encoding='utf-8') as f:
        m = re.search(r'--fond:\s*#([0-9a-fA-F]{6})\b', f.read())
    if not m:
        raise SystemExit('--fond introuvable dans v2/styles.css')
    h = m.group(1)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def fabriquer():
    icone = Image.open(SOURCE).convert('RGBA').resize((TAILLE, TAILLE), Image.LANCZOS)
    plein = Image.new('RGBA', (TAILLE, TAILLE), fond() + (255,))
    plein.alpha_composite(icone)
    sortie = io.BytesIO()
    plein.convert('RGB').save(sortie, format='PNG', optimize=True)
    return sortie.getvalue()


def main():
    octets = fabriquer()
    if '--verifier' in sys.argv:
        with open(CIBLE, 'rb') as f:
            ok = f.read() == octets
        print('apple-touch-icon.png ' + ('à jour' if ok else 'DIFFÉRENT de ce que rend le script'))
        sys.exit(0 if ok else 1)
    with open(CIBLE, 'wb') as f:
        f.write(octets)
    print('écrit ' + os.path.relpath(CIBLE, RACINE) + ' (' + str(len(octets)) + ' octets, fond #%02x%02x%02x)' % fond())


if __name__ == '__main__':
    main()
