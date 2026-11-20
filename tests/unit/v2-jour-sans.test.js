/** @jest-environment node */
//
// R2 (20/11/2026, MOTEUR §9.42 bis, « le jour sans » ; I255) — un zéro à ou sous la charge de travail est un JOUR SANS, pas une baisse. R2a : la charge `Ch` d'une séance à zéro
// ignore les reculs (la détection ne change pas). R2b : la séance suivante est plus légère et NEUTRE ; si elle passe, la fois d'après reprend la charge ET le niveau d'avant ;
// UN seul jour sans par charge de travail ; jamais pour un public protégé, une seule séance lue, un zéro au-dessus de la charge de travail. Les histoires de /tmp/jour-sans/tour-2.md.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
require('../../v2/js/generateur.js');
require('../../v2/js/bilan.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const Modele = global.THModele;
const sp = (t) => String(t == null ? '' : t).replace(/[  ]/g, ' ');

const g = (kg, reps, t) => ({ charge_kg: kg, reps, type_serie: t || 'travail' });
const jour = (i) => new Date(Date.UTC(2026, 10, 8 + i * 4, 18)).toISOString();   // 8, 12, 16, 20, 24, 28 nov. (18 h UTC)
const seance = (i, series) => ({ seance: { id: 'H' + i, debut: jour(i) }, series: series.map((s, j) => Object.assign({ id: 'h' + i + '_' + j, rang: j, rpe: null, ressenti: null, exercise_slug: 'squat' }, s)) });
const OPT = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false, debutant: false };
const bonne = () => [g(140, 3), g(125, 6, 'recul'), g(125, 6, 'recul')];
const zero = () => [g(140, 0, 'echec'), g(125, 0, 'recul'), g(125, 0, 'recul')];     // le vrai chemin : la grosse « Oui, manquée » (echec), les reculs gardent leur type (R1)
const legere = (kg, reps) => [g(kg, reps), g(Math.round(kg * 0.89 / 2.5) * 2.5, 6, 'recul'), g(Math.round(kg * 0.89 / 2.5) * 2.5, 6, 'recul')];
const avantDe = (liste, jours) => new Date(Date.parse(jour(liste.length - 1)) + (jours || 4) * 864e5).toISOString();
const R = (liste, opt, jours) => M.consigneDExercice(liste.map((s, i) => seance(i, s)), undefined, avantDe(liste, jours), Object.assign({}, OPT, opt || {}));
const K = (liste, opt, jours) => R(liste, opt, jours).consigne;
const ligne = (k) => (k.ligne ? [k.ligne.charge, k.ligne.vise] : null);

describe('R2a — seanceAZero : la charge ignore les reculs, la détection ne change pas', () => {
  const Z = (...a) => Modele.seanceAZero(a);
  test('la grosse série à 140 et deux reculs à 125, tous à 0 : Ch = 140 (n = 3, toutes les séries lues)', () => {
    expect(Z(g(140, 0, 'echec'), g(125, 0, 'recul'), g(125, 0, 'recul'))).toEqual({ n: 3, charge: 140 });
  });
  test('que des reculs : leur plus léger (rien d\'autre à lire)', () => {
    expect(Z(g(125, 0, 'recul'), g(120, 0, 'recul'))).toEqual({ n: 2, charge: 120 });
  });
  test('un recul RÉUSSI après une grosse série à 0 : la séance n\'est pas « toute à zéro » (la détection est inchangée, objection O1)', () => {
    expect(Z(g(140, 0, 'echec'), g(125, 6, 'recul'), g(125, 6, 'recul'))).toBeNull();
  });
  test('sans recul : inchangé (la plus légère charge)', () => {
    expect(Z(g(102.5, 0), g(100, 0))).toEqual({ n: 2, charge: 100 });
  });
});

describe('R2b — l\'histoire du squat (140 × 3, reculs 125 × 6 × 2, les 8 et 12 nov.), un zéro le 16 nov.', () => {
  const h = [bonne(), bonne()];
  test('avant le zéro : 140 kg × 4', () => { expect(ligne(K(h))).toEqual([140, 4]); });
  test('le 20 nov. : zero_rep 132,5 kg × 4 (et non 120 × 4 : la charge est celle de la grosse série), jour sans ouvert', () => {
    const k = K([...h, zero()]);
    expect(k.etat).toBe('zero_rep');
    expect(ligne(k)).toEqual([132.5, 4]);
    expect(k.fondement.zeroRep).toMatchObject({ charge: 140, series: 3, vers: 132.5, bornee: false });
    expect(k.fondement.zeroRep.jourSans).toMatchObject({ grosse: true, reculs: true, zoneBas: 3, tenue: { charge: 140, reps: 3 } });
  });
  test('le 24 nov., 132,5 kg × 4 passe : la séance légère est neutre, la fois d\'après reprend 140 kg × 3 (le niveau d\'avant, sans rep de plus)', () => {
    const k = K([...h, zero(), legere(132.5, 4)]);
    expect(k.etat).toBe('retour_jour_sans');
    expect(ligne(k)).toEqual([140, 3]);
    expect(k.palier).toBe(140);
    expect(k.haut).toBeNull();
    expect(k.fondement.jourSans).toMatchObject({ retour: true, charge: 140, tenue: { charge: 140, reps: 3 } });
  });
  test('le 28 nov. : le retour réussi (140 × 3) repart normalement (la montée reprend : 140 kg × 4), la séance légère n\'a rien voté', () => {
    const k = K([...h, zero(), legere(132.5, 4), bonne()]);
    expect(k.etat).toBe('progression');
    expect(ligne(k)).toEqual([140, 4]);
    expect(k.palier).toBe(140);
  });
  test('la séance légère ne vote nulle part : sans le zéro ni elle, la consigne est celle de l\'histoire sans les deux (palier, niveau)', () => {
    const base = K(h);
    const apres = K([...h, zero(), legere(132.5, 4), bonne()]);
    expect([apres.palier, apres.niveau]).toEqual([base.palier, base.niveau]);
  });
  test('le yo-yo : 0, séance légère, 0 → la règle B (la vraie baisse), jamais un 2e jour sans', () => {
    const k = K([...h, zero(), [g(132.5, 0, 'echec'), g(117.5, 0, 'recul'), g(117.5, 0, 'recul')]]);
    expect(k.etat).toBe('zero_rep');
    expect(k.fondement.zeroRep.charge).toBe(132.5);
    expect(k.fondement.zeroRep.jourSans).toBeUndefined();
    expect(ligne(k)).toEqual([125, 4]);
  });
  test('un 2e zéro avant une séance réussie à cette charge (0, légère passée, 0 à 140) : la règle B directement (objection O2)', () => {
    const k = K([...h, zero(), legere(132.5, 4), zero()]);
    expect(k.etat).toBe('zero_rep');
    expect(k.fondement.zeroRep.jourSans).toBeUndefined();
    expect(ligne(k)).toEqual([132.5, 4]);
  });
  test('…mais après une séance réussie à 140, le jeton est levé : un nouveau zéro ouvre un nouveau jour sans', () => {
    const k = K([...h, zero(), legere(132.5, 4), bonne(), zero()]);
    expect(k.etat).toBe('zero_rep');
    expect(k.fondement.zeroRep.jourSans).toBeDefined();
  });
  test('si la séance légère rate SOUS la zone sans être à 0 (132,5 × 1) : une séance ordinaire (aucun retour, elle vote)', () => {
    const k = K([...h, zero(), legere(132.5, 1)]);
    expect(k.etat).not.toBe('retour_jour_sans');
    expect(k.etat).not.toBe('zero_rep');
  });
});

describe('R2b — ce qui garde la règle B', () => {
  const h = [bonne(), bonne()];
  test('un public protégé (65 ans et plus connu, débutant, Forme) : B, la séance légère vote (pas de retour)', () => {
    const z = K([...h, zero()], { protegee: true });
    expect(z.etat).toBe('zero_rep');
    expect(z.fondement.zeroRep.jourSans).toBeUndefined();
    const apres = K([...h, zero(), legere(132.5, 4)], { protegee: true });
    expect(apres.etat).not.toBe('retour_jour_sans');
    expect(ligne(apres)).not.toEqual([140, 3]);
  });
  test('une seule séance lue à cette charge (I152) : B', () => {
    const k = K([bonne(), zero()]);
    expect(k.etat).toBe('zero_rep');
    expect(k.fondement.zeroRep.jourSans).toBeUndefined();
    expect(K([bonne(), zero(), legere(132.5, 4)]).etat).not.toBe('retour_jour_sans');
  });
  test('un zéro AU-DESSUS de la charge de travail (un essai raté à 145) : B telle quelle', () => {
    const k = K([...h, [g(145, 0, 'echec')]]);
    expect(k.etat).toBe('zero_rep');
    expect(k.fondement.zeroRep.charge).toBe(145);
    expect(k.fondement.zeroRep.jourSans).toBeUndefined();
  });
  test('les reculs réussis après une grosse série à 0 : inchangé (ce n\'est pas une séance à zéro, jamais un jour sans)', () => {
    const k = K([...h, [g(140, 0, 'echec'), g(125, 6, 'recul'), g(125, 6, 'recul')]]);
    expect(k.fondement && k.fondement.zeroRep).toBeFalsy();
    expect(k.etat).not.toBe('zero_rep');
    expect(k.etat).not.toBe('retour_jour_sans');
  });
  test('la reprise prime (§9.9) : un zéro suivi d\'un long silence rend la reprise, jamais un jour sans', () => {
    const k = K([...h, zero()], null, 70);
    expect(['reprise_courte', 'reprise_longue']).toContain(k.etat);
    expect(JSON.stringify(k)).not.toMatch(/jourSans/);
  });
  test('« plus léger aujourd\'hui » puis un 0 : la séance est sans coach, aucun drapeau zéro, aucune 2e baisse cumulée (objection O10)', () => {
    const legerAujourdhui = [g(132.5, 0, 'echec', ), g(117.5, 0, 'recul'), g(117.5, 0, 'recul')].map((s) => Object.assign({}, s, { sans_coach: true }));
    const k = K([...h, legerAujourdhui]);
    expect(k.etat).toBe('progression');
    expect(ligne(k)).toEqual(ligne(K(h)));
  });
  test('jamais en semaine de test : un essai de test raté (0 rep, type test) n\'est pas une séance à zéro, donc aucun jour sans', () => {
    const k = K([...h, [g(150, 0, 'test')]]);
    expect(k.etat).not.toBe('zero_rep');
    expect(JSON.stringify(k)).not.toMatch(/jourSans/);
  });
  test('en sèche, la même règle (aucune règle à part : le jour sans lit l\'histoire, pas la phase)', () => {
    const k = K([...h, zero()], { phase: 'seche' });
    expect(k.fondement.zeroRep.jourSans).toBeDefined();
  });
});

describe('R2b — la neutralité : compteur, stagnation, paris', () => {
  const compteur = (liste) => {
    const groupes = liste.map((s, i) => seance(i, s));
    const c = M.contratDe(groupes, null, 'charge_reps', { reglage: 'normal', equipement: 'barre', correction: null });
    return M.compteurDe(c, avantDe(liste, 4), { reglage: 'normal', equipement: 'barre', toutes: true });
  };
  test('le compteur de stagnation ignore le zéro ET la séance légère (comme si l\'histoire s\'arrêtait avant)', () => {
    const base = compteur([bonne(), bonne(), bonne()]);
    const avec = compteur([bonne(), bonne(), bonne(), zero(), legere(132.5, 4)]);
    expect(avec.compteur).toBe(base.compteur);
    expect(avec.verdicts.length).toBe(base.verdicts.length);
  });
  test('Bilan.compteLe : un pari « jourSans » ne se compte pas (comme « allegee »)', () => {
    const Bi = global.THBilan;
    expect(Bi.compteLe({ jourSans: true })).toBe(false);
    expect(Bi.compteLe({ allegee: true })).toBe(false);
    expect(Bi.compteLe({})).toBe(true);
  });
});

// ── le plan : les phrases, I255, les paris ──────────────────────────────────────────────────────────────────────────────
function plan(liste, faites) {
  const c = R(liste);
  let k = 0;
  const id = () => 'q' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'squat', id, { series: 3 });
  se.exercices[0].series.forEach((s, i) => { s.reps_visees = 4; if (i > 0) s.type_serie = 'recul'; });
  (faites || []).forEach(([kg, r, ex], i) => Object.assign(se.exercices[0].series[i], { charge_kg: kg, reps: r, validee_a: '2026-11-30T10:0' + i + ':00.000Z' }, ex || {}));
  const e = { seance: { id: 'S', debut: avantDe(liste), edition: false, exercices: se.exercices }, consignes: { squat: c }, paris: [], suites: {}, reglage: 'normal', objectif: 'muscle', debutant: false,
    catalogue: { squat: { nom: 'Squat', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['quadriceps'], muscles_secondaires: ['fessiers'], muscles_stabilisateurs: [] } } };
  const p = T.planDeSeance(e);
  return { p, e, x: p.exercices[0], erreurs: T.verifierPlan(p, e).erreurs, phrases: T.verifierPhrases(p) };
}

describe('R2b — les mots (aucune promesse, des dates absolues, « je »)', () => {
  const h = [bonne(), bonne()];
  test('la séance légère : le Pourquoi dit le zéro, ce qui était tenu et la baisse — sans promesse de retour', () => {
    const t = plan([...h, zero()]);
    expect(sp(t.x.entete.gris)).toBe('140 kg × 0 : pas encore. Je baisse à 132,5 kg pour cette séance.');
    expect(sp(t.x.pourquoi.etat)).toBe('Le 16 nov., ta grosse série à 140 kg est restée à 0 rep, et tes reculs aussi. Le 12 nov., tu tenais 140 kg × 3. Je baisse à 132,5 kg pour cette séance.');
    expect(sp(t.x.pourquoi.etat)).not.toMatch(/Si elle passe|je reviens/i);
    expect(t.erreurs).toEqual([]);
    expect(t.phrases).toEqual([]);
  });
  test('sans bloc à reculs : « ta série », ni « grosse » ni « reculs »', () => {
    const t = plan([[g(140, 3)], [g(140, 3)], [g(140, 0, 'echec')]]);
    expect(sp(t.x.pourquoi.etat)).toMatch(/^Le 16 nov\., ta série à 140 kg est restée à 0 rep\. Le 12 nov\., tu tenais 140 kg × 3\./);
    expect(sp(t.x.pourquoi.etat)).not.toMatch(/grosse|recul/);
  });
  test('la séance de retour : « Je reviens à ta charge de travail : 140 kg × 3. » (« je », jamais « on »)', () => {
    const t = plan([...h, zero(), legere(132.5, 4)]);
    expect(sp(t.x.entete.gris)).toBe('Je reviens à ta charge de travail : 140 kg × 3.');
    expect(sp(t.x.pourquoi.etat)).toBe('Ta séance plus légère est passée. Le 16 nov., ton 0 rep à 140 kg ne change pas ta charge de travail : je reviens à 140 kg × 3.');
    expect(t.x.verbe.verbe).toBe('reprend');
    expect(t.erreurs).toEqual([]);
    expect(t.phrases).toEqual([]);
  });
  test('les paris de la séance légère portent « jourSans » (ils sortent de Bilan.compteLe) ; ceux d\'une séance ordinaire non', () => {
    const t = plan([...h, zero()]);
    const paris = t.x.paris.filter(Boolean);
    expect(paris.length).toBeGreaterThan(0);
    paris.forEach((q) => expect(q.fondement.jourSans).toBe(true));
    plan(h).x.paris.filter(Boolean).forEach((q) => expect(q.fondement.jourSans).toBeUndefined());
  });
  test('l\'annonce de fin d\'exercice dit la suite quand elle est vraie : « La prochaine fois : 140 kg × 3. » (la légère passée) ; une séance ordinaire sinon', () => {
    const cAvant = K([...h, zero()]);
    const cPasse = K([...h, zero(), legere(132.5, 4)]);
    const dit = (cApres) => sp(M.annonceDe('suite', { cAvant, cApres, z: M.zoneParCle(cApres.zone), reglage: 'normal', fait: cApres.niveau, cranSuivant: 142.5, cranApproche: false, testConfirme: false }));
    expect(dit(cPasse)).toBe('La prochaine fois : 140 kg × 3.');
    expect(dit(K([...h, zero(), legere(132.5, 1)]))).not.toMatch(/140 kg × 3/);
  });
});

describe('I255 — vérifié, et DISCRIMINANT (un plan forgé échoue)', () => {
  const h = [bonne(), bonne()];
  test('un jour sans pour une population protégée est refusé', () => {
    const t = plan([...h, zero()]);
    const f = JSON.parse(JSON.stringify(t.p)); f.protegee = true;
    expect(T.verifierPlan(f, t.e).erreurs.join('|')).toMatch(/I255.*population protégée/);
  });
  test('un jour sans à une charge au-dessus de la charge de travail est refusé', () => {
    const t = plan([...h, zero()]);
    const f = JSON.parse(JSON.stringify(t.p)); f.exercices[0].consigne.fondement.zeroRep.charge = 145;
    expect(T.verifierPlan(f, t.e).erreurs.join('|')).toMatch(/I255.*au-dessus de la charge de travail/);
  });
  test('un pari de la séance légère qui se compterait est refusé', () => {
    const t = plan([...h, zero()]);
    const f = JSON.parse(JSON.stringify(t.p)); delete f.exercices[0].paris.filter(Boolean)[0].fondement.jourSans;
    expect(T.verifierPlan(f, t.e).erreurs.join('|')).toMatch(/I255.*jourSans/);
  });
  test('un retour au-dessus du niveau d\'avant (140 × 4 pour un niveau de 3), ou avec une ligne haute, est refusé', () => {
    const t = plan([...h, zero(), legere(132.5, 4)]);
    const f = JSON.parse(JSON.stringify(t.p)); f.exercices[0].consigne.ligne.vise = 4;
    expect(T.verifierPlan(f, t.e).erreurs.join('|')).toMatch(/I255.*jamais au-dessus du niveau d’avant/);
    const f2 = JSON.parse(JSON.stringify(t.p)); f2.exercices[0].consigne.haut = { charge: 145, vise: 1 };
    expect(T.verifierPlan(f2, t.e).erreurs.join('|')).toMatch(/I255.*ligne haute/);
  });
});
