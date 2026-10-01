/** @jest-environment node */
//
// 49-U13 — le compteur de stagnation (MOTEUR §12.2 bis, §12.8, §12.9, delta
// 49-28 du 30/09/2026). « Le compteur constate, l'escalier propose. » Ce
// chantier câble le compteur seul : un fait calculé avec la consigne figée,
// lu par le plan, et une phrase grise à 4 séances ou plus.
//
// LE FICHIER DE CAS FAIT FOI. `cas-49u13-compteur.json` (12 cas) sort de
// `coach49.py` (`deroule_compteur`, `phrase_compteur`, Claude.ai, 30/09/2026),
// sur trois historiques. Dans ces cas, toutes les séances comptent comme ayant
// reçu une consigne (`toutes: true`) ; `blocages_termines` est une ENTRÉE.
// Les phrases se comparent OCTET PAR OCTET. Un cas qui semble faux se rapporte ;
// il ne se corrige pas ici.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');

const FICHIER = require('./fixtures/cas-49u13-compteur.json');
const octets = (s) => (s === null || s === undefined ? s : Buffer.from(s, 'utf8').toString('hex'));
const options = (c, plus) => Object.assign({ reglage: c.reglage, equipement: c.equipement, correction: null }, plus || {});

describe('§12.9 — les cas du simulateur (14, régénérés au 49-29)', () => {
  test('le fichier a 14 cas, dont 6 avec une phrase', () => {
    expect(FICHIER.cas).toHaveLength(14);
    expect(FICHIER.cas.filter((c) => c.attendu.phrase !== null)).toHaveLength(6);
  });

  // K014 (blocages calculés depuis les séances du cas) vit à part :
  // `v2-compteur-k014.test.js` — il diverge de la référence (rapporté dans la PR).
  FICHIER.cas.filter((c) => c.id !== 'K014').forEach((c) => {
    test(c.id + ' — ' + c.titre, () => {
      const r = M.compteurDe(c.seances, c.avant, options(c, { toutes: true }));
      // Les verdicts, séance par séance, à l'octet (JSON).
      expect(JSON.stringify(r.verdicts)).toBe(JSON.stringify(c.attendu.verdicts));
      expect(r.compteur).toBe(c.attendu.compteur);
      expect(r.meilleur ? [r.meilleur.palier, r.meilleur.niveau] : null).toEqual(c.attendu.meilleur);
      // La phrase, octet par octet (insécable avant « kg »).
      expect(octets(M.phraseCompteur(r, c.blocages_termines))).toBe(octets(c.attendu.phrase));
    });
  });
});

// Un décor minimal au format du contrat : un exercice à la barre, zone Volume
// (10 à 12), un palier tenu à 12 reps.
const jour = (n) => new Date(Date.UTC(2026, 8, 1 + n, 17)).toISOString();
const seance = (n, palier, reps, extra) => Object.assign({
  debut: jour(n), palier: palier,
  series: reps.map((r) => ({ charge_kg: palier, reps: r, rpe: null, role: 'palier', origine: 'palier' }))
}, extra || {});
// 25 kg × 12, quatre fois de suite après une séance de départ : 4 séances
// suivies sans progrès.
const PLATEAU = [seance(0, 25, [12, 12, 12]), seance(3, 25, [12, 12, 12]), seance(6, 25, [12, 12, 12]),
  seance(9, 25, [12, 12, 12]), seance(12, 25, [12, 12, 12]), seance(15, 25, [12, 12, 12])];
const AVANT = jour(18);
const OPTS = { reglage: 'normal', equipement: 'barre', correction: null };

describe('§12.9 — quelles séances comptent', () => {
  test('toutes sous consigne : le plateau compte 4 séances, et la phrase les dit', () => {
    const r = M.compteurDe(PLATEAU, AVANT, Object.assign({ toutes: true }, OPTS));
    expect(r.compteur).toBe(4);
    expect(M.phraseCompteur(r).replace(/ /g, ' ')).toBe('25 kg × 12 reste ton meilleur depuis 4 séances.');
  });

  test('DISCRIMINANT — une séance sans pari (pas sous consigne) est ignorée', () => {
    // La troisième n'a reçu aucune consigne : 3 séances suivies seulement.
    const marquees = PLATEAU.map((s, i) => Object.assign({}, s, { sousConsigne: i !== 3 }));
    const r = M.compteurDe(marquees, AVANT, OPTS);
    expect(r.compteur).toBe(3);
    expect(r.verdicts.map((v) => v.debut)).not.toContain(PLATEAU[3].debut);
    expect(M.phraseCompteur(r)).toBeNull();
  });

  test('une séance importée (sans pari, donc sans marque) est ignorée : sans marque, rien ne compte', () => {
    const r = M.compteurDe(PLATEAU, AVANT, OPTS);
    expect(r.verdicts).toEqual([]);
    expect(r.compteur).toBe(0);
    expect(M.phraseCompteur(r)).toBeNull();
  });

  test('consigneDExercice marque les séances par les identifiants de leurs paris', () => {
    // Les groupes de l'app : `{ seance: { id, debut }, series }` ; les séries
    // brutes, que le contrat analyse.
    const groupes = PLATEAU.map((s, i) => ({
      seance: { id: 'S' + i, debut: s.debut },
      series: s.series.map((x, j) => ({ id: 'S' + i + '-' + j, charge_kg: x.charge_kg, reps: x.reps, rpe: null,
        ressenti: null, type_serie: 'travail', validee_a: s.debut }))
    }));
    const base = { mesure: 'charge_reps', reglage: 'normal', equipement: 'barre', intention: 'progresser' };
    const avec = M.consigneDExercice(groupes, null, AVANT,
      Object.assign({ seancesSousConsigne: ['S1', 'S2', 'S3', 'S4', 'S5'] }, base));
    expect(avec.compteur.compteur).toBe(4);
    const sans = M.consigneDExercice(groupes, null, AVANT, base);
    expect(sans.compteur.compteur).toBe(0);
    expect(sans.compteur.meilleur).toBeNull();
    // Ce que la consigne figée garde (écrite sur le disque) : pas les verdicts.
    expect(Object.keys(avec.compteur).sort()).toEqual(['blocages', 'compteur', 'derniere', 'meilleur']);
  });

  test('une zone choisie AUJOURD’HUI ne réécrit pas les séances passées ; choisie entre deux, elle remet à zéro', () => {
    const toutes = Object.assign({ toutes: true }, OPTS);
    const choix = (quand, zone) => [{ id: 'z1', exercise_slug: 'x', zone: zone, corrigee_a: quand }];
    // Choisie après toutes les séances : le rejeu les garde dans leur zone
    // (4 séances suivies sans progrès)… mais la séance qui s'ouvre change de
    // zone, et la remise à zéro vaut dès l'ouverture (§12.9, 49-29) → 0.
    const tard = M.compteurDe(PLATEAU, AVANT, Object.assign({ corrections: choix(jour(17), 'lourd') }, toutes));
    expect(tard.verdicts.map((v) => v.zone)).toEqual(['volume', 'volume', 'volume', 'volume', 'volume']);
    expect(tard.compteur).toBe(0);
    // Choisie le jour 8, avant la séance du jour 9 (la 3ᵉ comptée) : elle
    // change de zone → remise à zéro ; les deux suivantes repartent de là.
    const r = M.compteurDe(PLATEAU, AVANT, Object.assign({ corrections: choix(jour(8), 'lourd') }, toutes));
    expect(r.verdicts.map((v) => [v.zone, v.remise_a_zero])).toEqual(
      [['volume', true], ['volume', false], ['lourd', true], ['lourd', false], ['lourd', false]]);
    expect(r.compteur).toBe(2);
  });

  test('pas de fenêtre : 30 séances de plateau sous consigne → 29 (les blocages se comptent sur tout l’historique)', () => {
    const long = [];
    for (let i = 0; i < 31; i++) long.push(seance(i * 3, 25, [12, 12, 12]));
    const r = M.compteurDe(long, jour(93), Object.assign({ toutes: true }, OPTS));
    expect(r.verdicts.length).toBe(30);
    expect(r.compteur).toBe(29);
  });

  test('DISCRIMINANT — une reprise sur une séance SANS pari remet quand même à zéro (§12.6)', () => {
    // 4 séances sous consigne (compteur 3), 90 jours d'arrêt, une séance de
    // reprise sans pari, puis 2 séances sous consigne.
    const avant = [seance(0, 25, [12, 12, 12]), seance(3, 25, [12, 12, 12]), seance(6, 25, [12, 12, 12]),
      seance(9, 25, [12, 12, 12])].map((x) => Object.assign({}, x, { sousConsigne: true }));
    const reprise = Object.assign(seance(100, 20, [12, 12, 12]), { sousConsigne: false });
    const apres = [seance(103, 25, [12, 12, 12]), seance(106, 25, [12, 12, 12])]
      .map((x) => Object.assign({}, x, { sousConsigne: true }));
    const r = M.compteurDe(avant.concat([reprise], apres), jour(110), OPTS);
    expect(r.verdicts.map((v) => v.remise_a_zero)).toEqual([true, false, false, true, false]);
    expect(r.compteur).toBe(1);
    // Témoin : sans la coupure, la même séance sans pari ne remet rien à zéro.
    const proche = Object.assign(seance(12, 20, [12, 12, 12]), { sousConsigne: false });
    const t = M.compteurDe(avant.concat([proche], [seance(15, 25, [12, 12, 12]), seance(18, 25, [12, 12, 12])]
      .map((x) => Object.assign({}, x, { sousConsigne: true }))), jour(21), OPTS);
    expect(t.verdicts.map((v) => v.remise_a_zero)).toEqual([true, false, false, false, false]);
  });

  test('la séance du jour ne compte pas : seules les séances antérieures (coupure stricte)', () => {
    const r = M.compteurDe(PLATEAU, PLATEAU[5].debut, Object.assign({ toutes: true }, OPTS));
    expect(r.compteur).toBe(3);
  });

  test('le compteur ne modifie pas ses entrées', () => {
    const avant = JSON.stringify(PLATEAU);
    M.compteurDe(PLATEAU, AVANT, Object.assign({ toutes: true }, OPTS));
    expect(JSON.stringify(PLATEAU)).toBe(avant);
  });
});

describe('§12.2 bis — le progrès, la remise à zéro', () => {
  const avec = (...s) => M.compteurDe(s, AVANT, Object.assign({ toutes: true }, OPTS));

  test('le niveau qui monte au même palier est un progrès', () => {
    const r = avec(seance(0, 25, [11, 11, 11]), seance(3, 25, [11, 11, 11]), seance(6, 25, [11, 11, 11]),
      seance(9, 25, [12, 12, 12]));
    expect(r.verdicts.map((v) => v.progres)).toEqual([true, false, true]);
    expect(r.compteur).toBe(0);
    expect(r.blocages).toEqual([1]);
  });

  test('DISCRIMINANT — le même test refait à l’identique n’est pas un progrès', () => {
    const test = (n) => seance(n, 25, [12, 12], { series: [
      { charge_kg: 25, reps: 12, rpe: null, role: 'palier', origine: 'palier' },
      { charge_kg: 25, reps: 12, rpe: null, role: 'palier', origine: 'palier' },
      { charge_kg: 30, reps: 10, rpe: null, role: 'exploration', origine: 'exploration' }] });
    const r = avec(seance(0, 25, [12, 12, 12]), seance(3, 25, [12, 12, 12]), test(6), test(9), test(12));
    // Le premier test tenu (30 × 10, dans la zone) est un progrès ; les suivants, identiques, non.
    expect(r.verdicts.map((v) => v.progres)).toEqual([true, true, false, false]);
    expect(r.compteur).toBe(2);
  });

  test('DISCRIMINANT (49-29) — un test tenu le jour où le palier monte est retenu : refait à l’identique, il n’est pas un progrès', () => {
    const avecTest = (n, p) => seance(n, p, [12, 12], { series: [
      { charge_kg: p, reps: 12, rpe: null, role: 'palier', origine: 'palier' },
      { charge_kg: p, reps: 12, rpe: null, role: 'palier', origine: 'palier' },
      { charge_kg: 30, reps: 10, rpe: null, role: 'exploration', origine: 'exploration' }] });
    // Jour 6 : le palier monte (25 → 27,5) ET un test à 30 × 10 est tenu ;
    // jour 9 : le même test, au même palier — ni le palier ni le test ne progressent.
    const r = avec(seance(0, 25, [12, 12, 12]), seance(3, 25, [12, 12, 12]), avecTest(6, 27.5), avecTest(9, 27.5));
    expect(r.verdicts.map((v) => v.progres)).toEqual([true, true, false]);
  });

  test('une séance non suivie (sous la charge proposée) n’ajoute rien', () => {
    const r = avec(seance(0, 25, [12, 12, 12]), seance(3, 25, [12, 12, 12]), seance(6, 20, [12, 12, 12]),
      seance(9, 25, [12, 12, 12]));
    expect(r.verdicts.map((v) => [v.suivie, v.compteur])).toEqual([[true, 0], [false, 0], [true, 1]]);
  });
});

describe('§12.9 (49-29) — la remise à zéro vaut dès l’ouverture', () => {
  test('DISCRIMINANT — la séance qui s’ouvre est une reprise : 0, pas de phrase', () => {
    const toutes = Object.assign({ toutes: true }, OPTS);
    // Le plateau compte 4 ; ouvert 60 jours plus tard, c'est une reprise.
    expect(M.compteurDe(PLATEAU, AVANT, toutes).compteur).toBe(4);
    const loin = jour(75);
    expect(M.consignePour(PLATEAU, loin, OPTS).etat).toMatch(/^reprise_/);
    const r = M.compteurDe(PLATEAU, loin, toutes);
    expect(r.compteur).toBe(0);
    expect(r.meilleur).toEqual({ palier: 25, niveau: 12 });
    expect(M.phraseCompteur(r)).toBeNull();
  });

  test('DISCRIMINANT — la séance qui s’ouvre change de zone : 0 ; dans la même zone : le compte tient', () => {
    const toutes = Object.assign({ toutes: true }, OPTS);
    const choix = (quand) => [{ id: 'z1', exercise_slug: 'x', zone: 'lourd', corrigee_a: quand }];
    // Lourd choisi AVANT toutes les séances : rejeu et ouverture en Lourd → le compte tient.
    const avantTout = M.compteurDe(PLATEAU, AVANT, Object.assign({ corrections: choix(jour(-1)) }, toutes));
    expect(avantTout.verdicts.every((v) => v.zone === 'lourd')).toBe(true);
    expect(avantTout.compteur).toBe(4);
    // Lourd choisi APRÈS la dernière séance : rejeu en Volume, ouverture en Lourd → 0.
    const apres = M.compteurDe(PLATEAU, AVANT, Object.assign({ corrections: choix(jour(17)) }, toutes));
    expect(apres.verdicts.every((v) => v.zone === 'volume')).toBe(true);
    expect(apres.compteur).toBe(0);
    expect(M.phraseCompteur(apres)).toBeNull();
  });
});

describe('§12.8 — la phrase cite le MEILLEUR, jamais la charge du jour (delta 49-28)', () => {
  test('DISCRIMINANT — K012 : la charge du jour (14 kg) oscille sous le meilleur (16 kg) ; la phrase dit 16', () => {
    const c = FICHIER.cas.filter((x) => x.id === 'K012')[0];
    const r = M.compteurDe(c.seances, c.avant, options(c, { toutes: true }));
    expect(r.derniere).toEqual({ palier: 14, niveau: 10 });
    expect(r.meilleur).toEqual({ palier: 16, niveau: 10 });
    expect(M.phraseCompteur(r)).toBe('16\u00a0kg × 10 reste ton meilleur depuis 6 séances.');
  });
});

describe('§12.8 — la phrase', () => {
  const c = (compteur) => ({ compteur, meilleur: { palier: 122.5, niveau: 6 } });

  test('sous 4 : rien ; à 4 et au-delà : le meilleur, jamais la charge du jour', () => {
    expect(M.phraseCompteur(c(3))).toBeNull();
    expect(M.phraseCompteur(c(4))).toBe('122,5 kg × 6 reste ton meilleur depuis 4 séances.');
    expect(M.phraseCompteur(c(7))).toBe('122,5 kg × 6 reste ton meilleur depuis 7 séances.');
  });

  test('DISCRIMINANT — « plus long que d’habitude » exige au moins 8 blocages terminés', () => {
    const sept = [1, 1, 1, 1, 1, 1, 1];
    const huit = [1, 1, 1, 1, 1, 1, 1, 1];
    expect(M.phraseCompteur(c(4), sept)).toBe('122,5 kg × 6 reste ton meilleur depuis 4 séances.');
    expect(M.phraseCompteur(c(4), huit))
      .toBe('122,5 kg × 6 reste ton meilleur depuis 4 séances : c\'est plus long que d\'habitude pour toi.');
  });

  test('« plus long que d’habitude » exige que 3 blocages sur 4 aient duré moins de 4 séances', () => {
    // 6 sur 8 courts : 3 sur 4 tout juste → oui ; 5 sur 8 → non.
    expect(M.phraseCompteur(c(4), [1, 1, 1, 1, 1, 1, 4, 5])).toMatch(/plus long que d'habitude/);
    expect(M.phraseCompteur(c(4), [1, 1, 1, 1, 1, 4, 4, 5])).not.toMatch(/plus long que d'habitude/);
  });
});
