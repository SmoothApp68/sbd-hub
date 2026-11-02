/** @jest-environment node */
//
// 228 — LA GROSSE SÉRIE D'UN BLOC HYPERTROPHIE se suit sur UNE série (MOTEUR §19.2, amendement 228). Constat du 02/11 :
// le couché d'Aurélien (130 × 5, 130 × 4, 132,5 × 3, 132,5 × 3, réglage Franc) recevait l'escalier de plusieurs séries
// (« tes séries restées à 130 kg passeront une à une », une ligne « test » à garde 0) et « Ta zone : Lourd, choisie par toi ».

process.env.TZ = 'Europe/Paris';
require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');

const debut = new Date(Date.UTC(2026, 9, 19, 17)).toISOString();
const serie = (j, kg, reps) => ({ id: 's' + j, charge_kg: kg, reps: reps, rpe: null, ressenti: null, type_serie: 'travail', validee_a: debut });
const HISTOIRE = [{ seance: { id: 'A', debut: debut },
  series: [serie(0, 130, 5), serie(1, 130, 4), serie(2, 132.5, 3), serie(3, 132.5, 3)] }];
const AVANT = new Date(Date.UTC(2026, 10, 2, 17)).toISOString();
const BASE = { mesure: 'charge_reps', reglage: 'franc', equipement: 'barre', intention: 'progresser', correction: 'lourd' };
const calcul = (plus) => M.consigneDExercice(HISTOIRE, null, AVANT, Object.assign({}, BASE, plus || {})).consigne;

describe('228 — la grosse série du bloc Hypertrophie', () => {
  test('DISCRIMINANT — sans la grosse série, l’escalier de plusieurs séries (le défaut vu sur le téléphone)', () => {
    const k = calcul();
    expect(k.n).toBeGreaterThan(1);
  });
  test('avec la grosse série : une seule série suivie, la plus lourde (132,5 kg), pas de séries « restées »', () => {
    const k = calcul({ grosseSerie: true });
    expect(k.n).toBe(1);
    expect(JSON.stringify(k)).not.toMatch(/130(\.0)?[,}]/);
  });
  test('le Pourquoi dit le bloc, pas « choisie par toi »', () => {
    const k = calcul({ grosseSerie: true });
    expect(k.fondement.grosseSerie).toBe(true);
    const texte = JSON.stringify(M.pourquoiConsigne(k, 'franc', AVANT));
    expect(texte).toMatch(/bloc Hypertrophie/);
    expect(texte).not.toMatch(/choisie par toi|une à une/);
  });
});
