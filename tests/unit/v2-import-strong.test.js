/**
 * 269 — importer depuis Strong, second lecteur à côté de Hevy (`THImportHevy.lireStrong`).
 *
 * Les fixtures sont ÉCRITES ICI, au format exact des deux en-têtes relevés le 07/11/2026 (aucune copie d'un fichier
 * tiers). Ce que ce fichier prouve :
 *   · la détection du format sur l'en-tête (Hevy, Strong ancien, Strong nouveau, rien) ;
 *   · les deux formats rendent LA MÊME forme de séance que Hevy ; kg et lbs (l'ancien : l'unité se DEMANDE) ;
 *   · durée (ancien « 2h 38m », nouveau en secondes), distance, secondes, RPE, notes ;
 *   · un « Set Order » non numérique n'est JAMAIS deviné : le fichier est refusé, la valeur nommée ;
 *   · un nom inconnu reste « à rattacher » ; un nom Strong déjà rattaché (alias) se résout par la table existante ;
 *   · l'aperçu (anti-doublon Hevy) et `seanceAEcrire` s'appliquent tels quels.
 */
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/routines.js');
const I = require('../../v2/js/importhevy.js');

const ANCIEN = [
  'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE',
  '2022-09-21 10:26:28,"Wednesday",2h 38m,"Squat (Barbell)",1,100.0,5,0,0,"belle série","Jambes lourdes",8',
  '2022-09-21 10:26:28,"Wednesday",2h 38m,"Squat (Barbell)",2,102.5,5.0,0,0,,,8.5',
  '2022-09-21 10:26:28,"Wednesday",2h 38m,"Bench Press (Barbell)",1,0,12,0,0,,,',
  '2022-09-21 10:26:28,"Wednesday",2h 38m,"Plank",1,0,0,0,45,,,',
  '2022-09-21 10:26:28,"Wednesday",2h 38m,"Rameur",1,0,0,2000,600,,,',
  '2022-09-23 18:00:00,"Friday",35m,"Squat (Barbell)",1,90,8,0,0,,,'
].join('\n');

const NOUVEAU = (unite) => [
  '"Workout #";"Date";"Workout Name";"Duration (sec)";"Exercise Name";"Set Order";"Weight (' + unite + ')";"Reps";"RPE";"Distance (meters)";"Seconds";"Notes";"Workout Notes"',
  '"1";"2025-04-29 12:00:00";"Chest and Triceps";"3600";"Bench Press (Barbell)";"1";"100.0";"10";"7.5";"";"";"top";"Bonne forme"',
  '"1";"2025-04-29 12:00:00";"Chest and Triceps";"3600";"Bench Press (Barbell)";"2";"100.0";"9";"";"";"";"";""',
  '"1";"2025-04-29 12:00:00";"Chest and Triceps";"3600";"Squat (Barbell)";"1";"140";"3";"";"";"";"";""',
  '"1";"2025-04-29 12:00:00";"Chest and Triceps";"3600";"Course";"1";"0";"0";"";"5000";"1500";"";""',
  '"2";"2025-05-02 08:05:00";"Legs";"";"Squat (Barbell)";"1";"140";"3";"";"";"";"";""'
].join('\n');

describe('formatDuCsv', () => {
  test('reconnaît Hevy, Strong ancien, Strong nouveau (kg et lbs), et rien', () => {
    expect(I.formatDuCsv(ANCIEN)).toEqual({ format: 'strong-ancien', unite: null });
    expect(I.formatDuCsv(NOUVEAU('kg'))).toEqual({ format: 'strong-nouveau', unite: 'kg' });
    expect(I.formatDuCsv(NOUVEAU('lbs'))).toEqual({ format: 'strong-nouveau', unite: 'lbs' });
    expect(I.formatDuCsv('title,start_time,exercise_title\n').format).toBe('hevy');
    expect(I.formatDuCsv('date,weight_kg\n2023-10-23,80').format).toBe(null);
    expect(I.formatDuCsv('').format).toBe(null);
    expect(I.formatDuCsv('﻿' + ANCIEN).format).toBe('strong-ancien');
  });
  test('un ancien sans les colonnes facultatives (Notes, RPE…) est reconnu', () => {
    expect(I.formatDuCsv('Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,RPE\n').format)
      .toBe('strong-ancien');
  });
});

describe('Strong ancien', () => {
  test('il faut l’unité : sans elle, on la demande', () => {
    expect.assertions(2);
    try { I.lireStrong(ANCIEN); } catch (e) { expect(e.uniteRequise).toBe(true); expect(e.pasUnExport).toBe(true); }
  });
  test('kg : séances, exercices, séries, durée « 2h 38m », notes, RPE', () => {
    const s = I.lireStrong(ANCIEN, { unite: 'kg' });
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ titre: 'Wednesday', debut_local: '2022-09-21T10:26', fin_local: '2022-09-21T13:04',
      note: 'Jambes lourdes', ref: 'strong:2022-09-21T10:26:00' });
    expect(s[0].exercices.map((e) => e.nom)).toEqual(['Squat (Barbell)', 'Bench Press (Barbell)', 'Plank', 'Rameur']);
    const sq = s[0].exercices[0];
    expect(sq.note).toBe('belle série');
    expect(sq.series).toEqual([
      { type_serie: 'travail', charge_kg: 100, reps: 5, duree_s: null, distance_m: null, rpe: 8 },
      { type_serie: 'travail', charge_kg: 102.5, reps: 5, duree_s: null, distance_m: null, rpe: 8.5 }
    ]);
    expect(s[1]).toMatchObject({ fin_local: '2022-09-23T18:35' });
  });
  test('secondes lues ; distance SANS unité jamais devinée (non importée) ; 0 = vide', () => {
    const e = I.lireStrong(ANCIEN, { unite: 'kg' })[0].exercices;
    expect(e[1].series[0]).toMatchObject({ charge_kg: null, reps: 12 });
    expect(e[2].series[0]).toMatchObject({ reps: null, duree_s: 45, distance_m: null });
    expect(e[3].series[0]).toMatchObject({ duree_s: 600, distance_m: null });
  });
  test('lbs → kg avec la conversion de Hevy (au dixième)', () => {
    const sq = I.lireStrong(ANCIEN, { unite: 'lbs' })[0].exercices[0];
    expect(sq.series[0].charge_kg).toBe(45.4);   // 100 lb
    expect(sq.series[1].charge_kg).toBe(46.5);   // 102,5 lb
  });
  test('durées : « 38min », « 35m », « 2h »', () => {
    const f = (d) => I.lireStrong(ANCIEN.split('\n')[0] + '\n2022-09-21 10:00:00,"A",' + d + ',"X",1,10,5,0,0,,,', { unite: 'kg' })[0].fin_local;
    expect(f('38min')).toBe('2022-09-21T10:38');
    expect(f('35m')).toBe('2022-09-21T10:35');
    expect(f('2h')).toBe('2022-09-21T12:00');
    expect(f('n’importe quoi')).toBe(null);
  });
  test('colonnes facultatives absentes : lu quand même', () => {
    const t = 'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,RPE\n' +
      '2024-11-28 17:36:08,B,35m,Bent Over Row (Barbell),1,10.0,13.0,0,0.0,';
    const s = I.lireStrong(t, { unite: 'kg' });
    expect(s[0].note).toBe(null);
    expect(s[0].exercices[0].series[0]).toEqual({ type_serie: 'travail', charge_kg: 10, reps: 13, duree_s: null, distance_m: null, rpe: null });
  });
});

describe('Strong nouveau', () => {
  test('l’unité vient de l’en-tête : kg', () => {
    const s = I.lireStrong(NOUVEAU('kg'));
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ titre: 'Chest and Triceps', debut_local: '2025-04-29T12:00', fin_local: '2025-04-29T13:00',
      note: 'Bonne forme', ref: 'strong:2025-04-29T12:00:00' });
    expect(s[0].exercices[0].note).toBe('top');
    expect(s[0].exercices[0].series[0]).toEqual({ type_serie: 'travail', charge_kg: 100, reps: 10, duree_s: null, distance_m: null, rpe: 7.5 });
    expect(s[0].exercices[0].series).toHaveLength(2);
    expect(s[1].fin_local).toBe(null);   // durée vide : jamais devinée
  });
  test('lbs dans l’en-tête : converti, sans rien demander', () => {
    const s = I.lireStrong(NOUVEAU('lbs'));
    expect(s[0].exercices[0].series[0].charge_kg).toBe(45.4);
    expect(s[0].exercices[1].series[0].charge_kg).toBe(63.5);   // 140 lb
  });
  test('distance en mètres et secondes lues', () => {
    const c = I.lireStrong(NOUVEAU('kg'))[0].exercices[2].series[0];
    expect(c).toMatchObject({ charge_kg: null, reps: null, distance_m: 5000, duree_s: 1500 });
  });
  test('un nouvel exercice commence quand le nom change OU que Set Order repart à 1', () => {
    const t = NOUVEAU('kg').split('\n').slice(0, 1).concat([
      '"1";"2025-04-29 12:00:00";"A";"60";"Squat (Barbell)";"1";"100";"5";"";"";"";"";""',
      '"1";"2025-04-29 12:00:00";"A";"60";"Squat (Barbell)";"2";"100";"5";"";"";"";"";""',
      '"1";"2025-04-29 12:00:00";"A";"60";"Squat (Barbell)";"1";"90";"8";"";"";"";"";""'
    ]).join('\n');
    expect(I.lireStrong(t)[0].exercices.map((e) => e.series.length)).toEqual([2, 1]);
  });
});

describe('ce qui n’est jamais deviné', () => {
  const avecType = (v) => NOUVEAU('kg') + '\n"3";"2025-05-03 09:00:00";"Z";"60";"Squat (Barbell)";"' + v + '";"60";"5";"";"";"";"";""';
  test.each(['W', 'D', 'F', 'Rest Timer'])('Set Order « %s » : fichier refusé, valeur nommée', (v) => {
    expect.assertions(2);
    try { I.lireStrong(avecType(v)); } catch (e) { expect(e.pasUnExport).toBe(true); expect(e.typeInconnu).toBe(v); }
  });
  test('Set Order vide aussi', () => {
    expect.assertions(1);
    try { I.lireStrong(avecType('')); } catch (e) { expect(e.typeInconnu).toBe(''); }
  });
  test('le message nomme la valeur', () => {
    expect(I.MESSAGES.strongType('W')).toContain('« W »');
  });
  test('date illisible, répétitions décimales : refus, pas de demi-lecture', () => {
    expect(() => I.lireStrong(NOUVEAU('kg').replace('2025-04-29 12:00:00', '29/04/2025'))).toThrow();
    expect(() => I.lireStrong(ANCIEN.replace(',5.0,', ',5.5,'), { unite: 'kg' })).toThrow();
  });
  test('un fichier Hevy ou autre n’est pas lu comme Strong', () => {
    expect(() => I.lireStrong('title,start_time,exercise_title\n', { unite: 'kg' })).toThrow();
    expect(() => I.lireStrong('a,b\n1,2')).toThrow();
  });
});

describe('noms, aperçu, écriture : ceux de Hevy', () => {
  const CATALOGUE = [{ nom: 'Squat (Barre)', slug: 'squat-barre' }];
  test('un nom Strong inconnu reste à rattacher ; un alias rattaché se résout', () => {
    const lues = I.lireStrong(NOUVEAU('kg'));
    const sans = I.apercu(lues, { sources: { catalogue: CATALOGUE }, base: [], fuseau: 'Europe/Paris' });
    const noms = I.nomsARattacher(sans, I.indexDesNoms({ catalogue: CATALOGUE }), {}).map((n) => n.nom);
    expect(noms).toEqual(['Bench Press (Barbell)', 'Squat (Barbell)', 'Course']);
    const idx = I.indexDesNoms({ catalogue: CATALOGUE, miens: [{ alias: 'Squat (Barbell)', exercise_slug: 'squat-barre' }] });
    expect(I.slugDuNom(idx, 'Squat (Barbell)')).toBe('squat-barre');
    expect(I.slugDuNom(idx, 'Squat (Machine)')).toBe(null);
  });
  test('seanceAEcrire : la forme de Hevy, ref « strong: », séries numérotées, heure UTC', () => {
    const idx = I.indexDesNoms({ miens: [{ alias: 'Squat (Barbell)', exercise_slug: 'squat-barre' }] });
    const [s] = I.apercu(I.lireStrong(NOUVEAU('kg')), { sources: { miens: [{ alias: 'Squat (Barbell)', exercise_slug: 'squat-barre' }] },
      base: [], fuseau: 'Europe/Paris' }).map((l) => l.seance);
    const m = I.seanceAEcrire(s, { seance: 'S', serie: (r) => 'x' + r }, idx, 'u');
    expect(m.source_ref).toBe('strong:2025-04-29T12:00:00');
    expect(m.exercices).toHaveLength(1);
    expect(m.exercices[0].series[0]).toMatchObject({ id: 'x1', charge_kg: 140, reps: 3, validee_a: null });
    expect(m.debut).toBe('2025-04-29T10:00:00Z');
    expect(m.fin).toBe('2025-04-29T11:00:00Z');
  });
});
