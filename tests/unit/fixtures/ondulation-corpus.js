// 193-3 — LE CORPUS DU BANC DE COMPARAISON EXACTE. Des historiques déterministes (générateur congruentiel, aucune horloge)
// et des variantes d'options ; `produire(Moteur)` rend la sortie COMPLÈTE de `consigneDExercice` pour chacun. Le JSON d'or
// (`ondulation-or.json`) a été produit par ce corpus sur main après la 193-1 (19f52ae) : sans zone de plan, le moteur de la
// 193-3 doit rendre les mêmes octets. On ne le régénère que volontairement (`node ondulation-generer-or.js <moteur.js>`).
'use strict';

function prng(graine) {
  let x = graine >>> 0;
  return function () { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
}

function histoires() {
  const sorties = [];
  let n = 0;
  const brute = (kg, reps, extra) => Object.assign({ id: 'r' + (++n), rang: n, charge_kg: kg, reps, rpe: null, ressenti: null,
    type_serie: 'travail', exercise_slug: 'squat_barre' }, extra || {});
  // Des motifs fixes : DUP, lourd seul, mix seul, hypertrophie, trou, singles, séance unique.
  const motif = (nom, seances) => sorties.push({ nom, groupes: seances.map((s, i) => ({
    seance: { id: nom + i, debut: new Date(s.d).toISOString() },
    series: (s.series || [0, 1, 2, 3]).map(() => brute(s.kg, s.reps)) })) });
  const j = (a, m, d) => Date.UTC(a, m, d, 17);
  const dup = [];
  for (let w = 0; w < 6; w++) { dup.push({ kg: 130 + 2.5 * w, reps: 4, d: j(2026, 8, 7 + w * 7) }); dup.push({ kg: 110 + 2.5 * w, reps: 7, d: j(2026, 8, 10 + w * 7) }); }
  motif('dup', dup);
  motif('lourd', [0, 1, 2, 3, 4].map((w) => ({ kg: 120 + 2.5 * w, reps: 4, d: j(2026, 8, 7 + w * 7) })));
  motif('mix', [0, 1, 2, 3, 4].map((w) => ({ kg: 100 + 2.5 * w, reps: 7, d: j(2026, 8, 7 + w * 7) })));
  motif('hyper', [0, 1, 2].map((w) => ({ kg: 60, reps: 9 + w, d: j(2026, 8, 7 + w * 7) })));
  motif('trou', [{ kg: 100, reps: 7, d: j(2026, 5, 4) }, { kg: 100, reps: 7, d: j(2026, 5, 11) }, { kg: 127.5, reps: 3, d: j(2026, 8, 17) }, { kg: 130, reps: 3, d: j(2026, 8, 24) }]);
  motif('singles', [0, 1, 2].map((w) => ({ kg: 140 + 2.5 * w, reps: 2, d: j(2026, 8, 7 + w * 7) })));
  motif('une', [{ kg: 80, reps: 8, d: j(2026, 8, 7) }]);
  motif('vide', []);
  // Des historiques tirés au hasard.
  const rnd = prng(193003);
  for (let h = 0; h < 40; h++) {
    const k = 1 + Math.floor(rnd() * 14);
    let t = j(2026, 6, 1), kg = 40 + Math.floor(rnd() * 8) * 10;
    const seances = [];
    for (let i = 0; i < k; i++) {
      t += (2 + Math.floor(rnd() * (rnd() < 0.15 ? 90 : 9))) * 864e5;
      kg += (rnd() < 0.5 ? 2.5 : 0) - (rnd() < 0.15 ? 5 : 0);
      const reps = 2 + Math.floor(rnd() * 14);
      seances.push({ kg, reps, d: t, series: new Array(2 + Math.floor(rnd() * 4)).fill(0) });
    }
    motif('alea' + h, seances);
  }
  return sorties;
}

const BASE = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false };
const VARIANTES = [
  { nom: 'base', o: {} },
  { nom: 'mix', o: { correction: 'mix' } },
  { nom: 'lourd', o: { correction: 'lourd' } },
  { nom: 'zones-datees', o: { correction: 'mix', correctionsDeZone: [{ id: 'z1', exercise_slug: 'squat_barre', zone: 'mix', corrigee_a: '2026-09-20T08:00:00.000Z' }] } },
  { nom: 'menagee', o: { menagee: true } },
  { nom: 'prudent', o: { reglage: 'prudent' } },
];

function produire(Moteur, extra) {
  const sortie = {};
  histoires().forEach((h) => {
    const dernier = h.groupes.length ? Date.parse(h.groupes[h.groupes.length - 1].seance.debut) : Date.UTC(2026, 8, 7);
    [3, 10, 30, 100].forEach((jours) => {
      const avant = new Date(dernier + jours * 864e5).toISOString();
      VARIANTES.forEach((v) => {
        const o = Object.assign({}, BASE, v.o, extra || {});
        let r;
        try { r = Moteur.consigneDExercice(h.groupes, undefined, avant, o); } catch (e) { r = { exception: String(e && e.message) }; }
        sortie[h.nom + '|' + jours + '|' + v.nom] = JSON.parse(JSON.stringify(r === undefined ? null : r));
      });
    });
  });
  return sortie;
}
module.exports = { produire, histoires };
