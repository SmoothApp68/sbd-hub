/** @jest-environment node */
//
// PR 1 de la consolidation « un seul coach, un seul câblage » (relevé du
// 01/10/2026) — LA FEUILLE « POURQUOI » DANS LE PLAN.
//
//   1. Le plan pose la feuille ENTIÈRE (`x.pourquoi`) : « Donc », les lignes,
//      et les paragraphes, rédigés sur la consigne qu'il applique. L'app la
//      lit telle quelle (la garde d'architecture le vérifie).
//   2. Sous une semaine allégée, un repli ou une série de plus, elle ne plante
//      plus, et son paragraphe d'état est la phrase déjà dite en gris pour la
//      transformation. Balayé sur tous les états des fichiers de cas.
//   3. Le mot d'ordre de la série restée se lit sur le rang (`rangDuReste`),
//      par la même fonction que l'en-tête : le couché du 01/10.
//   4. Elle est dans I26 : sous capture, ses chiffres déclarés ; une feuille
//      forgée qui contredit le rang est attrapée ; une feuille qui ne se
//      rédige pas se rapporte, la séance ne tombe pas.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const NB = ' ';
const esp = (x) => (x === null || x === undefined ? x : String(x).replace(/ /g, ' '));
const DEBUT = '2026-10-01T17:07:00+02:00';
const JOUR = '2026-10-01';

// Un plan d'un exercice `x`, avec l'escalier qu'on lui donne.
function planDe(k, o) {
  const opt = o || {};
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'x', id, { series: opt.series || 3 });
  // Une consigne forgée que la phrase grise ne sait pas rédiger : sans gris
  // (le décor ne doit pas tomber avant le plan).
  let libelles = null;
  try { libelles = M.libellesConsigne(k, DEBUT); } catch (e) { libelles = null; }
  const c = Object.assign({ consigne: k, libelles }, opt.extra || {});
  return T.planDeSeance(Object.assign({ seance: { id: 'S1', debut: DEBUT, edition: false, exercices: se.exercices },
    consignes: { x: c }, reglage: 'normal', paris: [], suites: {} }, opt.entrees || {}));
}
const allegee = (series) => ({
  extra: { compteur: { compteur: 4, meilleur: { palier: 125, niveau: 5 }, blocages: [] } },
  entrees: { escalier: { cartes: [{ seance: 'S0', jour: JOUR, declencheur: 'x', compteur: 4, reponse: 'acceptee',
    debut: JOUR, fin: M.finAllegee(JOUR) }], compteurs: [], noms: { x: 'X' }, seriesRoutine: { x: series } } } });
const REPLI = { palier: 120, niveau: 4, debut: '2026-09-29T10:00:00+02:00', reps: [4, 4, 4], ligne: [120, 4] };
const repli = (zone) => ({
  extra: { compteur: { compteur: 8, meilleur: { palier: 125, niveau: 5 }, blocages: [] }, repli: REPLI },
  entrees: { phase: 'maintien', escalier: { cartes: [], compteurs: [], noms: {}, seriesRoutine: { x: 3 }, marches: [] } } });

const K125 = { etat: 'test_propose', zone: 'lourd', palier: 125, niveau: 5, n: 3,
  ligne: { charge: 125, vise: 5 }, haut: { charge: 130, vise: 4, k: 1 },
  fondement: { date: '2026-09-29T18:00:00+02:00', reps: [5, 5, 5] } };

// ── 1. LE PLAN POSE LA FEUILLE ENTIÈRE ──────────────────────────────────────
describe('PR 1 — le plan pose la feuille « Pourquoi » entière', () => {
  test('« Donc », les lignes ET les paragraphes, sur la consigne du plan', () => {
    const x = planDe(K125).exercices[0];
    expect(Object.keys(x.pourquoi).sort()).toEqual(['donc', 'etat', 'fin', 'lignes', 'palier', 'reglage', 'seance', 'zone']);
    expect(esp(x.pourquoi.donc)).toBe('Donc 125 kg × 5, puis 130 kg × 4 sur la dernière série.');
    expect(esp(x.pourquoi.palier)).toBe('Ta charge de travail : 125 kg, validée à 5 reps. Tes séries y ont fait 5, 5, 5.');
    expect(esp(x.pourquoi.zone)).toBe('Ta zone : Lourd, 3 à 5 reps. Touche l\'étiquette pour la changer.');
    expect(esp(x.pourquoi.fin)).toBe('Tu peux toujours taper autre chose : ta saisie fait foi.');
  });

  test('les paragraphes sont ceux du moteur, mot pour mot, sur la consigne brute (aucune transformation)', () => {
    const x = planDe(K125).exercices[0];
    const m = M.pourquoiConsigne(x.consigne, 'normal', DEBUT);
    ['seance', 'zone', 'palier', 'etat', 'reglage', 'fin'].forEach((k) => expect([k, x.pourquoi[k]]).toEqual([k, m[k]]));
  });

  test('le réglage du plan est celui de la feuille', () => {
    const p = T.planDeSeance({ seance: { id: 'S1', debut: DEBUT, edition: false,
      exercices: S.ajouterExercice(S.creer({ id: 'S1', userId: 'u', idSerie: () => 'a' }), 'x', (() => { let i = 0; return () => 'z' + (++i); })(), { series: 3 }).exercices },
      consignes: { x: { consigne: K125 } }, reglage: 'prudent', paris: [], suites: {} });
    expect(esp(p.exercices[0].pourquoi.reglage)).toBe('Ton réglage : Me ménager. Il se change dans Profil.');
  });
});

// ── 2. LES CONSIGNES TRANSFORMÉES ───────────────────────────────────────────
describe('PR 1 — sous une semaine allégée, un repli, une série de plus : la consigne appliquée', () => {
  test('⚠️ DISCRIMINANT — « rejoint » sous une semaine allégée : la feuille se rédige (elle plantait sur `haut.charge`)', () => {
    const R = { etat: 'rejoint', zone: 'volume', palier: 92, niveau: 11, n: 3, ligne: null,
      haut: { charge: 92, vise: 11, k: 3 }, fondement: { date: '2026-09-26T18:00:00+02:00', reps: [11, 11], palierPrecedent: 88 } };
    expect(() => M.pourquoiConsigne(M.consigneAllegee(R, 4), 'normal', DEBUT)).not.toThrow();
    const x = planDe(R, allegee(4)).exercices[0];
    expect(x.consigne.allegee).toBeTruthy();
    expect(x.pourquoi.indisponible).toBeUndefined();
    expect(esp(x.pourquoi.etat)).toBe('Semaine allégée : mêmes charges, moins de séries, loin de l’échec. ' +
      'Rien ne monte. 2 séries au lieu de 4, cette semaine.');
    // « Donc » dit la consigne allégée, comme l'en-tête — plus « une rep de plus ».
    expect(esp(x.pourquoi.donc)).toBe('Donc 92 kg × 9.');
    expect(esp(x.pourquoi.donc)).toBe('Donc ' + esp(x.entete.jaune.join(', ')) + '.');
  });

  test('« progression » sous une semaine allégée : plus de « une rep de plus », la phrase de la semaine', () => {
    const P = { etat: 'progression', zone: 'hypertrophie', palier: 50, niveau: 9, n: 4,
      ligne: { charge: 50, vise: 10 }, haut: null, fondement: { date: '2026-09-26T18:00:00+02:00', reps: [9, 9, 9, 9] } };
    const brute = planDe(P).exercices[0];
    expect(brute.pourquoi.etat).toMatch(/une rep de plus/);
    const x = planDe(P, allegee(4)).exercices[0];
    expect(x.pourquoi.etat).not.toMatch(/une rep de plus/);
    expect(esp(x.pourquoi.etat)).toMatch(/2 séries au lieu de 4, cette semaine\.$/);
  });

  test('⚠️ DISCRIMINANT — « attend » sous un repli : la feuille se rédige, et dit le repli comme le gris', () => {
    const A = { etat: 'attend', zone: 'lourd', palier: 125, niveau: 5, n: 3,
      ligne: { charge: 125, vise: 5 }, haut: { charge: 130, vise: 4, k: 1 },
      fondement: { date: '2026-09-26T18:00:00+02:00', reps: [5, 5], palierPrecedent: 125, seuil: 4 } };
    expect(() => M.pourquoiConsigne(M.consigneRepli(A, REPLI), 'normal', DEBUT)).not.toThrow();
    const x = planDe(A, repli('lourd')).exercices[0];
    expect(x.consigne.repli).toBeTruthy();
    expect(x.pourquoi.indisponible).toBeUndefined();
    expect(esp(x.pourquoi.etat)).toBe('On repart de 120 kg, ta dernière charge tenue : 120 kg × 4, 4, 4 mardi.');
    expect(x.pourquoi.etat).toBe(x.entete.gris);
  });

  test('une série de plus : l’état, puis la phrase de la série de plus', () => {
    const k = M.consigneSerieDePlus({ etat: 'progression', zone: 'volume', palier: 27, niveau: 12, n: 3,
      ligne: { charge: 27, vise: 12 }, haut: null, fondement: { reps: [12, 12, 12] } }, 3);
    expect(esp(M.pourquoiConsigne(k, 'normal', DEBUT).etat)).toBe('Ta charge de travail n\'est pas encore au haut de ta zone : ' +
      'une rep de plus sur chaque série. Une série de plus, jusqu\'à ton prochain progrès.');
  });

  test('⚠️ BALAYAGE — chaque consigne des fichiers de cas, brute, allégée, en repli, avec une série de plus : jamais de plantage', () => {
    const fautes = [];
    let vus = 0;
    ['consigne-48b7', 'consigne-48b5a2'].forEach((f) => require('./fixtures/' + f + '.json').forEach((c) => {
      const k = M.consignePour(c.seances, c.avant, { reglage: c.reglage, equipement: c.equipement, correction: c.correction || null });
      if (!k || k.etat === 'silence') return;
      [k, M.consigneAllegee(k, 4), M.consigneRepli(k, REPLI), M.consigneSerieDePlus(k, 3)].forEach((t, i) => {
        vus++;
        try { M.pourquoiConsigne(t, c.reglage || 'normal', c.avant); } catch (e) { fautes.push(f + ' ' + c.id + ' #' + i + ' : ' + e.message); }
      });
    }));
    expect(vus).toBeGreaterThan(200);
    expect(fautes).toEqual([]);
  });
});

// ── 3. LE MOT D'ORDRE, UNE SEULE SOURCE ─────────────────────────────────────
describe('PR 1 — le mot d’ordre de la série restée : l’en-tête et la feuille disent le même', () => {
  const serie = (kg, reps, role) => ({ charge_kg: kg, reps, rpe: null, role: role || 'palier', origine: role || 'palier' });
  const s = (j, palier, l) => ({ debut: '2026-09-' + j + 'T18:00:00+00:00', palier, neutre: false, series: l });
  const O = { reglage: 'normal', equipement: 'haltere', correction: null };
  const debut = [s('17', 88, [serie(88, 10), serie(88, 10), serie(88, 10)]),
                 s('20', 88, [serie(88, 10), serie(88, 10), serie(88, 11)]),
                 s('23', 88, [serie(88, 11), serie(88, 11), serie(92, 11, 'exploration')])];
  const deux = (derniere) => {
    const k = M.consignePour(debut.concat([s('26', 92, derniere)]), '2026-10-01T15:00:00+00:00', O);
    expect(k.etat).toBe('rejoint');
    const x = planDe(k).exercices[0];
    return [esp(x.entete.gris), esp(x.pourquoi.etat)];
  };

  test('⚠️ DISCRIMINANT — le couché du 01/10 (88, 92, 92) : « première » des deux côtés (la feuille disait « dernière »)', () => {
    expect(deux([serie(88, 10, 'rampe'), serie(92, 11), serie(92, 11)])).toEqual([
      'Ta première série à 88 kg passe à 92 kg.',
      '92 kg a pris la majorité de tes séries : ta première série passe de 88 kg à 92 kg.']);
  });
  test('une série restée en fin de séance (92, 92, 88) : « dernière » des deux côtés', () => {
    expect(deux([serie(92, 11), serie(92, 11), serie(88, 10, 'travail')])).toEqual([
      'Ta dernière série à 88 kg passe à 92 kg.',
      '92 kg a pris la majorité de tes séries : ta dernière série passe de 88 kg à 92 kg.']);
  });
  test('entre les deux (92, 88, 92) : « série restée » des deux côtés', () => {
    expect(deux([serie(92, 11), serie(88, 10, 'travail'), serie(92, 11)])).toEqual([
      'Ta série restée à 88 kg passe à 92 kg.',
      '92 kg a pris la majorité de tes séries : ta série restée passe de 88 kg à 92 kg.']);
  });
  test('N5, le cas livré (125, 130, 130) : la feuille dit « première », comme son gris corrigé le 02/10', () => {
    const N5 = require('./fixtures/consigne-48b7.json').filter((c) => c.id === 'N5')[0];
    expect(esp(N5.pourquoi.etat)).toBe('130 kg a pris la majorité de tes séries : ta première série passe de 125 kg à 130 kg.');
    expect(esp(N5.phrases.gris)).toBe('Ta première série à 125 kg passe à 130 kg.');
  });
});

// ── 4. LA FEUILLE DANS I26 ──────────────────────────────────────────────────
describe('PR 1 — la feuille est dans I26', () => {
  test('ses paragraphes sont une phrase du plan, avec leurs citations ; aucun écart sur un plan juste', () => {
    const x = planDe(K125).exercices[0];
    const p = x.phrases.filter((q) => q.ou === 'pourquoi.paragraphes')[0];
    expect(p).toBeTruthy();
    expect(p.citations.length).toBeGreaterThan(5);
    expect(p.citations.every((q) => q.nature)).toBe(true);
    expect(T.verifierPhrases(planDe(K125))).toEqual([]);
  });

  test('⚠️ DISCRIMINANT — une feuille forgée qui dit « dernière » sur une montée : attrapée (mot d’ordre)', () => {
    const R = { etat: 'rejoint', zone: 'volume', palier: 92, niveau: 11, n: 3, ligne: null,
      haut: { charge: 92, vise: 11, k: 3 }, fondement: { date: '2026-09-26T18:00:00+02:00', reps: [11, 11], palierPrecedent: 88,
        seance: [{ role: 'rampe', charge_kg: 88, reps: 10 }, { role: 'palier', charge_kg: 92, reps: 11 }, { role: 'palier', charge_kg: 92, reps: 11 }] } };
    const p = planDe(R);
    expect(T.verifierPhrases(p).filter((e) => e.ou === 'pourquoi.paragraphes')).toEqual([]);
    const faux = JSON.parse(JSON.stringify(p));
    const f = faux.exercices[0].phrases.filter((q) => q.ou === 'pourquoi.paragraphes')[0];
    f.texte = f.texte.replace('ta première série', 'ta dernière série');
    f.citations.filter((q) => q.objet && q.objet.quoi === 'reste' && q.objet.ordre)[0].objet.ordre = 'dernière';
    expect(T.verifierPhrases(faux).map((e) => e.ou + ' · ' + e.cause)).toEqual(['pourquoi.paragraphes · mot_ordre']);
  });

  test('une feuille qui ne se rédige pas : la séance ne tombe pas, la feuille garde ses lignes, I26 bloque', () => {
    const forge = { etat: 'garde', zone: 'lourd', palier: 125, niveau: 5, n: 3,
      ligne: { charge: 125, vise: 5 }, haut: { charge: 130, vise: 4, k: 1 }, fondement: { date: '2026-09-26T18:00:00+02:00' } };
    let p;
    expect(() => { p = planDe(forge); }).not.toThrow();
    const x = p.exercices[0];
    expect(x.pourquoi.lignes).toHaveLength(3);
    expect(typeof x.pourquoi.indisponible).toBe('string');
    expect(T.verifierPhrases(p).map((e) => e.cause)).toContain('feuille_indisponible');
    // I26 est bloquante (PR 7) : c'est une violation de `verifierPlan`.
    expect(T.verifierPlan(p).erreurs).toEqual([expect.stringMatching(/^I26 — .*feuille_indisponible/)]);
  });
});
