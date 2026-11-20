//
// « UN SEUL MAX » (MOTEUR §9.51) — l'ÉCRAN : la ligne « Force estimée » de la fiche (« au moins 150 kg »), la courbe qui dit sa
// fenêtre, son pic ancien (une DATE, jamais « il y a N mois »), son point creux, son max mesuré à part.
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/moteur.js');
require('../../v2/js/periode.js');
const Courbe = require('../../v2/js/courbe.js');
require('../../v2/js/rendu.js');

const J = (a, m, j) => new Date(a, m, j, 18, 0, 0);
const MAINT = J(2026, 10, 15);
const P = (d, valeur, extra) => Object.assign({ debut: d.toISOString(), valeur, charge: null, reps: null, record: false, mode: 'projection', gris: false }, extra || {});
const texte = (e) => (e ? e.textContent.replace(/ /g, ' ') : null);

// `force` : la force de la FICHE (`recordsDeLExercice().force`), que la tête de la courbe lit (§9.51 bis) ; par défaut le sommet des pleins.
function page(points, extra, mesures, forceDonnee) {
  const pl = points.filter((p) => !p.gris);
  const sommet = pl.reduce((a, p) => (!a || p.valeur > a.valeur ? p : a), null);
  const force = forceDonnee !== undefined ? forceDonnee : (sommet ? { valeur: sommet.valeur, charge: sommet.charge, reps: sommet.reps, date: sommet.debut, mode: sommet.mode } : null);
  const cible = document.createElement('div');
  const fenetre = Courbe.dansLaPeriode(points, 'tout', MAINT);
  const mv = mesures || [];
  const vue = Object.assign({
    nom: 'Presse', mesure: 'charge_reps', onglet: 'resume', historique: [],
    courbe: { nom: 'Presse', genre: 'charge', geo: Courbe.geometrie(fenetre, null, 'charge', mv), resume: Courbe.resume(fenetre),
      force: force || null, trajet: Courbe.trajet(fenetre, 'charge', MAINT), picAncien: Courbe.picAncien(fenetre, force || null, MAINT), fenetre: window.THModele.phraseDeFenetre('machine', true), periode: 'tout', aujourdhui: '2026-11-15',
      periodeLongue: 'tout l’historique', periodes: Courbe.PERIODES, surPeriode: () => {} },
    volume: {}, table: []
  }, extra || {});
  window.THRendu.rendrePageExercice(cible, vue);
  return cible;
}

const HISTOIRE = [
  P(J(2025, 8, 18), 233.3, { gris: true, charge: 200, reps: 5 }), P(J(2025, 9, 9), 222, { gris: true, charge: 190, reps: 5 }),
  P(J(2025, 11, 4), 175, { charge: 150, reps: 5 }), P(J(2026, 4, 7), 186, { charge: 160, reps: 5 }), P(J(2026, 9, 29), 186.7, { charge: 160, reps: 5 })
];

describe('la courbe : fenêtre, pic ancien, point creux', () => {
  const c = page(HISTOIRE);
  test('la ligne de fenêtre sous le titre ; le pic ancien à la place de l\'écart signé, en DATE absolue', () => {
    expect(texte(c.querySelector('.courbe-fen'))).toBe('Machine : 12 derniers mois.');
    expect(texte(c.querySelector('.courbe-pic'))).toMatch(/^Pic ancien 233 kg, le 18 sept\. 2025, hors fenêtre\.$/);
    expect(texte(c.querySelector('.courbe-carte'))).not.toMatch(/il y a/i);
    expect(texte(c.querySelector('.courbe-sous'))).toBe('force estimée · d’après 160 kg × 5, le 29 oct.');   // le sommet des pleins, la force de la fiche
    expect(texte(c.querySelector('.courbe-val'))).toBe('≈ 187 kg');
  });
  test('deux points creux, trois pleins ; le trait ne lit que les pleins ; la note dit « creux »', () => {
    expect(c.querySelectorAll('circle.courbe-gris')).toHaveLength(2);
    expect(c.querySelectorAll('circle.courbe-pale')).toHaveLength(3);
    expect(c.querySelector('polyline.courbe-trait').getAttribute('points').split(' ')).toHaveLength(3);
    expect(texte(c.querySelector('.courbe-note'))).toMatch(/Séries de 1 à 10 reps ; à 1 ou 2 reps, la charge elle-même\./);
    expect(texte(c.querySelector('.courbe-note'))).toMatch(/creux : avant les 12 mois, hors de la tendance\./);
  });
  test('sans point creux ni pic : ni phrase, ni note « creux » ; l\'écart signé revient', () => {
    const d = page(HISTOIRE.slice(2));
    expect(d.querySelector('.courbe-pic')).toBeNull();
    expect(d.querySelector('.courbe-note .creux')).toBeNull();
    expect(texte(d.querySelector('.courbe-trajet'))).toMatch(/^Force estimée par séance : 175 → 187 kg, du /);
  });
  test('seuls des points creux dans la vue : « Aucune séance sur cette période. » et le pic, seul', () => {
    const d = page(HISTOIRE.slice(0, 2));
    expect(texte(d.querySelector('.courbe-sous'))).toBe('Aucune séance sur cette période.');
    expect(texte(d.querySelector('.courbe-pic'))).toMatch(/^Pic ancien 233 kg/);
  });
  test('un point creux ne porte pas l\'anneau record ; sa bulle dit le max estimé', () => {
    const d = page(HISTOIRE.map((p, i) => i === 0 ? Object.assign({}, p, { record: true }) : p));
    expect(d.querySelectorAll('.courbe-rec')).toHaveLength(0);
    d.querySelectorAll('.courbe-cible')[0].dispatchEvent(new window.Event('click'));
    expect(texte(d.querySelector('.courbe-bulle'))).toBe('Le 18 sept. 2025 · 200 kg × 5 · force estimée 233 kg');
  });
});

describe('la courbe : plancher et max mesuré', () => {
  test('la tête dit « au moins 150 kg » quand le dernier point plein est un plancher (la charge nue, au dixième)', () => {
    const d = page([P(J(2026, 9, 6), 140, { charge: 120, reps: 5 }), P(J(2026, 10, 3), 152.5, { mode: 'plancher', charge: 152.5, reps: 1 })]);
    expect(texte(d.querySelector('.courbe-val'))).toBe('au moins 152,5 kg');
    expect(d.querySelector('.courbe-trajet')).toBeNull();                            // une borne basse ne se soustrait pas d'une projection
    d.querySelectorAll('.courbe-cible')[1].dispatchEvent(new window.Event('click'));
    expect(texte(d.querySelector('.courbe-bulle'))).toBe('Le 3 nov. · 152,5 kg × 1 · au moins 152,5 kg');
  });
  test('le max mesuré : un losange à part, une bulle dédiée, jamais dans le trait', () => {
    const pts = [P(J(2026, 8, 24), 140), P(J(2026, 9, 29), 142)];
    const mesure = { debut: J(2026, 9, 29).toISOString(), valeur: 160, charge: 160, reps: 1 };
    const d = page(pts, null, [mesure]);
    expect(d.querySelectorAll('polygon.courbe-mesure')).toHaveLength(1);
    expect(d.querySelector('polyline.courbe-trait').getAttribute('points').split(' ')).toHaveLength(2);
    expect(texte(d.querySelector('.courbe-val'))).toBe('≈ 142 kg');
    const cibles = d.querySelectorAll('.courbe-cible');
    expect(cibles).toHaveLength(3);
    cibles[2].dispatchEvent(new window.Event('click'));
    expect(texte(d.querySelector('.courbe-bulle'))).toBe('Max mesuré 160 kg, à ta semaine de mesure');
  });
});

describe('la fiche : la ligne « Force estimée »', () => {
  const fiche = (force) => {
    const cible = document.createElement('div');
    window.THRendu.rendrePageExercice(cible, { nom: 'Squat', mesure: 'charge_reps', onglet: 'resume', historique: [], courbe: null, volume: {}, table: [],
      teteRecords: { colonnes: { il6: '', il12: '' }, douzeMois: false, lourde: null, force, tableau: [], travail: null, rapport: null } });
    return cible.querySelector('.exo-force');
  };
  test('plancher : « au moins 150 kg », « d’après 150 kg × 1 »', () => {
    const e = fiche({ mode: 'plancher', valeur: 150, charge: 150, reps: 1 });
    expect(texte(e)).toMatch(/Force estimée\s*d’après 150 kg × 1\s*au moins 150 kg/);
    expect(e.querySelector('.exo-li-v .au').textContent).toBe('au moins');
  });
  test('projection (inchangée) et mesure', () => {
    expect(texte(fiche({ mode: 'projection', valeur: 144.67, charge: 124, reps: 5 }))).toMatch(/d’après 124 kg × 5\s*≈ 145 kg/);
    expect(texte(fiche({ mode: 'mesure', valeur: 150, charge: 150, reps: 1 }))).toMatch(/Max mesuré\s*à ta semaine de mesure, 150 kg × 1\s*150 kg/);
  });
  test('sans force : aucune ligne', () => { expect(fiche(null)).toBeNull(); });
});
