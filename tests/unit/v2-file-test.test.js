/** @jest-environment node */
//
// 25/11/2026 — « LA SEMAINE DE TEST ENTRE DANS LA FILE » (ECRAN-SAISIE §7 quinvicies quater, delta ; MOTEUR §9.53, I271) : la carte de la semaine de mesure, quand elle porte des gestes,
// est la famille `test` de la file, après la reprise et la veille. Affichage seulement : aucune décision du coach ne change.

process.env.TZ = 'Europe/Paris';
require('../../v2/js/modele.js'); require('../../v2/js/profil.js'); require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const fs = require('fs');
const path = require('path');

function decor() {
  let n = 0; const id = () => 's' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'couche', id, { series: 3 });
  const K = { etat: 'progression', zone: 'lourd', palier: 100, niveau: 5, n: 3, ligne: { charge: 100, vise: 5 }, haut: null, fondement: { date: '2026-10-26T17:00:00.000Z', reps: [5, 5, 5] } };
  const e = { seance: { id: 'S1', debut: '2026-11-03T10:00:00+00:00', edition: false, exercices: se.exercices },
    consignes: { couche: { consigne: K, libelles: M.libellesConsigne(K, '2026-11-03T10:00:00+00:00'), compteur: { compteur: 0, meilleur: null, blocages: [] }, repli: null } },
    reglage: 'franc', paris: [], suites: {}, phase: 'maintien', catalogue: null,
    escalier: { cartes: [], compteurs: [], noms: { couche: 'Développé Couché (Barre)' }, seriesRoutine: { couche: 3 }, marches: [] }, programme: { blocs: [], lignes: [] } };
  return { e, p: T.planDeSeance(e) };
}
const erreurs = (p, e, re) => T.verifierPlan(p, e).erreurs.filter((m) => re.test(m));
const TEST_A_FAIRE = () => ({ barre: true, testee: true, slug: 'couche', mode: 'max', etat: 'a_faire', essais: [], ajout: { lignes: [], suite: false }, videsPosees: 0 });

describe('la famille « test » de la file', () => {
  test('l’ordre arrêté : reprise, veille, test, puis le reste de l’ordre d’avant', () => {
    expect(T.ORDRE_DE_LA_FILE).toEqual(['reprise', 'veille', 'test', 'forme', 'paris', 'calage', 'autre', 'chauffes']);
  });
  test('la carte du test entre dans la file ; elle passe après la reprise et avant les chauffes', () => {
    const { e, p } = decor(); const x = p.exercices[0];
    x.semaineDeTest = TEST_A_FAIRE(); x.proposition = { phrase: 'Chauffe', pourquoi: null, lignes: [] };
    T.tetesDuPlan(p, e);
    expect(x.file.carte).toBe('test'); expect(x.file.enAttente).toEqual(['chauffes']);
    expect(erreurs(p, e, /^I271/)).toEqual([]);
    x.carteReprise = { titre: 't' };
    T.tetesDuPlan(p, e);
    expect(x.file.carte).toBe('reprise'); expect(x.file.enAttente).toEqual(['test', 'chauffes']);
    expect(erreurs(p, e, /^I271/)).toEqual([]);
  });
  test('la veille d’une activité dure passe AVANT le test sur la même barre (garde défensive : la veille se tait aujourd’hui en semaine de test)', () => {
    const { e, p } = decor(); const x = p.exercices[0];
    x.semaineDeTest = TEST_A_FAIRE(); p.veilleActivite = { slug: 'couche' };
    T.tetesDuPlan(p, e);
    expect(x.file.carte).toBe('veille'); expect(x.file.enAttente).toEqual(['test']);
    expect(erreurs(p, e, /^I271/)).toEqual([]);
    x.file = { ordre: T.ORDRE_DE_LA_FILE.slice(), carte: 'test', enAttente: ['veille'] };
    expect(erreurs(p, e, /^I271/).length).toBeGreaterThan(0);
  });
  test('une carte sans geste n’entre jamais : pas d’essai, pas de test, accessoire, barre finie, essais en série de mesure', () => {
    [{ barre: true, testee: false, etat: 'pas_d_essai', pasDEssai: { phrase: 'p' } }, { barre: true, testee: false, pasDeTest: true }, { accessoire: true, garde: true, rang: 1 },
      { barre: true, testee: true, etat: 'fini', essais: [{}], mode: 'max', ajout: null, videsPosees: 0 },
      { barre: true, testee: true, etat: 'en_cours', essais: [{}], mode: 'serie', ajout: null, videsPosees: 0 }].forEach((t) => {
      expect(T.carteDeTestAGestes(t)).toBe(false);
      const { e, p } = decor(); p.exercices[0].semaineDeTest = t; T.tetesDuPlan(p, e);
      expect(p.exercices[0].file.carte).toBeNull();
      expect(erreurs(p, e, /^I271/)).toEqual([]);
    });
    expect(T.carteDeTestAGestes({ barre: true, testee: true, etat: 'en_cours', essais: [{}], mode: 'max' })).toBe(true);
  });
  test('I271 refuse un test retenu à la place de la carte d’avant, ou une file qui ne compte pas le test', () => {
    const { e, p } = decor(); const x = p.exercices[0];
    x.semaineDeTest = TEST_A_FAIRE();
    T.tetesDuPlan(p, e);
    x.file = { ordre: T.ORDRE_DE_LA_FILE.slice(), carte: null, enAttente: [] };
    expect(erreurs(p, e, /^I271/).length).toBeGreaterThan(0);
  });
  test('app.js : la carte du test lit la file', () => {
    expect(fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8')).toMatch(/carteEnAttente\(i, 'test'\)/);
  });
  test('un plan réel de semaine de test : le test est la seule carte (la veille se tait, `blocageVeille`)', () => {
    expect(fs.readFileSync(path.join(__dirname, '../../v2/js/plan.js'), 'utf8')).toMatch(/var blocageVeille = !!esc\.allegee \|\| !!jourDeTest;/);
  });
});
