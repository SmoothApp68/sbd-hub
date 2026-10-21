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

// ── Point 3 — la carte « Ce qui manque à tes séances » (écran 5) ─────────────────────────────
test('la carte : le titre, les groupes, 2 lignes et « Voir les N autres », « Je ne sais plus », « Enregistrer », « Plus tard »', () => {
  const appels = [];
  const cible = document.createElement('div');
  Rendu().rendreCarteManque(cible, {
    phrase: 'Complète ce dont tu te souviens.',
    groupes: [{ cle: 'randonnee:denivele_m', champ: 'denivele_m', titre: 'RANDONNÉE · D+ · 29 SÉANCES', autres: 27,
      lignes: [{ serieId: 'x1', seanceId: 's1', texte: '12 oct. 2026 · 11,8 km · 3 h 05', unite: 'm', max: 10000, valeur: null },
               { serieId: 'x2', seanceId: 's2', texte: '27 sept. 2026 · 14,1 km · 3 h 40', unite: 'm', max: 10000, valeur: null }] }],
    surSaisie: (...a) => appels.push(['saisie'].concat(a)), surVoir: (c) => appels.push(['voir', c]),
    surRefus: (c) => appels.push(['refus', c]), surEnregistrer: () => appels.push(['enregistrer']),
    surPlusTard: () => appels.push(['tard'])
  });
  expect(cible.hidden).toBe(false);
  expect(cible.querySelector('.manque-titre').textContent).toBe('Ce qui manque à tes séances');
  expect(cible.querySelector('.manque-tete').textContent).toBe('RANDONNÉE · D+ · 29 SÉANCES');
  expect(cible.querySelectorAll('.manque-ligne').length).toBe(2);
  expect(cible.querySelector('.manque-voir').textContent).toBe('Voir les 27 autres');
  const i = cible.querySelector('.manque-ligne [data-champ="denivele_m"] input');
  i.value = '850'; i.dispatchEvent(new Event('input'));
  cible.querySelector('.manque-voir').click();
  cible.querySelector('.manque-refus').click();
  cible.querySelector('.manque-enregistrer').click();
  cible.querySelector('.manque-tard').click();
  expect(appels).toEqual([['saisie', 'x1', 's1', 'denivele_m', '850'], ['voir', 'randonnee:denivele_m'],
    ['refus', 'randonnee:denivele_m'], ['enregistrer'], ['tard']]);
  Rendu().rendreCarteManque(cible, null);
  expect(cible.hidden).toBe(true);
});

test('le détail : « Ajouter le D+ » sous une série qui ne l’a pas, et seulement là', () => {
  const s1 = { id: 'a', session_id: 's', exercise_slug: 'randonnee', type_serie: 'travail', rang: 1, duree_s: 11100,
    distance_m: 11800, denivele_m: null };
  const s2 = Object.assign({}, s1, { id: 'b', rang: 2, denivele_m: 920 });
  const blocs = Modele.blocsDeSeance ? Modele.construireBlocs([s1, s2], CAT2) : [];
  const cible = document.createElement('div');
  const cliques = [];
  Rendu().rendreDetail(cible, { id: 's', titre: 'Rando', debut: '2026-10-12T08:00:00Z' }, blocs, {
    ajout: (s) => (s.denivele_m ? null : { texte: 'Ajouter le D+', sur: () => cliques.push(s.id) }) });
  const liens = cible.querySelectorAll('.ajouter-manque');
  expect(liens.length).toBe(1);
  expect(liens[0].textContent).toBe('Ajouter le D+');
  liens[0].click();
  expect(cliques).toEqual(['a']);
  expect(cible.textContent).toContain('11,8 km · 3 h 05');
  expect(cible.textContent).toContain('D+ 920 m');
});
