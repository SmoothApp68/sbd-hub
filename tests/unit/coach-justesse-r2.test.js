// Fix justesse Coach round 2 : (1) TDEE facteur sur fréquence 28j lissée,
// (2) push/pull unifié (une méthode, latéraux neutres), (3) sur-atteinte =
// observation (plus de prescription concurrente de l'arbitre), (4) profil
// neuromusculaire dé-bruité (<0.95 / >1.18, ≥3 sessions) + fusionné en 1 carte.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const ENG = fs.readFileSync(path.join(ROOT, 'js', 'engine.js'), 'utf8');

function fnA(name) {
  const m = ENG.match(new RegExp('^function ' + name + '\\b', 'm'));
  if (!m) throw new Error('NOT FOUND: ' + name);
  let depth = 0, i = ENG.indexOf('{', m.index), started = false;
  for (; i < ENG.length; i++) {
    if (ENG[i] === '{') { depth++; started = true; }
    else if (ENG[i] === '}') { depth--; if (started && depth === 0) { i++; break; } }
  }
  return ENG.slice(m.index, i);
}

describe('R2 (1) calcTDEE — fréquence lissée sur 28j (÷ semaines couvertes)', () => {
  const src = fnA('calcTDEE');
  test('lit la fenêtre 28j, plus la fenêtre 7j volatile', () => {
    expect(src).toContain('getLogsInRange(28)');
    expect(src).not.toContain('getLogsInRange(7)');
  });
  test('divise par les semaines réellement couvertes (pas 4 en dur)', () => {
    expect(src).toMatch(/_weeksCovered/);
    expect(src).toContain('_logs28.length / _weeksCovered');
  });
});

describe('R2 (2) Push/Pull — une seule méthode (sets 30j), latéraux neutres', () => {
  const src = fnA('analyzeAthleteProfile');
  test('le bloc volume-kg-7j push/pull est supprimé (plus de double alerte)', () => {
    expect(src).not.toContain('_weekPush');
    expect(src).not.toContain('pullPushRatio');
    expect(src).not.toContain('Tirage/Poussée < 1.0');
  });
  test('méthode conservée : sets sur 30j via getMuscleGroup', () => {
    expect(src).toContain('getLogsInRange(30)');
    expect(src).toContain('PUSH_KEYS');
  });
  test('élévations latérales NEUTRES : hors PUSH_KEYS', () => {
    // extrait la définition PUSH_KEYS (multi-lignes)
    const m = src.match(/var PUSH_KEYS = \{[\s\S]*?\};/);
    expect(m).toBeTruthy();
    expect(m[0]).not.toContain('latéral');
    expect(m[0]).toContain('antérieur'); // Épaules (antérieur) reste en push
  });
  test('libellé : zone saine 0.8–1.2 affichée, fenêtre étiquetée, vocab adouci', () => {
    expect(src).toContain('zone saine 0.8–1.2');
    expect(src).toContain('moyenne 30j');
    expect(src).not.toContain('sous-acromial'); // vocabulaire médical retiré
  });
  test('sévérité warning conservée sur la dominance poussée', () => {
    expect(src).toContain("title: 'Tu pousses plus que tu ne tires'");
  });
});

describe('R2 (3) Sur-atteinte — observation, pas prescription', () => {
  const src = fnA('classifyStagnation');
  test("plus d'action emergency_deload ni de « 3 jours de repos complets »", () => {
    // cible la prescription vivante, pas le commentaire qui documente le retrait
    expect(src).not.toContain("action: 'emergency_deload'");
    expect(src).not.toContain('3 jours de repos complets recommandés');
  });
  test('message devient une observation chiffrée (baisse e1RM sur 3 semaines)', () => {
    expect(src).toContain('baisse de');
    expect(src).toContain('surveille ta récupération');
    expect(src).toContain("action: 'monitor'");
  });
  test('classifyStagnation conservée (les autres types restent)', () => {
    expect(src).toContain("type: 'fatigue'");
    expect(src).toContain("type: 'consolidation'");
  });
  test('section Progression SBD : sur_atteinte n’est plus danger (warning)', () => {
    const body = fnA('analyzeAthleteProfile');
    expect(body).not.toContain("stagnation.type === 'sur_atteinte' ? 'danger'");
    expect(body).toContain("(stagnation.type === 'sur_atteinte' || stagnation.type === 'fatigue') ? 'warning' : 'info'");
  });
});

describe('R2 (4) Profil Neuromusculaire — dé-bruité + fusionné', () => {
  const src = fnA('analyzeAthleteProfile');
  test('seuils élargis : endurance < 0.95, neurologique > 1.18 (fini 1.02/1.15)', () => {
    expect(src).toContain('ratio > 1.18');
    expect(src).toContain('ratio < 0.95');
    expect(src).not.toContain('ratio > 1.15');
    expect(src).not.toContain('ratio < 1.02');
  });
  test('données minimales : ≥ 3 séances par zone (sessionsCount)', () => {
    expect(src).toContain('sessionsCount');
    expect(src).toMatch(/sessionsCount \|\| 0\) < 3/);
  });
  test('UNE carte fusionnée : pas de neuroAlerts par lift, lignes join(<br>)', () => {
    expect(src).not.toContain('neuroAlerts');
    expect(src).toContain('neuroLines');
    expect(src).toContain("neuroLines.join('<br>')");
  });
});
