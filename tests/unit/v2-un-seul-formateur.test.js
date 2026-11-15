//
// « UN SEUL FORMATEUR » (MOTEUR §9.51 quater, 15/11/2026) — audit des doublons F-01, F-02, F-05, F-10.
//
// Le défaut : un nombre, une date, une durée s'écrivaient par une quinzaine de chemins. Le bloc du mois de Progression disait
// « 12 t », la story du même mois « 12,3 t » ; une charge de 127,25 kg se lisait « 127,25 kg » au journal et « 127,3 kg » dans la story ;
// le premier novembre se disait « 1er nov. » à la médaille, « 1 nov. » dans une phrase du coach, « 01 nov. 2026 » sur la fiche.
//
//   I197  une même charge, le même texte partout (`Modele.kgTexte`) ; 0,25 kg reste 0,25 kg ;
//   I198  un même volume, le même texte partout (`Modele.tonnesTexte`) : Progression, story, bilan, récap, plaque ;
//   I199  le premier du mois s'écrit « 1er » dans tout formateur de date, jamais « 1 » ni « 01 » ;
//   I200  une durée, le même texte partout (`Modele.formatDuree`) ;
//   I201  (la garde d'architecture : aucun formateur recopié — `v2-architecture.test.js`).
//
// ⚠️ L'ARRONDI D'AFFICHAGE N'EST PAS L'ARRONDI DE CALCUL : ces tests ne regardent que du TEXTE.

process.env.TZ = 'Europe/Paris';

global.self = global;
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
const Bilan = require('../../v2/js/bilan.js');
require('../../v2/js/parcours.js');
require('../../v2/js/poids.js');
const Bilans = require('../../v2/js/bilans.js');
const Annee = require('../../v2/js/annee.js');
const Seance = require('../../v2/js/seance.js');
const Hevy = require('../../v2/js/importhevy.js');
require('../../v2/js/profil.js');
require('../../v2/js/rendu.js');

const N = ' ';         // l'espace insécable
const F = ' ';         // l'espace fine insécable (les milliers)
const MOINS = '−';

describe('I197 — une charge s’écrit par `Modele.kgTexte` (F-02)', () => {
  test('les cas limites : 0, 0,5, 0,25, 1000, négatifs, vide', () => {
    expect(Modele.kgTexte(0)).toBe('0' + N + 'kg');
    expect(Modele.kgTexte(0.5)).toBe('0,5' + N + 'kg');
    expect(Modele.kgTexte(0.25)).toBe('0,25' + N + 'kg');
    expect(Modele.kgTexte(127.25)).toBe('127,25' + N + 'kg');
    expect(Modele.kgTexte(127.5)).toBe('127,5' + N + 'kg');
    expect(Modele.kgTexte(1000)).toBe('1000' + N + 'kg');
    expect(Modele.kgTexte(12345.6)).toBe('12345,6' + N + 'kg');
    expect(Modele.kgTexte(-0.5)).toBe(MOINS + '0,5' + N + 'kg');
    expect(Modele.kgTexte(null)).toBe('');
    expect(Modele.kgTexte(undefined)).toBe('');
    expect(Modele.kgTexte('')).toBe('');
    expect(Modele.kgTexte(NaN)).toBe('');
    expect(Modele.kgTexte(Infinity)).toBe('');
  });
  test('la précision se passe en paramètre ; « plus » écrit le signe ; « fixe » garde les zéros', () => {
    expect(Modele.kgTexte(127.25, 1)).toBe('127,3' + N + 'kg');
    expect(Modele.kgTexte(127.25, { decimales: 0 })).toBe('127' + N + 'kg');
    expect(Modele.kgTexte(0.3, { decimales: 2, fixe: true })).toBe('0,30' + N + 'kg');
    expect(Modele.kgTexte(0.5, { plus: true })).toBe('+0,5' + N + 'kg');
    expect(Modele.kgTexte(-0.5, { plus: true })).toBe(MOINS + '0,5' + N + 'kg');
    expect(Modele.kgTexte(0, { plus: true })).toBe('0' + N + 'kg');
  });
  test('l’arrondi est symétrique : −1,15 et +1,15 s’écrivent pareil', () => {
    expect(Modele.kgTexte(1.15, 1)).toBe('1,2' + N + 'kg');
    expect(Modele.kgTexte(-1.15, 1)).toBe(MOINS + '1,2' + N + 'kg');
  });
  test('la voix de la charge (`charge`) écrit par le même formateur', () => {
    expect(Modele.charge(127.25)).toBe(Modele.kgTexte(127.25));
    expect(Modele.charge(0.25)).toBe(Modele.kgTexte(0.25));
    expect(Modele.charge(-22.5)).toBe('Aide 22,5' + N + 'kg');
  });
  test('la charge d’une carte de l’année et de l’image de partage garde ses deux décimales', () => {
    const CAT = [{ slug: 'squat_barre', nom: 'Squat (Barre)', equipement: 'barre', mesure: 'charge_reps', muscles_primaires: ['quadriceps'], muscles_secondaires: [] }];
    const s = [{ id: 'a', jour: '2026-03-02', titre: 'Bas', series: [
      { id: 'a1', session_id: 'a', exercise_slug: 'squat_barre', charge_kg: 127.25, reps: 3, type_serie: 'travail', rang: 0 }] }];
    const b = Bilans.bilanDeLaPeriode({ periode: Bilans.periodeDeLAnnee(2026), aujourdhui: '2026-12-31', seances: s, exercices: CAT, pesees: [], paris: [] });
    const e = Annee.ecrans({ bilan: b, qui: 'aurel_br', jeu: null });
    const plaque = e.find((x) => x.cle === 'plaque').plaque;
    expect(JSON.stringify(plaque)).toContain('127,25' + N + 'kg');
    expect(JSON.stringify(plaque)).not.toMatch(/127,3/);
    const barres = e.find((x) => x.cle === 'barres');
    expect(barres.chiffre.v).toBe(127.25);
  });
});

describe('I198 — un volume s’écrit par `Modele.tonnesTexte` (F-01)', () => {
  test('les cas limites : 0, 50 kg, 1000, 12 345,6, 123 456, 1 234 567, vides', () => {
    expect(Modele.tonnesTexte(0)).toBe('0' + N + 't');
    expect(Modele.tonnesTexte(50)).toBe('0,1' + N + 't');
    expect(Modele.tonnesTexte(1000)).toBe('1' + N + 't');
    expect(Modele.tonnesTexte(12345.6)).toBe('12,3' + N + 't');
    expect(Modele.tonnesTexte(123456)).toBe('123,5' + N + 't');
    expect(Modele.tonnesTexte(1234567)).toBe('1' + F + '234,6' + N + 't');
    expect(Modele.tonnesTexte(null)).toBe('0' + N + 't');
    expect(Modele.tonnesTexte(NaN)).toBe('0' + N + 't');
    expect(Modele.tonnesTexte('abc')).toBe('0' + N + 't');
    expect(Modele.tonnesValeur(12345.6)).toBe(12.3);
    expect(Modele.tonnesValeur(123456)).toBe(123.5);
  });
  test('le signe d’un écart : le vrai signe moins', () => {
    expect(Modele.tonnesTexte(-12345.6)).toBe(MOINS + '12,3' + N + 't');
  });

  const CAT = [{ slug: 'squat_barre', nom: 'Squat (Barre)', equipement: 'barre', mesure: 'charge_reps', muscles_primaires: ['quadriceps'], muscles_secondaires: [] }];
  // Un mois de 12 345,6 kg exactement : 123,456 kg × 100 reps.
  const s = [{ id: 'm', jour: '2026-10-05', titre: 'Bas', series: [
    { id: 'm1', session_id: 'm', exercise_slug: 'squat_barre', charge_kg: 123.456, reps: 100, type_serie: 'travail', rang: 0 }] }];
  const bilan = Bilans.bilanDeLaPeriode({ periode: Bilans.periodeDuMois('2026-10'), aujourdhui: '2026-10-31', seances: s, exercices: CAT, pesees: [], paris: [] });

  test('le mois du bilan pèse 12 345,6 kg', () => {
    expect(bilan.tonnes.kg).toBeCloseTo(12345.6, 5);
  });
  test('la story du mois, la plaque, le gros chiffre : « 12,3 t », jamais « 12 t »', () => {
    const e = Annee.ecrans({ bilan, qui: 'aurel_br', jeu: null });
    const t = e.find((x) => x.cle === 'tonnes');
    expect(t.chiffre.v).toBe(12.3);
    expect(t.chiffre.unite).toBe('t');
    const tout = JSON.stringify(e);
    expect(tout).toContain('12,3' + N + 't');
    expect(tout).not.toMatch(/[^,\d]12(?:\\u00a0| ) ?t\b/);
  });
  test('la story de l’année pleine : 123 456 kg se lisent « 123,5 t », comme partout (plus de « 123 t »)', () => {
    const grosse = [{ id: 'g', jour: '2026-05-05', titre: 'Bas', series: [
      { id: 'g1', session_id: 'g', exercise_slug: 'squat_barre', charge_kg: 123.456, reps: 1000, type_serie: 'travail', rang: 0 }] }];
    const b = Bilans.bilanDeLaPeriode({ periode: Bilans.periodeDeLAnnee(2026), aujourdhui: '2026-12-31', seances: grosse, exercices: CAT, pesees: [], paris: [] });
    const e = Annee.ecrans({ bilan: b, qui: 'aurel_br', jeu: null });
    expect(e.find((x) => x.cle === 'tonnes').chiffre.v).toBe(123.5);
    expect(JSON.stringify(e.find((x) => x.cle === 'plaque').plaque)).toContain('123,5' + N + 't');
  });
  test('le récap d’une séance et le bilan : la même phrase de volume', () => {
    expect(Bilan.phraseComparaison(12345.6, 'x')).toMatch(/^12,3 t soulevées/);
    expect(Bilan.tonnesDuRecap).toBeUndefined();   // la copie est supprimée : `Modele.tonnesTexte` est la seule
  });
  test('la Progression : le bloc du mois dit le même texte que la story', () => {
    const cible = document.createElement('div');
    window.THRendu.rendreSommaire(cible, {
      mois: { titre: 'Octobre', kg: bilan.tonnes.kg, series: 40, records: 2, paris: { verifies: 0, tenus: 0 }, surChoix: () => {} },
      records: { dernier: null, surChoix: () => {} }, volume: { quand: '', zones: [], surChoix: () => {} },
      poids: { resume: null, surChoix: () => {} }, exercices: { quand: '', lignes: [] }
    });
    expect(cible.textContent).toContain('12,3' + N + 't soulevées');
  });
});

describe('I199 — le premier du mois s’écrit « 1er » (F-05)', () => {
  const PREMIER = new Date(2026, 10, 1, 12);
  const DEUX = new Date(2026, 10, 2, 12);
  test('`jourDit` : le premier, les autres, l’année, le mois long, le nom du jour', () => {
    expect(Modele.jourDit('2026-11-01')).toBe('1er' + N + 'nov.');
    expect(Modele.jourDit('2026-11-02')).toBe('2' + N + 'nov.');
    expect(Modele.jourDit('2026-11-10')).toBe('10' + N + 'nov.');
    expect(Modele.jourDit('2026-11-01', { annee: true })).toBe('1er' + N + 'nov.' + N + '2026');
    expect(Modele.jourDit('2025-11-01', { annee: 2026 })).toBe('1er' + N + 'nov.' + N + '2025');
    expect(Modele.jourDit('2026-11-01', { annee: 2026 })).toBe('1er' + N + 'nov.');
    expect(Modele.jourDit('2026-11-01', { mois: 'long' })).toBe('1er' + N + 'novembre');
    expect(Modele.jourDit('2026-11-01', { nom: true })).toBe('dimanche 1er' + N + 'nov.');
    expect(Modele.jourDit(PREMIER)).toBe('1er' + N + 'nov.');
    expect(Modele.jourDit('2026-03-01')).toBe('1er' + N + 'mars');
    expect(Modele.jourDit('n’importe quoi')).toBe('');
    expect(Modele.jourDit(null)).toBe('');
    expect(Modele.quantieme(1)).toBe('1er');
    expect(Modele.quantieme(21)).toBe('21');
  });
  test('tous les formateurs de date écrivent « 1er », jamais « 1 » ni « 01 »', () => {
    const textes = {
      jourMois: Modele.jourMois(PREMIER),
      jourMoisAnnee: Modele.jourMois(PREMIER, 2025),
      jourCourt: Modele.jourCourt('2026-11-01'),
      jourCourtDeNote: Modele.jourCourtDeNote('2026-11-01'),
      jourNomme: Modele.jourNomme('2026-11-01'),
      plageDeSeance: Modele.plageDeSeance(PREMIER.toISOString(), null),
      quand: Modele.quand(PREMIER.toISOString(), null),
      dateCourte: Modele.dateCourte(PREMIER.toISOString()),
      plageDeJours: Modele.plageDeJours('2026-11-01', '2026-11-08', '2026-11-15'),
      importJourEtHeure: Hevy.jourEtHeure('2026-11-01T09:05:00', 2026)
    };
    Object.keys(textes).forEach((k) => {
      expect(textes[k]).toMatch(/1er/);
      expect(textes[k]).not.toMatch(/(^|[^\d])0?1[\s ](?:nov|novembre)/);
      expect(textes[k]).not.toMatch(/\b01[\s ]nov/);
    });
    expect(Modele.jourMois(DEUX)).toBe('2' + N + 'nov.');
    expect(Modele.dateCourte(DEUX.toISOString())).toBe('2' + N + 'nov.' + N + '2026');
    expect(Modele.dateCourte(PREMIER.toISOString())).toBe('1er' + N + 'nov.' + N + '2026');
  });
  test('la story : la séance la plus lourde du 1er novembre', () => {
    const CAT = [{ slug: 'squat_barre', nom: 'Squat (Barre)', equipement: 'barre', mesure: 'charge_reps', muscles_primaires: ['quadriceps'], muscles_secondaires: [] }];
    const s = [{ id: 'p', jour: '2026-11-01', titre: 'Bas', series: [
      { id: 'p1', session_id: 'p', exercise_slug: 'squat_barre', charge_kg: 100, reps: 5, type_serie: 'travail', rang: 0 }] }];
    const b = Bilans.bilanDeLaPeriode({ periode: Bilans.periodeDeLAnnee(2026), aujourdhui: '2026-12-31', seances: s, exercices: CAT, pesees: [], paris: [] });
    const e = Annee.ecrans({ bilan: b, qui: 'aurel_br', jeu: null });
    expect(JSON.stringify(e.find((x) => x.cle === 'seance').txt)).toContain('1er' + N + 'novembre');
  });
});

describe('I200 — une durée s’écrit par `Modele.formatDuree` (F-10)', () => {
  test('les cas limites : 0, 45 s, 90 s, 750 s, 3 900 s, 6 h pile, vides', () => {
    expect(Modele.formatDuree(0)).toBe('0 s');
    expect(Modele.formatDuree(45)).toBe('45 s');
    expect(Modele.formatDuree(60)).toBe('1 min');
    expect(Modele.formatDuree(90)).toBe('1 min 30');
    expect(Modele.formatDuree(750)).toBe('12 min 30');
    expect(Modele.formatDuree(3900)).toBe('1 h 05');
    expect(Modele.formatDuree(21600)).toBe('6 h');
    expect(Modele.formatDuree(23715)).toBe('6 h 35');
    expect(Modele.formatDuree(null)).toBe('');
    expect(Modele.formatDuree(-5)).toBe('');
    expect(Modele.formatDuree(NaN)).toBe('');
  });
  test('l’heure du jour : « 9 h 05 »', () => {
    expect(Modele.heureDite(9, 5)).toBe('9 h 05');
    expect(Modele.heureDite(14, 27)).toBe('14 h 27');
  });
  test('la durée de la séance longue, le temps du bilan, la plage du récap : la même fonction', () => {
    expect(Seance.dureeDite(6 * 3600000)).toBe(Modele.formatDuree(6 * 3600));
    expect(Seance.dureeDite((9 * 60 + 42) * 60000)).toBe(Modele.formatDuree((9 * 60 + 42) * 60));
    expect(Bilan.texteTemps).toBeUndefined();   // la copie est supprimée : `Modele.dureeEnMinutes` est la seule
    expect(Modele.dureeEnMinutes(60)).toBe(Modele.formatDuree(3600));
    expect(Modele.dureeEnMinutes(725)).toBe(Modele.formatDuree(725 * 60));
    expect(Modele.dureeEnMinutes(45)).toBe('45 min');
    expect(Modele.dureeEnMinutes(0)).toBe('0 min');
    expect(Modele.dureeEnMinutes(null)).toBe('');
    const iso = new Date(2026, 10, 1, 14, 27).toISOString();
    expect(Modele.plageDeSeance(iso, new Date(2026, 10, 1, 15, 30).toISOString())).toContain(Modele.heureDite(14, 27) + ' → ' + Modele.heureDite(15, 30));
    expect(Modele.texteDePartage({ titre: 'Bas', duree_min: 45, series: 3, volume_texte: '1 t', records: [] })).toContain(Modele.formatDuree(45 * 60));
    expect(Modele.texteDePartage({ titre: 'Bas', duree_min: 63, series: 3, volume_texte: '1 t', records: [] })).toContain(Modele.formatDuree(63 * 60));
  });
});

describe('le pourcentage : « 71 % » (espace insécable)', () => {
  test('`pourcentTexte`', () => {
    expect(Modele.pourcentTexte(71)).toBe('71' + N + '%');
    expect(Modele.pourcentTexte(35.5, 1)).toBe('35,5' + N + '%');
    expect(Modele.pourcentTexte(0)).toBe('0' + N + '%');
    expect(Modele.pourcentTexte(null)).toBe('');
    expect(Modele.pourcentTexte(NaN)).toBe('');
  });
});
