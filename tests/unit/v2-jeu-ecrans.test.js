/** @jest-environment node */
//
// 64B — CE QUE LES ÉCRANS DU JEU LISENT (JEU-V1 §9.5) : `descriptionDuSucces`,
// `vitrine`, `apport`, et deux lectures sans calcul côté écran (`tables`,
// `jauges`). Tirés des tables de `jeu.js` : un écran ne refait ni la vitrine, ni
// l'apport d'une séance.
//
// Chaque cas est construit pour DÉCLENCHER sa branche : l'égalité de rareté,
// moins de trois succès, aucun, un niveau qui atteint 100, un Ω qui monte sans
// niveau, un muscle à 50 qui ne bouge plus.

const fs = require('fs');
const path = require('path');

global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
const Jeu = require('../../v2/js/jeu.js');

const DONNEES = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-jeu-v1.json'), 'utf8'));
const MUSCLES = Jeu.ORDRE_DES_MUSCLES;

// Un état du jeu de papier : seuls les champs que lisent `vitrine`, `apport` et `jauges`.
function etat(o) {
  const muscles = {};
  MUSCLES.forEach((m) => {
    const x = (o.muscles || {})[m] || {};
    muscles[m] = { points: x.points || 0, niveau: x.niveau || 0, prochain: null };
  });
  return {
    xp: { total: o.xp || 0 },
    niveau: { niveau: o.niveau || 0, omega: o.omega === undefined ? null : o.omega, reserve: o.reserve || 0 },
    muscles,
    succes: { ids: o.ids || [] }
  };
}

const AUJ = new Date(2026, 9, 9);
const CATALOGUE = DONNEES.catalogues.mini;
let n = 0;
const seance = (debut, series) => {
  const id = 'x' + (++n);
  return { seance: { id, debut }, series: series.map((s) => Object.assign({ session_id: id, type_serie: 'travail', duree_s: null, distance_m: null }, s)) };
};
function entree(seances) {
  return { aujourdhui: AUJ, seances: seances.map((s) => s.seance), series: [].concat(...seances.map((s) => s.series)),
    catalogue: CATALOGUE, journal: [], maximums: [], exercicesFaits: 0 };
}

describe('descriptionDuSucces — chaque identifiant du jeu, depuis ses tables', () => {
  test('les catégories, la grande sortie, un muscle, tous les muscles, un cap rond', () => {
    expect(Jeu.descriptionDuSucces('seances-1000')).toEqual({ categorie: 'seances', cle: null, palier: 1000, rarete: 'majeur', points: 100 });
    expect(Jeu.descriptionDuSucces('serie-26')).toEqual({ categorie: 'serie', cle: null, palier: 26, rarete: 'rare', points: 25 });
    expect(Jeu.descriptionDuSucces('records-1000')).toEqual({ categorie: 'records', cle: null, palier: 1000, rarete: 'exceptionnel', points: 50 });
    expect(Jeu.descriptionDuSucces('rando-50')).toEqual({ categorie: 'rando', cle: null, palier: 50, rarete: 'commun', points: 10 });
    expect(Jeu.descriptionDuSucces('decouverte-100')).toEqual({ categorie: 'decouverte', cle: null, palier: 100, rarete: 'exceptionnel', points: 50 });
    expect(Jeu.descriptionDuSucces('rando-sortie-20')).toEqual({ categorie: 'sortie', cle: null, palier: 20, rarete: 'rare', points: 25 });
    expect(Jeu.descriptionDuSucces('muscle-epaules-40')).toEqual({ categorie: 'muscle', cle: 'epaules', palier: 40, rarete: 'exceptionnel', points: 50 });
    expect(Jeu.descriptionDuSucces('muscle-cardio-50')).toEqual({ categorie: 'muscle', cle: 'cardio', palier: 50, rarete: 'majeur', points: 100 });
    expect(Jeu.descriptionDuSucces('tous-20')).toEqual({ categorie: 'tous', cle: null, palier: 20, rarete: 'rare', points: 25 });
    expect(Jeu.descriptionDuSucces('cap-developpe_couche_barre-140')).toEqual({ categorie: 'cap', cle: 'developpe_couche_barre', palier: 140, rarete: 'commun', points: 10 });
  });

  test('un identifiant que le jeu ne donne pas : null', () => {
    ['seances-11', 'serie-1', 'rando-sortie-30', 'muscle-cou-10', 'muscle-dos-15', 'tous-15', 'cap-squat_barre-30',
      'cap-squat_barre-50', 'cap-squat_barre-060', 'inconnu-10', 'xyz', '', null, undefined, 42].forEach((id) =>
      expect([id, Jeu.descriptionDuSucces(id)]).toEqual([id, null]));
  });

  test('sur les 23 cas : chaque succès a sa description, et leurs points font les points de succès', () => {
    DONNEES.cas.forEach((c) => {
      const d = c.attendu.succes.ids.map((id) => Jeu.descriptionDuSucces(id));
      expect([c.nom, d.filter((x) => x === null).length]).toEqual([c.nom, 0]);
      expect([c.nom, d.reduce((t, x) => t + x.points, 0)]).toEqual([c.nom, c.attendu.succes.points]);
    });
  });
});

describe('vitrine — trois au plus, les plus rares, à égalité le plus tard', () => {
  test('la rareté décroissante, le plus rare d’abord', () => {
    const e = etat({ ids: ['seances-10', 'seances-100', 'serie-52', 'records-2500', 'serie-4'] });
    expect(Jeu.vitrine(e)).toEqual(['records-2500', 'serie-52', 'seances-100']);
  });

  test('⚠️ à rareté égale, celui qui vient le plus tard dans `succes.ids`', () => {
    expect(Jeu.vitrine(etat({ ids: ['seances-10', 'serie-4', 'records-10', 'decouverte-10'] })))
      .toEqual(['decouverte-10', 'records-10', 'serie-4']);
    expect(Jeu.vitrine(etat({ ids: ['muscle-dos-40', 'muscle-tronc-40', 'seances-1000', 'seances-10'] })))
      .toEqual(['seances-1000', 'muscle-tronc-40', 'muscle-dos-40']);
  });

  test('moins de trois : ce qu’il y a ; aucun : rien', () => {
    expect(Jeu.vitrine(etat({ ids: ['serie-4', 'seances-100'] }))).toEqual(['seances-100', 'serie-4']);
    expect(Jeu.vitrine(etat({ ids: ['seances-10'] }))).toEqual(['seances-10']);
    expect(Jeu.vitrine(etat({ ids: [] }))).toEqual([]);
    expect(Jeu.vitrine(null)).toEqual([]);
  });

  test('sur un vrai état (Alexis) : trois ids, tous parmi ses succès', () => {
    const c = DONNEES.cas.filter((x) => x.nom === 'reel-alexis')[0];
    const v = Jeu.vitrine(c.attendu);
    expect(v.length).toBe(3);
    v.forEach((id) => expect(c.attendu.succes.ids).toContain(id));
  });
});

describe('apport — ce que la séance ajoute', () => {
  test('sur deux vrais états : l’XP, les muscles qui montent dans l’ordre du jeu, les succès nouveaux dans leur ordre', () => {
    // Avant : 9 séances de crunchs sur 9 semaines (tronc 9 points, niveau 1). La séance : 30 squats et 4 couchés.
    const lundis = ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14',
      '2026-09-21', '2026-09-28'];
    const avant = lundis.map((l) => seance(l + 'T12:00:00Z', [{ exercise_slug: 'crunch' }]));
    const la = seance('2026-10-07T17:00:00Z', [].concat(
      Array.from({ length: 30 }, () => ({ exercise_slug: 'squat_barre' })),
      Array.from({ length: 4 }, () => ({ exercise_slug: 'developpe_couche_barre' }))));
    const e1 = Jeu.etatDuJeu(entree(avant));
    const e2 = Jeu.etatDuJeu(entree(avant.concat([la])));
    const a = Jeu.apport(e1, e2);
    expect(a.xp).toBe(e2.xp.total - e1.xp.total);
    expect(a.xp).toBeGreaterThan(0);
    // Squat : jambes 1, dos ½, tronc ½ ; couché : poitrine 1, bras ½, épaules ½. Poitrine 4 (niveau 1), dos 15 (2),
    // épaules 2 (0), bras 2 (0), jambes 30 (3), tronc 9 + 15 = 24 (de 1 à 2).
    expect(a.muscles).toEqual([{ cle: 'poitrine', de: 0, a: 1 }, { cle: 'dos', de: 0, a: 2 },
      { cle: 'jambes', de: 0, a: 3 }, { cle: 'tronc', de: 1, a: 2 }]);
    expect(a.succes).toEqual(['seances-10']);
    expect(a.points).toBe(4 + 15 + 2 + 2 + 30 + 15);
    expect(a.niveau).toEqual(e2.niveau.niveau > e1.niveau.niveau ? { de: e1.niveau.niveau, a: e2.niveau.niveau } : null);
  });

  test('le niveau global : { de, a } s’il monte, jusqu’à 100 compris', () => {
    expect(Jeu.apport(etat({ niveau: 87 }), etat({ niveau: 88 })).niveau).toEqual({ de: 87, a: 88 });
    expect(Jeu.apport(etat({ niveau: 99, omega: null }), etat({ niveau: 100, omega: 0 })).niveau).toEqual({ de: 99, a: 100 });
    expect(Jeu.apport(etat({ niveau: 12 }), etat({ niveau: 12 })).niveau).toBeNull();
  });

  test('⚠️ un Ω qui monte sans niveau : `niveau` reste null (l’Ω ne se montre qu’au Profil)', () => {
    const a = Jeu.apport(etat({ niveau: 100, omega: 0, xp: 1000 }), etat({ niveau: 100, omega: 1, xp: 1200 }));
    expect(a.niveau).toBeNull();
    expect(a.xp).toBe(200);
  });

  test('⚠️ un muscle à 50 qui ne bouge plus : pas de ligne, mais ses points comptent', () => {
    const avant = etat({ muscles: { dos: { niveau: 50, points: 7600 }, bras: { niveau: 3, points: 30 } } });
    const apres = etat({ muscles: { dos: { niveau: 50, points: 7700 }, bras: { niveau: 4, points: 48 } } });
    const a = Jeu.apport(avant, apres);
    expect(a.muscles).toEqual([{ cle: 'bras', de: 3, a: 4 }]);
    expect(a.points).toBe(118);
  });

  test('rien gagné : tout à zéro, aucune ligne', () => {
    const e = etat({ niveau: 5, xp: 300, ids: ['seances-10'], muscles: { tronc: { niveau: 1, points: 4 } } });
    expect(Jeu.apport(e, e)).toEqual({ xp: 0, niveau: null, muscles: [], succes: [], points: 0 });
  });

  test('les succès nouveaux : ceux d’après absents d’avant, dans l’ordre d’après — jamais les anciens', () => {
    const a = Jeu.apport(etat({ ids: ['seances-10', 'serie-4'] }),
      etat({ ids: ['seances-10', 'serie-4', 'records-10', 'muscle-dos-10', 'cap-squat_barre-40'] }));
    expect(a.succes).toEqual(['records-10', 'muscle-dos-10', 'cap-squat_barre-40']);
  });

  test('les points s’arrondissent à 6 décimales (des minutes de cardio)', () => {
    const a = Jeu.apport(etat({ muscles: { cardio: { points: 1 / 3 } } }), etat({ muscles: { cardio: { points: 1 / 3 + 0.1 } } }));
    expect(a.points).toBe(0.1);
  });
});

describe('tables et jauges — ce que les écrans lisent sans calculer', () => {
  test('les tables sont une copie : les modifier ne change pas le jeu', () => {
    const t = Jeu.tables();
    expect(t.categories.map((c) => c.cle)).toEqual(['seances', 'serie', 'records', 'rando', 'decouverte']);
    expect(t.raretes).toEqual([{ rarete: 'commun', points: 10 }, { rarete: 'rare', points: 25 },
      { rarete: 'exceptionnel', points: 50 }, { rarete: 'majeur', points: 100 }]);
    expect(t.titres.map((x) => x.cle)).toEqual(['equilibre', 'polyvalent', 'athlete', 'accompli', 'complet']);
    expect(t.cadres).toEqual(['vitrine', 'niveau', 'or', 'grave']);
    t.categories[0].paliers[0].palier = 999;
    t.cadres.push('x');
    expect(Jeu.tables().categories[0].paliers[0].palier).toBe(10);
    expect(Jeu.descriptionDuSucces('seances-10')).not.toBeNull();
  });

  test('les jauges : la part faite du niveau en cours, pleine à 50 (muscle) et à 100 (global)', () => {
    const j = Jeu.jauges(etat({ niveau: 1, reserve: 7.25 + (29 - 7.25) / 2,
      muscles: { tronc: { niveau: 0, points: 1.5 }, dos: { niveau: 50, points: 9000 }, bras: { niveau: 2, points: 12 + 7.5 } } }));
    expect(j.muscles.tronc).toBe(0.5);
    expect(j.muscles.dos).toBe(1);
    expect(j.muscles.bras).toBe(0.5);
    expect(j.niveau).toBe(0.5);
    expect(Jeu.jauges(etat({ niveau: 100, omega: 3, reserve: 95000 })).niveau).toBe(1);
  });
});
