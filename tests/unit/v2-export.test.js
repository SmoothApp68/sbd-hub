// 207 — « Exporter mes données » : le module pur (JSON complet, CSV des séries).
const E = require('../../v2/js/export.js');

describe('THExport — CSV des séries', () => {
  const seances = [
    { id: 's2', debut: '2026-10-02T17:00:00Z', titre: 'Haut, "lourd"' },
    { id: 's1', debut: '2026-10-01T17:00:00Z', titre: 'Bas' }
  ];
  const series = [
    { id: 'b', session_id: 's2', exercise_slug: 'dc', rang: 1, charge_kg: 100, reps: 5, type_serie: 'travail', rpe: 8, note: 'a,b\nc' },
    { id: 'a', session_id: 's1', exercise_slug: 'sq', rang: 2, charge_kg: 60.5, reps: 8, type_serie: 'echauffement', rpe: null, note: null },
    { id: 'c', session_id: 's1', exercise_slug: 'sq', rang: 1, charge_kg: null, reps: 10, type_serie: 'travail', rpe: 9.5 },
    { id: 'd', session_id: 'absente', exercise_slug: 'inconnu', rang: 1 }
  ];
  const noms = { dc: 'Développé couché', sq: 'Squat' };
  const csv = E.csvSeances(seances, series, noms);

  test('BOM, CRLF, en-tête', () => {
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    expect(csv.slice(1).split('\r\n')[0]).toBe('date,seance,exercice,charge_kg,reps,type_serie,reserve,note');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
  test('une ligne par série, triée (date puis rang), noms du catalogue', () => {
    const l = csv.slice(1).split('\r\n');
    expect(l.length).toBe(1 + 4 + 1);
    expect(l[1]).toBe(',,inconnu,,,,,');
    expect(l[2]).toBe('2026-10-01T17:00:00Z,Bas,Squat,,10,travail,0.5,');
    expect(l[3]).toBe('2026-10-01T17:00:00Z,Bas,Squat,60.5,8,echauffement,,');
  });
  test('champs à virgule, guillemet, saut de ligne', () => {
    expect(csv).toContain('"Haut, ""lourd"""');
    expect(csv).toContain('"a,b\nc"');
    expect(csv).toContain(',100,5,travail,2,');
  });
  test('rien en entrée : l’en-tête seul', () => {
    expect(E.csvSeances([], [], {})).toBe(E.BOM + E.COLONNES_CSV.join(',') + '\r\n');
  });
});

describe('THExport — JSON et nom de fichier', () => {
  test('enveloppe fidèle, tables intactes', () => {
    const t = { sessions: [{ id: 1, titre: 'é' }], sets: [] };
    const o = JSON.parse(E.jsonComplet(t, Date.UTC(2026, 10, 1)));
    expect(o).toEqual({ app: 'TrainHub', version: 1, exporte_le: '2026-11-01T00:00:00.000Z', tables: t });
  });
  test('noms', () => {
    const d = Date.UTC(2026, 10, 1, 12);
    expect(E.nomDeFichier('csv', d)).toBe('trainhub-seances-2026-11-01.csv');
    expect(E.nomDeFichier('json', d)).toBe('trainhub-donnees-2026-11-01.json');
  });
});
