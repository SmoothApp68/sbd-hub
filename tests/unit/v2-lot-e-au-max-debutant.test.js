/** @jest-environment node */
//
// Lot E « revue des règles », A3 (20/11/2026, MOTEUR §9.30 delta, I238) — JAMAIS D'« AU MAX » POSÉ PAR LE COACH À UN DÉBUTANT.
// Remplace la décision du 31/10/2026 (193-6 : l'échec du débutant permis sur machine et isolation, garde 1 aux barres). Le coach ne pose ni
// ligne ni carte ; une marque posée par la personne (menu ⋯, ou déjà écrite dans sa routine) reste, au plancher « en gardant 2 reps ».
// UN prédicat de public prudent (`Moteur.publicPrudentAuMax`), lu par `auMaxDe` et par les mots (`motsDeLAuMax`, ses cinq appels).

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
require('../../v2/js/generateur.js');
const fs = require('fs');
const path = require('path');
const B = require('../../v2/js/modele.js').BARRES;

const sp = (t) => String(t).replace(/[  ]/g, ' ');
const CURL = 'curl_machine';

function seance(slug, marque, routine) {
  let k = 0;
  const id = () => 'x-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, slug, id, { series: 3 });
  se.exercices[0].series.forEach((s, i) => { s.reps_visees = 10; if (marque && i === 2) s.au_max = true; });
  if (routine) se.routine_id = 'R';
  return se;
}
function entrees(se, slug, extra) {
  const consigne = { etat: 'progression', zone: 'hypertrophie', palier: 40, n: 3, ligne: { charge: 40, vise: 10 }, haut: null };
  return Object.assign({
    seance: { id: 'S', debut: '2026-11-20T10:00:00Z', edition: false, routine_id: se.routine_id || null, exercices: se.exercices },
    consignes: { [slug]: { consigne, contexte: { cran: 42.5, haut: null } } },
    reglage: 'normal', paris: [], objectif: 'muscle',
    catalogue: { [slug]: { nom: 'Curl machine', equipement: 'machine', mesure: 'charge_reps', pas: 2.5,
                           muscles_primaires: ['biceps'], muscles_secondaires: [], muscles_stabilisateurs: [] } }
  }, extra || {});
}

describe('le moteur — un seul prédicat', () => {
  test('`publicPrudentAuMax` : la liste du plancher, plus le débutant', () => {
    expect(M.publicPrudentAuMax({ debutant: true })).toBe(true);
    ['plus65', 'premiereFois', 'repriseLongue', 'douleurRecente'].forEach((k) => expect(M.publicPrudentAuMax({ [k]: true })).toBe(true));
    expect(M.publicPrudentAuMax({ menagee: { zones: ['epaule'] } })).toBe(true);
    expect(M.publicPrudentAuMax({})).toBe(false);
    expect(M.publicPrudentAuMax(null)).toBe(false);
    expect(M.publicPrudentAuMax({ debutant: 'oui', plus65: 1 })).toBe(false);   // jamais deviné
  });
  test('⚠️ DISCRIMINANT — machine, débutant : le coach ne pose rien (avant : l’échec)', () => {
    const a = { objectif: 'muscle', debutant: true, famille: null, equipement: 'machine', isolation: true };
    expect(M.auMaxDe(a).pose).toBeNull();
    expect(M.auMaxDe(Object.assign({}, a, { main: true }))).toMatchObject({ pose: 'main', reserve: 2, sorte: 'garde', avecPareur: false });
    expect(M.auMaxDe(Object.assign({}, a, { debutant: false })).reserve).toBe(0);   // témoin : le non-débutant garde l'échec
  });
  test('⚠️ DISCRIMINANT — squat, débutant : rien posé (avant : garde 1) ; la marque, garde 2', () => {
    const a = { objectif: 'les_deux', debutant: true, famille: B[0], equipement: 'barre', isolation: false };
    expect(M.auMaxDe(a).pose).toBeNull();
    expect(M.auMaxDe(Object.assign({}, a, { main: true })).reserve).toBe(2);
  });
  test('les mots suivent le même prédicat : « En gardant 2 reps », jamais « Au max »', () => {
    expect(M.motsDeLAuMax(M.publicPrudentAuMax({ debutant: true })).bouton).toBe('En gardant 2 reps');
    expect(M.motsDeLAuMax(M.publicPrudentAuMax({ debutant: false })).bouton).toBe('Au max');
  });
});

describe('le plan — la carte, la marque, les mots', () => {
  test('témoin — non débutant, machine, depuis une routine : la carte « Au max » est proposée, à l’échec', () => {
    const e = entrees(seance(CURL, false, true), CURL);
    const x = T.planDeSeance(e).exercices[0];
    expect(x.propositionAuMax).toMatchObject({ reserve: 0, sorte: 'echec' });
    expect(x.auMaxMots.bouton).toBe('Au max');
  });
  test('⚠️ DISCRIMINANT — débutant : aucune carte « Au max », les mots du plancher', () => {
    const e = entrees(seance(CURL, false, true), CURL, { debutant: true });
    const p = T.planDeSeance(e);
    const x = p.exercices[0];
    expect(x.propositionAuMax).toBeNull();
    expect(x.auMax).toBeNull();
    expect(x.auMaxMots.bouton).toBe('En gardant 2 reps');
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('⚠️ DISCRIMINANT — une routine de débutant qui porte déjà « Au max » : la ligne dit « en gardant 2 reps »', () => {
    const e = entrees(seance(CURL, true, true), CURL, { debutant: true });
    const p = T.planDeSeance(e);
    const x = p.exercices[0];
    expect(x.lignes[2].auMax).toMatchObject({ reserve: 2, sorte: 'garde' });
    expect(sp(x.lignes[2].auMax.consigne)).toBe('Autant que tu peux, en gardant 2 reps');
    expect(x.auMaxMots).toEqual(M.motsDeLAuMax(true));
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    expect(T.verifierPhrases(p)).toEqual([]);
  });
  test('I238 forgé — une carte proposée à un débutant, le bouton « Au max » sur sa ligne', () => {
    const e = entrees(seance(CURL, true, true), CURL, { debutant: true });
    const p = T.planDeSeance(e);
    p.exercices[0].auMaxMots = M.motsDeLAuMax(false);
    p.exercices[0].propositionAuMax = { iSerie: 2, reserve: 0, sorte: 'echec' };
    const err = T.verifierPlan(p, e).erreurs.filter((m) => /^I238/.test(m));
    expect(err.length).toBeGreaterThanOrEqual(2);
  });
});

describe('les cinq appels de `motsDeLAuMax` lisent le prédicat', () => {
  const lire = (f) => fs.readFileSync(path.join(__dirname, '../../v2/js', f), 'utf8');
  test('aucun appel ne passe encore le seul âge', () => {
    // Chaque appel, jusqu'à la fin de sa ligne ; I238 lit les mots « Au max » pour comparer (`motsDeLAuMax(false)`).
    const appels = ((lire('plan.js') + lire('app.js')).match(/motsDeLAuMax\([^\n]*/g) || []).filter((a) => !/^motsDeLAuMax\(false\)/.test(a));
    expect(appels.length).toBe(5);
    appels.forEach((a) => expect(a).toMatch(/publicPrudentAuMax|auMaxPrudentDuProfil/));
  });
});
