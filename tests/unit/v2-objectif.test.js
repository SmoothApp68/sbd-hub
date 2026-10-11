/**
 * @jest-environment jsdom
 */
//
// 60-2b — L'OBJECTIF DU QUESTIONNAIRE A SES LECTEURS (MOTEUR §9.16 et §9.22).
//
//   · la zone PROPOSÉE du premier bloc d'un programme suit l'objectif (Force,
//     Les deux → Lourd ; Muscle, Forme, vide → Mix), toujours modifiable ; le
//     bloc suivant garde sa règle fixe ;
//   · l'objectif est une entrée du plan, GELÉE pour la séance avec la phase, et
//     entre dans le fondement de chaque pari (invariant I40) ;
//   · il ne change AUCUNE consigne : même plan, objectif différent → mêmes
//     lignes, seuls les fondements diffèrent.
//
// ⚠️ `ouvrirProgramme`, `objectifDeLaSeance` et `pariDeMarche` se REJOUENT dans
// un bac `vm` (les fonctions d'`app.js`, extraites) : un test qui chercherait
// leur texte ne verrait pas une branche morte.

process.env.TZ = 'Europe/Paris';

const vm = require('vm');
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/rendu.js');
const Profil = require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const { extraire } = require('./aide-profil-ecran.js');

describe('§9.22 — la zone PROPOSÉE du premier bloc suit l’objectif', () => {
  test('Force et Les deux → Lourd ; Muscle, Forme, sans réponse ou inconnu → Mix', () => {
    expect(M.zoneDuPremierBloc('force')).toBe('lourd');
    expect(M.zoneDuPremierBloc('les_deux')).toBe('lourd');
    ['muscle', 'forme', null, undefined, '', 'autre', 0].forEach((v) => {
      expect([v, M.zoneDuPremierBloc(v)]).toEqual([v, 'mix']);
    });
  });

  test('la zone proposée est toujours une zone de bloc (I37 reste vrai)', () => {
    ['force', 'muscle', 'les_deux', 'forme', null, undefined].forEach((v) => {
      expect(M.ZONES_DE_BLOC).toContain(M.zoneDuPremierBloc(v));
    });
  });

  test('le bloc SUIVANT garde sa règle fixe : Mix → Lourd → Mix, quel que soit l’objectif', () => {
    const bloc = (zone) => ({ zone, semaines: 4, exercices: ['a'] });
    expect(M.blocSuivant(bloc('mix')).zone).toBe('lourd');
    expect(M.blocSuivant(bloc('lourd')).zone).toBe('mix');
  });

  describe('`ouvrirProgramme` (app.js, rejoué)', () => {
    function bac(profil) {
      const ctx = {
        Moteur: M, Profil, profil,
        exercicesDuDossier: () => ['squat_barre'],
        catalogueIndexe: () => ({}),
        rendreFeuilleProgramme: () => {}, ouvrirVoile: () => {}, $: () => ({}),
        programmeEnCours: null
      };
      vm.createContext(ctx);
      vm.runInContext(extraire('ouvrirProgramme'), ctx);
      return { ctx, ouvrir: (dossier, depuis) => { vm.runInContext('ouvrirProgramme(d, depuis)', Object.assign(ctx, { d: dossier, depuis: depuis || null })); return ctx.programmeEnCours; } };
    }

    test.each([['force', 'lourd'], ['les_deux', 'lourd'], ['muscle', 'mix'], ['forme', 'mix'], [null, 'mix']])(
      '⚠️ DISCRIMINANT — premier bloc, objectif %s → la feuille propose %s', (objectif, zone) => {
        expect(bac({ objectif }).ouvrir('Force').zone).toBe(zone);
      });

    test('sans profil lu (null), la zone proposée reste Mix', () => {
      expect(bac(null).ouvrir('Force').zone).toBe('mix');
    });

    test('un bloc AJUSTÉ (`depuis`) prend la règle fixe du suivant, pas l’objectif', () => {
      const mix = { id: 'b', zone: 'mix', semaines: 4, exercices: ['squat_barre'] };
      const lourd = { id: 'b', zone: 'lourd', semaines: 4, exercices: ['squat_barre'] };
      expect(bac({ objectif: 'force' }).ouvrir('Force', mix).zone).toBe('lourd');   // Mix → Lourd
      expect(bac({ objectif: 'force' }).ouvrir('Force', lourd).zone).toBe('mix');   // Lourd → Mix, malgré « Force »
      expect(bac({ objectif: 'muscle' }).ouvrir('Force', lourd).zone).toBe('mix');
    });

    test('la proposition reste modifiable : c’est un brouillon de la feuille, pas une décision', () => {
      const b = bac({ objectif: 'les_deux' });
      const p = b.ouvrir('Force');
      expect(p.zone).toBe('lourd');
      p.zone = 'mix';
      expect(b.ctx.programmeEnCours.zone).toBe('mix');
    });
  });
});

describe('§9.16 — l’objectif EFFECTIF et son gel (Profil)', () => {
  test('`objectifDe` : une des quatre valeurs, sinon `null` — SANS défaut (un vide est une réponse)', () => {
    ['force', 'muscle', 'les_deux', 'forme'].forEach((v) => expect(Profil.objectifDe({ objectif: v })).toBe(v));
    [null, undefined, '', 'autre', 'Force'].forEach((v) => expect([v, Profil.objectifDe({ objectif: v })]).toEqual([v, null]));
    expect(Profil.objectifDe(null)).toBe(null);
    expect(Profil.objectifDe({})).toBe(null);
  });

  test('`objectifGele` : même séance, le gel reste quoi que dise le profil', () => {
    const gel = { seanceId: 'S1', objectif: 'force' };
    expect(Profil.objectifGele(gel, 'S1', undefined, { objectif: 'muscle' })).toBe(gel);
  });

  test('une autre séance : l’objectif sauvé, sinon celui du profil maintenant', () => {
    expect(Profil.objectifGele(null, 'S2', 'forme', { objectif: 'force' })).toEqual({ seanceId: 'S2', objectif: 'forme' });
    expect(Profil.objectifGele({ seanceId: 'S1', objectif: 'force' }, 'S2', undefined, { objectif: 'muscle' }))
      .toEqual({ seanceId: 'S2', objectif: 'muscle' });
  });

  test('⚠️ DISCRIMINANT — `null` sauvé est un objectif (« sans réponse ») : il n’est PAS remplacé par celui du profil ; `undefined` oui', () => {
    expect(Profil.objectifGele(null, 'S2', null, { objectif: 'force' })).toEqual({ seanceId: 'S2', objectif: null });
    expect(Profil.objectifGele(null, 'S2', undefined, { objectif: 'force' })).toEqual({ seanceId: 'S2', objectif: 'force' });
  });

  test('une valeur sauvée inconnue retombe sur le profil', () => {
    expect(Profil.objectifGele(null, 'S2', 'zzz', { objectif: 'force' })).toEqual({ seanceId: 'S2', objectif: 'force' });
  });

  test('`phaseGelee` n’a pas bougé (son objet `{ seanceId, phase }` est figé par v2-phase)', () => {
    expect(Profil.phaseGelee(null, 'S1', 'seche', {})).toEqual({ seanceId: 'S1', phase: 'seche' });
  });

  test('GARDE — `objectifDeLaSeance` gèle l’objectif pour la séance, le profil peut changer', () => {
    const ctx = { Profil, seance: { id: 'S1' }, consignesSauvees: null, objectifGele: null, profil: { objectif: 'force' } };
    vm.createContext(ctx);
    vm.runInContext(extraire('objectifDeLaSeance'), ctx);
    expect(vm.runInContext('objectifDeLaSeance()', ctx)).toBe('force');
    ctx.profil = { objectif: 'muscle' };
    expect(vm.runInContext('objectifDeLaSeance()', ctx)).toBe('force');           // gelé
    ctx.seance = { id: 'S2' };
    expect(vm.runInContext('objectifDeLaSeance()', ctx)).toBe('muscle');          // la séance suivante
    ctx.seance = null;
    expect(vm.runInContext('objectifDeLaSeance()', ctx)).toBe(null);              // hors séance
  });

  test('au rechargement, l’objectif gelé relu du disque l’emporte sur le profil — `null` compris', () => {
    const ctx = { Profil, seance: { id: 'S1' }, consignesSauvees: { seanceId: 'S1', objectif: null }, objectifGele: null, profil: { objectif: 'force' } };
    vm.createContext(ctx);
    vm.runInContext(extraire('objectifDeLaSeance'), ctx);
    expect(vm.runInContext('objectifDeLaSeance()', ctx)).toBe(null);
    const ancien = { Profil, seance: { id: 'S1' }, consignesSauvees: { seanceId: 'S1' }, objectifGele: null, profil: { objectif: 'force' } };
    vm.createContext(ancien);
    vm.runInContext(extraire('objectifDeLaSeance'), ancien);
    expect(vm.runInContext('objectifDeLaSeance()', ancien)).toBe('force');        // séance gelée avant 60-2b
  });
});

// ── Le plan : l'objectif, entrée gelée, dans le fondement de chaque pari ─────────
const DEBUT = '2026-10-08T10:00:00+00:00';
const C = { etat: 'progression', zone: 'force', palier: 125, niveau: 5, n: 3,
  ligne: { charge: 125, vise: 5 }, haut: null, fondement: {} };

function seanceDe() {
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'couche', id, { series: 3 });
  return se;
}
const entreesDe = (se, objectif, paris) => ({
  seance: { id: 'S1', debut: DEBUT, edition: false, exercices: se.exercices },
  consignes: { couche: { consigne: C, libelles: M.libellesConsigne(C) } },
  reglage: 'normal', paris: paris || [], suites: {}, phase: 'maintien', objectif: objectif
});
const valider = (se, j, kg, reps) => S.valider(S.modifierSerie(se, 0, j, { charge_kg: kg, reps: reps }), 0, j, new Date(DEBUT));

describe('§9.16 — l’objectif, entrée du plan, dans le fondement de CHAQUE pari', () => {
  test('le plan reçoit l’objectif et l’écrit dans le fondement de CHAQUE pari', () => {
    ['force', 'muscle', 'les_deux', 'forme'].forEach((o) => {
      const e = entreesDe(seanceDe(), o);
      const p = T.planDeSeance(e);
      const paris = p.exercices[0].paris.filter(Boolean);
      expect(p.objectif).toBe(o);
      expect(paris.length).toBe(3);
      paris.forEach((q) => expect(q.fondement.objectif).toBe(o));
      expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    });
  });

  test('⚠️ DISCRIMINANT — sans réponse, vide ou inconnu : `null`, SANS défaut, et la clé est BIEN écrite', () => {
    [null, undefined, '', 'autre'].forEach((v) => {
      const e = entreesDe(seanceDe(), v);
      const p = T.planDeSeance(e);
      expect(p.objectif).toBe(null);
      p.exercices[0].paris.filter(Boolean).forEach((q) => {
        expect(Object.prototype.hasOwnProperty.call(q.fondement, 'objectif')).toBe(true);
        expect(q.fondement.objectif).toBe(null);
      });
      expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    });
  });

  test('⚠️ DISCRIMINANT — l’objectif ne change AUCUNE consigne : mêmes lignes, même message, même en-tête, même réaction ; seuls les fondements diffèrent', () => {
    let se = seanceDe();
    se = valider(se, 0, 125, 8);
    const a = T.planDeSeance(entreesDe(se, 'force')).exercices[0];
    const b = T.planDeSeance(entreesDe(se, 'forme')).exercices[0];
    const c = T.planDeSeance(entreesDe(se, null)).exercices[0];
    [b, c].forEach((x) => {
      expect(a.lignes).toEqual(x.lignes);
      expect(a.message).toEqual(x.message);
      expect(a.entete).toEqual(x.entete);
      expect(a.consigne).toEqual(x.consigne);
      expect(a.planInitial).toEqual(x.planInitial);
      expect(a.reaction).toEqual(x.reaction);
      expect(a.phrases).toEqual(x.phrases);
    });
    const sans = (q) => (q ? Object.assign({}, q, { fondement: Object.assign({}, q.fondement, { objectif: 'x' }) }) : q);
    expect(a.paris.map(sans)).toEqual(b.paris.map(sans));
    expect(a.paris.filter(Boolean).map((q) => q.fondement.objectif)).toEqual(['force', 'force', 'force']);
  });

  test('tout le plan est identique à l’objectif près (aucune autre clé n’en dépend)', () => {
    const se = valider(seanceDe(), 0, 125, 8);
    const norm = (p) => JSON.stringify(p, (k, v) => (k === 'objectif' ? undefined : v));
    expect(norm(T.planDeSeance(entreesDe(se, 'force')))).toBe(norm(T.planDeSeance(entreesDe(se, 'muscle'))));
  });

  test('`rejouer` ne le passe pas : le fondement des cas du simulateur reste sans clé, comme pour la phase', () => {
    const e = entreesDe(seanceDe(), 'force');
    const r = T.rejouer ? T.rejouer(e) : null;
    if (r && r.exercices) {
      r.exercices.forEach((x) => (x.paris || []).filter(Boolean).forEach((q) => {
        expect(Object.prototype.hasOwnProperty.call(q.fondement, 'objectif')).toBe(false);
      }));
    }
  });

  test('un objectif qui change PENDANT la séance ne se voit pas dans les paris déjà posés : le plan suit ce qu’on lui donne (gelé par l’app)', () => {
    let se = seanceDe();
    const q = T.planDeSeance(entreesDe(se, 'force')).exercices[0].paris[0];
    se = valider(se, 0, 125, 5);
    const pose = Object.assign({}, q, { id: 'p0', set_observe: se.exercices[0].series[0].id });
    const e = entreesDe(se, 'force', [pose]);
    expect(T.verifierPlan(T.planDeSeance(e), e).erreurs).toEqual([]);
  });
});

describe('I40 — les violations forgées sont attrapées', () => {
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const base = (objectif) => {
    const e = entreesDe(seanceDe(), objectif === undefined ? 'force' : objectif);
    return { e, p: T.planDeSeance(e) };
  };

  test('le plan d’origine est propre, avec un objectif comme sans', () => {
    ['force', null].forEach((o) => {
      const { e, p } = base(o);
      expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    });
  });

  test('un pari sans objectif (la clé manque)', () => {
    const { p } = base();
    const f = clone(p);
    delete f.exercices[0].paris[1].fondement.objectif;
    expect(T.verifierPlan(f).erreurs.join('\n')).toMatch(/^I40 — .*un pari sans objectif/m);
  });

  test('⚠️ DISCRIMINANT — la clé manque sur un plan « sans réponse » : `undefined` ne passe pas pour `null`', () => {
    const { p } = base(null);
    const f = clone(p);
    delete f.exercices[0].paris[0].fondement.objectif;
    expect(T.verifierPlan(f).erreurs.join('\n')).toMatch(/^I40 — .*un pari sans objectif/m);
  });

  test('une séance à deux objectifs (un pari à un autre objectif)', () => {
    const { p } = base();
    const f = clone(p);
    f.exercices[0].paris[2].fondement.objectif = 'muscle';
    expect(T.verifierPlan(f).erreurs.join('\n')).toMatch(/^I40 — .*à l'objectif muscle dans une séance à force/m);
  });

  test('un pari « sans réponse » dans une séance qui a un objectif', () => {
    const { p } = base();
    const f = clone(p);
    f.exercices[0].paris[0].fondement.objectif = null;
    expect(T.verifierPlan(f).erreurs.join('\n')).toMatch(/^I40 — .*à l'objectif null dans une séance à force/m);
  });

  test('un pari déjà posé à un autre objectif que celui du plan', () => {
    let se = seanceDe();
    const q = T.planDeSeance(entreesDe(se, 'force')).exercices[0].paris[0];
    se = valider(se, 0, 125, 5);
    const pose = Object.assign({}, q, { id: 'p0', set_observe: se.exercices[0].series[0].id });
    const e = entreesDe(se, 'muscle', [pose]);
    expect(T.verifierPlan(T.planDeSeance(e), e).erreurs.join('\n')).toMatch(/^I40 — pari posé .*force dans une séance à muscle/m);
  });

  test('⚠️ DISCRIMINANT — en ÉDITION, les paris déjà posés ne se comparent pas : une séance terminée avant 60-2b n\'en porte pas la clé', () => {
    let se = seanceDe();
    const q = T.planDeSeance(entreesDe(se, 'force')).exercices[0].paris[0];
    se = valider(se, 0, 125, 5);
    const sansCle = JSON.parse(JSON.stringify(q));
    delete sansCle.fondement.objectif;
    const poses = [Object.assign({}, sansCle, { id: 'p0', set_observe: se.exercices[0].series[0].id }),
      Object.assign({}, q, { id: 'p1', set_observe: se.exercices[0].series[0].id })];
    const verifier = (edition) => {
      const e = entreesDe(se, 'muscle', poses);
      e.seance.edition = edition;
      return T.verifierPlan(T.planDeSeance(e), e).erreurs.filter((m) => /^I40/.test(m));
    };
    expect(verifier(true)).toEqual([]);
    // Même état hors édition : la garde parle (sans clé, et à un autre objectif).
    const hors = verifier(false).join('\n');
    expect(hors).toMatch(/un pari sans objectif/);
    expect(hors).toMatch(/force dans une séance à muscle/);
  });

  test('un objectif de plan absent ou inconnu', () => {
    const { p } = base();
    const f = clone(p);
    delete f.objectif;
    expect(T.verifierPlan(f).erreurs.join('\n')).toMatch(/^I40 — l'objectif du plan est absent ou inconnu/m);
    f.objectif = 'zzz';
    expect(T.verifierPlan(f).erreurs.join('\n')).toMatch(/^I40 — l'objectif du plan est absent ou inconnu \(zzz\)/m);
  });
});

describe('Les paris de l’escalier portent l’objectif gelé (jumeau de la phase)', () => {
  function bac() {
    const ctx = { Moteur: M, VERSION_ESCALIER: '1', sessionActive: { user: { id: 'u' } },
      seance: { id: 'S1', debut: DEBUT } };
    vm.createContext(ctx);
    vm.runInContext(extraire('pariDeMarche'), ctx);
    return ctx;
  }

  test('`pariDeMarche` écrit la phase ET l’objectif du plan dans le fondement', () => {
    const ctx = bac();
    ctx.x = { slug: 'couche', escalier: { compteur: 3, n: 5, zone: 'lourd' } };
    ctx.plan = { phase: 'seche', objectif: 'les_deux' };
    const pari = vm.runInContext("pariDeMarche('id', x, 'schema', 'acceptee', plan, { nouvelle_zone: 'mix' })", ctx);
    expect(pari.fondement.phase).toBe('seche');
    expect(pari.fondement.objectif).toBe('les_deux');
    expect(pari.fondement.nouvelle_zone).toBe('mix');
    ctx.plan = { phase: 'maintien', objectif: null };
    const sans = vm.runInContext("pariDeMarche('id', x, 'schema', 'refusee', plan)", ctx);
    expect(Object.prototype.hasOwnProperty.call(sans.fondement, 'objectif')).toBe(true);
    expect(sans.fondement.objectif).toBe(null);
  });

  test('`repondreCarte` (semaine allégée) écrit l’objectif du plan, comme la phase', () => {
    expect(extraire('repondreCarte')).toMatch(/phase: p\.phase, objectif: p\.objectif/);
  });
});

describe('Le gel est branché : `entreesDuPlan` donne l’objectif gelé, `sauverConsignes` le garde sur le disque', () => {
  test('`entreesDuPlan` passe `objectif: objectifDeLaSeance()` à côté de la phase', () => {
    expect(extraire('entreesDuPlan')).toMatch(/phase: phaseDeLaSeance\(\),[\s\S]*objectif: objectifDeLaSeance\(\)/);
  });

  test('`sauverConsignes` écrit l’objectif gelé avec la phase ; `oublierConsignes` le lâche avec elle', () => {
    expect(extraire('sauverConsignes')).toMatch(/phase: phaseDeLaSeance\(\), objectif: objectifDeLaSeance\(\)/);
    expect(extraire('oublierConsignes')).toMatch(/phaseGelee = null;\s*objectifGele = null;/);
  });

  // 68A l'a montée à 11 (l'élan, MOTEUR §9.14 bis), 68B à 12 (« à fond », §9.14 ter) :
  // ce chantier-ci ne la touchait pas.
  test('`VERSION_CONSIGNE` ne bouge pas : aucune règle de consigne ne change', () => {
    expect(M.VERSION_CONSIGNE).toBe(12);
  });
});
