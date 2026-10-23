/** @jest-environment node */
//
// ECRAN-SAISIE §3 bis.3 bis — prompts 100 puis 105 : aucune série ne se valide
// avec une case obligatoire vide. Au ✓, chaque case du gabarit (charge, reps,
// durée, distance, selon la mesure) vaut ce qui est tapé, sinon le chiffre gris
// du coach (le fantôme) ; ni l'un ni l'autre, elle manque. Une seule règle,
// `casesManquantes`, qui rend les cases manquantes dans l'ordre de la ligne (la
// première reçoit le clavier). Le cas du prompt 99 : en haut de zone, le test
// « le cran au-dessus × 3 » n'a pas de chiffre (fantôme charge null).

const Modele = require('../../v2/js/modele.js');
const Seance = require('../../v2/js/seance.js');

const g = (exo) => Modele.gabaritDe(exo);
const charge = g({ mesure: 'charge_reps' });
const vide = { charge_kg: null, reps: null, duree_s: null, distance_m: null };
const de = (o) => Object.assign({}, vide, o);
const manque = (gab, serie, f) => Seance.casesManquantes(gab, de(serie), de(f));

describe('105 — les cases obligatoires : une seule règle', () => {
  test('le cas du 99 : charge ni tapée ni proposée → elle manque', () => {
    expect(manque(charge, { reps: 3 }, { reps: 3 })).toEqual(['charge_kg']);
  });
  test('une charge tapée est validée ; 0 kg tapé est une charge', () => {
    expect(manque(charge, { charge_kg: 82.5, reps: 5 }, {})).toEqual([]);
    expect(manque(charge, { charge_kg: 0, reps: 5 }, {})).toEqual([]);
  });
  test('le fantôme du coach est validé, comme avant', () => {
    expect(manque(charge, {}, { charge_kg: 80, reps: 5 })).toEqual([]);
  });
  test('⚠️ reps vides sans fantôme : elles manquent (rouge)', () => {
    expect(manque(charge, { charge_kg: 80 }, { charge_kg: 80 })).toEqual(['reps']);
    expect(manque(g({ mesure: 'reps' }), {}, {})).toEqual(['reps']);
  });
  test('reps vides avec fantôme : le chiffre gris est validé', () => {
    expect(manque(charge, { charge_kg: 80 }, { reps: 8 })).toEqual([]);
    expect(manque(g({ mesure: 'reps' }), {}, { reps: 12 })).toEqual([]);
  });
  test('charge et reps vides ensemble : les deux, la charge d’abord (le clavier va sur elle)', () => {
    expect(manque(charge, {}, {})).toEqual(['charge_kg', 'reps']);
  });
  test('⚠️ une planche sans durée : la durée manque ; tapée ou grisée, elle passe', () => {
    const planche = g({ mesure: 'temps' });
    expect(manque(planche, {}, {})).toEqual(['duree']);
    expect(manque(planche, { duree_s: 45 }, {})).toEqual([]);
    expect(manque(planche, {}, { duree_s: 60 })).toEqual([]);
  });
  // ⚠️ INVERSÉ AU PROMPT 131 (audit 130 n°2). Ce test affirmait « chacune est due » :
  // la décision du 17/10/2026 (D1, ECRAN §3 bis.3 bis) dit « durée OU distance ».
  // Une série de cardio se valide avec l'une des deux ; les deux vides, les deux
  // passent au rouge.
  test('durée OU distance : l’une suffit ; les deux vides, les deux manquent', () => {
    const course = g({ mesure: 'distance_temps' });
    expect(manque(course, { duree_s: 1800 }, {})).toEqual([]);          // durée seule
    expect(manque(course, { distance_m: 5000 }, {})).toEqual([]);       // distance seule
    expect(manque(course, {}, { distance_m: 5000 })).toEqual([]);
    expect(manque(course, {}, {})).toEqual(['duree', 'distance_km']);   // ni l'une ni l'autre
    expect(manque(course, { duree_s: 1800 }, { distance_m: 5000 })).toEqual([]);
  });
  test('chauffe et dégressive : même règle', () => {
    expect(manque(charge, { type_serie: 'chauffe', reps: 5 }, {})).toEqual(['charge_kg']);
    expect(manque(charge, { type_serie: 'degressive', charge_kg: 40 }, {})).toEqual(['reps']);
  });
  test('lest et aide vides : sans lest, sans aide — mais les reps restent dues', () => {
    ['ajoutee', 'assistance'].forEach((c) => {
      const gab = g({ mesure: 'charge_reps', charge: c });
      expect(manque(gab, { reps: 8 }, {})).toEqual([]);
      expect(manque(gab, {}, {})).toEqual(['reps']);
    });
  });
  test('reps seules, durée, distance : jamais de charge demandée', () => {
    ['reps', 'temps', 'distance_temps'].forEach((m) => {
      expect(manque(g({ mesure: m }), {}, {})).not.toContain('charge_kg');
    });
  });
  test('mesure inconnue : on ne sait pas ce qu’il mesure, on n’empêche rien', () => {
    expect(manque(g({ mesure: 'zzz' }), {}, {})).toEqual([]);
  });
  test('une saisie illisible n’est pas un chiffre', () => {
    expect(manque(charge, { charge_kg: 'abc', reps: 5 }, {})).toEqual(['charge_kg']);
    expect(manque(charge, { charge_kg: '', reps: 5 }, {})).toEqual(['charge_kg']);
  });
});

// ECRAN §3 ter.5 (prompt 131, audit 130 n°3) — LE CHIFFRE GRIS EN CARDIO. Sur `temps` et
// `distance_temps`, le gris n'est validé que si TOUTES les cases de la série sont vides.
// ⚠️ DISCRIMINANT : la durée tapée et la distance grise. Avant, la distance de la fois
// d'avant était recopiée sur la série du jour (une distance jamais faite).
describe('131 — le chiffre gris en cardio : tout vide, ou rien', () => {
  const course = g({ mesure: 'distance_temps' });
  const gris = { duree_s: 3600, distance_m: 12000 };
  test('tout vide : le gris de la fois d’avant est validé, en entier', () => {
    expect(Seance.grisValide(course, de({}), de(gris))).toEqual(de(gris));
    expect(manque(course, {}, gris)).toEqual([]);
  });
  test('une case tapée : le gris ne vaut plus rien, la case vide reste vide', () => {
    expect(Seance.grisValide(course, de({ duree_s: 1800 }), de(gris))).toEqual({});
    expect(Seance.grisValide(course, de({ distance_m: 5000 }), de(gris))).toEqual({});
    expect(manque(course, { duree_s: 1800 }, gris)).toEqual([]);   // durée OU distance
  });
  test('la planche aussi (`temps`) ; un 0 tapé n’est pas une case vide', () => {
    const planche = g({ mesure: 'temps' });
    expect(Seance.grisValide(planche, de({}), de({ duree_s: 60 }))).toEqual(de({ duree_s: 60 }));
    expect(Seance.grisValide(planche, de({ duree_s: 45 }), de({ duree_s: 60 }))).toEqual({});
  });
  test('charge × reps et reps : rien ne change, le gris du coach se valide case par case', () => {
    const f = de({ charge_kg: 80, reps: 5 });
    expect(Seance.grisValide(charge, de({ charge_kg: 82.5 }), f)).toBe(f);
    expect(manque(charge, { charge_kg: 82.5 }, { reps: 5 })).toEqual([]);
    const pompes = g({ mesure: 'reps' });
    expect(Seance.grisValide(pompes, de({ reps: 10 }), de({ reps: 12 }))).toEqual(de({ reps: 12 }));
  });
});
