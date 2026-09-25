/** @jest-environment node */
//
// v2/js/moteur.js — la réaction série par série (MOTEUR §9.14, chantier 49,
// 49-R1) : `reactionPour`, `secondeCharge`, `sautsDeMontee`, `phraseReaction`.
//
// LE FICHIER DE CAS FAIT FOI. Il sort de la référence `banc_reaction49.py`
// (Claude.ai) : 53 cas de réaction rejoués sur de vraies séances, avec
// l'attendu APRÈS CHAQUE SÉRIE — de zéro série validée à toutes —, plus 17 cas
// de seconde charge et 6 d'extraction des sauts. Un cas qui semble faux se
// rapporte ; il ne se corrige pas ici.
//
// Les SEULES conversions que ce test s'autorise, toutes de forme et jamais de
// valeur :
//   · la consigne du fichier porte `zone: { nom, bas, haut }` ; `consignePour`
//     rend une CLÉ, et les bornes viennent de `ZONES`. Le test vérifie que les
//     bornes du fichier sont bien celles de la table avant de passer la clé ;
//   · les séries du fichier portent `charge`, celles du contrat `charge_kg` ;
//   · les phrases du fichier ont des espaces ordinaires, le moteur des
//     insécables autour du « × » et avant les deux-points (ECRAN-SAISIE,
//     §3.12) : on compare après les avoir ramenées à des espaces.

require('../../v2/js/palier.js');
require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');

const DONNEES = require('./fixtures/reaction-49r1.json');
const PRES = 1e-6;

function consigneDuCas(c) {
  const k = c.consigne;
  if (k.zone !== null) {
    const table = M.zoneParCle(k.zone.nom);
    expect(table).not.toBeNull();
    expect([table.bas, table.haut]).toEqual([k.zone.bas, k.zone.haut]);
  }
  return {
    etat: k.etat, zone: k.zone === null ? null : k.zone.nom, palier: k.palier,
    n: k.n, ligne: k.ligne, haut: k.haut
  };
}

const serie = (s) => ({ charge_kg: s.charge, reps: s.reps, rpe: s.rpe === undefined ? null : s.rpe,
  ressenti: null });

// Égalité profonde, les nombres à 1e-6 près.
function proche(vu, attendu, chemin) {
  if (typeof attendu === 'number') {
    expect(typeof vu).toBe('number');
    if (Math.abs(vu - attendu) > PRES) throw new Error(chemin + ' : ' + vu + ' ≠ ' + attendu);
    return;
  }
  if (attendu === null || typeof attendu !== 'object') {
    if (vu !== attendu) throw new Error(chemin + ' : ' + JSON.stringify(vu) + ' ≠ ' + JSON.stringify(attendu));
    return;
  }
  if (Array.isArray(attendu)) {
    if (!Array.isArray(vu) || vu.length !== attendu.length) {
      throw new Error(chemin + ' : longueur ' + JSON.stringify(vu) + ' ≠ ' + JSON.stringify(attendu));
    }
    attendu.forEach((a, i) => proche(vu[i], a, chemin + '[' + i + ']'));
    return;
  }
  if (vu === null || typeof vu !== 'object') throw new Error(chemin + ' : ' + JSON.stringify(vu) + ' n\'est pas un objet');
  const cles = Object.keys(attendu).sort();
  const vues = Object.keys(vu).sort();
  if (JSON.stringify(cles) !== JSON.stringify(vues)) {
    throw new Error(chemin + ' : clés ' + vues.join(',') + ' ≠ ' + cles.join(','));
  }
  cles.forEach((c) => proche(vu[c], attendu[c], chemin + '.' + c));
}

const espaces = (t) => (t === null ? null : t.replace(/ /g, ' '));

describe('§9.14 — reactionPour, rejouée série après série sur le fichier de cas', () => {
  test('le fichier porte 53 cas de réaction, 17 de seconde charge, 6 de sauts', () => {
    expect(DONNEES.reaction.length).toBe(53);
    expect(DONNEES.seconde_charge.length).toBe(17);
    expect(DONNEES.sauts_de_montee.length).toBe(6);
  });

  DONNEES.reaction.forEach((c) => {
    test(c.id + ' — ' + c.origine, () => {
      const consigne = consigneDuCas(c);
      const faites = c.faites.map(serie);
      expect(c.attendu.length).toBe(faites.length + 1);
      c.attendu.forEach((attendu, k) => {
        const vu = M.reactionPour(consigne, faites.slice(0, k), c.contexte);
        const sansPhrase = Object.assign({}, attendu);
        let phrase = null;
        if (attendu.message) {
          sansPhrase.message = Object.assign({}, attendu.message);
          phrase = sansPhrase.message.phrase;
          delete sansPhrase.message.phrase;
        }
        proche(vu, sansPhrase, c.id + '[' + k + ']');
        const dite = espaces(M.phraseReaction(vu.message, consigne.zone));
        expect(dite).toBe(phrase);
      });
    });
  });
});

describe('§9.14 — la réaction se tait par règle, pas par accident', () => {
  // DISCRIMINANT — une consigne de reprise PORTE `n`, une ligne et une zone
  // (`consignePour` les rend toujours) : seul l'état doit la faire taire.
  test('reprise courte, 3 reps de marge au palier : silence', () => {
    const consigne = { etat: 'reprise_courte', zone: 'hypertrophie', palier: 50, n: 3,
      ligne: { charge: 50, vise: 9 }, haut: null };
    const r = M.reactionPour(consigne, [{ charge_kg: 50, reps: 12 }], { cran: 52.5, haut: null });
    expect(r.message).toBeNull();
    expect(r.revision).toBe(0);
    expect(r.plan[1].source).toBe('consigne');
  });

  test('sans consigne (Entretenir, Édition) : un plan vide, rien à dire', () => {
    expect(M.reactionPour(null, [], {})).toEqual({ plan: [], message: null, attente: null, revision: 0 });
  });
});

describe('§9.14 — secondeCharge', () => {
  DONNEES.seconde_charge.forEach((c, i) => {
    test('C' + (i + 1) + ' — ' + c.origine, () => {
      const vu = M.secondeCharge({ palier: c.palier, cran: c.cran, cranSuivant: c.cran_suivant,
        sauts: c.sauts, charges: c.charges, programme: c.programme });
      proche(vu, c.attendu, 'C' + (i + 1));
    });
  });
});

describe('§9.14 — sautsDeMontee', () => {
  DONNEES.sauts_de_montee.forEach((c, i) => {
    test('S' + (i + 1) + ' — ' + c.origine, () => {
      const seances = c.seances.map((se) => ({ palier: se.palier,
        series: se.series.map((s) => ({ charge_kg: s.charge, role: s.role })) }));
      proche(M.sautsDeMontee(seances), c.attendu, 'S' + (i + 1));
    });
  });
});
