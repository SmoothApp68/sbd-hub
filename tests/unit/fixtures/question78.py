# Référence 78 — la question de réserve (12/10/2026). Pure. Fait foi pour la concordance JS.
import datetime
CALAGE_JOURS = 42      # 6 semaines
RAPPEL = 3             # ensuite, une séance sur trois
SILENCE = 5            # 5 séances de suite sans réponse → seulement les jours de rappel
FENETRE = 6            # les 6 dernières réponses pour juger le coach
TROP_PRUDENT = 2.5     # réserve moyenne ≥ 2,5
TROP_OPTIMISTE = 3     # au moins 3 réponses « 0 » sur les 6
MAX_SEANCE = 4

def reserve(r):
    # r : {'ressenti': 'reste_0'|'reste_1'|'reste_2'|'reste_3_plus'|None, 'rpe': nombre|None}
    if r is None: return None
    if r.get('rpe') is not None:
        return min(3, max(0, 10 - r['rpe']))
    m = {'reste_0': 0, 'reste_1': 1, 'reste_2': 2, 'reste_3_plus': 3}
    return m.get(r.get('ressenti'))

def jours(a, b): return (datetime.date.fromisoformat(b) - datetime.date.fromisoformat(a)).days

def decision(ex, L, J):
    # ex : {'slug', 'pari': bool, 'passe': [{'jour', 'effort': {...}|None}] (séances d'avant, triées, effort de la dernière série de travail)}
    if not ex['pari']: return None
    passe = [p for p in ex['passe'] if p['jour'] >= L and p['jour'] < J]
    n = len(passe)                                  # rang de la séance du jour parmi celles depuis le lancement
    debut = passe[0]['jour'] if passe else J
    rappel = (n % RAPPEL == 0)
    sans = 0
    for p in reversed(passe):
        if reserve(p['effort']) is None: sans += 1
        else: break
    if sans >= SILENCE:
        return 'rappel' if rappel else None
    rep = [reserve(p['effort']) for p in ex['passe'] if p['jour'] < J and reserve(p['effort']) is not None][-FENETRE:]
    if len(rep) >= FENETRE and (sum(rep) / len(rep) >= TROP_PRUDENT or sum(1 for x in rep if x == 0) >= TROP_OPTIMISTE):
        return 'ecart'
    if jours(debut, J) < CALAGE_JOURS: return 'calage'
    return 'rappel' if rappel else None

def questions(entree):
    L, J = entree['lancement'], entree['jour']
    out = []
    for i, ex in enumerate(entree['exercices']):
        d = decision(ex, L, J)
        if d is None: continue
        recentes = sum(1 for p in ex['passe'] if p['jour'] < J and jours(p['jour'], J) <= CALAGE_JOURS and reserve(p['effort']) is not None)
        out.append((recentes, i, ex['slug'], d))
    out.sort()
    garde = sorted(out[:MAX_SEANCE], key=lambda x: x[1])
    return [{'slug': s, 'motif': d} for _, _, s, d in garde]
