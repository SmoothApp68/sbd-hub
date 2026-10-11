import json, sys, datetime, hashlib
sys.path.insert(0, '.')
from parcours75 import parcours
J = '2026-10-11'
def d(n): return (datetime.date.fromisoformat(J) - datetime.timedelta(days=n)).isoformat() + 'T18:00'
CAT = {
 'squat_barre': ('Squat (Barre)', 'quadriceps', 'squat', 'accroupir', 'barre'),
 'developpe_couche_barre': ('Développé Couché (Barre)', 'pectoraux', 'developpe_couche', 'pousser_horizontal', 'barre'),
 'souleve_de_terre_barre': ('Soulevé de Terre (Barre)', 'ischio_jambiers', 'souleve_de_terre', 'pencher', 'barre'),
 'developpe_militaire_barre': ('Développé Militaire (Barre)', 'deltoide_anterieur', 'developpe_epaules', 'pousser_vertical', 'barre'),
 'presse_a_cuisses': ('Presse à Cuisses', 'quadriceps', 'presse_a_cuisses', 'accroupir', 'machine'),
 'hack_squat_machine': ('Hack Squat (Machine)', 'quadriceps', 'squat', 'accroupir', 'machine'),
 'extension_jambes': ('Extension Jambes', 'quadriceps', 'extension_jambes', 'quadriceps', 'machine'),
 'elevation_laterale_haltere': ('Élévation Latérale (Haltère)', 'deltoide_lateral', 'elevation_laterale', 'epaules_cote', 'haltere'),
 'elevation_laterale_poulie': ('Élévation Latérale (Poulie)', 'deltoide_lateral', 'elevation_laterale', 'epaules_cote', 'poulie'),
 'curl_marteau_haltere': ('Curl Marteau (Haltère)', 'biceps', 'curl_marteau', 'biceps', 'haltere'),
 'curl_biceps_barre_ez': ('Curl Biceps (Barre EZ)', 'biceps', 'curl', 'biceps', 'barre'),
 'rowing_poulie_assis': ('Rowing Poulie Assis (Prise en V)', 'haut_du_dos', 'rowing', 'tirer_horizontal', 'poulie'),
 'tirage_poitrine_poulie': ('Tirage Poitrine (Poulie)', 'grand_dorsal', 'tirage_vertical', 'tirer_vertical', 'poulie'),
 'tractions': ('Tractions', 'grand_dorsal', 'tirage_vertical', 'tirer_vertical', 'aucun'),
 'poirier': ('Poirier', 'deltoide_anterieur', None, None, 'aucun'),
 'tapis_roulant': ('Tapis de Course', None, None, None, 'machine'),
}
def cat(slugs):
    return [{'slug': s, 'nom': CAT[s][0], 'muscles_primaires': [CAT[s][1]] if CAT[s][1] else [], 'mouvement': CAT[s][2],
             'schema_mouvement': CAT[s][3], 'habilete': s == 'poirier', 'equipement': CAT[s][4]} for s in slugs]
n = [0]
def seances(slug, jours, sets):
    out = []
    for j in jours:
        n[0] += 1
        for r, c in sets: out.append({'debut': d(j), 'seance': 's%04d' % n[0], 'slug': slug, 'reps': r, 'charge': c})
    return out
P = list(range(190, 360, 30))   # 6 séances en P
R = list(range(5, 180, 30))     # 6 séances en R
cas = []
def ajoute(nom, quoi, series, prios=('dos', 'jambes', 'epaules'), sexe='homme'):
    slugs = sorted({s['slug'] for s in series})
    e = {'aujourdhui': J, 'sexe': sexe, 'priorites': list(prios), 'catalogue': cat(slugs), 'series': series}
    cas.append({'nom': nom, 'quoi': quoi, 'entree': e, 'attendu': parcours(e)})
ajoute('a-moins-relais', 'fait deux fois moins souvent → « moins », relais même muscle et même mouvement (≥5 séances, en hausse de fréquence)',
  seances('elevation_laterale_haltere', P + [200, 210, 220, 230], [(12, 12), (15, 10)]) + seances('elevation_laterale_haltere', [10, 40], [(12, 12)])
  + seances('elevation_laterale_poulie', [300], [(12, 9)]) + seances('elevation_laterale_poulie', R + [15, 25], [(12, 13.6)]))
ajoute('b-nouveau-peu', '« nouveau » (≥5 en R, <5 en P) et « peu » (4 séances)',
  seances('hack_squat_machine', R, [(8, 120)]) + seances('extension_jambes', [200, 230, 260, 290], [(12, 50)]) + seances('extension_jambes', R[:4], [(12, 55)]))
def deux(slug, a, b, nom, quoi):
    ajoute(nom, quoi, seances(slug, P, a) + seances(slug, R, b))
deux('presse_a_cuisses', [(6, 300), (10, 270), (12, 250)], [(6, 310), (10, 290), (12, 250)], 'c-reps-hausse-nette', '2 hausses, 0 baisse sur 3 → ↑')
deux('presse_a_cuisses', [(6, 300), (10, 270), (12, 250), (8, 280)], [(6, 310), (10, 270), (12, 250), (8, 280)], 'd-reps-legere', '1 hausse sur 4, 0 baisse → ↗ (2h < n)')
deux('presse_a_cuisses', [(6, 300), (10, 270)], [(6, 302), (10, 266)], 'e-reps-stable', 'écarts sous 2,5 % → ▬')
deux('presse_a_cuisses', [(6, 300), (10, 270), (12, 250)], [(6, 290), (10, 270), (12, 252)], 'f-reps-baisse-legere', '1 baisse sur 3 → ↘')
deux('presse_a_cuisses', [(6, 300), (10, 270), (12, 250)], [(6, 280), (10, 250), (12, 250)], 'g-reps-baisse', '2 baisses → ↓')
deux('presse_a_cuisses', [(6, 300), (10, 270), (12, 250), (15, 220)], [(6, 310), (10, 280), (12, 240), (15, 220)], 'h-reps-mixte', '2 hausses 1 baisse → ↗')
deux('curl_marteau_haltere', [(6, 30), (8, 28)], [(10, 28), (12, 26)], 'i-courbe', 'aucune rep en commun, 4 nombres de reps → courbe personnelle')
deux('curl_marteau_haltere', [(8, 28)], [(12, 24)], 'j-pas-comparable', '2 nombres de reps en tout → pas comparable')
ajoute('k-zone-peu-et-vide', 'une zone à 1 votant, une zone jamais suivie en charge, habileté et cardio exclus',
  seances('curl_marteau_haltere', P, [(10, 24)]) + seances('curl_marteau_haltere', R, [(10, 28), (12, 25)]) + seances('curl_marteau_haltere', P[:1], [(12, 22)])
  + seances('poirier', R, [(1, 10)]) + seances('tapis_roulant', R, [(1, 5)]) + seances('tractions', P + R, [(8, None)]))
ajoute('l-levier-poids-barre', 'squat ×2 ↗ et deux machines ↑ ; épaules ↑ net ; levier = la priorité la plus lente',
  seances('squat_barre', P, [(5, 120), (3, 135), (8, 100)]) + seances('squat_barre', R, [(5, 125), (3, 135), (8, 100)])
  + seances('presse_a_cuisses', P, [(10, 270), (12, 250)]) + seances('presse_a_cuisses', R, [(10, 290), (12, 270)])
  + seances('hack_squat_machine', P, [(8, 120), (10, 110)]) + seances('hack_squat_machine', R, [(8, 130), (10, 120)])
  + seances('elevation_laterale_poulie', P, [(12, 9), (15, 8)]) + seances('elevation_laterale_poulie', R, [(12, 12), (15, 10)])
  + seances('developpe_militaire_barre', P, [(5, 60), (3, 65)]) + seances('developpe_militaire_barre', R, [(5, 65), (3, 70)]))
ajoute('m-levier-egalite', 'deux priorités au même score : la première dans l’ordre des priorités',
  seances('elevation_laterale_poulie', P, [(12, 9), (15, 8)]) + seances('elevation_laterale_poulie', R, [(12, 12), (15, 10)])
  + seances('curl_marteau_haltere', P, [(10, 24), (12, 22)]) + seances('curl_marteau_haltere', R, [(10, 28), (12, 25)])
  + seances('rowing_poulie_assis', P, [(8, 80), (10, 75)]) + seances('rowing_poulie_assis', R, [(8, 90), (10, 85)])
  + seances('tirage_poitrine_poulie', P, [(8, 60), (10, 55)]) + seances('tirage_poitrine_poulie', R, [(8, 70), (10, 65)])
  + seances('curl_biceps_barre_ez', P, [(10, 25), (12, 22)]) + seances('curl_biceps_barre_ez', R, [(10, 30), (12, 27)]),
  prios=('epaules', 'dos', 'bras'))
ajoute('n-rapports', 'squat/couché en dessous (+écart kg), militaire/couché proche, soulevé/squat avec 2 reps en commun seulement → absent',
  seances('squat_barre', P, [(1, 145), (3, 135), (5, 125), (8, 110)]) + seances('developpe_couche_barre', P, [(1, 140), (3, 130), (5, 120), (8, 105)])
  + seances('developpe_militaire_barre', R, [(1, 77), (3, 72), (5, 66)]) + seances('souleve_de_terre_barre', R, [(1, 170), (3, 160)]) + seances('squat_barre', R, [(1, 145)]))
rap = (seances('squat_barre', P, [(1, 90), (3, 85), (5, 80), (8, 70)]) + seances('developpe_couche_barre', P, [(1, 55), (3, 50), (5, 47), (8, 42)])
  + seances('developpe_militaire_barre', P, [(1, 30), (3, 28), (5, 26)]) + seances('souleve_de_terre_barre', P, [(1, 115), (3, 105), (5, 100), (8, 90)]))
ajoute('p-rapports-femme', 'repères des femmes : squat/couché 1,52, militaire/couché 0,63, soulevé/squat 1,25', rap, sexe='femme')
ajoute('q-rapports-sans-sexe', 'sexe non précisé : les rapports sans repère ni lecture, absents de la phrase', rap, sexe='non_precise')
b = []
for j in (182, 183, 365, 366, -1):
    b += seances('presse_a_cuisses', [j], [(10, 200 + j % 50)])
ajoute('o-bornes', 'J-182 compte en R, J-183 et J-365 en P, J-366 et le futur hors période ; courbes : tout l’historique jusqu’à J',
  b + seances('squat_barre', [700, 400, 10], [(5, 100)]) + seances('squat_barre', [-1], [(5, 200)]))
json.dump(cas, open('cas-75-synthetiques.json', 'w'), ensure_ascii=False, indent=1)
for c in cas:
    a = c['attendu']
    print(c['nom'], '|', a['phrase'], '|', a['levier'], '|', [(x['slug'][:12], x['etat'], x['nP'], x['nR']) for x in a['exercices']], '|', [(z['zone'], z['verdict'], z.get('raison')) for z in a['zones'] if z['votants'] or z.get('raison') != 'pas encore suivi en charge'], [(r['affiche'], r['lecture'], r.get('ecart_kg')) for r in a['rapports']])
