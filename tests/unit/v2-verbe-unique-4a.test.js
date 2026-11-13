/** @jest-environment node */
//
// « Les mots disent vrai » PR 4a (MOTEUR §9.47) — LE VERBE UNIQUE DE LA CONSIGNE ET L'INVARIANT I162.
//
//   1. `Moteur.verbeDeLaConsigne` : la table états → famille, le chiffre qui tranche dans la famille (la LIGNE, l'axe de la charge d'abord).
//   2. Les phrases (gris, Pourquoi) disent le verbe, avec « Une rep de plus : 70 kg × 9 » / « Tu restes à 70 kg × 8 » (plus = 1, 2, 3).
//   3. Les cas du contradicteur à froid (E2, A8, C, F, G, H, I, J, K, L), la population protégée, la première fois, la série « Au max ».
//   4. I162 : le sens 1 (le verbe suit le chiffre), le sens 2 (les phrases suivent le verbe), le sens 3 (la cause tue se compte) — DISCRIMINANTS.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const esp = (t) => String(t).replace(/[  ]/g, ' ');
const DEBUT = '2026-10-01T17:07:00+02:00';

// ── Une consigne réelle, à partir de séances de travail ──────────────────────────────────────────────────────────────────────────────────
const S_ = (ch, reps, res, extra) => reps.map((r, i) => Object.assign({ type: 'travail', ch, reps: r, res: (res && res[i]) || null }, extra || {}));
const g = (d, s) => ({ d, s });
function contrat(seances) {
  return seances.map((q, i) => ({ seance: { id: 's' + i, debut: q.d + 'T10:00:00Z', fin: q.d + 'T11:00:00Z' },
    series: q.s.map((x, k) => Object.assign({ id: 's' + i + '_' + k, rang: k + 1, type_serie: x.type, charge_kg: x.ch, reps: x.reps, rpe: null,
      ressenti: x.res, douleur: null, validee_a: q.d + 'T10:00:00Z' }, x.au_max_reserve !== undefined ? { au_max_reserve: x.au_max_reserve } : {})) }));
}
function consigneDe(seances, opt, jours) {
  const ss = contrat(seances);
  const dernier = ss[ss.length - 1];
  const avant = new Date(new Date(dernier ? dernier.seance.debut : '2026-10-27T10:00:00Z').getTime() + 86400000 * (jours || 3)).toISOString();
  const c = M.consigneDExercice(ss, null, avant, Object.assign({ mesure: 'charge_reps', reglage: 'normal' }, opt || {}));
  return Object.assign({ avant }, c);
}
const A = (c) => esp(M.libellesConsigne(c.consigne, c.avant).gris);
const Q = (c) => esp(M.pourquoiConsigne(c.consigne, 'normal', c.avant).etat);

// ── Un plan d'un exercice, à partir d'une consigne (réelle ou forgée) ───────────────────────────────────────────────────────────────────────
function planDe(c, o) {
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'x', id, { series: 3 });
  const brute = c.consigne ? c : { consigne: c, libelles: (() => { try { return M.libellesConsigne(c, DEBUT); } catch (e) { return null; } })() };
  return T.planDeSeance(Object.assign({ seance: { id: 'S1', debut: c.avant || DEBUT, edition: false, exercices: se.exercices },
    consignes: { x: brute }, reglage: 'normal', paris: [], suites: {} }, (o && o.entrees) || {}));
}
const erreurs162 = (p) => T.verifierPlan(p).erreurs.filter((e) => /^I162/.test(e));

// ── 1. LA TABLE : ÉTAT → FAMILLE → VERBE ────────────────────────────────────────────────────────────────────────────────────────────────
const prog = (vise, extra) => Object.assign({ etat: 'progression', zone: 'hypertrophie', palier: 70, niveau: 8, n: 3, ligne: { charge: 70, vise },
  haut: null, fondement: { date: '2026-09-29T18:00:00+02:00', reps: [8, 8, 8] } }, extra || {});
const verbe = (k) => M.verbeDeLaConsigne(k).verbe;

describe('verbeDeLaConsigne — la ligne décide, l’axe de la charge d’abord', () => {
  test('même charge : monte_reps (plus = vise − niveau), garde_cible, borne', () => {
    expect(M.verbeDeLaConsigne(prog(9))).toMatchObject({ verbe: 'monte_reps', plus: 1, famille: 'progression', de: { charge: 70, reps: 8 }, vers: { charge: 70, reps: 9 } });
    expect(M.verbeDeLaConsigne(prog(10))).toMatchObject({ verbe: 'monte_reps', plus: 2 });
    expect(M.verbeDeLaConsigne(prog(11))).toMatchObject({ verbe: 'monte_reps', plus: 3 });
    expect(M.verbeDeLaConsigne(prog(8))).toMatchObject({ verbe: 'garde_cible', plus: 0 });
    expect(M.verbeDeLaConsigne(prog(7))).toMatchObject({ verbe: 'borne', plus: -1 });
  });
  test('la charge d’abord : une ligne plus légère ou plus lourde que le palier ne dit jamais un verbe de reps', () => {
    expect(verbe(prog(9, { ligne: { charge: 67.5, vise: 9 } }))).toBe('recule');
    expect(verbe(prog(9, { ligne: { charge: 72.5, vise: 9 } }))).toBe('monte_charge');
  });
  test('une aide ou un élastique dont la charge change : neutre (jamais « je baisse à Aide 27,5 kg »)', () => {
    expect(verbe(prog(8, { palier: -25, ligne: { charge: -27.5, vise: 8 } }))).toBe('neutre');
    expect(verbe(prog(8, { palier: -25, ligne: { charge: -22.5, vise: 8 } }))).toBe('neutre');
    // La même charge d'aide : l'axe des reps reste lisible.
    expect(verbe(prog(9, { palier: -25, ligne: { charge: -25, vise: 9 } }))).toBe('monte_reps');
  });
  test('la table des états : chacun a sa famille, le verbe ne se dit que dans la sienne', () => {
    const fam = (etat, extra) => M.verbeDeLaConsigne(Object.assign(prog(8), { etat }, extra || {})).famille;
    ['progression', 'tenue_apres_chute', 'etirement_reps'].forEach((e) => expect([e, fam(e)]).toEqual([e, 'progression']));
    ['reprise_courte', 'reprise_longue'].forEach((e) => expect([e, fam(e)]).toEqual([e, 'reprise']));
    ['bord', 'bord_garde', 'bord_recul', 'bord_vague'].forEach((e) => expect([e, fam(e)]).toEqual([e, 'bord']));
    ['zero_rep', 'tenue_apres_zero'].forEach((e) => expect([e, fam(e)]).toEqual([e, 'zero']));
    ['test_propose', 'retest', 'retest_un_cran', 'etirement'].forEach((e) => expect([e, fam(e)]).toEqual([e, 'test']));
    ['garde', 'etend', 'rejoint', 'attend', 'tout_passe'].forEach((e) => expect([e, fam(e)]).toEqual([e, 'echelle']));
    ['nouvelle_zone', 'depart_leste', 'depart_routine', 'carte_lest'].forEach((e) => expect([e, fam(e)]).toEqual([e, 'depart']));
    expect(fam('salle_max')).toBe('salle');
    expect(fam('silence')).toBe('silence');
    // Aucun verbe de progression hors de la famille « progression » / « reprise » : nouvelle zone, départ, échelle, salle, silence.
    ['nouvelle_zone', 'depart_routine', 'rejoint', 'attend', 'salle_max', 'silence', 'garde', 'etend'].forEach((e) => {
      expect([e, verbe(Object.assign(prog(9), { etat: e }))]).toEqual([e, 'neutre']);
    });
  });
  test('garde la charge : bord_garde, tenue_apres_zero, effort visé « garde » ; recule / reprend : bord_recul, zero_rep', () => {
    expect(verbe(prog(2, { etat: 'bord_garde', palier: 140, ligne: { charge: 140, vise: 2 } }))).toBe('garde_charge');
    expect(verbe(prog(0, { etat: 'tenue_apres_zero', palier: 100, ligne: { charge: 100, vise: 5 }, fondement: { plafondZero: { charge: 102.5 } } }))).toBe('garde_charge');
    expect(verbe(prog(8, { fondement: { reps: [8], effortVise: { effet: 'garde', charge: 70, reps: 8, reserve: 0 } } }))).toBe('garde_charge');
    expect(verbe(prog(2, { etat: 'bord_recul', palier: 140, ligne: { charge: 137.5, vise: 2 } }))).toBe('recule');
    expect(verbe(prog(5, { etat: 'zero_rep', palier: 100, ligne: { charge: 97.5, vise: 5 }, fondement: { zeroRep: { charge: 102.5, vers: 97.5, visees: 5 } } }))).toBe('recule');
    expect(verbe(prog(5, { etat: 'zero_rep', palier: 100, ligne: { charge: 100, vise: 5 }, fondement: { zeroRep: { charge: 102.5, vers: 100, visees: 5, bornee: true } } }))).toBe('reprend');
  });
  test('teste : une ligne haute plus lourde que le palier ; à charge inconnue (haltères), neutre', () => {
    expect(verbe(prog(8, { etat: 'test_propose', haut: { charge: 72.5, vise: 6, k: 1 } }))).toBe('teste');
    expect(verbe(prog(8, { etat: 'test_propose', haut: { charge: null, vise: 6, k: 1 } }))).toBe('neutre');
  });
  test('les transformations : décharge, repli, alléger ; une variante du jour : famille variante, verbe neutre', () => {
    expect(M.verbeDeLaConsigne(prog(8, { allegee: { series: 2 } }))).toMatchObject({ verbe: 'allege', famille: 'variante' });
    expect(M.verbeDeLaConsigne(prog(8, { repli: { palier: 60 } }))).toMatchObject({ verbe: 'repli', famille: 'variante' });
    expect(M.verbeDeLaConsigne(prog(8, { alleger: { charge: 65 } }))).toMatchObject({ verbe: 'alleger', famille: 'variante' });
    expect(M.verbeDeLaConsigne(prog(8, { veilleLegere: { charge: 66 } }))).toMatchObject({ verbe: 'neutre', famille: 'variante' });
  });
  test('rien à dire : sans consigne, sans ligne, sans état', () => {
    expect(verbe(null)).toBe('neutre');
    expect(verbe({ etat: 'silence', raison: 'premiere_fois', ligne: null })).toBe('neutre');
  });
});

// ── 2. LES PHRASES : plus = 1, 2, 3 ─────────────────────────────────────────────────────────────────────────────────────────────────────
describe('les phrases disent le verbe, avec la ligne (C2 : jamais le nombre nu)', () => {
  const gris = (k) => esp(M.libellesConsigne(k, '2026-10-01T10:00:00Z').gris);
  const pq = (k) => esp(M.pourquoiConsigne(k, 'normal', '2026-10-01T10:00:00Z').etat);
  test('plus = 1, 2, 3 : « Une / Deux / Trois reps de plus : 70 kg × N », au gris et au Pourquoi', () => {
    expect(gris(prog(9))).toBe('Mardi : 70 kg × 8, 8, 8. Une rep de plus : 70 kg × 9.');
    expect(gris(prog(10))).toBe('Mardi : 70 kg × 8, 8, 8. Deux reps de plus : 70 kg × 10.');
    expect(gris(prog(11))).toBe('Mardi : 70 kg × 8, 8, 8. Trois reps de plus : 70 kg × 11.');
    expect(pq(prog(9))).toBe('Ta charge de travail n\'est pas encore au haut de ta zone : je te demande une rep de plus, 70 kg × 9.');
    expect(pq(prog(10))).toBe('Ta charge de travail n\'est pas encore au haut de ta zone : je te demande deux reps de plus, 70 kg × 10.');
    expect(pq(prog(11))).toBe('Ta charge de travail n\'est pas encore au haut de ta zone : je te demande trois reps de plus, 70 kg × 11.');
  });
  test('au poids du corps, la ligne dégrade en reps (« Poids du corps × 13 ») et le verbe reste', () => {
    const k = prog(9, { palier: 0, ligne: { charge: 0, vise: 9 } });
    expect(gris(k)).toMatch(/\. Une rep de plus : Poids du corps × 9\.$/);
  });
  test('cible = cible : « Tu restes à 70 kg × 8. » au gris ET au Pourquoi — jamais « je garde 8 reps »', () => {
    expect(gris(prog(8))).toBe('Mardi : 70 kg × 8, 8, 8. Tu restes à 70 kg × 8.');
    expect(pq(prog(8))).toBe('Ta charge de travail n\'est pas encore au haut de ta zone : tu restes à 70 kg × 8.');
    expect(gris(prog(8))).not.toMatch(/garde \d+ reps/i);
  });
  test('la zone qui borne : le chiffre de la ligne, sans verbe (« viser » est pris par la réserve)', () => {
    const k = { etat: 'reprise_courte', zone: 'lourd', palier: 160, niveau: 6, n: 3, ligne: { charge: 160, vise: 5 }, haut: null,
      fondement: { date: '2026-09-29T18:00:00+02:00', reps: [6, 6, 6], borneZone: { zone: 'lourd', haut: 5, niveau: 6 } } };
    expect(gris(k)).toBe('Reprise après une pause : ta charge de travail, sans rep de plus. Ta zone Lourd va jusqu\'à 5 reps : 160 kg × 5.');
    expect(gris(k)).not.toMatch(/je vise/);
  });
  test('la chute : « Je ne compte pas la dernière série : tu restes à 80 kg × 10. » (le fait est gardé, le verbe est celui de la ligne)', () => {
    const k = { etat: 'tenue_apres_chute', zone: 'volume', palier: 80, niveau: 10, n: 3, ligne: { charge: 80, vise: 10 }, haut: null,
      fondement: { date: '2026-09-29T18:00:00+02:00', reps: [10, 10, 6], chute: 4 } };
    expect(gris(k)).toBe('Mardi : 80 kg × 10, 10, 6. Je ne compte pas la dernière série : tu restes à 80 kg × 10.');
    expect(M.verbeDeLaConsigne(k).verbe).toBe('garde_cible');
  });
  test('« Je garde » est la charge seulement ; « On » n’est plus un verbe de consigne (je = le coach décide)', () => {
    const e = { effet: 'garde', charge: 130, reps: 5, reserve: 0, visee: 2, auHaut: false };
    expect(esp(M.phraseEffortVise(e, null))).toBe('130 kg × 5, sans marge. Je garde 130 kg la prochaine fois.');
    expect(esp(M.phraseEffortVise(e, null))).not.toMatch(/\bOn garde\b/);
  });
});

// ── 3. LES CAS DU CONTRADICTEUR, SUR DE VRAIES SÉANCES ──────────────────────────────────────────────────────────────────────────────────
const SIX = ['2026-10-20', '2026-10-27'];
describe('les cas du contradicteur à froid : le verbe lit la LIGNE finale', () => {
  test('E2 — 70 × 10, 10, 10, la dernière sans marge : la ligne reste 70 × 10 ; « Tu restes à » au gris ET au Pourquoi (la cause n’est dite que parce qu’elle est vraie)', () => {
    const c = consigneDe([g(SIX[0], S_(70, [10, 10, 10])), g(SIX[1], S_(70, [10, 10, 10], [null, null, 'reste_0']))]);
    expect(c.consigne.ligne).toEqual({ charge: 70, vise: 10 });
    expect(A(c)).toBe('Mardi : 70 kg × 10, 10, 10, la dernière sans marge. Tu restes à 70 kg × 10.');
    expect(Q(c)).toBe('Ta dernière série était sans marge, il ne t\'en restait aucune : tu restes à 70 kg × 10.');
    expect(M.verbeDeLaConsigne(c.consigne)).toMatchObject({ verbe: 'garde_cible', cause: true, causeTue: false, sansMarge: { derniere: true } });
  });
  test('A8 — 70 × 8, 8, 8, la dernière à 0 en réserve', () => {
    const c = consigneDe([g(SIX[1], S_(70, [8, 8, 8], [null, null, 'reste_0']))]);
    expect(c.consigne.ligne.vise).toBe(8);
    expect(A(c)).toBe('Mardi : 70 kg × 8, 8, 8, la dernière sans marge. Tu restes à 70 kg × 8.');
  });
  test('C — 8, 8, 7, la dernière à 0 en réserve : gris et Pourquoi disent le même verbe (ils se contredisaient)', () => {
    const c = consigneDe([g(SIX[1], S_(70, [8, 8, 7], [null, null, 'reste_0']))]);
    expect(M.verbeDeLaConsigne(c.consigne).verbe).toBe('garde_cible');
    expect(A(c)).toBe('Mardi : 70 kg × 8, 8, 7, la dernière sans marge. Tu restes à 70 kg × 8.');
    expect(Q(c)).toMatch(/tu restes à 70 kg × 8\.$/);
    expect(A(c)).not.toMatch(/rep de plus/);
    expect(Q(c)).not.toMatch(/rep de plus/);
  });
  test('D4 — la série à fond n’est pas la dernière de la séance : « une série sans marge », jamais « la dernière »', () => {
    const c = consigneDe([g(SIX[1], S_(70, [8, 8, 8], ['reste_0', null, null]))]);
    expect(M.verbeDeLaConsigne(c.consigne).sansMarge).toMatchObject({ derniere: false });
    expect(A(c)).toBe('Mardi : 70 kg × 8, 8, 8, une série sans marge. Tu restes à 70 kg × 8.');
    expect(Q(c)).toBe('Une de tes séries était sans marge, il ne t\'en restait aucune : tu restes à 70 kg × 8.');
  });
  test('D4 — avec des séries en plus après la série à fond (hors du palier), « la dernière » ne se dit pas non plus', () => {
    // 70 × 8, 8, 8 (la dernière à fond), puis une série d'exploration plus lourde : la dernière de la séance n'est pas celle-là.
    const c = consigneDe([g(SIX[1], S_(70, [8, 8, 8], [null, null, 'reste_0']).concat([{ type: 'exploration', ch: 75, reps: 5, res: null }]))]);
    const v = M.verbeDeLaConsigne(c.consigne);
    if (v.sansMarge) expect(v.sansMarge.derniere).toBe(false);
    expect(A(c)).not.toMatch(/la dernière sans marge/);
  });
  test('F — test proposé (haltères, charge inconnue) : verbe neutre, aucune contradiction de verbe sur les deux lignes', () => {
    const c = consigneDe([g(SIX[0], S_(70, [12, 12, 12]))]);
    expect(c.consigne.etat).toBe('test_propose');
    expect(M.verbeDeLaConsigne(c.consigne).verbe).toBe('neutre');
  });
  test('G — population protégée : « Tu restes à », jamais « sans marge » ni « il ne t’en restait aucune »', () => {
    const c = consigneDe([g(SIX[0], S_(70, [8, 8, 8])), g(SIX[1], S_(70, [8, 8, 8], [null, null, 'reste_0']))], { protegee: true, debutant: true });
    expect(M.verbeDeLaConsigne(c.consigne)).toMatchObject({ verbe: 'garde_cible', cause: false });
    expect(A(c)).toBe('Mardi : 70 kg × 8, 8, 8. Tu restes à 70 kg × 8.');
    expect(Q(c)).not.toMatch(/sans marge|il ne t.en restait/);
  });
  test('H — une aide : « Aide 25 kg × 9 » à la même charge ; le verbe de reps reste lisible', () => {
    const c = consigneDe([g(SIX[0], S_(-25, [8, 8, 8])), g(SIX[1], S_(-25, [8, 8, 8]))]);
    expect(M.verbeDeLaConsigne(c.consigne).verbe).toBe('monte_reps');
    expect(A(c)).toMatch(/Une rep de plus : Aide 25 kg × 9\.$/);
  });
  test('I — un zéro rep : « Je baisse à 70 kg » (la charge) ; les reps montent sans verbe', () => {
    const c = consigneDe([g(SIX[0], S_(70, [8, 8, 8])), g(SIX[1], S_(80, [0, 0, 0]))]);
    expect(c.consigne.etat).toBe('zero_rep');
    expect(M.verbeDeLaConsigne(c.consigne).verbe).toBe('recule');
    expect(A(c)).toBe('80 kg × 0 : pas encore. Je baisse à 70 kg.');
  });
  test('J — poids du corps à l’échec : la ligne monte (9), « Une rep de plus : Poids du corps × 9 », la cause « sans marge » est TUE (sens 3, comptée)', () => {
    const c = consigneDe([g(SIX[0], S_(0, [8, 8, 8], [null, null, 'reste_0']))], { mesure: 'reps' });
    const v = M.verbeDeLaConsigne(c.consigne);
    expect(v).toMatchObject({ verbe: 'monte_reps', cause: false, causeTue: true });
    expect(A(c)).toBe('Mardi : Poids du corps × 8, 8, 8. Une rep de plus : Poids du corps × 9.');
    expect(A(c)).not.toMatch(/sans marge/);
  });
  test('K — sous 3 reps : la phrase habituelle', () => {
    const c = consigneDe([g(SIX[0], S_(150, [3, 3, 2])), g(SIX[1], S_(150, [3, 3, 3]))]);
    expect(erreurs162(planDe(c))).toEqual([]);
  });
  test('première fois : aucun verbe, aucune phrase de progression', () => {
    const c = consigneDe([]);
    expect(c.consigne.etat).toBe('silence');
    expect(M.verbeDeLaConsigne(c.consigne).verbe).toBe('neutre');
    expect(A(c)).toBe("Première fois ici : ce que tu notes aujourd'hui servira de départ.");
    expect(Q(c)).not.toMatch(/rep de plus|restes à/);
  });
  test('une série « Au max » demandée à fond n’est pas « sans marge » : aucune cause, la phrase habituelle', () => {
    const c = consigneDe([g(SIX[1], S_(70, [8, 8, 8], [null, null, 'reste_0']).map((x, i) => i === 2 ? Object.assign(x, { au_max_reserve: 0 }) : x))]);
    expect(M.verbeDeLaConsigne(c.consigne).sansMarge).toBeNull();
    expect(A(c)).not.toMatch(/sans marge/);
    expect(A(c)).toMatch(/Une rep de plus : 70 kg × 9\.$/);
  });
});

// ── 4. I162 : DISCRIMINANTS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('I162 — le verbe ne contredit jamais le chiffre, et les trois champs le disent', () => {
  const c0 = () => consigneDe([g(SIX[0], S_(70, [8, 8, 8])), g(SIX[1], S_(70, [8, 8, 8]))]);
  test('un plan réel : x.verbe posé sur la consigne finale, aucune erreur I162', () => {
    const p = planDe(c0());
    expect(p.exercices[0].verbe).toMatchObject({ verbe: 'monte_reps', plus: 1 });
    expect(erreurs162(p)).toEqual([]);
    ['E2', 'G'].forEach(() => {});
    const e2 = planDe(consigneDe([g(SIX[0], S_(70, [10, 10, 10])), g(SIX[1], S_(70, [10, 10, 10], [null, null, 'reste_0']))]));
    expect(e2.exercices[0].verbe.verbe).toBe('garde_cible');
    expect(erreurs162(e2)).toEqual([]);
  });
  test('⚠️ DISCRIMINANT sens 2 — un gris « Une rep de plus » devant une ligne qui garde (l’ancien défaut) est attrapé', () => {
    const p = planDe(consigneDe([g(SIX[0], S_(70, [10, 10, 10])), g(SIX[1], S_(70, [10, 10, 10], [null, null, 'reste_0']))]));
    p.exercices[0].entete.gris = 'Mardi : 70 kg × 10, 10, 10. Une rep de plus.';
    expect(erreurs162(p).join('\n')).toMatch(/alors que le verbe est « garde_cible »/);
  });
  test('⚠️ DISCRIMINANT sens 2 — le Pourquoi qui dit « une rep de plus sur chaque série » devant une ligne qui garde', () => {
    const p = planDe(consigneDe([g(SIX[0], S_(70, [10, 10, 10])), g(SIX[1], S_(70, [10, 10, 10], [null, null, 'reste_0']))]));
    p.exercices[0].pourquoi.etat = 'Ta charge de travail n\'est pas encore au haut de ta zone : une rep de plus sur chaque série.';
    expect(erreurs162(p).length).toBeGreaterThan(0);
  });
  test('⚠️ DISCRIMINANT sens 2 — « tu restes à » devant une ligne qui monte, ou à une autre ligne', () => {
    const p = planDe(c0());
    p.exercices[0].entete.gris = 'Le 20 oct. : 70 kg × 8, 8, 8. Tu restes à 70 kg × 8.';
    expect(erreurs162(p).join('\n')).toMatch(/« tu restes à » alors que le verbe est « monte_reps »/);
    const q = planDe(consigneDe([g(SIX[1], S_(70, [8, 8, 8], [null, null, 'reste_0']))]));
    q.exercices[0].entete.gris = 'Mardi : 70 kg × 8, 8, 8. Tu restes à 70 kg × 7.';
    expect(erreurs162(q).join('\n')).toMatch(/la ligne est 70 kg × 8/);
  });
  test('⚠️ DISCRIMINANT sens 2 — « N reps de plus » avec un autre N que la ligne', () => {
    const p = planDe(c0());
    p.exercices[0].entete.gris = 'Le 20 oct. : 70 kg × 8, 8, 8. Deux reps de plus : 70 kg × 10.';
    expect(erreurs162(p).length).toBe(0);   // le texte seul ne porte pas N : c'est le sens 1 (v.plus) qui garde le nombre
    p.exercices[0].verbe = Object.assign({}, p.exercices[0].verbe, { plus: 2 });
    expect(erreurs162(p).join('\n')).toMatch(/le verbe dit 2 rep\(s\) de plus, la ligne en demande 1/);
  });
  test('⚠️ DISCRIMINANT sens 2 — une négation (« sans rep de plus ») devant une ligne qui monte', () => {
    const p = planDe(c0());
    p.exercices[0].entete.gris = 'Reprise après une pause : ta charge de travail, sans rep de plus.';
    expect(erreurs162(p).join('\n')).toMatch(/nie « une rep de plus » devant une ligne qui monte/);
  });
  test('⚠️ DISCRIMINANT sens 2 — la cause « sans marge » devant une ligne qui monte (sens 3), et « la dernière » qui ne l’est pas', () => {
    const c = consigneDe([g(SIX[0], S_(0, [8, 8, 8], [null, null, 'reste_0']))], { mesure: 'reps' });
    const p = planDe(c);
    expect(T.causesTues(p)).toBe(1);
    expect(erreurs162(p)).toEqual([]);
    p.exercices[0].entete.gris = 'Mardi : Poids du corps × 8, 8, 8, la dernière sans marge. Une rep de plus : Poids du corps × 9.';
    expect(erreurs162(p).join('\n')).toMatch(/imprime la cause « sans marge » alors que le verbe ne la rend pas vraie/);
    const d = planDe(consigneDe([g(SIX[1], S_(70, [8, 8, 8], ['reste_0', null, null]))]));
    d.exercices[0].entete.gris = 'Mardi : 70 kg × 8, 8, 8, la dernière sans marge. Tu restes à 70 kg × 8.';
    expect(erreurs162(d).join('\n')).toMatch(/dit « la dernière » alors que la série à fond n’est pas la dernière/);
  });
  test('⚠️ DISCRIMINANT sens 2 — population protégée : « sans marge » ne se dit pas', () => {
    const p = planDe(consigneDe([g(SIX[1], S_(70, [8, 8, 8], [null, null, 'reste_0']))]), { entrees: { debutant: true } });
    if (p.protegee !== true) return;   // le plan sait qu'il est protégé : sinon, rien à prouver ici (le moteur ne pose aucune cause)
    p.exercices[0].pourquoi.etat = 'Ta dernière série était sans marge, il ne t\'en restait aucune : tu restes à 70 kg × 8.';
    expect(erreurs162(p).join('\n')).toMatch(/population protégée/);
  });
  test('⚠️ DISCRIMINANT sens 1 — un verbe qui ne suit pas la ligne (monte_reps devant une ligne qui garde, recule devant une ligne plus lourde)', () => {
    const p = planDe(consigneDe([g(SIX[0], S_(70, [10, 10, 10])), g(SIX[1], S_(70, [10, 10, 10], [null, null, 'reste_0']))]));
    p.exercices[0].verbe = Object.assign({}, p.exercices[0].verbe, { verbe: 'monte_reps', plus: 1 });
    expect(erreurs162(p).join('\n')).toMatch(/le verbe devrait être « garde_cible », il est « monte_reps »/);
    const q = planDe(c0());
    q.exercices[0].verbe = Object.assign({}, q.exercices[0].verbe, { verbe: 'recule' });
    expect(erreurs162(q).join('\n')).toMatch(/« recule » alors que la ligne/);
  });
  test('sens 1 — aucun verbe sur la consigne finale : l’invariant le dit', () => {
    const p = planDe(c0());
    delete p.exercices[0].verbe;
    expect(erreurs162(p).join('\n')).toMatch(/aucun verbe sur la consigne finale/);
  });
  test('la consigne finale : « plus léger aujourd’hui » (variante) — le gris se rédige sur la finale, verbe neutre, aucune erreur', () => {
    const c = c0();
    const p = planDe(Object.assign({}, c, { consigne: Object.assign({}, c.consigne, { ligne: { charge: 66, vise: 8 }, haut: null, veilleLegere: { charge: 66, reps: 8, reserve: 2, plan: { charge: 70, reps: 8, reserve: 0 } } }) }));
    expect(p.exercices[0].verbe).toMatchObject({ verbe: 'neutre', famille: 'variante' });
    expect(p.exercices[0].entete.gris).not.toMatch(/rep de plus|restes/);
    expect(erreurs162(p)).toEqual([]);
  });
});
