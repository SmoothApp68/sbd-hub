/** @jest-environment node */
//
// 49-U19 — LA COHÉRENCE DES PHRASES (MOTEUR §20 bis, I26), BLOQUANTE depuis
// la PR 7 de la consolidation (02/10/2026).
//
// « Chaque chiffre que le coach écrit a une origine dans le plan ; et deux
// phrases du même plan ne disent jamais deux choses différentes. »
//
//   1. LE FORMATEUR DÉCLARE : sous capture, chaque chiffre s'inscrit avec sa
//      nature et son objet ; hors capture, le texte est le même, octet pour
//      octet.
//   2. LA GARDE ATTRAPE ce qu'elle doit attraper (cas forgés), et laisse
//      passer ce qui est juste.
//   3. LE BALAYAGE : toutes les phrases de tous les plans tirés des fichiers
//      de cas. AUCUN ÉCART : la liste d'attente s'est vidée (PR 7) et n'existe
//      plus ; un écart est une violation de `verifierPlan`.
//   4. LA SÉANCE DU 01/10 : sur l'état d'avant #350 (un décor qui reproduit
//      les phrases d'alors, avec ce que le formateur en déclarait), la garde
//      retrouve les incohérences ; sur l'état actuel, aucune.

process.env.TZ = 'Europe/Paris';


require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const Modele = require('../../v2/js/modele.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const NB = '\u00a0';
const esp = (x) => (x === null || x === undefined ? x : String(x).replace(/\u00a0/g, ' '));

// ── 1. LE FORMATEUR DÉCLARE ─────────────────────────────────────────────────
describe('§20 bis — le formateur déclare la nature de chaque chiffre', () => {
  const cite = (nature, objet) => ({ nature, objet });
  test('sous capture : la nature, l’objet, les valeurs et le texte écrit', () => {
    const r = Modele.capturer(() => Modele.chargeFois(92, 11, undefined, cite('cible_du_jour', { role: 'ligne' })) +
      ' · ' + Modele.serie(80, [10, 10, 6], undefined, cite('fait_passe', { quoi: 'palier' })) +
      ' · ' + Modele.quand('2026-09-29T18:00:00+02:00', '2026-10-01T09:00:00+02:00', false, cite('fait_passe', { quoi: 'palier' })) +
      ' · ' + Modele.nombre(8, undefined, cite('regle', { regle: 'zone.haut' })));
    expect(esp(r.texte)).toBe('92 kg × 11 · 80 kg × 10, 10, 6 · mardi · 8');
    expect(r.citations.map((q) => [q.nature, q.objet, q.charge, q.reps, q.date, q.valeur, esp(q.texte)])).toEqual([
      ['cible_du_jour', { role: 'ligne' }, 92, [11], undefined, undefined, '92 kg × 11'],
      ['fait_passe', { quoi: 'palier' }, 80, [10, 10, 6], undefined, undefined, '80 kg × 10, 10, 6'],
      ['fait_passe', { quoi: 'palier' }, undefined, undefined, '2026-09-29T18:00:00+02:00', undefined, 'mardi'],
      ['regle', { regle: 'zone.haut' }, undefined, undefined, undefined, 8, '8']
    ]);
  });
  test('hors capture : rien ne s’inscrit, et le texte est le même', () => {
    const a = Modele.chargeFois(127.5, 5, undefined, cite('cible_du_jour', { role: 'ligne' }));
    expect(a).toBe(Modele.chargeFois(127.5, 5));
    expect(Modele.capturer(() => 'rien').citations).toEqual([]);
  });
  test('une capture dans une capture : chacune garde les siennes', () => {
    const r = Modele.capturer(() => {
      const dedans = Modele.capturer(() => Modele.charge(50, undefined, cite('regle', { regle: 'chauffe' })));
      return dedans.texte + ' ' + Modele.charge(60, undefined, cite('regle', { regle: 'reference' }));
    });
    expect(r.citations.map((q) => q.charge)).toEqual([60]);
  });
  test('une charge inconnue se dit par son repli, et se déclare nulle', () => {
    const r = Modele.capturer(() => Modele.chargeFois(null, 10, 'Le cran au-dessus', cite('cible_du_jour', { role: 'haut' })));
    expect(esp(r.texte)).toBe('Le cran au-dessus × 10');
    expect(r.citations[0].charge).toBeNull();
  });
});

// ── 2. LA GARDE ATTRAPE, ET LAISSE PASSER ───────────────────────────────────
//
// Un plan d'un exercice, puis des phrases FORGÉES posées sur lui, avec les
// citations qu'aurait déclarées le formateur.
const DEBUT = '2026-10-01T17:07:00+02:00';
function planDe(k, o) {
  const opt = o || {};
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'x', id, { series: opt.series || k.n || 3 });
  (opt.faites || []).forEach((f, i) => {
    se = S.modifierSerie(se, 0, i, { charge_kg: f[0], reps: f[1] });
    se = S.valider(se, 0, i, new Date('2026-10-01T17:30:00Z'));
  });
  const e = { seance: { id: 'S1', debut: DEBUT, edition: false, exercices: se.exercices },
    consignes: { x: { consigne: k, libelles: M.libellesConsigne(k, DEBUT), compteur: opt.compteur || null } },
    reglage: 'normal', paris: [], suites: opt.suites || {} };
  return T.planDeSeance(e);
}
const avecPhrase = (p, ou, texte, citations) => {
  const q = JSON.parse(JSON.stringify(p));
  q.exercices[0].phrases.push({ ou, texte, citations });
  return q;
};
const Q = (nature, objet, v, texte) => Object.assign({ nature, objet, texte }, v);
const causes = (p) => T.verifierPhrases(p).map((e) => e.cause + ' · ' + e.ou);

const K92 = { etat: 'progression', zone: 'hypertrophie', palier: 92, niveau: 10, n: 3,
  ligne: { charge: 92, vise: 11 }, haut: null,
  fondement: { date: '2026-09-29T18:00:00+02:00', reps: [10, 10, 10] } };

describe('I26 — la garde attrape ce qu’elle doit attraper', () => {
  const base = planDe(K92);
  test('prémisse : le plan juste n’a aucun écart', () => {
    expect(esp(base.exercices[0].entete.jaune[0])).toBe('92 kg × 11');
    expect(T.verifierPhrases(base)).toEqual([]);
  });

  test('en-tête « 92 kg × 11 », gris « Même cible : 92 kg × 10 » : la cible n’est pas une ligne, et le jaune et le gris divergent', () => {
    const p = avecPhrase(base, 'constat', 'Même cible la prochaine fois' + NB + ': 92' + NB + 'kg' + NB + '×' + NB + '10.',
      [Q('cible_du_jour', { role: 'ligne' }, { charge: 92, reps: [10] }, '92' + NB + 'kg' + NB + '×' + NB + '10')]);
    const e = T.verifierPhrases(p);
    expect(e.map((x) => x.cause)).toEqual(['cible_hors_lignes', 'jaune_gris']);
    expect(esp(e[1].attendu)).toBe('92 kg × 11 (entete.jaune)');
  });

  test('un jaune qui cite une charge absente des lignes', () => {
    const p = avecPhrase(base, 'message', '95' + NB + 'kg' + NB + '×' + NB + '11',
      [Q('cible_du_jour', { role: 'coach' }, { charge: 95, reps: [11] }, '95' + NB + 'kg' + NB + '×' + NB + '11')]);
    expect(causes(p)).toEqual(['cible_hors_lignes · message']);
  });

  test('« ta dernière série » sur la série de rang 1 : le mot d’ordre contredit le rang', () => {
    const k = { etat: 'rejoint', zone: 'mix', palier: 92, niveau: 8, n: 3, ligne: null,
      haut: { charge: 92, vise: 8, k: 3 },
      fondement: { date: '2026-09-29T18:00:00+02:00', palierPrecedent: 88,
        seance: [{ role: 'travail', charge_kg: 88, reps: 8 }, { role: 'palier', charge_kg: 92, reps: 8 },
                 { role: 'palier', charge_kg: 92, reps: 8 }] } };
    const p = planDe(k);
    expect(esp(p.exercices[0].entete.gris)).toBe('Ta première série à 88 kg passe à 92 kg.');
    expect(T.verifierPhrases(p)).toEqual([]);
    const faux = JSON.parse(JSON.stringify(p));
    const g = faux.exercices[0].phrases.filter((x) => x.ou === 'entete.gris')[0];
    g.texte = g.texte.replace('première', 'dernière');
    g.citations[0].objet.ordre = 'dernière';
    const e = T.verifierPhrases(faux);
    expect(e.map((x) => [x.cause, x.attendu])).toEqual([['mot_ordre', 'rang 1 sur 3']]);
  });

  test('une cible suivante différente de la consigne suivante', () => {
    const suite = { consigne: { etat: 'progression', zone: 'hypertrophie', palier: 92, niveau: 11, n: 3,
      ligne: { charge: 92, vise: 12 }, haut: null, fondement: {} }, cranSuivant: 94 };
    const p = planDe(K92, { faites: [[92, 11], [92, 11], [92, 11]], suites: { x: suite } });
    expect(p.exercices[0].constat).not.toBeNull();
    expect(T.verifierPhrases(p)).toEqual([]);
    const faux = JSON.parse(JSON.stringify(p));
    faux.exercices[0].constat.suiteLignes.ligne.vise = 13;
    expect(causes(faux)).toEqual(['suivante_differente · constat']);
  });

  test('« × null » : le mot interdit, et la visée déclarée nulle', () => {
    const p = avecPhrase(base, 'entete.jaune', '92' + NB + 'kg' + NB + '×' + NB + 'null',
      [Q('cible_du_jour', { role: 'ligne' }, { charge: 92, reps: [null] }, '92' + NB + 'kg' + NB + '×' + NB)]);
    expect(causes(p)).toEqual(['mot_interdit · entete.jaune', 'valeur_nulle · entete.jaune']);
  });

  test('une citation sans nature ; un chiffre écrit hors du formateur', () => {
    const p = avecPhrase(base, 'message', 'Tu as fait 3 séries à 92' + NB + 'kg.',
      [Q(null, null, { charge: 92 }, '92' + NB + 'kg')]);
    expect(T.verifierPhrases(p).map((x) => [x.cause, x.citation])).toEqual([['hors_formateur', '3'], ['sans_nature', '92' + NB + 'kg']]);
  });
});

describe('I26 — la garde laisse passer ce qui est juste', () => {
  test('un fait passé à une autre charge que la ligne du jour', () => {
    const k = Object.assign({}, K92, { fondement: { date: '2026-09-29T18:00:00+02:00', reps: [10, 10, 10] }, palier: 90 });
    const p = planDe(Object.assign({}, k, { ligne: { charge: 92, vise: 11 } }));
    const x = p.exercices[0];
    const q = JSON.parse(JSON.stringify(p));
    q.exercices[0].phrases.push({ ou: 'message', texte: '90' + NB + 'kg' + NB + '×' + NB + '10, 10, 10',
      citations: [Q('fait_passe', { quoi: 'palier' }, { charge: 90, reps: [10, 10, 10] }, '90' + NB + 'kg' + NB + '×' + NB + '10, 10, 10')] });
    expect(x.lignes.every((l) => l.role === 'hors' || l.charge === 92)).toBe(true);
    expect(T.verifierPhrases(q)).toEqual([]);
  });

  test('l’étirement au-dessus de la zone : « On retestera … quand tu feras 13 reps à … »', () => {
    const k = { etat: 'etirement', zone: 'hypertrophie', palier: 40, niveau: 12, n: 3,
      ligne: { charge: 40, vise: 13 }, haut: null,
      fondement: { date: '2026-09-29T18:00:00+02:00', reps: [12, 12, 12], cible: 13,
        test: { charge: 42.5, reps: 7, niveau: 7, date: '2026-09-29T18:00:00+02:00' } } };
    const p = planDe(k);
    const g = p.exercices[0].phrases.filter((x) => x.ou === 'entete.gris')[0];
    expect(esp(g.texte)).toBe('Ta machine ne permet pas un plus petit cran : ta zone s\'étire. On retestera 42,5 kg quand tu feras 13 reps à 40 kg.');
    // Le « 13 » est la cible de l'étirement : écrit à la main jusqu'à la PR 7,
    // il passe maintenant par le formateur (`regle('cible')`). Plus rien.
    expect(T.verifierPhrases(p).map((x) => [x.cause, x.citation])).toEqual([]);
  });

  test('la borne d’une reprise, avec sa phrase', () => {
    const k = { etat: 'reprise_courte', zone: 'mix', palier: 52.5, niveau: 10, n: 3,
      ligne: { charge: 52.5, vise: 8 }, haut: null,
      fondement: { date: '2026-09-10T18:00:00+02:00', reps: [10, 10, 10], borneZone: { zone: 'mix', vise: 8 } } };
    const p = planDe(k);
    const x = p.exercices[0];
    expect(esp(x.entete.jaune[0])).toBe('52,5 kg × 8');
    expect(esp(x.entete.gris)).toBe('Reprise après une pause : ta charge de travail, sans rep de plus. Ta zone Mix va jusqu\'à 8 : je vise 8.');
    // La visée bornée est une ligne ; les deux « 8 » de la borne passent par
    // le formateur depuis la PR 1 de la consolidation (la feuille les dit
    // aussi) : la borne de la zone, une règle, égale à sa source.
    expect(T.verifierPhrases(p)).toEqual([]);
  });
});

// Le couché du 01/10 (section 4), joué aussi par le balayage.
const serie0110 = (kg, reps, role) => ({ charge_kg: kg, reps: reps, rpe: null, role: role || 'palier', origine: role || 'palier' });
const s0110 = (d, palier, l) => ({ debut: '2026-09-' + d + 'T18:00:00+00:00', palier: palier, neutre: false, series: l });
const COUCHE_0110 = {
  id: 'couche', avant: '2026-10-01T15:07:00+00:00', reglage: 'normal', equipement: 'haltere',
  seances: [s0110('17', 88, [serie0110(88, 10), serie0110(88, 10), serie0110(88, 10)]),
            s0110('20', 88, [serie0110(88, 10), serie0110(88, 10), serie0110(88, 11)]),
            s0110('23', 88, [serie0110(88, 11), serie0110(88, 11), serie0110(92, 11, 'exploration')]),
            s0110('26', 92, [serie0110(88, 10, 'rampe'), serie0110(92, 11), serie0110(92, 11)])],
  seanceDuJour: { series: [{ charge_kg: 92, reps: 10 }, { charge_kg: 92, reps: 9 }, { charge_kg: 92, reps: 9 }] }
};

// ── 3. LE BALAYAGE ───────────────────────────────────────────────────────────
//
// Les plans tirés des fichiers de cas : chaque consigne en séance, sous des
// gestes qui font parler le coach (le plan suivi, des montées acceptées, une
// série basse, une montée refusée), jusqu'au constat ; les réactions et les
// fantômes du simulateur ; l'escalier (semaine allégée, schéma, repli, série
// de plus). Chaque écart se note avec le cas qui l'a produit (`plan`).
const GESTES = [['plan', 'plan', 'plan', 'plan'], ['+3', 'accepte', 'plan', 'plan'],
  ['+5', 'accepte', 'accepte', 'plan'], ['+3', 'bas', 'plan', 'plan'], ['+3', 'refuse', 'plan', 'plan']];
const plusHeures = (iso, h) => new Date(new Date(iso).getTime() + h * 3600000).toISOString();
const CATALOGUE = (eq) => ({ x: { equipement: eq || 'barre', muscles_primaires: ['pectoraux'] } });

// Une séance d'un exercice `x`, rejouée geste par geste ; `vue(plan)` reçoit
// chaque plan calculé.
function seanceJouee(o, vue) {
  const { k, debut, gestes } = o;
  let n = 0;
  const id = () => 'x-s' + (++n);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'x', id, { series: o.series || 4 });
  const paris = [];
  // Une consigne du simulateur n'a pas de fondement : sa phrase grise ne se
  // rédige pas (et l'app n'en a jamais une telle).
  let libelles = null;
  if (!o.simulee) {
    try { libelles = M.libellesConsigne(k, debut); } catch (e) { libelles = null; }
  }
  const obj = Object.assign({ consigne: k, libelles, contexte: o.contexte || null }, o.extra || {});
  const entrees = () => {
    const travail = se.exercices[0].series.filter((s) => S.typeDe(s) === 'travail');
    let suites = {};
    if (o.suite && travail.every((s) => S.partEnBase(s))) suites = { x: o.suite(travail) };
    return Object.assign({ seance: { id: 'S', debut, edition: false, exercices: se.exercices },
      consignes: { x: obj }, reglage: o.reglage || 'normal', paris: paris.slice(), suites,
      catalogue: o.catalogue === undefined ? null : o.catalogue }, o.entrees || {});
  };
  const lire = () => { const p = T.planDeSeance(entrees()); vue(p); return p.exercices[0]; };
  (gestes || []).forEach((g, i) => {
    const x = lire();
    const l = x.lignes && x.lignes[i];
    if (!l || l.role === 'hors') return;
    const charge = l.charge === null || l.charge === undefined ? (nombreOu(k.palier, 20)) + 2.5 : l.charge;
    const vise = l.vise === null || l.vise === undefined ? (l.fourchette ? l.fourchette[0] : 5) : l.vise;
    const reps = Array.isArray(g) ? g[1] : g === '+3' ? vise + 3 : g === '+5' ? vise + 5 : g === 'bas' ? 1 : vise;
    const kg = Array.isArray(g) ? g[0] : g === 'refuse' ? charge - 2.5 : charge;
    se = S.modifierSerie(se, 0, i, { charge_kg: kg, reps: reps });
    se = S.valider(se, 0, i, new Date(plusHeures(debut, 0.5)));
    const y = T.planDeSeance(entrees()).exercices[0];
    const q = y.paris && y.paris[i];
    if (q) paris.push(Object.assign({}, q, { set_observe: se.exercices[0].series[i].id }));
  });
  lire();
}
function nombreOu(v, d) { return v === null || v === undefined || !isFinite(Number(v)) ? d : Number(v); }

// Les cas qui portent un historique : la consigne par la règle, la suite par
// la même fonction sur l'historique augmenté de la séance jouée.
function casHistorique(source, c, vue, extra) {
  const opts = { reglage: c.reglage, equipement: c.equipement, correction: c.correction || null };
  const k = M.consignePour(c.seances, c.avant, opts);
  const debut = c.avant;
  const suite = (travail) => {
    const tous = c.seances.concat(M.contratDe([{ seance: { debut }, series: travail }], null, 'charge_reps'));
    const apres = M.consignePour(tous, plusHeures(debut, 2), opts);
    return { consigne: apres, cranSuivant: apres.palier === null || apres.palier === undefined
      ? null : M.chargeVoisine(tous, plusHeures(debut, 2), apres.palier, c.equipement, 1) };
  };
  const lots = GESTES.slice();
  if (c.seanceDuJour) {
    lots.push(c.seanceDuJour.series.filter((s) => s.type_serie === undefined || s.type_serie === 'travail')
      .map((s) => [s.charge_kg, s.reps]));
  }
  lots.forEach((gestes) => {
    const n = Math.max(1, Math.min(6, (k && typeof k.n === 'number' && k.n) || gestes.length));
    seanceJouee({ k, debut, gestes: gestes.slice(0, n), series: n, reglage: c.reglage,
      contexte: M.contexteReaction(c.seances, c.avant, k, c.equipement, null), suite,
      catalogue: CATALOGUE(c.equipement), extra: extra ? extra(k) : null }, (p) => vue(source + ' ' + c.id, p));
  });
}

// La consigne du simulateur (`zone: { nom }`), sans historique.
const consigneSimulee = (k) => ({ etat: k.etat, zone: k.zone === null ? null : k.zone.nom, palier: k.palier,
  n: k.n, ligne: k.ligne, haut: k.haut });

function balayer() {
  const ecarts = [];
  const phrases = { toutes: 0, horsFormateur: new Set(), plans: 0 };
  // Les consignes du SIMULATEUR n'ont ni fondement ni niveau (l'app n'en
  // produit jamais de telles) : ni leur phrase grise ni les paragraphes de
  // leur feuille ne se rédigent — seules leurs lignes, leur réaction et leur
  // « Donc » se balaient.
  const vue = (plan, p, simulee) => {
    phrases.plans += 1;
    p.exercices.forEach((x) => { phrases.toutes += (x.phrases || []).length; });
    T.verifierPhrases(p).forEach((e) => {
      ecarts.push(Object.assign({ plan }, e));
      if (e.cause === 'hors_formateur') phrases.horsFormateur.add(plan + '|' + e.ou + '|' + e.phrase);
    });
  };
  const DEB = '2026-10-01T17:07:00+02:00';

  require('./fixtures/consigne-48b7.json').forEach((c) => casHistorique('consigne-48b7', c, vue));
  require('./fixtures/consigne-48b5a2.json').forEach((c) => casHistorique('consigne-48b5a2', c, vue));
  require('./fixtures/constat-48b6b.json').forEach((c) => casHistorique('constat-48b6b', c, vue));
  require('./fixtures/cas-49u8-sans-palier.json').cas.forEach((c) => casHistorique('cas-49u8', c, vue));
  require('./fixtures/cas-49u12-chute.json').cas.forEach((c) => casHistorique('cas-49u12', c, vue));
  require('./fixtures/cas-49u18-correctifs.json').cas.forEach((c) => casHistorique('cas-49u18', c, vue));
  require('./fixtures/cas-49u13-compteur.json').cas.forEach((c) => casHistorique('cas-49u13', c, vue, () => {
    const r = M.compteurDe(c.seances, c.avant, { reglage: c.reglage, equipement: c.equipement, correction: null, toutes: true });
    return { compteur: { compteur: r.compteur, meilleur: r.meilleur, blocages: c.blocages_termines || [] } };
  }));

  // Le simulateur : réactions (55), fantômes (45), reprises (9).
  const simules = [['reaction-49r1', require('./fixtures/reaction-49r1.json').reaction],
    ['cas-49u2', require('./fixtures/cas-49u2-fantome.json').cas],
    ['cas-49u5', require('./fixtures/cas-49u5-reprise.json').cas]];
  simules.forEach(([source, liste]) => liste.forEach((c) => {
    const k = consigneSimulee(c.consigne);
    const faites = (c.faites || []).map((f) => [f.charge, f.reps]);
    seanceJouee({ k, debut: DEB, gestes: faites, series: c.series || faites.length || k.n || 1,
      contexte: c.contexte || null, simulee: true }, (p) => vue(source + ' ' + c.id, p, true));
  }));

  // La séance du 01/10 (le décor de la section 4), sur l'état actuel.
  plansDu0110().plans.forEach((p) => vue('seance-0110 couché', p));

  // L'escalier. La semaine allégée : chaque consigne du fichier, pendant une
  // période acceptée le jour même.
  const ESC = require('./fixtures/cas-49u14-semaine-allegee.json');
  ESC.consigne_allegee.forEach((c) => {
    const kk = c.consigne;
    const k = { etat: kk.etat, zone: kk.zone[0], palier: kk.ligne[0], niveau: kk.ligne[1], n: c.series_routine,
      ligne: { charge: kk.ligne[0], vise: kk.ligne[1] },
      haut: kk.haut ? { charge: kk.haut[0], vise: kk.haut[1], k: kk.haut[2] } : null, fondement: {} };
    const jour = '2026-10-01';
    seanceJouee({ k, debut: DEB, gestes: [], series: c.series_routine,
      extra: { compteur: { compteur: 4, meilleur: { palier: kk.ligne[0], niveau: kk.ligne[1] }, blocages: [] } },
      entrees: { escalier: { cartes: [{ seance: 'S0', jour, declencheur: 'x', compteur: 4, reponse: 'acceptee',
        debut: jour, fin: M.finAllegee(jour) }], compteurs: [], noms: { x: 'X' }, seriesRoutine: { x: c.series_routine } } } },
    (p) => vue('cas-49u14 ' + c.id, p));
  });
  // Le blocage isolé : les cartes de schéma, et les replis trouvés.
  const ISO = require('./fixtures/cas-49u15-blocage-isole.json');
  const escalierIsole = (compteur, meilleur, zone, repli, entreesEnPlus) => ({
    extra: { compteur: { compteur, meilleur, blocages: [] }, repli: repli || null },
    entrees: Object.assign({ phase: 'maintien',
      escalier: { cartes: [], compteurs: [], noms: {}, seriesRoutine: { x: 3 }, marches: [] } }, entreesEnPlus || {}) });
  ISO.schema.forEach((c) => {
    const m = { palier: c.meilleur[0], niveau: c.meilleur[1] };
    const k = { etat: 'progression', zone: c.zone, palier: m.palier, niveau: m.niveau, n: 3,
      ligne: { charge: m.palier, vise: m.niveau + 1 }, haut: null, fondement: {} };
    seanceJouee(Object.assign({ k, debut: DEB, gestes: [], series: 3 }, escalierIsole(c.compteur, m, c.zone)),
      (p) => vue('cas-49u15 ' + c.id, p));
  });
  ISO.repli.filter((c) => c.attendu).forEach((c) => {
    const m = { palier: c.meilleur[0], niveau: c.meilleur[1] };
    const r = M.repliEscalier(c.seances, c.avant, m, c.zone);
    const k = { etat: 'progression', zone: c.zone, palier: m.palier, niveau: m.niveau, n: 3,
      ligne: { charge: m.palier, vise: m.niveau }, haut: null, fondement: {} };
    seanceJouee(Object.assign({ k, debut: c.avant, gestes: [], series: 3 }, escalierIsole(8, m, c.zone, r)),
      (p) => vue('cas-49u15 ' + c.id, p));
  });
  // La série de plus : les quatre cartes.
  require('./fixtures/cas-49u17-serie-de-plus.json').carte.forEach((c, i) => {
    const m = { palier: c.meilleur[0], niveau: c.meilleur[1] };
    const k = { etat: 'progression', zone: 'volume', palier: m.palier, niveau: m.niveau, n: 3,
      ligne: { charge: m.palier, vise: m.niveau }, haut: null, fondement: {} };
    const place = {};
    c.muscles.forEach((mu) => { place[mu] = { place: true, moyenne: 8, seuil: 10, fenetres: 12 }; });
    seanceJouee(Object.assign({ k, debut: DEB, gestes: [], series: 3,
      catalogue: { x: { equipement: 'machine', muscles_primaires: c.muscles } } },
      escalierIsole(c.compteur, m, 'volume', null, { volume: place })), (p) => vue('cas-49u17 carte ' + (i + 1), p));
  });
  return { ecarts, phrases };
}

describe('I26 — le balayage des plans des fichiers de cas : aucun écart', () => {
  const { ecarts, phrases } = balayer();
  // Une ligne par écart, lisible dans le message d'échec.
  const lus = ecarts.map((e) => [e.plan, e.exercice || '', e.ou, e.cause, String(e.citation), e.attendu, e.phrase].join(' ¦ '));

  test('le balayage voit des plans, des phrases, et les familles qui parlent', () => {
    expect(phrases.plans).toBeGreaterThan(2000);
    expect(phrases.toutes).toBeGreaterThan(10000);
  });

  test('⚠️ AUCUN ÉCART : chaque chiffre a sa source, aucun n’est écrit à la main', () => {
    expect(lus.slice(0, 10)).toEqual([]);
    expect(phrases.horsFormateur.size).toBe(0);
  });
});

// ── 4. LA SÉANCE DU 01/10, AVANT ET APRÈS #350 ──────────────────────────────
//
// Le couché aux haltères du 01/10 (le décor de `v2-correctifs-0110` : une
// montée 88, 92, 92 le 26/09, puis « rejoint » à 92 × 11 ; le jour, 92 × 10,
// 9, 9). L'ÉTAT D'AVANT #350 est reproduit par un DÉCOR : le plan d'aujourd'hui,
// dont les trois phrases fautives reprennent le texte d'alors (tableau de
// #349, lignes 4 et 8 ; et le « × null » trouvé au rejeu pendant #350), avec
// ce que le formateur en déclare. La garde doit les retrouver ; sur l'état
// actuel, aucun écart.
//
// ⚠️ CE QUE LA GARDE NE VOIT PAS, ET C'EST VOULU (§20 bis : les chiffres) :
// les lignes 1, 2, 9 du tableau sont des RÈGLES (une visée hors zone, une
// cible qui change sans raison dite, un cran de +0,2 kg) ; 3 et 7 des
// OMISSIONS (une chauffe faite, une série ignorée) ; 5 et 6 la couverture et
// une étiquette. Chacune a son correctif et son test dans #350.
function plansDu0110() {
  const plans = [];
  const k = M.consignePour(COUCHE_0110.seances, COUCHE_0110.avant, { reglage: 'normal', equipement: 'haltere', correction: null });
  const debut = COUCHE_0110.avant;
  const suite = (travail) => {
    const tous = COUCHE_0110.seances.concat(M.contratDe([{ seance: { debut }, series: travail }], null, 'charge_reps'));
    const apres = M.consignePour(tous, plusHeures(debut, 2), { reglage: 'normal', equipement: 'haltere', correction: null });
    return { consigne: apres, cranSuivant: M.chargeVoisine(tous, plusHeures(debut, 2), apres.palier, 'haltere', 1) };
  };
  seanceJouee({ k, debut, gestes: [[92, 10], [92, 9], [92, 9]], series: 3, suite,
    contexte: M.contexteReaction(COUCHE_0110.seances, COUCHE_0110.avant, k, 'haltere', null) }, (p) => plans.push(p));
  return { k, plans };
}

describe('49-U19 — la séance du 01/10 : la garde retrouve les phrases d’avant #350', () => {
  const { k, plans } = plansDu0110();
  const fin = plans[plans.length - 1];
  const x = fin.exercices[0];
  const Q = (nature, objet, v, texte) => Object.assign({ nature, objet, texte }, v);
  const K = (kg, reps) => kg + NB + 'kg' + (reps ? NB + '×' + NB + reps : '');

  test('prémisse : le décor est le couché du 01/10 — « rejoint » à 92 × 11, le jour 92 × 10, 9, 9', () => {
    expect(k.etat).toBe('rejoint');
    expect(esp(x.entete.jaune.join(' / '))).toBe('92 kg × 11');
    expect(esp(x.entete.gris)).toBe('Ta première série à 88 kg passe à 92 kg.');
    expect(esp(x.constat.verdict)).toBe('Pas encore : 92 kg × 10, 9, 9.');
    expect(esp(x.constat.suite)).toBe('Prochaine séance : 92 kg × 10.');
  });

  test('ÉTAT ACTUEL : aucun écart, et `verifierPlan` passe', () => {
    plans.forEach((p) => expect(T.verifierPhrases(p)).toEqual([]));
    plans.forEach((p) => expect(T.verifierPlan(p).ok).toBe(true));
  });

  test('ÉTAT D’AVANT #350 (décor) : « dernière » sur une montée, « Même cible : 92 kg × 10 », « × null »', () => {
    const avant = JSON.parse(JSON.stringify(fin));
    const ph = avant.exercices[0].phrases;
    const ou = (o) => ph.filter((p) => p.ou === o)[0];
    // Ligne 4 du tableau de #349 : le mot d'ordre écrit d'office.
    Object.assign(ou('entete.gris'), { texte: 'Ta dernière série à ' + K(88) + ' passe à ' + K(92) + '.',
      citations: [Q('fait_passe', { quoi: 'reste', ordre: 'dernière' }, { charge: 88 }, K(88)),
                  Q('cible_du_jour', { role: 'haut' }, { charge: 92 }, K(92))] });
    // Ligne 8 : « Même cible » décidé sans comparer la cible.
    Object.assign(ou('constat'), { texte: 'Pas encore' + NB + ': ' + K(92, '10, 9, 9') + '. Même cible la prochaine fois' + NB + ': ' + K(92, 10) + '.',
      citations: [Q('fait_passe', { quoi: 'du_jour' }, { charge: 92, reps: [10, 9, 9] }, K(92, '10, 9, 9')),
                  Q('cible_du_jour', { role: 'ligne' }, { charge: 92, reps: [10] }, K(92, 10))] });
    // Pendant #350 : la ligne couverte sans sa source, « × null ».
    Object.assign(ou('entete.jaune'), { texte: 'Le cran au-dessus' + NB + '×' + NB + 'null sur une série, puis ' + K(92, 11) + ' sur 2 séries',
      citations: [Q('cible_du_jour', { role: 'ligne' }, { charge: null, reps: [null] }, 'Le cran au-dessus' + NB + '×' + NB),
                  Q('cible_du_jour', { role: 'haut' }, { charge: 92, reps: [11] }, K(92, 11))] });
    const e = T.verifierPhrases(avant);
    expect(e.map((q) => q.ou + ' · ' + q.cause).sort()).toEqual([
      'constat · cible_hors_lignes',
      'entete.gris · mot_ordre',
      'entete.jaune · hors_formateur',
      'entete.jaune · mot_interdit',
      'entete.jaune · valeur_nulle'
    ]);
    expect(e.filter((q) => q.cause === 'mot_ordre')[0].attendu).toBe('rang 1 sur 3');
    // Et ces trois phrases ne déclenchent AUCUN des invariants I1 à I25 : c'est
    // pour elles que I26 existe — et elle est bloquante (PR 7).
    const v = T.verifierPlan(avant);
    expect(v.ok).toBe(false);
    expect(v.erreurs.filter((x) => x.indexOf('I26 — ') !== 0)).toEqual([]);
    expect(v.erreurs).toHaveLength(e.length);
  });
});

// ── 5. PR 7 DE LA CONSOLIDATION — LES DERNIERS ÉCARTS, TRANCHÉS ─────────────
//
// Chacun de ces cas était dans la liste d'attente ; la liste s'est vidée et
// I26 est bloquante. Chaque test fait revenir l'écart si le correctif part.
describe('PR 7 — les derniers écarts de la liste d’attente, tranchés', () => {
  test('une série FAITE sans charge se dit « 3 reps », jamais par le repli du coach', () => {
    expect(Modele.serieFaite(null, 3)).toBe('3 reps');
    expect(Modele.serieFaite(null, 1)).toBe('1 rep');
    expect(esp(Modele.serieFaite(62.5, 5))).toBe('62,5 kg × 5');
    const p = planDe(K92, { faites: [[92, 11], [92, 11], [null, 3]] });
    const f = p.exercices[0].pourquoi.lignes.map((l) => esp(l.faite));
    expect(f[2]).toBe('faite : 3 reps');
    expect(T.verifierPhrases(p)).toEqual([]);
  });

  test('le bandeau et la carte de la semaine allégée : chaque chiffre par le formateur', () => {
    const noms = ['A', 'B', 'C', 'D', 'E'];
    const juste = { exercices: [], allegee: { fin: '2026-10-07', bandeau: M.bandeauAllegee('2026-10-07') },
      carte: { cites: noms, phrase: M.phraseCarte(noms), detail: M.detailCarte() } };
    expect(esp(juste.allegee.bandeau)).toMatch(/^Semaine allégée jusqu’au 7 oct\. : /);
    expect(juste.carte.phrase).toBe('A, B, C et 2 autres exercices : aucun n\'a progressé depuis 4 séances.');
    expect(M.detailCarte()).toBe(M.DETAIL_CARTE);
    expect(T.verifierPhrases(juste)).toEqual([]);
    // Un bandeau dont la date n'est pas celle de la fin, un détail retouché :
    // la capture refaite ne redonne pas le texte, la garde le dit.
    const faux = JSON.parse(JSON.stringify(juste));
    faux.allegee.bandeau = faux.allegee.bandeau.replace('7 oct.', '8 oct.');
    faux.carte.detail = faux.carte.detail.replace('60 %', '50 %');
    expect(T.verifierPhrases(faux).map((e) => e.ou + ' · ' + e.cause)).toEqual(
      ['allegee.bandeau · sans_citations', 'carte.detail · sans_citations']);
  });

  test('pendant un étirement, le test d’une séance ANTÉRIEURE ne se raconte pas comme celui du jour', () => {
    const z = ['series_longues', 15, 20];
    const avant = { etat: 'etirement', zone: z[0], palier: 59, niveau: 15, n: 3, ligne: { charge: 59, vise: 16 }, haut: null,
      fondement: { date: '2026-03-06T17:15:00+00:00', reps: [15, 15, 15] } };
    const test = { charge: 66, reps: 12, niveau: 12, date: '2026-01-02T19:24:00+00:00' };
    const apres = { etat: 'etirement', zone: z[0], palier: 59, niveau: 16, n: 3, ligne: { charge: 59, vise: 17 }, haut: null,
      fondement: { date: '2026-03-13T17:15:00+00:00', reps: [16, 16, 16], test, cible: 23 } };
    const ref = '2026-03-13T18:00:00+00:00';
    const v = esp(M.constatDe(avant, apres, 'normal', null, ref).verdict);
    expect(v).toBe('59 kg : 15 reps le 6 mars, 16 aujourd\'hui.');
    // Le test DU JOUR, lui, se raconte toujours.
    const duJour = JSON.parse(JSON.stringify(apres));
    duJour.fondement.test.date = duJour.fondement.date;
    expect(esp(M.constatDe(avant, duJour, 'normal', null, ref).verdict)).toBe('66 kg × 12 : pas encore dans ta zone.');
  });

  test('un exercice sans aucune série : ses phrases disent la consigne, la garde la lit', () => {
    const k = { etat: 'attend', zone: 'volume', palier: 100, niveau: 10, n: 2,
      ligne: { charge: 95, vise: 12 }, haut: { charge: 100, vise: 11, k: 1 },
      fondement: { date: '2026-09-25T18:00:00+02:00', reps: [10] } };
    const p = JSON.parse(JSON.stringify(planDe(k)));
    const x = p.exercices[0];
    x.lignes = []; x.planInitial = [];
    x.phrases = [{ ou: 'entete.gris', texte: 'Passe à 100' + NB + 'kg.',
      citations: [Q('cible_du_jour', { role: 'haut' }, { charge: 100 }, '100' + NB + 'kg')] }];
    expect(T.verifierPhrases(p)).toEqual([]);
    x.phrases[0].citations[0].charge = 105;
    x.phrases[0].citations[0].texte = '105' + NB + 'kg';
    x.phrases[0].texte = 'Passe à 105' + NB + 'kg.';
    expect(T.verifierPhrases(p).map((e) => e.cause)).toEqual(['cible_hors_lignes']);
  });
});
