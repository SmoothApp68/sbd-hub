/** @jest-environment node */
//
// « Les mots disent vrai » PR 2 — « Cible faite » / « Pas encore » (MOTEUR §9.44, I163). UN prédicat, `Moteur.cibleFaite`, lu par le verdict ;
// le verdict ne contredit jamais le chiffre que la personne a sous les yeux, dans les deux sens. Chiffres, charges et montées inchangés.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');

const esp = (s) => String(s).replace(/[\u00a0\u202f]/g, ' ');
const D = '2026-09-20T18:00:00+00:00';

// `reps` : les séries faites AUJOURD'HUI à `charge` (sauf `serieDe` : séries brutes) ; `niveau` : le niveau validé que la consigne d'après a calculé.
function cas(reps, o) {
  o = Object.assign({ vise: 8, n: 3, charge: 70, niveau: undefined, reglage: 'normal', haut: null, aide: false, lues: 5, serieDe: null }, o || {});
  const series = o.serieDe || reps.map((r) => ({ charge_kg: o.charge, reps: r }));
  const palierApres = o.palierApres === undefined ? o.charge : o.palierApres;
  const cAv = { etat: 'progression', zone: null, palier: o.charge, niveau: o.vise, n: o.n, ligne: { charge: o.charge, vise: o.vise },
    haut: o.haut, _lues: o.lues, fondement: { date: '2026-09-13T18:00:00+00:00', reps: [o.vise, o.vise, o.vise] } };
  const cAp = { etat: 'progression', zone: null, palier: palierApres, niveau: o.niveau, n: o.n, ligne: { charge: palierApres, vise: o.niveau + 1 }, haut: null,
    fondement: { date: D, reps: reps, seance: series } };
  const c = M.constatDuJour(cAv, cAp, o.reglage, null, { series: series, montee: null }, D, false);
  return { texte: c && esp(c.verdict), cible: c && c.cible, cf: M.cibleFaite(cAv, cAp, series) };
}

describe('I163 — Cible faite : niveau validé ≥ cible, même charge, toutes les séries couvertes', () => {
  test('8, 8, 8 pour 70 kg × 8 : « Cible faite »', () => {
    const r = cas([8, 8, 8], { niveau: 8 });
    expect(r.texte).toBe('Cible faite : 70 kg × 8, 8, 8.');
    expect(r.cible.etat).toBe('faite');
  });
  test('8, 8, 7 : « Cible faite », la tolérance de 1 rep du moteur est NOMMÉE', () => {
    const r = cas([8, 8, 7], { niveau: 8 });
    expect(r.texte).toBe('Cible faite : 70 kg × 8, 8, 7. Une série à une rep sous la cible est tolérée.');
    expect(r.cf.toleres).toBe(1);
  });
  test('8, 8, 6 : « Pas encore », avec l\'écart chiffré', () => {
    const r = cas([8, 8, 6], { niveau: 6 });
    expect(r.texte).toBe('Pas encore : 70 kg × 8, 8, 6 pour une cible de 8.');
    expect(r.cible.etat).toBe('pas_encore');
  });
  test('7, 7, 7 pour une cible de 8 : « Pas encore »', () => {
    expect(cas([7, 7, 7], { niveau: 7 }).texte).toBe('Pas encore : 70 kg × 7, 7, 7 pour une cible de 8.');
  });
  test('Franc : 8, 4, 4 pour une cible de 8 n\'est PAS « Cible faite » (le niveau validé est 4, pas la meilleure série)', () => {
    const r = cas([8, 4, 4], { niveau: 4, reglage: 'franc' });
    expect(r.texte).not.toMatch(/^Cible faite/);
    expect(r.cf.etat).not.toBe('faite');
    expect(r.texte).toMatch(/^Pas encore : 70 kg × 8, 4, 4 pour une cible de 8\.$/);
  });
  test('une charge différente (72,5 kg × 6, 6, 6 pour 70 kg × 8) ne se juge pas : neutre', () => {
    const r = cas([6, 6, 6], { niveau: 6, charge: 70, palierApres: 72.5,
      serieDe: [72.5, 72.5, 72.5].map((c) => ({ charge_kg: c, reps: 6 })) });
    expect(r.cf.etat).toBe('neutre');
    expect(r.texte).not.toMatch(/Pas encore|Cible faite/);
  });
  test('des séries faites à une AUTRE charge que la ligne ne se jugent pas, même si la consigne d\'après reste à la charge de la ligne', () => {
    const r = cas([8, 8, 8], { niveau: 8, serieDe: [72.5, 72.5, 72.5].map((c) => ({ charge_kg: c, reps: 8 })) });
    expect(r.cf.etat).toBe('neutre');
  });
  test('2 séries sur 3 : jamais « Cible faite » ni « Pas encore »', () => {
    const r = cas([8, 8], { niveau: 8 });
    expect(r.cf.etat).toBe('neutre');
    expect(r.texte).not.toMatch(/Pas encore|Cible faite/);
  });
  test('une série en plus qui fait tomber le niveau (8, 8, 8, 6) : neutre, jamais « Pas encore »', () => {
    const r = cas([8, 8, 8, 6], { niveau: 7 });
    expect(r.cf.etat).toBe('neutre');
    expect(r.texte).not.toMatch(/Pas encore|Cible faite/);
  });
  test('une série en plus à la cible (8, 8, 8, 8) : « Cible faite » (la série de plus ne juge pas)', () => {
    expect(cas([8, 8, 8, 8], { niveau: 8 }).cf.etat).toBe('faite');
  });
  test('une aide (charge négative) : « plus lourd » est inversé, le prédicat se juge à charge égale seulement', () => {
    const r = cas([8, 8, 8], { niveau: 8, charge: -20 });
    expect(r.cf.etat).toBe('faite');
    const autre = cas([8, 8, 8], { niveau: 8, charge: -20, palierApres: -15,
      serieDe: [-15, -15, -15].map((c) => ({ charge_kg: c, reps: 8 })) });
    expect(autre.cf.etat).toBe('neutre');
  });
  test('au poids du corps (charge 0) : « Cible faite : Poids du corps × 8, 8, 8. »', () => {
    expect(cas([8, 8, 8], { niveau: 8, charge: 0 }).texte).toMatch(/^Cible faite : Poids du corps × 8, 8, 8\.$/);
  });
  test('une ligne haute (test proposé) non faite : nommée, jamais « Cible faite »', () => {
    const r = cas([8, 8], { niveau: 8, n: 3, haut: { charge: 72.5, vise: 5, k: 1 },
      serieDe: [70, 70].map((c) => ({ charge_kg: c, reps: 8 })) });
    expect(r.texte).not.toMatch(/^Cible faite/);
    const sans = cas([8, 8, 8], { niveau: 8, n: 3, haut: { charge: 72.5, vise: 5, k: 1 } });
    expect(sans.cf.etat).toBe('test_non_fait');
    expect(sans.texte).toBe('Aujourd\'hui : 70 kg × 8, 8, 8. Le test à 72,5 kg n\'a pas été fait.');
  });
  test('un test proposé à charge inconnue (« le cran au-dessus ») se nomme sans chiffre', () => {
    const r = cas([8, 8, 8], { niveau: 8, n: 3, haut: { charge: null, vise: 5, k: 1 } });
    expect(r.cf.etat).toBe('test_non_fait');
    expect(r.texte).toBe('Aujourd\'hui : 70 kg × 8, 8, 8. Le test n\'a pas été fait.');
  });
  test('un zéro rep ou une histoire d\'une seule séance : jamais « Pas encore »', () => {
    expect(cas([7, 7, 7], { niveau: 7, lues: 1 }).texte).not.toMatch(/^Pas encore/);
  });
  test('une chute (plus d\'une rep sous la cible) ne se juge pas en « Cible faite »', () => {
    expect(cas([8, 8, 5], { niveau: 8 }).cf.etat).not.toBe('faite');
  });
});
