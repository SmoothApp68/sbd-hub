/** @jest-environment node */
//
// 113 — AU PLAFOND DE LA SALLE, LE COACH PROPOSE (MOTEUR §10 bis, décidé par Aurélien le 16/10/2026 : « c'est le
// coach qui décide du programme, donc c'est aussi à lui de suggérer une série de plus ou de moins, toutes les modifs
// possibles »). Remplace « Tant que l'exercice est à la plus lourde de sa salle, l'escalier ne propose rien » ; révise
// I47.
//
// « Au plafond de la salle (la plus lourde de la salle, au haut de la fourchette), l'escalier propose, une marche par
// déclenchement, dans cet ordre : 1. la série de plus (§14.7), dans la limite de la règle de volume du §14.6 ; 2. la
// dégressive (§14.8) ; 3. un autre exercice de la même famille, qui permet de charger plus dans la salle déclarée ;
// 4. au-delà, le coach maintient. Le changement de schéma et le repli ne sont jamais proposés au plafond. Une marche
// sans objet est sautée. »
//
// Le cas : le curl EZ d'Aurélien (Basic-Fit), barres EZ et droites de 10 à 30 kg, haltères jusqu'à 40 kg de 2 en 2 ;
// 30 kg × 15 sur toutes ses séries, séance après séance.

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
const esp = (t) => String(t || '').replace(/[  ]/g, ' ');
const SLUG = 'curl_biceps_barre_ez';
const SALLE_AUREL = { barres_ez: [10, 15, 20, 25, 30], barres_droites: [10, 15, 20, 25, 30], halteres: { max: 40, pas: 2 } };
const INDEX = {
  curl_biceps_barre_ez: { slug: SLUG, nom: 'Curl Biceps (Barre EZ)', equipement: 'barre', mouvement: 'curl',
    mesure: 'charge_reps', muscles_primaires: ['biceps'], muscles_secondaires: ['avant_bras'], muscles_stabilisateurs: [] },
  curl_biceps_barre: { slug: 'curl_biceps_barre', nom: 'Curl Biceps (Barre)', equipement: 'barre', mouvement: 'curl',
    mesure: 'charge_reps', muscles_primaires: ['biceps'], muscles_secondaires: ['avant_bras'] },
  curl_biceps_haltere: { slug: 'curl_biceps_haltere', nom: 'Curl Biceps (Haltère)', equipement: 'haltere', mouvement: 'curl',
    mesure: 'charge_reps', muscles_primaires: ['biceps'], muscles_secondaires: ['avant_bras'] },
  curl_poulie: { slug: 'curl_poulie', nom: 'Curl à la poulie', equipement: 'poulie', mouvement: 'curl',
    mesure: 'charge_reps', muscles_primaires: ['biceps'], muscles_secondaires: [] }
};
const salleDe = (slug, salle) => Profil.salleDeLExercice({ ma_salle: salle === undefined ? SALLE_AUREL : salle }, slug, INDEX);
const O = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false };
let nId = 0;
const brute = (kg, reps, type) => ({ id: 'i' + (++nId), rang: nId, charge_kg: kg, reps: reps, rpe: null, ressenti: null,
  type_serie: type || 'travail', exercise_slug: SLUG });
const jour = (md) => '2026-' + md + 'T18:00:00+00:00';
const AVANT = jour('10-14');
const FIN = '2026-11-05T10:00:00+00:00';

// L'historique réel : 25, 27,5 (une autre salle), 30 × 10 puis 12, et le coach qui fait monter les reps à 30 kg.
function historique(salle) {
  let hist = [
    { seance: { id: 'S4', debut: jour('10-10') }, series: [brute(30, 12), brute(30, 12), brute(30, 12)] },
    { seance: { id: 'S3', debut: jour('10-06') }, series: [brute(30, 10), brute(30, 10), brute(30, 10)] },
    { seance: { id: 'S2', debut: jour('10-02') }, series: [brute(27.5, 12), brute(27.5, 12), brute(27.5, 12)] },
    { seance: { id: 'S1', debut: jour('09-28') }, series: [brute(25, 12), brute(25, 12), brute(25, 12)] }
  ];
  for (let i = 0; i < 5; i++) {
    const avant = new Date(Date.parse(AVANT) + 4 * i * 864e5).toISOString();
    const c = M.consigneDExercice(hist, undefined, avant, Object.assign({ salle: salle }, O)).consigne;
    hist = [{ seance: { id: 'T' + i, debut: avant }, series: [1, 2, 3].map(() => brute(c.ligne.charge, c.ligne.vise)) }].concat(hist);
  }
  return hist;
}
// La consigne AU PLAFOND (30 kg × 15), son compteur à `k`.
function auPlafond(k, o) {
  const opt = o || {};
  const salle = opt.sansSalle ? null : salleDe(SLUG);
  const c = M.consigneDExercice(historique(salleDe(SLUG)), undefined, FIN, Object.assign({ salle: salle }, O));
  c.compteur = { compteur: k, meilleur: { palier: 30, niveau: 15 }, blocages: [] };
  if (opt.zone) c.consigne = Object.assign({}, c.consigne, { zone: opt.zone });
  if (opt.repli) c.repli = { palier: 25, niveau: 15, debut: '2026-10-20T10:00:00+00:00', reps: [15, 15, 15], ligne: [25, 15] };
  return c;
}
function seanceDe(n) {
  let k = 0;
  const id = () => 's' + (++k);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  return S.ajouterExercice(se, SLUG, id, { series: n || 3 });
}
// Les frères dans l'ordre de « Remplacer » (l'app les donne) : la barre droite d'abord (déjà faite), puis les haltères.
function remplacants(o) {
  const opt = o || {};
  const fr = (slug, extra) => Object.assign({ slug, nom: INDEX[slug].nom, mesure: 'charge_reps', salle: salleDe(slug),
    ecarte: false, hors: false, deja: false }, extra || {});
  if (opt.liste) return opt.liste.map((s) => fr(s));
  return [fr('curl_biceps_barre'), fr('curl_biceps_haltere', opt.haltere || {})];
}
const marche = (mk, reponse, compteur, extra) => Object.assign({ id: null, seance: 'P' + compteur + mk, jour: '2026-11-0' + (compteur / 4),
  exercice: SLUG, marche: mk, reponse, compteur, debut: '2026-11-0' + (compteur / 4) + 'T10:00:00+00:00', n: 3 }, extra || {});
function entrees(c, o) {
  const opt = o || {};
  const se = seanceDe(3);
  return {
    seance: { id: 'S1', debut: FIN, edition: false, exercices: se.exercices },
    consignes: { [SLUG]: c },
    catalogue: { [SLUG]: { equipement: 'barre', nom: 'Curl Biceps (Barre EZ)', muscles_primaires: ['biceps'],
      muscles_secondaires: ['avant_bras'], muscles_stabilisateurs: [], mesure: 'charge_reps',
      salle: opt.sansSalle ? null : salleDe(SLUG) } },
    reglage: 'normal', paris: [], suites: {},
    phase: opt.phase || 'maintien',
    debutant: opt.debutant === true,
    volume: { biceps: { place: opt.place === false ? false : true, moyenne: 8, seuil: 10, fenetres: 12 } },
    escalier: { cartes: [], compteurs: opt.compteurs || [], noms: {}, seriesRoutine: { [SLUG]: 3 },
                marches: opt.marches || [], remplacants: opt.sansFreres ? {} : { [SLUG]: remplacants(opt) } }
  };
}
const plan = (c, o) => { const e = entrees(c, o); const p = T.planDeSeance(e); return { e, p, x: p.exercices[0] }; };
const PHRASE = (k) => '30 kg × 15 depuis ' + k + ' séances, et ta salle n\'a pas plus lourd.';

// ═══ 1. LE MOTEUR ════════════════════════════════════════════════════════════
describe('§10 bis (113) — le moteur : au plafond, la marche du déclenchement, le frère plus chargeable', () => {
  test('« au plafond » : la plus lourde de la salle ET le haut de la fourchette (le maintien) ; sous le haut, non', () => {
    const c = auPlafond(4);
    expect(c.consigne.fondement.salle).toMatchObject({ max: 30, plafond: 15, maintien: true });
    expect(M.auPlafondDeLaSalle(c.consigne, c.salle)).toBe(true);
    expect(M.plafondDeLaConsigne(c.consigne, c.salle)).toEqual({ charge: 30, reps: 15 });
    // À la plus lourde, sous le haut (on monte en reps) : à la plus lourde, mais pas au plafond.
    const sous = M.consigneDExercice(historique(salleDe(SLUG)).slice(3), undefined, AVANT, Object.assign({ salle: salleDe(SLUG) }, O));
    expect(M.aLaPlusLourdeDeLaSalle(sous.consigne, sous.salle)).toBe(true);
    expect(M.auPlafondDeLaSalle(sous.consigne, sous.salle)).toBe(false);
    // Sans salle : jamais.
    expect(M.auPlafondDeLaSalle(c.consigne, null)).toBe(false);
  });

  test('l’ordre : une marche par déclenchement, la première après la dernière proposée, qui a un objet', () => {
    const tout = { serie_de_plus: true, degressive: true, remplacement: true };
    const p = (mk, k) => ({ marche: mk, compteur: k });
    expect(M.marcheAuPlafond(4, {}, tout)).toEqual({ marche: 'serie_de_plus', deja: null });
    expect(M.marcheAuPlafond(8, { serie_de_plus: p('serie_de_plus', 4) }, tout).marche).toBe('degressive');
    expect(M.marcheAuPlafond(12, { serie_de_plus: p('serie_de_plus', 4), degressive: p('degressive', 8) }, tout).marche)
      .toBe('remplacement');
    expect(M.marcheAuPlafond(16, { serie_de_plus: p('serie_de_plus', 4), degressive: p('degressive', 8),
      remplacement: p('remplacement', 12) }, tout)).toBeNull();
    // Sautée : sans place, la dégressive dès le premier déclenchement ; la série de plus ne revient plus ensuite.
    expect(M.marcheAuPlafond(4, {}, { serie_de_plus: false, degressive: true, remplacement: true }).marche).toBe('degressive');
    expect(M.marcheAuPlafond(8, { degressive: p('degressive', 4) }, tout).marche).toBe('remplacement');
    // Rien qui ait un objet : le maintien.
    expect(M.marcheAuPlafond(4, {}, { serie_de_plus: false, degressive: false, remplacement: false })).toBeNull();
    // Au même déclenchement : la marche proposée, avec son pari ; hors déclenchement : rien.
    const d = M.marcheAuPlafond(4, { serie_de_plus: p('serie_de_plus', 4) }, tout);
    expect(d.marche).toBe('serie_de_plus');
    expect(d.deja).toEqual(p('serie_de_plus', 4));
    expect(M.marcheAuPlafond(5, {}, tout)).toBeNull();
    expect(M.marcheAuPlafond(3, {}, tout)).toBeNull();
  });

  test('« plus chargeable dans la salle déclarée » : haltères jusqu’à 2 × 40 oui, barre droite de 30 non, poulie (non déclarée) oui', () => {
    const fr = (slug, salle) => ({ slug, mesure: 'charge_reps', salle: salleDe(slug, salle) });
    expect(M.plusChargeableALaSalle(fr('curl_biceps_haltere'), 30)).toBe(true);
    expect(M.plusChargeableALaSalle(fr('curl_biceps_barre'), 30)).toBe(false);
    expect(M.plusChargeableALaSalle(fr('curl_poulie'), 30)).toBe(true);
    // Haltères déclarés jusqu'à 14 kg : la paire va jusqu'à 28, sous 30.
    expect(M.plusChargeableALaSalle(fr('curl_biceps_haltere', { halteres: { max: 14, pas: 2 } }), 30)).toBe(false);
    // Un exercice qui ne se charge pas : jamais.
    expect(M.plusChargeableALaSalle({ slug: 'x', mesure: 'reps', salle: null }, 30)).toBe(false);
    // Le remplaçant : le premier, dans l'ordre donné, qui n'est ni écarté, ni hors matériel, ni déjà là.
    const l = remplacants();
    expect(M.remplacantAuPlafond(l, 30).slug).toBe('curl_biceps_haltere');
    expect(M.remplacantAuPlafond(remplacants({ haltere: { ecarte: true } }), 30)).toBeNull();
    expect(M.remplacantAuPlafond(remplacants({ haltere: { hors: true } }), 30)).toBeNull();
    expect(M.remplacantAuPlafond(remplacants({ haltere: { deja: true } }), 30)).toBeNull();
  });

  test('le détail du remplacement : « Curl Biceps (Haltère) : ta salle va jusqu’à 2 × 40 kg. » ; non déclaré, aucune limite', () => {
    expect(M.detailRemplacement({ slug: 'curl_biceps_haltere', nom: 'Curl Biceps (Haltère)', salle: salleDe('curl_biceps_haltere') }))
      .toBe('Curl Biceps (Haltère)' + NB + ': ta salle va jusqu\'à 2' + NB + '×' + NB + '40' + NB + 'kg.');
    expect(M.detailRemplacement({ slug: 'curl_poulie', nom: 'Curl à la poulie', salle: null }))
      .toBe('Curl à la poulie' + NB + ': aucune limite déclarée dans ta salle.');
  });
});

// ═══ 2. LE PLAN : LES QUATRE MARCHES ═══════════════════════════════════════
describe('§10 bis (113) — le curl EZ au plafond : la série de plus, puis la dégressive, puis le curl aux haltères, puis le maintien', () => {
  test('DISCRIMINANT — 1er déclenchement : la série de plus, sa première phrase au plafond ; I47 vert', () => {
    const { e, p, x } = plan(auPlafond(4));
    expect(x.escalier.marche).toBe('serie_de_plus');
    expect(x.escalier.plafond).toEqual({ charge: 30, reps: 15 });
    expect(esp(x.escalier.carte.phrase)).toBe(PHRASE(4) + ' Une série de plus ?');
    expect(x.escalier.carte.detail).toBe('Sur cet exercice, une série de plus aide souvent : environ 20 % de travail en plus. ' +
      'Tes biceps restent sous leur volume habituel.');
    expect([x.escalier.carte.oui, x.escalier.carte.non]).toEqual(['Ajouter une série', 'Non merci']);
    // La carte parle à la place du compteur ; aucune ligne n'est ajoutée avant la réponse.
    expect(x.entete.compteur).toBeNull();
    expect(T.lignesAAjouter(p)).toEqual([]);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('acceptée : la ligne en plus revient à la séance suivante (compteur 5), sans carte', () => {
    const { e, p, x } = plan(auPlafond(5), { marches: [marche('serie_de_plus', 'acceptee', 4)] });
    expect(x.escalier).toBeNull();
    expect(x.consigne.serieDePlus).toEqual({ routine: 3 });
    expect(T.lignesAAjouter(p)).toEqual([0]);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('répondue dans cette séance : la marche reste, avec sa réponse, sans carte', () => {
    const ici = marche('serie_de_plus', 'refusee', 4, { seance: 'S1', jour: '2026-11-05' });
    const { x } = plan(auPlafond(4), { marches: [ici] });
    expect(x.escalier.marche).toBe('serie_de_plus');
    expect(x.escalier.reponse).toBe('refusee');
    expect(x.escalier.carte).toBeUndefined();
  });

  ['acceptee', 'refusee'].forEach((r) => {
    test('DISCRIMINANT — 2e déclenchement, la série de plus ' + r + ' : la dégressive', () => {
      const { e, p, x } = plan(auPlafond(8), { marches: [marche('serie_de_plus', r, 4)] });
      expect(x.escalier.marche).toBe('degressive');
      expect(esp(x.escalier.carte.phrase)).toBe(PHRASE(8) + ' Une dégressive après ta dernière série ?');
      expect(x.escalier.carte.detail).toBe('−20 à 25 %, sans repos, jusqu\'à l\'échec. La même croissance en moins de temps (Sødal et al. 2023).');
      expect([x.escalier.carte.oui, x.escalier.carte.non]).toEqual(['Ajouter une dégressive', 'Non merci']);
      expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    });

    test('DISCRIMINANT — 3e déclenchement, la dégressive ' + r + ' : le curl aux haltères (la barre droite de 30 ne se charge pas plus)', () => {
      const { e, p, x } = plan(auPlafond(12), { marches: [marche('serie_de_plus', 'refusee', 4), marche('degressive', r, 8)] });
      expect(x.escalier.marche).toBe('remplacement');
      expect(esp(x.escalier.carte.phrase)).toBe(PHRASE(12) + ' Passer à Curl Biceps (Haltère) ?');
      expect(esp(x.escalier.carte.detail)).toBe('Curl Biceps (Haltère) : ta salle va jusqu\'à 2 × 40 kg.');
      expect([x.escalier.carte.oui, x.escalier.carte.non]).toEqual(['Changer d\'exercice', 'Non merci']);
      expect(x.escalier.carte.vers).toBe('curl_biceps_haltere');
      expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    });
  });

  test('DISCRIMINANT — 4e déclenchement, le remplacement refusé : le coach maintient (aucune marche, la phrase reste un fait)', () => {
    const { e, p, x } = plan(auPlafond(16), { marches: [marche('serie_de_plus', 'refusee', 4), marche('degressive', 'refusee', 8),
      marche('remplacement', 'refusee', 12)] });
    expect(x.escalier).toBeNull();
    expect(x.consigne.repli).toBeUndefined();
    expect(esp(x.entete.gris)).toBe('30 kg × 15, la plus lourde de ta salle.');
    expect(esp(x.entete.compteur)).toMatch(/^30 kg × 15 reste ta meilleure charge de travail depuis 16 séances/);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    // Et plus loin, toujours rien (20).
    expect(plan(auPlafond(20), { marches: [marche('serie_de_plus', 'refusee', 4), marche('degressive', 'refusee', 8),
      marche('remplacement', 'refusee', 12)] }).x.escalier).toBeNull();
  });

  test('DISCRIMINANT — jamais le repli au plafond, même avec un repli possible et aucune autre marche qui ait un objet', () => {
    // Sans place, sans frère, débutant (pas de dégressive) : aucune marche n'a d'objet — le maintien, pas le repli.
    const o = { place: false, sansFreres: true, debutant: true };
    const { e, p, x } = plan(auPlafond(4, { repli: true }), o);
    expect(x.escalier).toBeNull();
    expect(x.consigne.repli).toBeUndefined();
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    expect(plan(auPlafond(8, { repli: true }), Object.assign({ marches: [marche('serie_de_plus', 'refusee', 4)] }, o)).x.escalier).toBeNull();
    // Prémisse : sans la salle, ce même compteur et ce repli donnent le repli tout de suite (§14.5, pas de place).
    const sans = plan(auPlafond(4, { repli: true, sansSalle: true }), Object.assign({ sansSalle: true }, o));
    expect(sans.x.escalier.marche).toBe('repli');
    expect(sans.x.consigne.repli).toBeDefined();
  });

  test('DISCRIMINANT — jamais le changement de schéma : en zone Lourd au plafond, le remplacement (ni série de plus ni dégressive en force)', () => {
    const { e, p, x } = plan(auPlafond(4, { zone: 'lourd' }));
    expect(x.escalier.marche).toBe('remplacement');
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    // Prémisse : sans la salle, la zone Lourd propose le schéma.
    expect(plan(auPlafond(4, { zone: 'lourd', sansSalle: true }), { sansSalle: true }).x.escalier.marche).toBe('schema');
  });
});

// ═══ 3. LES MARCHES SAUTÉES ═══════════════════════════════════════════════
describe('§10 bis (113) — une marche sans objet est sautée', () => {
  test('DISCRIMINANT — sans place de volume : la dégressive dès le 1er déclenchement, puis le remplacement ; la série de plus ne revient pas', () => {
    const a = plan(auPlafond(4), { place: false });
    expect(a.x.escalier.marche).toBe('degressive');
    expect(esp(a.x.escalier.carte.phrase)).toBe(PHRASE(4) + ' Une dégressive après ta dernière série ?');
    expect(T.verifierPlan(a.p, a.e).erreurs).toEqual([]);
    // Au déclenchement suivant, même avec de la place revenue : le remplacement.
    const b = plan(auPlafond(8), { marches: [marche('degressive', 'refusee', 4)] });
    expect(b.x.escalier.marche).toBe('remplacement');
    expect(T.verifierPlan(b.p, b.e).erreurs).toEqual([]);
  });

  test('DISCRIMINANT — en sèche : ni série de plus ni dégressive, le remplacement reste possible (dès le 1er déclenchement)', () => {
    const { e, p, x } = plan(auPlafond(4), { phase: 'seche' });
    expect(x.escalier.marche).toBe('remplacement');
    expect(esp(x.escalier.carte.phrase)).toBe(PHRASE(4) + ' Passer à Curl Biceps (Haltère) ?');
    expect(x.consigne.serieDePlus).toBeUndefined();
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    // Ni la phrase de sèche de l'escalier ordinaire.
    expect(x.entete.compteur).toBeNull();
    // Une série de plus acceptée avant ne revient pas en sèche.
    const q = plan(auPlafond(5), { phase: 'seche', marches: [marche('serie_de_plus', 'acceptee', 4)] });
    expect(q.x.consigne.serieDePlus).toBeUndefined();
  });

  test('pour un débutant : pas de dégressive (§14.8), la série de plus puis le remplacement', () => {
    const { x } = plan(auPlafond(8), { debutant: true, marches: [marche('serie_de_plus', 'refusee', 4)] });
    expect(x.escalier.marche).toBe('remplacement');
  });

  test('DISCRIMINANT — aucun frère plus chargeable (seule la barre droite de 30) : le maintien après la dégressive', () => {
    const { e, p, x } = plan(auPlafond(12), { liste: ['curl_biceps_barre'],
      marches: [marche('serie_de_plus', 'refusee', 4), marche('degressive', 'refusee', 8)] });
    expect(x.escalier).toBeNull();
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('un frère non déclaré (la poulie) est plus chargeable : proposé, « aucune limite déclarée dans ta salle »', () => {
    const { x } = plan(auPlafond(12), { liste: ['curl_biceps_barre', 'curl_poulie'],
      marches: [marche('serie_de_plus', 'refusee', 4), marche('degressive', 'refusee', 8)] });
    expect(x.escalier.carte.vers).toBe('curl_poulie');
    expect(esp(x.escalier.carte.detail)).toBe('Curl à la poulie : aucune limite déclarée dans ta salle.');
  });
});

// ═══ 4. SANS DÉCLARATION, ET SOUS LE PLAFOND ═════════════════════════════
describe('§10 bis (113) — sans salle déclarée, rien ne change ; sous le plafond, l’escalier ordinaire', () => {
  test('DISCRIMINANT — personne sans déclaration : l’escalier de §14.5 (la carte ordinaire de la série de plus, puis le repli)', () => {
    const a = plan(auPlafond(4, { sansSalle: true }), { sansSalle: true });
    expect(a.x.escalier.marche).toBe('serie_de_plus');
    expect(a.x.escalier.plafond).toBeUndefined();
    expect(esp(a.x.escalier.carte.phrase)).toBe('30 kg × 15 reste ta meilleure charge de travail depuis 4 séances, et tes autres exercices avancent.');
    expect(T.verifierPlan(a.p, a.e).erreurs).toEqual([]);
    // Pas de remplacement hors du plafond, même avec des frères donnés.
    const b = plan(auPlafond(12, { sansSalle: true, repli: true }), { sansSalle: true,
      marches: [marche('serie_de_plus', 'refusee', 4), marche('degressive', 'refusee', 8)] });
    expect(b.x.escalier.marche).toBe('repli');
  });

  test('à la plus lourde SOUS le plafond (30 kg × 12, on monte en reps) : la personne peut encore gagner des reps — l’escalier ordinaire', () => {
    const sous = M.consigneDExercice(historique(salleDe(SLUG)).slice(3), undefined, AVANT, Object.assign({ salle: salleDe(SLUG) }, O));
    sous.compteur = { compteur: 4, meilleur: { palier: 30, niveau: 12 }, blocages: [] };
    const { e, p, x } = plan(sous);
    expect(x.escalier.marche).toBe('serie_de_plus');
    expect(x.escalier.plafond).toBeUndefined();
    expect(esp(x.escalier.carte.phrase)).toMatch(/^30 kg × 12 reste ta meilleure charge de travail depuis 4 séances/);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
});

// ═══ 5. LA SEMAINE ALLÉGÉE ET I47 ═════════════════════════════════════════
describe('§10 bis (113) — I47 révisé', () => {
  const AUTRES = [{ exercice: 'a', jour: '2026-11-03', compteur: 4, seance: 'X1' }, { exercice: 'b', jour: '2026-11-03', compteur: 4, seance: 'X1' }];
  test('au plafond, l’exercice ne déclenche pas la semaine allégée ; sa marche du plafond reste proposée', () => {
    const { e, p, x } = plan(auPlafond(4), { compteurs: AUTRES });
    expect(p.carte).toBeNull();
    expect(x.escalier.marche).toBe('serie_de_plus');
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    // Prémisse : sans la salle, il la déclenche.
    expect(plan(auPlafond(4, { sansSalle: true }), { sansSalle: true, compteurs: AUTRES }).p.carte.declencheur).toBe(SLUG);
  });

  test('DISCRIMINANT — forgés : un repli, un schéma, un remplacement vers la barre droite, une marche sautée, la carte allégée', () => {
    const forge = (c, o, f) => {
      const { p } = plan(c, o);
      const q = JSON.parse(JSON.stringify(p));
      f(q.exercices[0], q);
      return T.verifierPlan(q, undefined).erreurs;
    };
    expect(forge(auPlafond(4), {}, (x) => { x.escalier = { marche: 'repli', n: 2, compteur: 8 }; })
      .some((t) => /^I47 — .*une marche de l’escalier \(repli\) au plafond/.test(t))).toBe(true);
    expect(forge(auPlafond(4), {}, (x) => { x.escalier = { marche: 'schema', n: 1, compteur: 4 }; })
      .some((t) => /^I47 — .*\(schema\) au plafond/.test(t))).toBe(true);
    expect(forge(auPlafond(4), {}, (x) => { x.consigne.repli = { palier: 25 }; x.consigne.ligne = { charge: 25, vise: 15 }; })
      .some((t) => /^I47 — .*un repli au plafond/.test(t))).toBe(true);
    expect(forge(auPlafond(12), { marches: [marche('serie_de_plus', 'refusee', 4), marche('degressive', 'refusee', 8)] }, (x) => {
      x.escalier.remplacant = { slug: 'curl_biceps_barre', mesure: 'charge_reps', salle: salleDe('curl_biceps_barre') };
      x.escalier.carte.vers = 'curl_biceps_barre';
    }).some((t) => /^I47 — .*un remplacement vers un exercice qui ne se charge pas plus/.test(t))).toBe(true);
    // La dégressive proposée alors que la série de plus avait un objet et n'a jamais été proposée.
    expect(forge(auPlafond(8), { marches: [marche('serie_de_plus', 'refusee', 4)] }, (x) => {
      x.escalier.proposees.serie_de_plus = false;
    }).some((t) => /^I47 — .*la marche serie_de_plus sautée alors qu’elle avait un objet/.test(t))).toBe(true);
    // Une marche déjà proposée qui revient en carte.
    expect(forge(auPlafond(8), { marches: [marche('serie_de_plus', 'refusee', 4)] }, (x) => {
      x.escalier.proposees.degressive = true;
    }).some((t) => /^I47 — .*la marche degressive proposée de nouveau/.test(t))).toBe(true);
    expect(forge(auPlafond(4), {}, (x, p) => { p.carte = { declencheur: SLUG }; })
      .some((t) => /^I47 — .*semaine allégée/.test(t))).toBe(true);
  });
});

describe('§10 bis (113) — I48 ne laisse l’ordre du plafond qu’à un exercice au plafond', () => {
  test('DISCRIMINANT — une dégressive forgée « au plafond » sur un exercice qui n’y est pas : I48 la voit hors du 2e déclenchement', () => {
    const c = auPlafond(4, { sansSalle: true });
    const { p } = plan(c, { sansSalle: true, place: false, debutant: false });
    const q = JSON.parse(JSON.stringify(p));
    q.exercices[0].escalier = { marche: 'degressive', n: 1, compteur: 4, declenchement: true, zone: 'volume',
      plafond: { charge: 30, reps: 15 }, carte: { type: 'degressive', phrase: 'x', plafond: true } };
    expect(T.verifierPlan(q, undefined).erreurs.some((t) => /^I48 — .*hors du 2e déclenchement isolé/.test(t))).toBe(true);
  });
});

// ═══ 6. LE PARI ET SON OBSERVATION ═══════════════════════════════════════
describe('§10 bis (113) — le pari au plafond : « tu tiens le plafond sur toutes les séries de travail, la nouvelle comprise »', () => {
  const pari = (mk, extra) => M.marchesDesParis([{ id: 'p1', module: 'escalier', exercise_slug: null,
    fondement: Object.assign({ seance: 'Q0', jour: '2026-11-01', exercice: SLUG, marche: mk, reponse: 'acceptee', compteur: 4,
      n_routine: 3, debut: '2026-11-01T10:00:00+00:00', origine: 'salle_max', plafond: { charge: 30, reps: 15 } }, extra || {}) }])[0];
  const g = (id, d, series) => ({ seance: { id, debut: '2026-11-' + d + 'T10:00:00+00:00' },
    series: series.map(([kg, r, t]) => ({ charge_kg: kg, reps: r, type_serie: t || 'travail', exercise_slug: SLUG })) });
  const cpt = (id, d, k) => ({ exercice: SLUG, seance: id, compteur: k, jour: '2026-11-' + d, debut: '2026-11-' + d + 'T10:00:00+00:00' });

  test('marchesDesParis lit l’origine et le plafond ; une marche ordinaire n’en a pas', () => {
    expect(pari('serie_de_plus')).toMatchObject({ origine: 'salle_max', plafond: { charge: 30, reps: 15 }, n: 3 });
    expect(pari('serie_de_plus', { origine: undefined }).origine).toBeUndefined();
  });

  test('DISCRIMINANT — la série de plus : 1 dès la séance qui tient 30 × 15 sur les 4 séries (la nouvelle comprise)', () => {
    const groupes = [g('Q2', '09', [[30, 15], [30, 15], [30, 15], [30, 15]]),
                     g('Q1', '05', [[30, 15], [30, 15], [30, 15], [30, 12]]),
                     g('Q0', '01', [[30, 15], [30, 15], [30, 15]])];
    const o = M.observationPlafond(pari('serie_de_plus'), groupes, [cpt('Q1', '05', 5), cpt('Q2', '09', 6)]);
    expect(o).toMatchObject({ valeur: 1, seance: 'Q2' });
  });

  test('DISCRIMINANT — rien tenu avant le prochain déclenchement : 0 à la séance du compteur 8 (même si elle tient)', () => {
    const groupes = [g('Q4', '17', [[30, 15], [30, 15], [30, 15], [30, 15]]),
                     g('Q1', '05', [[30, 15], [30, 15], [30, 14], [30, 12]])];
    const o = M.observationPlafond(pari('serie_de_plus'), groupes, [cpt('Q1', '05', 5), cpt('Q4', '17', 8)]);
    expect(o).toMatchObject({ valeur: 0, seance: 'Q4' });
    // Pas encore tranché : null.
    expect(M.observationPlafond(pari('serie_de_plus'), [groupes[1]], [cpt('Q1', '05', 5)])).toBeNull();
  });

  test('la dégressive : les séries de travail de la routine (3), la dégressive n’en est pas une ; refusée, jamais', () => {
    const groupes = [g('Q0', '01', [[30, 15], [30, 15], [30, 15], [20, 7, 'degressive']])];
    expect(M.observationPlafond(pari('degressive'), groupes, [])).toMatchObject({ valeur: 1, seance: 'Q0' });
    expect(M.observationPlafond(pari('degressive', { reponse: 'refusee' }), groupes, [])).toBeNull();
    // Une marche ordinaire (sans origine) ne s'observe pas ici.
    expect(M.observationPlafond(pari('degressive', { origine: undefined }), groupes, [])).toBeNull();
  });
});
