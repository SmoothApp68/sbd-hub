/**
 * « Les mots disent vrai », PR 3 bis (MOTEUR §9.46) — les paris de Décharge (`fondement.allegee`) ne sont pas
 * comptés dans « le coach en a tenu N sur M », À LA LECTURE SEULEMENT, par UN seul prédicat (`Bilan.compteLe`).
 *   · le compte (`Bilan.compterParis`) les ignore ; un pari sans drapeau (écrit avant lui) compte ;
 *   · le récap de fin de séance, le premier pari et le bilan de période (`bilan.coach`) s'y rangent ;
 *   · `faits.parisRatesALaSuite` les lit toujours : un raté de Décharge reste un signal de forme ;
 *   · le dénominateur à 0 : le bloc des paris disparaît (pas de « 0 sur 0 »).
 */
const fs = require('fs');
const path = require('path');
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
const Bilan = require('../../v2/js/bilan.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
require('../../v2/js/seance.js');
require('../../v2/js/periode.js');
require('../../v2/js/parcours.js');
require('../../v2/js/poids.js');
const Bilans = require('../../v2/js/bilans.js');
const Faits = require('../../v2/js/faits.js');

const lire = (f) => fs.readFileSync(path.join(__dirname, '../../v2/js', f), 'utf8');
const D = (o) => Object.assign({ allegee: true }, o);

describe('Bilan.compterParis / compteLe', () => {
  test('les paris de Décharge ne comptent ni vérifiés ni tenus', () => {
    const p = [{ predite: 8, observee: 8 }, { predite: 8, observee: 6 }, D({ predite: 6, observee: 8 }), D({ predite: 6, observee: 6 })];
    expect(Bilan.compterParis(p)).toEqual({ verifies: 2, tenus: 1 });
  });
  test('le drapeau absent, faux ou non booléen : le pari compte (écrit avant le drapeau)', () => {
    const p = [{ predite: 8, observee: 8 }, { predite: 8, observee: 8, allegee: false }, { predite: 8, observee: 8, allegee: undefined }, { predite: 8, observee: 8, allegee: null }];
    expect(Bilan.compterParis(p)).toEqual({ verifies: 4, tenus: 4 });
    expect(Bilan.compteLe({ predite: 1, observee: 1 })).toBe(true);
    expect(Bilan.compteLe(D({}))).toBe(false);
    expect(Bilan.compteLe(null)).toBe(false);
  });
  test('que des paris de Décharge : 0 vérifié (dénominateur 0)', () => {
    expect(Bilan.compterParis([D({ predite: 6, observee: 8 })])).toEqual({ verifies: 0, tenus: 0 });
  });
});

describe('le récap de fin de séance et le premier pari', () => {
  const CAT = [{ slug: 'squat_barre', nom: 'Squat (Barre)', equipement: 'barre', mesure: 'charge_reps', muscles_primaires: ['quadriceps'], muscles_secondaires: [] }];
  const SEANCE = { id: 's1', user_id: 'u', debut: '2026-11-02T10:00:00Z', fin: '2026-11-02T11:00:00Z', titre: 'Bas', statut: 'terminee', source: 'app',
    exercices: [{ exercise_slug: 'squat_barre', series: [
      { id: 'a', type_serie: 'travail', charge_kg: 100, reps: 8, validee_a: '2026-11-02T10:10:00Z', source: 'app' }] }] };
  const corpus = () => ({ seances: [SEANCE], series: [], exercices: CAT, seriesDe: () => [],
    catalogue: () => { const i = {}; CAT.forEach((e) => { i[e.slug] = e; }); return i; }, journal: [] });
  const faits = Faits.creer();
  const recap = (paris, premier) => faits.recapDeLaSeance(corpus(), SEANCE, paris, premier);

  test('une séance de Décharge seule : aucun bloc « paris » (la phrase reste vraie)', () => {
    const r = recap([D({ seance: 's1', exercice: 'squat_barre', predite: 6, observee: 8 })], [{ seance: 's1', allegee: true }]);
    expect(r.paris).toBeNull();
  });
  test('mélange : seuls les paris comptés sont dans N sur M, les lignes et la phrase', () => {
    const r = recap([{ seance: 's1', exercice: 'squat_barre', predite: 8, observee: 7 },
                     D({ seance: 's1', exercice: 'squat_barre', predite: 6, observee: 8 })], []);
    expect(r.paris.verifies).toBe(1);
    expect(r.paris.tenus).toBe(0);
    expect(r.paris.lignes).toHaveLength(1);
    expect(r.paris.lignes[0].vise).toBe('8');
  });
  test('un pari sans drapeau compte', () => {
    expect(recap([{ seance: 's1', exercice: 'squat_barre', predite: 8, observee: 8 }], []).paris.verifies).toBe(1);
  });
  test('le premier pari du compte ne retient pas un pari de Décharge', () => {
    expect(faits.premierPariDuCompte(corpus(), [{ seance: 's1', allegee: true }])).toBeNull();
    expect(faits.premierPariDuCompte(corpus(), [{ seance: 's1', allegee: true }, { seance: 's1' }])).toBe('s1');
  });
});

describe('le bilan de période (`bilan.coach`)', () => {
  const bilan = (paris) => Bilans.bilanDeLaPeriode({ periode: Bilans.periodeDuMois('2026-10'), aujourdhui: '2026-10-31',
    seances: [], exercices: [], pesees: [], paris });
  test('N sur M sans la Décharge ; « depuis » ne part pas d’un pari de Décharge', () => {
    const b = bilan([D({ jour: '2026-10-01', predite: 6, observee: 8 }), { jour: '2026-10-10', predite: 8, observee: 8 }, { jour: '2026-10-12', predite: 8, observee: 6 }]);
    expect(b.coach).toEqual({ tenus: 1, faits: 2, depuis: '2026-10-10' });
  });
  test('que de la Décharge : pas de bloc coach', () => {
    expect(bilan([D({ jour: '2026-10-01', predite: 6, observee: 8 })]).coach).toBeNull();
  });
  test('l’entrée du bilan garde le drapeau (faits.entreeDuBilan → paris)', () => {
    const src = lire('faits.js');
    expect(src).toMatch(/observee: q\.observee, allegee: q\.allegee === true/);
  });
});

describe('parisRatesALaSuite : un raté de Décharge reste un signal', () => {
  test('deux séances ratées dont une de Décharge : toujours n = 2', () => {
    const faits = Faits.creer();
    const r = faits.parisRatesALaSuite([
      { seance: 'b', date: '2026-11-09', exercice: 'squat_barre', predite: 8, observee: 6, charge: 100 },
      D({ seance: 'a', date: '2026-11-02', exercice: 'squat_barre', predite: 6, observee: 4, charge: 90 })], 'cours', []);
    expect(r.squat_barre.n).toBe(2);
  });
  test('le source de parisRatesALaSuite ne lit pas le drapeau', () => {
    const src = lire('faits.js');
    const corps = src.slice(src.indexOf('function parisRatesALaSuite'), src.indexOf('function parisRatesALaSuite') + 1800);
    expect(corps).not.toMatch(/allegee|compteLe/);
  });
});

describe('le câblage de l’app', () => {
  test('`parisDeConsigneConnus` et `parisDeConsigneDuCompte` reprennent `fondement.allegee`', () => {
    const app = lire('app.js');
    const a = app.slice(app.indexOf('function parisDeConsigneConnus'), app.indexOf('function parisDeConsigneDuCompte'));
    const b = app.slice(app.indexOf('function parisDeConsigneDuCompte'), app.indexOf('function premierPariDeLExercice'));
    expect(a).toMatch(/allegee: !!\(x\.l\.fondement && x\.l\.fondement\.allegee === true\)/);
    expect(b).toMatch(/allegee: !!\(x\.l\.fondement && x\.l\.fondement\.allegee === true\)/);
  });
});
