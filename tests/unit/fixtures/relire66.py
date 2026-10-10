#!/usr/bin/env python3
"""relire66.py — « Le coach relit ta semaine » (QUESTIONNAIRE-COACH-V2 §5 ter), référence de 66A. Claude.ai, 10/10/2026.

UNE fonction pure : `relire_semaine(entree) -> sortie`. Elle ne calcule AUCUN fait : elle lit
  · `volume`  : le fait du coach par muscle (MOTEUR §14.6 : `Moteur.placeDeVolume` sur `Semaine.semainesDeVolume`),
                `{ muscle: { moyenne, seuil, max, fenetres } | None }` ;
  · `barres`  : le fait des barres (`faits.barresDuBilan`, §5 ter.2), `{ slug: { record, recent, semaines, lourdes,
                variantes } }` ;
  · `routines`: les routines du dossier en cours, telles qu'en base (structure seulement) ;
  · `catalogue`, `profil`, `priorites`, `aujourdhui`.
Les poids d'un muscle (1 / ½ / ¼) sont ceux de `Semaine.musclesPonderes` (REGLE-VOLUME §1 bis).

Usage : python3 -I relire66.py cas-66-relire.json            → rejoue les cas
        python3 -I relire66.py cas-66-relire.json --ecrire   → régénère les attendus (changement de règle décidé)
"""
import json, math, sys, datetime as dt

# ── Les tables (une seule fois) ───────────────────────────────────────────────────────────────────────────────────
BARRES = [('squat_barre', 'Squat'), ('developpe_couche_barre', 'Couché'), ('souleve_de_terre_barre', 'Soulevé'),
          ('developpe_militaire_barre', 'Militaire')]
# Squat ÷ couché : le bas des moyennes de compétition par sexe (moyennes IPF débutants ; van den Hoek et al. 2024,
# J Sci Med Sport, 809 986 compétitions). Le repère affiché : la fourchette débutants → élite.
PRIORITES_MAX = 3                  # Profil.PRIORITES_MAX : au-delà, la base refuse (profiles_priorites_max3)
RATIO_SQUAT_COUCHE = {'homme': 1.2, 'femme': 1.6}
REPERE_SQUAT_COUCHE = {'homme': '1,2 à 1,5', 'femme': '1,6 à 1,7'}
GENS = {'homme': 'hommes', 'femme': 'femmes'}
DISCIPLINES_RATIO = ('force', 'les_deux')
JOURS_PLAT = 365                  # « pas encore dépassé » : un record d'au moins 12 mois…
JOURS_EXPOSITION = 182            # … sur une barre travaillée dans les 26 dernières semaines
SECHE_DEPASSEMENT = 1.3           # en sèche, un muscle à plus de 1,3 × son plus haut volume (N3)
PAR_SEANCE = 11.0                 # ~11 séries fractionnaires d'un muscle par séance (Remmert, Pelland 2025)
PEU_TRAVAILLE = 2.0               # Muscle / Forme : un muscle sous 2 séries par semaine, même à son plus haut
MUSCLES_SUIVIS = ['pectoraux', 'grand_dorsal', 'deltoide_lateral', 'deltoide_posterieur', 'biceps', 'triceps',
                  'quadriceps', 'ischio_jambiers', 'fessiers', 'abdominaux']
TIRAGE = {'grand_dorsal', 'haut_du_dos'}
POIDS = {'prim': 1.0, 'sec': 0.5, 'stab': 0.25}
MUSCLES = ['pectoraux', 'grand_dorsal', 'haut_du_dos', 'trapezes', 'bas_du_dos', 'deltoide_anterieur',
           'deltoide_lateral', 'deltoide_posterieur', 'biceps', 'triceps', 'avant_bras', 'quadriceps',
           'ischio_jambiers', 'fessiers', 'mollets', 'adducteurs', 'abducteurs', 'abdominaux']
LIBELLES = {'abdominaux': 'Abdominaux', 'abducteurs': 'Abducteurs', 'adducteurs': 'Adducteurs',
            'avant_bras': 'Avant-bras', 'bas_du_dos': 'Bas du dos', 'biceps': 'Biceps',
            'deltoide_anterieur': 'Deltoïde antérieur', 'deltoide_lateral': 'Deltoïde latéral',
            'deltoide_posterieur': 'Deltoïde postérieur', 'fessiers': 'Fessiers', 'grand_dorsal': 'Grand dorsal',
            'haut_du_dos': 'Haut du dos', 'ischio_jambiers': 'Ischio-jambiers', 'mollets': 'Mollets',
            'pectoraux': 'Pectoraux', 'quadriceps': 'Quadriceps', 'trapezes': 'Trapèzes', 'triceps': 'Triceps'}
SINGULIERS = ['bas_du_dos', 'haut_du_dos', 'grand_dorsal', 'deltoide_anterieur', 'deltoide_lateral',
              'deltoide_posterieur']
MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre',
              'novembre', 'décembre']
JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']


# ── Petits outils (tous ont leur pareil en JS, nommé dans la spec) ────────────────────────────────────────────────
def arrondi(x, n=1):                       # Modele.arrondi : .5 vers le haut, après un premier arrondi à 1e-6
    f = 10 ** n
    y = math.floor(x * f * 1e6 + 0.5) / 1e6
    return (-math.floor(-y + 0.5) if y < 0 else math.floor(y + 0.5)) / f

def nombre(x, n):                           # Modele.nombreTexte(x, n) : « 6,4 », « 14 », « 1,04 »
    v = arrondi(x, n)
    t = str(int(v)) if v == int(v) else repr(v)
    return t.replace('.', ',')

INSECABLE = '\u00a0'

def charge_fois(kg, reps):                  # Modele.chargeFois : « 130 kg × 4 »
    return nombre(kg, 2) + INSECABLE + 'kg' + INSECABLE + '\u00d7' + INSECABLE + nombre(reps, 2)

def ponderes(fiche):                        # Semaine.musclesPonderes : principaux, secondaires, stabilisateurs
    vus, out = set(), []
    for cle, liste in (('prim', 'muscles_primaires'), ('sec', 'muscles_secondaires'), ('stab', 'muscles_stabilisateurs')):
        for m in (fiche or {}).get(liste) or []:
            if m not in vus:
                vus.add(m); out.append((m, POIDS[cle]))
    return out

def poly(fiche):                            # Moteur.estPolyarticulaire : au moins 3 muscles dans les trois listes
    f = fiche or {}
    return sum(len(f.get(k) or []) for k in ('muscles_primaires', 'muscles_secondaires', 'muscles_stabilisateurs')) >= 3

def sortie(fiche):                          # Modele.estExerciceSortie(f) && !Semaine.porteDuVolume(f) (le cardio du jeu)
    f = fiche or {}
    return (f.get('charge') == 'aucune' and f.get('mesure') in ('temps', 'distance_temps')
            and not (f.get('muscles_primaires') or []))

def tronc(fiche):
    return (fiche or {}).get('muscles_primaires') == ['abdominaux']

def pl(n):                                  # 0 et 1 au singulier
    return 's' if n >= 2 else ''

def jour(iso):
    return dt.date.fromisoformat(iso[:10])

def quand(iso, aujourdhui):                 # Modele.quand : « aujourd'hui », « lundi » (1 à 6 jours), « le 14 sept. »
    d, a = jour(iso), jour(aujourdhui)
    if (a - d).days == 0:
        return 'aujourd\'hui'
    if 1 <= (a - d).days <= 6:
        return JOURS[d.weekday()]
    return 'le %d%s%s' % (d.day, INSECABLE, MOIS_COURTS[d.month - 1])

def mois(iso):                              # Modele.moisAnnee : « avril 2026 »
    d = jour(iso)
    return '%s %d' % (MOIS_LONGS[d.month - 1], d.year)

def mots(muscles):                          # Moteur.motsDesMuscles
    l = [(('ton ' if m in SINGULIERS else 'tes ') + LIBELLES[m][0].lower() + LIBELLES[m][1:], m in SINGULIERS)
         for m in muscles]
    texte = (', '.join(x for x, _ in l[:-1]) + ' et ' + l[-1][0]) if len(l) > 1 else l[0][0]
    return texte[0].upper() + texte[1:], len(l) > 1 or not l[0][1]

def series_travail(x):                     # Modele.estTravail : un type absent vaut « travail » ; seul « travail » compte
    return sum(1 for s in x.get('series') or [] if (s.get('type_serie') or 'travail') == 'travail')

def famille(slug, catalogue):               # la barre et ses variantes à la barre : même mouvement, équipement barre
    f = catalogue.get(slug) or {}
    for b, _ in BARRES:
        fb = catalogue.get(b) or {}
        if slug == b or (f.get('mouvement') and f.get('mouvement') == fb.get('mouvement') and f.get('equipement') == 'barre'):
            return b
    return None


# ── §5 ter.3 — Ton historique ─────────────────────────────────────────────────────────────────────────────────────
def historique(e):
    cat, barres, prof, auj = e['catalogue'], e.get('barres') or {}, e.get('profil') or {}, e['aujourdhui']
    lignes = []
    presentes = [(s, n) for s, n in BARRES if (barres.get(s) or {}).get('record')]
    plus_lourd = max([barres[s]['record']['charge'] for s, _ in presentes] or [0])
    for s, nom in presentes:
        b = barres[s]
        r = b['record']
        recent = b.get('recent')
        travaillee = (b.get('semaines') or 0) > 0
        plat = travaillee and (jour(auj) - jour(r['date'])).days >= JOURS_PLAT
        detail = []
        detail.append(('%s, pas encore dépassé' if plat else '%s') % mois(r['date']))
        if recent:
            detail.append('%s %s' % (charge_fois(recent['charge'], recent['reps']), quand(recent['date'], auj)))
        if travaillee:
            expo = '%d semaine%s sur 26' % (b['semaines'], pl(b['semaines']))
            if b.get('lourdes'):
                expo += ', %d série%s lourde%s' % (b['lourdes'], pl(b['lourdes']), pl(b['lourdes']))
            if b.get('variantes'):
                expo += ' (+ %d en variante)' % b['variantes']
            detail.append(expo)
        lignes.append({'slug': s, 'nom': nom, 'record': r['charge'], 'detail': ' · '.join(detail),
                       'jauge': arrondi(r['charge'] / plus_lourd, 2), 'retard': False})
    sortie_h = {'barres': lignes, 'ratio': None, 'peu_travailles': None}
    # La barre en retard (Force, Les deux) : squat ÷ couché sous le repère de son sexe.
    sq, co = barres.get('squat_barre') or {}, barres.get('developpe_couche_barre') or {}
    sexe = prof.get('sexe')
    if (prof.get('objectif') in DISCIPLINES_RATIO and sexe in RATIO_SQUAT_COUCHE and sq.get('record') and co.get('record')
            and sq.get('semaines') and co.get('semaines')):
        ratio = sq['record']['charge'] / co['record']['charge']
        if ratio < RATIO_SQUAT_COUCHE[sexe]:
            for l in lignes:
                if l['slug'] == 'squat_barre':
                    l['retard'] = True
            deja = 'squat_barre' in (e.get('priorites') or [])
            pleines = not deja and len(e.get('priorites') or []) >= PRIORITES_MAX
            gris = ('Ces repères viennent de compétiteurs, et ta morphologie peut jouer. Ce qu\'on voit chez toi : '
                    'le couché %d semaines sur 26, le squat %d.' % (co['semaines'], sq['semaines']))
            sortie_h['ratio'] = {
                'phrase': 'Ton squat vaut %s fois ton couché. Chez les %s qui font de la force, le squat vaut %s fois '
                          'le couché.' % (nombre(ratio, 2), GENS[sexe], REPERE_SQUAT_COUCHE[sexe]),
                'gris': gris + (' C\'est déjà ta priorité.' if deja else
                                (' Tes trois priorités sont déjà prises : tu peux en changer dans ton profil.' if pleines else '')),
                'proposition': None if (deja or pleines) else proposition_priorite(e)}
    # Muscle, Forme ou sans réponse : le retard se lit par muscle, pas par barre.
    if prof.get('objectif') not in DISCIPLINES_RATIO:
        vol = e.get('volume') or {}
        peu = [m for m in MUSCLES_SUIVIS if vol.get(m) and vol[m]['max'] < PEU_TRAVAILLE]
        if peu:
            t, plur = mots(peu)
            sortie_h['peu_travailles'] = '%s %s presque jamais travaillé%s : moins de 2 séries par semaine, même à ton plus haut.' % (
                t, 'sont' if plur else 'est', 's' if plur else '')
    return sortie_h


def proposition_priorite(e):
    """« Faire du squat ta priorité ? » — et, dans chaque routine où le squat (ou une variante à la barre) n'est pas
    le premier exercice qui porte du volume, il passe en premier (D10 : le prioritaire d'abord)."""
    cat = e['catalogue']
    deplacements = []
    for r in e['routines']:
        ex = [x for x in r['exercices'] if not sortie(cat.get(x['exercise_slug']))]
        k = next((i for i, x in enumerate(ex) if famille(x['exercise_slug'], cat) == 'squat_barre'), None)
        if k is not None and k > 0:
            deplacements.append({'routine_id': r['id'], 'exercise_slug': ex[k]['exercise_slug'],
                                 'avant': ex[0]['exercise_slug']})
    phrase = 'Faire du squat ta priorité ?'
    if deplacements:
        phrase += ' Il passe en premier dans ses séances.'
    return {'type': 'priorite', 'slug': 'squat_barre', 'phrase': phrase, 'deplacements': deplacements,
            'oui': 'En faire ma priorité', 'non': 'Non merci'}


# ── §5 ter.4 — Ta semaine ─────────────────────────────────────────────────────────────────────────────────────────
def semaine(e):
    cat, prof = e['catalogue'], e.get('profil') or {}
    routines = [{'id': r['id'], 'nom': r['nom'],
                 'exercices': [{'exercise_slug': x['exercise_slug'], 'n': series_travail(x),
                                'groupe': x.get('groupe_superset')} for x in r['exercices']]}
                for r in e['routines']]
    def vol(rs):
        v = {}
        for r in rs:
            for x in r['exercices']:
                for m, p in ponderes(cat.get(x['exercise_slug'])):
                    v[m] = v.get(m, 0) + p * x['n']
        return v
    def vol_routine(r):
        return vol([r])
    total = sum(x['n'] for r in routines for x in r['exercices'] if not sortie(cat.get(x['exercise_slug'])))
    verifs, constats = [], []
    # Le lourd en premier : dans chaque routine, la première barre (ou variante à la barre) avant toute isolation.
    barre_quelque_part = False
    lourd_ok = True
    for r in routines:
        ex = [x for x in r['exercices'] if not sortie(cat.get(x['exercise_slug'])) and not tronc(cat.get(x['exercise_slug']))]
        k = next((i for i, x in enumerate(ex) if famille(x['exercise_slug'], cat)), None)
        if k is None:
            continue
        barre_quelque_part = True
        avant = [x for x in ex[:k] if not poly(cat.get(x['exercise_slug']))]
        if avant:
            lourd_ok = False
            constats.append('Dans « %s », une isolation passe avant la barre.' % r['nom'])
    # Le tronc à la fin.
    tronc_present, tronc_ok = False, True
    for r in routines:
        ex = [x for x in r['exercices'] if not sortie(cat.get(x['exercise_slug']))]
        ks = [i for i, x in enumerate(ex) if tronc(cat.get(x['exercise_slug']))]
        if not ks:
            continue
        tronc_present = True
        if min(ks) < len(ex) - len(ks):
            tronc_ok = False
    if barre_quelque_part and lourd_ok and tronc_present and tronc_ok:
        verifs.append('le lourd en premier, le tronc à la fin')
    elif barre_quelque_part and lourd_ok:
        verifs.append('le lourd en premier')
    elif tronc_present and tronc_ok:
        verifs.append('le tronc à la fin')
    # Les supersets.
    paires = sum(len({x['groupe'] for x in r['exercices'] if x['groupe'] is not None}) for r in routines)
    if paires:
        verifs.append('%d superset%s dans ta semaine' % (paires, pl(paires)))
    # Par séance (D13).
    pire, ou, quel = 0.0, None, None
    for r in routines:
        for m, x in vol_routine(r).items():
            if x > pire + 1e-9:
                pire, ou, quel = x, r['nom'], m
    if pire > 0:
        if pire <= PAR_SEANCE + 1e-9:
            verifs.append('au plus %s séries d\'un muscle par séance' % nombre(pire, 1))
        else:
            constats.append('%s : %s séries dans « %s ». Au-delà d\'environ 11, une série de plus rapporte peu.' % (
                LIBELLES[quel], nombre(pire, 1), ou))
    # Tirage et poussée, en séries directes.
    tirage = sum(x['n'] for r in routines for x in r['exercices']
                 if set((cat.get(x['exercise_slug']) or {}).get('muscles_primaires') or []) & TIRAGE)
    pousse = sum(x['n'] for r in routines for x in r['exercices']
                 if 'pectoraux' in ((cat.get(x['exercise_slug']) or {}).get('muscles_primaires') or [])
                 or (famille(x['exercise_slug'], cat) == 'developpe_militaire_barre'))
    if tirage or pousse:
        verifs.append('%d série%s de tirage pour %d de poussée' % (tirage, pl(tirage), pousse))
    # En sèche : un muscle nettement au-dessus de son plus haut volume → retirer des séries d'isolation (N3).
    propositions = []
    if prof.get('phase') == 'seche':
        volume = e.get('volume') or {}
        for m in MUSCLES:
            f = volume.get(m)
            v = vol(routines)
            if not f or v.get(m, 0) <= SECHE_DEPASSEMENT * f['max'] + 1e-9:
                continue
            avant_v = v.get(m, 0)
            lignes = {}
            while vol(routines).get(m, 0) > f['max'] + 1e-9:
                cand = [(x['n'], -ri, -xi, r, x) for ri, r in enumerate(routines) for xi, x in enumerate(r['exercices'])
                        if m in ((cat.get(x['exercise_slug']) or {}).get('muscles_primaires') or [])
                        and not poly(cat.get(x['exercise_slug'])) and x['n'] >= 2]
                if not cand:
                    break
                _, _, _, r, x = max(cand, key=lambda t: t[:3])
                cle = (r['id'], x['exercise_slug'])
                lignes.setdefault(cle, {'routine_id': r['id'], 'routine': r['nom'], 'exercise_slug': x['exercise_slug'],
                                        'de': x['n'], 'a': None})
                x['n'] -= 1
                lignes[cle]['a'] = x['n']
            if lignes:
                t, plur = mots([m])
                retirees = sum(l['de'] - l['a'] for l in lignes.values())
                propositions.append({
                    'type': 'retirer', 'muscle': m,
                    'phrase': 'En sèche, %s %s ton plus haut volume habituel : %s séries par semaine pour %s.' % (
                        t[0].lower() + t[1:], 'dépassent' if plur else 'dépasse', nombre(avant_v, 1), nombre(f['max'], 1)),
                    'question': 'Retirer %d série%s ? Tes barres ne bougent pas.' % (retirees, pl(retirees)),
                    'lignes': sorted(lignes.values(), key=lambda l: ([r['id'] for r in routines].index(l['routine_id']),
                                                                    l['exercise_slug'])),
                    'oui': 'Retirer ces séries', 'non': 'Non merci'})
    return {'seances': len(routines), 'series': total, 'verifs': verifs, 'constats': constats,
            'propositions': propositions}


def relire_semaine(e):
    return {'historique': historique(e), 'semaine': semaine(e)}


# ── Les invariants de la relecture (R1 à R4) ──────────────────────────────────────────────────────────────────────
def verifier(e, s):
    fautes = []
    for p in s['semaine']['propositions']:
        if p['type'] == 'retirer':
            for l in p['lignes']:
                if not (l['a'] < l['de'] and l['a'] >= 1):                                          # R1
                    fautes.append('R1 une proposition de sèche ajoute ou vide un exercice')
            if (e.get('profil') or {}).get('phase') != 'seche':                                     # R2
                fautes.append('R2 retrait hors sèche')
        if not p.get('oui') or not p.get('non'):                                                    # R3
            fautes.append('R3 une proposition sans « oui » ni « non »')
    r = s['historique']['ratio']
    q = (r or {}).get('proposition')
    if q and (not q.get('oui') or not q.get('non')):                                                # R3, la priorité aussi
        fautes.append('R3 une proposition sans « oui » ni « non »')
    if r and ((e.get('profil') or {}).get('objectif') not in DISCIPLINES_RATIO):                    # R4
        fautes.append('R4 un repère de ratio hors Force / Les deux')
    return fautes


def main():
    chemin = sys.argv[1]
    data = json.load(open(chemin, encoding='utf-8'))
    ecart = 0
    for cas in data['cas']:
        e = dict(cas['entree']); e['catalogue'] = data['catalogue']
        obtenu = relire_semaine(json.loads(json.dumps(e)))
        f = verifier(e, obtenu)
        if f:
            print('INVARIANT', cas['nom'], f); ecart += 1
        if '--ecrire' in sys.argv:
            cas['attendu'] = obtenu
        elif json.dumps(obtenu, sort_keys=True, ensure_ascii=False) != json.dumps(cas['attendu'], sort_keys=True, ensure_ascii=False):
            ecart += 1; print('ÉCART', cas['nom'])
    if '--ecrire' in sys.argv:
        texte = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
        open(chemin, 'w', encoding='utf-8').write(texte.replace('{"nom":', '\n{"nom":') + '\n')
        print('attendus régénérés :', len(data['cas']), 'cas')
    else:
        print('%d cas, %d écart(s)' % (len(data['cas']), ecart))
        sys.exit(1 if ecart else 0)


if __name__ == '__main__':
    main()
