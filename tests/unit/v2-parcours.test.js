/**
 * 75 (ECRAN-SAISIE §7 bis.14 ter) — « Ton parcours ».
 *
 * Ce que ce fichier prouve :
 *   · LA CONCORDANCE : chaque cas synthétique (`fixtures/cas-75-synthetiques.json`, régénéré par `gen75.py`) et le cas
 *     réel d'aurel_br (`fixtures/cas-75-reel.json`) passent dans `THParcours.parcours` et rendent leur `attendu`,
 *     champ par champ — les fractions de la référence (« 638/5 ») comparées comme nombres (écart < 1e-9). 0 écart ;
 *   · les cas portent vraiment chaque chemin (à reps égales, courbe, moins pratiqué avec et sans relais, nouveau,
 *     peu, pas comparable ; les trois lectures et l'absence de repère ; les deux sexes) — sinon la concordance ne
 *     prouverait rien ;
 *   · le levier suit l'ORDRE des priorités à égalité (la règle, sur un cas dont la référence dit la réponse) ;
 *   · le module des faits assemble l'entrée (séries de travail seules, séances terminées, jour civil, priorités et
 *     sexe du profil), mémorise le parcours, et n'écrit rien ;
 *   · le formateur écrit « 0,50 » ; la route « /progression/parcours » s'ouvre sous Progression.
 */
global.self = global;
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/bilan.js');
const Profil = require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
require('../../v2/js/seance.js');
require('../../v2/js/periode.js');
const Parcours = require('../../v2/js/parcours.js');
const Faits = require('../../v2/js/faits.js');
const R = require('../../v2/js/routeur.js');
const SYNTHETIQUES = require('./fixtures/cas-75-synthetiques.json');
const REEL = require('./fixtures/cas-75-reel.json');

// Le cas réel, développé comme le dit son champ `format`.
function entreeReelle() {
  return { aujourdhui: REEL.aujourdhui, sexe: REEL.sexe, priorites: REEL.priorites, catalogue: REEL.catalogue,
           series: REEL.series.map((l) => ({ debut: l[0], seance: l[1], slug: REEL.slugs[l[2]], reps: l[3], charge: l[4] })) };
}
const TOUS = SYNTHETIQUES.map((c) => ({ nom: c.nom, entree: c.entree, attendu: c.attendu }))
  .concat([{ nom: REEL.nom, entree: entreeReelle(), attendu: REEL.attendu }]);

// Une fraction de la référence écrite en texte (« 638/5 », « 2 », « -1/4 ») : un nombre.
const FRACTION = /^-?\d+(\/\d+)?$/;
function enNombre(t) {
  const p = t.split('/');
  return p.length === 2 ? Number(p[0]) / Number(p[1]) : Number(p[0]);
}
// La comparaison champ par champ : mêmes clés, mêmes valeurs ; une fraction ou un nombre à 1e-9 près.
function ecarts(obtenu, attendu, chemin, sortie) {
  if (attendu === null || typeof attendu !== 'object') {
    const nombre = typeof attendu === 'number' || (typeof attendu === 'string' && FRACTION.test(attendu));
    const ok = nombre
      ? typeof obtenu === 'number' && Math.abs(obtenu - (typeof attendu === 'number' ? attendu : enNombre(attendu))) < 1e-9
      : obtenu === attendu;
    if (!ok) sortie.push(chemin + ' : ' + JSON.stringify(obtenu) + ' au lieu de ' + JSON.stringify(attendu));
    return sortie;
  }
  if (obtenu === null || typeof obtenu !== 'object' || Array.isArray(obtenu) !== Array.isArray(attendu)) {
    sortie.push(chemin + ' : ' + JSON.stringify(obtenu) + ' au lieu d’un ' + (Array.isArray(attendu) ? 'tableau' : 'objet'));
    return sortie;
  }
  if (Array.isArray(attendu)) {
    if (obtenu.length !== attendu.length) sortie.push(chemin + ' : ' + obtenu.length + ' éléments au lieu de ' + attendu.length);
  } else {
    const a = Object.keys(obtenu).sort().join(','), b = Object.keys(attendu).sort().join(',');
    if (a !== b) sortie.push(chemin + ' : les champs ' + a + ' au lieu de ' + b);
  }
  Object.keys(attendu).forEach((k) => ecarts(obtenu[k], attendu[k], chemin + '.' + k, sortie));
  return sortie;
}

describe('75 — la concordance avec `parcours75.py`', () => {
  test('les fixtures : dix-sept cas synthétiques et le cas réel', () => {
    expect(SYNTHETIQUES).toHaveLength(17);
    expect(REEL.series.length).toBeGreaterThan(2000);
  });

  test.each(TOUS.map((c) => [c.nom, c]))('⚠️ %s : 0 écart, champ par champ', (nom, c) => {
    expect(ecarts(Parcours.parcours(c.entree), c.attendu, nom, [])).toEqual([]);
  });

  test('⚠️ le cas réel : la phrase qu’affiche l’app pour aurel_br', () => {
    expect(Parcours.parcours(entreeReelle()).phrase).toBe('Tes six derniers mois : les cinq groupes que tu suis ' +
      'progressent. Épaules : ce qui avance le plus lentement. Ton couché tire devant ton squat.');
  });

  test('le même calcul deux fois rend le même parcours, et l’entrée ne bouge pas', () => {
    const e = entreeReelle(), avant = JSON.stringify(e);
    expect(JSON.stringify(Parcours.parcours(e))).toBe(JSON.stringify(Parcours.parcours(e)));
    expect(JSON.stringify(e)).toBe(avant);
  });
});

describe('75 — les cas portent chaque chemin (sinon la concordance ne prouverait rien)', () => {
  const att = TOUS.map((c) => c.attendu);
  const exercices = [].concat(...att.map((a) => a.exercices));
  const rapports = [].concat(...att.map((a) => a.rapports));

  test('chaque état d’un exercice, et les deux méthodes', () => {
    ['↑', '↗', '▬', '↘', '↓', 'moins', 'nouveau', 'peu', 'pas comparable'].forEach((etat) => {
      expect([etat, exercices.some((o) => o.etat === etat)]).toEqual([etat, true]);
    });
    expect(exercices.some((o) => o.methode === 'reps')).toBe(true);
    expect(exercices.some((o) => o.methode === 'courbe' && o.k !== null)).toBe(true);
    expect(exercices.some((o) => o.methode === 'courbe' && o.k === null)).toBe(true);   // un k au bord : 1/30
  });

  test('un moins pratiqué avec son relais, un sans ; une barre qui compte double', () => {
    expect(exercices.some((o) => o.etat === 'moins' && o.relais.length > 0)).toBe(true);
    expect(exercices.some((o) => o.etat === 'moins' && o.relais.length === 0)).toBe(true);
    expect(exercices.some((o) => o.poids === 2 && ['↑', '↗', '▬', '↘', '↓'].indexOf(o.etat) >= 0)).toBe(true);
  });

  test('les groupes : un verdict, « pas assez de séances comparables », « pas encore suivi en charge »', () => {
    const zones = [].concat(...att.map((a) => a.zones));
    expect(zones.some((z) => z.verdict)).toBe(true);
    expect(zones.some((z) => z.raison === 'pas assez de séances comparables')).toBe(true);
    expect(zones.some((z) => z.raison === 'pas encore suivi en charge')).toBe(true);
  });

  test('les rapports : en dessous (avec l’écart en kilos), proche, sans repère ; les deux sexes', () => {
    expect(rapports.some((r) => r.lecture === 'en dessous' && typeof r.ecart_kg === 'number')).toBe(true);
    expect(rapports.some((r) => r.lecture === 'proche')).toBe(true);
    expect(rapports.some((r) => r.lecture === null && r.repere === null)).toBe(true);
    const sexes = new Set(TOUS.map((c) => c.entree.sexe));
    ['homme', 'femme', 'non_precise'].forEach((s) => expect([s, sexes.has(s)]).toEqual([s, true]));
  });
});

describe('75 — le levier suit l’ordre des priorités', () => {
  const m = SYNTHETIQUES.filter((c) => c.nom === 'm-levier-egalite')[0];

  test('à égalité, la première priorité dans SON ordre (la référence : « bras » pour [bras, dos])', () => {
    expect(Parcours.parcours(Object.assign({}, m.entree, { priorites: ['bras', 'dos'] })).levier).toBe('bras');
    expect(Parcours.parcours(Object.assign({}, m.entree, { priorites: ['dos', 'bras'] })).levier).toBe('dos');
  });

  test('sans priorité, tous les groupes à verdict, dans l’ordre des zones (la référence : « dos »)', () => {
    expect(Parcours.parcours(Object.assign({}, m.entree, { priorites: [] })).levier).toBe('dos');
  });
});

describe('75 — le module des faits assemble l’entrée et mémorise le parcours', () => {
  const catalogue = {
    squat_barre: { slug: 'squat_barre', nom: 'Squat (Barre)', muscles_primaires: ['quadriceps'], mouvement: 'squat',
                   schema_mouvement: 'accroupir', habilete: false, equipement: 'barre' }
  };
  const seances = [
    { id: 's1', debut: '2026-10-09T17:00:00Z', statut: 'terminee' },
    { id: 's2', debut: '2026-10-10T17:00:00Z', statut: 'en_cours' }
  ];
  const series = [
    { id: 'a', session_id: 's1', exercise_slug: 'squat_barre', type_serie: 'chauffe', reps: 5, charge_kg: 60 },
    { id: 'b', session_id: 's1', exercise_slug: 'squat_barre', type_serie: 'travail', reps: 5, charge_kg: 120 },
    { id: 'c', session_id: 's1', exercise_slug: 'squat_barre', reps: 3, charge_kg: 130 },
    { id: 'd', session_id: 's2', exercise_slug: 'squat_barre', type_serie: 'travail', reps: 5, charge_kg: 125 }
  ];
  const corpus = () => ({ seances, series, exercices: [], journal: [],
    seriesDe: (id) => series.filter((x) => x.session_id === id), catalogue: () => catalogue });
  const profil = { sexe: 'femme', priorites: ['jambes', 'squat_barre', 42] };

  test('les séries de travail des séances terminées, au jour de leur séance ; les priorités et le sexe du profil', () => {
    const f = Faits.creer();
    const e = f.entreeDuParcours(corpus(), new Date(2026, 9, 11, 12), profil);
    expect(e.aujourdhui).toBe('2026-10-11');
    expect(e.sexe).toBe('femme');
    expect(e.priorites).toEqual(Profil.prioritesDe(profil));
    expect(e.catalogue).toEqual([catalogue.squat_barre]);
    // La chauffe n'y est pas (`Modele.estTravail`) ; une série sans type est du travail ; la séance en cours non plus.
    expect(e.series.map((x) => [x.seance, x.reps, x.charge])).toEqual([['s1', 5, 120], ['s1', 3, 130]]);
    expect(e.series[0].debut).toBe(require('../../v2/js/moteur.js').jourCivil('2026-10-09T17:00:00Z'));
  });

  test('le parcours est mémorisé (le même objet), et recalculé quand le corpus ou le profil change', () => {
    const f = Faits.creer();
    const c = corpus(), quand = new Date(2026, 9, 11, 12);
    const p1 = f.parcoursDe(c, quand, profil);
    expect(f.parcoursDe(c, quand, profil)).toBe(p1);
    expect(f.parcoursDe(c, quand, { sexe: 'homme', priorites: [] })).not.toBe(p1);
  });

  test('⚠️ rien n’est écrit : le corpus et le profil sont identiques après deux calculs', () => {
    const f = Faits.creer(), c = corpus(), avant = JSON.stringify({ seances, series, catalogue, profil });
    f.parcoursDe(c, new Date(), profil);
    f.parcoursDe(c, new Date(), profil);
    expect(JSON.stringify({ seances, series, catalogue, profil })).toBe(avant);
  });
});

describe('75 — le formateur et la route', () => {
  test('`nombreFixe` : les zéros qui manquent, le même arrondi que `nombreTexte`', () => {
    expect(Modele.nombreFixe(0.5, 2)).toBe('0,50');
    expect(Modele.nombreFixe(1.04, 2)).toBe('1,04');
    expect(Modele.nombreFixe(1, 2)).toBe('1,00');
    expect(Modele.nombreFixe(1.235, 2)).toBe('1,24');
    expect(Modele.nombreFixe(12, 0)).toBe('12');
    expect(Modele.nombreFixe(null, 2)).toBe('');
  });

  test('/progression/parcours ouvre « Ton parcours », sous l’onglet Progression ; l’aller-retour est idempotent', () => {
    expect(R.analyser('/progression/parcours')).toEqual({ vue: R.PARCOURS, params: {} });
    expect(R.construire(R.PARCOURS, {})).toBe('/progression/parcours');
    expect(R.ongletDe(R.PARCOURS)).toBe(R.PROGRESSION);
  });
});
