/** @jest-environment node */
//
// 108 — « MA SALLE » : LES BARRES FIXES ET LES HALTÈRES DE LA SALLE (MOTEUR §10 bis, ECRAN-PROFIL §2.4 quinquies ;
// décidé le 15/10/2026, maquette `maquette-salle-objectif-v1.html`, écrans 1 et 2).
//
// « Le coach ne propose jamais une charge que la salle n'a pas. » Seulement pour qui le déclare ; non renseigné, rien
// ne change. Cas réel d'Aurélien (Basic-Fit) : curl EZ, barres de 10 à 30 kg de 5 en 5 ; au-dessus de 30 impossible.
//
// Ce fichier éprouve :
//   1. la déclaration (profil.js) : la forme, les bornes de la contrainte, ce qui part en base ;
//   2. quelle salle pour quel exercice : l'EZ par son nom, la droite, la barre lourde exclue, les haltères en paire ;
//   3. le moteur : le curl EZ à 30 kg qui devrait monter → on monte en reps, jamais 32,5 ; la réaction se tait ;
//      les haltères arrondis aux charges déclarées ; la barre chargée de disques n'est pas concernée ;
//   4. le plan : la dégressive à barre fixe (« Prends la barre de 20 kg. »), les chauffes, I46 ;
//   5. sans déclaration, rien ne change ;
//   6. la colonne absente en base (v2_088 pas lancée) : le profil se lit et s'écrit.
// « Puis en séries » n'est pas tranché (MOTEUR §10 bis) : un `test.todo` le dit.

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

const NB = ' ';
const SALLE_AUREL = { barres_ez: [10, 15, 20, 25, 30], barres_droites: [10, 15, 20, 25, 30], halteres: { max: 40, pas: 2 } };
// Le catalogue, tel qu'en base (`exercises` : `equipement`, `nom`, `mouvement`).
const INDEX = {
  curl_biceps_barre_ez: { slug: 'curl_biceps_barre_ez', nom: 'Curl Biceps (Barre EZ)', equipement: 'barre', mouvement: 'curl', muscles_primaires: ['biceps'] },
  curl_biceps_barre: { slug: 'curl_biceps_barre', nom: 'Curl Biceps (Barre)', equipement: 'barre', mouvement: 'curl', muscles_primaires: ['biceps'] },
  rowing_barre: { slug: 'rowing_barre', nom: 'Rowing Barre', equipement: 'barre', mouvement: 'rowing', muscles_primaires: ['grand_dorsal'] },
  squat_barre: { slug: 'squat_barre', nom: 'Squat (Barre)', equipement: 'barre', mouvement: 'squat', muscles_primaires: ['quadriceps'] },
  squat_avec_pause_barre: { slug: 'squat_avec_pause_barre', nom: 'Squat avec pause (barre)', equipement: 'barre', mouvement: 'squat', muscles_primaires: ['quadriceps'] },
  developpe_couche_haltere: { slug: 'developpe_couche_haltere', nom: 'Développé Couché (Haltère)', equipement: 'haltere', mouvement: 'developpe_couche', muscles_primaires: ['pectoraux'] },
  extension_jambes: { slug: 'extension_jambes', nom: 'Leg Extension', equipement: 'machine', mouvement: null, muscles_primaires: ['quadriceps'] }
};

let n = 0;
const brute = (kg, reps, type) => ({ id: 'i' + (++n), rang: n, charge_kg: kg, reps: reps, rpe: null, ressenti: null,
  type_serie: type || 'travail', exercise_slug: 'x' });
const jour = (md) => '2026-' + md + 'T18:00:00+00:00';
const AVANT = jour('10-14');
const O = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false };

// Le curl EZ d'Aurélien : 25, 27,5 (une autre salle), puis 30 kg ; la dernière séance `derniere`.
function curlEZ(derniere) {
  return [
    { seance: { id: 'S4', debut: jour('10-10') }, series: derniere.map((r) => brute(30, r)) },
    { seance: { id: 'S3', debut: jour('10-06') }, series: [brute(30, 10), brute(30, 10), brute(30, 10)] },
    { seance: { id: 'S2', debut: jour('10-02') }, series: [brute(27.5, 12), brute(27.5, 12), brute(27.5, 12)] },
    { seance: { id: 'S1', debut: jour('09-28') }, series: [brute(25, 12), brute(25, 12), brute(25, 12)] }
  ];
}
const salleEZ = () => Profil.salleDeLExercice({ ma_salle: SALLE_AUREL }, 'curl_biceps_barre_ez', INDEX);

// ═══ 1. LA DÉCLARATION ════════════════════════════════════════════════════
describe('Profil — la déclaration « Ma salle » (profiles.ma_salle, v2_088)', () => {
  test('normalisée : listes croissantes sans doublon, haltères { max, pas } ; vide → NULL (non renseignée)', () => {
    expect(Profil.salleValide({ barres_ez: [30, 10, 20, 10], halteres: { max: 40, pas: 2 } }))
      .toEqual({ barres_ez: [10, 20, 30], barres_droites: [], halteres: { max: 40, pas: 2 } });
    expect(Profil.salleValide(null)).toBeNull();
    expect(Profil.salleValide({ barres_ez: [], barres_droites: [], halteres: null })).toBeNull();
  });

  test('DISCRIMINANT — hors des bornes de `profiles_ma_salle_ok` : refusée (rien ne part), jamais corrigée en silence', () => {
    [{ barres_ez: [0] }, { barres_ez: [101] }, { barres_ez: [10.3] }, { barres_ez: ['10'] }, { barres_ez: 10 },
     { barres_ez: Array.from({ length: 21 }, (_, i) => i + 1) }, { halteres: { max: 40 } },
     { halteres: { max: 40, pas: 0.25 } }, { halteres: { max: 4, pas: 5 } }, [10, 20], 'salle']
      .forEach((v) => {
        expect(Profil.salleValide(v)).toBeUndefined();
        expect(Profil.champsEcrits({ ma_salle: v })).toEqual({});
      });
  });

  test('`champsEcrits` : la salle part (normalisée), et NULL quand elle s’efface', () => {
    expect(Profil.CHAMPS_ECRITS).toContain('ma_salle');
    expect(Profil.champsEcrits({ ma_salle: SALLE_AUREL })).toEqual({ ma_salle: SALLE_AUREL });
    expect(Profil.champsEcrits({ ma_salle: null })).toEqual({ ma_salle: null });
  });

  test('les gestes de la feuille : cocher, décocher, « ＋ », le plus lourd et l’écart des haltères', () => {
    let b = Profil.brouillonSalle({});
    expect(b).toEqual({ barres_ez: [], barres_droites: [], halteres: null });
    [10, 15, 20, 25, 30].forEach((kg) => { b = Profil.basculerBarre(b, 'barres_ez', kg); });
    b = Profil.basculerBarre(b, 'barres_ez', 15);
    b = Profil.basculerBarre(b, 'barres_ez', 12.5);   // « ＋ »
    expect(b.barres_ez).toEqual([10, 12.5, 20, 25, 30]);
    expect(Profil.pucesDeBarres(b, 'barres_ez').map((p) => p.kg + (p.coche ? '+' : ''))).toEqual(
      ['10+', '12.5+', '15', '20+', '25+', '30+', '35', '40']);
    b = Profil.poserMaxHalteres(b, 40);
    expect(b.halteres).toMatchObject({ max: 40, pas: 2 });            // l'écart de la maquette, par défaut
    b = Profil.poserPasHalteres(b, 2.5);
    expect(Profil.champsSalle(b)).toEqual({ ma_salle: { barres_ez: [10, 12.5, 20, 25, 30], barres_droites: [],
      halteres: { max: 40, pas: 2.5 } } });
    // Un écart choisi sans le plus lourd : pas d'haltères ; tout décoché : NULL.
    expect(Profil.champsSalle(Profil.poserPasHalteres(Profil.brouillonSalle({}), 2))).toEqual({ ma_salle: null });
    expect(Profil.champsSalle(Profil.poserMaxHalteres(Profil.brouillonSalle({}), 500))).toBeNull();
  });

  test('la ligne du Profil : « Ma salle », sa phrase, ce qui est déclaré', () => {
    const l = Profil.ligneSalle({ ma_salle: SALLE_AUREL }, () => {});
    expect(l.libelle).toBe('Ma salle');
    expect(l.sous).toBe('Non renseigné : le coach suppose qu’on peut ajouter des disques, comme aujourd’hui.');
    expect(l.valeur).toBe('EZ, droite, haltères');
    expect(Profil.ligneSalle({}, () => {}).valeur).toBeNull();
    expect(Profil.resumeSalle({ ma_salle: { halteres: { max: 20, pas: 1 } } })).toBe('Haltères');
  });
});

// ═══ 2. QUELLE SALLE POUR QUEL EXERCICE ═══════════════════════════════════
describe('§10 bis — quelle salle pour quel exercice (la donnée du catalogue : `equipement`, et le nom pour l’EZ)', () => {
  test('le curl EZ : les barres EZ déclarées', () => {
    expect(salleEZ()).toEqual({ materiel: 'barre_ez', charges: [10, 15, 20, 25, 30] });
  });
  test('une barre légère qui n’est pas EZ : les barres droites', () => {
    expect(Profil.salleDeLExercice({ ma_salle: { barres_droites: [10, 20] } }, 'curl_biceps_barre', INDEX))
      .toEqual({ materiel: 'barre_droite', charges: [10, 20] });
    // Les droites déclarées ne valent pas pour l'EZ.
    expect(Profil.salleDeLExercice({ ma_salle: { barres_droites: [10, 20] } }, 'curl_biceps_barre_ez', INDEX)).toBeNull();
  });
  test('DISCRIMINANT — une barre lourde (les quatre barres et leurs frères) n’est jamais une barre fixe', () => {
    expect(Profil.salleDeLExercice({ ma_salle: SALLE_AUREL }, 'squat_barre', INDEX)).toBeNull();
    expect(Profil.salleDeLExercice({ ma_salle: SALLE_AUREL }, 'squat_avec_pause_barre', INDEX)).toBeNull();
  });
  test('les haltères se déclarent par haltère, les séries notent la paire : 2 × 2 … 2 × 40', () => {
    const s = Profil.salleDeLExercice({ ma_salle: SALLE_AUREL }, 'developpe_couche_haltere', INDEX);
    expect(s.materiel).toBe('halteres');
    expect(s.charges.slice(0, 3)).toEqual([4, 8, 12]);
    expect(s.charges[s.charges.length - 1]).toBe(80);
  });
  test('une machine : rien (« les machines : pas pour l’instant »)', () => {
    expect(Profil.salleDeLExercice({ ma_salle: SALLE_AUREL }, 'extension_jambes', INDEX)).toBeNull();
  });
});

// ═══ 3. LE MOTEUR ═════════════════════════════════════════════════════════
describe('§10 bis — le curl EZ à 30 kg, la plus lourde de la salle (le cas réel d’Aurélien)', () => {
  test('prémisse — sans salle, le moteur testerait 32,5 kg (repli de la barre, §10.2)', () => {
    const c = M.consigneDExercice(curlEZ([12, 12, 12]), undefined, AVANT, O);
    expect(c.consigne.etat).toBe('test_propose');
    expect(c.consigne.haut.charge).toBe(32.5);
  });

  test('DISCRIMINANT — au haut de la zone : jamais 32,5 ; on monte en reps à 30 kg, et le coach le dit', () => {
    const c = M.consigneDExercice(curlEZ([12, 12, 12]), undefined, AVANT, Object.assign({ salle: salleEZ() }, O));
    expect(c.consigne.etat).toBe('salle_max');
    expect(c.consigne.ligne).toEqual({ charge: 30, vise: 13 });
    expect(c.consigne.haut).toBeNull();
    expect(c.libelles.gris).toBe('30' + NB + 'kg, la plus lourde de ta salle' + NB + ': on monte en reps.');
    expect(c.libelles.jaune).toEqual(['30' + NB + 'kg' + NB + '×' + NB + '13']);
    expect(c.consigne.fondement.salle).toEqual({ materiel: 'barre_ez', max: 30 });
    // La suite : pas de cran suivant au-delà de la salle.
    expect(c.contexte).toEqual({ cran: null, haut: null, salleMax: true });
    expect(c.salle).toEqual({ materiel: 'barre_ez', charges: [10, 15, 20, 25, 30] });
  });

  test('sous le haut de la zone : les reps montent comme toujours (une de plus)', () => {
    const c = M.consigneDExercice(curlEZ([11, 11, 11]), undefined, AVANT, Object.assign({ salle: salleEZ() }, O));
    expect(c.consigne.etat).toBe('progression');
    expect(c.consigne.ligne).toEqual({ charge: 30, vise: 12 });
  });

  test('la feuille « Pourquoi » de l’état : la salle, puis les reps', () => {
    const c = M.consigneDExercice(curlEZ([12, 12, 12]), undefined, AVANT, Object.assign({ salle: salleEZ() }, O));
    const f = M.pourquoiConsigne(c.consigne, 'normal', AVANT);
    expect(JSON.stringify(f)).toContain('Ta salle n\'a pas plus lourd que 30' + NB + 'kg' + NB +
      ': je ne te propose jamais une charge qu\'elle n\'a pas. Tu gagnes des reps, une de plus que la dernière fois.');
  });

  test('séance après séance, à 30 kg : les reps montent, jamais une charge au-delà de 30', () => {
    let hist = curlEZ([12, 12, 12]);
    const vues = [];
    for (let i = 0; i < 6; i++) {
      const avant = new Date(Date.parse(AVANT) + 4 * i * 864e5).toISOString();
      const c = M.consigneDExercice(hist, undefined, avant, Object.assign({ salle: salleEZ() }, O)).consigne;
      vues.push([c.ligne.charge, c.ligne.vise, c.haut ? c.haut.charge : null]);
      hist = [{ seance: { id: 'T' + i, debut: avant }, series: [1, 2, 3].map(() => brute(c.ligne.charge, c.ligne.vise)) }].concat(hist);
    }
    vues.forEach((v) => { expect(v[0]).toBe(30); expect(v[2]).toBeNull(); });
    // À 16 reps d'habitude, la zone suit (Volume → Séries longues, « Nouvelle zone », §9.10) : la visée repart du bas
    // de la nouvelle zone, à la même charge. C'est le point ouvert de « puis en séries » (MOTEUR §10 bis).
    expect(vues.map((v) => v[1])).toEqual([13, 14, 15, 16, 15, 16]);
  });

  test.todo('« puis en séries » : quand et comment la progression passe des reps aux séries — à trancher (MOTEUR §10 bis)');

  test('DISCRIMINANT — en séance, 3 reps de plus que visé à 30 kg : la réaction se tait (aucune charge introuvable)', () => {
    const ok = M.consigneDExercice(curlEZ([11, 11, 11]), undefined, AVANT, Object.assign({ salle: salleEZ() }, O));
    const r = M.reactionPour(ok.consigne, [{ charge_kg: 30, reps: 15, rpe: null, ressenti: null }], ok.contexte,
      [{ charge: 30, vise: 12, source: 'consigne' }, { charge: 30, vise: 12, source: 'consigne' }, { charge: 30, vise: 12, source: 'consigne' }]);
    expect(r.attente).toBeNull();
    expect(r.plan.filter((q) => q.source === 'coach')).toEqual([]);
    // Prémisse : sans salle, le coach proposerait 32,5.
    const sans = M.consigneDExercice(curlEZ([11, 11, 11]), undefined, AVANT, O);
    const r2 = M.reactionPour(sans.consigne, [{ charge_kg: 30, reps: 15, rpe: null, ressenti: null }], sans.contexte,
      [{ charge: 30, vise: 12, source: 'consigne' }, { charge: 30, vise: 12, source: 'consigne' }, { charge: 30, vise: 12, source: 'consigne' }]);
    expect(r2.attente.charges[0]).toBe(32.5);
  });

  test('sous la plus lourde : le test vise la barre déclarée juste au-dessus (25 → 30, jamais 27,5)', () => {
    const hist = [
      { seance: { id: 'S2', debut: jour('10-10') }, series: [brute(25, 12), brute(25, 12), brute(25, 12)] },
      { seance: { id: 'S1', debut: jour('10-06') }, series: [brute(25, 11), brute(25, 11), brute(25, 11)] }];
    expect(M.consigneDExercice(hist, undefined, AVANT, O).consigne.haut.charge).toBe(27.5);
    const c = M.consigneDExercice(hist, undefined, AVANT, Object.assign({ salle: salleEZ() }, O)).consigne;
    expect(c.etat).toBe('test_propose');
    expect(c.haut.charge).toBe(30);
  });
});

describe('§10 bis — les haltères, arrondis aux charges déclarées', () => {
  const DH = Object.assign({}, O, { equipement: 'haltere' });
  // Le couché haltères : 32, 36, 40 (pas exact de 4 dans l'historique).
  const histo = (derniere) => [
    { seance: { id: 'S4', debut: jour('10-10') }, series: derniere.map((r) => brute(40, r)) },
    { seance: { id: 'S3', debut: jour('10-06') }, series: [brute(36, 12), brute(36, 12), brute(36, 12)] },
    { seance: { id: 'S2', debut: jour('10-02') }, series: [brute(32, 12), brute(32, 12), brute(32, 12)] },
    { seance: { id: 'S1', debut: jour('09-28') }, series: [brute(28, 12), brute(28, 12), brute(28, 12)] }];
  // Une salle aux haltères de 2,5 en 2,5 jusqu'à 25 kg : les paires 5, 10 … 50.
  const salle = () => Profil.salleDeLExercice({ ma_salle: { halteres: { max: 25, pas: 2.5 } } }, 'developpe_couche_haltere', INDEX);

  test('DISCRIMINANT — le test au pas déclaré (45), pas au pas de l’historique (44)', () => {
    expect(M.consigneDExercice(histo([12, 12, 12]), undefined, AVANT, DH).consigne.haut.charge).toBe(44);
    const c = M.consigneDExercice(histo([12, 12, 12]), undefined, AVANT, Object.assign({ salle: salle() }, DH)).consigne;
    expect(c.haut.charge).toBe(45);
    expect(c.ligne.charge).toBe(40);
  });

  test('une charge de travail que la salle n’a pas (42, une autre salle) s’arrondit en dessous (40)', () => {
    const hist = [{ seance: { id: 'S2', debut: jour('10-10') }, series: [brute(42, 10), brute(42, 10), brute(42, 10)] },
      { seance: { id: 'S1', debut: jour('10-06') }, series: [brute(42, 9), brute(42, 9), brute(42, 9)] }];
    const c = M.consigneDExercice(hist, undefined, AVANT, Object.assign({ salle: salle() }, DH)).consigne;
    expect(c.ligne.charge).toBe(40);
    expect(M.dansLaSalle(salle(), c.ligne.charge)).toBe(true);
  });

  test('la réaction propose une paire que la salle a', () => {
    const ok = M.consigneDExercice(histo([11, 11, 11]), undefined, AVANT, Object.assign({ salle: salle() }, DH));
    expect(ok.contexte.cran).toBe(45);
  });
});

describe('§10 bis — une barre chargée de disques n’est pas concernée', () => {
  test('DISCRIMINANT — rowing barre à 80 kg, barres droites déclarées jusqu’à 30 : rien ne change', () => {
    const hist = [
      { seance: { id: 'S2', debut: jour('10-10') }, series: [brute(80, 10), brute(80, 10), brute(80, 10)] },
      { seance: { id: 'S1', debut: jour('10-06') }, series: [brute(77.5, 10), brute(77.5, 10), brute(77.5, 10)] }];
    const s = Profil.salleDeLExercice({ ma_salle: SALLE_AUREL }, 'rowing_barre', INDEX);
    expect(s).toEqual({ materiel: 'barre_droite', charges: [10, 15, 20, 25, 30] });
    const sans = M.consigneDExercice(hist, undefined, AVANT, O);
    const avec = M.consigneDExercice(hist, undefined, AVANT, Object.assign({ salle: s }, O));
    expect(JSON.stringify(avec.consigne)).toBe(JSON.stringify(sans.consigne));
    expect(avec.salle).toBeNull();
  });
});

// ═══ 4. LE PLAN ═══════════════════════════════════════════════════════════
const CATALOGUE = {
  curl_biceps_barre_ez: { equipement: 'barre', muscles_primaires: ['biceps'], salle: { materiel: 'barre_ez', charges: [10, 15, 20, 25, 30] } },
  curl_biceps_barre: { equipement: 'barre', muscles_primaires: ['biceps'] }
};
const DEBUT = '2026-10-14T10:00:00+00:00';
function seanceDe(slug, travail, chauffes, degressive) {
  let k = 0;
  const id = () => 's' + (++k);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, slug, id, { series: travail });
  if (chauffes) se = S.insererChauffes(se, 0, chauffes.map((r) => [0, r]), id);
  if (degressive) {
    se = S.ajouterSerie(se, 0, id);
    const j = se.exercices[0].series.findIndex((x) => x.id === 's' + k);
    se = S.changerType(se, 0, j, 'degressive');
  }
  return se;
}
function entrees(se, slug, consigneDuSlug, catalogue) {
  return { seance: { id: 'S1', debut: DEBUT, edition: false, exercices: se.exercices },
    consignes: { [slug]: consigneDuSlug }, catalogue: catalogue || CATALOGUE, reglage: 'normal', paris: [], suites: {} };
}
const valider = (se, j, charge, reps) => S.valider(S.modifierSerie(se, 0, j, { charge_kg: charge, reps: reps }), 0, j, new Date(DEBUT));

describe('§10 bis — dans le plan : la grille, la dégressive à barre fixe, les chauffes, I46', () => {
  const avec = () => M.consigneDExercice(curlEZ([12, 12, 12]), undefined, AVANT, Object.assign({ salle: salleEZ() }, O));

  test('la grille : 30 kg × 13 sur chaque série, l’en-tête dit la salle ; le plan passe ses invariants', () => {
    const se = seanceDe('curl_biceps_barre_ez', 3);
    const e = entrees(se, 'curl_biceps_barre_ez', avec());
    const p = T.planDeSeance(e);
    const x = p.exercices[0];
    expect(x.lignes.filter((l) => l.type === 'travail').map((l) => [l.fantome.charge, l.fantome.reps]))
      .toEqual([[30, 13], [30, 13], [30, 13]]);
    expect(x.entete.gris).toBe('30' + NB + 'kg, la plus lourde de ta salle' + NB + ': on monte en reps.');
    expect(x.salle).toEqual({ materiel: 'barre_ez', charges: [10, 15, 20, 25, 30] });
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('DISCRIMINANT — la dégressive à barre fixe : « Prends la barre de 20 kg. » (et non « Enlève … de chaque côté »)', () => {
    const se = seanceDe('curl_biceps_barre_ez', 2, null, true);
    const e = entrees(se, 'curl_biceps_barre_ez', avec());
    const p = T.planDeSeance(e);
    const d = p.exercices[0].degressive;
    expect(d.charge).toBe(20);
    expect(d.phrase).toBe('Prends la barre de 20' + NB + 'kg. Sans repos, jusqu\'à l\'échec. Vise 5 à 7.');
    expect(d.repos).toBe(0);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    // Prémisse : sans salle, la règle de la barre (un disque de chaque côté).
    const sans = M.consigneDExercice(curlEZ([12, 12, 12]), undefined, AVANT, O);
    const p2 = T.planDeSeance(entrees(seanceDe('curl_biceps_barre', 2, null, true), 'curl_biceps_barre', sans));
    expect(p2.exercices[0].degressive.phrase.indexOf('Enlève ')).toBe(0);
  });

  test('la dégressive sans consigne (première fois) lit la salle du catalogue', () => {
    let se = seanceDe('curl_biceps_barre_ez', 1, null, true);
    se = valider(se, 0, 25, 12);
    const p = T.planDeSeance(entrees(se, 'curl_biceps_barre_ez', null));
    expect(p.exercices[0].degressive.phrase).toBe('Prends la barre de 15' + NB + 'kg. Sans repos, jusqu\'à l\'échec. Vise 5 à 7.');
  });

  test('les chauffes de la routine : des barres que la salle a, sous la référence', () => {
    const se = seanceDe('curl_biceps_barre_ez', 3, [10, 2]);
    const e = entrees(se, 'curl_biceps_barre_ez', avec());
    const p = T.planDeSeance(e);
    const ch = p.exercices[0].lignes.filter((l) => l.type === 'echauffement').map((l) => l.fantome.charge);
    // Barre légère, premier sur ses muscles (§9.15.1) : « barre vide × 10 » — la barre la plus légère de la salle —,
    // puis ~88 % de 30 (26,4) à la barre déclarée la plus proche, 25. Sans salle : 20 (la barre vide) et 25.
    expect(ch).toEqual([10, 25]);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('une dernière série faite au-delà de la plus lourde barre fixe (une barre chargée) : la règle de la barre, sans I46', () => {
    let se = seanceDe('curl_biceps_barre_ez', 1, null, true);
    se = valider(se, 0, 35, 10);
    const e = entrees(se, 'curl_biceps_barre_ez', null);
    const p = T.planDeSeance(e);
    expect(p.exercices[0].degressive.phrase.indexOf('Enlève ')).toBe(0);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('DISCRIMINANT — I46 : une charge que la salle n’a pas, forgée dans le plan, est attrapée', () => {
    const se = seanceDe('curl_biceps_barre_ez', 3);
    const e = entrees(se, 'curl_biceps_barre_ez', avec());
    const p = JSON.parse(JSON.stringify(T.planDeSeance(e)));
    p.exercices[0].lignes[2].fantome.charge = 32.5;
    expect(T.verifierPlan(p, undefined).erreurs.some((x) => /^I46 — .*32\.5 kg, une charge que la salle n’a pas/.test(x))).toBe(true);
    const q = JSON.parse(JSON.stringify(T.planDeSeance(e)));
    q.exercices[0].consigne.haut = { charge: null, vise: 10, k: 1 };
    expect(T.verifierPlan(q, undefined).erreurs.some((x) => /^I46 — .*test sans chiffre/.test(x))).toBe(true);
  });
});

// ═══ 5. SANS DÉCLARATION, RIEN NE CHANGE ══════════════════════════════════
describe('§10 bis — non renseignée, rien ne change', () => {
  test('DISCRIMINANT — sans `ma_salle` (absente, NULL, illisible), aucune salle pour aucun exercice', () => {
    [{}, { ma_salle: null }, { ma_salle: { barres_ez: [] } }, { ma_salle: 'x' }, null].forEach((p) => {
      Object.keys(INDEX).forEach((slug) => expect(Profil.salleDeLExercice(p, slug, INDEX)).toBeNull());
    });
  });

  test('DISCRIMINANT — la consigne d’une personne sans déclaration est identique à celle d’avant 108', () => {
    const cas = [curlEZ([12, 12, 12]), curlEZ([11, 11, 11]), curlEZ([13, 12, 9])];
    cas.forEach((hist) => {
      const salle = Profil.salleDeLExercice({}, 'curl_biceps_barre_ez', INDEX);
      const avant = M.consigneDExercice(hist, undefined, AVANT, O);
      const apres = M.consigneDExercice(hist, undefined, AVANT, Object.assign({ salle: salle }, O));
      expect(JSON.stringify(apres)).toBe(JSON.stringify(Object.assign({}, avant)));
      expect(apres.salle).toBeNull();
      expect(apres.consigne.fondement).not.toHaveProperty('salle');
    });
    // Et la dégressive : la règle de la barre, telle quelle.
    expect(M.degressiveDe({ equipement: 'barre', derniere_serie: 30, reps_travail: 12, salle: null }))
      .toEqual(M.degressiveDe({ equipement: 'barre', derniere_serie: 30, reps_travail: 12 }));
  });
});

// ═══ 6. LA COLONNE ABSENTE EN BASE (v2_088 pas lancée) ═══════════════════
// Un faux PostgREST : sans la colonne, un `select` qui la nomme rend `42703`, un `upsert` qui la porte rend
// `PGRST204` — comme la vraie base avant la migration. Rien n'est écrit d'une requête refusée.
function fauxPostgrest(avecColonne) {
  const etat = { colonnes: new Set(['id', 'username', 'bio', 'onboarding_completed'].concat(avecColonne ? ['ma_salle'] : [])),
    ligne: Object.assign({ id: 'u1', username: 'aurel' }, avecColonne ? { ma_salle: SALLE_AUREL } : {}), lectures: [], ecritures: [] };
  const projeter = (cols) => {
    const out = {};
    cols.split(',').map((c) => c.trim()).forEach((c) => { out[c] = etat.ligne[c] === undefined ? null : etat.ligne[c]; });
    return out;
  };
  const manque = (cols) => cols.split(',').map((c) => c.trim()).find((c) => c === 'ma_salle' && !etat.colonnes.has(c));
  const client = {
    from() {
      const q = { cols: null, upsert: null };
      const c = {
        select(cols) { q.cols = cols; return c; }, eq() { return c; }, upsert(l) { q.upsert = l; return c; },
        maybeSingle() { return c; }, single() { return c; },
        then(res, rej) {
          let r;
          if (q.upsert) {
            etat.ecritures.push(Object.assign({}, q.upsert));
            const inconnue = Object.keys(q.upsert).find((k) => !etat.colonnes.has(k) && k !== 'updated_at');
            if (inconnue) {
              r = { data: null, error: { code: 'PGRST204', message: "Could not find the '" + inconnue + "' column of 'profiles' in the schema cache" } };
            } else {
              Object.keys(q.upsert).forEach((k) => { if (k !== 'updated_at') etat.ligne[k] = q.upsert[k]; });
              const m = manque(q.cols);
              r = m ? { data: null, error: { code: '42703', message: 'column profiles.' + m + ' does not exist' } } : { data: projeter(q.cols), error: null };
            }
          } else {
            etat.lectures.push(q.cols);
            const m = manque(q.cols);
            r = m ? { data: null, error: { code: '42703', message: 'column profiles.' + m + ' does not exist' } } : { data: projeter(q.cols), error: null };
          }
          return Promise.resolve(r).then(res, rej);
        }
      };
      return c;
    }
  };
  return { etat, client };
}
function chargerDonnees(f) {
  global.THClient = { obtenir: () => f.client };
  let D;
  jest.isolateModules(() => { D = require('../../v2/js/donnees.js'); });   // un module neuf : une session neuve
  return D;
}

describe('Donnees — `ma_salle` est facultative : absente en base, le profil se lit et s’écrit', () => {
  test('DISCRIMINANT — colonne absente : `monProfil` rend la ligne, sans la salle (rien ne change)', async () => {
    const f = fauxPostgrest(false);
    const D = chargerDonnees(f);
    const p = await D.monProfil('u1');
    expect(p).toMatchObject({ id: 'u1', username: 'aurel' });
    expect(p).not.toHaveProperty('ma_salle');
    expect(f.etat.lectures[0]).toContain('ma_salle');
    expect(f.etat.lectures[1]).not.toContain('ma_salle');
    expect(Profil.salleDe(p)).toBeNull();
  });

  test('DISCRIMINANT — colonne absente : `enregistrerProfil` écrit le reste de la ligne', async () => {
    const f = fauxPostgrest(false);
    const D = chargerDonnees(f);
    const r = await D.enregistrerProfil('u1', { bio: 'salut', ma_salle: SALLE_AUREL });
    expect(r).toMatchObject({ id: 'u1', bio: 'salut' });
    expect(f.etat.ecritures[f.etat.ecritures.length - 1]).not.toHaveProperty('ma_salle');
    await D.enregistrerProfil('u1', { bio: 'deux', ma_salle: SALLE_AUREL });
    expect(f.etat.ligne.bio).toBe('deux');
  });

  test('colonne présente : lue et écrite', async () => {
    const f = fauxPostgrest(true);
    const D = chargerDonnees(f);
    expect((await D.monProfil('u1')).ma_salle).toEqual(SALLE_AUREL);
    const r = await D.enregistrerProfil('u1', { ma_salle: null });
    expect(r.ma_salle).toBeNull();
    expect(f.etat.lectures).toHaveLength(1);
    expect(f.etat.ecritures).toHaveLength(1);
  });
});
