/** @jest-environment node */
//
// 49-U7 (C6) — LA GARDE DU COACH. Hors production, chaque plan que l'app
// calcule passe `verifierPlan` ; une violation s'écrit en console et un
// marqueur apparaît. En production, rien : ni calcul en plus, ni affichage.
//
// L'app se croit en production PAR DÉFAUT : la garde ne s'allume que sur la
// machine locale, une prévisualisation Cloudflare (`<déploiement>.<projet>.
// pages.dev`), ou par `?garde=1` (retenu sur l'appareil ; `?garde=0` l'éteint).

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const stockage = (init) => {
  const m = Object.assign({}, init || {});
  return { m, getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } };
};
const loc = (hostname, search) => ({ hostname, search: search || '' });

// Un plan juste, puis le même plan forgé pour violer I3 (une proposition sous
// la charge de travail).
const C = { consigne: { etat: 'garde', zone: 'lourd', palier: 125, niveau: 5, n: 3,
  // Une consigne « garde » porte son test (le moteur ne la rend jamais sans) :
  // la feuille « Pourquoi », que le plan rédige, le lit (PR 1, relevé du 01/10).
  ligne: { charge: 125, vise: 5 }, haut: { charge: 130, vise: 4, k: 1 }, fondement: { test: { charge: 130, reps: 3, niveau: 3, date: '2026-09-24T10:00:00+00:00' } } },
  contexte: { cran: 127.5, haut: null }, libelles: { jaune: [], gris: '' } };
function unPlan() {
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'x', id, { series: 3 });
  const entrees = { seance: { id: 'S', debut: '2026-09-26T10:00:00+00:00', edition: false, exercices: se.exercices },
    consignes: { x: C }, paris: [], suites: {} };
  return { entrees, plan: T.planDeSeance(entrees) };
}
function forge() {
  const { plan } = unPlan();
  const p = JSON.parse(JSON.stringify(plan));
  p.exercices[0].reaction.plan[1] = { charge: 120, vise: 3, zone: [3, 5], source: 'coach' };
  return p;
}
function espion() {
  const appels = { error: [], info: [], marques: [] };
  return {
    appels,
    journal: { error: (...a) => appels.error.push(a), info: (...a) => appels.info.push(a) },
    marquer: (v) => appels.marques.push(v)
  };
}

// ── QUAND LA GARDE TOURNE ───────────────────────────────────────────────────
describe('49-U7 — la garde ne tourne que hors production', () => {
  test('la machine locale et le banc : localhost, *.localhost, 127.0.0.1, ::1', () => {
    ['localhost', 'app.localhost', '127.0.0.1', '::1', '[::1]'].forEach((h) =>
      expect([h, T.gardeActive(loc(h), stockage())]).toEqual([h, true]));
  });

  test('une PRÉVISUALISATION Cloudflare Pages : <déploiement>.<projet>.pages.dev', () => {
    ['a1b2c3d4.trainhub.pages.dev', 'claude-49u7-garde.trainhub.pages.dev'].forEach((h) =>
      expect([h, T.gardeActive(loc(h), stockage())]).toEqual([h, true]));
  });

  test('⚠️ DISCRIMINANT — la PRODUCTION : <projet>.pages.dev, un domaine à soi, un hôte inconnu', () => {
    ['trainhub.pages.dev', 'trainhub.io', 'www.trainhub.io', 'exemple.fr', '', undefined].forEach((h) =>
      expect([h, T.gardeActive(loc(h), stockage())]).toEqual([h, false]));
    expect(T.gardeActive(null, null)).toBe(false);
  });

  test('`?garde=1` l’allume en production, et l’appareil le retient', () => {
    const st = stockage();
    expect(T.gardeActive(loc('trainhub.io', '?garde=1'), st)).toBe(true);
    expect(st.m['th-v2-garde']).toBe('1');
    expect(T.gardeActive(loc('trainhub.io', ''), st)).toBe(true);
  });

  test('`?garde=0` l’éteint, même sur la machine locale, et l’emporte sur l’hôte', () => {
    const st = stockage();
    expect(T.gardeActive(loc('localhost', '?x=1&garde=0'), st)).toBe(false);
    expect(T.gardeActive(loc('localhost', ''), st)).toBe(false);
  });

  test('un stockage fermé (qui lève) : l’hôte décide', () => {
    const ferme = { getItem: () => { throw new Error('bloqué'); }, setItem: () => { throw new Error('bloqué'); } };
    expect(T.gardeActive(loc('trainhub.io'), ferme)).toBe(false);
    expect(T.gardeActive(loc('127.0.0.1'), ferme)).toBe(true);
    expect(T.gardeActive(loc('trainhub.io', '?garde=1'), ferme)).toBe(true);
  });
});

// ── CE QUE FAIT LA GARDE ────────────────────────────────────────────────────
describe('49-U7 — hors production, une violation s’écrit en console et se marque', () => {
  test('prémisse : le plan juste passe, le forgé viole I3', () => {
    const { plan, entrees } = unPlan();
    expect(T.verifierPlan(plan, entrees).erreurs).toEqual([]);
    expect(T.verifierPlan(forge()).erreurs.map((e) => e.split(' — ')[0])).toContain('I3');
  });

  test('un plan juste : rien en console, aucun marqueur — mais il est compté', () => {
    const e = espion();
    const g = T.creerGarde({ location: loc('127.0.0.1'), stockage: stockage(), journal: e.journal, marquer: e.marquer });
    const { plan, entrees } = unPlan();
    expect(g.verifier(plan, entrees)).toEqual({ violations: [], rapports: [] });
    expect(e.appels).toEqual({ error: [], info: [], marques: [] });
    expect(g.etat()).toEqual({ active: true, plans: 1, violations: [] });
  });

  test('⚠️ DISCRIMINANT — un plan forgé : l’invariant, le plan et les entrées en console ; le marqueur', () => {
    const e = espion();
    const g = T.creerGarde({ location: loc('a1b2.trainhub.pages.dev'), stockage: stockage(), journal: e.journal, marquer: e.marquer });
    const p = forge();
    const r = g.verifier(p, undefined);
    expect(r.violations.map((x) => x.split(' — ')[0])).toContain('I3');
    expect(e.appels.error).toHaveLength(1);
    const [titre, violations, contexte] = e.appels.error[0];
    expect(titre).toMatch(/\[garde du coach\] \d+ violation/);
    expect(violations.some((v) => /^I3 — /.test(v))).toBe(true);
    expect(contexte.plan).toBe(p);
    expect(e.appels.marques).toHaveLength(1);
    expect(e.appels.marques[0].some((v) => /^I3 — /.test(v))).toBe(true);
  });

  test('I4 d’un plan au suivant, dans la même séance — pas d’une séance à l’autre', () => {
    const e = espion();
    const g = T.creerGarde({ location: loc('localhost'), stockage: stockage(), journal: e.journal, marquer: e.marquer });
    const a = JSON.parse(JSON.stringify(unPlan().plan));
    a.exercices[0].lignes[0] = Object.assign({}, a.exercices[0].lignes[0], { id: 'z', figee: true, validee: true, rang: 1 });
    const b = JSON.parse(JSON.stringify(a));
    b.exercices[0].lignes[0].rang = 9;
    g.verifier(a);
    const autre = JSON.parse(JSON.stringify(b)); autre.seance = 'AUTRE';
    expect(g.verifier(autre).violations.filter((x) => /^I4/.test(x))).toEqual([]);
    g.verifier(a);
    expect(g.verifier(b).violations.filter((x) => /^I4/.test(x))).toHaveLength(1);
  });

  test('`I10 suite` est RAPPORTÉE, pas une violation : console à part, aucun marqueur', () => {
    const e = espion();
    const g = T.creerGarde({ location: loc('localhost'), stockage: stockage(), journal: e.journal, marquer: e.marquer });
    const spy = jest.spyOn(T, 'verifierPlan').mockReturnValue({ ok: false, erreurs: ['I10 suite — exercice 0 (x) : …'] });
    try {
      expect(g.verifier(unPlan().plan)).toEqual({ violations: [], rapports: ['I10 suite — exercice 0 (x) : …'] });
    } finally { spy.mockRestore(); }
    expect(e.appels.info).toHaveLength(1);
    expect(e.appels.error).toEqual([]);
    expect(e.appels.marques).toEqual([]);
  });
});

describe('PR 7 — I26 est BLOQUANTE : un écart de cohérence est une violation', () => {
  test('un plan juste dont une phrase porte un chiffre écrit à la main : violation I26, console, marqueur', () => {
    const e = espion();
    const g = T.creerGarde({ location: loc('localhost'), stockage: stockage(), journal: e.journal, marquer: e.marquer });
    const p = JSON.parse(JSON.stringify(unPlan().plan));
    const x = p.exercices[0];
    x.phrases = (x.phrases || []).concat([{ ou: 'entete.gris', texte: 'Encore 3 séries.', citations: [] }]);
    const r = g.verifier(p);
    expect(r.violations).toEqual([expect.stringMatching(/^I26 — exercice 0 \(x\), entete\.gris : « 3 » \(hors_formateur/)]);
    expect(e.appels.error).toHaveLength(1);
    expect(e.appels.error[0][2].ecartsPhrases.map((q) => q.cause)).toEqual(['hors_formateur']);
    expect(e.appels.marques).toHaveLength(1);
    expect(g.etat().violations).toEqual(r.violations);
    expect(T.verifierPlan(p).ok).toBe(false);
  });
});

describe('49-U7 — EN PRODUCTION, LA GARDE NE FAIT RIEN', () => {
  test('⚠️ DISCRIMINANT — un plan forgé en production : ni calcul, ni console, ni marqueur', () => {
    const e = espion();
    const spy = jest.spyOn(T, 'verifierPlan');
    try {
      const g = T.creerGarde({ location: loc('trainhub.io'), stockage: stockage(), journal: e.journal, marquer: e.marquer });
      expect(g.active).toBe(false);
      expect(g.verifier(forge(), undefined)).toBeNull();
      expect(spy).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
    expect(e.appels).toEqual({ error: [], info: [], marques: [] });
  });

  test('témoin — le même plan, hors production : verifierPlan est bien appelé', () => {
    const spy = jest.spyOn(T, 'verifierPlan');
    try {
      T.creerGarde({ location: loc('localhost'), stockage: stockage(), journal: espion().journal }).verifier(forge());
      expect(spy).toHaveBeenCalledTimes(1);
    } finally { spy.mockRestore(); }
  });
});
