/** @jest-environment node */
//
// 60-2a (commit 4) — « JUSTE UN CARNET » ÉTEINT AUSSI LE BADGE ET LA CARTE DE FIN DE BLOC.
//
// MOTEUR I13, précisé le 07/10/2026 (#382, écart 6) : au PROFIL, le coach ne dit
// rien — ni bandeau de décharge, ni semaine allégée, ni badge de bloc, ni carte
// de fin de bloc. Les deux derniers vivent hors de `planDeSeance` (la
// bibliothèque les montre) : ils lisent donc LE MÊME fait que le plan,
// `Moteur.coachSeTait`, jamais un second test de `intention` écrit à la main
// (la garde d'architecture le refuse : `tests/unit/v2-architecture.test.js`).
//
// ⚠️ `programmeDuDossier`, `programmeDuDossierCalcule` et `semaineAllegeeEnCours`
// se REJOUENT dans un bac `vm` (les fonctions d'`app.js`, extraites, avec le vrai
// moteur) : un test qui chercherait leur TEXTE ne verrait pas une branche morte.

process.env.TZ = 'Europe/Paris';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
require('../../v2/js/seance.js');
const Plan = require('../../v2/js/plan.js');

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const extraire = (nom) => {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable : ' + nom);
  return m[0];
};
const norm = (t) => String(t).replace(/[  ]/g, ' ');

describe('60-2a — `Moteur.coachSeTait` : le fait, une seule fois', () => {
  test('vrai pour l’intention Entretenir du PROFIL, faux pour tout le reste', () => {
    expect(M.coachSeTait('entretien')).toBe(true);
    ['progresser', null, undefined, '', 'autre', 0].forEach((v) => expect([v, M.coachSeTait(v)]).toEqual([v, false]));
  });

  test('il est celui du plan : `intentionDe` du profil seul, sans le mode d’un exercice', () => {
    ['entretien', 'progresser', null].forEach((v) => {
      expect(M.coachSeTait(v)).toBe(M.intentionDe(v, null) === 'entretien');
    });
    // L'Entretenir d'UN exercice n'est pas le silence du profil.
    expect(M.intentionDe('progresser', 'entretien')).toBe('entretien');
    expect(M.coachSeTait('progresser')).toBe(false);
  });
});

describe('60-2a — I13 sur la bibliothèque : `verifierSilenceDuProgramme`', () => {
  test('⚠️ DISCRIMINANT — en carnet, un badge ou une carte est une violation d’I13', () => {
    expect(Plan.verifierSilenceDuProgramme('entretien', { badge: 'Bloc Mix · semaine 2 sur 4' }))
      .toEqual(['I13 — Entretenir (profil) : un badge de bloc (Bloc Mix · semaine 2 sur 4)']);
    expect(Plan.verifierSilenceDuProgramme('entretien', { fin: { titre: 'x' } }))
      .toEqual(['I13 — Entretenir (profil) : une carte de fin de bloc']);
    expect(Plan.verifierSilenceDuProgramme('entretien', { badge: 'Bloc Mix terminé', fin: { titre: 'x' } })).toHaveLength(2);
  });

  test('en carnet, rien n’est une violation : une vue vide, nulle, ou « Faire de ce dossier un programme »', () => {
    expect(Plan.verifierSilenceDuProgramme('entretien', {})).toEqual([]);
    expect(Plan.verifierSilenceDuProgramme('entretien', null)).toEqual([]);
    expect(Plan.verifierSilenceDuProgramme('entretien', { creer: true })).toEqual([]);
  });

  test('en Progresser (ou profil inconnu), le badge et la carte sont la règle, pas une faute', () => {
    expect(Plan.verifierSilenceDuProgramme('progresser', { badge: 'Bloc Mix terminé', fin: { titre: 'x' } })).toEqual([]);
    expect(Plan.verifierSilenceDuProgramme(null, { badge: 'Bloc Mix terminé' })).toEqual([]);
  });
});

describe('60-2a — la garde de développement voit la bibliothèque', () => {
  function garde(hote) {
    const journal = { erreurs: [], error: (...a) => journal.erreurs.push(a) };
    const marques = [];
    const g = Plan.creerGarde({ location: { hostname: hote, search: '' }, stockage: null, journal,
      marquer: (v) => marques.push(v) });
    return { g, journal, marques };
  }

  test('⚠️ hors production, une violation s’écrit en console et se marque à l’écran', () => {
    const { g, journal, marques } = garde('localhost');
    const r = g.verifierProgramme('entretien', 'Force', { badge: 'Bloc Mix terminé', fin: { titre: 'x' } });
    expect(r.violations).toHaveLength(2);
    expect(journal.erreurs).toHaveLength(1);
    expect(marques).toHaveLength(1);
    expect(g.etat().violations).toHaveLength(2);
  });

  test('une vue conforme ne dit rien', () => {
    const { g, journal, marques } = garde('localhost');
    expect(g.verifierProgramme('entretien', 'Force', {}).violations).toEqual([]);
    expect(g.verifierProgramme('progresser', 'Force', { badge: 'Bloc Mix terminé' }).violations).toEqual([]);
    expect(journal.erreurs).toEqual([]);
    expect(marques).toEqual([]);
  });

  test('EN PRODUCTION, rien : ni calcul ni console ni marqueur', () => {
    const { g, journal, marques } = garde('sbd-hub.pages.dev');
    expect(g.verifierProgramme('entretien', 'Force', { badge: 'Bloc Mix terminé' })).toBe(null);
    expect(journal.erreurs).toEqual([]);
    expect(marques).toEqual([]);
  });
});

// ── La bibliothèque, rejouée : les vraies fonctions d'`app.js`, le vrai moteur ──
describe('60-2a — `programmeDuDossier` : programme en cours, profil en carnet → ni badge ni carte', () => {
  const BLOC = { id: 'b1', user_id: 'u', dossier: 'Force', zone: 'mix', debut: '2026-10-12', semaines: 4, decharge: true,
    exercices: ['squat_barre', 'developpe_couche_barre'], statut: 'en_cours', precedent: null };

  function bac(o) {
    const releve = { ecritures: 0, garde: [] };
    const interdit = () => { releve.ecritures += 1; throw new Error('écriture'); };
    const ctx = {
      Moteur: M, Date, Object, JSON,
      profil: o.profil,
      local: { blocs: [BLOC], modes: o.modes || [] },
      jourDuJour: () => o.jour,
      exercicesDuDossier: () => ['squat_barre'],
      bilanDe: (b) => M.bilanDuBloc(b, {}, []),
      pariDuBloc: () => null,
      nomsDuCatalogue: () => ({}),
      garde: { verifierProgramme: (intention, dossier, vue) => { releve.garde.push([intention, dossier, vue]); } },
      // Tout ce qui écrit casse : la bibliothèque LIT.
      poserBloc: interdit, poserLignesDeZone: interdit, poserPariDeProgramme: interdit, poser: interdit, ecrireProfil: interdit
    };
    vm.createContext(ctx);
    ['programmeDuDossier', 'programmeDuDossierCalcule'].forEach((f) => vm.runInContext(extraire(f), ctx));
    return { ctx, releve, vue: (d) => vm.runInContext('programmeDuDossier(' + JSON.stringify(d) + ')', ctx) };
  }

  test('en Progresser, pendant le bloc : le badge, pas de carte', () => {
    const b = bac({ profil: { intention: 'progresser' }, jour: '2026-10-19' });
    const v = b.vue('Force');
    expect(norm(v.badge)).toBe('Bloc Mix · semaine 2 sur 4');
    expect(v.fin).toBeUndefined();
  });

  test('en Progresser, le bloc fini : le badge « terminé » ET la carte de fin', () => {
    const b = bac({ profil: { intention: 'progresser' }, jour: '2026-11-12' });
    const v = b.vue('Force');
    expect(norm(v.badge)).toBe('Bloc Mix terminé');
    expect(norm(v.fin.titre)).toBe('Ton bloc Mix est terminé.');
  });

  test.each([['pendant le bloc', '2026-10-19'], ['le bloc fini', '2026-11-12']])(
    '⚠️ DISCRIMINANT — en carnet, %s : ni badge ni carte (une vue vide, le bloc reste en cours)', (_n, jour) => {
      const b = bac({ profil: { intention: 'entretien' }, jour });
      const v = b.vue('Force');
      expect(v).toEqual({});
      expect(b.ctx.local.blocs[0].statut).toBe('en_cours');
    });

  test('⚠️ DISCRIMINANT — le retour en Progresser les ramène, identiques, SANS rien avoir écrit', () => {
    const b = bac({ profil: { intention: 'progresser' }, jour: '2026-11-12' });
    const avant = JSON.stringify(b.vue('Force'));
    const blocsAvant = JSON.stringify(b.ctx.local.blocs);
    b.ctx.profil = { intention: 'entretien' };
    expect(b.vue('Force')).toEqual({});
    b.ctx.profil = { intention: 'progresser' };
    expect(JSON.stringify(b.vue('Force'))).toBe(avant);
    expect(JSON.stringify(b.ctx.local.blocs)).toBe(blocsAvant);
    expect(b.releve.ecritures).toBe(0);
  });

  test('⚠️ DISCRIMINANT — l’Entretenir d’UN exercice n’éteint rien : ce sont des faits du programme entier', () => {
    const b = bac({ profil: { intention: 'progresser' }, jour: '2026-11-12',
      modes: [{ id: 'm1', exercise_slug: 'squat_barre', mode: 'entretien', choisi_a: '2026-10-20T10:00:00.000Z' }] });
    const v = b.vue('Force');
    expect(norm(v.badge)).toBe('Bloc Mix terminé');
    expect(v.fin).toBeTruthy();
  });

  test('un profil pas encore lu (null) ne se tait pas : on ne devine pas un silence', () => {
    const b = bac({ profil: null, jour: '2026-10-19' });
    expect(norm(b.vue('Force').badge)).toBe('Bloc Mix · semaine 2 sur 4');
  });

  test('« Faire de ce dossier un programme » reste : c’est un geste de la personne, pas une phrase du coach', () => {
    const b = bac({ profil: { intention: 'entretien' }, jour: '2026-10-19' });
    expect(b.vue('Autre')).toEqual({ creer: true });
  });

  test('la bibliothèque passe sa vue à la garde de développement — vue de carnet comprise', () => {
    const b = bac({ profil: { intention: 'entretien' }, jour: '2026-10-19' });
    b.vue('Force');
    expect(b.releve.garde).toEqual([['entretien', 'Force', {}]]);
  });

  test('« Sans dossier » (null) : rien à montrer, comme avant', () => {
    const b = bac({ profil: { intention: 'progresser' }, jour: '2026-10-19' });
    expect(b.vue(null)).toBe(null);
  });
});

describe('60-2a — `semaineAllegeeEnCours` lit le même fait', () => {
  // Une horloge fixée dans le bac : la décharge du bloc (2 → 8 nov.).
  function bac(intention) {
    const Horloge = class extends Date {
      constructor(...a) { if (a.length) super(...a); else super('2026-11-04T10:00:00.000Z'); }
    };
    const ctx = {
      Moteur: M, Date: Horloge,
      profil: { intention },
      local: { blocs: [{ id: 'b1', dossier: 'Force', zone: 'mix', debut: '2026-10-12', semaines: 4, decharge: true,
        exercices: ['squat_barre'], statut: 'en_cours' }] },
      parisEscalierConnus: () => [], finsAllegeesConnues: () => []
    };
    vm.createContext(ctx);
    vm.runInContext(extraire('semaineAllegeeEnCours'), ctx);
    return () => vm.runInContext('semaineAllegeeEnCours()', ctx);
  }

  test('⚠️ DISCRIMINANT — la décharge planifiée est une semaine allégée en Progresser, pas en carnet', () => {
    expect(bac('progresser')()).toBe(true);
    expect(bac('entretien')()).toBe(false);
  });
});
