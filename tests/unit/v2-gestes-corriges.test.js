//
// Chantier 35 — les gestes qui ne s'écrivent pas.
//
// CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : une séance IMPORTÉE
// (`validee_a` NULL **et** `source <> 'app'`) qu'on DÉPLACE et dont on SUPPRIME
// un exercice. Sur une séance de l'app — toutes les séries validées, aucune
// `source` — les trois défauts de ce chantier sont INVISIBLES : `rang_origine`
// est absent donc la renumérotation a lieu de toute façon, `validee_a` est
// renseigné donc l'affichage est juste, et le cache n'a rien à oublier puisque
// la séance vient d'être créée.
//
// Environnement jsdom (PAS de docblock `node`) : `v2/js/modele.js` se termine
// par `this`, que Babel remplace par `undefined` sous l'environnement node.

const Seance = require('../../v2/js/seance.js');
const Modele = require('../../v2/js/modele.js');

const CATALOGUE = [
  { slug: 'squat', nom: 'Squat', mesure: 'charge_reps', charge: 'absolue', muscles_primaires: ['quadriceps'], muscles_secondaires: [] },
  { slug: 'dc', nom: 'DC', mesure: 'charge_reps', charge: 'absolue', muscles_primaires: ['pectoraux'], muscles_secondaires: [] },
  { slug: 'curl', nom: 'Curl', mesure: 'charge_reps', charge: 'absolue', muscles_primaires: ['biceps'], muscles_secondaires: [] }
];

const SESSION = {
  id: 'sess-imp', user_id: 'u-1', titre: 'Séance importée',
  debut: '2026-09-01T17:00:00.000Z', fin: '2026-09-01T18:00:00.000Z',
  statut: 'terminee', salle: null, note: null, routine_id: null, source: 'hevy'
};

// Une ligne TELLE QUE LA BASE LA PORTE : pas de `validee_a`, une `source`
// d'import. Le superset squat/dc est ENTRELACÉ (rangs 1,2,3,4), le curl posé
// derrière (rangs 5,6) — la forme des 53 blocs entrelacés de la base réelle,
// suivie d'un accessoire.
const importee = (o) => Object.assign({
  id: 'l' + o.rang, session_id: 'sess-imp', user_id: 'u-1',
  type_serie: 'travail', charge_kg: 100, reps: 5, duree_s: null, distance_m: null,
  rpe: null, ressenti: 'reste_2', note: null, groupe_superset: 1,
  validee_a: null, repos_s: 120, source: 'hevy'
}, o);

const LIGNES = [
  importee({ rang: 1, exercise_slug: 'squat' }),
  importee({ rang: 2, exercise_slug: 'dc' }),
  importee({ rang: 3, exercise_slug: 'squat' }),
  importee({ rang: 4, exercise_slug: 'dc' }),
  importee({ rang: 5, exercise_slug: 'curl', groupe_superset: null }),
  importee({ rang: 6, exercise_slug: 'curl', groupe_superset: null })
];

const rouvrir = () => Seance.reprendre(SESSION, Modele.construireBlocs(LIGNES, CATALOGUE));
const parRang = (s) => Seance.lignes(s).slice()
  .sort((a, b) => a.rang - b.rang).map((l) => l.exercise_slug + '@' + l.rang);
const iDe = (s, slug) => s.exercices.findIndex((e) => e.exercise_slug === slug);

describe('la séance rouverte, avant tout geste', () => {
  test('elle porte ses six séries, ses rangs d’origine et sa provenance', () => {
    const s = rouvrir();
    expect(Seance.lignes(s)).toHaveLength(6);
    expect(parRang(s)).toEqual(['squat@1', 'dc@2', 'squat@3', 'dc@4', 'curl@5', 'curl@6']);
    expect(Seance.lignes(s).every((l) => l.source === 'hevy')).toBe(true);
  });

  // ⚠️ LE GARDE-FOU DE TOUT LE CHANTIER (§6, test 4). Corriger la suppression
  // ne doit pas réarmer D1 du chantier 34 — l'effacement du corpus entier. Les
  // deux tirent en sens OPPOSÉS : l'un veut que ce qui part de l'écran parte de
  // la base, l'autre que ce qui n'a pas bougé y reste. Le seul juge est
  // `lignes()` sur une séance qu'on n'a fait que ROUVRIR.
  test('⚠️ rouvrir et enregistrer sans rien toucher n’efface RIEN et ne renumérote RIEN', () => {
    const avant = rouvrir();
    const apres = Seance.reprendre(SESSION, Modele.construireBlocs(Seance.lignes(avant), CATALOGUE));
    expect(Seance.lignes(apres)).toHaveLength(6);
    expect(parRang(apres)).toEqual(parRang(avant));
    expect(Seance.idsRetires(LIGNES, avant)).toEqual([]);
  });
});

// ── D2 — DÉPLACER EXPLICITEMENT S'ÉCRIT ─────────────────────────────────────
//
// La garde du chantier 34 garde les rangs lus tant qu'ils sont tous connus et
// tous distincts. Après un DÉPLACEMENT ils le sont toujours — ils décrivent
// simplement l'ancien ordre, et c'est lui qui repartait en base.
describe('D2 — le déplacement', () => {
  test('déplacer un bloc RENUMÉROTE : la base reçoit le nouvel ordre', () => {
    const s = rouvrir();
    const curl = iDe(s, 'curl');
    const bouge = Seance.deplacerVers(s, [curl], 0);
    expect(bouge.exercices[0].exercise_slug).toBe('curl');
    expect(parRang(bouge)).toEqual(['curl@1', 'curl@2', 'squat@3', 'squat@4', 'dc@5', 'dc@6']);
  });

  test('et les rangs d’origine sont OUBLIÉS — ils ne décrivent plus cette séance', () => {
    const bouge = Seance.deplacerVers(rouvrir(), [iDe(rouvrir(), 'curl')], 0);
    const portes = bouge.exercices.reduce((acc, e) => acc.concat(e.series.map((x) => x.rang_origine)), []);
    expect(portes).toEqual([null, null, null, null, null, null]);
  });

  test('un déplacement qui ne bouge rien (liste vide) ne touche à rien', () => {
    const s = rouvrir();
    expect(Seance.deplacerVers(s, [], 0)).toBe(s);
    expect(parRang(Seance.deplacerVers(s, [], 0))).toEqual(parRang(s));
  });

  test('grouper renumérote aussi : le second bloc a bougé', () => {
    const s = rouvrir();
    const groupe = Seance.grouperBlocs(s, [iDe(s, 'squat')], [iDe(s, 'curl')]);
    const portes = groupe.exercices.reduce((acc, e) => acc.concat(e.series.map((x) => x.rang_origine)), []);
    expect(portes.every((r) => r === null)).toBe(true);
    expect(parRang(groupe)).toEqual(['squat@1', 'squat@2', 'curl@3', 'curl@4', 'dc@5', 'dc@6']);
  });

  // ⚠️ CE TEST ÉTAIT CREUX, ET LA CAMPAGNE DE MUTATIONS L'A DIT. Il dégroupait
  // un bloc que `grouperBlocs` venait de créer — les rangs y étaient déjà
  // oubliés, donc retirer l'oubli de `degrouperExercice` ne cassait rien. Le
  // seul banc qui sépare les deux est un superset VENU DE LA BASE, dont les
  // séries portent encore leur rang lu.
  test('dégrouper d’un superset À TROIS renumérote : l’exercice change de place', () => {
    const s = rouvrir();
    // Superset importé à trois : squat, dc et curl portent le même groupe.
    const troisALaSuite = LIGNES.map((l) => Object.assign({}, l, { groupe_superset: 1 }));
    const t = Seance.reprendre(SESSION, Modele.construireBlocs(troisALaSuite, CATALOGUE));
    expect(t.exercices).toHaveLength(3);
    const avant = t.exercices.reduce((acc, e) => acc.concat(e.series.map((x) => x.rang_origine)), []);
    expect(avant.every((r) => typeof r === 'number')).toBe(true);
    const sortie = Seance.degrouperExercice(t, 0, [0, 1, 2]);
    const portes = sortie.exercices.reduce((acc, e) => acc.concat(e.series.map((x) => x.rang_origine)), []);
    expect(portes.every((r) => r === null)).toBe(true);
  });

  // ⚠️ ET L'INVERSE, QUI COMPTE AUTANT. À deux, le superset se dissout sans que
  // rien ne change de place : les rangs lus décrivent toujours la séance, et
  // les jeter renumérterait une séance que personne n'a déplacée.
  test('dégrouper d’un superset À DEUX ne renumérote RIEN — rien n’a bougé', () => {
    const s = rouvrir();
    const sortie = Seance.degrouperExercice(s, 0, [0, 1]);
    const portes = sortie.exercices.reduce((acc, e) => acc.concat(e.series.map((x) => x.rang_origine)), []);
    expect(portes.every((r) => typeof r === 'number')).toBe(true);
    expect(parRang(sortie)).toEqual(parRang(s));
  });

  test('`oublierRangsOrigine` ne touche QUE `rang_origine`', () => {
    const s = rouvrir();
    const o = Seance.oublierRangsOrigine(s);
    expect(Seance.lignes(o)).toHaveLength(6);
    expect(Seance.lignes(o).every((l) => l.source === 'hevy')).toBe(true);
    expect(o.exercices.map((e) => e.exercise_slug)).toEqual(s.exercices.map((e) => e.exercise_slug));
    // Renumérotée par POSITION, donc 1..6 sans trou.
    expect(Seance.lignes(o).map((l) => l.rang).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('sur une séance sans exercices, il rend la séance telle quelle', () => {
    const vide = { id: 'x', exercices: null };
    expect(Seance.oublierRangsOrigine(vide)).toBe(vide);
    expect(Seance.oublierRangsOrigine(null)).toBe(null);
  });
});

// ── D1 — CE QUE LE CACHE DE LECTURE DOIT OUBLIER ────────────────────────────
//
// `Sync.fusionner` fusionne et ne retire jamais ; `sets` se synchronise à
// l'incrément. Une série effacée en base ne revient JAMAIS dire qu'elle n'est
// plus là — d'où la boucle de résurrection : l'écran la remontre, la correction
// suivante la réécrit.
describe('D1 — la suppression que le cache doit apprendre', () => {
  test('supprimer un exercice nomme exactement ses séries comme à retirer', () => {
    const s = rouvrir();
    const sans = Seance.retirerExercices(s, [iDe(s, 'curl')]);
    expect(Seance.lignes(sans)).toHaveLength(4);
    expect(Seance.idsRetires(LIGNES, sans).sort()).toEqual(['l5', 'l6']);
  });

  test('supprimer UNE série ne nomme que celle-là', () => {
    const s = rouvrir();
    const i = iDe(s, 'curl');
    expect(Seance.idsRetires(LIGNES, Seance.retirerSerie(s, i, 0)).sort()).toEqual(['l5']);
  });

  test('⚠️ une série d’une AUTRE séance n’est JAMAIS candidate', () => {
    const s = rouvrir();
    const ailleurs = { id: 'zz', session_id: 'une-autre-seance', validee_a: 'v', source: 'hevy' };
    const sans = Seance.retirerExercices(s, [iDe(s, 'curl')]);
    expect(Seance.idsRetires(LIGNES.concat([ailleurs]), sans)).not.toContain('zz');
    expect(Seance.idsRetires(LIGNES.concat([ailleurs]), sans).sort()).toEqual(['l5', 'l6']);
  });

  test('rien supprimé : rien à retirer, et un cache vide ne lève pas', () => {
    expect(Seance.idsRetires(LIGNES, rouvrir())).toEqual([]);
    expect(Seance.idsRetires([], rouvrir())).toEqual([]);
    expect(Seance.idsRetires(null, rouvrir())).toEqual([]);
    expect(Seance.idsRetires(LIGNES, null)).toEqual([]);
  });

  test('supprimer PUIS déplacer : les deux effets tiennent ensemble', () => {
    const s = rouvrir();
    const sans = Seance.retirerExercices(s, [iDe(s, 'curl')]);
    const bouge = Seance.deplacerVers(sans, [iDe(sans, 'dc')], 0);
    expect(Seance.idsRetires(LIGNES, bouge).sort()).toEqual(['l5', 'l6']);
    expect(parRang(bouge)).toEqual(['dc@1', 'dc@2', 'squat@3', 'squat@4']);
  });
});

// ── D3 — CE QUI A ÉTÉ FAIT S'AFFICHE COMME FAIT ─────────────────────────────
describe('D3 — une séance rouverte n’est pas une séance vierge', () => {
  test('`faiteEnBase` et `partEnBase` répondent la MÊME chose, cas par cas', () => {
    const cas = [
      { validee_a: null, source: 'hevy' },      // importée : faite
      { validee_a: null, source: 'app' },       // saisie, pas validée : pas faite
      { validee_a: null, source: null },        // case vide : pas faite
      { validee_a: null, source: '' },          // source vide : pas faite
      { validee_a: 'v', source: 'app' },        // validée dans l'app : faite
      { validee_a: 'v', source: null },         // validée, sans provenance : faite
      { validee_a: 'v', source: 'hevy' }        // les deux : faite
    ];
    cas.forEach((c) => expect([c, Modele.faiteEnBase(c)]).toEqual([c, Seance.partEnBase(c)]));
    expect(Modele.faiteEnBase(null)).toBe(Seance.partEnBase(null));
    expect(Modele.faiteEnBase(undefined)).toBe(Seance.partEnBase(undefined));
  });

  test('les six séries importées s’affichent FAITES, sans qu’aucun `validee_a` soit écrit', () => {
    const blocs = Modele.construireBlocs(LIGNES, CATALOGUE);
    const toutes = blocs.reduce((acc, b) => acc.concat(b.series), []);
    expect(toutes).toHaveLength(6);
    expect(toutes.every((s) => s.faite === true)).toBe(true);
    // ⚠️ RIEN N'A ÉTÉ ÉCRIT : `validee_a` reste NULL, sinon `bloc.chronologie`
    // basculerait et les séances importées seraient ENTRELACÉES — un ordre que
    // personne n'a fait (Hevy a aplati les tours).
    expect(toutes.every((s) => s.validee_a === null)).toBe(true);
    expect(blocs.every((b) => b.chronologie === false)).toBe(true);
    expect(Seance.lignes(rouvrir()).every((l) => l.validee_a === null)).toBe(true);
  });

  test('une case vide de séance en cours ne s’affiche PAS faite', () => {
    const encours = [{ id: 'a', session_id: 's', exercise_slug: 'squat', rang: 1,
                       type_serie: 'travail', validee_a: null, groupe_superset: null }];
    const blocs = Modele.construireBlocs(encours, CATALOGUE);
    expect(blocs[0].series[0].faite).toBe(false);
  });

  // ⚠️ LA SUPPRESSION SILENCIEUSE. `compterValidees` rendait 0 sur une séance
  // importée : la question n'était jamais posée, et trois semaines de travail
  // partaient sur un seul tap.
  test('supprimer du travail importé est COMPTÉ, donc la question est posée', () => {
    const s = rouvrir();
    expect(Seance.compterAEffacer(s, [iDe(s, 'curl')]).lignes).toBe(2);
    expect(Seance.compterAEffacer(s, [iDe(s, 'squat'), iDe(s, 'dc')]).lignes).toBe(4);
    expect(Seance.compterAEffacer(s, []).lignes).toBe(0);
  });

  test('une série jamais validée ne compte pas — rien à perdre, aucune question', () => {
    const s = rouvrir();
    const vierge = Object.assign({}, s, {
      exercices: s.exercices.map((e) => Object.assign({}, e, {
        series: e.series.map((x) => Object.assign({}, x, { validee_a: null, source: null }))
      }))
    });
    expect(Seance.compterAEffacer(vierge, [0, 1, 2]).lignes).toBe(0);
  });

  // Un geste qui ne fait rien est pire qu'un geste absent.
  test('dévalider une série IMPORTÉE la fait VRAIMENT sortir de la base', () => {
    const s = rouvrir();
    const i = iDe(s, 'curl');
    expect(Seance.partEnBase(s.exercices[i].series[0])).toBe(true);
    const off = Seance.devalider(s, i, 0);
    expect(Seance.partEnBase(off.exercices[i].series[0])).toBe(false);
    expect(Modele.faiteEnBase(off.exercices[i].series[0])).toBe(false);
    expect(Seance.lignes(off)).toHaveLength(5);
    expect(Seance.idsRetires(LIGNES, off)).toEqual(['l5']);
  });

  test('revalidée, elle revient — comme une ligne de l’app', () => {
    const s = rouvrir();
    const i = iDe(s, 'curl');
    const remise = Seance.valider(Seance.devalider(s, i, 0), i, 0, new Date('2026-09-01T18:00:00.000Z'));
    expect(Seance.lignes(remise)).toHaveLength(6);
    const l = Seance.lignes(remise).filter((x) => x.id === 'l5')[0];
    expect(l.source).toBe('app');
    expect(l.validee_a).toBe('2026-09-01T18:00:00.000Z');
  });
});
