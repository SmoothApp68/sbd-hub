// SPEC parcours d'entrée, morceau (a) — écran 3 « Objectif » : 6 choix au lieu de 4.
// `seche` et `reprise` existaient déjà dans le moteur mais n'étaient PAS proposés dans le
// fast flow : un utilisateur en sèche devait choisir « Recomposition » par défaut.
// Ces tests vérifient que chaque id proposé à l'écran est RÉELLEMENT consommable en aval —
// c'est le vrai risque d'un ajout d'option : un id orphelin qui retombe silencieusement
// sur un défaut. Tables extraites de la VRAIE source.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const ENGINE = fs.readFileSync(path.join(ROOT, 'js', 'engine.js'), 'utf8');

// ── Extraction des tables réelles ────────────────────────────────────────────
// Les ids réellement cliquables dans l'écran q2 (ordre du DOM conservé).
const q2Block = HTML.match(/<div class="ob-step" id="ob-step-q2">[\s\S]*?<button class="btn" onclick="obSaveQ2\(\)"/);
if (!q2Block) throw new Error('Bloc ob-step-q2 introuvable dans index.html');
const markupIds = [...q2Block[0].matchAll(/obQ2SelectGoal\('([a-z_]+)'\s*,\s*this\)/g)].map((m) => m[1]);

// obGoals (app.js) — c'est cette liste que _obGenerateProgramCore interroge :
//   var goalObj = obGoals.find(g => g.id === db.user.goal) || obGoals[1];
// Un id absent d'ici retomberait SILENCIEUSEMENT sur obGoals[1] (= 'masse').
const obGoalsSrc = APP.match(/^let obGoals = \[[\s\S]*?^\];/m);
if (!obGoalsSrc) throw new Error('obGoals introuvable dans app.js');
const ctx = { };
vm.createContext(ctx);
vm.runInContext(obGoalsSrc[0].replace(/^let /, 'var '), ctx);
const obGoals = vm.runInContext('obGoals', ctx);

// GOAL_KCAL (engine.js, local à calcTDEE) — un id absent donne `adjust = 0`
// (via le garde `!== undefined`) : pas de crash, mais aucune personnalisation calorique.
const kcalSrc = ENGINE.match(/var GOAL_KCAL = \{[\s\S]*?\};/);
if (!kcalSrc) throw new Error('GOAL_KCAL introuvable dans engine.js');
vm.runInContext(kcalSrc[0], ctx);
const GOAL_KCAL = vm.runInContext('GOAL_KCAL', ctx);

// Table de pré-sélection par discipline
const preselSrc = APP.match(/var _OB_GOAL_BY_DISCIPLINE = \{[^}]*\};/);
vm.runInContext(preselSrc[0], ctx);
const PRESEL = vm.runInContext('_OB_GOAL_BY_DISCIPLINE', ctx);

const EXPECTED = ['masse', 'force', 'recompo', 'seche', 'reprise', 'maintien'];

describe('écran 3 — les 6 objectifs sont proposés, dans l\'ordre de la spec', () => {
  test('les 6 ids attendus, dans l\'ordre du DOM', () => {
    expect(markupIds).toEqual(EXPECTED);
  });

  test('seche et reprise sont bien les NOUVEAUX (ils manquaient au fast flow)', () => {
    expect(markupIds).toContain('seche');
    expect(markupIds).toContain('reprise');
  });

  test('aucun doublon', () => {
    expect(new Set(markupIds).size).toBe(markupIds.length);
  });

  test('libellés et sous-libellés exacts des 2 nouveaux', () => {
    expect(q2Block[0]).toContain('>Sécher<');
    expect(q2Block[0]).toContain('Perdre du poids, garder un max de muscle');
    expect(q2Block[0]).toContain('>Reprise progressive<');
    expect(q2Block[0]).toContain('Je reviens après une pause ou une blessure');
  });
});

describe('chaque id proposé est consommable en aval (pas d\'option orpheline)', () => {
  test.each(EXPECTED)('« %s » existe dans obGoals → goalObj résolu, pas de repli sur masse', (id) => {
    expect(obGoals.find((g) => g.id === id)).toBeDefined();
  });

  test.each(EXPECTED)('« %s » a une entrée GOAL_KCAL → ajustement calorique explicite', (id) => {
    expect(GOAL_KCAL[id]).toBeDefined();
  });

  test('les valeurs caloriques de référence sont celles attendues', () => {
    expect(GOAL_KCAL.seche).toBe(-600);    // déjà câblé, ne doit pas dériver
    expect(GOAL_KCAL.reprise).toBe(0);     // maintien — comportement propre = morceau (h)
    expect(GOAL_KCAL.recompo).toBe(-500);
    expect(GOAL_KCAL.masse).toBe(300);
    expect(GOAL_KCAL.maintien).toBe(0);
    expect(GOAL_KCAL.force).toBe(150);
  });
});

describe('non-régression — la pré-sélection par discipline reste valide', () => {
  test('chaque discipline pré-sélectionne un objectif RÉELLEMENT proposé à l\'écran', () => {
    Object.keys(PRESEL).forEach((disc) => {
      expect(markupIds).toContain(PRESEL[disc]);
    });
  });

  test('le mapping historique est inchangé', () => {
    expect(PRESEL).toEqual({
      powerlifting: 'force', powerbuilding: 'masse',
      musculation: 'masse', bien_etre: 'maintien',
    });
  });
});

describe('le lien « Passer » reste cohérent', () => {
  test('il force masse, qui fait toujours partie des choix', () => {
    const skip = HTML.match(/obQ2SelectGoal\('([a-z]+)',null\);obSaveQ2\(\)/);
    expect(skip).not.toBeNull();
    expect(markupIds).toContain(skip[1]);
    expect(skip[1]).toBe('masse');
  });
});
