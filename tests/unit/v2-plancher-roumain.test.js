/** @jest-environment node */
//
// 27/11/2026 (décision d'Aurélien, 23 h 15 ; FOURCHETTES-CHIFFRES-TOURS, changement 1 ; CONTRADICTEUR-FOURCHETTES-CHIFFRES, point 2) — LE SOULEVÉ DE TERRE
// ROUMAIN À LA BARRE ET LE SOULEVÉ JAMBES TENDUES (`mouvement` `jambes_tendues`, à la barre) reçoivent une réserve affichée minimale de 1 (I241 étendu). Le plancher
// vit dans `PRUDENCE.plancherDeBarre` SEUL, lu par `Moteur.plancherDeBarre` ; ni `classeDeBarre` ni `Generateur.familleDeBarre` ne changent (le plancher
// ne fuit ni dans les blocs, ni dans la semaine de mesure, ni dans le générateur). Le good morning reste HORS périmètre (son `mouvement` n'est pas relu).
// Chaque test ci-dessous échoue sans le correctif.

process.env.TZ = 'Europe/Paris';
const fs = require('fs');
const path = require('path');

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
require('../../v2/js/reserve.js');
const T = require('../../v2/js/plan.js');
const G = require('../../v2/js/generateur.js');
require('../../v2/js/semaine.js');

const ROUMAIN = 'souleve_de_terre_roumain_barre', JT = 'souleve_de_terre_jambes_tendues', HALTERE = 'souleve_de_terre_roumain_haltere';
const SQUAT = 'squat_barre', SOULEVE = 'souleve_de_terre_barre', GM = 'good_morning_barre';
const fiche = (equipement, mouvement, extra) => Object.assign({ nom: 'x', equipement, mesure: 'charge_reps', polyarticulaire: true, muscles_primaires: ['ischio_jambiers'], mouvement }, extra || {});
const CATALOGUE = {
  [ROUMAIN]: fiche('barre', 'jambes_tendues'), [JT]: fiche('barre', 'jambes_tendues'), [HALTERE]: fiche('haltere', 'jambes_tendues'),
  [SQUAT]: fiche('barre', 'squat', { muscles_primaires: ['quadriceps'] }), [SOULEVE]: fiche('barre', 'souleve'),
  [GM]: fiche('barre', 'good_morning')
};

let n = 0;
const brute = (kg, reps, ressenti, slug) => ({
  id: 'x' + (++n), rang: n, charge_kg: kg, reps, rpe: null, ressenti: ressenti === undefined ? null : ressenti, type_serie: 'travail', exercise_slug: slug || ROUMAIN
});
const jour = (md) => '2026-' + md + 'T18:00:00+00:00';
const AVANT = jour('09-20');
const OPTIONS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false, correction: 'hypertrophie' };
function histoire(kg, repsHabituelles, derniere, slug) {
  return ['09-13', '09-06', '08-30', '08-23', '08-16'].map((d, i) => ({ seance: { id: 'H' + i, debut: jour(d) },
    series: [brute(kg, repsHabituelles, undefined, slug), brute(kg, repsHabituelles, undefined, slug),
      i === 0 ? brute(kg, derniere.reps, derniere.ressenti, slug) : brute(kg, repsHabituelles, undefined, slug)] }));
}
const consigne = (groupes, options) => M.consigneDExercice(groupes, undefined, AVANT, Object.assign({}, OPTIONS, options || {})).consigne;
const cle = (slug, cat) => T.cleDePlancherDe(cat || CATALOGUE, slug);

function jouer(slug, cons, reglage, catalogue) {
  let k = 0; const id = () => 'p-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id }); se = S.ajouterExercice(se, slug, id, { series: 3 });
  const e = { seance: { id: 'S', debut: AVANT, edition: false, exercices: se.exercices },
    consignes: { [slug]: { consigne: cons, contexte: { cran: 2.5, haut: null } } }, reglage, paris: [], objectif: 'muscle', catalogue: catalogue || CATALOGUE };
  const p = T.planDeSeance(e);
  return { p, e, x: p.exercices[0], erreurs: T.verifierPlan(p, e, null).erreurs };
}
const progression = { etat: 'progression', zone: 'hypertrophie', palier: 60, niveau: 9, n: 3, ligne: { charge: 60, vise: 10 }, haut: null };

describe('la table et la clé : un seul endroit, un seul périmètre', () => {
  test('la table de PRUDENCE porte le mouvement ; le roumain et le jambes tendues à la barre : 1 ; les quatre barres inchangées', () => {
    expect(M.PLANCHER_DE_BARRE).toEqual({ squat: 1, couche: 1, militaire: 1, souleve: 2, jambes_tendues: 1 });
    expect(M.plancherDeBarre('jambes_tendues')).toBe(1);
    expect(M.plancherDeBarre(SQUAT)).toBe(1);
    expect(M.plancherDeBarre(SOULEVE)).toBe(2);
    expect(M.plancherDeBarre('squat')).toBeNull();        // un NOM DE CLASSE n'est pas une clé : seule une barre ou un mouvement à plancher
    expect(M.plancherDeBarre('rowing')).toBeNull();
    expect(M.plancherDeBarre(null)).toBeNull();
  });
  test('Moteur.cleDePlancher : la barre d\'abord ; sinon le mouvement à plancher À LA BARRE ; jamais aux haltères, jamais un mouvement sans plancher', () => {
    expect(M.cleDePlancher(SQUAT, 'squat', 'barre')).toBe(SQUAT);
    expect(M.cleDePlancher(null, 'jambes_tendues', 'barre')).toBe('jambes_tendues');
    expect(M.cleDePlancher(null, 'jambes_tendues', 'haltere')).toBeNull();
    expect(M.cleDePlancher(null, 'jambes_tendues', 'machine')).toBeNull();
    expect(M.cleDePlancher(null, 'good_morning', 'barre')).toBeNull();      // hors périmètre : son `mouvement` n'est pas relu
    expect(M.cleDePlancher(null, 'rowing', 'barre')).toBeNull();
    expect(M.cleDePlancher(null, 'squat', 'barre')).toBeNull();             // un nom de classe n'est pas un mouvement
    expect(M.cleDePlancher(null, null, 'barre')).toBeNull();
  });
  test('le catalogue : roumain et jambes tendues à la barre ont la clé ; haltères, good morning, barres inchangées', () => {
    expect(cle(ROUMAIN)).toBe('jambes_tendues');
    expect(cle(JT)).toBe('jambes_tendues');
    expect(cle(HALTERE)).toBeNull();
    expect(cle(GM)).toBeNull();
    expect(cle(SQUAT)).toBe(SQUAT);
    expect(cle(SOULEVE)).toBe(SOULEVE);
  });
  test('NI `familleDeBarre` NI `classeDeBarre` ne bougent : le roumain n\'est toujours ni une barre, ni un frère, ni un « accessoire » de bloc ou de test', () => {
    expect(G.familleDeBarre(ROUMAIN, CATALOGUE)).toBeNull();
    expect(G.familleDeBarre(JT, CATALOGUE)).toBeNull();
    expect(M.testClasse('jambes_tendues')).toBe('accessoire');
    expect(M.structureDeBloc({ zone: 'hypertrophie' }, null)).toEqual({ zone: null, grosse: false, zoneGrosse: null, garde: null });
    // une structure de bloc Hypertrophie lue sur la clé du roumain ne le range ni en « soulevé » ni en grosse série
    expect(M.structureDeBloc({ zone: 'hypertrophie', grosse_serie: true }, 'jambes_tendues')).toEqual({ zone: 'hypertrophie', grosse: false, zoneGrosse: null, garde: null });
  });
});

describe('la réserve affichée et la consigne (vrai moteur)', () => {
  test('la ligne de test du roumain : « jusqu\'au bout » (0) devient « 1 en réserve », Normal, Franc et Prudent ; une machine reste à 0 en Franc', () => {
    ['normal', 'franc', 'prudent'].forEach((reglage) => {
      expect(M.reserveAffichee({ zone: 'hypertrophie', role: 'test', reglage, famille: null })).toBe(reglage === 'prudent' ? 1 : 0);
      expect(M.reserveAffichee({ zone: 'hypertrophie', role: 'test', reglage, famille: 'jambes_tendues' })).toBe(1);
    });
    expect(M.reserveAffichee({ zone: 'hypertrophie', role: 'ligne', reglage: 'franc', famille: 'jambes_tendues' })).toBe(1);
    expect(M.reserveAffichee({ zone: 'hypertrophie', role: 'ligne', reglage: 'franc', famille: null })).toBe(0);
    expect(M.reserveVisee({ zone: 'hypertrophie', role: 'ligne', reglage: 'franc', famille: 'jambes_tendues' })).toBe(0);   // la table n'en sait rien
  });
  test('Franc : 60 kg × 10 noté « 0 en réserve » — le roumain gagne une séance de garde (sans le correctif : aucune)', () => {
    const h = histoire(60, 9, { reps: 10, ressenti: 'reste_0' });
    const sans = consigne(h, { reglage: 'franc', famille: null });
    const avec = consigne(h, { reglage: 'franc', famille: 'jambes_tendues' });
    expect(sans.fondement.effortVise).toBeUndefined();
    expect(avec.fondement.effortVise).toMatchObject({ effet: 'garde', reps: 10, reserve: 0, visee: 1, viseeTable: 0 });
  });
  test('Franc : 60 kg × 10 noté « 2 en réserve », la ligne de test vise 1 au lieu de 0 (test sur la table, visée sur le plancher)', () => {
    const h = histoire(60, 9, { reps: 10, ressenti: 'reste_2' });
    expect(consigne(h, { reglage: 'franc', famille: null }).fondement.effortVise).toMatchObject({ effet: 'test', visee: 0 });
    expect(consigne(h, { reglage: 'franc', famille: 'jambes_tendues' }).fondement.effortVise).toMatchObject({ effet: 'test', reserve: 2, visee: 1, viseeTable: 0 });
  });
});

describe('le plan et I241', () => {
  test('le roumain à la barre : réserve affichée 1 et garde des lignes 1 en Franc, aucune erreur ; aux haltères : 0 comme avant', () => {
    const r = jouer(ROUMAIN, progression, 'franc');
    expect(r.x.reserveAffichee).toBe(1);
    expect(r.x.gardeDeLigne).toBe(1);
    expect(r.x.reserveVisee).toBe(0);
    expect(r.erreurs).toEqual([]);
    const h = jouer(HALTERE, progression, 'franc');
    expect(h.x.reserveAffichee).toBe(0);
    expect(h.x.gardeDeLigne).toBe(0);
    expect(h.erreurs).toEqual([]);
  });
  test('le soulevé jambes tendues à la barre, Normal : en-tête 1 et garde 1 ; le good morning en Franc : 0 (hors périmètre)', () => {
    const r = jouer(JT, progression, 'normal');
    expect(r.x.reserveAffichee).toBe(1);
    expect(r.x.gardeDeLigne).toBe(1);
    expect(jouer(GM, progression, 'franc').x.reserveAffichee).toBe(0);
  });
  test('I241 étendu : une réserve du roumain sous 1 est une erreur ; le roumain aux haltères n\'en a pas', () => {
    const r = jouer(ROUMAIN, progression, 'franc');
    const faux = Object.assign({}, r.p, { exercices: [Object.assign({}, r.x, { reserveAffichee: 0, gardeDeLigne: 0 })] });
    expect(T.verifierPlan(faux, r.e, null).erreurs.filter((x) => /^I241/.test(x)).length).toBeGreaterThanOrEqual(2);
    const h = jouer(HALTERE, progression, 'franc');
    const ok = Object.assign({}, h.p, { exercices: [Object.assign({}, h.x, { reserveAffichee: 0, gardeDeLigne: 0 })] });
    expect(T.verifierPlan(ok, h.e, null).erreurs.filter((x) => /^I241/.test(x))).toEqual([]);
  });
});

describe('« ménager le dos » : le roumain sortait à 9 reps « jusqu\'au bout »', () => {
  const entree = { materiel: 'salle_complete', anciennete: '3_a_5_ans', phase: 'maintien', priorites: [], menager: ['dos'], ecartes: [], faits: {}, objectif: 'muscle', jours: 4 };
  const cas = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-60-6-generateur.json'), 'utf8'));
  const cat = {};
  Object.keys(cas.catalogue).forEach((slug) => { const [equipement, p, s] = cas.catalogue[slug]; cat[slug] = { equipement, muscles_primaires: p.slice(), muscles_secondaires: s.slice() }; });
  cat[ROUMAIN] = Object.assign({}, cat[ROUMAIN], { mouvement: 'jambes_tendues' });   // le catalogue réel le porte (catalogue-reel-extrait.json)

  test('le générateur ménage le dos : le roumain à la barre, 9 reps, ménagé — et sa ligne de test passe de « jusqu\'au bout » à 1 en réserve (Normal)', () => {
    const ligne = [];
    G.generer(cat, JSON.parse(JSON.stringify(entree))).forEach((rt) => rt.exercices.forEach((x) => { if (x.exercise_slug === ROUMAIN) ligne.push(x); }));
    expect(ligne.length).toBeGreaterThan(0);
    expect(ligne[0]).toMatchObject({ menage: true, reps: 9 });
    const k = T.cleDePlancherDe(cat, ROUMAIN);
    expect(k).toBe('jambes_tendues');
    expect(M.reserveAffichee({ zone: 'hypertrophie', role: 'test', reglage: 'normal', famille: null })).toBe(0);
    expect(M.reserveAffichee({ zone: 'hypertrophie', role: 'test', reglage: 'normal', famille: k })).toBe(1);
    // la phrase du coach : le « jusqu'au bout » de la ligne de test disparaît pour « avec 1 en réserve »
    const phrase = (famille) => {
      const c = consigne(histoire(60, 9, { reps: 9, ressenti: 'reste_2' }), { reglage: 'normal', famille });
      return JSON.stringify(c.fondement && c.fondement.effortVise) + ' ' + (c.pourquoi || '');
    };
    expect(phrase('jambes_tendues')).not.toMatch(/jusqu.au bout/);
  });
  test('les programmes du générateur ne changent pas : la même sortie, le plancher n\'y est pas lu', () => {
    const avant = JSON.stringify(G.generer(cat, JSON.parse(JSON.stringify(entree))));
    expect(G.familleDeBarre(ROUMAIN, cat)).toBeNull();
    expect(JSON.stringify(G.generer(cat, JSON.parse(JSON.stringify(entree))))).toBe(avant);
  });
});
