/** @jest-environment node */
//
// 182 — LE RÉCAP DE GROUPE RACONTE LA SÉANCE (`Social.recapDetaille`, maquette « Proposé » du 28/10/2026).
// Pur : les formateurs de l'app sont injectés (`outils`), ici ceux du vrai `Modele` et des doublures nettes.
//
// CONFIGURATION DISCRIMINANTE : chaque règle a sa jumelle (mêmes ensembles / ensembles disjoints / un seul en commun ;
// recouvrement / pas de recouvrement ; ancien récap sans `detail` / avec). Aucun classement : l'ordre ne dépend jamais
// de qui a la charge la plus forte.

process.env.TZ = 'Europe/Paris';
global.self = global;
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
const Bilan = require('../../v2/js/bilan.js');
const Social = require('../../v2/js/social.js');

const NOMS = { squat: 'Squat', presse: 'Presse à cuisses', releve: 'Relevé de genoux suspendu', tapis: 'Tapis roulant' };
const outils = {
  nomDe: (s) => NOMS[s] || Modele.nommer({}, ''),
  mesure: (s) => Modele.formatMesure(s),
  record: (r) => {
    const nom = Modele.nomCourt(NOMS[r.slug] || '');
    const p = Modele.phraseDeRecord([r], nom, null, (x) => x);
    return { nom: nom.charAt(0).toUpperCase() + nom.slice(1), phrase: p ? p[0] : null };
  },
  tonnes: (kg) => Bilan.tonnesDuRecap(kg), duree: Modele.formatDuree, nombre: (n) => Modele.nombreTexte(n, 0),
  jour: () => 'mercredi 28 oct.', heure: Modele.heureMinute
};
const ex = (slug, series, extra) => Object.assign({ slug, series, charge_kg: null, reps: null, duree_s: null, distance_m: null }, extra || {});
const detail = (debut, fin, exercices, records) => ({ debut, fin, exercices, records: records || [] });
// 28/10/2026 : 14 h 31 → 15 h 19 (moi), 14 h 35 → 15 h 19 (alexis) ; heure d'hiver française (+01:00) depuis le 25/10.
const moi = (d, extra) => Object.assign({ pseudo: 'aurel_br', moi: true, tonnage_kg: 14000, series: 12, records: 0, xp: 140, detail: d }, extra || {});
const alexis = (d, extra) => Object.assign({ pseudo: 'alexis', moi: false, tonnage_kg: 12500, series: 12, records: 0, xp: 120, detail: d }, extra || {});
const D1 = ['2026-10-28T13:31:00Z', '2026-10-28T14:19:00Z'], D2 = ['2026-10-28T13:35:00Z', '2026-10-28T14:19:00Z'];

describe('182 — recapDetaille : les ensembles d’exercices (la phrase du coach)', () => {
  const six = ['squat', 'presse', 'a', 'b', 'c', 'd'].map((s) => ex(s, 2, { charge_kg: 100, reps: 5 }));
  test('même ensemble → « Vous avez fait les 6 mêmes exercices. »', () => {
    const r = Social.recapDetaille([moi(detail(D1[0], D1[1], six)), alexis(detail(D2[0], D2[1], six.slice().reverse()))], outils);
    expect(r.phrase).toBe('Vous avez fait les 6 mêmes exercices.');
    expect(r.tuiles.filter((t) => t.cle === 'exercices')[0].valeur).toBe('6');
  });
  test('ensembles disjoints → aucune phrase ; l’union compte tout', () => {
    const r = Social.recapDetaille([moi(detail(D1[0], D1[1], [ex('squat', 2, { charge_kg: 100, reps: 5 })])),
      alexis(detail(D2[0], D2[1], [ex('presse', 2, { charge_kg: 200, reps: 10 })]))], outils);
    expect(r.phrase).toBeNull();
    expect(r.tuiles.filter((t) => t.cle === 'exercices')[0].valeur).toBe('2');
  });
  test('un seul en commun → « 1 exercice en commun. » ; deux → « 2 exercices en commun. »', () => {
    const a = [ex('squat', 2, { charge_kg: 1, reps: 1 }), ex('presse', 2, { charge_kg: 1, reps: 1 }), ex('a', 1, { reps: 3 })];
    const b = [ex('squat', 2, { charge_kg: 1, reps: 1 }), ex('b', 1, { reps: 3 })];
    expect(Social.recapDetaille([moi(detail(D1[0], D1[1], a)), alexis(detail(D2[0], D2[1], b))], outils).phrase).toBe('1 exercice en commun.');
    const c = [ex('squat', 2, { charge_kg: 1, reps: 1 }), ex('presse', 2, { charge_kg: 1, reps: 1 }), ex('b', 1, { reps: 3 })];
    expect(Social.recapDetaille([moi(detail(D1[0], D1[1], a)), alexis(detail(D2[0], D2[1], c))], outils).phrase).toBe('2 exercices en commun.');
  });
  test('trois membres : « en commun » = commun à TOUS', () => {
    const t = (...s) => detail(D1[0], D1[1], s.map((x) => ex(x, 1, { reps: 5 })));
    const r = Social.recapDetaille([moi(t('squat', 'presse')), alexis(t('squat', 'a')), alexis(t('presse', 'a'), { pseudo: 'lea' })], outils);
    expect(r.phrase).toBeNull();
  });
  test('jamais de « bravo », de comparaison ni de gras selon la force', () => {
    const r = Social.recapDetaille([moi(detail(D1[0], D1[1], [ex('squat', 2, { charge_kg: 135, reps: 2 })])),
      alexis(detail(D2[0], D2[1], [ex('squat', 2, { charge_kg: 110, reps: 3 })]))], outils);
    expect(JSON.stringify(r)).not.toMatch(/bravo|mieux|plus fort|gagn|vainqueur|classement/i);
  });
});

describe('182 — recapDetaille : exercice par exercice (ordre et lignes)', () => {
  const a = detail(D1[0], D1[1], [ex('squat', 2, { charge_kg: 135, reps: 2 }), ex('presse', 2, { charge_kg: 295.7, reps: 10 }),
    ex('releve', 2, { reps: 12 })]);
  const b = detail(D2[0], D2[1], [ex('tapis', 1, { duree_s: 1200, distance_m: 3200 }), ex('presse', 2, { charge_kg: 275.7, reps: 10 }),
    ex('squat', 2, { charge_kg: 110, reps: 3 })]);
  const r = Social.recapDetaille([moi(a), alexis(b)], outils);
  test('l’ordre de MA séance, puis les exercices des autres que je n’ai pas faits', () => {
    expect(r.exercices.map((e) => e.slug)).toEqual(['squat', 'presse', 'releve', 'tapis']);
  });
  test('« toi » d’abord, puis les autres ; rien pour qui n’a pas fait l’exercice', () => {
    expect(r.exercices[0].lignes.map((l) => l.pseudo)).toEqual(['toi', 'alexis']);
    expect(r.exercices[2].lignes.map((l) => l.pseudo)).toEqual(['toi']);
    expect(r.exercices[3].lignes.map((l) => l.pseudo)).toEqual(['alexis']);
  });
  test('l’ordre des lignes ne dépend pas de la force : si alexis est plus fort, « toi » reste d’abord', () => {
    const fort = Social.recapDetaille([moi(detail(D1[0], D1[1], [ex('squat', 2, { charge_kg: 60, reps: 5 })])),
      alexis(detail(D2[0], D2[1], [ex('squat', 2, { charge_kg: 200, reps: 5 })]))], outils);
    expect(fort.exercices[0].lignes.map((l) => l.pseudo)).toEqual(['toi', 'alexis']);
  });
  test('si « toi » est en second dans la liste, l’ordre des exercices reste celui de MA séance', () => {
    const inv = Social.recapDetaille([alexis(b), moi(a)], outils);
    expect(inv.exercices.map((e) => e.slug)).toEqual(['squat', 'presse', 'releve', 'tapis']);
    expect(inv.exercices[0].lignes.map((l) => l.pseudo)).toEqual(['toi', 'alexis']);
  });
  test('le formateur de l’app : charge × reps, poids du corps, cardio ; « · N séries » ; le nom du catalogue', () => {
    expect(r.exercices[0].lignes[0].texte).toBe(Modele.formatMesure({ charge_kg: 135, reps: 2 }) + ' · 2 séries');
    expect(r.exercices[0].lignes[0].texte).toMatch(/^135.kg × 2 · 2 séries$/);
    expect(r.exercices[2].lignes[0].texte).toBe(Modele.formatMesure({ reps: 12 }) + ' · 2 séries');   // poids du corps
    expect(r.exercices[3].lignes[0].texte).toBe(Modele.formatMesure({ duree_s: 1200, distance_m: 3200 }) + ' · 1 série');   // cardio
    expect(r.exercices[3].lignes[0].texte).toMatch(/20 min/);
    expect(r.exercices.map((e) => e.nom)).toEqual(['Squat', 'Presse à cuisses', 'Relevé de genoux suspendu', 'Tapis roulant']);
  });
  test('un slug inconnu prend le nom générique, jamais le slug brut', () => {
    const inc = Social.recapDetaille([moi(detail(D1[0], D1[1], [ex('exo_perso_xyz', 1, { reps: 5 })])),
      alexis(detail(D2[0], D2[1], [ex('exo_perso_xyz', 1, { reps: 5 })]))], outils);
    expect(inc.exercices[0].nom).toBe('(exercice inconnu)');
  });
});

describe('182 — recapDetaille : l’en-tête, les tuiles, « ensemble », les records, « Chacun »', () => {
  const a = detail(D1[0], D1[1], [ex('squat', 2, { charge_kg: 135, reps: 2 })]);
  const b = detail(D2[0], D2[1], [ex('squat', 2, { charge_kg: 110, reps: 3 })]);
  test('titre, « avec … · jour · début – fin » (début le plus tôt, fin la plus tardive, heure locale)', () => {
    const r = Social.recapDetaille([moi(a), alexis(b)], outils);
    expect(r.titre).toBe('Séance en groupe');
    expect(r.qui).toBe('avec alexis · mercredi 28 oct. · 14 h 31 – 15 h 19');
    const tard = Social.recapDetaille([moi(a), alexis(detail(D2[0], '2026-10-28T14:40:00Z', b.exercices))], outils);
    expect(tard.qui).toMatch(/14 h 31 – 15 h 40$/);
  });
  test('quatre tuiles : volume, séries, exercices, ensemble (le recouvrement, en minutes)', () => {
    const r = Social.recapDetaille([moi(a), alexis(b)], outils);
    expect(r.tuiles.map((t) => t.cle)).toEqual(['volume', 'series', 'exercices', 'ensemble']);
    expect(r.tuiles[0].valeur).toBe(Bilan.tonnesDuRecap(26500));
    expect(r.tuiles[1].valeur).toBe('24');
    expect(r.tuiles[3].valeur).toBe('44 min');   // 14 h 35 → 15 h 19
  });
  test('pas de recouvrement → pas de tuile « ensemble » (et la jumelle : se toucher sans se chevaucher ne compte pas)', () => {
    const apres = detail('2026-10-28T14:30:00Z', '2026-10-28T15:00:00Z', b.exercices);
    const r = Social.recapDetaille([moi(a), alexis(apres)], outils);
    expect(r.tuiles.map((t) => t.cle)).toEqual(['volume', 'series', 'exercices']);
    expect(Social.secondesEnsemble([{ debut: D1[0], fin: D1[1] }, { debut: '2026-10-28T14:19:00Z', fin: '2026-10-28T15:00:00Z' }])).toBe(0);
  });
  test('le recouvrement de trois séances : le temps où au moins deux se chevauchent', () => {
    const h = (m) => '2026-10-28T10:' + (m < 10 ? '0' : '') + m + ':00Z';
    expect(Social.secondesEnsemble([{ debut: h(0), fin: h(30) }, { debut: h(10), fin: h(40) }, { debut: h(50), fin: '2026-10-28T11:10:00Z' }])).toBe(20 * 60);   // 10 h 10 → 10 h 30 : la troisième ne chevauche personne
  });
  test('records : une ligne par record, avec le pseudo et la phrase de la médaille ; sinon aucune ligne', () => {
    const rec = { slug: 'squat', type: 'charge_a_reps', valeur: 140, reps: 3, charge: 140, unite: 'kg' };
    const r = Social.recapDetaille([moi(detail(D1[0], D1[1], a.exercices, [rec]), { records: 1 }), alexis(b)], outils);
    expect(r.records.length).toBe(1);
    expect(r.records[0].pseudo).toBe('toi');
    expect(r.records[0].texte).toMatch(/^Squat · Record à 3.reps : 140.kg\.$/);
    expect(Social.recapDetaille([moi(a), alexis(b)], outils).records).toEqual([]);
  });
  test('« Chacun » : volume et séries, « +N XP » seulement si l’XP n’est pas null (jeu éteint)', () => {
    const r = Social.recapDetaille([moi(a), alexis(b, { xp: null })], outils);
    expect(r.chacun.map((x) => x.pseudo)).toEqual(['toi', 'alexis']);
    expect(r.chacun[0].xp).toBe('+140 XP');
    expect(r.chacun[1].xp).toBeNull();
    expect(r.chacun[1].texte).toBe(Bilan.tonnesDuRecap(12500) + ' · 12 séries');
  });
  test('un ancien membre (compte supprimé) se dit « un ancien membre », ses chiffres restent', () => {
    const r = Social.recapDetaille([moi(a), alexis(b, { pseudo: '' })], outils);
    expect(r.qui).toMatch(/^avec un ancien membre/);
    expect(r.exercices[0].lignes[1].pseudo).toBe('un ancien membre');
  });
});

describe('182 — un ancien récap, sans `detail`, garde l’affichage d’avant', () => {
  const a = detail(D1[0], D1[1], [ex('squat', 2, { charge_kg: 135, reps: 2 })]);
  test('un membre sans `detail` (ou sans liste d’exercices) → null, sans planter ni rien inventer', () => {
    expect(Social.recapDetaille([moi(null), alexis(null)], outils)).toBeNull();
    expect(Social.recapDetaille([moi(a), alexis(undefined)], outils)).toBeNull();
    expect(Social.recapDetaille([moi(a), alexis({ debut: D2[0] })], outils)).toBeNull();
    expect(Social.recapDetaille([], outils)).toBeNull();
    expect(Social.recapDetaille(null, outils)).toBeNull();
  });
  test('la jumelle : les mêmes membres avec `detail` donnent le récap détaillé', () => {
    expect(Social.recapDetaille([moi(a), alexis(a)], outils)).not.toBeNull();
  });
  test('l’ancien calcul (`recapDuGroupe`) reste celui d’avant', () => {
    const r = Social.recapDuGroupe([moi(null), alexis(null)]);
    expect(r.series).toBe(24);
    expect(r.tonnage_kg).toBe(26500);
  });
});
