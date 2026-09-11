"""
Banc d'essai — ÉTAGE 1
De la séance-exercice brute au palier et aux séries de travail retenues.

Applique, dans l'ordre : MOTEUR §4 (types) · §4.1 (chauffe probable) ·
§5 (montée / rampe) · §6 (descente de fin) · §7 (palier).

Lecture seule. Aucune écriture. Source : exports Hevy des cinq profils.

CORRECTION DU 11/09/2026 — les séries `failure` ne votent plus.
    `analyse()` n'écartait que `warmup` et `dropset` : une série d'ÉCHEC entrait
    donc dans les séries de travail et votait pour le palier, contre le tableau
    du MOTEUR §4 (« Ratée : ne compte pas dans le palier »). C'était un oubli du
    banc, pas une décision.

    La mesure tranche : sur les 97 séance-exercices contenant un échec, 93 ont
    cet échec AU-DESSUS de la plus lourde série de travail — c'est la définition
    d'un échec, on charge plus que ce qu'on tient (§6.4 le mesure à 105 %). Le
    laisser voter remonte le palier au-dessus de la réalité de façon
    systématique. Cas réel du 28/08/2026, développé militaire haltère :
    `92x1, [failure] 100x0, 92x1` donnait « palier 100 pour 0 rep ».

    Coût mesuré : 0,1 point de taux de reconnaissance au plus, sur les cinq
    profils. Le portage JavaScript (`v2/js/palier.js`) applique la même règle.

RÉSERVE CONNUE, non corrigée — `etats_exercices()` compte sur les séries
    NON-`warmup`, donc dégressives et échecs COMPRIS, alors que `analyse()` les
    écarte. Incohérence réelle, mesurée comme quasi inerte : un seul exercice du
    catalogue change d'état, et seulement parce qu'il retombe sous le seuil de
    8 séances. Le tableau du §5.1 est inchangé (squat barre 74,0 % sur 104).
    Laissée en l'état pour que JavaScript et Python restent alignés — à arbitrer
    avec le §5.1 sous les yeux.
"""

import csv
import re
import unicodedata
from collections import defaultdict, Counter

MOIS = {"janv": 1, "févr": 2, "mars": 3, "avr": 4, "mai": 5, "juin": 6,
        "juil": 7, "août": 8, "sept": 9, "oct": 10, "nov": 11, "déc": 12}

SEUIL_CHAUFFE_PROBABLE = 0.75   # §4.1 — choix produit
SEUIL_SEANCES_ETAT = 8          # §5.2
SEUIL_MONTE = 0.60              # §5.2
SEUIL_NE_MONTE_PAS = 0.35       # §5.2


def parse_date(s):
    """'2 févr. 2026, 12:47' -> (2026, 2, 2, 12, 47) triable."""
    m = re.match(r"(\d+) (\S+?)\.? (\d{4}), (\d+):(\d+)", s.strip())
    if not m:
        return (0, 0, 0, 0, 0)
    jour, mois, annee, h, mn = m.groups()
    return (int(annee), MOIS.get(mois, 0), int(jour), int(h), int(mn))


def charger(fichier):
    """Regroupe les lignes en séance-exercices, triées par rang (§1.2)."""
    seances = defaultdict(list)
    with open(fichier, encoding="utf-8") as f:
        for ligne in csv.DictReader(f):
            if not ligne["weight_kg"] or not ligne["reps"]:
                continue
            cle = (ligne["start_time"], ligne["exercise_title"])
            seances[cle].append({
                "rang": int(ligne["set_index"]),
                "type": ligne["set_type"],
                "kg": float(ligne["weight_kg"]),
                "reps": int(ligne["reps"]),
                "rpe": float(ligne["rpe"]) if ligne["rpe"].strip() else None,
            })
    sortie = []
    for (date, exo), series in seances.items():
        series.sort(key=lambda s: s["rang"])       # §1.2 tri explicite
        sortie.append({"date": date, "tri": parse_date(date),
                       "exo": exo, "series": series})
    sortie.sort(key=lambda s: s["tri"])
    return sortie


# --- §7.2 -------------------------------------------------------------
def calcule_palier(series):
    """Charge la plus lourde tenue sur k >= min(3, ceil(n/2)) séries."""
    if not series:
        return None
    n = len(series)
    requis = min(3, -(-n // 2))
    compte = Counter(s["kg"] for s in series)
    candidates = [kg for kg, k in compte.items() if k >= requis]
    return max(candidates) if candidates else None


# --- §5.1 / §5.2 : état de l'exercice ---------------------------------
def etats_exercices(seances):
    """% de séances où la 1re série de travail est plus légère que les suivantes."""
    stats = defaultdict(lambda: [0, 0])
    for s in seances:
        trav = [x for x in s["series"] if x["type"] != "warmup"]
        if len(trav) < 3:
            continue
        stats[s["exo"]][1] += 1
        if trav[0]["kg"] < max(x["kg"] for x in trav[1:]):
            stats[s["exo"]][0] += 1
    etats = {}
    for exo, (monte, total) in stats.items():
        part = monte / total
        if total < SEUIL_SEANCES_ETAT:
            etats[exo] = ("indetermine", part, total)
        elif part >= SEUIL_MONTE:
            etats[exo] = ("monte", part, total)
        elif part <= SEUIL_NE_MONTE_PAS:
            etats[exo] = ("ne_monte_pas", part, total)
        else:
            etats[exo] = ("indetermine", part, total)
    return etats


# --- Le pipeline complet ----------------------------------------------
def analyse(seance, etat_exo):
    """Renvoie le palier et le classement de chaque série."""
    series = seance["series"]
    for s in series:
        s["role"] = None

    # §4 — le tag prime toujours
    travail = []
    for s in series:
        if s["type"] == "warmup":
            s["role"] = "chauffe"
        elif s["type"] == "dropset":
            s["role"] = "degressive"      # §6.3 aucune inférence
        elif s["type"] == "failure":
            s["role"] = "echec"           # §4 + §6.3 : déclarée, ne vote pas
        else:
            travail.append(s)
    if not travail:
        return None, series, "aucune série de travail"

    plus_lourde = max(s["kg"] for s in travail)

    # --- passe A : palier provisoire, sans exclusion ---
    palier_prov = calcule_palier(travail)

    # §4.1 — chauffe probable : <= 75 % de la plus lourde ET avant le palier
    if palier_prov is not None:
        idx_palier = next((i for i, s in enumerate(travail)
                           if s["kg"] == palier_prov), len(travail))
    else:
        idx_palier = len(travail)
    for i, s in enumerate(travail):
        if i < idx_palier and s["kg"] <= SEUIL_CHAUFFE_PROBABLE * plus_lourde:
            s["role"] = "chauffe_probable"

    retenues = [s for s in travail if s["role"] is None]
    if not retenues:
        return None, series, "tout écarté par la chauffe probable"

    # §5.2 / §5.4 — la rampe ne vote pas si l'exercice « monte »
    etat = etat_exo[0] if etat_exo else "indetermine"
    if etat == "monte" and len(retenues) >= 2:
        if retenues[0]["kg"] < max(s["kg"] for s in retenues[1:]):
            retenues[0]["role"] = "rampe"
            retenues = retenues[1:]

    # §6.3 / §6.5 — descente de fin non taguée
    if len(retenues) >= 3:
        dern, avant = retenues[-1], retenues[-2]
        if dern["kg"] < avant["kg"]:
            palier_ref = calcule_palier(retenues[:-1])
            au_palier = [s for s in retenues[:-1]
                         if palier_ref is not None and s["kg"] == palier_ref]
            ref_reps = max((s["reps"] for s in au_palier), default=None)
            if ref_reps is not None and avant["reps"] >= ref_reps:
                dern["role"] = "descente_choisie"
                retenues = retenues[:-1]

    # §7.2 — palier définitif sur les séries retenues
    palier = calcule_palier(retenues)

    # §7.4 — exploration
    for s in retenues:
        if palier is not None and s["kg"] > palier:
            s["role"] = "exploration"
        elif s["role"] is None:
            s["role"] = "travail"

    return palier, series, None


# =====================================================================
if __name__ == "__main__":
    import sys

    fichier = sys.argv[1] if len(sys.argv) > 1 \
        else "/mnt/project/workout_data_AurélienB.csv"
    seances = charger(fichier)
    etats = etats_exercices(seances)

    print(f"{fichier.split('/')[-1]} — {len(seances)} séance-exercices, "
          f"{len(etats)} exercices avec état\n")

    rep = Counter(e[0] for e in etats.values())
    print("États d'exercice :", dict(rep), "\n")

    # --- cas de recette : le squat du 2 février 2026 ---
    cible = [s for s in seances
             if s["date"].startswith("2 févr. 2026")
             and s["exo"] == "Squat (Barre)"]
    if cible:
        s = cible[0]
        etat = etats.get(s["exo"])
        palier, series, err = analyse(s, etat)
        print(f"RECETTE — {s['exo']}, {s['date']}")
        print(f"  état exercice : {etat[0]} ({etat[1]:.0%} sur {etat[2]} séances)")
        for x in series:
            print(f"    {x['kg']:>6} × {x['reps']:<3} "
                  f"{'RPE ' + str(x['rpe']) if x['rpe'] else '':<9} "
                  f"[{x['type']:<7}] → {x['role']}")
        print(f"  PALIER = {palier}  (attendu 125.0)")
        print(f"  {'PASSE' if palier == 125.0 else 'ÉCHOUE'}\n")

    # --- couverture : sur combien de séances un palier sort-il ? ---
    ok = vide = 0
    roles = Counter()
    for s in seances:
        palier, series, err = analyse(s, etats.get(s["exo"]))
        if palier is None:
            vide += 1
        else:
            ok += 1
        for x in series:
            roles[x["role"]] += 1
    total = ok + vide
    print(f"Palier reconnu : {ok}/{total} ({ok / total:.1%})")
    print("Rôles attribués :")
    for r, n in roles.most_common():
        print(f"    {str(r):<20} {n:>6}")
