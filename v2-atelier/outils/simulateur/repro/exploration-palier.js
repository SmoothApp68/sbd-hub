'use strict';
// F1 — une série d'exploration (plus lourde, ratée à 1 rep) devient la « charge de travail » quand la séance n'a aucune charge répétée.
// Moteur seul, aucune simulation : node repro/exploration-palier.js
// Attendu (MOTEUR §7.5 : « elle ne change jamais le palier du jour » ; §7.6) : la consigne reste sur 5 kg.
const { Moteur, Palier } = require('../charger.js');
const slug = 'elevation_laterale_poulie';
let id = 0;
const mk = (jour, sets) => ({
  seance: { id: 'S' + jour, debut: '2026-01-' + String(jour).padStart(2, '0') + 'T17:00:00.000Z' },
  series: sets.map(([kg, reps], k) => ({ id: 'q' + (++id), rang: k + 1, charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail',
    exercise_slug: slug, validee_a: '2026-01-' + String(jour).padStart(2, '0') + 'T17:30:00.000Z' }))
});
const H = [5, 8, 12, 15, 19, 22].map((j) => mk(j, [[5, 16], [5, 16], [5, 16]]));
H.push(mk(26, [[7.5, 1], [5, 17], [2.5, 16]]));   // la personne tente 7,5 kg (1 rep), revient à 5 kg, finit à 2,5 kg
const o = { mesure: 'charge_reps', equipement: 'poulie', intention: 'progresser', reglage: 'normal', edition: false,
  seancesSousConsigne: H.map((g) => g.seance.id), isolation: true, lestPossible: false, depart: null, salle: null };
[6, 7].forEach((n) => {
  const g = H.slice(0, n);
  const c = Moteur.consigneDExercice(g, Palier.etatsExercices(g.map((x) => ({ slug, series: x.series })))[slug], (n === 6 ? '2026-01-24T17:00:00.000Z' : '2026-01-29T17:00:00.000Z'), o).consigne;
  console.log('après ' + n + ' séances →', c.etat, '| palier', c.palier, '| niveau', c.niveau, '| ligne', JSON.stringify(c.ligne));
});
