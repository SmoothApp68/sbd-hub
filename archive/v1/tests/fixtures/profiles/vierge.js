/**
 * PROFIL « vierge » — compte créé, onboarding NON fait, 0 séance, 0 PR, 0 check-in.
 *
 * STRESSE :
 *  - Le chemin cold-start le plus extrême SANS retomber sur defaultDB() : un blob
 *    minimal (`user` + `logs:[]`) déjà persisté mais où l'onboarding n'a jamais
 *    abouti (onboarded:false, onboardingVersion:0).
 *  - loadDB : `onboardingVersion === undefined ? (onboarded?1:0)` → doit rester 0.
 *  - lpActive : loadDB fait `(logs||[]).length < 24` → true. Vérifie qu'un compte
 *    sans historique n'active pas des cartes qui exigent des données.
 *  - Tous les lecteurs `db.logs`/`db.bestPR`/`readinessHistory` doivent survivre
 *    au vide (0 division par zéro, 0 NaN, 0 crash de render).
 */
'use strict';
const G = require('./generator');

function build(now) {
  now = now || Date.now();
  const p = G.blankProfile('vierge', {
    name: '',
    bw: 0,
    height: null,
    age: null,
    gender: 'unspecified',
    goal: 'masse',
    level: 'intermediaire',
    trainingMode: null,
    onboarded: false,
    onboardingVersion: 0,
    onboardingPRs: null,
    consentHealth: false,
    medicalConsent: false,
    coachingStyle: 'classique'
  });
  // Rien d'autre : pas de logs, pas d'exercises, pas de check-in, pas de body.
  return p;
}

module.exports = {
  name: 'vierge',
  description: 'Compte créé, onboarding non terminé, aucune donnée.',
  stresses: 'Cold-start extrême ; migrations loadDB sur blob minimal ; robustesse au vide.',
  build
};
