/** @jest-environment node */
//
// 127 — L'ÉCHELLE DES VARIANTES (MOTEUR §9.17 et §9.17 bis, ECRAN-SAISIE §7 quater.6 ; chantier B).
//
// Le catalogue range les variantes d'un mouvement au poids du corps en échelle ; le coach propose la marche
// au-dessus quand on tient le haut de sa zone ET 8 reps deux séances de suite (depuis une aide : à la même aide).
// Depuis une aide ou une marche plus facile, elle s'AJOUTE (la carte « marche suivante ») ; depuis la stricte, c'est
// la carte du lest, qui REMPLACE, et qui attend désormais 8 reps elle aussi. Une habileté n'est jamais proposée.
//
// LE FICHIER DE CAS FAIT FOI. `cas-127.json` sort de `echelle127.py` (Claude.ai, 21/10/2026, corrigé à 18 h : le
// seuil de 8 reps vaut pour toutes les marches). Un cas qui semble faux se rapporte ; il ne se corrige pas ici —
// d'où l'empreinte du fichier, vérifiée en tête.

process.env.TZ = 'Europe/Paris';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const Mo = require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const CHEMIN = path.join(__dirname, 'fixtures', 'cas-127.json');
const F = JSON.parse(fs.readFileSync(CHEMIN, 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));

// L'index du catalogue tel que l'app le lit après v2_099 : la colonne s'appelle `echelle_rang` (la référence dit `rang`).
const INDEX = {};
F.echelles.forEach((e) => { INDEX[e.slug] = Object.assign({}, e, { echelle_rang: e.rang }); });

// ═══ 0. LE FICHIER DE CAS N'EST PAS RETOUCHÉ ════════════════════════════════
describe('127 — le fichier de cas', () => {
  test('son empreinte est celle du fichier reçu de Claude.ai (corrigé le 21/10, 18 h)', () => {
    const h = crypto.createHash('sha256').update(fs.readFileSync(CHEMIN)).digest('hex');
    expect(h).toBe('c2f97da7deb311b3f00f0c2c71508d9815440d6659db67028d3f33bec46a0d10');
  });
  test('36 exercices, 36 marches suivantes, 5 seuils, 19 cartes, 7 vues', () => {
    expect(F.echelles).toHaveLength(36);
    expect(F.marche_suivante).toHaveLength(36);
    expect(F.seuil).toHaveLength(5);
    expect(F.carte).toHaveLength(19);
    expect(F.vue).toHaveLength(7);
  });
});

// ═══ 1. LA CONCORDANCE AVEC LA RÉFÉRENCE (0 écart) ══════════════════════════
describe('127 — concordance avec echelle127.py', () => {
  F.marche_suivante.forEach((c) => {
    test('marche_suivante — ' + c.slug, () => {
      expect(Mo.marcheSuivante(INDEX, c.slug)).toEqual(c.attendu);
    });
  });

  F.seuil.forEach((c) => {
    test('seuil — ' + c.type + ', haut ' + c.haut + ' → ' + c.attendu, () => {
      expect(M.seuilDeMarche(c.haut)).toBe(c.attendu);
    });
  });

  // La carte : les entrées de la référence, la marche suivante lue par la fonction unique.
  const carteDe = (c) => {
    const m = Mo.marcheSuivante(INDEX, c.slug);
    return M.carteMarche({
      marche: m, nomCible: m ? INDEX[m.cible[0]].nom : null, aide: INDEX[c.slug].charge === 'assistance',
      haut: c.haut, seances: c.seances, reponse: c.reponse, cibleFaiteLe: c.cible_faite_le,
      aujourdHui: c.aujourd_hui, coachActif: c.coach_actif
    });
  };
  F.carte.forEach((c) => {
    test('carte — ' + c.nom, () => {
      // Au caractère près : titre, détail, boutons, cible — ou `null`.
      expect(carteDe(c)).toEqual(c.attendu);
    });
  });

  F.vue.forEach((c) => {
    test('vue — ' + c.nom, () => {
      const v = Mo.vueEchelle(INDEX, c.slug, c.faites, c.zones_haut, c.coach_actif, M.phraseDeLaSuivante);
      expect(clone(v)).toEqual(c.attendu);
    });
  });

  test('aucune vue pour un exercice sans échelle, ni pour un catalogue sans les colonnes (v2_099 pas lancée)', () => {
    expect(Mo.vueEchelle(INDEX, 'inconnu', {}, {}, true, M.phraseDeLaSuivante)).toBeNull();
    const sans = {};
    F.echelles.forEach((e) => { sans[e.slug] = { slug: e.slug, nom: e.nom, charge: e.charge, nature: e.nature }; });
    expect(Mo.vueEchelle(sans, 'tractions', {}, {}, true, M.phraseDeLaSuivante)).toBeNull();
    expect(Mo.marcheSuivante(sans, 'tractions_elastique')).toBeNull();
  });

  test('la phrase ne se demande pas sans coach : `phraseDe` n’est pas appelée', () => {
    const appels = [];
    const c = F.vue.filter((x) => x.coach_actif === false)[0];
    Mo.vueEchelle(INDEX, c.slug, c.faites, c.zones_haut, false, (e) => { appels.push(e); return 'x'; });
    expect(appels).toEqual([]);
  });
});

// ═══ 2. LE LEST ATTEND 8 REPS (D1, D2) — SUR LA CONSIGNE RÉELLE ════════════
function seancesDe(slug, kg, reps, jours) {
  let rang = 0;
  const debut = (d) => new Date(Date.parse('2026-10-21T10:00:00Z') - d * 86400000).toISOString();
  return jours.map((d, i) => ({
    seance: { id: 'A' + i, debut: debut(d) },
    series: [0, 1, 2].map(() => ({ id: 'a' + (++rang), rang: rang, charge_kg: kg[i], reps: reps[i], rpe: null,
      ressenti: null, type_serie: 'travail', exercise_slug: slug }))
  }));
}
const AVANT = '2026-10-21T10:00:00Z';
const JOURS = [28, 21, 14, 7];
const PDC = { mesure: 'reps', equipement: null, intention: 'progresser', reglage: 'normal', lestPossible: true, lestReponse: null };
const AIDE = { mesure: 'charge_reps', equipement: 'elastique', intention: 'progresser', reglage: 'normal',
  lestPossible: false, lestReponse: null };

describe('127 — la carte du lest attend 8 reps (MOTEUR §9.17, D1-D2)', () => {
  test('au poids du corps, en zone Lourd, 5 reps deux séances : l’étirement, pas la carte', () => {
    const k = M.consigneDExercice(seancesDe('tractions', [null, null, null, null], [5, 5, 5, 5], JOURS), undefined, AVANT, PDC).consigne;
    expect(k.zone).toBe('lourd');
    expect(k.etat).toBe('etirement_reps');
    // L'étirement continue AU-DELÀ de la zone : 6 reps, sans ligne haute.
    expect(k.ligne).toEqual({ charge: 0, vise: 6 });
    expect(k.haut).toBeNull();
    expect(k.fondement.carteLest).toBeUndefined();
  });

  test('la même zone choisie (Lourd) : toujours l’étirement — la correction ne baisse pas le seuil', () => {
    const k = M.consigneDExercice(seancesDe('tractions', [null, null, null, null], [5, 5, 5, 5], JOURS), undefined, AVANT,
      Object.assign({}, PDC, { correction: 'lourd' })).consigne;
    expect(k.etat).toBe('etirement_reps');
  });

  test('le contraste : en zone Mix (haut 8), 8 reps deux séances — la carte du lest', () => {
    const k = M.consigneDExercice(seancesDe('tractions', [null, null, null, null], [8, 8, 8, 8], JOURS), undefined, AVANT,
      Object.assign({}, PDC, { correction: 'mix' })).consigne;
    expect(k.etat).toBe('carte_lest');
    expect(k.fondement.carteLest.niveaux).toEqual([8, 8]);
  });

  test('en zone Mix, 7 reps puis 8 : pas encore deux séances à 8 — l’étirement', () => {
    const k = M.consigneDExercice(seancesDe('tractions', [null, null, null, null], [7, 7, 7, 8], JOURS), undefined, AVANT,
      Object.assign({}, PDC, { correction: 'mix' })).consigne;
    expect(k.etat).not.toBe('carte_lest');
  });

  test('le seuil est écrit une fois : 8, et le haut de la zone au-dessus', () => {
    expect(M.SEUIL_MARCHE).toBe(8);
    expect([M.seuilDeMarche(5), M.seuilDeMarche(8), M.seuilDeMarche(12), M.seuilDeMarche(null)]).toEqual([8, 8, 12, 8]);
  });
});

// ═══ 3. LE FONDEMENT PORTE LES DEUX SÉANCES, SUR UNE ÉCHELLE SEULEMENT ══════
describe('127 — `deuxSeances` : les deux dernières séances, niveau et charge', () => {
  test('sur une échelle (l’app le dit) : niveau et aide de chacune', () => {
    const k = M.consigneDExercice(seancesDe('tractions_elastique', [-30, -30, -25, -25], [12, 12, 12, 12], JOURS),
      undefined, AVANT, Object.assign({}, AIDE, { echelle: true })).consigne;
    expect(k.fondement.deuxSeances).toEqual([{ niveau: 12, charge: -25 }, { niveau: 12, charge: -25 }]);
  });
  test('hors échelle : la clé n’existe pas (une clé n’y figure que si elle a un sens)', () => {
    const k = M.consigneDExercice(seancesDe('tractions_elastique', [-25, -25, -25, -25], [12, 12, 12, 12], JOURS),
      undefined, AVANT, AIDE).consigne;
    expect(k.fondement.deuxSeances).toBeUndefined();
  });
});

// ═══ 4. LA CARTE DANS LE PLAN, ET I49 / I50 ════════════════════════════════
function seanceDe(slugs) {
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  slugs.forEach((slug) => { se = S.ajouterExercice(se, slug, id, { series: 3 }); });
  return se;
}
// La marche à proposer telle que l'app la passe (`entreesDuPlan`).
function echelleDe(slug, cibleFaiteLe) {
  const m = Mo.marcheSuivante(INDEX, slug);
  if (!m || !m.proposable) return null;
  const c = INDEX[m.cible[0]];
  return { marche: m, nomCible: c.nom, aide: INDEX[slug].charge === 'assistance', cibleHabilete: c.nature === 'habilete',
           cibleFaiteLe: cibleFaiteLe || null };
}
function entreesDe(slug, consigne, extra) {
  const se = seanceDe([slug]);
  const ech = echelleDe(slug);
  return Object.assign({
    seance: { id: 'S1', debut: AVANT, edition: false, exercices: se.exercices },
    consignes: { [slug]: consigne }, reglage: null, paris: [], suites: {},
    catalogue: { [slug]: { equipement: 'elastique', muscles_primaires: ['dos'], mesure: INDEX[slug].mesure, leste: null } },
    intention: 'progresser', modes: {}, lestReponse: null,
    echelles: ech ? { [slug]: ech } : {}, marcheReponses: {}
  }, extra || {});
}
const consigneAide = (kg, reps) => M.consigneDExercice(seancesDe('tractions_elastique', kg, reps, JOURS), undefined, AVANT,
  Object.assign({}, AIDE, { echelle: true }));
const erreurs = (plan, e) => T.verifierPlan(plan, e).erreurs;
const dit = (liste, inv) => liste.some((t) => t.indexOf(inv + ' ') === 0);

describe('127 — la carte « marche suivante » dans le plan (§9.17 bis)', () => {
  const planCarte = (extra, kg, reps) => {
    const c = consigneAide(kg || [-30, -30, -25, -25], reps || [12, 12, 12, 12]);
    const e = entreesDe('tractions_elastique', c, extra);
    return { e, plan: T.planDeSeance(e) };
  };

  test('deux séances au haut de la zone (12), à la même aide : la carte, rédigée par le formateur', () => {
    const { e, plan } = planCarte();
    const x = plan.exercices[0];
    expect(x.carteMarche).toMatchObject({
      titre: 'Aide 25 kg × 12 sur toutes tes séries, deux séances de suite.',
      detail: 'La marche au-dessus : Tractions. Je te propose d\'en faire 2 séries avant, autant de reps que tu peux.',
      oui: 'Ajouter Tractions', non: 'Pas maintenant', cible: 'tractions', aide: true
    });
    // On tient la ligne : la consigne n'est pas touchée.
    expect(x.consigne).toEqual(consigneAide([-30, -30, -25, -25], [12, 12, 12, 12]).consigne);
    expect(x.phrases.map((p) => p.ou)).toEqual(expect.arrayContaining(['marche.titre', 'marche.detail']));
    expect(erreurs(plan, e)).toEqual([]);
  });

  test('deux aides différentes : pas de carte', () => {
    expect(planCarte(null, [-30, -30, -30, -25]).plan.exercices[0].carteMarche).toBeNull();
  });
  test('« Ajouter » déjà répondu : pas de carte', () => {
    expect(planCarte({ marcheReponses: { tractions_elastique: { r: 'oui', le: AVANT } } }).plan.exercices[0].carteMarche).toBeNull();
  });
  test('« Pas maintenant » à la même aide : pas de carte ; à une aide plus légère : la carte revient', () => {
    expect(planCarte({ marcheReponses: { tractions_elastique: { r: 'non', le: AVANT, aide: -25 } } }).plan.exercices[0].carteMarche).toBeNull();
    expect(planCarte({ marcheReponses: { tractions_elastique: { r: 'non', le: AVANT, aide: -30 } } }).plan.exercices[0].carteMarche).not.toBeNull();
  });
  test('en Entretenir (l’exercice) : pas de carte', () => {
    const c = consigneAide([-30, -30, -25, -25], [12, 12, 12, 12]);
    const e = entreesDe('tractions_elastique', c, { modes: { tractions_elastique: 'entretien' } });
    expect(T.planDeSeance(e).exercices[0].carteMarche).toBeNull();
  });
  test('une semaine allégée : pas de carte', () => {
    const c = consigneAide([-30, -30, -25, -25], [12, 12, 12, 12]);
    const al = clone(c);
    al.consigne.allegee = { series: 2, routine: 3 };
    const e = entreesDe('tractions_elastique', al);
    expect(T.planDeSeance(e).exercices[0].carteMarche).toBeNull();
  });
  test('la marche proposée faite il y a 10 jours : pas de carte', () => {
    const c = consigneAide([-30, -30, -25, -25], [12, 12, 12, 12]);
    const e = entreesDe('tractions_elastique', c);
    e.echelles.tractions_elastique.cibleFaiteLe = '2026-10-11T10:00:00Z';
    expect(T.planDeSeance(e).exercices[0].carteMarche).toBeNull();
  });
  test('l’exercice deux fois dans la séance : une seule carte (sur l’occurrence coachée)', () => {
    const c = consigneAide([-30, -30, -25, -25], [12, 12, 12, 12]);
    const se = seanceDe(['tractions_elastique', 'tractions_elastique']);
    const e = entreesDe('tractions_elastique', c, { seance: { id: 'S1', debut: AVANT, edition: false, exercices: se.exercices } });
    const plan = T.planDeSeance(e);
    expect(plan.exercices.filter((x) => x.carteMarche).length).toBe(1);
    expect(erreurs(plan, e)).toEqual([]);
  });
});

describe('127 — I49 et I50, cassés exprès', () => {
  const sain = () => {
    const c = consigneAide([-30, -30, -25, -25], [12, 12, 12, 12]);
    const e = entreesDe('tractions_elastique', c);
    return { e, plan: T.planDeSeance(e) };
  };

  test('le plan de départ est sain et porte la carte', () => {
    const { e, plan } = sain();
    expect(plan.exercices[0].carteMarche).not.toBeNull();
    expect(erreurs(plan, e)).toEqual([]);
  });

  test('I49 — deux cartes pour le même exercice dans la séance', () => {
    const { e, plan } = sain();
    const f = clone(plan);
    f.exercices.push(Object.assign(clone(f.exercices[0]), { iExo: 1 }));
    expect(erreurs(f, e).some((t) => /^I49 — 2 cartes « marche suivante »/.test(t))).toBe(true);
  });
  test('I49 — une habileté proposée', () => {
    const { e, plan } = sain();
    const f = clone(plan);
    f.exercices[0].carteMarche.cibleHabilete = true;
    expect(dit(erreurs(f, e), 'I49')).toBe(true);
  });
  test('I49 — une marche qui ne se propose pas (le lest, ou `proposable` faux)', () => {
    const { e, plan } = sain();
    const f = clone(plan);
    f.exercices[0].carteMarche.type = 'lest';
    expect(dit(erreurs(f, e), 'I49')).toBe(true);
    const g = clone(plan);
    g.exercices[0].carteMarche.proposable = false;
    expect(dit(erreurs(g, e), 'I49')).toBe(true);
  });
  test('I49 — en Entretenir (le profil), puis (l’exercice)', () => {
    const { e, plan } = sain();
    const f = clone(plan);
    f.intention = 'entretien';
    expect(erreurs(f, e).some((t) => /^I49 .*Entretenir/.test(t))).toBe(true);
    const g = clone(plan);
    g.exercices[0].intention = 'entretien';
    expect(erreurs(g, e).some((t) => /^I49 .*Entretenir/.test(t))).toBe(true);
  });
  test('I49 — sans deux séances au haut de la zone : une seule séance', () => {
    const { e, plan } = sain();
    const f = clone(plan);
    f.exercices[0].consigne.fondement.deuxSeances = [{ niveau: 12, charge: -25 }];
    expect(dit(erreurs(f, e), 'I49')).toBe(true);
  });
  test('I49 — une séance sous le haut de la zone', () => {
    const { e, plan } = sain();
    const f = clone(plan);
    f.exercices[0].consigne.fondement.deuxSeances[0].niveau = 11;
    expect(dit(erreurs(f, e), 'I49')).toBe(true);
  });
  test('I49 — au haut d’une zone Lourd (5) mais sous 8 reps', () => {
    const { e, plan } = sain();
    const f = clone(plan);
    f.exercices[0].consigne.zone = 'lourd';
    f.exercices[0].consigne.fondement.deuxSeances = [{ niveau: 5, charge: -25 }, { niveau: 5, charge: -25 }];
    expect(erreurs(f, e).some((t) => /^I49 .*8 reps/.test(t))).toBe(true);
  });
  test('I49 — sur une aide, deux aides différentes', () => {
    const { e, plan } = sain();
    const f = clone(plan);
    f.exercices[0].consigne.fondement.deuxSeances[0].charge = -30;
    expect(erreurs(f, e).some((t) => /^I49 .*aides différentes/.test(t))).toBe(true);
  });
  test('I49 — une réponse « oui »', () => {
    const { e, plan } = sain();
    const f = clone(plan);
    f.marcheReponses = { tractions_elastique: { r: 'oui', le: AVANT } };
    expect(dit(erreurs(f, e), 'I49')).toBe(true);
  });
  test('I49 — une réponse « non » hors aide', () => {
    const { e, plan } = sain();
    const f = clone(plan);
    f.exercices[0].carteMarche.aide = false;
    f.marcheReponses = { tractions_elastique: { r: 'non', le: AVANT } };
    expect(erreurs(f, e).some((t) => /^I49 .*hors aide/.test(t))).toBe(true);
  });
  test('I49 — une réponse « non » à une aide qui n’est pas plus légère', () => {
    const { e, plan } = sain();
    const f = clone(plan);
    f.marcheReponses = { tractions_elastique: { r: 'non', le: AVANT, aide: -25 } };
    expect(erreurs(f, e).some((t) => /^I49 .*pas plus légère/.test(t))).toBe(true);
    // Le témoin : à une aide plus lourde que celle d'aujourd'hui, la carte revient — aucune faute.
    const g = clone(plan);
    g.marcheReponses = { tractions_elastique: { r: 'non', le: AVANT, aide: -30 } };
    expect(dit(erreurs(g, e), 'I49')).toBe(false);
  });
  test('I49 — un point d’interrogation', () => {
    const { e, plan } = sain();
    const f = clone(plan);
    f.exercices[0].carteMarche.detail += ' ?';
    expect(dit(erreurs(f, e), 'I49')).toBe(true);
  });
  test('I49 — pendant une semaine allégée', () => {
    const { e, plan } = sain();
    const f = clone(plan);
    f.exercices[0].consigne.allegee = { series: 2, routine: 3 };
    expect(erreurs(f, e).some((t) => /^I49 .*allégée/.test(t))).toBe(true);
  });

  test('I50 — la carte du lest sous 8 reps', () => {
    const k = M.consigneDExercice(seancesDe('tractions', [null, null, null, null], [8, 8, 8, 8], JOURS), undefined, AVANT,
      Object.assign({}, PDC, { correction: 'mix' }));
    const se = seanceDe(['tractions']);
    const e = { seance: { id: 'S1', debut: AVANT, edition: false, exercices: se.exercices }, consignes: { tractions: k },
      reglage: null, paris: [], suites: {}, intention: 'progresser', modes: {}, lestReponse: null,
      catalogue: { tractions: { equipement: null, muscles_primaires: ['dos'], mesure: 'reps', leste: 'tractions_leste' } } };
    const plan = T.planDeSeance(e);
    expect(plan.exercices[0].carteLest).not.toBeNull();
    expect(erreurs(plan, e)).toEqual([]);
    const f = clone(plan);
    f.exercices[0].carteLest.niveaux = [7, 8];
    f.exercices[0].carteLest.haut = 5;
    f.exercices[0].consigne.fondement.carteLest = { niveaux: [7, 8], bas: 3, haut: 5 };
    expect(dit(erreurs(f, e), 'I50')).toBe(true);
  });
});

// ═══ 5. LA RÉPONSE — `repondreMarche` (app.js), rejouée dans un bac ═══════
//
// Le geste est un câblage de l'app ; on le rejoue tel qu'il est écrit, avec les vraies fonctions de séance et du
// moteur, et des témoins pour le profil et les suites d'un ajout.
describe('127 — la réponse à la carte : « Ajouter » insère avant et garde, « Pas maintenant » ne touche à rien', () => {
  const vm = require('vm');
  const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
  const extraire = (nom) => {
    const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
    if (!m) throw new Error('introuvable : ' + nom);
    return m[0];
  };
  const bac = (carte, demo) => {
    let n = 0;
    const se0 = seanceDe(['rowing_haltere', 'tractions_elastique']);
    const ctx = {
      seance: Object.assign({}, se0, { exercices: se0.exercices }), Seance: S, Moteur: M,
      uuid: () => 'n' + (++n), reponseEnCours: false, demoMarche: null,
      profil: { marche_reponses: { dips_torse_assiste: { r: 'non', le: 'x', aide: -30 } } },
      ecrits: [], gestes: [],
      enEdition: () => false, demoEscalier: () => !!demo,
      planDeLExercice: (i) => (i === 1 ? { slug: 'tractions_elastique', carteMarche: carte } : null),
      poserProfil: async function (c) { ctx.ecrits.push(c); },
      apresStructure: async function () { ctx.gestes.push('apresStructure'); },
      allegeePourAjout: async function (a, s) { ctx.gestes.push('allegee ' + s); },
      ligneDePlusPourAjout: async function (a, s) { ctx.gestes.push('ligneDePlus ' + s); },
      rendreSeance: function () { ctx.gestes.push('rendre'); }
    };
    vm.createContext(ctx);
    vm.runInContext(extraire('repondreMarche'), ctx);
    return ctx;
  };
  const CARTE = { cible: 'tractions', nom: 'Tractions', aide: true, charge: -25 };

  test('« Ajouter Tractions » : la réponse au profil, les tractions JUSTE AVANT, l’élastique reste, 2 séries vides', async () => {
    const ctx = bac(CARTE);
    await vm.runInContext('repondreMarche(1, "oui")', ctx);
    expect(ctx.ecrits).toHaveLength(1);
    const mr = ctx.ecrits[0].marche_reponses;
    expect(mr.tractions_elastique.r).toBe('oui');
    expect(typeof mr.tractions_elastique.le).toBe('string');
    expect(mr.tractions_elastique.aide).toBeUndefined();
    // Les autres réponses du profil sont gardées.
    expect(mr.dips_torse_assiste).toEqual({ r: 'non', le: 'x', aide: -30 });
    expect(ctx.seance.exercices.map((x) => x.exercise_slug)).toEqual(['rowing_haltere', 'tractions', 'tractions_elastique']);
    const ajoute = ctx.seance.exercices[1];
    expect(ajoute.series).toHaveLength(M.SERIES_MARCHE);
    expect(ajoute.series.every((s) => !s.validee_a && (s.reps === null || s.reps === undefined))).toBe(true);
    expect(ajoute.routine_exercise_id).toBeNull();
    expect(ctx.gestes).toEqual(['apresStructure', 'allegee tractions', 'ligneDePlus tractions']);
  });

  test('« Pas maintenant » : `{ r: non, le, aide }` au profil, et la séance ne change pas', async () => {
    const ctx = bac(CARTE);
    const avant = JSON.stringify(ctx.seance);
    await vm.runInContext('repondreMarche(1, "non")', ctx);
    expect(ctx.ecrits[0].marche_reponses.tractions_elastique).toMatchObject({ r: 'non', aide: -25 });
    expect(JSON.stringify(ctx.seance)).toBe(avant);
    expect(ctx.gestes).toEqual(['rendre']);
  });

  test('« Pas maintenant » hors aide : pas de clé `aide`', async () => {
    const ctx = bac({ cible: 'tractions', nom: 'Tractions', aide: false, charge: 0 });
    await vm.runInContext('repondreMarche(1, "non")', ctx);
    expect(Object.keys(ctx.ecrits[0].marche_reponses.tractions_elastique).sort()).toEqual(['le', 'r']);
  });

  test('la démonstration garde la réponse EN MÉMOIRE : rien au profil, rien dans la séance', async () => {
    const ctx = bac(CARTE, true);
    const avant = JSON.stringify(ctx.seance);
    await vm.runInContext('repondreMarche(1, "oui")', ctx);
    expect(ctx.ecrits).toEqual([]);
    expect(ctx.demoMarche.tractions_elastique.r).toBe('oui');
    expect(JSON.stringify(ctx.seance)).toBe(avant);
  });

  test('sans carte sur le plan : rien', async () => {
    const ctx = bac(null);
    await vm.runInContext('repondreMarche(1, "oui")', ctx);
    expect(ctx.ecrits).toEqual([]);
    expect(ctx.gestes).toEqual([]);
  });
});

// ═══ 6. LE CATALOGUE SANS LES COLONNES D'ÉCHELLE (v2_099 pas lancée) ══════
describe('127 — la lecture du catalogue ne casse pas sans `echelle` / `echelle_rang`', () => {
  const LIGNES = [
    { slug: 'tractions', nom: 'Tractions', charge: 'aucune' },
    { slug: 'tractions_elastique', nom: 'Tractions (Élastique)', charge: 'assistance' },
    { slug: 'squat_barre', nom: 'Squat', charge: 'barre' }
  ];
  let requetes;
  const client = (avecColonnes) => ({
    from() {
      let select = '';
      const c = {
        select(s) { select = s; return c; }, eq() { return c; }, gt() { return c; }, or() { return c; },
        order() { return c; }, limit() { return c; }, range() { return c; },
        then(res, rej) {
          requetes.push(select);
          const echelle = /echelle/.test(select);
          if (echelle && !avecColonnes) {
            return Promise.resolve({ data: null, error: { code: '42703', message: 'column exercises.echelle does not exist' } }).then(res, rej);
          }
          const premiere = requetes.filter((x) => x === select).length === 1;
          const data = !premiere ? [] : echelle
            ? [{ slug: 'tractions', echelle: 'tractions', echelle_rang: 3 },
               { slug: 'tractions_elastique', echelle: 'tractions', echelle_rang: 1 },
               { slug: 'squat_barre', echelle: null, echelle_rang: null }]
            : LIGNES.map((l) => Object.assign({}, l));
          return Promise.resolve({ data, error: null }).then(res, rej);
        }
      };
      return c;
    }
  });
  const charger = (avecColonnes) => {
    requetes = [];
    globalThis.THSeance = S;
    globalThis.THClient = { obtenir: () => client(avecColonnes) };
    delete require.cache[require.resolve('../../v2/js/donnees.js')];
    return require('../../v2/js/donnees.js');
  };
  afterEach(() => { delete globalThis.THClient; });

  test('le `select` du catalogue ne nomme PAS les colonnes d’échelle (une colonne inconnue refuserait tout)', async () => {
    const D = charger(true);
    await D.tousLesExercices();
    expect(requetes[0]).not.toMatch(/echelle/);
    expect(requetes.some((r) => /echelle_rang/.test(r))).toBe(true);
  });

  test('colonnes absentes : le catalogue entier, ses lignes sans échelle', async () => {
    const D = charger(false);
    const cat = await D.tousLesExercices();
    expect(cat.map((e) => e.slug)).toEqual(['tractions', 'tractions_elastique', 'squat_barre']);
    expect(cat.every((e) => e.echelle === undefined && e.echelle_rang === undefined)).toBe(true);
  });

  test('colonnes présentes : posées sur les exercices d’une échelle, et seulement eux', async () => {
    const D = charger(true);
    const cat = await D.tousLesExercices();
    const ix = Mo.indexerExercices(cat);
    expect([ix.tractions.echelle, ix.tractions.echelle_rang]).toEqual(['tractions', 3]);
    expect(ix.tractions_elastique.echelle_rang).toBe(1);
    expect(ix.squat_barre.echelle).toBeUndefined();
    expect(Mo.marcheSuivante(ix, 'tractions_elastique')).toEqual({ type: 'sans_aide', cible: ['tractions'], proposable: true });
  });

  test('le profil : `marche_reponses` est lue, écrite, et FACULTATIVE (absente, le profil se lit sans elle)', async () => {
    const Profil = require('../../v2/js/profil.js');
    expect(Profil.CHAMPS_ECRITS).toContain('marche_reponses');
    expect(Profil.champsEcrits({ marche_reponses: { tractions: { r: 'oui', le: 'x' } } })).toEqual({ marche_reponses: { tractions: { r: 'oui', le: 'x' } } });
    expect(Profil.champsEcrits({ marche_reponses: ['x'] })).toEqual({});
    const vus = [];
    globalThis.THSeance = S;
    globalThis.THClient = { obtenir: () => ({ from() {
      let sel = '';
      const c = { select(s) { sel = s; return c; }, eq() { return c; },
        maybeSingle() {
          vus.push(sel);
          return Promise.resolve(/marche_reponses/.test(sel)
            ? { data: null, error: { code: '42703', message: 'column profiles.marche_reponses does not exist' } }
            : { data: { id: 'u-1', username: 'x' }, error: null });
        } };
      return c;
    } }) };
    delete require.cache[require.resolve('../../v2/js/donnees.js')];
    const D = require('../../v2/js/donnees.js');
    const p = await D.monProfil('u-1');
    expect(p).toEqual({ id: 'u-1', username: 'x' });
    expect(vus[0]).toMatch(/marche_reponses/);
    expect(vus[vus.length - 1]).not.toMatch(/marche_reponses/);
  });
});
