import json, sys, datetime
sys.path.insert(0, '.')
from question78 import questions
L = '2026-10-20'
def j(n): return (datetime.date.fromisoformat(L) + datetime.timedelta(days=n)).isoformat()
def ex(slug, jours_passes, efforts=None, pari=True):
    efforts = efforts or [None] * len(jours_passes)
    return {'slug': slug, 'pari': pari, 'passe': [{'jour': j(d), 'effort': e} for d, e in zip(jours_passes, efforts)]}
R = lambda k: {'ressenti': k, 'rpe': None}
cas = []
def ajoute(nom, quoi, jour, exs):
    e = {'lancement': L, 'jour': j(jour), 'exercices': exs}
    cas.append({'nom': nom, 'quoi': quoi, 'entree': e, 'attendu': questions(e)})
ajoute('a-premiere', 'première séance après le lancement : calage', 0, [ex('squat_barre', [])])
ajoute('b-sans-pari', 'un exercice sans pari : jamais', 0, [ex('tapis', [], pari=False), ex('squat_barre', [])])
ajoute('c-fin-calage', 'J+42 : le calage est fini ; rang 6 : jour de rappel → oui', 42, [ex('squat_barre', [0, 7, 14, 21, 28, 35], [R('reste_1')] * 6)])
ajoute('d-rappel', 'hors calage : une séance sur trois (rang 6 → oui, rang 7 → non)', 49, [ex('squat_barre', [0, 7, 14, 21, 28, 35, 42], [R('reste_1')] * 7)])
ajoute('e-silence', '5 séances sans réponse : seulement les jours de rappel (rang 5 → non)', 35, [ex('squat_barre', [0, 7, 14, 21, 28])])
ajoute('f-silence-rappel', '6 séances sans réponse, rang 6 : jour de rappel → oui', 42, [ex('squat_barre', [0, 7, 14, 21, 28, 35])])
ajoute('g-trop-prudent', 'hors calage, 6 réponses moyennes ≥ 2,5 : question à chaque séance', 70, [ex('curl', [0, 7, 14, 21, 28, 35, 42, 49, 56, 63], [R('reste_3_plus')] * 10)])
ajoute('h-trop-optimiste', 'hors calage, 3 « 0 » sur 6 : question', 70, [ex('couche', [0, 7, 14, 21, 28, 35, 42, 49, 56, 63], [R('reste_1')] * 4 + [R('reste_0'), R('reste_1'), R('reste_0'), R('reste_2'), R('reste_0'), R('reste_1')])])
ajoute('i-rpe', 'un RPE se lit en réserve (10 − RPE, de 0 à 3) : 9,5 → 0,5 — ni trop prudent ni trop optimiste ; hors calage, rang 10 → non', 70, [ex('couche', [0, 7, 14, 21, 28, 35, 42, 49, 56, 63], [{'ressenti': None, 'rpe': 9.5}] * 10)])
ajoute('j-plafond', '6 exercices au calage : 4 questions, ceux qui ont le moins de réponses récentes, dans l\'ordre du plan', 21,
  [ex('a', [0, 7, 14], [R('reste_1')] * 3), ex('b', [0, 7, 14]), ex('c', [0, 7, 14], [R('reste_2')] * 3), ex('d', [0]), ex('e', []), ex('f', [0, 7], [R('reste_1'), None])])
ajoute('k-avant-lancement', 'les séances d\'avant le lancement ne comptent ni pour le rang ni pour le calage, mais leurs réponses comptent pour l\'écart', 0,
  [ex('couche', [-70, -63, -56, -49, -42, -35], [R('reste_0')] * 6)])
json.dump(cas, open('cas-78.json', 'w'), ensure_ascii=False, indent=1)
for c in cas: print(c['nom'], c['attendu'])
