"""
Banc d'essai — ÉTAGE 2
Du palier au format et à la cible de reps.

MOTEUR §8.2 (format déduit des reps médianes) et §9.1 (cible déduite de
l'historique de cet exercice DANS CE FORMAT).

Lecture chronologique stricte : la cible d'une séance n'est calculée qu'à
partir des séances antérieures. Aucune lecture de l'avenir.
"""

import statistics
import sys
from collections import defaultdict, Counter

from banc_etage1 import charger, etats_exercices, analyse


# --- §8.2 -------------------------------------------------------------
def format_seance(series_retenues):
    """Force <= 6 · Mixte 7-8 · Hypertrophie >= 9, sur les reps médianes."""
    reps = [s["reps"] for s in series_retenues]
    if not reps:
        return None
    med = statistics.median(reps)
    if med <= 6:
        return "force"
    if med <= 8:
        return "mixte"
    return "hypertrophie"


# --- §9.1 -------------------------------------------------------------
def cible_reps(historique, methode="mode"):
    """
    Cible déduite des reps au palier des séances antérieures,
    même exercice et même format. Aucune valeur fixe.
    """
    if not historique:
        return None
    if methode == "mode":
        return Counter(historique).most_common(1)[0][0]
    return int(round(statistics.median(historique)))


def deroule(fichier, methode="mode"):
    seances = charger(fichier)
    etats = etats_exercices(seances)          # cf. réserve ci-dessous

    hist = defaultdict(list)                  # (exo, format) -> reps au palier
    lignes = []
    for s in seances:
        palier, series, err = analyse(s, etats.get(s["exo"]))
        retenues = [x for x in series if x["role"] == "travail"]
        if palier is None or not retenues:
            continue
        fmt = format_seance(retenues)
        cle = (s["exo"], fmt)

        # cible calculée AVANT d'ajouter la séance du jour
        cible = cible_reps(hist[cle], methode)
        au_palier = [x["reps"] for x in retenues if x["kg"] == palier]
        reps_jour = max(au_palier) if au_palier else None

        lignes.append({"date": s["date"], "tri": s["tri"], "exo": s["exo"],
                       "format": fmt, "palier": palier, "cible": cible,
                       "reps_jour": reps_jour, "n_hist": len(hist[cle])})
        if reps_jour is not None:
            hist[cle].append(reps_jour)
    return lignes


# =====================================================================
if __name__ == "__main__":
    fichier = sys.argv[1] if len(sys.argv) > 1 \
        else "/mnt/project/workout_data_AurélienB.csv"
    nom = fichier.split("/")[-1]

    for methode in ("mode", "mediane"):
        lignes = deroule(fichier, methode)
        avec = [l for l in lignes if l["cible"] is not None]
        juste = sum(1 for l in avec if l["reps_jour"] == l["cible"])
        print(f"{nom} — cible par {methode:<8} : "
              f"{len(avec)}/{len(lignes)} séances avec cible, "
              f"cible = reps du jour dans {juste / len(avec):.1%} des cas")

    lignes = deroule(fichier)
    print()
    print("Répartition des formats :",
          dict(Counter(l["format"] for l in lignes)))

    # combien de couples (exercice, format) par exercice ?
    par_exo = defaultdict(set)
    for l in lignes:
        par_exo[l["exo"]].add(l["format"])
    multi = {e: sorted(f) for e, f in par_exo.items() if len(f) > 1}
    print(f"Exercices travaillés dans plusieurs formats : "
          f"{len(multi)}/{len(par_exo)}")

    # dispersion de la cible : est-elle stable ?
    print()
    print("Squat (Barre) — les 12 dernières séances :")
    sq = [l for l in lignes if l["exo"] == "Squat (Barre)"][-12:]
    for l in sq:
        print(f"    {l['date']:<24} {l['format']:<13} "
              f"palier {l['palier']:>6} · cible {str(l['cible']):>4} "
              f"· fait {l['reps_jour']:>3}  (hist {l['n_hist']})")
