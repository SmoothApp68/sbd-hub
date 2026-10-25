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
//   4. la lecture du catalogue : `barre_charge_fixe` dans le `select` du catalogue, une seule lecture (129 — la seconde
//      lecture de 127-128 a servi le temps de v2_099) ; `null` ou une ligne sans la colonne : la fiche sans elle.
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

  // ⚠️ 144-7 — 80 kg avec un record de 70 passait AUSSI sur l'ancienne règle (colonne absente) : la garde de la salle
  // en vigueur (`salleEnVigueur`, record au-delà de la plus lourde barre fixe) y voyait déjà une barre qu'on charge.
  // Le test ne discriminait rien. Le cas demandé (80 kg, salle à 30 kg) se garde donc avec un record SOUS la plus lourde
  // barre fixe (25 kg) : c'est là que l'ancienne règle refusait, et que la colonne `false` ne refuse plus.
  const LEGER = () => [seance('2026-06-01', [[20, 8]]), seance('2026-08-01', [[22.5, 8]]), seance('2026-10-01', [[25, 8]])];
  test('rowing (`false`) : 80 kg, salle à 30 kg, n’est pas refusé', () => {
    expect(poser(LEGER(), 80, Profil.salleDeLExercice(P, 'rowing_barre', APRES)).etat).not.toBe('hors_salle');
  });
});

// ═══ 4. LA LECTURE DU CATALOGUE ═══════════════════════════════════════════
// 129 — une seule lecture : `barre_charge_fixe` rejoint le `select` du catalogue (v2_099 lancée le 21/10). Le résultat
// pour l'app ne change pas : un booléen posé, `null` laissée absente, une ligne sans la colonne (cache d'avant, faux
// serveur) lue sans elle — et l'ancienne règle de Ma salle s'applique.
describe('128-129 — `barre_charge_fixe` par la lecture du catalogue (une seule)', () => {
  const LIGNES = [
    { slug: 'rowing_barre', nom: 'Rowing Barre', equipement: 'barre', barre_charge_fixe: false },
    { slug: 'curl_biceps_barre_ez', nom: 'Curl Biceps (Barre EZ)', equipement: 'barre', barre_charge_fixe: true },
    { slug: 'presse_cuisses', nom: 'Presse', equipement: 'machine', barre_charge_fixe: null }
  ];
  let requetes;
  const client = (avecColonne) => ({
    from(table) {
      let select = '';
      const c = {
        select(s) { select = s; return c; }, eq() { return c; }, gt() { return c; }, or() { return c; },
        order() { return c; }, limit() { return c; }, range() { return c; },
        then(res, rej) {
          requetes.push({ table, select });
          const premiere = requetes.filter((x) => x.select === select).length === 1;
          const data = !premiere ? [] : LIGNES.map((l) => {
            const x = Object.assign({}, l);
            if (!avecColonne) delete x.barre_charge_fixe;
            return x;
          });
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

  test('une seule lecture du catalogue : son `select` nomme `barre_charge_fixe` (avec les échelles)', async () => {
    const D = charger(true);
    await D.tousLesExercices();
    const selects = Array.from(new Set(requetes.filter((r) => r.table === 'exercises').map((r) => r.select)));
    expect(selects.length).toBe(1);
    expect(selects[0]).toMatch(/\bbarre_charge_fixe\b/);
    expect(selects[0]).toMatch(/\bechelle_rang\b/);
  });
  test('colonne présente : posée sur chaque fiche (un booléen) ; `null` laissée absente', async () => {
    const D = charger(true);
    const ix = M.indexerExercices(await D.tousLesExercices());
    expect(ix.rowing_barre.barre_charge_fixe).toBe(false);
    expect(ix.curl_biceps_barre_ez.barre_charge_fixe).toBe(true);
    expect(ix.presse_cuisses).not.toHaveProperty('barre_charge_fixe');
    expect(Profil.salleDeLExercice(P, 'rowing_barre', ix)).toBeNull();
  });
});

// ═══ 163 — « MA SALLE » NE GARDE QUE LES ÉLASTIQUES ═══════════════════════════
// Décision d'Aurélien du 24/10/2026 : les barres fixes ne sont plus lues. `barre_charge_fixe` (la colonne du catalogue)
// reste en base et à la lecture du catalogue (ci-dessus), mais n'a plus d'effet sur la salle. Les tests de 128 qui
// vérifiaient `salleDeLExercice` pour une barre fixe (EZ, droite, la colonne qui prime sur la barre lourde, l'ancienne
// règle sans la colonne) sont RETIRÉS ; le moteur lit toujours une salle forgée (`aide-salle-forgee.js`).
describe('163 — `barre_charge_fixe` n’a plus d’effet : aucune salle de barre', () => {
  test('⚠️ DISCRIMINANT — le curl EZ, la barre droite et le rowing : `null`, déclarées ou non', () => {
    ['curl_biceps_barre_ez', 'curl_biceps_barre', 'rowing_barre', 'squat_barre'].forEach((slug) => {
      expect(Profil.salleDeLExercice(P, slug, APRES)).toBeNull();
      expect(Profil.salleDeLExercice(P, slug, AVANT)).toBeNull();
    });
  });
});
