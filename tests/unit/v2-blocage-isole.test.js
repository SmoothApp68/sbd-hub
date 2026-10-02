/** @jest-environment node */
//
// 49-U15 — l'escalier, deuxième marche : le blocage isolé (MOTEUR §14.2,
// §14.5, delta 49-32). Un exercice cale seul : selon sa zone et la phase,
// changer de schéma (zones force), le dire sans rien proposer (zones muscle en
// sèche), puis le repli au déclenchement suivant (10 % au plus sous le
// meilleur), puis le silence. La série de plus (zones muscle hors sèche)
// n'est pas dans cette PR.
//
// LE FICHIER DE CAS FAIT FOI. `cas-49u15-blocage-isole.json` sort de
// `coach49.py` (Claude.ai, 01/10/2026) : 4 replis sur de vraies séances,
// 3 cartes de schéma, 48 lignes de la table des marches, 2 phrases. Un cas
// qui semble faux se rapporte ; il ne se corrige pas ici.
//
// ⚠️ DEUX AJUSTEMENTS D'OCTETS, RAPPORTÉS DANS LA PR, comme en #345 :
//   · « 120 kg × 4 » (la ligne jaune) passe par le formateur unique de
//     l'en-tête (`chargeFois`) : insécables autour du « × » ;
//   · la date du repli passe par `quand` (« la date par le formateur `quand` »,
//     prompt 49-U15) : insécable entre le jour et le mois, « le 3 févr. ».
// Le reste est comparé à l'octet.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const F = require('./fixtures/cas-49u15-blocage-isole.json');
const NB = ' ';
const octets = (s) => (s === null || s === undefined ? s : Buffer.from(s, 'utf8').toString('hex'));
// L'en-tête : le × du formateur (`chargeFois`) est entouré d'insécables.
const surFormateur = (s) => s.replace(/ × /g, NB + '×' + NB);
// La date de `quand` : « le 3 févr. », insécable entre le jour et le mois.
const dateParQuand = (s) => s.replace(/ le (\d+) ([a-zéû]+\.?)$/, ' le $1' + NB + '$2');
const meilleurDuCas = (m) => ({ palier: m[0], niveau: m[1] });

// ── 1. LES CAS DU SIMULATEUR ────────────────────────────────────────────────
describe('§14.2, §14.5 — les cas du simulateur', () => {
  // 49-U18 (maj-attendus-0110) : R004 n'est plus un repli trouvé — l'écart
  // habituel sur les 8 derniers écarts fait d'une séance de sa fenêtre une
  // reprise, son compteur repart de zéro, et le 2e déclenchement (le repli)
  // n'est plus atteint. `repliEscalier` seul le trouverait encore : un repli
  // ATTEINT demande aussi le compteur (≥ 8).
  test('le fichier : 4 replis (1 trouvé ; 2 sautés, 1 pas atteint), 3 cartes, 48 marches, 2 phrases', () => {
    expect(F.repli).toHaveLength(4);
    expect(F.repli.filter((c) => c.attendu).map((c) => c.id)).toEqual(['R002']);
    expect(F.schema).toHaveLength(3);
    expect(F.marche).toHaveLength(48);
    expect(Object.keys(F.phrases)).toEqual(['seche', 'silence_constat']);
  });

  F.repli.forEach((c) => {
    test('repli ' + c.id + ' — ' + c.titre, () => {
      const r = M.repliEscalier(c.seances, c.avant, meilleurDuCas(c.meilleur), c.zone);
      // Le 2e déclenchement isolé : le compteur à 8 au moins (§14.5).
      const atteint = M.compteurDe(c.seances, c.avant, { toutes: true }).compteur >= 8;
      if (c.attendu === null) { expect(r === null || !atteint).toBe(true); return; }
      expect(atteint).toBe(true);
      const a = c.attendu;
      expect([r.palier, r.niveau, r.debut]).toEqual([a.palier, a.niveau, a.debut]);
      expect(r.ligne).toEqual(a.ligne);
      // La consigne de repli : la ligne du cas, SANS ligne haute (I22).
      const k = M.consigneRepli({ etat: 'garde', zone: c.zone, n: 4, ligne: { charge: 1, vise: 1 },
        haut: { charge: 999, vise: 1, k: 1 } }, r);
      expect([k.ligne.charge, k.ligne.vise]).toEqual(a.ligne);
      expect(k.haut).toBeNull();
      // La ligne jaune : l'en-tête sur la disposition (toutes à la ligne).
      const e = M.enteteDeDisposition(k, ['ligne', 'ligne', 'ligne']);
      expect(octets(e.jaune[0])).toBe(octets(surFormateur(a.phrase)));
      expect(octets(M.phraseRepli(r, c.avant))).toBe(octets(dateParQuand(a.pourquoi)));
    });
  });

  F.schema.forEach((c) => {
    test('carte de schéma ' + c.id + ' (' + c.zone + ', autres ' + (c.autres_avancent ? 'avancent' : 'calent') + ')', () => {
      const k = M.carteSchema(c.zone, meilleurDuCas(c.meilleur), c.compteur, c.autres_avancent);
      expect(k.nouvelle_zone).toBe(c.attendu.nouvelle_zone);
      expect(octets(k.phrase)).toBe(octets(c.attendu.phrase));
      expect(octets(k.detail)).toBe(octets(c.attendu.detail));
      expect([k.oui, k.non]).toEqual([c.attendu.oui, c.attendu.non]);
    });
  });

  // ⚠️ REMPLACÉE EN PARTIE PAR LA TABLE DE 49-34 (49-U17, `cas-49u17-serie-de-plus.json`) :
  // en zone muscle hors sèche, n = 1 n'est plus « rien n'est proposé » (la série
  // de plus, ou le repli tout de suite), et n = 2 n'est le repli que si une
  // série de plus a été proposée. Les 40 lignes inchangées (zones force, sèche,
  // n ≥ 3) se vérifient encore ici ; les 8 autres, par la table de 49-U17.
  test('la table des marches : les lignes que 49-34 n\'a pas changées (zones force, sèche, n ≥ 3)', () => {
    const muscleHorsSeche = (m) => ['lourd', 'mix'].indexOf(m.zone) < 0 && m.phase !== 'seche';
    const gardees = F.marche.filter((m) => !(muscleHorsSeche(m) && m.n_isole <= 2));
    expect(gardees).toHaveLength(40);
    const faux = gardees.filter((m) => M.marcheIsolee(m.n_isole, m.zone, m.phase) !== m.marche);
    expect(faux).toEqual([]);
  });

  test('les phrases : la sèche (en-tête) et le silence (constat), à l\'octet', () => {
    expect(octets(M.phraseSeche({ compteur: 4, meilleur: { palier: 27, niveau: 12 }, blocages: [] })))
      .toBe(octets(F.phrases.seche));
    expect(octets(M.phraseCompteur({ compteur: 12, meilleur: { palier: 80, niveau: 10 }, blocages: [] })))
      .toBe(octets(F.phrases.silence_constat));
  });
});

// ── 2. LE REPLI : LES CINQ CONDITIONS, UNE À UNE ────────────────────────────
describe('§14.2 — le repli, condition par condition', () => {
  const R2 = F.repli.filter((c) => c.id === 'R002')[0];
  const repli = (seances, o) => M.repliEscalier(seances, R2.avant, meilleurDuCas(R2.meilleur), 'lourd', o);
  const sans = (debut) => R2.seances.filter((s) => s.debut !== debut);

  test('le plus récent : sans la séance du 3 févr., le 27 janv. (120 × 4 aussi)', () => {
    expect(repli(sans('2026-02-03T17:16:00+00:00')).debut).toBe('2026-01-27T12:54:00+00:00');
  });
  test('(5) la limite de 10 % : 117,5 kg passe pour un meilleur de 130 (−9,6 %), 115 non', () => {
    const une = (P) => [{ debut: '2026-02-10T10:00:00+00:00', palier: P, neutre: false, decharge: false,
      series: [1, 2, 3].map(() => ({ charge_kg: P, reps: 4, rpe: null, role: 'palier', origine: 'palier' })) }];
    expect(repli(une(117.5)).palier).toBe(117.5);
    expect(repli(une(115))).toBeNull();
    // Strictement sous le meilleur : 130 n'est pas un repli.
    expect(repli(une(130))).toBeNull();
  });
  test('(4) tenu : un niveau sous le bas de la zone (2 en Lourd) ne compte pas', () => {
    const s = [{ debut: '2026-02-10T10:00:00+00:00', palier: 125, neutre: false, decharge: false,
      series: [1, 2].map(() => ({ charge_kg: 125, reps: 2, rpe: null, role: 'palier', origine: 'palier' })) }];
    expect(repli(s)).toBeNull();
  });
  test('(3) 90 jours : au 91e jour, la séance du 3 févr. n\'est plus un repli', () => {
    const seule = R2.seances.filter((s) => s.debut === '2026-02-03T17:16:00+00:00');
    const avant89 = '2026-05-03T17:00:00+00:00';
    const avant91 = '2026-05-05T17:30:00+00:00';
    expect(M.repliEscalier(seule, avant89, meilleurDuCas(R2.meilleur), 'lourd')).not.toBeNull();
    expect(M.repliEscalier(seule, avant91, meilleurDuCas(R2.meilleur), 'lourd')).toBeNull();
  });
  test('(2) même zone : une séance d\'une autre zone (`zoneAu`) est écartée', () => {
    const autre = (liste, i) => (liste[i].debut === '2026-02-03T17:16:00+00:00' ? 'mix' : 'lourd');
    expect(repli(R2.seances, { zoneAu: autre }).debut).toBe('2026-01-27T12:54:00+00:00');
  });
  test('neutre ou d\'une semaine allégée : pas un palier tenu', () => {
    const marquees = R2.seances.map((s) => (s.debut === '2026-02-03T17:16:00+00:00' ? Object.assign({}, s, { decharge: true }) : s));
    expect(repli(marquees).debut).toBe('2026-01-27T12:54:00+00:00');
  });
  test('la visée est bornée à la zone : un palier tenu à 7 en Lourd vise 5', () => {
    const s = [{ debut: '2026-02-10T10:00:00+00:00', palier: 120, neutre: false, decharge: false,
      series: [1, 2, 3].map(() => ({ charge_kg: 120, reps: 7, rpe: null, role: 'palier', origine: 'palier' })) }];
    expect(repli(s).ligne).toEqual([120, 5]);
  });
  test('la date par `quand` : « mardi » à 6 jours ou moins', () => {
    const r = repli(R2.seances);
    expect(M.phraseRepli(r, '2026-02-07T10:00:00+01:00')).toBe(
      'On repart de 120' + NB + 'kg, ta dernière charge tenue : 120' + NB + 'kg × 4, 4, 4, 4 mardi.');
  });
});

// ── 3. LE CHANGEMENT DE ZONE REMET LE COMPTEUR À ZÉRO ───────────────────────
describe('§14.5 — « Oui » au schéma = la correction de zone (48b-7) : le compteur repart de zéro', () => {
  test('K005 (compteur 4 en Volume) : une zone choisie avant l\'ouverture remet le compteur à 0', () => {
    const c = require('./fixtures/cas-49u13-compteur.json').cas.filter((x) => x.id === 'K005')[0];
    const o = { reglage: c.reglage, equipement: c.equipement, correction: null, toutes: true };
    expect(M.compteurDe(c.seances, c.avant, o).compteur).toBe(4);
    const juste = new Date(new Date(c.avant).getTime() - 60000).toISOString();
    const corrigee = Object.assign({}, o, { corrections: [{ id: 'z1', zone: 'hypertrophie', corrigee_a: juste }] });
    expect(M.compteurDe(c.seances, c.avant, corrigee).compteur).toBe(0);
  });
});

// ── 4. LE n-IÈME DÉCLENCHEMENT ISOLÉ ────────────────────────────────────────
describe('§14.5 — le n-ième déclenchement isolé', () => {
  test('n = (compteur − 4) / 4 + 1 ; sous 4 : 0', () => {
    expect([3, 4, 7, 8, 12, 13, 16].map((c) => M.nIsole(c, 0))).toEqual([0, 1, 1, 2, 3, 3, 4]);
  });
  const carte = (jour, compteur, reponse) => ({ seance: 'K', jour, declencheur: 'couche', compteur, reponse, cites: ['couche'] });
  test('une carte de semaine allégée répondue, dont il était le déclencheur, ne compte pas', () => {
    expect(M.declenchementsRepondus('couche', '2026-10-01', 8, [carte('2026-09-20', 4, 'refusee')], [])).toBe(1);
    expect(M.nIsole(8, 1)).toBe(1);
  });
  test('… sauf si l\'exercice a progressé depuis, ou si un autre la déclenchait', () => {
    const progres = [{ exercice: 'couche', jour: '2026-09-24', compteur: 0 }];
    expect(M.declenchementsRepondus('couche', '2026-10-01', 8, [carte('2026-09-20', 4, 'refusee')], progres)).toBe(0);
    expect(M.declenchementsRepondus('squat', '2026-10-01', 8, [carte('2026-09-20', 4, 'refusee')], [])).toBe(0);
  });
  test('« et tes autres exercices avancent » : aucun autre à 4 ou plus sur 0 à 7 jours', () => {
    expect(M.autresAvancent({ '2026-10-01': { couche: 4, squat: 3 } }, '2026-10-01', 'couche')).toBe(true);
    expect(M.autresAvancent({ '2026-09-25': { squat: 4 }, '2026-10-01': { couche: 4 } }, '2026-10-01', 'couche')).toBe(false);
    expect(M.autresAvancent({ '2026-09-23': { squat: 4 }, '2026-10-01': { couche: 4 } }, '2026-10-01', 'couche')).toBe(true);
  });
});

// ── 5. LE PLAN ──────────────────────────────────────────────────────────────
const DEBUT = '2026-10-01T10:00:00+00:00';
const C = { etat: 'test_propose', zone: 'lourd', palier: 125, niveau: 5, n: 4,
  ligne: { charge: 125, vise: 5 }, haut: { charge: 130, vise: 4, k: 1 }, fondement: {} };
const MEILLEUR = { palier: 125, niveau: 5 };
const REPLI = { palier: 120, niveau: 4, debut: '2026-09-20T10:00:00+00:00', reps: [4, 4, 4, 4], ligne: [120, 4] };
function decor(o) {
  const opt = o || {};
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: opt.seance || 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'couche', id, { series: 4 });
  if (opt.deux) se = S.ajouterExercice(se, 'couche', id, { series: 2 });
  if (opt.geste) se = opt.geste(se);
  const k = Object.assign({}, C, opt.consigne || {});
  const c = { consigne: k, libelles: M.libellesConsigne(k),
    compteur: { compteur: opt.compteur === undefined ? 4 : opt.compteur, meilleur: opt.meilleur || MEILLEUR, blocages: [] },
    repli: opt.repli === undefined ? REPLI : opt.repli };
  const e = { seance: { id: opt.seance || 'S1', debut: DEBUT, edition: !!opt.edition, exercices: se.exercices },
    consignes: { couche: c }, reglage: 'normal', paris: [], suites: {}, phase: opt.phase || 'maintien',
    catalogue: opt.catalogue || null,
    escalier: { cartes: opt.cartes || [], compteurs: opt.compteurs || [], noms: { couche: 'Développé Couché (Barre)' },
                seriesRoutine: { couche: 4 }, marches: opt.marches || [] } };
  return { e, p: T.planDeSeance(e) };
}

describe('§14.5 — le blocage isolé, dans le plan', () => {
  test('zone force, 1er déclenchement : la carte de schéma sous l\'exercice, sans compteur dans l\'en-tête', () => {
    const { e, p } = decor();
    const x = p.exercices[0];
    expect(x.escalier.marche).toBe('schema');
    expect(x.escalier.carte.phrase).toBe('125' + NB + 'kg × 5 reste ton meilleur depuis 4 séances, et tes autres exercices avancent.');
    expect([x.escalier.carte.oui, x.escalier.carte.non, x.escalier.carte.nouvelle_zone]).toEqual(['Passer à 6-8 reps', 'Garder 3-5', 'mix']);
    expect(x.entete.compteur).toBeNull();
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('un autre exercice à 4 ou plus dans les 7 jours : la phrase finit sur un point', () => {
    const { p } = decor({ compteurs: [{ exercice: 'squat', jour: '2026-09-28', compteur: 4, seance: 'X' }] });
    expect(p.exercices[0].escalier.carte.phrase).toBe('125' + NB + 'kg × 5 reste ton meilleur depuis 4 séances.');
  });
  test('Mix → Lourd : « Passer à 3-5 reps » / « Garder 6-8 »', () => {
    const { p } = decor({ consigne: { zone: 'mix' } });
    expect([p.exercices[0].escalier.carte.oui, p.exercices[0].escalier.carte.non]).toEqual(['Passer à 3-5 reps', 'Garder 6-8']);
  });
  test('répondue dans cette séance (oui ou non) : plus de carte, la phrase du compteur revient', () => {
    ['acceptee', 'refusee'].forEach((reponse) => {
      const { e, p } = decor({ marches: [{ seance: 'S1', jour: '2026-10-01', exercice: 'couche', marche: 'schema', reponse }] });
      const x = p.exercices[0];
      expect(x.escalier.carte).toBeUndefined();
      expect(x.escalier.reponse).toBe(reponse);
      expect(x.entete.compteur).toBe('125' + NB + 'kg × 5 reste ton meilleur depuis 4 séances.');
      expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    });
  });
  test('sèche, zone muscle : la phrase grise le dit, sans carte ni pari', () => {
    const { e, p } = decor({ phase: 'seche', consigne: { zone: 'volume', etat: 'progression', haut: null, ligne: { charge: 27, vise: 12 } },
      meilleur: { palier: 27, niveau: 12 } });
    const x = p.exercices[0];
    expect(x.escalier.marche).toBe('seche_rien');
    expect(x.escalier.carte).toBeUndefined();
    expect(octets(x.entete.compteur)).toBe(octets(F.phrases.seche));
    expect(x.paris.filter(Boolean).every((q) => q.module !== 'escalier')).toBe(true);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('zone muscle hors sèche, sans entrée de volume (pas de place) : le repli tout de suite (49-34)', () => {
    const { e, p } = decor({ consigne: { zone: 'volume', etat: 'progression', haut: null, ligne: { charge: 27, vise: 12 } },
      meilleur: { palier: 27, niveau: 12 }, repli: { palier: 25, niveau: 12, debut: '2026-09-20T10:00:00+00:00', reps: [12, 12, 12], ligne: [25, 12] } });
    const x = p.exercices[0];
    expect(x.escalier.marche).toBe('repli');
    expect(x.consigne.repli.palier).toBe(25);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('2e déclenchement : le repli — 120 kg × 4, sans ligne haute ni test, la phrase grise par `quand`', () => {
    const { e, p } = decor({ compteur: 8 });
    const x = p.exercices[0];
    expect(x.escalier.marche).toBe('repli');
    expect([x.consigne.ligne.charge, x.consigne.ligne.vise, x.consigne.haut]).toEqual([120, 4, null]);
    expect(x.lignes.map((l) => [l.role, l.charge, l.vise])).toEqual([['ligne', 120, 4], ['ligne', 120, 4], ['ligne', 120, 4], ['ligne', 120, 4]]);
    expect(x.entete.jaune).toEqual(['120' + NB + 'kg' + NB + '×' + NB + '4']);
    expect(x.entete.gris).toBe('On repart de 120' + NB + 'kg, ta dernière charge tenue : 120' + NB + 'kg × 4, 4, 4, 4 le 20' + NB + 'sept.');
    expect(x.entete.compteur).toBeNull();
    // Les paris de consigne continuent, sur la charge du repli.
    expect(x.paris.filter(Boolean).every((q) => q.fondement.charge === 120)).toBe(true);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('les chauffes se calent sur la charge du repli', () => {
    const geste = (se) => S.insererChauffes(se, 0, [{ reps: 8, charge: null }, { reps: 5, charge: null }], (() => { let k = 0; return () => 'c' + (++k); })());
    const catalogue = { couche: { equipement: 'barre', muscles_primaires: ['pectoraux'] } };
    const avec = decor({ compteur: 8, geste, catalogue }).p.exercices[0];
    const sans = decor({ compteur: 4, geste, catalogue, marches: [{ seance: 'S1', exercice: 'couche', marche: 'schema', reponse: 'refusee' }] }).p.exercices[0];
    expect(avec.chauffes && avec.chauffes.reference).toBe(120);
    expect(sans.chauffes && sans.chauffes.reference).toBe(125);
  });
  test('repli sauté (aucun palier ne remplit les cinq conditions) : le silence', () => {
    const { e, p } = decor({ compteur: 8, repli: null });
    const x = p.exercices[0];
    expect(x.escalier.marche).toBe('silence');
    expect(x.escalier.saute).toBe(true);
    expect(x.consigne.repli).toBeUndefined();
    expect(x.entete.compteur).toBeNull();
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('3e déclenchement : le silence — la phrase quitte l\'en-tête ; entre deux déclenchements aussi', () => {
    [12, 13, 16].forEach((k) => {
      const x = decor({ compteur: k }).p.exercices[0];
      expect(x.escalier.marche).toBe('silence');
      expect(x.escalier.declenchement).toBe(k % 4 === 0);
      expect(x.entete.compteur).toBeNull();
    });
    // Entre le 1er et le 2e déclenchement : rien de l'escalier.
    expect(decor({ compteur: 5 }).p.exercices[0].escalier).toBeNull();
  });
  test('le silence passe UNE fois dans le constat de fin de bloc', () => {
    const toutes = (se) => {
      let x = se;
      [0, 1, 2, 3].forEach((i) => {
        x = S.modifierSerie(x, 0, i, { charge_kg: 125, reps: 5 });
        x = S.valider(x, 0, i, '2026-10-01T10:0' + i + ':00Z');
      });
      return x;
    };
    const suite = { consigne: Object.assign({}, C), cranSuivant: 127.5 };
    const avecSuite = (o) => {
      const d = decor(o);
      d.e.suites = { couche: suite };
      return T.planDeSeance(d.e).exercices[0];
    };
    const a12 = avecSuite({ compteur: 12, geste: toutes });
    expect(a12.constat).not.toBeNull();
    expect(a12.constat.escalier).toBe('125' + NB + 'kg × 5 reste ton meilleur depuis 12 séances.');
    expect(avecSuite({ compteur: 13, geste: toutes }).constat.escalier).toBeUndefined();
  });
  test('un exercice présent deux fois : une seule marche (sur la première occurrence)', () => {
    const { e, p } = decor({ deux: true });
    expect(p.exercices.map((x) => !!(x.escalier && x.escalier.carte))).toEqual([true, false]);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('après une carte de semaine allégée refusée à 4 : au 8, le schéma (n = 1)', () => {
    const refus = { seance: 'S0', jour: '2026-09-20', declencheur: 'couche', compteur: 4, reponse: 'refusee', cites: ['couche', 'a', 'b'] };
    const x = decor({ compteur: 8, cartes: [refus] }).p.exercices[0];
    expect(x.escalier.marche).toBe('schema');
  });
});

describe('§14.5 — I21 : une marche à la fois, jamais pendant une semaine allégée', () => {
  test('pendant une semaine allégée : aucune marche, aucun repli', () => {
    const acceptee = { seance: 'S0', jour: '2026-09-30', declencheur: 'squat', compteur: 4, reponse: 'acceptee',
      debut: '2026-09-30', fin: '2026-10-06', cites: ['squat'] };
    [4, 8, 12].forEach((k) => {
      const { e, p } = decor({ compteur: k, cartes: [acceptee] });
      expect(p.allegee).not.toBeNull();
      expect(p.exercices[0].escalier).toBeNull();
      expect(p.exercices[0].consigne.repli).toBeUndefined();
      expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    });
  });
  test('cité par la carte de semaine allégée (ouverte, ou répondue dans la séance) : pas de marche isolée', () => {
    const autres = [{ exercice: 'squat', jour: '2026-09-29', compteur: 5, seance: 'X1' },
      { exercice: 'rowing', jour: '2026-09-28', compteur: 4, seance: 'X2' }];
    const ouverte = decor({ compteurs: autres }).p;
    expect(ouverte.carte.declencheur).toBe('couche');
    expect(ouverte.exercices[0].escalier).toBeNull();
    const refus = { seance: 'S1', jour: '2026-10-01', declencheur: 'couche', compteur: 4, reponse: 'refusee', cites: ['couche', 'squat', 'rowing'] };
    expect(decor({ compteurs: autres, cartes: [refus] }).p.exercices[0].escalier).toBeNull();
  });
  test('en Édition : rien', () => {
    expect(decor({ edition: true }).p.exercices[0].escalier).toBeNull();
  });
  test('des violations forgées sont vues', () => {
    const { e, p } = decor();
    const pendant = JSON.parse(JSON.stringify(p));
    pendant.allegee = { debut: '2026-10-01', fin: '2026-10-07' };
    expect(T.verifierPlan(pendant).erreurs.some((x) => /^I21 .*pendant une semaine allégée/.test(x))).toBe(true);
    const cite = JSON.parse(JSON.stringify(p));
    cite.carte = { declencheur: 'squat', cites: ['squat', 'couche'] };
    expect(T.verifierPlan(cite).erreurs.some((x) => /^I21 .*cité par la carte/.test(x))).toBe(true);
    const deux = JSON.parse(JSON.stringify(p));
    deux.exercices.push(JSON.parse(JSON.stringify(deux.exercices[0])));
    expect(T.verifierPlan(deux).erreurs.some((x) => /^I21 .*seconde marche/.test(x))).toBe(true);
    const double = JSON.parse(JSON.stringify(p));
    double.exercices[0].consigne.repli = REPLI;
    expect(T.verifierPlan(double).erreurs.some((x) => /^I21 .*schéma ET un repli/.test(x))).toBe(true);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
});

describe('§14.5 — I22 : la consigne de repli, sans ligne haute, à 10 % au plus sous le meilleur', () => {
  const base = () => JSON.parse(JSON.stringify(decor({ compteur: 8 }).p));
  test('une ligne haute sur le repli', () => {
    const f = base();
    f.exercices[0].consigne.haut = { charge: 125, vise: 4, k: 1 };
    expect(T.verifierPlan(f).erreurs.some((x) => /^I22 .*ligne haute/.test(x))).toBe(true);
  });
  test('un test dans les lignes du repli', () => {
    const f = base();
    f.exercices[0].planInitial[3].role = 'haut';
    expect(T.verifierPlan(f).erreurs.some((x) => /^I22 .*est un test/.test(x))).toBe(true);
  });
  test('à plus de 10 % sous le meilleur (110 pour 125), ou pas sous lui (125)', () => {
    const loin = base();
    loin.exercices[0].consigne.ligne.charge = 110;
    expect(T.verifierPlan(loin).erreurs.some((x) => /^I22 .*plus de 10 %/.test(x))).toBe(true);
    const egal = base();
    egal.exercices[0].consigne.ligne.charge = 125;
    expect(T.verifierPlan(egal).erreurs.some((x) => /^I22 .*pas sous le meilleur/.test(x))).toBe(true);
  });
});

// ── 6. LES PARIS ────────────────────────────────────────────────────────────
describe('§14.5 — les paris de l\'escalier : identifiants et observations', () => {
  test('identifiant : `escalier|séance|exercice|marche`, distinct d\'une consigne et de la semaine allégée', async () => {
    const schema = await M.idDEscalier('S1', 'couche', 'schema');
    const repli = await M.idDEscalier('S1', 'couche', 'repli');
    expect(schema).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await M.idDEscalier('S1', 'couche', 'schema')).toBe(schema);
    expect(new Set([schema, repli, await M.idDEscalier('S1', null, 'semaine_allegee'),
      await M.idDEscalier('S1', 'squat', 'schema'), await M.idDePrediction('S1', 'couche', 1, 0)]).size).toBe(5);
  });
  test('lus dans les paris : l\'exercice vient du fondement, la colonne `exercise_slug` reste vide', () => {
    const l = { id: 'x', module: 'escalier', exercise_slug: null,
      fondement: { seance: 'S1', jour: '2026-10-01', exercice: 'couche', marche: 'repli', reponse: 'appliquee', compteur: 8 } };
    expect(M.marchesDesParis([l])).toEqual([{ id: 'x', seance: 'S1', jour: '2026-10-01', exercice: 'couche',
      marche: 'repli', reponse: 'appliquee', compteur: 8, debut: null, n: null }]);
    // Une carte de semaine allégée n'est pas une marche isolée, et l'inverse.
    expect(M.marchesDesParis([Object.assign({}, l, { fondement: { marche: 'semaine_allegee' } })])).toEqual([]);
    expect(M.cartesDesParis([l])).toEqual([]);
  });
  const k = (jour, compteur) => ({ exercice: 'couche', jour, compteur, seance: 'K' + jour, debut: jour + 'T10:00:00Z' });
  test('repli appliqué : 1 au progrès avant le prochain déclenchement, 0 au déclenchement', () => {
    const m = { exercice: 'couche', jour: '2026-10-01', compteur: 8, marche: 'repli', reponse: 'appliquee' };
    expect(M.observationMarche(m, [k('2026-10-04', 9), k('2026-10-07', 0)]).valeur).toBe(1);
    expect(M.observationMarche(m, [k('2026-10-04', 9), k('2026-10-07', 10), k('2026-10-12', 12)])).toEqual(
      { valeur: 0, jour: '2026-10-12', seance: 'K2026-10-12', debut: '2026-10-12T10:00:00Z' });
    expect(M.observationMarche(m, [k('2026-10-04', 9), k('2026-10-07', 10)])).toBeNull();
  });
  test('schéma accepté : la remise à zéro du changement de zone n\'est PAS un progrès', () => {
    const m = { exercice: 'couche', jour: '2026-10-01', compteur: 4, marche: 'schema', reponse: 'acceptee' };
    expect(M.observationMarche(m, [k('2026-10-04', 0), k('2026-10-07', 1)])).toBeNull();
    expect(M.observationMarche(m, [k('2026-10-04', 0), k('2026-10-07', 1), k('2026-10-10', 0)]).valeur).toBe(1);
    expect(M.observationMarche(m, [k('2026-10-04', 1), k('2026-10-07', 2), k('2026-10-10', 3), k('2026-10-14', 4)]).valeur).toBe(0);
  });
  test('refusé : jamais observé', () => {
    const m = { exercice: 'couche', jour: '2026-10-01', compteur: 4, marche: 'schema', reponse: 'refusee' };
    expect(M.observationMarche(m, [k('2026-10-04', 0), k('2026-10-07', 1), k('2026-10-10', 0)])).toBeNull();
  });
});

// ── 49-35 (#348) — UNE MARCHE PROPOSÉE NE REVIENT PAS, QUELLE QU'ELLE SOIT ─────
describe('§14.7 (delta 49-35) — une marche proposée ne revient pas : la même règle pour le schéma', () => {
  const schema = (reponse, seance, jour) => ({ seance: seance || 'S0', jour: jour || '2026-10-01', exercice: 'couche',
    marche: 'schema', reponse, compteur: 4 });
  test('rouvrir une séance au même déclenchement après un schéma REFUSÉ : pas de carte', () => {
    const { e, p } = decor({ seance: 'S2', marches: [schema('refusee')] });
    expect(p.exercices[0].escalier.marche).toBe('schema');
    expect(p.exercices[0].escalier.carte).toBeUndefined();
    expect(p.exercices[0].escalier.reponse).toBe('refusee');
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('… après un schéma ACCEPTÉ (une autre séance, même déclenchement) : pas de carte', () => {
    expect(decor({ seance: 'S2', marches: [schema('acceptee')] }).p.exercices[0].escalier.carte).toBeUndefined();
  });
  test('après un progrès depuis, la marche peut revenir au déclenchement suivant', () => {
    const progres = [{ exercice: 'couche', jour: '2026-09-25', compteur: 0, seance: 'X' }];
    const d = decor({ seance: 'S2', marches: [schema('refusee', 'S0', '2026-09-20')], compteurs: progres });
    expect(d.p.exercices[0].escalier.carte).toBeDefined();
  });
  test('une seule fonction : `marcheProposee` dit la même chose pour les deux marches', () => {
    const m = (marche) => [{ exercice: 'x', jour: '2026-10-01', marche, reponse: 'refusee', compteur: 4 }];
    ['schema', 'serie_de_plus'].forEach((marche) => {
      expect(M.marcheProposee('x', '2026-10-03', 4, m(marche), [], marche)).not.toBeNull();
      expect(M.marcheProposee('x', '2026-10-03', 4, m(marche), [{ exercice: 'x', jour: '2026-10-02', compteur: 0 }], marche)).toBeNull();
    });
    expect(M.marcheProposee('x', '2026-10-03', 4, m('schema'), [], 'serie_de_plus')).toBeNull();
  });
});
