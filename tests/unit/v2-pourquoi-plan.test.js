/** @jest-environment node */
//
// 49-U6 (C5) — la feuille « Pourquoi » lit le plan (ECRAN §3.10, delta 49-14
// W1) ; I7 et les révisions (W3) ; la virgule décimale ; le pré-remplissage
// hors routine (une seule règle, `THPlan.seriesDeDepart`).
//
//   1. la feuille sur des plans GÉNÉRÉS : elle décrit exactement les lignes
//      de la grille, après chaque geste (I6 étendu), et on compte ce qu'elle a
//      éprouvé — des lignes du coach, des retours, des lignes figées ;
//   2. des feuilles FORGÉES : chaque écart est vu (nombre, charge, visée, rôle) ;
//   3. I7 : une série dévalidée puis revalidée sous une autre révision porte
//      deux paris, et c'est permis ; deux paris de la MÊME révision, non ;
//   4. aucune phrase générée n'écrit un point décimal ;
//   5. le pré-remplissage.

require('../../v2/js/modele.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const T = require('../../v2/js/plan.js');

const AVANT = '2026-09-26T10:00:00+00:00';
const APRES = '2026-09-26T12:00:00+00:00';
const I6 = (v) => v.erreurs.filter((e) => e.indexOf('I6 ') === 0);

// Le simulateur de `v2-plan-seance`, réduit : les paris écrits comme l'app les
// écrit (lus sur le plan à la validation), et la dévalidation.
function simulateur(slug, consigneObj, series, types, suiteDe) {
  let n = 0;
  const id = () => slug + '-s' + (++n);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, slug, id, { series: series });
  (types || []).forEach((t, i) => { if (t !== 'travail') se = S.changerType(se, 0, i, t); });
  const paris = [];
  const api = {
    paris,
    entrees: () => {
      const travail = se.exercices[0].series.filter((x) => S.typeDe(x) === 'travail');
      const fini = travail.length && travail.every((x) => S.partEnBase(x));
      return { seance: { id: 'S', debut: AVANT, edition: false, exercices: se.exercices },
        consignes: { [slug]: consigneObj }, paris: paris.slice(),
        suites: suiteDe && fini ? { [slug]: suiteDe(travail) } : {} };
    },
    plan: () => T.planDeSeance(api.entrees()),
    exo: () => api.plan().exercices[0],
    avant: null,
    verifier: () => {
      const e = api.entrees();
      const p = T.planDeSeance(e);
      const v = T.verifierPlan(p, e, api.avant);
      api.avant = p;
      return v;
    },
    series: () => se.exercices[0].series,
    valider: (i, kg, reps) => {
      se = S.modifierSerie(se, 0, i, { charge_kg: kg, reps: reps });
      se = S.valider(se, 0, i, new Date('2026-09-26T10:30:00Z'));
      const x = api.exo();
      if (!x.consigne || !x.paris || !x.paris[i]) return null;
      const q = Object.assign({}, x.paris[i], { set_observe: api.series()[i].id });
      paris.push(q);
      return q;
    },
    // Comme l'app : la dévalidation repose l'observation VIDE des paris de la
    // série (§9.11) — le pari reste, non observé.
    devalider: (i) => {
      const sid = se.exercices[0].series[i].id;
      se = S.devalider(se, 0, i);
      paris.forEach((p, k) => { if (p.set_observe === sid) paris[k] = Object.assign({}, p, { set_observe: null }); });
    }
  };
  return api;
}

// Les consignes des cas figés de 48b-7, avec leur suite (comme `v2-plan-seance`).
const CAS = require('./fixtures/consigne-48b7.json');
const CONSIGNES = CAS.map((c) => {
  const opts = { reglage: c.reglage, equipement: c.equipement, correction: c.correction };
  const k = M.consignePour(c.seances, c.avant, opts);
  const suiteDe = (faites) => {
    const tous = c.seances.concat(M.contratDe([{ seance: { debut: AVANT }, series: faites }], null, 'charge_reps'));
    const apres = M.consignePour(tous, APRES, opts);
    const P = apres.palier;
    return { consigne: apres,
      cranSuivant: P === null || P === undefined ? null : M.chargeVoisine(tous, APRES, P, c.equipement, 1) };
  };
  return { id: c.id, reglage: c.reglage, suiteDe, obj: { consigne: k, libelles: M.libellesConsigne(k),
    contexte: M.contexteReaction(c.seances, c.avant, k, c.equipement, null) } };
});
const SUITES = [
  ['plan', 'plan', 'plan', 'plan'],
  ['+3', 'accepte', 'plan', 'plan'],
  ['+5', 'refuse', 'plan', '+3'],
  ['+3', 'plan', '+3', 'lourd'],
  ['+3', 'accepte-bas', 'plan', 'plan']
];

// Toutes les phrases qu'un plan fait dire à l'écran, feuille comprise.
function phrasesDu(x, reglage) {
  const out = [];
  const push = (v) => { if (typeof v === 'string' && v) out.push(v); };
  (x.entete.jaune || []).forEach(push);
  push(x.entete.gris);
  push(x.donc);
  if (x.message) push(M.phraseReaction(x.message));
  if (x.constat) { push(x.constat.verdict); push(x.constat.suite); }
  if (x.pourquoi) {
    push(x.pourquoi.donc);
    x.pourquoi.lignes.forEach((l) => { push(l.texte); push(l.libelle); push(l.raison); push(l.faite); });
  }
  if (x.consigne && x.consigne.fondement) {
    const pq = M.pourquoiConsigne(x.consigne, reglage);
    if (pq) Object.keys(pq).forEach((k) => push(pq[k]));
  }
  return out;
}

function jouer(chaquePlan) {
  CONSIGNES.forEach(({ id, reglage, obj, suiteDe }) => {
    [3, 4].forEach((n) => {
      SUITES.forEach((suite, iSuite) => {
        const sim = simulateur('x', obj, n, null, suiteDe);
        const voir = (quand) => chaquePlan(sim, id + ' · ' + n + ' · suite ' + iSuite + ' · ' + quand, reglage);
        voir('ouverture');
        sim.series().forEach((s, i) => {
          const x = sim.exo();
          const l = x.lignes[i];
          const geste = suite[Math.min(i, suite.length - 1)];
          const P0 = obj.consigne && obj.consigne.ligne ? obj.consigne.ligne.charge : 50;
          let kg = l.charge === null || l.charge === undefined ? (P0 || 50) + 2.5 : l.charge;
          let reps = l.vise || (l.fourchette ? l.fourchette[0] : 8) || 8;
          if (geste === '+3') reps += 3;
          if (geste === '+5') reps += 5;
          if (geste === 'lourd') kg += 5;
          if (geste === 'refuse' && l.proposee) kg = P0 || kg;
          if (geste === 'accepte-bas' && l.proposee) reps = Math.max(1, (l.fourchette ? l.fourchette[0] : reps) - 1);
          sim.valider(i, kg, reps);
          voir('série ' + i + ' ' + geste);
        });
      });
    });
  });
}

// ── 1. LA FEUILLE SUR DES PLANS GÉNÉRÉS ─────────────────────────────────────
describe('49-U6 — la feuille décrit exactement les lignes de la grille (plans générés)', () => {
  test('⚠️ DISCRIMINANT — après chaque geste, la feuille et la grille disent les mêmes lignes', () => {
    const echecs = [];
    const vu = { plans: 0, coach: 0, raisonCoach: 0, retour: 0, figees: 0, differeDeN: 0 };
    jouer((sim, ou) => {
      vu.plans++;
      const v = sim.verifier();
      if (I6(v).length) echecs.push(ou + ' : ' + I6(v)[0]);
      const x = sim.exo();
      if (!x.pourquoi || x.consigne.etat === 'silence') return;
      const grille = x.lignes.filter((l) => l.role !== 'hors');
      // La feuille, lue directement : même nombre, mêmes charges et visées.
      expect([ou, x.pourquoi.lignes.map((f) => [f.rang, f.role, f.charge, f.vise])])
        .toEqual([ou, grille.map((l) => [l.rang, l.role, l.charge === undefined ? null : l.charge, l.vise === undefined ? null : l.vise])]);
      x.pourquoi.lignes.forEach((f, k) => {
        if (f.role === 'coach') { vu.coach++; if (/^proposée après /.test(f.raison)) vu.raisonCoach++; }
        if (f.role === 'retour') { vu.retour++; expect(f.raison).toMatch(/^on revient à /); }
        if (grille[k].figee) vu.figees++;
      });
      // Le `n` de la consigne brute ne décrit pas la séance quand elle en diffère.
      if (x.consigne.n && x.consigne.n !== grille.length) vu.differeDeN++;
    });
    expect(echecs.slice(0, 5)).toEqual([]);
    // Ce que la feuille a éprouvé — sans quoi ce test ne verrait rien.
    expect(vu.plans).toBeGreaterThan(500);
    expect(vu.coach).toBeGreaterThan(20);
    expect(vu.raisonCoach).toBeGreaterThan(10);
    expect(vu.retour).toBeGreaterThan(5);
    expect(vu.figees).toBeGreaterThan(100);
    expect(vu.differeDeN).toBeGreaterThan(10);
    // eslint-disable-next-line no-console
    console.log('49-U6 feuille ' + JSON.stringify(vu));
  });

  test('en silence, la feuille ne décrit aucune ligne', () => {
    const k = { etat: 'silence', raison: 'premiere_fois' };
    const x = simulateur('x', { consigne: k, libelles: M.libellesConsigne(k) }, 3).exo();
    if (x.pourquoi) expect(x.pourquoi).toEqual({ donc: null, lignes: [] });
  });
});

// ── 2. DES FEUILLES FORGÉES ─────────────────────────────────────────────────
describe('49-U6 — verifierPlan voit une feuille qui ne décrit pas la grille (I6)', () => {
  const C = { consigne: { etat: 'garde', zone: 'lourd', palier: 125, niveau: 5, n: 3,
    ligne: { charge: 125, vise: 5 }, haut: { charge: 130, vise: 4, k: 1 }, fondement: {} },
    contexte: { cran: 127.5, haut: null }, libelles: { jaune: [], gris: '' } };
  const base = () => JSON.parse(JSON.stringify(simulateur('x', C, 3).plan()));
  const i6 = (plan) => I6(T.verifierPlan(plan)).filter((e) => /la feuille/.test(e));

  test('prémisse : la feuille d’origine passe, et elle porte trois lignes', () => {
    const p = base();
    expect(p.exercices[0].pourquoi.lignes).toHaveLength(3);
    expect(T.verifierPlan(p)).toEqual({ ok: true, erreurs: [] });
  });

  test('⚠️ DISCRIMINANT — une feuille qui décrit le `n` de la consigne brute (4 lignes pour une grille à 3)', () => {
    const p = base();
    const f = p.exercices[0].pourquoi.lignes;
    f.splice(2, 0, Object.assign({}, f[1]));
    expect(i6(p)).toHaveLength(1);
  });

  test('une ligne en moins', () => {
    const p = base();
    p.exercices[0].pourquoi.lignes.pop();
    expect(i6(p)).toHaveLength(1);
  });

  test('une autre charge, une autre visée, un autre rôle', () => {
    const a = base(); a.exercices[0].pourquoi.lignes[0].charge = 127.5;
    expect(i6(a)).toHaveLength(1);
    const b = base(); b.exercices[0].pourquoi.lignes[2].vise = 5;
    expect(i6(b)).toHaveLength(1);
    const c = base(); c.exercices[0].pourquoi.lignes[1].role = 'coach';
    expect(i6(c)).toHaveLength(1);
  });

  test('deux lignes permutées (même ordre exigé)', () => {
    const p = base();
    const f = p.exercices[0].pourquoi.lignes;
    p.exercices[0].pourquoi.lignes = [f[2], f[1], f[0]];
    expect(i6(p).length).toBeGreaterThanOrEqual(1);
  });
});

// ── 2 bis. LES LIGNES DE LA FEUILLE, DITES ─────────────────────────────────
describe('49-U6 — ce que la feuille dit d’une proposition du coach', () => {
  const C = { consigne: { etat: 'garde', zone: 'lourd', palier: 125, niveau: 5, n: 3,
    ligne: { charge: 125, vise: 5 }, haut: { charge: 130, vise: 4, k: 1 }, fondement: {} },
    contexte: { cran: 127.5, haut: null }, libelles: { jaune: [], gris: '' } };
  const nb = (s) => (s === null || s === undefined ? s : String(s).replace(/[  ]/g, ' '));

  test('125 × 8 : la ligne 2 est « proposée après 125 kg × 8 », à la charge proposée (celle du test, I14)', () => {
    const sim = simulateur('x', C, 3);
    sim.valider(0, 125, 8);
    const x = sim.exo();
    const f = x.pourquoi.lignes;
    expect(x.lignes[1].role).toBe('coach');
    expect(nb(f[0].faite)).toBe('faite : 125 kg × 8');
    expect(f[1].role).toBe('coach');
    expect(nb(f[1].raison)).toBe('proposée après 125 kg × 8');
    expect(f[1].charge).toBe(x.lignes[1].charge);
    expect(nb(f[1].texte)).toBe('130 kg × 3 à 5');
    // La feuille décrit la ligne FIGÉE telle qu'elle a été validée.
    sim.valider(1, 130, 4);
    const y = sim.exo();
    expect(y.lignes[1].figee).toBe(true);
    expect(nb(y.pourquoi.lignes[1].faite)).toBe('faite : 130 kg × 4');
    expect(y.pourquoi.lignes[1].charge).toBe(130);
    expect(nb(y.pourquoi.lignes[1].raison)).toBe('proposée après 125 kg × 8');
  });
});

// ── 3. I7 ET LES RÉVISIONS ──────────────────────────────────────────────────
describe('49-U6 — I7 : un pari de la révision que la ligne affichait (delta 49-14 W3)', () => {
  const C = { consigne: { etat: 'garde', zone: 'lourd', palier: 125, niveau: 5, n: 3,
    ligne: { charge: 125, vise: 5 }, haut: { charge: 130, vise: 4, k: 1 }, fondement: {} },
    contexte: { cran: 127.5, haut: null }, libelles: { jaune: [], gris: '' } };
  const i7 = (v) => v.erreurs.filter((e) => e.indexOf('I7 ') === 0);

  function devalideeRevalidee() {
    const sim = simulateur('x', C, 3);
    // La série 2 validée d'abord, sans proposition : un pari de révision 0.
    const q0 = sim.valider(1, 125, 5);
    // Dévalidée ; la série 1 fait 125 × 8 → le coach propose la ligne 2.
    sim.devalider(1);
    sim.valider(0, 125, 8);
    const x = sim.exo();
    // Revalidée sous la proposition : un pari de révision 1, à côté du premier.
    const q1 = sim.valider(1, x.lignes[1].charge, 4);
    return { sim, q0, q1, x };
  }

  test('prémisse : le rang 2 porte deux paris, révision 0 puis révision 1', () => {
    const { q0, q1, x } = devalideeRevalidee();
    expect(x.lignes[1].role).toBe('coach');
    expect([q0.fondement.rang, q0.fondement.revision || 0]).toEqual([2, 0]);
    expect([q1.fondement.rang, q1.fondement.revision]).toEqual([2, 1]);
  });

  test('⚠️ DISCRIMINANT — dévalidée puis revalidée sous une autre révision : I7 passe', () => {
    const { sim } = devalideeRevalidee();
    expect(i7(sim.verifier())).toEqual([]);
  });

  test('⚠️ DISCRIMINANT — deux paris de la MÊME révision au même rang : I7 le voit', () => {
    const { sim, q1 } = devalideeRevalidee();
    sim.paris.push(Object.assign({}, q1, { id: 'doublon' }));
    expect(i7(sim.verifier()).length).toBeGreaterThanOrEqual(1);
  });

  test('aucun pari de la révision affichée (seul celui de l’autre) : I7 le voit', () => {
    const { sim, q1 } = devalideeRevalidee();
    sim.paris.splice(sim.paris.indexOf(q1), 1);
    expect(i7(sim.verifier()).length).toBeGreaterThanOrEqual(1);
  });
});

// ── 4. LA VIRGULE DÉCIMALE ──────────────────────────────────────────────────
describe('49-U6 — aucune phrase générée n’écrit un point décimal', () => {
  test('⚠️ DISCRIMINANT — en-tête, message, constat, feuille : jamais « 38.3 »', () => {
    const fautes = [];
    let phrases = 0, decimales = 0;
    jouer((sim, ou, reglage) => {
      phrasesDu(sim.exo(), reglage).forEach((p) => {
        phrases++;
        if (/\d,\d/.test(p)) decimales++;
        if (/\d\.\d/.test(p)) fautes.push(ou + ' : ' + p);
      });
    });
    expect(fautes.slice(0, 5)).toEqual([]);
    // Le balayage a vu des nombres décimaux — sinon il ne prouve rien.
    expect(phrases).toBeGreaterThan(2000);
    expect(decimales).toBeGreaterThan(100);
  });

  test('une reprise longue à 38,3 kg se dit avec une virgule', () => {
    const p = M.phraseReaction({ type: 'propose', rang: 1, charge: 38.3, reps: 12, charges: [40.8], marge: 3 }, 'lourd');
    expect(p).toMatch(/^38,3\s×\s12/);
    expect(p).toMatch(/40,8/);
    expect(p).not.toMatch(/\d\.\d/);
    expect(M.phraseReaction({ type: 'pas_encore', rang: 1, charge: 38.3, reps: 5, palier: 38.3 }))
      .toMatch(/on reprend à 38,3\.$/);
  });
});

// ── 5. LE PRÉ-REMPLISSAGE HORS ROUTINE ──────────────────────────────────────
describe('49-U6 — le pré-remplissage lit une seule règle (`THPlan.seriesDeDepart`)', () => {
  const prec = { series: [{ type_serie: 'echauffement' }, { type_serie: 'travail' }, { type_serie: 'travail' }] };

  test('l’habitude de la consigne figée d’abord', () => {
    expect(T.seriesDeDepart({ etat: 'garde', n: 4 }, prec, 'progresser')).toBe(4);
  });

  test('sans consigne, les séries de travail de la dernière séance ; sans historique, l’intention', () => {
    expect(T.seriesDeDepart(null, prec, 'progresser')).toBe(2);
    expect(T.seriesDeDepart(null, null, 'progresser')).toBe(T.SERIES_DEPART_PROGRESSER);
    expect(T.seriesDeDepart(null, null, 'entretien')).toBe(T.SERIES_DEPART_ENTRETIEN);
    expect([T.SERIES_DEPART_PROGRESSER, T.SERIES_DEPART_ENTRETIEN]).toEqual([3, 2]);
  });

  test('un `n` qui n’est pas un entier ≥ 1 ne décide pas', () => {
    expect(T.seriesDeDepart({ etat: 'silence', raison: 'premiere_fois' }, prec, 'progresser')).toBe(2);
    expect(T.seriesDeDepart({ etat: 'garde', n: 0 }, null, 'progresser')).toBe(3);
    expect(T.seriesDeDepart({ etat: 'garde', n: 2.5 }, null, 'entretien')).toBe(2);
  });

  test('RÈGLE DE STRUCTURE — l’app et le rendu ne lisent jamais `consigne.n` eux-mêmes', () => {
    // Le nombre de séries d'une consigne ne sort du moteur que par le plan
    // (la grille, la feuille) ou par `THPlan.seriesDeDepart` (l'ajout hors
    // routine). Une lecture directe ici redonnerait une seconde règle, qui
    // dériverait de la première au premier changement. Une règle de structure
    // se vérifie sur la structure : on lit le source, commentaires ôtés.
    const fs = require('fs');
    const path = require('path');
    ['app.js', 'rendu.js'].forEach((f) => {
      const src = fs.readFileSync(path.join(__dirname, '../../v2/js', f), 'utf8')
        .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
      expect([f, src.match(/consigne\)?\.n\b/g)]).toEqual([f, null]);
    });
  });

  test('`seance.js` ne porte plus la règle', () => {
    expect(S.seriesDeDepart).toBeUndefined();
    expect(S.SERIES_DEPART_PROGRESSER).toBeUndefined();
  });
});
