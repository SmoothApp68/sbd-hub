/** @jest-environment node */
//
// 193-6 (MOTEUR §9.30) — LA DERNIÈRE SÉRIE « AU MAX » : la notion et ses lecteurs dans le moteur.
//   1  la table de décision `auMaxDe` (objectif × famille × exceptions) ;
//   2  une série demandée à fond n'est pas « à fond » (`cranDeSerie`) ; une réserve sous la demande l'est ;
//   3  le dépassement ne propose jamais de zone depuis une série au max ; l'habitude ne la lit pas ;
//   4  la correction des reculs lit la dernière série au max ;
//   5  « J'ai peu de temps » garde la ligne au max.

process.env.TZ = 'Europe/Paris';
require('../../v2/js/modele.js');
const Modele = require('../../v2/js/modele.js');
const Palier = require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');

const B = Modele.BARRES;
const SQ = B[0], DC = B[1], SDT = B[2], DM = B[3];
const d = (o) => M.auMaxDe(o);

describe('auMaxDe — la table', () => {
  test('muscle et les_deux : échec au squat et au couché (sécurités ou pareur), garde 2 au soulevé, échec aux accessoires', () => {
    ['muscle', 'les_deux'].forEach((objectif) => {
      expect(d({ objectif, famille: DC })).toMatchObject({ pose: 'defaut', reserve: 0, sorte: 'echec', avecPareur: true });
      expect(d({ objectif, famille: SQ })).toMatchObject({ reserve: 0, avecPareur: true });
      expect(d({ objectif, famille: SDT })).toMatchObject({ reserve: 2, sorte: 'garde', avecPareur: false });
      expect(d({ objectif, famille: null, equipement: 'haltere' })).toMatchObject({ reserve: 0, avecPareur: false });
      expect(d({ objectif, famille: DM })).toMatchObject({ reserve: 1 });
    });
  });
  test('force : rien sur les barres, garde 1 aux accessoires ; forme : rien', () => {
    expect(d({ objectif: 'force', famille: DC }).pose).toBeNull();
    expect(d({ objectif: 'force', famille: SDT }).pose).toBeNull();
    expect(d({ objectif: 'force', famille: DM }).pose).toBeNull();
    expect(d({ objectif: 'force', famille: null })).toMatchObject({ reserve: 1 });
    expect(d({ objectif: 'forme', famille: null }).pose).toBeNull();
    expect(d({ objectif: 'forme', famille: DC }).pose).toBeNull();
  });
  test('objectif inconnu : rien, on ne devine pas', () => {
    expect(d({ objectif: null, famille: null }).pose).toBeNull();
    expect(d({ objectif: 'peut-etre', famille: DC }).pose).toBeNull();
  });
  test('posée à la main là où la table ne met rien : garde 2, jamais d’échec', () => {
    expect(d({ objectif: 'force', famille: DC, main: true })).toMatchObject({ pose: 'main', reserve: 2, sorte: 'garde' });
    expect(d({ objectif: 'forme', famille: null, main: true })).toMatchObject({ pose: 'main', reserve: 2 });
    expect(d({ objectif: null, famille: SDT, main: true })).toMatchObject({ reserve: 2 });
  });
  test('débutant : garde 1 au squat et au couché ; l’échec seulement aux machines et isolations', () => {
    expect(d({ objectif: 'muscle', debutant: true, famille: DC }).reserve).toBe(1);
    expect(d({ objectif: 'muscle', debutant: true, famille: SQ }).reserve).toBe(1);
    expect(d({ objectif: 'muscle', debutant: true, famille: null, equipement: 'haltere' }).reserve).toBe(1);
    expect(d({ objectif: 'muscle', debutant: true, famille: null, equipement: 'machine' }).reserve).toBe(0);
    expect(d({ objectif: 'muscle', debutant: true, famille: null, equipement: 'haltere', isolation: true }).reserve).toBe(0);
    expect(d({ objectif: 'muscle', debutant: true, famille: SDT }).reserve).toBe(2);
  });
  test('semaine allégée : aucun Au max, même posé à la main', () => {
    expect(d({ objectif: 'muscle', famille: DC, allegee: true, main: true }).pose).toBeNull();
  });
  test('zone à ménager ou « J’ai mal » récent : jamais d’échec, au plus garde 2', () => {
    expect(d({ objectif: 'muscle', famille: DC, menagee: true }).reserve).toBe(2);
    expect(d({ objectif: 'muscle', famille: null, douleurRecente: true }).reserve).toBe(2);
    expect(d({ objectif: 'muscle', famille: DC, douleurRecente: true }).avecPareur).toBe(false);
  });
  test('squat suivi d’une autre barre lourde de jambes : garde 1', () => {
    expect(d({ objectif: 'muscle', famille: SQ, barreDeJambesApres: true })).toMatchObject({ reserve: 1, avecPareur: false });
    expect(d({ objectif: 'muscle', famille: DC, barreDeJambesApres: true }).reserve).toBe(0);
  });
  test('la consigne et le constat (voix)', () => {
    expect(M.consigneAuMax(d({ objectif: 'muscle', famille: DC }))).toBe('Jusqu’à l’échec, sur les sécurités ou avec un pareur');
    expect(M.consigneAuMax(d({ objectif: 'muscle', famille: null }))).toBe('Jusqu’à l’échec');
    expect(M.consigneAuMax(d({ objectif: 'muscle', famille: SDT }))).toBe('Autant que tu peux, en gardant 2 reps');
    expect(M.consigneAuMax(d({ objectif: 'force', famille: null }))).toBe('Autant que tu peux, en gardant 1 rep');
    expect(M.constatAuMax(112.5, 12, 10)).toMatch(/12 reps à 112,5\s?kg, 2 de plus que prévu\.$/);
    expect(M.constatAuMax(112.5, 10, 10)).toMatch(/comme prévu\.$/);
  });
  test('douleurRecente : 42 jours', () => {
    expect(M.douleurRecente(['2026-09-20'], '2026-10-31')).toBe(true);
    expect(M.douleurRecente(['2026-09-10'], '2026-10-31')).toBe(false);
    expect(M.douleurRecente([], '2026-10-31')).toBe(false);
  });
});

describe('cranDeSerie — l’échec demandé n’est pas « à fond »', () => {
  const serie = (o) => Object.assign({ charge_kg: 100, reps: 10, type_serie: 'travail', rpe: null, ressenti: null }, o);
  test('sans marque : RPE 10 reste « max »', () => {
    expect(Palier.cranDeSerie(serie({ rpe: 10 }))).toBe('max');
  });
  test('demandée à l’échec (0) : RPE 10 ou reste_0 ne sont pas « max »', () => {
    expect(Palier.cranDeSerie(serie({ au_max_reserve: 0, rpe: 10 }))).toBeNull();
    expect(Palier.cranDeSerie(serie({ au_max_reserve: 0, ressenti: 'reste_0' }))).toBeNull();
    expect(Palier.cranDeSerie(serie({ au_max: true, au_max_reserve: 0, type_serie: 'recul', rpe: 10 }))).toBeNull();
  });
  test('demandée en gardant 2 : RPE 10 (réserve 0) dépasse la demande, c’est « max » ; RPE 8 non', () => {
    expect(Palier.cranDeSerie(serie({ au_max_reserve: 2, rpe: 10 }))).toBe('max');
    expect(Palier.cranDeSerie(serie({ au_max_reserve: 2, rpe: 8 }))).not.toBe('max');
  });
});

describe('lecteurs', () => {
  test('la dernière série au max remplace le dernier recul dans la correction', () => {
    const grosse = { charge_kg: 132.5, reps: 4, type_serie: 'travail', rpe: 9, hors_calcul: false };
    const rec = (reps, extra) => Object.assign({ charge_kg: 112.5, reps, type_serie: 'recul', rpe: null, hors_calcul: false }, extra || {});
    // 12 reps à l’échec (au max) après deux reculs à 8 : +2 reps de plus que la table, +2,5 %
    const avecMarque = M.correctionDeRecul([{ series: [grosse, rec(8), rec(12, { au_max_reserve: 0 })], cible: 8 }]);
    // sans marque, le dernier recul (12) est lu avec la marge 2 : l’écart est plus grand, c’est la même séance lue autrement
    const sansMarque = M.correctionDeRecul([{ series: [grosse, rec(8), rec(12)], cible: 8 }]);
    expect(avecMarque.pas[0].prevision).toBeLessThan(sansMarque.pas[0].prevision + 10);
    expect(avecMarque.pas[0].faites).toBe(12);
    // marge 0 demandée : prévision de la table à 0 de marge, plus haute que celle à marge 2
    expect(avecMarque.pas[0].prevision).toBeGreaterThan(sansMarque.pas[0].prevision);
    // la série marquée est choisie même si elle n’est pas la dernière
    const marqueeAvant = M.correctionDeRecul([{ series: [grosse, rec(12, { au_max_reserve: 0 }), rec(8)], cible: 8 }]);
    expect(marqueeAvant.pas[0].faites).toBe(12);
  });
  test('niveauHorsAuMax : une série au max seule ne fait aucun niveau', () => {
    expect(M.niveauHorsAuMax([{ charge_kg: 30, reps: 15, type_serie: 'travail', au_max_reserve: 0 }])).toBeNull();
    expect(M.niveauHorsAuMax([{ charge_kg: 30, reps: 10, type_serie: 'travail' }, { charge_kg: 30, reps: 10, type_serie: 'travail' },
      { charge_kg: 30, reps: 15, type_serie: 'travail', au_max_reserve: 0 }])).toBe(10);
  });
  test('J’ai peu de temps : la ligne au max est gardée, une ligne du milieu part', () => {
    const l = (au) => ({ type_serie: 'travail', reps: 8, au_max: au === true });
    const routine = { exercices: [{ exercise_slug: 'x', series: [l(), l(), l(true)] }] };
    const resultat = { exercices: [{ ch: 0, tr: 2, deg: 0, rec: 0 }], journal: [] };
    const r = M.appliquerRaccourci(routine, resultat);
    const s = r.routine.exercices[0].series;
    expect(s).toHaveLength(2);
    expect(s[s.length - 1].au_max).toBe(true);
    expect(s[0].au_max).toBe(false);
  });
});
