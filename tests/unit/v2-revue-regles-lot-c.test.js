/** @jest-environment node */
// Revue des règles (19/11/2026), lot C — deux phrases fausses relevées par le tour de table et confirmées par le contradicteur.
//  1. « Tes échelles cette semaine » lit la MÊME marche que la page de l'échelle (`objectif`, `ecartee` passés à `vueEchelle`).
//  2. « Pendant ce temps, X progresse » : entre deux zones, le palier doit avoir monté (MOTEUR §13.6).
global.self = global; process.env.TZ = 'Europe/Paris';
const Mo = require('../../v2/js/modele.js');
require('../../v2/js/palier.js'); require('../../v2/js/semaine.js'); require('../../v2/js/profil.js'); require('../../v2/js/periode.js');
const M = require('../../v2/js/moteur.js');

describe('la carte de la semaine dit la même marche que la page de l\'échelle', () => {
  const e = (slug, rang, habilete) => ({ slug, nom: slug, echelle: 'sq', echelle_rang: rang, nature: habilete ? 'habilete' : 'force',
    habilete: !!habilete, charge: 'aucune', mesure: 'reps' });
  const INDEX = { sq1: e('sq1', 1), sq2: e('sq2', 2), pistol: e('pistol', 3, true) };
  const faites = { sq2: { meilleur: '12 reps', quand: null, derniere: '2026-11-12' } };
  const phraseDe = (x) => M.phraseDeLaSuivante(Object.assign({}, x, { court: true, reglage: 'normal' }));
  const items = [{ echelle: 'sq', exercices: { sq2: { semaine: '12 reps', avant: null, reps: [12, 11, 10] } }, nouvelle: null }];
  test('objectif calisthénie : l\'habileté est proposée, la carte ne dit pas « je ne te la propose pas »', () => {
    const opt = { objectif: 'calisthenie', faites, zonesHaut: { sq2: 12 }, coachActif: true, phraseDe, rondsDe: () => [true, false] };
    expect(Mo.marcheSuivante(INDEX, 'sq2', { objectif: 'calisthenie' }).proposable).toBe(true);
    const suite = Mo.vueEchellesDeLaSemaine(INDEX, items, opt)[0].suite;
    expect(suite).not.toBeNull();
    expect(suite.phrase).not.toMatch(/je ne te la propose pas/i);
  });
  test('zone à ménager : une marche écartée triée en tête n\'est jamais nommée', () => {
    const ex = (slug, rang) => ({ slug, nom: slug, echelle: 'pompes', echelle_rang: rang, mesure: 'reps', charge: 'aucune', nature: 'force' });
    const I2 = { pompes: ex('pompes', 3), pompes_a_prise_serree: ex('pompes_a_prise_serree', 4), pompes_declinees: ex('pompes_declinees', 4) };
    const coude = (s) => /serree|diamant/.test(s);
    const f2 = { pompes: { meilleur: '20', derniere: '2026-11-12' } };
    const it2 = [{ echelle: 'pompes', exercices: { pompes: { semaine: '20 reps', avant: null, reps: [20] } }, nouvelle: null }];
    const v = Mo.vueEchellesDeLaSemaine(I2, it2, { ecartee: coude, faites: f2, zonesHaut: { pompes: 12 }, coachActif: true, phraseDe, rondsDe: () => [false, false] })[0];
    expect(JSON.stringify(v)).not.toMatch(/prise_serree/);
  });
});

describe('« X progresse » : entre deux zones, le palier doit avoir monté', () => {
  const bloque = { verdicts: [{ debut: '2026-10-01T10:00:00Z', progres: true }, { debut: '2026-10-08T10:00:00Z', progres: false }] };
  const frere = (avant, apres) => ({ id: 'f', nom: 'Frère', verdicts: [
    { debut: '2026-09-20T10:00:00Z', zone: avant.zone, progres: false, meilleur: { palier: avant.palier, niveau: avant.niveau } },
    { debut: '2026-10-15T10:00:00Z', zone: apres.zone, progres: true, remise_a_zero: true, meilleur: { palier: apres.palier, niveau: apres.niveau } }] });
  test('100 kg × 5 en Lourd → 80 kg × 10 en Hypertrophie : silence (avant : « progresse : 80 kg × 10 »)', () => {
    const f = M.frereQuiProgresse(bloque, [frere({ zone: 'lourd', palier: 100, niveau: 5 }, { zone: 'hypertrophie', palier: 80, niveau: 10 })], '2026-10-30T10:00:00Z');
    expect(f).toBeNull();
  });
  test('cas de référence F006 : 50 kg × 20 en Volume → 80 kg × 8 en Séries longues reste « progresse », sans flèche', () => {
    const f = M.frereQuiProgresse(bloque, [frere({ zone: 'volume', palier: 50, niveau: 20 }, { zone: 'series_longues', palier: 80, niveau: 8 })], '2026-10-30T10:00:00Z');
    expect(f).not.toBeNull();
    expect(f.avant).toBeNull();
    expect(f.maintenant.palier).toBe(80);
  });
});
