/**
 * PROFIL « donnees_sales » — données CORROMPUES / limites : noms d'exercices
 * inconnus & typos, poids à 0, reps à 0, timestamp DANS LE FUTUR, séance
 * DUPLIQUÉE (même shortDate + titre), unités douteuses (lbs saisies comme kg),
 * rpe aberrant, champs manquants.
 *
 * STRESSE :
 *  - Robustesse au parsing : aucun lecteur ne doit crasher / produire NaN / trier
 *    en boucle sur des timestamps futurs.
 *  - getLogsInRange(28) filtre `l.timestamp <= Date.now()` → la séance FUTURE doit
 *    être EXCLUE des fenêtres (sinon TDEE/ACWR pollués). Fixture qui prouve ce garde-fou.
 *  - Dédup : deux séances même shortDate+titre → processHevy dédupe, mais un blob
 *    déjà pollué contient le doublon. Les compteurs de séances doivent-ils compter 1 ou 2 ?
 *  - getSBDType sur noms sales : « Skwat », « Deadlfit », « DC » ne matchent PAS →
 *    ces séances n'alimentent ni bestPR ni les ratios (silencieusement ignorées).
 *  - poids 0 / reps 0 : _exoMaxRealWeight → 0 ; calcE1RM(0,x)=0 ; volume += 0.
 *    Aucune division par zéro, aucun record fantôme à 0 kg.
 *  - Unités : 315 « kg » au squat (= 315 lbs mal converties) chez un bw 80 →
 *    ratio ×3.9 bw absurde. Un détecteur d'outlier devrait sourciller (pas le cas
 *    aujourd'hui → finding potentiel).
 */
'use strict';
const G = require('./generator');

function build(now) {
  now = now || Date.now();
  const p = G.blankProfile('donnees_sales', {
    name: '   ', // nom blanc
    age: 0, bw: 80, height: 0, gender: 'male',
    goal: 'masse', level: 'intermediaire', trainingMode: 'powerbuilding',
    onboardingVersion: 4,
    onboardingPRs: { squat: 0, bench: 0, deadlift: 0 }
  });

  const logs = [];

  // 1) Séance NORMALE de référence (pour prouver que le reste est bien filtré).
  {
    const ts = now - 3 * G.DAY;
    logs.push(G.session(ts, 'Jambes', [
      G.exercise('Squat (Barre)', [G.workSet(100, 5, 8), G.workSet(100, 5, 8.5)], { ts: ts, isPrimary: true })
    ], { id: 'clean-1' }));
  }

  // 2) Noms inconnus / typos → getSBDType null, matchExoName échoue.
  {
    const ts = now - 4 * G.DAY;
    logs.push(G.session(ts, 'Divers', [
      G.exercise('Skwat Barre', [G.workSet(90, 5, 8)], { ts: ts }),      // typo squat
      G.exercise('Deadlfit', [G.workSet(150, 3, 8)], { ts: ts }),        // typo deadlift
      G.exercise('DC', [G.workSet(80, 5, 8)], { ts: ts }),               // abréviation opaque
      G.exercise('Machin Bidule 3000', [G.workSet(50, 10, 8)], { ts: ts }) // pur inconnu
    ], { id: 'typo-1' }));
  }

  // 3) Poids 0 / reps 0 / rpe aberrant.
  {
    const ts = now - 5 * G.DAY;
    logs.push(G.session(ts, 'Cassée', [
      G.exercise('Développé Couché (Barre)', [
        G.workSet(0, 5, 8),      // 0 kg
        G.workSet(80, 0, 8),     // 0 reps
        G.workSet(80, 5, 99)     // rpe aberrant 99
      ], { ts: ts, isPrimary: true })
    ], { id: 'zero-1' }));
  }

  // 4) Timestamp DANS LE FUTUR (+3j) — doit être exclu des fenêtres glissantes.
  {
    const ts = now + 3 * G.DAY;
    logs.push(G.session(ts, 'Futur', [
      G.exercise('Squat (Barre)', [G.workSet(120, 5, 8)], { ts: ts, isPrimary: true })
    ], { id: 'future-1' }));
  }

  // 5) Séance DUPLIQUÉE : même shortDate + même titre que 'clean-1'.
  {
    const ts = now - 3 * G.DAY - 3600000; // même jour, heure différente
    const dup = G.session(ts, 'Jambes', [
      G.exercise('Squat (Barre)', [G.workSet(100, 5, 8)], { ts: ts, isPrimary: true })
    ], { id: 'dup-1' });
    dup.shortDate = logs[0].shortDate; // force le même shortDate exact
    logs.push(dup);
  }

  // 6) Unités douteuses : 315 « kg » (= 315 lbs ≈ 143 kg mal saisis) chez bw 80.
  {
    const ts = now - 8 * G.DAY;
    logs.push(G.session(ts, 'Unités ?', [
      G.exercise('Squat (Barre)', [G.workSet(315, 5, 8)], { ts: ts, isPrimary: true }) // ×3.9 bw : absurde
    ], { id: 'units-1' }));
  }

  // 7) Exercice sans allSets ni series (champ manquant) — juste un nom + maxRM.
  {
    const ts = now - 10 * G.DAY;
    const s = G.session(ts, 'Partielle', [], { id: 'sparse-1' });
    s.exercises.push({ name: 'Soulevé de Terre (Barre)', maxRM: 160, isPrimary: true }); // squelette minimal
    logs.push(s);
  }

  p.logs = logs.sort(function (a, b) { return b.timestamp - a.timestamp; });
  // recomputeBestPR : la 'units-1' 315kg va gonfler bestPR.squat à 315 → VOULU
  // (démontre l'absence de garde-fou outlier ; voir finding rapport).
  G.recomputeBestPR(p);
  return p;
}

module.exports = {
  name: 'donnees_sales',
  description: 'Noms inconnus/typos, 0 kg / 0 reps, timestamp futur, doublon, unités douteuses.',
  stresses: 'Robustesse parsing ; exclusion séance future des fenêtres ; dédup ; getSBDType sur bruit ; absence de garde-fou outlier.',
  build
};
