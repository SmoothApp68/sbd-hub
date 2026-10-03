/** @jest-environment node */
//
// 49-U20 — LES EXERCICES FRÈRES (MOTEUR §13.6, delta 49-40). « Quand un
// exercice est bloqué et qu'un frère progresse pendant ce temps, le coach le
// montre côte à côte, sans conclure ; l'escalier propose sa marche comme
// d'habitude. »
//
//   1. Les 10 cas de `coach49.py` (`cas-49u20-freres.json`) : le frère, son
//      « avant », son « maintenant », la phrase — par le formateur unique,
//      comparée après normalisation des espaces autour de « × » (#345).
//   2. La règle, une condition à la fois.
//   3. Les frères au catalogue (`THModele.freresDe`) : le `mouvement`, pas la
//      `famille`.
//   4. Le moteur de bout en bout : les verdicts des frères viennent de
//      `compteurDe`, rejoués seulement à 4 ou plus.
//   5. Le plan : la phrase après le compteur (en-tête et feuille), I26 sans
//      écart, et la marche de l'escalier toujours proposée.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const Modele = require('../../v2/js/modele.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const F = require('./fixtures/cas-49u20-freres.json');
const NB = ' ';
const octets = (s) => (s === null || s === undefined ? s : Buffer.from(s, 'utf8').toString('hex'));
// Le cas écrit des espaces ordinaires autour de « × » ; `chargeFois`, des
// insécables (décidé le 01/10/2026, #345).
const surFormateur = (s) => s.replace(/ × /g, NB + '×' + NB);

// Le fichier de cas → les entrées du moteur : un meilleur `[kg, niveau]`
// devient `{ palier, niveau }` ; le nom sert d'identifiant.
const meilleur = (m) => (m ? { palier: m[0], niveau: m[1] } : null);
const verdicts = (l) => l.map((v) => ({ debut: v.debut, zone: v.zone, progres: v.progres, meilleur: meilleur(v.meilleur) }));
const freresDuCas = (c, garder) => Object.keys(c.freres).filter((n) => !garder || garder(n))
  .map((nom) => ({ id: nom, nom, verdicts: verdicts(c.freres[nom]) }));
const resoudre = (c, garder) => M.frereQuiProgresse({ verdicts: verdicts(c.bloque.verdicts) }, freresDuCas(c, garder), c.avant);
const cas = (id) => F.cas.filter((c) => c.id === id)[0];
const enListe = (m) => (m ? [m.palier, m.niveau] : null);

// ── 1. LES 10 CAS ───────────────────────────────────────────────────────────
describe('§13.6 — les 10 cas du simulateur (cas-49u20-freres.json)', () => {
  test('10 cas : 5 frères qui progressent, 2 sans « avant », 3 où les frères sont bloqués aussi', () => {
    expect(F.cas).toHaveLength(10);
    const a = F.cas.map((c) => c.attendu);
    expect(a.filter((x) => x === null)).toHaveLength(3);
    expect(a.filter((x) => x && x.avant === null)).toHaveLength(2);
    expect(a.filter((x) => x && x.avant !== null)).toHaveLength(5);
  });

  F.cas.forEach((c) => {
    test(c.id + ' — ' + c.titre, () => {
      const r = resoudre(c);
      if (c.attendu === null) {
        expect(r).toBeNull();
        return;
      }
      expect([r.nom, enListe(r.avant), enListe(r.maintenant)])
        .toEqual([c.attendu.frere, c.attendu.avant, c.attendu.maintenant]);
      expect(octets(M.phraseFrere(r))).toBe(octets(surFormateur(c.attendu.phrase)));
    });
  });
});

// ── 2. LA RÈGLE ─────────────────────────────────────────────────────────────
describe('§13.6 — la règle, une condition à la fois', () => {
  test('DISCRIMINANT — un frère dont le meilleur n’a pas monté est ignoré (« 134 kg × 10 → 134 kg × 10 », F010)', () => {
    // Seul, l'écarté à la machine : des progrès pendant le blocage (une remise
    // à zéro, puis des hausses), mais il finit où il était.
    const c = cas('F010');
    expect(resoudre(c, (n) => n === 'Écarté (Machine)')).toBeNull();
    // Avec l'écarté à la poulie basse, c'est lui — même si la machine, au même
    // dernier progrès, passerait devant par l'ordre alphabétique.
    expect(resoudre(c).nom).toBe('Écartés Poulie Basse');
  });

  test('DISCRIMINANT — un « avant » d’une autre zone : pas de flèche, « progresse » (F006)', () => {
    const r = resoudre(cas('F006'));
    expect(r.avant).toBeNull();
    expect(M.phraseFrere(r)).toBe('Pendant ce temps, Développé Couché (Barre) progresse : 80' + NB + 'kg' + NB + '×' + NB + '8.');
    // Dans la même zone, la flèche (F007 : « volume » et « volume »).
    expect(resoudre(cas('F007')).avant).toEqual({ palier: 50, niveau: 20 });
  });

  test('le progrès doit venir STRICTEMENT après le début du blocage (F003), et avant la séance', () => {
    const c = cas('F003');
    expect(resoudre(c)).toBeNull();
    // Une minute après le dernier progrès de l'exercice bloqué : il compte.
    const plusTard = JSON.parse(JSON.stringify(c));
    plusTard.freres['Élévation Latérale (Poulie)'].push(
      { debut: '2025-08-21T10:00:00+00:00', zone: 'series_longues', progres: true, meilleur: [6.0, 20] });
    expect(enListe(resoudre(plusTard).maintenant)).toEqual([6, 20]);
    // Le jour de la séance, à son heure : il ne compte pas encore.
    const aLHeure = JSON.parse(JSON.stringify(c));
    aLHeure.freres['Élévation Latérale (Poulie)'].push(
      { debut: c.avant, zone: 'series_longues', progres: true, meilleur: [6.0, 20] });
    expect(resoudre(aLHeure)).toBeNull();
  });

  test('plusieurs frères : le progrès le plus récent, puis l’ordre alphabétique', () => {
    const bloque = { verdicts: [{ debut: '2026-09-01T10:00:00Z', zone: 'volume', progres: true, meilleur: { palier: 50, niveau: 10 } }] };
    const f = (nom, quand, kg) => ({ id: nom, nom, verdicts: [
      { debut: '2026-08-25T10:00:00Z', zone: 'volume', progres: true, meilleur: { palier: kg - 2, niveau: 10 } },
      { debut: quand, zone: 'volume', progres: true, meilleur: { palier: kg, niveau: 10 } }] });
    const avant = '2026-09-30T10:00:00Z';
    expect(M.frereQuiProgresse(bloque, [f('B', '2026-09-10T10:00:00Z', 30), f('A', '2026-09-05T10:00:00Z', 30)], avant).nom).toBe('B');
    expect(M.frereQuiProgresse(bloque, [f('B', '2026-09-10T10:00:00Z', 30), f('A', '2026-09-10T10:00:00Z', 30)], avant).nom).toBe('A');
  });

  test('sans aucun progrès, le blocage court depuis le premier verdict', () => {
    const bloque = { verdicts: [
      { debut: '2026-09-01T10:00:00Z', zone: 'volume', progres: false, meilleur: { palier: 50, niveau: 10 } },
      { debut: '2026-09-08T10:00:00Z', zone: 'volume', progres: false, meilleur: { palier: 50, niveau: 10 } }] };
    const frere = { id: 'f', nom: 'F', verdicts: [
      { debut: '2026-09-05T10:00:00Z', zone: 'volume', progres: true, meilleur: { palier: 20, niveau: 10 } }] };
    expect(M.frereQuiProgresse(bloque, [frere], '2026-09-30T10:00:00Z').nom).toBe('F');
    expect(M.frereQuiProgresse({ verdicts: [] }, [frere], '2026-09-30T10:00:00Z')).toBeNull();
  });

  test('un « maintenant » sans niveau ne se dit pas ; un « avant » sans niveau, sans flèche', () => {
    const bloque = { verdicts: [{ debut: '2026-09-01T10:00:00Z', zone: 'volume', progres: true, meilleur: { palier: 50, niveau: 10 } }] };
    const v = (debut, progres, palier, niveau) => ({ debut, zone: 'volume', progres, meilleur: { palier, niveau } });
    const avant = '2026-09-30T10:00:00Z';
    expect(M.frereQuiProgresse(bloque, [{ id: 'f', nom: 'F', verdicts: [v('2026-08-20T10:00:00Z', true, 20, 10),
      v('2026-09-10T10:00:00Z', true, 22, null)] }], avant)).toBeNull();
    const r = M.frereQuiProgresse(bloque, [{ id: 'f', nom: 'F', verdicts: [v('2026-08-20T10:00:00Z', true, 20, null),
      v('2026-09-10T10:00:00Z', true, 22, 10)] }], avant);
    expect(r.avant).toBeNull();
    expect(M.phraseFrere(r)).toMatch(/^Pendant ce temps, F progresse : 22/);
  });

  test('la phrase déclare « avant » et « maintenant » comme faits passés, chacun sa source', () => {
    const r = resoudre(cas('F004'));
    const cap = Modele.capturer(() => M.phraseFrere(r));
    expect(cap.citations.map((q) => [q.nature, q.objet.quoi, q.charge, q.reps])).toEqual([
      ['fait_passe', 'frere.avant', 72.5, [5]], ['fait_passe', 'frere.maintenant', 80, [5]]]);
    // Hors capture, le même texte.
    expect(M.phraseFrere(r)).toBe(cap.texte);
  });
});

// ── 3. LES FRÈRES AU CATALOGUE ──────────────────────────────────────────────
describe('§13.6 — les frères au catalogue : le même `mouvement` (THModele.freresDe)', () => {
  // Le catalogue réel (migration v2_053) : le couché à plat et l'incliné sont
  // de la même FAMILLE (push_h), mais pas du même mouvement.
  const INDEX = Modele.indexerExercices([
    { slug: 'developpe_couche_barre', nom: 'Développé Couché (Barre)', famille: 'push_h', mouvement: 'developpe_couche' },
    { slug: 'developpe_couche_haltere', nom: 'Développé Couché (Haltère)', famille: 'push_h', mouvement: 'developpe_couche' },
    { slug: 'chest_press_machine', nom: 'Chest Press (Machine)', famille: 'push_h', mouvement: 'developpe_couche' },
    { slug: 'developpe_couche_incline_barre', nom: 'Développé Couché Incliné (Barre)', famille: 'push_h', mouvement: 'developpe_incline' },
    { slug: 'pull_over', nom: 'Pull-over', famille: 'push_h', mouvement: null },
    { slug: 'mollets_assis', nom: 'Mollets Assis', famille: 'mollets' }
  ]);

  test('DISCRIMINANT — le même mouvement, pas la même famille ; lui excepté ; trié', () => {
    expect(Modele.freresDe(INDEX, 'developpe_couche_barre')).toEqual(['chest_press_machine', 'developpe_couche_haltere']);
    expect(Modele.freresDe(INDEX, 'developpe_couche_incline_barre')).toEqual([]);
  });

  test('`NULL`, une colonne absente (catalogue en cache d’avant 49-U20), un slug inconnu : aucun frère', () => {
    expect(Modele.freresDe(INDEX, 'pull_over')).toEqual([]);
    expect(Modele.freresDe(INDEX, 'mollets_assis')).toEqual([]);
    expect(Modele.freresDe(INDEX, 'inconnu')).toEqual([]);
    expect(Modele.freresDe(null, 'developpe_couche_barre')).toEqual([]);
  });
});

// ── 4. LE MOTEUR DE BOUT EN BOUT ────────────────────────────────────────────
// Le couché à la barre : 25 kg × 12, six séances, les cinq dernières sous
// consigne → 4 séances suivies sans progrès depuis le jour 3. Le couché aux
// haltères, son frère : 20 kg × 12 avant le blocage, puis 22 et 24 pendant.
const jour = (n) => new Date(Date.UTC(2026, 8, 1 + n, 17)).toISOString();
const groupe = (id, n, kg, reps) => ({
  seance: { id, debut: jour(n) },
  series: reps.map((r, j) => ({ id: id + '-' + j, charge_kg: kg, reps: r, rpe: null, ressenti: null,
    type_serie: 'travail', validee_a: jour(n) }))
});
const BARRE = [0, 3, 6, 9, 12, 15].map((n, i) => groupe('B' + i, n, 25, [12, 12, 12]));
const HALTERES = [groupe('H0', 1, 20, [12, 12, 12]), groupe('H1', 2, 20, [12, 12, 12]),
  groupe('H2', 7, 22, [12, 12, 12]), groupe('H3', 13, 24, [12, 12, 12])];
const AVANT = jour(18);
const BASE = { mesure: 'charge_reps', reglage: 'normal', equipement: 'barre', intention: 'progresser' };
const optionsBarre = (ids) => Object.assign({ seancesSousConsigne: ids || ['B1', 'B2', 'B3', 'B4', 'B5'] }, BASE);
const frereHalteres = (extra) => Object.assign({ slug: 'dc-h', nom: 'Développé Couché (Haltère)', groupes: HALTERES, etat: null,
  options: Object.assign({}, BASE, { equipement: 'haltere', seancesSousConsigne: ['H1', 'H2', 'H3'] }) }, extra || {});

describe('§13.6 — le moteur : les verdicts des frères viennent de `compteurDe`, rejoués à 4 ou plus', () => {
  test('le compteur des haltères, rejoué par `compteurDe` : son meilleur à chaque verdict', () => {
    const k = M.consigneDExercice(HALTERES, null, AVANT, Object.assign({}, BASE, { seancesSousConsigne: ['H1', 'H2', 'H3'] }));
    expect(k.compteur.meilleur).toEqual({ palier: 24, niveau: 12 });
  });

  test('DISCRIMINANT — à 4, le frère qui progresse est figé avec la consigne : « 20 kg × 12 → 24 kg × 12 »', () => {
    let demandes = 0;
    const k = M.consigneDExercice(BARRE, null, AVANT, Object.assign(optionsBarre(), {
      freres: () => { demandes++; return [frereHalteres()]; } }));
    expect(k.compteur.compteur).toBe(4);
    expect(demandes).toBe(1);
    expect(k.frere).toEqual({ id: 'dc-h', nom: 'Développé Couché (Haltère)',
      avant: { palier: 20, niveau: 12 }, maintenant: { palier: 24, niveau: 12 } });
    expect(M.phraseFrere(k.frere).replace(/ /g, ' ')).toBe('Pendant ce temps, Développé Couché (Haltère) : 20 kg × 12 → 24 kg × 12.');
    // L'escalier n'en tient aucun compte : le repli possible est le même.
    const sans = M.consigneDExercice(BARRE, null, AVANT, optionsBarre());
    expect(k.repli).toEqual(sans.repli);
    expect(k.compteur).toEqual(sans.compteur);
    expect(sans.frere).toBeNull();
  });

  test('sous 4 : les frères ne sont même pas demandés (aucun rejeu)', () => {
    let demandes = 0;
    const k = M.consigneDExercice(BARRE, null, AVANT, Object.assign(optionsBarre(['B1', 'B2', 'B3', 'B4']), {
      freres: () => { demandes++; return [frereHalteres()]; } }));
    expect(k.compteur.compteur).toBe(3);
    expect(demandes).toBe(0);
    expect(k.frere).toBeNull();
  });

  test('DISCRIMINANT — un historique d’avant le coach (sans pari) donne son « avant » : le frère se rejoue sur TOUTES ses séances', () => {
    // 40 kg × 12 avant le blocage, SANS pari (importé), puis une première
    // séance pariée pendant le blocage. Sur ses seules séances pariées, elle
    // était une remise à zéro — un « progrès » : « progresse : 30 kg × 12 ».
    const histo = (kg) => [groupe('I0', -20, 40, [12, 12, 12]), groupe('I1', 1, 40, [12, 12, 12]), groupe('I2', 7, kg, [12, 12, 12])];
    const importe = (kg) => frereHalteres({ groupes: histo(kg),
      options: Object.assign({}, BASE, { equipement: 'haltere', seancesSousConsigne: ['I2'] }) });
    const avec = (kg) => M.consigneDExercice(BARRE, null, AVANT, Object.assign(optionsBarre(), { freres: () => [importe(kg)] })).frere;
    expect(avec(30)).toBeNull();
    expect(avec(40)).toBeNull();
    expect(avec(44)).toEqual({ id: 'dc-h', nom: 'Développé Couché (Haltère)',
      avant: { palier: 40, niveau: 12 }, maintenant: { palier: 44, niveau: 12 } });
  });

  test('le pré-filtre : un frère sans séance pendant le blocage, ou mesuré autrement, n’est même pas rejoué', () => {
    // `etat` n'est lu que par le rejeu (`contratDe`) : il compte les rejeux.
    let rejeux = 0;
    const compte = (extra) => Object.defineProperty(frereHalteres(extra), 'etat', { get() { rejeux++; return null; } });
    const k = (f) => M.consigneDExercice(BARRE, null, AVANT, Object.assign(optionsBarre(), { freres: () => [f] })).frere;
    expect(k(compte({ groupes: HALTERES.slice(0, 2) }))).toBeNull();
    expect(k(compte({ options: Object.assign({}, BASE, { mesure: 'reps', seancesSousConsigne: ['H1', 'H2', 'H3'] }) }))).toBeNull();
    expect(rejeux).toBe(0);
    expect(k(compte())).not.toBeNull();
    expect(rejeux).toBe(1);
  });
});

describe('§13.6 — le blocage court depuis le DERNIER progrès ; « avant » est le DERNIER verdict au début du blocage', () => {
  const v = (debut, progres, palier, niveau) => ({ debut, zone: 'volume', progres, meilleur: { palier, niveau } });
  const AVANT_S = '2026-09-30T10:00:00Z';
  test('DISCRIMINANT — deux progrès de l’exercice bloqué : le blocage part du second', () => {
    const bloque = { verdicts: [v('2026-09-01T10:00:00Z', true, 50, 10), v('2026-09-10T10:00:00Z', true, 52.5, 10),
      v('2026-09-14T10:00:00Z', false, 52.5, 10), v('2026-09-18T10:00:00Z', false, 52.5, 10)] };
    const avantLeSecond = { id: 'f', nom: 'F', verdicts: [v('2026-08-28T10:00:00Z', true, 20, 10), v('2026-09-05T10:00:00Z', true, 22, 10)] };
    expect(M.frereQuiProgresse(bloque, [avantLeSecond], AVANT_S)).toBeNull();
    const apres = { id: 'f', nom: 'F', verdicts: [v('2026-08-28T10:00:00Z', true, 20, 10), v('2026-09-12T10:00:00Z', true, 22, 10)] };
    expect(M.frereQuiProgresse(bloque, [apres], AVANT_S).avant).toEqual({ palier: 20, niveau: 10 });
  });
  test('DISCRIMINANT — deux verdicts du frère avant le blocage : « avant » est le plus récent (45, pas 40)', () => {
    const bloque = { verdicts: [v('2026-09-10T10:00:00Z', true, 60, 10)] };
    const frere = { id: 'f', nom: 'F', verdicts: [v('2026-09-02T10:00:00Z', true, 40, 10), v('2026-09-08T10:00:00Z', true, 45, 10),
      v('2026-09-20T10:00:00Z', true, 48, 10)] };
    expect(M.phraseFrere(M.frereQuiProgresse(bloque, [frere], AVANT_S)).replace(/\u00a0/g, ' '))
      .toBe('Pendant ce temps, F : 45 kg × 10 → 48 kg × 10.');
  });
  test('un « avant » sans niveau dont le palier n’a pas monté : écarté (pas un progrès)', () => {
    const bloque = { verdicts: [v('2026-09-10T10:00:00Z', true, 60, 10)] };
    const frere = { id: 'f', nom: 'F', verdicts: [v('2026-09-02T10:00:00Z', true, 45, null), v('2026-09-20T10:00:00Z', true, 40, 10)] };
    expect(M.frereQuiProgresse(bloque, [frere], AVANT_S)).toBeNull();
  });
});

// ── 5. LE PLAN ──────────────────────────────────────────────────────────────
const DEBUT = '2026-10-01T10:00:00+00:00';
const C = { etat: 'test_propose', zone: 'lourd', palier: 125, niveau: 5, n: 4,
  ligne: { charge: 125, vise: 5 }, haut: { charge: 130, vise: 4, k: 1 }, fondement: {} };
const MEILLEUR = { palier: 125, niveau: 5 };
const REPLI = { palier: 120, niveau: 4, debut: '2026-09-20T10:00:00+00:00', reps: [4, 4, 4, 4], ligne: [120, 4] };
const FRERE = { id: 'couche-h', nom: 'Développé Couché (Haltère)', avant: { palier: 40, niveau: 10 }, maintenant: { palier: 42, niveau: 10 } };
const PHRASE = 'Pendant ce temps, Développé Couché (Haltère) : 40' + NB + 'kg' + NB + '×' + NB + '10 → 42' + NB + 'kg' + NB + '×' + NB + '10.';
function decor(o) {
  const opt = o || {};
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'couche', id, { series: 4 });
  const k = Object.assign({}, C, opt.consigne || {});
  const c = { consigne: k, libelles: M.libellesConsigne(k),
    compteur: { compteur: opt.compteur === undefined ? 5 : opt.compteur, meilleur: opt.meilleur || MEILLEUR, blocages: [] },
    repli: opt.repli === undefined ? REPLI : opt.repli };
  if (opt.frere !== null) c.frere = opt.frere || FRERE;
  const e = { seance: { id: 'S1', debut: DEBUT, edition: false, exercices: se.exercices },
    consignes: { couche: c }, reglage: 'normal', paris: [], suites: {}, phase: opt.phase || 'maintien',
    escalier: { cartes: opt.cartes || [], compteurs: [], noms: { couche: 'Développé Couché (Barre)' },
                seriesRoutine: { couche: 4 }, marches: [] } };
  return { e, p: T.planDeSeance(e) };
}

describe('§13.6 — le plan : après le compteur, côte à côte, la marche maintenue', () => {
  test('à 5 (entre deux déclenchements) : la phrase après celle du compteur, dans l’en-tête et la feuille ; I26 sans écart', () => {
    const { e, p } = decor();
    const x = p.exercices[0];
    expect(x.escalier).toBeNull();
    expect(x.entete.compteur).toBe('125' + NB + 'kg × 5 reste ta meilleure charge de travail depuis 5 séances.');
    expect(x.entete.frere).toBe(PHRASE);
    expect(x.pourquoi.frere).toBe(PHRASE);
    expect(x.frere).toEqual({ slug: 'couche-h', nom: 'Développé Couché (Haltère)',
      avant: { palier: 40, niveau: 10 }, maintenant: { palier: 42, niveau: 10 } });
    // L'ordre des phrases : le compteur, puis le frère.
    const ou = x.phrases.map((q) => q.ou);
    expect(ou.indexOf('entete.frere')).toBe(ou.indexOf('entete.compteur') + 1);
    expect(T.verifierPhrases(p)).toEqual([]);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('DISCRIMINANT — à 4, en zone force : la carte de schéma est TOUJOURS proposée, et la phrase du frère est là', () => {
    const { e, p } = decor({ compteur: 4 });
    const x = p.exercices[0];
    expect(x.escalier.marche).toBe('schema');
    expect(x.escalier.carte.oui).toBe('Passer à 6-8 reps');
    expect(x.entete.compteur).toBeNull();
    expect(x.entete.frere).toBe(PHRASE);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    // Sans frère, la même carte, à l'identique.
    expect(decor({ compteur: 4, frere: null }).p.exercices[0].escalier).toEqual(x.escalier);
  });

  test('en sèche (zone muscle) : la phrase sèche du compteur, puis le frère', () => {
    const { e, p } = decor({ compteur: 4, phase: 'seche', meilleur: { palier: 27, niveau: 12 },
      consigne: { zone: 'volume', etat: 'progression', haut: null, ligne: { charge: 27, vise: 12 } } });
    const x = p.exercices[0];
    expect(x.escalier.marche).toBe('seche_rien');
    expect(x.entete.compteur).toMatch(/reste ta meilleure charge de travail depuis 4 séances/);
    expect(x.entete.frere).toBe(PHRASE);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('le repli et le silence le taisent avec le compteur ; sous 4, rien', () => {
    [8, 12, 13].forEach((k) => {
      const { e, p } = decor({ compteur: k });
      const x = p.exercices[0];
      expect([k, x.escalier.marche, x.entete.compteur, x.entete.frere, x.frere])
        .toEqual([k, k === 8 ? 'repli' : 'silence', null, undefined, null]);
      expect('frere' in x.pourquoi).toBe(false);
      expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    });
    const x3 = decor({ compteur: 3 }).p.exercices[0];
    expect([x3.entete.frere, x3.frere]).toEqual([undefined, null]);
  });

  test('pendant une semaine allégée, le compteur se tait, et le frère avec lui', () => {
    const cartes = [{ seance: 'S0', jour: '2026-09-30', declencheur: 'couche', compteur: 4, reponse: 'acceptee',
      debut: '2026-09-30', fin: '2026-10-06' }];
    const { e, p } = decor({ cartes });
    const x = p.exercices[0];
    expect(p.allegee).not.toBeNull();
    expect([x.entete.compteur, x.entete.frere, x.frere]).toEqual([null, undefined, null]);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('une consigne figée avant 49-U20 (sans frère) : rien, et rien ne casse', () => {
    const { e, p } = decor({ frere: null });
    const x = p.exercices[0];
    expect('frere' in x.entete).toBe(false);
    expect(x.frere).toBeNull();
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('DISCRIMINANT (I26) — un « maintenant » dit autrement que sa source : `fait_different`', () => {
    const p = JSON.parse(JSON.stringify(decor().p));
    p.exercices[0].frere.maintenant.palier = 44;
    expect(T.verifierPhrases(p).map((q) => [q.ou, q.cause, q.citation.replace(/ /g, ' ')]))
      .toEqual([['entete.frere', 'fait_different', '42 kg × 10']]);
  });
});
