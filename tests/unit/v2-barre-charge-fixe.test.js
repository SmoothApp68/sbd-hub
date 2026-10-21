/** @jest-environment node */
//
// 128 — LA BARRE À CHARGE FIXE AU CATALOGUE (MOTEUR §10 bis, « La donnée du catalogue », delta D1 ; audit du
// 16/10/2026, 03 #14, confirmé par Aurélien le 21/10/2026).
//
// `exercises.barre_charge_fixe` (v2_099) dit lui-même quels exercices à la barre se font avec une barre à charge
// fixe. `true` → les barres fixes déclarées dans Ma salle ; `false` → une barre qu'on charge, la salle n'en dit rien
// (`null`) ; colonne absente (`undefined`) → l'ancienne règle : une barre fixe sauf la barre lourde.
// Avant : un rowing penché à 27,5 kg s'arrondissait à 25 (la barre droite déclarée).
//
// Ce fichier éprouve :
//   1. `Profil.salleDeLExercice` : `false`, `true` (EZ et droite), l'absence de la colonne dans les deux sens ;
//   2. le moteur : un rowing à barre chargée n'est plus arrondi à une barre fixe ; un curl EZ, toujours ;
//   3. l'objectif : un rowing à 80 kg dans une salle à 30 kg n'est plus refusé ; un curl EZ, toujours ;
//   4. la lecture du catalogue : `barre_charge_fixe` par la seconde lecture (celle des échelles, 127), jamais dans
//      le `select` principal ; absente, le catalogue se synchronise, ses fiches sans la colonne.
// Ne pas confondre avec `barre_fixe` du générateur (R3, 60-5) : la barre de traction d'une ligne de programme.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
const Profil = require('../../v2/js/profil.js');
const Mo = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
require('../../v2/js/plan.js');
require('../../v2/js/semaine.js');
require('../../v2/js/bilan.js');
require('../../v2/js/generateur.js');
const Obj = require('../../v2/js/objectif.js');
const M = global.THModele;

const SALLE = { barres_ez: [10, 15, 20, 25, 30], barres_droites: [10, 15, 20, 25, 30], halteres: null };
const P = { ma_salle: SALLE };
const MUSCLES_ROWING = { muscles_primaires: ['grand_dorsal'], muscles_secondaires: ['haut_du_dos', 'biceps'],
  muscles_stabilisateurs: ['bas_du_dos'] };
const MUSCLES_CURL = { muscles_primaires: ['biceps'], muscles_secondaires: ['avant_bras'], muscles_stabilisateurs: [] };
// Le catalogue, tel qu'en base après v2_099 (`barre_charge_fixe` posée par la seconde lecture).
const APRES = {
  rowing_barre: Object.assign({ slug: 'rowing_barre', nom: 'Rowing Barre', equipement: 'barre', mouvement: 'rowing',
    barre_charge_fixe: false }, MUSCLES_ROWING),
  curl_biceps_barre_ez: Object.assign({ slug: 'curl_biceps_barre_ez', nom: 'Curl Biceps (Barre EZ)', equipement: 'barre',
    mouvement: 'curl', barre_charge_fixe: true }, MUSCLES_CURL),
  curl_biceps_barre: Object.assign({ slug: 'curl_biceps_barre', nom: 'Curl Biceps (Barre)', equipement: 'barre',
    mouvement: 'curl', barre_charge_fixe: true }, MUSCLES_CURL),
  squat_barre: { slug: 'squat_barre', nom: 'Squat (Barre)', equipement: 'barre', mouvement: 'squat',
    muscles_primaires: ['quadriceps'], barre_charge_fixe: false }
};
// Le même, sans la colonne (cache d'avant v2_099, faux serveur).
const AVANT = {};
Object.keys(APRES).forEach((k) => { AVANT[k] = Object.assign({}, APRES[k]); delete AVANT[k].barre_charge_fixe; });

// ═══ 1. QUELLE SALLE POUR QUEL EXERCICE ═══════════════════════════════════
describe('128 — `Profil.salleDeLExercice` lit `barre_charge_fixe`', () => {
  test('⚠️ DISCRIMINANT — rowing penché à la barre (`false`) : `null`, une barre qu’on charge', () => {
    expect(Profil.salleDeLExercice(P, 'rowing_barre', APRES)).toBeNull();
  });
  test('curl à la barre EZ (`true`) : les barres EZ déclarées', () => {
    expect(Profil.salleDeLExercice(P, 'curl_biceps_barre_ez', APRES))
      .toEqual({ materiel: 'barre_ez', charges: [10, 15, 20, 25, 30], isolation: true });
  });
  test('curl à la barre droite (`true`) : les barres droites déclarées', () => {
    expect(Profil.salleDeLExercice({ ma_salle: { barres_droites: [10, 20] } }, 'curl_biceps_barre', APRES))
      .toEqual({ materiel: 'barre_droite', charges: [10, 20], isolation: true });
  });
  test('`true` : la colonne prime sur la barre lourde (le catalogue dit, la définition du générateur se tait)', () => {
    const ix = Object.assign({}, APRES, { squat_barre: Object.assign({}, APRES.squat_barre, { barre_charge_fixe: true }) });
    expect(Profil.salleDeLExercice(P, 'squat_barre', ix)).toEqual(expect.objectContaining({ materiel: 'barre_droite' }));
  });
  test('fiche SANS la colonne : l’ancienne règle, dans les deux sens', () => {
    // Une barre lourde : `null`.
    expect(Profil.salleDeLExercice(P, 'squat_barre', AVANT)).toBeNull();
    // Un curl : une barre fixe (EZ par le nom, sinon droite).
    expect(Profil.salleDeLExercice(P, 'curl_biceps_barre_ez', AVANT)).toEqual(expect.objectContaining({ materiel: 'barre_ez' }));
    expect(Profil.salleDeLExercice(P, 'curl_biceps_barre', AVANT)).toEqual(expect.objectContaining({ materiel: 'barre_droite' }));
    // Le rowing, sans la colonne, reste une barre fixe : c'est l'ancienne règle, gardée exprès.
    expect(Profil.salleDeLExercice(P, 'rowing_barre', AVANT)).toEqual(expect.objectContaining({ materiel: 'barre_droite' }));
  });
});

// ═══ 2. LE MOTEUR ═════════════════════════════════════════════════════════
describe('128 — un exercice à barre chargée n’est plus arrondi à une barre fixe (27,5 ne donne plus 25)', () => {
  let n = 0;
  const brute = (kg, reps) => ({ id: 'i' + (++n), rang: n, charge_kg: kg, reps: reps, rpe: null, ressenti: null,
    type_serie: 'travail', exercise_slug: 'x' });
  const jour = (md) => '2026-' + md + 'T18:00:00+00:00';
  const O = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false };
  const hist = () => [
    { seance: { id: 'S2', debut: jour('10-10') }, series: [brute(27.5, 8), brute(27.5, 8), brute(27.5, 8)] },
    { seance: { id: 'S1', debut: jour('10-06') }, series: [brute(27.5, 8), brute(27.5, 8), brute(27.5, 8)] }];
  const consigne = (salle) => Mo.consigneDExercice(hist(), undefined, jour('10-14'),
    salle === undefined ? O : Object.assign({ salle }, O)).consigne;

  test('⚠️ DISCRIMINANT — rowing à 27,5 kg : la charge du coach, comme sans salle déclarée', () => {
    const sans = consigne(undefined);
    expect(sans.ligne.charge).toBe(27.5);
    const c = consigne(Profil.salleDeLExercice(P, 'rowing_barre', APRES));
    expect([c.etat, c.ligne]).toEqual([sans.etat, sans.ligne]);
  });
  test('prémisse — l’ancienne règle (colonne absente) l’arrondissait à 25 : le test discrimine', () => {
    expect(consigne(Profil.salleDeLExercice(P, 'rowing_barre', AVANT)).ligne.charge).toBe(25);
  });
});

// ═══ 3. L'OBJECTIF ════════════════════════════════════════════════════════
describe('128 — l’objectif lit Ma salle par `salleDeLExercice` : un rowing à 80 kg n’est plus refusé', () => {
  const MAINTENANT = new Date(2026, 9, 16, 12, 0, 0);
  const BARRE = M.optionsDeRecord({ mesure: 'charge_reps', charge: 'externe', equipement: 'barre' });
  let n = 0;
  const seance = (j, series) => {
    const id = 's' + (++n);
    const [a, m, d] = j.split('-').map(Number);
    return { id, debut: new Date(a, m - 1, d, 18, 0, 0).toISOString(),
      series: series.map(([c, r], i) => ({ id: id + '-' + (i + 1), session_id: id, exercise_slug: 'x', charge_kg: c, reps: r,
        type_serie: 'travail', rang: i + 1, validee_a: null })) };
  };
  const poser = (seances, charge, salle) => Obj.projection({ seances, charge, reps: 8, maintenant: MAINTENANT,
    anciennete: null, options: BARRE, salle });

  // ⚠️ 80 kg au-delà d'une salle à 30 kg passait déjà avant 128 : la garde de la salle en vigueur (`salleEnVigueur`,
  // record de 70 kg au-delà de la plus lourde barre fixe) y voyait déjà une barre qu'on charge. Ce test garde le cas
  // demandé ; celui qui discrimine est le rowing LÉGER, plus bas (record 25 kg, sous la plus lourde).
  test('rowing (`false`) : 80 kg, salle à 30 kg, n’est pas refusé', () => {
    const rowing = [seance('2026-06-01', [[60, 8]]), seance('2026-08-01', [[65, 8]]), seance('2026-10-01', [[70, 8]])];
    expect(poser(rowing, 80, Profil.salleDeLExercice(P, 'rowing_barre', APRES)).etat).not.toBe('hors_salle');
  });
  test('curl EZ (`true`) : 35 kg, salle à 30 kg, toujours refusé', () => {
    const curl = [seance('2026-06-01', [[20, 8]]), seance('2026-08-01', [[22.5, 8]]), seance('2026-10-01', [[25, 8]])];
    const p = poser(curl, 35, Profil.salleDeLExercice(P, 'curl_biceps_barre_ez', APRES));
    expect([p.etat, p.salle, p.max]).toEqual(['hors_salle', 'barre_ez', 30]);
  });
  test('⚠️ DISCRIMINANT — rowing léger (record 25) : 35 kg était refusé sans la colonne (barre droite de 30), ne l’est plus', () => {
    const leger = [seance('2026-06-01', [[20, 8]]), seance('2026-08-01', [[22.5, 8]]), seance('2026-10-01', [[25, 8]])];
    expect(poser(leger, 35, Profil.salleDeLExercice(P, 'rowing_barre', AVANT)).etat).toBe('hors_salle');
    expect(poser(leger, 35, Profil.salleDeLExercice(P, 'rowing_barre', APRES)).etat).not.toBe('hors_salle');
  });
});

// ═══ 4. LA LECTURE DU CATALOGUE ═══════════════════════════════════════════
describe('128 — `barre_charge_fixe` par la seconde lecture du catalogue (celle de 127)', () => {
  const LIGNES = [
    { slug: 'rowing_barre', nom: 'Rowing Barre', equipement: 'barre' },
    { slug: 'curl_biceps_barre_ez', nom: 'Curl Biceps (Barre EZ)', equipement: 'barre' },
    { slug: 'presse_cuisses', nom: 'Presse', equipement: 'machine' }
  ];
  let requetes;
  const client = (avecColonne) => ({
    from() {
      let select = '';
      const c = {
        select(s) { select = s; return c; }, eq() { return c; }, gt() { return c; }, or() { return c; },
        order() { return c; }, limit() { return c; }, range() { return c; },
        then(res, rej) {
          requetes.push(select);
          const accessoire = /barre_charge_fixe/.test(select);
          if (accessoire && !avecColonne) {
            return Promise.resolve({ data: null, error: { code: '42703', message: 'column exercises.barre_charge_fixe does not exist' } }).then(res, rej);
          }
          const premiere = requetes.filter((x) => x === select).length === 1;
          const data = !premiere ? [] : accessoire
            ? [{ slug: 'rowing_barre', echelle: null, echelle_rang: null, barre_charge_fixe: false },
               { slug: 'curl_biceps_barre_ez', echelle: null, echelle_rang: null, barre_charge_fixe: true },
               { slug: 'presse_cuisses', echelle: null, echelle_rang: null, barre_charge_fixe: null }]
            : LIGNES.map((l) => Object.assign({}, l));
          return Promise.resolve({ data, error: null }).then(res, rej);
        }
      };
      return c;
    }
  });
  const charger = (avecColonne) => {
    requetes = [];
    globalThis.THSeance = S;
    globalThis.THClient = { obtenir: () => client(avecColonne) };
    delete require.cache[require.resolve('../../v2/js/donnees.js')];
    return require('../../v2/js/donnees.js');
  };
  afterEach(() => { delete globalThis.THClient; });

  test('le `select` principal ne nomme PAS `barre_charge_fixe` ; la seconde lecture, oui (une seule, avec les échelles)', async () => {
    const D = charger(true);
    await D.tousLesExercices();
    expect(requetes[0]).not.toMatch(/barre_charge_fixe/);
    const accessoires = requetes.filter((r) => /barre_charge_fixe/.test(r));
    expect(accessoires.length).toBeGreaterThan(0);
    accessoires.forEach((r) => expect(r).toMatch(/echelle_rang/));
  });
  test('colonne présente : posée sur chaque fiche (un booléen) ; `null` laissée absente', async () => {
    const D = charger(true);
    const ix = M.indexerExercices(await D.tousLesExercices());
    expect(ix.rowing_barre.barre_charge_fixe).toBe(false);
    expect(ix.curl_biceps_barre_ez.barre_charge_fixe).toBe(true);
    expect(ix.presse_cuisses).not.toHaveProperty('barre_charge_fixe');
    expect(Profil.salleDeLExercice(P, 'rowing_barre', ix)).toBeNull();
  });
  test('colonne absente (v2_099 pas lancée) : le catalogue entier, ses fiches sans la colonne (`undefined`)', async () => {
    const D = charger(false);
    const cat = await D.tousLesExercices();
    expect(cat.map((e) => e.slug)).toEqual(['rowing_barre', 'curl_biceps_barre_ez', 'presse_cuisses']);
    expect(cat.every((e) => e.barre_charge_fixe === undefined)).toBe(true);
  });
});
