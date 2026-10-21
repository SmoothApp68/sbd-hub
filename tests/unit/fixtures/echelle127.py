"""Référence Python de l'échelle des variantes (chantier B, prompt 127 ; MOTEUR §9.17 bis, ECRAN-SAISIE §7 quater.6).
Fonctions pures. Les cas de test du JS (cas-127.json) sortent d'ici. La consigne et la zone sont celles du moteur
(entrées des cas) : rien n'est recalculé ici que la marche suivante, la carte et la vue."""
import json

SEUIL_LEST = 8            # au poids du corps, la marche au-dessus (le lest) n'arrive qu'à partir de 8 reps (maquette du 17/10)
SERIES_AJOUT = 2          # « Je te propose d'en faire 2 séries avant » (maquette du 17/10, écran 3)
JOURS_DEJA_FAIT = 28      # la marche proposée déjà pratiquée dans les 28 derniers jours : pas de carte

def index_de(echelles):
    return {e['slug']: e for e in echelles}

def strict_de(index, echelle):
    """La marche stricte d'une échelle : l'exercice dont le slug porte le nom de l'échelle."""
    e = index.get(echelle)
    return e if e and e['echelle'] == echelle else None

def rang_au_dessus(index, e):
    """Les exercices du premier rang strictement au-dessus de e, dans l'ordre du slug."""
    plus = sorted({x['rang'] for x in index.values() if x['echelle'] == e['echelle'] and x['rang'] > e['rang']})
    if not plus: return []
    return sorted([x for x in index.values() if x['echelle'] == e['echelle'] and x['rang'] == plus[0]], key=lambda x: x['slug'])

def marche_suivante(index, slug):
    """La marche suivante d'un exercice d'échelle : {'type', 'cible': [slugs], 'proposable': bool} ou None.
    - depuis une aide (charge = assistance) : la marche stricte (« sans aide »), qui s'AJOUTE ;
    - depuis la stricte : sa version lestée si elle est au rang au-dessus (la carte du lest, §9.17, qui REMPLACE) ;
    - sinon : le rang au-dessus, qui s'AJOUTE.
    Une habileté n'est jamais proposée par le coach (visible seulement)."""
    e = index.get(slug)
    if not e or e.get('echelle') is None: return None
    s = strict_de(index, e['echelle'])
    if e['charge'] == 'assistance' and s and s['rang'] > e['rang']:
        cible = [s]; t = 'sans_aide'
    else:
        cible = rang_au_dessus(index, e)
        if not cible: return None
        lest = [x for x in cible if x['charge'] == 'ajoutee']
        if s and e['slug'] == s['slug'] and lest:
            cible = lest; t = 'lest'
        else:
            t = 'marche'
    force = [x for x in cible if x['nature'] == 'force']
    if not force: return {'type': 'habilete', 'cible': [x['slug'] for x in cible], 'proposable': False}
    return {'type': t, 'cible': [x['slug'] for x in force], 'proposable': t != 'lest'}

def seuil_carte(type_, haut):
    """Le niveau à tenir deux séances de suite : le haut de la zone ; pour le lest, au moins 8 reps."""
    return max(haut, SEUIL_LEST) if type_ == 'lest' else haut

def carte_marche(index, slug, zone_haut, seances, reponse, cible_faite_le, aujourd_hui, coach_actif=True):
    """La carte « marche suivante » (hors lest : la carte du lest garde son chemin, avec le seuil de 8).
    `seances` : les deux dernières séances non neutres de l'exercice, la plus récente en dernier, chacune
    {'niveau': int, 'charge': float} (charge : 0 au poids du corps, négative pour une aide) ;
    `reponse` : None ou {'r': 'oui'|'non', 'aide': charge au moment du « Pas maintenant »} ;
    `cible_faite_le` : date ISO de la dernière séance de la marche proposée, ou None ; `aujourd_hui` : date ISO.
    Rend la carte ({titre, detail, oui, non, cible}) ou None."""
    m = marche_suivante(index, slug)
    if not coach_actif or not m or not m['proposable'] or len(seances) < 2: return None
    a, b = seances[-2], seances[-1]
    haut = seuil_carte(m['type'], zone_haut)
    if a['niveau'] < haut or b['niveau'] < haut: return None
    aide = index[slug]['charge'] == 'assistance'
    if aide and abs(a['charge'] - b['charge']) > 1e-9: return None          # deux séances à la même aide
    if reponse:
        if reponse['r'] == 'oui': return None
        if not aide: return None                                            # « Pas maintenant » : une fois (hors aide)
        if not (b['charge'] > reponse['aide'] + 1e-9): return None          # reposée seulement à une aide plus légère (21/10)
    if cible_faite_le is not None and _jours(cible_faite_le, aujourd_hui) <= JOURS_DEJA_FAIT: return None
    cible = index[m['cible'][0]]
    tenue = f"{fr_aide(b['charge'])} × {b['niveau']}" if aide else f"{b['niveau']} reps"
    return {'titre': f"{tenue} sur toutes tes séries, deux séances de suite.",
            'detail': f"La marche au-dessus : {cible['nom']}. Je te propose d'en faire {SERIES_AJOUT} séries avant, autant de reps que tu peux.",
            'oui': f"Ajouter {cible['nom']}", 'non': "Pas maintenant", 'cible': cible['slug']}

def _jours(d1, d2):
    import datetime as dt
    return (dt.date.fromisoformat(d2[:10]) - dt.date.fromisoformat(d1[:10])).days

def fr_nombre(v):
    s = f"{abs(v):.2f}".rstrip('0').rstrip('.')
    return s.replace('.', ',')
def fr_aide(charge): return f"Aide {fr_nombre(charge)} kg"

def vue_echelle(index, slug, faites, zones_haut, coach_actif=True):
    """La carte « Ton échelle » de la page d'un exercice d'échelle (maquette validée le 21/10).
    `faites` : {slug: {'meilleur': texte formaté par l'app, 'quand': texte}} des exercices avec au moins une série de travail,
    et 'derniere' (date ISO) pour départager un rang partagé ; `zones_haut` : {slug: haut de la zone} quand l'app la connaît.
    Rend {'marches': [{'rang', 'exercices': [{slug, nom, habilete, fait, meilleur, quand}], 'tienne', 'suivante', 'vue'}]
    du plus difficile au plus facile, 'phrase'}."""
    e = index.get(slug)
    if not e or e.get('echelle') is None: return None
    E = e['echelle']
    rangs = sorted({x['rang'] for x in index.values() if x['echelle'] == E}, reverse=True)
    faits_E = [x for x in index.values() if x['echelle'] == E and x['slug'] in faites]
    tienne = max((x['rang'] for x in faits_E), default=None)
    suivante = None; phrase = None
    if tienne is not None:
        au = [x for x in faits_E if x['rang'] == tienne]
        depart = max(au, key=lambda x: (faites[x['slug']].get('derniere') or '', x['slug']))
        m = marche_suivante(index, depart['slug'])
        if m:
            suivante = index[m['cible'][0]]['rang']
            if coach_actif: phrase = phrase_suivante(index, depart, m, zones_haut.get(depart['slug']), faites)
    marches = []
    for r in rangs:
        ex = sorted([x for x in index.values() if x['echelle'] == E and x['rang'] == r], key=lambda x: x['slug'])
        marches.append({'rang': r, 'tienne': r == tienne, 'suivante': r == suivante, 'vue': r == e['rang'],
                        'exercices': [{'slug': x['slug'], 'nom': x['nom'], 'habilete': x['nature'] == 'habilete',
                                       'fait': x['slug'] in faites,
                                       'meilleur': faites.get(x['slug'], {}).get('meilleur'),
                                       'quand': faites.get(x['slug'], {}).get('quand')} for x in ex]})
    return {'echelle': E, 'marches': marches, 'phrase': phrase}

def phrase_suivante(index, depart, m, haut, faites):
    c = index[m['cible'][0]]
    if m['type'] == 'habilete':
        return f"La suivante : {c['nom']}. Une habileté : je ne te la propose pas, c'est toi qui choisis quand l'essayer. Tu peux l'ajouter à une séance comme n'importe quel exercice."
    if m['type'] == 'lest':
        n = seuil_carte('lest', haut or 0)
        meilleur = faites.get(depart['slug'], {}).get('meilleur')
        return f"La suivante : {c['nom']}. Je te la propose quand tu tiens {n} reps sur toutes tes séries, deux séances de suite." + (f" Ton meilleur : {meilleur}." if meilleur else "")
    quand = f"le haut de ta zone ({haut} reps)" if haut else "le haut de ta zone"
    return f"La suivante : {c['nom']}. Je te la propose quand tu tiens {quand} sur toutes tes séries, deux séances de suite. Elle s'ajoute : tu gardes {depart['nom']}."
