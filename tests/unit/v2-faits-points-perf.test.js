/** @jest-environment node */
//
// 216 — `pointsDeLExercice` : le drapeau `record` ne calcule que les séries DE L'EXERCICE (avant : les ~28 de la séance,
// quadratique). Garantie (a) : mêmes points qu'avec la fonction d'origine ; (b) budget à l'échelle d'Aurélien.

process.env.TZ = 'Europe/Paris';

global.self = global;
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
require('../../v2/js/seance.js');
const Faits = require('../../v2/js/faits.js');

// Générateur à graine fixe (mulberry32).
function graine(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function historique(nSeances, nExos, seriesParSeance) {
  const rnd = graine(216);
  const catalogue = [];
  for (let i = 0; i < nExos; i++) catalogue.push({ slug: 'exo_' + i, nom: 'Exo ' + i, mesure: 'charge_reps', equipement: 'barre', muscles_primaires: ['dos'] });
  const poids = catalogue.map((_, i) => 1 / (i + 1));
  const total = poids.reduce((a, b) => a + b, 0);
  const tirer = () => { let r = rnd() * total; for (let i = 0; i < poids.length; i++) { r -= poids[i]; if (r <= 0) return i; } return 0; };
  const seances = [], series = [], parSeance = {};
  const t0 = new Date(2026, 10, 1, 18).getTime();
  for (let i = 0; i < nSeances; i++) {
    const id = 's' + i;
    seances.push({ id, debut: new Date(t0 - i * 1.7 * 86400000).toISOString(), fin: null });
    const exos = []; while (exos.length < 7) { const e = tirer(); if (exos.indexOf(e) < 0) exos.push(e); }
    const liste = [];
    for (let k = 0; k < seriesParSeance; k++) {
      const e = exos[Math.floor(k / (seriesParSeance / 7))] || exos[0];
      liste.push({ id: id + '-' + k, session_id: id, rang: k, exercise_slug: 'exo_' + e, type_serie: rnd() < 0.15 ? 'echauffement' : 'travail',
                   charge_kg: 20 + Math.round(rnd() * 120) + Math.floor((nSeances - i) / 40), reps: 3 + Math.floor(rnd() * 8) });
    }
    parSeance[id] = liste; liste.forEach((x) => series.push(x));
  }
  const index = Modele.indexerExercices(catalogue);
  return { seances, series, exercices: catalogue, seriesDe: (id) => parSeance[id] || [], catalogue: () => index, journal: [] };
}

// L'origine, gardée : le drapeau par `recordsDeLaSeance` (toutes les séries de la séance).
function pointsOrigine(F, c, slug) {
  const p = F.pointsDeLExercice(c, slug);
  const par = {}; F.seancesAvecSeries(c).forEach((s) => { par[s.id] = s; });
  return p.points.map((x) => Object.assign({}, x, { record: F.recordsDeLaSeance(c, par[x.seance]).some((r) => r.slug === slug) }));
}

describe('216 — points d\'exercice rapides', () => {
  test('points identiques à l\'origine sur un historique de taille moyenne', () => {
    const c = historique(120, 30, 14);
    const F = Faits.creer(), G = Faits.creer();
    let vus = 0, records = 0;
    ['exo_0', 'exo_1', 'exo_2', 'exo_5', 'exo_12'].forEach((slug) => {
      const apres = F.pointsDeLExercice(c, slug).points;
      const avant = pointsOrigine(G, c, slug);
      expect(apres).toEqual(avant);
      vus += apres.length; records += apres.filter((x) => x.record).length;
    });
    expect(vus).toBeGreaterThan(50);
    expect(records).toBeGreaterThan(0);
  });

  test('budget : les 4 exercices les plus faits, 627 séances, ~17 800 séries, 153 exercices, sous 300 ms', () => {
    const c = historique(627, 153, 28);
    const F = Faits.creer();
    const t = Date.now();
    // Le chemin de l'onglet Progression : les points, et le drapeau du DERNIER point (la mini-courbe).
    ['exo_0', 'exo_1', 'exo_2', 'exo_3'].forEach((slug) => { const p = F.pointsDeLExercice(c, slug).points; void p[p.length - 1].record; });
    const ms = Date.now() - t;
    expect(c.series.length).toBeGreaterThan(17000);
    expect(ms).toBeLessThan(300);
  });
});
