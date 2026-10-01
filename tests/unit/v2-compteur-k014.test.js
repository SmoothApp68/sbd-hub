/** @jest-environment node */
//
// 49-29 — K014 : « plus long que d'habitude » avec les blocages CALCULÉS depuis
// les séances du cas (`blocages_termines: null`), comme l'app les calcule
// depuis son historique sous consigne.
//
// ⚠️ CE CAS ÉCHOUE, ET C'EST RAPPORTÉ (PR du second commit de 49-U13). La
// référence (`coach49.py`) compte trois séances qui suivent une séance SANS
// PALIER à plusieurs charges (30/08/2024, 13/09/2025, 23/09/2025) ; pour le
// moteur, la consigne de ces jours-là est un silence (`pas_de_palier`, MOTEUR
// §9), donc elles ne comptent pas. Il manque deux blocages courts : 6 au lieu
// de 8, et « plus long que d'habitude » ne se dit pas. Le fichier de cas fait
// foi : ce test reste tel quel jusqu'à ce que la référence ou le moteur soit
// tranché — il ne s'ajuste pas.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');

const c = require('./fixtures/cas-49u13-compteur.json').cas.filter((x) => x.id === 'K014')[0];
const octets = (s) => (s === null || s === undefined ? s : Buffer.from(s, 'utf8').toString('hex'));

describe('§12.9 — K014, les blocages calculés depuis les séances', () => {
  const r = M.compteurDe(c.seances, c.avant,
    { reglage: c.reglage, equipement: c.equipement, correction: null, toutes: true });

  test('le cas donne ses blocages à calculer (null), et les attend', () => {
    expect(c.blocages_termines).toBeNull();
    expect(c.attendu.blocages_calcules).toEqual([1, 2, 1, 1, 1, 4, 5, 1]);
  });

  test('le compteur et le meilleur à l’ouverture', () => {
    expect(r.compteur).toBe(c.attendu.compteur);
    expect([r.meilleur.palier, r.meilleur.niveau]).toEqual(c.attendu.meilleur);
  });

  test('les verdicts, à l’octet', () => {
    expect(JSON.stringify(r.verdicts)).toBe(JSON.stringify(c.attendu.verdicts));
  });

  test('les blocages calculés', () => {
    expect(r.blocages).toEqual(c.attendu.blocages_calcules);
  });

  test('la phrase, à l’octet (« plus long que d’habitude »)', () => {
    expect(octets(M.phraseCompteur(r))).toBe(octets(c.attendu.phrase));
  });
});
