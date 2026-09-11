"""
Test de recette du banc d'essai — BANC-ESSAI-V1.md §6.1

Vérifie que la règle de validation de palier (MOTEUR §9.2 + §17.3/17.4)
compte bien TROIS séries sur trois sur le squat du 2 février 2026.

Si ce test échoue, tous les délais du banc seront artificiellement longs
et on conclurait à tort que le moteur est trop ambitieux.
"""

# --- Bandes d'effort — MOTEUR §17.3 -----------------------------------
# facile = RPE < 8 · dur = 8 à 9,5 · max = 10
def cran_effort(rpe):
    if rpe is None:
        return None
    if rpe < 8:
        return "facile"
    if rpe <= 9.5:
        return "dur"
    return "max"


# --- Reps comptées pour la validation — MOTEUR §17.4 ------------------
# Une série marquée « max » compte -1 rep, pour la validation SEULEMENT.
def reps_comptees(reps, rpe):
    return reps - 1 if cran_effort(rpe) == "max" else reps


# --- Validation du palier — MOTEUR §9.2 -------------------------------
# Les deux premières séries atteignent la cible.
# Les suivantes sont tolérées à -1 rep.
# Le rang se compte sur les séries de travail au palier, pas sur l'exercice.
def palier_tenu(series, cible):
    if len(series) < 2:
        return False, "moins de deux séries au palier"
    for i, (reps, rpe) in enumerate(series):
        r = reps_comptees(reps, rpe)
        seuil = cible if i < 2 else cible - 1
        if r < seuil:
            return False, f"série {i + 1} : {r} comptée < {seuil} requis"
    return True, "toutes les séries au seuil"


# --- Cas de recette : squat du 2 février 2026 -------------------------
# Données réelles, export Hevy, aurel_br.
# warmup 60x8, 80x6, 100x4, 115x2, 122.5x1  (exclus : §9.2, rang au palier)
SQUAT_2_FEVRIER = [(4, 8.5), (4, 9.5), (4, 9.5)]
CIBLE = 4

print("Squat du 2 février 2026 — 125 kg, cible 4 reps")
print("-" * 52)
for i, (reps, rpe) in enumerate(SQUAT_2_FEVRIER, 1):
    print(f"  série {i} : {reps} reps @ RPE {rpe} "
          f"→ cran '{cran_effort(rpe)}' → {reps_comptees(reps, rpe)} comptée(s)")

comptees = sum(1 for reps, rpe in SQUAT_2_FEVRIER
               if reps_comptees(reps, rpe) >= CIBLE)
tenu, raison = palier_tenu(SQUAT_2_FEVRIER, CIBLE)

print("-" * 52)
print(f"  séries à la cible : {comptees} / {len(SQUAT_2_FEVRIER)}")
print(f"  palier            : {'TENU' if tenu else 'REFUSÉ'}  ({raison})")
print()

attendu_comptees = 3
attendu_tenu = True
ok = (comptees == attendu_comptees) and (tenu == attendu_tenu)
print("RECETTE :", "PASSE" if ok else "ÉCHOUE")
if not ok:
    print(f"  attendu {attendu_comptees}/3 et palier tenu — "
          f"le compteur reproduit le bug du §812.")

# --- Contre-épreuve : la pénalité si 9,5 était classé 'max' -----------
print()
print("Contre-épreuve — si 9,5 basculait dans le cran 'max' :")
pen = [(reps - 1 if rpe >= 9.5 else reps) for reps, rpe in SQUAT_2_FEVRIER]
print(f"  reps comptées : {pen} → {sum(1 for p in pen if p >= CIBLE)} / 3, "
      f"palier refusé. C'est le bug documenté au §812.")

# --- Sanity : la règle §9.2 sur les profils du tableau du §9.2 --------
print()
print("Sanity — tableau du §9.2, cible 5, sans effort renseigné :")
for profil, attendu in [([5, 5, 5, 5], True), ([5, 5, 4, 4], True),
                        ([5, 5, 4], True), ([5, 4, 4, 3], False),
                        ([5, 3, 3, 3], False)]:
    t, _ = palier_tenu([(r, None) for r in profil], 5)
    marque = "ok" if t == attendu else "DIVERGE"
    print(f"  {'-'.join(map(str, profil)):<12} "
          f"{'valide' if t else 'pas encore':<12} {marque}")
