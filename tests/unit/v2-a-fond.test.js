/** @jest-environment node */
//
// 68B — « à fond », tenu sans montée (MOTEUR §9.14 ter, §17.4 révisé, §9.11 ;
// invariant I44).
//
// LE FICHIER DE CAS FAIT FOI. `cas-68b-a-fond.json` sort de la référence
// `ref68.py` (règles 68B, Claude.ai, 11/10/2026) : 12 cas, l'attendu à chaque
// étape — lignes, fantômes, message (type et clés). Un cas qui semble faux se
// rapporte ; il ne se corrige pas ici.
//
// ⚠️ LE VRAI CHEMIN, comme `v2-ecarts-plan` : une séance de `seance.js`, l'effort
// noté comme dans l'app (`definirEffort`), chaque validation écrit son pari
// comme l'app, et `verifierPlan` (I4, I7, I11, I41 à I44) et la garde des
// phrases (I26) tournent à CHAQUE étape.
//
// Puis ce qui se DIT et s'OBSERVE sur les reps faites (§17.4 révisé) : chaque
// phrase sur une fixture qui la déclenche vraiment — une série à fond qui
// abaisse le niveau, un test que la rep en moins fait « rater » — et la phrase
// habituelle quand la série à fond n'a rien abaissé.

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const CAS = require('./fixtures/cas-68b-a-fond.json');
const CONSIGNES = require('./fixtures/consigne-48b7.json');

const cent = (v) => (v === null || v === undefined ? null : Math.round(Number(v) * 100) / 100);
const esp = (t) => (t === null || t === undefined ? t : t.replace(/ /g, ' '));
const arrondi = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' ? cent(v) : v)));

function consigneDuCas(k) {
  const table = M.zoneParCle(k.zone.nom);
  expect([table.bas, table.haut]).toEqual([k.zone.bas, k.zone.haut]);
  return { etat: k.etat, zone: k.zone.nom, palier: k.palier, n: k.n, ligne: k.ligne, haut: k.haut };
}

// Une séance de `n` séries de travail validées dans l'ordre, l'effort noté
// comme dans l'app, chaque validation écrivant son pari. Rend, à chaque étape,
// le plan, les erreurs de `verifierPlan`, les écarts de phrases, les paris.
function jouer(consigne, contexte, n, faites) {
  let k = 0;
  const id = () => 'x-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'x', id, { series: n });
  const paris = [];
  const entrees = () => ({ seance: { id: 'S', debut: '2026-10-11T10:00:00Z', edition: false, exercices: se.exercices },
    consignes: { x: { consigne, contexte } }, reglage: 'normal', paris: paris.slice() });
  const etapes = [];
  let avant;
  for (let t = 0; t <= faites.length; t++) {
    const e = entrees();
    const p = T.planDeSeance(e);
    etapes.push({ x: p.exercices[0], erreurs: T.verifierPlan(p, e, avant).erreurs,
                  phrases: T.verifierPhrases(p), paris: paris.slice(), series: se.exercices[0].series });
    avant = p;
    if (t === faites.length) break;
    const f = faites[t];
    se = S.modifierSerie(se, 0, t, { charge_kg: f.charge, reps: f.reps });
    if (f.rpe !== undefined || f.ressenti !== undefined) se = S.definirEffort(se, 0, t, { rpe: f.rpe, ressenti: f.ressenti });
    se = S.valider(se, 0, t, new Date('2026-10-11T10:30:00Z'));
    const q = T.planDeSeance(entrees()).exercices[0].paris[t];
    if (q) paris.push(Object.assign({}, q, { set_observe: se.exercices[0].series[t].id }));
  }
  return etapes;
}

const vue = (x) => ({
  lignes: x.lignes.map((l) => ({ role: l.role, charge: cent(l.charge), vise: l.vise })),
  fantomes: x.lignes.map((l) => (l.fantome
    ? { charge: cent(l.fantome.charge), reps: l.fantome.reps, source: l.fantome.source } : null))
});
const cas = (id) => CAS.cas.find((c) => c.id === id);
const jouerCas = (c, faites) => jouer(consigneDuCas(c.consigne), c.contexte, c.series, faites || c.faites);

// ── LES 12 CAS, À CHAQUE ÉTAPE ──────────────────────────────────────────────
describe('68B — les 12 cas de ref68 (règles 68B), à chaque étape, par le vrai chemin', () => {
  test('prémisse : 12 cas, de la référence ref68 (règles 68B), et toutes les sortes de message', () => {
    expect(CAS.cas).toHaveLength(12);
    expect(CAS.source).toMatch(/ref68\.py \(REGLES = 68B\)/);
    const types = new Set();
    CAS.cas.forEach((c) => c.attendu.forEach((e) => { if (e.message) types.add(e.message.type); }));
    ['a_fond_suite', 'pas_encore_soi', 'pas_encore', 'propose'].forEach((t) => expect(types.has(t)).toBe(true));
  });

  CAS.cas.forEach((c) => {
    test(c.id + ' — ' + c.titre, () => {
      const etapes = jouerCas(c);
      expect(etapes).toHaveLength(c.attendu.length);
      c.attendu.forEach((a, t) => {
        const x = etapes[t].x;
        const o = vue(x);
        expect({ etape: t, lignes: o.lignes }).toEqual({ etape: t, lignes: arrondi(a.lignes) });
        expect({ etape: t, fantomes: o.fantomes }).toEqual({ etape: t, fantomes: arrondi(a.fantomes) });
        const m = x.reaction.message;
        expect({ etape: t, message: m ? m.type : null }).toEqual({ etape: t, message: a.message ? a.message.type : null });
        if (a.message) {
          expect({ etape: t, rang: m.rang, charge: cent(m.charge), reps: m.reps })
            .toEqual({ etape: t, rang: a.message.rang, charge: cent(a.message.kg), reps: a.message.reps });
          ['palier', 'a_fond', 'vise', 'marge'].forEach((cle) => {
            if (a.message[cle] !== undefined) expect({ etape: t, [cle]: arrondi(m[cle]) }).toEqual({ etape: t, [cle]: arrondi(a.message[cle]) });
          });
          expect(x.message && x.message.type).toBe(m.type);
        }
        expect({ etape: t, erreurs: etapes[t].erreurs }).toEqual({ etape: t, erreurs: [] });
        expect({ etape: t, phrases: etapes[t].phrases }).toEqual({ etape: t, phrases: [] });
      });
    });
  });

  test('une ligne « à fond » garde son rôle, et sa source dit d’où elle vient', () => {
    const x = jouerCas(cas('B09'))[1].x;
    expect(x.lignes[1]).toMatchObject({ role: 'test', charge: 81.3, vise: 9, source: 'a_fond' });
    const y = jouerCas(cas('B01'))[1].x;
    expect(y.lignes[1]).toMatchObject({ role: 'ligne', charge: 79, vise: 11, source: 'a_fond' });
    expect(y.lignes[1].fantome).toEqual({ charge: 79, reps: 11, source: 'plan' });
  });
});

// ── LES PHRASES DE LA SÉANCE, AU MOT PRÈS (MOTEUR §9.14 ter) ────────────────
describe('68B — les phrases « à fond » de la séance, au mot près', () => {
  const phrase = (id, t) => esp(jouerCas(cas(id))[t].x.message.phrase);
  test('B01 — la suivante vise une rep de moins', () => {
    expect(phrase('B01', 1)).toBe('79 kg × 12 à fond : la suivante vise 11.');
  });
  test('B04 — plus lourd, à fond : pas d’élan, la suite reste au plan', () => {
    expect(phrase('B04', 1)).toBe('84 kg × 12 à fond : la suite reste à 79 kg × 12.');
  });
  test('B06 — la proposition prise à fond : la suite revient à la charge de travail, sans « pas encore »', () => {
    expect(phrase('B06', 2)).toBe('81,3 kg × 12 à fond : la suite revient à 79 kg × 12.');
  });
  test('B09 — « la suite » se lit après la règle : le test vient de passer à 9', () => {
    expect(phrase('B09', 1)).toBe('81,3 kg × 10 à fond : la suite reste à 81,3 kg × 9.');
  });
  // ⚠️ AJOUTÉ APRÈS LE BANC DE MUTATION (M4). B08 (79 × 15 à fond) ne compte
  // que 2 reps de marge : il ne dirait rien même sans la règle. À 79 × 16 à
  // fond, la marge comptée est de 3 — seule la règle « à fond » tait « ton test
  // arrive avec de la marge ».
  test('⚠️ DISCRIMINANT — 79 × 16 à fond juste avant le test (3 reps de marge comptées) : pas de « ton test arrive »', () => {
    const c = cas('B08');
    // La série 2, juste avant la ligne de test (la série 3).
    const e = jouerCas(c, [{ charge: 79, reps: 12 }, { charge: 79, reps: 16, rpe: 10 }])[2];
    expect(e.x.reaction.message).toBeNull();
    expect(e.erreurs).toEqual([]);
    // Témoin : sans effort noté, 79 × 15 (3 de marge) fait parler le test.
    expect(jouerCas(c, [{ charge: 79, reps: 12 }, { charge: 79, reps: 15 }])[2].x.reaction.message)
      .toMatchObject({ type: 'test_suit', rang: 2 });
  });

  test('⚠️ DISCRIMINANT — B11 : un RPE de 9,5 n’est pas « à fond » : rien ne change', () => {
    const e = jouerCas(cas('B11'));
    expect(vue(e[1].x).lignes).toEqual(vue(e[0].x).lignes);
    expect(e[1].x.reaction.message).toBeNull();
    // Témoin : le même 79 × 12 à RPE 10 (B01) change la ligne suivante.
    expect(jouerCas(cas('B01'))[1].x.lignes[1].vise).toBe(11);
  });
});

// ── LES PARIS ET LEUR OBSERVATION ───────────────────────────────────────────
describe('68B — les paris d’une ligne « à fond » ; l’observation sur les reps faites', () => {
  test('B01 complété (79 × 12 RPE 10, puis 79 × 11) : le pari de la série 2 vise 11, source « a_fond », observé 11', () => {
    const c = cas('B01');
    const etapes = jouerCas(c, [{ charge: 79, reps: 12, rpe: 10 }, { charge: 79, reps: 11 }]);
    etapes.forEach((e, t) => expect({ etape: t, erreurs: e.erreurs }).toEqual({ etape: t, erreurs: [] }));
    const q = etapes[2].paris[1];
    expect(q.valeur_predite).toBe(11);
    expect(q.fondement).toMatchObject({ source: 'a_fond', role: 'ligne', charge: 79, revision: 2,
      declencheur: { rang: 1, charge: 79, reps: 12 } });
    const s2 = etapes[2].series[1];
    expect(M.observationDe(q.fondement, { enBase: true, id: s2.id, charge: s2.charge_kg, reps: s2.reps }))
      .toEqual({ set_observe: s2.id, valeur_observee: 11 });
    // Relue dans son pari, la ligne figée reste « à fond ».
    expect(etapes[2].x.lignes[1]).toMatchObject({ role: 'ligne', vise: 11, source: 'a_fond', figee: true });
  });

  test('⚠️ DISCRIMINANT — B06 : le pari de la série 2 (81,3 × 12 à fond, visée 10) est observé 12, les reps faites', () => {
    const etapes = jouerCas(cas('B06'));
    const q = etapes[2].paris[1];
    expect(q.fondement).toMatchObject({ role: 'coach', charge: 81.3 });
    expect(q.valeur_predite).toBe(10);
    const s2 = etapes[2].series[1];
    expect(s2.rpe).toBe(10);
    // Ce que l'app passe à l'observation : les reps saisies (MOTEUR §9.11 révisé).
    expect(M.observationDe(q.fondement, { enBase: true, id: s2.id, charge: s2.charge_kg, reps: s2.reps }).valeur_observee)
      .toBe(12);
  });

  test('B06 complété : la suite revenue à 79 se fait à 79, les invariants tiennent à chaque étape', () => {
    const c = cas('B06');
    const etapes = jouerCas(c, c.faites.concat([{ charge: 79, reps: 12 }, { charge: 79, reps: 12 }]));
    etapes.forEach((e, t) => expect({ etape: t, erreurs: e.erreurs }).toEqual({ etape: t, erreurs: [] }));
    const fin = etapes[etapes.length - 1];
    expect(fin.x.lignes.map((l) => l.role)).toEqual(['ligne', 'coach', 'retour', 'retour']);
  });
});

// I10 lit les reps FAITES (§9.14 ter) : 81,3 × 10 à fond, visée 10 — comptée 9,
// sous le bas, mais faite au bas de la zone : la montée a tenu, et un constat
// qui dirait « Pas encore » la contredirait.
describe('68B — I10 : la montée prise à fond a tenu sur ses reps faites', () => {
  test('⚠️ DISCRIMINANT — 81,3 × 10 à fond sur la ligne du coach : un constat « Pas encore » contredit la montée', () => {
    const c = cas('B06');
    const faites = [{ charge: 79, reps: 15 }, { charge: 81.3, reps: 10, rpe: 10 }, { charge: 79, reps: 12 }, { charge: 79, reps: 12 }];
    const etapes = jouerCas(c, faites);
    etapes.forEach((e, t) => expect({ etape: t, erreurs: e.erreurs }).toEqual({ etape: t, erreurs: [] }));
    const fin = etapes[etapes.length - 1];
    const plan = { exercices: [Object.assign({}, fin.x, { constat: { verdict: 'Pas encore : 79 kg × 15, 12, 12.',
      montee: null, suiteCharges: [79, null], suiteEtat: 'progression' } })] };
    expect(T.verifierPlan(plan).erreurs.join(' ')).toMatch(/I10 — .*une montée du coach a tenu à 81\.3/);
  });
});

// ── CE QUI SE DIT : LES REPS FAITES, « SANS MARGE » (MOTEUR §17.4 révisé) ────
describe('68B — les phrases sur les reps faites : « sans marge », jamais « pas encore » pour des reps faites', () => {
  const de = (id) => JSON.parse(JSON.stringify(CONSIGNES.find((x) => x.id === id)));
  const pour = (seances, avant, equipement) => M.consigneApresAFond(seances, avant,
    { reglage: 'normal', equipement: equipement || 'barre', correction: null });

  test('la note de la série à fond : « 125 kg × 5, sans marge », la même phrase pour un RPE et un ressenti (79 ; X1, X6)', () => {
    ['X1', 'X6'].forEach((id) => {
      const c = de(id);
      const k = pour(c.seances, c.avant);
      expect(k.fondement.serieAFond).toMatchObject({ charge: 125, reps: 5, niveauFait: 5 });
      expect(esp(M.libellesConsigne(k, c.avant).gris)).toBe(id === 'X1'
        ? '125 kg × 5, sans marge : on ne rajoute pas de rep.'
        : '125 kg × 5, sans marge : on ne rajoute pas de rep.');
    });
  });

  test('⚠️ DISCRIMINANT — une série à fond qui n’a pas abaissé le niveau : aucune note, la phrase habituelle', () => {
    const c = de('X1');
    c.seances[4].series = [{ charge_kg: 125, reps: 4, role: 'palier' }, { charge_kg: 125, reps: 4, role: 'palier' },
      { charge_kg: 125, reps: 4, rpe: 10, role: 'palier' }];
    const k = pour(c.seances, c.avant);
    expect(k.fondement.serieAFond).toBeUndefined();
    expect(esp(M.libellesConsigne(k, c.avant).gris)).toBe('Le 13 sept. : 125 kg × 4, 4, 4. Une rep de plus.');
  });

  // ── 74 (11/10/2026) — INVERSÉS. Les quatre tests suivants prouvaient « une
  // rep de moins » : un test à fond compté sous le bas de la zone (« … à RPE
  // 10, sans marge », l'étirement, le constat « au bas de ta zone, sans
  // marge »), et une rep de plus faite mais non comptée (« tenu, sans
  // marge »). Une série à fond compte désormais ses reps : le test est TENU,
  // et le coach ne recule pas à cause de lui (MOTEUR §17.4, révisé). Les
  // phrases 68B ne sont pas touchées : leur déclencheur ne se produit plus
  // ici. Elles restent jouées là où un plafond ramène le calcul prudent (X1,
  // X6, X10 plus haut ; le cas réel, `v2-sans-marge-74.test.js`).
  test('74 — un test fait à fond au bas de la zone est TENU : gardé à sa charge et à ses reps, plus de recul (X8, N7)', () => {
    ['X8', 'N7'].forEach((id) => {
      const c = de(id);
      c.seances[4].series[2] = { charge_kg: 130, reps: 3, rpe: 10, role: 'exploration' };
      const k = pour(c.seances, c.avant);
      expect(k.etat).toBe('garde');
      expect(k.fondement.test).toEqual({ charge: 130, reps: 3, niveau: 3, date: '2026-09-13T18:00:00+00:00' });
      expect(k.haut).toEqual({ charge: 130, vise: 3, k: 1 });
      expect(esp(M.libellesConsigne(k, c.avant).gris))
        .toBe('Ton test à 130 kg, le 13 sept., est au bas de ta zone : on le garde sur la dernière série.');
    });
    const x8 = de('X8');
    x8.seances[4].series[2] = { charge_kg: 130, reps: 3, rpe: 10, role: 'exploration' };
    expect(esp(M.pourquoiConsigne(pour(x8.seances, x8.avant), 'normal', x8.avant).etat)).toBe(
      'Ton test : 130 kg × 3, sans marge. Le bas de ta zone : il tient. On le garde sur la dernière série ; à 4 reps, il gagnera une série.');
    // Témoin : 130 × 2 faits, sans effort noté — pas encore dans la zone.
    const t = de('X8');
    expect(esp(M.libellesConsigne(pour(t.seances, t.avant), t.avant).gris)).toBe('Le 13 sept. : 130 kg × 2, pas encore dans ta zone.');
  });

  test('74 — plus d’étirement sur un test fait à fond au bas de la zone : il est gardé (N8)', () => {
    const c = de('N8');
    c.seances[4].series[2] = { charge_kg: 32, reps: 10, rpe: 10, role: 'exploration' };
    const k = pour(c.seances, c.avant, 'haltere');
    expect(k.etat).toBe('garde');
    expect(k.haut).toEqual({ charge: 32, vise: 10, k: 1 });
    expect(esp(M.pourquoiConsigne(k, 'normal', c.avant).etat)).toMatch(/^Ton test : 32 kg × 10, sans marge\. Le bas de ta zone : il tient\. /);
  });

  test('74 — le constat : un test fait à fond au bas de la zone se dit tenu, et se garde', () => {
    const c = de('N7');
    const avant = pour(c.seances, '2026-09-20T09:00:00+00:00');
    expect(avant.etat).toBe('retest_un_cran');
    const jour = { debut: '2026-09-20T10:00:00+00:00', fin: '2026-09-20T11:00:00+00:00', palier: 125, series: [
      { charge_kg: 125, reps: 5, role: 'palier' }, { charge_kg: 125, reps: 5, role: 'palier' },
      { charge_kg: 127.5, reps: 3, rpe: 10, role: 'exploration' }] };
    const apres = pour(c.seances.concat([jour]), '2026-09-27T10:00:00+00:00');
    expect([apres.etat, apres.haut]).toEqual(['garde', { charge: 127.5, vise: 3, k: 1 }]);
    const k = M.constatDuJour(avant, apres, 'normal', null, {}, '2026-09-20T10:00:00+00:00');
    expect(esp(k.verdict)).toBe('127,5 kg : 3 aujourd\'hui, au bas de ta zone.');
    expect(esp(k.suite)).toBe('Prochaine séance : 125 kg × 5, puis 127,5 kg × 3 sur la dernière série.');
  });

  test('⚠️ DISCRIMINANT (74) — le constat : la rep de plus faite à fond est GAGNÉE, et la suite ne monte pas sur elle', () => {
    const c = de('X1');
    c.seances[4].series = [{ charge_kg: 125, reps: 4, role: 'palier' }, { charge_kg: 125, reps: 4, role: 'palier' },
      { charge_kg: 125, reps: 4, role: 'palier' }];
    const avant = pour(c.seances, '2026-09-20T09:00:00+00:00');
    expect([avant.etat, avant.niveau]).toEqual(['progression', 4]);
    const jour = (rpe) => ({ debut: '2026-09-20T10:00:00+00:00', fin: '2026-09-20T11:00:00+00:00', palier: 125, series: [
      { charge_kg: 125, reps: 5, role: 'palier' }, Object.assign({ charge_kg: 125, reps: 5, role: 'palier' }, rpe ? { rpe: rpe } : {}),
      { charge_kg: 125, reps: 5, role: 'palier' }] });
    const apres = pour(c.seances.concat([jour(10)]), '2026-09-27T10:00:00+00:00');
    // Le niveau = les reps faites (68B : 4).
    expect(apres.niveau).toBe(5);
    expect(esp(M.constatDuJour(avant, apres, 'normal', null, {}, '2026-09-20T10:00:00+00:00').verdict))
      .toBe('125 kg : 4 reps le 13 sept., 5 aujourd\'hui, le haut de ta zone.');
    // … mais pas de test plus lourd (plafond 2) : la note « sans marge » de 68B.
    expect([apres.etat, apres.haut, apres.ligne]).toEqual(['progression', null, { charge: 125, vise: 5 }]);
    expect(esp(M.libellesConsigne(apres, '2026-09-27T10:00:00+00:00').gris))
      .toBe('125 kg × 5, sans marge : on ne rajoute pas de rep.');
    // Témoin : sans effort noté, le même constat, et le test du cran au-dessus.
    const sans = pour(c.seances.concat([jour(null)]), '2026-09-27T10:00:00+00:00');
    expect([sans.etat, sans.haut]).toEqual(['test_propose', { charge: 127.5, vise: 3, k: 1 }]);
    expect(esp(M.constatDuJour(avant, sans, 'normal', null, {}, '2026-09-20T10:00:00+00:00').verdict))
      .toBe('125 kg : 4 reps le 13 sept., 5 aujourd\'hui, le haut de ta zone.');
  });
});
