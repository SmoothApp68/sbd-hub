"""Référence du chantier 69 — lire un texte partagé depuis Hevy et un export CSV de Hevy.

Les règles de lecture du texte sont celles de l'import v1 (js/import.js, parseHevySetLine, parseHevyDate), constatées
sur les vraies séances ; la sortie est comparée, série par série, à ce que la base porte déjà pour les mêmes séances.
"""
import csv, io, json, re, sys, hashlib

MOIS = {'janv': 1, 'janvier': 1, 'fevr': 2, 'fevrier': 2, 'mars': 3, 'avr': 4, 'avril': 4, 'mai': 5, 'juin': 6,
        'juil': 7, 'juillet': 7, 'aout': 8, 'sept': 9, 'septembre': 9, 'oct': 10, 'octobre': 10, 'nov': 11,
        'novembre': 11, 'dec': 12, 'decembre': 12,
        # 118 (audit du 16/10, 03 #12) : les mois d'un export réglé en anglais.
        'jan': 1, 'january': 1, 'feb': 2, 'february': 2, 'mar': 3, 'march': 3, 'apr': 4, 'april': 4, 'may': 5,
        'jun': 6, 'june': 6, 'jul': 7, 'july': 7, 'aug': 8, 'august': 8, 'sep': 9, 'september': 9, 'october': 10,
        'november': 11, 'december': 12}
SANS = str.maketrans('àâäéèêëîïôöùûüçœ', 'aaaeeeeiioouuuco')


def norme(s):
    return s.strip().lower().translate(SANS)


def nombre(x):
    """Un nombre tel que la base le rend (trim_scale) : 52, 31.5, 24.8 ; None pour vide."""
    if x is None:
        return None
    x = round(float(x), 3)
    return int(x) if x == int(x) else x


# ── Le texte partagé ────────────────────────────────────────────────────────
RE_DATE = re.compile(r'^le\s+\w+,\s+([a-z]+)\.?\s+(\d{1,2}),\s+(\d{4})\s+a\s+(\d{1,2}):(\d{2})\s*(am|pm)$')
RE_SERIE = re.compile(r'^s[eé]rie\s+\d+\s*:\s*(.+)$', re.I)
RE_LIEN = re.compile(r'^https?://hevy\.com/workout/([A-Za-z0-9]+)')
TYPES_TEXTE = {'echauffement': 'echauffement', 'abandon': 'degressive', 'degressive': 'degressive',
               'drop': 'degressive', 'drop set': 'degressive', 'echec': 'echec'}


def date_texte(ligne):
    m = RE_DATE.match(norme(ligne))
    if not m:
        return None
    mois, j, a, h, mi, ap = m.groups()
    h = int(h)
    if ap == 'pm' and h < 12: h += 12
    if ap == 'am' and h == 12: h = 0
    return '%s-%02d-%02dT%02d:%s' % (a, MOIS[mois], int(j), h, mi)


def duree(s):
    t = 0
    for v, u in re.findall(r'(\d+)\s*(h|min|s)\b', s):
        t += int(v) * {'h': 3600, 'min': 60, 's': 1}[u]
    return t or None


def serie_texte(d):
    s = {'type_serie': 'travail', 'charge_kg': None, 'reps': None, 'duree_s': None, 'distance_m': None, 'rpe': None}
    m = re.search(r'\[([^\]]+)\]', d)
    if m:
        s['type_serie'] = TYPES_TEXTE.get(norme(m.group(1)), 'travail')
        d = d[:m.start()] + d[m.end():]
    m = re.search(r'@\s*([\d.,]+)\s*rpe', d, re.I)
    if m:
        s['rpe'] = nombre(m.group(1).replace(',', '.'))
        d = d[:m.start()] + d[m.end():]
    d = d.strip()
    m = re.match(r'^([\d.,]+)\s*km\s*-\s*(.+)$', d)
    if m:
        s['distance_m'] = nombre(float(m.group(1).replace(',', '.')) * 1000)
        s['duree_s'] = duree(m.group(2))
        return s
    # 118 (audit du 16/10, 03 #4) : un signe devant la charge se lit tel qu'il est écrit (« -20 kg » : une aide, en
    # négatif ; « +10 kg » : un lest) ; sans signe, rien ne change.
    m = re.match(r'^([+-]?)\s*([\d.,]+)\s*(kg|lbs)\s*[x×]\s*(\d+)$', d, re.I)
    if m:
        kg = float(m.group(2).replace(',', '.'))
        if m.group(3).lower() == 'lbs':
            kg = round(kg * 0.45359237, 1)
        if m.group(1) == '-':
            kg = -kg
        s['charge_kg'] = nombre(kg)
        s['reps'] = int(m.group(4))
        return s
    m = re.match(r'^(\d+)\s*r[eé]p[eé]titions?$', d, re.I)
    if m:
        s['reps'] = int(m.group(1))
        return s
    if re.match(r'^(\d+\s*(h|min|s)\s*)+$', d):
        s['duree_s'] = duree(d)
        return s
    raise ValueError('série illisible : ' + d)


def lire_texte(texte):
    seances, cur, exo, attend_date = [], None, None, False
    for brut in texte.split('\n'):
        l = brut.strip()
        if not l:
            continue
        if l.lower() == '@hevyapp':
            continue
        m = RE_LIEN.match(l)
        if m:
            if cur: cur['ref'] = 'hevy:' + m.group(1)
            cur, exo = None, None
            continue
        if cur is None:
            cur = {'titre': l, 'debut_local': None, 'fin_local': None, 'note': None, 'ref': None, 'exercices': []}
            seances.append(cur); exo = None; attend_date = True
            continue
        if attend_date:
            cur['debut_local'] = date_texte(l)
            if not cur['debut_local']: raise ValueError('date illisible : ' + l)
            attend_date = False
            continue
        m = RE_SERIE.match(l)
        if m:
            exo['series'].append(serie_texte(m.group(1)))
            continue
        if l.startswith('"') and l.endswith('"') and exo is not None and not exo['series']:
            exo['note'] = l[1:-1]
            continue
        exo = {'nom': l, 'note': None, 'groupe_superset': None, 'series': []}
        cur['exercices'].append(exo)
    return seances


# ── Le fichier CSV ──────────────────────────────────────────────────────────
TYPES_CSV = {'normal': 'travail', 'warmup': 'echauffement', 'dropset': 'degressive', 'failure': 'echec'}


def date_csv(s):
    # 118 (audit du 16/10, 03 #12) : aussi « 16 Jun 2026, 10:24 » et « Oct 2, 2026, 5:54 PM » (Hevy en anglais).
    t = norme(s)
    m = re.match(r'^(\d{1,2})\s+([^\s]+?)\.?\s+(\d{4}),\s+(\d{1,2}):(\d{2})\s*(am|pm)?$', t)
    if m:
        j, mois, a, h, mi, ap = m.groups()
    else:
        m = re.match(r'^([a-z]+)\.?\s+(\d{1,2}),\s+(\d{4}),\s+(\d{1,2}):(\d{2})\s*(am|pm)?$', t)
        if not m: raise ValueError('date illisible : ' + s)
        mois, j, a, h, mi, ap = m.groups()
    if mois not in MOIS: raise ValueError('date illisible : ' + s)
    h = int(h)
    if ap == 'pm' and h < 12: h += 12
    if ap == 'am' and h == 12: h = 0
    return '%s-%02d-%02dT%02d:%s' % (a, MOIS[mois], int(j), h, mi)


def vide(x):
    return None if x is None or x.strip() == '' else x.strip()


def lire_csv(texte):
    lignes = list(csv.DictReader(io.StringIO(texte.lstrip('﻿'))))
    seances, index = [], {}
    for x in lignes:
        cle = (x['title'], x['start_time'])
        if cle not in index:
            s = {'titre': x['title'].strip(), 'debut_local': date_csv(x['start_time']),
                 'fin_local': date_csv(x['end_time']) if vide(x['end_time']) else None,
                 'note': vide(x['description']), 'ref': None, 'exercices': []}
            s['ref'] = 'hevy:' + s['debut_local'] + ':00'
            index[cle] = s; seances.append(s)
        s = index[cle]
        ss = vide(x['superset_id'])
        exo = s['exercices'][-1] if s['exercices'] else None
        if exo is None or exo['nom'] != x['exercise_title'] or x['set_index'] == '0':
            exo = {'nom': x['exercise_title'], 'note': vide(x['exercise_notes']),
                   'groupe_superset': int(ss) if ss is not None else None, 'series': []}
            s['exercices'].append(exo)
        kg = vide(x.get('weight_kg', ''))
        if kg is None and vide(x.get('weight_lbs', '')):
            kg = round(float(x['weight_lbs']) * 0.45359237, 1)
        dist = vide(x['distance_km'])
        dur = vide(x['duration_seconds'])
        exo['series'].append({
            'type_serie': TYPES_CSV[x['set_type']],
            'charge_kg': nombre(kg),
            'reps': int(x['reps']) if vide(x['reps']) else None,
            'duree_s': int(float(dur)) if dur and float(dur) > 0 else None,
            'distance_m': nombre(float(dist) * 1000) if dist and float(dist) > 0 else None,
            'rpe': nombre(vide(x['rpe'])),
        })
    # Un superset d'un seul exercice n'en est pas un (ECRAN-SAISIE §5.9 ; v2_041, « supersets orphelins »).
    for s in seances:
        compte = {}
        for e in s['exercices']:
            if e['groupe_superset'] is not None:
                compte.setdefault(e['groupe_superset'], set()).add(e['nom'])
        for e in s['exercices']:
            if e['groupe_superset'] is not None and len(compte[e['groupe_superset']]) < 2:
                e['groupe_superset'] = None
    return seances


# ── La forme commune, et son empreinte ──────────────────────────────────────
def resoudre(seances, alias):
    for s in seances:
        for e in s['exercices']:
            e['exercise_slug'] = alias.get(e['nom'])
    return seances


def canon(s):
    out = []
    for e in s['exercices']:
        for x in e['series']:
            out.append('|'.join('' if v is None else str(v) for v in (
                e['exercise_slug'], x['type_serie'], x['charge_kg'], x['reps'], x['duree_s'], x['distance_m'],
                x['rpe'], e['note'], e['groupe_superset'])))
    return '\n'.join(out)


def empreinte(s):
    return hashlib.md5(canon(s).encode('utf-8')).hexdigest()


# ── L'anti-doublon ──────────────────────────────────────────────────────────
def verdict(s, base):
    """'deja_la' : même référence d'import, ou même minute de début (quelle que soit l'origine) ;
    'meme_seance' : commence pendant une séance de la personne (fin inconnue : 3 h au plus, MOTEUR §12.2 bis)
    ET partage au moins un exercice avec elle ; sinon 'nouvelle'."""
    from datetime import datetime, timedelta
    P = lambda x: datetime.fromisoformat(x.replace('Z', '+00:00'))
    d = P(s['debut']).replace(second=0)
    slugs = {e['exercise_slug'] for e in s['exercices']}
    for b in base:
        if b['source_ref'] == s['ref'] or P(b['debut']).replace(second=0) == d:
            return 'deja_la'
    for b in base:
        db = P(b['debut']); fb = P(b['fin']) if b['fin'] else db + timedelta(hours=3)
        if db <= d < fb and slugs & set(b['slugs']):
            return 'meme_seance'
    return 'nouvelle'


if __name__ == '__main__':
    alias = json.load(open(sys.argv[1], encoding='utf-8'))
    t = resoudre(lire_texte(open(sys.argv[2], encoding='utf-8').read()), alias)
    c = resoudre(lire_csv(open(sys.argv[3], encoding='utf-8').read()), alias)
    for s in t + c:
        n = sum(len(e['series']) for e in s['exercices'])
        print(s['ref'], s['debut_local'], s['fin_local'], n, empreinte(s), repr(s['titre']), repr(s['note']))
