'use strict';
// node trace.js FICHIER.jsonl SLUG [seanceMin] [seanceMax] : la trajectoire d'un exercice (consigne reçue, séries faites, constat de fin).
const fs = require('fs');
const [f, slug, lo, hi] = process.argv.slice(2);
fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).forEach((d) => {
  if (lo && d.seance < Number(lo)) return; if (hi && d.seance > Number(hi)) return;
  d.exos.filter((e) => e.slug === slug).forEach((e) => {
    const c = e.consigne || {};
    console.log('S' + d.semaine, '#' + d.seance, c.etat, JSON.stringify(c.ligne), c.haut ? 'haut ' + JSON.stringify(c.haut) : '', 'palier', c.palier, 'cpt', c.compteur, '| fait', e.fait.map((x) => x.kg + 'x' + x.reps + (x.ratee ? '!' : '')).join(' '), '| capacité', e.capacite, '|', e.constat ? e.constat.suite : '');
  });
});
