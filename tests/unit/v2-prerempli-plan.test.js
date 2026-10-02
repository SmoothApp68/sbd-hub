/** @jest-environment node */
//
// PR 3 de la consolidation « un seul coach, un seul câblage » (relevé du
// 01/10/2026) — LE PRÉ-REMPLISSAGE UNIQUE, ET LA DÉGRESSIVE À UNE VOIX.
//
//   1. Le plan pose `l.prerempli` sur TOUTES les lignes (couvertes, chauffes,
//      dégressives, hors plan, exercice sans consigne), avec la durée et la
//      distance. L'app le lit (`fantomeDe`) ; `Seance.fantome` et
//      `Seance.planDe` ne s'appellent plus que dans le plan (garde).
//   2. MOTEUR §9.15.3 (delta 49-38) : les reps pré-remplies de la dégressive
//      sont le MILIEU de « Vise… » — la phrase et la ligne disent le même
//      chiffre —, jamais les reps de la routine ni de la fois d'avant. Les
//      chauffes gardent les reps de la routine.
//   3. L'équivalence : sur des plans générés, le pré-remplissage du plan est
//      exactement l'ancien `fantomeDe` (rejoué ici), sauf les reps des
//      dégressives — ce que le delta change, et rien d'autre.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const DEBUT = '2026-10-01T17:07:00+02:00';
const consigne = (charge, vise) => ({ etat: 'progression', zone: vise >= 13 ? 'volume' : 'hypertrophie', palier: charge,
  niveau: vise - 1, n: 2, ligne: { charge, vise }, haut: null, fondement: {} });
const CATALOGUE = { extension_jambes: { equipement: 'machine', muscles_primaires: ['quadriceps'] },
  developpe_couche_barre: { equipement: 'barre', muscles_primaires: ['pectoraux'] },
  curl: { equipement: 'haltere', muscles_primaires: ['biceps'] } };

// Une séance d'un exercice : `chauffes` (reps de la routine), `travail`
// séries, `degressives` (reps de la routine), et ce qu'elle porte d'autre.
function seance(o) {
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, o.slug, id, { series: o.travail });
  (o.degressives || []).forEach((reps) => {
    se = S.ajouterSerie(se, 0, id);
    const j = se.exercices[0].series.length - 1;
    se = S.changerType(se, 0, j, 'degressive');
    se.exercices[0].series[j].reps_visees = reps;
  });
  if (o.chauffes) se = S.insererChauffes(se, 0, o.chauffes.map((r) => [0, r]), id);
  return se;
}
const plan = (se, slug, k, extra) => T.planDeSeance(Object.assign({
  seance: { id: 'S', debut: DEBUT, edition: false, exercices: se.exercices },
  consignes: k ? { [slug]: { consigne: k, pas: 5 } } : {}, catalogue: CATALOGUE, paris: [], suites: {}
}, extra || {}));
const PREC = (series) => ({ seance: { id: 'P', debut: '2026-09-28T17:00:00+02:00' }, series });

// ── 1. LA DÉGRESSIVE À UNE VOIX ─────────────────────────────────────────────
describe('PR 3 — la dégressive : la phrase et la ligne disent le même chiffre (delta 49-38)', () => {
  test('⚠️ DISCRIMINANT — « Vise 6 à 8 » : la ligne porte 7, pas les 12 de la routine ni les 10 de la fois d’avant', () => {
    const se = seance({ slug: 'extension_jambes', travail: 2, degressives: [12] });
    const prec = PREC([{ type_serie: 'travail', charge_kg: 60, reps: 15 }, { type_serie: 'travail', charge_kg: 60, reps: 15 },
      { type_serie: 'degressive', charge_kg: 45, reps: 10 }]);
    const x = plan(se, 'extension_jambes', consigne(60, 15), { precedents: { extension_jambes: prec } }).exercices[0];
    const d = x.lignes[2];
    expect(d.type).toBe('degressive');
    expect(x.degressive.phrase).toMatch(/Vise 6 à 8\.$/);
    expect(d.prerempli.reps).toBe(7);
    expect(d.prerempli.charge_kg).toBe(45);
  });

  test('la phrase et la ligne : le même chiffre, quelle que soit la visée du jour', () => {
    [[60, 15], [60, 12], [60, 10], [60, 8]].forEach(([kg, vise]) => {
      const x = plan(seance({ slug: 'extension_jambes', travail: 2, degressives: [20] }), 'extension_jambes', consigne(kg, vise)).exercices[0];
      const m = /Vise (\d+) à (\d+)\./.exec(x.degressive.phrase);
      expect([vise, x.lignes[2].prerempli.reps]).toEqual([vise, (Number(m[1]) + Number(m[2])) / 2]);
    });
  });

  test('à la barre, pas de dégressive : la ligne reste vide (charge et reps)', () => {
    const x = plan(seance({ slug: 'developpe_couche_barre', travail: 2, degressives: [8] }), 'developpe_couche_barre', consigne(100, 5)).exercices[0];
    expect(x.degressive.phrase).toBe('Pas de dégressive à la barre.');
    expect(x.lignes[2].prerempli).toMatchObject({ charge_kg: null, reps: null });
  });

  test('les chauffes, elles, gardent les reps de la routine (la structure) ; la charge est celle du coach', () => {
    const x = plan(seance({ slug: 'developpe_couche_barre', travail: 2, chauffes: [10, 6, 3, 1] }), 'developpe_couche_barre', consigne(125, 5)).exercices[0];
    const ch = x.lignes.filter((l) => l.type === 'echauffement');
    expect(ch.map((l) => l.prerempli.reps)).toEqual([10, 6, 3, 1]);
    expect(ch.map((l) => l.prerempli.charge_kg)).toEqual(ch.map((l) => l.chauffe.charge));
  });
});

// ── 2. TOUTES LES LIGNES ────────────────────────────────────────────────────
describe('PR 3 — le plan pré-remplit toutes les lignes', () => {
  test('une ligne couverte : la charge et les reps du plan', () => {
    const x = plan(seance({ slug: 'curl', travail: 2 }), 'curl', consigne(20, 10)).exercices[0];
    expect(x.lignes.map((l) => [l.prerempli.charge_kg, l.prerempli.reps])).toEqual([[20, 10], [20, 10]]);
  });

  test('un exercice sans consigne : la fois d’avant, au même rang (la cascade, dans le plan)', () => {
    const prec = PREC([{ type_serie: 'travail', charge_kg: 22, reps: 9 }, { type_serie: 'travail', charge_kg: 24, reps: 7 }]);
    const x = plan(seance({ slug: 'curl', travail: 2 }), 'curl', null, { precedents: { curl: prec } }).exercices[0];
    expect(x.consigne).toBeNull();
    expect(x.lignes.map((l) => [l.prerempli.charge_kg, l.prerempli.reps])).toEqual([[22, 9], [24, 7]]);
  });

  test('ce qu’on vient de taper sur la ligne d’avant se propage aux lignes hors plan', () => {
    let se = seance({ slug: 'curl', travail: 2 });
    se = S.modifierSerie(se, 0, 0, { charge_kg: 26, reps: 8 });
    const prec = PREC([{ type_serie: 'travail', charge_kg: 22, reps: 9 }, { type_serie: 'travail', charge_kg: 22, reps: 9 }]);
    const x = plan(se, 'curl', null, { precedents: { curl: prec } }).exercices[0];
    expect(x.lignes[1].prerempli.charge_kg).toBe(26);
  });

  test('la durée et la distance viennent de la fois d’avant', () => {
    const prec = PREC([{ type_serie: 'travail', duree_s: 45, distance_m: null }]);
    const x = plan(seance({ slug: 'planche', travail: 1 }), 'planche', null, { precedents: { planche: prec } }).exercices[0];
    expect(x.lignes[0].prerempli.duree_s).toBe(45);
  });
});

// ── 3. L'ÉQUIVALENCE : SEULES LES REPS DES DÉGRESSIVES CHANGENT ─────────────
//
// L'ancien `fantomeDe` (app.js, jusqu'à la PR 3), rejoué sur la sortie du plan.
function ancienFantome(se, iExo, iSerie, prec, x) {
  const exo = se.exercices[iExo];
  const grille = x && x.consigne ? S.planDe(exo.series, x.consigne, x.reaction.plan, x.figees) : null;
  const ancien = S.fantome(se, iExo, iSerie, prec, grille);
  const l = x && x.lignes[iSerie];
  if (l && l.role === 'hors' && l.fantome && (l.fantome.source === 'chauffe' || l.fantome.source === 'degressive')) {
    return { charge_kg: l.fantome.charge === undefined ? null : l.fantome.charge, reps: ancien.reps, duree_s: ancien.duree_s, distance_m: ancien.distance_m };
  }
  if (!x || !x.consigne || !l || l.role === 'hors' || !l.fantome) return ancien;
  return { charge_kg: l.fantome.charge === undefined ? null : l.fantome.charge, reps: l.fantome.reps === undefined ? null : l.fantome.reps,
    duree_s: ancien.duree_s, distance_m: ancien.distance_m };
}

describe('PR 3 — l’équivalence avec l’ancien `fantomeDe`', () => {
  test('⚠️ sur des plans générés (cas de consigne-48b7, avec chauffes, dégressive, gestes) : identiques, sauf les reps des dégressives', () => {
    const CAS = require('./fixtures/consigne-48b7.json');
    const ecarts = [];
    let lignes = 0, degressives = 0;
    CAS.forEach((c) => {
      const k = M.consignePour(c.seances, c.avant, { reglage: c.reglage, equipement: c.equipement, correction: c.correction || null });
      [['extension_jambes', 'machine'], ['developpe_couche_barre', 'barre']].forEach(([slug]) => {
        let se = seance({ slug, travail: 3, chauffes: [10, 6], degressives: [12] });
        const prec = PREC([{ type_serie: 'echauffement', charge_kg: 20, reps: 10 }, { type_serie: 'travail', charge_kg: 50, reps: 9 },
          { type_serie: 'travail', charge_kg: 50, reps: 8 }, { type_serie: 'degressive', charge_kg: 35, reps: 11 }]);
        [null, 0, 1].forEach((geste) => {
          if (geste !== null) {
            const j = 2 + geste;
            se = S.valider(S.modifierSerie(se, 0, j, { charge_kg: (k.palier || 40) + 2.5, reps: 6 }), 0, j, new Date('2026-10-01T15:30:00Z'));
          }
          const x = plan(se, slug, k, { precedents: { [slug]: prec } }).exercices[0];
          x.lignes.forEach((l, i) => {
            lignes++;
            const avant = ancienFantome(se, 0, i, prec, x);
            const apres = l.prerempli;
            if (l.type === 'degressive' && l.fantome && l.fantome.source === 'degressive') {
              degressives++;
              if (JSON.stringify(Object.assign({}, avant, { reps: null })) !== JSON.stringify(Object.assign({}, apres, { reps: null }))) {
                ecarts.push(c.id + ' ' + slug + ' #' + i + ' (dégressive, hors reps) ' + JSON.stringify([avant, apres]));
              }
              return;
            }
            if (JSON.stringify(avant) !== JSON.stringify(apres)) ecarts.push(c.id + ' ' + slug + ' #' + i + ' ' + JSON.stringify([avant, apres]));
          });
        });
      });
    });
    expect(lignes).toBeGreaterThan(1000);
    expect(degressives).toBeGreaterThan(50);
    expect(ecarts.slice(0, 5)).toEqual([]);
  });
});
