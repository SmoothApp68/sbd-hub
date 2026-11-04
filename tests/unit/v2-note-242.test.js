/** @jest-environment node */
//
// 242 — LA NOTE DE LA DERNIÈRE FOIS (ECRAN-SAISIE).
//
// Le fait (`faits.noteDeLaDerniereFois`, `faits.noteDeLExercice`) : dernière séance terminée, consigne de la routine exclue, note épinglée
// prioritaire, « Ne plus afficher », Hevy, plusieurs notes.
process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
require('../../v2/js/plan.js');
require('../../v2/js/semaine.js');
require('../../v2/js/generateur.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/parcours.js');
const Modele = global.THModele;
const Faits = require('../../v2/js/faits.js');
const F = Faits.creer();

const corpus = (seances, series) => ({
  seances, series: [].concat.apply([], Object.keys(series).map((k) => series[k])),
  seriesDe: (id) => series[id] || [], catalogue: () => ({ squat_barre: { nom: 'Squat barre', mesure: 'charge_reps', equipement: 'barre' } }),
});
const se = (id, jour, extra) => Object.assign({ id, debut: '2026-10-' + jour + 'T10:00:00Z', statut: 'terminee' }, extra || {});
const sr = (id, n, extra) => Object.assign({ id: id + n, session_id: id, exercise_slug: 'squat_barre', type_serie: 'travail',
  charge_kg: 100, reps: 5, rang: n, validee_a: '2026-10-' + '10T11:00:00Z', note: null, hors_calcul: false }, extra || {});

describe('faits.noteDeLaDerniereFois — le fait', () => {
  test('la dernière note de la dernière séance terminée où l’exercice a été fait', () => {
    const c = corpus([se('b', '20'), se('a', '10')], {
      a: [sr('a', 1, { note: 'vieille note' })],
      b: [sr('b', 1, { note: 'serrer les omoplates' }), sr('b', 2)],
    });
    expect(F.noteDeLaDerniereFois(c, 'squat_barre', [])).toEqual({ texte: 'serrer les omoplates', serieId: 'b1', jour: '2026-10-20' });
  });
  test('plusieurs notes dans la séance : la dernière (par rang)', () => {
    const c = corpus([se('b', '20')], { b: [sr('b', 2, { note: 'deuxième' }), sr('b', 1, { note: 'première' }), sr('b', 3, { note: 'troisième' })] });
    expect(F.noteDeLaDerniereFois(c, 'squat_barre', '').texte).toBe('troisième');
  });
  test('la note identique (espaces normalisés) à la consigne de la routine est exclue', () => {
    const c = corpus([se('b', '20')], { b: [sr('b', 1, { note: '  Pause   au fond  ' }), sr('b', 2, { note: 'Pause au fond' })] });
    expect(F.noteDeLaDerniereFois(c, 'squat_barre', 'Pause au fond')).toBeNull();
    expect(F.noteDeLaDerniereFois(c, 'squat_barre', ['autre', 'Pause au fond'])).toBeNull();
  });
  test('la consigne exclue, une vraie note dans la séance reste : c’est elle', () => {
    const c = corpus([se('b', '20')], { b: [sr('b', 1, { note: 'Pause au fond' }), sr('b', 2, { note: 'genou gauche tire' })] });
    expect(F.noteDeLaDerniereFois(c, 'squat_barre', 'Pause au fond').texte).toBe('genou gauche tire');
  });
  test('une dernière séance sans note ne remonte pas à la précédente : c’est la dernière FOIS', () => {
    const c = corpus([se('b', '20'), se('a', '10')], { a: [sr('a', 1, { note: 'ancienne' })], b: [sr('b', 1)] });
    expect(F.noteDeLaDerniereFois(c, 'squat_barre', [])).toBeNull();
  });
  test('une séance en cours, la séance ouverte, une séance sans série de travail de l’exercice : ignorées', () => {
    const c = corpus([se('c', '25', { statut: 'en_cours' }), se('b', '20'), se('a', '10')], {
      c: [sr('c', 1, { note: 'en cours' })],
      b: [sr('b', 1, { type_serie: 'echauffement', note: 'chauffe seule' })],
      a: [sr('a', 1, { note: 'la bonne' })],
    });
    expect(F.noteDeLaDerniereFois(c, 'squat_barre', []).texte).toBe('la bonne');
    const c2 = corpus([se('b', '20'), se('a', '10')], { a: [sr('a', 1, { note: 'la bonne' })], b: [sr('b', 1, { note: 'ouverte' })] });
    expect(F.noteDeLaDerniereFois(c2, 'squat_barre', [], 'b').texte).toBe('la bonne');
  });
  test('Hevy compris : une séance importée (source hevy, validee_a nulle) porte sa note', () => {
    const c = corpus([se('h', '12', { source: 'hevy' })], { h: [sr('h', 1, { source: 'hevy', validee_a: null, note: 'barre un cran plus bas' })] });
    expect(F.noteDeLaDerniereFois(c, 'squat_barre', []).texte).toBe('barre un cran plus bas');
  });
  test('les mots ne sont pas réécrits (rognés aux bords seulement)', () => {
    const c = corpus([se('b', '20')], { b: [sr('b', 1, { note: '  GENOU gauche   tire !!  ' })] });
    expect(F.noteDeLaDerniereFois(c, 'squat_barre', []).texte).toBe('GENOU gauche   tire !!');
  });
});

describe('faits.noteDeLExercice — ce que l’écran montre', () => {
  const fait = { texte: 'genou gauche tire', serieId: 'b1', jour: '2026-10-28' };
  test('la note épinglée prime, sans date', () => {
    expect(F.noteDeLExercice(fait, { squat_barre: { texte: ' ma note ', a: 'x' } }, 'squat_barre'))
      .toEqual({ mode: 'epinglee', texte: 'ma note', jour: null, serieId: null });
  });
  test('sans note épinglée : celle de la dernière fois', () => {
    expect(F.noteDeLExercice(fait, {}, 'squat_barre')).toEqual({ mode: 'derniere', texte: 'genou gauche tire', jour: '2026-10-28', serieId: 'b1' });
    expect(F.noteDeLExercice(fait, null, 'squat_barre').mode).toBe('derniere');
  });
  test('« Ne plus afficher » : masquée si elle désigne la série qui porte la note', () => {
    expect(F.noteDeLExercice(fait, { squat_barre: { masquee: 'b1', a: 'x' } }, 'squat_barre')).toBeNull();
  });
  test('une note plus récente (une autre série) revient malgré un masquage d’avant', () => {
    expect(F.noteDeLExercice({ texte: 'neuve', serieId: 'z1', jour: '2026-11-02' }, { squat_barre: { masquee: 'b1', a: 'x' } }, 'squat_barre').texte).toBe('neuve');
  });
  test('une note épinglée vide ne vaut pas : retour à la dernière fois', () => {
    expect(F.noteDeLExercice(fait, { squat_barre: { texte: '   ', a: 'x' } }, 'squat_barre').mode).toBe('derniere');
  });
  test('rien à montrer sans fait ni note épinglée', () => {
    expect(F.noteDeLExercice(null, {}, 'squat_barre')).toBeNull();
  });
});

describe('profiles.notes_exercices', () => {
  const Profil = global.THProfil;
  test('lue, écrite, un objet seulement', () => {
    expect(Profil.CHAMPS_ECRITS).toContain('notes_exercices');
    const v = { squat_barre: { texte: 'x', a: '2026-11-04T10:00:00Z' } };
    expect(Profil.champsEcrits({ notes_exercices: v })).toEqual({ notes_exercices: v });
    expect(Profil.champsEcrits({ notes_exercices: ['x'] })).toEqual({});
    expect(Profil.champsEcrits({ notes_exercices: null })).toEqual({});
  });
  test('FACULTATIVE : le profil se lit et s’écrit sans elle si la base ne l’a pas', () => {
    const fs = require('fs'), path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../../v2/js/donnees.js'), 'utf8');
    expect(src).toMatch(/COLONNES_FACULTATIVES = \[[^\]]*'notes_exercices'/);
  });
});
