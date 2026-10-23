/** @jest-environment node */
//
// 90 — LA GUILDE (SOCIAL-V1 « Guilde », décisions du 14/10/2026, migration proposée v2_080).
//
// Trois couches, chacune discriminante :
//   · les règles pures de `social.js` (défis sûrs, invitables = mutuels seulement, rangs, jauge, progression) ;
//   · les nombres calculés sur l'appareil (`faits.recordsSansDepasser`, `faits.scoresDeGuilde`) — la règle des records
//     décidée par Claude.ai le 14/10/2026 : sans pari relié, un record COMPTE ; avec, à la charge proposée ou en dessous ;
//   · le faux serveur du banc (`faux-social.js`), qui imite v2_080 — et le texte même de la migration, dont les listes
//     (rangs, défis, couleurs) doivent être celles de l'app et du faux serveur.
//
// Les trois mutations du prompt 90 tombent sur un contrôle nommé « MUTATION (a|b|c) ».

process.env.TZ = 'Europe/Paris';

global.self = global;
const fs = require('fs');
const path = require('path');
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
require('../../v2/js/seance.js');
require('../../v2/js/routines.js');
require('../../v2/js/calendrier.js');
const Social = require('../../v2/js/social.js');
const Routeur = require('../../v2/js/routeur.js');
const Faits = require('../../v2/js/faits.js');
const FauxSocial = require('../banc/faux-social.js');

const MIGRATION = fs.readFileSync(path.join(__dirname, '../../v2-atelier/migrations-proposees/v2_080_guilde.sql'), 'utf8');
const MIGRATION_093 = fs.readFileSync(path.join(__dirname, '../../v2-atelier/migrations-proposees/v2_093_doctrine.sql'), 'utf8');

describe('90 — social.js : les règles de la guilde', () => {
  test('MUTATION (b) — les défis sûrs : exactement « séries », « séances », « records », « variété » ; jamais la charge ni le tonnage', () => {
    // 120 (D3) — « séries » d'abord : le défaut sans choix.
    expect(Social.DEFIS.map((d) => d.cle)).toEqual(['series', 'seances', 'records', 'variete']);
    expect(Social.defiValide('series', null)).toBe(true);
    expect(Social.defiValide('series', 3)).toBe(false);
    expect(Social.defiValide('tonnage', 5)).toBe(false);
    expect(Social.defiValide('charge', 5)).toBe(false);
    expect(Social.defiValide('seances', null)).toBe(true);
    expect(Social.defiValide('seances', 3)).toBe(false);
    expect(Social.defiValide('records', 3)).toBe(true);
    expect(Social.defiValide('records', null)).toBe(false);
    expect(Social.defiValide('variete', 101)).toBe(false);
    expect(Social.DEFIS.every((d) => !/tonnage|charge max|kilos/i.test(d.libelle))).toBe(true);
  });

  test('MUTATION (a) — on n’invite qu’un abonné MUTUEL : ni un abonnement à sens unique, ni un abonné que je ne suis pas, ni un membre', () => {
    const liens = [
      { user_id: 'u-jordan', pseudo: 'jordan', lien: 'abonne' }, { user_id: 'u-jordan', pseudo: 'jordan', lien: 'abonnement' },
      { user_id: 'u-lea', pseudo: 'lea', lien: 'abonne' }, { user_id: 'u-lea', pseudo: 'lea', lien: 'abonnement' },
      { user_id: 'u-alexis', pseudo: 'alexis', lien: 'abonnement' },
      { user_id: 'u-melo', pseudo: 'melodie', lien: 'abonne' },
      { user_id: 'u-zoe', pseudo: 'zoe', lien: 'demande_envoyee' }, { user_id: 'u-zoe', pseudo: 'zoe', lien: 'abonne' }
    ];
    expect(Social.invitables(liens, []).map((x) => x.pseudo)).toEqual(['jordan', 'lea']);
    expect(Social.invitables(Social.liensRanges(liens), [{ user_id: 'u-lea' }]).map((x) => x.pseudo)).toEqual(['jordan']);
  });

  test('le nom : 3 à 24 caractères, espaces de bord retirés', () => {
    expect(Social.nomDeGuilde('  Les Fers du Mardi ')).toBe('Les Fers du Mardi');
    expect(Social.nomDeGuilde('ab')).toBeNull();
    expect(Social.nomDeGuilde('x'.repeat(25))).toBeNull();
    expect(Social.nomDeGuilde('x'.repeat(24))).toBe('x'.repeat(24));
  });

  test('les rangs : les neuf, Novice par défaut ; l’affichage « jordan · Squatteur · <titre du jeu> », sans titre jeu éteint', () => {
    expect(Social.RANGS).toEqual(['Squatteur', 'Bencheur', 'Terreur', 'Pousseur', 'Tireur', 'Chargeur', 'Gymbro', 'Motiveur', 'Novice']);
    expect(Social.RANG_PAR_DEFAUT).toBe('Novice');
    const T = { athlete: 'Athlète' };
    expect(Social.ligneMembre({ pseudo: 'jordan', rang: 'Squatteur', titre: 'athlete' }, T)).toBe('jordan · Squatteur · Athlète');
    expect(Social.ligneMembre({ pseudo: 'lea', rang: 'Novice', titre: null }, T)).toBe('lea · Novice');
    expect(Social.ligneMembre({ pseudo: 'lea', rang: 'Chef', titre: null }, T)).toBe('lea · Novice');
  });

  test('137 (05 #15) — DISCRIMINANT : « La guilde cette semaine » compte comme la jauge : records_semaine, jamais medailles', () => {
    // Une semaine à 4 séries médaillées, dont une seule sans dépasser la charge proposée.
    const semaine = { defi: 'records', n: 3, medailles: 4, records_semaine: 1 };
    expect(Social.recordsDeLaSemaine(semaine)).toBe(1);
    expect(Social.jaugeDuDefi(semaine, 2).phrase).toBe('1 record sur 3, à vous deux');   // le même chiffre que la carte
    expect(String(Social.recordsDeLaSemaine(semaine))).not.toBe(String(semaine.medailles));
    expect(Social.recordsDeLaSemaine({ records_semaine: null, medailles: 4 })).toBe(0);
    expect(Social.recordsDeLaSemaine(null)).toBe(0);
    // Le câblage : la carte lit cette fonction, plus `s.medailles`.
    const app = require('fs').readFileSync(require('path').join(__dirname, '../../v2/js/app.js'), 'utf8');
    expect(app).toMatch(/records: String\(Social\.recordsDeLaSemaine\(s\)\)/);
    expect(app).not.toMatch(/records: String\(s\.medailles\)/);
  });

  test('la jauge : « 11 séances sur 17 prévues, à vous quatre » ; les records sur N ; la variété sur N ; jamais au-delà de 100 %', () => {
    const j = Social.jaugeDuDefi({ defi: 'seances', n: null, seances_faites: 11, seances_prevues: 17 }, 4);
    expect(j.titre).toBe('Chacun fait ses séances prévues');
    expect(j.phrase).toBe('11 séances sur 17 prévues, à vous quatre');
    expect(j.part).toBeCloseTo(11 / 17);
    const r = Social.jaugeDuDefi({ defi: 'records', n: 5, records_semaine: 7 }, 2);
    expect(r.titre).toBe('5 records sans dépasser la charge proposée');
    expect(r.phrase).toBe('7 records sur 5, à vous deux');
    expect(r.part).toBe(1);
    const v = Social.jaugeDuDefi({ defi: 'variete', n: 10, exercices: 1 }, 1);
    expect(v.phrase).toBe('1 exercice différent sur 10');
    expect(Social.jaugeDuDefi({ defi: 'seances', seances_faites: 0, seances_prevues: 0 }, 3).part).toBe(0);
  });

  // 120 (D3, décision du 16/10/2026) — « le défi de guilde par défaut devient les séries de travail de la guilde dans la
  // semaine, objectif = sa moyenne des 4 dernières semaines ».
  test('⚠️ DISCRIMINANT — le défi par défaut : les séries de travail sur la moyenne des 4 semaines ; sans défi connu, lui', () => {
    const j = Social.jaugeDuDefi({ defi: 'series', n: null, series_faites: 37, series_cible: 42, seances_faites: 3, seances_prevues: 9 }, 4);
    expect([j.cle, j.titre, j.phrase]).toEqual(['series', '42 séries de travail, votre moyenne', '37 séries de travail sur 42, à vous quatre']);
    expect(j.part).toBeCloseTo(37 / 42);
    expect(j.phrase).not.toMatch(/séance|prévue/);
    // Un défi que l'app ne connaît pas (ou absent) : le premier de la liste, celui des séries.
    expect(Social.jaugeDuDefi({ series_faites: 1, series_cible: 1 }, 1).cle).toBe('series');
    // Sans historique chez personne : pas de cible inventée — le compte seul, la jauge vide.
    const z = Social.jaugeDuDefi({ defi: 'series', series_faites: 12, series_cible: 0 }, 2);
    expect([z.titre, z.phrase, z.part]).toEqual(['Vos séries de travail de la semaine', '12 séries de travail, à vous deux', 0]);
    // Avant v2_093, la base rend « seances » par défaut : l'écran dit ce qu'elle dit.
    expect(Social.jaugeDuDefi({ defi: 'seances', seances_faites: 3, seances_prevues: 9 }, 2).phrase).toBe('3 séances sur 9 prévues, à vous deux');
  });

  test('« encore N jours » jusqu’au dimanche', () => {
    expect(Social.joursRestants(new Date(2026, 9, 14))).toBe('encore 4 jours');
    expect(Social.joursRestants(new Date(2026, 9, 17))).toBe('encore 1 jour');
    expect(Social.joursRestants(new Date(2026, 9, 18))).toBe('dernier jour');
  });

  test('la progression : la part, sans vainqueur ; à part égale, le plus d’exercices ; sans exercice, en bas, « — »', () => {
    const p = Social.progressionRangee([
      { pseudo: 'aurel', moi: true, exercices: 10, exercices_record: 7 },
      { pseudo: 'lea', moi: false, exercices: 6, exercices_record: 5 },
      { pseudo: 'jordan', moi: false, exercices: 0, exercices_record: 0 },
      { pseudo: 'alexis', moi: false, exercices: 4, exercices_record: 1 }]);
    expect(p.map((x) => [x.pseudo, x.texte])).toEqual([['lea', '5 sur 6'], ['aurel', '7 sur 10'], ['alexis', '1 sur 4'], ['jordan', '—']]);
  });

  test('la route « /jeu/guilde » : un sous-onglet social, ouvert jeu éteint', () => {
    expect(Routeur.analyser('/jeu/guilde').vue).toBe('guilde');
    expect(Routeur.construire('guilde', {})).toBe('/jeu/guilde');
    expect(Routeur.ongletDe('guilde')).toBe('jeu');
    expect(Routeur.estVueDuJeu('guilde')).toBe(false);
    expect(Routeur.estVueSociale('guilde')).toBe(true);
  });
});

// ── Les nombres de l'appareil ─────────────────────────────────────────────────
// Mercredi 14 octobre 2026. Une séance : `[id, Date, séries [id, slug, charge, reps]]`.
const MAINTENANT = new Date(2026, 9, 14, 20);
function corpus(seances, journal) {
  const ss = [], series = [], par = {};
  seances.forEach(([id, d, sr]) => {
    ss.push({ id, debut: d.toISOString(), fin: null });
    par[id] = sr.map(([sid, slug, charge, reps, type], k) => ({ id: sid, session_id: id, rang: k + 1, exercise_slug: slug,
      charge_kg: charge, reps, type_serie: type || 'travail' }));
    par[id].forEach((x) => series.push(x));
  });
  ss.sort((a, b) => String(b.debut).localeCompare(String(a.debut)));
  const index = Modele.indexerExercices([]);
  return { seances: ss, series, exercices: [], seriesDe: (id) => par[id] || [], catalogue: () => index, journal: journal || [] };
}
const rec = (set_id, session_id, slug, type, d) => ({ set_id, session_id, exercise_slug: slug, type, valeur: 1, battu_le: d.toISOString() });
const pari = (set, charge, revision, extra) => Object.assign({ id: 'p-' + set + '-' + (revision || 0), module: 'consigne', exercise_slug: 'x',
  set_observe: set, fondement: { charge, revision: revision || 0 } }, extra);

describe('90 — faits.recordsSansDepasser : la règle du 14/10/2026', () => {
  const lun = new Date(2026, 9, 12, 18), mar = new Date(2026, 9, 13, 18);
  const c = corpus([
    ['A', lun, [['a1', 'squat', 100, 5], ['a2', 'squat', 102.5, 3], ['a3', 'dc', 80, 5], ['a4', 'gainage', null, null]]],
    ['B', mar, [['b1', 'presse', 200, 10], ['b2', 'rowing', 70, 8], ['b3', 'curl', 20, 12]]]
  ], [
    rec('a1', 'A', 'squat', 'charge_a_reps', lun), rec('a1', 'A', 'squat', 'un_rm_estime', lun),
    rec('a2', 'A', 'squat', 'charge_max', lun), rec('a3', 'A', 'dc', 'reps_a_charge', lun),
    rec('a4', 'A', 'gainage', 'duree_s', lun),
    rec('b1', 'B', 'presse', 'charge_a_reps', mar), rec('b2', 'B', 'rowing', 'cap', mar),
    rec('b3', 'B', 'curl', 'volume_seance', mar), rec('b3', 'B', 'curl', 'un_rm_estime', mar)
  ]);
  const paris = [
    pari('a1', 100), // à la charge proposée : compte
    pari('a2', 100), // 102,5 > 100 : ne compte pas
    pari('b1', null), // le cran au-dessus, sans chiffre : compte
    pari('b2', 72.5, 0), pari('b2', 65, 1), // la plus haute révision (65) : 70 la dépasse — ne compte pas
    pari('a3', 90, 0, { module: 'escalier' }) // un pari de marche n'est pas une consigne : a3 compte comme sans pari
  ];
  const ids = (l) => l.map((x) => x.set_id).sort();
  test('sans pari relié : compte ; à la charge proposée : compte ; au-dessus : non ; sans chiffre : compte ; la dernière révision fait foi', () => {
    expect(ids(Faits.creer().recordsSansDepasser(c, paris, '2026-10-12', '2026-10-18'))).toEqual(['a1', 'a3', 'a4', 'b1', 'b3']);
  });
  test('un_rm_estime ne compte jamais ; volume_seance compte (140) ; une série à deux records = un', () => {
    const l = Faits.creer().recordsSansDepasser(c, [], '2026-10-12', '2026-10-18');
    // 140 : b3 (volume_seance + un_rm_estime) compte par son volume.
    expect(ids(l)).toEqual(['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3']);
    expect(Faits.creer().TYPES_DE_LA_GUILDE).toEqual(['charge_a_reps', 'reps_a_charge', 'charge_max', 'cap', 'volume_seance', 'duree_s', 'distance_m']);
  });
  test('⚠️ DISCRIMINANT (140) — même séance : un volume seul compte dans la guilde, sauf pari relié dépassé', () => {
    const d = new Date(2026, 9, 14, 18);
    const cc = corpus([['V', d, [['v1', 'presse', 200, 10]]]], [rec('v1', 'V', 'presse', 'volume_seance', d)]);
    expect(ids(Faits.creer().recordsSansDepasser(cc, [], '2026-10-12', '2026-10-18'))).toEqual(['v1']);
    expect(ids(Faits.creer().recordsSansDepasser(cc, [pari('v1', 150)], '2026-10-12', '2026-10-18'))).toEqual([]);
    expect(ids(Faits.creer().recordsSansDepasser(cc, [pari('v1', 200)], '2026-10-12', '2026-10-18'))).toEqual(['v1']);
  });
  test('les bornes : un jour civil, inclus', () => {
    expect(ids(Faits.creer().recordsSansDepasser(c, paris, '2026-10-13', '2026-10-13'))).toEqual(['b1', 'b3']);
  });
});

describe('90 — faits.scoresDeGuilde : mes nombres publiés', () => {
  const j = (d, h) => new Date(2026, 9, d, h || 18);
  // Octobre : squat 3 séances (dont 2 cette semaine), dc 2 séances, curl 1 séance. Un record sans dépasser au squat (lundi)
  // et un au-dessus de la proposition au dc (jeudi 8).
  const c = corpus([
    ['s1', j(1), [['x1', 'squat', 100, 5], ['x2', 'curl', 20, 10]]],
    ['s2', j(8), [['x3', 'squat', 100, 5], ['x4', 'dc', 80, 5]]],
    ['s3', j(12), [['x5', 'squat', 105, 5], ['x6', 'dc', 80, 5]]],
    ['s4', j(13), [['x7', 'squat', 60, 5, 'echauffement']]],
    ['s5', j(30, 12) && new Date(2026, 8, 30, 18), [['x8', 'squat', 90, 5]]]
  ], [rec('x5', 's3', 'squat', 'charge_a_reps', j(12)), rec('x4', 's2', 'dc', 'charge_max', j(8))]);
  const paris = [pari('x4', 77.5)];
  test('séances de la semaine (une série de travail), exercices à 2 séances du mois, ceux avec un record sans dépasser', () => {
    const s = Faits.creer().scoresDeGuilde(c, paris, 4, MAINTENANT);
    expect(s).toEqual({ semaine: '2026-10-12', seances: 1, prevues: 4, records_semaine: 1, mois: '2026-10-01', exercices: 2, exercices_record: 1,
      // 120 (D3) — 2 séries de travail cette semaine (la chauffe du 13 ne compte pas) ; la moyenne des semaines d'avant
      // depuis la première (celle du 28/09) : (3 + 2) / 2 = 2,5 — les semaines du 14 et du 21/09 n'existent pas encore.
      series_semaine: 2, series_moyenne: 2.5 });
  });
  test('⚠️ DISCRIMINANT (120, D3) — mes séries : de musculation seulement (ni le tapis), moyenne des 4 semaines pleines d’avant', () => {
    const tapis = { slug: 'tapis', nom: 'Tapis', mesure: 'duree_distance', muscles_primaires: [] };
    const squat = { slug: 'squat', nom: 'Squat', mesure: 'charge_reps', muscles_primaires: ['quadriceps'] };
    const c2 = corpus([
      ['t0', j(14, 9), [['y0', 'squat', 100, 5], ['y1', 'tapis', null, null]]],          // cette semaine : 1 (pas le tapis)
      ['t1', j(6), [['y2', 'squat', 100, 5], ['y3', 'squat', 100, 5], ['y4', 'tapis', null, null]]], // -1 : 2
      ['t2', j(1), [['y5', 'squat', 100, 5]]],                                           // -2 : 1
      ['t3', new Date(2026, 8, 16, 18), [['y6', 'squat', 100, 5], ['y7', 'squat', 100, 5], ['y8', 'squat', 100, 5]]], // -4 : 3
      ['t4', new Date(2026, 8, 1, 18), [['y9', 'squat', 100, 5]]]                         // -6 : hors fenêtre
    ], []);
    const index = Modele.indexerExercices([tapis, squat]);
    c2.catalogue = () => index;
    const s = Faits.creer().scoresDeGuilde(c2, [], 4, MAINTENANT);
    // Les 4 semaines d'avant : 2, 1, 0 (la semaine du 21/09 sans séance compte 0), 3 → 6 / 4.
    expect([s.series_semaine, s.series_moyenne]).toEqual([1, 1.5]);
    // Sans aucune semaine d'avant (première séance cette semaine) : 0, rien n'est ajouté à l'objectif.
    const neuf = corpus([['n0', j(13), [['z0', 'squat', 100, 5]]]], []);
    neuf.catalogue = () => index;
    expect(Faits.creer().scoresDeGuilde(neuf, [], 4, MAINTENANT).series_moyenne).toBe(0);
  });
  test('⚠️ DISCRIMINANT (121, suite du 119) — une sortie (tapis seul) n’est ni une séance de la guilde, ni un exercice de sa Progression', () => {
    const tapis = { slug: 'tapis', nom: 'Tapis', mesure: 'duree_distance', muscles_primaires: [] };
    const squat = { slug: 'squat', nom: 'Squat', mesure: 'charge_reps', muscles_primaires: ['quadriceps'] };
    // Cette semaine : une séance de squat (avec du tapis) et deux sorties de tapis seul ; le tapis est fait 3 fois
    // dans le mois, le squat 2 fois.
    const c3 = corpus([
      ['m0', j(12), [['q0', 'squat', 100, 5], ['q1', 'tapis', null, null]]],
      ['m1', j(13), [['q2', 'tapis', null, null]]],
      ['m2', j(14, 9), [['q3', 'tapis', null, null]]],
      ['m3', j(6), [['q4', 'squat', 100, 5]]]
    ], []);
    // La sortie a une durée et une distance (pas de charge × reps) : c'est bien une série de travail du journal.
    c3.series.filter((x) => x.exercise_slug === 'tapis').forEach((x) => { x.duree_s = 1800; x.distance_m = 5000; });
    const index = Modele.indexerExercices([tapis, squat]);
    c3.catalogue = () => index;
    expect(c3.series.filter((x) => x.exercise_slug === 'tapis').every((x) => Modele.estTravail(x))).toBe(true);
    const s = Faits.creer().scoresDeGuilde(c3, [], 4, MAINTENANT);
    // Avant 121 : 3 séances (les deux sorties comptaient) et 2 exercices (le tapis, 3 séances, comptait).
    expect([s.seances, s.exercices, s.series_semaine]).toEqual([1, 1, 1]);
  });
  test('séances prévues : le profil d’abord ; vide, la médiane de l’historique (`habitudes`) ; sans rien, 0', () => {
    const f = Faits.creer();
    const h = f.habitudes(c);
    expect(f.scoresDeGuilde(c, paris, null, MAINTENANT).prevues).toBe(h ? h.seances_par_semaine : 0);
    expect(f.scoresDeGuilde(c, paris, 0, MAINTENANT).prevues).toBe(h ? h.seances_par_semaine : 0);
    expect(f.scoresDeGuilde(corpus([], []), [], null, MAINTENANT).prevues).toBe(0);
    expect(f.scoresDeGuilde(c, paris, 6, MAINTENANT).prevues).toBe(6);
  });
  test('aucune colonne de poids, de note ou d’effort dans ce qui part', () => {
    const s = Faits.creer().scoresDeGuilde(c, paris, 4, MAINTENANT);
    expect(Object.keys(s).sort()).toEqual(Social.COLONNES_GUILDE.slice().sort());
  });
});

// ── La migration, le faux serveur et l'app disent la même chose ───────────────
describe('90 — v2_080 : le texte de la migration', () => {
  const liste = (re) => { const m = re.exec(MIGRATION); return m ? m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')) : null; };
  test('les rangs, les défis et les couleurs de la base sont ceux de l’app et du faux serveur', () => {
    expect(liste(/guilde_membres_rang CHECK \(rang IN\s*\(([^)]*)\)/)).toEqual(Social.RANGS);
    // 120 (D3) — v2_093 ajoute « series » ; v2_080 garde ses trois.
    expect(liste(/guilde_defis_type CHECK \(type IN \(([^)]*)\)/)).toEqual(['seances', 'records', 'variete']);
    const m093 = /guilde_defis_type CHECK \(type IN \(([^)]*)\)/.exec(MIGRATION_093);
    expect(m093[1].split(',').map((x) => x.trim().replace(/^'|'$/g, ''))).toEqual(Social.DEFIS.map((d) => d.cle));
    expect(liste(/guildes_couleur CHECK \(couleur IN\s*\(([^)]*)\)/)).toEqual(Social.COULEURS_GUILDE);
    expect(FauxSocial.GUILDE.RANGS).toEqual(Social.RANGS);
    expect(FauxSocial.GUILDE.DEFIS).toEqual(Social.DEFIS.map((d) => d.cle));
    expect(FauxSocial.GUILDE.COULEURS).toEqual(Social.COULEURS_GUILDE);
    // 140 : l'app compte aussi `volume_seance`; la colonne `records` du défi lue en base (v2_080, v2_081, v2_093) garde
    // les six types — écart connu, à router vers Claude.ai (migration), non touché ici.
    expect(liste(/r\.type IN \(([^)]*)\)/)).toEqual(Faits.creer().TYPES_DE_LA_GUILDE.filter((t) => t !== 'volume_seance'));
  });
  test('les règles en base : une guilde par personne (clé primaire), 30 au plus, inviter un mutuel, l’administration au plus ancien', () => {
    expect(MIGRATION).toMatch(/user_id\s+uuid PRIMARY KEY REFERENCES auth\.users\(id\) ON DELETE CASCADE,\s*\n\s*guilde_id/);
    expect(MIGRATION).toMatch(/>= 30 THEN\s*\n\s*RAISE EXCEPTION 'guilde_pleine'/);
    expect(MIGRATION).toMatch(/IF NOT social_mutuel\(NEW\.invitant, NEW\.invite\) THEN/);
    expect(MIGRATION).toMatch(/ORDER BY entre_le, user_id LIMIT 1/);
    expect(MIGRATION).toMatch(/UPDATE guildes SET admin = suivant/);
    expect(MIGRATION).toMatch(/translate\(lower\(btrim\(nom\)\)/);
    expect(MIGRATION).not.toMatch(/unaccent\s*\(/);
  });
  test('chaque fonction : SECURITY DEFINER (sauf les deux dates), search_path figé ; anon révoqué ; aucune colonne interdite', () => {
    const fonctions = MIGRATION.split('CREATE FUNCTION ').slice(1);
    expect(fonctions.length).toBeGreaterThan(20);
    fonctions.forEach((f) => {
      const nom = /^public\.(\w+)/.exec(f)[1];
      expect([nom, /SET search_path = public/.test(f.split('AS $f$')[0])]).toEqual([nom, true]);
      if (['guilde_semaine_courante', 'guilde_mois_courant', 'guilde_membres_avant_modif'].indexOf(nom) < 0) {
        expect([nom, /SECURITY DEFINER/.test(f.split('AS $f$')[0])]).toEqual([nom, true]);
      }
    });
    expect(MIGRATION).toMatch(/FROM PUBLIC, anon;/);
    const rendues = MIGRATION.match(/RETURNS TABLE\(([^)]*)\)/g).join(' ');
    ['poids_corps_kg', 'note', 'rpe', 'ressenti', 'douleur'].forEach((k) => expect(rendues).not.toMatch(new RegExp('\\b' + k + '\\b')));
    expect(MIGRATION).not.toMatch(/CREATE POLICY \w+ ON public\.(sessions|sets|records)\b/);
  });
});

describe('90 — le faux serveur imite v2_080', () => {
  function decor() {
    const base = { profiles: [{ id: 'u-moi', username: 'moi', compte_prive: true }], sessions: [], sets: [], records: [] };
    const f = FauxSocial.creer(base, { moi: 'u-moi' });
    ['jordan', 'lea', 'alexis'].forEach((p) => f.etat.profils.push({ id: 'u-' + p, username: p, compte_prive: true, jeu_actif: true, jeu_niveau: 3 }));
    const ab = (a, b) => f.etat.abonnements.push({ suiveur: a, suivi: b, statut: 'accepte' });
    ab('u-moi', 'u-jordan'); ab('u-jordan', 'u-moi'); ab('u-moi', 'u-lea'); ab('u-lea', 'u-moi'); ab('u-moi', 'u-alexis');
    return f;
  }
  const refus = (r) => r && r.code ? r.message : null;

  test('le nom unique sans casse ni accents ; une guilde par personne', () => {
    const f = decor();
    expect(typeof f.rpc('u-moi', 'guilde_creer', { p_nom: 'Les Fers du Mardi', p_couleur: '#b39ad1' })).toBe('string');
    expect(refus(f.rpc('u-lea', 'guilde_creer', { p_nom: 'LES FERS DU MARDÍ', p_couleur: '#b39ad1' }))).toMatch(/guildes_nom_cle_uniq/);
    expect(refus(f.rpc('u-moi', 'guilde_creer', { p_nom: 'Autre', p_couleur: '#b39ad1' }))).toMatch(/guilde_deja_dans_une/);
    expect(refus(f.rpc('u-lea', 'guilde_creer', { p_nom: 'ab', p_couleur: '#b39ad1' }))).toMatch(/guildes_nom_longueur/);
  });

  test('MUTATION (a) — la base refuse d’inviter un non-mutuel (alexis, que je suis sans qu’il me suive)', () => {
    const f = decor();
    f.rpc('u-moi', 'guilde_creer', { p_nom: 'Les Fers', p_couleur: '#b39ad1' });
    expect(refus(f.rpc('u-moi', 'guilde_inviter', { p_user: 'u-alexis' }))).toMatch(/guilde_invite_non_mutuel/);
    expect(refus(f.rpc('u-moi', 'guilde_inviter', { p_user: 'u-jordan' }))).toBeNull();
    expect(f.rpc('u-jordan', 'guilde_invitations_recues').map((i) => i.invitant)).toEqual(['moi']);
  });

  test('MUTATION (b) — la base refuse un défi sur le tonnage ; l’administrateur seul choisit', () => {
    const f = decor();
    f.rpc('u-moi', 'guilde_creer', { p_nom: 'Les Fers', p_couleur: '#b39ad1' });
    expect(refus(f.rpc('u-moi', 'guilde_choisir_defi', { p_type: 'tonnage', p_n: 5 }))).toMatch(/guilde_defis_type/);
    expect(refus(f.rpc('u-moi', 'guilde_choisir_defi', { p_type: 'records', p_n: 3 }))).toBeNull();
    f.rpc('u-moi', 'guilde_inviter', { p_user: 'u-jordan' });
    f.rpc('u-jordan', 'guilde_repondre', { p_guilde: f.guildeDe('u-moi'), p_rejoindre: true });
    expect(refus(f.rpc('u-jordan', 'guilde_choisir_defi', { p_type: 'seances', p_n: null }))).toMatch(/guilde_pas_admin/);
    expect(f.rpc('u-jordan', 'guilde_semaine')[0]).toMatchObject({ defi: 'records', n: 3 });
  });

  test('MUTATION (c) — le créateur part : l’administration passe au plus ancien ; le dernier part : la guilde disparaît', () => {
    const f = decor();
    const g = f.rpc('u-moi', 'guilde_creer', { p_nom: 'Les Fers', p_couleur: '#b39ad1' });
    f.rpc('u-moi', 'guilde_inviter', { p_user: 'u-jordan' });
    f.rpc('u-moi', 'guilde_inviter', { p_user: 'u-lea' });
    f.rpc('u-lea', 'guilde_repondre', { p_guilde: g, p_rejoindre: true });
    f.rpc('u-jordan', 'guilde_repondre', { p_guilde: g, p_rejoindre: true });
    f.rpc('u-moi', 'guilde_quitter');
    expect(f.etat.guildes[0].admin).toBe('u-lea');
    expect(f.rpc('u-lea', 'guilde_moi')[0].admin).toBe(true);
    f.rpc('u-lea', 'guilde_quitter');
    expect(f.etat.guildes[0].admin).toBe('u-jordan');
    f.rpc('u-jordan', 'guilde_quitter');
    expect(f.etat.guildes).toEqual([]);
  });

  test('MUTATION (d) — le défi est FIGÉ dès qu’un membre a terminé une séance cette semaine ; modifiable avant', () => {
    const f = decor();
    f.rpc('u-moi', 'guilde_creer', { p_nom: 'Les Fers', p_couleur: '#b39ad1' });
    expect(f.rpc('u-moi', 'guilde_semaine')[0].defi_modifiable).toBe(true);
    expect(refus(f.rpc('u-moi', 'guilde_choisir_defi', { p_type: 'records', p_n: 3 }))).toBeNull();
    expect(refus(f.rpc('u-moi', 'guilde_choisir_defi', { p_type: 'variete', p_n: 5 }))).toBeNull();
    f.etat.sessions.push({ id: 'm1', user_id: 'u-moi', debut: new Date(Date.now() + 1000).toISOString(), statut: 'terminee', visibilite: 'mutuels' });
    expect(f.rpc('u-moi', 'guilde_semaine')[0].defi_modifiable).toBe(false);
    expect(refus(f.rpc('u-moi', 'guilde_choisir_defi', { p_type: 'records', p_n: 3 }))).toMatch(/guilde_defi_fige/);
    expect(f.rpc('u-moi', 'guilde_semaine')[0]).toMatchObject({ defi: 'variete', n: 5 });
    expect(Social.defiModifiable({ defi_modifiable: false })).toBe(false);
    expect(Social.defiModifiable({ defi_modifiable: true })).toBe(true);
    expect(Social.defiModifiable(null)).toBe(false);
    expect(MIGRATION).toMatch(/IF guilde_semaine_lancee\(g\) THEN RAISE EXCEPTION 'guilde_defi_fige'/);
  });

  test('MUTATION (b, 92 / v2_083) — guilde créée en cours de semaine, après des séances : le défi reste modifiable jusqu’à la prochaine séance terminée', () => {
    let maintenant = new Date(2026, 9, 14, 12, 0);   // mercredi 14/10/2026, midi
    const base = { profiles: [{ id: 'u-moi', username: 'moi', compte_prive: true }], records: [], sets: [],
      sessions: [{ id: 'lundi', user_id: 'u-moi', debut: new Date(2026, 9, 12, 18).toISOString(),
        fin: new Date(2026, 9, 12, 19).toISOString(), statut: 'terminee', visibilite: 'mutuels' }] };
    const f = FauxSocial.creer(base, { moi: 'u-moi', maintenant: () => maintenant });
    f.rpc('u-moi', 'guilde_creer', { p_nom: 'Les gros muscles', p_couleur: '#b39ad1' });
    expect(f.rpc('u-moi', 'guilde_semaine')[0].defi_modifiable).toBe(true);
    expect(refus(f.rpc('u-moi', 'guilde_choisir_defi', { p_type: 'records', p_n: 3 }))).toBeNull();
    maintenant = new Date(2026, 9, 15, 19);
    f.etat.sessions.push({ id: 'jeudi', user_id: 'u-moi', debut: new Date(2026, 9, 15, 18).toISOString(),
      fin: new Date(2026, 9, 15, 19).toISOString(), statut: 'terminee', visibilite: 'mutuels' });
    expect(f.rpc('u-moi', 'guilde_semaine')[0].defi_modifiable).toBe(false);
    expect(refus(f.rpc('u-moi', 'guilde_choisir_defi', { p_type: 'variete', p_n: 5 }))).toMatch(/guilde_defi_fige/);
    expect(Social.PHRASE_DEFI_FIGE).toBe('Défi figé : la semaine a commencé. Tu en choisiras un lundi.');
    const sql = require('fs').readFileSync(require('path').join(__dirname, '../../v2-atelier/migrations-proposees/v2_083_guilde_defi_nouvelle_guilde.sql'), 'utf8');
    expect(sql).toMatch(/coalesce\(s\.fin, s\.debut\) > g\.cree_le/);
  });

  test('30 membres au plus ; les rangs de la liste seulement', () => {
    const f = decor();
    const g = f.rpc('u-moi', 'guilde_creer', { p_nom: 'Trente', p_couleur: '#6fa3d8' });
    for (let i = 0; i < 29; i++) f.etat.membres.push({ user_id: 'x' + i, guilde_id: g, rang: 'Novice', entre_le: 1000 + i });
    expect(refus(f.rpc('u-moi', 'guilde_inviter', { p_user: 'u-jordan' }))).toMatch(/guilde_pleine/);
    expect(refus(f.rpc('u-moi', 'guilde_choisir_rang', { p_rang: 'Chef' }))).toMatch(/guilde_membres_rang/);
    expect(refus(f.rpc('u-moi', 'guilde_choisir_rang', { p_rang: 'Terreur' }))).toBeNull();
  });

  test('mes nombres de guilde : mes colonnes seulement — une autre est une fuite', () => {
    const f = decor();
    const lundi = f.lundiCourant(), mois = f.moisCourant();
    const ok = { user_id: 'u-moi', semaine: lundi, seances: 2, prevues: 4, records_semaine: 1, mois, exercices: 3, exercices_record: 1 };
    expect(f.appeler('u-moi', 'POST', 'guilde_scores', ok).status).toBe(201);
    expect(f.appeler('u-moi', 'POST', 'guilde_scores', Object.assign({}, ok, { poids_corps_kg: 98 })).status).toBe(400);
    expect(f.etat.fuites).toEqual([{ table: 'guilde_scores', champs: ['poids_corps_kg'] }]);
    expect(f.appeler('u-jordan', 'POST', 'guilde_scores', ok).status).toBe(403);
  });
});

// ── 120 (D3, v2_093) — les séries publiées, des deux côtés de la migration ─────
describe('120 (D3) — `Donnees.publierScoresGuilde` : les séries, et la base d’avant v2_093', () => {
  require('../../v2/js/donnees.js');
  const Donnees = global.THDonnees || global.self.THDonnees;
  // Un client PostgREST minimal sur le faux serveur : `from('guilde_scores').upsert(l)` → POST.
  const clientDe = (f) => ({ from: (table) => ({ upsert: (l) => {
    const r = f.appeler('u-moi', 'POST', table, l);
    return Promise.resolve(r.status >= 400 ? { data: null, error: r.data } : { data: null, error: null });
  } }) });
  const scores = (f) => ({ semaine: f.lundiCourant(), seances: 2, prevues: 4, records_semaine: 1, mois: f.moisCourant(),
    exercices: 3, exercices_record: 1, series_semaine: 14, series_moyenne: 12.25 });
  function decor(v2_093) {
    const base = { profiles: [{ id: 'u-moi', username: 'moi', compte_prive: true }], sessions: [], sets: [], records: [] };
    const f = FauxSocial.creer(base, { moi: 'u-moi', v2_093 });
    global.THClient = { obtenir: () => clientDe(f) };
    return f;
  }
  afterAll(() => { delete global.THClient; });
  test('après v2_093 : les deux colonnes partent ; guilde_semaine rend le défaut « series » et sa cible', async () => {
    const f = decor(true);
    expect(await Donnees.publierScoresGuilde('u-moi', scores(f))).toBe(true);
    const l = f.etat.gscores.filter((x) => x.user_id === 'u-moi')[0];
    expect([l.series_semaine, l.series_moyenne]).toEqual([14, 12.25]);
    expect(f.etat.fuites).toEqual([]);
  });
  test('⚠️ DISCRIMINANT — avant v2_093 : PGRST204, la ligne repart SANS les séries ; rien ne casse', async () => {
    const f = decor(false);
    expect(await Donnees.publierScoresGuilde('u-moi', scores(f))).toBe(true);
    const l = f.etat.gscores.filter((x) => x.user_id === 'u-moi')[0];
    expect(l && l.seances).toBe(2);
    expect(l.series_semaine).toBeUndefined();
    // Une fois par colonne (la base nomme la première inconnue), puis plus jamais dans la session.
    expect(f.etat.journal.filter((j) => j.op === 'refus').map((j) => j.refus)).toEqual(['PGRST204', 'PGRST204']);
    expect(await Donnees.publierScoresGuilde('u-moi', scores(f))).toBe(true);
    expect(f.etat.journal.filter((j) => j.op === 'refus').length).toBe(2);
    expect(f.etat.fuites).toEqual([]);
    // Le défaut de la base d'avant reste « seances » : l'écran affiche ce qu'elle dit.
    expect(f.rpc('u-moi', 'guilde_creer', { p_nom: 'Les Barres', p_couleur: '#b39ad1' })).not.toBeInstanceOf(Error);
    const s = f.rpc('u-moi', 'guilde_semaine', {});
    expect((Array.isArray(s) ? s[0] : s).defi).toBe('seances');
  });
});

describe('120 — v2_093 : le texte de la migration dit ce que l’app et le faux serveur font', () => {
  test('D3 : le défaut « series », les deux nombres, « series » sans nombre ; les défis en cours figés en « seances »', () => {
    expect(MIGRATION_093).toMatch(/coalesce\(d\.type, 'series'\)/);
    expect(MIGRATION_093).toMatch(/series_faites integer, series_cible integer\)/);
    expect(MIGRATION_093).toMatch(/\(type IN \('seances','series'\) AND n IS NULL\)/);
    expect(MIGRATION_093).toMatch(/SELECT g\.id, guilde_semaine_courante\(\), 'seances', NULL FROM public\.guildes g\s*\n\s*WHERE guilde_semaine_lancee\(g\.id\)/);
    expect(FauxSocial.GUILDE.COLONNES_SERIES).toEqual(['series_semaine', 'series_moyenne']);
    expect(Social.COLONNES_GUILDE.slice(-2)).toEqual(FauxSocial.GUILDE.COLONNES_SERIES);
  });
  test('D1 : le récap du groupe ignore `un_rm_estime` ; une transaction ; aucune politique créée', () => {
    expect(MIGRATION_093).toMatch(/AND r\.type <> 'un_rm_estime'\)/);
    expect(MIGRATION_093).toMatch(/^BEGIN;$/m);
    expect(MIGRATION_093).toMatch(/^COMMIT;$/m);
    expect(MIGRATION_093).not.toMatch(/CREATE POLICY|ALTER POLICY|DROP POLICY/);
  });
});

// ── 121 (audit du 16/10/2026, 05 #5) — mes nombres de guilde partent PAR LA FILE, écran Guilde ouvert ou non ─────────
describe('121 — `poserScoresGuilde` / `publierScoresGuildeDeLaFile` : à la fin d’une séance et au démarrage', () => {
  const vm = require('vm');
  const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
  const extraire = (nom) => {
    const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
    if (!m) throw new Error('introuvable : ' + nom);
    return m[0];
  };
  const SCORES = { semaine: '2026-10-12', seances: 2, prevues: 4, records_semaine: 1, mois: '2026-10-01', exercices: 3,
    exercices_record: 1, series_semaine: 20, series_moyenne: 18 };
  function bac(o) {
    const j = { poses: [], publies: [], meta: [] };
    const ctx = {
      Social, Attente: { SOCIAL: 'social', GESTE: 'geste' }, console: { warn: () => {} },
      userId: () => 'u-moi', profil: { seances_par_semaine: 4 }, social: { refus: { phrase: 'garde-moi' } },
      faits: { scoresDeGuilde: () => Object.assign({}, SCORES, o.calcul || {}) }, corpus: () => ({}), local: {},
      uuid: () => 'x', scoresGuildeConnus: o.connus === undefined ? null : o.connus, scoresGuildePublies: null,
      poser: (op) => { j.poses.push(op); return Promise.resolve(); }, redessinerSocial: () => { j.redessine = true; },
      Donnees: { guildeMoi: () => Promise.resolve(o.membre ? { id: 'g-1' } : null),
        publierScoresGuilde: (moi, s) => { j.publies.push([moi, s]); return Promise.resolve(true); } },
      Cache: { ecrireMeta: (k, v) => { j.meta.push([k, v]); return Promise.resolve(); } }, CLE_SCORES_GUILDE: 'guilde-scores-connus'
    };
    vm.createContext(ctx);
    ['mesScoresDeGuilde', 'poserGesteSocial', 'poserScoresGuilde', 'publierScoresGuildeDeLaFile'].forEach((n) => vm.runInContext(extraire(n), ctx));
    return { ctx, j, run: (code) => vm.runInContext(code, ctx) };
  }
  test('⚠️ DISCRIMINANT — écran Guilde jamais ouvert (`social.guilde` absent) : mes nombres sont POSÉS dans la file, une seule clé ; rien d’autre ne change à l’écran', async () => {
    const b = bac({});
    expect(await b.run('poserScoresGuilde()')).toBe(true);
    expect(b.j.poses).toHaveLength(1);
    const op = b.j.poses[0];
    expect([op.table, op.op, op.id, op.alaFin, op.donnees.geste]).toEqual(['social', 'geste', 'scores_guilde|u-moi', true, 'scores_guilde']);
    expect(op.donnees.scores).toEqual(SCORES);
    // Une publication de fond : la phrase d'un refus reste, rien n'est redessiné.
    expect([b.ctx.social.refus.phrase, b.j.redessine]).toEqual(['garde-moi', undefined]);
  });
  test('au démarrage : rien n’est posé si l’appareil les a déjà fait partir ; une semaine, un mois ou une séance de plus : posés', async () => {
    expect(await bac({ connus: SCORES }).run('poserScoresGuilde()')).toBe(false);
    expect(await bac({ connus: SCORES, calcul: { semaine: '2026-10-19' } }).run('poserScoresGuilde()')).toBe(true);
    expect(await bac({ connus: SCORES, calcul: { seances: 3 } }).run('poserScoresGuilde()')).toBe(true);
  });
  test('la vidange : membre, elle les écrit ; sinon rien ne part — et l’appareil retient ce qu’il a traité', async () => {
    const d = { moi: 'u-moi', geste: 'scores_guilde', scores: SCORES };
    const m = bac({ membre: true });
    m.ctx.__d = d;
    await m.run('publierScoresGuildeDeLaFile(__d)');
    expect(m.j.publies).toEqual([['u-moi', SCORES]]);
    expect([m.ctx.scoresGuildePublies, m.ctx.scoresGuildeConnus, m.j.meta]).toEqual([SCORES, SCORES, [['guilde-scores-connus', SCORES]]]);
    const n = bac({ membre: false });
    n.ctx.__d = d;
    await n.run('publierScoresGuildeDeLaFile(__d)');
    expect(n.j.publies).toEqual([]);
    // Pas membre : rien de publié en base (l'ouverture de la guilde publiera en direct), mais l'appareil sait l'avoir traité.
    expect([n.ctx.scoresGuildePublies, n.ctx.scoresGuildeConnus]).toEqual([null, SCORES]);
  });
  test('la fin d’une séance pose (plus de condition « écran Guilde ouvert ») ; le démarrage pose une fois le profil lu', () => {
    expect(APP).not.toMatch(/if \(social\.guilde && social\.guilde\.g\) publierScoresGuilde\(\)/);
    expect(extraire('terminerSeance').match(/poserScoresGuilde\(\)/g) || []).toHaveLength(1);
    expect(extraire('entrerVraiment')).toMatch(/profilLu[\s\S]*poserScoresGuilde\(\)/);
    expect(Social.gesteValide({ moi: 'u', geste: 'scores_guilde', scores: SCORES })).toBe(true);
    expect(Social.gesteValide({ moi: 'u', geste: 'scores_guilde', scores: { semaine: 'x' } })).toBe(false);
  });
});

// ── 121 (D5, décision d'Aurélien du 16/10/2026 ; audit 05 #6, #7, #11) — la guilde respecte le compte privé et le blocage ──
describe('121 — la guilde, le compte privé (D5) et le blocage (05 #6) : la base (v2_094), le faux serveur, l’écran', () => {
  const MIGRATION_094 = fs.readFileSync(path.join(__dirname, '../../v2-atelier/migrations-proposees/v2_094_guilde_prive_bloque.sql'), 'utf8');
  // moi (privé) ; jordan (mutuel) ; melodie (PRIVÉE, mutuelle de jordan, pas la mienne) ; pub (PUBLIC, que je ne suis pas) ;
  // olga (mutuelle de jordan) — tous dans la guilde de jordan, sauf olga.
  function decor(options) {
    const base = { profiles: [{ id: 'u-moi', username: 'moi', compte_prive: true }], sessions: [], sets: [], records: [] };
    const f = FauxSocial.creer(base, Object.assign({ moi: 'u-moi' }, options || {}));
    [['jordan', true], ['melodie', true], ['pub', false], ['olga', true]].forEach(([p, prive]) =>
      f.etat.profils.push({ id: 'u-' + p, username: p, compte_prive: prive, jeu_actif: true, jeu_titre: 'athlete' }));
    const ab = (a, b) => f.etat.abonnements.push({ suiveur: a, suivi: b, statut: 'accepte' });
    const mutuels = (a, b) => { ab(a, b); ab(b, a); };
    mutuels('u-moi', 'u-jordan'); mutuels('u-jordan', 'u-melodie'); mutuels('u-jordan', 'u-pub'); mutuels('u-jordan', 'u-olga');
    const g = f.rpc('u-jordan', 'guilde_creer', { p_nom: 'Les Fers', p_couleur: '#b39ad1' });
    ['u-moi', 'u-melodie', 'u-pub'].forEach((u) => { f.rpc('u-jordan', 'guilde_inviter', { p_user: u }); f.rpc(u, 'guilde_repondre', { p_guilde: g, p_rejoindre: true }); });
    const d = new Date().toISOString();
    ['jordan', 'melodie', 'pub'].forEach((p) => {
      f.etat.sessions.push({ id: 's-' + p, user_id: 'u-' + p, titre: 'Séance de ' + p, debut: d, fin: d, statut: 'terminee', visibilite: 'mutuels' });
      f.etat.sets.push({ id: 't-' + p, session_id: 's-' + p, exercise_slug: 'squat', rang: 1, charge_kg: 100, reps: 5, type_serie: 'travail' });
      f.etat.records.push({ set_id: 't-' + p, session_id: 's-' + p, battu_le: d, exercise_slug: 'squat', type: 'charge_max', valeur: 100 });
      f.etat.gscores.push({ user_id: 'u-' + p, semaine: f.lundiCourant(), seances: 1, prevues: 2, records_semaine: 1, mois: f.moisCourant(),
        exercices: 2, exercices_record: 1 });
    });
    return { f, g };
  }
  const fil = (f) => f.rpc('u-moi', 'guilde_fil').map((l) => l.pseudo).sort();
  test('⚠️ DISCRIMINANT (D5) — un membre non abonné ne voit au fil ni les séances ni les médailles d’un compte privé ; un compte public, oui ; abonné accepté, oui', () => {
    const { f } = decor();
    expect(fil(f)).toEqual(['jordan', 'pub']);
    expect(f.rpc('u-moi', 'guilde_records_seance', { p_session: 's-melodie' })).toEqual([]);
    expect(f.rpc('u-moi', 'guilde_records_seance', { p_session: 's-pub' })).toHaveLength(1);
    // Les chiffres de la guilde comptent toujours melodie : la Progression la nomme, « La guilde cette semaine » compte sa séance.
    expect(f.rpc('u-moi', 'guilde_progression').map((x) => x.pseudo)).toContain('melodie');
    expect(f.rpc('u-moi', 'guilde_semaine')[0].seances).toBe(3);
    // Une demande ne suffit pas ; acceptée, la séance revient.
    f.etat.abonnements.push({ suiveur: 'u-moi', suivi: 'u-melodie', statut: 'demande' });
    expect(fil(f)).toEqual(['jordan', 'pub']);
    f.etat.abonnements.filter((x) => x.suiveur === 'u-moi' && x.suivi === 'u-melodie')[0].statut = 'accepte';
    expect(fil(f)).toEqual(['jordan', 'melodie', 'pub']);
  });
  test('avant v2_094 (la base d’aujourd’hui) : le fil de la guilde rend tout — l’app marche des deux côtés de la migration', () => {
    const { f } = decor({ v2_094: false });
    expect(fil(f)).toEqual(['jordan', 'melodie', 'pub']);
  });
  test('⚠️ DISCRIMINANT (05 #6) — je bloque melodie : « un membre » (ni pseudo, ni rang, ni titre ; l’identifiant reste), hors de la Progression et du fil ; dans les deux sens', () => {
    const { f } = decor();
    f.etat.blocages.push({ bloqueur: 'u-moi', bloque: 'u-melodie' });
    const m = f.rpc('u-moi', 'guilde_liste_membres');
    expect(m).toHaveLength(4);
    expect(m.filter((x) => x.user_id === 'u-melodie')[0]).toMatchObject({ pseudo: null, rang: null, titre: null });
    expect(m.map((x) => Social.ligneMembre(x, { athlete: 'Athlète' }))).toEqual(['jordan · Novice · Athlète', 'moi · Novice', 'un membre', 'pub · Novice · Athlète']);
    expect(f.rpc('u-moi', 'guilde_progression').map((x) => x.pseudo)).not.toContain('melodie');
    expect(f.rpc('u-melodie', 'guilde_liste_membres').filter((x) => x.user_id === 'u-moi')[0].pseudo).toBeNull();
    expect(f.rpc('u-melodie', 'guilde_progression').map((x) => x.pseudo)).not.toContain('moi');
    // Avant v2_094 : nommée, comme aujourd'hui.
    const avant = decor({ v2_094: false }).f;
    avant.etat.blocages.push({ bloqueur: 'u-moi', bloque: 'u-melodie' });
    expect(avant.rpc('u-moi', 'guilde_liste_membres').map((x) => x.pseudo)).toContain('melodie');
  });
  test('⚠️ DISCRIMINANT (05 #6) — un tiers n’invite pas quelqu’un que j’ai bloqué (ou qui m’a bloqué) ; une invitation d’avant le blocage est tue et refusée à l’entrée', () => {
    const { f, g } = decor();
    f.etat.blocages.push({ bloqueur: 'u-olga', bloque: 'u-moi' });
    expect(f.rpc('u-jordan', 'guilde_inviter', { p_user: 'u-olga' }).message).toBe('guilde_bloque');
    f.etat.invitations.push({ guilde_id: g, invite: 'u-olga', invitant: 'u-jordan', cree_le: 99 });
    expect(f.rpc('u-olga', 'guilde_invitations_recues')).toEqual([]);
    expect(f.rpc('u-olga', 'guilde_repondre', { p_guilde: g, p_rejoindre: true }).message).toBe('guilde_bloque');
    f.etat.blocages = [];
    expect(f.rpc('u-olga', 'guilde_invitations_recues')).toHaveLength(1);
    expect(f.rpc('u-olga', 'guilde_repondre', { p_guilde: g, p_rejoindre: true })).toBeNull();
  });
  test('l’écran : « un membre » ; bloquer met à jour aussitôt (Membres, Progression) ; « Voir la séance » seulement pour qui je suis', () => {
    expect(Social.ligneMembre({ pseudo: null, rang: null }, {})).toBe('un membre');
    const lu = { g: { nom: 'Les Fers', admin: false, membres: 3 }, membres: [{ user_id: 'u-moi', pseudo: 'moi', moi: true, rang: 'Novice' },
      { user_id: 'u-melodie', pseudo: 'melodie', rang: 'Tireur', titre: 'athlete' }], semaine: null, invitations: [], fil: [
      { session_id: 's-melodie', user_id: 'u-melodie', pseudo: 'melodie', debut: '2026-10-14T10:00:00Z' }],
      progression: [{ pseudo: 'melodie', moi: false }, { pseudo: 'moi', moi: true }] };
    const o = Social.guildeAvecGestes(lu, [{ moi: 'u-moi', geste: Social.GESTES.BLOQUER, autre: 'u-melodie', pseudo: 'melodie' }], 'u-moi');
    expect(o.membres[1]).toMatchObject({ user_id: 'u-melodie', pseudo: null, rang: null, titre: null });
    expect(o.progression.map((x) => x.pseudo)).toEqual(['moi']);
    expect(o.fil).toEqual([]);
    const liens = Social.liensRanges([{ user_id: 'u-jordan', pseudo: 'jordan', lien: 'abonnement' }, { user_id: 'u-pub', pseudo: 'pub', lien: 'demande_envoyee' }]);
    expect([Social.suisAbonne(liens, 'u-jordan'), Social.suisAbonne(liens, 'u-pub'), Social.suisAbonne(null, 'u-jordan')]).toEqual([true, false, false]);
  });
  test('v2_094 : une transaction, la décision mot pour mot, aucune politique ; le fil, les médailles, les membres, la Progression, l’invitation et l’entrée', () => {
    expect(MIGRATION_094).toMatch(/^BEGIN;$/m);
    expect(MIGRATION_094).toMatch(/^COMMIT;$/m);
    expect(MIGRATION_094).toContain('« on ne voit pas si privé (privé compte que pour les\n--    inconnus, pas amis, donc guilde ne voit pas le détail) »');
    expect(MIGRATION_094).not.toMatch(/CREATE POLICY|ALTER POLICY|DROP POLICY/);
    expect(MIGRATION_094).toMatch(/AND guilde_commune\(auth\.uid\(\), s\.user_id\)\s*\n\s*AND guilde_voit_seances\(auth\.uid\(\), s\.user_id\)/);
    expect(MIGRATION_094).toMatch(/AND guilde_commune\(auth\.uid\(\), s\.user_id\) AND guilde_voit_seances\(auth\.uid\(\), s\.user_id\) \$f\$/);
    expect(MIGRATION_094).toMatch(/OR NOT coalesce\(\(SELECT p\.compte_prive FROM profiles p WHERE p\.id = p_auteur\), true\)/);
    expect(MIGRATION_094).toMatch(/a\.suiveur = p_lecteur AND a\.suivi = p_auteur AND a\.statut = 'accepte'/);
    expect((MIGRATION_094.match(/RAISE EXCEPTION 'guilde_bloque'/g) || []).length).toBe(2);
    expect(MIGRATION_094).toMatch(/AND \(x\.user_id = auth\.uid\(\) OR NOT social_bloque\(auth\.uid\(\), x\.user_id\)\)/);
  });
});
