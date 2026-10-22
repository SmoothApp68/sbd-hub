/** @jest-environment node */
//
// 136 (audit du 16/10/2026, E13 ; audit iPhone I-06) — LE REPOS SURVIT AU RECHARGEMENT.
//
// À la reprise d'une séance en cours, le repos se réarme depuis `validee_a` de la dernière série validée et la cible
// du plan (`Seance.reposAReprendre`) : `depuis` EST cet instant — le même calcul « depuis » que l'affichage
// (`secondesDeRepos`), jamais un compteur repris de zéro. Un repos déjà échu ne revient pas ; un repos jamais
// prescrit non plus. Et `app.js` le branche au démarrage (avant le premier rendu) et à la reprise d'une séance
// d'un autre appareil, avec la question de réserve de la règle de l'armement (`questionDuRepos`).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

require('../../v2/js/modele.js');
const Seance = require('../../v2/js/seance.js');
const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');

function extraire(nom) {
  const m = APP.match(new RegExp('^  (?:async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable dans v2/js/app.js : ' + nom);
  return m[0];
}

const T0 = Date.parse('2026-10-22T18:00:00.000Z');
const iso = (ms) => new Date(T0 + ms).toISOString();
// Une séance en cours : A (2 séries), B (2 séries). `validees` : `[[iExo, iSerie, ms depuis T0]…]`.
function seanceAvec(validees, statut) {
  const exo = (slug) => ({ exercise_slug: slug, repos_cible_s: 120, series: [0, 1].map((k) => ({ id: slug + k,
    charge_kg: 100, reps: 5, type_serie: 'travail', validee_a: null, source: 'app' })) });
  const s = { id: 's1', statut: statut || Seance.EN_COURS, exercices: [exo('a'), exo('b')] };
  validees.forEach(([i, j, ms]) => { s.exercices[i].series[j].validee_a = iso(ms); });
  return s;
}
const cible = (c) => () => c;

describe('136 — `Seance.reposAReprendre` : le repos relu depuis la dernière série validée', () => {
  test('DISCRIMINANT — `depuis` est l’instant de la dernière validation, pas « maintenant » (le décompte continue)', () => {
    const s = seanceAvec([[0, 0, 0], [0, 1, 200000]]);
    const r = Seance.reposAReprendre(s, cible(120), new Date(T0 + 200000 + 45000));
    expect(r).toEqual({ depuis: T0 + 200000, cible: 120, iExo: 0, iSerie: 1 });
    // Le restant affiché après reprise est celui qu'aurait montré la barre sans rechargement : 120 − 45.
    const ecoule = Math.round((T0 + 245000 - r.depuis) / 1000);
    expect(Seance.secondesRestantes(r.cible, ecoule)).toBe(75);
  });

  test('la DERNIÈRE validation de la séance, quel que soit son exercice ou son rang', () => {
    const s = seanceAvec([[1, 0, 300000], [0, 1, 100000], [0, 0, 50000]]);
    const vus = [];
    const r = Seance.reposAReprendre(s, (i, j) => { vus.push([i, j]); return 90; }, T0 + 310000);
    expect(r).toEqual({ depuis: T0 + 300000, cible: 90, iExo: 1, iSerie: 0 });
    expect(vus).toEqual([[1, 0]]);   // la cible est demandée pour CETTE série (la règle de la validation)
  });

  test('un repos déjà ÉCHU ne revient pas (pile à l’échéance compris)', () => {
    const s = seanceAvec([[0, 0, 0]]);
    expect(Seance.reposAReprendre(s, cible(120), T0 + 119000)).not.toBeNull();
    expect(Seance.reposAReprendre(s, cible(120), T0 + 120000)).toBeNull();
    expect(Seance.reposAReprendre(s, cible(120), T0 + 3600000)).toBeNull();
  });

  test('un repos jamais prescrit (ou nul) ne revient pas : la règle de l’armement (`cibleArmable`)', () => {
    const s = seanceAvec([[0, 0, 0]]);
    expect(Seance.reposAReprendre(s, cible(null), T0 + 1000)).toBeNull();
    expect(Seance.reposAReprendre(s, cible(0), T0 + 1000)).toBeNull();
    expect(Seance.reposAReprendre(s, cible(undefined), T0 + 1000)).toBeNull();
  });

  test('rien sans série validée, rien en correction (séance terminée), rien sans séance', () => {
    expect(Seance.reposAReprendre(seanceAvec([]), cible(120), T0)).toBeNull();
    expect(Seance.reposAReprendre(seanceAvec([[0, 0, 0]], Seance.TERMINEE), cible(120), T0 + 1000)).toBeNull();
    expect(Seance.reposAReprendre(null, cible(120), T0)).toBeNull();
  });

  test('une horloge qui recule (validée « dans le futur ») : le repos entier, jamais plus', () => {
    const s = seanceAvec([[0, 0, 5000]]);
    const r = Seance.reposAReprendre(s, cible(120), T0);
    expect(r && r.depuis).toBe(T0 + 5000);
  });
});

describe('136 — `app.js` : le repos se réarme à la reprise, avec sa question', () => {
  function bac(seance, plan) {
    const ctx = { Seance, Date, seance, chrono: null,
      Plan: { reposApres: (x, iSerie, reposExo) => (x && x.chauffe === iSerie ? 60 : reposExo === undefined ? null : reposExo) },
      planDeLExercice: (i) => (plan || {})[i] || null,
      questionDuRepos: (i, j) => ({ iExo: i, iSerie: j, id: 'q' }) };
    vm.createContext(ctx);
    vm.runInContext(extraire('reprendreChrono') + '\nthis.reprendreChrono = reprendreChrono;', ctx);
    return ctx;
  }

  test('le chrono repris porte `depuis` = la validation, la cible du plan, l’exercice qui l’a armé et sa question', () => {
    const s = seanceAvec([[0, 0, Date.now() - T0 - 30000]]);
    const c = bac(s);
    c.reprendreChrono();
    expect(c.chrono).toEqual({ depuis: Date.parse(s.exercices[0].series[0].validee_a), cible: 120, sonne: false,
      exo: { i: 0, slug: 'a' }, question: { iExo: 0, iSerie: 0, id: 'q' } });
  });

  test('la cible vient de `Plan.reposApres` (60 s après une chauffe), pas du seul repos de l’exercice', () => {
    const s = seanceAvec([[0, 0, Date.now() - T0 - 10000]]);
    const c = bac(s, { 0: { chauffe: 0 } });
    c.reprendreChrono();
    expect(c.chrono.cible).toBe(60);
  });

  test('un repos échu : aucun chrono', () => {
    const c = bac(seanceAvec([[0, 0, Date.now() - T0 - 600000]]));
    c.reprendreChrono();
    expect(c.chrono).toBeNull();
  });

  test('câblé au démarrage AVANT le premier rendu, et à la reprise d’une séance d’un autre appareil', () => {
    const entrer = extraire('entrerVraiment');
    const i = entrer.indexOf('reprendreChrono()');
    expect(i).toBeGreaterThan(entrer.indexOf('await chargerSeanceLocale()'));
    expect(i).toBeLessThan(entrer.indexOf('rendreRoute(routeInitiale)'));
    expect(extraire('reprendreDistante')).toMatch(/chrono = null;[\s\S]*reprendreChrono\(\);[\s\S]*rendreChrono\(\);/);
  });
});
