// 74 — « SANS MARGE » COMPTE SES REPS (MOTEUR §17.4, révisé le 11/10/2026).
//
// Une série à fond compte ses reps, partout ; après elle, le coach ne monte
// pas, et ne recule pas à cause d'elle : quatre plafonds contre le calcul
// prudent (68B : une rep de moins à fond), dans `consigneDExercice`.
//
// La référence : `fixtures/cas-74-reel.json`, 79 séance-exercices réels notés
// à fond, et leur consigne attendue (`aujourdhui_74`). Le même fichier porte
// celle de `main` avant la règle (`aujourdhui_main`) : `verif74.js` le
// vérifiait au commit 1 (0 écart).
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const P = require('../../v2/js/palier.js');
const D = require('./fixtures/cas-74-reel.json');

// Le harnais de `verif74.js`, tel quel : les séries du fichier, en groupes de
// l'app, et la consigne trois jours après la séance.
function consigneDuCas(c) {
  const ss = D.exercices[c.cle].seances.map((g) => ({
    seance: { id: g.id, debut: g.debut, fin: g.fin },
    series: g.series.map(([rang, type, ch, reps, rpe, res, dl]) => ({
      id: g.id + rang, rang, type_serie: type, charge_kg: ch, reps, rpe, ressenti: res, douleur: dl, validee_a: g.debut
    }))
  }));
  const mesure = ss.some((g) => g.series.some((s) => s.type_serie === 'travail' && s.charge_kg !== null))
    ? 'charge_reps' : 'reps';
  const avant = new Date(new Date(ss[c.jusqua].seance.debut).getTime() + 86400000 * 3).toISOString();
  const r = M.consigneDExercice(ss.slice(0, c.jusqua + 1), null, avant,
    { mesure, reglage: c.cle.startsWith('u1') ? 'franc' : 'normal' }).consigne;
  return { etat: r.etat, zone: r.zone, palier: r.palier, niveau: r.niveau, ligne: r.ligne,
           haut: r.haut && { charge: r.haut.charge, vise: r.haut.vise, k: r.haut.k } };
}
const cas = (cle, jusqua) => D.cas.filter((c) => c.cle === cle && c.jusqua === jusqua)[0];

describe('74 — la concordance sur les 79 séance-exercices réels', () => {
  test('le fichier : 79 cas, chacun noté à fond sur sa dernière séance', () => {
    expect(D.cas).toHaveLength(79);
    D.cas.forEach((c) => {
      const g = D.exercices[c.cle].seances[c.jusqua];
      expect([c.cle, g.series.some((s) => s[4] === 10 || s[5] === 'reste_0')]).toEqual([c.cle, true]);
    });
  });

  test('0 écart avec `aujourdhui_74` (état, zone, palier, niveau, ligne, haut)', () => {
    const ecarts = D.cas
      .map((c) => ({ c, r: consigneDuCas(c) }))
      .filter(({ c, r }) => JSON.stringify(r) !== JSON.stringify(c.aujourdhui_74))
      .map(({ c, r }) => c.cle + '#' + c.jusqua + ' : ' + JSON.stringify(r));
    expect(ecarts).toEqual([]);
  });

  // Le témoin : la règle change bien quelque chose — sans elle, le calcul de
  // `main` diffère de la référence sur la majorité des cas.
  test('témoin : `aujourdhui_main` et `aujourdhui_74` diffèrent sur 53 cas', () => {
    const differents = D.cas.filter((c) => JSON.stringify(c.aujourdhui_main) !== JSON.stringify(c.aujourdhui_74));
    expect(differents).toHaveLength(53);
  });
});

describe('74 — les exemples du MOTEUR §17.4', () => {
  test('couché 01/09/2026, test 125 × 3 à RPE 10 : le test est gardé à 125 × 3 (plus d’étirement à 122,5)', () => {
    const c = cas('u1|developpe_couche_barre', 34);
    expect(D.exercices[c.cle].seances[34].debut.slice(0, 10)).toBe('2026-09-01');
    const r = consigneDuCas(c);
    expect([r.etat, r.haut]).toEqual(['garde', { charge: 125, vise: 3, k: 1 }]);
    expect(c.aujourdhui_main.etat).toBe('etirement');
  });

  test('soulevé 10/01/2026, 160 × 3 à RPE 10 : le test est gardé à 160 × 3 (plus de retest à 145)', () => {
    const c = cas('u1|souleve_de_terre_barre', 13);
    const r = consigneDuCas(c);
    expect([r.etat, r.haut]).toEqual(['garde', { charge: 160, vise: 3, k: 1 }]);
    expect(c.aujourdhui_main.haut).toEqual({ charge: 145, vise: 3, k: 1 });
  });

  test('couché 08/09/2026, 122,5 × 6, 5, 5 à RPE 10 : niveau 5 (68B : 4), sans test proposé', () => {
    const c = cas('u1|developpe_couche_barre', 35);
    const r = consigneDuCas(c);
    expect([r.niveau, r.haut]).toEqual([5, null]);
    expect(c.aujourdhui_main.niveau).toBe(4);
  });
});

describe('74 — les plafonds, sur une ligne de 80 kg en zone Volume', () => {
  const se = (j, series) => ({ debut: '2026-09-' + j + 'T17:00:00+00:00', palier: 80, series });
  const p = (kg, r, rpe) => ({ charge_kg: kg, reps: r, rpe: rpe === undefined ? null : rpe, role: 'palier' });
  const ex = (kg, r, rpe) => ({ charge_kg: kg, reps: r, rpe: rpe === undefined ? null : rpe, role: 'exploration' });
  const H = [se('01', [p(80, 10), p(80, 10), p(80, 10)]), se('08', [p(80, 10), p(80, 10), p(80, 10)])];
  const pour = (derniere) => M.consigneApresAFond(H.concat([se('15', derniere)]), '2026-09-20T17:00:00+00:00',
    { reglage: 'normal', equipement: 'barre', correction: null });

  test('80 × 10, 10, 10 à fond : 80 × 10 visé (pas 11), niveau 10', () => {
    const k = pour([p(80, 10, 10), p(80, 10, 10), p(80, 10, 10)]);
    expect([k.etat, k.niveau, k.ligne]).toEqual(['progression', 10, { charge: 80, vise: 10 }]);
  });

  test('témoins : sans effort noté, ou à RPE 9,5, la rep de plus — les plafonds ne jouent que sur une série à fond', () => {
    expect(pour([p(80, 10), p(80, 10), p(80, 10)]).ligne).toEqual({ charge: 80, vise: 11 });
    expect(pour([p(80, 10, 9.5), p(80, 10, 9.5), p(80, 10, 9.5)]).ligne).toEqual({ charge: 80, vise: 11 });
  });

  test('une charge plus légère n’est pas plafonnée : 100 × 3 à fond ne ramène pas la visée de 80 kg × 10', () => {
    expect(pour([p(80, 10), p(80, 10), p(80, 10), ex(100, 3, 10)]).ligne).toEqual({ charge: 80, vise: 11 });
  });

  test('le calcul prudent n’existe qu’à un endroit : `repsPrudentes`, et `repsComptees` rend les reps faites', () => {
    expect(P.repsPrudentes({ reps: 10, rpe: 10 })).toBe(9);
    expect(P.repsComptees({ reps: 10, rpe: 10 })).toBe(10);
  });
});
