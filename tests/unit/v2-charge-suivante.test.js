/** @jest-environment node */
//
// 163 — LA CHARGE SUIVANTE, SANS RIEN DÉCLARER (MOTEUR §10.2 bis ; décisions d'Aurélien du 24/10/2026, 22 h 04 – 22 h 15 ;
// maquette `maquette-cran-suivant-v3`). Ce fichier éprouve :
//   1. le pas par matériel (machine 5, poulie 2,5, kettlebell 4, haltères la paire +2 puis +4, barre 2,5) — plus jamais
//      de charge « sans chiffre » pour un exercice en kg ;
//   2. une charge jamais faite est APPROCHÉE (« ≈ 35 kg ») ; une charge notée devient connue (plus de « ≈ ») ;
//   3. le plan : la phrase par matériel, la case préremplie, I61 ;
//   4. « Ajoute tes élastiques » : par le nom ou par le poids, sans rien effacer ;
//   5. « Ma salle » ne garde que les élastiques.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
const Profil = require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
require('../../v2/js/semaine.js');
require('../../v2/js/generateur.js');

const SLUG = 'leg_curl_assis';
const jour = (md) => '2026-' + md + 'T18:00:00+00:00';
const AVANT = '2026-10-20T10:00:00+00:00';
let n = 0;
const brute = (kg, reps) => ({ id: 'i' + (++n), rang: n, charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: SLUG });
const seance = (id, md, kg, reps) => ({ seance: { id, debut: jour(md) }, series: [brute(kg, reps), brute(kg, reps), brute(kg, reps)] });
const O = (equipement) => ({ mesure: 'charge_reps', equipement, intention: 'progresser', reglage: 'normal', edition: false });
// 30 kg × 12 trois fois : au haut de la zone, le test monte d'un cran.
const HIST = () => [seance('S3', '10-16', 30, 12), seance('S2', '10-09', 30, 12), seance('S1', '10-02', 30, 12)];
const consigne = (hist, eq) => M.consigneDExercice(hist, undefined, AVANT, O(eq || 'machine')).consigne;
const NB = ' ';

describe('163 — le pas par matériel : un chiffre, toujours (en kg)', () => {
  const dessus = (eq, palier) => M.chargeVoisine([seance('A', '10-01', palier, 10), seance('B', '10-08', palier, 10)].map((x) => ({
    debut: x.seance.debut, palier, votantes: x.series.map((s) => ({ charge_kg: s.charge_kg, reps: s.reps })) })), AVANT, palier, eq, 1);
  test('machine 5, poulie 2,5, kettlebell 4, barre et Smith 2,5', () => {
    expect(dessus('machine', 30)).toBe(35);
    expect(dessus('poulie', 30)).toBe(32.5);
    expect(dessus('kettlebell', 16)).toBe(20);
    expect(dessus('barre', 30)).toBe(32.5);
    expect(dessus('machine_smith', 30)).toBe(32.5);
  });
  test('haltères, la PAIRE : 1 kg par haltère jusqu’à 10 (+2 la paire), puis 2 par haltère (+4)', () => {
    expect(dessus('haltere', 18)).toBe(20);          // 9 + 1 par haltère
    expect(dessus('haltere', 20)).toBe(24);          // 10 + 2 par haltère
    expect(dessus('haltere', 24)).toBe(28);
  });
  test('sans pas : disque, élastique, aucun (rien qui se monte en kg)', () => {
    ['disque', 'elastique', 'aucun'].forEach((eq) => expect(dessus(eq, 30)).toBeNull());
  });
});

describe('163 — une charge jamais faite est approchée (« ≈ »)', () => {
  test('⚠️ DISCRIMINANT — machine sans historique au-dessus de 30 : 35, approchée, le fondement le dit', () => {
    const c = consigne(HIST());
    expect(c.etat).toBe('test_propose');
    expect(c.haut).toMatchObject({ charge: 35, approchee: true });
    expect(c.ligne.approchee).toBeUndefined();            // 30 kg a été fait
    expect(c.fondement.approchee).toBe(true);
    const l = M.libellesConsigne(c, AVANT);
    expect(l.jaune).toEqual(['30' + NB + 'kg' + NB + '×' + NB + '12', 'puis ≈' + NB + '35' + NB + 'kg' + NB + '×' + NB + '8 sur la dernière série']);
  });
  test('⚠️ DISCRIMINANT — après 32,5 noté, la séance suivante propose 32,5 SANS « ≈ » (l’historique suffit)', () => {
    const apres = [seance('S4', '10-19', 32.5, 11)].concat(HIST());
    const c = M.consigneDExercice(apres, undefined, '2026-10-26T10:00:00+00:00', O('machine')).consigne;
    const charges = [c.ligne && c.ligne.charge, c.haut && c.haut.charge];
    expect(charges).toContain(32.5);
    [c.ligne, c.haut].forEach((x) => { if (x && x.charge === 32.5) expect(x.approchee).toBeUndefined(); });
    expect(M.estApprochee(apres.map((x) => ({ debut: x.seance.debut, palier: 30, votantes: x.series })), '2026-10-26T10:00:00+00:00', 32.5, 'machine')).toBe(false);
  });
  test('⚠️ DISCRIMINANT — la barre fixe de jadis (curl EZ à 30 kg) : 32,5 approchée, plus jamais affirmée', () => {
    const c = consigne(HIST(), 'barre');
    expect(c.haut).toMatchObject({ charge: 32.5, approchee: true });
    const bas = M.estApprochee(HIST().map((x) => ({ debut: x.seance.debut, palier: 30, votantes: x.series })), AVANT, 27.5, 'barre');
    expect(bas).toBe(true);                               // 27,5 : le curl poignets, jamais fait
  });
  test('une charge déjà faite au-dessus (rang 2) n’est pas approchée ; poids du corps, élastique : jamais', () => {
    const h = [seance('S4', '10-19', 35, 8)].concat(HIST());
    const c = M.consigneDExercice(h, undefined, '2026-10-26T10:00:00+00:00', O('machine')).consigne;
    [c.ligne, c.haut].forEach((x) => { if (x) expect(x.approchee).toBeUndefined(); });
    expect(M.estApprochee(HIST(), AVANT, 35, 'elastique')).toBe(false);
    expect(M.estApprochee(HIST(), AVANT, 0, 'machine')).toBe(false);
  });
  test('la phrase sous la ligne, par matériel (maquette v3)', () => {
    expect(M.phraseApprochee('machine')).toBe('vise la charge la plus proche que ta machine permet — la plaque au-dessus, ou un petit poids ajouté si elle en a. Note ce que tu as mis.');
    expect(M.phraseApprochee('barre')).toBe('vise la barre au-dessus, ou des petits disques si ta barre se charge. Note ce que tu as mis.');
    expect(M.phraseApprochee('haltere')).toBe('vise l’haltère au-dessus. Note ce que tu as mis.');
    expect(M.phraseApprochee('poulie')).toBe('vise la plaque au-dessus, ou un petit disque si ta poulie en a. Note ce que tu as mis.');
    const c = consigne(HIST());
    expect(M.phraseApprochee('machine', c)).toBe('≈' + NB + '35' + NB + 'kg' + NB + ': ' + M.phraseApprochee('machine'));
  });
});

// ═══ LE PLAN ═══════════════════════════════════════════════════════════════
function entrees(c, equipement) {
  let k = 0;
  const id = () => 's' + (++k);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, SLUG, id, { series: 3 });
  return {
    seance: { id: 'S1', debut: AVANT, edition: false, exercices: se.exercices },
    consignes: { [SLUG]: c },
    catalogue: { [SLUG]: { equipement: equipement || 'machine', nom: 'Leg Curl Assis (Machine)', muscles_primaires: ['ischio_jambiers'],
      muscles_secondaires: [], muscles_stabilisateurs: [], mesure: 'charge_reps', salle: null } },
    reglage: 'normal', paris: [], suites: {}, phase: 'maintien', debutant: false, volume: {},
    escalier: { cartes: [], compteurs: [], noms: {}, seriesRoutine: { [SLUG]: 3 }, marches: [], remplacants: {} }
  };
}
const plan = (c, eq) => { const e = entrees(c, eq); const p = T.planDeSeance(e); return { e, p, x: p.exercices[0] }; };

describe('163 — le plan porte la charge approchée, et I61 la vérifie', () => {
  test('⚠️ DISCRIMINANT — « ≈ 35 kg » dans l’en-tête, la phrase sous la ligne, la case préremplie à 35, plan vert', () => {
    const { e, p, x } = plan(M.consigneDExercice(HIST(), undefined, AVANT, O('machine')));
    expect(x.entete.jaune.join(' ')).toContain('≈' + NB + '35' + NB + 'kg');
    expect(x.approchee).toMatchObject({ materiel: 'machine' });
    expect(x.approchee.phrase).toBe('≈' + NB + '35' + NB + 'kg' + NB + ': ' + M.phraseApprochee('machine'));
    const derniere = x.lignes[x.lignes.length - 1];
    expect(derniere.fantome.charge).toBe(35);                // la case est préremplie avec la charge approchée
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('une charge connue : pas de « ≈ », pas de phrase, la clé du plan est nulle', () => {
    const h = [seance('S4', '10-18', 35, 8)].concat(HIST());
    const { e, p, x } = plan(M.consigneDExercice(h, undefined, AVANT, O('machine')));
    expect(x.approchee).toBeNull();
    expect(x.entete.jaune.join(' ')).not.toContain('≈');
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('⚠️ DISCRIMINANT — I61 attrape : une charge approchée sans phrase, sans fondement, sur le palier, sans « ≈ »', () => {
    const { e, p } = plan(M.consigneDExercice(HIST(), undefined, AVANT, O('machine')));
    const forge = (fn) => { const q = JSON.parse(JSON.stringify(p)); fn(q.exercices[0]); return T.verifierPlan(q, e).erreurs.filter((x) => /^I61/.test(x)); };
    expect(forge((x) => { x.approchee = null; })).not.toEqual([]);
    expect(forge((x) => { x.approchee.phrase = ''; })).not.toEqual([]);
    expect(forge((x) => { delete x.consigne.fondement.approchee; })).not.toEqual([]);
    expect(forge((x) => { x.consigne.haut.charge = x.consigne.palier; })).not.toEqual([]);
    expect(forge((x) => { x.entete.jaune = x.entete.jaune.map((j) => j.replace('≈' + NB, '')); })).not.toEqual([]);
    expect(forge((x) => { x.consigne.ligne.approchee = true; })).not.toEqual([]);
  });
});

// ═══ « AJOUTE TES ÉLASTIQUES » ═════════════════════════════════════════════
describe('163 — « Ajoute tes élastiques » : par le nom ou par le poids, rien d’effacé', () => {
  const TRACTIONS = { slug: 'tractions_elastique', nom: 'Tractions (Élastique)', equipement: 'elastique', charge: 'assistance', type_elastique: 'grand', mesure: 'charge_reps' };
  const CLAMSHELL = { slug: 'clamshell_elastique', nom: 'Clamshell', equipement: 'elastique', charge: 'elastique', type_elastique: 'mini', mesure: 'charge_reps' };
  test('à ajouter seulement quand la liste du type est vide', () => {
    expect(Profil.elastiqueAAjouter({}, TRACTIONS)).toBe(true);
    expect(Profil.elastiqueAAjouter({ ma_salle: { elastiques: [{ nom: 'Noir' }] } }, TRACTIONS)).toBe(false);
    expect(Profil.elastiqueAAjouter({ ma_salle: { elastiques: [{ nom: 'Noir' }] } }, CLAMSHELL)).toBe(true);
    expect(Profil.elastiqueAAjouter({}, { slug: 'x', equipement: 'machine' })).toBe(false);
  });
  test('par le nom : rangés du plus fort au plus léger (l’ordre classique), la tractions assistée se note par son nom', () => {
    const r = Profil.elastiquesAjoutes({}, TRACTIONS, { noms: ['Vert', 'Noir', 'Rouge'], kgs: [] });
    expect(r.champs.ma_salle.elastiques.map((e) => e.nom)).toEqual(['Noir', 'Rouge', 'Vert']);
    expect(r.champs.ma_salle.elastiques_par_nom).toBe(true);
    const s = Profil.salleDeLExercice({ ma_salle: r.champs.ma_salle }, TRACTIONS.slug, { [TRACTIONS.slug]: TRACTIONS });
    expect(s.materiel).toBe('elastique');
    expect(Object.keys(s.noms || {}).length).toBe(3);
  });
  test('par le poids : chaque kg devient un élastique (du plus lourd au plus léger), avec son aide', () => {
    const r = Profil.elastiquesAjoutes({}, TRACTIONS, { noms: [], kgs: [10, 35, 20] });
    expect(r.champs.ma_salle.elastiques).toEqual([{ nom: '35' + NB + 'kg', kg: 35 }, { nom: '20' + NB + 'kg', kg: 20 }, { nom: '10' + NB + 'kg', kg: 10 }]);
  });
  test('⚠️ DISCRIMINANT — les élastiques déclarés ne s’effacent jamais ; un nom déjà là n’est pas une erreur', () => {
    const p = { ma_salle: { elastiques: [{ nom: 'Noir', kg: 30 }], barres_ez: [10, 20], halteres: { max: 20, pas: 2 } } };
    const r = Profil.elastiquesAjoutes(p, CLAMSHELL, { noms: ['Rose'], kgs: [] });
    expect(r.champs.ma_salle.mini_bandes).toEqual([{ nom: 'Rose' }]);
    expect(r.champs.ma_salle.elastiques).toEqual([{ nom: 'Noir', kg: 30 }]);
    expect(r.champs.ma_salle.barres_ez).toEqual([10, 20]);        // la base garde ses clés ; l’app ne les lit plus
    const deja = Profil.elastiquesAjoutes(p, TRACTIONS, { noms: ['Noir', 'Rouge'], kgs: [] });
    expect(deja.champs.ma_salle.elastiques.map((e) => e.nom)).toEqual(['Noir', 'Rouge']);
  });
  test('rien de choisi, un kg illisible : une phrase, rien ne s’écrit', () => {
    expect(Profil.elastiquesAjoutes({}, TRACTIONS, { noms: [], kgs: [] }).erreur).toBeTruthy();
    expect(Profil.elastiquesAjoutes({}, TRACTIONS, { noms: [], kgs: [NaN] }).erreur).toBeTruthy();
    expect(Profil.elastiquesAjoutes({}, { slug: 'x', equipement: 'machine' }, { noms: ['Noir'], kgs: [] }).erreur).toBeTruthy();
  });
});

describe('163 — « Ma salle » ne garde que les élastiques', () => {
  const SALLE = { barres_ez: [10, 20, 30], barres_droites: [10, 20], halteres: { max: 40, pas: 2 }, barre_ez_chargee: true };
  const INDEX = {
    curl_biceps_barre_ez: { slug: 'curl_biceps_barre_ez', nom: 'Curl Biceps (Barre EZ)', equipement: 'barre', barre_charge_fixe: true, muscles_primaires: ['biceps'] },
    curl_haltere: { slug: 'curl_haltere', nom: 'Curl Haltère', equipement: 'haltere', muscles_primaires: ['biceps'] },
    tractions_elastique: { slug: 'tractions_elastique', nom: 'Tractions', equipement: 'elastique', charge: 'assistance', type_elastique: 'grand' }
  };
  test('⚠️ DISCRIMINANT — barres fixes et haltères déclarés : plus de salle (l’historique et le pas du matériel décident)', () => {
    expect(Profil.salleDeLExercice({ ma_salle: SALLE }, 'curl_biceps_barre_ez', INDEX)).toBeNull();
    expect(Profil.salleDeLExercice({ ma_salle: SALLE }, 'curl_haltere', INDEX)).toBeNull();
  });
  test('les élastiques, eux, sont toujours une salle (salle_max au bout de la liste)', () => {
    const s = Profil.salleDeLExercice({ ma_salle: { elastiques: [{ nom: 'Noir' }, { nom: 'Rouge' }], elastiques_par_nom: true } }, 'tractions_elastique', INDEX);
    expect(s.materiel).toBe('elastique');
    expect(s.charges.length).toBe(2);
  });
  test('la colonne reste valide en base : les clés anciennes passent `salleValide` (aucune migration)', () => {
    expect(Profil.salleValide(SALLE)).toMatchObject({ barres_ez: [10, 20, 30], barre_ez_chargee: true });
  });
});

// 163 + 165 — les deux règles cohabitent : une consigne allégée (semaine allégée ou décharge) garde le « ≈ » de sa source.
describe('163 + 165 — la consigne allégée garde le « ≈ » (I61) et porte le rang de la décharge (165)', () => {
  test('⚠️ DISCRIMINANT — allégée depuis une charge approchée : ligne et fondement marqués ; depuis une charge connue : aucun', () => {
    const c = consigne(HIST());
    const src = c;
    const approchee = Object.assign({}, src, { ligne: Object.assign({}, src.haut || src.ligne, { approchee: true }), haut: null,
      fondement: Object.assign({}, src.fondement, { approchee: true }) });
    const a = M.consigneAllegee(approchee, 4, true, { semaine: 4, semaines: 4 });
    expect(a.ligne.approchee).toBe(true);
    expect(a.fondement.approchee).toBe(true);
    expect(a.allegee).toMatchObject({ decharge: true, semaine: 4, semaines: 4 });
    const connue = Object.assign({}, approchee, { ligne: Object.assign({}, approchee.ligne, { approchee: undefined }) });
    const b = M.consigneAllegee(connue, 4, false);
    expect(b.ligne.approchee).toBeUndefined();
    expect(b.fondement.approchee).toBeUndefined();
  });
});

// ═══ 185 — LE TEST « HORS CALCUL » N'A PLUS DE LIGNE ═══════════════════════
// Le test (35 kg, approchée) tombe sur la 3e ligne. Si la personne dit « Non, ne compte pas » à la série qui l'occupait, il ne reste
// aucune ligne qui porte la charge approchée : la phrase « ≈ 35 kg : vise… » citerait une cible qu'aucune ligne n'affiche (I26).
describe('185 — la charge approchée sans ligne qui la porte', () => {
  // Deux lignes : la ligne du jour, puis le test (35 kg, approchée) — la routine n'a pas de 3e série à donner au test.
  const avecTroisieme = (kg, horsCalcul) => {
    const c = M.consigneDExercice(HIST(), undefined, AVANT, O('machine'));
    const e = entrees(c, 'machine');
    let se = { id: 'S1', userId: 'u', exercices: e.seance.exercices.map((x) => Object.assign({}, x, { series: x.series.slice(0, 2) })) };
    se = S.modifierSerie(se, 0, 0, { charge_kg: 30, reps: 12 }); se = S.valider(se, 0, 0, new Date('2026-10-20T10:01:00Z'));
    se = S.modifierSerie(se, 0, 1, { charge_kg: kg, reps: 12 }); se = S.valider(se, 0, 1, new Date('2026-10-20T10:03:00Z'));
    if (horsCalcul) se = S.marquerHorsCalcul(se, 0, 1, true);
    e.seance = Object.assign({}, e.seance, { exercices: se.exercices });
    const p = T.planDeSeance(e);
    return { e, p, x: p.exercices[0] };
  };
  // Le plan produit : tant qu'un segment de l'en-tête porte la charge approchée, la phrase reste et `approcheeSansLigne` est faux.
  test('un segment de l’en-tête porte encore la charge approchée : la phrase reste, plan vert (la série hors calcul n’y change rien)', () => {
    const { e, p, x } = avecTroisieme(40, true);
    expect(x.entete.segments.some((sg) => sg.approchee === true)).toBe(true);
    expect(x.approchee).not.toBeNull();
    expect(x.approcheeSansLigne).toBe(false);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  // I61 : le plan qui se tait parce qu'AUCUNE ligne ne porte plus la charge approchée (le cas du banc `saisie-verifiee`, cas 5 :
  // la série du test est « hors calcul », la routine n'a pas d'autre ligne). La forge retire le segment, la phrase et le « ≈ » de
  // l'en-tête, comme le plan le fait quand la ligne du test n'existe plus.
  const sansLigne = (p) => {
    const q = JSON.parse(JSON.stringify(p));
    const x = q.exercices[0];
    x.entete.segments = x.entete.segments.filter((sg) => sg.approchee !== true);
    x.entete.jaune = x.entete.jaune.map((t) => String(t).replace(/≈\s?/g, ''));
    x.approchee = null;
    return q;
  };
  test('⚠️ DISCRIMINANT — I61 accepte le silence quand le plan dit « approcheeSansLigne »', () => {
    const { e, p } = avecTroisieme(40, true);
    const q = sansLigne(p); q.exercices[0].approcheeSansLigne = true;
    expect(T.verifierPlan(q, e).erreurs.filter((m) => /^I61/.test(m))).toEqual([]);
  });
  test('I61 reste armé : le même silence SANS « approcheeSansLigne » est refusé', () => {
    const { e, p } = avecTroisieme(40, true);
    const q = sansLigne(p); q.exercices[0].approcheeSansLigne = false;
    expect(T.verifierPlan(q, e).erreurs.filter((m) => /^I61/.test(m))).not.toEqual([]);
  });
  test('I61 reste armé : « approcheeSansLigne » ne permet pas de taire une phrase dont un segment porte encore la charge', () => {
    const { e, p } = avecTroisieme(40, true);
    const q = JSON.parse(JSON.stringify(p)); q.exercices[0].approchee = null; q.exercices[0].approcheeSansLigne = true;
    expect(T.verifierPlan(q, e).erreurs.filter((m) => /^I61/.test(m))).not.toEqual([]);
  });
});
