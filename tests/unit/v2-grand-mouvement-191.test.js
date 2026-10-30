/** @jest-environment node */
//
// 191 — « UN GRAND MOUVEMENT, UNE SEULE DÉFINITION » (MOTEUR §9.18 / §9.27 bis, décision d'Aurélien du 30/10/2026) : un
// polyarticulaire à la barre OU au poids du corps (tractions, dips, pompes, rowing inversé et leurs variantes lestées ou
// assistées). Lue par la compression, la carte de l'ordre et la ligne du repos long ; un lecteur n'a pas la sienne.

const fs = require('fs');
const path = require('path');
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/semaine.js');
const M = require('../../v2/js/moteur.js');

const MUSCLES = { prim: ['grand_dorsal'], sec: ['biceps', 'deltoide_posterieur'], stab: ['avant_bras'] };
const poly = (slug, equipement) => Object.assign({ slug, equipement: equipement === undefined ? 'aucun' : equipement }, MUSCLES);
const iso = (slug, equipement) => ({ slug, equipement: equipement || 'haltere', prim: ['biceps'], sec: [], stab: [] });

describe('191 — estGrandMouvement : le poids du corps polyarticulaire en est un', () => {
  test.each([
    ['tractions'], ['tractions_lestees'], ['tractions_assistees'], ['tractions_assistees_machine'], ['tractions_supination'],
    ['tractions_elastique'], ['dips'], ['dips_lestes'], ['dips_assistes'], ['pompes'], ['pompes_lestees'], ['pompes_declinees'],
    ['rowing_inverse'], ['rowing_inverse_lestes']
  ])('%s → un grand mouvement', (slug) => {
    expect(M.estGrandMouvement(poly(slug))).toBe(true);
  });

  test.each([
    ['curl_biceps_haltere', 'haltere'], ['elevation_laterale_poulie', 'poulie'], ['presse_a_cuisses', 'machine'],
    ['developpe_couche_machine', 'machine'], ['rowing_assis_machine', 'machine'], ['developpe_couche_haltere', 'haltere'],
    ['rowing_poulie_assis', 'poulie'], ['tirage_poitrine_poulie', 'poulie']
  ])('%s (%s, polyarticulaire) → non : une machine ou des haltères restent compressibles', (slug, eq) => {
    expect(M.estGrandMouvement(poly(slug, eq))).toBe(false);
  });

  test('un isolement au poids du corps n’en est pas un : il faut AUSSI être polyarticulaire', () => {
    expect(M.estGrandMouvement(iso('tractions'))).toBe(false);
    expect(M.estGrandMouvement({ slug: 'pompes', equipement: 'aucun', prim: ['pectoraux'], sec: ['triceps'], stab: [] })).toBe(false);
  });

  test('la barre reste un grand mouvement (188-2), et l’absence de slug ou d’équipement ne devine rien', () => {
    expect(M.estGrandMouvement(poly('squat_barre', 'barre'))).toBe(true);
    expect(M.estGrandMouvement(poly(undefined, undefined))).toBe(false);
    expect(M.estGrandMouvement(null)).toBe(false);
    expect(M.estUnMouvementAuPoidsDuCorps('traction_chaise')).toBe(true);
    expect(M.estUnMouvementAuPoidsDuCorps('tirage_vertical_elastique')).toBe(false);
    expect(M.estUnMouvementAuPoidsDuCorps('rowing_barre')).toBe(false);
  });
});

describe('191 — la compression ne touche jamais un grand mouvement au poids du corps', () => {
  const ex = (slug, o) => Object.assign({ slug, mesure: 'charge_reps', repos: 120, ch: 0, tr: 4, deg: 0, duree: null, equipement: 'aucun' }, MUSCLES, o);
  const SEANCE = () => [
    ex('developpe_couche_barre', { equipement: 'barre', prim: ['pectoraux'], sec: ['triceps'], stab: ['deltoide_anterieur'], tr: 4, ch: 2 }),
    ex('tractions', { tr: 4 }),
    ex('dips', { prim: ['pectoraux'], sec: ['triceps'], stab: ['deltoide_anterieur'], tr: 3 }),
    ex('developpe_couche_machine', { equipement: 'machine', prim: ['pectoraux'], sec: ['triceps'], stab: ['deltoide_anterieur'], tr: 4 }),
    ex('curl', { equipement: 'haltere', prim: ['biceps'], sec: [], stab: [], tr: 4, repos: 90 }),
    ex('elevation', { equipement: 'haltere', prim: ['deltoide_lateral'], sec: [], stab: [], tr: 4, repos: 90 })
  ];
  const tr = (r, slug) => r.exercices.find((e) => e.slug === slug).tr;

  test('prémisse — la séance complète est longue, et la cible la plus courte coupe le reste', () => {
    expect(M.dureeEstimee(SEANCE())).toBeGreaterThan(45 * 60);
  });
  test('⚠️ DISCRIMINANT — traction et dips gardent TOUTES leurs séries, même à 10 min ; la machine et les isolations coupent', () => {
    [45, 30, 10].forEach((cible) => {
      const r = M.raccourcirRoutine(SEANCE(), cible);
      expect(tr(r, 'tractions')).toBe(4);
      expect(tr(r, 'dips')).toBe(3);
      expect(tr(r, 'developpe_couche_barre')).toBe(4);
      expect(r.journal.filter((j) => ['tractions', 'dips', 'developpe_couche_barre'].indexOf(j.slug) >= 0 && j.quoi !== 'cardio_debut')).toEqual([]);
    });
    const court = M.raccourcirRoutine(SEANCE(), 10);
    expect(tr(court, 'developpe_couche_machine')).toBe(2);
    expect(tr(court, 'curl')).toBe(2);
  });
  test('la machine polyarticulaire se coupe APRÈS les isolations : tant qu’une isolation peut perdre une série, la machine garde les siennes', () => {
    const base = M.dureeEstimee(SEANCE());
    // Une cible qu'on atteint en ne coupant que des isolations (4 séries × 2 isolations → 2 séries).
    const r = M.raccourcirRoutine(SEANCE(), Math.floor(base / 60) - 8);
    if (r.tient) {
      const seriesMachine = tr(r, 'developpe_couche_machine');
      const seriesIsolation = Math.min(tr(r, 'curl'), tr(r, 'elevation'));
      if (seriesMachine < 4) expect(seriesIsolation).toBe(2);
    }
    // Dans tous les cas, jamais une série de machine retirée AVANT que chaque isolation soit au plancher.
    const j = M.raccourcirRoutine(SEANCE(), 10).journal.filter((x) => x.quoi === 'serie').map((x) => x.slug);
    const premiereMachine = j.indexOf('developpe_couche_machine');
    const derniereIso = Math.max(j.lastIndexOf('curl'), j.lastIndexOf('elevation'));
    expect(premiereMachine).toBeGreaterThan(-1);
    expect(premiereMachine).toBeGreaterThan(Math.min(j.indexOf('curl'), j.indexOf('elevation')));
    expect(derniereIso).toBeGreaterThan(-1);
  });
  test('une priorité reste TOUJOURS protégée, même une machine polyarticulaire', () => {
    const r = M.raccourcirRoutine(SEANCE(), 10, ['developpe_couche_machine']);
    expect(tr(r, 'developpe_couche_machine')).toBe(4);
    expect(r.journal.filter((j) => j.slug === 'developpe_couche_machine')).toEqual([]);
  });
});

describe('191 — aucun lecteur ne garde sa propre définition du grand mouvement', () => {
  const lire = (f) => fs.readFileSync(path.join(__dirname, '../../v2/js', f), 'utf8');
  test('la carte de l’ordre (equilibres.js) et la ligne du repos long (plan.js) lisent `estGrandMouvement`', () => {
    const eq = lire('equilibres.js'), plan = lire('plan.js');
    const estGros = eq.match(/function estGros\b[\s\S]*?\n  }/)[0];
    expect(estGros).toMatch(/estGrandMouvement/);
    expect(estGros).not.toMatch(/estPolyarticulaire/);
    expect(plan).toMatch(/M\.estGrandMouvement\(\{ slug: slug,/);
  });
  test('la compression l’appelle (une fois par exercice, jamais une liste d’équipements recopiée)', () => {
    const m = lire('moteur.js');
    expect(m).toMatch(/!estGrandMouvement\(e\)/);
    expect((m.match(/EQUIPEMENTS_DES_GRANDS/g) || []).length).toBe(2);
  });
});
