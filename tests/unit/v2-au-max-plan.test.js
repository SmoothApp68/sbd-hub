/** @jest-environment node */
//
// 193-6 (MOTEUR §9.30) — LE PLAN DE LA DERNIÈRE SÉRIE « AU MAX » : le vrai chemin (`seance.js`, `planDeSeance`, `verifierPlan`
// I83 à I86, `verifierPhrases` I26).

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
require('../../v2/js/generateur.js');

const sp = (t) => String(t).replace(/[\u00a0\u202f]/g, ' ');
const DC = 'developpe_couche_barre';

function seance(slug, n, marque, routine) {
  let k = 0;
  const id = () => 'x-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, slug, id, { series: n });
  se.exercices[0].series.forEach((s, i) => { s.reps_visees = 8; if (marque && i === n - 1) s.au_max = true; });
  if (routine) se.routine_id = 'R';
  return se;
}
function entrees(se, slug, extra) {
  const consigne = { etat: 'progression', zone: 'mix', palier: 100, n: 3, ligne: { charge: 100, vise: 8 }, haut: null };
  return Object.assign({
    seance: { id: 'S', debut: '2026-10-31T10:00:00Z', edition: false, routine_id: se.routine_id || null, exercices: se.exercices },
    consignes: { [slug]: { consigne, contexte: { cran: 102.5, haut: null } } },
    reglage: 'normal', paris: [], objectif: 'les_deux',
    catalogue: { [slug]: { nom: 'Développé couché', equipement: slug === DC ? 'barre' : 'machine', mesure: 'charge_reps', pas: 2.5,
                           muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps', 'deltoide_anterieur'], muscles_stabilisateurs: [] } }
  }, extra || {});
}
const propre = (p, e) => { expect(T.verifierPlan(p, e).erreurs).toEqual([]); expect(T.verifierPhrases(p)).toEqual([]); };

describe('193-6 — le plan : la dernière série « Au max »', () => {
  test('couché, les_deux : la dernière ligne dit « Jusqu’à l’échec, sur les sécurités ou avec un pareur »', () => {
    const e = entrees(seance(DC, 3, true), DC);
    const p = T.planDeSeance(e);
    const x = p.exercices[0];
    expect(x.lignes[0].auMax).toBeUndefined();
    expect(x.lignes[2].auMax).toMatchObject({ reserve: 0, sorte: 'echec', avecPareur: true });
    expect(sp(x.lignes[2].auMax.consigne)).toBe('Jusqu’à l’échec, sur les sécurités ou avec un pareur');
    expect(x.auMax.classe).toBe('couche');
    propre(p, e);
  });

  test('le pari de la ligne vaut la table, jamais moins que la visée ; le fondement le dit', () => {
    const e = entrees(seance(DC, 3, true), DC);
    const x = T.planDeSeance(e).exercices[0];
    const par = x.paris[2];
    expect(par.fondement.au_max.reserve).toBe(0);
    expect(par.valeur_predite).toBeGreaterThanOrEqual(8);
    expect(par.valeur_predite).toBe(par.fondement.au_max.prevu);
    expect(x.paris[0].valeur_predite).toBe(8);   // les autres lignes ne bougent pas
  });

  test('force : une marque sur une barre devient « en gardant 2 reps », jamais l’échec', () => {
    const e = entrees(seance(DC, 3, true), DC, { objectif: 'force' });
    const p = T.planDeSeance(e);
    expect(p.exercices[0].lignes[2].auMax.reserve).toBe(2);
    expect(sp(p.exercices[0].lignes[2].auMax.consigne)).toBe('Autant que tu peux, en gardant 2 reps');
    propre(p, e);
  });

  test('sans marque : aucune ligne « Au max » ; la carte se propose une fois, depuis une routine', () => {
    const sans = T.planDeSeance(entrees(seance(DC, 3, false, true), DC)).exercices[0];
    expect(sans.auMax).toBeNull();
    expect(sans.propositionAuMax).toMatchObject({ iSerie: 2, reserve: 0, boutons: ['Oui, dans ma routine', 'Juste aujourd’hui', 'Non merci'] });
    expect(sp(sans.propositionAuMax.phrase)).toMatch(/^Va au bout de ta dernière série de Développé couché : jusqu’à l’échec, sur les sécurités ou avec un pareur\.$/);
    // pas de routine, une décision enregistrée, force : rien
    expect(T.planDeSeance(entrees(seance(DC, 3, false, false), DC)).exercices[0].propositionAuMax).toBeNull();
    expect(T.planDeSeance(entrees(seance(DC, 3, false, true), DC, { auMaxReponses: { [DC]: { r: 'non' } } })).exercices[0].propositionAuMax).toBeNull();
    expect(T.planDeSeance(entrees(seance(DC, 3, false, true), DC, { objectif: 'force' })).exercices[0].propositionAuMax).toBeNull();
    expect(T.planDeSeance(entrees(seance(DC, 3, false, true), DC, { objectif: null })).exercices[0].propositionAuMax).toBeNull();
  });

  test('zone à ménager ou « J’ai mal » récent : jamais l’échec, au plus en gardant 2', () => {
    const a = T.planDeSeance(entrees(seance(DC, 3, true), DC, { zonesMenagees: { [DC]: { zones: ['epaule'] } } })).exercices[0];
    expect(a.lignes[2].auMax.reserve).toBe(2);
    const b = T.planDeSeance(entrees(seance(DC, 3, true), DC, { douleurs: { [DC]: ['2026-10-20'] } })).exercices[0];
    expect(b.lignes[2].auMax.reserve).toBe(2);
    const pl = T.planDeSeance(entrees(seance(DC, 3, true), DC, { douleurs: { [DC]: ['2026-10-20'] } }));
    expect(T.verifierPlan(pl, entrees(seance(DC, 3, true), DC, { douleurs: { [DC]: ['2026-10-20'] } })).erreurs).toEqual([]);
  });

  test('débutant : garde 1 au couché', () => {
    const e = entrees(seance(DC, 3, true), DC, { debutant: true });
    const x = T.planDeSeance(e).exercices[0];
    expect(x.lignes[2].auMax.reserve).toBe(1);
    expect(x.lignes[2].auMax.avecPareur).toBe(false);
  });

  test('la série validée : le constat dit les reps et l’écart à la table (I26)', () => {
    let se = seance(DC, 3, true);
    [0, 1].forEach((j) => { se = S.modifierSerie(se, 0, j, { charge_kg: 100, reps: 8 }); se = S.valider(se, 0, j, new Date('2026-10-31T10:0' + j + ':00Z')); });
    const avant = T.planDeSeance(entrees(se, DC)).exercices[0];
    const prevu = avant.auMax.prevu;
    expect(prevu).toBeGreaterThanOrEqual(8);
    se = S.modifierSerie(se, 0, 2, { charge_kg: 100, reps: prevu + 2 });
    se = S.valider(se, 0, 2, new Date('2026-10-31T10:30:00Z'));
    const e = entrees(se, DC);
    const p = T.planDeSeance(e);
    const c = p.exercices[0].auMax.constat;
    expect(sp(c.texte)).toBe('Ta dernière série me dit où tu en es : ' + (prevu + 2) + ' reps à 100 kg, 2 de plus que prévu.');
    propre(p, e);
  });

  test('les invariants I83 à I85 voient une ligne mal posée', () => {
    const e = entrees(seance(DC, 3, true), DC);
    const mal = (f) => { const p = T.planDeSeance(e); f(p.exercices[0]); return T.verifierPlan(p, e).erreurs.join('\n'); };
    expect(mal((x) => { x.lignes[0].auMax = x.lignes[2].auMax; })).toMatch(/I83/);
    expect(mal((x) => { x.lignes[1].auMax = x.lignes[2].auMax; delete x.lignes[2].auMax; })).toMatch(/I83/);
    expect(mal((x) => { x.auMax.classe = 'souleve'; })).toMatch(/I84/);
    expect(mal((x) => { x.auMax.reserve = 4; })).toMatch(/I84/);
    expect(mal((x) => { x.paris[2].fondement.au_max.prevu = 30; })).toMatch(/I85/);
  });
});
