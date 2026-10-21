//
// Prompt 131 (audit 130 n°8) — le champ de la distance refuse le chiffre de trop, comme le
// pavé de la durée : au-delà de 400 km, le champ revient au dernier texte accepté, et rien
// n'est écrit. Environnement jsdom.

require('../../v2/js/semaine.js');
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/seance.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const CAT = [{ slug: 'course', nom: 'Course à Pied', mesure: 'distance_temps', charge: 'aucune', muscles_primaires: [] }];

test('taper 4001 km : le dernier chiffre n’entre pas, la série garde 400', () => {
  const ecrits = [];
  const s = { exercices: [{ exercise_slug: 'course', series: [{ id: 's1', type_serie: 'travail',
    charge_kg: null, reps: null, duree_s: null, distance_m: null }] }] };
  const cible = document.createElement('div');
  Rendu().rendreBlocsSeance(cible, s, {
    blocs: Modele.blocsDeSeance(s, CAT), exercice: () => CAT[0],
    precedent: () => null, fantome: () => ({}), tourAtteint: () => 0,
    surValider: () => {}, surEffort: () => {},
    surChamp: (i, j, champ, v) => ecrits.push([champ, v]),
    surNumero: () => {}, surNote: () => {}, surRepos: () => {},
    surAjoutSerie: () => {}, surSupprimerSerie: () => {}, surMenuBloc: () => {}, surMenuExercice: () => {}
  });
  const input = cible.querySelector('[data-champ="distance_km"] input');
  ['4', '40', '400', '4001'].forEach((v) => { input.value = v; input.dispatchEvent(new Event('input')); });
  expect(input.value).toBe('400');
  expect(ecrits.map((e) => e[1])).toEqual(['4', '40', '400']);
  input.value = '400,1'; input.dispatchEvent(new Event('input'));
  expect(input.value).toBe('400');
  input.value = '39,5'; input.dispatchEvent(new Event('input'));
  expect(ecrits[ecrits.length - 1]).toEqual(['distance_km', '39,5']);
});

// ── Point 2 — la grille : les étages en colonne, le D+ sous la série (maquette, écrans 1 et 2) ──
const CAT2 = [
  { slug: 'randonnee', nom: 'Randonnée', mesure: 'distance_temps', charge: 'aucune', champs_series: ['denivele_m'], muscles_primaires: [] },
  { slug: 'escaliers', nom: 'Escaliers', mesure: 'temps', charge: 'aucune', champs_series: ['etages'], muscles_primaires: [] }
];
const serie = (o) => Object.assign({ id: 'x', type_serie: 'travail', charge_kg: null, reps: null, duree_s: null,
  distance_m: null, denivele_m: null, etages: null }, o);
function rendre131(programme, ecrits) {
  const s = { exercices: [
    { exercise_slug: 'randonnee', series: [serie({ id: 'r1', duree_s: 12300, distance_m: 13200 })] },
    { exercise_slug: 'escaliers', series: [serie({ id: 'e1', duree_s: 1200, etages: 72 })] }] };
  const cible = document.createElement('div');
  Rendu().rendreBlocsSeance(cible, programme ? null : s, Object.assign({
    programme: !!programme,
    blocs: Modele.blocsDeSeance(s, CAT2), exercice: (slug) => CAT2.filter((e) => e.slug === slug)[0],
    precedent: () => null, fantome: () => ({ duree_s: 600, distance_m: 4000 }), tourAtteint: () => 0,
    surValider: () => {}, surEffort: () => {},
    surChamp: (i, j, champ, v) => ecrits.push([i, j, champ, v]),
    surNumero: () => {}, surNote: () => {}, surRepos: () => {},
    surAjoutSerie: () => {}, surSupprimerSerie: () => {}, surMenuBloc: () => {}, surMenuExercice: () => {}
  }));
  return cible;
}

test('Escaliers : ÉTAGES prend la colonne de la distance (grille à deux cases) ; la légende le dit', () => {
  const c = rendre131(false, []);
  const blocs = c.querySelectorAll('.bloc-seance');
  const esc = blocs[1];
  expect([...esc.querySelectorAll('.cols-seance span')].map((x) => x.textContent)).toEqual(['', 'PRÉC.', 'DURÉE', 'ÉTAGES', '']);
  expect(esc.querySelector('.serie').className).toContain('g-temps g-plus');
  expect(esc.querySelector('[data-champ="etages"] input').value).toBe('72');
  expect(esc.textContent).toContain('DURÉE · ÉTAGES');
});

test('Randonnée : le D+ sur sa propre ligne, sous la série, facultatif, sans chiffre gris ; taper l’écrit', () => {
  const ecrits = [];
  const c = rendre131(false, ecrits);
  const rando = c.querySelectorAll('.bloc-seance')[0];
  expect(rando.querySelectorAll('.serie [data-champ]').length).toBe(2);   // durée et distance, rien de plus
  const plus = rando.querySelector('.serie-plus');
  expect(plus).not.toBeNull();
  expect(plus.textContent).toContain('Dénivelé + (facultatif)');
  const i = plus.querySelector('[data-champ="denivele_m"] input');
  expect([i.value, i.placeholder]).toEqual(['', '']);
  i.value = '920'; i.dispatchEvent(new Event('input'));
  expect(ecrits).toEqual([[0, 0, 'denivele_m', '920']]);
  i.value = '10001'; i.dispatchEvent(new Event('input'));            // au-delà de 10 000 m : n'entre pas
  expect(i.value).toBe('920');
});

test('l’éditeur de routine : aucun champ en plus', () => {
  const c = rendre131(true, []);
  expect(c.querySelectorAll('.serie-plus').length).toBe(0);
  expect(c.querySelectorAll('[data-champ="etages"]').length).toBe(0);
});

// ── Point 4 — la feuille « Terminer » montre UNE case (écran 6) ─────────────────────────────
test('la feuille de fin : la phrase, la série, la case ; taper l’écrit ; sans manque, rien', () => {
  const recu = [];
  const vue = (manque) => ({ compte: { travail: 0, horsMusculation: { series: 1, duree_s: 11400, distance_m: 0 } },
    manque: manque, titre: null, note: null, salle: null, salleMax: 40, routine: '', ecarts: [],
    surTitre: () => {}, surSalle: () => {}, surNoteSeance: () => {}, surMajRoutine: () => {},
    surTerminer: () => {}, surAbandonner: () => {} });
  const cible = document.createElement('div');
  Rendu().rendreFeuilleFin(cible, vue({ phrase: 'Il manque le D+.', serie: 'Randonnée · 3 h 10', champ: 'denivele_m',
    unite: 'm', max: 10000, valeur: null, surSaisie: (v) => recu.push(v) }));
  expect(cible.querySelector('.manque-fin-t').textContent).toBe('Il manque le D+.');
  expect(cible.querySelector('.manque-fin-s').textContent).toBe('Randonnée · 3 h 10');
  const i = cible.querySelectorAll('.manque-fin [data-champ="denivele_m"] input');
  expect(i.length).toBe(1);
  i[0].value = '920'; i[0].dispatchEvent(new Event('input'));
  expect(recu).toEqual(['920']);
  const sans = document.createElement('div');
  Rendu().rendreFeuilleFin(sans, vue(null));
  expect(sans.querySelector('.manque-fin')).toBeNull();
});
