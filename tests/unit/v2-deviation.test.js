//
// v2 — la déviation en séance, et le superset dans la routine (chantier 28).
//
// ══ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) ═════════════════════
//
//   UN SUPERSET À TROIS EXERCICES, ET UN DÉPLACEMENT AU MILIEU DE LA LISTE.
//
// Sur un superset à DEUX, « dégrouper un exercice » (§5.8) et « dissoudre le
// bloc » donnent exactement le même écran : il reste deux blocs d'un seul dans
// les deux cas. Il faut un troisième exercice pour que la différence existe —
// l'un sort, les deux autres restent groupés.
//
// Et en déplaçant le DERNIER bloc, « renuméroter les rangs » et « ne rien
// faire » sont indistinguables : rien ne bouge derrière lui. Le déplacement se
// fait donc au milieu, là où les rangs de tout ce qui suit doivent suivre sans
// se heurter à `sets_rang_unique`.

const Seance = require('../../v2/js/seance.js');
const Modele = require('../../v2/js/modele.js');
const Routines = require('../../v2/js/routines.js');

const USER = 'u-1';
let graine = 0;
const uuid = () => 'set-' + (++graine);

const CATALOGUE = [
  { slug: 'squat', nom: 'Squat', mesure: 'charge_reps', charge: 'externe', muscles_primaires: [], muscles_secondaires: [] },
  { slug: 'dc', nom: 'Développé Couché', mesure: 'charge_reps', charge: 'externe', muscles_primaires: [], muscles_secondaires: [] },
  { slug: 'curl', nom: 'Curl', mesure: 'charge_reps', charge: 'externe', muscles_primaires: [], muscles_secondaires: [] },
  { slug: 'ec', nom: 'Écarté', mesure: 'charge_reps', charge: 'externe', muscles_primaires: [], muscles_secondaires: [] },
  { slug: 'pl', nom: 'Planche', mesure: 'temps', charge: 'aucune', muscles_primaires: [], muscles_secondaires: [] }
];

// Une routine : `[slug, nbSéries, groupe]`.
function routineDe(lignes) {
  return {
    id: 'r-1', nom: 'Test',
    exercices: lignes.map(([slug, series, groupe], i) => ({
      id: 're' + i, routine_id: 'r-1', exercise_slug: slug, rang: i,
      series: series, reps_visees: null, repos_cible_s: null,
      note: null, groupe_superset: groupe === undefined ? null : groupe
    }))
  };
}

function seanceDe(lignes) {
  const r = routineDe(lignes);
  return { routine: r, seance: Seance.creer({ id: 'S', userId: USER, routine: r, idSerie: uuid }) };
}

const blocs = (s) => Modele.blocsDeSeance(s, CATALOGUE);
const formes = (s) => blocs(s).map((b) => b.exercices.map((x) => x.slug));
const etiquettes = (s) => blocs(s).map((b) => b.series.map((x) => x.etiquette));
const groupes = (s) => s.exercices.map((e) => e.groupe_superset);

let horloge = Date.parse('2026-09-13T10:00:00Z');
function valider(s, i, j) {
  horloge += 60000;
  return Seance.valider(s, i, j, new Date(horloge));
}

// L'indice des exercices d'un bloc, comme app.js les calcule.
const indicesDe = (b) => b.exercices.map((x) => x._iExo);

// ══ 1. GROUPER EN SÉANCE ═══════════════════════════════════════════════════

describe('grouper deux blocs en séance (§5.7)', () => {
  test('ils s’entrelacent, et le bloc est un superset', () => {
    let { seance: s } = seanceDe([['squat', 2, null], ['dc', 2, null]]);
    expect(formes(s)).toEqual([['squat'], ['dc']]);

    const b = blocs(s);
    s = Seance.grouperBlocs(s, indicesDe(b[0]), indicesDe(b[1]));
    expect(formes(s)).toEqual([['squat', 'dc']]);
    expect(etiquettes(s)).toEqual([['A1', 'B1', 'A2', 'B2']]);
    expect(groupes(s)).toEqual([1, 1]);
  });

  // ⚠️ CE QUI EST DÉJÀ SAISI NE SE PERD PAS. C'est la garantie du chantier :
  // grouper est un geste d'ORDRE, pas de contenu.
  test('les séries déjà validées, leurs valeurs et leurs notes voyagent avec', () => {
    let { seance: s } = seanceDe([['squat', 2, null], ['dc', 2, null]]);
    s = Seance.modifierSerie(s, 0, 0, { charge_kg: 100, reps: 5 });
    s = Seance.definirNoteExercice(s, 0, 'Barre basse');
    s = Seance.definirReposCible(s, 0, 120);
    s = valider(s, 0, 0);
    const avant = Seance.lignes(s);

    const b = blocs(s);
    s = Seance.grouperBlocs(s, indicesDe(b[0]), indicesDe(b[1]));
    const apres = Seance.lignes(s);

    expect(apres).toHaveLength(1);
    expect(apres[0]).toMatchObject({
      id: avant[0].id, charge_kg: 100, reps: 5,
      note: 'Barre basse', validee_a: avant[0].validee_a
    });
    // Le repos cible de l'exercice reste le sien, pas celui du bloc.
    expect(s.exercices[0].repos_cible_s).toBe(120);
    expect(s.exercices[1].repos_cible_s).toBe(null);
  });

  test('grouper un bloc DISTANT le ramène juste après le premier (§5.7)', () => {
    let { seance: s } = seanceDe([['squat', 1, null], ['dc', 1, null], ['curl', 1, null]]);
    const b = blocs(s);
    // Le premier avec le TROISIÈME : « ça marche à n'importe quelle distance ».
    s = Seance.grouperBlocs(s, indicesDe(b[0]), indicesDe(b[2]));
    expect(formes(s)).toEqual([['squat', 'curl'], ['dc']]);
  });

  test('grouper un superset avec un exercice seul fait un bloc de trois', () => {
    let { seance: s } = seanceDe([['squat', 1, 1], ['dc', 1, 1], ['curl', 1, null]]);
    const b = blocs(s);
    s = Seance.grouperBlocs(s, indicesDe(b[0]), indicesDe(b[1]));
    expect(formes(s)).toEqual([['squat', 'dc', 'curl']]);
    expect(etiquettes(s)).toEqual([['A1', 'B1', 'C1']]);
  });

  test('grouper un bloc avec lui-même ne fait rien', () => {
    const { seance: s } = seanceDe([['squat', 1, null], ['dc', 1, null]]);
    const b = blocs(s);
    expect(Seance.grouperBlocs(s, indicesDe(b[0]), indicesDe(b[0]))).toBe(s);
  });
});

// ══ 3 ET 4. DÉGROUPER ══════════════════════════════════════════════════════

describe('dégrouper UN exercice (§5.8)', () => {
  // ⚠️ LA CONFIGURATION DISCRIMINANTE. À deux, « sortir un exercice » et
  // « dissoudre le bloc » rendent le même écran.
  test('dans un superset à TROIS : il sort, les deux autres restent groupés', () => {
    let { seance: s } = seanceDe([['squat', 2, 1], ['dc', 2, 1], ['curl', 2, 1]]);
    expect(formes(s)).toEqual([['squat', 'dc', 'curl']]);

    // On sort celui du MILIEU : c'est le cas où « il sort » et « le bloc se
    // coupe en deux » se distinguent.
    s = Seance.degrouperExercice(s, 1, indicesDe(blocs(s)[0]));
    expect(formes(s)).toEqual([['squat', 'curl'], ['dc']]);
    expect(etiquettes(s)).toEqual([['A1', 'B1', 'A2', 'B2'], ['1', '2']]);
  });

  // §5.8 — « il se place JUSTE APRÈS son bloc d'origine. Il ne remonte pas en
  // fin de séance. »
  test('il se pose juste APRÈS son bloc, pas en fin de séance', () => {
    let { seance: s } = seanceDe([['squat', 1, 1], ['dc', 1, 1], ['curl', 1, 1], ['ec', 1, null]]);
    s = Seance.degrouperExercice(s, 0, indicesDe(blocs(s)[0]));
    expect(formes(s)).toEqual([['dc', 'curl'], ['squat'], ['ec']]);
  });

  // §5.9 — « un superset tombé à un seul exercice cesse d'être un superset ».
  test('dans un superset à DEUX : le bloc disparaît, deux blocs simples restent', () => {
    let { seance: s } = seanceDe([['squat', 2, 1], ['dc', 2, 1]]);
    s = Seance.degrouperExercice(s, 0, indicesDe(blocs(s)[0]));
    expect(formes(s)).toEqual([['squat'], ['dc']]);
    expect(groupes(s)).toEqual([null, null]);
    expect(etiquettes(s)).toEqual([['1', '2'], ['1', '2']]);
  });

  test('dégrouper garde les séries validées, comme grouper', () => {
    let { seance: s } = seanceDe([['squat', 2, 1], ['dc', 2, 1], ['curl', 2, 1]]);
    s = Seance.modifierSerie(s, 1, 0, { charge_kg: 40, reps: 12 });
    s = valider(s, 1, 0);
    s = Seance.degrouperExercice(s, 1, indicesDe(blocs(s)[0]));
    const lignes = Seance.lignes(s);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ exercise_slug: 'dc', charge_kg: 40, reps: 12 });
  });

  test('dégrouper un exercice qui n’est dans aucun superset ne fait rien', () => {
    const { seance: s } = seanceDe([['squat', 1, null], ['dc', 1, null]]);
    expect(Seance.degrouperExercice(s, 0, [0])).toBe(s);
  });
});

// ══ 5. REMPLACER ═══════════════════════════════════════════════════════════
//
// §5.2 — « Remplacer est un ajouter suivi d'un sauter, en gardant la position »,
// et « sauter n'existe pas : un exercice sans série validée n'est pas dans la
// séance enregistrée ». D'où les deux cas, qui ne s'inventent pas.

describe('remplacer un exercice (§5.2)', () => {
  test('sans série validée, l’ancien DISPARAÎT — il n’a jamais eu lieu', () => {
    let { seance: s } = seanceDe([['squat', 3, null], ['dc', 1, null]]);
    s = Seance.remplacerExercice(s, 0, 'curl', uuid);
    expect(formes(s)).toEqual([['curl'], ['dc']]);
    // Il hérite du SLOT : même nombre de lignes.
    expect(s.exercices[0].series).toHaveLength(3);
    expect(Seance.lignes(s)).toEqual([]);
  });

  test('avec des séries validées, elles RESTENT sous l’ancien nom', () => {
    let { seance: s } = seanceDe([['squat', 3, null], ['dc', 1, null]]);
    s = Seance.modifierSerie(s, 0, 0, { charge_kg: 120, reps: 5 });
    s = valider(s, 0, 0);
    s = Seance.remplacerExercice(s, 0, 'curl', uuid);

    expect(formes(s)).toEqual([['squat'], ['curl'], ['dc']]);
    // L'ancien ne garde QUE ce qui a été fait : ses lignes vides partent avec
    // le « sauter ».
    expect(s.exercices[0].series).toHaveLength(1);
    const lignes = Seance.lignes(s);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ exercise_slug: 'squat', charge_kg: 120, reps: 5 });
  });

  test('le nouveau hérite du SLOT, et de rien d’autre', () => {
    let { seance: s, routine } = seanceDe([['squat', 2, null]]);
    s = Seance.definirReposCible(s, 0, 150);
    s = Seance.definirNoteExercice(s, 0, 'Barre basse');
    s = Seance.remplacerExercice(s, 0, 'curl', uuid);

    const neuf = s.exercices[0];
    expect(neuf.exercise_slug).toBe('curl');
    // Le repos est celui du créneau : il vaut pour la place, pas pour le nom.
    expect(neuf.repos_cible_s).toBe(150);
    // La note et les reps visées décrivaient l'ANCIEN mouvement. « Barre basse »
    // ne veut rien dire sur un curl.
    expect(neuf.note).toBe(null);
    expect(neuf.reps_visees).toBe(null);
    // Et ce n'est plus la ligne de routine : ce serait mentir sur la séance.
    expect(neuf.routine_exercise_id).toBe(null);
    expect(routine.exercices[0].exercise_slug).toBe('squat');
  });

  test('remplacer DANS un superset garde le superset', () => {
    let { seance: s } = seanceDe([['squat', 1, 1], ['dc', 1, 1], ['curl', 1, 1]]);
    s = Seance.remplacerExercice(s, 1, 'ec', uuid);
    expect(formes(s)).toEqual([['squat', 'ec', 'curl']]);
    expect(etiquettes(s)).toEqual([['A1', 'B1', 'C1']]);
  });

  test('remplacer dans un superset AVEC du travail fait laisse les deux dedans', () => {
    let { seance: s } = seanceDe([['squat', 2, 1], ['dc', 2, 1]]);
    s = valider(s, 1, 0);
    s = Seance.remplacerExercice(s, 1, 'ec', uuid);
    // L'ancien reste, le neuf se pose derrière, et les deux sont dans le bloc.
    expect(formes(s)).toEqual([['squat', 'dc', 'ec']]);
    expect(groupes(s)).toEqual([1, 1, 1]);
  });
});

// ══ 6. DÉPLACER ════════════════════════════════════════════════════════════

describe('déplacer un bloc (§5.5)', () => {
  // ⚠️ AU MILIEU DE LA LISTE : en déplaçant le dernier, « renuméroter » et « ne
  // rien faire » donnent les mêmes rangs.
  test('un bloc simple descend, et les rangs se renumérotent sans trou', () => {
    let { seance: s } = seanceDe([['squat', 2, null], ['dc', 2, null], ['curl', 2, null]]);
    [0, 1, 2].forEach((i) => { s = valider(s, i, 0); s = valider(s, i, 1); });
    expect(Seance.lignes(s).map((l) => l.exercise_slug))
      .toEqual(['squat', 'squat', 'dc', 'dc', 'curl', 'curl']);

    // Le bloc du MILIEU passe en tête.
    s = Seance.deplacerVers(s, [1], 0);
    expect(formes(s)).toEqual([['dc'], ['squat'], ['curl']]);

    const lignes = Seance.lignes(s);
    expect(lignes.map((l) => l.exercise_slug))
      .toEqual(['dc', 'dc', 'squat', 'squat', 'curl', 'curl']);
    // Les rangs repartent de 1, sans trou et sans doublon : c'est ce que
    // `sets_rang_unique` exige, et un lot les envoie ensemble.
    expect(lignes.map((l) => l.rang)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(lignes.map((l) => l.rang)).size).toBe(lignes.length);
  });

  test('un bloc SUPERSET se déplace ENTIER, jamais une de ses branches', () => {
    let { seance: s } = seanceDe(
      [['squat', 1, null], ['dc', 1, 1], ['curl', 1, 1], ['ec', 1, null]]);
    expect(formes(s)).toEqual([['squat'], ['dc', 'curl'], ['ec']]);

    const b = blocs(s);
    // Le superset monte en tête : ses deux branches partent ensemble.
    s = Seance.deplacerVers(s, indicesDe(b[1]), 0);
    expect(formes(s)).toEqual([['dc', 'curl'], ['squat'], ['ec']]);
    expect(groupes(s)).toEqual([1, 1, null, null]);
    expect(etiquettes(s)).toEqual([['A1', 'B1'], ['1'], ['1']]);
  });

  test('descendre un bloc le pose APRÈS son voisin, pas devant', () => {
    let { seance: s } = seanceDe([['squat', 1, null], ['dc', 1, 1], ['curl', 1, 1]]);
    // `squat` descend derrière le superset : la cible est l'indice suivant le
    // dernier exercice du voisin.
    s = Seance.deplacerVers(s, [0], 3);
    expect(formes(s)).toEqual([['dc', 'curl'], ['squat']]);
  });

  test('un déplacement au-delà des bornes se range aux bornes', () => {
    let { seance: s } = seanceDe([['squat', 1, null], ['dc', 1, null]]);
    expect(formes(Seance.deplacerVers(s, [1], 99))).toEqual([['squat'], ['dc']]);
    expect(formes(Seance.deplacerVers(s, [1], -5))).toEqual([['dc'], ['squat']]);
  });
});

// ══ 7. SUPPRIMER ═══════════════════════════════════════════════════════════

describe('supprimer un bloc ou une branche', () => {
  test('on compte ce qui serait perdu — la confirmation en dépend', () => {
    let { seance: s } = seanceDe([['squat', 3, 1], ['dc', 3, 1]]);
    expect(Seance.compterAEffacer(s, [0, 1]).lignes).toBe(0);
    s = valider(s, 0, 0); s = valider(s, 1, 0); s = valider(s, 0, 1);
    expect(Seance.compterAEffacer(s, [0, 1]).lignes).toBe(3);
    expect(Seance.compterAEffacer(s, [1]).lignes).toBe(1);
  });

  test('supprimer un bloc entier retire toutes ses branches', () => {
    let { seance: s } = seanceDe([['squat', 1, 1], ['dc', 1, 1], ['curl', 1, null]]);
    s = Seance.retirerExercices(s, indicesDe(blocs(s)[0]));
    expect(formes(s)).toEqual([['curl']]);
  });

  test('supprimer UNE branche d’un superset à deux dissout le bloc', () => {
    let { seance: s } = seanceDe([['squat', 1, 1], ['dc', 1, 1]]);
    s = Seance.retirerExercices(s, [0]);
    expect(formes(s)).toEqual([['dc']]);
    expect(groupes(s)).toEqual([null]);
  });

  test('supprimer une branche d’un superset à trois laisse les deux autres groupées', () => {
    let { seance: s } = seanceDe([['squat', 1, 1], ['dc', 1, 1], ['curl', 1, 1]]);
    s = Seance.retirerExercices(s, [1]);
    expect(formes(s)).toEqual([['squat', 'curl']]);
    expect(groupes(s)).toEqual([1, 1]);
  });
});

// ══ AJOUTER APRÈS ══════════════════════════════════════════════════════════

describe('ajouter un exercice après un bloc (§5 bis)', () => {
  test('il se pose à la position demandée, en bloc d’un seul', () => {
    let { seance: s } = seanceDe([['squat', 1, 1], ['dc', 1, 1], ['curl', 1, null]]);
    s = Seance.insererExercice(s, 2, 'ec', uuid);
    expect(formes(s)).toEqual([['squat', 'dc'], ['ec'], ['curl']]);
    expect(groupes(s)).toEqual([1, 1, null, null]);
  });

  test('il ne s’invente pas de ligne de routine', () => {
    let { seance: s } = seanceDe([['squat', 1, null]]);
    s = Seance.insererExercice(s, 1, 'ec', uuid);
    expect(s.exercices[1].routine_exercise_id).toBe(null);
    expect(s.exercices[1].series).toHaveLength(1);
  });
});

// ══ LA CONTIGUÏTÉ, ET LES MARQUES DE TOUR ══════════════════════════════════

describe('normaliserGroupes tient la contiguïté (§2.3)', () => {
  test('deux exercices du même groupe SÉPARÉS ne forment plus un bloc', () => {
    let { seance: s } = seanceDe([['squat', 1, 1], ['dc', 1, null], ['curl', 1, 1]]);
    // Tels quels, `memeBloc` ne les colle pas — ils ne sont pas voisins.
    expect(formes(s)).toEqual([['squat'], ['dc'], ['curl']]);
    // Et la normalisation le grave : plus aucun groupe ne subsiste.
    s = Seance.normaliserGroupes(s);
    expect(groupes(s)).toEqual([null, null, null]);
  });

  test('les numéros se renumérotent de 1, dans l’ordre de la séance', () => {
    let { seance: s } = seanceDe(
      [['squat', 1, 7], ['dc', 1, 7], ['curl', 1, 3], ['ec', 1, 3]]);
    s = Seance.normaliserGroupes(s);
    expect(groupes(s)).toEqual([1, 1, 2, 2]);
  });

  // ⚠️ Les marques de tour sont indexées PAR NUMÉRO DE GROUPE. Renuméroter sans
  // les jeter ferait pointer la marque d'un bloc sur un autre.
  test('elles emportent les marques de tour, que l’appelant re-sème', () => {
    let { seance: s } = seanceDe([['squat', 2, 1], ['dc', 2, 1]]);
    s = valider(s, 0, 0); s = valider(s, 1, 0);
    s = Seance.avancerTours(s, Modele.toursFaitsParGroupe(blocs(s)));
    expect(Seance.tourAtteint(s, 1)).toBe(1);

    s = Seance.normaliserGroupes(s);
    expect(s.tours).toBeUndefined();
    // Re-semée depuis l'état courant, la marque se reconstruit d'elle-même.
    s = Seance.avancerTours(s, Modele.toursFaitsParGroupe(blocs(s)));
    expect(Seance.tourAtteint(s, 1)).toBe(1);
  });
});

// ══ 2. LE SUPERSET DANS L'ÉDITEUR DE ROUTINE ═══════════════════════════════

describe('le groupement dans l’éditeur (§1.3 du chantier)', () => {
  const liste = (groupes) => groupes.map((g, i) => ({
    id: 'e' + i, exercise_slug: 's' + i, series: 3,
    reps_visees: null, repos_cible_s: null, note: null, groupe_superset: g
  }));

  test('les liens se lisent de l’adjacence, pas des numéros', () => {
    expect(Routines.liens(liste([1, 1, null, 2, 2]))).toEqual([true, false, false, true]);
    // Même numéro mais NON voisins : pas de lien — c'est ce que `memeBloc` voit.
    expect(Routines.liens(liste([1, null, 1]))).toEqual([false, false]);
  });

  test('poser un lien crée le groupe, l’enlever le défait', () => {
    let l = liste([null, null, null]);
    l = Routines.basculerLien(l, 0);
    expect(l.map((e) => e.groupe_superset)).toEqual([1, 1, null]);
    l = Routines.basculerLien(l, 1);
    expect(l.map((e) => e.groupe_superset)).toEqual([1, 1, 1]);
    l = Routines.basculerLien(l, 0);
    // Le premier sort ; les deux suivants restent groupés, renumérotés depuis 1.
    expect(l.map((e) => e.groupe_superset)).toEqual([null, 1, 1]);
  });

  test('un groupe tombé à un seul exercice cesse d’en être un (§5.9)', () => {
    let l = liste([1, 1]);
    l = Routines.basculerLien(l, 0);
    expect(l.map((e) => e.groupe_superset)).toEqual([null, null]);
  });

  // ⚠️ Déplacer relit les liens de la NOUVELLE adjacence : glisser un exercice
  // au milieu d'un superset le coupe, l'en sortir le dégroupe. Les deux se
  // voient tout de suite, à l'endroit où le lien vient de céder.
  test('renuméroter après un déplacement suit la nouvelle adjacence', () => {
    const l = liste([1, 1, null]);
    // On intercale le troisième entre les deux premiers.
    const bouge = [l[0], l[2], l[1]];
    expect(Routines.renumeroter(bouge).map((e) => e.groupe_superset))
      .toEqual([null, null, null]);
  });

  test('le plan d’écritures reporte le groupement, sans toucher aux charges', () => {
    const avant = liste([null, null]).map((e, i) => Object.assign({}, e, { rang: i }));
    const voulues = Routines.appliquerLiens(avant, [true]);
    const plan = Routines.planEcritures(avant, voulues, 'r-1');
    expect(plan.suppressions).toEqual([]);
    expect(plan.insertions).toEqual([]);
    expect(plan.majs).toEqual([
      { id: 'e0', champs: { groupe_superset: 1 } },
      { id: 'e1', champs: { groupe_superset: 1 } }
    ]);
  });

  test('la note et le groupe partent en base ; aucune charge ne suit', () => {
    const ligne = Routines.normaliserExercice(
      { exercise_slug: 'squat', series: 3, groupe_superset: 2, note: '  Ceinture  ',
        charge_kg: 120, poids: 99 }, 'r-1', 0);
    expect(ligne).toEqual({
      routine_id: 'r-1', exercise_slug: 'squat', rang: 0, series: 3,
      reps_visees: null, repos_cible_s: null, groupe_superset: 2, note: 'Ceinture'
    });
    expect(Object.keys(ligne).some((k) => /charge|poids|kg/i.test(k))).toBe(false);
  });

  // `routine_exercises.id` a `gen_random_uuid()` en défaut : l'app peut donc
  // fournir le sien, et c'est ce qui rend le report de fin de séance idempotent.
  test('un identifiant fourni voyage jusqu’à l’insertion', () => {
    expect(Routines.normaliserExercice({ exercise_slug: 'x', id: 'neuf-1' }, 'r-1', 0).id)
      .toBe('neuf-1');
    expect('id' in Routines.normaliserExercice({ exercise_slug: 'x' }, 'r-1', 0)).toBe(false);
  });

  // `routine_exos_superset_positif` : NULL ou >= 0, relevé sur le CHECK de la
  // base. Un numéro négatif serait refusé par Postgres — donc il ne part pas.
  test('un numéro de groupe absurde ne part pas en base', () => {
    const g = (v) => Routines.normaliserExercice(
      { exercise_slug: 'x', groupe_superset: v }, 'r-1', 0).groupe_superset;
    expect(g(-1)).toBe(null);
    expect(g(1.5)).toBe(null);
    expect(g('deux')).toBe(null);
    expect(g(0)).toBe(0);
    expect(g(3)).toBe(3);
  });
});

// ══ 7 bis. APPLIQUER LE PLAN — L'ORDRE, ET CE QU'ON DIT QUAND ÇA CASSE ═════

describe('appliquerPlan (chantier 28 : un seul chemin d’écriture)', () => {
  const plan = {
    suppressions: ['re9'],
    majs: [{ id: 're0', champs: { rang: 1 } }],
    insertions: [{ id: 'neuf', routine_id: 'r-1', exercise_slug: 'x', rang: 2 }]
  };

  test('suppressions, puis majs, puis insertions — l’ordre est imposé', async () => {
    const trace = [];
    await Routines.appliquerPlan(plan, {
      supprimerExercices: async () => { trace.push('supprime'); },
      majExercice: async () => { trace.push('maj'); },
      insererExercices: async () => { trace.push('insere'); }
    });
    expect(trace).toEqual(['supprime', 'maj', 'insere']);
  });

  // ⚠️ CE QUE LE RETOUR SEUL PERDAIT. Une écriture qui casse au MILIEU a quand
  // même touché la base : `appliquerPlan` jette, donc ne retourne rien, et
  // l'appelant croirait que rien n'est parti. `onEcrit` le dit au fil de l'eau.
  test('une casse au milieu a QUAND MÊME signalé ce qui est parti', async () => {
    let dits = 0;
    await expect(Routines.appliquerPlan(plan, {
      supprimerExercices: async () => {},
      majExercice: async () => { throw new Error('23505'); },
      insererExercices: async () => {}
    }, () => { dits++; })).rejects.toThrow('23505');
    expect(dits).toBe(1);   // la suppression, elle, est bien partie
  });

  test('un plan vide n’écrit rien et ne signale rien', async () => {
    let dits = 0;
    const ecrit = await Routines.appliquerPlan(
      { suppressions: [], majs: [], insertions: [] },
      { supprimerExercices: async () => {}, majExercice: async () => {},
        insererExercices: async () => {} },
      () => { dits++; });
    expect(ecrit).toBe(false);
    expect(dits).toBe(0);
  });
});

// ══ 8. LA QUESTION DE FIN PORTE SUR LA STRUCTURE (§6) ══════════════════════

describe('les écarts de structure (§6.2)', () => {
  test('aucune déviation → aucune question, et la liste voulue est la routine', () => {
    const { seance: s, routine } = seanceDe([['squat', 3, null], ['dc', 2, 1], ['curl', 2, 1]]);
    const v = Seance.ecartsRoutine(s, routine);
    expect(v.ecarts).toEqual([]);
    expect(v.voulues.map((x) => [x.id, x.exercise_slug, x.series, x.groupe_superset]))
      .toEqual([['re0', 'squat', 3, null], ['re1', 'dc', 2, 1], ['re2', 'curl', 2, 1]]);
  });

  test('un exercice ajouté se rapporte comme ajouté', () => {
    let { seance: s, routine } = seanceDe([['squat', 2, null]]);
    s = Seance.insererExercice(s, 1, 'curl', uuid);
    const v = Seance.ecartsRoutine(s, routine);
    expect(v.ecarts).toEqual([{ type: 'ajoute', exercise_slug: 'curl' }]);
    expect(v.voulues.map((x) => x.id)).toEqual(['re0', null]);
  });

  test('un exercice retiré se rapporte comme retiré', () => {
    let { seance: s, routine } = seanceDe([['squat', 2, null], ['dc', 2, null]]);
    s = Seance.retirerExercices(s, [1]);
    expect(Seance.ecartsRoutine(s, routine).ecarts)
      .toEqual([{ type: 'retire', exercise_slug: 'dc' }]);
  });

  test('un remplacement se rapporte comme un retrait ET un ajout', () => {
    let { seance: s, routine } = seanceDe([['squat', 2, null]]);
    s = Seance.remplacerExercice(s, 0, 'curl', uuid);
    expect(Seance.ecartsRoutine(s, routine).ecarts).toEqual([
      { type: 'retire', exercise_slug: 'squat' },
      { type: 'ajoute', exercise_slug: 'curl' }
    ]);
  });

  test('un déplacement se rapporte comme un changement d’ordre', () => {
    let { seance: s, routine } = seanceDe([['squat', 1, null], ['dc', 1, null], ['curl', 1, null]]);
    s = Seance.deplacerVers(s, [1], 0);
    const v = Seance.ecartsRoutine(s, routine);
    expect(v.ecarts).toEqual([{ type: 'ordre' }]);
    expect(v.voulues.map((x) => x.id)).toEqual(['re1', 're0', 're2']);
  });

  test('un groupement se rapporte comme un groupement', () => {
    let { seance: s, routine } = seanceDe([['squat', 1, null], ['dc', 1, null]]);
    s = Seance.grouperBlocs(s, [0], [1]);
    expect(Seance.ecartsRoutine(s, routine).ecarts).toEqual([{ type: 'groupement' }]);
  });

  test('un dégroupement aussi', () => {
    let { seance: s, routine } = seanceDe([['squat', 1, 1], ['dc', 1, 1], ['curl', 1, 1]]);
    s = Seance.degrouperExercice(s, 1, [0, 1, 2]);
    const v = Seance.ecartsRoutine(s, routine);
    expect(v.ecarts.map((e) => e.type).sort()).toEqual(['groupement', 'ordre']);
    expect(v.voulues.map((x) => [x.id, x.groupe_superset]))
      .toEqual([['re0', 1], ['re2', 1], ['re1', null]]);
  });

  // ⚠️ La FORME du groupement, pas ses numéros : un superset renuméroté d'un
  // cran n'est pas une déviation.
  test('un superset renuméroté sans changer de forme n’est PAS une déviation', () => {
    const routine = routineDe([['squat', 1, 5], ['dc', 1, 5]]);
    const s = Seance.creer({ id: 'S2', userId: USER, routine: routine, idSerie: uuid });
    // La séance normalise à 1 ; la routine porte 5. Même forme, aucun écart.
    expect(Seance.normaliserGroupes(s).exercices.map((e) => e.groupe_superset)).toEqual([1, 1]);
    expect(Seance.ecartsRoutine(Seance.normaliserGroupes(s), routine).ecarts).toEqual([]);
  });

  // §6.3 — « pas le nombre de séries fait ce jour-là : une séance écourtée par
  // manque de temps amputerait la routine pour toujours. »
  test('le nombre de séries NE se reporte PAS', () => {
    let { seance: s, routine } = seanceDe([['squat', 4, null]]);
    s = Seance.retirerSerie(s, 0, 0);
    s = Seance.retirerSerie(s, 0, 0);           // séance écourtée : 2 lignes
    expect(s.exercices[0].series).toHaveLength(2);
    const v = Seance.ecartsRoutine(s, routine);
    expect(v.ecarts).toEqual([]);               // écourter n'est pas dévier
    expect(v.voulues[0].series).toBe(4);        // la routine garde ses 4
  });

  test('un exercice AJOUTÉ prend son nombre de lignes, faute de référence', () => {
    let { seance: s, routine } = seanceDe([['squat', 2, null]]);
    s = Seance.insererExercice(s, 1, 'curl', uuid);
    s = Seance.ajouterSerie(s, 1, uuid);
    expect(Seance.ecartsRoutine(s, routine).voulues[1].series).toBe(2);
  });

  test('structure et repos se rapportent ENSEMBLE, dans la même question', () => {
    let { seance: s, routine } = seanceDe([['squat', 1, null], ['dc', 1, null]]);
    s = Seance.definirReposCible(s, 0, 90);
    s = Seance.grouperBlocs(s, [0], [1]);
    const v = Seance.ecartsRoutine(s, routine);
    expect(v.ecarts.map((e) => e.type)).toEqual(['repos', 'groupement']);
    expect(v.voulues.map((x) => [x.repos_cible_s, x.groupe_superset]))
      .toEqual([[90, 1], [null, 1]]);
  });

  // Le report passe par `planEcritures`, exactement comme l'éditeur : une seule
  // façon d'écrire une routine, donc une seule façon de se tromper.
  test('le plan issu du report ajoute, retire et réordonne sans collision de rang', () => {
    let { seance: s, routine } = seanceDe([['squat', 2, null], ['dc', 2, null], ['curl', 2, null]]);
    s = Seance.deplacerVers(s, [2], 0);                  // → curl, squat, dc
    s = Seance.retirerExercices(s, [2]);                 // dc s'en va → curl, squat
    s = Seance.insererExercice(s, 2, 'ec', uuid);        // ec en fin → curl, squat, ec

    const v = Seance.ecartsRoutine(s, routine);
    const voulues = v.voulues.map((x) => x.id ? x : Object.assign({}, x, { id: 'neuf-1' }));
    const plan = Routines.planEcritures(routine.exercices, voulues, 'r-1');

    expect(plan.suppressions).toEqual(['re1']);   // dc
    expect(plan.insertions.map((i) => [i.id, i.exercise_slug, i.rang]))
      .toEqual([['neuf-1', 'ec', 2]]);
    // Les rangs visés ne se heurtent jamais : c'est tout l'objet du plan.
    const finaux = plan.majs.filter((m) => 'rang' in m.champs).map((m) => m.champs.rang);
    expect(new Set(finaux).size).toBe(finaux.length);
  });

  // ⚠️ IDEMPOTENCE : rejoué contre une routine DÉJÀ à jour, le plan est vide.
  // C'est ce qui autorise la file à réessayer sans compter ses tentatives.
  test('rejoué sur une routine déjà à jour, le plan ne fait plus rien', () => {
    let { seance: s, routine } = seanceDe([['squat', 1, null], ['dc', 1, null]]);
    s = Seance.grouperBlocs(s, [0], [1]);
    const voulues = Seance.ecartsRoutine(s, routine).voulues;

    const premier = Routines.planEcritures(routine.exercices, voulues, 'r-1');
    expect(premier.majs.length).toBeGreaterThan(0);

    // La routine telle qu'elle est après application.
    const apres = voulues.map((v, rang) =>
      Object.assign({}, v, { routine_id: 'r-1', rang: rang }));
    const second = Routines.planEcritures(apres, voulues, 'r-1');
    expect(second).toEqual({ suppressions: [], majs: [], insertions: [] });
  });
});
