/** @jest-environment node */
//
// 189 — MESURE : le nombre de cartes de baisse par an, sur une année simulée (graine fixe) d'un pratiquant assidu :
// 3 séances par semaine, 8 exercices, 3 séries chacune, une force qui monte lentement, du bruit de séance (jusqu'à 6 %),
// une semaine de coupure, une vraie baisse de 3 semaines. La référence de Claude.ai : environ 2 cartes par an avec la valeur
// du milieu, environ 10 avec le maximum. La version « maximum » est le MÊME source dont la valeur du milieu est remplacée.
process.env.TZ = 'Europe/Paris';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');

function alea(graine) { let s = graine >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const BASE = Date.UTC(2026, 0, 5);
const jourN = (n) => new Date(BASE + n * 86400000).toISOString().slice(0, 10);

function annee(graine) {
  const r = alea(graine);
  const exos = ['squat', 'developpe', 'souleve', 'rowing', 'militaire', 'tirage', 'presse', 'curl'].map((slug, i) => ({
    slug, nom: slug.toUpperCase().slice(0, 1) + slug.slice(1) + i, charge: 60 + i * 10, seances: [], douleurs: [], zones: [], blocs: []
  }));
  const jours = [];
  for (let w = 0; w < 52; w++) {
    if (w === 30) continue;                                    // une semaine sans séance
    // une vraie baisse sur les semaines 40 à 42 (fatigue, sommeil) : -8 % en moyenne
    const trend = 1 + w * 0.002 - (w >= 40 && w <= 42 ? 0.08 : 0);
    [1, 3, 5].forEach((d) => {
      const jour = jourN(w * 7 + d);
      jours.push(jour);
      exos.forEach((e) => {
        const series = [];
        for (let k = 0; k < 3; k++) {
          const bruit = 1 + (r() - 0.5) * 0.12;                // +-6 % par série
          series.push({ charge_kg: Math.round(e.charge * trend * bruit / 2.5) * 2.5, reps: 5, type_serie: 'travail' });
        }
        e.seances.push({ jour, series });
      });
    });
  }
  return { exos, jours };
}

function cartes(M2, graine) {
  const { exos, jours } = annee(graine);
  const poses = [];
  let derniere = null;
  jours.forEach((jour) => {
    if (derniere && (Date.parse(jour) - Date.parse(derniere)) / 86400000 < 28) return;
    const avant = (l) => l.filter((s) => s.jour < jour);
    const d = {
      jour, seances: jours.filter((j) => j < jour).map((j) => j + 'T10:00:00+02:00'), periodesAllegees: [], pesees: [],
      exercices: exos.map((e) => Object.assign({}, e, { seances: avant(e.seances) }))
    };
    if (M2.baisseGenerale(d).declenche) { poses.push(jour); derniere = jour; }
  });
  return poses;
}

function moteurAuMaximum() {
  let src = fs.readFileSync(path.join(__dirname, '../../v2/js/moteur.js'), 'utf8');
  const a = 'function medianeDeFatigue(valeurs) { return mediane(valeurs.map(function (v) { return v.valeur; })); }';
  if (src.indexOf(a) < 0) throw new Error('medianeDeFatigue introuvable');
  src = src.replace(a, 'function medianeDeFatigue(valeurs) { return Math.max.apply(null, valeurs.map(function (v) { return v.valeur; })); }');
  const ctx = { module: { exports: {} }, console, Date, Math, Object, Array, JSON, Number, String, window: undefined };
  ctx.globalThis = ctx; ctx.self = ctx;
  ctx.THModele = global.THModele; ctx.THProfil = global.THProfil; ctx.THPalier = global.THPalier;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.module.exports && ctx.module.exports.baisseGenerale ? ctx.module.exports : ctx.THMoteur;
}

describe('§14.11 — le nombre de cartes de baisse par an (mesure)', () => {
  test('la valeur du milieu pose peu de cartes (le maximum est rapporté à côté)', () => {
    const maxi = moteurAuMaximum();
    let milieu = 0, maximum = 0;
    [1, 2, 3].forEach((g) => { milieu += cartes(M, g).length; maximum += cartes(maxi, g).length; });
    const parAn = { milieu: milieu / 3, maximum: maximum / 3 };
    console.log('189 mesure : cartes de baisse par an (moyenne sur 3 années simulées) — valeur du milieu ' + parAn.milieu + ', maximum ' + parAn.maximum);
    expect(parAn.milieu).toBeLessThanOrEqual(3);
    expect(parAn.milieu).toBeGreaterThanOrEqual(0.5);
    expect(parAn.maximum).toBeGreaterThanOrEqual(0);   // rapporté, non borné : voir le rapport (189)
  });
});
