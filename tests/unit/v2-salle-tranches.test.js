/** @jest-environment node */
//
// 123 (16/10/2026, v2_095) — « MA SALLE » : LES HALTÈRES PAR TRANCHES (MOTEUR §10 bis, ECRAN-PROFIL §2.4 quinquies ;
// audit du 16/10, 03 #7). Demande d'Aurélien, mot pour mot : « Ok ma salle, par contre pour les petites haltères de 1
// à 10 c'est de 1 en 1 ». Sa salle (Basic-Fit) : de 1 en 1 jusqu'à 10 kg, puis de 2 en 2 jusqu'à 40 kg.
//
// Ce fichier éprouve :
//   1. la déclaration : les tranches, leurs bornes (celles de v2_095), les deux formes écrites, l'ancienne lue ;
//   2. les charges : 9, 10, 12 autour de 11 ; la paire ; le plafond = le plus lourd de la dernière tranche ;
//   3. le coach : l'arrondi, le cran, la dégressive (2 × 24 → 2 × 18), l'objectif ;
//   4. la feuille (le vrai `ouvrirSalleProfil`, dans un bac `vm`) : « + Une tranche », « Retirer », « Pas d'haltères »,
//      le « jusqu'à » vide ligne par ligne (116) ;
//   5. avant et après v2_095 : une salle à une tranche s'écrit sous la forme que v2_088 accepte ; à deux, la base
//      d'avant la refuse et le Profil le dit (le mécanisme de 116), celle d'après l'accepte.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
const Profil = require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
require('../../v2/js/semaine.js');
require('../../v2/js/generateur.js');
require('../../v2/js/bilan.js');
const Obj = require('../../v2/js/objectif.js');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const NB = '\u00a0';
const BASIC_FIT = [{ jusqua: 10, pas: 1 }, { jusqua: 40, pas: 2 }];
const SALLE_AUREL = { barres_ez: [10, 15, 20, 25, 30], barres_droites: [10, 15, 20, 25, 30], halteres: BASIC_FIT };
const ANCIENNE = { barres_ez: [10, 15, 20, 25, 30], barres_droites: [], halteres: { max: 40, pas: 2 } };
const INDEX = {
  elevation_laterale_haltere: { slug: 'elevation_laterale_haltere', nom: 'Élévation Latérale (Haltère)', equipement: 'haltere',
    mouvement: 'elev_lat', muscles_primaires: ['deltoide_lateral'], muscles_secondaires: [], muscles_stabilisateurs: [] },
  curl_biceps_haltere: { slug: 'curl_biceps_haltere', nom: 'Curl Biceps (Haltère)', equipement: 'haltere',
    mouvement: 'curl', muscles_primaires: ['biceps'], muscles_secondaires: ['avant_bras'], muscles_stabilisateurs: [] }
};
const salleDe = (ma) => Profil.salleDeLExercice({ ma_salle: ma }, 'elevation_laterale_haltere', INDEX);
const parHaltere = (s) => s.charges.map((v) => v / 2);

// ═══ 1. LA DÉCLARATION ════════════════════════════════════════════════════
describe('123 — la déclaration par tranches (bornes de v2_095)', () => {
  test('deux tranches : la liste, triée ; une tranche (liste ou ancienne forme) : `{ max, pas }`', () => {
    expect(Profil.salleValide({ halteres: [{ jusqua: 40, pas: 2 }, { jusqua: 10, pas: 1 }] }))
      .toEqual({ barres_ez: [], barres_droites: [], halteres: BASIC_FIT });
    expect(Profil.salleValide({ halteres: [{ jusqua: 40, pas: 2 }] }).halteres).toEqual({ max: 40, pas: 2 });
    expect(Profil.salleValide(ANCIENNE)).toEqual(ANCIENNE);
    expect(Profil.salleValide({ halteres: [{ jusqua: 10, pas: 1 }, { jusqua: 20, pas: 2 }, { jusqua: 50, pas: 2.5 }] }).halteres)
      .toHaveLength(3);
  });

  test('DISCRIMINANT — hors des bornes de v2_095 : refusée, jamais corrigée en silence', () => {
    [[], [{ jusqua: 5, pas: 1 }, { jusqua: 10, pas: 1 }, { jusqua: 20, pas: 2 }, { jusqua: 40, pas: 2 }],
     [{ jusqua: 10, pas: 1 }, { jusqua: 10, pas: 1 }], [{ jusqua: 10, pas: 1 }, { jusqua: 11, pas: 2 }],
     [{ jusqua: 4, pas: 5 }], [{ jusqua: 10.3, pas: 1 }], [{ jusqua: 10, pas: 0.25 }], [{ jusqua: 101, pas: 2 }],
     [{ jusqua: '10', pas: 1 }], [{ jusqua: 10 }], [10, 40]]
      .forEach((h) => {
        expect(Profil.salleValide({ halteres: h })).toBeUndefined();
        expect(Profil.champsEcrits({ ma_salle: { halteres: h } })).toEqual({});
      });
  });

  test('l’ancienne forme se lit comme une tranche unique ; `champsEcrits` ne la réécrit pas autrement', () => {
    expect(Profil.tranchesDe(ANCIENNE.halteres)).toEqual([{ jusqua: 40, pas: 2 }]);
    expect(Profil.champsEcrits({ ma_salle: ANCIENNE })).toEqual({ ma_salle: ANCIENNE });
    expect(Profil.champsEcrits({ ma_salle: SALLE_AUREL })).toEqual({ ma_salle: SALLE_AUREL });
    expect(Profil.resumeSalle({ ma_salle: SALLE_AUREL })).toBe('EZ, droite, haltères');
  });
});

// ═══ 2. LES CHARGES ═══════════════════════════════════════════════════════
describe('123 — les charges que la salle fait, toutes tranches confondues', () => {
  test('⚠️ DISCRIMINANT — la salle d’Aurélien : 1 … 10 de 1 en 1, puis 12 … 40 de 2 en 2 ; 9, 10, 12 autour de 11', () => {
    const h = parHaltere(salleDe(SALLE_AUREL));
    expect(h.slice(0, 12)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14]);
    expect(h).not.toContain(11);
    expect(h).not.toContain(13);
    expect(h[h.length - 1]).toBe(40);
    expect(h).toHaveLength(10 + 15);
    // Les séries notent la paire (§10.1) : 2 × 11 = 22 n'existe pas.
    const s = salleDe(SALLE_AUREL);
    expect(M.dansLaSalle(s, 22)).toBe(false);
    expect([M.voisineDeLaSalle(s, 22, -1), M.voisineDeLaSalle(s, 22, 1)]).toEqual([20, 24]);
    expect(M.voisineDeLaSalle(s, 20, -1)).toBe(18);
    expect(M.arrondieALaSalle(s, 22)).toBe(20);
  });

  test('prémisse — l’ancienne déclaration (« jusqu’à 40, de 2 en 2 ») n’a ni 1, 3, 5, 7, 9 kg', () => {
    const h = parHaltere(salleDe(ANCIENNE));
    expect(h.slice(0, 5)).toEqual([2, 4, 6, 8, 10]);
    expect(h).not.toContain(7);
  });

  test('le plafond = le plus lourd de la dernière tranche (2 × 40) ; une tranche du milieu qui ne finit pas sur son pas', () => {
    expect(M.maxDeLaSalle(salleDe(SALLE_AUREL))).toBe(80);
    expect(Profil.chargesDesTranches([{ jusqua: 11, pas: 2 }, { jusqua: 20, pas: 2.5 }]))
      .toEqual([2, 4, 6, 8, 10, 12.5, 15, 17.5, 20]);
  });
});

// ═══ 3. LE COACH ══════════════════════════════════════════════════════════
let n = 0;
const brute = (kg, reps) => ({ id: 'i' + (++n), rang: n, charge_kg: kg, reps: reps, rpe: null, ressenti: null,
  type_serie: 'travail', exercise_slug: 'x' });
const jour = (md) => '2026-' + md + 'T18:00:00+00:00';
const AVANT = jour('10-14');
const DH = { mesure: 'charge_reps', equipement: 'haltere', intention: 'progresser', reglage: 'normal', edition: false };

describe('123 — le coach lit les tranches (§10 bis)', () => {
  // Les élévations latérales à 2 × 7 = 14 kg (l'exemple de l'audit, 03 #7).
  const lat = (derniere) => [
    { seance: { id: 'S3', debut: jour('10-10') }, series: derniere.map((r) => brute(14, r)) },
    { seance: { id: 'S2', debut: jour('10-06') }, series: [brute(14, 12), brute(14, 12), brute(14, 12)] },
    { seance: { id: 'S1', debut: jour('10-02') }, series: [brute(12, 12), brute(12, 12), brute(12, 12)] }];

  test('⚠️ DISCRIMINANT — 2 × 7 kg tient : avec les tranches, la ligne reste à 14 ; l’ancienne déclaration l’arrondissait à 12', () => {
    expect(salleDe(SALLE_AUREL)).not.toBeNull();             // la salle par tranches est lue (avant 123 : illisible, ignorée)
    const avec = M.consigneDExercice(lat([12, 12, 12]), undefined, AVANT, Object.assign({ salle: salleDe(SALLE_AUREL) }, DH)).consigne;
    const avant = M.consigneDExercice(lat([12, 12, 12]), undefined, AVANT, Object.assign({ salle: salleDe(ANCIENNE) }, DH)).consigne;
    expect(avec.ligne.charge).toBe(14);
    expect(avant.ligne.charge).toBe(12);
  });

  test('le cran au-dessus : 2 × 8 sous 10 kg (de 1 en 1), 2 × 12 après 2 × 10 (11 n’existe pas)', () => {
    const s = salleDe(SALLE_AUREL);
    expect(M.voisineDeLaSalle(s, 14, 1)).toBe(16);
    expect(M.voisineDeLaSalle(s, 20, 1)).toBe(24);
  });

  test('une charge d’une autre salle (2 × 11) s’arrondit en dessous, à 2 × 10', () => {
    const hist = [{ seance: { id: 'S2', debut: jour('10-10') }, series: [brute(22, 10), brute(22, 10), brute(22, 10)] },
      { seance: { id: 'S1', debut: jour('10-06') }, series: [brute(22, 9), brute(22, 9), brute(22, 9)] }];
    const c = M.consigneDExercice(hist, undefined, AVANT, Object.assign({ salle: salleDe(SALLE_AUREL) }, DH)).consigne;
    expect(c.ligne.charge).toBe(20);
  });

  test('⚠️ DISCRIMINANT — la dégressive à 2 × 24 : 2 × 18 (−22,5 % = 37,2, au cran inférieur que la salle fait ; 2 × 20 = −17 % n’est pas une baisse de 20 à 25 %)', () => {
    const d = M.degressiveDe({ equipement: 'haltere', derniere_serie: 48, reps_travail: 12, salle: salleDe(SALLE_AUREL) });
    expect(d.charge).toBe(36);
    expect(d.phrase).toBe('Dégressive : 36' + NB + 'kg, sans repos, jusqu\'à l\'échec. Vise 5 à 7.');
    // Sous 10 kg, les crans de 1 kg : 2 × 9 = 18 → −22,5 % = 13,95 → 2 × 6 = 12 (14 serait au-dessus de la cible).
    expect(M.degressiveDe({ equipement: 'haltere', derniere_serie: 18, reps_travail: 12, salle: salleDe(SALLE_AUREL) }).charge).toBe(12);
  });

  test('dans le plan : la ligne dégressive aux haltères prend 2 × 18 après 2 × 24, et le plan passe ses invariants (I46)', () => {
    const cat = { curl_biceps_haltere: Object.assign({}, INDEX.curl_biceps_haltere,
      { salle: Profil.salleDeLExercice({ ma_salle: SALLE_AUREL }, 'curl_biceps_haltere', INDEX) }) };
    let k = 0;
    const id = () => 's' + (++k);
    let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'curl_biceps_haltere', id, { series: 1 });
    se = S.ajouterSerie(se, 0, id);
    se = S.changerType(se, 0, 1, 'degressive');
    se = S.valider(S.modifierSerie(se, 0, 0, { charge_kg: 48, reps: 12 }), 0, 0, new Date('2026-10-14T10:00:00+00:00'));
    const e = { seance: { id: 'S1', debut: '2026-10-14T10:00:00+00:00', edition: false, exercices: se.exercices },
      consignes: { curl_biceps_haltere: null }, catalogue: cat, reglage: 'normal', paris: [], suites: {} };
    const p = T.planDeSeance(e);
    expect(p.exercices[0].degressive.charge).toBe(36);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('l’objectif (règle du 122) lit les tranches : au-delà de 2 × 40, refusé avec le fait ; 2 × 11 n’est pas refusé (il s’atteint à 2 × 12)', () => {
    const s = salleDe(SALLE_AUREL);
    const MAINT = new Date(2026, 9, 16, 12, 0, 0);
    const poser = (charge) => Obj.projection({ seances: [], charge: charge, reps: 10, maintenant: MAINT, anciennete: null,
      options: global.THModele.optionsDeRecord({ mesure: 'charge_reps', charge: 'externe', equipement: 'haltere' }), salle: s });
    const p = poser(84);
    expect(p.etat).toBe('hors_salle');
    expect(Obj.phraseHorsSalle(p)).toBe('Ta salle va jusqu’à 2' + NB + '×' + NB + global.THModele.charge(40) + ' en haltères.');
    expect(poser(80).etat).not.toBe('hors_salle');
    expect(poser(22).etat).not.toBe('hors_salle');
  });
});

// ═══ 4. LA FEUILLE ════════════════════════════════════════════════════════
const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const FN = APP.match(/^  function ouvrirSalleProfil\b[\s\S]*?^  }/m)[0];
function feuille(profil) {
  const etat = { vue: null, fermes: 0, ecrits: [] };
  const ctx = {
    Profil, Modele: global.THModele, profil, feuilleProfil: null,
    $: () => ({}),
    Rendu: { rendreFeuilleSalle: (cible, vue) => { etat.vue = vue; } },
    ouvrirFeuilleProfil: () => ctx.feuilleProfil({}),
    fermerVoile: () => { etat.fermes++; },
    ecrireProfil: (c) => { etat.ecrits.push(c); }
  };
  vm.createContext(ctx);
  vm.runInContext(FN, ctx);
  vm.runInContext('ouvrirSalleProfil()', ctx);
  return etat;
}

describe('123 — la feuille : une ligne par tranche, « + Une tranche », « Pas d’haltères »', () => {
  test('⚠️ DISCRIMINANT — déclarer la salle d’Aurélien : 10 de 1 en 1, « + Une tranche », 40 de 2 en 2 → la liste part', () => {
    const f = feuille({ ma_salle: { barres_ez: [10, 15, 20, 25, 30], barres_droites: [10, 15, 20, 25, 30], halteres: null } });
    expect(f.vue.aucunHaltere()).toBe(true);                 // « Pas d'haltères » allumée : rien de déclaré
    f.vue.surMaxHalteres('10', 0);
    f.vue.surPasHalteres(1, 0);
    expect(f.vue.aucunHaltere()).toBe(false);
    f.vue.surAjouterTranche();
    expect(f.vue.brouillon.halteres).toHaveLength(2);
    f.vue.surMaxHalteres('40', 1);
    f.vue.surPasHalteres(2, 1);
    f.vue.surValider();
    expect(f.ecrits).toEqual([{ ma_salle: SALLE_AUREL }]);
    expect(f.fermes).toBe(1);
  });

  test('au plus 3 tranches ; « Retirer » une tranche ; une seule tranche part sous l’ancienne forme', () => {
    const f = feuille({ ma_salle: SALLE_AUREL });
    expect(Profil.peutAjouterTranche(f.vue.brouillon)).toBe(true);
    f.vue.surAjouterTranche();
    expect(Profil.peutAjouterTranche(f.vue.brouillon)).toBe(false);
    f.vue.surAjouterTranche();
    expect(f.vue.brouillon.halteres).toHaveLength(3);
    f.vue.surRetirerTranche(2);
    f.vue.surRetirerTranche(0);
    f.vue.surValider();
    expect(f.ecrits[0].ma_salle.halteres).toEqual({ max: 40, pas: 2 });
  });

  test('⚠️ DISCRIMINANT — « Pas d’haltères » : le geste explicite efface les haltères déclarés (vider le champ ne le fait pas)', () => {
    const f = feuille({ ma_salle: SALLE_AUREL });
    f.vue.surSansHalteres();
    expect(f.vue.aucunHaltere()).toBe(true);
    f.vue.surValider();
    expect(f.ecrits).toEqual([{ ma_salle: { barres_ez: SALLE_AUREL.barres_ez, barres_droites: SALLE_AUREL.barres_droites, halteres: null } }]);
  });

  test('116, ligne par ligne — un « jusqu’à » vidé reprend celui de sa tranche, la feuille reste ouverte, la phrase le dit', () => {
    const f = feuille({ ma_salle: SALLE_AUREL });
    f.vue.surMaxHalteres('', 0);
    f.vue.surValider();
    expect(f.ecrits).toEqual([]);
    expect(f.fermes).toBe(0);
    expect(f.vue.erreur).toBe('« Jusqu’à » vide ou illisible : je remets 10 kg.');
    expect(f.vue.brouillon.halteres[0]).toMatchObject({ jusqua: 10, pas: 1 });
    f.vue.surValider();
    expect(f.ecrits).toEqual([{ ma_salle: SALLE_AUREL }]);
  });

  test('une tranche ajoutée et laissée vide : la feuille reste ouverte, rien n’est inventé', () => {
    const f = feuille({ ma_salle: ANCIENNE });
    f.vue.surAjouterTranche();
    f.vue.surValider();
    expect(f.ecrits).toEqual([]);
    expect(f.vue.erreur).toBe('« Jusqu’à » vide ou illisible : remplis-le, ou retire la tranche.');
    f.vue.surRetirerTranche(1);
    f.vue.surValider();
    expect(f.ecrits).toEqual([{ ma_salle: ANCIENNE }]);
  });

  test('des tranches dans le désordre se rangent ; une tranche sans charge (10 → 11 de 2 en 2) : la phrase des tranches', () => {
    const f = feuille({});
    f.vue.surMaxHalteres('40', 0);
    f.vue.surAjouterTranche();
    f.vue.surMaxHalteres('10', 1);
    f.vue.surPasHalteres(1, 1);
    f.vue.surValider();
    expect(f.ecrits[0].ma_salle.halteres).toEqual(BASIC_FIT);
    const g = feuille({});
    g.vue.surMaxHalteres('10', 0);
    g.vue.surPasHalteres(1, 0);
    g.vue.surAjouterTranche();
    g.vue.surMaxHalteres('11', 1);
    g.vue.surPasHalteres(2, 1);
    g.vue.surValider();
    expect(g.ecrits).toEqual([]);
    expect(g.vue.erreur).toBe('Haltères : chaque « jusqu’à » entre 1 et 100 kg, plus lourd que le précédent ; un écart de 0,5 à 10 kg, pas plus grand que sa tranche.');
  });
});

// ═══ 5. AVANT ET APRÈS v2_095 ═════════════════════════════════════════════
// La contrainte, imitée sur ses deux versions : v2_088 (`{ max, pas }` seulement) et v2_095 (aussi la liste).
function halteresAcceptees(h, v2095) {
  const demi = (x) => typeof x === 'number' && Math.round(x * 2) === x * 2;
  if (h === undefined || h === null) return true;
  if (!Array.isArray(h)) {
    return typeof h === 'object' && Object.keys(h).every((k) => k === 'max' || k === 'pas') && demi(h.max) && demi(h.pas) &&
      h.max >= 1 && h.max <= 100 && h.pas >= 0.5 && h.pas <= 10 && h.pas <= h.max;
  }
  if (!v2095 || !h.length || h.length > 3) return false;
  return h.every((t, i) => Object.keys(t).every((k) => k === 'jusqua' || k === 'pas') && demi(t.jusqua) && demi(t.pas) &&
    t.jusqua >= 1 && t.jusqua <= 100 && t.pas >= 0.5 && t.pas <= 10 &&
    t.jusqua > (i ? h[i - 1].jusqua : 0) && t.pas <= t.jusqua - (i ? h[i - 1].jusqua : 0));
}

describe('123 — avant et après v2_095', () => {
  test('une tranche unique s’écrit sous la forme que v2_088 accepte déjà (l’app d’avant la lit aussi)', () => {
    const f = feuille({});
    f.vue.surMaxHalteres('24', 0);
    f.vue.surPasHalteres(2.5, 0);
    f.vue.surValider();
    const h = f.ecrits[0].ma_salle.halteres;
    expect(h).toEqual({ max: 24, pas: 2.5 });
    expect(halteresAcceptees(h, false)).toBe(true);
  });

  test('deux tranches : refusées par v2_088 (23514, refus définitif pour la colonne seule), acceptées par v2_095', () => {
    const h = Profil.champsSalle({ barres_ez: [], barres_droites: [], halteres: BASIC_FIT.map((t) => Object.assign({ pasChoisi: true }, t)) }).ma_salle.halteres;
    expect(halteresAcceptees(h, false)).toBe(false);
    expect(halteresAcceptees(h, true)).toBe(true);
    // Le refus de la base d'avant : définitif, la colonne sort de l'envoi et le Profil le dit (116).
    expect(Profil.estRefusDefinitif({ code: '23514' })).toBe(true);
    expect(Profil.phraseRefusProfil(['ma_salle'])).toMatch(/^Pas enregistré : Ma salle\./);
  });

  test('toute forme que l’app écrit est acceptée par v2_095 (la contrainte imitée), et toute forme refusée par l’app l’est aussi par elle', () => {
    const essais = [BASIC_FIT, [{ jusqua: 40, pas: 2 }], [{ jusqua: 10, pas: 1 }, { jusqua: 20, pas: 2 }, { jusqua: 50, pas: 2.5 }],
      [{ jusqua: 10, pas: 1 }, { jusqua: 11, pas: 2 }], [{ jusqua: 4, pas: 5 }], [], { max: 40, pas: 2 }, { max: 4, pas: 5 }];
    essais.forEach((h) => {
      const s = Profil.salleValide({ halteres: h });
      if (s === undefined) expect(halteresAcceptees(h, true)).toBe(false);
      else expect(halteresAcceptees(s.halteres, true)).toBe(true);
    });
  });
});
