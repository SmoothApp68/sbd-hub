"""Référence Python de la recherche d'exercice (chantier 126, ECRAN-SAISIE §7 quindecies.11).
Une seule fonction de classement ; les cas de test du JS (cas-126.json) sortent d'ici."""
import json, re, unicodedata

def replier(t):
    """Minuscules, sans accents (les marques combinantes seules partent), et tout ce qui n'est ni lettre ni chiffre
    devient un espace — l'apostrophe typographique comprise (corrigé le 21/10 : `encode('ascii', 'ignore')` l'effaçait,
    « Haussement d’Épaules » donnait « haussement depaules »)."""
    t = ''.join(c for c in unicodedata.normalize('NFD', str(t or '')) if not unicodedata.combining(c)).lower()
    return re.sub(r'[^a-z0-9]+', ' ', t).strip()

def a_une_faute(a, b):
    """Au plus une opération : lettre en plus, en moins, changée, deux voisines inversées."""
    if a == b: return True
    la, lb = len(a), len(b)
    if abs(la - lb) > 1: return False
    if la == lb:
        d = [i for i in range(la) if a[i] != b[i]]
        if len(d) == 1: return True
        return len(d) == 2 and d[1] == d[0] + 1 and a[d[0]] == b[d[1]] and a[d[1]] == b[d[0]]
    if la > lb: a, b = b, a
    i = 0
    while i < len(a) and a[i] == b[i]: i += 1
    return a[i:] == b[i + 1:]

MIN_FAUTE = 5
def mot_trouve(m, mots):
    if any(w.startswith(m) for w in mots): return True
    if len(m) < MIN_FAUTE: return False
    return any(w[0] == m[0] and any(a_une_faute(m, w[:len(m) + d]) for d in (-1, 0, 1))
               for w in mots if len(w) >= MIN_FAUTE - 1)

class Index:
    def __init__(self, catalogue, alias):
        self.ex = {e['slug']: e for e in catalogue}
        self.textes = {s: [replier(e['nom'])] for s, e in self.ex.items()}
        self.bruts = {s: [e['nom']] for s, e in self.ex.items()}
        for a in sorted(alias, key=lambda a: a['alias']):
            if a['slug'] in self.textes:
                t = replier(a['alias'])
                if t and t not in self.textes[a['slug']]:
                    self.textes[a['slug']].append(t); self.bruts[a['slug']].append(a['alias'])

    def trouve(self, slug, mots):
        return any(all(mot_trouve(m, t.split()) for m in mots) for t in self.textes[slug])

    def commence(self, slug, mots):
        t = self.textes[slug]
        return 0 if t[0].startswith(mots[0]) else (1 if any(x.startswith(mots[0]) for x in t[1:]) else 2)

def hors_materiel(e, materiel):
    return materiel is not None and e.get('equipement') not in (None, 'aucun') and e['equipement'] not in materiel

def va(e, s, ctx):
    if s in ctx.get('freres', ()): return 0
    return 1 if set(e.get('mp') or []) & set(ctx.get('muscles', ())) else 2

def cle(index, s, mots, faits, ctx, materiel, ecartes):
    e = index.ex[s]; n = faits.get(s, 0)
    c = index.commence(s, mots) if mots else 0
    g = 0 if (n or e['nature'] == 'force') and not (not n and e.get('hors_salle')) else (2 if e.get('hors_salle') else 1)
    return (1 if s in ecartes else 0, 0 if c < 2 else 1, g, c, -n, va(e, s, ctx),
            1 if (not n and hors_materiel(e, materiel)) else 0, replier(e['nom']))

def chercher(index, requete, faits=None, ctx=None, materiel=None, ecartes=(), exclu=None, filtre=None, limite=30):
    faits = faits or {}; ctx = ctx or {}
    mots = replier(requete).split()
    l = [s for s in index.ex if s != exclu and (filtre is None or filtre(index.ex[s])) and (not mots or index.trouve(s, mots))]
    return sorted(l, key=lambda s: cle(index, s, mots, faits, ctx, materiel, ecartes))[:limite]

def memes_muscles(index, muscles, faits, materiel, ecartes, deja, exclu=None, n=5):
    l = [s for s, e in index.ex.items() if e['nature'] == 'force' and set(e.get('mp') or []) & set(muscles)
         and s not in deja and s != exclu and s not in ecartes and not (e.get('hors_salle') and not faits.get(s))]
    l.sort(key=lambda s: (-faits.get(s, 0), 1 if (not faits.get(s) and hors_materiel(index.ex[s], materiel)) else 0, replier(index.ex[s]['nom'])))
    return l[:n]

def propre(index, l, faits, ecartes, exclu=None):
    return [s for s in l if s in index.ex and s not in ecartes and s != exclu and not (index.ex[s].get('hors_salle') and not faits.get(s))]

def suggestions(index, contexte, faits=None, materiel=None, ecartes=()):
    """contexte : {'type': 'seance_routine'|'seance_libre'|'routine'|'remplacer', ...} → [(titre, [slugs])]."""
    faits = faits or {}; c = contexte; t = c['type']; out = []
    dans = list(c.get('dans', []))
    if t == 'seance_routine':
        souvent = propre(index, [s for s in c['souvent'] if s not in dans], faits, ecartes)[:5]   # déjà rangés : le plus fréquent d'abord
        out = [('Souvent avec cette séance', souvent)]
        mus = {m for s in dans for m in (index.ex[s].get('mp') or [])}
        out.append(('Pour les mêmes muscles', memes_muscles(index, mus, faits, materiel, ecartes, set(dans) | set(souvent))))
    elif t == 'seance_libre':
        rec = propre(index, [s for s in c['recents'] if s not in dans], faits, ecartes)[:5]
        plus = propre(index, [s for s in c['plus_faits_3_mois'] if s not in dans and s not in rec], faits, ecartes)[:5]
        out = [('Récents', rec), ('Les plus faits', plus)]
    elif t == 'routine':
        mus = {m for s in dans for m in (index.ex[s].get('mp') or [])}
        out = [('Pour les mêmes muscles', memes_muscles(index, mus, faits, materiel, ecartes, set(dans)))] if dans else []
    elif t == 'remplacer':
        x = c['remplace']; fr = propre(index, c['freres'], faits, ecartes, x)[:5]   # l'ordre de Seance.freresProposes
        mv = index.ex[x].get('mouvement')
        mus = memes_muscles(index, index.ex[x].get('mp') or [], faits, materiel, ecartes, set(fr) | set(dans), x, n=50)
        mus = [s for s in mus if not mv or index.ex[s].get('mouvement') != mv][:5]
        out = [('Le même mouvement', fr), ('Les mêmes muscles', mus)]
    return [(titre, l) for titre, l in out if l]

def plus_proches(index, nom_hevy, faits=None, limite=5):
    faits = faits or {}
    cible = {w for w in replier(nom_hevy).split() if len(w) >= 3}
    seuil = 1 if len(cible) <= 1 else 2
    r = []
    for s in index.ex:
        best = None
        for i, t in enumerate(index.textes[s]):
            mots = {w for w in t.split() if len(w) >= 3}
            k = len(cible & mots)
            note = (k, k / len(cible | mots) if mots else 0, -i)
            if best is None or note > best[0]: best = (note, i)
        (k, prox, _), i = best
        if k >= seuil: r.append((s, index.bruts[s][i] if i > 0 else None, k, prox))
    r.sort(key=lambda x: (-x[2], -x[3], -faits.get(x[0], 0), replier(index.ex[x[0]]['nom'])))
    return [{'slug': s, 'comme': comme, 'communs': k} for s, comme, k, _ in r[:limite]]
