/** @jest-environment node */
//
// 68A — le coach quand on s'écarte du plan (MOTEUR §9.14 bis, §9.13 bis
// révisé, ECRAN-SAISIE §3.12 ; invariants I11 révisé, I41, I42, I43).
//
// LE FICHIER DE CAS FAIT FOI. `cas-68-ecarts.json` sort de la référence
// `ref68.py` (Claude.ai, 11/10/2026) : 18 cas, l'attendu à chaque étape (0,
// 1, … séries validées) — lignes, fantômes, message (type et clés). Un cas qui
// semble faux se rapporte ; il ne se corrige pas ici.
//
// ⚠️ LE VRAI CHEMIN, comme `v2-reprise-plan` : une séance de `seance.js`,
// chaque validation écrit son pari comme l'app (lu dans le plan, puis
// `set_observe`), et `verifierPlan` tourne à CHAQUE étape avec les entrées
// (I7) et le plan d'avant (I4) — I11, I41, I42, I43 compris —, et la garde de
// cohérence des phrases (I26) aussi.
//
// Conversions de forme seulement : la zone `{ nom, bas, haut }` devient sa clé
// (bornes vérifiées contre la table) ; `kg` du message est la `charge` du
// moteur ; les nombres se comparent au centième ; les phrases, insécables
// ramenées à des espaces.

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const CAS = require('./fixtures/cas-68-ecarts.json');

const cent = (v) => (v === null || v === undefined ? null : Math.round(Number(v) * 100) / 100);
const esp = (t) => (t === null || t === undefined ? t : t.replace(/ /g, ' '));
const arrondi = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' ? cent(v) : v)));

function consigneDuCas(k) {
  if (k.zone !== null) {
    const table = M.zoneParCle(k.zone.nom);
    expect(table).not.toBeNull();
    expect([table.bas, table.haut]).toEqual([k.zone.bas, k.zone.haut]);
  }
  return { etat: k.etat, zone: k.zone === null ? null : k.zone.nom, palier: k.palier,
    n: k.n, ligne: k.ligne, haut: k.haut };
}

// Une séance de `n` séries de travail validées dans l'ordre, chaque
// validation écrivant son pari comme l'app. Rend, à chaque étape, le plan, ses
// entrées, les erreurs de `verifierPlan` et les écarts de phrases (I26).
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
    etapes.push({ plan: p, x: p.exercices[0], erreurs: T.verifierPlan(p, e, avant).erreurs,
                  phrases: T.verifierPhrases(p), paris: paris.slice() });
    avant = p;
    if (t === faites.length) break;
    const f = faites[t];
    se = S.modifierSerie(se, 0, t, { charge_kg: f.charge, reps: f.reps });
    // L'effort se note comme dans l'app (RPE et ressenti exclusifs).
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

// ── LES 18 CAS, À CHAQUE ÉTAPE ──────────────────────────────────────────────
describe('68A — les 18 cas de ref68, à chaque étape, par le vrai chemin', () => {
  test('prémisse : 18 cas, de la référence ref68 (règles 68)', () => {
    expect(CAS.cas).toHaveLength(18);
    expect(CAS.source).toMatch(/ref68\.py/);
    // Toutes les sortes de message y sont, et des lignes d'élan.
    const types = new Set();
    let elans = 0;
    CAS.cas.forEach((c) => c.attendu.forEach((e) => {
      if (e.message) types.add(e.message.type);
      elans += e.lignes.filter((l) => l.role === 'elan').length;
    }));
    ['plus_leger', 'elan', 'pas_encore_soi', 'effort_suggere', 'propose', 'test_suit']
      .forEach((t) => expect(types.has(t)).toBe(true));
    expect(elans).toBeGreaterThan(10);
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
          ['prevue', 'palier', 'a_fond', 'retour', 'marge'].forEach((cle) => {
            if (a.message[cle] !== undefined) expect({ etape: t, [cle]: arrondi(m[cle]) }).toEqual({ etape: t, [cle]: arrondi(a.message[cle]) });
          });
          // La phrase affichée est celle du message, sur la ligne qu'il vise.
          expect(x.message && x.message.type).toBe(m.type);
        }
        expect({ etape: t, erreurs: etapes[t].erreurs }).toEqual({ etape: t, erreurs: [] });
        expect({ etape: t, phrases: etapes[t].phrases }).toEqual({ etape: t, phrases: [] });
      });
    });
  });
});

// ── LES PHRASES, AU MOT PRÈS (MOTEUR §9.14 bis) ─────────────────────────────
describe('68A — les phrases de l’écart, au mot près', () => {
  const phrase = (id, t) => esp(jouerCas(cas(id))[t].x.message.phrase);
  test('N01 — plus léger', () => {
    expect(phrase('N01', 1)).toBe('73 kg × 12, plus léger que prévu. La suite reste à 79 kg × 12 ; tape 73 kg si tu restes à 73 kg aujourd\'hui.');
  });
  test('N04 — l’élan, toutes les lignes suivantes', () => {
    expect(phrase('N04', 1)).toBe('84 kg × 12, au-dessus de ta charge de travail : la suite reste à 84 kg.');
  });
  test('N05 — plus lourd qui ne tient pas : pas encore', () => {
    expect(phrase('N05', 1)).toBe('84 kg × 9 : pas encore. La suite reste à 79 kg × 12.');
  });
  test('N06 — la suggestion d’effort', () => {
    expect(phrase('N06', 1)).toBe('84 kg × 10, pile au bas de ta fourchette. Si c\'était à fond, note-le : on revient à 79 kg pour la série suivante. Sinon, on garde 84 kg.');
  });
  test('N07 — à fond : jamais « pas encore » à côté d’un chiffre dans la fourchette', () => {
    expect(phrase('N07', 1)).toBe('84 kg × 10 à fond : la suite reste à 79 kg × 12.');
  });
  test('N08 — Lourd : une série de plus', () => {
    expect(phrase('N08', 1)).toBe('135 kg × 5, au-dessus de ta charge de travail : une série de plus à 135 kg.');
  });
  test('N17 — la suggestion revient à 82, la charge d’avant cette série', () => {
    expect(phrase('N17', 2)).toBe('84 kg × 10, pile au bas de ta fourchette. Si c\'était à fond, note-le : on revient à 82 kg pour la série suivante. Sinon, on garde 84 kg.');
  });
  test('plusieurs séries de plus, pas toutes ; « la suite » d’une ligne d’élan ; sans chiffre (décision 7)', () => {
    const z = 'volume';
    expect(esp(M.phraseReaction({ type: 'elan', rang: 1, charge: 84, reps: 12, series: 2, toutes: false }, z)))
      .toBe('84 kg × 12, au-dessus de ta charge de travail : 2 séries de plus à 84 kg.');
    expect(esp(M.phraseReaction({ type: 'pas_encore_soi', rang: 1, charge: 88, reps: 9, palier: 79, a_fond: false,
      suite: { charge: 84, vise: 10, fourchette: true } }, z)))
      .toBe('88 kg × 9 : pas encore. La suite reste à 84 kg, vise 10 à 12.');
    expect(esp(M.phraseReaction({ type: 'pas_encore_soi', rang: 1, charge: 84, reps: 9, palier: 79, a_fond: false,
      suite: { charge: null, vise: 11, fourchette: false } }, z)))
      .toBe('84 kg × 9 : pas encore. La suite reste au cran au-dessus, vise 11.');
  });
  // ⚠️ AJOUTÉ APRÈS LE BANC DE MUTATION (M5). La suggestion ne se fait que
  // SANS effort noté : 84 × 10 noté RPE 8, ou « il en restait 2 », tient
  // (10 comptées) et l'effort est déjà dit — l'élan, sans la suggestion.
  test('DISCRIMINANT — pile au bas mais effort noté (RPE 8, ou un ressenti) : l’élan, pas la suggestion', () => {
    const c = cas('N06');
    [{ rpe: 8 }, { ressenti: 'reste_2' }].forEach((effort) => {
      const e = jouerCas(c, [Object.assign({ charge: 84, reps: 10 }, effort)])[1];
      expect(e.x.reaction.message).toMatchObject({ type: 'elan', rang: 1, charge: 84, reps: 10 });
      expect(e.erreurs).toEqual([]);
    });
    // Témoin : sans effort, la suggestion (N06).
    expect(jouerCas(c)[1].x.reaction.message.type).toBe('effort_suggere');
  });
  test('aucune phrase de l’écart ne finit par « ? »', () => {
    CAS.cas.forEach((c) => jouerCas(c).forEach((e) => {
      if (e.x.message) expect(e.x.message.phrase).not.toMatch(/\?\s*$/);
    }));
  });
});

// ── LES PARIS D'ÉLAN ────────────────────────────────────────────────────────
describe('68A — les paris d’une ligne d’élan', () => {
  test('N04 complété (84 × 12, 84 × 11, 84 × 10) : les paris des séries 2 et 3 sont des paris d’élan, au bas (10) ; I7 tient', () => {
    const c = cas('N04');
    const faites = [{ charge: 84, reps: 12 }, { charge: 84, reps: 11 }, { charge: 84, reps: 10 }];
    const etapes = jouerCas(c, faites);
    etapes.forEach((e, t) => expect({ etape: t, erreurs: e.erreurs }).toEqual({ etape: t, erreurs: [] }));
    const paris = etapes[3].paris;
    expect(paris).toHaveLength(3);
    expect(paris[0].fondement.role).toBe('ligne');
    [paris[1], paris[2]].forEach((q) => {
      expect(q.fondement).toMatchObject({ role: 'elan', source: 'elan', charge: 84, revision: 2 });
      expect([q.valeur_predite, q.borne_basse, q.borne_haute]).toEqual([10, 10, 12]);
      expect(q.fondement.declencheur).toMatchObject({ rang: 1, charge: 84, reps: 12 });
    });
    // Relues dans les paris, les lignes figées restent des lignes d'élan.
    expect(etapes[3].x.lignes.map((l) => l.role + ':' + l.charge + '×' + l.vise))
      .toEqual(['ligne:79×12', 'elan:84×10', 'elan:84×10']);
  });

  // Décision 3 (validée le 11/10/2026) — le déclencheur d'un pari d'élan est
  // la série plus lourde qui a POSÉ la ligne : sur N12, les lignes à 88
  // renvoient à la série 88, pas à la série 84.
  test('⚠️ DISCRIMINANT — N12 complété : les lignes à 88 renvoient à la série 88, la ligne à 84 à la série 84', () => {
    const c = cas('N12');
    const faites = c.faites.concat([{ charge: 88, reps: 11 }, { charge: 88, reps: 10 }]);
    const etapes = jouerCas(c, faites);
    etapes.forEach((e, t) => expect({ etape: t, erreurs: e.erreurs }).toEqual({ etape: t, erreurs: [] }));
    const paris = etapes[4].paris;
    expect(paris.map((q) => q.fondement.role)).toEqual(['ligne', 'elan', 'elan', 'elan']);
    expect(paris[1].fondement.charge).toBe(84);
    expect(paris[1].fondement.declencheur).toMatchObject({ rang: 1, charge: 84, reps: 12 });
    [paris[2], paris[3]].forEach((q) => {
      expect(q.fondement.charge).toBe(88);
      expect(q.fondement.declencheur).toMatchObject({ rang: 2, charge: 88, reps: 12 });
    });
  });

});

// ── L'EN-TÊTE : L'OBJECTIF DU JOUR (ECRAN-SAISIE §3.12) ─────────────────────
describe('68A — l’en-tête dit l’objectif du jour ; les autres formes et la feuille ne changent pas', () => {
  const c = (etat, haut) => ({ etat, zone: 'volume', palier: 79, n: 4, ligne: { charge: 79, vise: 12 }, haut });
  const jaune = (k, roles) => M.enteteDeDisposition(k, roles).jaune.map(esp);
  const H = { charge: 81.3, vise: 11, k: 1 };

  test('un test : « à la série que tu veux », sans « une fois »', () => {
    expect(jaune(c('garde', H), ['ligne', 'ligne', 'haut']))
      .toEqual(['Aujourd\'hui : 79 kg × 12.', 'Si ça passe, 81,3 kg × 11, à la série que tu veux.']);
  });
  test('deux tests : « sur 2 séries, celles que tu veux »', () => {
    expect(jaune(c('etend', Object.assign({}, H, { k: 2 })), ['ligne', 'ligne', 'haut', 'haut']))
      .toEqual(['Aujourd\'hui : 79 kg × 12.', 'Si ça passe, 81,3 kg × 11 sur 2 séries, celles que tu veux.']);
  });
  test('sans test, en reprise longue, tests seuls : inchangé', () => {
    expect(jaune(c('progression', null), ['ligne', 'ligne', 'ligne'])).toEqual(['79 kg × 12']);
    expect(jaune(c('reprise_longue', H), ['ligne', 'ligne', 'haut']))
      .toEqual(['79 kg × 12', 'puis 81,3 kg × 11 sur la dernière série']);
    expect(jaune(c('garde', H), ['haut', 'haut'])).toEqual(['81,3 kg × 11']);
  });
  test('`lignesJaunes` ne change pas, ni la forme de la feuille', () => {
    // `lignesJaunes` se lit par la feuille de la consigne (`pourquoiConsigne`).
    expect(esp(M.pourquoiConsigne(Object.assign(c('progression', H), { n: 3 }), 'normal', '2026-10-11T10:00:00Z').donc))
      .toBe('Donc 79 kg × 12, puis 81,3 kg × 11 sur la dernière série.');
    expect(M.enteteDeDisposition(c('garde', H), ['ligne', 'ligne', 'haut'], true).jaune.map(esp))
      .toEqual(['79 kg × 12', 'puis 81,3 kg × 11 sur la dernière série']);
  });
  test('dans le plan : l’en-tête dit l’objectif, la feuille « Pourquoi » garde « puis … sur la dernière série »', () => {
    const x = jouerCas(cas('N01'), [])[0].x;
    expect(x.entete.jaune.map(esp)).toEqual(['Aujourd\'hui : 79 kg × 12.', 'Si ça passe, 81,3 kg × 11, à la série que tu veux.']);
    expect(esp(x.pourquoi.donc)).toBe('Donc 79 kg × 12, puis 81,3 kg × 11 sur la dernière série.');
  });
});

// ── LA VERSION DE LA RÈGLE ──────────────────────────────────────────────────
describe('68A — la version des règles du moteur', () => {
  // Elle s'écrit dans la colonne `predictions.module_version` de chaque pari
  // neuf (`noterPari`, app.js) — pas dans son fondement. Le banc [C68] la
  // relit sur le pari enregistré.
  // 11 en 68A (l'élan) ; 12 depuis 68B (« à fond », MOTEUR §9.14 ter).
  test('VERSION_CONSIGNE vaut 13 (l’élan en 68A, « à fond » en 68B, les reps faites en 74)', () => {
    expect(M.MODULE_CONSIGNE).toBe('moteur.consigne');
    expect(M.VERSION_CONSIGNE).toBe(13);
  });
});
