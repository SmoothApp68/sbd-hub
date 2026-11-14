/** @jest-environment node */
//
// « Les mots disent vrai » PR 5a (MOTEUR §9.48) — LES ANNONCES : `Moteur.annonceDe`, et l'invariant I164 (`verifierAnnonce`).
//
//   1. « Même cible » n'existe plus : l'annonce redit le VERBE de la consigne suivante, la cause seulement pour garder ou borner (A1, A3).
//   2. « Il te manque N reps pour tester X kg » : dite seulement si le moteur confirme (`testConfirme`), sinon SILENCE (A7, B2). La condition rejouée
//      par `suiteDExercice` tient compte de la réserve réellement notée, et change de réponse avec elle.
//   3. Les phrases de l'effort visé passent par `annonceDe('effort')` (B1), mots inchangés.
//   4. I164 : lexique fermé, verbe et chiffre recalculés, « il te manque » confirmée — DISCRIMINANTS (un texte forgé dans un plan réel).
//   5. La clé du mémo de la suite porte le type de série (B4, section de banc `seance-ecran.js`).

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/semaine.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const fs = require('fs');
const path = require('path');

const esp = (t) => String(t == null ? '' : t).replace(/[  ]/g, ' ');
const ZONE = M.zoneParCle('hypertrophie');

// Une consigne de progression forgée : la ligne (charge × vise), le niveau du jour, l'éventuelle série sans marge.
const prog = (vise, extra) => Object.assign({ etat: 'progression', zone: 'hypertrophie', palier: 70, niveau: 8, n: 3, ligne: { charge: 70, vise },
  haut: null, fondement: { date: '2026-09-29T18:00:00+02:00', reps: [8, 8, 8] } }, extra || {});
const suite = (cAvant, cApres, extra) => esp(M.annonceDe('suite', Object.assign({ cAvant, cApres, z: M.zoneParCle(cApres.zone), reglage: 'normal',
  fait: cApres.niveau, cranSuivant: 72.5, cranApproche: false, testConfirme: false }, extra || {})));

describe('« Même cible » est supprimé : l’annonce redit le verbe de la consigne suivante (A1)', () => {
  test('une rep de plus, deux reps de plus : le chiffre de la ligne, jamais « même cible »', () => {
    expect(suite(prog(9), prog(9))).toBe('La prochaine fois : une rep de plus, 70 kg × 9.');
    expect(suite(prog(10), prog(10))).toBe('La prochaine fois : deux reps de plus, 70 kg × 10.');
  });
  test('la ligne qui garde : « tu restes à C × R », avec sa cause seulement si le verbe la rend vraie (A3)', () => {
    const sm = { fondement: { date: '2026-09-29T18:00:00+02:00', reps: [8, 8, 8], sansMarge: { derniere: true, protegee: false } } };
    expect(suite(prog(8), prog(8, sm))).toBe('La prochaine fois : tu restes à 70 kg × 8, la dernière sans marge.');
    expect(suite(prog(8), prog(8))).toBe('La prochaine fois : tu restes à 70 kg × 8.');
    // Une série à fond mais une ligne qui MONTE : jamais la cause devant « une rep de plus ».
    expect(suite(prog(9), prog(9, sm))).toBe('La prochaine fois : une rep de plus, 70 kg × 9.');
    // Une population protégée : jamais « sans marge ».
    const pr = { fondement: { date: '2026-09-29T18:00:00+02:00', reps: [8, 8, 8], sansMarge: { derniere: true, protegee: true } } };
    expect(suite(prog(8), prog(8, pr))).toBe('La prochaine fois : tu restes à 70 kg × 8.');
  });
  test('la zone qui borne : « ta cible, … » ; la charge gardée : « je garde C kg »', () => {
    expect(suite(prog(7), prog(7))).toBe('La prochaine fois : ta cible, 70 kg × 7.');
    const gc = prog(8, { fondement: { date: '2026-09-29T18:00:00+02:00', reps: [8], effortVise: { effet: 'garde', charge: 70, reps: 8, reserve: 0 } } });
    expect(suite(prog(8), gc)).toBe('La prochaine fois : je garde 70 kg.');
  });
  test('une ligne haute ou un verbe sans phrase : le libellé « Prochaine séance » reste (5b le change partout)', () => {
    const avecHaut = prog(9, { haut: { charge: 72.5, vise: 6, k: 1 } });
    expect(suite(prog(9, { haut: { charge: 72.5, vise: 6, k: 1 } }), avecHaut)).toMatch(/^Prochaine séance : /);
    expect(suite(prog(8), prog(9))).toMatch(/^Prochaine séance : 70 kg × 9\.$/);
  });
  test('le mot « Même cible » n’est écrit nulle part dans v2/js', () => {
    fs.readdirSync(path.join(__dirname, '../../v2/js')).filter((f) => /\.js$/.test(f)).forEach((f) => {
      const code = fs.readFileSync(path.join(__dirname, '../../v2/js', f), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
      expect([f, /['"`]Même cible/.test(code)]).toEqual([f, false]);
    });
  });
});

describe('« Il te manque N reps pour tester X kg » : confirmée par le moteur, sinon silence (A7, B2)', () => {
  const cA = prog(9, { niveau: 8 }), cB = prog(9, { niveau: 9 });
  const manque = (confirme) => suite(cA, Object.assign({}, cB, { ligne: { charge: 70, vise: 10 } }), { fait: 9, testConfirme: confirme });
  test('confirmée : la phrase du lexique', () => {
    expect(manque(true)).toBe('Il te manque une rep pour tester 72,5 kg.');
    expect(esp(M.annonceDe('suite', { cAvant: prog(9, { niveau: 7 }), cApres: prog(9, { niveau: 8 }), z: ZONE, reglage: 'normal', fait: 8, cranSuivant: 72.5, testConfirme: true })))
      .toBe('Il te manque 2 reps pour tester 72,5 kg.');
  });
  test('non confirmée : jamais « Il te manque » ni un test promis ; la LIGNE VRAIE de la consigne suivante (arbitrage PR 5a-bis), jamais le silence', () => {
    [{ testConfirme: false }, {}].forEach((x) => {
      const t = esp(M.annonceDe('suite', Object.assign({ cAvant: cA, cApres: Object.assign({}, cB), z: ZONE, reglage: 'normal', fait: 9, cranSuivant: 72.5 }, x)));
      expect(t).toMatch(/^(La prochaine fois|Prochaine séance) : /);
      expect(t).not.toMatch(/Il te manque|tester/);
    });
  });
  test('la condition est REJOUÉE par `suiteDExercice` avec la réserve réellement notée : sans marge, le test ne vient pas (jamais une réserve favorable inventée)', () => {
    const o = { mesure: 'charge_reps', equipement: 'poulie', intention: 'progresser', reglage: 'normal', edition: false };
    const d = (i) => new Date(Date.UTC(2026, 8, 1 + i * 7, 17)).toISOString();
    let nn = 0;
    const gr = (ss) => ss.map((s, i) => ({ seance: { id: 'H' + i, debut: s[0], routine_id: 'R' },
      series: s[1].map((x) => ({ id: 'r' + (++nn), rang: nn, charge_kg: x[0], reps: x[1], rpe: null, ressenti: x[2] || null, type_serie: 'travail', exercise_slug: 'rowing_poulie_assis', au_max_reserve: null })) }));
    const confirme = (ressenti, repsDuJour) => {
      const hist = gr([[d(0), [[70, 8], [70, 8], [70, 8]]], [d(1), [[70, 8], [70, 8], [70, 8]]]]);
      const j = gr([[d(2), repsDuJour.map((r, i) => [70, r, i === repsDuJour.length - 1 ? ressenti : null])]])[0];
      const su = M.suiteDExercice(hist, j, undefined, d(2).replace('17:00', '20:00'), o);
      return su.testConfirme;
    };
    // 70 × 9, 9, 9 pour un haut de zone à 10 : il manque une rep. Avec de la marge, le test vient ; sans marge, la progression continue.
    const dits = [];
    [[9, 9, 9], [8, 9, 9], [9, 9, 8]].forEach((reps) => dits.push([confirme('reste_2', reps), confirme('reste_0', reps)]));
    expect(dits.some((x) => x[0] === true)).toBe(true);
    dits.forEach((x) => { expect(x[1]).not.toBe(true); });
  });
});

describe('les phrases de l’effort visé passent par annonceDe (B1) — mots inchangés', () => {
  const ev = (extra) => Object.assign({ effet: 'garde', charge: 130, reps: 5, reserve: 0, visee: 2, auHaut: false }, extra || {});
  test('apres : « la prochaine fois » ; aujourdhui : la garde et la sortie, sans promesse d’un autre jour', () => {
    expect(esp(M.annonceDe('effort', { ev: ev(), haut: null, moment: 'apres' }))).toBe('130 kg × 5, sans marge. Je garde 130 kg la prochaine fois.');
    expect(esp(M.annonceDe('effort', { ev: ev({ effet: 'test', charge: 34, reps: 9, reserve: 3, visee: 1 }), haut: 36, moment: 'apres' })))
      .toBe('34 kg × 9, il t’en restait 3. Au-dessus de ce que je visais : la prochaine fois, on essaie 36 kg.');
    expect(esp(M.annonceDe('effort', { ev: ev(), moment: 'aujourdhui' }))).toBe('130 kg × 5, sans marge. Je garde 130 kg la prochaine fois.');
    expect(M.annonceDe('effort', { ev: null, moment: 'apres' })).toBeNull();
    expect(M.annonceDe('autre', {})).toBeNull();
  });
});

// ── I164 : un texte forgé dans un plan réel ──────────────────────────────────────────────────────────────────
describe('I164 — verifierAnnonce relit l’annonce du plan (DISCRIMINANTS)', () => {
  const AVANT = '2026-09-26T10:00:00+00:00', APRES = '2026-09-26T12:00:00+00:00';
  const OPTS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false };
  const jour = (d) => '2026-09-' + d + 'T18:00:00+00:00';
  const set = (sid, kg, reps, rang) => ({ id: sid + '-' + rang, session_id: sid, exercise_slug: 'terre', charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', rang, validee_a: 'v', source: 'app' });
  const HIST = [['a', '05', [[120, 5], [120, 5], [120, 5]]], ['b', '12', [[122.5, 5], [122.5, 5], [122.5, 5]]], ['c', '19', [[125, 5], [125, 5], [125, 5]]]]
    .map(([sid, d, l]) => ({ seance: { id: sid, debut: jour(d) }, series: l.map(([kg, r], i) => set(sid, kg, r, i + 1)) }));
  const CONS = M.consigneDExercice(HIST, undefined, AVANT, OPTS);
  const serie = (id, kg, reps) => ({ id, type_serie: 'travail', charge_kg: kg, reps, rpe: null, ressenti: null, validee_a: '2026-09-26T10:30:00Z', source: 'app' });
  const plan = (reps) => {
    const series = [serie('t1', 125, reps[0]), serie('t2', 125, reps[1]), serie('t3', 125, reps[2])];
    const s = M.suiteDExercice(HIST, { seance: { debut: AVANT }, series }, undefined, APRES, OPTS);
    const entrees = { seance: { id: 'S', debut: AVANT, edition: false, exercices: [{ exercise_slug: 'terre', series }] }, consignes: { terre: CONS }, reglage: 'normal', paris: [],
      suites: { terre: { consigne: s.apres.consigne, cranSuivant: s.cranSuivant, cranSuivantApprochee: s.cranSuivantApprochee === true, testConfirme: s.testConfirme === true } } };
    return { entrees, plan: T.planDeSeance(entrees) };
  };
  const erreurs = (p, texte, extra) => {
    const x = p.plan.exercices[0];
    const sauve = { suite: x.constat.suite, testConfirme: x.constat.testConfirme, suiteLignes: x.constat.suiteLignes };
    x.constat.suite = texte;
    if (extra) Object.assign(x.constat, extra);
    const r = T.verifierPlan(p.plan, p.entrees).erreurs.filter((e) => /^I164/.test(e));
    Object.assign(x.constat, sauve);
    return r;
  };
  const P = plan([4, 4, 4]);
  // La suite d'un exercice à ligne seule, forgée sur le plan réel : 70 kg × 9 pour un niveau de 8 (une rep de plus).
  const SL = { ligne: { charge: 70, vise: 9 }, haut: null, niveau: 8, repsMax: 8, zoneHaut: 10, cran: 72.5 };
  const L = '70 kg × 9';
  const avec = (texte, extra) => erreurs(P, texte, Object.assign({ suiteLignes: Object.assign({}, P.plan.exercices[0].constat.suiteLignes, SL) }, extra || {}));

  test('prémisse : le plan réel porte une annonce valide, sans erreur I164', () => {
    expect(esp(P.plan.exercices[0].constat.suite)).toMatch(/^Prochaine séance : /);
    expect(T.verifierPlan(P.plan, P.entrees).erreurs.filter((e) => /^I164/.test(e))).toEqual([]);
  });
  test('sens 1 — « Même cible » est refusé, comme « Prochaine fois » nu', () => {
    expect(avec('Même cible la prochaine fois : ' + L + '.').length).toBeGreaterThan(0);
    expect(avec('Prochaine fois : ' + L + '.').length).toBeGreaterThan(0);
  });
  test('sens 2 — le nombre de reps de plus, le verbe et la ligne se recalculent', () => {
    expect(avec('La prochaine fois : une rep de plus, ' + L + '.')).toEqual([]);
    expect(avec('La prochaine fois : deux reps de plus, ' + L + '.').length).toBeGreaterThan(0);                  // N faux
    expect(avec('La prochaine fois : tu restes à ' + L + '.').length).toBeGreaterThan(0);                           // un verbe qui garde devant une ligne qui monte
    expect(avec('La prochaine fois : une rep de plus, 70 kg × 8.').length).toBeGreaterThan(0);                      // une autre ligne
    expect(avec('La prochaine fois : une rep de plus, ' + L + ', la dernière sans marge.').length).toBeGreaterThan(0);   // la cause devant « de plus »
    // la ligne qui garde (niveau = vise) : « tu restes à » est le verbe juste, « une rep de plus » le faux
    const garde = { suiteLignes: Object.assign({}, P.plan.exercices[0].constat.suiteLignes, SL, { niveau: 9 }) };
    expect(erreurs(P, 'La prochaine fois : tu restes à ' + L + ', la dernière sans marge.', garde)).toEqual([]);
    expect(erreurs(P, 'La prochaine fois : une rep de plus, ' + L + '.', garde).length).toBeGreaterThan(0);
    // une ligne haute : l'annonce de verbe n'existe pas
    expect(erreurs(P, 'La prochaine fois : une rep de plus, ' + L + '.', { suiteLignes: Object.assign({}, SL, { haut: { charge: 72.5, vise: 6 } }) }).length).toBeGreaterThan(0);
  });
  test('sens 4 — « Il te manque » sans confirmation du moteur, ou avec un autre nombre ou un autre cran, est refusée', () => {
    const dit = 'Il te manque une rep pour tester 72,5 kg.';
    const forge = { suiteLignes: Object.assign({}, P.plan.exercices[0].constat.suiteLignes, SL, { niveau: 9, repsMax: 9 }) };
    expect(erreurs(P, dit, Object.assign({ testConfirme: true }, forge))).toEqual([]);
    expect(erreurs(P, dit, Object.assign({ testConfirme: false }, forge)).length).toBeGreaterThan(0);                 // le moteur n'a pas confirmé
    expect(erreurs(P, 'Il te manque 2 reps pour tester 72,5 kg.', Object.assign({ testConfirme: true }, forge)).length).toBeGreaterThan(0);   // un autre nombre
    expect(erreurs(P, 'Il te manque une rep pour tester 75 kg.', Object.assign({ testConfirme: true }, forge)).length).toBeGreaterThan(0);    // un autre cran
  });
});

// ── B4 : la clé du mémo porte le type ──────────────────────────────────────────────────────────────────────
describe('la clé du mémo de la suite porte le type de série (B4)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
  const corps = /function empreinteSerie\(s\) \{([^}]*)\}/.exec(src)[1];
  test('`empreinteSerie` lit type_serie, au_max_reserve et hors_calcul en plus de la charge, des reps et de l’effort', () => {
    ['charge_kg', 'reps', 'rpe', 'ressenti', 'type_serie', 'au_max_reserve', 'hors_calcul'].forEach((c) => expect([c, corps.indexOf(c) >= 0]).toEqual([c, true]));
  });
  test('et la valeur du mémo porte `testConfirme` (le plan le relit par I164)', () => {
    expect(/testConfirme: r\.testConfirme === true/.test(src)).toBe(true);
  });
});
