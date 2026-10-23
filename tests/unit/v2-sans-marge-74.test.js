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
  const x = calculDuCas(c);
  const r = x.k;
  return { etat: r.etat, zone: r.zone, palier: r.palier, niveau: r.niveau, ligne: r.ligne,
           haut: r.haut && { charge: r.haut.charge, vise: r.haut.vise, k: r.haut.k } };
}
// La consigne brute du cas, avec sa référence de dates et son réglage : de
// quoi rédiger l'en-tête et la feuille « Pourquoi ».
function calculDuCas(c) {
  const ss = D.exercices[c.cle].seances.map((g) => ({
    seance: { id: g.id, debut: g.debut, fin: g.fin },
    series: g.series.map(([rang, type, ch, reps, rpe, res, dl]) => ({
      id: g.id + rang, rang, type_serie: type, charge_kg: ch, reps, rpe, ressenti: res, douleur: dl, validee_a: g.debut
    }))
  }));
  const mesure = ss.some((g) => g.series.some((s) => s.type_serie === 'travail' && s.charge_kg !== null))
    ? 'charge_reps' : 'reps';
  const avant = new Date(new Date(ss[c.jusqua].seance.debut).getTime() + 86400000 * 3).toISOString();
  const reglage = c.cle.startsWith('u1') ? 'franc' : 'normal';
  const k = M.consigneDExercice(ss.slice(0, c.jusqua + 1), null, avant, { mesure, reglage }).consigne;
  return { k, avant, reglage };
}
const esp = (t) => String(t).replace(/[\u00a0\u202f]/g, ' ');
const phrasesDuCas = (c) => {
  const x = calculDuCas(c);
  return { gris: esp(M.libellesConsigne(x.k, x.avant).gris), etat: esp(M.pourquoiConsigne(x.k, x.reglage, x.avant).etat),
           tout: esp(JSON.stringify([M.libellesConsigne(x.k, x.avant), M.pourquoiConsigne(x.k, x.reglage, x.avant)])) };
};
const cas = (cle, jusqua) => D.cas.filter((c) => c.cle === cle && c.jusqua === jusqua)[0];

describe('74 — la concordance sur les 79 séance-exercices réels', () => {
  test('le fichier : 79 cas, chacun noté à fond sur sa dernière séance', () => {
    expect(D.cas).toHaveLength(79);
    D.cas.forEach((c) => {
      const g = D.exercices[c.cle].seances[c.jusqua];
      expect([c.cle, g.series.some((s) => s[4] === 10 || s[5] === 'reste_0')]).toEqual([c.cle, true]);
    });
  });

  // 149 (23/10/2026, décision d'Aurélien, 13 h 10) — EN FRANC, UNE SÉANCE SUFFIT à la carte du lest : le cas
  // `u1|releve_de_genoux_suspendu#7` (réglage franc, poids du corps, 12 reps à la dernière séance seulement) passe de
  // `etirement_reps` à `carte_lest`. Le fichier de référence ne se retouche pas ; l'écart est nommé ici, à sa valeur
  // exacte — un autre écart, ou celui-ci autrement, fait échouer le test.
  // 152 (23/10/2026, décision d'Aurélien) — UNE SÉRIE `echec` À 1 REP OU PLUS EST UNE SÉRIE DE TRAVAIL À FOND : elle entre
  // dans le palier. Deux cas du fichier portent une telle série (squat #14 : 130 × 1 à l'échec ; militaire #9 n'en porte pas
  // lui-même mais son historique, oui) ; leurs consignes bougent, à leur valeur exacte. Le fichier de référence ne se retouche pas.
  const ECHEC_152 = {
    'u1|squat_barre#14': { etat: 'progression', zone: 'lourd', palier: 130, niveau: 1, ligne: { charge: 130, vise: 2 }, haut: null },
    'u1|developpe_militaire_barre#9': { etat: 'nouvelle_zone', zone: 'volume', palier: 52.5, niveau: 9, ligne: { charge: 47.5, vise: 10 }, haut: null }
  };
  const FRANC_149 = {
    'u1|releve_de_genoux_suspendu#7': { etat: 'carte_lest', zone: 'volume', palier: 0, niveau: 12,
      ligne: { charge: 0, vise: 12 }, haut: null }
  };
  test('0 écart avec `aujourdhui_74` (état, zone, palier, niveau, ligne, haut)', () => {
    const attendu = (c) => ECHEC_152[c.cle + '#' + c.jusqua] || FRANC_149[c.cle + '#' + c.jusqua] || c.aujourdhui_74;
    const ecarts = D.cas
      .map((c) => ({ c, r: consigneDuCas(c) }))
      .filter(({ c, r }) => JSON.stringify(r) !== JSON.stringify(attendu(c)))
      .map(({ c, r }) => c.cle + '#' + c.jusqua + ' : ' + JSON.stringify(r));
    expect(ecarts).toEqual([]);
  });

  // Le témoin : la règle change bien quelque chose — sans elle, le calcul de
  // `main` diffère de la référence sur la majorité des cas.
  test('témoin : `aujourdhui_main` et `aujourdhui_74` diffèrent sur 53 cas', () => {
    const differents = D.cas.filter((c) => JSON.stringify(c.aujourdhui_main) !== JSON.stringify(c.aujourdhui_74));
    expect(differents).toHaveLength(53);
  });

  // Retouche 74 (12/10/2026) — la limite 2 vaut aussi pour un test sans charge
  // chiffrée : c'est un cran au-dessus, plus lourd que tout ce qui a été fait.
  test('limite 2 : un test « au cran du dessus » sans charge est plus lourd — curl poignets 12/09, rowing divergent 10/10', () => {
    const curl = cas('u1|curl_poignets_paumes_vers_le_haut_assis', 11);
    const rowing = cas('u1|rowing_divergent_un_bras_machine', 5);
    expect(D.exercices[curl.cle].seances[11].debut.slice(0, 10)).toBe('2026-09-12');
    expect(D.exercices[rowing.cle].seances[5].debut.slice(0, 10)).toBe('2026-10-10');
    expect(consigneDuCas(curl)).toMatchObject({ etat: 'progression', haut: null, ligne: { charge: 20, vise: 16 } });
    expect(consigneDuCas(rowing)).toMatchObject({ etat: 'progression', haut: null, ligne: { charge: 81.3, vise: 12 } });
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

// Retouche 74 (12/10/2026) — la feuille « Pourquoi » dit les reps faites.
describe('74 — les phrases : plus aucun « compté », « sans marge » pour un test fait à fond', () => {
  // Les cinq cas réels qui disaient « compté N » après la règle 74. La forme
  // du test fait à fond : « Ton test : {charge} × {reps}, sans marge. », puis la
  // suite en phrase séparée — sans « à RPE 10 ».
  const CINQ = [
    ['u1|presse_a_cuisses', 19, 'Ton test : 285,7 kg × 12, sans marge. '],
    ['u1|presse_a_cuisses', 22, 'Ton test : 295,7 kg × 12, sans marge. '],
    ['u1|developpe_couche_barre', 13, 'Ton test : 125 kg × 4, sans marge. '],
    ['u1|extensions_une_jambe', 9, 'Ton test : 54,6 kg × 12, sans marge. '],
    ['u1|leg_curl_allonge_machine', 9, 'Ton test : 50 kg × 12, sans marge. ']
  ];

  test('les cinq cas réels : « Ton test : {charge} × {reps}, sans marge. » puis la suite, plus « compté N »', () => {
    CINQ.forEach(([cle, j, debut]) => {
      const p = phrasesDuCas(cas(cle, j));
      expect([cle, j, p.etat.startsWith(debut)]).toEqual([cle, j, true]);
      expect([cle, j, /compté/.test(p.tout)]).toEqual([cle, j, false]);
    });
    expect(esp(phrasesDuCas(cas('u1|presse_a_cuisses', 19)).etat)).toBe('Ton test : 285,7 kg × 12, sans marge. ' +
      'Dans ta zone : il gagne une série. La nouvelle charge gagne tes séries une par séance, de la dernière à la première.');
  });

  test('sur les 79 cas, aucune phrase de test ne dit « à RPE 10 »', () => {
    const avec = D.cas.filter((c) => /Ton test[^"]*à RPE/.test(phrasesDuCas(c).tout)).map((c) => c.cle + '#' + c.jusqua);
    expect(avec).toEqual([]);
  });

  test('sur les 79 cas, aucune phrase ne dit « compté »', () => {
    const avec = D.cas.filter((c) => /compté/.test(phrasesDuCas(c).tout)).map((c) => c.cle + '#' + c.jusqua);
    expect(avec).toEqual([]);
  });

  // L'adduction du 15/09 (cas 12) : 73 × 20, 20, 15 à RPE 10. Le calcul prudent
  // y voit une chute (19, 19, 14), pas les reps faites (−5, 25 %) : la ligne
  // 73 × 17 compte la dernière série, et la phrase le dit.
  test('l’adduction (cas 12) : plus « Je ne compte pas la dernière série » pour une ligne qui la compte', () => {
    const c = cas('u1|adduction_hanche', 12);
    expect(consigneDuCas(c)).toMatchObject({ etat: 'tenue_apres_chute', niveau: 16, ligne: { charge: 73, vise: 17 } });
    const p = phrasesDuCas(c);
    expect(p.gris).toMatch(/: 73 kg × 20, 20, 15\. Une rep de plus\.$/);
    expect(p.etat).toBe('Ta charge de travail n\'est pas encore au haut de ta zone : une rep de plus sur chaque série.');
    expect(p.tout).not.toMatch(/Je ne (la )?compte pas/);
  });
});
