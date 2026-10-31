/** @jest-environment node */
//
// 60-2a (commit 5) — LE PROFIL : « TON BUT », « TON TEMPS », « TERMINER MON QUESTIONNAIRE ».
//
// QUESTIONNAIRE-COACH-V2 §6 : les réponses du questionnaire se changent ensuite
// dans Profil, une ligne à la fois, et par la MÊME fonction de préparation des
// champs que le questionnaire (`Profil.preparerChamps`) : un objectif qui change
// date `objectif_depuis`, une réponse inchangée n'écrit rien. Leurs PHRASES D'AIDE,
// retirées en 60-2a (elles promettaient un effet absent), sont revenues avec leurs
// lecteurs (60-2b, ECRAN-PROFIL §4 bis) : une phrase sous le titre de la feuille de
// l'objectif et de celle des priorités, une sous-ligne par réponse de temps qu'une
// règle lit (« moins », « varie » ; ni « maximum » ni « marge »).
//
// ⚠️ L'écran (`rendreProfilEcran`) et les feuilles (`ouvrirReponseProfil`,
// `ouvrirPrioritesProfil`, `ecrireReponse`) se REJOUENT dans un bac `vm` — les
// fonctions d'`app.js`, extraites, avec le vrai `profil.js`.

process.env.TZ = 'Europe/Paris';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
const Profil = require('../../v2/js/profil.js');
const { profilEcran } = require('./aide-profil-ecran.js');

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const extraire = (nom) => {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable : ' + nom);
  return m[0];
};

describe('60-2a — les règles pures du Profil : priorités, sections, ligne du questionnaire', () => {
  test('`basculerPriorite` : on ajoute, on retire, trois au plus (la quatrième est sans effet)', () => {
    expect(Profil.basculerPriorite(null, 'squat_barre')).toEqual(['squat_barre']);
    expect(Profil.basculerPriorite(['squat_barre'], 'tractions')).toEqual(['squat_barre', 'tractions']);
    expect(Profil.basculerPriorite(['squat_barre', 'tractions'], 'squat_barre')).toEqual(['tractions']);
    const trois = ['squat_barre', 'tractions', 'developpe_couche_barre'];
    expect(Profil.basculerPriorite(trois, 'souleve_de_terre_barre')).toEqual(trois);
    expect(Profil.basculerPriorite(trois, 'tractions')).toEqual(['squat_barre', 'developpe_couche_barre']);
  });

  test('`basculerPriorite` ne modifie pas la liste reçue', () => {
    const l = ['squat_barre'];
    Profil.basculerPriorite(l, 'tractions');
    expect(l).toEqual(['squat_barre']);
  });

  test('`resumeDesPriorites` : pas répondu (null), « Pas de priorité » ([]), ou les libellés dans l’ordre choisi', () => {
    expect(Profil.resumeDesPriorites(null)).toBe(null);
    expect(Profil.resumeDesPriorites(undefined)).toBe(null);
    expect(Profil.resumeDesPriorites([])).toBe('Pas de priorité');
    expect(Profil.resumeDesPriorites(['tractions', 'squat_barre'])).toBe('Tractions, Squat');
  });

  test('`sectionBut` : « TON BUT », deux lignes (But d’entraînement, Priorités), AUCUNE phrase d’aide', () => {
    const ouverts = [];
    const sec = Profil.sectionBut({ objectif: 'muscle', priorites: ['squat_barre'] }, (c) => ouverts.push(c));
    expect(sec.titre).toBe('TON BUT');
    expect(sec.lignes.map((l) => [l.libelle, l.valeur])).toEqual([['But d’entraînement', 'Muscle'], ['Priorités', 'Squat']]);
    expect(sec.aide).toBeUndefined();
    expect(sec.note).toBeUndefined();
    expect(sec.lignes.every((l) => l.sous === undefined)).toBe(true);
    sec.lignes.forEach((l) => l.surChoix());
    expect(ouverts).toEqual(['objectif', 'priorites']);
  });

  test('`sectionBut` sans réponse : les deux lignes sont « à renseigner » (valeur nulle)', () => {
    const sec = Profil.sectionBut({ objectif: null, priorites: null }, () => {});
    expect(sec.lignes.map((l) => l.valeur)).toEqual([null, null]);
    expect(Profil.sectionBut(null, () => {}).lignes.map((l) => l.valeur)).toEqual([null, null]);
  });

  test('`ligneTemps` : « Ton temps », la réponse en toutes lettres, sans phrase', () => {
    const l = Profil.ligneTemps({ temps_reponse: 'marge' }, () => {});
    expect(l.libelle).toBe('Ton temps');
    expect(l.valeur).toBe('J’ai de la marge pour en faire plus');
    expect(l.sous).toBeUndefined();
    expect(Profil.ligneTemps({ temps_reponse: null }, () => {}).valeur).toBe(null);
  });

  test('⚠️ DISCRIMINANT — `ligneQuestionnaire` : seulement quand la colonne est VIDE ; remplie ou inconnue, rien', () => {
    const ouvrir = () => {};
    expect(Profil.ligneQuestionnaire({ questionnaire_fait_le: null }, ouvrir)).toEqual({ libelle: 'Terminer mon questionnaire', surChoix: ouvrir });
    expect(Profil.ligneQuestionnaire({ questionnaire_fait_le: '2026-10-07T10:00:00.000Z' }, ouvrir)).toBe(null);
    expect(Profil.ligneQuestionnaire({ id: 'u1' }, ouvrir)).toBe(null);          // colonne absente : on ne sait pas
    expect(Profil.ligneQuestionnaire(null, ouvrir)).toBe(null);
  });
});

describe('60-2a — l’écran Profil : où sont les sections, ce qu’elles ouvrent', () => {
  const titres = (e) => e.vue.sections.filter(Boolean).map((s) => s.titre);

  test('⚠️ « TON BUT » vient APRÈS le réglage du coach (« TON RYTHME »), le poids et « TA PHASE » ; « TA SEMAINE » le suit (173 : « Mon coach »)', () => {
    const e = profilEcran({ id: 'u1', intention: 'progresser', rythme_progression: 'normal', questionnaire_fait_le: '2026-10-07T10:00:00.000Z' });
    const t = titres(e);
    expect(t.indexOf('POURQUOI')).toBeGreaterThanOrEqual(0);
    expect(t.indexOf('TON RYTHME')).toBeGreaterThan(t.indexOf('POURQUOI'));
    expect(t.indexOf('TON POIDS')).toBe(t.indexOf('TON RYTHME') + 1);
    expect(t.indexOf('TA PHASE')).toBe(t.indexOf('TON POIDS') + 1);
    expect(t.indexOf('TON BUT')).toBe(t.indexOf('TA PHASE') + 1);
    expect(t.indexOf('TA SEMAINE')).toBe(t.indexOf('TON BUT') + 1);
  });

  test('en « Juste un carnet », « TON RYTHME » s’efface, « TON BUT » reste (c’est une réponse, pas un réglage du coach)', () => {
    const e = profilEcran({ id: 'u1', intention: 'entretien', questionnaire_fait_le: '2026-10-07T10:00:00.000Z' });
    const t = titres(e);
    expect(t.indexOf('TON RYTHME')).toBe(-1);
    expect(t.indexOf('TON BUT')).toBeGreaterThan(t.indexOf('POURQUOI'));
  });

  test('« TA SEMAINE » : « Ton temps » vient SOUS la durée d’une séance, sans phrase d’aide', () => {
    const e = profilEcran({ id: 'u1', temps_reponse: 'moins', questionnaire_fait_le: '2026-10-07T10:00:00.000Z' });
    const s = e.section('TA SEMAINE');
    expect(s.lignes.map((l) => l.libelle)).toEqual(['Séances par semaine', 'Durée d’une séance', 'Ton temps']);
    expect(s.lignes[2].valeur).toBe('J’ai moins de temps en ce moment');
    expect(s.lignes[2].sous).toBeUndefined();
    expect(s.aide).toBeUndefined();
  });

  test('chaque ligne ouvre SA feuille', () => {
    const e = profilEcran({ id: 'u1', questionnaire_fait_le: '2026-10-07T10:00:00.000Z' });
    e.section('TON BUT').lignes.forEach((l) => l.surChoix());
    e.section('TA SEMAINE').lignes[2].surChoix();
    expect(e.ouverts).toEqual(['objectif', 'priorites', 'temps_reponse']);
  });

  test('⚠️ DISCRIMINANT — « Terminer mon questionnaire » en tête tant que la colonne est vide ; elle ouvre le questionnaire', () => {
    const e = profilEcran({ id: 'u1', questionnaire_fait_le: null });
    expect(e.vue.questionnaire.libelle).toBe('Terminer mon questionnaire');
    e.vue.questionnaire.surChoix();
    expect(e.questionnairesOuverts).toEqual([true]);
  });

  test('rempli, ou ligne inconnue : pas de ligne en tête', () => {
    expect(profilEcran({ id: 'u1', questionnaire_fait_le: '2026-10-07T10:00:00.000Z' }).vue.questionnaire).toBe(null);
    expect(profilEcran({ id: 'u1' }).vue.questionnaire).toBe(null);
  });

  test('le bandeau d’accueil du profil n’existe plus (`onboarding_completed` ne décide plus rien ici)', () => {
    const e = profilEcran({ id: 'u1', onboarding_completed: false, questionnaire_fait_le: '2026-10-07T10:00:00.000Z' });
    expect(e.vue.accueil).toBeUndefined();
  });
});

describe('60-2a — les feuilles : une réponse du Profil s’écrit comme celle du questionnaire', () => {
  function bac(profil) {
    const ecrits = [];
    const vues = { choix: null, multiple: null };
    let rendus = 0;
    const ctx = {
      Profil, Date, Object, Array,
      profil,
      feuilleProfil: null,
      $: () => ({}),
      valeurProfil: (cle) => (ctx.profil ? ctx.profil[cle] : null),
      defObjet: (cle, v) => { const o = {}; o[cle] = v; return o; },
      ecrireProfil: (champs) => { ecrits.push(champs); },
      fermerVoile: () => { ctx.ferme = (ctx.ferme || 0) + 1; },
      ouvrirFeuilleProfil: () => { ctx.feuilleProfil({}); },
      Rendu: {
        rendreFeuilleChoix: (c, v) => { vues.choix = v; rendus++; },
        rendreFeuilleChoixMultiple: (c, v) => { vues.multiple = v; rendus++; }
      }
    };
    vm.createContext(ctx);
    ['ecrireReponse', 'ouvrirReponseProfil', 'ouvrirPrioritesProfil'].forEach((f) => vm.runInContext(extraire(f), ctx));
    return { ctx, ecrits, vues, ouvrir: (cle) => vm.runInContext('ouvrirReponseProfil(' + JSON.stringify(cle) + ')', ctx),
             ecrire: (e) => { ctx.e = e; vm.runInContext('ecrireReponse(e)', ctx); }, rendus: () => rendus };
  }

  test('« Objectif » : la feuille des quatre objectifs, sa phrase d’aide, sans « Effacer » ; le choix écrit l’objectif ET sa date', () => {
    const b = bac({ id: 'u1', objectif: null });
    b.ouvrir('objectif');
    const v = b.vues.choix;
    expect(v.titre).toBe('But d’entraînement');
    expect(v.aide).toBe('Il choisit la zone de ton premier bloc de programme : Lourd pour la force, Mix pour le muscle.');
    expect(v.surEffacer).toBe(null);
    expect(v.options.map((o) => o.libelle)).toEqual(['Force', 'Muscle', 'Les deux', 'Forme et santé', 'Calisthénie']);
    v.surChoix('muscle');
    expect(b.ecrits).toHaveLength(1);
    expect(Object.keys(b.ecrits[0]).sort()).toEqual(['objectif', 'objectif_depuis']);
    expect(b.ecrits[0].objectif).toBe('muscle');
    expect(Number.isNaN(Date.parse(b.ecrits[0].objectif_depuis))).toBe(false);
  });

  test('⚠️ DISCRIMINANT — le MÊME objectif ne réécrit rien (ni valeur ni date) : c’est la fonction du questionnaire', () => {
    const b = bac({ id: 'u1', objectif: 'muscle', objectif_depuis: '2026-09-01T10:00:00.000Z' });
    b.ouvrir('objectif');
    b.vues.choix.surChoix('muscle');
    expect(b.ecrits).toEqual([]);
    b.vues.choix.surChoix('force');
    expect(b.ecrits).toHaveLength(1);
    expect(b.ecrits[0].objectif).toBe('force');
  });

  test('« Ton temps » : les quatre réponses, une phrase pour « moins » et « varie » seulement ; le choix écrit `temps_reponse` seul', () => {
    const b = bac({ id: 'u1', temps_reponse: null });
    b.ouvrir('temps_reponse');
    const v = b.vues.choix;
    expect(v.titre).toBe('Ton temps');
    expect(v.aide).toBe(null);
    expect(v.options.map((o) => o.cle)).toEqual(['max', 'marge', 'moins', 'varie']);
    expect(v.aide).toBe(null);
    const sous = {};
    v.options.forEach((o) => { sous[o.cle] = o.sous === undefined ? null : o.sous; });
    expect(sous).toEqual({
      max: null, marge: null,
      moins: 'Quand ta routine dépasse ta durée visée, je te propose de la raccourcir dès son ouverture.',
      varie: 'Quand ta routine dépasse ta durée visée, je te le montre à côté de « J’ai peu de temps ».'
    });
    v.surChoix('varie');
    expect(b.ecrits).toEqual([{ temps_reponse: 'varie' }]);
  });

  test('« Priorités » : la feuille à cocher (exercices, muscles, « Pas de priorité »), trois au plus, sa phrase d’aide', () => {
    const b = bac({ id: 'u1', priorites: null });
    b.ouvrir('priorites');
    let v = b.vues.multiple;
    expect(v.titre).toBe('Priorités');
    expect(v.aide).toBe('Un exercice prioritaire est coché d’office dans un programme. Un muscle prioritaire peut recevoir ' +
      'une série de plus jusqu’à ton plus haut volume, hors sèche.');
    expect(v.max).toBe(3);
    expect(v.groupes.map((g) => g.titre)).toEqual(['Des exercices', 'Ou des muscles']);
    expect(v.groupes[0].options.map((o) => o.cle)).toContain('squat_barre');
    expect(v.aucune).toEqual({ libelle: 'Pas de priorité', actif: false });
    expect(v.valeurs).toEqual([]);

    v.surBasculer('squat_barre'); v = b.vues.multiple;
    v.surBasculer('tractions'); v = b.vues.multiple;
    v.surBasculer('developpe_couche_barre'); v = b.vues.multiple;
    v.surBasculer('souleve_de_terre_barre'); v = b.vues.multiple;     // la quatrième : sans effet
    expect(v.valeurs).toEqual(['squat_barre', 'tractions', 'developpe_couche_barre']);
    v.surBasculer('tractions'); v = b.vues.multiple;                   // on en retire une
    expect(v.valeurs).toEqual(['squat_barre', 'developpe_couche_barre']);
    expect(b.ecrits).toEqual([]);                                      // rien n'est écrit avant « Valider »

    v.surValider();
    expect(b.ecrits).toEqual([{ priorites: ['squat_barre', 'developpe_couche_barre'] }]);
  });

  test('⚠️ DISCRIMINANT — « Pas de priorité » est une RÉPONSE : `[]` s’écrit, et vide la liste', () => {
    const b = bac({ id: 'u1', priorites: ['squat_barre'] });
    b.ouvrir('priorites');
    b.vues.multiple.surAucune();
    expect(b.vues.multiple.valeurs).toEqual([]);
    expect(b.vues.multiple.aucune.actif).toBe(true);
    b.vues.multiple.surValider();
    expect(b.ecrits).toEqual([{ priorites: [] }]);
  });

  test('« Valider » sans rien toucher n’écrit rien : pas répondu reste pas répondu, répondu reste répondu', () => {
    const a = bac({ id: 'u1', priorites: null });
    a.ouvrir('priorites');
    a.vues.multiple.surValider();
    expect(a.ecrits).toEqual([]);
    const c = bac({ id: 'u1', priorites: ['tractions'] });
    c.ouvrir('priorites');
    c.vues.multiple.surValider();
    expect(c.ecrits).toEqual([]);
  });

  test('« Annuler » ferme sans rien écrire, même après avoir coché', () => {
    const b = bac({ id: 'u1', priorites: null });
    b.ouvrir('priorites');
    b.vues.multiple.surBasculer('squat_barre');
    b.vues.multiple.surAnnuler();
    expect(b.ecrits).toEqual([]);
    expect(b.ctx.ferme).toBe(1);
  });

  test('chaque tap redessine la feuille (la coche suit), le brouillon est celui de la feuille', () => {
    const b = bac({ id: 'u1', priorites: ['tractions'] });
    b.ouvrir('priorites');
    const avant = b.rendus();
    b.vues.multiple.surBasculer('squat_barre');
    expect(b.rendus()).toBe(avant + 1);
    expect(b.vues.multiple.valeurs).toEqual(['tractions', 'squat_barre']);
    // Rouverte, la feuille repart de ce qui est en base, pas du brouillon d'avant.
    b.ouvrir('priorites');
    expect(b.vues.multiple.valeurs).toEqual(['tractions']);
  });
});

describe('60-2b — les phrases d\'aide, écrites une fois dans profil.js', () => {
  test('⚠️ DISCRIMINANT — les trois phrases sont celles d’ECRAN-PROFIL §4 bis, au mot près', () => {
    expect(Profil.AIDE_OBJECTIF).toBe('Il choisit la zone de ton premier bloc de programme : Lourd pour la force, Mix pour le muscle.');
    expect(Profil.AIDE_PRIORITES).toBe('Un exercice prioritaire est coché d’office dans un programme. Un muscle prioritaire peut ' +
      'recevoir une série de plus jusqu’à ton plus haut volume, hors sèche.');
    const o = {};
    Profil.optionsTemps().forEach((x) => { o[x.cle] = x.sous || null; });
    expect(o.moins).toBe('Quand ta routine dépasse ta durée visée, je te propose de la raccourcir dès son ouverture.');
    expect(o.varie).toBe('Quand ta routine dépasse ta durée visée, je te le montre à côté de « J’ai peu de temps ».');
    expect([o.max, o.marge]).toEqual([null, null]);
  });

  test('les libellés et l\'ordre des quatre réponses ne bougent pas (le questionnaire les partage)', () => {
    expect(Profil.optionsTemps().map((x) => [x.cle, x.libelle])).toEqual(Profil.TEMPS_REPONSES.map((x) => [x.cle, x.libelle]));
    expect(Profil.TEMPS_REPONSES.every((x) => x.sous === undefined)).toBe(true);
  });
});
