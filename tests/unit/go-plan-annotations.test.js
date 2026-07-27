// PONT PLAN → SÉANCE (chantier 22/07/2026) — les annotations posées par le générateur
// sur l'exercice PRESCRIT (db.weeklyPlan) ne traversaient pas _goDoStartWorkout :
// l'objet poussé dans activeWorkout ne portait que 5 clés (exoId, name, sets,
// restSeconds, notes). Conséquence : du code de rendu déjà écrit et correct ne pouvait
// JAMAIS s'exécuter (_interferenceNote app.js, isDoubleProgression, isPrimary), et les
// consignes du coach (coachNote, gripNote, tempoEcc) n'avaient aucun rendu.
// Fonctions extraites de la VRAIE source (vm).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');

function extractFn(src, name) {
  const m = src.match(new RegExp('^(?:async )?function ' + name + '\\b[\\s\\S]*?^}', 'm'));
  if (!m) throw new Error('Could not extract fn ' + name);
  return m[0];
}

const ctx = { String, console: { warn() {}, log() {} } };
vm.createContext(ctx);
vm.runInContext(extractFn(APP, '_goCarryPlanAnnotations'), ctx);
vm.runInContext(extractFn(APP, '_goCoachAnnotationLines'), ctx);
const carry = (target, planExo) => { ctx.__t = target; ctx.__p = planExo; return vm.runInContext('_goCarryPlanAnnotations(__t, __p)', ctx); };
const lines = (exo) => { ctx.__e = exo; return vm.runInContext('_goCoachAnnotationLines(__e)', ctx); };

// L'objet de base construit par _goDoStartWorkout (les 5 clés historiques)
const baseExo = () => ({ exoId: 'squat', name: 'Squat (Barre)', sets: [{ weight: 100, reps: 5 }], restSeconds: 300, notes: '' });

describe('transfert plan → séance : les annotations traversent', () => {
  test('coachNote du plan arrive sur l\'exercice de séance', () => {
    const r = carry(baseExo(), { coachNote: '⚖️ Ratio Squat/Deadlift bas — Squat Pause technique (≤70% e1RM, RPE 7).' });
    expect(r.coachNote).toBe('⚖️ Ratio Squat/Deadlift bas — Squat Pause technique (≤70% e1RM, RPE 7).');
  });

  test('_interferenceNote arrive (son rendu existait mais n\'était jamais atteint)', () => {
    const r = carry(baseExo(), { _interferenceNote: 'Volume réduit (-20%) — récupération activité secondaire d\'hier' });
    expect(r._interferenceNote).toContain('Volume réduit');
  });

  test('isPrimary arrive (débloque le bloc d\'activation WARMUP_ACTIVATION)', () => {
    expect(carry(baseExo(), { isPrimary: true }).isPrimary).toBe(true);
  });

  test('isDoubleProgression arrive AVEC targetReps/targetRepsMax (son rendu les lit)', () => {
    const r = carry(baseExo(), { isDoubleProgression: true, targetReps: 8, targetRepsMax: 12 });
    expect(r.isDoubleProgression).toBe(true);
    expect(r.targetReps).toBe(8);
    expect(r.targetRepsMax).toBe(12);
  });

  test('tempoEcc et gripNote arrivent', () => {
    const r = carry(baseExo(), { tempoEcc: 4, gripNote: 'Prise neutre impérative — paumes face à face, zéro rotation.' });
    expect(r.tempoEcc).toBe(4);
    expect(r.gripNote).toContain('Prise neutre');
  });

  test('transfert complet : toutes les annotations d\'un coup', () => {
    const r = carry(baseExo(), {
      coachNote: '📈 Volume PR atteint', gripNote: 'Prise marteau', tempoEcc: 3,
      _interferenceNote: 'Volume réduit (-15%)', isPrimary: true,
      isDoubleProgression: true, targetReps: 6, targetRepsMax: 10,
    });
    expect(r.coachNote).toBeTruthy();
    expect(r.gripNote).toBeTruthy();
    expect(r.tempoEcc).toBe(3);
    expect(r._interferenceNote).toBeTruthy();
    expect(r.isPrimary).toBe(true);
    expect(r.isDoubleProgression).toBe(true);
  });
});

describe('non-régression : le champ `notes` utilisateur reste intact', () => {
  test('notes n\'est JAMAIS écrasé par une annotation coach', () => {
    const t = baseExo();
    t.notes = 'ma note perso';
    const r = carry(t, { coachNote: 'consigne du coach', gripNote: 'prise neutre' });
    expect(r.notes).toBe('ma note perso');           // le champ user survit
    expect(r.coachNote).toBe('consigne du coach');   // et reste distinct
  });

  test('le plan ne peut pas injecter dans notes (champ non transféré)', () => {
    const r = carry(baseExo(), { notes: 'INJECTÉ PAR LE PLAN' });
    expect(r.notes).toBe('');                        // notes reste le champ utilisateur, vide
  });
});

describe('non-régression : séance sans annotation = comportement d\'avant', () => {
  test('planExo null (séance libre / fallback historique) → objet inchangé, 5 clés', () => {
    const r = carry(baseExo(), null);
    expect(Object.keys(r).sort()).toEqual(['exoId', 'name', 'notes', 'restSeconds', 'sets']);
  });

  test('planExo sans annotation → aucune clé parasite ajoutée', () => {
    const r = carry(baseExo(), { name: 'Squat (Barre)', sets: [{ weight: 100 }] });
    expect(Object.keys(r).sort()).toEqual(['exoId', 'name', 'notes', 'restSeconds', 'sets']);
  });

  test('les données de base (sets, restSeconds) ne sont jamais altérées', () => {
    const r = carry(baseExo(), { coachNote: 'x', sets: [{ weight: 999 }], restSeconds: 999 });
    expect(r.sets[0].weight).toBe(100);   // les sets viennent d'initSets, pas du plan
    expect(r.restSeconds).toBe(300);
  });

  test('valeurs falsy ignorées (pas de clé vide ajoutée)', () => {
    const r = carry(baseExo(), { coachNote: '', gripNote: null, tempoEcc: 0, _interferenceNote: undefined, isPrimary: false });
    expect(Object.keys(r).sort()).toEqual(['exoId', 'name', 'notes', 'restSeconds', 'sets']);
  });
});

describe('rendu des consignes coach (lignes affichées dans la carte GO)', () => {
  test('coachNote affichée telle quelle (elle porte déjà son emoji)', () => {
    expect(lines({ coachNote: '📈 Volume PR atteint — continue' })).toEqual(['📈 Volume PR atteint — continue']);
  });

  test('gripNote préfixée (elle n\'a pas d\'emoji propre)', () => {
    expect(lines({ gripNote: 'Prise neutre impérative' })).toEqual(['🤲 Prise neutre impérative']);
  });

  test('tempoEcc rendu en consigne lisible', () => {
    expect(lines({ tempoEcc: 4 })).toEqual(['⏱ 4 s de descente (excentrique lent)']);
  });

  test('ordre stable : coachNote → grip → tempo', () => {
    expect(lines({ coachNote: 'A', gripNote: 'B', tempoEcc: 2 }))
      .toEqual(['A', '🤲 B', '⏱ 2 s de descente (excentrique lent)']);
  });

  test('aucune annotation → aucune ligne (le bloc n\'est pas rendu)', () => {
    expect(lines({ name: 'Squat' })).toEqual([]);
    expect(lines(null)).toEqual([]);
    expect(lines({ coachNote: '', gripNote: '', tempoEcc: 0 })).toEqual([]);
  });
});
