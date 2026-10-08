/**
 * @jest-environment jsdom
 */
//
// 60-2b — CE QUE LA PERSONNE A DIT DE SON TEMPS A SES LECTEURS (MOTEUR §9.18).
//
// Seulement quand une durée visée est DÉCLARÉE (`duree_seance_min`) et que
// l'estimation de la routine la dépasse, hors semaine allégée, et pas en « Juste
// un carnet » :
//   · « J'ai moins de temps en ce moment » (`moins`) : la carte de « J'ai peu de
//     temps » s'ouvre d'elle-même à la durée visée — au « Démarrer » —, UNE fois
//     par routine et par jour ;
//   · « Ça varie beaucoup » (`varie`) : aucune question ; l'estimation s'écrit en
//     couleur du coach à côté de « J'ai peu de temps » ;
//   · « C'est mon maximum », « J'ai de la marge » : rien.
//
// ⚠️ `tempsDeLaRoutine`, `ouvrirPeuDeTempsDOffice` et la mémoire locale (app.js)
// se REJOUENT dans un bac `vm`, avec le vrai `moteur.js`. Environnement jsdom :
// `rendu.js` se termine par `this`, que Babel remplace par `undefined` sous node.

process.env.TZ = 'Europe/Paris';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/routines.js');
require('../../v2/js/rendu.js');
const M = require('../../v2/js/moteur.js');
const Q = require('../../v2/js/questionnaire.js');

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const extraire = (nom) => {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable : ' + nom);
  return m[0];
};
const MIN = 60;

// ── 1. La règle, au moteur ──────────────────────────────────────────────────
describe('§9.18 — `reponseDeTemps` : ce que chaque réponse déclenche', () => {
  const D75 = 75 * MIN;       // une routine estimée à 75 min

  test('⚠️ DISCRIMINANT — durée déclarée 60 < 75 : « moins » ouvre la carte à 60 min ; « varie » montre l’ambre ; le reste, rien', () => {
    expect(M.reponseDeTemps('moins', D75, 60, 'progresser')).toEqual({ ouvrir: 60, ambre: false });
    expect(M.reponseDeTemps('varie', D75, 60, 'progresser')).toEqual({ ouvrir: null, ambre: true });
    ['max', 'marge', null, undefined, '', 'autre'].forEach((v) => {
      expect([v, M.reponseDeTemps(v, D75, 60, 'progresser')]).toEqual([v, { ouvrir: null, ambre: false }]);
    });
  });

  test('⚠️ DISCRIMINANT — sans durée déclarée, rien : la médiane montrée n’est pas une réponse', () => {
    [null, undefined, '', 0].forEach((d) => {
      expect(M.reponseDeTemps('moins', D75, d, 'progresser')).toEqual({ ouvrir: null, ambre: false });
      expect(M.reponseDeTemps('varie', D75, d, 'progresser')).toEqual({ ouvrir: null, ambre: false });
    });
  });

  test('⚠️ DISCRIMINANT — la routine qui tient dans la durée visée (ou l’égale) : rien', () => {
    expect(M.reponseDeTemps('moins', D75, 90, 'progresser')).toEqual({ ouvrir: null, ambre: false });
    expect(M.reponseDeTemps('moins', D75, 75, 'progresser')).toEqual({ ouvrir: null, ambre: false });   // l’égalité tient
    expect(M.reponseDeTemps('moins', D75, 74, 'progresser')).toEqual({ ouvrir: 74, ambre: false });
    expect(M.reponseDeTemps('varie', D75, 75, 'progresser')).toEqual({ ouvrir: null, ambre: false });
  });

  test('⚠️ DISCRIMINANT — l’estimation AFFICHÉE (arrondie à la minute) doit dépasser la durée visée : « 60 min » ne dépasse pas 60', () => {
    // 3 610 s s'écrit « Environ 60 min » : une carte « Tenir en 60 min » ou de l'ambre n'auraient pas de sens.
    expect(M.texteDureeEstimee(3610)).toMatch(/60 min/);
    ['moins', 'varie'].forEach((v) => {
      expect(M.reponseDeTemps(v, 3610, 60, 'progresser')).toEqual({ ouvrir: null, ambre: false });
      expect(M.reponseDeTemps(v, 3629, 60, 'progresser')).toEqual({ ouvrir: null, ambre: false });
    });
    // 3 630 s s'écrit « Environ 61 min » : là, oui.
    expect(M.texteDureeEstimee(3630)).toMatch(/61 min/);
    expect(M.reponseDeTemps('moins', 3630, 60, 'progresser')).toEqual({ ouvrir: 60, ambre: false });
    expect(M.reponseDeTemps('varie', 3630, 60, 'progresser')).toEqual({ ouvrir: null, ambre: true });
  });

  test('une durée déclarée hors des bornes de la base (9, 301, 59,5) n’est pas une cible', () => {
    [9, 301, 59.5, -60, 'x'].forEach((d) => {
      expect(M.reponseDeTemps('moins', 400 * MIN, d, 'progresser')).toEqual({ ouvrir: null, ambre: false });
    });
  });

  test('⚠️ DISCRIMINANT — « Juste un carnet » : le coach ne propose rien, ni carte ni couleur', () => {
    expect(M.reponseDeTemps('moins', D75, 60, 'entretien')).toEqual({ ouvrir: null, ambre: false });
    expect(M.reponseDeTemps('varie', D75, 60, 'entretien')).toEqual({ ouvrir: null, ambre: false });
    expect(M.reponseDeTemps('moins', D75, 60, null)).toEqual({ ouvrir: 60, ambre: false });
  });

  test('une durée déclarée en texte numérique (un cache) se lit comme un nombre', () => {
    expect(M.reponseDeTemps('moins', D75, '60', 'progresser')).toEqual({ ouvrir: 60, ambre: false });
  });
});

// ── 2. app.js : l'estimation et la carte d'office ───────────────────────────
describe('§9.18 — app.js, rejoué', () => {
  const CAT = { a: { mesure: 'charge_reps', muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps', 'deltoide_anterieur'] },
                b: { mesure: 'charge_reps', muscles_primaires: ['dos'], muscles_secondaires: [] } };
  const lignes = (n, ch) => Array.from({ length: n + (ch || 0) }, (_, k) => ({ type_serie: k < (ch || 0) ? 'echauffement' : 'travail', reps: 8 }));
  const ROUTINE = { id: 'r1', nom: 'Jeudi', exercices: [
    { id: 'x', exercise_slug: 'a', series: lignes(6, 3), repos_cible_s: 240, groupe_superset: null },
    { id: 'y', exercise_slug: 'b', series: lignes(6), repos_cible_s: 240, groupe_superset: null },
    { id: 'z', exercise_slug: 'b', series: lignes(5), repos_cible_s: 180, groupe_superset: null }] };
  const AUTRE = Object.assign({}, ROUTINE, { id: 'r2', nom: 'Samedi' });
  const COURTE = { id: 'r3', nom: 'Court', exercices: [{ id: 'k', exercise_slug: 'a', series: lignes(2), repos_cible_s: 60, groupe_superset: null }] };
  const DUREE_S = M.dureeEstimee(M.structureDeRoutine(ROUTINE.exercices, CAT));

  function stockage(o) {
    const opt = o || {};
    const m = {};
    return {
      m,
      getItem: (k) => { if (opt.refuse) throw new Error('refusé'); return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: (k, v) => { if (opt.refuse || opt.refuseEcriture) throw new Error('refusé'); m[k] = String(v); }
    };
  }

  function bac(o) {
    const opt = o || {};
    const journal = { cartes: [], voiles: 0, allegee: !!opt.allegee };
    const ctx = {
      Moteur: Object.assign({}, M, { periodeAllegee: () => (opt.allegee ? { debut: '2026-10-01', fin: '2026-10-09' } : null) }),
      profil: Object.prototype.hasOwnProperty.call(opt, 'profil') ? opt.profil
        : { duree_seance_min: 60, temps_reponse: 'moins', intention: 'progresser' },
      local: { blocs: [] }, parisEscalierConnus: () => [], finsAllegeesConnues: () => [],
      catalogueIndexe: () => CAT,
      racine: { localStorage: opt.stockage || stockage() },
      userId: () => (Object.prototype.hasOwnProperty.call(opt, 'compte') ? opt.compte : 'u1'),
      jourDuJour: () => ctx.jour,
      jour: '2026-10-08',
      $: () => ({}),
      ouvrirVoile: () => { journal.voiles++; },
      montrerCarteRaccourci: (routine, min) => { journal.cartes.push([routine.id, min]); },
      journal
    };
    vm.createContext(ctx);
    ['semaineAllegeeEnCours', 'ciblesPlusCourtes', 'tempsDeLaRoutine', 'peuDeTempsVus', 'peuDeTempsDejaVu',
      'marquerPeuDeTempsVu', 'ouvrirPeuDeTempsDOffice'].forEach((n) => vm.runInContext(extraire(n), ctx));
    vm.runInContext("var CLE_PEU_DE_TEMPS_VU = 'th-v2-peu-de-temps-vu-';", ctx);
    ctx.appel = (code) => vm.runInContext(code, ctx);
    return ctx;
  }

  test('prémisse : la routine du jeudi dure plus de 60 min (sinon rien ne prouve rien)', () => {
    expect(DUREE_S).toBeGreaterThan(60 * MIN);
  });

  test('⚠️ DISCRIMINANT — `tempsDeLaRoutine` porte `ouvrir` (« moins ») ou `ambre` (« varie »), jamais les deux', () => {
    const moins = bac({ profil: { duree_seance_min: 60, temps_reponse: 'moins', intention: 'progresser' } });
    moins.r = ROUTINE;
    const tm = moins.appel('tempsDeLaRoutine(r)');
    expect([tm.ouvrir, tm.ambre, tm.peuDeTemps]).toEqual([60, false, true]);
    const varie = bac({ profil: { duree_seance_min: 60, temps_reponse: 'varie', intention: 'progresser' } });
    varie.r = ROUTINE;
    const tv = varie.appel('tempsDeLaRoutine(r)');
    expect([tv.ouvrir, tv.ambre, tv.peuDeTemps]).toEqual([null, true, true]);
    ['max', 'marge', null].forEach((v) => {
      const c = bac({ profil: { duree_seance_min: 60, temps_reponse: v, intention: 'progresser' } });
      c.r = ROUTINE;
      const t = c.appel('tempsDeLaRoutine(r)');
      expect([v, t.ouvrir, t.ambre]).toEqual([v, null, false]);
    });
  });

  test('l’estimation et le geste « J’ai peu de temps » restent ce qu’ils étaient', () => {
    const c = bac();
    c.r = ROUTINE;
    const t = c.appel('tempsDeLaRoutine(r)');
    expect(t.texte).toBe(M.texteDureeEstimee(DUREE_S));
    expect(t.peuDeTemps).toBe(true);
  });

  test('sans profil (pas encore chargé) : l’estimation, aucune réponse de temps, sans erreur', () => {
    const c = bac({ profil: null });
    c.r = ROUTINE;
    const t = c.appel('tempsDeLaRoutine(r)');
    expect([t.ouvrir, t.ambre, t.peuDeTemps]).toEqual([null, false, true]);
    expect(c.appel('ouvrirPeuDeTempsDOffice(r)')).toBe(false);
  });

  test('⚠️ DISCRIMINANT — « moins » : le « Démarrer » ouvre la carte à la durée visée (60 min), et la séance ne démarre pas', () => {
    const c = bac();
    c.r = ROUTINE;
    expect(c.appel('ouvrirPeuDeTempsDOffice(r)')).toBe(true);
    expect(c.journal.cartes).toEqual([['r1', 60]]);
    expect(c.journal.voiles).toBe(1);
  });

  test('⚠️ DISCRIMINANT — UNE fois par routine et par jour : le second « Démarrer » du jour passe, une AUTRE routine ouvre la sienne', () => {
    const c = bac();
    c.r = ROUTINE; c.s = AUTRE;
    expect(c.appel('ouvrirPeuDeTempsDOffice(r)')).toBe(true);
    expect(c.appel('ouvrirPeuDeTempsDOffice(r)')).toBe(false);
    expect(c.appel('ouvrirPeuDeTempsDOffice(r)')).toBe(false);
    expect(c.appel('ouvrirPeuDeTempsDOffice(s)')).toBe(true);
    expect(c.appel('ouvrirPeuDeTempsDOffice(s)')).toBe(false);
    expect(c.journal.cartes).toEqual([['r1', 60], ['r2', 60]]);
  });

  test('le lendemain, elle se rouvre — et la clé ne garde que le jour courant', () => {
    const st = stockage();
    const c = bac({ stockage: st });
    c.r = ROUTINE; c.s = AUTRE;
    c.appel('ouvrirPeuDeTempsDOffice(r)');
    c.appel('ouvrirPeuDeTempsDOffice(s)');
    expect(JSON.parse(st.m['th-v2-peu-de-temps-vu-u1'])).toEqual({ r1: '2026-10-08', r2: '2026-10-08' });
    c.jour = '2026-10-09';
    expect(c.appel('ouvrirPeuDeTempsDOffice(r)')).toBe(true);
    expect(JSON.parse(st.m['th-v2-peu-de-temps-vu-u1'])).toEqual({ r1: '2026-10-09' });   // les jours passés partent
    expect(c.journal.cartes).toHaveLength(3);
  });

  test('la mémoire est PAR COMPTE, dans le préfixe que « Quitter » efface', () => {
    const st = stockage();
    const a = bac({ stockage: st, compte: 'u1' });
    a.r = ROUTINE;
    a.appel('ouvrirPeuDeTempsDOffice(r)');
    const b = bac({ stockage: st, compte: 'u2' });
    b.r = ROUTINE;
    expect(b.appel('ouvrirPeuDeTempsDOffice(r)')).toBe(true);        // un autre compte la voit
    expect(Object.keys(st.m).sort()).toEqual(['th-v2-peu-de-temps-vu-u1', 'th-v2-peu-de-temps-vu-u2']);
    expect(Object.keys(st.m).every((k) => k.indexOf('th-v2') === 0)).toBe(true);
  });

  test('⚠️ DISCRIMINANT — stockage refusé (en lecture, ou en ÉCRITURE seule : quota), clé illisible, ou pas de compte : « déjà vu », elle ne s’ouvre pas', () => {
    const refuse = bac({ stockage: stockage({ refuse: true }) });
    refuse.r = ROUTINE;
    expect(refuse.appel('ouvrirPeuDeTempsDOffice(r)')).toBe(false);
    // Lecture permise, écriture refusée : la marque ne se pose pas — sans ce garde, la carte
    // s'ouvrirait à CHAQUE « Démarrer » (la lecture suivante ne la verrait jamais « vue »).
    const ecriture = bac({ stockage: stockage({ refuseEcriture: true }) });
    ecriture.r = ROUTINE;
    expect(ecriture.appel('ouvrirPeuDeTempsDOffice(r)')).toBe(false);
    expect(ecriture.appel('ouvrirPeuDeTempsDOffice(r)')).toBe(false);
    expect(ecriture.journal.voiles).toBe(0);
    const st = stockage();
    st.m['th-v2-peu-de-temps-vu-u1'] = '{pas du json';
    const illisible = bac({ stockage: st });
    illisible.r = ROUTINE;
    expect(illisible.appel('ouvrirPeuDeTempsDOffice(r)')).toBe(false);
    const tableau = stockage();
    tableau.m['th-v2-peu-de-temps-vu-u1'] = '[1,2]';
    const mal = bac({ stockage: tableau });
    mal.r = ROUTINE;
    expect(mal.appel('ouvrirPeuDeTempsDOffice(r)')).toBe(false);
    const sansCompte = bac({ compte: null });
    sansCompte.r = ROUTINE;
    expect(sansCompte.appel('ouvrirPeuDeTempsDOffice(r)')).toBe(false);
    [refuse, ecriture, illisible, mal, sansCompte].forEach((c) => expect(c.journal.cartes).toEqual([]));
  });

  test('⚠️ DISCRIMINANT — rien à faire : « varie », « marge », « max », sans durée déclarée, routine qui tient, semaine allégée, carnet', () => {
    const cas = [
      ['varie', { duree_seance_min: 60, temps_reponse: 'varie', intention: 'progresser' }, ROUTINE, false],
      ['marge', { duree_seance_min: 60, temps_reponse: 'marge', intention: 'progresser' }, ROUTINE, false],
      ['max', { duree_seance_min: 60, temps_reponse: 'max', intention: 'progresser' }, ROUTINE, false],
      ['sans durée déclarée', { duree_seance_min: null, temps_reponse: 'moins', intention: 'progresser' }, ROUTINE, false],
      ['la routine tient', { duree_seance_min: 180, temps_reponse: 'moins', intention: 'progresser' }, ROUTINE, false],
      ['routine courte', { duree_seance_min: 60, temps_reponse: 'moins', intention: 'progresser' }, COURTE, false],
      ['semaine allégée', { duree_seance_min: 60, temps_reponse: 'moins', intention: 'progresser' }, ROUTINE, true],
      ['« Juste un carnet »', { duree_seance_min: 60, temps_reponse: 'moins', intention: 'entretien' }, ROUTINE, false]
    ];
    cas.forEach(([nom, profil, routine, allegee]) => {
      const c = bac({ profil, allegee });
      c.r = routine;
      expect([nom, c.appel('ouvrirPeuDeTempsDOffice(r)')]).toEqual([nom, false]);
      expect([nom, c.journal.cartes]).toEqual([nom, []]);
    });
  });

  test('une carte qui ne s’ouvre pas ne consomme pas le « une fois par jour »', () => {
    const st = stockage();
    const c = bac({ stockage: st, profil: { duree_seance_min: 60, temps_reponse: 'varie', intention: 'progresser' } });
    c.r = ROUTINE;
    c.appel('ouvrirPeuDeTempsDOffice(r)');
    expect(st.m).toEqual({});
  });

  test('GARDE — `surDemarrer` ouvre la carte AVANT de démarrer, et ne démarre pas quand elle s’est ouverte', () => {
    expect(extraire('rendreSaisie')).toMatch(/if \(r && ouvrirPeuDeTempsDOffice\(r\)\) return;\s*demarrerSeance\(r\);/);
  });

  test('le rendu n’ouvre rien et n’écrit rien : `tempsDeLaRoutine` reste pur', () => {
    const st = stockage();
    const c = bac({ stockage: st });
    c.r = ROUTINE;
    c.appel('tempsDeLaRoutine(r)');
    c.appel('tempsDeLaRoutine(r)');
    expect(st.m).toEqual({});
    expect(c.journal.cartes).toEqual([]);
    expect(c.journal.voiles).toBe(0);
  });
});

// ── 3. Le rendu de l'ambre ──────────────────────────────────────────────────
describe('§9.18 — « Ça varie » : l’estimation en couleur du coach', () => {
  const Rendu = () => window.THRendu;
  const L = (o) => Object.assign({ type_serie: 'travail', reps: 8, charge_kg: null, duree_s: null, distance_m: null }, o || {});
  const ROUTINE = { id: 'r1', nom: 'Push', exercices: [{ id: 'e', exercise_slug: 'a', rang: 0, repos_cible_s: 90, note: null,
    groupe_superset: null, series: [L(), L(), L()] }] };
  const rangee = (temps) => {
    const cible = document.createElement('div');
    Rendu().rendreListeRoutines(cible, [ROUTINE], {
      catalogue: [{ slug: 'a', nom: 'Couché', mesure: 'charge_reps', muscles_primaires: ['pectoraux'] }],
      surChoix: () => {}, surDemarrer: () => {}, temps: () => temps, surPeuDeTemps: () => {}
    });
    return cible;
  };

  test('⚠️ DISCRIMINANT — `ambre` : la durée prend la classe `depasse` ; sans, la classe d’avant', () => {
    const avec = rangee({ texte: 'Environ 75 min (estimation)', peuDeTemps: true, ambre: true });
    expect(avec.querySelector('.routine-duree').classList.contains('depasse')).toBe(true);
    expect(avec.querySelector('.routine-duree').textContent).toBe('Environ 75 min (estimation)');
    const sans = rangee({ texte: 'Environ 75 min (estimation)', peuDeTemps: true });
    expect(sans.querySelector('.routine-duree').className).toBe('routine-duree');
    const faux = rangee({ texte: 'Environ 75 min (estimation)', peuDeTemps: true, ambre: false });
    expect(faux.querySelector('.routine-duree').className).toBe('routine-duree');
  });

  test('le jeton est l’ambre de la forge (`--accent`), aucune couleur nouvelle', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../v2/styles.css'), 'utf8');
    expect(css).toMatch(/\.routine-duree\.depasse\{color:var\(--accent\)\}/);
    expect(css).not.toMatch(/\.routine-duree\.depasse\{[^}]*#[0-9a-f]{3,6}/i);
  });
});

// ── 4. L'écran 7 du questionnaire ───────────────────────────────────────────
describe('§9.18 — les sous-lignes de l’écran « Temps et matériel »', () => {
  test('⚠️ « Ça varie » ne promet plus une question ; « Moins » promet des séances plus courtes', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../v2/js/questionnaire.js'), 'utf8');
    expect(src).toContain("varie: 'Je te montrerai la durée des longues séances'");
    expect(src).toContain("moins: 'Je te proposerai des séances plus courtes'");
    expect(src).not.toContain('Je te demanderai ton temps');
    expect(Q).toBeDefined();
  });
});
