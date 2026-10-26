/** @jest-environment node */
//
// 175 — LES TROIS PLAFONDS (décisions d'Aurélien du 26/10/2026, après délibération avec Gemini et lecture des coachs).
//   1. L'échelle propose aussi la variante sans matériel (MOTEUR §9.17 bis) : pompes → lestées OU déclinées ; à 30 reps,
//      plus jamais « une rep de plus ».
//   2. À la plus lourde de la salle : tous les leviers d'un coup (MOTEUR §10 bis).
//   3. Le gros cran : l'annoncer, et s'installer au-dessus dès le premier essai (MOTEUR §9.7, §10.2).
// Le fichier de cas de l'échelle (cas-127.json) n'est pas retouché : il reste celui de Claude.ai.

process.env.TZ = 'Europe/Paris';
global.self = global;

const fs = require('fs');
const path = require('path');

const Mo = require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const F = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'cas-127.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const INDEX = {};
F.echelles.forEach((e) => { INDEX[e.slug] = Object.assign({}, e, { echelle_rang: e.rang }); });

const AVANT = '2026-10-21T10:00:00Z';
const JOURS = [28, 21, 14, 7];
function seancesDe(slug, kg, reps, jours) {
  let rang = 0;
  const debut = (d) => new Date(Date.parse(AVANT) - d * 86400000).toISOString();
  return (jours || JOURS).map((d, i) => ({
    seance: { id: 'A' + i, debut: debut(d) },
    series: [0, 1, 2].map(() => ({ id: 'a' + (++rang), rang: rang, charge_kg: kg[i], reps: reps[i], rpe: null,
      ressenti: null, type_serie: 'travail', exercise_slug: slug }))
  }));
}
const PDC = { mesure: 'reps', equipement: null, intention: 'progresser', reglage: 'normal', lestPossible: true, lestReponse: null };
const esp = (t) => String(t || '').replace(/[\u00a0\u202f]/g, ' ');
const erreurs = (plan, e) => T.verifierPlan(plan, e).erreurs;

function seanceDe(slugs) {
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  slugs.forEach((slug) => { se = S.ajouterExercice(se, slug, id, { series: 3 }); });
  return se;
}
// Ce que l'app passe au plan pour un exercice d'échelle (`entreesDuPlan`) : la variante, l'échelle, la réponse au lest.
function entreesEchelle(slug, consigne, o) {
  const opt = o || {};
  const se = seanceDe([slug]);
  const lestRefuse = opt.lestReponse === 'non';
  const m = Mo.marcheSuivante(INDEX, slug, { lestRefuse: lestRefuse });
  const ms = Mo.marcheSuivante(INDEX, slug);
  const variante = ms && ms.type === 'lest' && ms.variante ? { slug: ms.variante, nom: INDEX[ms.variante].nom } : null;
  const ech = m && m.proposable
    ? { marche: m, nomCible: INDEX[m.cible[0]].nom, aide: false, cibleHabilete: false, cibleFaiteLe: null } : null;
  return {
    seance: { id: 'S1', debut: AVANT, edition: false, exercices: se.exercices },
    consignes: { [slug]: consigne }, reglage: null, paris: [], suites: {},
    catalogue: { [slug]: { nom: INDEX[slug].nom, equipement: null, muscles_primaires: ['pectoraux'], mesure: 'reps',
      leste: Mo.lesteDe ? Mo.lesteDe(INDEX, slug) : null, variante: variante } },
    intention: 'progresser', modes: {}, lestReponse: opt.lestReponse || null,
    echelles: ech ? { [slug]: ech } : {}, marcheReponses: opt.marcheReponses || {}
  };
}
const consignePompes = (reps, lestReponse) => M.consigneDExercice(
  seancesDe('pompes', [null, null, null, null], reps, JOURS), undefined, AVANT,
  Object.assign({}, PDC, { lestReponse: lestReponse || null, echelle: false }));

// ═══ COMMIT 1 — L'ÉCHELLE PROPOSE AUSSI LA VARIANTE SANS MATÉRIEL ═══════════════════════════════════════════════
describe('175 / 1 — la marche suivante : le lest ET la variante', () => {
  test('pompes : le lest, avec la variante (les déclinées) ; la carte du lest reste la carte', () => {
    expect(Mo.marcheSuivante(INDEX, 'pompes')).toEqual(
      { type: 'lest', cible: ['pompes_lestees'], variante: 'pompes_declinees', proposable: false });
  });
  test('tractions : le rang au-dessus n’a que le lest — inchangé, sans variante', () => {
    expect(Mo.marcheSuivante(INDEX, 'tractions')).toEqual({ type: 'lest', cible: ['tractions_leste'], proposable: false });
  });
  test('« Pas de lest » : les déclinées deviennent la marche suivante, proposable, seule', () => {
    expect(Mo.marcheSuivante(INDEX, 'pompes', { lestRefuse: true })).toEqual(
      { type: 'marche', cible: ['pompes_declinees'], proposable: true });
    // Sans variante, le refus du lest ne change rien.
    expect(Mo.marcheSuivante(INDEX, 'tractions', { lestRefuse: true })).toEqual(Mo.marcheSuivante(INDEX, 'tractions'));
  });
  test('depuis une marche NON stricte (les négatives), la variante n’est jamais proposée : la marche d’avant, inchangée', () => {
    const m = Mo.marcheSuivante(INDEX, 'pompes_negatives', { lestRefuse: true });
    expect(m).toEqual({ type: 'marche', cible: ['pompes'], proposable: true });
    expect(Mo.marcheSuivante(INDEX, 'pompes_negatives').variante).toBeUndefined();
  });
  test('la variante est de force : une habileté au même rang n’est jamais la variante', () => {
    const idx = clone(INDEX);
    idx.pompes_declinees.nature = 'habilete';
    const m = Mo.marcheSuivante(idx, 'pompes', { lestRefuse: true });
    expect(m.variante).toBeUndefined();
    expect(m.cible).toEqual(['pompes_lestees']);
  });
});

describe('175 / 1 — la carte du lest propose les deux', () => {
  const planLest = () => {
    const c = consignePompes([12, 12, 12, 12]);
    const e = entreesEchelle('pompes', c);
    return { c, e, plan: T.planDeSeance(e) };
  };
  test('pompes au haut de la zone deux séances de suite : trois gestes, le détail dit la variante', () => {
    const { c, e, plan } = planLest();
    expect(c.consigne.etat).toBe('carte_lest');
    const x = plan.exercices[0];
    expect(x.carteLest).toMatchObject({
      oui: 'Ajouter du lest', non: 'Rester aux Pompes', variante: { slug: 'pompes_declinees', nom: 'Pompes Déclinées' }
    });
    expect(esp(x.carteLest.titre)).toBe('12 reps sur toutes tes séries, deux séances de suite.');
    expect(esp(x.carteLest.detail)).toBe('Le haut de ta zone tient. La marche au-dessus : du lest (2,5 kg, en revenant à 10 reps), ' +
      'ou Pompes Déclinées, sans matériel.');
    expect(x.carteMarche).toBeNull();
    expect(erreurs(plan, e)).toEqual([]);
  });
  test('I29 cassé exprès — la variante qui est le lest lui-même', () => {
    const { e, plan } = planLest();
    const f = clone(plan);
    f.exercices[0].carteLest.variante.slug = f.exercices[0].carteLest.leste;
    expect(erreurs(f, e).some((t) => /^I29 .*variante/.test(t))).toBe(true);
    expect(erreurs(plan, e)).toEqual([]);
  });
  test('la carte garde la ligne : la consigne n’est pas touchée', () => {
    const { c, plan } = planLest();
    expect(plan.exercices[0].consigne).toEqual(c.consigne);
  });
  test('tractions (rang 4 = lestées seulement) : la carte d’avant, au mot près', () => {
    const c = M.consigneDExercice(seancesDe('tractions', [null, null, null, null], [8, 8, 8, 8], JOURS), undefined, AVANT,
      Object.assign({}, PDC, { correction: 'mix' }));
    const se = seanceDe(['tractions']);
    const e = { seance: { id: 'S1', debut: AVANT, edition: false, exercices: se.exercices }, consignes: { tractions: c },
      reglage: null, paris: [], suites: {},
      catalogue: { tractions: { nom: 'Tractions', equipement: null, muscles_primaires: ['dos'], mesure: 'reps', leste: 'tractions_leste', variante: null } },
      intention: 'progresser', modes: {}, lestReponse: null, echelles: {}, marcheReponses: {} };
    const x = T.planDeSeance(e).exercices[0];
    expect(x.carteLest).toMatchObject({ oui: 'J’ai du lest', non: 'Pas de lest' });
    expect(x.carteLest.variante).toBeUndefined();
    expect(x.carteLest.detail).toMatch(/^Au haut de ta zone, un lest te fait continuer en force\./);
  });
  test('« Pas de lest » : la carte de la marche suivante propose la variante seule (une 2e carte n’est pas créée)', () => {
    const c = consignePompes([12, 12, 12, 12], 'non');
    expect(c.consigne.etat).toBe('etirement_reps');
    const e = entreesEchelle('pompes', Object.assign({}, c, {}), { lestReponse: 'non' });
    // L'app passe `echelle: true` au moteur quand la marche est proposable : les deux dernières séances sont au fondement.
    const c2 = M.consigneDExercice(seancesDe('pompes', [null, null, null, null], [12, 12, 12, 12], JOURS), undefined, AVANT,
      Object.assign({}, PDC, { lestReponse: 'non', echelle: true }));
    e.consignes.pompes = c2;
    const plan = T.planDeSeance(e);
    const x = plan.exercices[0];
    expect(x.carteLest).toBeNull();
    expect(x.carteMarche).toMatchObject({ cible: 'pompes_declinees', nom: 'Pompes Déclinées', oui: 'Ajouter Pompes Déclinées',
      non: 'Pas maintenant', type: 'marche', proposable: true });
    expect(esp(x.carteMarche.titre)).toBe('12 reps sur toutes tes séries, deux séances de suite.');
    expect(erreurs(plan, e)).toEqual([]);
  });
  test('le refus est gardé et relu : « Pas maintenant » → la carte ne revient pas', () => {
    const c2 = M.consigneDExercice(seancesDe('pompes', [null, null, null, null], [12, 12, 12, 12], JOURS), undefined, AVANT,
      Object.assign({}, PDC, { lestReponse: 'non', echelle: true }));
    const e = entreesEchelle('pompes', c2, { lestReponse: 'non', marcheReponses: { pompes: { r: 'non', le: AVANT } } });
    expect(T.planDeSeance(e).exercices[0].carteMarche).toBeNull();
  });
});

describe('175 / 1 — « Ton échelle » dit aussi la variante', () => {
  const faites = { pompes: { meilleur: 'Poids du corps × 12', quand: 'mardi', derniere: AVANT } };
  test('depuis la stricte : « Pompes Lestées ou Pompes Déclinées »', () => {
    const v = Mo.vueEchelle(INDEX, 'pompes', faites, { pompes: 12 }, true, M.phraseDeLaSuivante);
    expect(v.phrase).toMatch(/^La suivante : Pompes Lestées \(Disque\) ou Pompes Déclinées\. Je te la propose quand tu tiens 12 reps/);
    const rang4 = v.marches.filter((m) => m.rang === 4)[0];
    expect(rang4.suivante).toBe(true);
    expect(rang4.exercices.map((x) => x.slug)).toEqual(['pompes_declinees', 'pompes_lestees']);
  });
  test('le lest refusé : la variante seule, qui s’ajoute', () => {
    const v = Mo.vueEchelle(INDEX, 'pompes', faites, { pompes: 12 }, true, M.phraseDeLaSuivante, { lestRefuse: true });
    expect(v.phrase).toMatch(/^La suivante : Pompes Déclinées\. Je te la propose quand tu tiens 12 reps.* Elle s'ajoute : tu gardes Pompes\.$/);
  });
  test('tractions : la phrase d’avant, sans variante', () => {
    const f = { tractions: { meilleur: null, quand: null, derniere: AVANT } };
    const v = Mo.vueEchelle(INDEX, 'tractions', f, { tractions: 8 }, true, M.phraseDeLaSuivante);
    expect(v.phrase).toMatch(/^La suivante : Tractions Lestées\. Je te la propose/);
  });
});

describe('175 / 1 — 30 reps au poids du corps : le plafond sans lest', () => {
  const gris = (reps) => {
    const c = consignePompes([reps, reps, reps, reps], 'non');
    return { c, gris: esp(M.libellesConsigne(c.consigne, AVANT).gris) };
  };
  test('30 reps sur toutes les séries : le plafond, jamais « une rep de plus »', () => {
    const { c, gris: g } = gris(30);
    expect(c.consigne.etat).toBe('etirement_reps');
    expect(c.consigne.ligne).toEqual({ charge: 0, vise: 30 });
    expect(g).toMatch(/Poids du corps × 30, 30, 30\. Ton plafond sans lest\.$/);
    expect(g).not.toMatch(/rep de plus/);
  });
  test('29 reps : « Vise 30 sur toutes tes séries. »', () => {
    const g = gris(29).gris;
    expect(g).toMatch(/\. Vise 30 sur toutes tes séries\.$/);
    expect(g).not.toMatch(/rep de plus/);
  });
  test('20 reps : « Une rep de plus. », comme avant', () => {
    expect(gris(20).gris).toMatch(/\. Une rep de plus\.$/);
  });
  test('la feuille « Pourquoi » dit le plafond à 30, pas la rep de plus', () => {
    const c = consignePompes([30, 30, 30, 30], 'non');
    const etat = esp(M.pourquoiConsigne(c.consigne, 'normal', AVANT).etat);
    expect(etat).toMatch(/30 reps est le plafond sans lest/);
    expect(etat).not.toMatch(/une de plus que la dernière fois/);
  });
});
