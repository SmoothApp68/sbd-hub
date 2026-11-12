/** @jest-environment node */
//
// PR 4a « première séance sûre » — LE PLANCHER DE RÉSERVE (MOTEUR §9.26 bis, décision d'Aurélien du 12/11/2026).
// Pour les 65 ans et plus connus, les débutants et l'objectif Forme, la réserve visée AFFICHÉE ne descend jamais sous 2.
// Deux fonctions : `reserveVisee` (la table : le déclencheur du test) et `reserveAffichee` (le plancher : l'affichage, la garde).

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');

const ZONES = ['lourd', 'mix', 'hypertrophie', 'volume', 'series_longues'];
const REGLAGES = ['prudent', 'normal', 'franc'];

let n = 0;
const brute = (kg, reps, ressenti) => ({
  id: 'x' + (++n), rang: n, charge_kg: kg, reps, rpe: null,
  ressenti: ressenti === undefined ? null : ressenti, type_serie: 'travail', exercise_slug: 'dc'
});
const jour = (md) => '2026-' + md + 'T18:00:00+00:00';
const AVANT = jour('09-20');
const OPTIONS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false };
function histoire(kg, repsHabituelles, derniere) {
  const dates = ['09-13', '09-06', '08-30', '08-23', '08-16'];
  return dates.map((d, i) => ({ seance: { id: 'H' + i, debut: jour(d) },
    series: [brute(kg, repsHabituelles), brute(kg, repsHabituelles),
      i === 0 ? brute(kg, derniere.reps, derniere.ressenti) : brute(kg, repsHabituelles)] }));
}
const consigne = (groupes, options) =>
  M.consigneDExercice(groupes, undefined, AVANT, Object.assign({}, OPTIONS, options || {})).consigne;
const sansEspaces = (s) => s.replace(/[  ]/g, ' ');

describe('PR 4a — la population protégée (un seul prédicat)', () => {
  test('65 ans et plus connus, débutant, objectif Forme — jamais deviné', () => {
    expect(M.populationProtegee({ plus65: true })).toBe(true);
    expect(M.populationProtegee({ debutant: true })).toBe(true);
    expect(M.populationProtegee({ objectif: 'forme' })).toBe(true);
    expect(M.populationProtegee({ plus65: null, debutant: false, objectif: 'muscle' })).toBe(false);
    expect(M.populationProtegee({ plus65: 'oui' })).toBe(false);
    expect(M.populationProtegee({})).toBe(false);
    expect(M.populationProtegee()).toBe(false);
  });
  test('le plancher est une constante : 2', () => { expect(M.RESERVE_PLANCHER).toBe(2); });
});

describe('PR 4a — reserveAffichee : la table hors population, le plancher dedans', () => {
  test('T-R1 hors population : la table, octet pour octet, une ligne de test comprise', () => {
    ZONES.forEach((zone) => REGLAGES.forEach((reglage) => ['ligne', 'test', 'haut', 'coach', 'hors'].forEach((role) => {
      const o = { zone, role, reglage };
      expect(M.reserveAffichee(o)).toBe(M.reserveVisee(o));
      expect(M.reserveAffichee(Object.assign({ protegee: false }, o))).toBe(M.reserveVisee(o));
    })));
  });
  test('protégée : jamais sous 2, jamais au-dessus de 3, la table au-dessus de 2 est gardée', () => {
    ZONES.forEach((zone) => REGLAGES.forEach((reglage) => {
      const t = M.reserveVisee({ zone, role: 'ligne', reglage });
      const a = M.reserveAffichee({ zone, role: 'ligne', reglage, protegee: true });
      expect(a).toBe(Math.min(3, Math.max(2, t)));
      expect(a).toBeGreaterThanOrEqual(2);
      expect(a).toBeLessThanOrEqual(3);
    }));
  });
  test('protégée : Franc Hypertrophie (table 0) affiche 2 ; Normal Lourd (2) reste 2', () => {
    expect(M.reserveAffichee({ zone: 'hypertrophie', role: 'ligne', reglage: 'franc', protegee: true })).toBe(2);
    expect(M.reserveVisee({ zone: 'hypertrophie', role: 'ligne', reglage: 'franc' })).toBe(0);
    expect(M.reserveAffichee({ zone: 'lourd', role: 'ligne', reglage: 'normal', protegee: true })).toBe(2);
  });
  test('T-R3 protégée : une ligne de test ou haute n’affiche aucun chiffre (null), la table reste lisible', () => {
    ZONES.forEach((zone) => REGLAGES.forEach((reglage) => ['test', 'haut'].forEach((role) => {
      expect(M.reserveAffichee({ zone, role, reglage, protegee: true })).toBeNull();
      expect(M.reserveVisee({ zone, role, reglage })).not.toBeNull();
    })));
  });
  test('sans zone, sans coach, une chauffe : null, protégée ou non', () => {
    expect(M.reserveAffichee({ zone: null, role: 'ligne', protegee: true })).toBeNull();
    expect(M.reserveAffichee({ zone: 'mix', role: 'hors', protegee: true })).toBeNull();
    expect(M.reserveAffichee({ zone: 'mix', role: 'echauffement', protegee: true })).toBeNull();
    expect(M.reserveAffichee()).toBeNull();
  });
  test('plancherDeReserve : null reste null, hors population la table', () => {
    expect(M.plancherDeReserve(null, true)).toBeNull();
    expect(M.plancherDeReserve(0, false)).toBe(0);
    expect(M.plancherDeReserve(0, true)).toBe(2);
    expect(M.plancherDeReserve(1, true)).toBe(2);
    expect(M.plancherDeReserve(3, true)).toBe(3);
  });
});

describe('PR 4a — la règle dans la consigne : la garde lit le plancher, le test lit la table', () => {
  // Franc, Hypertrophie : table 0. 40 kg, zone 8-10 en hypertrophie (haut 10).
  const franc = { reglage: 'franc' };
  test('T-R2 séparation : R = 2 déclenche le test sur la TABLE (0 + 2), avec ou sans protégée ; le haut est le même', () => {
    const g = histoire(60, 9, { reps: 9, ressenti: 'reste_2' });
    const sans = consigne(g, franc);
    const avec = consigne(g, Object.assign({ protegee: true }, franc));
    expect(sans.etat).toBe('test_propose');
    expect(avec.etat).toBe('test_propose');
    expect(avec.haut).toEqual(sans.haut);
    expect(avec.haut.charge).toBe(65);
    expect(sans.fondement.effortVise).toEqual({ effet: 'test', charge: 60, reps: 9, reserve: 2, visee: 0 });
    expect(avec.fondement.effortVise).toEqual({ effet: 'test', charge: 60, reps: 9, reserve: 2, visee: 2, viseeTable: 0, protegee: true });
  });
  test('T-R1 R = 2 protégé : la phrase dit « c’est ce que je visais » ; R = 3 : « Au-dessus de ce que je visais »', () => {
    const ev2 = { effet: 'test', charge: 34, reps: 9, reserve: 2, visee: 2, viseeTable: 0, protegee: true };
    expect(sansEspaces(M.phraseEffortVise(ev2, 36)))
      .toBe('34 kg × 9, il t’en restait 2 : c’est ce que je visais. La prochaine fois, on essaie 36 kg.');
    const ev3 = Object.assign({}, ev2, { reserve: 3 });
    expect(sansEspaces(M.phraseEffortVise(ev3, 36)))
      .toBe('34 kg × 9, il t’en restait 3. Au-dessus de ce que je visais : la prochaine fois, on essaie 36 kg.');
  });
  test('R = 1 sur Franc Hypertrophie, au haut de la zone : non protégé monte (table 0), protégé GARDE (visée 2)', () => {
    const g = histoire(40, 12, { reps: 12, ressenti: 'reste_1' });
    expect(consigne(g, franc).etat).toBe('test_propose');
    const k = consigne(g, Object.assign({ protegee: true }, franc));
    expect(k.etat).toBe('progression');
    expect(k.haut).toBeNull();
    expect(k.fondement.effortVise).toMatchObject({ effet: 'garde', reserve: 1, visee: 2, viseeTable: 0, protegee: true });
  });
  test('non protégé : le fondement n’a ni viseeTable ni protegee (octet pour octet)', () => {
    const k = consigne(histoire(60, 9, { reps: 9, ressenti: 'reste_3_plus' }));
    expect(Object.keys(k.fondement.effortVise).sort()).toEqual(['charge', 'effet', 'reps', 'reserve', 'visee']);
  });
  test('T-R4 garde de bord : un non-débutant protégé qui note 1 garde sa charge ; un débutant jamais', () => {
    // Bord : séances sous 3 reps, Franc (table Lourd 1) — 100 kg × 2 deux séances, R = 1 sur la dernière série.
    const bord = (extra) => {
      const g = [0, 1, 2].map((i) => ({ seance: { id: 'B' + i, debut: jour(['09-13', '09-06', '08-30'][i]) },
        series: [brute(100, 2), brute(100, 2, i === 0 ? 'reste_1' : null)] }));
      return consigne(g, Object.assign({ reglage: 'franc', mesure: 'charge_reps' }, extra));
    };
    expect(bord({}).etat).toBe('bord');
    expect(bord({ protegee: true }).etat).toBe('bord_garde');
    expect(bord({ protegee: true, debutant: true }).etat).toBe('bord');
  });
  test('le drapeau de module suit options.protegee (compteur, rejeu) et se restaure', () => {
    const g = histoire(40, 12, { reps: 12, ressenti: 'reste_1' });
    consigne(g, Object.assign({ protegee: true }, franc));
    expect(consigne(g, franc).etat).toBe('test_propose');
  });
});
