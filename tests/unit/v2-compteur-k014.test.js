/** @jest-environment node */
//
// 49-29 — K014 : « plus long que d'habitude » avec les blocages CALCULÉS depuis
// les séances du cas (`blocages_termines: null`), comme l'app les calcule
// depuis son historique sous consigne.
//
// ⚠️ CE CAS ÉCHOUE ENCORE, ET C'EST RAPPORTÉ (#344). Le fichier de cas corrigé
// (`neutre` sur chaque séance) règle les trois pyramides ; il reste un écart
// de CONSIGNE entre le moteur et la référence (`coach49.py`) :
//   · 27/04/2025 — 17 jours après le 10/04 (écart habituel 5,4 j) : pour le
//     moteur (`repriseDe`), une reprise courte, donc une remise à zéro, et le
//     blocage en cours (1) se perd ; pour la référence, pas de reprise : un
//     progrès, qui termine ce blocage. C'est le blocage manquant (7 au lieu de 8).
//   · 03/10/2025 — consigne `rejoint` : le moteur propose 115 kg, la séance à
//     105 kg n'est pas suivie ; la référence la juge suivie (sans effet sur le
//     compteur ni les blocages).
// Le fichier de cas fait foi : ce test reste tel quel, à part des autres cas
// pour que leur base reste verte (mutations), jusqu'à ce que l'écart soit tranché.

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
