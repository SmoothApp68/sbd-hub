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
    expect(ids(Faits.creer().recordsSansDepasser(c, paris, '2026-10-12', '2026-10-18'))).toEqual(['a1', 'a3', 'a4', 'b1']);
  });
  test('un_rm_estime et volume_seance ne comptent jamais ; une série à deux records = un', () => {
    const l = Faits.creer().recordsSansDepasser(c, [], '2026-10-12', '2026-10-18');
    expect(ids(l)).toEqual(['a1', 'a2', 'a3', 'a4', 'b1', 'b2']);
    expect(Faits.creer().TYPES_DE_LA_GUILDE).toEqual(['charge_a_reps', 'reps_a_charge', 'charge_max', 'cap', 'duree_s', 'distance_m']);
  });
  test('les bornes : un jour civil, inclus', () => {
    expect(ids(Faits.creer().recordsSansDepasser(c, paris, '2026-10-13', '2026-10-13'))).toEqual(['b1']);
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
    expect(liste(/r\.type IN \(([^)]*)\)/)).toEqual(Faits.creer().TYPES_DE_LA_GUILDE);
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
