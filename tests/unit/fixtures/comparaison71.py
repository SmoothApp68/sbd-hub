"""Référence de la comparaison du récap (chantier 71) : le volume d'une séance comparé à un objet connu."""
import math
OBJETS = [  # (libellé tel qu'écrit, masse en tonnes)
 ("un cheval de trait", 1.0), ("un grand crocodile marin", 1.0), ("une Renault Clio", 1.1), ("un rhinocéros noir", 1.1),
 ("un taureau charolais", 1.1), ("un grand requin blanc", 1.1), ("une girafe", 1.2), ("une Mini", 1.2), ("un morse", 1.2),
 ("une Peugeot 3008", 1.4), ("un hippopotame", 1.5), ("une Tesla Model 3", 1.8), ("un pick-up", 2.2),
 ("un hélicoptère Écureuil plein", 2.2), ("un rhinocéros blanc", 2.3), ("une Tesla Model X", 2.5), ("un Range Rover", 2.5),
 ("un éléphant de forêt", 2.7), ("une camionnette chargée", 3.5), ("un camping-car", 3.5), ("un éléphant de mer", 3.5),
 ("un éléphant d’Asie", 4.0), ("un stégosaure", 5.0), ("un orque", 5.5), ("un éléphant d’Afrique", 6.0),
 ("un mammouth laineux", 6.0), ("un ankylosaure", 6.0), ("un Mirage 2000 à vide", 7.5), ("un T. rex", 8.0),
 ("un tricératops", 9.0), ("un Rafale à vide", 10.0), ("un ATR 72 à vide", 13.0), ("le bourdon Emmanuel de Notre-Dame", 13.0),
 ("la cloche de Big Ben", 13.7), ("un cachalot femelle", 15.0), ("un diplodocus", 15.0), ("un requin-baleine", 15.0),
 ("un char AMX-13", 15.0), ("la Savoyarde du Sacré-Cœur", 19.0), ("un camion chargé", 19.0),
 ("un camion à trois essieux chargé", 26.0), ("un VBCI", 29.0), ("une baleine à bosse", 30.0), ("une baleine grise", 30.0),
 ("le cuivre de la statue de la Liberté", 31.0), ("une toupie à béton chargée", 32.0), ("un Boeing 737 à vide", 41.0),
 ("un Airbus A320 à vide", 42.0), ("un semi-remorque chargé", 44.0), ("un cachalot mâle", 45.0),
]
TOLERANCE = math.log(1.2)   # ±20 %


def fnv1a(texte):
    h = 0x811c9dc5
    for o in texte.encode('utf-8'):
        h ^= o
        h = (h * 0x01000193) & 0xffffffff
    return h


def comparaison(volume_kg, id_seance):
    """None sous 1 000 kg ; « plus qu’un semi-remorque chargé » au-delà de 50 000 kg ; sinon un objet : parmi ceux
    à ±20 % (écart des logarithmes), choisi par l'empreinte FNV-1a 32 bits de l'identifiant de la séance, modulo leur
    nombre, dans l'ordre (masse, libellé) ; aucun à ±20 % : le plus proche (à égalité, le premier dans cet ordre)."""
    if volume_kg is None or volume_kg < 1000:
        return None
    if volume_kg > 50000:
        return "plus qu’un semi-remorque chargé"
    t = volume_kg / 1000
    tries = sorted(OBJETS, key=lambda o: (o[1], o[0]))
    proches = [o for o in tries if abs(math.log(t / o[1])) <= TOLERANCE + 1e-12]
    if proches:
        return proches[fnv1a(id_seance) % len(proches)][0]
    return min(tries, key=lambda o: abs(math.log(t / o[1])))[0]


if __name__ == '__main__':
    print(len(OBJETS))
    for kg, i in [(999, 'a'), (1000, 'a'), (10148, 'e0b1c2d3-0000-4000-8000-000000000001'),
                  (10148, 'e0b1c2d3-0000-4000-8000-000000000002'), (10148, 'e0b1c2d3-0000-4000-8000-000000000003'),
                  (20660, 'e0b1c2d3-0000-4000-8000-000000000001'), (27081, 'e0b1c2d3-0000-4000-8000-000000000001'),
                  (36000, 'x'), (50000, 'x'), (50001, 'x')]:
        print(kg, i[-4:], comparaison(kg, i))
    # couverture : de 1 à 50 t, combien de choix possibles
    import collections
    c = collections.Counter(len([o for o in OBJETS if abs(math.log(t / 10 / o[1])) <= TOLERANCE]) for t in range(10, 501))
    print(sorted(c.items()))
