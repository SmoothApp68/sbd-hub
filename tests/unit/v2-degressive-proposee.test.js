/** @jest-environment node */
//
// 111 — la dégressive proposée par le coach quand ça stagne (MOTEUR §14, « La
// dégressive proposée », décidé le 16/10/2026 ; §9.15.3 y renvoie).
//
// « Le coach peut proposer une dégressive comme une marche de l'escalier, après
// la série de plus. » Conditions, toutes requises : une isolation
// (`estPolyarticulaire` faux) ; pas de ligne dégressive dans la routine ; ni en
// sèche, ni en zone force, ni en décharge, ni en Entretenir, ni pour un
// débutant. La marche qui suit la série de plus (acceptée ou refusée) est la
// dégressive ; le repli recule d'une marche. Sans ces conditions, l'escalier
// est inchangé.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const P = require('../../v2/js/profil.js');

const NB = '\u00a0';

// ── 1. LA TABLE DES MARCHES ─────────────────────────────────────────────────
describe('§14 (111) — la table des marches, avec la dégressive', () => {
  const POSSIBLE = { possible: true, proposee: false };
  test('zone muscle hors sèche, la série de plus proposée : n = 2 → la dégressive, n = 3 → le repli, puis le silence', () => {
    expect(M.marcheIsolee(1, 'volume', 'maintien', true, false, 27, POSSIBLE)).toBe('serie_de_plus');
    expect(M.marcheIsolee(2, 'volume', 'maintien', true, true, 27, POSSIBLE)).toBe('degressive');
    expect(M.marcheIsolee(3, 'volume', 'maintien', true, true, 27, { possible: true, proposee: true })).toBe('repli');
    expect(M.marcheIsolee(4, 'volume', 'maintien', true, true, 27, { possible: true, proposee: true })).toBe('silence');
  });
  test('sans les conditions : l\'escalier de §14.5, inchangé', () => {
    const non = { possible: false, proposee: false };
    expect(M.marcheIsolee(2, 'volume', 'maintien', true, true, 27, non)).toBe('repli');
    expect(M.marcheIsolee(3, 'volume', 'maintien', true, true, 27, non)).toBe('silence');
    // Sans l'entrée (les cas du simulateur de §14.5) : rien ne change.
    expect(M.marcheIsolee(2, 'volume', 'maintien', true, true, 27)).toBe('repli');
    expect(M.marcheIsolee(3, 'volume', 'maintien', true, true, 27)).toBe('silence');
  });
  test('sans série de plus proposée (pas de place au 1er) : pas de dégressive, le silence au 2e', () => {
    expect(M.marcheIsolee(2, 'volume', 'maintien', false, false, 27, POSSIBLE)).toBe('silence');
  });
  test('zones force et sèche : jamais la dégressive (les conditions ne se lisent que dans `degressivePossible`)', () => {
    const deg = (zone, phase) => ({ possible: M.degressivePossible({ polyarticulaire: false, zone, phase }), proposee: false });
    expect(M.marcheIsolee(2, 'lourd', 'maintien', true, true, 27, deg('lourd', 'maintien'))).toBe('repli');
    expect(M.marcheIsolee(2, 'mix', 'maintien', true, true, 27, deg('mix', 'maintien'))).toBe('repli');
    expect(M.marcheIsolee(2, 'volume', 'seche', true, true, 27, deg('volume', 'seche'))).toBe('repli');
  });
  test('une dégressive répondue dans cette séance le reste (sa ligne ne la retire pas) ; ailleurs, les conditions décident', () => {
    expect(M.marcheIsolee(2, 'volume', 'maintien', true, true, 27, { possible: false, proposee: true, ici: true })).toBe('degressive');
    expect(M.marcheIsolee(2, 'volume', 'maintien', true, true, 27, { possible: false, proposee: true })).toBe('repli');
  });
  test('au poids du corps ou sur une aide : le silence', () => {
    expect(M.marcheIsolee(2, 'volume', 'maintien', true, true, 0, POSSIBLE)).toBe('silence');
    expect(M.marcheIsolee(2, 'volume', 'maintien', true, true, -20, POSSIBLE)).toBe('silence');
  });
});

describe('§14 (111) — les conditions, toutes requises', () => {
  const ok = { polyarticulaire: false, zone: 'volume', phase: 'maintien', allegee: false, entretien: false,
    debutant: false, aUneDegressive: false };
  test('réunies : possible', () => { expect(M.degressivePossible(ok)).toBe(true); });
  test.each([
    ['un polyarticulaire', { polyarticulaire: true }],
    ['hors catalogue', { polyarticulaire: null }],
    ['une ligne dégressive dans la routine', { aUneDegressive: true }],
    ['en sèche', { phase: 'seche' }],
    ['en zone Lourd', { zone: 'lourd' }],
    ['en zone Mix', { zone: 'mix' }],
    ['en décharge', { allegee: true }],
    ['en Entretenir', { entretien: true }],
    ['pour un débutant', { debutant: true }]
  ])('%s : jamais', (_, k) => { expect(M.degressivePossible(Object.assign({}, ok, k))).toBe(false); });
});

describe('§14 (111) — le débutant (`Profil.estDebutant`)', () => {
  test('« moins d\'un an » seulement ; absente : pas débutant', () => {
    expect(P.estDebutant({ anciennete: 'moins_1_an' })).toBe(true);
    expect(P.estDebutant({ anciennete: '1_3_ans' })).toBe(false);
    expect(P.estDebutant({})).toBe(false);
    expect(P.estDebutant(null)).toBe(false);
  });
});

// ── 2. LA CARTE ─────────────────────────────────────────────────────────────
describe('§14 (111) — la carte', () => {
  test('la phrase, le détail, les deux gestes', () => {
    const k = M.carteDegressive({ palier: 27, niveau: 12 }, 8);
    expect(k.type).toBe('degressive');
    expect(k.phrase).toBe('27' + NB + 'kg × 12 reste ta meilleure charge de travail depuis 8 séances. ' +
      'Une dégressive après ta dernière série ?');
    expect(k.detail).toBe('−20 à 25 %, sans repos, jusqu\'à l\'échec. ' +
      'La même croissance en moins de temps (Sødal et al. 2023).');
    expect([k.oui, k.non]).toEqual(['Ajouter une dégressive', 'Non merci']);
  });
});

// ── 3. LE PLAN : UN CURL À LA POULIE QUI STAGNE ─────────────────────────────
const C = { etat: 'progression', zone: 'volume', palier: 27, niveau: 12, n: 3,
  ligne: { charge: 27, vise: 12 }, haut: { charge: 29, vise: 12, k: 1 }, fondement: {} };
const MEILLEUR = { palier: 27, niveau: 12 };
const CAT = {
  curl: { equipement: 'poulie', muscles_primaires: ['biceps'] },
  squat: { equipement: 'barre', muscles_primaires: ['quadriceps', 'fessiers'], muscles_secondaires: ['adducteurs'],
    muscles_stabilisateurs: ['bas_du_dos'] },
  // 124 (audit du 16/10/2026, 01 #15) — un trou du catalogue : aucun muscle connu.
  machine_inconnue: { equipement: 'poulie', muscles_primaires: [], muscles_secondaires: [], muscles_stabilisateurs: [] }
};
const PLACE = { biceps: { place: true, moyenne: 8, seuil: 10, fenetres: 12 },
  quadriceps: { place: true, moyenne: 8, seuil: 10, fenetres: 12 }, fessiers: { place: true, moyenne: 8, seuil: 10, fenetres: 12 } };
const REPLI = { palier: 25, niveau: 12, debut: '2026-09-20T10:00:00+00:00', reps: [12, 12, 12], ligne: [25, 12] };

function decor(o) {
  const opt = o || {};
  const slug = opt.slug || 'curl';
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: opt.seance || 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, slug, id, { series: 3 });
  if (opt.geste) se = opt.geste(se, id);
  const k = Object.assign({}, C, opt.consigne || {});
  const c = { consigne: k, libelles: M.libellesConsigne(k),
    compteur: { compteur: opt.compteur === undefined ? 8 : opt.compteur, meilleur: MEILLEUR, blocages: [] },
    repli: opt.repli === undefined ? REPLI : opt.repli };
  const esc = { cartes: opt.cartes || [], compteurs: opt.compteurs || [], noms: {}, seriesRoutine: { [slug]: 3 },
    marches: opt.marches || [] };
  if (opt.degressivesRoutine) esc.degressivesRoutine = opt.degressivesRoutine;
  const e = { seance: { id: opt.seance || 'S1', debut: opt.debut || '2026-10-15T10:00:00+00:00', edition: false, exercices: se.exercices },
    consignes: { [slug]: c }, reglage: 'normal', paris: [], suites: {}, phase: opt.phase || 'maintien',
    catalogue: CAT, volume: PLACE, escalier: esc, debutant: opt.debutant === true,
    intention: opt.intention || null, modes: opt.modes || {} };
  return { e, p: T.planDeSeance(e) };
}
const marche = (quoi, reponse, jour, compteur, seance, slug) => ({ seance: seance || 'S0', jour, exercice: slug || 'curl',
  marche: quoi, reponse, compteur, debut: jour + 'T10:00:00+00:00', n: 3 });
const PLUS_REFUSEE = marche('serie_de_plus', 'refusee', '2026-10-01', 4);
const PLUS_ACCEPTEE = marche('serie_de_plus', 'acceptee', '2026-10-01', 4);
const sansErreur = (d) => expect(T.verifierPlan(d.p, d.e).erreurs).toEqual([]);

describe('§14 (111) — le curl à la poulie qui stagne', () => {
  test('1er déclenchement (4) : la série de plus', () => {
    const d = decor({ compteur: 4, debut: '2026-10-01T10:00:00+00:00' });
    expect(d.p.exercices[0].escalier.marche).toBe('serie_de_plus');
    sansErreur(d);
  });
  test('2e déclenchement (8), la série de plus REFUSÉE : la dégressive vient quand même', () => {
    const d = decor({ marches: [PLUS_REFUSEE] });
    const x = d.p.exercices[0];
    expect(x.escalier.marche).toBe('degressive');
    expect(x.escalier.carte.phrase).toBe('27' + NB + 'kg × 12 reste ta meilleure charge de travail depuis 8 séances. ' +
      'Une dégressive après ta dernière série ?');
    expect(x.polyarticulaire).toBe(false);
    expect(x.entete.compteur).toBeNull();
    // Proposée, jamais posée : aucune ligne dégressive tant qu'on n'a pas répondu.
    expect(x.lignes.some((l) => l.type === 'degressive')).toBe(false);
    expect(x.degressive).toBeNull();
    expect(T.degressivesAAjouter(d.p)).toEqual([]);
    sansErreur(d);
  });
  test('2e déclenchement, la série de plus ACCEPTÉE (encore active) : la dégressive aussi', () => {
    const d = decor({ marches: [PLUS_ACCEPTEE], geste: (se, id) => S.ajouterSerie(se, 0, id()) });
    expect(d.p.exercices[0].escalier.marche).toBe('degressive');
    sansErreur(d);
  });
  test('acceptée : plus de carte, une ligne dégressive à créer ; le coach la remplit (§9.15.3), sans pari', () => {
    const acc = marche('degressive', 'acceptee', '2026-10-15', 8, 'S1');
    const d = decor({ marches: [PLUS_REFUSEE, acc] });
    const x = d.p.exercices[0];
    expect(x.escalier.carte).toBeUndefined();
    expect(x.escalier.reponse).toBe('acceptee');
    expect(x.degressiveEnCours).toBe(true);
    expect(T.degressivesAAjouter(d.p)).toEqual([0]);
    sansErreur(d);
    // La ligne posée par le geste : remplie, une seule baisse, sous la dernière série de travail.
    const d2 = decor({ marches: [PLUS_REFUSEE, acc], degressivesRoutine: { curl: false },
      geste: (se, id) => S.ajouterDegressive(se, 0, id()) });
    const x2 = d2.p.exercices[0];
    const l = x2.lignes[x2.lignes.length - 1];
    expect(l.type).toBe('degressive');
    expect(x2.degressive.charge).toBeLessThan(27);
    expect(x2.degressive.charge).toBeGreaterThanOrEqual(27 * 0.75 - 2.5);
    expect(x2.degressive.phrase).toMatch(/^Dégressive : /);
    expect(l.role === undefined || l.role === 'hors').toBe(true);
    expect(T.degressivesAAjouter(d2.p)).toEqual([]);
    // 151 (23/10/2026) — la dégressive que le coach propose de lui-même reste à UNE baisse : jamais de seconde ligne.
    expect(x2.degressivesPlus || null).toBeNull();
    expect(x2.lignes.filter((q) => q.type === 'degressive')).toHaveLength(1);
    expect(x2.escalier.marche).toBe('degressive');
    sansErreur(d2);
  });
  test('la séance suivante, sans progrès (9) : la ligne revient, sans carte', () => {
    const d = decor({ seance: 'S2', debut: '2026-10-18T10:00:00+00:00', compteur: 9,
      marches: [PLUS_REFUSEE, marche('degressive', 'acceptee', '2026-10-15', 8)] });
    expect(d.p.exercices[0].escalier).toBeNull();
    expect(T.degressivesAAjouter(d.p)).toEqual([0]);
    sansErreur(d);
  });
  test('après un progrès : elle disparaît', () => {
    const d = decor({ seance: 'S3', debut: '2026-10-20T10:00:00+00:00', compteur: 0,
      marches: [PLUS_REFUSEE, marche('degressive', 'acceptee', '2026-10-15', 8)] });
    expect(d.p.exercices[0].degressiveEnCours).toBe(false);
    expect(T.degressivesAAjouter(d.p)).toEqual([]);
  });
  test('3e déclenchement (12) : le repli — acceptée ou refusée ; sans dégressive proposée, le silence', () => {
    ['acceptee', 'refusee'].forEach((r) => {
      const d = decor({ seance: 'S4', compteur: 12, debut: '2026-10-29T10:00:00+00:00',
        marches: [PLUS_REFUSEE, marche('degressive', r, '2026-10-15', 8)] });
      expect(d.p.exercices[0].escalier.marche).toBe('repli');
      sansErreur(d);
    });
    // 174 — sans dégressive proposée, il n'y a toujours pas de repli : là où l'escalier se taisait, la 4e marche propose d'alléger.
    expect(decor({ compteur: 12, marches: [PLUS_REFUSEE] }).p.exercices[0].escalier.marche).toBe('alleger');
  });
  test('la même séance rouverte au même déclenchement : la carte ne revient pas', () => {
    const d = decor({ seance: 'S1bis', marches: [PLUS_REFUSEE, marche('degressive', 'refusee', '2026-10-15', 8, 'S1')] });
    expect(d.p.exercices[0].escalier.marche).toBe('degressive');
    expect(d.p.exercices[0].escalier.carte).toBeUndefined();
  });
  test('une ligne dégressive tapée avant la réponse ne change pas la marche (figée à l\'ouverture)', () => {
    const d = decor({ marches: [PLUS_REFUSEE], degressivesRoutine: { curl: false },
      geste: (se, id) => S.ajouterDegressive(se, 0, id()) });
    expect(d.p.exercices[0].escalier.marche).toBe('degressive');
  });
});

describe('§14 (111) — jamais hors des conditions', () => {
  test('124 (01 #15) — un exercice sans muscle connu n’est pas une isolation : pas de dégressive (la définition de la salle)', () => {
    const d = decor({ slug: 'machine_inconnue', marches: [marche('serie_de_plus', 'refusee', '2026-10-01', 4, 'S0', 'machine_inconnue')] });
    expect(d.p.exercices[0].polyarticulaire).toBeNull();
    expect(d.p.exercices[0].escalier && d.p.exercices[0].escalier.marche).not.toBe('degressive');
    expect(M.estIsolation({ prim: [], sec: [], stab: [] })).toBe(false);
    expect(M.estIsolation({ prim: ['biceps'] })).toBe(true);
    expect(M.estIsolation({ prim: ['quadriceps', 'fessiers'], sec: ['adducteurs'] })).toBe(false);
    sansErreur(d);
  });
  test('squat (polyarticulaire) : jamais, le repli au 2e déclenchement', () => {
    const d = decor({ slug: 'squat', marches: [marche('serie_de_plus', 'refusee', '2026-10-01', 4, 'S0', 'squat')] });
    expect(d.p.exercices[0].polyarticulaire).toBe(true);
    expect(d.p.exercices[0].escalier.marche).toBe('repli');
    sansErreur(d);
  });
  test('en sèche : jamais (le repli, la marche de la sèche)', () => {
    const d = decor({ phase: 'seche', marches: [PLUS_REFUSEE] });
    expect(d.p.exercices[0].escalier.marche).toBe('repli');
    // Et une dégressive acceptée n'est plus en cours.
    const a = decor({ phase: 'seche', compteur: 9, marches: [PLUS_REFUSEE, marche('degressive', 'acceptee', '2026-10-15', 8)] });
    expect(a.p.exercices[0].degressiveEnCours).toBe(false);
    // Acceptée dans une autre séance du même déclenchement, puis la sèche déclarée : le repli de la sèche.
    const b = decor({ phase: 'seche', seance: 'S1bis', marches: [PLUS_REFUSEE, marche('degressive', 'acceptee', '2026-10-15', 8, 'S1')] });
    expect(b.p.exercices[0].escalier.marche).toBe('repli');
    expect(b.p.exercices[0].degressiveEnCours).toBe(false);
  });
  test('la routine a déjà une ligne dégressive : jamais', () => {
    const d = decor({ marches: [PLUS_REFUSEE], geste: (se, id) => S.ajouterDegressive(se, 0, id()) });
    expect(d.p.exercices[0].escalier.marche).toBe('repli');
    const f = decor({ marches: [PLUS_REFUSEE], degressivesRoutine: { curl: true } });
    expect(f.p.exercices[0].escalier.marche).toBe('repli');
  });
  test('un débutant : jamais', () => {
    const d = decor({ debutant: true, marches: [PLUS_REFUSEE] });
    expect(d.p.debutant).toBe(true);
    expect(d.p.exercices[0].escalier.marche).toBe('repli');
    sansErreur(d);
  });
  test('en zone force : jamais', () => {
    const d = decor({ consigne: { zone: 'lourd', palier: 27, ligne: { charge: 27, vise: 4 }, haut: null },
      marches: [PLUS_REFUSEE] });
    expect(d.p.exercices[0].escalier.marche).toBe('repli');
  });
  test('l\'exercice en Entretenir : jamais', () => {
    const d = decor({ modes: { curl: 'entretien' }, marches: [PLUS_REFUSEE] });
    expect(d.p.exercices[0].escalier && d.p.exercices[0].escalier.marche).not.toBe('degressive');
  });
  test('pendant une semaine allégée : aucune marche', () => {
    const allegee = { seance: 'S0', jour: '2026-10-14', declencheur: 'x', compteur: 4, reponse: 'acceptee',
      debut: '2026-10-14', fin: '2026-10-20', cites: ['x'] };
    const d = decor({ cartes: [allegee], marches: [PLUS_REFUSEE, marche('degressive', 'acceptee', '2026-10-13', 8)] });
    expect(d.p.exercices[0].escalier).toBeNull();
    expect(d.p.exercices[0].degressiveEnCours).toBe(false);
  });
});

// ── 4. I48 : DES VIOLATIONS FORGÉES SONT VUES ───────────────────────────────
describe('§14 (111) — I48', () => {
  const base = () => JSON.parse(JSON.stringify(decor({ marches: [PLUS_REFUSEE] }).p));
  const voit = (p, re) => expect(T.verifierPlan(p).erreurs.some((x) => /^I48 /.test(x) && re.test(x))).toBe(true);
  test('le plan honnête n\'a aucune erreur', () => {
    expect(T.verifierPlan(base()).erreurs.filter((x) => /^I48/.test(x))).toEqual([]);
  });
  test('sur un polyarticulaire (un squat)', () => { const p = base(); p.exercices[0].polyarticulaire = true; voit(p, /pas une isolation/); });
  test('en sèche', () => { const p = base(); p.phase = 'seche'; voit(p, /en sèche/); });
  test('en zone force', () => { const p = base(); p.exercices[0].consigne.zone = 'mix'; voit(p, /zone force/); });
  test('pour un débutant', () => { const p = base(); p.debutant = true; voit(p, /débutant/); });
  test('en Entretenir', () => { const p = base(); p.exercices[0].intention = 'entretien'; voit(p, /Entretenir/); });
  test('alors que la routine en a une', () => { const p = base(); p.exercices[0].degressiveRoutine = true; voit(p, /la routine en a une/); });
  test('hors du 2e déclenchement', () => { const p = base(); p.exercices[0].escalier.n = 1; voit(p, /2e déclenchement/); });
  test('sans série de plus avant elle', () => { const p = base(); p.exercices[0].escalier.serieDePlusProposee = false; voit(p, /sans série de plus/); });
  test('une dégressive en cours en sèche', () => {
    const p = JSON.parse(JSON.stringify(decor({ compteur: 9, marches: [PLUS_REFUSEE, marche('degressive', 'acceptee', '2026-10-15', 8)] }).p));
    expect(p.exercices[0].degressiveEnCours).toBe(true);
    p.phase = 'seche';
    voit(p, /en sèche/);
  });
});

// ── 5. LE PARI ──────────────────────────────────────────────────────────────
describe('§14 (111) — le pari de l\'escalier, marche « degressive »', () => {
  test('lu dans les paris', () => {
    const l = { id: 'x', module: 'escalier', exercise_slug: null, fondement: { seance: 'S1', jour: '2026-10-15',
      exercice: 'curl', marche: 'degressive', reponse: 'refusee', compteur: 8, debut: '2026-10-15T10:00:00+00:00' } };
    expect(M.marchesDesParis([l])[0]).toEqual({ id: 'x', seance: 'S1', jour: '2026-10-15', exercice: 'curl',
      marche: 'degressive', reponse: 'refusee', compteur: 8, debut: '2026-10-15T10:00:00+00:00', n: null });
  });
  test('identifiant : distinct des autres marches', async () => {
    const ids = await Promise.all(['degressive', 'serie_de_plus', 'schema', 'repli'].map((m) => M.idDEscalier('S1', 'curl', m)));
    expect(new Set(ids).size).toBe(4);
  });
  const k = (jour, compteur) => ({ exercice: 'curl', jour, compteur, seance: 'K' + jour, debut: jour + 'T10:00:00Z' });
  test('« débloqué avant le prochain déclenchement » : 1 au progrès, 0 au déclenchement ; refusée, jamais', () => {
    const m = { exercice: 'curl', jour: '2026-10-15', compteur: 8, marche: 'degressive', reponse: 'acceptee' };
    expect(M.observationMarche(m, [k('2026-10-18', 9), k('2026-10-21', 0)]).valeur).toBe(1);
    expect(M.observationMarche(m, [k('2026-10-18', 9), k('2026-10-21', 10), k('2026-10-24', 11), k('2026-10-27', 12)]).valeur).toBe(0);
    expect(M.observationMarche(Object.assign({}, m, { reponse: 'refusee' }), [k('2026-10-21', 0)])).toBeNull();
  });
  test('la ligne dégressive elle-même ne porte aucun pari (§9.15.4)', () => {
    const d = decor({ marches: [PLUS_REFUSEE, marche('degressive', 'acceptee', '2026-10-15', 8, 'S1')],
      degressivesRoutine: { curl: false }, geste: (se, id) => S.ajouterDegressive(se, 0, id()) });
    const x = d.p.exercices[0];
    const l = x.lignes[x.lignes.length - 1];
    expect(l.type).toBe('degressive');
    expect(['ligne', 'haut', 'test', 'plus'].indexOf(l.role)).toBe(-1);
  });
});
