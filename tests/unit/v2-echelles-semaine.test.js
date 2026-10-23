/** @jest-environment node */
//
// 145 — « TES ÉCHELLES CETTE SEMAINE » (ECRAN-SAISIE §7 quater.7, maquette du 23/10/2026).
//
// Trois étages, chacun testé là où il vit :
//   · le FAIT (`Faits.creer().echellesDeLaSemaine`) : les exercices d'échelle de la semaine, leurs séries de la semaine et de la
//     semaine d'avant, la marche franchie ; rien sans exercice d'échelle (une barre seule n'en est pas un) ;
//   · la VUE (`Modele.vueEchellesDeLaSemaine`) : ta marche, le meilleur, la suivante, les ronds, les reps de la semaine ;
//   · la PHRASE COURTE (`Moteur.phraseDeLaSuivante`, option `court`) et les RONDS (`Moteur.rondsDeLaSuivante`).

process.env.TZ = 'Europe/Paris';

global.self = global;
const fs = require('fs');
const path = require('path');
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
require('../../v2/js/seance.js');
const Faits = require('../../v2/js/faits.js');

const F127 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'cas-127.json'), 'utf8'));
const CATALOGUE = F127.echelles.map((e) => Object.assign({}, e, { echelle_rang: e.rang }))
  .concat([{ slug: 'squat_barre', nom: 'Squat (Barre)', mesure: 'charge_reps', charge: 'externe', equipement: 'barre' }]);
const INDEX = Modele.indexerExercices(CATALOGUE);

// Lundi 12 → dimanche 18 oct. 2026 : la semaine écoulée ; la semaine d'avant : 5 → 11 oct.
const LUNDI = new Date(2026, 9, 12, 0, 0, 0);
const le = (jour, h) => new Date(2026, 9, jour, h || 18, 0, 0);

function corpus(specs) {
  const seances = [], series = [], parSeance = {};
  specs.forEach((sp, i) => {
    const id = 's' + i;
    seances.push({ id, debut: sp.debut.toISOString(), statut: sp.statut || 'terminee' });
    parSeance[id] = (sp.series || []).map((x, k) => Object.assign({ id: id + '-' + k, session_id: id, type_serie: 'travail', rang: k }, x));
    parSeance[id].forEach((x) => series.push(x));
  });
  seances.sort((a, b) => String(b.debut).localeCompare(String(a.debut)));
  return { seances, series, exercices: CATALOGUE, seriesDe: (id) => parSeance[id] || [], catalogue: () => INDEX, journal: [] };
}
const reps = (slug, liste, charge) => liste.map((r) => ({ exercise_slug: slug, reps: r, charge_kg: charge === undefined ? 0 : charge }));

describe('145 — le fait `echellesDeLaSemaine`', () => {

  test('les séries de la semaine et de la semaine d’avant, sur l’exercice travaillé', () => {
    const c = corpus([
      { debut: le(14), series: reps('tractions', [9, 9, 9, 6]) },
      { debut: le(7), series: reps('tractions', [9, 8, 8]) },
      { debut: le(1), series: reps('tractions', [7, 7]) }
    ]);
    const r = Faits.creer().echellesDeLaSemaine(c, LUNDI);
    expect(r).toHaveLength(1);
    expect(r[0].echelle).toBe('tractions');
    expect(r[0].exercices.tractions.semaine.map((x) => x.reps)).toEqual([9, 9, 9, 6]);
    expect(r[0].exercices.tractions.avant.map((x) => x.reps)).toEqual([9, 8, 8]);
    expect(r[0].nouvelle).toBeNull();
  });

  test('rien cette semaine-là : pas de carte (l’échelle de la semaine d’avant seule ne compte pas)', () => {
    const c = corpus([{ debut: le(7), series: reps('tractions', [9, 8, 8]) }]);
    expect(Faits.creer().echellesDeLaSemaine(c, LUNDI)).toEqual([]);
  });

  test('une barre seule : pas de carte', () => {
    const c = corpus([{ debut: le(14), series: reps('squat_barre', [5, 5, 5], 120) }]);
    expect(Faits.creer().echellesDeLaSemaine(c, LUNDI)).toEqual([]);
  });

  test('une chauffe, une séance en cours et une séance de la semaine suivante ne comptent pas', () => {
    const c = corpus([
      { debut: le(14), series: [{ exercise_slug: 'tractions', reps: 5, charge_kg: 0, type_serie: 'echauffement' }] },
      { debut: le(15), statut: 'en_cours', series: reps('tractions', [8]) },
      { debut: le(20), series: reps('tractions', [9]) }
    ]);
    expect(Faits.creer().echellesDeLaSemaine(c, LUNDI)).toEqual([]);
  });

  test('la marche franchie : un rang plus haut que tout ce qui précédait, et son ancienne marche', () => {
    const c = corpus([
      { debut: le(14), series: reps('pompes', [6, 6]) },
      { debut: le(8), series: reps('pompes_negatives', [8, 8]) },
      { debut: le(1), series: reps('pompes_negatives', [7]) }
    ]);
    const r = Faits.creer().echellesDeLaSemaine(c, LUNDI)[0];
    expect(r.nouvelle.slug).toBe('pompes');
    expect(r.nouvelle.ancienne.slug).toBe('pompes_negatives');
    expect(r.nouvelle.ancienne.series.map((x) => x.reps)).toEqual([8, 8]);
  });

  test('pas de marche franchie quand le rang était déjà fait, ni à la toute première fois', () => {
    const deja = corpus([
      { debut: le(14), series: reps('pompes', [6]) },
      { debut: le(1), series: reps('pompes', [7]) }
    ]);
    expect(Faits.creer().echellesDeLaSemaine(deja, LUNDI)[0].nouvelle).toBeNull();
    const premiere = corpus([{ debut: le(14), series: reps('pompes', [6]) }]);
    expect(Faits.creer().echellesDeLaSemaine(premiere, LUNDI)[0].nouvelle).toBeNull();
  });

  test('deux échelles : la travaillée le plus récemment d’abord', () => {
    const c = corpus([
      { debut: le(13), series: reps('dips_torse', [10]) },
      { debut: le(16), series: reps('tractions', [8]) },
      { debut: le(15), series: reps('pompes', [20]) }
    ]);
    expect(Faits.creer().echellesDeLaSemaine(c, LUNDI).map((x) => x.echelle)).toEqual(['tractions', 'pompes', 'dips_torse']);
  });
});

describe('145 — la phrase courte et les ronds (le moteur)', () => {
  const base = { type: 'lest', nomCible: 'Tractions Lestées', nomDepart: 'Tractions', haut: 5, meilleur: '7 reps' };
  test('la phrase longue ne change pas', () => {
    expect(M.phraseDeLaSuivante(base)).toBe('La suivante : Tractions Lestées. Je te la propose quand tu tiens 8 reps sur toutes tes séries, deux séances de suite. Ton meilleur : 7 reps.');
  });
  test('la courte : la même condition, sans « Je te la propose » ni « Ton meilleur »', () => {
    expect(M.phraseDeLaSuivante(Object.assign({}, base, { court: true })))
      .toBe('La suivante : Tractions Lestées, quand tu tiens 8 reps sur toutes tes séries, deux séances de suite.');
  });
  test('la courte d’une marche qui s’ajoute, zone connue ou non', () => {
    const m = { type: 'marche', nomCible: 'Pompes Négatives', nomDepart: 'Pompes à Genoux', haut: 15, court: true };
    expect(M.phraseDeLaSuivante(m)).toBe('La suivante : Pompes Négatives, quand tu tiens 15 reps sur toutes tes séries, deux séances de suite.');
    expect(M.phraseDeLaSuivante(Object.assign({}, m, { haut: null })))
      .toBe('La suivante : Pompes Négatives, quand tu tiens le haut de ta zone, et au moins 8 reps, sur toutes tes séries, deux séances de suite.');
  });
  test('la courte d’une habileté', () => {
    expect(M.phraseDeLaSuivante({ type: 'habilete', nomCible: 'Tractions Archer', court: true }))
      .toBe('Au-dessus : Tractions Archer, une habileté. Je ne te la propose pas : c\'est toi qui choisis quand l\'essayer.');
  });
  test('les ronds : pleins pour chaque séance qui tient le seuil (le haut de la zone et 8)', () => {
    expect(M.rondsDeLaSuivante({ haut: 5, seances: [{ niveau: 9, charge: 0 }, { niveau: 8, charge: 0 }] })).toEqual([true, true]);
    expect(M.rondsDeLaSuivante({ haut: 5, seances: [{ niveau: 9, charge: 0 }, { niveau: 6, charge: 0 }] })).toEqual([true, false]);
    expect(M.rondsDeLaSuivante({ haut: 12, seances: [{ niveau: 10, charge: 0 }, { niveau: 12, charge: 0 }] })).toEqual([false, true]);
    expect(M.rondsDeLaSuivante({ haut: 5, seances: [{ niveau: 9, charge: 0 }] })).toEqual([true, false]);
    expect(M.rondsDeLaSuivante({ haut: 5, seances: [] })).toBeNull();
  });
  test('les ronds depuis une aide : la seconde compte à la même aide', () => {
    const aide = { haut: 5, aide: true };
    expect(M.rondsDeLaSuivante(Object.assign({ seances: [{ niveau: 9, charge: -20 }, { niveau: 9, charge: -20 }] }, aide))).toEqual([true, true]);
    expect(M.rondsDeLaSuivante(Object.assign({ seances: [{ niveau: 9, charge: -25 }, { niveau: 9, charge: -20 }] }, aide))).toEqual([true, false]);
  });
});

describe('145 — la vue `vueEchellesDeLaSemaine`', () => {
  const faites = { tractions: { meilleur: null, quand: null, derniere: '2026-10-16T16:00:00.000Z' } };
  const items = [{ echelle: 'tractions', exercices: { tractions: { semaine: 'Poids du corps × 9', avant: 'Poids du corps × 9', reps: [9, 9, 9, 6] } }, nouvelle: null }];
  const opt = (plus) => Object.assign({
    faites, zonesHaut: { tractions: 5 }, coachActif: true,
    phraseDe: (e) => M.phraseDeLaSuivante(Object.assign({}, e, { court: true })),
    rondsDe: () => [true, false]
  }, plus || {});

  test('ta marche, le meilleur de la semaine et celui d’avant, la suivante, les ronds, les reps en clair', () => {
    const v = Modele.vueEchellesDeLaSemaine(INDEX, items, opt());
    expect(v).toHaveLength(1);
    expect(v[0].nom).toBe('Tractions');
    expect(v[0].marche).toEqual({ slug: 'tractions', nom: 'Tractions' });
    expect(v[0].fait).toEqual({ slug: 'tractions', nom: 'Tractions', meilleur: 'Poids du corps × 9', avant: 'Poids du corps × 9' });
    expect(v[0].suite.phrase).toBe('La suivante : Tractions Lestées, quand tu tiens 8 reps sur toutes tes séries, deux séances de suite.');
    expect(v[0].suite.ronds).toEqual([true, false]);
    expect(v[0].suite.serie).toBe('9, 9, 9, 6');
    expect(v[0].ouvre).toBe('tractions');
  });

  test('condition tenue : pas de reps en clair', () => {
    const v = Modele.vueEchellesDeLaSemaine(INDEX, items, opt({ rondsDe: () => [true, true] }));
    expect(v[0].suite.ronds).toEqual([true, true]);
    expect(v[0].suite.serie).toBeNull();
  });

  test('« Juste un carnet » : les marches et les séries, ni phrase, ni ronds, ni reps de la condition', () => {
    let appels = 0;
    const v = Modele.vueEchellesDeLaSemaine(INDEX, items, opt({ coachActif: false, rondsDe: () => { appels++; return [true, true]; } }));
    expect(v[0].fait.meilleur).toBe('Poids du corps × 9');
    expect(v[0].suite).toBeNull();
    expect(appels).toBe(0);
  });

  test('une habileté au-dessus : la phrase « habileté », ni ronds ni reps', () => {
    const f = { tractions_leste: { meilleur: null, quand: null, derniere: '2026-10-16T16:00:00.000Z' } };
    const it = [{ echelle: 'tractions', exercices: { tractions_leste: { semaine: '10 kg × 5', avant: '10 kg × 4', reps: [5, 5] } }, nouvelle: null }];
    const v = Modele.vueEchellesDeLaSemaine(INDEX, it, opt({ faites: f, zonesHaut: {} }));
    expect(v[0].marche.nom).toBe('Tractions Lestées');
    expect(v[0].suite.phrase).toMatch(/^Au-dessus : Tractions Archer, une habileté\./);
    expect(v[0].suite.ronds).toBeNull();
    expect(v[0].suite.serie).toBeNull();
  });

  test('une nouvelle marche : « avant » nomme l’ancienne marche', () => {
    const f = { pompes: { meilleur: null, quand: null, derniere: '2026-10-14T16:00:00.000Z' },
                pompes_negatives: { meilleur: null, quand: null, derniere: '2026-10-08T16:00:00.000Z' } };
    const it = [{ echelle: 'pompes', exercices: { pompes: { semaine: 'Poids du corps × 6', avant: null, reps: [6, 6] } },
                  nouvelle: { slug: 'pompes', ancienne: { nom: 'Pompes Négatives', texte: 'Poids du corps × 8' } } }];
    const v = Modele.vueEchellesDeLaSemaine(INDEX, it, opt({ faites: f }));
    expect(v[0].nouvelle).toEqual({ avant: 'Pompes Négatives, Poids du corps × 8' });
    expect(v[0].marche.slug).toBe('pompes');
  });

  test('la semaine se dit « 12 au 18 oct. »', () => {
    expect(Modele.libelleDeLaSemaine(new Date(2026, 9, 12), new Date(2026, 9, 18))).toBe('12 au 18 oct.');
    expect(Modele.libelleDeLaSemaine(new Date(2026, 8, 28), new Date(2026, 9, 4))).toBe('28 sept. au 4 oct.');
  });
});
