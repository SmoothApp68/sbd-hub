/** @jest-environment node */
//
// PR 6 de la consolidation « un seul coach, un seul câblage » (relevé du
// 01/10/2026, décisions du 02/10/2026) — UNE DÉFINITION DE LA SÉRIE DE
// TRAVAIL, ET DES COMPTES QUI DISENT LE MÊME NOMBRE.
//
//   · la série de travail : `Modele.estTravail` (le type, `travail` quand il
//     manque — le défaut de la base) ;
//   · le compte : `Semaine.compteSeriesTravail` (la règle du volume : le tapis
//     n'y entre pas) — carte, barre, page, détail, bandeau, fin, profil ;
//   · l'exercice fait : `Modele.exercicesFaits` (au moins une série de
//     travail, cardio compris).

process.env.TZ = 'Europe/Paris';

const Modele = require('../../v2/js/modele.js');
const Semaine = require('../../v2/js/semaine.js');
const Palier = require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
const Seance = require('../../v2/js/seance.js');
const Profil = require('../../v2/js/profil.js');

const EXOS = [
  { slug: 'couche', nom: 'Développé Couché', mesure: 'charge_reps', charge: 'externe', equipement: 'barre', muscles_primaires: ['pectoraux'], muscles_secondaires: [] },
  { slug: 'tapis', nom: 'Tapis', mesure: 'temps', charge: 'aucune', equipement: 'aucun', muscles_primaires: [], muscles_secondaires: [] },
  { slug: 'curl', nom: 'Curl', mesure: 'charge_reps', charge: 'externe', equipement: 'haltere', muscles_primaires: ['biceps'], muscles_secondaires: [] }
];
let n = 0;
const ligne = (slug, type, o) => Object.assign({ id: 'l' + (++n), session_id: 'S', exercise_slug: slug, type_serie: type,
  charge_kg: 100, reps: 5, duree_s: null, rang: n, groupe_superset: null, validee_a: '2026-10-02T10:00:00Z', source: 'app' }, o || {});
// La séance de musculation suivie de tapis : 3 séries de couché, 2 chauffes
// de curl (rien d'autre au curl), 1 série de tapis.
const SEANCE = () => {
  n = 0;
  return [ligne('couche', 'echauffement'), ligne('couche', 'travail'), ligne('couche', 'travail'), ligne('couche', 'travail'),
    ligne('curl', 'echauffement'), ligne('curl', 'echauffement'),
    ligne('tapis', 'travail', { charge_kg: null, reps: null, duree_s: 900 })];
};

describe('PR 6 — la série de travail : une définition', () => {
  test('⚠️ une série sans type est du travail — le défaut de la base — pour tous', () => {
    const s = { type_serie: null };
    expect(Modele.estTravail(s)).toBe(true);
    expect(Seance.typeDe(s)).toBe('travail');
    expect(Semaine.compteSeriesTravail([Object.assign({ exercise_slug: 'couche' }, s)], EXOS)).toBe(1);
  });
  test('les trois autres types n’en sont pas', () => {
    ['echauffement', 'degressive', 'echec'].forEach((t) => expect(Modele.estTravail({ type_serie: t })).toBe(false));
    expect(Modele.estTravail(null)).toBe(false);
  });
  test('`Seance.typeDe` est `Modele.typeDe`', () => {
    ['travail', 'echauffement', null, undefined].forEach((t) => expect(Seance.typeDe({ type_serie: t })).toBe(Modele.typeDe({ type_serie: t })));
  });
});

describe('PR 6 — le détail : « de travail » sur la règle unique (point 4)', () => {
  test('⚠️ DISCRIMINANT — le bloc du tapis dit « 1 série », sans « de travail » ; la somme des blocs « de travail » égale la carte', () => {
    const blocs = Modele.construireBlocs(SEANCE(), EXOS);
    const resumes = blocs.map((b) => b.resume);
    expect(resumes).toEqual(['3 séries de travail', '0 série de travail', '1 série']);
    const carte = Modele.resumerSeance({ id: 'S', debut: '2026-10-02T09:00:00Z' }, SEANCE(), EXOS, Palier, {});
    const somme = blocs.filter((b) => / de travail$/.test(b.resume)).reduce((t, b) => t + b.nbTravailVolume, 0);
    expect([somme, carte.nbSeriesTravail]).toEqual([3, 3]);
  });
  test('le compte de structure (tours, « 2 / 4 séries » replié) reste brut', () => {
    const tapis = Modele.construireBlocs(SEANCE(), EXOS)[2];
    expect([tapis.nbTravail, tapis.nbTravailVolume]).toEqual([1, 0]);
  });
  test('sans catalogue, rien n’est retranché (comme avant)', () => {
    expect(Modele.construireBlocs(SEANCE(), []).map((b) => b.resume)).toEqual(['3 séries de travail', '0 série de travail', '1 série de travail']);
  });
});

describe('PR 6 — le bandeau et la feuille de fin (points 1 et 2)', () => {
  const seanceEnCours = (validee, source) => ({ id: 'S', exercices: [
    { exercise_slug: 'couche', series: [{ type_serie: 'travail', validee_a: validee, source }, { type_serie: 'travail', validee_a: validee, source }] },
    { exercise_slug: 'tapis', series: [{ type_serie: 'travail', validee_a: validee, source }] }] });
  test('⚠️ DISCRIMINANT — le tapis n’entre pas dans « N séries de travail » (avant : 3)', () => {
    expect(Seance.compter(seanceEnCours('2026-10-02T10:00:00Z', 'app'), EXOS).travail).toBe(2);
  });
  test('⚠️ DISCRIMINANT — une séance IMPORTÉE rouverte : ses séries sont faites (avant : « 0 série de travail »)', () => {
    expect(Seance.compter(seanceEnCours(null, 'hevy'), EXOS).travail).toBe(2);
  });
  test('une série saisie mais pas validée n’est pas faite', () => {
    expect(Seance.compter(seanceEnCours(null, 'app'), EXOS).travail).toBe(0);
  });
});

describe('PR 6 — le profil (point 5)', () => {
  test('⚠️ DISCRIMINANT — le KPI « séries » : les séries de travail (avant : 7 lignes)', () => {
    const st = Profil.statsDe([{ id: 'S', debut: '2026-10-02T09:00:00Z' }], SEANCE(), new Date('2026-10-02T12:00:00Z'), EXOS);
    expect(st.series).toBe(3);
    // La suppression du compte dit ce qui sera effacé : les lignes.
    expect(st.lignes).toBe(7);
  });
});

describe('PR 6 — l’exercice fait (point 6)', () => {
  test('⚠️ DISCRIMINANT — le couché et le tapis sont faits ; le curl (chauffes seules) non', () => {
    expect(Object.keys(Modele.exercicesFaits(SEANCE())).sort()).toEqual(['couche', 'tapis']);
  });
  test('la carte compte les mêmes : « 2 exercices » (avant : 3)', () => {
    expect(Modele.resumerSeance({ id: 'S', debut: '2026-10-02T09:00:00Z' }, SEANCE(), EXOS, Palier, {}).nbExercices).toBe(2);
  });
  test('la date d’un exercice fait est la plus récente de ses séances de travail', () => {
    const l = [ligne('couche', 'travail', { session_id: 'A' }), ligne('couche', 'travail', { session_id: 'B' }),
      ligne('curl', 'echauffement', { session_id: 'B' })];
    expect(Modele.exercicesFaits(l, { A: '2026-09-01', B: '2026-09-20' })).toEqual({ couche: '2026-09-20' });
  });
});

// PR 7 — le comptage interne de `etatsExercices` est une AUTRE notion : les
// séries hors chauffe (dégressives et échecs compris, comme le Python du §5.1).
describe('PR 7 — les séries hors chauffe ne sont pas les séries de travail', () => {
  test('⚠️ DISCRIMINANT — une dégressive et un échec sont hors chauffe, pas du travail', () => {
    const l = [{ type_serie: 'echauffement' }, { type_serie: 'travail' }, { type_serie: 'degressive' }, { type_serie: 'echec' }];
    expect(Palier.seriesHorsChauffe(l).map((s) => s.type_serie)).toEqual(['travail', 'degressive', 'echec']);
    expect(l.filter(Modele.estTravail).map((s) => s.type_serie)).toEqual(['travail']);
  });
  test('« monte en charge » se lit sur elles : 3 séries hors chauffe suffisent, même avec une seule de travail', () => {
    const se = (i) => ({ slug: 'x', series: [{ type_serie: 'travail', charge_kg: 50 }, { type_serie: 'degressive', charge_kg: 60 },
      { type_serie: 'echec', charge_kg: 60 }], debut: '2026-09-' + String(10 + i).padStart(2, '0') });
    const etats = Palier.etatsExercices([0, 1, 2, 3, 4, 5, 6, 7].map(se));
    expect(etats.x && etats.x.etat).toBe('monte');
  });
});
