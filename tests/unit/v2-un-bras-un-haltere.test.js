/** @jest-environment node */
//
// 16/11/2026 (décision d'Aurélien) — À UN BRAS, LA CHARGE NOTÉE EST L'HALTÈRE TENU, pas la paire (MOTEUR §10.1).
// Une notion (`Modele.unSeulHaltere`, une liste NOMMÉE de slugs), un matériel effectif du moteur (`haltere_seul`), ses lecteurs :
// l'aide sous le champ de charge, le cran (la moitié de la paire), les chauffes, la phrase « ton haltère », la saisie vérifiée.
// Les exercices « Une Jambe » aux haltères et les exercices à deux bras gardent la paire.

process.env.TZ = 'Europe/Paris';
global.self = global;
const M = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/bilan.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/periode.js');
const Mo = require('../../v2/js/moteur.js');
require('../../v2/js/seance.js');
const Faits = require('../../v2/js/faits.js').creer();

const UN_BRAS = ['rowing_haltere', 'developpe_couche_un_bras_haltere', 'developpe_militaire_un_bras_haltere',
  'elevation_laterale_un_bras_haltere', 'extension_triceps_dessus_tete_un_bras_haltere'];
const haltere = (slug, nom) => ({ slug, nom: nom || slug, equipement: 'haltere', mesure: 'charge_reps' });

describe('la notion : un exercice aux haltères fait à un bras', () => {
  test('les cinq variantes du catalogue, par leur slug', () => {
    expect(M.EXERCICES_A_UN_SEUL_HALTERE).toEqual(UN_BRAS);
    UN_BRAS.forEach((s) => expect(M.unSeulHaltere(haltere(s))).toBe(true));
  });
  test('« Une Jambe » aux haltères, les deux bras et l’absence d’exercice : non', () => {
    ['hip_thrust_une_jambe_haltere', 'souleve_de_terre_une_jambe_haltere', 'extension_mollets_une_jambe_haltere', 'curl_biceps_haltere',
      'developpe_couche_haltere', 'rowing_penche_haltere', 'rowing_kroc_haltere'].forEach((s) => expect(M.unSeulHaltere(haltere(s))).toBe(false));
    expect(M.unSeulHaltere(null)).toBe(false);
    expect(M.unSeulHaltere({ equipement: 'haltere' })).toBe(false);
  });
  test('le nom ne décide rien : « Un Bras » dans un nom sans le slug ne suffit pas', () => {
    expect(M.unSeulHaltere(haltere('curl_x', 'Curl Un Bras (Haltère)'))).toBe(false);
  });
  test('chargeEstLaPaire : faux à un bras, vrai pour une jambe et deux bras', () => {
    expect(M.chargeEstLaPaire(haltere('rowing_haltere'))).toBe(false);
    expect(M.chargeEstLaPaire(haltere('hip_thrust_une_jambe_haltere'))).toBe(true);
    expect(M.chargeEstLaPaire(haltere('curl_biceps_haltere'))).toBe(true);
    expect(M.chargeEstLaPaire({ equipement: 'barre' })).toBe(false);
  });
});

describe('l’aide sous le champ de charge', () => {
  const aide = (e) => M.grilleDe(e, false).aide;
  test('à un bras : « kg, l’haltère »', () => {
    UN_BRAS.forEach((s) => expect(aide(haltere(s))).toBe('kg, l’haltère'));
    expect(M.AIDE_DE_L_HALTERE).toBe('kg, l’haltère');
  });
  test('une jambe, deux bras : « kg, les deux haltères » inchangé ; une barre : rien', () => {
    expect(aide(haltere('hip_thrust_une_jambe_haltere'))).toBe('kg, les deux haltères');
    expect(aide(haltere('curl_biceps_haltere'))).toBe('kg, les deux haltères');
    expect(aide({ slug: 'squat_barre', equipement: 'barre', mesure: 'charge_reps' })).toBeUndefined();
  });
});

describe('le matériel effectif du moteur et le cran (la moitié de la paire)', () => {
  test('equipementEffectif : haltere_seul à un bras, haltere sinon', () => {
    expect(Mo.equipementEffectif(haltere('rowing_haltere'))).toBe(Mo.EQUIPEMENT_HALTERE_SEUL);
    expect(Mo.equipementEffectif(haltere('curl_biceps_haltere'))).toBe('haltere');
    expect(Mo.equipementEffectif(haltere('hip_thrust_une_jambe_haltere'))).toBe('haltere');
  });
  const dessus = (eq, p) => Mo.chargeVoisine([], '2026-10-20T10:00:00+00:00', p, eq, 1);
  const dessous = (eq, p) => Mo.chargeVoisine([], '2026-10-20T10:00:00+00:00', p, eq, -1);
  test('après 14 kg, le coach propose 16 kg (un haltère), pas 2 × 16 = 32 ; le cran est le pas du matériel, 2 kg au-delà de 10', () => {
    expect(dessus('haltere_seul', 14)).toBe(16);
    expect(dessus('haltere_seul', 15)).toBe(17);     // un pas de 2 depuis la charge, comme 30 → 34 pour la paire
    expect(dessus('haltere_seul', 9)).toBe(10);      // 1 kg jusqu'à 10
    expect(dessus('haltere_seul', 10)).toBe(12);     // puis 2 kg
    expect(dessus('haltere_seul', 56)).toBe(58);
  });
  test('vers le bas, la même échelle', () => {
    expect(dessous('haltere_seul', 16)).toBe(14);
    expect(dessous('haltere_seul', 10)).toBe(9);
    expect(dessous('haltere_seul', 9)).toBe(8);
  });
  test('la paire est inchangée : 18 → 20, 20 → 24, 24 → 28', () => {
    expect(dessus('haltere', 18)).toBe(20);
    expect(dessus('haltere', 20)).toBe(24);
    expect(dessus('haltere', 24)).toBe(28);
  });
  test('la charge n’est jamais « approchée » à tort : le repli existe pour haltere_seul', () => {
    expect(Mo.REPLI_MATERIEL.haltere_seul).toEqual({ pas: 1, pasLourd: 2, bascule: 10 });
  });
});

describe('les phrases et la saisie', () => {
  test('la baisse après un raté à un bras tombe sur le cran d’un haltère (1 kg sous 10, 2 au-delà)', () => {
    const d = Mo.reactionAuRate({ niveau: 'serie', role: 'travail', charge: 40, reps: 6, vise: 10, bas: 8, haut: 12, rang: 1, derniere: false,
      reglage: 'normal', objectif: 'les_deux', barre: false, materiel: 'haltere_seul', chauffeValidee: true, reposReel: 120, reposCible: 120 });
    expect(d.charge.action).toBe('baisse');
    expect(d.charge.kg).toBeLessThan(40);
  });
  const serie = (kg, reps) => ({ charge_kg: kg, reps, type_serie: 'travail' });
  const seance = (kg) => ({ series: [serie(kg, 10), serie(kg, 10), serie(kg, 10)] });
  const H = [seance(20), seance(22), seance(20), seance(20)];
  const v = (kg, eq) => Faits.vraisemblanceDeLaSerie({ charge: kg, reps: 10, equipement: eq }, { historique: H });
  test('une hausse au-dessus de +15 % : à un bras le seuil absolu est 2 kg (la moitié de la paire), pas 4', () => {
    // meilleur 22 : +15 % = 25,3. 25 → pas de question ; 26 : +4 kg (au-dessus de 2 et de 4) → question dans les deux cas ;
    // 25,5 : +3,5 kg, au-dessus de +15 % : une question à un bras (seuil 2), aucune pour la paire (seuil 4).
    expect(v(25.5, 'haltere_seul') && v(25.5, 'haltere_seul').genre).toBe('hausse');
    expect(v(25.5, 'haltere')).toBeNull();
    expect(v(24, 'haltere_seul')).toBeNull();        // sous +15 % : rien
  });
});
