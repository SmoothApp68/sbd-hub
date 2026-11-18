/** @jest-environment node */
//
// 16/11/2026 — ESSAYER LA MARCHE (MOTEUR §9.17 bis, delta du 16/11/2026 ; I49 réécrit, I220 à I223).
//
// Retour réel d'Aurélien : « Ajouter Tractions » s'est lu « passer aux tractions ». En reps, la carte propose désormais
// d'ESSAYER la marche à la place des séries restantes du départ, pour aujourd'hui ; « Annuler » remet le départ tel quel ;
// la routine ne change qu'en fin de séance, marche TENUE, routine manuelle, sur « Oui ». Les figures en secondes et la
// carte du lest (sa variante sans matériel) ne changent pas.

process.env.TZ = 'Europe/Paris';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const Mo = require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/periode.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const G = require('../../v2/js/generateur.js');

const F = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'cas-127.json'), 'utf8'));
const INDEX = {};
F.echelles.forEach((e) => { INDEX[e.slug] = Object.assign({}, e, { echelle_rang: e.rang }); });

const AVANT = '2026-10-21T10:00:00Z';
const JOURS = [28, 21, 14, 7];
const AIDE = { mesure: 'charge_reps', equipement: 'elastique', intention: 'progresser', reglage: 'normal',
  lestPossible: false, lestReponse: null };
function seancesDe(slug, kg, reps, jours) {
  let rang = 0;
  const debut = (d) => new Date(Date.parse(AVANT) - d * 86400000).toISOString();
  return jours.map((d, i) => ({
    seance: { id: 'A' + i, debut: debut(d) },
    series: [0, 1, 2].map(() => ({ id: 'a' + (++rang), rang: rang, charge_kg: kg[i], reps: reps[i], rpe: null,
      ressenti: null, type_serie: 'travail', exercise_slug: slug }))
  }));
}
const consigneAide = () => M.consigneDExercice(seancesDe('tractions_elastique', [-30, -30, -25, -25], [12, 12, 12, 12], JOURS),
  undefined, AVANT, Object.assign({}, AIDE, { echelle: true }));
let nId = 0;
const id = () => 'l' + (++nId);
function seanceDe(slugs, series) {
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  slugs.forEach((slug) => { se = S.ajouterExercice(se, slug, id, { series: series || 3 }); });
  return se;
}
function echelleDe(slug, extra) {
  const m = Mo.marcheSuivante(INDEX, slug);
  const c = INDEX[m.cible[0]];
  return Object.assign({ marche: m, nomCible: c.nom, aide: INDEX[slug].charge === 'assistance', cibleHabilete: c.nature === 'habilete',
           cibleFaiteLe: null }, extra || {});
}
function catalogue() {
  return {
    tractions_elastique: { nom: 'Tractions (Élastique)', equipement: 'elastique', muscles_primaires: ['dos'], mesure: 'charge_reps', leste: null },
    tractions: { nom: 'Tractions', equipement: null, muscles_primaires: ['dos'], mesure: 'reps', leste: 'tractions_leste' }
  };
}
function entrees(se, extra) {
  return Object.assign({
    seance: { id: 'S1', debut: AVANT, edition: false, exercices: se.exercices, gestes: se.gestes || [] },
    consignes: { tractions_elastique: consigneAide() }, reglage: null, paris: [], suites: {},
    catalogue: catalogue(), intention: 'progresser', modes: {}, lestReponse: null,
    echelles: { tractions_elastique: echelleDe('tractions_elastique') }, marcheReponses: {},
    essaisDeMarche: { manuelle: true, routine: 'Dos' }
  }, extra || {});
}
const plan = (e) => T.planDeSeance(e);
const sp = (t) => String(t || '').replace(/[\u00a0\u202f]/g, ' ');
const erreurs = (p, e) => T.verifierPlan(p, e).erreurs;
const valider = (se, iExo, iSerie, reps) => S.valider(S.modifierSerie(se, iExo, iSerie, { reps: reps }), iExo, iSerie, new Date('2026-10-21T10:05:00Z'));

// ═══ 1. LA CARTE ═══════════════════════════════════════════════════════════
describe('la carte « Essayer » (I49 réécrit)', () => {
  test('les textes exacts, le bouton « Essayer … », sans point d’interrogation', () => {
    const se = seanceDe(['tractions_elastique']);
    const e = entrees(se);
    const x = plan(e).exercices[0];
    expect(sp(x.carteMarche.titre)).toBe('Aide 25 kg × 12 sur toutes tes séries, deux séances de suite.');
    expect(x.carteMarche.detail).toBe('La marche au-dessus : Tractions. Je la mets à la place de tes séries restantes de Tractions (Élastique), pour essayer aujourd\'hui. Ta routine ne change pas.');
    expect(x.carteMarche.oui).toBe('Essayer Tractions');
    expect(x.carteMarche.non).toBe('Pas maintenant');
    expect(erreurs(plan(e), e)).toEqual([]);
  });
  test('moins de 2 séries de travail restantes : pas de carte (1 seule restante)', () => {
    let se = seanceDe(['tractions_elastique']);
    se = valider(valider(se, 0, 0, 12), 0, 1, 12);
    expect(plan(entrees(se)).exercices[0].carteMarche).toBeNull();
    // DISCRIMINANT : à 2 restantes, la carte est là.
    const se2 = valider(seanceDe(['tractions_elastique']), 0, 0, 12);
    expect(plan(entrees(se2)).exercices[0].carteMarche).not.toBeNull();
  });
  test('« J’ai peu de temps » : une séance à 1 série ne pose pas de carte', () => {
    expect(plan(entrees(seanceDe(['tractions_elastique'], 1))).exercices[0].carteMarche).toBeNull();
  });
  test('la marche déjà dans la séance, ou dans la routine : pas de carte', () => {
    expect(plan(entrees(seanceDe(['tractions', 'tractions_elastique']))).exercices[1].carteMarche).toBeNull();
    const e = entrees(seanceDe(['tractions_elastique']), { echelles: { tractions_elastique: echelleDe('tractions_elastique', { dansLaRoutine: true }) } });
    expect(plan(e).exercices[0].carteMarche).toBeNull();
  });
  test('douleur répétée (2 séances avec douleur) : pas de carte', () => {
    expect(plan(entrees(seanceDe(['tractions_elastique']), { nbDouleurs: { tractions_elastique: 2 } })).exercices[0].carteMarche).toBeNull();
    expect(plan(entrees(seanceDe(['tractions_elastique']), { nbDouleurs: { tractions_elastique: 1 } })).exercices[0].carteMarche).not.toBeNull();
  });
  test('I49 relit les entrées : une carte forcée avec 1 série restante est signalée', () => {
    let se = seanceDe(['tractions_elastique']);
    const e = entrees(se);
    const p = plan(e);
    se = valider(valider(se, 0, 0, 12), 0, 1, 12);
    const e2 = entrees(se);
    expect(erreurs(p, e2).some((t) => /^I49 .*restante/.test(t))).toBe(true);
  });
});

// ═══ 2. LE CLIC, ANNULER, LE REPLI ══════════════════════════════════════════
describe('« Essayer » remplace (I223), « Annuler » remet tout', () => {
  const avecNote = () => {
    const se = seanceDe(['rowing_haltere', 'tractions_elastique']);
    const exos = se.exercices.slice();
    exos[1] = Object.assign({}, exos[1], { routine_exercise_id: 're-1', note: 'élastique rouge', zone: 'hypertrophie',
      zone_plan: null, series: exos[1].series.map((q) => Object.assign({}, q, { reps_visees: 12 })) });
    return Object.assign({}, se, { exercices: exos });
  };
  test('sans série faite : la marche prend la place, reçoit les 3 séries vides, garde repos et groupe, marquée', () => {
    const se = avecNote();
    const apres = S.essayerMarche(se, 1, 'tractions', id, { bas: 8 });
    expect(apres.exercices.map((x) => x.exercise_slug)).toEqual(['rowing_haltere', 'tractions']);
    const m = apres.exercices[1];
    expect(m.series).toHaveLength(3);
    expect(m.routine_exercise_id).toBeNull();
    expect(m.essai_marche.depart).toBe('tractions_elastique');
    expect(m.essai_marche.bas).toBe(8);
    expect(m.essai_marche.origine.note).toBe('élastique rouge');
  });
  test('avec une série faite : elle reste sur le départ, la marche reçoit les 2 restantes', () => {
    const se = valider(avecNote(), 1, 0, 12);
    const apres = S.essayerMarche(se, 1, 'tractions', id, { bas: 8 });
    expect(apres.exercices.map((x) => x.exercise_slug)).toEqual(['rowing_haltere', 'tractions_elastique', 'tractions']);
    expect(apres.exercices[1].series).toHaveLength(1);
    expect(apres.exercices[2].series).toHaveLength(2);
  });
  test('« Annuler » remet l’objet d’origine TEL QUEL (ligne de routine, note, zone, reps visées, identifiants)', () => {
    const se = avecNote();
    const apres = S.annulerEssaiMarche(S.essayerMarche(se, 1, 'tractions', id, { bas: 8 }), 1);
    expect(JSON.stringify(apres.exercices)).toBe(JSON.stringify(se.exercices));
    // avec une série faite sur le départ : elle reste, l'ordre et les lignes vides reviennent
    const se2 = valider(avecNote(), 1, 0, 12);
    const ann2 = S.annulerEssaiMarche(S.essayerMarche(se2, 1, 'tractions', id, {}), 2);
    expect(JSON.stringify(ann2.exercices)).toBe(JSON.stringify(se2.exercices));
  });
  test('« Annuler » refusé dès qu’une série de la marche est faite', () => {
    let s = S.essayerMarche(avecNote(), 1, 'tractions', id, {});
    s = valider(s, 1, 0, 6);
    expect(S.annulerEssaiMarche(s, 1)).toBe(s);
  });
  test('« Remettre » : la marche garde sa série faite, le départ revient (d’après l’origine) pour les restantes', () => {
    let s = S.essayerMarche(avecNote(), 1, 'tractions', id, { bas: 8 });
    s = valider(s, 1, 0, 2);
    const r = S.remettreDepartApresMarche(s, 1, id);
    expect(r.exercices.map((x) => x.exercise_slug)).toEqual(['rowing_haltere', 'tractions', 'tractions_elastique']);
    expect(r.exercices[1].series).toHaveLength(1);
    expect(r.exercices[1].series[0].reps).toBe(2);
    expect(r.exercices[1].essai_marche.repli).toBe('remis');
    expect(r.exercices[2].series).toHaveLength(2);
    expect(r.exercices[2].routine_exercise_id).toBe('re-1');
  });
  test('la question de fin « mettre à jour la routine » ne parle JAMAIS de l’essai (ecartsRoutine muet)', () => {
    const routine = { id: 'R', exercices: [
      { id: 're-0', exercise_slug: 'rowing_haltere', rang: 0, series: [], repos_cible_s: null, note: null, groupe_superset: null },
      { id: 're-1', exercise_slug: 'tractions_elastique', rang: 1, series: [], repos_cible_s: null, note: 'élastique rouge', groupe_superset: null }] };
    let se = avecNote();
    se = Object.assign({}, se, { routine_id: 'R',
      exercices: se.exercices.map((x, i) => i === 0 ? Object.assign({}, x, { routine_exercise_id: 're-0' }) : x) });
    expect(S.ecartsRoutine(se, routine).ecarts).toEqual([]);
    const essai = S.essayerMarche(se, 1, 'tractions', id, {});
    expect(S.ecartsRoutine(essai, routine).ecarts).toEqual([]);
    const avecFaite = S.essayerMarche(valider(se, 1, 0, 12), 1, 'tractions', id, {});
    expect(S.ecartsRoutine(avecFaite, routine).ecarts).toEqual([]);
    // DISCRIMINANT : le même remplacement à la main (sans la marque) EST un écart.
    expect(S.ecartsRoutine(S.remplacerExercice(se, 1, 'tractions', id), routine).ecarts.length).toBeGreaterThan(0);
  });
  test('les gestes de la marche passent `gestePropre` (slug et vers)', () => {
    ['marche_essayee', 'marche_annulee', 'marche_remise', 'marche_continuee', 'marche_routine'].forEach((g) => {
      expect(S.noterGeste({ gestes: [] }, { geste: g, slug: 'tractions_elastique', vers: 'tractions' }).gestes).toEqual([{ geste: g, slug: 'tractions_elastique', vers: 'tractions' }]);
      expect(S.noterGeste({ gestes: [] }, { geste: g, slug: 'tractions_elastique' }).gestes).toEqual([]);
    });
  });
});

// ═══ 3. LE PLAN SUR LA MARCHE : I220, I221, I222 ════════════════════════════
describe('la marche essayée dans le plan', () => {
  const essai = (n) => S.essayerMarche(seanceDe(['tractions_elastique'], n || 3), 0, 'tractions', id, { bas: 8 });
  const ex = (se, extra) => { const e = entrees(se, extra); const p = plan(e); return { e, p, x: p.exercices[0] }; };
  test('après le clic : « C’est fait … en en gardant 2 », « Annuler » ; aucune carte ; aucune erreur', () => {
    const { e, p, x } = ex(essai());
    expect(x.essaiMarche.texte).toBe('C\'est fait : Tractions, 3 séries, autant de reps que tu peux, en en gardant 2. La prochaine fois, je pars de ce que tu auras noté.');
    expect(x.essaiMarche.annuler).toBe('Annuler');
    expect(x.carteMarche).toBeNull();
    expect(x.propositionAuMax || null).toBeNull();
    expect(erreurs(p, e)).toEqual([]);
  });
  test('le départ sorti de la séance (absent du catalogue du plan) : son nom gardé au clic', () => {
    const se = S.essayerMarche(seanceDe(['tractions_elastique']), 0, 'tractions', id, { bas: 8, nomDepart: 'Tractions (Élastique)' });
    const cat = catalogue(); delete cat.tractions_elastique;
    const r = plan(entrees(valider(se, 0, 0, 2), { catalogue: cat })).exercices[0];
    expect(sp(r.essaiMarche.repli.texte)).toBe('Tractions : 2 reps. Pour la suite, je remets Tractions (Élastique).');
  });
  test('séries du départ déjà faites : la phrase le dit (une, puis deux)', () => {
    const un = S.essayerMarche(valider(seanceDe(['tractions_elastique'], 3), 0, 0, 12), 0, 'tractions', id, { bas: 8 });
    expect(plan(entrees(un)).exercices[1].essaiMarche.texte).toBe('C\'est fait : Tractions, 2 séries, autant de reps que tu peux, en en gardant 2. Ta série de Tractions (Élastique) déjà faite reste notée. La prochaine fois, je pars de ce que tu auras noté.');
    let deux = valider(valider(seanceDe(['tractions_elastique'], 4), 0, 0, 12), 0, 1, 12);
    deux = S.essayerMarche(deux, 0, 'tractions', id, { bas: 8 });
    expect(plan(entrees(deux)).exercices[1].essaiMarche.texte).toMatch(/Tes 2 séries de Tractions \(Élastique\) déjà faites restent notées\./);
  });
  test('le repli : 1re série à 2 reps (seuil 5) → « Tractions : 2 reps. Pour la suite, je remets Tractions (Élastique). »', () => {
    const { e, p, x } = ex(valider(essai(), 0, 0, 2));
    expect(x.essaiMarche.texte).toBeNull();
    expect(sp(x.essaiMarche.repli.texte)).toBe('Tractions : 2 reps. Pour la suite, je remets Tractions (Élastique).');
    expect(x.essaiMarche.repli.remettre).toBe('Remettre Tractions (Élastique)');
    expect(x.essaiMarche.repli.continuer).toBe('Continuer');
    expect(erreurs(p, e)).toEqual([]);
    // une fois : après « Continuer », plus de repli
    const apres = S.continuerMarche(valider(essai(), 0, 0, 2), 0);
    expect(plan(entrees(apres)).exercices[0].essaiMarche.repli).toBeNull();
  });
  test('0 rep : AUCUNE voix de repli (jamais deux voix) ; au seuil : pas de repli non plus', () => {
    const z = ex(valider(essai(), 0, 0, 0));
    expect(z.x.essaiMarche.repli).toBeNull();
    expect(erreurs(z.p, z.e)).toEqual([]);
    expect(ex(valider(essai(), 0, 0, 5)).x.essaiMarche.repli).toBeNull();
  });
  test('la carte de fin : marche tenue (10 et 10), routine manuelle → « Tractions : 10 et 10 aujourd’hui. … ? »', () => {
    const se = valider(valider(essai(2), 0, 0, 10), 0, 1, 10);
    const { e, p, x } = ex(se);
    expect(x.essaiMarche.fin.texte).toBe('Tractions : 10 et 10 aujourd\'hui. Je la mets à la place de Tractions (Élastique) dans Dos ?');
    expect(x.essaiMarche.fin.oui).toBe('Oui, dans Dos');
    expect(x.essaiMarche.fin.non).toBe('Juste aujourd\'hui');
    expect(erreurs(p, e)).toEqual([]);
  });
  test('non tenue (10 puis 4, seuil 5) : aucune carte de fin', () => {
    expect(ex(valider(valider(essai(2), 0, 0, 10), 0, 1, 4)).x.essaiMarche.fin).toBeNull();
  });
  test('routine du programme du coach, ou exercice d’un bloc : aucune carte de fin', () => {
    const se = valider(valider(essai(2), 0, 0, 10), 0, 1, 10);
    expect(ex(se, { essaisDeMarche: { manuelle: false, routine: 'Mon programme' } }).x.essaiMarche.fin).toBeNull();
    const bloc = { id: 'b', debut: '2026-10-19', semaines: 4, statut: 'en_cours', exercices: ['tractions_elastique'], zone: 'force' };
    const avecBloc = ex(se, { programme: { blocs: [bloc], lignes: [] } });
    expect(avecBloc.x.essaiMarche.enBloc).toBe(true);
    expect(avecBloc.x.essaiMarche.fin).toBeNull();
  });
  test('I221 : une carte de fin forcée sans tenue est signalée', () => {
    const se = valider(valider(essai(2), 0, 0, 10), 0, 1, 10);
    const { e, p } = ex(se);
    const nonTenue = entrees(valider(valider(essai(2), 0, 0, 10), 0, 1, 4));
    expect(erreurs(p, nonTenue).some((t) => /^I221 /.test(t))).toBe(true);
    expect(erreurs(p, e)).toEqual([]);
  });
});

// ═══ 4. LA TENUE, UNE FONCTION ═══════════════════════════════════════════════
describe('`Moteur.marcheTenue` : max(3, min(5, bas)), au moins 2 séries de travail', () => {
  const t = (reps, bas) => M.marcheTenue({ series: reps.map((r) => ({ reps: r, type_serie: 'travail' })), bas });
  test('le seuil', () => {
    expect([M.seuilDeTenueDeMarche(8), M.seuilDeTenueDeMarche(4), M.seuilDeTenueDeMarche(1), M.seuilDeTenueDeMarche(null)]).toEqual([5, 4, 3, 5]);
  });
  test('tenue, non tenue', () => {
    expect(t([5, 5], 8)).toBe(true);
    expect(t([5, 4], 8)).toBe(false);
    expect(t([10], 8)).toBe(false);
    expect(t([3, 3], 3)).toBe(true);
    expect(M.marcheTenue({ series: [{ reps: 9, type_serie: 'echauffement' }, { reps: 9, type_serie: 'travail' }], bas: 8 })).toBe(false);
  });
});

// ═══ 5. LE GÉNÉRATEUR NE COMPTE QUE LES MARCHES TENUES ═══════════════════════
describe('le générateur (`marcheDeLaPersonne`) lit les marches tenues', () => {
  const CAT = {};
  F.echelles.forEach((e) => { CAT[e.slug] = Object.assign({ muscles_primaires: ['dos'], equipement: null }, e, { echelle_rang: e.rang, actif: true }); });
  const base = { jours: 3, objectif: 'calisthenie', materiel: ['barre_traction'], barre_traction: true, ecartes: [], menager: [] };
  const marche = (entree) => {
    const r = G.genererCalisthenie ? G.genererCalisthenie(CAT, entree) : null;
    return JSON.stringify(r);
  };
  test('un essai de tractions fait mais pas tenu ne monte pas la marche ; tenu, si', () => {
    if (!G.genererCalisthenie) return;
    const faits = { tractions_elastique: 6, tractions: 1 };
    const sans = marche(Object.assign({}, base, { faits }));
    const tenueNon = marche(Object.assign({}, base, { faits, marches_tenues: { tractions_elastique: 6 } }));
    const tenueOui = marche(Object.assign({}, base, { faits, marches_tenues: { tractions_elastique: 6, tractions: 1 } }));
    expect(sans).toMatch(/"tractions"/);
    expect(tenueNon).not.toMatch(/"exercise_slug":"tractions"/);
    expect(tenueOui).toMatch(/"exercise_slug":"tractions"/);
  });
});

// ═══ 5 bis. LA PAGE D'EXERCICE DIT CE QUE FAIT LA CARTE (une source) ═════════
describe('la phrase de « la suivante » dit l’essai, comme la carte', () => {
  test('en reps : « Je la mets à la place de tes séries restantes de Y, pour essayer : ta routine ne change pas. »', () => {
    const t = M.phraseDeLaSuivante({ type: 'sans_aide', nomCible: 'Tractions', nomDepart: 'Tractions (Élastique)', haut: 12 });
    expect(sp(t)).toBe('La suivante : Tractions. Je te la propose quand tu tiens 12 reps sur toutes tes séries, deux séances de suite. Je la mets à la place de tes séries restantes de Tractions (Élastique), pour essayer : ta routine ne change pas.');
    expect(t).not.toMatch(/s'ajoute|tu gardes/);
  });
  test('la carte et la page partagent la même phrase de l’essai (aucune copie)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../v2/js/moteur.js'), 'utf8');
    expect((src.match(/à la place de tes séries restantes de/g) || []).length).toBe(1);
  });
  test('le lest et les figures en secondes gardent leur phrase', () => {
    expect(M.phraseDeLaSuivante({ type: 'lest', nomCible: 'Tractions Lestées', haut: 8 })).not.toMatch(/à la place/);
    expect(M.phraseDeLaSuivante({ type: 'marche', nomCible: 'Front Lever', seuil: 15 })).not.toMatch(/à la place/);
  });
});

// ═══ 6. LES CHEMINS QUI NE CHANGENT PAS ══════════════════════════════════════
describe('inchangés : les figures en secondes, la variante du lest', () => {
  test('la carte en secondes garde « Ajouter … » et son détail', () => {
    const d = M.carteMarcheEnSecondes({ marche: { proposable: true, cible: ['fl'] }, nomCible: 'Front Lever', seuil: 15,
      tenues: [16, 22], duJour: true, reglage: 'normal' });
    expect(M.carteMarcheDetail(d)).toBe('La marche au-dessus : Front Lever. Je te propose d\'en faire 2 tenues avant, autant de secondes que tu peux.');
    expect(M.ajouterMarche('Front Lever')).toBe('Ajouter Front Lever');
  });
  test('`repondreMarche` venu du lest (la variante) AJOUTE toujours ; la carte en reps passe par l’essai', async () => {
    const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
    const extraire = (nom) => {
      const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
      if (!m) throw new Error('introuvable : ' + nom);
      return m[0];
    };
    const ctx = {
      seance: seanceDe(['rowing_haltere', 'pompes']), Seance: S, Moteur: M, uuid: id, reponseEnCours: false, demoMarche: null,
      profil: { marche_reponses: {} }, ecrits: [], gestes: [],
      enEdition: () => false, demoEscalier: () => false,
      planDeLExercice: (i) => (i === 1 ? { slug: 'pompes', carteMarche: null, carteLest: { variante: { slug: 'pompes_declinees' } } } : null),
      poserProfil: async function (c) { ctx.ecrits.push(c); },
      apresStructure: async function () { ctx.gestes.push('apresStructure'); },
      allegeePourAjout: async function () {}, ligneDePlusPourAjout: async function () {},
      rendreSeance: function () {}, heriterRoutine: function () {},
      essayerLaMarche: async function () { ctx.gestes.push('essai'); }
    };
    vm.createContext(ctx);
    vm.runInContext(extraire('repondreMarche'), ctx);
    await vm.runInContext('repondreMarche(1, "oui", { cible: "pompes_declinees", aide: false })', ctx);
    expect(ctx.seance.exercices.map((x) => x.exercise_slug)).toEqual(['rowing_haltere', 'pompes_declinees', 'pompes']);
    expect(ctx.ecrits[0].marche_reponses.pompes.r).toBe('oui');
    expect(ctx.gestes).toEqual(['apresStructure']);
    // la carte en reps (`essai: true`) : l'essai, RIEN au profil
    ctx.ecrits = []; ctx.gestes = [];
    ctx.planDeLExercice = () => ({ slug: 'tractions_elastique', carteMarche: { essai: true, cible: 'tractions', aide: true } });
    await vm.runInContext('repondreMarche(1, "oui")', ctx);
    expect(ctx.ecrits).toEqual([]);
    expect(ctx.gestes).toEqual(['essai']);
  });
  test('`essayerLaMarche` : le remplacement et le geste, aucune écriture au profil', async () => {
    const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
    const m = APP.match(/^  async function essayerLaMarche\b[\s\S]*?^  }/m);
    const ctx = { seance: seanceDe(['tractions_elastique']), Seance: S, uuid: id, ecrits: [],
      demoEscalier: () => false, heriterRoutine: () => {}, rendreSeance: () => {},
      poserProfil: async (c) => { ctx.ecrits.push(c); }, apresStructure: async () => {} };
    vm.createContext(ctx);
    vm.runInContext(m[0], ctx);
    await vm.runInContext('essayerLaMarche(0, { slug: "tractions_elastique" }, { cible: "tractions", bas: 8, nomDepart: "Tractions (Élastique)" })', ctx);
    expect(ctx.seance.exercices[0].essai_marche.nomDepart).toBe('Tractions (Élastique)');
    expect(ctx.seance.exercices.map((x) => x.exercise_slug)).toEqual(['tractions']);
    expect(ctx.seance.gestes).toEqual([{ geste: 'marche_essayee', slug: 'tractions_elastique', vers: 'tractions' }]);
    expect(ctx.ecrits).toEqual([]);
  });
});
