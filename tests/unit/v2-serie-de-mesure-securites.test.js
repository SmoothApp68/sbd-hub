/** @jest-environment node */
//
// 27/11/2026 (SÉCURITÉ, décision du fondateur ; contradicteur « Technique et sécurité », §2) — « SUR LES SÉCURITÉS » À LA SÉRIE DE MESURE.
// La série poussée au bout au squat et au développé couché à la barre le dit, comme l'essai : à la FIN de la consigne (aucun élément de plus : I269),
// avec une issue pour qui n'a pas de sécurités. Le développé militaire et le soulevé de terre ne sont pas concernés.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
require('../../v2/js/generateur.js');

const sp = (t) => String(t).replace(/[\u00a0\u202f]/g, ' ');
const [SQ, DC, SDT, DM] = require('../../v2/js/modele.js').BARRES;
const CLAUSE = ' Sur les sécurités ou avec un pareur ; sinon, vise 1 en réserve.';
const FIN = 'Tu t’arrêtes quand la technique lâche.';

const FICHE = (nom, prim) => ({ nom, equipement: 'barre', mesure: 'charge_reps', pas: 2.5, muscles_primaires: prim, muscles_secondaires: ['triceps'], muscles_stabilisateurs: [] });
const FICHES = { [SQ]: FICHE('Squat', ['quadriceps']), [DC]: FICHE('Développé couché', ['pectoraux']), [SDT]: FICHE('Soulevé de terre', ['ischio_jambiers']),
  [DM]: FICHE('Développé militaire', ['deltoides']) };

function plan(slug, extra) {
  let k = 0;
  const id = () => 'x-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, slug, id, { series: 3 });
  se.exercices.forEach((ex) => ex.series.forEach((s) => { s.reps_visees = 5; }));
  const e = Object.assign({
    seance: { id: 'S', debut: '2026-11-03T10:00:00Z', edition: false, routine_id: 'R', exercices: se.exercices },
    consignes: { [slug]: { consigne: { etat: 'progression', zone: 'lourd', palier: 100, n: 3, ligne: { charge: 100, vise: 5 }, haut: null }, contexte: { cran: 102.5, haut: null } } },
    reglage: 'normal', paris: [], objectif: 'les_deux', catalogue: { [slug]: FICHES[slug] },
    semaineDeTest: { debut: '2026-11-02', fin: '2026-11-08', modes: { [slug]: 'serie' }, mesures: {}, refus: {},
      maxEstimes: { [DC]: 154, [SQ]: 157, [SDT]: 197, [DM]: 73 } }
  }, extra || {});
  return { e, p: T.planDeSeance(e) };
}
const propre = (p, e) => { expect(T.verifierPlan(p, e).erreurs).toEqual([]); expect(T.verifierPhrases(p)).toEqual([]); };

describe('la série de mesure dit « sur les sécurités »', () => {
  test('la fonction : la clause à la FIN, après « Tu t’arrêtes quand la technique lâche. », seulement avec surLesSecurites', () => {
    const base = { charge: 122.5, visee: [6, 8], reserve: 0, plafond: 8 };
    const sans = sp(M.testConsigneSerie(base));
    const avec = sp(M.testConsigneSerie(Object.assign({ surLesSecurites: true }, base)));
    expect(sans).toBe('Série de mesure : 122,5 kg, visée 6 à 8 reps, autant que tu peux, 8 reps au plus. ' + FIN);
    expect(avec).toBe(sans + CLAUSE);
    expect(avec.endsWith('sinon, vise 1 en réserve.')).toBe(true);
    expect(sp(M.testConsigneSerie(Object.assign({ surLesSecurites: false }, base)))).toBe(sans);
  });

  [['squat', SQ], ['développé couché', DC]].forEach(([nom, slug]) => {
    test('DISCRIMINANT — ' + nom + ' : la consigne du plan porte la clause, une seule fois, sans élément de plus ; I26, I162, I165, I269 à I271 tiennent', () => {
      const { e, p } = plan(slug);
      const t = p.exercices[0].semaineDeTest;
      expect(t.mode).toBe('serie');
      expect(t.surLesSecurites).toBe(true);
      const texte = sp(t.consigne.texte);
      expect(texte.endsWith(FIN + CLAUSE)).toBe(true);
      expect(texte.split('sécurités').length - 1).toBe(1);
      propre(p, e);
    });
  });

  [['soulevé de terre', SDT], ['développé militaire', DM]].forEach(([nom, slug]) => {
    test('TÉMOIN — ' + nom + ' : la consigne de la série ne change pas, aucune clause', () => {
      const { e, p } = plan(slug);
      const t = p.exercices[0].semaineDeTest;
      expect(t.mode).toBe('serie');
      const texte = sp(t.consigne.texte);
      expect(texte.endsWith(FIN)).toBe(true);
      expect(texte).not.toMatch(/sécurités|pareur/);
      propre(p, e);
    });
  });

  test('TÉMOIN — l\'essai (« Viser mon max ») garde sa clause d\'avant, au couché', () => {
    const { p } = plan(DC, { semaineDeTest: { debut: '2026-11-02', fin: '2026-11-08', modes: {}, mesures: {}, refus: {}, maxEstimes: { [DC]: 154 } } });
    expect(sp(p.exercices[0].semaineDeTest.consigne.texte)).toMatch(/^Essai 1 : .*, sur les sécurités ou avec un pareur\.$/);
  });
});
