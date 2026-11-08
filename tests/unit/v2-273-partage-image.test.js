/** @jest-environment node */
//
// 273 — « PARTAGER EN IMAGE » : la construction PURE de l'écran `e` d'un record et d'une séance (`partage-image.js`), sans canevas.

process.env.TZ = 'Europe/Paris';

global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/poids.js');
require('../../v2/js/moteur.js');
const PI = require('../../v2/js/partage-image.js');

const DEBUT = '2026-11-08T17:30:00.000Z';
const serie = (charge, reps, extra) => Object.assign({ charge_kg: charge, reps: reps, type_serie: 'travail' }, extra || {});
const record = (extra) => Object.assign({ kind: 'charge', valeur: 100, ancien: 95, ancien_le: '2026-09-21T10:00:00.000Z' }, extra || {});
const entree = (extra) => Object.assign({ debut: DEBUT, seanceId: 's1', slug: 'developpe_couche_barre', nom: 'Développé couché',
  serie: serie(100, 3), record: record(), paris: [], courbe: [], pesees: [], corps: null }, extra || {});
const pesee = (jour, kg) => ({ date: jour, poids_kg: kg });

describe('le record', () => {
  test('avec un record d\'avant : l\'écart dans l\'unité, la date de l\'ancien', () => {
    const e = PI.ecranRecord(entree());
    expect(e.partage.sur).toBe('Record · 8 nov. 2026');
    expect(e.partage.chiffre).toBe('100 kg × 3');
    expect(e.partage.ecart).toBe('5 kg de plus que ton record d’avant, posé le 21 sept. 2026.');
    expect(e.fichier).toBe('trainhub-record-developpe-couche-barre-2026-11-08.png');
  });
  test('sans record d\'avant : pas de phrase d\'écart', () => {
    expect(PI.ecranRecord(entree({ record: record({ ancien: null, ancien_le: null }) })).partage.ecart).toBeNull();
  });
  test('une durée : l\'écart dans son unité', () => {
    const e = PI.ecranRecord(entree({ serie: { duree_s: 90, type_serie: 'travail' }, record: { kind: 'duree', valeur: 90, ancien: 75, ancien_le: '2026-10-01T10:00:00Z' } }));
    expect(e.partage.ecart).toBe('15 s de plus que ton record d’avant, posé le 1 oct. 2026.');
  });
  test('le pari tenu sur cette série s\'écrit, un pari raté ou d\'une autre série non', () => {
    const tenu = { seance: 's1', exercice: 'developpe_couche_barre', predite: 3, observee: 3, charge: 100 };
    expect(PI.ecranRecord(entree({ paris: [tenu] })).partage.pari).toBe('Le coach l’avait annoncé : 100 kg × 3, tenu.');
    expect(PI.ecranRecord(entree({ paris: [Object.assign({}, tenu, { observee: 2 })] })).partage.pari).toBeNull();
    expect(PI.ecranRecord(entree({ paris: [Object.assign({}, tenu, { seance: 's0' })] })).partage.pari).toBeNull();
    expect(PI.ecranRecord(entree({ paris: [Object.assign({}, tenu, { charge: 90 })] })).partage.pari).toBeNull();
    expect(PI.ecranRecord(entree()).partage.pari).toBeNull();
  });
  test('le rapport au poids : une pesée de 10 jours oui, de 20 jours non', () => {
    expect(PI.ecranRecord(entree({ pesees: [pesee('2026-10-29', 81.3)] })).partage.rapport).toBe('1,23 × PDC');
    expect(PI.ecranRecord(entree({ pesees: [pesee('2026-10-19', 81.3)] })).partage.rapport).toBeNull();
    expect(PI.ecranRecord(entree({ pesees: [] })).partage.rapport).toBeNull();
  });
  test('la courbe : du premier record au dernier, étiquettes à gauche et à droite', () => {
    const c = PI.ecranRecord(entree({ courbe: [{ date: '2026-11-08T17:30:00Z', valeur: 100 }, { date: '2026-01-10T10:00:00Z', valeur: 60 }, { date: '2026-06-01T10:00:00Z', valeur: 80 }] })).partage.courbe;
    expect(c.gauche).toEqual({ date: '10 janv. 2026', valeur: '60 kg' });
    expect(c.droite.valeur).toBe('100 kg');
    expect(c.points[0]).toEqual({ x: 0, y: 0 });
    expect(c.points[2]).toEqual({ x: 1, y: 1 });
    expect(PI.ecranRecord(entree({ courbe: [{ date: DEBUT, valeur: 100 }] })).partage.courbe).toBeNull();
  });
  test('les muscles : les trois premiers, par séries', () => {
    const corps = { volume: { pectoraux: 3, triceps: 1, epaules: 2, biceps: 0 }, libelles: { pectoraux: 'Pectoraux', triceps: 'Triceps', epaules: 'Épaules', biceps: 'Biceps' } };
    expect(PI.ecranRecord(entree({ corps: corps })).partage.muscles).toBe('Pectoraux, Épaules, Triceps');
  });
});

describe('la séance', () => {
  const exo = (nom, series) => ({ nom: nom, series: series });
  const n = (k) => Array.from({ length: k }, (_, i) => exo('Exo ' + (i + 1), [serie(20 + i, 10)]));
  const seance = (exercices, records) => PI.ecranSeance({ debut: DEBUT, titre: 'Haut du corps', exercices: exercices, records: records || [] });

  test('3 exercices : une ligne chacun, la meilleure série, taille pleine, une colonne', () => {
    const e = seance([exo('Squat', [serie(100, 5), serie(110, 3)]), exo('Couché', [serie(80, 8)]), exo('Rowing', [serie(60, 10)])]);
    expect(e.partage.sur).toBe('Haut du corps · 8 nov. 2026');
    expect(e.partage.titre).toBe('La meilleure série de chaque exercice');
    expect(e.partage.lignes).toEqual([{ n: 'Squat', v: '110 kg × 3' }, { n: 'Couché', v: '80 kg × 8' }, { n: 'Rowing', v: '60 kg × 10' }]);
    expect(e.partage.taille).toBe(50);
    expect(e.partage.colonnes).toBe(1);
    expect(e.fichier).toBe('trainhub-seance-2026-11-08.png');
  });
  test('9 exercices : tous là, la police rétrécit, une colonne', () => {
    const e = seance(n(9));
    expect(e.partage.lignes).toHaveLength(9);
    expect(e.partage.taille).toBeLessThan(50);
    expect(e.partage.colonnes).toBe(1);
    expect(seance(n(8)).partage.taille).toBe(50);
  });
  test('14 exercices : encore une colonne ; 16 : deux colonnes, aucun n\'est retiré', () => {
    expect(seance(n(14)).partage.colonnes).toBe(1);
    const e = seance(n(16));
    expect(e.partage.lignes).toHaveLength(16);
    expect(e.partage.colonnes).toBe(2);
  });
  test('haltères : le total de la paire, tel quel (jamais « 2 × 12 kg »)', () => {
    const e = seance([exo('Curl', [serie(24, 15)])]);
    expect(e.partage.lignes[0].v).toBe('24 kg × 15');
  });
  test('une chauffe plus lourde, un recul plus lourd : exclus de la meilleure série', () => {
    const e = seance([exo('Squat', [serie(140, 3, { type_serie: 'echauffement' }), serie(120, 5, { type_serie: 'recul' }), serie(100, 5)])]);
    expect(e.partage.lignes[0].v).toBe('100 kg × 5');
    expect(PI.meilleureSerie([serie(140, 3, { type_serie: 'echauffement' })])).toBeNull();
    expect(seance([exo('Squat', [serie(60, 5, { type_serie: 'echauffement' })])]).partage.lignes).toEqual([]);
  });
  test('à charge égale, le plus de reps ; sans charge, le plus de reps ; une tenue, la plus longue', () => {
    expect(PI.meilleureSerie([serie(100, 3), serie(100, 5)]).reps).toBe(5);
    expect(PI.meilleureSerie([{ reps: 8, type_serie: 'travail' }, { reps: 12, type_serie: 'travail' }]).reps).toBe(12);
    expect(PI.meilleureSerie([{ duree_s: 30 }, { duree_s: 45 }]).duree_s).toBe(45);
  });
  test('les records : « 1 record : … », « 2 records : … », rien sans record', () => {
    expect(seance(n(2), ['Développé couché']).partage.records).toBe('1 record : développé couché.');
    expect(seance(n(2), ['Développé couché', 'Squat', 'Squat']).partage.records).toBe('2 records : développé couché et squat.');
    expect(seance(n(2)).partage.records).toBeNull();
  });
  test('jamais de durée, de tonnage ni de compte de séances dans l\'écran', () => {
    const t = JSON.stringify(seance(n(3), ['Squat']));
    expect(t).not.toMatch(/tonnage|durée|min\b|séances|volume/i);
  });
});

// Le dessin : l'image de l'année dessine les deux écrans sans exception, avec le pied « TrainHub » et la date (un faux canevas).
describe('le dessin sur le canevas de l\'année', () => {
  test('un record complet et une séance de 16 exercices se dessinent', async () => {
    const textes = [];
    const ctx = new Proxy({}, { get: (t, k) => k === 'measureText' ? (s) => ({ width: String(s).length * 20 })
      : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : (typeof t[k] === 'function' || t[k] === undefined) && k !== 'font' && k !== 'fillStyle' ? (...a) => { if (k === 'fillText') textes.push(a[0]); } : t[k],
      set: (t, k, v) => { t[k] = v; return true; } });
    global.document = { createElement: () => ({ getContext: () => ctx, toBlob: (f) => f('blob') }), fonts: null };
    jest.resetModules();
    require('../../v2/js/modele.js');
    require('../../v2/js/moteur.js');
    const Annee = require('../../v2/js/annee.js');
    const PI2 = require('../../v2/js/partage-image.js');
    const rec = PI2.ecranRecord(entree({ pesees: [pesee('2026-10-29', 81.3)],
      paris: [{ seance: 's1', exercice: 'developpe_couche_barre', predite: 3, observee: 3, charge: 100 }],
      courbe: [{ date: '2026-01-10T10:00:00Z', valeur: 60 }, { date: DEBUT, valeur: 100 }] }));
    expect(await Annee.image(rec, rec.date)).toBe('blob');
    expect(textes).toEqual(expect.arrayContaining(['100 kg × 3', 'Développé couché', '1,23 × PDC', 'TrainHub', '8 nov. 2026']));
    textes.length = 0;
    const lignes = Array.from({ length: 16 }, (_, i) => ({ nom: 'Exo ' + i, series: [serie(20 + i, 10)] }));
    const s = PI2.ecranSeance({ debut: DEBUT, titre: 'Jambes', exercices: lignes, records: ['Squat'] });
    expect(await Annee.image(s, s.date)).toBe('blob');
    expect(textes).toEqual(expect.arrayContaining(['Exo 15', '35 kg × 10', '1 record : squat.']));
  });
});
