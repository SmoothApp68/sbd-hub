/** @jest-environment node */
//
// 268 (lot 2, écran E) — LES NOUVEAUX AU CATALOGUE : l'onglet « Nouveaux », l'étiquette, et ce qu'on y tape (« KG · REPS », « DURÉE »).
// Le catalogue vit en base (V2-140) : le code ne connaît que la liste des slugs nouveaux et leur date d'arrivée.

process.env.TZ = 'Europe/Paris';
global.self = global;
const Modele = require('../../v2/js/modele.js');
const Routines = require('../../v2/js/routines.js');

const CAT = [
  { slug: 'curl_barre_chargee', nom: 'Curl à la Barre Chargée', mesure: 'charge_reps', charge: 'absolue', equipement: 'barre', muscles_primaires: ['biceps'] },
  { slug: 'soutien_aux_barres', nom: 'Soutien aux Barres', mesure: 'temps', charge: 'aucune', equipement: 'aucun', muscles_primaires: ['triceps'] },
  { slug: 'grenouille', nom: 'Grenouille', mesure: 'temps', charge: 'aucune', equipement: 'aucun', muscles_primaires: ['deltoide_anterieur'] },
  { slug: 'abduction_machine', nom: 'Abduction (Machine)', mesure: 'charge_reps', charge: 'absolue', equipement: 'machine', muscles_primaires: ['abducteurs'] }
];
const LE = (j) => new Date(j + 'T12:00:00');

describe('Nouveau : trente jours, ou la première séance qui le contient', () => {
  test('dans les trente jours, jamais fait : nouveau', () => {
    expect(Modele.estNouveau('curl_barre_chargee', LE('2026-11-08'), {})).toBe(true);
    expect(Modele.estNouveau('curl_barre_chargee', LE('2026-12-07'), {})).toBe(true);    // le 30e jour
  });
  test('au 31e jour, l’étiquette s’efface', () => {
    expect(Modele.estNouveau('curl_barre_chargee', LE('2026-12-08'), {})).toBe(false);
  });
  test('dès qu’une séance contient l’exercice, l’étiquette s’efface (avant les trente jours)', () => {
    expect(Modele.estNouveau('curl_barre_chargee', LE('2026-11-10'), { curl_barre_chargee: 1 })).toBe(false);
    expect(Modele.estNouveau('curl_barre_chargee', LE('2026-11-10'), { abduction_machine: 12 })).toBe(true);
  });
  test('un exercice qui n’est pas dans la liste n’est jamais nouveau', () => {
    expect(Modele.estNouveau('abduction_machine', LE('2026-11-08'), {})).toBe(false);
  });
  test('l’onglet ne compte que ce que le catalogue de l’appareil contient (migration pas lancée : rien)', () => {
    expect(Modele.nouveauxDuCatalogue(CAT, LE('2026-11-08'), {})).toEqual(['curl_barre_chargee', 'grenouille', 'soutien_aux_barres']);
    expect(Modele.nouveauxDuCatalogue([CAT[3]], LE('2026-11-08'), {})).toEqual([]);
    expect(Modele.nouveauxDuCatalogue(CAT, LE('2026-11-08'), { soutien_aux_barres: 2 })).toEqual(['curl_barre_chargee', 'grenouille']);
  });
});

describe('ce qu’on y tape, écrit comme les en-têtes de la grille', () => {
  test.each([
    [{ mesure: 'charge_reps', charge: 'absolue' }, 'KG · REPS'],
    [{ mesure: 'charge_reps', charge: 'assistance' }, 'AIDE · REPS'],
    [{ mesure: 'charge_reps', charge: 'ajoutee' }, 'LEST · REPS'],
    [{ mesure: 'reps' }, 'REPS'],
    [{ mesure: 'temps' }, 'DURÉE'],
    [{ mesure: 'distance_temps' }, 'DURÉE · DISTANCE'],
    [{ mesure: 'charge_distance' }, 'KG · DISTANCE'],
    [{ mesure: 'charge_temps' }, 'KG · DURÉE'],
    [{ mesure: 'inconnue' }, ''],
    [null, '']
  ])('%j → « %s »', (exo, attendu) => { expect(Modele.libelleDeMesure(exo)).toBe(attendu); });
});

describe('la recherche : l’onglet « Nouveaux » restreint aux slugs nouveaux, le nom les trouve aussi', () => {
  const nouveaux = ['curl_barre_chargee', 'grenouille', 'soutien_aux_barres'];
  test('restreinte aux nouveaux', () => {
    const l = Routines.chercher(CAT, '', { filtres: { slugs: nouveaux }, limite: Infinity }).map((e) => e.slug).sort();
    expect(l).toEqual(nouveaux);
  });
  test('« sout » et « curl » les trouvent aussi, avec ou sans l’onglet', () => {
    expect(Routines.chercher(CAT, 'sout', {}).map((e) => e.slug)).toEqual(['soutien_aux_barres']);
    expect(Routines.chercher(CAT, 'curl', {}).map((e) => e.slug)).toEqual(['curl_barre_chargee']);
    expect(Routines.chercher(CAT, 'abduction', { filtres: { slugs: nouveaux } }).map((e) => e.slug)).toEqual([]);
  });
});
