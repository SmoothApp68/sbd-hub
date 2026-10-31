/** @jest-environment node */
//
// 193-1 (commit 2) — LE RECUL NE VOTE JAMAIS (MOTEUR §9.28).
//
// 150 × 4 puis 3 × 135 × 6 : sans l'étiquette, le palier s'ancre sur les séries légères (135, zone Mix) et le moteur veut 150 partout.
// Étiquetées `recul`, la grosse série décide : palier 150, niveau 4, zone Lourd.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
const P = require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');

let n = 0;
const b = (kg, r, type, o) => Object.assign({ id: 'h' + (++n), rang: n, charge_kg: kg, reps: r, type_serie: type || 'travail', exercise_slug: 'sq' }, o || {});
const analyse = (series) => P.analyser(series, null, { mesure: 'charge_reps' });
const roles = (series) => analyse(series).series.map((d) => d.role);
const hist = (jours) => M.contratDe(jours.map((series, i) => ({ seance: { debut: '2026-10-0' + (i + 1) + 'T10:00:00Z' }, series: series })),
  null, 'charge_reps', { reglage: 'franc', equipement: 'barre', correction: null });
const OPT = { reglage: 'franc', equipement: 'barre', correction: null };

describe('193-1 — le palier se lit sur la grosse série', () => {
  test('150 × 4 puis 3 × 135 × 6 : palier 150, les reculs ne votent pas', () => {
    const s = [b(150, 4), b(135, 6, 'recul'), b(135, 6, 'recul'), b(135, 6, 'recul')];
    const a = analyse(s);
    expect(a.palier).toBe(150);
    expect(roles(s)).toEqual(['travail', 'recul', 'recul', 'recul']);
    expect(a.votantes.length).toBe(1);
  });
  test('l’avant : sans l’étiquette, le palier s’ancre sur 135', () => {
    const s = [b(150, 4), b(135, 6), b(135, 6), b(135, 6)];
    expect(analyse(s).palier).toBe(135);
  });
  test('150 × 4 + reculs : la consigne suivante reste en zone Lourd, 150 × 5, sans test', () => {
    const jours = [[b(150, 4), b(135, 6, 'recul'), b(135, 6, 'recul'), b(135, 6, 'recul')]];
    const c = M.consignePour(hist(jours), '2026-10-20', OPT);
    expect(c.palier).toBe(150);
    expect(c.niveau).toBe(4);
    expect(c.zone).toBe('lourd');
    expect(c.n).toBe(1);
    expect(c.etat).toBe('progression');
    expect(c.ligne).toEqual({ charge: 150, vise: 5 });
  });
  test('150 × 5 + reculs : le test du cran du dessus, c’est la grosse série (152,5 × 3)', () => {
    const jours = [[b(150, 5), b(135, 6, 'recul'), b(135, 6, 'recul'), b(135, 6, 'recul')]];
    const c = M.consignePour(hist(jours), '2026-10-20', OPT);
    expect(c.etat).toBe('test_propose');
    expect(c.haut.charge).toBe(152.5);
    expect(c.haut.k).toBe(1);
    expect(c.n).toBe(1);
  });
  test('top single 140 × 2 puis 3 × 120 × 5 : le palier est le single, jamais 120', () => {
    const s = [b(140, 2), b(120, 5, 'recul'), b(120, 5, 'recul'), b(120, 5, 'recul')];
    expect(analyse(s).palier).toBe(140);
  });
  test('deux grosses séries : la majorité des deux, les reculs ne comptent pas', () => {
    const s = [b(150, 3), b(150, 3), b(135, 6, 'recul'), b(135, 6, 'recul'), b(135, 6, 'recul')];
    const a = analyse(s);
    expect(a.palier).toBe(150);
    expect(a.votantes.length).toBe(2);
  });
  test('un recul plus lourd que la grosse ne devient pas une exploration', () => {
    const s = [b(150, 4), b(160, 1, 'recul')];
    expect(roles(s)).toEqual(['travail', 'recul']);
  });
  test('un recul hors calcul reste hors calcul', () => {
    const s = [b(150, 4), b(135, 6, 'recul', { hors_calcul: true })];
    expect(roles(s)).toEqual(['travail', 'hors_calcul']);
  });
  test('seriesHorsChauffe ne compte pas les reculs', () => {
    expect(P.seriesHorsChauffe([b(150, 4), b(135, 6, 'recul'), b(60, 8, 'echauffement')]).length).toBe(1);
  });
});

describe('193-1 — fatigue 189 : seules les grosses séries sont lues', () => {
  test('un recul à 9 reps, dont le maximum estimé dépasse celui de la grosse, n’est jamais la meilleure série', () => {
    const recul = { charge_kg: 135, reps: 9, type_serie: 'recul' };
    const grosse = { charge_kg: 150, reps: 4, type_serie: 'travail' };
    expect(M.valeurDeFatigue(recul)).toBe(null);
    expect(M.valeurDeFatigue(grosse)).not.toBe(null);
  });
});
