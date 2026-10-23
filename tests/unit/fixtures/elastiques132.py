"""Référence Python des élastiques par leur nom (chantier B3, prompt 132 ; MOTEUR §10 ter, ECRAN-SAISIE §3 ter.6,
ECRAN-PROFIL §2.4 sexies). Fonctions pures. Les cas du JS (cas-132.json) sortent d'ici.

Principe (décisions d'Aurélien du 21/10/2026) : une liste d'élastiques de Ma salle est une SALLE (§10 bis) dont les
crans sont des noms. Le coach ne lit que l'ORDRE de la liste (du plus fort au plus léger), jamais un chiffre. Pour le
moteur, chaque élastique reçoit une charge VIRTUELLE, ordonnée dans le sens où « monter » est plus dur :
- sur une AIDE (charge = assistance) : monter = un élastique plus léger ; la liste [Noir, Rouge, Vert] donne −3, −2, −1 ;
- en RÉSISTANCE (charge = elastique) : monter = un élastique plus fort ; la même liste donne 3, 2, 1.
La charge virtuelle n'est JAMAIS affichée, ni écrite en base (sets.charge_kg garde le kg déclaré d'une aide, sinon NULL),
ni dans le journal des records (la liste peut changer d'ordre ; un record est immuable)."""

def liste_de(exo, salle):
    """La liste de Ma salle qui va avec l'exercice : grand -> ma_salle.elastiques, mini -> ma_salle.mini_bandes."""
    salle = salle or {}
    t = exo.get('type_elastique')
    if t == 'grand': return [e['nom'] for e in (salle.get('elastiques') or [])]
    if t == 'mini': return [e['nom'] for e in (salle.get('mini_bandes') or [])]
    return []

def par_nom(exo, salle):
    """Vrai si l'exercice se note par le nom de l'élastique.
    - résistance (charge = elastique) : toujours, dès que sa liste a au moins un élastique ;
    - aide à l'élastique (charge = assistance, type_elastique non nul) : si ma_salle.elastiques_par_nom est vrai et la
      liste non vide ;
    - sinon (machine d'aide, tout le reste) : jamais."""
    if not liste_de(exo, salle): return False
    if exo.get('charge') == 'elastique': return True
    if exo.get('charge') == 'assistance' and exo.get('type_elastique'): return bool((salle or {}).get('elastiques_par_nom'))
    return False

def charges_virtuelles(exo, liste):
    n = len(liste)
    if exo.get('charge') == 'assistance': return {nom: i - n for i, nom in enumerate(liste)}
    return {nom: n - i for i, nom in enumerate(liste)}

def kg_de(salle, nom):
    for e in (salle or {}).get('elastiques') or []:
        if e['nom'] == nom: return e.get('kg')
    return None

def rattacher(exo, salle, charge_kg):
    """Une série d'aide notée en kg (sans nom) se rattache à l'élastique dont le kg déclaré est EXACTEMENT celui de l'aide.
    Sinon : None (la série reste en kg, neutre pour la consigne par nom). Jamais en résistance."""
    if exo.get('charge') != 'assistance' or charge_kg is None: return None
    for e in (salle or {}).get('elastiques') or []:
        if e.get('kg') is not None and abs(-float(charge_kg) - float(e['kg'])) < 1e-9: return e['nom']
    return None

def elastique_de_serie(exo, salle, serie):
    """Le nom de l'élastique d'une série, au sens du coach : son nom s'il est dans la liste ; le rattachement d'une aide en
    kg ; sinon None (neutre : un nom absent de la liste n'est jamais deviné)."""
    liste = liste_de(exo, salle)
    if serie.get('elastique') is not None:
        return serie['elastique'] if serie['elastique'] in liste else None
    return rattacher(exo, salle, serie.get('charge_kg'))

def charge_pour_le_moteur(exo, salle, serie):
    """La charge virtuelle que le moteur lit pour une série d'un exercice noté par nom ; None = série neutre."""
    nom = elastique_de_serie(exo, salle, serie)
    return None if nom is None else charges_virtuelles(exo, liste_de(exo, salle))[nom]

def salle_de_l_exercice(exo, salle):
    """La salle au sens du §10 bis : les charges proposables (virtuelles, croissantes) et leurs noms."""
    if not par_nom(exo, salle): return None
    cv = charges_virtuelles(exo, liste_de(exo, salle))
    charges = sorted(cv.values())
    return {'charges': charges, 'noms': {str(v): nom for nom, v in cv.items()}}

def cran(exo, salle, nom, sens):
    """L'élastique au cran au-dessus (sens = +1, plus dur) ou en dessous (sens = -1) ; None au bout de la liste."""
    cv = charges_virtuelles(exo, liste_de(exo, salle))
    if nom not in cv: return None
    cible = cv[nom] + sens
    for n, v in cv.items():
        if v == cible: return n
    return None

def ecrire_serie(exo, salle, nom, reps):
    """Ce qui part en base pour une série notée par nom : elastique = le nom ; charge_kg = −kg déclaré d'une aide, sinon NULL."""
    kg = kg_de(salle, nom) if exo.get('charge') == 'assistance' and exo.get('type_elastique') == 'grand' else None
    return {'elastique': nom, 'charge_kg': (-kg if kg is not None else None), 'reps': reps}

def affichage(serie):
    """Le formateur : « Noir × 12 », « Noir » sans reps ; une série sans nom garde l'affichage d'avant (None ici)."""
    if serie.get('elastique') is None: return None
    return serie['elastique'] + (f" × {serie['reps']}" if serie.get('reps') is not None else '')

def meilleur(exo, salle, series):
    """Le meilleur d'un exercice noté par nom : l'élastique le plus dur, puis le plus de reps ; séries neutres exclues."""
    best = None
    for s in series:
        v = charge_pour_le_moteur(exo, salle, s)
        if v is None or s.get('reps') is None: continue
        k = (v, s['reps'])
        if best is None or k > best[0]: best = (k, elastique_de_serie(exo, salle, s), s['reps'])
    return None if best is None else f"{best[1]} × {best[2]}"
