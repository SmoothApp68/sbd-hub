//
// 60-4 (7/7) — LA CARTE « PASSER EN CYCLES » (MOTEUR §9.22, décidée le 08/10/2026 ; QUESTIONNAIRE-COACH-V2 §5 bis).
//
//   · le fait `Faits.seancesDesRoutines` : les séances TERMINÉES, commencées à partir de la création du programme, qui
//     portent une routine du dossier et au moins une série de travail ;
//   · `Profil.joursDepuis` : des jours CALENDAIRES (le changement d'heure ne les change pas) ;
//   · les 30 cas du fichier de cas (`cas-60-6-generateur.json`), rejoués PAR LE CÂBLAGE DE L'APP : chaque cas devient un
//     profil, des routines, des séances et des blocs, et la carte s'affiche si et seulement si le cas l'attend ;
//   · le rendu : « Tu as fait {N} séances de ton programme. » (R5, 60-5 : des séances, jamais le calendrier des 21 jours)
//     et le reste au mot près ; il n'écrit RIEN ; « Pas maintenant »
//     écrit `carte_cycles_le` une fois ; « Passer en cycles » ouvre « Faire de ce dossier un programme » sur ce dossier.
//
// Environnement jsdom (PAS de docblock `node`) : `rendu.js` se termine par `this`.

process.env.TZ = 'Europe/Paris';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
const Profil = require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const Moteur = require('../../v2/js/moteur.js');
require('../../v2/js/seance.js');
const Routines = require('../../v2/js/routines.js');
const Generateur = require('../../v2/js/generateur.js');
const Faits = require('../../v2/js/faits.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const CAS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-60-6-generateur.json'), 'utf8'));
const texte = (n) => n.textContent.replace(/\s+/g, ' ').trim();
const NOW = new Date(2026, 9, 8, 12, 0, 0);                       // 8 octobre 2026, midi
const il_y_a = (jours, h) => new Date(2026, 9, 8 - jours, h === undefined ? 12 : h, 0, 0);

// ═══ LE FAIT ════════════════════════════════════════════════════════════════
describe('Faits.seancesDesRoutines — les séances faites depuis les routines du dossier', () => {
  const corpus = (specs) => {
    const parSeance = {};
    const seances = specs.map((sp, i) => {
      const id = 's' + i;
      parSeance[id] = sp.series === undefined ? [{ id: id + '-0', session_id: id, type_serie: 'travail', exercise_slug: 'x', reps: 5, rang: 0 }] : sp.series;
      return { id, debut: sp.debut.toISOString(), routine_id: sp.routine_id };
    });
    return { seances, series: [], exercices: [], seriesDe: (id) => parSeance[id] || [], catalogue: () => ({}), journal: [] };
  };
  const faits = () => Faits.creer();
  const depuis = il_y_a(21).toISOString();

  test('compte les séances des routines du dossier commencées à partir de la création', () => {
    const c = corpus([{ debut: il_y_a(20), routine_id: 'r1' }, { debut: il_y_a(10), routine_id: 'r2' }, { debut: il_y_a(1), routine_id: 'r1' }]);
    expect(faits().seancesDesRoutines(c, ['r1', 'r2'], depuis)).toBe(3);
    expect(faits().seancesDesRoutines(c, ['r1'], depuis)).toBe(2);
  });

  test('⚠️ DISCRIMINANT — une séance d’AVANT la création, d’une autre routine, ou sans routine ne compte pas', () => {
    const c = corpus([{ debut: il_y_a(30), routine_id: 'r1' }, { debut: il_y_a(5), routine_id: 'autre' },
                      { debut: il_y_a(4), routine_id: null }, { debut: il_y_a(3), routine_id: 'r1' }]);
    expect(faits().seancesDesRoutines(c, ['r1'], depuis)).toBe(1);
  });

  test('une séance sans série de travail (un échauffement seul, rien) ne compte pas', () => {
    const c = corpus([
      { debut: il_y_a(5), routine_id: 'r1', series: [] },
      { debut: il_y_a(4), routine_id: 'r1', series: [{ id: 'a', type_serie: 'echauffement', exercise_slug: 'x', reps: 10, rang: 0 }] },
      { debut: il_y_a(3), routine_id: 'r1' }]);
    expect(faits().seancesDesRoutines(c, ['r1'], depuis)).toBe(1);
  });

  test('la borne : une séance commencée exactement à la création compte', () => {
    const c = corpus([{ debut: il_y_a(21), routine_id: 'r1' }]);
    expect(faits().seancesDesRoutines(c, ['r1'], depuis)).toBe(1);
  });

  test('sans routine, sans date lisible, sans séance : zéro', () => {
    const c = corpus([{ debut: il_y_a(2), routine_id: 'r1' }]);
    expect(faits().seancesDesRoutines(c, [], depuis)).toBe(0);
    expect(faits().seancesDesRoutines(c, null, depuis)).toBe(0);
    expect(faits().seancesDesRoutines(c, ['r1'], 'pas une date')).toBe(0);
    expect(faits().seancesDesRoutines(c, ['r1'], null)).toBe(0);
    expect(faits().seancesDesRoutines(corpus([]), ['r1'], depuis)).toBe(0);
  });
});

describe('Profil.joursDepuis — des jours calendaires', () => {
  test('le nombre de jours du calendrier entre deux instants', () => {
    expect(Profil.joursDepuis(il_y_a(21, 23), NOW)).toBe(21);          // tard le soir, il y a 21 jours : 21 jours
    expect(Profil.joursDepuis(il_y_a(21, 0), NOW)).toBe(21);
    expect(Profil.joursDepuis(il_y_a(0), NOW)).toBe(0);
    expect(Profil.joursDepuis('2026-09-17', NOW)).toBe(21);            // une date seule
    expect(Profil.joursDepuis(il_y_a(21).toISOString(), NOW)).toBe(21);
  });

  test('le changement d’heure ne change pas le compte (le 25 octobre 2026, 25 heures)', () => {
    expect(Profil.joursDepuis(new Date(2026, 9, 18, 12), new Date(2026, 10, 8, 12))).toBe(21);
  });

  test('illisible : null ; dans le futur : négatif', () => {
    expect(Profil.joursDepuis('nope', NOW)).toBeNull();
    expect(Profil.joursDepuis(null, NOW)).toBeNull();
    expect(Profil.joursDepuis(il_y_a(-3), NOW)).toBe(-3);
  });
});

// ═══ LE CÂBLAGE (`app.js`) ══════════════════════════════════════════════════
const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
function extraire(nom) {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable dans v2/js/app.js : ' + nom);
  return m[0];
}
const FONCTIONS = ['carteCyclesDuProfil', 'rendreCarteCycles', 'reporterLaCarteCycles'];

// L'horloge de l'app : figée sur NOW (le code appelle `new Date()` sans argument).
class DateFigee extends Date {
  constructor(...a) { if (a.length) super(...a); else super(NOW.getTime()); }
  static now() { return NOW.getTime(); }
}

const DOSSIER = 'Mon programme';

// Un monde de papier : un profil, un dossier de deux routines, des séances, des blocs.
function monde(o) {
  const x = Object.assign({ objectif: 'force', jours: 21, seances: 6, estProgramme: false, carnet: false, dejaVue: false,
    dossierRoutines: true }, o || {});
  const creation = il_y_a(x.jours, 9);
  const profil = {
    id: 'u1', objectif: x.objectif, intention: x.carnet ? 'entretien' : 'progresser',
    programme_construit_dossier: DOSSIER, programme_construit_le: creation.toISOString(),
    carte_cycles_le: x.dejaVue ? il_y_a(2).toISOString() : null
  };
  const seances = [], parSeance = {};
  for (let i = 0; i < x.seances; i++) {
    const id = 's' + i;
    // Chaque séance est dans la fenêtre « depuis la création » (au moins une heure après, jamais dans le futur).
    const debut = new Date(creation.getTime() + (i + 1) * 3600000);
    seances.push({ id, debut: debut.toISOString(), routine_id: i % 2 ? 'r2' : 'r1' });
    parSeance[id] = [{ id: id + '-0', session_id: id, type_serie: 'travail', exercise_slug: 'x', reps: 5, rang: 0 }];
  }
  const routines = x.dossierRoutines
    ? [{ id: 'r1', nom: 'Haut A', dossier: DOSSIER, rang: 0 }, { id: 'r2', nom: 'Bas A', dossier: DOSSIER, rang: 1 },
       { id: 'r3', nom: 'Autre', dossier: null, rang: 2 }]
    : [{ id: 'r3', nom: 'Autre', dossier: null, rang: 0 }];
  const blocs = x.estProgramme ? [{ id: 'b1', dossier: DOSSIER, statut: o && o.statutBloc || 'en_cours' }] : [];
  return { profil, seances, parSeance, routines, blocs };
}

function bac(m, options) {
  const o = options || {};
  const journal = { poses: [], programmes: [], rendus: [] };
  const noeud = { hidden: true };
  const ctx = {
    Profil, Generateur, Moteur, Routines, Modele,
    faits: Faits.creer(),
    profil: m.profil, routines: m.routines,
    local: { blocs: m.blocs },
    corpus: () => ({ seances: m.seances, series: [], exercices: [], seriesDe: (id) => m.parSeance[id] || [], catalogue: () => ({}), journal: [] }),
    seance: o.seance || null,
    $: (id) => (id === 'carte-cycles' ? noeud : null),
    Rendu: { rendreBandeauReprise: (n, v) => { journal.rendus.push(v); ctx.__vue = v; } },
    poserProfil: (champs) => { journal.poses.push(champs); Object.assign(ctx.profil, champs); return Promise.resolve(); },
    ouvrirProgramme: (dossier, depuis) => { journal.programmes.push([dossier, depuis]); },
    Date: DateFigee, Object, Array
  };
  vm.createContext(ctx);
  FONCTIONS.forEach((f) => vm.runInContext(extraire(f), ctx));
  return { ctx, journal, noeud, appel: (code) => vm.runInContext(code, ctx), vue: () => ctx.__vue };
}

describe('les 30 cas du fichier de cas, rejoués par le câblage de l’app', () => {
  CAS.carte_cycles.forEach((c, i) => {
    test('cas ' + (i + 1) + ' — ' + JSON.stringify({ o: c.objectif, j: c.jours_depuis_creation, s: c.seances_du_dossier,
      p: c.est_programme, c: c.carnet, v: c.deja_vue }) + ' → ' + (c.attendu ? 'carte' : 'rien'), () => {
      const m = monde({ objectif: c.objectif, jours: c.jours_depuis_creation, seances: c.seances_du_dossier,
        estProgramme: c.est_programme, carnet: c.carnet, dejaVue: c.deja_vue });
      const b = bac(m);
      b.appel('rendreCarteCycles()');
      expect(!!b.vue()).toBe(c.attendu);
      const r = b.appel('carteCyclesDuProfil()');
      expect(r ? r.dossier : null).toBe(c.attendu ? DOSSIER : null);
      // 60-5 : la carte dit les séances FAITES depuis le dossier — le fait même qui porte son seuil de 6.
      if (c.attendu) {
        expect(r.seances).toBe(c.seances_du_dossier);
        expect(b.vue().quoi).toBe('Tu as fait ' + c.seances_du_dossier + ' séances de ton programme.');
      }
    });
  });

  test('le fichier porte bien 30 cas, dont deux seulement affichent la carte', () => {
    expect(CAS.carte_cycles.length).toBe(30);
    expect(CAS.carte_cycles.filter((c) => c.attendu).length).toBe(2);
  });
});

describe('ce que le câblage lit, hors du fichier de cas', () => {
  test('les séances d’une AUTRE routine (hors dossier) ne comptent pas : six séances ailleurs, pas de carte', () => {
    const m = monde({ seances: 6 });
    m.seances.forEach((s) => { s.routine_id = 'r3'; });                 // « Autre », sans dossier
    expect(bac(m).appel('carteCyclesDuProfil()')).toBeNull();
  });

  test('les séances d’AVANT la création ne comptent pas', () => {
    const m = monde({ seances: 6 });
    m.seances.slice(0, 2).forEach((s) => { s.debut = il_y_a(40).toISOString(); });
    expect(bac(m).appel('carteCyclesDuProfil()')).toBeNull();
  });

  test('le dossier a disparu (plus aucune routine à ce nom) : pas de carte', () => {
    expect(bac(monde({ dossierRoutines: false })).appel('carteCyclesDuProfil()')).toBeNull();
  });

  test('⚠️ DISCRIMINANT — un bloc ARRÊTÉ ou terminé sur ce dossier : la carte ne revient pas (la personne a déjà choisi)', () => {
    ['en_cours', 'arrete', 'termine'].forEach((statutBloc) => {
      expect(bac(monde({ estProgramme: true, statutBloc })).appel('carteCyclesDuProfil()')).toBeNull();
    });
  });

  test('un bloc d’un AUTRE dossier ne la tait pas', () => {
    const m = monde();
    m.blocs.push({ id: 'b9', dossier: 'Ailleurs', statut: 'en_cours' });
    expect(bac(m).appel('carteCyclesDuProfil()').dossier).toBe(DOSSIER);
  });

  test('pas de dossier au profil, ou pas de date : pas de carte', () => {
    const a = monde(); a.profil.programme_construit_dossier = null;
    const b = monde(); b.profil.programme_construit_le = null;
    expect(bac(a).appel('carteCyclesDuProfil()')).toBeNull();
    expect(bac(b).appel('carteCyclesDuProfil()')).toBeNull();
  });

  test('une séance en cours : la carte se tait', () => {
    const b = bac(monde(), { seance: { id: 'x' } });
    b.appel('rendreCarteCycles()');
    expect(b.vue()).toBeNull();
  });
});

describe('la carte : ses mots, ses deux boutons, et rien d’écrit au rendu', () => {
  test('le titre et le corps, au mot près (G5), les deux boutons', () => {
    const b = bac(monde());
    b.appel('rendreCarteCycles()');
    const v = b.vue();
    expect(v.quoi).toBe('Tu as fait 6 séances de ton programme.');
    expect(v.sujet).toBe('Un bloc de 4 semaines en Lourd sur tes barres, la dernière plus légère : c’est là que la force se gagne. On passe en cycles ?');
    expect(v.libelleReprendre).toBe('Passer en cycles');
    expect(v.libelleQuitter).toBe('Pas maintenant');
  });

  test('⚠️ DISCRIMINANT (R5, 60-5) — le chiffre est le COMPTE des séances du dossier, pas le seuil ; et le calendrier des 21 jours n’est jamais dit', () => {
    [7, 9, 14].forEach((n) => {
      const b = bac(monde({ seances: n }));
      b.appel('rendreCarteCycles()');
      expect(b.vue().quoi).toBe('Tu as fait ' + n + ' séances de ton programme.');
      expect(b.vue().quoi).not.toMatch(/semaine|jour|depuis|\b21\b/);
      expect(b.vue().sujet).not.toMatch(/\b21\b|jours/);
    });
    // Un jour de plus ou de moins ne change pas la phrase : elle ne lit pas le calendrier.
    [21, 22, 40, 90].forEach((j) => {
      const b = bac(monde({ jours: j }));
      b.appel('rendreCarteCycles()');
      expect(b.vue().quoi).toBe('Tu as fait 6 séances de ton programme.');
    });
  });

  test('ce que la carte promet est ce que « Faire de ce dossier un programme » propose : Lourd, 4 semaines (Force et Les deux)', () => {
    expect(Moteur.zoneDuPremierBloc('force')).toBe('lourd');
    expect(Moteur.zoneDuPremierBloc('les_deux')).toBe('lourd');
    expect(Moteur.SEMAINES_BLOC_DEFAUT).toBe(4);
    expect(Generateur.CARTE_JOURS / 7).toBe(3);
  });

  test('⚠️ DISCRIMINANT — le rendu n’écrit RIEN : trois rendus de suite, aucune écriture du profil', () => {
    const b = bac(monde());
    b.appel('rendreCarteCycles()'); b.appel('rendreCarteCycles()'); b.appel('rendreCarteCycles()');
    expect(b.journal.poses).toEqual([]);
    expect(b.journal.programmes).toEqual([]);
  });

  test('« Passer en cycles » ouvre « Faire de ce dossier un programme » sur CE dossier, sans rien écrire', () => {
    const b = bac(monde());
    b.appel('rendreCarteCycles()');
    b.vue().surReprendre();
    expect(b.journal.programmes).toEqual([[DOSSIER, null]]);
    expect(b.journal.poses).toEqual([]);
    // Annuler cette feuille n'écrit rien : la carte est toujours là au rendu suivant.
    b.appel('rendreCarteCycles()');
    expect(b.vue()).not.toBeNull();
  });

  test('« Pas maintenant » écrit `carte_cycles_le` UNE fois et la carte disparaît pour toujours', () => {
    const b = bac(monde());
    b.appel('rendreCarteCycles()');
    b.vue().surQuitter();
    expect(b.journal.poses.length).toBe(1);
    expect(Object.keys(b.journal.poses[0])).toEqual(['carte_cycles_le']);
    expect(b.journal.poses[0].carte_cycles_le).toMatch(/^2026-10-08T/);
    expect(b.vue()).toBeNull();                                         // redessinée : cachée
    b.appel('rendreCarteCycles()');
    expect(b.vue()).toBeNull();
    expect(b.journal.poses.length).toBe(1);
  });
});

describe('le branchement dans app.js', () => {
  test('Saisie rend la carte juste après le rappel de phase ; le profil qui arrive la redessine ; le conteneur existe', () => {
    expect(APP).toMatch(/rendreBandeauQuestionnaire\(\);\s*rendreBandeauPhase\(\);\s*rendreCarteCycles\(\);/);
    const html = fs.readFileSync(path.join(__dirname, '../../v2/index.html'), 'utf8');
    expect(html).toMatch(/<div id="bandeau-phase" hidden><\/div>[\s\S]*?<div id="carte-cycles" hidden><\/div>[\s\S]*?<div id="bandeau-reprise" hidden><\/div>/);
  });
});

// ═══ 137 (MOTEUR §9.22, delta D8) — « PAS MAINTENANT » VAUT POUR CE PROGRAMME-LÀ ═══════════════════════════════════
describe('137 — le refus de la carte ne survit pas à un programme reconstruit', () => {
  const carte = (m) => { const b = bac(m); b.appel('rendreCarteCycles()'); return !!b.vue(); };

  test('refus APRÈS la création du programme : la carte reste cachée', () => {
    const m = monde({ dejaVue: true });          // refus il y a 2 jours, programme créé il y a 21 jours
    expect(carte(m)).toBe(false);
  });
  test('DISCRIMINANT — refus AVANT une reconstruction : la carte est de nouveau visible', () => {
    const m = monde({ jours: 21, dejaVue: false });
    m.profil.carte_cycles_le = il_y_a(40).toISOString();        // refusée sur l’ancien programme
    expect(carte(m)).toBe(true);
    // Témoin : le même profil, refus daté d’après la création → cachée.
    m.profil.carte_cycles_le = il_y_a(2).toISOString();
    expect(carte(m)).toBe(false);
  });
  test('jamais refusée : la règle d’avant (les 21 jours et les 6 séances)', () => {
    expect(carte(monde({ jours: 21, seances: 6 }))).toBe(true);
    expect(carte(monde({ jours: 20, seances: 6 }))).toBe(false);
  });
  test('la fonction pure : instants comparés, égalité = déjà vue, sans refus = jamais vue', () => {
    const f = Profil.carteCyclesDejaVue;
    expect(f({ programme_construit_le: '2026-10-01T10:00:00Z', carte_cycles_le: '2026-10-05T10:00:00Z' })).toBe(true);
    expect(f({ programme_construit_le: '2026-10-10T10:00:00Z', carte_cycles_le: '2026-10-05T10:00:00Z' })).toBe(false);
    expect(f({ programme_construit_le: '2026-10-05T10:00:00Z', carte_cycles_le: '2026-10-05T10:00:00Z' })).toBe(true);
    // Deux écritures du même instant sous deux fuseaux : comparées comme des instants, pas comme des textes.
    expect(f({ programme_construit_le: '2026-10-05T12:00:00+02:00', carte_cycles_le: '2026-10-05T10:00:00Z' })).toBe(true);
    expect(f({ programme_construit_le: '2026-10-05T10:00:01Z', carte_cycles_le: '2026-10-05T12:00:00+02:00' })).toBe(false);
    expect(f({ programme_construit_le: '2026-10-05T10:00:00Z', carte_cycles_le: null })).toBe(false);
    expect(f({ carte_cycles_le: '2026-10-05T10:00:00Z' })).toBe(true);
    expect(f(null)).toBe(false);
  });
});
