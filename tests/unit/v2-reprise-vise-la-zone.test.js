/** @jest-environment node */
//
// 16/11/2026 — LA REPRISE LONGUE VISE LE BAS DE LA ZONE (MOTEUR §9.9, §9.14 bis, I204 à I206, I41 étendu). Le cas réel : squat, dernière séance
// il y a 7 mois, 70 × 5, 70 × 8, 70 × 2 → niveau validé 3 ; zone Hypertrophie (8-10) choisie : le coach proposait 65 × 3, « garde 0 ».
// Désormais : niveau sous le bas de la zone → bas de zone (8), charge = l'estimation au bas de zone (réserve AFFICHÉE ≥ 2), repli de 10 % au plus par-dessus.
// Le vrai chemin : `consigneDExercice`, `planDeSeance`, `verifierPlan`.

process.env.TZ = 'Europe/Paris';
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

let n = 0;
const brute = (kg, reps, slug) => ({ id: 'r' + (++n), rang: n, charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: slug || 'squat_barre' });
const grp = (d, kg, reps, slug) => ({ seance: { id: 'H' + d, debut: new Date(d).toISOString() }, series: reps.map((r) => brute(kg, r, slug)) });
const OPT = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'franc', edition: false };
const AVANT = '2026-11-16T17:00:00Z';
const calc = (g, o, avant) => M.consigneDExercice(g, undefined, avant || AVANT, Object.assign({}, OPT, o || {})).consigne;
const marque = (c) => c.fondement && c.fondement.reprisePlancher;

// Le cas réel : trois séances d'avant à d'autres reps (zone d'avant : Mix, ≠ Hypertrophie), puis 70 × 5, 8, 2.
const REEL = [grp('2026-03-23T17:00:00Z', 60, [6, 6, 6]), grp('2026-03-30T17:00:00Z', 65, [6, 6, 6]), grp('2026-04-06T17:00:00Z', 70, [6, 6, 6]), grp('2026-04-13T17:00:00Z', 70, [5, 8, 2])];
// La même zone d'avant et de maintenant : Hypertrophie (8 reps d'habitude), puis 70 × 9, 3, 3 (niveau 4).
const MEME_ZONE = [grp('2026-03-23T17:00:00Z', 60, [9, 9, 9]), grp('2026-03-30T17:00:00Z', 65, [9, 9, 9]), grp('2026-04-06T17:00:00Z', 70, [9, 9, 9]), grp('2026-04-13T17:00:00Z', 70, [9, 3, 3])];

describe('le cas réel de Mélody : 70 × 5, 8, 2, sept mois plus tard', () => {
  test('zone d’avant DIFFÉRENTE : Hypertrophie choisie, la visée est le bas de la zone, la charge l’estimation au bas de zone, la marque est posée', () => {
    const c = calc(REEL, { correction: 'hypertrophie' });
    expect(c.etat).toBe('reprise_longue');
    expect(c.zone).toBe('hypertrophie');
    expect(c.niveau).toBe(3);
    expect(c.ligne.vise).toBe(8);
    // 70 × 3 → max estimé 77 ; au bas de zone (8) + 2 en réserve : 77 / (1 + 10/30) = 57,75 → cran du dessous 57,5 → repli au cran, 55.
    expect(marque(c)).toMatchObject({ depuis: { palier: 70, niveau: 3, reserve: null }, reserve: 2, base: 57.5, bas: 8 });
    expect(c.ligne.charge).toBe(55);
    // jamais sous 10 % de la base, jamais plus lourd que l'estimation
    expect(c.ligne.charge).toBeGreaterThanOrEqual(57.5 * 0.9 - 1e-9);
    expect(M.unRMEpley(c.ligne.charge, c.ligne.vise + 2)).toBeLessThanOrEqual(M.unRMEpley(70, 3) + 1e-6);
  });
  test('zone d’avant IDENTIQUE : la reprise ne passe pas par `reportDeZone` (null), elle plancher quand même', () => {
    const c = calc(MEME_ZONE, { correction: 'hypertrophie' });
    expect(M.reportDeZone({ zone: 'hypertrophie', zoneAvant: 'hypertrophie', avant: AVANT, seances: [{ debut: '2026-04-13T17:00:00Z', palier: 70, niveau: 3, reserve: null }] })).toBeNull();
    expect(c.etat).toBe('reprise_longue');
    expect(c.niveau).toBeLessThan(8);
    expect(c.ligne.vise).toBe(8);
    expect(marque(c)).toMatchObject({ reserve: 2, bas: 8 });
    expect(c.ligne.charge).toBeLessThan(70 * 0.9);
  });
  test('la fonction d’estimation est UNE : le report l’appelle avec la même arithmétique', () => {
    const e = M.estimationAuBasDeZone({ palier: 70, niveau: 3, reserve: null, bas: 8, reserveCible: 2, cran: (c, s) => c + (s > 0 ? 2.5 : -2.5) });
    expect(e.maxSource).toBeCloseTo(77, 9);
    expect(e.estimee).toBeCloseTo(57.75, 9);
    expect(e.charge).toBe(57.5);
  });
  test('Mix choisi (bas 6) : 6 reps, réserve 2 → 77 / (1 + 8/30) = 60,8 → 60 → repli 57,5', () => {
    const c = calc(REEL, { correction: 'mix' });
    expect(c.ligne).toMatchObject({ charge: 57.5, vise: 6 });
  });
});

describe('ce que la règle ne touche pas', () => {
  test('zone Lourd (3-5), niveau 3 : 3 n’est pas sous le bas — la consigne d’avant, sans marque', () => {
    const h = [grp('2026-03-23T17:00:00Z', 175, [3, 3, 3]), grp('2026-04-13T17:00:00Z', 180, [3, 3, 3])];
    const c = calc(h, { correction: 'lourd' });
    expect(c.etat).toBe('reprise_longue');
    expect(marque(c)).toBeFalsy();
    expect(c.ligne).toMatchObject({ vise: 3 });
    expect(c.ligne.charge).toBeGreaterThanOrEqual(180 * 0.9 - 1e-9);   // le repli d'avant (10 % au plus), la visée du niveau
  });
  test('niveau à 2 reps (I170 : 1 ou 2 reps = un plancher, pas de projection) : pas de plancher de zone, la consigne d’avant', () => {
    const h = [grp('2026-03-23T17:00:00Z', 130, [2, 2, 2]), grp('2026-04-13T17:00:00Z', 140, [2, 2, 2])];
    const c = calc(h, { correction: 'mix' });
    expect(c.etat).toBe('reprise_longue');
    expect(c.niveau).toBe(2);
    expect(marque(c)).toBeFalsy();
    expect(c.ligne.vise).toBe(2);
  });
  test('lest : exempté', () => {
    const c = calc(REEL, { correction: 'hypertrophie', equipement: 'lest' });
    expect(c.etat).toBe('reprise_longue');
    expect(marque(c)).toBeFalsy();
  });
  test('poids du corps (charge 0) : exempté', () => {
    const h = [grp('2026-03-23T17:00:00Z', 0, [5, 5, 5], 'pompes'), grp('2026-04-13T17:00:00Z', 0, [5, 8, 2], 'pompes')];
    const c = calc(h, { correction: 'hypertrophie', mesure: 'reps', equipement: 'aucun' });
    expect(c && c.etat).toBe('reprise_longue');
    expect(marque(c)).toBeFalsy();
  });
  test('aide (charge négative) : exempté, la charge reste celle de travail', () => {
    const h = [grp('2026-03-23T17:00:00Z', -25, [5, 5, 5], 'tractions_assistees'), grp('2026-04-13T17:00:00Z', -25, [5, 8, 2], 'tractions_assistees')];
    const c = calc(h, { correction: 'hypertrophie', equipement: 'machine' });
    expect(c && c.etat).toBe('reprise_longue');
    expect(marque(c)).toBeFalsy();
    expect(c.ligne.charge).toBe(-25);
  });
  test('élastique (salle d’élastiques) : exempté', () => {
    const salle = { materiel: 'elastique', charges: [10, 15, 20, 25], aide: false };
    const h = [grp('2026-03-23T17:00:00Z', 20, [5, 5, 5]), grp('2026-04-13T17:00:00Z', 20, [5, 8, 2])];
    const c = calc(h, { correction: 'hypertrophie', equipement: 'elastique', salle });
    expect(c && c.etat).toBe('reprise_longue');
    expect(marque(c)).toBeFalsy();
  });
  test('reprise COURTE : inchangée (hors de cette règle)', () => {
    const c = calc(REEL, { correction: 'hypertrophie' }, '2026-05-20T17:00:00Z');
    expect(c.etat).toBe('reprise_courte');
    expect(c.ligne.vise).toBe(3);
  });
});

describe('`consigneFigee` : le repli ne se réapplique pas sur la ligne marquée', () => {
  test('idempotente sur la ligne marquée (55, pas 70)', () => {
    const c = calc(REEL, { correction: 'hypertrophie' });
    expect(M.consigneFigee(c)).toBe(c);
    expect(M.consigneFigee(M.consigneFigee(c)).ligne.charge).toBe(55);
  });
  test('sans la marque, le repli de 10 % remonte à 70 (la règle d’avant, intacte)', () => {
    const c = JSON.parse(JSON.stringify(calc(REEL, { correction: 'hypertrophie' })));
    delete c.fondement.reprisePlancher;
    expect(M.consigneFigee(c).ligne.charge).toBe(70);
  });
});

// ── le plan ────────────────────────────────────────────────────────────────
const FICHE = { nom: 'Squat', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['quadriceps'], muscles_secondaires: ['fessiers'], muscles_stabilisateurs: [] };
function plan(consigne, extra, faites) {
  let k = 0;
  const id = () => 'x-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'squat_barre', id, { series: 3 });
  const paris = [];
  const entrees = () => Object.assign({ seance: { id: 'S', debut: '2026-11-16T10:00:00Z', edition: false, exercices: se.exercices },
    consignes: { squat_barre: { consigne, contexte: { cran: null, haut: null } } }, reglage: 'franc', paris: paris.slice(),
    catalogue: { squat_barre: FICHE } }, extra || {});
  const sorties = [];
  let avant;
  const jouer = (faites || []).slice();
  for (let t = 0; t <= jouer.length; t++) {
    const e = entrees();
    const p = T.planDeSeance(e);
    sorties.push({ paris: paris.slice(), entrees: e, plan: p, x: p.exercices[0], erreurs: T.verifierPlan(p, e, avant).erreurs, phrases: T.verifierPhrases(p) });
    avant = p;
    if (t === jouer.length) break;
    se = S.valider(S.modifierSerie(se, 0, t, { charge_kg: jouer[t].charge, reps: jouer[t].reps }), 0, t, new Date('2026-11-16T10:30:00Z'));
    const q = T.planDeSeance(entrees()).exercices[0].paris[t];
    if (q) paris.push(Object.assign({}, q, { set_observe: se.exercices[0].series[t].id }));
  }
  return sorties;
}

describe('le plan : I15, I204, I205, I206 et le pari', () => {
  const c = () => JSON.parse(JSON.stringify(calc(REEL, { correction: 'hypertrophie' })));
  test('la ligne marquée passe verifierPlan (I15 jugé par I205), les phrases aussi', () => {
    const [s] = plan(c());
    expect(s.erreurs).toEqual([]);
    expect(s.phrases).toEqual([]);
    expect(s.x.lignes.filter((l) => l.role === 'ligne').map((l) => [l.charge, l.vise])).toEqual([[55, 8], [55, 8], [55, 8]]);
  });
  test('SANS la marque, I15 se déclenche (55 < 63) et I204 aussi (vise 8 reste sous… non : la visée est 8) — I15 seul parle du repli', () => {
    const [s] = plan(c());
    const faux = JSON.parse(JSON.stringify(s.plan));
    delete faux.exercices[0].consigne.fondement.reprisePlancher;
    expect(T.verifierPlan(faux, s.entrees).erreurs.some((m) => /^I15/.test(m))).toBe(true);
  });
  test('I205 : une base altérée, une charge au-dessus de l’estimation, une visée qui n’est plus le bas', () => {
    const k1 = c(); k1.fondement.reprisePlancher.base = 70;
    expect(plan(k1)[0].erreurs.some((m) => /^I205/.test(m))).toBe(true);
    const k2 = c(); k2.ligne.charge = 62.5;
    expect(plan(k2)[0].erreurs.some((m) => /^I205/.test(m))).toBe(true);
    const k3 = c(); k3.ligne.vise = 5;
    expect(plan(k3)[0].erreurs.some((m) => /^I204/.test(m))).toBe(true);
  });
  test('I204 : une ligne de reprise longue sous le bas, non exemptée et sans marque', () => {
    const k = c(); delete k.fondement.reprisePlancher; k.ligne = { charge: 65, vise: 3 };
    expect(plan(k)[0].erreurs.some((m) => /^I204/.test(m))).toBe(true);
  });
  test('le pari émis est la ligne (I7) : 55 kg × 8', () => {
    const s = plan(c(), null, [{ charge: 55, reps: 8 }]);
    expect(s[1].erreurs).toEqual([]);
    const pari = s[1].paris[0];
    expect(pari).toBeTruthy();
    expect(pari.valeur_predite).toBe(8);
    expect(pari.fondement.reserve_visee).toBe(2);
    expect(JSON.stringify(pari.fondement)).toMatch(/55/);
  });
});

describe('la réserve affichée : 2 à la séance de reprise, le réglage normal ensuite', () => {
  test('Franc, reprise longue : 2 (la table dit 0), « Pourquoi » et plancher posés ; I206 propre', () => {
    const [s] = plan(calc(REEL, { correction: 'hypertrophie' }));
    expect(s.x.reserveVisee).toBe(0);
    expect(s.x.reserveAffichee).toBe(2);
    expect(s.erreurs).toEqual([]);
    expect(s.x.plancher).toMatchObject({ visee: 2, table: 0 });
  });
  test('la séance SUIVANTE (une séance trois jours après) : plus de reprise, la table (0 en Franc)', () => {
    const h = REEL.concat([grp('2026-11-16T17:00:00Z', 55, [8, 8, 8])]);
    const c2 = calc(h, { correction: 'hypertrophie' }, '2026-11-19T17:00:00Z');
    expect(c2.etat).not.toBe('reprise_longue');
    const [s] = plan(c2);
    expect(s.x.reserveAffichee).toBe(0);
    expect(s.erreurs).toEqual([]);
  });
  test('`reserveAffichee` : le prédicat par exercice, la même constante, le réglage Prudent déjà au-dessus', () => {
    expect(M.reserveAffichee({ zone: 'hypertrophie', role: 'ligne', reglage: 'franc', repriseLongue: true })).toBe(M.RESERVE_PLANCHER);
    expect(M.reserveAffichee({ zone: 'hypertrophie', role: 'ligne', reglage: 'franc' })).toBe(0);
    expect(M.reserveAffichee({ zone: 'hypertrophie', role: 'ligne', reglage: 'normal', repriseLongue: true })).toBe(M.RESERVE_PLANCHER);
    expect(M.enRepriseLongue({ etat: 'reprise_longue' })).toBe(true);
    expect(M.enRepriseLongue({ etat: 'progression' })).toBe(false);
  });
});

describe('Décharge planifiée et semaine de mesure pendant une reprise', () => {
  test('Décharge : la charge ne dépasse jamais la ligne de la reprise (I166)', () => {
    const k = JSON.parse(JSON.stringify(calc(REEL, { correction: 'hypertrophie' })));
    const a = M.consigneAllegee(k, 3, true, { semaine: 4, semaines: 4 });
    expect(a.ligne.charge).toBeLessThanOrEqual(k.ligne.charge + 1e-9);
  });
  test('semaine de mesure acceptée : verifierPlan propre, aucune série « Au max »', () => {
    const k = JSON.parse(JSON.stringify(calc(REEL, { correction: 'hypertrophie' })));
    const BARRES = require('../../v2/js/modele.js').BARRES;
    let q = 0;
    const id = () => 'x-s' + (++q);
    let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, BARRES[0], id, { series: 3 });
    const e = { seance: { id: 'S', debut: '2026-11-16T10:00:00Z', edition: false, routine_id: 'R', exercices: se.exercices },
      consignes: { [BARRES[0]]: { consigne: k, contexte: { cran: null, haut: null } } }, reglage: 'franc', paris: [], objectif: 'les_deux',
      catalogue: { [BARRES[0]]: FICHE },
      semaineDeTest: { debut: '2026-11-16', fin: '2026-11-22', modes: {}, mesures: {}, refus: {}, maxEstimes: { [BARRES[0]]: 100 } } };
    const p = T.planDeSeance(e);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    expect(p.exercices[0].auMax).toBeUndefined();
  });
});

describe('la phrase de la reprise : un fait dans la voix du coach, sans « un cran en dessous »', () => {
  test('l’en-tête, le Pourquoi et le verbe (I162 : la charge baisse, les reps montent)', () => {
    const k = calc(REEL, { correction: 'hypertrophie' });
    const l = M.libellesConsigne(k);
    const gris = String(l.gris === undefined ? JSON.stringify(l) : l.gris).replace(/[\u00a0\u202f]/g, ' ');
    expect(JSON.stringify(l).replace(/[\u00a0\u202f]/g, ' ')).toMatch(/Reprise après une pause : on repart au bas de ta zone, 55 kg × 8\./);
    expect(JSON.stringify(l)).not.toMatch(/un cran en dessous/);
    expect(gris).toBeTruthy();
    expect(M.verbeDeLaConsigne(k).verbe).toBe('recule');
    const [s] = plan(k);
    expect(s.erreurs.filter((m) => /^I162/.test(m))).toEqual([]);
  });
});

describe('la réaction « plus léger que prévu » : jamais « la suite … vise N » sous le bas de la zone', () => {
  test('reprise COURTE, ligne visée à 3 en zone 8-10 : 50 × 10 → le fait, sans la suite ; I41 propre', () => {
    const c2 = calc(REEL, { correction: 'hypertrophie' }, '2026-05-20T17:00:00Z');
    expect(c2.etat).toBe('reprise_courte');
    const s = plan(c2, null, [{ charge: 50, reps: 10 }]);
    const msg = s[1].x.message;
    expect(msg && msg.type).toBe('plus_leger');
    const txt = String(s[1].x.phrases.map((p) => p.texte).join(' ')).replace(/[\u00a0\u202f]/g, ' ');
    expect(txt).toMatch(/50 kg × 10, plus léger que prévu/);
    expect(txt).not.toMatch(/La suite reste/);
    expect(txt).not.toMatch(/vise 3/);
    expect(s[1].erreurs.filter((m) => /^I41/.test(m))).toEqual([]);
  });
  test('reprise longue au bas de la zone : la suite (55 kg × 8) est au bas de la zone, elle peut se dire', () => {
    const s = plan(calc(REEL, { correction: 'hypertrophie' }), null, [{ charge: 50, reps: 10 }]);
    expect(s[1].x.message.type).toBe('plus_leger');
    expect(s[1].erreurs).toEqual([]);
  });
  test('I41 : un message qui garde une suite sous le bas de la zone est refusé (et accepté au bas de la zone)', () => {
    const s = plan(calc(REEL, { correction: 'hypertrophie' }), null, [{ charge: 50, reps: 10 }]);
    const e0 = s[1];
    expect(e0.x.reaction.message.type).toBe('plus_leger');
    const avec = (suite) => {
      const faux = JSON.parse(JSON.stringify(e0.plan));
      faux.exercices[0].reaction.message = Object.assign({}, faux.exercices[0].reaction.message, { suite });
      return T.verifierPlan(faux, e0.entrees).erreurs.filter((m) => /^I41/.test(m));
    };
    expect(avec({ charge: 65, vise: 3, fourchette: false }).length).toBeGreaterThan(0);
    expect(avec({ charge: 55, vise: 8, fourchette: false })).toEqual([]);
  });
});
