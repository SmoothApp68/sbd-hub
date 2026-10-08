/**
 * @jest-environment jsdom
 */
//
// 49-U11 — la phase, entrée du coach (MOTEUR §9.16, delta 49-25 du 30/09/2026).
//
//   · le plan la reçoit (gelée par l'app) et l'écrit dans le fondement de
//     chaque pari ; vide ou inconnue → `maintien`, jamais vide ;
//   · gelée pour la séance : `Profil.phaseGelee` ne bouge plus pour une même
//     séance, quoi que dise le profil ; la séance suivante prend la nouvelle ;
//   · I18 attrape un pari sans phase et une séance à deux phases ;
//   · le réglage du Profil écrit `phase` et `phase_depuis` par `ecrireProfil`
//     (le chemin du rythme : local d'abord, puis la file du profil), et ces
//     deux colonnes passent la liste blanche des champs écrits.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/rendu.js');
const Profil = require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const DEBUT = '2026-09-30T10:00:00+00:00';
const C = { etat: 'progression', zone: 'force', palier: 125, niveau: 5, n: 3,
  ligne: { charge: 125, vise: 5 }, haut: null, fondement: {} };

function seanceDe() {
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'couche', id, { series: 3 });
  return se;
}
const entreesDe = (se, phase, paris) => ({
  seance: { id: 'S1', debut: DEBUT, edition: false, exercices: se.exercices },
  consignes: { couche: { consigne: C, libelles: M.libellesConsigne(C) } },
  reglage: 'normal', paris: paris || [], suites: {}, phase: phase
});
const valider = (se, j, kg, reps) => S.valider(S.modifierSerie(se, 0, j, { charge_kg: kg, reps: reps }), 0, j, new Date(DEBUT));

describe('§9.16 — la phase, entrée du plan, dans le fondement de chaque pari', () => {
  test('le plan reçoit la phase et l’écrit dans le fondement de CHAQUE pari', () => {
    const e = entreesDe(seanceDe(), 'seche');
    const p = T.planDeSeance(e);
    const paris = p.exercices[0].paris.filter(Boolean);
    expect(p.phase).toBe('seche');
    expect(paris.length).toBe(3);
    paris.forEach((q) => expect(q.fondement.phase).toBe('seche'));
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('phase vide, absente ou inconnue → `maintien`, jamais vide', () => {
    [null, undefined, '', 'recomposition'].forEach((v) => {
      const p = T.planDeSeance(entreesDe(seanceDe(), v));
      expect(p.phase).toBe('maintien');
      p.exercices[0].paris.filter(Boolean).forEach((q) => expect(q.fondement.phase).toBe('maintien'));
    });
  });

  test('les trois phases passent telles quelles', () => {
    ['prise_de_masse', 'maintien', 'seche'].forEach((v) => {
      expect(T.planDeSeance(entreesDe(seanceDe(), v)).phase).toBe(v);
    });
  });

  test('la phase ne change ni la consigne, ni les lignes, ni la réaction (§9.16 : inchangés)', () => {
    let se = seanceDe();
    se = valider(se, 0, 125, 8);
    const a = T.planDeSeance(entreesDe(se, 'seche')).exercices[0];
    const b = T.planDeSeance(entreesDe(se, 'prise_de_masse')).exercices[0];
    expect(a.lignes).toEqual(b.lignes);
    expect(a.message).toEqual(b.message);
    expect(a.entete).toEqual(b.entete);
    const sans = (q) => (q ? Object.assign({}, q, { fondement: Object.assign({}, q.fondement, { phase: 'x' }) }) : q);
    expect(a.paris.map(sans)).toEqual(b.paris.map(sans));
  });

  test('`rejouer` (les cas du simulateur) garde son fondement sans phase', () => {
    const r = T.rejouer(C, null, 3, [], {}, { slug: 'couche', seance: 'S1', reglage: 'normal' });
    r.paris.filter(Boolean).forEach((q) => expect('phase' in q.fondement).toBe(false));
  });
});

describe('§9.16 — gelée pour la séance', () => {
  test('même séance : le gel ne bouge pas quand la phase du profil change', () => {
    let g = Profil.phaseGelee(null, 'S1', null, { phase: 'seche' });
    expect(g).toEqual({ seanceId: 'S1', phase: 'seche' });
    g = Profil.phaseGelee(g, 'S1', null, { phase: 'maintien' });
    expect(g.phase).toBe('seche');
    g = Profil.phaseGelee(g, 'S1', null, { phase: null });
    expect(g.phase).toBe('seche');
  });

  test('la séance suivante prend la nouvelle phase', () => {
    const g = Profil.phaseGelee({ seanceId: 'S1', phase: 'seche' }, 'S2', null, { phase: 'maintien' });
    expect(g).toEqual({ seanceId: 'S2', phase: 'maintien' });
  });

  test('au rechargement, la phase sauvée de la séance l’emporte sur le profil', () => {
    expect(Profil.phaseGelee(null, 'S1', 'seche', { phase: 'maintien' }).phase).toBe('seche');
    // Une valeur sauvée illisible ne compte pas : le profil.
    expect(Profil.phaseGelee(null, 'S1', 'n’importe', { phase: 'prise_de_masse' }).phase).toBe('prise_de_masse');
  });

  test('DISCRIMINANT — deux paris à `seche`, la phase change, le troisième reste à `seche`', () => {
    let se = seanceDe();
    let gel = Profil.phaseGelee(null, 'S1', null, { phase: 'seche' });
    const poses = [];
    const poser = (j, kg, reps) => {
      const q = T.planDeSeance(entreesDe(se, gel.phase, poses)).exercices[0].paris[j];
      se = valider(se, j, kg, reps);
      poses.push(Object.assign({}, q, { id: 'p' + j, set_observe: se.exercices[0].series[j].id }));
    };
    poser(0, 125, 5);
    poser(1, 125, 5);
    gel = Profil.phaseGelee(gel, 'S1', null, { phase: 'maintien' });   // changée dans Profil
    poser(2, 125, 5);
    expect(poses.map((q) => q.fondement.phase)).toEqual(['seche', 'seche', 'seche']);
    const e = entreesDe(se, gel.phase, poses);
    expect(T.verifierPlan(T.planDeSeance(e), e).erreurs).toEqual([]);
  });
});

describe('I18 — les violations forgées sont attrapées', () => {
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const base = () => {
    const e = entreesDe(seanceDe(), 'seche');
    return { e, p: T.planDeSeance(e) };
  };

  test('le plan d’origine est propre', () => {
    const { e, p } = base();
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('un pari sans phase', () => {
    const { p } = base();
    const f = clone(p);
    delete f.exercices[0].paris[1].fondement.phase;
    expect(T.verifierPlan(f).erreurs.join('\n')).toMatch(/^I18 — .*un pari sans phase/m);
  });

  test('une séance à deux phases (un pari à une autre phase)', () => {
    const { p } = base();
    const f = clone(p);
    f.exercices[0].paris[2].fondement.phase = 'maintien';
    expect(T.verifierPlan(f).erreurs.join('\n')).toMatch(/^I18 — .*à la phase maintien dans une séance à seche/m);
  });

  test('un pari déjà posé à une autre phase que celle du plan', () => {
    let se = seanceDe();
    const q = T.planDeSeance(entreesDe(se, 'seche')).exercices[0].paris[0];
    se = valider(se, 0, 125, 5);
    const pose = Object.assign({}, q, { id: 'p0', set_observe: se.exercices[0].series[0].id });
    const e = entreesDe(se, 'maintien', [pose]);
    expect(T.verifierPlan(T.planDeSeance(e), e).erreurs.join('\n')).toMatch(/^I18 — pari posé .*seche dans une séance à maintien/m);
  });

  test('une phase de plan vide', () => {
    const { p } = base();
    const f = clone(p);
    f.phase = null;
    expect(T.verifierPlan(f).erreurs.join('\n')).toMatch(/^I18 — la phase du plan est vide/m);
  });
});

describe('Profil — « TA PHASE »', () => {
  const MAINTENANT = () => new Date('2026-09-30T08:15:00.000Z');
  const cible = () => { const n = document.createElement('div'); document.body.appendChild(n); return n; };
  const vue = (sec) => ({ kpis: [], sections: [sec], surQuitter: () => {}, surSupprimer: () => {} });

  test('quatre choix, « Je ne sais pas » sélectionné quand la phase est vide', () => {
    const sec = Profil.sectionPhase({ phase: null }, () => {}, MAINTENANT);
    expect(sec.segment.options.map((o) => o.libelle))
      .toEqual(['Prise de masse', 'Maintien ou recomposition', 'Sèche', 'Je ne sais pas']);
    expect(sec.segment.valeur).toBe('inconnue');
    expect(sec.aide).toBe('Ce que tu vises en ce moment. Je l’enregistre avec chaque séance.');
    // 60-2c : une phase vide ne dit pas « depuis », elle dit ce que le coach en fait.
    expect(sec.pied).toBe('Maintien (par défaut)');
    expect(sec.pied).toBe(Profil.LIBELLE_PHASE_VIDE);
  });

  test('⚠️ DISCRIMINANT (60-2c) — une phase vide n’affiche jamais « Depuis le … », même avec un `phase_depuis` ancien', () => {
    const sec = Profil.sectionPhase({ phase: null, phase_depuis: '2026-09-01T00:00:00.000Z' }, () => {}, MAINTENANT);
    expect(sec.pied).toBe('Maintien (par défaut)');
    // Une phase déclarée garde son « Depuis … ».
    expect(Profil.sectionPhase({ phase: 'seche', phase_depuis: '2026-09-01T00:00:00.000Z' }, () => {}, MAINTENANT).pied)
      .toMatch(/^Depuis /);
  });

  test('⚠️ DISCRIMINANT (60-2c) — le segment du Profil écrit EXACTEMENT ce que le questionnaire écrit (une seule préparation)', () => {
    const profils = [{}, { phase: null }, { phase: 'seche', phase_depuis: '2026-09-01T00:00:00.000Z' },
      { phase: 'maintien' }, { phase: 'prise_de_masse', phase_depuis: '2026-08-01T00:00:00.000Z' }];
    ['prise_de_masse', 'maintien', 'seche', 'inconnue'].forEach((choix) => {
      profils.forEach((p) => {
        const ecrits = [];
        Profil.sectionPhase(p, (c) => ecrits.push(c), MAINTENANT).segment.surChoix(choix);
        expect([JSON.stringify(p), choix, ecrits]).toEqual([JSON.stringify(p), choix, [Profil.preparerChamps(p, { phase: choix }, MAINTENANT())]]);
      });
    });
    // Et « Je ne sais pas » est bien le vide, au Profil comme ailleurs.
    const e = [];
    Profil.sectionPhase({ phase: 'seche' }, (c) => e.push(c), MAINTENANT).segment.surChoix('inconnue');
    expect(e[0].phase).toBeNull();
  });

  test('« Depuis le 29 sept. » sous le réglage, et Sèche sélectionnée', () => {
    const c = cible();
    window.THRendu.rendreProfil(c, vue(Profil.sectionPhase(
      { phase: 'seche', phase_depuis: '2026-09-29T09:00:00+00:00' }, () => {}, MAINTENANT)));
    expect(c.querySelector('.p-seg .on').textContent).toBe('Sèche');
    expect(c.querySelector('.p-pied').textContent.replace(/ /g, ' ')).toBe('Depuis le 29 sept.');
    expect(c.querySelector('.p-aide').textContent).toMatch(/^Ce que tu vises en ce moment/);
  });

  test('DISCRIMINANT — un toucher écrit `phase`, `phase_depuis` ET `phase_confirmee_le` (maintenant), par `ecrire`', () => {
    const ecrits = [];
    const c = cible();
    window.THRendu.rendreProfil(c, vue(Profil.sectionPhase({ phase: 'seche' }, (x) => ecrits.push(x), MAINTENANT)));
    Array.from(c.querySelectorAll('.p-seg button')).find((b) => b.textContent === 'Maintien ou recomposition').click();
    Array.from(c.querySelectorAll('.p-seg button')).find((b) => b.textContent === 'Je ne sais pas').click();
    // 60-2b : toute réponse sur la phase est une confirmation (le rappel de phase compte depuis elle).
    expect(ecrits).toEqual([
      { phase: 'maintien', phase_depuis: '2026-09-30T08:15:00.000Z', phase_confirmee_le: '2026-09-30T08:15:00.000Z' },
      { phase: null, phase_depuis: '2026-09-30T08:15:00.000Z', phase_confirmee_le: '2026-09-30T08:15:00.000Z' }
    ]);
  });

  test('`phase` et `phase_depuis` passent la liste blanche des champs écrits', () => {
    expect(Profil.champsEcrits({ phase: 'seche', phase_depuis: 'x', is_admin: true }))
      .toEqual({ phase: 'seche', phase_depuis: 'x' });
  });

  test('`phaseDe` : vide ou inconnue → maintien', () => {
    expect(Profil.phaseDe(null)).toBe('maintien');
    expect(Profil.phaseDe({ phase: null })).toBe('maintien');
    expect(Profil.phaseDe({ phase: 'seche' })).toBe('seche');
  });

  // 54-1 — LA GARDE NE LIT PLUS LE SOURCE : elle REJOUE `rendreProfilEcran`
  // et `phaseDeLaSeance` (`app.js`, dans un bac, `aide-profil-ecran.js`). La
  // section s'écrit par `ecrireProfil` (local d'abord, puis la file du profil),
  // et la phase du plan est GELÉE pour la séance. Le branchement de bout en
  // bout (profil → paris de la séance) est au banc, section [U11].
  test('GARDE — la section « TA PHASE » écrit par `ecrireProfil`', () => {
    const { profilEcran } = require('./aide-profil-ecran.js');
    const e = profilEcran({ phase: 'maintien' });
    const phase = e.section('TA PHASE');
    expect(phase).not.toBe(null);
    expect(phase.segment.valeur).toBe('maintien');
    phase.segment.surChoix('seche');
    expect(e.ecrits.map((c) => c.phase)).toEqual(['seche']);
    expect(typeof e.ecrits[0].phase_depuis).toBe('string');
  });

  test('GARDE — `phaseDeLaSeance` gèle la phase pour la séance, le profil peut changer', () => {
    const vm = require('vm');
    const { extraire } = require('./aide-profil-ecran.js');
    const ctx = { Profil, seance: { id: 'S1' }, consignesSauvees: null, phaseGelee: null,
                  profil: { phase: 'seche' } };
    vm.createContext(ctx);
    vm.runInContext(extraire('phaseDeLaSeance'), ctx);
    expect(vm.runInContext('phaseDeLaSeance()', ctx)).toBe('seche');
    ctx.profil = { phase: 'prise_de_masse' };
    expect(vm.runInContext('phaseDeLaSeance()', ctx)).toBe('seche');
    // Une autre séance lit la phase du moment.
    ctx.seance = { id: 'S2' };
    expect(vm.runInContext('phaseDeLaSeance()', ctx)).toBe('prise_de_masse');
    ctx.seance = null;
    expect(vm.runInContext('phaseDeLaSeance()', ctx)).toBe(null);
  });
});
