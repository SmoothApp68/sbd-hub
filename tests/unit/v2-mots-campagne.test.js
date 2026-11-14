/** @jest-environment node */
//
// « Les mots disent vrai » PR 4a (MOTEUR §9.47) — LA CAMPAGNE : 80 pratiquants × 12 semaines synthétiques (graine fixe), 880 séances-exercices, le coach
// rejoué séance après séance. Contrôle mécanique « phrase ↔ chiffre », au gris et au Pourquoi :
//   · « N reps de plus » seulement devant une ligne qui monte de N reps (avant la PR : 187 / 880 gris et 246 / 880 Pourquoi, soit 21 % et 28 %, le disaient
//     devant une ligne qui ne montait pas) ;
//   · « Tu restes à C × R » seulement devant la ligne C × R, qui garde ;
//   · aucun chiffre ne change : la ligne de chaque séance est celle d'avant la PR (instantané `verbe-4a-campagne.json`, relu une fois).
// L'INSTANTANÉ RELU : chaque phrase distincte (nombres et dates remplacés) est dans `verbe-4a-campagne.json`. Une phrase nouvelle fait échouer le test :
// on la relit, on l'ajoute — jamais un motif deviné.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/semaine.js');
const M = require('../../v2/js/moteur.js');
const INSTANTANE = require('./fixtures/verbe-4a-campagne.json');

const O = { mesure: 'charge_reps', equipement: 'poulie', intention: 'progresser', reglage: 'normal', edition: false };
const esp = (t) => String(t).replace(/[  ]/g, ' ');
const gabarit = (t) => esp(t).replace(/\d+(?:,\d+)?/g, 'N').replace(/(?:Le N \S+|Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche|Hier|Aujourd.hui)(?= :)/, 'D');

let g = 20261113;
const al = () => { g = (g * 1664525 + 1013904223) >>> 0; return g / 4294967296; };
let n = 0;
const groupes = (slug, seances) => seances.map((s, i) => ({ seance: { id: 'H' + i, debut: s[0], routine_id: 'R' },
  series: s[1].map((x) => ({ id: 'r' + (++n), rang: n, charge_kg: x[0], reps: x[1], rpe: null, ressenti: x[2] || null, type_serie: 'travail', exercise_slug: slug, au_max_reserve: null })) }));

function campagne() {
  const C = { seances: 0, gris_a_tort: 0, pourquoi_a_tort: 0, restes_a_tort: 0, nombre_a_tort: 0 };
  const lignes = [], gabarits = { gris: new Set(), pourquoi: new Set() };
  for (let a = 0; a < 80; a++) {
    const slug = ['rowing_poulie_assis', 'leg_curl_assis', 'elevation_laterale_poulie'][a % 3];
    const cap0 = 7 + Math.floor(al() * 4), charge = 40 + Math.floor(al() * 20) * 2.5, pFond = 0.2 + al() * 0.5;
    let cap = cap0;
    const hist = [];
    for (let s = 0; s < 12; s++) {
      const jour = new Date(Date.UTC(2026, 8, 1 + s * 7, 17)).toISOString();
      const r = M.consigneDExercice(groupes(slug, hist), undefined, jour, O);
      const c = r && r.consigne;
      if (!c || !c.ligne || c.ligne.vise === null || c.ligne.vise === undefined) { hist.push([jour, [[charge, cap], [charge, cap], [charge, cap - 1]]]); continue; }
      const ch = c.ligne.charge, cible = c.ligne.vise;
      const gris = esp(M.libellesConsigne(c, jour).gris);
      let pq = '';
      try { pq = esp(M.pourquoiConsigne(c, 'normal', jour, { sansDonc: true }).etat || ''); } catch (e) { pq = ''; }
      C.seances++;
      const meme = c.palier !== null && c.palier !== undefined && Math.abs(ch - c.palier) < 1e-6, niv = c.niveau;
      lignes.push(ch + 'x' + cible);
      gabarits.gris.add(gabarit(gris)); gabarits.pourquoi.add(gabarit(pq));
      if (meme && niv !== null && niv !== undefined) {
        const plus = cible - niv;
        const re = /(?:^|\. )(Une|Deux|Trois|\d+) reps? de plus\b/.exec(gris);
        if (re && plus < 1) C.gris_a_tort++;
        if (/je te demande (?:une|deux|trois|\d+) reps? de plus/.test(pq) && plus < 1) C.pourquoi_a_tort++;
        if (/\. Une rep de plus : /.test(gris) && plus !== 1) C.nombre_a_tort++;
        if (/Tu restes à /.test(gris + ' ' + pq) && plus !== 0 && !(c.etat === 'tenue_apres_chute')) C.restes_a_tort++;
      }
      if (al() < 0.3) cap++;
      const reps = Math.min(cible, cap);
      const nn = c.n || 3;
      const jr = [jour, Array.from({ length: nn }, (_, i) => [ch, Math.max(1, reps - (i === nn - 1 && al() < 0.3 ? 1 : 0)),
        i === nn - 1 ? (al() < pFond ? 'reste_0' : al() < 0.5 ? 'reste_1' : 'reste_2') : null])];
      hist.push(jr);
    }
  }
  return { C, lignes, gabarits };
}

describe('la campagne de 12 semaines : le verbe dit le chiffre, aucun chiffre ne change', () => {
  const R = campagne();
  test('880 séances-exercices, 0 phrase fausse au gris et au Pourquoi (avant : 187 et 246)', () => {
    expect(R.C.seances).toBe(880);
    expect(R.C).toEqual({ seances: 880, gris_a_tort: 0, pourquoi_a_tort: 0, restes_a_tort: 0, nombre_a_tort: 0 });
  });
  test('l’instantané relu : chaque gabarit de phrase est connu (un gabarit nouveau se relit, il ne se devine pas)', () => {
    const inconnus = ['gris', 'pourquoi'].map((k) => [...R.gabarits[k]].filter((t) => INSTANTANE[k].indexOf(t) < 0));
    expect(inconnus).toEqual([[], []]);
    ['gris', 'pourquoi'].forEach((k) => expect(INSTANTANE[k].filter((t) => !R.gabarits[k].has(t))).toEqual([]));
  });
  test('aucun chiffre ne change : la suite des lignes (charge × reps) de la campagne est celle de main, octet pour octet', () => {
    const h = require('crypto').createHash('sha256').update(R.lignes.join('|')).digest('hex').slice(0, 16);
    expect(h).toBe(INSTANTANE.empreinteDesLignes);
  });
});

module.exports = { campagne, gabarit };
