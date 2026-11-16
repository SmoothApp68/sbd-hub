/** @jest-environment node */
//
// « UNE SEULE TABLE DES COUPURES DE REPS » (MOTEUR §9.51 quinquies, 15/11/2026) — PR A, aucun changement visible.
//
// `Modele.COUPURES_DE_REPS` DÉCRIT une série par ses reps (5 reps ou moins · 6 à 8 · 9 à 12 · 13 et plus) ; `ZONES` et `RANGEMENT`
// (moteur.js) PRESCRIVENT. Les deux ne se lisent pas l'une l'autre (décrire le passé par une table de prescription, c'est réécrire
// l'histoire dès qu'on retouche une zone) : CE TEST est le lien. Il rougit si une borne diverge, sauf écart NOMMÉ ci-dessous.

global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
const Modele = require('../../v2/js/modele.js');
const Moteur = require('../../v2/js/moteur.js');

const C = Modele.COUPURES_DE_REPS;

// Les écarts que le tour de table a acceptés, un par un. Un écart absent de cette liste fait échouer le lien.
const ECARTS_NOMMES = {
  // `RANGEMENT` range 8 reps en Hypertrophie (une habitude de 8 est du 8-10) ; la description range 8 en « 6 à 8 » : le bilan et la
  // séance se contredisent sur le 8, et les bornes écrites à côté du bilan le disent (tour de table, §3 ligne 2).
  rangementDu8: true,
  // `ZONES` laisse 13 et 14 sans zone ; `RANGEMENT` les range en Séries longues ; la description les range en « 13 et plus ».
  treizeQuatorze: true
};

describe('coupures de reps — la table et son lien avec la prescription du coach', () => {
  test('la table est figée et ses trois bornes sont celles du tour de table', () => {
    expect(C).toEqual({ lourdMax: 5, milieuMax: 8, hautMax: 12 });
    expect(Object.isFrozen(C)).toBe(true);
  });

  test('LIEN — chaque borne de description est la borne haute de la zone du coach qui porte son nom (Lourd, Mix, Volume)', () => {
    const haut = (cle) => Moteur.ZONES.filter((z) => z.cle === cle)[0].haut;
    expect([C.lourdMax, C.milieuMax, C.hautMax]).toEqual([haut('lourd'), haut('mix'), haut('volume')]);
  });

  test('LIEN — le rangement du coach change de zone à la borne lourde et à la borne haute de la description', () => {
    const rg = (r) => Moteur.RANGEMENT.filter((x) => r <= x.jusqua)[0].cle;
    expect(rg(C.lourdMax)).toBe('lourd');
    expect(rg(C.lourdMax + 1)).not.toBe('lourd');
    expect(rg(C.hautMax)).toBe('volume');
    expect(rg(C.hautMax + 1)).toBe('series_longues');
  });

  test('les écarts connus sont bien là (et seulement eux) : si le coach bouge, le test le dit', () => {
    const rg = (r) => Moteur.RANGEMENT.filter((x) => r <= x.jusqua)[0].cle;
    // 8 reps : description « moyennes », rangement « hypertrophie » (pas « mix »).
    expect([Modele.bandeDeReps(8), rg(8)]).toEqual(['moyennes', 'hypertrophie']);
    expect(ECARTS_NOMMES.rangementDu8).toBe(true);
    // 13-14 reps : aucune zone de menu, mais le rangement et la description s'accordent sur le haut.
    const dansUneZone = (r) => Moteur.ZONES.some((z) => r >= z.bas && r <= z.haut);
    expect([dansUneZone(13), dansUneZone(14), rg(13), rg(14), Modele.bandeDeReps(13), Modele.bandeDeReps(14)])
      .toEqual([false, false, 'series_longues', 'series_longues', 'longues', 'longues']);
    expect(ECARTS_NOMMES.treizeQuatorze).toBe(true);
    // Hors ces deux écarts, toute rep de 3 à 12 que le rangement met en « lourd » est une bande « lourdes », et inversement.
    for (let r = 3; r <= 30; r++) {
      expect([r, rg(r) === 'lourd']).toEqual([r, Modele.bandeDeReps(r) === 'lourdes']);
      expect([r, rg(r) === 'series_longues']).toEqual([r, Modele.bandeDeReps(r) === 'longues']);
    }
  });

  test('r = 1 à 30 : une seule bande par rep, des bandes contiguës et ordonnées', () => {
    const attendu = (r) => (r <= 5 ? 'lourdes' : r <= 8 ? 'moyennes' : r <= 12 ? 'hautes' : 'longues');
    for (let r = 1; r <= 30; r++) expect([r, Modele.bandeDeReps(r)]).toEqual([r, attendu(r)]);
    let derniere = -1;
    for (let r = 1; r <= 30; r++) {
      const i = Modele.BANDES_DE_REPS.indexOf(Modele.bandeDeReps(r));
      expect(i).toBeGreaterThanOrEqual(derniere);
      derniere = i;
    }
  });

  test('reps absentes, nulles, négatives ou illisibles : aucune bande devinée', () => {
    [null, undefined, '', 0, -3, NaN, 'abc', 0.4].forEach((v) => expect([v, Modele.bandeDeReps(v)]).toEqual([v, null]));
    expect(Modele.bandeDeReps('8')).toBe('moyennes');
  });

  test('estSerieLourde : 1 à 5 reps seulement (la copie de faits.js, à 6, est la PR D)', () => {
    for (let r = 1; r <= 30; r++) expect([r, Modele.estSerieLourde(r)]).toEqual([r, r <= 5]);
    expect(Modele.estSerieLourde(0)).toBe(false);
    expect(Modele.estSerieLourde(null)).toBe(false);
  });

  test('libelleDeBande : fabriqué depuis la table, jamais retapé', () => {
    expect(Modele.BANDES_DE_REPS.map(Modele.libelleDeBande)).toEqual(['5 reps ou moins', '6 à 8', '9 à 12', '13 et plus']);
    expect(Modele.libelleDeBande('force')).toBeNull();
  });

  test('ÉCART ACCEPTÉ, À RETIRER PAR LA PR D — le seuil lourd de faits.js (6) diffère de la table (5)', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../v2/js/faits.js'), 'utf8');
    const m = /REPS_LOURDES_MAX\s*=\s*(\d+)/.exec(src);
    const dePlan = /REPS_LOURDES_MAX\s*=\s*(\d+)/.exec(require('fs').readFileSync(require('path').join(__dirname, '../../v2/js/plan.js'), 'utf8'));
    const deBilan = /force['"],\s*jusqua:\s*(\d+)/.exec(require('fs').readFileSync(require('path').join(__dirname, '../../v2/js/bilans.js'), 'utf8'));
    expect(dePlan).toBeNull();   // PR B : le plan lit `estSerieLourde`, plus de copie
    expect(deBilan).toBeNull();   // PR C : le bilan lit `bandeDeReps`, plus de seau recopié
    // Quand la PR D passe faits.js sur `estSerieLourde`, `m` devient null : retire ce test, ne le contourne pas.
    expect(m && Number(m[1])).toBe(6);
  });
});
