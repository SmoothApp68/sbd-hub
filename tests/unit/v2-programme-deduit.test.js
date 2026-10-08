/** @jest-environment node */
//
// 60-3 — le programme déduit (QUESTIONNAIRE-COACH-V2 §5, ECRAN-SAISIE §7
// quindecies.7).
//
//   · `Routines.seancesQuiReviennent` rejoue les trois cas de
//     `cas-60-3-deduit.json` (Jordan, Léa, Mélodie) À L'ÉGALITÉ STRICTE : c'est
//     le portage de `deduire()` (`deduit60b.py`) ;
//   · la règle est pure : ni horloge, ni ordre d'arrivée des séances, ni
//     mutation de ses entrées ;
//   · une routine déduite devient la structure de « En faire une routine »
//     (§7 quindecies.4) : chauffes puis séries de travail aux reps visées, le
//     repos par la même règle et son origine, jamais de charge.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
require('../../v2/js/periode.js');
const R = require('../../v2/js/routines.js');

const CHEMIN = path.join(__dirname, 'fixtures/cas-60-3-deduit.json');
const F = JSON.parse(fs.readFileSync(CHEMIN, 'utf8'));

// Une séance du fichier, à la forme des faits (`faits.js`) : des séries
// `{ rang, exercise_slug, type_serie, reps }`.
const seancesDe = (c) => c.seances.map((s) => ({
  id: s.id, debut: s.debut, titre: s.titre,
  series: s.series.map((x) => ({ rang: x[0], exercise_slug: x[1], type_serie: x[2], reps: x[3] }))
}));

describe('le fichier de cas', () => {
  test('son empreinte est celle du fichier reçu de Claude.ai', () => {
    const brut = fs.readFileSync(CHEMIN);
    expect(brut.length).toBe(77495);
    expect(crypto.createHash('sha256').update(brut).digest('hex'))
      .toBe('6aaba495bd90e19ad0c3016953109a92eb5738eecd718b859f5a6daf3538822d');
    expect(F.reference).toBe('deduit60b.py');
    expect(F.cas.map((c) => c.profil)).toEqual(['jordan', 'lea', 'melodie']);
  });

  // 60-3b — LA RÉFÉRENCE, oubliée du prompt 60-3 : `deduit60b.py`, rangée à côté du fichier de cas. Une trace,
  // pas un test à lancer : elle lit `catalogue.json` et `seances12s.json`, qui ne sont pas au dépôt. Son
  // empreinte est celle du fichier reçu de Claude.ai, comme celle du fichier de cas.
  test('la référence deduit60b.py est celle reçue de Claude.ai', () => {
    const brut = fs.readFileSync(path.join(__dirname, 'fixtures/deduit60b.py'));
    expect(brut.length).toBe(6673);
    expect(crypto.createHash('sha256').update(brut).digest('hex'))
      .toBe('e7a0da86c312b4c74b5b51f9e5e1f2aaaedab028ed004c6f2100d1a1b6040b7b');
  });
});

describe('seancesQuiReviennent — les cas, à l’égalité stricte', () => {
  F.cas.forEach((c) => {
    test(c.profil + ' : ' + c.attendu.map((r) => r.nom).join(' · '), () => {
      expect(R.seancesQuiReviennent(seancesDe(c), c.mesures)).toStrictEqual(c.attendu);
    });
  });
});

describe('seancesQuiReviennent — une règle pure', () => {
  const jordan = F.cas[0];

  test('l’horloge n’y entre pas : la fenêtre finit à la dernière séance', () => {
    const avant = R.seancesQuiReviennent(seancesDe(jordan), jordan.mesures);
    jest.useFakeTimers().setSystemTime(new Date('2030-01-01T12:00:00Z'));
    try {
      expect(R.seancesQuiReviennent(seancesDe(jordan), jordan.mesures)).toStrictEqual(avant);
    } finally { jest.useRealTimers(); }
  });

  test('l’ordre d’arrivée des séances ne change rien (le cache les range de la plus récente à la plus ancienne)', () => {
    F.cas.forEach((c) => {
      expect(R.seancesQuiReviennent(seancesDe(c).reverse(), c.mesures)).toStrictEqual(c.attendu);
    });
  });

  test('ses entrées ne sont pas modifiées', () => {
    const entree = seancesDe(jordan);
    const copie = JSON.parse(JSON.stringify(entree));
    R.seancesQuiReviennent(entree, jordan.mesures);
    expect(entree).toEqual(copie);
  });

  test('rien en base, ou rien qui revient : une liste vide', () => {
    expect(R.seancesQuiReviennent([], {})).toEqual([]);
    expect(R.seancesQuiReviennent(null, null)).toEqual([]);
    const une = seancesDe(jordan).slice(0, 3);
    expect(R.seancesQuiReviennent(une, jordan.mesures)).toEqual([]);
  });

  test('une séance d’un seul exercice, ou de cardio, ne compte pas', () => {
    const mesures = { a: 'charge_reps', b: 'charge_reps', tapis: 'distance_temps' };
    const seance = (j, series) => ({ debut: '2026-09-0' + j + 'T10:00:00Z', titre: 'X',
      series: series.map((s, i) => ({ rang: i + 1, exercise_slug: s, type_serie: 'travail', reps: 10 })) });
    const seules = [1, 2, 3, 4, 5].map((j) => seance(j, ['a', 'a', 'tapis']));
    expect(R.seancesQuiReviennent(seules, mesures)).toEqual([]);
    const paires = [1, 2, 3, 4].map((j) => seance(j, ['a', 'b']));
    expect(R.seancesQuiReviennent(paires, mesures).map((r) => r.fois)).toEqual([4]);
  });

  test('une chauffe seule ne signe pas une séance', () => {
    const mesures = { a: 'charge_reps', b: 'charge_reps' };
    const seance = (j) => ({ debut: '2026-09-0' + j + 'T10:00:00Z', titre: 'X', series: [
      { rang: 1, exercise_slug: 'a', type_serie: 'travail', reps: 5 },
      { rang: 2, exercise_slug: 'b', type_serie: 'echauffement', reps: 5 }] });
    expect(R.seancesQuiReviennent([1, 2, 3, 4].map(seance), mesures)).toEqual([]);
  });

  test('deux routines au même nom — à la casse près — deviennent « A » et « B » dans l’ordre d’affichage', () => {
    const mesures = { a: 'charge_reps', b: 'charge_reps', c: 'charge_reps', d: 'charge_reps' };
    const seance = (jour, titre, exos) => ({ debut: '2026-09-' + jour + 'T10:00:00Z', titre: titre,
      series: exos.map((s, i) => ({ rang: i + 1, exercise_slug: s, type_serie: 'travail', reps: 8 })) });
    const liste = [
      seance('01', 'Push', ['a', 'b']), seance('02', 'Push', ['a', 'b']),
      seance('03', 'Push', ['a', 'b']), seance('04', 'Push', ['a', 'b']),
      seance('05', 'push', ['c', 'd']), seance('06', 'push', ['c', 'd']),
      seance('07', 'push', ['c', 'd']), seance('08', 'push', ['c', 'd']), seance('09', 'push', ['c', 'd'])
    ];
    // 5 séances d'abord : « push A » ; puis la routine de 4 séances : « Push B ».
    expect(R.seancesQuiReviennent(liste, mesures).map((r) => r.nom)).toEqual(['push A', 'Push B']);
  });

  test('des séances sans titre (une séance libre de l’app) : « Routine », et « A », « B » s’il y en a deux', () => {
    const mesures = { a: 'charge_reps', b: 'charge_reps', c: 'charge_reps', d: 'charge_reps' };
    const seance = (jour, exos) => ({ debut: '2026-09-' + jour + 'T10:00:00Z', titre: null,
      series: exos.map((s, i) => ({ rang: i + 1, exercise_slug: s, type_serie: 'travail', reps: 8 })) });
    const deux = ['01', '02', '03', '04'].map((j) => seance(j, ['a', 'b']))
      .concat(['05', '06', '07', '08', '09'].map((j) => seance(j, ['c', 'd'])));
    expect(R.seancesQuiReviennent(deux, mesures).map((r) => r.nom)).toEqual(['Routine A', 'Routine B']);
    expect(R.seancesQuiReviennent(deux.slice(0, 4), mesures).map((r) => r.nom)).toEqual(['Routine']);
  });
});

// ═══ LES BORNES DU §5, AU MOT PRÈS (revue adverse, constat #11) ════════════
// Les trois cas ne départagent pas ces bornes (aucun Jaccard à 0,35 juste,
// aucun groupe à 28 jours juste, aucune séance au 84ᵉ jour) : ces tests figent
// le TEXTE de QUESTIONNAIRE §5. Jours du calendrier local, à midi.
describe('seancesQuiReviennent — les bornes du §5', () => {
  const FIN = new Date(2026, 8, 30, 12);   // la dernière séance : le 30/09, midi local
  const jour = (avant) => new Date(FIN.getFullYear(), FIN.getMonth(), FIN.getDate() - avant, 12).toISOString();
  const seance = (avant, series, titre) => ({ debut: jour(avant), titre: titre || 'T',
    series: series.map((x, i) => ({ rang: i + 1, exercise_slug: x[0], type_serie: x[1] || 'travail', reps: 8 })) });
  const mesures = new Proxy({}, { get: () => 'charge_reps' });
  const exos = (prefixe, n) => Array.from({ length: n }, (_, i) => [prefixe + String(i).padStart(2, '0')]);

  test('« s’il atteint 0,35 » : un Jaccard de 0,35 JUSTE rejoint le groupe', () => {
    // S1 : 13 exercices (e×7, f×6) ; S2 : e×7 et g×7 — 7 en commun sur 20 = 0,35.
    const S1 = exos('e', 7).concat(exos('f', 6)), S2 = exos('e', 7).concat(exos('g', 7));
    const liste = [seance(9, S1), seance(6, S2), seance(3, S1), seance(0, S1)];
    expect(R.seancesQuiReviennent(liste, mesures).map((r) => r.fois)).toEqual([4]);
  });

  test('« plus de 28 jours » : 28 jours juste, cochée ; 29, décochée', () => {
    const A = [['a1'], ['a2']], B = [['b1'], ['b2']];
    const avec = (ecart) => [ecart + 30, ecart + 20, ecart + 10, ecart].map((j) => seance(j, A, 'A'))
      .concat([30, 20, 10, 0].map((j) => seance(j, B, 'B')));
    expect(R.seancesQuiReviennent(avec(28), mesures).filter((r) => r.nom === 'A')[0].cochee).toBe(true);
    expect(R.seancesQuiReviennent(avec(29), mesures).filter((r) => r.nom === 'A')[0].cochee).toBe(false);
  });

  test('« les 84 jours qui finissent à la dernière séance » : le jour −83 compte, le jour −84 non', () => {
    const X = [['x1'], ['x2']];
    const avec = (premier) => [premier, 60, 30, 0].map((j) => seance(j, X));
    expect(R.seancesQuiReviennent(avec(83), mesures).map((r) => r.fois)).toEqual([4]);
    expect(R.seancesQuiReviennent(avec(84), mesures)).toEqual([]);
  });

  test('« une série de travail ou d’échec » : un exercice fait seulement en échec signe la séance, et compte ses séries', () => {
    const liste = [9, 6, 3, 0].map((j) => seance(j, [['a'], ['b', 'echec']]));
    const r = R.seancesQuiReviennent(liste, mesures);
    expect(r.map((x) => x.exercices.map((e) => [e.exercise_slug, e.series]))).toEqual([[['a', 1], ['b', 1]]]);
  });

  test('« égalité : par slug » : deux positions médianes égales se rangent par slug', () => {
    // y-… et a-… alternent en tête : leurs médianes sont égales.
    const un = [['y-ex'], ['a-ex'], ['m-ex']], deux = [['a-ex'], ['y-ex'], ['m-ex']];
    const liste = [seance(9, un), seance(6, deux), seance(3, un), seance(0, deux)];
    expect(R.seancesQuiReviennent(liste, mesures)[0].exercices.map((e) => e.exercise_slug)).toEqual(['a-ex', 'y-ex', 'm-ex']);
  });
});

// ═══ LA STRUCTURE : celle de « En faire une routine » ══════════════════════
describe('routineDeduite — la structure de « En faire une routine »', () => {
  const CATALOGUE = [
    { slug: 'squat_barre', nom: 'Squat', mesure: 'charge_reps',
      muscles_primaires: ['quadriceps', 'fessiers'], muscles_secondaires: ['ischios'] },
    { slug: 'presse', nom: 'Presse', mesure: 'charge_reps',
      muscles_primaires: ['quadriceps', 'fessiers'], muscles_secondaires: ['ischios'] },
    { slug: 'extension_jambes', nom: 'Leg extension', mesure: 'charge_reps',
      muscles_primaires: ['quadriceps'], muscles_secondaires: [] }
  ];
  const DEDUITE = { nom: 'Jambes', fois: 6, derniere: '2026-09-01', cochee: true, exercices: [
    { exercise_slug: 'squat_barre', series: 3, reps: 5, chauffes: 2 },
    { exercise_slug: 'presse', series: 3, reps: 12, chauffes: 0 },
    { exercise_slug: 'extension_jambes', series: 2, reps: 15, chauffes: 0 }
  ] };

  test('chauffes puis séries de travail, aux reps visées ; un exercice, un bloc ; jamais de charge', () => {
    const r = R.routineDeduite(DEDUITE, { exercices: CATALOGUE, routines: [], existants: [] });
    expect(r.nom).toBe('Jambes');
    expect(r.exercices.map((e) => e.exercise_slug)).toEqual(['squat_barre', 'presse', 'extension_jambes']);
    expect(r.exercices.every((e) => e.groupe_superset === null)).toBe(true);
    expect(r.exercices[0].series.map((s) => [s.type_serie, s.reps_visees]))
      .toEqual([['echauffement', null], ['echauffement', null], ['travail', 5], ['travail', 5], ['travail', 5]]);
    expect(r.exercices[1].series.map((s) => [s.type_serie, s.reps_visees]))
      .toEqual([['travail', 12], ['travail', 12], ['travail', 12]]);
    expect(JSON.stringify(r)).not.toMatch(/charge/);
  });

  test('le repos : la même règle que « En faire une routine », avec son origine', () => {
    const routines = [{ nom: 'Bas du corps', modifiee_a: '2026-08-01T10:00:00Z',
      exercices: [{ exercise_slug: 'presse', repos_cible_s: 150 }] }];
    const r = R.routineDeduite(DEDUITE, { exercices: CATALOGUE, routines: routines, existants: [] });
    expect(r.exercices.map((e) => [e.repos_cible_s, e.repos_origine])).toEqual([
      [180, 'par défaut'], [150, 'Bas du corps'], [90, 'par défaut']]);
    // La même que `routineDepuisSeance` sur la même structure : pas une seconde règle.
    const lignes = [];
    DEDUITE.exercices.forEach((e) => {
      for (let k = 0; k < e.chauffes; k++) lignes.push({ exercise_slug: e.exercise_slug, rang: lignes.length + 1, type_serie: 'echauffement', reps: null });
      for (let k = 0; k < e.series; k++) lignes.push({ exercise_slug: e.exercise_slug, rang: lignes.length + 1, type_serie: 'travail', reps: e.reps });
    });
    expect(r).toEqual(R.routineDepuisSeance(lignes, { titre: 'Jambes', exercices: CATALOGUE, routines: routines, existants: [] }));
  });

  test('le nom est rendu unique par les noms déjà pris', () => {
    const r = R.routineDeduite(DEDUITE, { exercices: CATALOGUE, routines: [], existants: ['jambes', 'Jambes (2)'] });
    expect(r.nom).toBe('Jambes (3)');
  });

  test('les trois cas se transforment sans perdre un exercice ni une série', () => {
    F.cas.forEach((c) => {
      c.attendu.forEach((d) => {
        const r = R.routineDeduite(d, { exercices: [], routines: [], existants: [] });
        expect(r.exercices.map((e) => e.exercise_slug)).toEqual(d.exercices.map((e) => e.exercise_slug));
        r.exercices.forEach((e, i) => {
          const voulu = d.exercices[i];
          expect(e.series.filter((s) => s.type_serie === 'echauffement').length).toBe(voulu.chauffes);
          expect(e.series.filter((s) => s.type_serie !== 'echauffement').map((s) => s.reps_visees))
            .toEqual(Array(voulu.series).fill(voulu.reps));
        });
      });
    });
  });
});

// ═══ LES FAITS : `faits.js` assemble, la règle décide ══════════════════════
describe('Faits.programmeDeduit — les faits de la règle viennent du module des faits', () => {
  require('../../v2/js/bilan.js');
  require('../../v2/js/seance.js');
  const Faits = require('../../v2/js/faits.js');

  // Le corpus de l'app : les séances de la plus récente à la plus ancienne,
  // les séries à plat (`sets`), le catalogue indexé.
  const corpusDe = (c) => {
    const seances = c.seances.map((s) => ({ id: s.id, debut: s.debut, fin: null, titre: s.titre })).reverse();
    const series = [];
    c.seances.forEach((s) => s.series.forEach((x, k) => series.push({
      id: s.id + '-' + k, session_id: s.id, rang: x[0], exercise_slug: x[1], type_serie: x[2], reps: x[3], charge_kg: 50 })));
    const index = {};
    Object.keys(c.mesures).forEach((slug) => { index[slug] = { slug, nom: slug, mesure: c.mesures[slug] }; });
    return { seances, series, exercices: Object.values(index),
      seriesDe: (id) => series.filter((x) => x.session_id === id), catalogue: () => index, journal: [] };
  };

  F.cas.forEach((c) => {
    test(c.profil + ' : les séances du cache, leur titre et la mesure du catalogue rendent les routines attendues', () => {
      expect(Faits.creer().programmeDeduit(corpusDe(c))).toStrictEqual(c.attendu);
    });
  });

  test('un exercice absent du catalogue ne signe rien (sa mesure est inconnue)', () => {
    const c = corpusDe(F.cas[0]);
    expect(Faits.creer().programmeDeduit(Object.assign({}, c, { catalogue: () => ({}) }))).toEqual([]);
  });
});
