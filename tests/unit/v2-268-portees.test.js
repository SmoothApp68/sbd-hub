/** @jest-environment node */
//
// 268 (lot 2, écran C) — PORTÉS, TRAÎNEAU, PINCÉ : `charge_distance` et `charge_temps` deviennent des mesures du catalogue.
// Pas de colonne d'effort (pas de répétitions) ; la distance se tape en mètres, la durée au pavé ; le coach ne les suit pas.

global.self = global;
const Modele = require('../../v2/js/modele.js');
const Seance = require('../../v2/js/seance.js');
const Palier = require('../../v2/js/palier.js');

const FERMIER = { slug: 'marche_fermier', nom: 'Marche du Fermier (Haltères)', mesure: 'charge_distance', charge: 'absolue', equipement: 'haltere' };
const TRAINEAU = { slug: 'poussee_traineau', nom: 'Poussée de Traîneau', mesure: 'charge_distance', charge: 'absolue', equipement: 'machine' };
const PINCE = { slug: 'pince_disques', nom: 'Pincé de Disques', mesure: 'charge_temps', charge: 'absolue', equipement: 'disque' };

describe('la grille', () => {
  test('charge · distance : deux cases, pas d’effort, la distance en mètres', () => {
    const g = Modele.grilleDe(FERMIER);
    expect(g.champs).toEqual(['charge_kg', 'distance_m']);
    expect(g.effort).toBe(false);
    expect(g.libelle).toBe('CHARGE · DISTANCE');
    expect(Modele.champDeMesure('distance_m')).toMatchObject({ unite: 'm', facteur: 1, cle: 'distance_m' });
  });
  test('charge · durée : la durée au pavé (chrono), pas d’effort', () => {
    const g = Modele.grilleDe(PINCE);
    expect(g.champs).toEqual(['charge_kg', 'duree']);
    expect(Modele.champDeMesure('duree').saisie).toBe('chrono');
    expect(g.effort).toBe(false);
  });
  test('la ligne d’aide dit ce qu’on tape : la paire aux haltères, ce qui est posé sur le traîneau, tout ce qu’on tient', () => {
    expect(Modele.grilleDe(FERMIER).aide).toBe('kg, les deux haltères');
    expect(Modele.grilleDe(TRAINEAU).aide).toBe('kg posés dessus');
    expect(Modele.grilleDe(PINCE).aide).toBe('kg, tout ce que tu tiens');
    expect(Modele.grilleDe({ mesure: 'charge_reps', equipement: 'barre' }).aide).toBeUndefined();   // témoin : rien ne change ailleurs
  });
});

describe('la saisie et le journal', () => {
  const seance = (slug) => ({ exercices: [{ exercise_slug: slug, series: [Seance.serieVide('a')] }] });
  const apres = (champs) => Seance.modifierSerie(seance('marche_fermier'), 0, 0, champs).exercices[0].series[0];
  test('la distance se tape en mètres : 40, jamais 0,04 km ; la borne de 300 km est celle de la distance', () => {
    expect(apres({ distance_m: '40' }).distance_m).toBe(40);
    expect(apres({ distance_m: '300000' }).distance_m).toBe(300000);
    expect(apres({ distance_m: '300001' }).distance_m).toBeNull();
    expect(apres({ distance_m: '0' }).distance_m).toBeNull();
    expect(Modele.maxDeSaisie('distance_m')).toBe(300000);
  });
  test('« PRÉC. » : « 64 · 40 m », « 20 · 00:40 »', () => {
    expect(Modele.formatPrecedent({ charge_kg: 64, distance_m: 40 }, 'charge_distance')).toBe('64 · 40 m');
    expect(Modele.formatPrecedent({ charge_kg: 20, duree_s: 40 }, 'charge_temps')).toBe('20 · 00:40');
    expect(Modele.formatPrecedent({ charge_kg: 64 }, 'charge_distance')).toBe('64');
    expect(Modele.formatPrecedent({}, 'charge_temps')).toBe('—');
  });
  test('le journal : « 64 kg · 40 m », « 20 kg · 45 s » (lu sur les colonnes, comme avant)', () => {
    expect(Modele.formatMesure({ charge_kg: 64, distance_m: 40 })).toBe('64 kg · 40 m');
    expect(Modele.formatMesure({ charge_kg: 20, duree_s: 45 })).toBe('20 kg · 45 s');
  });
  test('une série sans distance reste en cases manquantes ; sans charge aussi (rouge au ✓)', () => {
    const g = Modele.grilleDe(FERMIER);
    expect(Seance.casesManquantes(g, { charge_kg: 64 }, {})).toEqual(['distance_m']);
    expect(Seance.casesManquantes(g, { distance_m: 40 }, {})).toEqual(['charge_kg']);
    expect(Seance.casesManquantes(g, { charge_kg: 64, distance_m: 40 }, {})).toEqual([]);
  });
  test('le gris de la fois d’avant ne se valide que si rien n’est tapé (comme le cardio)', () => {
    const g = Modele.grilleDe(FERMIER);
    expect(Seance.grisValide(g, { charge_kg: 70 }, { charge_kg: 64, distance_m: 40 })).toEqual({});
    expect(Seance.grisValide(g, {}, { charge_kg: 64, distance_m: 40 })).toEqual({ charge_kg: 64, distance_m: 40 });
  });
});

describe('le coach ne suit pas ces mesures', () => {
  test('palier : hors moteur, aucune charge proposée', () => {
    const series = [{ id: 'a', rang: 1, charge_kg: 64, distance_m: 40, type_serie: 'travail', exercise_slug: 'marche_fermier' }];
    ['charge_distance', 'charge_temps'].forEach((mesure) => {
      expect(Palier.analyser(series, undefined, { mesure }).palier).toBeNull();
      expect(Palier.analyser(series, undefined, { mesure }).erreur).toBe(Palier.HORS_MOTEUR);
    });
  });
  test('une seule définition : `horsMoteur` et `estUnePortee`', () => {
    expect(Modele.horsMoteur('distance_temps')).toBe(true);
    expect(Modele.horsMoteur('charge_distance')).toBe(true);
    expect(Modele.horsMoteur('charge_temps')).toBe(true);
    expect(Modele.horsMoteur('charge_reps')).toBe(false);
    expect(Modele.estUnePortee('distance_temps')).toBe(false);
  });
  test('la page d’exercice : la plus longue distance à la charge la plus lourde (80 m à 20 kg ne passe pas devant 60 m à 64 kg)', () => {
    const s = (kg, m) => ({ exercise_slug: 'marche_fermier', type_serie: 'travail', charge_kg: kg, distance_m: m });
    const m = Modele.meilleureSerieDe('marche_fermier', [s(20, 80), s(64, 40), s(64, 60)], [FERMIER], null, {});
    expect(m.valeur).toBe('60 m');
    expect(m.libelle).toBe('Plus longue distance, à 64 kg');
    expect(Modele.texteMeilleure(m)).toBe('60 m · 64 kg');
  });
});
