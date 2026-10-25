/** @jest-environment node */
//
// 159 — « J'AI AUSSI UNE BARRE EZ / DROITE QU'ON CHARGE » (MOTEUR §10 bis, ECRAN-PROFIL Ma salle ; décidé le 24/10/2026,
// maquette `maquette-barre-ez-chargee-v1.html`, migration v2_111 : `barre_ez_chargee`, `barre_droite_chargee`).
// Case cochée : les barres fixes déclarées, puis, au-delà de la plus lourde, des crans de 2,5 kg jusqu'à 100 kg.
// Case vide ou absente : rien ne change. Cochée sans barre fixe de ce type : `null` (la salle n'en dit rien).

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
const Profil = require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
require('../../v2/js/plan.js');
require('../../v2/js/semaine.js');
require('../../v2/js/generateur.js');

const FIXES = [10, 15, 20, 25, 30];
const CRANS = []; for (let v = 32.5; v <= 100; v += 2.5) CRANS.push(v);
const salle = (extra) => ({ ma_salle: Object.assign({ barres_ez: FIXES, barres_droites: FIXES, halteres: null }, extra) });
const INDEX = {
  curl_biceps_barre_ez: { slug: 'curl_biceps_barre_ez', nom: 'Curl Biceps (Barre EZ)', equipement: 'barre', mouvement: 'curl',
    barre_charge_fixe: true, muscles_primaires: ['biceps'], muscles_secondaires: ['avant_bras'], muscles_stabilisateurs: [] },
  curl_biceps_barre: { slug: 'curl_biceps_barre', nom: 'Curl Biceps (Barre)', equipement: 'barre', mouvement: 'curl',
    barre_charge_fixe: true, muscles_primaires: ['biceps'], muscles_secondaires: ['avant_bras'], muscles_stabilisateurs: [] },
  rowing_barre: { slug: 'rowing_barre', nom: 'Rowing Barre', equipement: 'barre', mouvement: 'rowing', barre_charge_fixe: false,
    muscles_primaires: ['grand_dorsal'] }
};
const charges = (p, slug) => (Profil.salleDeLExercice(p, slug, INDEX) || {}).charges;

describe('159 — Profil.salleDeLExercice et la barre qu’on charge', () => {
  test('cochée sans barre fixe EZ : null', () => {
    expect(Profil.salleDeLExercice({ ma_salle: { barres_ez: [], barres_droites: FIXES, halteres: null, barre_ez_chargee: true } },
      'curl_biceps_barre_ez', INDEX)).toBeNull();
  });
  test('un exercice `barre_charge_fixe === false` n’est jamais touché', () => {
    expect(Profil.salleDeLExercice(salle({ barre_droite_chargee: true }), 'rowing_barre', INDEX)).toBeNull();
  });
  test('lecture : un ma_salle sans la clé se lit « non » ; la clé ne s’écrit que vraie ; un type faux est refusé', () => {
    expect(Profil.barreChargee(Profil.brouillonSalle({ ma_salle: { barres_ez: FIXES } }), 'barres_ez')).toBe(false);
    const b = Profil.poserBarreChargee(Profil.brouillonSalle({ ma_salle: { barres_ez: FIXES } }), 'barres_ez', true);
    expect(Profil.champsSalle(b).ma_salle.barre_ez_chargee).toBe(true);
    const off = Profil.champsSalle(Profil.poserBarreChargee(b, 'barres_ez', false)).ma_salle;
    expect('barre_ez_chargee' in off).toBe(false);
    expect(Profil.champsSalle({ barres_ez: FIXES, barre_ez_chargee: 'oui' })).toBeNull();
  });
});

describe('159 — le coach teste 32,5 kg au lieu de l’état salle_max', () => {
  let n = 0;
  const brute = (kg, reps) => ({ id: 'i' + (++n), rang: n, charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: 'x' });
  const jour = (md) => '2026-' + md + 'T18:00:00+00:00';
  const O = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false };
  const hist = () => [
    { seance: { id: 'S4', debut: jour('10-10') }, series: [brute(30, 12), brute(30, 12), brute(30, 12)] },
    { seance: { id: 'S3', debut: jour('10-06') }, series: [brute(30, 10), brute(30, 10), brute(30, 10)] },
    { seance: { id: 'S2', debut: jour('10-02') }, series: [brute(27.5, 12), brute(27.5, 12), brute(27.5, 12)] },
    { seance: { id: 'S1', debut: jour('09-28') }, series: [brute(25, 12), brute(25, 12), brute(25, 12)] }];
  const consigne = (p) => M.consigneDExercice(hist(), undefined, jour('10-14'),
    Object.assign({ salle: Profil.salleDeLExercice(p, 'curl_biceps_barre_ez', INDEX) }, O)).consigne;

  // 163 (24/10/2026) — REPRIS : la bascule « barre chargée » n'est plus lue (« Ma salle » ne garde que les élastiques).
  // Sans salle, 30 kg × 12 de la dernière séance teste 32,5 kg, jamais faite : APPROCHÉE (« ≈ 32,5 kg »).
  test('⚠️ DISCRIMINANT — bascule ou non : test_propose, ligne haute 32,5 approchée (plus de salle_max)', () => {
    [salle({ barre_ez_chargee: true }), salle({})].forEach((p) => {
      const c = consigne(p);
      expect(c.etat).toBe('test_propose');
      expect(c.haut.charge).toBe(32.5);
      expect(c.haut.approchee).toBe(true);
    });
  });
});
