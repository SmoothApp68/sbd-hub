/** @jest-environment node */
//
// 266 — UN ACCESSOIRE QUI CHANGE AU DÉBUT D'UN BLOC (MOTEUR §9.22 ter, décision d'Aurélien du 07/11/2026).
//
//   · `faits.semainesDeSuite` et `faits.derniereHausseDuRecord` : les deux faits (un trou de 2 semaines toléré, de 3 non ; la
//     dernière ligne de la table des records, jamais un maximum estimé) ;
//   · `Generateur.variationsDuBloc` : la décision, pure — 8 semaines de suite, aucune hausse du record depuis 6 semaines, un
//     par muscle, deux au plus, la 1re semaine du bloc seulement, jamais une barre lourde ni un débutant ni un carnet ;
//   · `Generateur.verifierVariations` : I145 et I146 mordent chacun SEUL sur une sortie fabriquée.
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
const Moteur = require('../../v2/js/moteur.js');
require('../../v2/js/periode.js');
require('../../v2/js/profil.js');
require('../../v2/js/bilan.js');
require('../../v2/js/seance.js');
const Faits = require('../../v2/js/faits.js');
const G = require('../../v2/js/generateur.js');

const clone = (o) => JSON.parse(JSON.stringify(o));

// ══ LES FAITS ═════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('266 — faits.semainesDeSuite et faits.derniereHausseDuRecord', () => {
  const INDEX = { lat: { slug: 'lat', nom: 'Élévation Latérale (Poulie)', equipement: 'poulie', mesure: 'charge_reps' } };
  // `quand` : [jour civil, charge] ; une séance de 3 séries de travail à 12 reps.
  const corpusDe = (quand) => {
    const seances = [], series = [];
    quand.forEach(([jour, charge], i) => {
      const id = 's' + i, debut = jour + 'T09:00:00.000Z';
      seances.push({ id, debut, fin: jour + 'T10:00:00.000Z' });
      [1, 2, 3].forEach((r) => series.push({ id: id + '-' + r, session_id: id, exercise_slug: 'lat', type_serie: 'travail',
        reps: 12, charge_kg: charge, rang: r, validee_a: debut }));
    });
    seances.sort((a, b) => (a.debut < b.debut ? 1 : -1));        // la plus récente d'abord, comme le cache
    return { seances, series, exercices: Object.values(INDEX), seriesDe: (id) => series.filter((x) => x.session_id === id),
      catalogue: () => INDEX, journal: [] };
  };
  const lundis = (n, depuis) => Array.from({ length: n }, (_, k) => {
    const d = new Date(Date.UTC(2026, 8, 14 + 7 * (k + (depuis || 0))));
    return d.toISOString().slice(0, 10);
  });
  const F = () => Faits.creer();

  test('8 semaines de suite : { semaines: 8, derniere: le lundi de la dernière }', () => {
    const c = corpusDe(lundis(8).map((j) => [j, 10]));
    expect(F().semainesDeSuite(c, 'lat', '2026-11-04')).toEqual({ semaines: 8, derniere: '2026-11-02' });
  });

  test('un trou de 2 semaines est toléré : la série les compte', () => {
    const j = lundis(8).filter((_, k) => k !== 3 && k !== 4);           // semaines 4 et 5 manquantes
    expect(F().semainesDeSuite(corpusDe(j.map((x) => [x, 10])), 'lat', '2026-11-04').semaines).toBe(8);
  });

  test('un trou de 3 semaines la coupe : seule la série courante compte', () => {
    const j = lundis(8).filter((_, k) => k < 1 || k > 3);               // semaines 2 à 4 manquantes : 1 semaine, puis 4
    expect(F().semainesDeSuite(corpusDe(j.map((x) => [x, 10])), 'lat', '2026-11-04').semaines).toBe(4);
  });

  test('plus de 3 semaines depuis la dernière : null (3 : encore là)', () => {
    const c = corpusDe(lundis(8).map((j) => [j, 10]));
    expect(F().semainesDeSuite(c, 'lat', '2026-11-23')).toEqual({ semaines: 8, derniere: '2026-11-02' });
    expect(F().semainesDeSuite(c, 'lat', '2026-11-30')).toBeNull();
  });

  test('jamais fait : null', () => {
    expect(F().semainesDeSuite(corpusDe([]), 'lat', '2026-11-04')).toBeNull();
  });

  test('derniereHausseDuRecord : le jour de la dernière ligne de la table ; jamais un maximum estimé', () => {
    const c = corpusDe([['2026-09-14', 10], ['2026-09-28', 12], ['2026-10-12', 11], ['2026-10-26', 11]]);
    expect(F().derniereHausseDuRecord(c, 'lat', '2026-11-04')).toBe('2026-09-28');
    expect(F().derniereHausseDuRecord(corpusDe([]), 'lat', '2026-11-04')).toBeNull();
  });
});

// ══ LA DÉCISION ═══════════════════════════════════════════════════════════════════════════════════════════════════════
describe('266 — variationsDuBloc : un accessoire change au début d’un bloc', () => {
  const fiche = (nom, equipement, mouvement, schema, prim, extra) => Object.assign({ nom, equipement, mouvement, schema_mouvement: schema,
    muscles_primaires: prim, muscles_secondaires: [], mesure: 'charge_reps' }, extra || {});
  const CAT = {
    squat_barre: fiche('Squat (Barre)', 'barre', 'squat', 'accroupir', ['quadriceps']),
    elevation_laterale_poulie: fiche('Élévation Latérale (Poulie)', 'poulie', 'elevation_laterale', 'isolation_epaules', ['deltoide_lateral']),
    elevation_laterale_haltere: fiche('Élévation Latérale (Haltère)', 'haltere', 'elevation_laterale', 'isolation_epaules', ['deltoide_lateral']),
    leg_curl_allonge: fiche('Leg Curl Allongé', 'machine', 'leg_curl_allonge', 'flechir_genou', ['ischio_jambiers']),
    leg_curl_assis: fiche('Leg Curl Assis', 'machine', 'leg_curl_assis', 'flechir_genou', ['ischio_jambiers']),
    tirage_visage_poulie: fiche('Tirage vers Visage (Poulie)', 'poulie', 'tirage_visage', 'isolation_dos', ['deltoide_posterieur']),
    tirage_visage_elastique: fiche('Tirage vers Visage (Élastique)', 'elastique', 'tirage_visage', 'isolation_dos', ['deltoide_posterieur']),
    curl_poulie: fiche('Curl Biceps (Poulie)', 'poulie', 'curl', 'isolation_bras', ['biceps']),
    curl_haltere: fiche('Curl Biceps (Haltère)', 'haltere', 'curl', 'isolation_bras', ['biceps']),
    extension_poulie: fiche('Extension Triceps (Poulie)', 'poulie', 'extension', 'isolation_triceps', ['triceps']),
    extension_haltere: fiche('Extension Triceps (Haltère)', 'haltere', 'extension', 'isolation_triceps', ['triceps']),
  };
  const BLOC = { id: 'bloc-1', debut: '2026-11-02', semaines: 4, exercices: ['squat_barre'] };
  const routine = (id, slugs) => ({ id, nom: id, exercices: slugs.map((s) => ({ exercise_slug: s })) });
  const base = (o) => Object.assign({
    bloc: BLOC, jour: '2026-11-04', catalogue: CAT, profil: { materiel: 'salle_complete', anciennete: '3_a_5_ans' },
    routines: [routine('r1', ['squat_barre', 'elevation_laterale_poulie'])],
    faits: { elevation_laterale_poulie: { semaines: 8, derniereHausse: '2026-09-16' }, squat_barre: { semaines: 20, derniereHausse: null } },
    reponses: {}, carnet: false }, o || {});
  const avec = (o) => G.variationsDuBloc(base(o));

  test('8 semaines et 7 sans record : une carte « Élévation latérale : poulie → haltères ? », ses textes et ses routines', () => {
    const [v] = avec();
    expect(v).toEqual({
      slug: 'elevation_laterale_poulie', vers: 'elevation_laterale_haltere', muscle: 'deltoide_lateral', semaines: 8,
      titre: 'Élévation latérale : poulie → haltères ?', changer: 'Changer', garder: 'Garder la poulie',
      detail: '8 semaines sur la poulie, sans record depuis 7. Changer un accessoire par bloc travaille le même muscle sous un autre angle ; les barres ne changent pas.',
      pourquoi: 'Varier de façon planifiée peut aider un muscle à grossir partout ; varier au hasard, non (Kassiano 2022, 8 études). ' +
        'Huit semaines et six sans record sont des réglages de l’app. Rien ne change sans toi, et « Annuler » défait le changement.',
      routines: ['r1'] });
    expect(avec().length).toBe(1);
  });

  test('sans aucune hausse du record : « sans record » seul', () => {
    const f = base().faits; f.elevation_laterale_poulie.derniereHausse = null;
    expect(avec({ faits: f })[0].detail.indexOf('8 semaines sur la poulie, sans record. ')).toBe(0);
  });

  test('7 semaines : rien', () => {
    const f = base().faits; f.elevation_laterale_poulie.semaines = 7;
    expect(avec({ faits: f })).toEqual([]);
  });

  test('un record il y a 30 jours : rien', () => {
    const f = base().faits; f.elevation_laterale_poulie.derniereHausse = '2026-10-05';
    expect(avec({ faits: f })).toEqual([]);
  });

  test('une barre lourde, 20 semaines de suite : jamais (ni son frère à la barre)', () => {
    // ⚠️ DISCRIMINANT : le squat a un frère aux haltères, faisable et hors du dossier — seule la règle « jamais une barre lourde » le tait.
    const cat = clone(CAT);
    cat.squat_goblet = fiche('Squat Goblet (Haltère)', 'haltere', 'squat', 'accroupir', ['quadriceps']);
    const r = [routine('r1', ['squat_barre'])];
    expect(avec({ routines: r, catalogue: cat, bloc: Object.assign({}, BLOC, { exercices: [] }) })).toEqual([]);
  });

  test('un exercice du bloc, une priorité : jamais', () => {
    expect(avec({ bloc: Object.assign({}, BLOC, { exercices: ['elevation_laterale_poulie'] }) })).toEqual([]);
    expect(avec({ profil: { materiel: 'salle_complete', anciennete: '3_a_5_ans', priorites: ['elevation_laterale_poulie'] } })).toEqual([]);
  });

  test('deux accessoires du même muscle : un seul, le plus long', () => {
    const cat = clone(CAT);
    cat.curl_marteau_poulie = fiche('Curl Marteau (Poulie)', 'poulie', 'curl_marteau', 'isolation_bras', ['biceps']);
    cat.curl_marteau_haltere = fiche('Curl Marteau (Haltère)', 'haltere', 'curl_marteau', 'isolation_bras', ['biceps']);
    const f = base().faits;
    f.curl_poulie = { semaines: 10, derniereHausse: null }; f.curl_marteau_poulie = { semaines: 12, derniereHausse: null };
    const r = [routine('r1', ['squat_barre', 'curl_poulie', 'curl_marteau_poulie'])];
    const v = avec({ routines: r, faits: f, catalogue: cat });
    expect(v.map((x) => x.slug)).toEqual(['curl_marteau_poulie']);
  });

  test('trois muscles : deux cartes, les plus longues séries d’abord', () => {
    const f = base().faits;
    f.leg_curl_allonge = { semaines: 18, derniereHausse: null };
    f.tirage_visage_poulie = { semaines: 10, derniereHausse: null };
    const r = [routine('r1', ['squat_barre', 'elevation_laterale_poulie', 'leg_curl_allonge', 'tirage_visage_poulie'])];
    const v = avec({ routines: r, faits: f });
    expect(v.map((x) => x.slug)).toEqual(['leg_curl_allonge', 'tirage_visage_poulie']);
    expect(v.length).toBe(G.VARIATION_PAR_BLOC);
  });

  test('sans nom de base commun : « <Nom> → <nom variante> ? » et « Garder <nom> » (le cousin, jamais un frère du même matériel)', () => {
    const f = base().faits; f.leg_curl_allonge = { semaines: 18, derniereHausse: null };
    const [v] = avec({ routines: [routine('r1', ['leg_curl_allonge'])], faits: f });
    expect(v.vers).toBe('leg_curl_assis');
    expect(v.titre).toBe('Leg Curl Allongé → leg curl assis ?');
    expect(v.garder).toBe('Garder leg curl allongé');
    expect(v.detail.indexOf('18 semaines sur leg curl allongé, sans record. ')).toBe(0);
  });

  test('« Garder » dans CE bloc : rien ; dans le bloc suivant (autre identifiant) : la carte revient', () => {
    const r = { 'bloc-1': { elevation_laterale_poulie: 'garder' } };
    expect(avec({ reponses: r })).toEqual([]);
    expect(avec({ reponses: r, bloc: Object.assign({}, BLOC, { id: 'bloc-2' }) }).length).toBe(1);
  });

  test('2e semaine du bloc, avant son début, après sa fin : rien', () => {
    expect(avec({ jour: '2026-11-09' })).toEqual([]);
    expect(avec({ jour: '2026-11-01' })).toEqual([]);
    expect(avec({ jour: '2026-12-20' })).toEqual([]);
    expect(avec({ jour: '2026-11-08' }).length).toBe(1);               // le dimanche : encore la 1re semaine
  });

  test('un débutant, « Juste un carnet », pas de bloc : rien', () => {
    expect(avec({ profil: { materiel: 'salle_complete', anciennete: 'moins_1_an' } })).toEqual([]);
    expect(avec({ carnet: true })).toEqual([]);
    expect(avec({ bloc: null })).toEqual([]);
  });

  test('une variante hors de Ma salle : rien ; un cousin de la salle : lui', () => {
    // À la maison minimale (ni poulie ni machine), l'haltère n'a pas de variante à la poulie.
    const f = { elevation_laterale_haltere: { semaines: 9, derniereHausse: null } };
    const maison = { materiel: 'maison_minimal', anciennete: '3_a_5_ans' };
    expect(avec({ profil: maison, routines: [routine('r1', ['elevation_laterale_haltere'])], faits: f })).toEqual([]);
    const cat = clone(CAT);
    cat.elevation_laterale_elastique = fiche('Élévation Latérale (Élastique)', 'elastique', 'elevation_laterale_elastique', 'isolation_epaules', ['deltoide_lateral']);
    const v = avec({ profil: maison, catalogue: cat, routines: [routine('r1', ['elevation_laterale_haltere'])], faits: f });
    expect(v.map((x) => x.vers)).toEqual(['elevation_laterale_elastique']);
    expect(v[0].garder).toBe('Garder les haltères');
  });

  test('une variante déjà dans le dossier ou écartée n’est jamais proposée', () => {
    const r = [routine('r1', ['elevation_laterale_poulie', 'elevation_laterale_haltere'])];
    expect(avec({ routines: r })).toEqual([]);
    expect(avec({ profil: { materiel: 'salle_complete', anciennete: '3_a_5_ans', exercices_ecartes: ['elevation_laterale_haltere'] } })).toEqual([]);
  });

  test('pure : l’entrée n’est pas modifiée, deux appels rendent la même chose', () => {
    const e = base(), avant = JSON.stringify(e);
    expect(G.variationsDuBloc(e)).toEqual(G.variationsDuBloc(e));
    expect(JSON.stringify(e)).toBe(avant);
  });
});

// ══ LES INVARIANTS ════════════════════════════════════════════════════════════════════════════════════════════════════
describe('266 — verifierVariations : I145 et I146 mordent chacun seul', () => {
  const fiche = (nom, equipement, mouvement, prim) => ({ nom, equipement, mouvement, schema_mouvement: 's_' + mouvement, muscles_primaires: prim, muscles_secondaires: [], mesure: 'charge_reps' });
  const CAT = {
    squat_barre: fiche('Squat (Barre)', 'barre', 'squat', ['quadriceps']),
    lat_p: fiche('Élévation Latérale (Poulie)', 'poulie', 'lat', ['deltoide_lateral']),
    lat_h: fiche('Élévation Latérale (Haltère)', 'haltere', 'lat', ['deltoide_lateral']),
    presse: fiche('Presse à Cuisses', 'machine', 'presse', ['quadriceps']),
  };
  const BLOC = { id: 'b', debut: '2026-11-02', semaines: 4, exercices: [] };
  const entree = (o) => Object.assign({ bloc: BLOC, jour: '2026-11-04', catalogue: CAT, profil: { materiel: 'salle_complete', anciennete: '3_a_5_ans' },
    routines: [{ id: 'r1', exercices: [{ exercise_slug: 'lat_p' }, { exercise_slug: 'squat_barre' }] }], faits: {}, reponses: {}, carnet: false }, o || {});
  const carte = (o) => Object.assign({ slug: 'lat_p', vers: 'lat_h', muscle: 'deltoide_lateral', semaines: 8 }, o || {});

  test('une sortie légitime : aucune faute', () => {
    expect(G.verifierVariations(entree(), [carte()])).toEqual([]);
    expect(G.verifierVariations(entree(), [])).toEqual([]);
  });
  test('I145 : une barre lourde', () => {
    expect(G.verifierVariations(entree(), [carte({ slug: 'squat_barre', vers: 'lat_h', muscle: 'quadriceps' })]).filter((f) => /barre lourde/.test(f)).length).toBe(1);
  });
  test('I145 : un exercice du bloc, une priorité', () => {
    expect(G.verifierVariations(entree({ bloc: Object.assign({}, BLOC, { exercices: ['lat_p'] }) }), [carte()]).join('|')).toMatch(/I145 .*un exercice du bloc/);
    expect(G.verifierVariations(entree({ profil: { materiel: 'salle_complete', priorites: ['lat_p'] } }), [carte()]).join('|')).toMatch(/I145 .*une priorité/);
  });
  test('I145 : deux pour le même muscle, plus de deux au total', () => {
    expect(G.verifierVariations(entree(), [carte(), carte()]).join('|')).toMatch(/I145 .*deux variations pour deltoide_lateral/);
    const trois = [carte(), carte({ muscle: 'a' }), carte({ muscle: 'b' })];
    expect(G.verifierVariations(entree(), trois).join('|')).toMatch(/I145 plus de 2 variations/);
  });
  test('I145 : la variante n’est ni un frère ni un cousin, ou hors de Ma salle, ou déjà dans le dossier', () => {
    expect(G.verifierVariations(entree(), [carte({ vers: 'presse' })]).join('|')).toMatch(/ni un frère ni un cousin/);
    const poulie = entree({ profil: { materiel: 'maison_minimal' } });
    expect(G.verifierVariations(poulie, [carte({ slug: 'lat_h', vers: 'lat_p' })]).join('|')).toMatch(/hors de Ma salle/);
    const dedans = entree({ routines: [{ id: 'r1', exercices: [{ exercise_slug: 'lat_p' }, { exercise_slug: 'lat_h' }] }] });
    expect(G.verifierVariations(dedans, [carte()]).join('|')).toMatch(/déjà dans le dossier/);
  });
  test('I145 : une carte hors de la 1re semaine du bloc', () => {
    expect(G.verifierVariations(entree({ jour: '2026-11-10' }), [carte()]).join('|')).toMatch(/I145 une variation hors de la 1re semaine/);
  });
  test('I146 : un exercice déjà répondu dans ce bloc, un carnet, un débutant', () => {
    expect(G.verifierVariations(entree({ reponses: { b: { lat_p: 'garder' } } }), [carte()]).join('|')).toMatch(/I146 .*déjà répondu/);
    expect(G.verifierVariations(entree({ reponses: { autre: { lat_p: 'garder' } } }), [carte()])).toEqual([]);
    expect(G.verifierVariations(entree({ carnet: true }), [carte()]).join('|')).toMatch(/I146 une variation en « Juste un carnet »/);
    expect(G.verifierVariations(entree({ profil: { materiel: 'salle_complete', anciennete: 'moins_1_an' } }), [carte()]).join('|')).toMatch(/I146 une variation pour un débutant/);
  });
});
