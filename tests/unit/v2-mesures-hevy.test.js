/** @jest-environment node */
//
// 246 (commit 5) — LES MESURES DE HEVY : le lecteur du CSV des pesées et l'AJOUT SEUL.
//   P3 : un jour déjà pesé n'est jamais remplacé (l'aperçu ET la ligne envoyée) ; deux lignes le même jour → une ;
//        une date future → écartée ; un en-tête inconnu → rien ; `weight_lbs` → refus avec sa raison ;
//        `ajouterPesees`, appelée avec un faux client, envoie `ignoreDuplicates: true`.
require('../../v2/js/modele.js');
require('../../v2/js/poids.js');
const I = require('../../v2/js/importhevy.js');
const Donnees = require('../../v2/js/donnees.js');

const AUJ = new Date(2026, 10, 5, 12, 0, 0);
const csv = (...l) => ['date,weight_kg,fat_percent,neck_cm', ...l].join('\n');

describe('lireMesuresCsv — le lecteur', () => {
  test('le jour est le TEXTE de la date ; seul le poids est lu (la masse grasse et les tours sont ignorés)', () => {
    const r = I.lireMesuresCsv(csv('"23 oct. 2023, 00:00",84.5,17.2,40', '"14 juil. 2025, 07:30",81,,'), AUJ);
    expect(r).toEqual({ pesees: [{ date: '2023-10-23', poids_kg: 84.5 }, { date: '2025-07-14', poids_kg: 81 }], ecartees: 0, raison: null });
  });
  test('deux lignes le même jour : la plus tôt dans la journée', () => {
    const r = I.lireMesuresCsv(csv('"23 oct. 2023, 19:00",85,,', '"23 oct. 2023, 06:45",84,,'), AUJ);
    expect(r.pesees).toEqual([{ date: '2023-10-23', poids_kg: 84 }]);
  });
  test('une date future, avant 1990 ou hors des bornes 20 < kg < 400 : écartée et comptée', () => {
    const r = I.lireMesuresCsv(csv('"6 nov. 2026, 08:00",80,,', '"31 déc. 1989, 08:00",80,,', '"1 mars 2024, 08:00",19.9,,',
      '"2 mars 2024, 08:00",400,,', '"3 mars 2024, 08:00",abc,,', '"4 mars 2024, 08:00",80,,', '"5 nov. 2026, 08:00",79,,'), AUJ);
    expect(r.pesees.map((p) => p.date)).toEqual(['2024-03-04', '2026-11-05']);
    expect(r.ecartees).toBe(5);
  });
  test('un en-tête inconnu : rien n’est lu (jamais deviné) ; weight_lbs seul : refusé avec sa raison', () => {
    expect(I.lireMesuresCsv('jour,poids\n"23 oct. 2023, 00:00",80', AUJ)).toEqual({ pesees: [], ecartees: 0, raison: 'entete' });
    expect(I.lireMesuresCsv('date,weight_lbs\n"23 oct. 2023, 00:00",180', AUJ)).toEqual({ pesees: [], ecartees: 0, raison: 'unite' });
    expect(I.lireMesuresCsv('', AUJ).raison).toBe('vide');
    expect(I.lireMesuresCsv('date,weight_kg', AUJ).raison).toBe('vide');
  });
  test('toutes les dates illisibles : raison « date » ; un fichier en anglais le dit (même drapeau que les séances)', () => {
    expect(I.lireMesuresCsv('date,weight_kg\n"hier",80', AUJ).raison).toBe('date');
    const en = I.lireMesuresCsv('date,weight_kg\n"23 Oct 2023 at 10:00",80', AUJ);
    expect(en.raison).toBe('date');
    expect(en.enAnglais).toBe(true);
  });
  test('plus de 5 000 lignes : refus', () => {
    const l = []; for (let i = 0; i < 5001; i++) l.push('"1 mars 2024, 08:00",80,,');
    expect(I.lireMesuresCsv(csv(...l), AUJ).raison).toBe('longueur');
    expect(I.MESURES_OCTETS_MAX).toBe(2 * 1024 * 1024);
  });
  test('une cellule qui commence par = + - @ n’est jamais réinterprétée : elle est écartée ou lue comme un nombre, rien d’autre', () => {
    const r = I.lireMesuresCsv(csv('"1 mars 2024, 08:00",=SOMME(A1),,', '"2 mars 2024, 08:00",-80,,'), AUJ);
    expect(r.pesees).toEqual([]);
    expect(r.ecartees).toBe(2);
  });
  test('détection : une colonne date et aucune colonne de séance → mesures', () => {
    expect(I.estUnCsvDeMesures(csv('x'))).toBe(true);
    expect(I.estUnCsvDeMesures('title,start_time,end_time,exercise_title,set_index')).toBe(false);
    expect(I.estUnCsvDeMesures('date,weight_lbs\n')).toBe(true);
    expect(I.estUnCsvDeMesures('date,poids\n2026-01-01,80')).toBe(false);   // inconnu : le chemin des séances, inchangé
  });
});

describe('apercuDesMesures — les jours déjà pesés gardent leur valeur', () => {
  const lue = I.lireMesuresCsv(csv('"1 oct. 2025, 08:00",90,,', '"2 oct. 2025, 08:00",89,,', '"3 oct. 2025, 08:00",88,,', '"4 oct. 2025, 08:00",500,,'), AUJ);
  test('P3 — un jour déjà pesé (source app) n’est ni dans ce qui part, ni compté comme importé', () => {
    const a = I.apercuDesMesures(lue, [{ date: '2025-10-02', poids_kg: 70, source: 'app' }]);
    expect(a.aImporter.map((p) => p.date)).toEqual(['2025-10-01', '2025-10-03']);
    expect(a).toMatchObject({ trouvees: 3, dejaLa: 1, ecartees: 1, du: '2025-10-01', au: '2025-10-03' });
    expect(I.phrasesDesMesures(a)).toEqual([
      '3 pesées trouvées · du 1 oct. 2025 au 3 oct. 2025',
      '1 jour déjà pesé dans TrainHub : ta pesée est gardée telle quelle.',
      '1 valeur hors des bornes : écartée.',
      'Seul le poids est importé.'
    ]);
    expect(I.libelleDImporterPesees(a.aImporter.length)).toBe('Importer 2 pesées');
  });
});

describe('ajouterPesees — un AJOUT SEUL', () => {
  test('P3 — envoie `ignoreDuplicates: true` sur (user_id, date) : jamais une fusion', async () => {
    const appels = [];
    globalThis.THClient = { obtenir: () => ({ from: (t) => ({ upsert: (lignes, opt) => { appels.push({ t, lignes, opt }); return Promise.resolve({ error: null }); } }) }) };
    await Donnees.ajouterPesees([{ user_id: 'u', date: '2025-10-01', poids_kg: 90, source: 'import_hevy' }]);
    expect(appels).toHaveLength(1);
    expect(appels[0].t).toBe('body_weight_log');
    expect(appels[0].opt).toEqual({ onConflict: 'user_id,date', ignoreDuplicates: true });
    await Donnees.ajouterPesees([]);
    expect(appels).toHaveLength(1);
    delete globalThis.THClient;
  });
});
