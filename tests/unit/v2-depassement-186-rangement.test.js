/** @jest-environment node */
//
// 186 — LE PLAFOND DU DÉPASSEMENT EST CELUI DU RANGEMENT (MOTEUR §9.1.2, delta du 26/11/2026).
//
// 186 : « les reps au-dessus du haut de la zone ne comptent dans l'habitude que jusqu'au haut ; la zone ne bascule plus seule sur un
// dépassement ». Mais `RANGEMENT` range le haut de Mix (8) en Hypertrophie et celui d'Hypertrophie (10) en Volume : plafonnée au haut,
// l'habitude 7 devenait 8 en atteignant son haut, la zone DÉDUITE changeait parce que la personne avait fait ce qu'on lui demandait, et
// la cible continuait de monter à charge plate. Le plafond est maintenant le plus haut nombre de reps que le rangement range encore
// dans la zone (Mix 7, Hypertrophie 9 ; Lourd 5, Volume 12 et Séries longues 20 inchangés). Une zone CHOISIE ne passe pas par là.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
const M = require('../../v2/js/moteur.js');

let n = 0;
const brute = (kg, reps) => ({ id: 'r' + (++n), rang: n, charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: 'sq' });
const OPTIONS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false };
const jourN = (i) => new Date(Date.UTC(2026, 8, 1 + i * 3, 18)).toISOString();
const groupes = (liste) => liste.map(([kg, reps], i) => ({ seance: { id: 'H' + i, debut: jourN(i) },
  series: [reps, reps, reps].map((r) => brute(kg, r)) }));
const avantDe = (liste) => new Date(Date.parse(jourN(liste.length - 1)) + 3 * 864e5).toISOString();
const toutes = (liste) => liste.map((_, i) => 'H' + i);
const lire = (liste, o) => M.consigneDExercice(groupes(liste), undefined, avantDe(liste), Object.assign({}, OPTIONS, o || {}));
const sousConsigne = (liste, o) => lire(liste, Object.assign({ seancesSousConsigne: toutes(liste) }, o || {}));
// `k` séances à `a` reps, puis `m` séances à `b` reps, toutes à 40 kg.
const histoire = (a, k, b, m) => [].concat(Array.from({ length: k }, () => [40, a]), Array.from({ length: m }, () => [40, b]));

describe('186 (rangement) — la zone déduite ne change pas parce que la personne a atteint son haut', () => {
  test('DISCRIMINANT — Mix : sept reps, puis huit (le haut de Mix) cinq fois sous consigne : la zone reste Mix', () => {
    const c = sousConsigne(histoire(7, 3, 8, 5));
    expect(c.consigne.zone).toBe('mix');
    expect(c.consigne.etat).not.toBe('nouvelle_zone');
  });

  test('DISCRIMINANT — Hypertrophie : neuf reps, puis dix (le haut d’Hypertrophie) cinq fois sous consigne : la zone reste Hypertrophie', () => {
    const c = sousConsigne(histoire(9, 3, 10, 5));
    expect(c.consigne.zone).toBe('hypertrophie');
    expect(c.consigne.etat).not.toBe('nouvelle_zone');
  });

  test('DISCRIMINANT — à charge plate, la visée ne dépasse jamais le haut de la zone en vigueur (Mix 8, Hypertrophie 10)', () => {
    [[7, 8, 'mix'], [9, 10, 'hypertrophie']].forEach(([a, b, zone]) => {
      const c = sousConsigne(histoire(a, 3, b, 8));
      expect(c.consigne.zone).toBe(zone);
      expect(c.consigne.ligne.vise).toBeLessThanOrEqual(b);
    });
  });

  test('la grille : pour chaque zone, trois séances dans son rangement puis cinq à son haut prescrit, sous consigne : la zone ne bouge jamais', () => {
    // [reps du rangement, haut prescrit, zone] — le plafond est le plus haut nombre que RANGEMENT range encore dans la zone.
    [[4, 5, 'lourd'], [7, 8, 'mix'], [9, 10, 'hypertrophie'], [11, 12, 'volume'], [15, 20, 'series_longues']].forEach(([a, b, zone]) => {
      for (let m = 1; m <= 6; m++) {
        const c = sousConsigne(histoire(a, 3, b, m));
        expect(c.consigne.zone).toBe(zone);
      }
    });
  });

  test('SANS consigne, l’habitude installée range toujours l’exercice (186 : « une habitude installée sans consigne se compte entière »)', () => {
    const c = lire(histoire(7, 3, 8, 8));
    expect(c.consigne.zone).toBe('hypertrophie');
  });

  test('une zone CHOISIE garde ses règles : la correction Mix reste Mix, Hypertrophie reste Hypertrophie, le haut est celui de la zone choisie', () => {
    const mix = sousConsigne(histoire(7, 3, 8, 5), { correction: 'mix' });
    expect(mix.consigne.zone).toBe('mix');
    expect(mix.consigne.ligne.vise).toBeLessThanOrEqual(8);
    const hyp = sousConsigne(histoire(9, 3, 10, 5), { correction: 'hypertrophie' });
    expect(hyp.consigne.zone).toBe('hypertrophie');
    expect(hyp.consigne.ligne.vise).toBeLessThanOrEqual(10);
    // Une correction posée SUR une habitude qui range ailleurs : la zone choisie l'emporte, comme avant.
    const choisie = sousConsigne(histoire(11, 3, 12, 5), { correction: 'mix' });
    expect(choisie.consigne.zone).toBe('mix');
  });
});
