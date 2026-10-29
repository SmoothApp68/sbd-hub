/** @jest-environment node */
//
// 185 — LA VRAISEMBLANCE D'UNE SÉRIE (`THFaits.vraisemblanceDeLaSerie`, `questionDuRecord`).
//
// Chaque seuil est éprouvé DES DEUX CÔTÉS de la borne (juste dessous : rien ; juste dessus : la question), et chaque
// exception (chauffe, dégressive, haltères, apprentissage) a sa configuration qui la sépare de la règle. Les textes sont
// ceux de la maquette validée le 29/10/2026.

process.env.TZ = 'Europe/Paris';

global.self = global;
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/bilan.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
require('../../v2/js/seance.js');
require('../../v2/js/periode.js');
const Faits = require('../../v2/js/faits.js').creer();

const NBSP = ' ';
const plat = (t) => String(t).replace(/[  ]/g, ' ');
const serie = (kg, reps, extra) => Object.assign({ charge_kg: kg, reps, type_serie: 'travail' }, extra || {});
// Une séance d'historique : trois séries à la même charge.
const seance = (kg, reps) => ({ series: [serie(kg, reps), serie(kg, reps), serie(kg, reps)] });
// L'historique d'un exercice fait N fois, la plus lourde charge étant `meilleur`.
const histo = (meilleur, n) => {
  const l = [];
  for (let i = 0; i < (n === undefined ? 4 : n); i++) l.push(seance(i === 1 ? meilleur : meilleur - 5, 5));
  return l;
};
const v = (saisie, contexte) => Faits.vraisemblanceDeLaSerie(saisie, contexte);

describe('185 — le seuil des trois séances', () => {
  test('sous trois séances faites, une hausse énorme ne pose aucune question', () => {
    expect(v({ charge: 300, reps: 5 }, { historique: histo(125, 2) })).toBeNull();
  });
  test('à trois séances, la même hausse pose la question', () => {
    const q = v({ charge: 300, reps: 5 }, { historique: histo(125, 3) });
    expect(q && q.genre).toBe('hausse');
  });
  test('sous trois séances, seul l’absurde passe : 100 reps pour une cible de 8', () => {
    const q = v({ charge: 30, reps: 100 }, { historique: histo(30, 1), cible: 8 });
    expect(q && q.genre).toBe('reps_haut');
  });
  test('sous trois séances, 0 rep n’est pas une question (le moteur sait le lire)', () => {
    expect(v({ charge: 25, reps: 0 }, { historique: histo(25, 2) })).toBeNull();
  });
  test('une séance qui n’a que des chauffes n’est pas une séance faite', () => {
    const faux = [{ series: [serie(60, 5, { type_serie: 'echauffement' })] }, { series: [serie(60, 5, { type_serie: 'echauffement' })] },
      { series: [serie(60, 5, { type_serie: 'echauffement' })] }, seance(125, 5)];
    expect(v({ charge: 300, reps: 5 }, { historique: faux })).toBeNull();
  });
});

describe('185 — la hausse : plus de 15 % ET plus de 10 kg du meilleur (barre, machine)', () => {
  const H = histo(100);   // meilleur : 100 kg
  const hausse = (kg, extra) => v(Object.assign({ charge: kg, reps: 5, equipement: 'barre' }, extra || {}), { historique: H });
  test('+15 % pile (115 kg) : rien ; juste au-dessus (116 kg) : la question', () => {
    expect(hausse(115)).toBeNull();
    expect(hausse(116).genre).toBe('hausse');
  });
  test('+10 kg pile mais moins de 15 % : rien (meilleur 200 kg, 210 kg)', () => {
    expect(v({ charge: 210, reps: 5, equipement: 'barre' }, { historique: histo(200) })).toBeNull();
    expect(v({ charge: 231, reps: 5, equipement: 'barre' }, { historique: histo(200) }).genre).toBe('hausse');
  });
  test('plus de 15 % mais moins de 10 kg : rien (meilleur 40 kg, 46 kg)', () => {
    expect(v({ charge: 46, reps: 5, equipement: 'machine' }, { historique: histo(40) })).toBeNull();
    expect(v({ charge: 51, reps: 5, equipement: 'machine' }, { historique: histo(40) }).genre).toBe('hausse');
  });
  test('le texte et les boutons sont ceux de la maquette', () => {
    const q = v({ charge: 152, reps: 5, equipement: 'barre' }, { historique: histo(127.5) });
    expect(plat(q.texte)).toBe('152 kg ? Ton meilleur ici : 127,5 kg.');
    expect(q.boutons.map((b) => b.texte)).toEqual(['Oui, 152', 'Corriger']);
    expect(q.boutons.map((b) => b.action)).toEqual(['garder', 'corriger']);
    expect(q.boutons[0].principal).toBe(true);
  });
  test('une chauffe n’est pas jugée', () => {
    expect(hausse(300, { type: 'echauffement' })).toBeNull();
  });
  test('le meilleur compte les séries déjà validées du jour', () => {
    expect(v({ charge: 152, reps: 5, equipement: 'barre' }, { historique: H, seance: [serie(150, 5)] })).toBeNull();
  });
});

describe('185 — les haltères', () => {
  const H = histo(22);
  test('plus de 4 kg par haltère ET plus de 15 % : la question (meilleur 22, 27 kg)', () => {
    expect(v({ charge: 26, reps: 10, equipement: 'haltere' }, { historique: H })).toBeNull();   // +4 pile
    expect(v({ charge: 27, reps: 10, equipement: 'haltere' }, { historique: H }).genre).toBe('hausse');
  });
  test('4 kg ou moins : rien, même au-delà de 15 % (meilleur 10, 14 kg)', () => {
    expect(v({ charge: 14, reps: 10, equipement: 'haltere' }, { historique: histo(10) })).toBeNull();
  });
  test('le double de l’habitude : « par haltère, ou les deux ensemble ? »', () => {
    const q = v({ charge: 44, reps: 10, equipement: 'haltere' }, { historique: H });
    expect(q.genre).toBe('double_halteres');
    expect(plat(q.texte)).toBe('44 kg : par haltère, ou les deux ensemble ?');
    expect(q.boutons.map((b) => b.texte)).toEqual(['22 par haltère', '44 par haltère']);
    expect(q.boutons[0]).toMatchObject({ action: 'charge', valeur: 22, principal: true });
    expect(q.boutons[1].action).toBe('garder');
  });
  test('de 1,8 à 2,2 fois l’habitude, et pas au-delà', () => {
    const hab = histo(20);   // dernière séance : 15 (l'habitude), meilleur 20
    expect(v({ charge: 36, reps: 10, equipement: 'haltere' }, { historique: [seance(20, 8)] .concat(histo(20, 3)) }).genre).toBe('double_halteres');   // 1,8 × 20
    expect(v({ charge: 44, reps: 10, equipement: 'haltere' }, { historique: [seance(20, 8)].concat(histo(20, 3)) }).genre).toBe('double_halteres');   // 2,2 × 20
    expect(v({ charge: 45, reps: 10, equipement: 'haltere' }, { historique: [seance(20, 8)].concat(histo(20, 3)) }).genre).toBe('hausse');
    expect(v({ charge: 34, reps: 10, equipement: 'haltere' }, { historique: [seance(20, 8)].concat(histo(20, 3)) }).genre).toBe('hausse');
    expect(hab.length).toBe(4);
  });
  test('à la barre, le double n’est pas une question de haltères : c’est une hausse', () => {
    expect(v({ charge: 44, reps: 10, equipement: 'barre' }, { historique: H }).genre).toBe('hausse');
  });
});

describe('185 — la baisse : plus de 35 % ET plus de 10 kg sous la consigne du jour', () => {
  const H = histo(100);
  const baisse = (kg, extra, ctx) => v(Object.assign({ charge: kg, reps: 5, equipement: 'barre' }, extra || {}),
    Object.assign({ historique: H, chargeVisee: 100 }, ctx || {}));
  test('-35 % pile : rien ; juste en dessous : la question', () => {
    expect(baisse(65)).toBeNull();
    const q = baisse(64);
    expect(q.genre).toBe('baisse');
    expect(plat(q.texte)).toBe('64 kg ? Ta consigne : 100 kg.');
  });
  test('-10 kg pile : rien (consigne 20 kg, 10 kg = -50 % mais exactement 10 kg)', () => {
    expect(v({ charge: 10, reps: 8, equipement: 'machine' }, { historique: histo(20), chargeVisee: 20 })).toBeNull();
    expect(v({ charge: 9.5, reps: 8, equipement: 'machine' }, { historique: histo(20), chargeVisee: 20 }).genre).toBe('baisse');
  });
  test('ni une chauffe ni une dégressive ne sont jugées', () => {
    expect(baisse(40, { type: 'echauffement' })).toBeNull();
    expect(baisse(40, { type: 'degressive' })).toBeNull();
  });
  test('sans consigne, la série d’avant du même exercice fait référence', () => {
    const q = v({ charge: 50, reps: 5, equipement: 'barre' }, { historique: H, seance: [serie(100, 5)] });
    expect(q.genre).toBe('baisse');
    expect(plat(q.texte)).toBe('50 kg ? Ta série d’avant : 100 kg.');
  });
});

describe('185 — les reps', () => {
  const H = histo(30);
  test('0 rep : la question de la maquette, avec ses trois boutons', () => {
    const q = v({ charge: 30, reps: 0, equipement: 'poulie' }, { historique: H, cible: 8 });
    expect(q.genre).toBe('zero');
    expect(q.texte).toBe('0 rep : tu l’as manquée ?');
    expect(q.boutons.map((b) => b.texte)).toEqual(['Oui, manquée', 'J’ai eu mal', 'Corriger']);
    expect(q.boutons.map((b) => b.action)).toEqual(['manquee', 'mal', 'corriger']);
  });
  test('1 rep n’est pas un zéro', () => {
    expect(v({ charge: 30, reps: 1, equipement: 'poulie' }, { historique: H, cible: 8 })).toBeNull();
  });
  test('2,5 fois la cible pile : rien ; au-dessus : la question, avec la correction en un toucher', () => {
    expect(v({ charge: 30, reps: 20, equipement: 'barre' }, { historique: H, cible: 8 })).toBeNull();
    const q = v({ charge: 30, reps: 100, equipement: 'barre' }, { historique: H, cible: 8 });
    expect(q.genre).toBe('reps_haut');
    expect(q.texte).toBe('100 reps ? La cible : 8.');
    expect(q.boutons.map((b) => b.texte)).toEqual(['Oui, 100', '10', 'Corriger']);
    expect(q.boutons[1]).toMatchObject({ action: 'reps', valeur: 10, principal: true });
    expect(q.boutons[0].principal).toBe(false);
  });
  test('sans correction plausible, « Oui » devient le bouton principal', () => {
    const q = v({ charge: 30, reps: 7, equipement: 'barre' }, { historique: H, cible: 2 });
    expect(q.genre).toBe('reps_haut');
    expect(q.boutons.map((b) => b.texte)).toEqual(['Oui, 7', 'Corriger']);
    expect(q.boutons[0].principal).toBe(true);
  });
  test('moins de la moitié de la série d’avant à la même charge', () => {
    const ctx = { historique: H, seance: [serie(30, 10)] };
    expect(v({ charge: 30, reps: 5, equipement: 'barre' }, ctx)).toBeNull();       // la moitié pile
    expect(v({ charge: 30, reps: 4, equipement: 'barre' }, ctx).genre).toBe('reps_bas');
    expect(v({ charge: 32.5, reps: 4, equipement: 'barre' }, ctx)).toBeNull();     // pas la même charge
  });
  test('la cible d’une chauffe n’est pas jugée', () => {
    expect(v({ charge: 20, reps: 100, type: 'echauffement' }, { historique: H, cible: 8 })).toBeNull();
  });
  test('reps négatives ou décimales : refusées sur place, sans question, même sans historique', () => {
    const neg = v({ charge: 30, reps: -3 }, { historique: [] });
    const dec = v({ charge: 30, reps: 6.5 }, { historique: [] });
    [neg, dec].forEach((q) => { expect(q.refus).toBe(true); expect(q.boutons).toEqual([]); });
    expect(neg.genre).toBe('reps_invalides');
    expect(v({ charge: 30, reps: 6 }, { historique: [] })).toBeNull();
  });
});

describe('185 — l’apprentissage : deux « Oui » au même genre sur le même exercice', () => {
  const H = histo(100);
  test('un « Oui » : on redemande ; deux : on ne demande plus ce genre', () => {
    expect(v({ charge: 152, reps: 5, equipement: 'barre' }, { historique: H, confirmations: { hausse: 1 } }).genre).toBe('hausse');
    expect(v({ charge: 152, reps: 5, equipement: 'barre' }, { historique: H, confirmations: { hausse: 2 } })).toBeNull();
  });
  test('un autre genre reste demandé', () => {
    const q = v({ charge: 30, reps: 0, equipement: 'poulie' }, { historique: histo(30), confirmations: { hausse: 2 } });
    expect(q.genre).toBe('zero');
  });
  test('l’apprentissage ne lève pas le refus des reps décimales', () => {
    expect(v({ charge: 30, reps: 6.5 }, { historique: [], confirmations: { hausse: 9, reps_haut: 9, zero: 9 } }).refus).toBe(true);
  });
  test('chaque genre appris se tait', () => {
    const cas = {
      hausse: [{ charge: 152, reps: 5, equipement: 'barre' }, { historique: H }],
      double_halteres: [{ charge: 44, reps: 10, equipement: 'haltere' }, { historique: histo(22) }],
      baisse: [{ charge: 40, reps: 5, equipement: 'barre' }, { historique: H, chargeVisee: 100 }],
      zero: [{ charge: 100, reps: 0, equipement: 'barre' }, { historique: H }],
      reps_haut: [{ charge: 100, reps: 100, equipement: 'barre' }, { historique: H, cible: 8 }],
      reps_bas: [{ charge: 100, reps: 2, equipement: 'barre' }, { historique: H, seance: [serie(100, 10)] }]
    };
    Faits.GENRES_DE_QUESTION.forEach((g) => {
      expect([g, v(cas[g][0], cas[g][1]) && v(cas[g][0], cas[g][1]).genre]).toEqual([g, g]);
      const appris = Object.assign({}, cas[g][1], { confirmations: { [g]: Faits.CONFIRMATIONS_POUR_APPRENDRE } });
      expect([g, v(cas[g][0], appris)]).toEqual([g, null]);
    });
  });
});

describe('185 — la question du record (cas 5)', () => {
  const H = histo(127.5);
  const q = (kg, extra, ctx) => Faits.questionDuRecord(Object.assign({ charge: kg, reps: 5, equipement: 'barre' }, extra || {}),
    Object.assign({ historique: H }, ctx || {}));
  test('+20 % pile : rien ; au-dessus : la question de la maquette', () => {
    expect(q(153)).toBeNull();
    const r = q(152);
    expect(r).toBeNull();                      // 152 = +19,2 % : pas encore
    const g = q(153.1);
    expect(g.genre).toBe('record');
    expect(g.boutons.map((b) => b.texte)).toEqual(['Oui, c’est un record', 'Non, ne compte pas']);
    expect(g.boutons[1].action).toBe('hors_calcul');
  });
  test('le texte : « Record à 160 kg × 5, 32,5 kg de plus que ton meilleur. Je l’inscris ? »', () => {
    expect(plat(q(160).texte)).toBe('Record à 160 kg × 5, 32,5 kg de plus que ton meilleur. Je l’inscris ?');
  });
  test('sous trois séances, ou sans rep, ou en chauffe : pas de question', () => {
    expect(q(200, {}, { historique: histo(127.5, 2) })).toBeNull();
    expect(q(200, { reps: 0 })).toBeNull();
    expect(q(200, { type: 'echauffement' })).toBeNull();
  });
  test('la question du record ne dépend pas de l’apprentissage de la hausse', () => {
    expect(q(200, {}, { confirmations: { hausse: 5 } }).genre).toBe('record');
  });
  test('NBSP : le formateur unique des charges', () => {
    expect(q(200).texte).toContain('200' + NBSP + 'kg');
    expect(Modele.charge(200)).toContain(NBSP);
  });
});
