/** @jest-environment node */
//
// 49-U9 — LA VOIX DU COACH (MOTEUR §20, §20.2).
//
//   1. LE FORMATEUR (`modele.js`) : charges, reps, dates relatives — le seul,
//      appelé par le moteur ET le plan.
//   2. LA GARDE DE LA VOIX : toutes les phrases que le coach PRODUIT, sur les
//      trois fichiers de cas qui figent du texte et sur des plans générés,
//      passent les règles du §20.2. Une phrase qui les viole fait échouer le
//      test avec sa famille, la règle, et la phrase.
//   3. Les textes qu'aucun test ne figeait : « retour à ta charge de
//      travail », « la montée a tenu à … », « la montée continue », et l'en-tête
//      de forme inhabituelle, lu directement sur `enteteDeDisposition`.

// ⚠️ LE FUSEAU AVANT TOUTE DATE : « mardi » se compte en jours du calendrier
// LOCAL, et le passage à l'heure d'hiver (25/10/2026) doit être éprouvé.
process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const Modele = require('../../v2/js/modele.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const NB = ' ';
const CONSIGNES = require('./fixtures/consigne-48b7.json');
const CONSTATS = require('./fixtures/constat-48b6b.json');
const REACTION = require('./fixtures/reaction-49r1.json');

// ── 1. LE FORMATEUR ─────────────────────────────────────────────────────────
describe('§20.2 — le formateur de la voix (`modele.js`)', () => {
  const REF = '2026-09-20T10:00:00+02:00';   // un dimanche
  test('`quand` : aujourd\'hui, le nom du jour de 1 à 6 jours, sinon la date', () => {
    expect(Modele.quand('2026-09-20T07:00:00+02:00', REF)).toBe('aujourd\'hui');
    expect(Modele.quand('2026-09-19T23:30:00+02:00', REF)).toBe('samedi');          // 1 jour
    expect(Modele.quand('2026-09-14T10:00:00+02:00', REF)).toBe('lundi');           // 6 jours
    expect(Modele.quand('2026-09-13T10:00:00+02:00', REF)).toBe('le 13' + NB + 'sept.');  // 7 jours
  });
  test('`quand` en tête de phrase : la majuscule', () => {
    expect(Modele.quand('2026-09-15T10:00:00+02:00', REF, true)).toBe('Mardi');
    expect(Modele.quand('2026-09-20T10:00:00+02:00', REF, true)).toBe('Aujourd\'hui');
    expect(Modele.quand('2026-09-13T10:00:00+02:00', REF, true)).toBe('Le 13' + NB + 'sept.');
  });
  test('`quand` : un changement de mois ne change rien au compte', () => {
    expect(Modele.quand('2026-09-29T18:00:00+02:00', '2026-10-02T09:00:00+02:00')).toBe('mardi');
    expect(Modele.quand('2026-08-31T18:00:00+02:00', '2026-09-07T09:00:00+02:00')).toBe('le 31' + NB + 'août');
  });
  test('`quand` : un changement d\'heure (25/10/2026) ne décale pas le jour', () => {
    // Samedi 24 à 23 h 30 (heure d'été), lundi 26 à 0 h 30 (heure d'hiver) :
    // 49 heures, mais DEUX jours du calendrier.
    expect(Modele.quand('2026-10-24T23:30:00+02:00', '2026-10-26T00:30:00+01:00')).toBe('samedi');
    // Et le passage à l'heure d'été (29/03/2026) : 23 h dans la journée.
    expect(Modele.quand('2026-03-28T00:30:00+01:00', '2026-03-29T23:30:00+02:00')).toBe('samedi');
    expect(Modele.quand('2026-03-22T12:00:00+01:00', '2026-03-29T12:00:00+02:00')).toBe('le 22' + NB + 'mars');
  });
  test('`quand` sans référence : la date absolue — jamais l\'horloge', () => {
    expect(Modele.quand('2026-09-13T10:00:00+02:00')).toBe('le 13' + NB + 'sept.');
    expect(Modele.quand(null, REF)).toBe('');
  });
  test('`chargeFois`, `charge`, `serie` : la charge d\'abord, avec kg, la virgule', () => {
    expect(Modele.chargeFois(127.5, 5)).toBe('127,5' + NB + 'kg' + NB + '×' + NB + '5');
    expect(Modele.charge(125)).toBe('125' + NB + 'kg');
    expect(Modele.charge(null)).toBe('le cran au-dessus');
    expect(Modele.serie(125, [4, 4, 4])).toBe('125' + NB + 'kg' + NB + '×' + NB + '4, 4, 4');
    expect(Modele.serie(20.25, [8])).toBe('20,25' + NB + 'kg' + NB + '×' + NB + '8');
  });
});

// ── 2. LA GARDE DE LA VOIX ─────────────────────────────────────────────────
//
// Les règles du §20.2, lues sur chaque phrase produite :
//   · « palier » n'apparaît jamais ;
//   · « le moteur » n'apparaît jamais ;
//   · un « ? » seulement dans la phrase de seconde charge (le choix entre
//     deux charges, R2) ;
//   · un « × » toujours précédé de « kg » — ou du cran sans chiffre (« le
//     cran au-dessus × 10 »), que la table garde tel quel ;
//   · aucune date au format absolu pour une séance à 6 jours ou moins de la
//     référence.
const MOIS = Modele.MOIS_COURTS;
const jourLocal = (iso) => { const d = new Date(iso); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };
const absolue = (iso) => { const d = new Date(iso); return d.getDate() + NB + MOIS[d.getMonth()]; };
const SECONDE_CHARGE = /, si tu te sens bien \?$/;

function reglesViolees(phrase, famille, dates, reference) {
  const t = String(phrase);
  const v = [];
  if (/palier/i.test(t)) v.push('« palier »');
  if (/le moteur/i.test(t)) v.push('« le moteur »');
  // 53-1 (MOTEUR §9.10, CLAUDE.md §7) — un maximum estimé ne se dit jamais :
  // l'estimation du report reste en coulisse.
  if (/\b1\s?RM\b|\bmax(?:imum|imale?)?\b/i.test(t)) v.push('un maximum (« 1RM », « max »)');
  if (t.indexOf('?') >= 0 && !(famille === 'réaction' && SECONDE_CHARGE.test(t) &&
      t.indexOf('?') === t.length - 1)) v.push('un « ? » hors du choix entre deux charges');
  for (let i = t.indexOf('×'); i >= 0; i = t.indexOf('×', i + 1)) {
    const avant = t.slice(0, i).replace(/[\s ]+$/, '');
    // 50-1 : « Poids du corps × 8 » — au poids du corps, la charge est le corps.
    if (!/kg$/.test(avant) && !/Poids du corps$/.test(avant) && !/cran (au-dessus|en dessous|du dessus)$/i.test(avant)) {
      v.push('un « × » sans « kg » devant');
      break;
    }
  }
  (dates || []).forEach((d) => {
    if (!d || !reference) return;
    const ecart = Math.round((jourLocal(reference) - jourLocal(d)) / 86400000);
    if (ecart >= 0 && ecart <= 6 && t.indexOf(absolue(d)) >= 0) {
      v.push('la date absolue « ' + absolue(d) + ' » pour une séance à ' + ecart + ' jour(s)');
    }
  });
  return v;
}

// Tout le texte d'une feuille « Pourquoi » (moteur), d'un en-tête, etc.
function textesDe(o) {
  const out = [];
  (function marcher(x) {
    if (x === null || x === undefined) return;
    if (typeof x === 'string') { if (x) out.push(x); return; }
    if (Array.isArray(x)) { x.forEach(marcher); return; }
    if (typeof x === 'object') Object.keys(x).forEach((k) => marcher(x[k]));
  })(o);
  return out;
}

const plusJours = (iso, n) => new Date(new Date(iso).getTime() + n * 86400000).toISOString();

describe('§20.2 — la garde de la voix : toutes les phrases produites', () => {
  const vues = [];          // { famille, source, phrase, dates, reference }
  const noter = (famille, source, phrases, dates, reference) => {
    (Array.isArray(phrases) ? phrases : [phrases]).forEach((p) => {
      if (p === null || p === undefined || p === '') return;
      vues.push({ famille, source, phrase: String(p), dates, reference });
    });
  };

  // (a) L'en-tête et la feuille, sur les 47 cas — à la référence du fichier
  // (`avant`, 7 jours après la dernière séance), puis à 2 jours de la dernière
  // séance : c'est là que « mardi » doit remplacer la date.
  CONSIGNES.forEach((c) => {
    const k = M.consignePour(c.seances, c.avant, { reglage: c.reglage, equipement: c.equipement, correction: c.correction });
    const f = k.fondement || {};
    const dates = [f.date, f.test && f.test.date, f.zoneFigee && f.zoneFigee.date].filter(Boolean);
    const proche = f.date ? plusJours(f.date, 2) : c.avant;
    [c.avant, proche].forEach((ref) => {
      const l = M.libellesConsigne(k, ref);
      noter('en-tête', 'consigne-48b7 ' + c.id, l.jaune.concat([l.gris]), dates, ref);
      noter('feuille', 'consigne-48b7 ' + c.id, textesDe(M.pourquoiConsigne(k, c.reglage, ref)), dates, ref);
    });
  });

  // (b) Le constat, sur les 17 cas — à la référence du fichier (le jour de la
  // séance), puis à 3 jours de la séance d'avant.
  CONSTATS.forEach((c) => {
    const o = { reglage: c.reglage, equipement: c.equipement, correction: null };
    const a = M.consignePour(c.seances, c.avant, o);
    const b = M.consignePour(c.seances.concat([c.seanceDuJour]), c.apres, o);
    const fa = a.fondement || {};
    const dates = [fa.date, fa.test && fa.test.date].filter(Boolean);
    [c.seanceDuJour.debut, fa.date ? plusJours(fa.date, 3) : c.seanceDuJour.debut].forEach((ref) => {
      noter('constat', 'constat-48b6b ' + c.id, textesDe(M.constatDe(a, b, c.reglage, c.cranSuivant, ref)), dates, ref);
    });
  });

  // (c) La réaction, pas après pas, sur les 55 cas du fichier.
  REACTION.reaction.forEach((c) => {
    const k = c.consigne;
    const consigne = { etat: k.etat, zone: k.zone === null ? null : k.zone.nom, palier: k.palier,
      n: k.n, ligne: k.ligne, haut: k.haut };
    const faites = c.faites.map((s) => ({ charge_kg: s.charge, reps: s.reps, rpe: s.rpe === undefined ? null : s.rpe, ressenti: null }));
    for (let i = 0; i <= faites.length; i++) {
      const r = M.reactionPour(consigne, faites.slice(0, i), c.contexte);
      if (r.message) noter('réaction', 'reaction-49r1 ' + c.id, M.phraseReaction(r.message, consigne.zone));
    }
  });

  // (d) Des PLANS GÉNÉRÉS : chaque consigne du fichier, en séance, sous des
  // gestes qui font parler le coach (propositions, montées, retours, constat).
  const AVANT = '2026-09-26T10:00:00+00:00';
  const APRES = '2026-09-26T12:00:00+00:00';
  const GESTES = [['plan', 'plan', 'plan', 'plan'], ['+3', 'accepte', 'plan', 'plan'],
    ['+5', 'accepte', 'accepte', 'plan'], ['+3', 'bas', 'plan', 'plan'], ['+3', 'refuse', 'plan', 'plan']];
  CONSIGNES.forEach((c) => {
    const opts = { reglage: c.reglage, equipement: c.equipement, correction: c.correction };
    const k = M.consignePour(c.seances, c.avant, opts);
    const obj = { consigne: k, libelles: M.libellesConsigne(k, AVANT),
      contexte: M.contexteReaction(c.seances, c.avant, k, c.equipement, null) };
    GESTES.forEach((gestes) => {
      let n = 0;
      const id = () => 'x-s' + (++n);
      let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
      se = S.ajouterExercice(se, 'x', id, { series: 4 });
      const paris = [];
      const entrees = () => {
        const travail = se.exercices[0].series.filter((s) => S.typeDe(s) === 'travail');
        const fini = travail.every((s) => S.partEnBase(s));
        let suites = {};
        if (fini) {
          const tous = c.seances.concat(M.contratDe([{ seance: { debut: AVANT }, series: travail }], null, 'charge_reps'));
          const apres = M.consignePour(tous, APRES, opts);
          suites = { x: { consigne: apres, cranSuivant: apres.palier === null || apres.palier === undefined
            ? null : M.chargeVoisine(tous, APRES, apres.palier, c.equipement, 1) } };
        }
        return { seance: { id: 'S', debut: AVANT, edition: false, exercices: se.exercices },
          consignes: { x: obj }, reglage: c.reglage, paris: paris.slice(), suites };
      };
      const lire = () => {
        const x = T.planDeSeance(entrees()).exercices[0];
        const dates = [k.fondement && k.fondement.date].filter(Boolean);
        noter('en-tête', 'plan ' + c.id, (x.entete ? x.entete.jaune : []).concat([x.entete && x.entete.gris]), dates, AVANT);
        noter('feuille', 'plan ' + c.id, [x.donc].concat(textesDe(x.pourquoi)), dates, AVANT);
        if (x.message) noter('réaction', 'plan ' + c.id, x.message.phrase);
        if (x.constat) noter('constat', 'plan ' + c.id, [x.constat.verdict, x.constat.suite], dates, AVANT);
        return x;
      };
      gestes.forEach((g, i) => {
        const x = lire();
        const l = x.lignes && x.lignes[i];
        if (!l || l.role === 'hors') return;
        const charge = l.charge === null || l.charge === undefined ? (k.palier || 20) + 2.5 : l.charge;
        const vise = l.vise === null || l.vise === undefined ? (l.fourchette ? l.fourchette[0] : 5) : l.vise;
        const reps = g === '+3' ? vise + 3 : g === '+5' ? vise + 5 : g === 'bas' ? 1 : vise;
        const kg = g === 'refuse' ? charge - 2.5 : charge;
        se = S.modifierSerie(se, 0, i, { charge_kg: kg, reps: reps });
        se = S.valider(se, 0, i, new Date('2026-09-26T10:30:00Z'));
        const y = T.planDeSeance(entrees()).exercices[0];
        const q = y.paris && y.paris[i];
        if (q) paris.push(Object.assign({}, q, { set_observe: se.exercices[0].series[i].id }));
      });
      lire();
    });
  });

  // (e) MOTEUR §9.15 (49-U10) — les chauffes et la dégressive : les 32 cas du
  // fichier, ce que la règle rend, et la note de la feuille sur un plan dont la
  // routine prévoit plus de chauffes que la table.
  const CHAUFFES = require('./fixtures/cas-49u10-chauffes.json');
  CHAUFFES.chauffes.forEach((c) => {
    const r = M.chauffesDe(c.entree);
    noter('chauffes', 'cas-49u10 ' + c.id, [r.phrase, r.phrase_proposition]);
  });
  CHAUFFES.degressives.forEach((c) => noter('chauffes', 'cas-49u10 ' + c.id, M.degressiveDe(c.entree).phrase));
  (() => {
    let n = 0;
    const id = () => 'w-s' + (++n);
    let se = S.creer({ id: 'W', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'developpe_couche_barre', id, { series: 2 });
    se = S.insererChauffes(se, 0, [[0, 10], [0, 6], [0, 3], [0, 1], [0, 1]], id);
    const k = { etat: 'progression', zone: 'force', palier: 125, niveau: 5, n: 2,
      ligne: { charge: 125, vise: 5 }, haut: null, fondement: {} };
    const x = T.planDeSeance({ seance: { id: 'W', debut: '2026-09-26T10:00:00+00:00', edition: false, exercices: se.exercices },
      consignes: { developpe_couche_barre: { consigne: k, libelles: M.libellesConsigne(k) } },
      catalogue: { developpe_couche_barre: { equipement: 'barre', muscles_primaires: ['pectoraux'] } },
      paris: [] }).exercices[0];
    noter('chauffes', 'plan 49-U10', [x.chauffes && x.chauffes.phrase, x.pourquoi && x.pourquoi.chauffes]);
  })();

  // (f) MOTEUR §9.2 bis (49-U12) — la chute : l'en-tête et la feuille des 23
  // cas, à la référence du cas puis à 1 jour de la dernière séance (« Mardi »).
  require('./fixtures/cas-49u12-chute.json').cas.forEach((c) => {
    const k = M.consignePour(c.seances, c.avant, { reglage: c.reglage, equipement: c.equipement, correction: null });
    const d = k.fondement && k.fondement.date;
    [c.avant, d ? plusJours(d, 1) : c.avant].forEach((ref) => {
      const l = M.libellesConsigne(k, ref);
      noter('chute', 'cas-49u12 ' + c.id, l.jaune.concat([l.gris]), [d].filter(Boolean), ref);
      noter('chute', 'cas-49u12 ' + c.id, textesDe(M.pourquoiConsigne(k, c.reglage, ref)), [d].filter(Boolean), ref);
    });
  });

  // (g) MOTEUR §12.9 (49-U13) — le compteur de stagnation : la phrase des 14
  // cas, et des meilleurs décimaux, de 4 à 12 séances, avec et sans « plus long
  // que d'habitude ».
  require('./fixtures/cas-49u13-compteur.json').cas.forEach((c) => {
    const r = M.compteurDe(c.seances, c.avant, { reglage: c.reglage, equipement: c.equipement, correction: null, toutes: true });
    noter('compteur', 'cas-49u13 ' + c.id, M.phraseCompteur(r, c.blocages_termines === null ? undefined : c.blocages_termines));
  });
  [4, 5, 9, 12].forEach((k) => [[122.5, 6], [16, 10], [275.7, 12]].forEach(([kg, n]) => {
    noter('compteur', 'compteur ' + k, M.phraseCompteur({ compteur: k, meilleur: { palier: kg, niveau: n } }));
    noter('compteur', 'compteur ' + k, M.phraseCompteur({ compteur: k, meilleur: { palier: kg, niveau: n } }, [1, 1, 1, 1, 1, 1, 1, 1]));
  }));

  // (h) MOTEUR §14.4 (49-U14) — l'escalier : la carte (les 16 cas de détection,
  // phrase et détail), la consigne allégée (14 cas, en-tête et gris), les trois
  // bandeaux de période et celui du refus. Aucun « ? » : le coach suggère, il ne
  // demande pas pourquoi.
  const ESC = require('./fixtures/cas-49u14-semaine-allegee.json');
  ESC.detection.forEach((c) => {
    const b = M.blocageGeneralise(c.jours, c.date);
    if (b) noter('escalier', 'cas-49u14 ' + c.id, [M.phraseCarte(b.cites), M.DETAIL_CARTE]);
  });
  ESC.consigne_allegee.forEach((c) => {
    const k = c.consigne;
    const a = M.consigneAllegee({ etat: k.etat, zone: k.zone[0], ligne: { charge: k.ligne[0], vise: k.ligne[1] },
      haut: k.haut ? { charge: k.haut[0], vise: k.haut[1], k: k.haut[2] } : null }, c.series_routine);
    noter('escalier', 'cas-49u14 ' + c.id, [M.phraseAllegee(a), M.detailAllegee(a)]);
  });
  ESC.bandeau.forEach((b) => noter('escalier', 'bandeau ' + b.acceptee_le, [M.bandeauAllegee(M.finAllegee(b.acceptee_le))]));
  noter('escalier', 'refus', [M.PHRASE_REFUS]);

  // (i) MOTEUR §14.5 (49-U15) — le blocage isolé : les 3 cartes de schéma
  // (phrase, détail, deux boutons), la phrase de la sèche, celle du silence,
  // et les 2 replis trouvés — à la référence du cas, puis à 3 jours de la
  // séance du repli : « mardi » doit y remplacer la date. Aucun « palier ».
  const ISO = require('./fixtures/cas-49u15-blocage-isole.json');
  ISO.schema.forEach((c) => {
    const k = M.carteSchema(c.zone, { palier: c.meilleur[0], niveau: c.meilleur[1] }, c.compteur, c.autres_avancent);
    noter('escalier isolé', 'cas-49u15 ' + c.id, [k.phrase, k.detail, k.oui, k.non]);
  });
  noter('escalier isolé', 'sèche', [M.phraseSeche({ compteur: 4, meilleur: { palier: 27, niveau: 12 }, blocages: [] })]);
  noter('escalier isolé', 'silence', [M.phraseCompteur({ compteur: 12, meilleur: { palier: 80, niveau: 10 }, blocages: [] })]);
  // (j) MOTEUR §14.7 (49-U17) — la série de plus : les 4 cartes (phrase,
  // détail, deux boutons) et le gris qui suit l'acceptation. Les muscles par
  // leurs noms au catalogue.
  const Semaine = require('../../v2/js/semaine.js');
  require('./fixtures/cas-49u17-serie-de-plus.json').carte.forEach((c, i) => {
    const k = M.carteSerieDePlus({ palier: c.meilleur[0], niveau: c.meilleur[1] }, c.compteur, c.autres_avancent,
      c.muscles.map((m) => ({ cle: m, libelle: Semaine.libelleMuscle(m) })));
    noter('escalier isolé', 'cas-49u17 carte ' + (i + 1), [k.phrase, k.detail, k.oui, k.non]);
  });
  noter('escalier isolé', 'série de plus, après', [M.GRIS_SERIE_DE_PLUS]);
  ISO.repli.filter((c) => c.attendu).forEach((c) => {
    const r = M.repliEscalier(c.seances, c.avant, { palier: c.meilleur[0], niveau: c.meilleur[1] }, c.zone);
    noter('escalier isolé', 'cas-49u15 ' + c.id, [M.phraseRepli(r, c.avant)], [r.debut], c.avant);
    const proche = plusJours(r.debut, 3);
    noter('escalier isolé', 'cas-49u15 ' + c.id + ' à 3 jours', [M.phraseRepli(r, proche)], [r.debut], proche);
  });

  // (k) MOTEUR §13.6 (49-U20) — les frères : la phrase des 10 cas (7 en ont
  // une), sans « avant » et avec la flèche. Le nom du frère est libre (son nom
  // au catalogue) : la règle du « × » vaut pour ses deux chiffres.
  const FR = require('./fixtures/cas-49u20-freres.json');
  const mFr = (m) => (m ? { palier: m[0], niveau: m[1] } : null);
  const vFr = (l) => l.map((v) => ({ debut: v.debut, zone: v.zone, progres: v.progres, meilleur: mFr(v.meilleur) }));
  FR.cas.forEach((c) => {
    const r = M.frereQuiProgresse({ verdicts: vFr(c.bloque.verdicts) },
      Object.keys(c.freres).map((nom) => ({ id: nom, nom, verdicts: vFr(c.freres[nom]) })), c.avant);
    if (r) noter('frères', 'cas-49u20 ' + c.id, [M.phraseFrere(r)]);
  });

  // 50-1 bis (§9.17) — ce que la page d'un exercice en reps dit de sa charge : le
  // formateur la porte (`Modele.PHRASE_POIDS_DU_CORPS`), la garde la lit.
  noter('page d’exercice', 'poids du corps', [Modele.PHRASE_POIDS_DU_CORPS]);

  // 51-3 (§9.20) — « J'ai mal » : la feuille, et la carte de reprise sur les 4
  // cas réels, à la barre, avec et sans meilleur du compteur (le repli de
  // §14.5, sinon celui de la reprise longue — « Plus de reps » au militaire).
  const MAL = require('./fixtures/cas-51-3-j-ai-mal.json');
  const fD = M.feuilleDouleur('Squat (Barre)');
  noter('douleur', 'feuille', [fD.titre, fD.phrase, fD.securite].concat(fD.choix.map((q) => q.texte), fD.choix.map((q) => q.sous)));
  MAL.neutralite.forEach((c) => {
    const se = M.sansPalierRetenues(c.seances.map((x) => { const y = Object.assign({}, x); delete y.neutre; return y; }),
      { equipement: 'barre' });
    const k = M.consignePour(se, c.avant, { equipement: 'barre' });
    [null, { palier: k.palier, niveau: k.niveau }].forEach((m) => {
      const t = M.carteRepriseTextes('X', k, M.reprisePour(se, c.avant, k, m, { equipement: 'barre' }));
      noter('douleur', 'cas-51-3 ' + c.id, [t.titre, t.phrase].concat(t.choix.map((q) => q.texte)));
    });
  });

  // 52-1 (§9.21) — la charge de départ, la première fois : l'en-tête (jaune
  // et gris) et la feuille, sur trois charges dont une décimale et une sans
  // reps de routine.
  [[60, 10], [22.5, 8], [100, null]].forEach(([charge, reps]) => {
    const r = M.consigneDExercice([], undefined, '2026-10-05T10:00:00Z', { mesure: 'charge_reps',
      equipement: 'barre', intention: 'progresser', reglage: 'normal', depart: { charge, reps, n: 3 } });
    noter('départ', 'charge de départ ' + charge, r.libelles.jaune.concat([r.libelles.gris]));
    noter('départ', 'charge de départ ' + charge, textesDe(M.pourquoiConsigne(r.consigne, 'normal', '2026-10-05T10:00:00Z')));
  });

  // 53-1 (§9.10) — le report au changement de zone : la ligne, la phrase grise
  // et la feuille, estimée et tenue, vers Mix et vers Lourd ; et le constat.
  {
    let rg = 0;
    const g = (debut, charge, reps) => ({ seance: { id: debut, debut, fin: debut.replace('T10', 'T11') },
      series: reps.map((r) => ({ id: 'z' + (++rg), rang: rg, charge_kg: charge, reps: r, type_serie: 'travail' })) });
    const lourd = [g('2026-09-01T10:00:00Z', 100, [5, 5, 5]), g('2026-09-04T10:00:00Z', 100, [5, 5, 5]),
      g('2026-09-08T10:00:00Z', 100, [5, 5, 5])];
    const mix = [g('2026-09-01T10:00:00Z', 100, [7, 7, 7]), g('2026-09-04T10:00:00Z', 100, [7, 7, 7]),
      g('2026-09-07T10:00:00Z', 100, [7, 7, 7])];
    const AV = '2026-09-11T10:00:00Z';
    const o = (zone) => ({ mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal',
      correction: zone, correctionsDeZone: [{ id: '1', exercise_slug: 'x', zone, corrigee_a: '2026-09-10T20:00:00Z' }] });
    [[lourd, 'mix'], [[g('2026-08-20T10:00:00Z', 90, [7, 7, 7])].concat(lourd), 'mix'], [mix, 'lourd']].forEach(([gs, zone], i) => {
      const r = M.consigneDExercice(gs, undefined, AV, o(zone));
      const dates = gs.map((x) => x.seance.debut);
      noter('nouvelle zone', 'report ' + i, r.libelles.jaune.concat([r.libelles.gris]), dates, AV);
      noter('nouvelle zone', 'report ' + i, textesDe(M.pourquoiConsigne(r.consigne, 'normal', AV)), dates, AV);
    });
    const avant = M.consigneDExercice(lourd, undefined, AV, o('mix'));
    const apres = M.consigneDExercice(lourd.concat([g('2026-09-11T10:00:00Z', 95, [6, 6, 6])]), undefined, '2026-09-11T12:00:00Z', o('mix'));
    noter('nouvelle zone', 'constat', [M.constatDe(avant.consigne, apres.consigne, 'normal', 97.5, '2026-09-11T12:00:00Z').verdict]);
  }

  test('chaque famille est jouée, et la date relative l\'est vraiment', () => {
    const parFamille = {};
    vues.forEach((v) => { parFamille[v.famille] = (parFamille[v.famille] || 0) + 1; });
    expect(parFamille['en-tête']).toBeGreaterThan(200);
    expect(parFamille.feuille).toBeGreaterThan(500);
    expect(parFamille['réaction']).toBeGreaterThan(50);
    expect(parFamille.constat).toBeGreaterThan(50);
    // 30 phrases des 37 cas (les cas sans chauffe ni proposition n'en ont
    // pas) + la phrase et la note de la feuille sur le plan.
    expect(parFamille.chauffes).toBe(32);
    // 6 phrases des 14 cas (les 8 autres sont à 0-3 : rien) + 24 synthétiques.
    expect(parFamille.compteur).toBe(30);
    // 6 cartes × 2 phrases + 14 consignes allégées × 2 + 3 bandeaux + le refus.
    expect(parFamille.escalier).toBe(44);
    // 3 cartes × 4 textes + la sèche + le silence + 2 replis × 2 références,
    // puis (49-U17) 4 cartes de série de plus × 4 textes + le gris d'après.
    // 49-U18 : R004 n'est plus un repli atteint (l'écart habituel sur les 8
    // derniers écarts fait repartir son compteur de zéro) — 2 phrases de moins.
    expect(parFamille['escalier isolé']).toBe(33);
    // 49-U20 : 7 phrases des 10 cas de frères (3 sans frère qui progresse).
    expect(parFamille['frères']).toBe(7);
    // 50-1 bis : une phrase, celle de la page d'un exercice au poids du corps.
    expect(parFamille['page d’exercice']).toBe(1);
    // 51-3 : la feuille (3 phrases, 4 choix, 3 sous-titres) + 4 cas × 2 cartes ×
    // (titre, phrase, 3 choix) ; « Plus de reps » au militaire, à charge égale.
    expect(parFamille.douleur).toBe(10 + 40);
    // 52-1 : 3 charges de départ × (jaune, gris, puis la feuille : donc, état, réglage, fin).
    expect(parFamille['départ']).toBe(3 * 6);
    // 53-1 : 3 reports × (jaune, gris, puis 13 textes de feuille : la date et les
    // 3 séries de la séance — texte et rôle —, zone, charge de travail, état,
    // donc, réglage, fin) + le constat.
    expect(parFamille['nouvelle zone']).toBe(3 * (2 + 13) + 1);
    expect(vues.filter((v) => v.famille === 'nouvelle zone' && /^Nouvelle zone : Mix\. Ta charge déjà tenue en Mix, le 20 août : 90 kg × 7\.$/
      .test(v.phrase.replace(/[\u00a0\u202f]/g, ' '))).length).toBe(1);
    expect(vues.filter((v) => v.famille === 'nouvelle zone' && /^Nouvelle zone : Lourd\. Estimée depuis ton 100 kg × 7, un peu en dessous pour démarrer\.$/
      .test(v.phrase.replace(/[\u00a0\u202f]/g, ' '))).length).toBe(1);
    expect(vues.filter((v) => v.famille === 'départ' && /^Première fois ici : on part de ta charge de départ, 22,5 kg\.$/
      .test(v.phrase.replace(/[\u00a0\u202f]/g, ' '))).length).toBe(1);
    expect(vues.filter((v) => v.famille === 'douleur' && /^Plus de reps : 20/.test(v.phrase)).length).toBe(2);
    expect(vues.filter((v) => v.famille === 'frères' && / → /.test(v.phrase)).length).toBe(5);
    // La phrase « Je ne compte pas la dernière série » est bien jouée.
    expect(vues.filter((v) => v.famille === 'chute' && /Je ne compte pas la dernière série/.test(v.phrase)).length)
      .toBeGreaterThanOrEqual(14);
    expect(vues.filter((v) => v.source === 'plan 49-U10').length).toBe(2);
    // Sans ces phrases, la règle des dates ne serait jamais éprouvée.
    const jours = vues.filter((v) => /(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/i.test(v.phrase));
    expect(jours.length).toBeGreaterThan(50);
    expect(vues.some((v) => SECONDE_CHARGE.test(v.phrase))).toBe(true);
    expect(vues.some((v) => /le cran (au-dessus|en dessous) ×/i.test(v.phrase))).toBe(true);
  });

  test('⚠️ LA GARDE — aucune phrase ne viole les règles de la voix (§20.2)', () => {
    const fautes = [];
    vues.forEach((v) => {
      reglesViolees(v.phrase, v.famille, v.dates, v.reference).forEach((r) => {
        fautes.push('[' + v.famille + ' · ' + v.source + '] ' + r + ' : « ' + v.phrase.replace(/ /g, ' ') + ' »');
      });
    });
    expect(fautes.slice(0, 20)).toEqual([]);
  });

  test('la garde elle-même attrape chaque règle (sinon elle serait muette)', () => {
    const ref = '2026-09-20T10:00:00+02:00';
    expect(reglesViolees('Ton palier est 125 kg.', 'feuille')).toContain('« palier »');
    expect(reglesViolees('le moteur n\'a rien à proposer.', 'feuille')).toContain('« le moteur »');
    expect(reglesViolees('125 kg × 8 : 130 kg dès la série 2 ?', 'réaction'))
      .toContain('un « ? » hors du choix entre deux charges');
    expect(reglesViolees('Ou 55 kg, si tu te sens bien ?', 'réaction')).toEqual([]);
    expect(reglesViolees('Ou 55 kg, si tu te sens bien ?', 'feuille'))
      .toContain('un « ? » hors du choix entre deux charges');
    expect(reglesViolees('130 × 2 : pas encore.', 'constat')).toContain('un « × » sans « kg » devant');
    expect(reglesViolees('130 kg × 2 : pas encore.', 'constat')).toEqual([]);
    expect(reglesViolees('Le cran au-dessus × 10', 'en-tête')).toEqual([]);
    expect(reglesViolees('Le 15' + NB + 'sept.' + NB + ': 125 kg × 5.', 'en-tête',
      ['2026-09-15T10:00:00+02:00'], ref)).toContain('la date absolue « 15' + NB + 'sept. » pour une séance à 5 jour(s)');
    expect(reglesViolees('Le 13' + NB + 'sept.' + NB + ': 125 kg × 5.', 'en-tête',
      ['2026-09-13T10:00:00+02:00'], ref)).toEqual([]);
  });
});

// ── 3. LES TEXTES QU'AUCUN TEST NE FIGEAIT ─────────────────────────────────
describe('§20.2 — les lignes de la feuille en séance, et l\'en-tête de forme inhabituelle', () => {
  const AVANT = '2026-09-26T10:00:00+00:00';
  const esp = (x) => (x === null || x === undefined ? x : String(x).replace(/ /g, ' '));
  // Hypertrophie 8-10, 50 × 9 sur 4 séries, le cran au-dessus est 52,5.
  const C = { etat: 'progression', zone: 'hypertrophie', palier: 50, niveau: 9, n: 4,
    ligne: { charge: 50, vise: 9 }, haut: null, fondement: {} };
  function seance() {
    let n = 0;
    const id = () => 's' + (++n);
    let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'x', id, { series: 4 });
    const paris = [];
    const obj = { consigne: C, libelles: M.libellesConsigne(C, AVANT), contexte: { cran: 52.5, haut: null } };
    const entrees = () => ({ seance: { id: 'S', debut: AVANT, edition: false, exercices: se.exercices },
      consignes: { x: obj }, paris: paris.slice(), suites: {} });
    const api = {
      exo: () => T.planDeSeance(entrees()).exercices[0],
      valider: (i, kg, reps) => {
        se = S.modifierSerie(se, 0, i, { charge_kg: kg, reps: reps });
        se = S.valider(se, 0, i, new Date('2026-09-26T10:30:00Z'));
        const q = api.exo().paris[i];
        if (q) paris.push(Object.assign({}, q, { set_observe: se.exercices[0].series[i].id }));
      },
      devalider: (i) => { se = S.devalider(se, 0, i); },
      verifier: () => T.verifierPlan(T.planDeSeance(entrees()), entrees()).erreurs
    };
    return api;
  }
  const ligne = (l) => [l.libelle, l.raison].filter(Boolean).map(esp).join(' · ');

  test('P28 — « retour à ta charge de travail » : la montée pas encore tenue', () => {
    const s = seance();
    s.valider(0, 50, 12);
    s.valider(1, 52.5, 6);
    expect(s.exo().pourquoi.lignes.map(ligne)).toEqual([
      'consigne',
      'proposée par le coach · proposée après 50 kg × 12',
      'retour à ta charge de travail · on revient à 50 kg après 52,5 kg × 6',
      'retour à ta charge de travail · on revient à 50 kg après 52,5 kg × 6'
    ]);
    expect(s.verifier()).toEqual([]);
  });

  test('P30 — « la montée a tenu à … » : la montée tenue gagne les séries suivantes', () => {
    const s = seance();
    s.valider(0, 50, 12);
    s.valider(1, 52.5, 9);
    expect(s.exo().pourquoi.lignes.map(ligne)).toEqual([
      'consigne',
      'proposée par le coach · proposée après 50 kg × 12',
      'proposée par le coach · la montée a tenu à 52,5 kg × 9',
      'proposée par le coach · la montée a tenu à 52,5 kg × 9'
    ]);
    expect(s.verifier()).toEqual([]);
  });

  test('P30 — « la montée continue » : la première montée dévalidée, la suivante déjà faite', () => {
    const s = seance();
    s.valider(0, 50, 12);
    s.valider(1, 52.5, 9);
    s.valider(2, 52.5, 9);
    s.devalider(1);
    const l = s.exo().pourquoi.lignes;
    expect(l.map(ligne)).toEqual([
      'consigne',
      'proposée par le coach · proposée après 50 kg × 12',
      'proposée par le coach · la montée continue',
      'consigne'
    ]);
    expect(esp(l[2].faite)).toBe('faite : 52,5 kg × 9');
    expect(esp(l[2].texte)).toBe('52,5 kg × 8 à 10');
  });

  test('J5 — l\'en-tête d\'une forme inhabituelle se dit segment par segment', () => {
    const c = { etat: 'etend', zone: 'lourd', palier: 125, n: 3,
      ligne: { charge: 125, vise: 5 }, haut: { charge: 130, vise: 4, k: 1 } };
    expect(M.enteteDeDisposition(c, ['ligne', 'haut', 'ligne']).jaune.map(esp))
      .toEqual(['125 kg × 5 sur une série', 'puis 130 kg × 4 sur une série', 'puis 125 kg × 5 sur une série']);
    expect(M.enteteDeDisposition(c, ['ligne', 'ligne', 'haut', 'ligne']).jaune.map(esp))
      .toEqual(['125 kg × 5 sur 2 séries', 'puis 130 kg × 4 sur une série', 'puis 125 kg × 5 sur une série']);
    // Et une charge inconnue en tête : « Le cran au-dessus × 4 ».
    const d = Object.assign({}, c, { haut: { charge: null, vise: 4, k: 1 } });
    expect(M.enteteDeDisposition(d, ['haut', 'ligne']).jaune.map(esp))
      .toEqual(['Le cran au-dessus × 4 sur une série', 'puis 125 kg × 5 sur une série']);
  });
});
