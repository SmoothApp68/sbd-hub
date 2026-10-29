/** @jest-environment node */
//
// 186 — LA « SÉRIE DE TEST » (`sets.type_serie = 'test'`, v2_117, décision d'Aurélien du 29/10/2026).
//
// Une série que la personne déclare comme un max tenté : une série de travail pour tout ce qui compte ce qui a été fait
// (records, maximum estimé, volume), jamais une charge de travail (le palier : `v2-hors-palier.test.js`). Ici : le type existe,
// se choisit dans le menu ⋯ de la série, et ne déclenche pas la question de saisie « Ton meilleur ici ».

process.env.TZ = 'Europe/Paris';
global.self = global;
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
const S = require('../../v2/js/seance.js');
const fs = require('fs');
const path = require('path');

const serie = (extra) => Object.assign({ charge_kg: 190, reps: 1, type_serie: 'test', exercise_slug: 'sq' }, extra || {});

describe('186 — le type « test »', () => {
  test('il est connu du modèle et de la saisie', () => {
    expect(Modele.TYPES_CONNUS).toContain('test');
    expect(S.TYPES).toContain('test');
  });
  test('une série de test est une série de travail pour les faits (records, volume), et se dit « test »', () => {
    expect(Modele.estTravail(serie())).toBe(true);
    expect(Modele.estTest(serie())).toBe(true);
    expect(Modele.motDEchec(serie())).toBe('test');
    expect(Modele.typeLu(serie())).toBe('travail');
  });
  test('« Non, ne compte pas » l’emporte sur le type : une série de test hors calcul n’est ni travail ni test', () => {
    expect(Modele.estTravail(serie({ hors_calcul: true }))).toBe(false);
    expect(Modele.estTest(serie({ hors_calcul: true }))).toBe(false);
    expect(Modele.motDEchec(serie({ hors_calcul: true }))).toBe('hors calcul');
  });
  test('une autre série reste ce qu’elle était', () => {
    expect(Modele.estTest(serie({ type_serie: 'travail' }))).toBe(false);
    expect(Modele.estTest(null)).toBe(false);
    expect(Modele.motDEchec(serie({ type_serie: 'travail' }))).toBe(null);
  });
  test('changerType accepte « test » et refuse un type inconnu', () => {
    const seance = { exercices: [{ exercise_slug: 'sq', series: [{ type_serie: 'travail', charge_kg: 190, reps: 1 }] }] };
    const f = S.changerType(seance, 0, 0, 'test');
    expect(f.exercices[0].series[0].type_serie).toBe('test');
    expect(S.changerType(seance, 0, 0, 'max').exercices[0].series[0].type_serie).toBe('travail');
  });
  test('le menu ⋯ de la série propose « Série de test », une fois, jamais sur chaque ligne', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../v2/js/rendu.js'), 'utf8');
    expect(src.match(/\['test', 'Série de test'/g)).toHaveLength(1);
    const i = src.indexOf('var LIBELLE_TYPE');
    const menu = src.slice(i, src.indexOf('];', i));
    expect(menu).toContain("'test'");
  });
});
