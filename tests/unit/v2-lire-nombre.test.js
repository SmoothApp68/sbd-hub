/** @jest-environment node */
//
// Correctif du 03/10/2026 — UNE ASSISTANCE RETOUCHÉE NE PERD PLUS SA CHARGE.
//
// Le champ de charge réaffiche une assistance avec le vrai signe moins
// (`THModele.nombreSigne`, U+2212) ; la relecture de la saisie
// (`Seance.modifierSerie` → `nombreOuNul`) ne lisait que le trait d'union du
// clavier : retoucher « −25 » effaçait la charge. Une seule lecture des
// nombres désormais, à côté du formateur : `THModele.lireNombre`.
//
//   1. Les trois signes moins, la virgule, les espaces.
//   2. L'aller-retour : tout ce que le formateur affiche se relit à l'identique.
//   3. La séance : une assistance retouchée garde sa charge.

const Modele = require('../../v2/js/modele.js');
const Seance = require('../../v2/js/seance.js');

const MOINS = '−';        // le vrai signe moins (celui du formateur)
const DEMI_CADRATIN = '–'; // celui de certains claviers
const FINE = ' ';          // l'espace fine insécable des milliers

describe('lireNombre — tous les signes moins', () => {
  test('le trait d’union du clavier, le vrai signe moins, le demi-cadratin', () => {
    expect(Modele.lireNombre('-25')).toBe(-25);
    expect(Modele.lireNombre(MOINS + '25')).toBe(-25);
    expect(Modele.lireNombre(DEMI_CADRATIN + '25')).toBe(-25);
  });

  test('la virgule décimale, avec chacun des signes', () => {
    expect(Modele.lireNombre('-22,5')).toBe(-22.5);
    expect(Modele.lireNombre(MOINS + '22,5')).toBe(-22.5);
    expect(Modele.lireNombre(DEMI_CADRATIN + '2,5')).toBe(-2.5);
    expect(Modele.lireNombre('12.5')).toBe(12.5);
  });

  test('les espaces : fine des milliers, insécable, ordinaire, autour', () => {
    expect(Modele.lireNombre('28' + FINE + '404')).toBe(28404);
    expect(Modele.lireNombre('1 000')).toBe(1000);
    expect(Modele.lireNombre(' 140 ')).toBe(140);
    expect(Modele.lireNombre(MOINS + ' 25')).toBe(-25);
  });

  test('rien n’est deviné : un vide n’est pas zéro, ce qui n’est pas un nombre rend null', () => {
    expect(Modele.lireNombre(null)).toBeNull();
    expect(Modele.lireNombre(undefined)).toBeNull();
    expect(Modele.lireNombre('')).toBeNull();
    expect(Modele.lireNombre('   ')).toBeNull();
    expect(Modele.lireNombre(MOINS)).toBeNull();
    expect(Modele.lireNombre('abc')).toBeNull();
    expect(Modele.lireNombre(NaN)).toBeNull();
    expect(Modele.lireNombre('0')).toBe(0);
    expect(Modele.lireNombre(-25)).toBe(-25);
  });
});

describe('lireNombre — l’aller-retour avec le formateur', () => {
  const ECHANTILLON = [-25, -22.5, -2.5, 0, 12.5, 140];

  test('ce que le champ affiche (`nombreSigne`) se relit à l’identique', () => {
    // La prémisse : le formateur écrit bien le vrai signe moins.
    expect(Modele.nombreSigne(-25)).toBe(MOINS + '25');
    ECHANTILLON.forEach((n) => expect([n, Modele.lireNombre(Modele.nombreSigne(n))]).toEqual([n, n]));
  });

  test('ce que la voix écrit (`nombre`, le trait d’union) et les milliers (`nombreGroupe`) aussi', () => {
    ECHANTILLON.forEach((n) => expect([n, Modele.lireNombre(Modele.nombre(n))]).toEqual([n, n]));
    expect(Modele.lireNombre(Modele.nombreGroupe(28404))).toBe(28404);
  });
});

describe('la séance — une assistance retouchée garde sa charge', () => {
  const seanceA = () => {
    let n = 0;
    const id = () => 's' + (++n);
    let s = Seance.creer({ id: 'X', userId: 'u', idSerie: id, debut: '2026-10-03T08:00:00.000Z' });
    s = Seance.ajouterExercice(s, 'traction_assistee', id, { series: 1 });
    return Seance.modifierSerie(s, 0, 0, { charge_kg: '-25', reps: '8' });
  };
  const serie = (s) => s.exercices[0].series[0];

  test('les reps retouchées : la charge reste −25', () => {
    const s = Seance.modifierSerie(seanceA(), 0, 0, { reps: '10' });
    expect([serie(s).charge_kg, serie(s).reps]).toEqual([-25, 10]);
  });

  test('DISCRIMINANT — la charge relue telle que le champ l’affiche (« −25 », U+2212)', () => {
    const affichee = Modele.nombreSigne(serie(seanceA()).charge_kg);
    const s = Seance.modifierSerie(seanceA(), 0, 0, { charge_kg: affichee });
    expect(serie(s).charge_kg).toBe(-25);
  });

  test('DISCRIMINANT — la charge retouchée dans le champ affiché (« −25 » → « −20 ») : −20, pas rien', () => {
    const s = Seance.modifierSerie(seanceA(), 0, 0, { charge_kg: MOINS + '20' });
    expect(serie(s).charge_kg).toBe(-20);
    const t = Seance.modifierSerie(seanceA(), 0, 0, { charge_kg: DEMI_CADRATIN + '22,5' });
    expect(serie(t).charge_kg).toBe(-22.5);
  });
});
