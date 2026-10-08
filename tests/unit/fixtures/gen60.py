"""gen60.py — le générateur « Construis-le-moi » (QUESTIONNAIRE-COACH-V2 §6), référence 60-4.
Claude.ai, 08/10/2026. Règles validées par Aurélien le 08/10/2026 (questions 1 à 4 et maquette-generateur-v1).

Entrées : le catalogue (slug → équipement, muscles principaux, muscles secondaires), les jours (2 à 6), l'objectif,
la phase, le matériel, les priorités (slugs ou zones du radar), les zones à ménager, les exercices écartés, les
séances par exercice sur 12 semaines (l'historique). Sortie : des routines (nom, exercices dans l'ordre : slug, rôle,
séries de travail, reps visées, ménagé, barre fixe). JAMAIS de charge (le coach la décide), JAMAIS de repos (le
chemin de « Créer la routine » les donne), JAMAIS de durée : la durée visée passe par la fonction de « J'ai peu de
temps » (MOTEUR §9.18), après le générateur, dans l'app.
"""
import json

# ── les motifs : des candidats dans l'ordre par défaut ──
MOTIFS = {
 'squat': ['squat_barre', 'hack_squat_machine', 'belt_squat_machine', 'split_squat_bulgare', 'squat_poids_du_corps'],
 'presse': ['presse_a_cuisses', 'split_squat_bulgare', 'step_up_haltere', 'step_up'],
 'charniere': ['souleve_de_terre_barre', 'souleve_de_terre_barre_hex', 'souleve_de_terre_haltere'],
 'jambes_tendues': ['souleve_de_terre_roumain_barre', 'souleve_de_terre_roumain_haltere'],
 'hip_thrust': ['hip_thrust_barre', 'hip_thrust_machine', 'hip_thrust_une_jambe_haltere'],
 'leg_curl': ['leg_curl_assis', 'leg_curl_allonge_machine', 'souleve_de_terre_roumain_haltere'],
 'quad_iso': ['extension_jambes', 'step_up_haltere', 'step_up'],
 'mollets': ['extension_mollets_debout_machine', 'extension_mollets_assis'],
 'abdos': ['releve_de_genoux_suspendu', 'crunch_poulie', 'crunch'],
 'couche': ['developpe_couche_barre', 'developpe_couche_haltere', 'chest_press_machine', 'pompes'],
 'incline': ['developpe_couche_incline_haltere', 'developpe_couche_incline_barre', 'chest_press_incline_machine', 'pompes_declinees'],
 'militaire': ['developpe_militaire_barre', 'developpe_militaire_haltere', 'presse_epaules_assis_machine', 'pompes_pic'],
 'tirage_vertical': ['tractions', 'tirage_poitrine_poulie', 'tirage_poitrine_machine', 'tirage_vertical_elastique'],
 'rowing': ['rowing_poulie_assis', 'rowing_penche_barre', 'rowing_haltere', 'rowing_assis_machine',
            'rowing_incline_poitrine_haltere', 'rowing_elastique', 'rowing_inverse'],
 'elev_lat': ['elevation_laterale_poulie', 'elevation_laterale_haltere'],
 'arriere': ['tirage_vers_visage', 'oiseau_haltere'],
 'curl': ['curl_biceps_barre_ez', 'curl_biceps_haltere', 'curl_marteau_haltere'],
 'triceps': ['extension_triceps_poulie_haute', 'extension_des_triceps_au_dessus_de_la_tete_cable', 'extension_triceps_haltere', 'pompes_diamant'],
 'ecarte': ['ecarte_machine', 'ecartes_poulie', 'ecarte_haltere'],
}
# Rien de faisable dans un motif : son voisin (même muscle, autre angle).
VOISIN = {'tirage_vertical': 'rowing', 'rowing': 'tirage_vertical', 'quad_iso': 'presse', 'leg_curl': 'jambes_tendues',
          'incline': 'couche', 'couche': 'incline', 'ecarte': 'incline'}
PETITS = {'elev_lat', 'arriere', 'mollets', 'abdos'}            # +3 reps en isolation : les petits muscles se travaillent long

# ── les gabarits par nombre de jours : (nom, [(motif, rôle)]) ; P principal, S secondaire, I isolation, T tronc ──
H_A = ('Haut A', [('couche', 'P'), ('tirage_vertical', 'S'), ('incline', 'S'), ('rowing', 'S'), ('elev_lat', 'I'), ('triceps', 'I'), ('ecarte', 'I')])
B_A = ('Bas A', [('squat', 'P'), ('jambes_tendues', 'S'), ('quad_iso', 'I'), ('leg_curl', 'I'), ('mollets', 'I'), ('abdos', 'T')])
H_B = ('Haut B', [('militaire', 'P'), ('rowing', 'S'), ('couche', 'S'), ('tirage_vertical', 'S'), ('arriere', 'I'), ('elev_lat', 'I'), ('curl', 'I')])
B_B = ('Bas B', [('charniere', 'P'), ('presse', 'S'), ('hip_thrust', 'S'), ('leg_curl', 'I'), ('mollets', 'I'), ('abdos', 'T')])
GABARITS = {
 2: [('Corps entier A', [('squat', 'P'), ('couche', 'P'), ('rowing', 'S'), ('jambes_tendues', 'S'), ('elev_lat', 'I'), ('abdos', 'T')]),
     ('Corps entier B', [('charniere', 'P'), ('militaire', 'P'), ('tirage_vertical', 'S'), ('presse', 'S'), ('curl', 'I'), ('triceps', 'I')])],
 3: [('Corps entier A', [('squat', 'P'), ('couche', 'P'), ('rowing', 'S'), ('leg_curl', 'I'), ('elev_lat', 'I'), ('abdos', 'T')]),
     ('Corps entier B', [('charniere', 'P'), ('militaire', 'P'), ('tirage_vertical', 'S'), ('presse', 'S'), ('curl', 'I'), ('mollets', 'I')]),
     ('Corps entier C', [('hip_thrust', 'S'), ('incline', 'S'), ('rowing', 'S'), ('quad_iso', 'I'), ('triceps', 'I'), ('ecarte', 'I')])],
 4: [H_A, B_A, H_B, B_B],
 5: [H_A, B_A, H_B, B_B, ('Haut du corps', [('incline', 'S'), ('rowing', 'S'), ('elev_lat', 'I'), ('ecarte', 'I'), ('curl', 'I'), ('triceps', 'I')])],
 6: [('Poussée A', [('couche', 'P'), ('militaire', 'S'), ('incline', 'S'), ('elev_lat', 'I'), ('triceps', 'I')]),
     ('Tirage A', [('tirage_vertical', 'P'), ('rowing', 'S'), ('arriere', 'I'), ('curl', 'I'), ('abdos', 'T')]),
     ('Jambes A', [('squat', 'P'), ('jambes_tendues', 'S'), ('quad_iso', 'I'), ('leg_curl', 'I'), ('mollets', 'I')]),
     ('Poussée B', [('militaire', 'P'), ('incline', 'S'), ('couche', 'S'), ('elev_lat', 'I'), ('triceps', 'I')]),
     ('Tirage B', [('rowing', 'P'), ('tirage_vertical', 'S'), ('arriere', 'I'), ('curl', 'I'), ('abdos', 'T')]),
     ('Jambes B', [('charniere', 'P'), ('presse', 'S'), ('hip_thrust', 'S'), ('leg_curl', 'I'), ('mollets', 'I')])],
}

# Le matériel : la table de 60-1 (Profil.EQUIPEMENTS_DU_MATERIEL dans l'app, lue, jamais recopiée).
MATERIEL = {
 'salle_complete': None,
 'salle_basique': {'aucun', 'barre', 'haltere', 'poulie', 'elastique', 'kettlebell', 'disque'},
 'maison_equipee': {'barre', 'haltere', 'disque', 'kettlebell', 'elastique', 'aucun'},
 'maison_minimal': {'haltere', 'kettlebell', 'elastique', 'aucun'},
 'poids_du_corps': {'aucun', 'elastique'},
}
BARRE_FIXE = ('tractions', 'rowing_inverse')

# Zone à ménager (décidé le 08/10, question 1) : les motifs qui chargent la zone.
CHARGE_ZONE = {
 'genou': {'squat', 'presse', 'quad_iso'},
 'dos': {'charniere', 'jambes_tendues', 'squat', 'rowing'},
 'epaule': {'militaire', 'couche', 'elev_lat'},
 'coude': {'triceps', 'curl'},
 'hanche': {'hip_thrust', 'squat', 'charniere'},
}
# La variante plus tolérée, seulement les cas évidents : le dos prend le belt squat (charge à la ceinture), la barre
# hexagonale (Swinton 2011 : moins de contrainte lombaire), le rowing poitrine appuyée. Ailleurs, seule la charge baisse.
DOUX = {'dos': {'charniere': 'souleve_de_terre_barre_hex', 'squat': 'belt_squat_machine',
                'rowing': 'rowing_incline_poitrine_haltere'}}

# Les zones du radar (semaine.js ZONES, lues dans l'app) : muscle → zone, et leur libellé.
ZONES = [('jambes', 'Jambes', ['quadriceps', 'ischio_jambiers', 'fessiers', 'mollets', 'adducteurs', 'abducteurs']),
         ('dos', 'Dos', ['grand_dorsal', 'haut_du_dos', 'trapezes', 'bas_du_dos']),
         ('bras', 'Bras', ['biceps', 'triceps', 'avant_bras']),
         ('epaules', 'Épaules', ['deltoide_anterieur', 'deltoide_lateral', 'deltoide_posterieur']),
         ('poitrine', 'Poitrine', ['pectoraux']),
         ('tronc', 'Tronc', ['abdominaux'])]
ZONE_DE = {m: z for z, _, ms in ZONES for m in ms}
LIBELLE_ZONE = {z: l for z, l, _ in ZONES}

# Reps visées par objectif et rôle (P, S, I) ; sans objectif, celles de « Muscle ».
REPS = {'force': (5, 7, 12), 'les_deux': (5, 9, 12), 'muscle': (7, 9, 12), 'forme': (9, 12, 15), None: (7, 9, 12)}
CHARNIERE_MAX = 8      # une charnière ne dépasse jamais 8 reps : la fatigue défait la technique


def series_de(role, objectif):
    if role == 'P':
        return 4 if objectif in ('force', 'les_deux') else 3
    return 2 if role == 'T' else 3


def _ok(cat, materiel, faits):
    permis = MATERIEL.get(materiel)
    # La maison minimale n'a pas de barre fixe (le catalogue range tractions et rowing inversé en « aucun ») : elle a
    # ses rowings aux haltères. Au poids du corps, ils restent, après les élastiques, avec la mention (question 3).
    sans_barre_fixe = materiel == 'maison_minimal'

    def ok(s):
        if s not in cat:
            return False                                  # absent du catalogue de la personne : la place l'ignore
        if s in faits:
            return True                                   # un exercice déjà fait n'est jamais rétrogradé (60-1)
        if sans_barre_fixe and s in BARRE_FIXE:
            return False
        return permis is None or cat[s][0] in permis
    return ok


def _choisir(motif, ok, ecartes, pris, menager, faits, materiel):
    """Une place : le motif, sinon son voisin, sinon un exercice déjà pris (plutôt qu'un muscle sans travail).
    Tri : variante douce d'une zone à ménager, puis l'historique (le plus fait d'abord), puis l'élastique d'abord au
    poids du corps, puis l'ordre du motif. None : rien de faisable, la place saute."""
    src = MOTIFS[motif]
    cand = [s for s in src if s not in ecartes and ok(s) and s not in pris]
    if not cand and motif in VOISIN:
        src = MOTIFS[VOISIN[motif]]
        cand = [s for s in src if s not in ecartes and ok(s) and s not in pris]
    if not cand:
        src = MOTIFS[motif]
        cand = [s for s in src if s not in ecartes and ok(s)]
    if not cand:
        return None
    doux = next((DOUX[z][motif] for z in menager if motif in DOUX.get(z, {})), None)
    cand.sort(key=lambda s: (s != doux, -faits.get(s, 0),
                             not (materiel == 'poids_du_corps' and s in ('rowing_elastique', 'tirage_vertical_elastique')),
                             src.index(s)))
    return cand[0]


def _ligne(cat, slug, motif, role, p):
    objectif, phase = p.get('objectif'), p.get('phase')
    priorites, menager = p.get('priorites', ()), p.get('menager', ())
    rp, rs, ri = REPS.get(objectif, REPS[None])
    barre = cat[slug][0] == 'barre'
    # Lourd seulement à la barre : un principal hors barre prend les reps d'un secondaire.
    reps = {'P': rp if barre else rs, 'S': rs, 'I': ri, 'T': ri}[role] + (3 if motif in PETITS and role in 'IT' else 0)
    n = series_de(role, objectif)
    prio_ex = slug in priorites
    prio_mu = phase != 'seche' and any(ZONE_DE.get(m) in priorites for m in cat[slug][1])
    if prio_ex or (prio_mu and role in 'SI'):
        n += 1
    menage = any(motif in CHARGE_ZONE[z] for z in menager)
    if menage and role == 'P':
        reps = rs                                         # pas de série lourde ; toutes les séries gardées
    if motif == 'charniere':
        reps = min(reps, CHARNIERE_MAX)
    return {'exercise_slug': slug, 'motif': motif, 'role': role, 'series': n, 'reps': reps,
            'prioritaire': prio_ex, 'menage': menage, 'barre_fixe': slug in BARRE_FIXE}


def generer(cat, p):
    """p : jours, objectif, phase, materiel, priorites, menager, ecartes, faits ({slug: séances sur 12 semaines})."""
    faits = p.get('faits') or {}
    ok = _ok(cat, p.get('materiel'), faits)
    gabarit = GABARITS[max(2, min(6, p['jours']))]
    # Les principaux de la semaine d'abord (ils prennent la barre), puis les secondaires, puis le reste ; un exercice
    # n'est pris qu'une fois dans la semaine tant qu'il y a le choix.
    pris, choix = set(), {}
    places = [(r, j, m, ro) for r, (_, slots) in enumerate(gabarit) for j, (m, ro) in enumerate(slots)]
    for r, j, motif, role in sorted(places, key=lambda t: ('PSIT'.index(t[3]), t[0], t[1])):
        s = _choisir(motif, ok, p.get('ecartes', ()), pris, p.get('menager', ()), faits, p.get('materiel'))
        if s:
            choix[(r, j)] = s
            pris.add(s)
    routines = []
    for r, (nom, slots) in enumerate(gabarit):
        ex = [_ligne(cat, choix[(r, j)], m, ro, p) for j, (m, ro) in enumerate(slots) if (r, j) in choix]
        ex.sort(key=lambda x: (not x['prioritaire'], 'PSIT'.index(x['role'])))   # stable : l'exercice prioritaire d'abord
        routines.append({'nom': nom, 'exercices': ex})
    return routines


def ne_veux_pas(cat, routines, p, r, k):
    """« Je n'en veux pas » : SEULE la place touchée change. Le suivant du même motif (sinon le voisin, sinon un déjà
    pris), en évitant ce qui est déjà dans CETTE séance ; les séries restent celles de la place (la personne a pu les
    changer) ; l'exercice rejoint les écartés. Rend (routines, écartés)."""
    vieux = routines[r]['exercices'][k]
    ecartes = tuple(p.get('ecartes', ())) + (vieux['exercise_slug'],)
    faits = p.get('faits') or {}
    pris = {x['exercise_slug'] for x in routines[r]['exercices']}
    s = _choisir(vieux['motif'], _ok(cat, p.get('materiel'), faits), ecartes, pris, p.get('menager', ()), faits, p.get('materiel'))
    nouveau = [dict(rt, exercices=[dict(x) for x in rt['exercices']]) for rt in routines]
    if s is None:
        del nouveau[r]['exercices'][k]                    # rien au catalogue : la place disparaît
    else:
        ligne = _ligne(cat, s, vieux['motif'], vieux['role'], dict(p, ecartes=ecartes))
        ligne['series'] = vieux['series']
        nouveau[r]['exercices'][k] = ligne
    return nouveau, ecartes


def pourquoi(cat, routine):
    """La ligne « pourquoi » : séries par zone du premier muscle principal de chaque exercice, la plus grosse d'abord
    (à égalité, l'ordre du radar) — « Jambes 16 · Tronc 2 séries »."""
    g = {}
    for x in routine['exercices']:
        z = ZONE_DE.get(cat[x['exercise_slug']][1][0])
        g[z] = g.get(z, 0) + x['series']
    ordre = [z for z, _, _ in ZONES]
    return ' · '.join(f"{LIBELLE_ZONE[z]} {n}" for z, n in sorted(g.items(), key=lambda t: (-t[1], ordre.index(t[0])))) + ' séries'


def carte_cycles(objectif, jours_depuis_creation, seances_du_dossier, est_programme, carnet, deja_vue):
    """La carte « passer en cycles » (question 4) : Force ou Les deux, 21 jours après la création du dossier et au
    moins 6 séances faites depuis ses routines, une seule fois, ni en carnet, ni si le dossier est déjà un programme."""
    return (objectif in ('force', 'les_deux') and jours_depuis_creation >= 21 and seances_du_dossier >= 6
            and not est_programme and not carnet and not deja_vue)
