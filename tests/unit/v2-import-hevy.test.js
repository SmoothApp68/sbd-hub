/**
 * 69 (ECRAN-PROFIL §2.4 quater) — importer depuis Hevy.
 *
 * LE CAS FAIT FOI : `fixtures/cas-69-import.json`, produit par `fixtures/ref69.py` et comparé série par série à
 * ce que la base porte déjà pour les mêmes séances (11 sur 11 ; l'exception est écrite dans sa `note`). Une valeur
 * du cas qui semblerait fausse se rapporte, elle ne se corrige pas.
 *
 * Ce que ce fichier prouve :
 *   · la lecture du texte et du CSV rend EXACTEMENT les séances du cas (et donc leurs empreintes) ;
 *   · l'heure locale de Hevy part en heure universelle, y compris autour des deux changements d'heure ;
 *   · l'anti-doublon rend les 12 verdicts du cas ;
 *   · un nom introuvable reste introuvable (« à rattacher »), jamais deviné ; rattaché, il se résout ;
 *   · les identifiants sont tirés du nom : deux lectures, mêmes identifiants ;
 *   · ce qui s'écrit : `source 'hevy'`, `source_ref`, `validee_a` vide, rangs dans l'ordre de lecture ; et la
 *     provenance d'une séance rouverte ne se réécrit plus (le défaut `source: 'app'`) ;
 *   · les records : seulement pour une séance plus récente que la dernière déjà là.
 */
const crypto = require('crypto');
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const Moteur = require('../../v2/js/moteur.js');
const Seance = require('../../v2/js/seance.js');
const I = require('../../v2/js/importhevy.js');
const CAS = require('./fixtures/cas-69-import.json');

const PARIS = CAS.fuseau;
const COMMUNS = Object.keys(CAS.alias).map((a) => ({ alias: a, slug: CAS.alias[a] }));
const INDEX = I.indexDesNoms({ communs: COMMUNS });

// La forme lue, sans ce qui dépend du fuseau ou des noms (comparée à part).
const lue = (s) => ({ ref: s.ref, titre: s.titre, note: s.note, debut_local: s.debut_local,
  exercices: s.exercices.map((e) => ({ nom: e.nom, note: e.note, groupe_superset: e.groupe_superset, series: e.series })) });

// L'empreinte de `ref69.py` (`canon`, md5), reproduite à l'identique.
const enTexte = (v) => (v === null || v === undefined ? '' : String(v));
function empreinte(s) {
  const lignes = [];
  s.exercices.forEach((e) => e.series.forEach((x) => {
    lignes.push([e.exercise_slug, x.type_serie, x.charge_kg, x.reps, x.duree_s, x.distance_m, x.rpe, e.note,
      e.groupe_superset].map(enTexte).join('|'));
  }));
  return crypto.createHash('md5').update(lignes.join('\n'), 'utf8').digest('hex');
}

describe('69 — la lecture rend EXACTEMENT les séances du cas', () => {
  [['texte', I.lireTexte], ['csv', I.lireCsv]].forEach(([genre, lire]) => {
    test(genre + ' : titres, notes, débuts locaux, références, exercices et séries', () => {
      const lues = lire(CAS[genre].source);
      expect(lues.map(lue)).toEqual(CAS[genre].seances.map(lue));
    });

    test(genre + ' : le début (et la fin) en heure universelle, les noms résolus, les empreintes', () => {
      const prep = lire(CAS[genre].source).map((s) => I.preparer(s, INDEX, PARIS));
      expect(prep.map((s) => s.debut)).toEqual(CAS[genre].seances.map((s) => s.debut));
      expect(prep.map((s) => s.fin)).toEqual(CAS[genre].seances.map((s) => s.fin));
      expect(prep.map((s) => s.exercices.map((e) => e.exercise_slug)))
        .toEqual(CAS[genre].seances.map((s) => s.exercices.map((e) => e.exercise_slug)));
      expect(prep.map(empreinte)).toEqual(CAS[genre].seances.map((s) => s.empreinte));
    });
  });

  test('le CSV : sa fin locale lue, la description en note, un superset d’un seul exercice n’en est plus un', () => {
    const [s] = I.lireCsv(CAS.csv.source);
    expect(s.fin_local).toBe('2026-09-15T19:18');
    expect(s.note).toBe('Le tapis tue.');
    const csv = 'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,' +
      'weight_kg,reps,distance_km,duration_seconds,rpe\n' +
      '"A","1 mars 2026, 10:00","1 mars 2026, 11:00",,"Squat (Barre)",0,,0,"normal",100,5,,,\n' +
      '"A","1 mars 2026, 10:00","1 mars 2026, 11:00",,"Tractions",1,,0,"normal",,8,,,\n' +
      '"A","1 mars 2026, 10:00","1 mars 2026, 11:00",,"Pompes",1,,0,"normal",,20,,,\n';
    expect(I.lireCsv(csv)[0].exercices.map((e) => e.groupe_superset)).toEqual([null, 1, 1]);
  });
});

describe('69 — les formes de série (K1 : la lecture du v1, règle pour règle)', () => {
  const une = (ligne) => I.lireTexte('S\nLe lundi, mars 2, 2026 à 6:00pm\nExo\n' + ligne + '\n')[0].exercices[0].series[0];
  const vide = { type_serie: 'travail', charge_kg: null, reps: null, duree_s: null, distance_m: null, rpe: null };

  test('`lbs` se convertit (× 0,45359237, au dixième)', () => {
    expect(une('Série 1: 225 lbs x 5')).toEqual(Object.assign({}, vide, { charge_kg: 102.1, reps: 5 }));
  });
  test('une durée seule (« 5h 25min 5s »), une distance et sa durée', () => {
    expect(une('Série 1: 5h 25min 5s')).toEqual(Object.assign({}, vide, { duree_s: 19505 }));
    expect(une('Série 1: 5min 0s')).toEqual(Object.assign({}, vide, { duree_s: 300 }));
    expect(une('Série 1: 1,5 km - 10min 0s')).toEqual(Object.assign({}, vide, { distance_m: 1500, duree_s: 600 }));
  });
  test('⚠️ [Abandon] est une DÉGRESSIVE (relevé 5 fois sur 5), [Échec] un échec, un crochet inconnu du travail', () => {
    expect(une('Série 4: 73 kg x 8 @ 10 rpe [Abandon]')).toEqual(
      Object.assign({}, vide, { type_serie: 'degressive', charge_kg: 73, reps: 8, rpe: 10 }));
    expect(une('Série 1: 100 kg x 1 [Échec]').type_serie).toBe('echec');
    expect(une('Série 1: 60 kg x 10 [Échauffement]').type_serie).toBe('echauffement');
    expect(une('Série 1: 100 kg x 5 [Superset]').type_serie).toBe('travail');
  });
  test('une distance ou une durée à 0 est VIDE (CSV)', () => {
    const csv = 'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,' +
      'weight_kg,reps,distance_km,duration_seconds,rpe\n' +
      '"R","1 mars 2026, 10:00","",,"Tapis Roulant",,,0,"normal",,,0,0,\n';
    expect(I.lireCsv(csv)[0].exercices[0].series[0]).toEqual(vide);
  });
  test('⚠️ une ligne illisible est une ERREUR, jamais une séance à moitié lue', () => {
    expect(() => I.lireTexte('S\nLe lundi, mars 2, 2026 à 6:00pm\nExo\nSérie 1: beaucoup\n')).toThrow(/illisible/);
    expect(() => I.lireTexte('S\nmardi dernier\nExo\n')).toThrow(/date illisible/);
    expect(() => I.lireTexte('S\nLe lundi, mars 2, 2026 à 6:00pm\nSérie 1: 5 kg x 5\n')).toThrow();
    expect(() => I.lireCsv('nom,date\nA,B\n')).toThrow();
    let e = null;
    try { I.lireCsv('nom,date\nA,B\n'); } catch (x) { e = x; }
    expect(e.pasUnExport).toBe(true);
  });
});

describe('69 — l’heure : locale chez Hevy, universelle en base (le défaut d’août)', () => {
  test('heure d’été et heure d’hiver à Paris', () => {
    expect(I.versUTC('2026-09-22T17:12', PARIS)).toBe('2026-09-22T15:12:00Z');
    expect(I.versUTC('2025-01-15T17:47', PARIS)).toBe('2025-01-15T16:47:00Z');
  });
  test('le changement de MARS (29/03/2026, 2 h → 3 h) : avant, après, et l’heure qui n’existe pas', () => {
    expect(I.versUTC('2026-03-29T01:30', PARIS)).toBe('2026-03-29T00:30:00Z');
    expect(I.versUTC('2026-03-29T03:30', PARIS)).toBe('2026-03-29T01:30:00Z');
    expect(I.versUTC('2026-03-29T18:00', PARIS)).toBe('2026-03-29T16:00:00Z');
    // 2 h 30 n'existe pas : lue avec le décalage d'avant le saut (zoneinfo, fold=0).
    expect(I.versUTC('2026-03-29T02:30', PARIS)).toBe('2026-03-29T01:30:00Z');
  });
  test('le changement d’OCTOBRE (25/10/2026, 3 h → 2 h) : avant, après, et l’heure vécue deux fois', () => {
    expect(I.versUTC('2026-10-25T01:30', PARIS)).toBe('2026-10-24T23:30:00Z');
    expect(I.versUTC('2026-10-25T03:30', PARIS)).toBe('2026-10-25T02:30:00Z');
    expect(I.versUTC('2026-10-25T18:00', PARIS)).toBe('2026-10-25T17:00:00Z');
    // 2 h 30 vécue deux fois : la PREMIÈRE (heure d'été).
    expect(I.versUTC('2026-10-25T02:30', PARIS)).toBe('2026-10-25T00:30:00Z');
  });
  test('un autre fuseau (le téléphone fait foi)', () => {
    expect(I.versUTC('2026-09-22T17:12', 'America/New_York')).toBe('2026-09-22T21:12:00Z');
    expect(I.versUTC('2026-09-22T17:12', 'UTC')).toBe('2026-09-22T17:12:00Z');
  });
});

describe('69 — l’anti-doublon : les 12 verdicts du cas', () => {
  const toutes = () => I.lireTexte(CAS.texte.source).concat(I.lireCsv(CAS.csv.source))
    .map((s) => I.preparer(s, INDEX, PARIS));

  test('chaque séance reçoit le verdict attendu contre `doublons.base`', () => {
    const rendus = {};
    toutes().forEach((s) => { rendus[s.ref] = I.verdict(s, CAS.doublons.base); });
    expect(rendus).toEqual(CAS.doublons.attendu);
  });

  test('« déjà là » : la même minute suffit, quelle que soit l’origine (une séance `app` sans référence)', () => {
    const s = toutes().find((x) => x.ref === 'hevy:2026-09-15T17:46:00');
    const base = CAS.doublons.base.filter((b) => b.source === 'app' && b.debut === '2026-09-15T15:46:00Z');
    expect(base).toHaveLength(1);
    expect(I.verdict(s, base)).toBe('deja_la');
    // Les secondes ne comptent pas : une séance de l'app commencée à 15:46:37 est la même minute.
    expect(I.verdict(s, [Object.assign({}, base[0], { debut: '2026-09-15T15:46:37.123+00:00' })])).toBe('deja_la');
    expect(I.verdict(s, [Object.assign({}, base[0], { debut: '2026-09-15T15:47:00Z', slugs: [] })])).toBe('nouvelle');
  });

  test('« sans doute la même » : fin inconnue = 3 h au plus ; une séance finie avant n’est pas chevauchée', () => {
    const base = [{ source_ref: null, debut: '2026-01-10T09:00:00Z', fin: null, slugs: ['squat_barre'] }];
    const s = (debut) => ({ ref: 'hevy:x', debut, exercices: [{ exercise_slug: 'squat_barre' }] });
    expect(I.verdict(s('2026-01-10T11:59:00Z'), base)).toBe('meme_seance');
    expect(I.verdict(s('2026-01-10T12:00:00Z'), base)).toBe('nouvelle');
    const finie = [Object.assign({}, base[0], { fin: '2026-01-10T09:40:00Z' })];
    expect(I.verdict(s('2026-01-10T09:40:00Z'), finie)).toBe('nouvelle');
    expect(I.verdict(s('2026-01-10T09:39:00Z'), finie)).toBe('meme_seance');
    expect(I.verdict(s('2026-01-10T08:59:00Z'), base)).toBe('nouvelle');
  });

  test('l’aperçu : coché si nouvelle, décoché si « sans doute la même » ; la phrase dit l’heure de la séance de l’app', () => {
    const lignes = I.apercu(I.lireCsv(CAS.csv.source), { sources: { communs: COMMUNS }, base: CAS.doublons.base, fuseau: PARIS });
    const par = {};
    lignes.forEach((l) => { par[l.seance.ref] = l; });
    expect(par['hevy:2024-09-27T11:12:00'].coche).toBe(false);
    expect(par['hevy:2025-02-25T19:11:00'].coche).toBe(true);
    expect(I.sousLigne(par['hevy:2024-09-27T11:12:00'], PARIS))
      .toBe('Une séance de l’app commence à 11 h 01 ce jour-là : sans doute la même.');
    expect(I.sousLigne(par['hevy:2026-09-15T17:46:00'], PARIS)).toBe('Déjà dans l’app — laissée telle quelle');
    expect(I.sousLigne(par['hevy:2025-02-25T19:11:00'], PARIS)).toBe('16 exercices · 44 séries');
  });
});

describe('69 — les noms : trouvés à l’identique, jamais devinés', () => {
  test('sans accents ni casse, la normalisation de la colonne générée `alias_norme`', () => {
    expect(I.norme('  Développé Couché (Barre) ')).toBe('developpe couche (barre)');
    expect(I.norme('Œuf ÉCARTÉ')).toBe('ouf ecarte');
    expect(I.slugDuNom(INDEX, 'DEVELOPPE COUCHE (BARRE)')).toBe('developpe_couche_barre');
  });

  test('⚠️ un nom voisin n’est PAS trouvé « au plus près » : il est à rattacher', () => {
    expect(I.slugDuNom(INDEX, 'Développé Couché Barre')).toBeNull();
    expect(I.slugDuNom(INDEX, 'Good Morning (Barre)')).toBeNull();
  });

  test('un nom absent d’`alias` → « à rattacher » ; présent dans les rattachements de la personne → résolu', () => {
    const texte = 'Dos\nLe lundi, mars 2, 2026 à 6:00pm\nGood Morning (Barre)\nSérie 1: 60 kg x 8\nSérie 2: 60 kg x 8\n' +
      'Tractions\nSérie 1: 8 répétitions\n@hevyapp\nhttps://hevy.com/workout/abcDEF123\n';
    const sources = { communs: COMMUNS };
    const lignes = I.apercu(I.lireTexte(texte), { sources, base: [], fuseau: PARIS });
    const index = I.indexDesNoms(sources);
    expect(I.nomsARattacher(lignes, index, {})).toEqual([{ nom: 'Good Morning (Barre)', series: 2, seances: 1, ignore: false }]);
    expect(I.pretAImporter(lignes, index, {})).toBe(false);
    // Laissé de côté : le bouton s'ouvre, ses séries ne partiront pas.
    expect(I.pretAImporter(lignes, index, { 'Good Morning (Barre)': true })).toBe(true);
    // Rattaché par la personne (`alias_exercice`) : résolu, sans question.
    const miens = { communs: COMMUNS, miens: [{ alias: 'good morning (barre)', exercise_slug: 'souleve_de_terre_roumain_barre' }] };
    const index2 = I.indexDesNoms(miens);
    expect(I.slugDuNom(index2, 'Good Morning (Barre)')).toBe('souleve_de_terre_roumain_barre');
    expect(I.nomsARattacher(lignes, index2, {})).toEqual([]);
    expect(I.pretAImporter(lignes, index2, {})).toBe(true);
  });

  test('le catalogue passe avant les noms communs, qui passent avant les rattachements', () => {
    const index = I.indexDesNoms({ catalogue: [{ slug: 'a', nom: 'X' }], communs: [{ alias: 'x', slug: 'b' }],
      miens: [{ alias: 'X', exercise_slug: 'c' }] });
    expect(I.slugDuNom(index, 'x')).toBe('a');
  });
});

describe('69 — ce qui s’écrit : par la file, avec des identifiants tirés du nom', () => {
  const PERSONNE = '6e2936e7-de11-4f19-89b1-d1eb5968ba35';
  async function aEcrire(s, index) {
    const n = I.seriesAEcrire(s, index);
    const liste = [];
    for (let r = 1; r <= n; r++) liste.push(await Moteur.idDImport(PERSONNE, s.ref, r));
    return I.seanceAEcrire(s, { seance: await Moteur.idDImport(PERSONNE, s.ref), serie: (r) => liste[r - 1] }, index, PERSONNE);
  }
  const lireTout = () => I.lireTexte(CAS.texte.source).map((s) => I.preparer(s, INDEX, PARIS));

  test('⚠️ deux lectures du même texte → les mêmes identifiants de séance et de séries (jamais de 23505)', async () => {
    const a = await Promise.all(lireTout().map((s) => aEcrire(s, INDEX)));
    const b = await Promise.all(lireTout().map((s) => aEcrire(s, INDEX)));
    const ids = (liste) => liste.map((m) => [m.id].concat(Seance.lignes(m).map((l) => l.id)));
    expect(ids(a)).toEqual(ids(b));
    const tous = [].concat(...ids(a));
    expect(new Set(tous).size).toBe(tous.length);
    expect(a[0].id).toBe(await Moteur.idDImport(PERSONNE, 'hevy:1viJr6Z1doo'));
    expect(a[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // Un autre espace de noms que l'escalier et une autre personne : jamais le même identifiant.
    expect(await Moteur.idDImport('autre', 'hevy:1viJr6Z1doo')).not.toBe(a[0].id);
  });

  test('la séance : « source hevy », sa référence, terminée, son titre, sa note, son début universel', async () => {
    const s = I.lireCsv(CAS.csv.source).map((x) => I.preparer(x, INDEX, PARIS))[0];
    const ligne = Seance.ligneSession(await aEcrire(s, INDEX));
    expect(ligne).toEqual(expect.objectContaining({
      user_id: PERSONNE, source: 'hevy', source_ref: 'hevy:2026-09-15T17:46:00', statut: 'terminee',
      titre: 'Pecs - Dos', note: 'Le tapis tue.', debut: '2026-09-15T15:46:00Z', fin: '2026-09-15T17:18:00Z',
      routine_id: null, salle: null }));
    expect(Object.keys(ligne).sort()).toEqual(Seance.COLONNES_SESSION.slice().sort());
  });

  test('les séries : « source hevy », `validee_a` vide, rangs 1…n dans l’ordre de lecture, la note de l’exercice sur chacune', async () => {
    const s = I.lireCsv(CAS.csv.source).map((x) => I.preparer(x, INDEX, PARIS))[0];
    const lignes = Seance.lignes(await aEcrire(s, INDEX));
    const n = s.exercices.reduce((k, e) => k + e.series.length, 0);
    expect(lignes).toHaveLength(n);
    expect(lignes.map((l) => l.rang)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    lignes.forEach((l) => {
      expect(l.source).toBe('hevy');
      expect(l.validee_a).toBeNull();
      expect(l.occurrence).toBeNull();
    });
    const tractions = lignes.filter((l) => l.exercise_slug === 'tractions');
    expect(tractions.length).toBeGreaterThan(0);
    tractions.forEach((l) => expect(l.note).toBe('Max de séries à 8 rep'));
    expect(lignes.filter((l) => l.groupe_superset === 0).map((l) => l.exercise_slug))
      .toEqual(expect.arrayContaining(['tirage_vers_visage', 'pompes']));
  });

  test('un exercice laissé de côté ne part pas ; une séance dont rien ne part n’est pas importée', async () => {
    const s = I.preparer(I.lireTexte('S\nLe lundi, mars 2, 2026 à 6:00pm\nInconnu\nSérie 1: 5 kg x 5\n' +
      'Tractions\nSérie 1: 8 répétitions\n@hevyapp\nhttps://hevy.com/workout/zz1\n')[0], INDEX, PARIS);
    const m = await aEcrire(s, INDEX);
    expect(Seance.lignes(m).map((l) => [l.exercise_slug, l.rang])).toEqual([['tractions', 1]]);
    const seul = I.preparer(I.lireTexte('S\nLe lundi, mars 2, 2026 à 6:00pm\nInconnu\nSérie 1: 5 kg x 5\n')[0], INDEX, PARIS);
    expect(I.seanceAEcrire(seul, { seance: 'x', serie: () => 'y' }, INDEX, PERSONNE)).toBeNull();
  });

  test('un RPE hors de (0, 10] ne part pas (`sets_rpe_ok` bloquerait la file)', () => {
    const s = I.preparer(I.lireTexte('S\nLe lundi, mars 2, 2026 à 6:00pm\nTractions\nSérie 1: 8 répétitions @ 0 rpe\n')[0], INDEX, PARIS);
    expect(s.exercices[0].series[0].rpe).toBe(0);
    expect(I.seanceAEcrire(s, { seance: 'x', serie: () => 'y' }, INDEX, PERSONNE).exercices[0].series[0].rpe).toBeNull();
  });
});

describe('69 — le défaut corrigé : la provenance d’une séance ne se réécrit pas', () => {
  test('une séance Hevy rouverte en Édition repart en `hevy`, avec sa référence', () => {
    const rouverte = Seance.reprendre({ id: 's1', user_id: 'u', debut: '2025-03-15T14:32:00Z', fin: null,
      source: 'hevy', source_ref: 'hevy:2025-03-15T15:32:00', statut: 'terminee' }, []);
    const ligne = Seance.ligneSession(rouverte);
    expect(ligne.source).toBe('hevy');
    expect(ligne.source_ref).toBe('hevy:2025-03-15T15:32:00');
  });
  test('une séance de l’app reste `app`, sans référence', () => {
    const l = Seance.ligneSession({ id: 's', user_id: 'u', debut: 'd', statut: 'en_cours', exercices: [] });
    expect(l.source).toBe('app');
    expect(l.source_ref).toBeNull();
  });
});

describe('69 — les records d’un import : seulement après la dernière séance déjà là', () => {
  const base = [{ debut: '2026-09-20T10:00:00Z' }, { debut: '2026-09-25T16:44:00Z' }];
  test('⚠️ une séance importée dans le PASSÉ n’inscrit aucun record', () => {
    expect(I.avecRecords([{ id: 'p', debut: '2026-09-22T15:12:00Z' }], base)).toEqual([]);
    expect(I.avecRecords([{ id: 'meme', debut: '2026-09-25T16:44:00Z' }], base)).toEqual([]);
  });
  test('plus récente que tout : ses records, dans l’ordre des dates', () => {
    const r = I.avecRecords([{ id: 'b', debut: '2026-10-02T08:00:00Z' }, { id: 'p', debut: '2026-09-01T08:00:00Z' },
      { id: 'a', debut: '2026-09-30T08:00:00Z' }], base);
    expect(r.map((x) => x.id)).toEqual(['a', 'b']);
  });
  test('une personne sans séance : toutes', () => {
    expect(I.avecRecords([{ id: 'a', debut: '2023-01-01T00:00:00Z' }], []).map((x) => x.id)).toEqual(['a']);
  });
});

describe('69 — les mots de l’écran (K1 et la maquette, au mot près)', () => {
  test('les erreurs et les aides', () => {
    expect(I.MESSAGES.texte).toBe('Je ne reconnais pas ce texte. Copie-le depuis Hevy : une séance → Partager → Copier.');
    expect(I.MESSAGES.fichier).toBe('Ce fichier n’est pas un export de séances Hevy.');
    expect(I.MESSAGES.connexion).toBe('L’import demande une connexion.');
    expect(I.MESSAGES.souvenir).toBe('Je m’en souviendrai pour tes prochains imports.');
    expect(I.titreRattacher('Good Morning (Barre)')).toBe('« Good Morning (Barre) » chez Hevy, c’est…');
    expect(I.rechercheDe('Good Morning (Barre)')).toBe('good morning');
  });
  test('la fin', () => {
    expect(I.phrasesDeFin({ importees: 3, dejaLa: 1, deCote: 1 })).toEqual({ titre: '3 séances importées.',
      detail: '1 était déjà dans l’app, 1 laissée de côté.',
      suite: 'Elles comptent dès maintenant pour ton coach et ta progression.' });
    expect(I.phrasesDeFin({ importees: 3, dejaLa: 2, deCote: 0 }).detail).toBe('2 étaient déjà dans l’app.');
    expect(I.phrasesDeFin({ importees: 3, dejaLa: 0, deCote: 0 }).detail).toBeNull();
  });
  test('le jour, l’heure et la période (dans l’année : sans l’année)', () => {
    expect(I.jourEtHeure('2026-09-19T19:31', 2026)).toBe('samedi 19 sept. · 19 h 31');
    expect(I.jourEtHeure('2026-09-23T08:05', 2026)).toBe('mercredi 23 sept. · 8 h 05');
    const lignes = I.lireTexte(CAS.texte.source).map((s) => ({ seance: s }));
    expect(I.periode(lignes, 2026)).toBe('Du samedi 19 au vendredi 25 septembre');
  });
});
