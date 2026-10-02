//
// v2 — la règle du groupe à deux, et les gestes sur une séance (chantier 29).
//
// ══ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) ═════════════════════
//
//   UN SUPERSET DONT LES EXERCICES ONT UN NOMBRE INÉGAL DE CHAUFFES.
//
// Avec une chauffe chacun, « les chauffes forment leurs propres tours » et
// « chaque chauffe est collée à son exercice » rendent EXACTEMENT le même
// écran : A B C D · A1 B1 C1 D1 dans les deux cas. Il faut que deux exercices
// en aient deux et les autres une seule pour que le second tour de chauffe
// existe — et ne contienne qu'eux.
//
// Les tours de chauffe vivent dans `v2-modele.test.js`, où est l'entrelaceur.
// Ce fichier tient les deux autres règles du chantier : un groupe ne descend
// jamais à un exercice (§7 decies), et les gestes sur une séance (§7 octies).

// PR 6 de la consolidation — la série de travail et son compte vivent dans
// `modele.js` et `semaine.js`, lus à l'appel par les autres modules.
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
const Seance = require('../../v2/js/seance.js');
const Modele = require('../../v2/js/modele.js');
const Routines = require('../../v2/js/routines.js');
const { progTravail } = require('./aide-routine-programmee.js');

let graine = 0;
const uuid = () => 'set-' + (++graine);

const CATALOGUE = [
  { slug: 'squat', nom: 'Squat', mesure: 'charge_reps', charge: 'externe', muscles_primaires: [], muscles_secondaires: [] },
  { slug: 'dc', nom: 'Développé Couché', mesure: 'charge_reps', charge: 'externe', muscles_primaires: [], muscles_secondaires: [] },
  { slug: 'curl', nom: 'Curl', mesure: 'charge_reps', charge: 'externe', muscles_primaires: [], muscles_secondaires: [] },
  { slug: 'pl', nom: 'Planche', mesure: 'temps', charge: 'aucune', muscles_primaires: [], muscles_secondaires: [] }
];

// Une routine : `[slug, nbSéries, groupe]`.
function routineDe(lignes) {
  return {
    id: 'r-1', nom: 'Test',
    exercices: lignes.map(([slug, series, groupe], i) => ({
      id: 're' + i, routine_id: 'r-1', exercise_slug: slug, rang: i,
      series: progTravail(series), repos_cible_s: null,
      groupe_superset: groupe === undefined ? null : groupe, note: null
    }))
  };
}

const groupes = (s) => s.exercices.map((e) => e.groupe_superset);
const slugs = (s) => s.exercices.map((e) => e.exercise_slug);

// ══ 1. UN GROUPE A TOUJOURS AU MOINS DEUX EXERCICES (§7 decies) ════════════

describe('un groupe de superset ne descend jamais à un seul exercice', () => {
  // ⚠️ CE N'EST PAS THÉORIQUE : 13 blocs dans cet état ont été trouvés en base
  // et nettoyés par `v2_041` (49 séries, 12 séances, 3 comptes). Chaque test
  // ci-dessous ferme un chemin par lequel ils pourraient revenir.

  test('une routine qui en porte un ne le transmet pas à la séance', () => {
    const s = Seance.creer({
      id: 'ss-1', userId: 'u-1',
      routine: routineDe([['squat', 2, 7], ['dc', 2, null]]),   // groupe 7, seul
      idSerie: uuid
    });
    expect(groupes(s)).toEqual([null, null]);
  });

  test('mais une routine qui en porte un VRAI le transmet, renuméroté', () => {
    const s = Seance.creer({
      id: 'ss-2', userId: 'u-1',
      routine: routineDe([['squat', 2, 7], ['dc', 2, 7], ['curl', 2, null]]),
      idSerie: uuid
    });
    expect(groupes(s)).toEqual([1, 1, null]);
  });

  test('supprimer une branche d’un superset à deux dissout l’autre', () => {
    let s = Seance.creer({
      id: 'ss-3', userId: 'u-1',
      routine: routineDe([['squat', 2, 1], ['dc', 2, 1], ['curl', 2, null]]),
      idSerie: uuid
    });
    s = Seance.retirerExercices(s, [0]);
    expect(slugs(s)).toEqual(['dc', 'curl']);
    expect(groupes(s)).toEqual([null, null]);
  });

  test('à TROIS, supprimer une branche laisse les deux autres groupés', () => {
    let s = Seance.creer({
      id: 'ss-4', userId: 'u-1',
      routine: routineDe([['squat', 2, 1], ['dc', 2, 1], ['curl', 2, 1]]),
      idSerie: uuid
    });
    s = Seance.retirerExercices(s, [1]);
    expect(slugs(s)).toEqual(['squat', 'curl']);
    expect(groupes(s)).toEqual([1, 1]);
  });

  test('remplacer une branche garde le bloc à deux, jamais à un', () => {
    let s = Seance.creer({
      id: 'ss-5', userId: 'u-1',
      routine: routineDe([['squat', 2, 1], ['dc', 2, 1]]),
      idSerie: uuid
    });
    s = Seance.remplacerExercice(s, 0, 'curl', uuid);
    expect(slugs(s)).toEqual(['curl', 'dc']);
    expect(groupes(s)).toEqual([1, 1]);
  });

  test('dégrouper à deux dissout le bloc ; à trois, seul le sortant part', () => {
    let deux = Seance.creer({
      id: 'ss-6', userId: 'u-1',
      routine: routineDe([['squat', 1, 1], ['dc', 1, 1]]), idSerie: uuid
    });
    deux = Seance.degrouperExercice(deux, 0, [0, 1]);
    expect(groupes(deux)).toEqual([null, null]);

    let trois = Seance.creer({
      id: 'ss-7', userId: 'u-1',
      routine: routineDe([['squat', 1, 1], ['dc', 1, 1], ['curl', 1, 1]]), idSerie: uuid
    });
    trois = Seance.degrouperExercice(trois, 1, [0, 1, 2]);
    expect(slugs(trois)).toEqual(['squat', 'curl', 'dc']);
    expect(groupes(trois)).toEqual([1, 1, null]);
  });

  // L'ÉDITEUR DE ROUTINE — l'autre porte, et celle qui manquait au §2.
  test('l’éditeur dégroupe : la bascule retire le lien comme elle le pose', () => {
    const liste = routineDe([['squat', 3, 1], ['dc', 3, 1], ['curl', 3, null]]).exercices;
    expect(Routines.liens(liste)).toEqual([true, false]);

    const defait = Routines.basculerLien(liste, 0);
    expect(Routines.liens(defait)).toEqual([false, false]);
    expect(defait.map((e) => e.groupe_superset)).toEqual([null, null, null]);
  });

  test('l’éditeur dissout aussi le bloc à deux d’un superset à trois', () => {
    const liste = routineDe([['squat', 3, 1], ['dc', 3, 1], ['curl', 3, 1]]).exercices;
    // On retire le lien du MILIEU : le troisième se retrouverait seul dans le
    // groupe — interdit. Il en sort.
    const coupe = Routines.basculerLien(liste, 1);
    expect(coupe.map((e) => e.groupe_superset)).toEqual([1, 1, null]);
  });

  test('un groupe à un exercice lu en base est normalisé, pas réécrit', () => {
    const liste = routineDe([['squat', 3, 7], ['dc', 3, null]]).exercices;
    expect(Routines.renumeroter(liste).map((e) => e.groupe_superset)).toEqual([null, null]);
  });
});

// ══ 2. LES GESTES SUR UNE SÉANCE (§7 octies) ═══════════════════════════════

// Une séance terminée telle qu'elle revient de la base : une ligne `sessions`
// et des lignes `sets`.
const SESSION = {
  id: 'sess-1', user_id: 'u-1', titre: 'Jambes du jeudi',
  debut: '2026-09-10T17:00:00.000Z', fin: '2026-09-10T18:20:00.000Z',
  statut: 'terminee', salle: 'Basic-Fit', note: 'Dos fatigué', routine_id: 'r-1'
};

function ligne(o) {
  return Object.assign({
    id: 'l' + o.rang, session_id: 'sess-1', user_id: 'u-1',
    type_serie: 'travail', charge_kg: null, reps: null, duree_s: null,
    distance_m: null, rpe: null, ressenti: null, note: null,
    validee_a: '2026-09-10T17:30:00.000Z', repos_s: 90,
    groupe_superset: null, source: 'app'
  }, o);
}

// Un superset de deux (squat + dc, une chauffe sur squat) puis un exercice seul.
const LIGNES = [
  ligne({ rang: 1, exercise_slug: 'squat', groupe_superset: 1, type_serie: 'echauffement', charge_kg: 40, reps: 8 }),
  ligne({ rang: 2, exercise_slug: 'squat', groupe_superset: 1, charge_kg: 100, reps: 5, note: 'ceinture' }),
  ligne({ rang: 3, exercise_slug: 'dc', groupe_superset: 1, charge_kg: 80, reps: 8 }),
  ligne({ rang: 4, exercise_slug: 'squat', groupe_superset: 1, charge_kg: 105, reps: 5, note: 'ceinture' }),
  ligne({ rang: 5, exercise_slug: 'dc', groupe_superset: 1, charge_kg: 80, reps: 7 }),
  ligne({ rang: 6, exercise_slug: 'pl', groupe_superset: null, duree_s: 60 })
];

const blocsDe = (lignes) => Modele.construireBlocs(lignes, CATALOGUE);

describe('rouvrir une séance terminée (§7 octies.2)', () => {
  // ⚠️ CE QUI EST TRANCHÉ : elle RESTE `terminee`. La repasser `en_cours` la
  // ferait sortir des totaux et du relevé pendant l'édition (§7 quinquies),
  // et une app tuée au milieu la laisserait invisible dans l'historique.
  test('elle garde son statut, sa fin, sa salle et sa note', () => {
    const s = Seance.reprendre(SESSION, blocsDe(LIGNES));
    expect(s.statut).toBe('terminee');
    expect(s.fin).toBe(SESSION.fin);
    expect(s.debut).toBe(SESSION.debut);
    expect(s.salle).toBe('Basic-Fit');
    expect(s.note).toBe('Dos fatigué');
    expect(s.id).toBe('sess-1');
  });

  test('la structure revient : le superset, l’exercice seul, les valeurs', () => {
    const s = Seance.reprendre(SESSION, blocsDe(LIGNES));
    expect(slugs(s)).toEqual(['squat', 'dc', 'pl']);
    expect(groupes(s)).toEqual([1, 1, null]);
    expect(s.exercices[0].series.map((x) => x.charge_kg)).toEqual([40, 100, 105]);
    expect(s.exercices[0].series.map((x) => x.type_serie))
      .toEqual(['echauffement', 'travail', 'travail']);
    expect(s.exercices[2].series[0].duree_s).toBe(60);
  });

  // `noteDeSerie` PROJETTE la note d'exercice sur chaque ligne à l'écriture.
  // Au retour, une note partagée par toutes les lignes est donc celle de
  // l'exercice — sinon elle repartirait en triple sur chaque série.
  test('une note portée par toutes les lignes redevient la note de l’exercice', () => {
    const lignes = LIGNES.map((l) => l.exercise_slug === 'squat'
      ? Object.assign({}, l, { note: 'ceinture' }) : l);
    const s = Seance.reprendre(SESSION, blocsDe(lignes));
    expect(s.exercices[0].note).toBe('ceinture');
    expect(s.exercices[0].series.every((x) => x.note === null)).toBe(true);
  });

  test('une note propre à UNE série reste sur cette série', () => {
    const s = Seance.reprendre(SESSION, blocsDe(LIGNES));
    expect(s.exercices[0].note).toBe(null);
    expect(s.exercices[0].series.map((x) => x.note)).toEqual([null, 'ceinture', 'ceinture']);
  });

  // ⚠️ TEST INVERSÉ AU CHANTIER 34 — et la décision d'avant est expliquée ici,
  // parce qu'elle était délibérée.
  //
  // Il exigeait des rangs RANGÉS : `[1,2,3,4,5,6]`. Le raisonnement était
  // « l'écran ne bouge pas d'un pixel, c'est le stockage qui se normalise ».
  // Il est retourné, pour une raison que le chantier 34 rend décisive : une
  // correction qui ne change RIEN doit écrire exactement ce qui est déjà en
  // base. Sans ça, rouvrir puis enregistrer une séance importée en renumérote
  // les rangs — mesuré : 53 blocs entrelacés sur 47 séances de la base réelle.
  // Une altération silencieuse de l'ordre enregistré, à l'occasion d'un geste
  // qui prétend ne rien faire.
  //
  // Avec la préservation, « ouvrir puis enregistrer sans rien changer » est un
  // VRAI no-op sur les données, et c'est ce qui permet de le certifier sans
  // risque. Les rangs ne se renumérotent que lorsque la séance a réellement
  // changé — une série ajoutée n'a pas de rang d'origine, une série retirée en
  // laisse un absent, et la règle repart alors de 1.
  //
  // L'ÉCRAN, LUI, NE CHANGE PAS : l'assertion de la fin le prouve — mêmes
  // étiquettes après l'aller-retour. C'est le stockage qui cesse de bouger.
  test('aller-retour : mêmes lignes, mêmes identifiants, rangs D’ORIGINE préservés', () => {
    const s = Seance.reprendre(SESSION, blocsDe(LIGNES));
    const relues = Seance.lignes(s);
    expect(relues).toHaveLength(LIGNES.length);
    expect(relues.map((l) => l.id).sort()).toEqual(['l1', 'l2', 'l3', 'l4', 'l5', 'l6']);
    // Les rangs de la base : 1,2,4 pour squat et 3,5 pour dc — ENTRELACÉS.
    expect(relues.map((l) => l.rang)).toEqual([1, 2, 4, 3, 5, 6]);
    // Chaque ligne retrouve SON rang, pas une place dans une nouvelle suite.
    relues.forEach((l) => {
      expect(l.rang).toBe(LIGNES.filter((o) => o.id === l.id)[0].rang);
    });
    expect(relues.map((l) => l.exercise_slug))
      .toEqual(['squat', 'squat', 'squat', 'dc', 'dc', 'pl']);
    expect(relues.map((l) => l.groupe_superset)).toEqual([1, 1, 1, 1, 1, null]);
    // Et relu une seconde fois, l'écran est identique : mêmes étiquettes.
    const avant = blocsDe(LIGNES)[0].series.map((x) => x.etiquette);
    const apres = blocsDe(relues)[0].series.map((x) => x.etiquette);
    expect(apres).toEqual(avant);
  });

  test('un bloc d’un seul portant un numéro ne redevient pas un superset', () => {
    const orphelin = [ligne({ rang: 1, exercise_slug: 'curl', groupe_superset: 4, charge_kg: 20, reps: 10 })];
    const s = Seance.reprendre(SESSION, blocsDe(orphelin));
    expect(groupes(s)).toEqual([null]);
  });
});

describe('refaire une séance (§7 octies.3)', () => {
  const refaite = () => Seance.refaire({
    id: 'neuve', userId: 'u-1', titre: SESSION.titre,
    blocs: blocsDe(LIGNES), idSerie: uuid
  });

  test('c’est un DÉMARRAGE : séance neuve, en cours, sans fin', () => {
    const s = refaite();
    expect(s.id).toBe('neuve');
    expect(s.statut).toBe('en_cours');
    expect(s.fin).toBe(null);
    expect(s.titre).toBe('Jambes du jeudi');
  });

  test('la structure revient — exercices, superset, nombre et TYPE des lignes', () => {
    const s = refaite();
    expect(slugs(s)).toEqual(['squat', 'dc', 'pl']);
    expect(groupes(s)).toEqual([1, 1, null]);
    expect(s.exercices.map((e) => e.series.length)).toEqual([3, 2, 1]);
    expect(s.exercices[0].series.map((x) => x.type_serie))
      .toEqual(['echauffement', 'travail', 'travail']);
  });

  // ⚠️ LE POINT DU §7 octies.3 : aucune charge. Le moteur décide des charges,
  // exactement comme au démarrage depuis une routine (§1, §7 septies.1).
  test('AUCUNE charge, aucune rep, aucune durée, aucune validation', () => {
    const s = refaite();
    const toutes = s.exercices.reduce((acc, e) => acc.concat(e.series), []);
    expect(toutes).toHaveLength(6);
    toutes.forEach((x) => {
      expect(x.charge_kg).toBe(null);
      expect(x.reps).toBe(null);
      expect(x.duree_s).toBe(null);
      expect(x.distance_m).toBe(null);
      expect(x.rpe).toBe(null);
      expect(x.validee_a).toBe(null);
      expect(x.repos_s).toBe(null);
    });
    // Rien à écrire tant que rien n'est validé (`sets_validee_si_saisie`).
    expect(Seance.lignes(s)).toEqual([]);
  });

  test('les notes d’exercice reviennent, elles', () => {
    const lignes = LIGNES.map((l) => l.exercise_slug === 'squat'
      ? Object.assign({}, l, { note: 'ceinture' }) : l);
    const s = Seance.refaire({ id: 'n2', userId: 'u-1', blocs: blocsDe(lignes), idSerie: uuid });
    expect(s.exercices[0].note).toBe('ceinture');
  });

  // Refaire n'est pas dérouler la routine : la question de fin (§6) n'aurait
  // rien de sensé à comparer, et les lignes de routine ont pu bouger depuis.
  test('elle ne se rattache PAS à la routine d’origine', () => {
    const s = refaite();
    expect(s.routine_id).toBe(null);
    expect(s.exercices.every((e) => e.routine_exercise_id === null)).toBe(true);
  });

  test('les identifiants de séries sont NEUFS — rien n’écrase l’ancienne séance', () => {
    const s = refaite();
    const ids = s.exercices.reduce((acc, e) => acc.concat(e.series.map((x) => x.id)), []);
    expect(ids.some((id) => ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'].indexOf(id) >= 0)).toBe(false);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
