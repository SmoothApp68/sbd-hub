//
// 133 (audit 130 #10, décidé le 21/10/2026, ECRAN-SAISIE D3) — UNE CHARGE DE 0 KG S'ÉCRIT « poids du corps × 12 »,
// par le formateur unique, partout : le journal, le détail, la médaille, le récap. Jamais « 0 kg × 12 ».
//
// Avant 133, le même fait avait trois écritures : « 0 kg × 12 » au journal et au détail (`chargeDuJournal`),
// « poids du corps » à la médaille, « 12 » au récap (`faitDeLExercice` : « une charge 0 n'est pas une charge »).
// Environnement jsdom (le détail se rend) : `modele.js` et `rendu.js` se terminent par `this`.

require('../../v2/js/routeur.js');
require('../../v2/js/semaine.js');
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/routines.js');
require('../../v2/js/rendu.js');
require('../../v2/js/bilan.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
require('../../v2/js/seance.js');
require('../../v2/js/periode.js');
const Faits = require('../../v2/js/faits.js');

const esp = (t) => String(t).replace(/[  ]/g, ' ');

// Un lest laissé à 0 sur des tractions lestées : la ligne que l'audit a exécutée.
const CAT = [
  { slug: 'tractions-lestees', nom: 'Tractions lestées', mesure: 'charge_reps', charge: 'lest', muscles_primaires: ['grand_dorsal'] },
  { slug: 'dc', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['pectoraux'] }
];
let r = 0;
const serie = (slug, champs) => Object.assign({ id: 'x' + (++r), session_id: 'S', exercise_slug: slug, rang: r,
  type_serie: 'travail', charge_kg: null, reps: null, duree_s: null, distance_m: null, groupe_superset: null,
  validee_a: '2026-10-21T17:00:00Z', source: 'app' }, champs);

describe('133 — #10 : une charge de 0 kg est le poids du corps, partout', () => {
  test('le journal (`formatMesure`) : « poids du corps × 12 », jamais « 0 kg × 12 »', () => {
    expect(Modele.formatMesure({ charge_kg: 0, reps: 12 })).toBe('poids du corps × 12');
    expect(Modele.formatMesure({ charge_kg: '0', reps: 8 })).toBe('poids du corps × 8');
    // Le reste ne bouge pas : une charge, une aide, des reps seules.
    expect(Modele.formatMesure({ charge_kg: 52, reps: 12 })).toBe('52 kg × 12');
    expect(esp(Modele.formatMesure({ charge_kg: -22.5, reps: 8 }))).toBe('Aide 22,5 kg × 8');
    expect(Modele.formatMesure({ charge_kg: null, reps: 12 })).toBe('12 reps');
    // La charge sans reps (une colonne de charge sous une durée) : la même écriture.
    expect(Modele.formatMesure({ charge_kg: 0, duree_s: 30 })).toBe('poids du corps · 30 s');
  });

  test('le journal : la meilleure série (carte de séance, page d’exercice) passe par le même formateur', () => {
    expect(Modele.texteMeilleure({ charge: 0, reps: 12 })).toBe('poids du corps × 12');
    expect(Modele.texteMeilleure({ charge: 80, reps: 5 })).toBe('80 kg × 5');
  });

  test('le détail d’une séance : la ligne de la série dit « poids du corps × 12 »', () => {
    const series = [serie('tractions-lestees', { charge_kg: 0, reps: 12 }), serie('dc', { charge_kg: 100, reps: 5 })];
    const cible = document.createElement('div');
    window.THRendu.rendreDetail(cible, { titre: 'Dos', debut: '2026-10-21T17:00:00Z' }, Modele.construireBlocs(series, CAT), {});
    const mesures = [...cible.querySelectorAll('.mesure')].map((x) => esp(x.textContent));
    expect(mesures).toEqual(['poids du corps × 12', '100 kg × 5']);
    expect(cible.textContent).not.toMatch(/\b0 kg/);
  });

  test('la médaille : la même écriture, en gras comme en gris', () => {
    const p = Modele.phraseDeRecord([{ type: 'charge_a_reps', reps: 12, valeur: 5, ancien: 0, ancien_le: '2026-10-07' }],
      'tractions lestées', '2026-10-21');
    expect(esp(p[0])).toBe('Record à 12 reps : 5 kg.');
    expect(esp(p[1])).toBe('Avant : poids du corps à 12 reps, le 7 oct.');
    const q = Modele.phraseDeRecord([{ type: 'reps_a_charge', charge: 0, valeur: 13, ancien: 12, ancien_le: '2026-10-07' }],
      'tractions lestées', '2026-10-21');
    expect(q[0]).toBe('Record au poids du corps : 13 reps.');
  });

  test('le récap : « poids du corps × 12, 10 », jamais « 12, 10 » ni « 0 kg × 12 »', () => {
    const faits = Faits.creer();
    expect(faits.faitDeLExercice([serie('t', { charge_kg: 0, reps: 12 }), serie('t', { charge_kg: 0, reps: 10 })]))
      .toBe('poids du corps × 12, 10');
    // Un lest qui monte : deux paquets, chacun sa charge.
    expect(esp(faits.faitDeLExercice([serie('t', { charge_kg: 0, reps: 12 }), serie('t', { charge_kg: 5, reps: 10 })])))
      .toBe('poids du corps × 12 · 5 kg × 10');
    // Sans charge (une mesure en reps), les reps seules, comme avant.
    expect(faits.faitDeLExercice([serie('t', { reps: 9 }), serie('t', { reps: 8 })])).toBe('9, 8');
  });
});

describe('133 — #10, les colonnes étroites : « PDC », l’abréviation du carnet, jamais « 0 »', () => {
  test('la colonne « préc. » (62 px) : « PDC×12 », jamais « 0×12 » ; une charge et une aide, comme avant', () => {
    expect(Modele.formatPrecedent({ charge_kg: 0, reps: 12 }, 'charge_reps', 'lest')).toBe('PDC×12');
    expect(Modele.formatPrecedent({ charge_kg: 0, reps: 12 }, 'charge_reps', null)).toBe('PDC×12');
    expect(Modele.formatPrecedent({ charge_kg: 0, reps: null }, 'charge_reps', null)).toBe('PDC');
    expect(Modele.formatPrecedent({ charge_kg: 122.5, reps: 5 }, 'charge_reps', null)).toBe('122,5×5');
    expect(Modele.formatPrecedent({ charge_kg: -22.5, reps: 8 }, 'charge_reps', 'aide')).toBe('22,5×8');
  });

  test('la table par reps de la page d’exercice (66 px) : « PDC » pour 0 kg, le nombre sinon', () => {
    const cible = document.createElement('div');
    window.THRendu.rendrePageExercice(cible, {
      nom: 'Tractions lestées', mesure: 'charge_reps', onglet: 'resume', sousTitre: '', surOnglet: () => {},
      seanceEnCours: null, derniere: null, record: null, volume: { nbSeries: 3, nbSeances: 2 },
      table: [{ reps: 12, charge: 0, date: '2026-10-07', deduit: false }, { reps: 8, charge: 7.5, date: '2026-10-14', deduit: false }],
      cibleReps: null, historique: [], surSeance: () => {}, reste: 0, surVoirPlus: () => {} });
    expect([...cible.querySelectorAll('.tr-charge')].map((x) => x.textContent)).toEqual(['PDC', '7,5']);
  });
});
