//
// « UN SEUL CHIFFRE DE FORCE » (MOTEUR §9.51 bis, 15/11/2026) — suite de la PR A « Un seul max » (#666).
//
// Le défaut : la tête de la courbe (« 92 kg max estimé ») lisait le DERNIER point plein de la vue ; la ligne « Force estimée » de la
// fiche (« ≈ 93 kg ») lit le MEILLEUR du périmètre. Deux chiffres, un mot.
//
//   I179  la tête de la courbe = la `force` de la fiche, pour chaque période, max mesuré compris ; jamais recalculée ; absente sans point plein ;
//   I180  un seul formateur (`Modele.libelleDeForce`) : plancher au dixième, jamais arrondi à l'entier ;
//   I181  le trajet n'est écrit qu'entre DEUX projections, avec ses deux chiffres et ses deux dates ; Progression dit le même ;
//   I182  « Pic ancien » dit son mode et se compare au chiffre AFFICHÉ de la force ;
//   I183  un seul mot : « force estimée » (jamais « max estimé » dans un écran).
//
// (La garde d'architecture — le registre NOTIONS, `interditAilleurs` — est dans `v2-architecture.test.js`.)

process.env.TZ = 'Europe/Paris';

global.self = global;
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/moteur.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/seance.js');
const Courbe = require('../../v2/js/courbe.js');
const Faits = require('../../v2/js/faits.js');
require('../../v2/js/rendu.js');

const J = (a, m, j) => new Date(a, m, j, 18, 0, 0);
const MAINT = J(2026, 10, 15);
const NBSP = / | /g;
const texte = (e) => (e ? e.textContent.replace(NBSP, ' ') : null);
const epley = (c, r) => c * (1 + r / 30);

// Un point de courbe (celui de `faits.pointsDeLExercice`) et une force (celle de `recordsDeLExercice`).
const P = (d, valeur, extra) => Object.assign({ debut: d.toISOString(), valeur, charge: null, reps: null, record: false, mode: 'projection', gris: false }, extra || {});
const proj = (d, c, r, extra) => P(d, epley(c, r), Object.assign({ charge: c, reps: r, mode: 'projection' }, extra || {}));
const plan = (d, c, r, extra) => P(d, c, Object.assign({ charge: c, reps: r, mode: 'plancher' }, extra || {}));
const F = (d, c, r, mode) => ({ valeur: mode === 'plancher' || mode === 'mesure' ? c : epley(c, r), charge: c, reps: r, date: d.toISOString(), mode });

// La page d'un exercice, câblée comme `app.js` : la force de la FICHE passe à la courbe, le trajet et le pic sont lus de THCourbe.
function page(points, force, opts) {
  const o = opts || {};
  const cle = o.periode || 'tout';
  const cible = document.createElement('div');
  const fenetre = Courbe.dansLaPeriode(points, cle, MAINT);
  const mv = o.mesures || [];
  const vue = {
    nom: 'Exo', mesure: 'charge_reps', onglet: 'resume', historique: [], volume: {}, table: [],
    courbe: { nom: 'Exo', genre: 'charge', geo: Courbe.geometrie(fenetre, null, 'charge', mv), resume: Courbe.resume(fenetre), force: force,
      trajet: Courbe.trajet(fenetre, 'charge', MAINT), picAncien: Courbe.picAncien(fenetre, force, MAINT),
      fenetre: Modele.phraseDeFenetre(o.equipement || 'machine_smith', true), periode: cle, aujourdhui: '2026-11-15',
      periodeLongue: 'la période', periodes: Courbe.PERIODES, surPeriode: () => {} },
    teteRecords: force ? { colonnes: { il6: '', il12: '' }, douzeMois: false, lourde: null, force: force, tableau: [], travail: null, rapport: null } : undefined
  };
  window.THRendu.rendrePageExercice(cible, vue);
  return cible;
}

// ── 1. LE FORMATEUR UNIQUE (I180) ─────────────────────────────────────────
describe('I180 — Modele.libelleDeForce : le seul formateur du chiffre de force', () => {
  test('projection : « ≈ 93 kg », au kg ; d’où elle vient ; sa date (« 1er », l’année hors de l’année du jour)', () => {
    const l = Modele.libelleDeForce(F(J(2026, 6, 12), 73.5, 8, 'projection'), MAINT);
    expect(l.mode).toBe('projection');
    expect(l.mot).toBe('Force estimée');
    expect(l.devant).toBeNull();
    expect(l.nombre).toBe(93);
    expect(l.valeur.replace(NBSP, ' ')).toBe('≈ 93 kg');
    expect(l.texteCourt.replace(NBSP, ' ')).toBe('93 kg');
    expect(l.sous.replace(NBSP, ' ')).toBe('d’après 73,5 kg × 8');
    expect(l.quand).toBe('le 12 juil.');
    expect(Modele.libelleDeForce(F(J(2026, 9, 1), 100, 5, 'projection'), MAINT).quand).toBe('le 1er oct.');
    expect(Modele.libelleDeForce(F(J(2025, 9, 1), 100, 5, 'projection'), MAINT).quand).toBe('le 1er oct. 2025');
  });
  test('plancher : « au moins 150 kg », AU DIXIÈME — 152,5 ne devient jamais 153 (M-C)', () => {
    const l = Modele.libelleDeForce(F(J(2026, 9, 1), 152.5, 1, 'plancher'), MAINT);
    expect(l.mode).toBe('plancher');
    expect(l.mot).toBe('Force estimée');
    expect(l.devant).toBe('au moins');
    expect(l.nombre).toBe(152.5);
    expect(l.valeur.replace(NBSP, ' ')).toBe('152,5 kg');
    expect(l.texteCourt.replace(NBSP, ' ')).toBe('au moins 152,5 kg');
    expect(l.sous.replace(NBSP, ' ')).toBe('d’après 152,5 kg × 1');
    expect(Modele.libelleDeForce(F(J(2026, 9, 1), 150, 1, 'plancher'), MAINT).valeur.replace(NBSP, ' ')).toBe('150 kg');
  });
  test('mesure : « Max mesuré », sans ≈ ; « à ta semaine de test, 150 kg × 1 »', () => {
    const l = Modele.libelleDeForce(F(J(2026, 10, 3), 150, 1, 'mesure'), MAINT);
    expect(l.mode).toBe('mesure');
    expect(l.mot).toBe('Max mesuré');
    expect(l.devant).toBeNull();
    expect(l.valeur.replace(NBSP, ' ')).toBe('150 kg');
    expect(l.sous.replace(NBSP, ' ')).toBe('à ta semaine de test, 150 kg × 1');
    expect(l.dit.replace(NBSP, ' ')).toBe('Max mesuré 150 kg, à ta semaine de test');
  });
  test('un point de courbe se lit comme une force (`debut`, `mesure: true`) ; rien à lire : null', () => {
    const l = Modele.libelleDeForce(plan(J(2026, 10, 3), 152.5, 1), MAINT);
    expect(l.texteCourt.replace(NBSP, ' ')).toBe('au moins 152,5 kg');
    expect(l.dit.replace(NBSP, ' ')).toBe('au moins 152,5 kg');
    expect(Modele.libelleDeForce(proj(J(2025, 8, 18), 200, 5), MAINT).dit.replace(NBSP, ' ')).toBe('force estimée 233 kg');
    expect(Modele.libelleDeForce({ debut: J(2026, 9, 29).toISOString(), valeur: 160, charge: 160, reps: 1, mesure: true }, MAINT).mode).toBe('mesure');
    expect(Modele.libelleDeForce(null, MAINT)).toBeNull();
    expect(Modele.libelleDeForce({ valeur: NaN, mode: 'projection' }, MAINT)).toBeNull();
  });
  test('les mots ne s’écrivent qu’ici (`MOTS_DE_FORCE`)', () => {
    expect(Modele.MOTS_DE_FORCE).toEqual({ force: 'Force estimée', mesure: 'Max mesuré', parSeance: 'Force estimée par séance', devant: 'au moins' });
    expect(Object.isFrozen(Modele.MOTS_DE_FORCE)).toBe(true);
  });
});

// ── 2. LE TRAJET (I181) ───────────────────────────────────────────────────
describe('I181 — Courbe.trajet : deux projections, deux chiffres, deux dates', () => {
  const smith = [proj(J(2026, 4, 18), 70, 7.4 /* 87 */, { valeur: 87 }), proj(J(2026, 6, 12), 73.5, 8), proj(J(2026, 9, 18), 76.5, 6)];
  test('Smith : « 87 → 92 kg, du 18 mai au 18 oct. »', () => {
    const t = Courbe.trajet(smith, 'charge', MAINT);
    expect(t.ecrit).toBe(true);
    expect(t.texte.replace(NBSP, ' ')).toBe('87 → 92 kg, du 18 mai au 18 oct.');
    expect(t.court.replace(NBSP, ' ')).toBe('87 → 92 kg');
    expect(t.n).toBe(3);
    expect(t.ecart).toBe(5);
  });
  test('un seul point plein : aucun trajet écrit (la séance unique), le dernier chiffre dans son mode', () => {
    const t = Courbe.trajet([proj(J(2026, 9, 18), 100, 5)], 'charge', MAINT);
    expect(t.ecrit).toBe(false);
    expect(t.texte).toBe('');
    expect(t.court.replace(NBSP, ' ')).toBe('117 kg');
    expect(t.ecart).toBeNull();
  });
  test('PLANCHER CONTRE PROJECTION : jamais d’écart — ni plancher au début, ni plancher à la fin (M-B)', () => {
    const debutPlancher = Courbe.trajet([plan(J(2026, 9, 1), 150, 1), proj(J(2026, 10, 12), 120, 5)], 'charge', MAINT);
    expect(debutPlancher.ecrit).toBe(false);
    expect(debutPlancher.texte).toBe('');
    expect(debutPlancher.ecart).toBeNull();
    expect(debutPlancher.court.replace(NBSP, ' ')).toBe('140 kg');                       // le dernier point plein, dans son mode
    const finPlancher = Courbe.trajet([proj(J(2026, 8, 1), 120, 5), plan(J(2026, 9, 12), 150, 1)], 'charge', MAINT);
    expect(finPlancher.ecrit).toBe(false);
    expect(finPlancher.court.replace(NBSP, ' ')).toBe('au moins 150 kg');
    const deux = Courbe.trajet([plan(J(2026, 8, 1), 140, 1), plan(J(2026, 9, 12), 150, 1)], 'charge', MAINT);
    expect(deux.ecrit).toBe(false);                                                       // deux bornes basses : pas une tendance
  });
  test('deux chiffres égaux à l’affichage : « inchangé à 92 kg, du … au … » ; Progression : « 92 kg »', () => {
    const t = Courbe.trajet([proj(J(2026, 4, 18), 76.4, 6), proj(J(2026, 9, 18), 76.5, 6)], 'charge', MAINT);
    expect(t.ecrit).toBe(true);
    expect(t.texte.replace(NBSP, ' ')).toBe('inchangé à 92 kg, du 18 mai au 18 oct.');
    expect(t.court.replace(NBSP, ' ')).toBe('92 kg');
  });
  test('ne lit que les points PLEINS ; rien à lire : null ; la page et Progression disent le même trajet', () => {
    expect(Courbe.trajet([proj(J(2025, 8, 18), 200, 5, { gris: true })], 'charge', MAINT)).toBeNull();
    expect(Courbe.trajet([], 'charge', MAINT)).toBeNull();
    const avecGris = [proj(J(2025, 8, 18), 200, 5, { gris: true })].concat(smith);
    const t = Courbe.trajet(avecGris, 'charge', MAINT), s = Courbe.trajet(smith, 'charge', MAINT);
    expect(t.texte).toBe(s.texte);
    expect(t.texte.indexOf(t.court)).toBe(0);                                              // Progression = le début de la phrase de la page
  });
});

// ── 3. « PIC ANCIEN » (I182) ──────────────────────────────────────────────
describe('I182 — Courbe.picAncien : son mode, et le chiffre AFFICHÉ de la force', () => {
  const force = F(J(2026, 9, 29), 160, 5, 'projection');                                    // ≈ 186,7 → affiché 187
  test('un pic gris qui dépasse la force affichée : rendu avec son mode ; sinon rien', () => {
    const pic = proj(J(2025, 8, 18), 200, 5, { gris: true });
    const r = Courbe.picAncien([pic], force, MAINT);
    expect(r).toMatchObject({ valeur: pic.valeur, debut: pic.debut, mode: 'projection' });
    expect(Courbe.picAncien([proj(J(2025, 8, 18), 120, 5, { gris: true })], force, MAINT)).toBeNull();
    expect(Courbe.picAncien([P(J(2025, 8, 18), 187.2, { gris: true })], force, MAINT)).toBeNull();     // 187 contre 187 : jamais « Pic ancien 187 » sous « ≈ 187 »
    expect(Courbe.picAncien([proj(J(2026, 4, 18), 160, 5)], force, MAINT)).toBeNull();                 // aucun point gris
  });
  test('un pic plancher se compare au dixième : 152,5 contre une force de 152 s’écrit (153 aurait été arrondi vers le haut)', () => {
    const f152 = { valeur: 152.2, charge: 100, reps: 5, date: J(2026, 9, 1).toISOString(), mode: 'projection' };   // affiché 152
    const r = Courbe.picAncien([plan(J(2025, 8, 18), 152.5, 1, { gris: true })], f152, MAINT);
    expect(r).not.toBeNull();
    expect(r.mode).toBe('plancher');
    const egale = { valeur: 152.5, charge: 152.5, reps: 1, date: J(2026, 9, 1).toISOString(), mode: 'plancher' };
    expect(Courbe.picAncien([plan(J(2025, 8, 18), 152.5, 1, { gris: true })], egale, MAINT)).toBeNull();
  });
  test('sans force à comparer (la tête est masquée) : le pic est dit seul', () => {
    expect(Courbe.picAncien([proj(J(2025, 8, 18), 200, 5, { gris: true })], null, MAINT)).not.toBeNull();
  });
});

// ── 4. LA PAGE : les textes cibles (I179) ─────────────────────────────────
describe('I179 — la tête de la courbe est la force de la fiche : les trois textes cibles', () => {
  test('Smith : « ≈ 93 kg » · « force estimée · d’après 73,5 kg × 8, le 12 juil. » · « 87 → 92 kg, du 18 mai au 18 oct. »', () => {
    const pts = [proj(J(2026, 4, 18), 70, 7.4, { valeur: 87 }), proj(J(2026, 6, 12), 73.5, 8), proj(J(2026, 9, 18), 76.5, 6)];
    const c = page(pts, F(J(2026, 6, 12), 73.5, 8, 'projection'), { periode: '6m' });
    expect(texte(c.querySelector('.courbe-val'))).toBe('≈ 93 kg');
    expect(texte(c.querySelector('.courbe-sous'))).toBe('force estimée · d’après 73,5 kg × 8, le 12 juil.');
    expect(texte(c.querySelector('.courbe-trajet'))).toBe('87 → 92 kg, du 18 mai au 18 oct.');
    expect(texte(c.querySelector('.courbe-carte'))).not.toMatch(/max estimé|Dernière séance/i);
    // La ligne de la fiche, sur la même force : le même chiffre, la même série.
    expect(texte(c.querySelector('.exo-force .exo-li-v'))).toBe('≈ 93 kg');
    expect(texte(c.querySelector('.exo-force .exo-li-k'))).toBe('Force estimée d’après 73,5 kg × 8');
  });
  test('Squat avec un single : « au moins 150 kg » · « … d’après 150 kg × 1, le 1er oct. » · aucun trajet', () => {
    const pts = [plan(J(2026, 9, 1), 150, 1), proj(J(2026, 10, 12), 120, 5)];
    const c = page(pts, F(J(2026, 9, 1), 150, 1, 'plancher'), { equipement: 'barre' });
    expect(texte(c.querySelector('.courbe-val'))).toBe('au moins 150 kg');
    expect(c.querySelector('.courbe-val .au').textContent).toBe('au moins');
    expect(texte(c.querySelector('.courbe-sous'))).toBe('force estimée · d’après 150 kg × 1, le 1er oct.');
    expect(c.querySelector('.courbe-trajet')).toBeNull();                                  // plancher contre projection : jamais « −10 kg »
    expect(texte(c.querySelector('.courbe-carte'))).not.toMatch(/−\d|-\d+ kg/);
  });
  test('une seule séance : « ≈ 117 kg » · « … d’après 100 kg × 5, le 18 oct. » · aucun trajet', () => {
    const c = page([proj(J(2026, 9, 18), 100, 5)], F(J(2026, 9, 18), 100, 5, 'projection'));
    expect(texte(c.querySelector('.courbe-val'))).toBe('≈ 117 kg');
    expect(texte(c.querySelector('.courbe-sous'))).toBe('force estimée · d’après 100 kg × 5, le 18 oct.');
    expect(c.querySelector('.courbe-trajet')).toBeNull();
    expect(texte(c.querySelector('.courbe-vide'))).toBe('Une seule séance sur cette période.');
  });
  test('max mesuré actif : la tête est celle de la fiche, avec son mot, sans ≈', () => {
    const pts = [proj(J(2026, 8, 24), 120, 5), proj(J(2026, 9, 29), 122, 5)];
    const c = page(pts, F(J(2026, 10, 3), 150, 1, 'mesure'));
    expect(texte(c.querySelector('.courbe-val'))).toBe('150 kg');
    expect(texte(c.querySelector('.courbe-sous'))).toBe('max mesuré · à ta semaine de test, 150 kg × 1, le 3 nov.');
    expect(texte(c.querySelector('.exo-force .exo-li-k'))).toBe('Max mesuré à ta semaine de test, 150 kg × 1');
    expect(texte(c.querySelector('.exo-force .exo-li-v'))).toBe('150 kg');
  });
  test('le plancher se dit au dixième partout : tête, fiche, bulle, pic ancien (152,5 jamais 153)', () => {
    const pts = [plan(J(2025, 8, 18), 152.5, 1, { gris: true }), proj(J(2026, 4, 7), 90, 5), plan(J(2026, 9, 29), 140, 1)];
    const c = page(pts, F(J(2026, 9, 29), 140, 1, 'plancher'));
    expect(texte(c.querySelector('.courbe-val'))).toBe('au moins 140 kg');
    expect(texte(c.querySelector('.courbe-pic'))).toBe('Pic ancien au moins 152,5 kg, le 18 sept. 2025, hors fenêtre.');
    c.querySelectorAll('.courbe-cible')[0].dispatchEvent(new window.Event('click'));
    expect(texte(c.querySelector('.courbe-bulle'))).toBe('Le 18 sept. 2025 · 152,5 kg × 1 · au moins 152,5 kg');
    expect(texte(c.querySelector('.courbe-carte'))).not.toMatch(/\b153\b/);
  });
});

// ── 5. LA PÉRIODE NE CHANGE PAS LE CHIFFRE DE TÊTE (I179, M-A) ────────────
describe('I179 — la tête est la même pour 3 mois, 6 mois, 1 an et Tout ; masquée sans point plein dans la vue', () => {
  // Un pic de force le 12 juillet (≈ 93), des séances plus légères ensuite : le dernier point (91,8) n'est PAS la force.
  const pts = [proj(J(2025, 12, 4), 60, 5), proj(J(2026, 3, 12), 70, 5), proj(J(2026, 6, 12), 73.5, 8), proj(J(2026, 7, 20), 72, 6), proj(J(2026, 9, 18), 76.5, 6)];
  const force = F(J(2026, 6, 12), 73.5, 8, 'projection');
  ['3m', '6m', '1a', 'tout'].forEach((cle) => {
    test('période ' + cle + ' : « ≈ 93 kg », jamais le dernier point (92)', () => {
      const c = page(pts, force, { periode: cle });
      expect(texte(c.querySelector('.courbe-val'))).toBe('≈ 93 kg');
      expect(texte(c.querySelector('.courbe-sous'))).toBe('force estimée · d’après 73,5 kg × 8, le 12 juil.');
      expect(texte(c.querySelector('.exo-force .exo-li-v'))).toBe(texte(c.querySelector('.courbe-val')));
    });
  });
  test('une vue sans point plein : pas de tête, même si la fiche a une force ; la phrase d’avant reste', () => {
    const vieux = [proj(J(2025, 12, 4), 60, 5), proj(J(2026, 1, 12), 70, 5)];
    const c = page(vieux, F(J(2026, 1, 12), 70, 5, 'projection'), { periode: '3m' });
    expect(c.querySelector('.courbe-val')).toBeNull();
    expect(texte(c.querySelector('.courbe-sous'))).toBe('Aucune séance sur cette période.');
    expect(c.querySelector('.courbe-trajet')).toBeNull();
  });
});

// ── 6. LA BULLE, L’ARIA, LE MOT (I183) ────────────────────────────────────
describe('I183 — un seul mot : « force estimée », jamais « max estimé » dans l’écran', () => {
  const pts = [proj(J(2026, 4, 20), 120, 5, { record: true }), proj(J(2026, 9, 28), 130, 5, { record: true })];
  const c = page(pts, F(J(2026, 9, 28), 130, 5, 'projection'), { periode: '6m' });
  test('la bulle d’un point : « force estimée 152 kg »', () => {
    c.querySelectorAll('.courbe-cible')[1].dispatchEvent(new window.Event('click'));
    expect(texte(c.querySelector('.courbe-bulle'))).toBe('Le 28 oct. · 130 kg × 5 · force estimée 152 kg · record');
  });
  test('l’aria-label du dessin : « Force estimée par séance, … de 140 kg à 152 kg » (le trajet, jamais « max estimé »)', () => {
    const a = c.querySelector('svg.courbe-svg').getAttribute('aria-label').replace(NBSP, ' ');
    expect(a).toMatch(/^Force estimée par séance, Exo, sur la période, de 140 kg à 152 kg ; 2 records$/);
    expect(a).not.toMatch(/max estimé/i);
  });
  test('rien dans la page ne dit « max estimé »', () => { expect(texte(c)).not.toMatch(/max estimé/i); });
  test('reps et temps : la tête reste le dernier point (hors périmètre), avec leur mot', () => {
    const base = Courbe.dansLaPeriode([P(J(2026, 4, 20), 12, { reps: 12 }), P(J(2026, 9, 28), 14, { reps: 14 })], '6m', MAINT);
    const cible = document.createElement('div');
    window.THRendu.rendrePageExercice(cible, { nom: 'Tractions', mesure: 'reps', onglet: 'resume', historique: [], volume: {}, table: [],
      courbe: { nom: 'Tractions', genre: 'reps', geo: Courbe.geometrie(base), resume: Courbe.resume(base), periode: '6m', aujourdhui: '2026-11-15',
        periodeLongue: '6 mois', periodes: Courbe.PERIODES, surPeriode: () => {} } });
    expect(texte(cible.querySelector('.courbe-val'))).toBe('14 reps');
    expect(texte(cible.querySelector('.courbe-sous'))).toBe('meilleures reps · +2 reps du 20 mai au 28 oct.');
  });
});

// ── 7. LE PIPELINE RÉEL : la fiche et la tête sur des historiques tirés au hasard (graine fixe) ──
describe('I179/I181 — sur des historiques tirés au hasard : la tête = la fiche à toute période, le trajet jamais faux', () => {
  const CATALOGUE = [
    { slug: 'squat_barre', nom: 'Squat (Barre)', mesure: 'charge_reps', equipement: 'barre', muscles_primaires: ['quadriceps'] },
    { slug: 'presse', nom: 'Presse (Machine)', mesure: 'charge_reps', equipement: 'machine', muscles_primaires: ['quadriceps'] }
  ];
  const INDEX = Modele.indexerExercices(CATALOGUE);
  function graine(s) { let x = s >>> 0; return () => { x = (x + 0x6D2B79F5) >>> 0; let t = x; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const alea = graine(1511);
  const entier = (a, b) => a + Math.floor(alea() * (b - a + 1));

  function tirage(slug) {
    const n = entier(1, 9), seances = [], series = [], parSeance = {};
    for (let i = 0; i < n; i++) {
      const id = 's' + i, jours = entier(0, 700);
      const debut = new Date(MAINT.getTime() - jours * 86400000);
      seances.push({ id, debut: debut.toISOString(), fin: null });
      const k = entier(1, 3);
      parSeance[id] = [];
      for (let q = 0; q < k; q++) {
        const reps = [1, 2, 3, 5, 5, 8, 10, 12][entier(0, 7)];
        parSeance[id].push({ id: id + '-' + q, session_id: id, type_serie: 'travail', rang: q, exercise_slug: slug, charge_kg: 50 + entier(0, 120) * 1.25, reps });
      }
    }
    seances.sort((a, b) => (a.debut < b.debut ? 1 : -1));
    Object.keys(parSeance).forEach((id) => parSeance[id].forEach((x) => series.push(x)));
    return { seances, series, exercices: CATALOGUE, seriesDe: (id) => parSeance[id] || [], catalogue: () => INDEX, journal: [] };
  }

  test('3 000 tirages × 4 périodes : la tête affichée est le libellé de la force de la fiche, mot pour mot ; le trajet n’est écrit qu’entre deux projections', () => {
    const fautes = [];
    let teteVue = 0, tetesMasquees = 0, trajets = 0, mixtes = 0;
    for (let t = 0; t < 3000; t++) {
      const slug = alea() < 0.5 ? 'squat_barre' : 'presse';
      const c = tirage(slug);
      const pts = Faits.creer().pointsDeLExercice(c, slug, MAINT);
      if (!pts.mesure || !pts.points.length) continue;
      const seances = c.seances.map((s) => ({ debut: s.debut, series: c.seriesDe(s.id) }));
      const force = Modele.recordsDeLExercice(seances, MAINT, Modele.optionsDeRecord(INDEX[slug])).force;
      ['3m', '6m', '1a', 'tout'].forEach((cle) => {
        const vue = Courbe.dansLaPeriode(pts.points, cle, MAINT);
        const pleins = vue.filter((p) => !p.gris);
        const el = page(pts.points, force, { periode: cle, equipement: INDEX[slug].equipement });
        const val = el.querySelector('.courbe-val');
        if (!pleins.length) { tetesMasquees++; if (val) fautes.push(['tête sans point plein', t, cle]); return; }
        if (!force) { fautes.push(['des points pleins et aucune force', t, cle]); return; }
        teteVue++;
        const l = Modele.libelleDeForce(force, MAINT);
        if (texte(val) !== (l.devant ? l.devant + ' ' : '') + l.valeur.replace(NBSP, ' ')) fautes.push(['tête ≠ fiche', t, cle, texte(val)]);
        if (texte(el.querySelector('.exo-force .exo-li-v')) !== texte(val)) fautes.push(['fiche ≠ tête', t, cle]);
        const tr = Courbe.trajet(vue, 'charge', MAINT);
        const bouts = pleins.length > 1 && pleins[0].mode === 'projection' && pleins[pleins.length - 1].mode === 'projection';
        if (!!tr.ecrit !== bouts) fautes.push(['trajet', t, cle]);
        if (bouts) trajets++; else if (pleins.length > 1) mixtes++;
        if ((el.querySelector('.courbe-trajet') !== null) !== bouts) fautes.push(['ligne du trajet', t, cle]);
      });
    }
    expect(fautes.slice(0, 5)).toEqual([]);
    // Le tirage atteint bien les chemins (un test qui ne teste pas ce qu'il prétend est pire qu'aucun test).
    expect(teteVue).toBeGreaterThan(2000);
    expect(tetesMasquees).toBeGreaterThan(50);
    expect(trajets).toBeGreaterThan(300);
    expect(mixtes).toBeGreaterThan(100);
  });
});
