/** @jest-environment jsdom */
//
// PR 6 des mots (14/11/2026) — G3 / G4 : LE TEXTE RENDU ne dit que des périodes que l'écran sait nommer.
//
// Ce n'est PAS un invariant du plan (I167 reste libre) : le garde lit le texte rendu de « Ton parcours » et des noms de période
// (`Modele.libelleDePeriode`), jamais le source. Lexique fermé : MAQUETTE-PR6 §3.2.
require('../../v2/js/routeur.js');
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
require('../../v2/js/seance.js');
require('../../v2/js/courbe.js');
const Parcours = require('../../v2/js/parcours.js');
require('../../v2/js/faits.js');
require('../../v2/js/rendu.js');
const REEL = require('./fixtures/cas-75-reel.json');

const SERIES = REEL.series.map((l) => ({ debut: l[0], seance: l[1], slug: REEL.slugs[l[2]], reps: l[3], charge: l[4] }));
const entree = (extra) => Object.assign({ aujourdhui: REEL.aujourdhui, sexe: REEL.sexe, priorites: REEL.priorites, catalogue: REEL.catalogue, series: SERIES }, extra || {});

function texteDuParcours(parcours) {
  const vue = { parcours, nomsCourts: { squat_barre: 'squat', developpe_couche_barre: 'couché', souleve_de_terre_barre: 'soulevé', developpe_militaire_barre: 'militaire' },
    priorites: [], phase: 'Recomposition', pesees: { nombre: 5, assez: true, phraseTendance: null }, forme: null, equilibres: null, fatigue: null, surExercice() {} };
  const c = document.createElement('div');
  global.THRendu.rendreParcours(c, vue);
  return c.textContent.replace(/\s+/g, ' ');
}

// Le lexique INTERDIT (MAQUETTE-PR6 §3.2). Chaque motif porte son nom.
const INTERDITS = [
  ['en ce moment', /en ce moment/i], ['au début seul', /\bau début\b/i], ['récemment', /récemment|dernièrement/i],
  ['le mois dernier', /le mois dernier/i], ['ce mois-ci hors contient', /ce mois-ci/i], ['× 5+', /×\s*5\+/], ['5 reps ou plus', /5 reps ou plus/i],
  ['peu de séances', /peu de séances/i], ['changé de fourchette', /changé de fourchette/i], ['le plus lent seul', /le plus lent(?!ement)\b/i],
  ['comptés', /comptés/i], ['sur ta courbe', /sur ta courbe(?! charge)/i], ['→ en séparateur de relais', /moins pratiqué · → |relais\s*→|→\s*relais/], ['×2', /×2\b/],
  ['depuis N mois', /depuis \d+ (mois|semaines)/i], ['il y a N mois', /il y a \d+ mois/i], ['bon retour', /bon retour/i], ['bravo', /bravo/i],
  ['en 6 mois', /\ben 6 mois\b/i]
];

function balayer(nom, texte) {
  const fautes = INTERDITS.filter(([, re]) => re.test(texte)).map(([n]) => n);
  expect([nom, fautes]).toEqual([nom, []]);
}

describe('G3 — le lexique fermé, sur le texte rendu de Parcours', () => {
  test('le fixture réel (J = 11/10/2026)', () => {
    balayer('fixture', texteDuParcours(Parcours.parcours(entree())));
  });
  test('les mêmes séries lues un 14/11 (cinq semaines sans séance) : aucune phrase sur la pause', () => {
    const t = texteDuParcours(Parcours.parcours(entree({ aujourdhui: '2026-11-14' })));
    balayer('14/11', t);
    expect(t).not.toMatch(/(?<!avec )pause|absence|reprise|assidu/i);
  });
  test('pause de 8 mois : le texte ne la nomme pas', () => {
    const t = texteDuParcours(Parcours.parcours(entree({ aujourdhui: '2027-06-10' })));
    balayer('pause 8 mois', t);
    expect(t).not.toMatch(/(?<!avec )pause|absence|reprise|assidu|8 mois/i);
  });
  test('un seul mois de séances : pas de « meilleur » ni de repères en double', () => {
    const un = SERIES.filter((s) => s.slug === REEL.slugs[0] && s.debut.slice(0, 7) === '2026-09').slice(0, 6);
    const t = texteDuParcours(Parcours.parcours(entree({ series: un })));
    balayer('un mois', t);
  });
});

describe('G4 — les noms de période (Modele.libelleDePeriode) aux cas limites', () => {
  const M = global.THModele, J = '2026-11-14';
  test('la fenêtre se date ; le mois en cours se dit « (en cours) » ; une semaine tronquée se dit par ses jours', () => {
    expect(M.libelleDePeriode({ genre: 'fenetre', debut: '2026-04-12', fin: '2026-10-11' }, '2026-10-11')).toBe('du 12 avr. au 11 oct.');
    expect(M.libelleDePeriode({ genre: 'fenetre', debut: '2025-10-11', fin: '2026-04-11' }, '2026-10-11')).toBe('du 11 oct. 2025 au 11 avr. 2026');
    expect(M.libelleDePeriode({ genre: 'mois', cle: '2026-11', forme: 'pied' }, J)).toBe('nov. 2026 (en cours)');
    expect(M.libelleDePeriode({ genre: 'mois', cle: '2026-09', forme: 'pied' }, J)).toBe('sept. 2026');
  });
  test('« ce / cette » seulement si la période contient aujourd’hui : jamais pour une semaine passée', () => {
    const passee = M.libelleDePeriode({ genre: 'semaine', debut: '2026-07-06', fin: '2026-07-12' }, J);
    expect(passee).not.toMatch(/cette semaine/);
    const courante = M.libelleDePeriode({ genre: 'semaine', debut: '2026-11-09', fin: '2026-11-15' }, J);
    expect(courante).toMatch(/cette semaine/);
  });
  test('un mois d’une autre année prend l’année en phrase ; celui de l’année de J ne la prend pas', () => {
    expect(M.libelleDePeriode({ genre: 'mois', cle: '2025-09', forme: 'phrase' }, J)).toBe('en septembre 2025');
    expect(M.libelleDePeriode({ genre: 'mois', cle: '2026-09', forme: 'phrase' }, J)).toBe('en septembre');
  });
  test('l’hiver chevauche deux années : « cet hiver » en janvier comme en décembre, « en hiver » une fois fini', () => {
    const hiver = { genre: 'saison', debut: '2025-12-01', fin: '2026-02-28', ce: 'cet hiver', en: 'en hiver' };
    expect(M.libelleDePeriode(hiver, '2026-01-15')).toBe('cet hiver');
    expect(M.libelleDePeriode(hiver, '2025-12-01')).toBe('cet hiver');
    expect(M.libelleDePeriode(hiver, '2026-03-01')).toBe('en hiver');
  });
  test('un mois qui contient J se dit « ce mois-ci » en phrase, jamais le mois d’avant', () => {
    expect(M.libelleDePeriode({ genre: 'mois', cle: '2026-11', forme: 'phrase' }, J)).toBe('ce mois-ci');
    expect(M.libelleDePeriode({ genre: 'mois', cle: '2026-10', forme: 'phrase' }, J)).toBe('en octobre');
  });
});
