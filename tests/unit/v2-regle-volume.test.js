/** @jest-environment node */
//
// 49-U16 — la règle de volume, pour la série de plus (MOTEUR §14.6, delta
// 49-33). Un fait par muscle, calculé une fois sur tout l'historique : la
// moyenne des 3 dernières semaines actives dépasse-t-elle le troisième quart
// de ses moyennes habituelles ? Rien ne s'affiche : c'est une entrée du plan,
// que la série de plus (PR 2c) lira.
//
// LE FICHIER DE CAS FAIT FOI. `cas-49u16-volume.json` sort de `coach49.py`
// (Claude.ai, 01/10/2026) : 8 situations réelles, 2 synthétiques. Moyennes et
// seuils à 1e-4 près (arrondis à 4 décimales dans les cas). Un cas qui semble
// faux se rapporte ; il ne se corrige pas ici.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const Semaine = require('../../v2/js/semaine.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const F = require('./fixtures/cas-49u16-volume.json');
const proche = (a, b) => Math.abs(a - b) <= 1e-4;

// ── 1. LES CAS DU SIMULATEUR ────────────────────────────────────────────────
describe('§14.6 — les cas du simulateur', () => {
  test('le fichier : 10 cas (8 réels, 2 synthétiques), 2 sans base', () => {
    expect(F.cas).toHaveLength(10);
    expect(F.cas.filter((c) => c.attendu === null).map((c) => c.id)).toEqual(['V006', 'V009']);
  });
  F.cas.forEach((c) => {
    test(c.id + ' — ' + c.titre, () => {
      const r = M.placeDeVolume(c.semaines);
      if (c.attendu === null) { expect(r).toBeNull(); return; }
      expect(r.place).toBe(c.attendu.place);
      expect(proche(r.moyenne, c.attendu.moyenne)).toBe(true);
      expect(proche(r.seuil, c.attendu.seuil)).toBe(true);
      expect(r.fenetres).toBe(c.attendu.fenetres);
    });
  });
});

// ── 2. LA RÈGLE, PIÈCE PAR PIÈCE ────────────────────────────────────────────
const sem = (lundi, n) => {
  const d = new Date(lundi + 'T12:00:00Z');
  return new Date(d.getTime() + n * 7 * 86400000).toISOString().slice(0, 10);
};
const suite = (volumes) => volumes.map((v, i) => ({ semaine: sem('2026-01-05', i), active: v !== null, volume: v === null ? 0 : v }));

describe('§14.6 — les fenêtres, les époques, le seuil', () => {
  test('moins de 3 semaines actives dans l\'époque : pas de fenêtre, pas de base', () => {
    expect(M.placeDeVolume(suite([10, 10]))).toBeNull();
  });
  test('au moins 6 fenêtres de référence : 8 semaines actives n\'en donnent que 5 (null), 9 en donnent 6', () => {
    expect(M.placeDeVolume(suite([5, 5, 5, 5, 5, 5, 5, 5]))).toBeNull();
    expect(M.placeDeVolume(suite([5, 5, 5, 5, 5, 5, 5, 5, 5])).fenetres).toBe(6);
  });
  test('le 3e quartile au rang le plus proche (⌈0,75 n⌉), pas la médiane', () => {
    // Des volumes qui montent par paliers : les fenêtres de référence s'étalent
    // de 1 à 8, et leur 3e quartile n'est pas leur médiane.
    const v = [];
    [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8].forEach((x) => v.push(x));
    const r = M.placeDeVolume(suite(v.concat([5, 5, 5])));
    // Les fenêtres glissent d'une semaine : on vérifie le principe sur le seuil
    // rendu, comparé au rang ⌈0,75 n⌉ calculé à part sur les mêmes fenêtres.
    const fen = [];
    const tout = v.concat([5, 5, 5]);
    for (let i = 2; i < tout.length; i++) {
      const a = tout.slice(i - 2, i + 1);
      fen.push((a[0] + a[1] + a[2]) / 3);
    }
    const ref = fen.slice(0, -1).sort((a, b) => a - b);
    expect(r.fenetres).toBe(ref.length);
    expect(r.seuil).toBe(ref[Math.ceil(0.75 * ref.length) - 1]);
    expect(r.seuil).not.toBe(ref[Math.floor(ref.length / 2)]);
  });
  test('une semaine vide ne compte pas et ne casse pas la fenêtre', () => {
    const plein = M.placeDeVolume(suite([6, 6, 6, 6, 6, 6, 6, 6, 9, 9, 12]));
    const troue = M.placeDeVolume(suite([6, 6, 6, 6, 6, 6, 6, 6, 9, null, null, 9, 12]));
    expect(troue.moyenne).toBe(plein.moyenne);
    expect(troue.moyenne).toBe(10);
  });
  test('4 semaines vides ouvrent une nouvelle époque, 3 non', () => {
    const avant = [10, 10, 10, 10, 10, 10, 10, 10, 10];
    expect(M.placeDeVolume(suite(avant.concat([null, null, null, 10, 10, 10]))).fenetres).toBe(9);
    expect(M.placeDeVolume(suite(avant.concat([null, null, null, null, 10, 10, 10])))).toBeNull();
  });
  test('4 semaines vides JUSTE AVANT la séance : la séance ouvre une époque, pas de base', () => {
    expect(M.placeDeVolume(suite([10, 10, 10, 10, 10, 10, 10, 10, 10, 10, null, null, null, null]))).toBeNull();
    expect(M.placeDeVolume(suite([10, 10, 10, 10, 10, 10, 10, 10, 10, 10, null, null, null]))).not.toBeNull();
  });
  test('l\'égalité compte comme de la place', () => {
    const r = M.placeDeVolume(suite([6, 6, 6, 6, 6, 6, 6, 6, 6, 6]));
    expect([r.moyenne, r.seuil, r.place]).toEqual([6, 6, true]);
  });
});

describe('§14.6 — pour un exercice : de la place sur CHACUN de ses muscles primaires', () => {
  const oui = { place: true, moyenne: 5, seuil: 6, fenetres: 10 };
  const non = { place: false, moyenne: 8, seuil: 6, fenetres: 10 };
  test('tous les primaires ont de la place : oui', () => {
    expect(M.placePourExercice({ pectoraux: oui, triceps: oui, deltoide_anterieur: non }, ['pectoraux', 'triceps'])).toBe(true);
  });
  test('un seul primaire sans place : non (un secondaire sans place, lui, ne compte pas)', () => {
    expect(M.placePourExercice({ pectoraux: oui, triceps: non }, ['pectoraux', 'triceps'])).toBe(false);
  });
  test('un seul primaire sans base (null) ou absent : non', () => {
    expect(M.placePourExercice({ pectoraux: oui, triceps: null }, ['pectoraux', 'triceps'])).toBe(false);
    expect(M.placePourExercice({ pectoraux: oui }, ['pectoraux', 'triceps'])).toBe(false);
  });
  test('sans muscle primaire connu, ou sans volume : non', () => {
    expect(M.placePourExercice({ pectoraux: oui }, [])).toBe(false);
    expect(M.placePourExercice(null, ['pectoraux'])).toBe(false);
  });
});

// ── 3. LE VOLUME DE CHAQUE SEMAINE (`THSemaine.semainesDeVolume`) ───────────
describe('§14.6 — le volume de chaque semaine, par muscle, sur tout l\'historique', () => {
  const EXOS = [
    { slug: 'dc', muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'] },
    { slug: 'curl', muscles_primaires: ['biceps'], muscles_secondaires: [] },
    { slug: 'marche', muscles_primaires: [], muscles_secondaires: [] }
  ];
  const se = (id, debut) => ({ id, debut });
  const sr = (sid, slug, type) => ({ session_id: sid, exercise_slug: slug, type_serie: type || 'travail' });
  const seances = [se('a', '2026-09-01T10:00:00+02:00'), se('b', '2026-09-03T10:00:00+02:00'),
    se('c', '2026-09-22T10:00:00+02:00'), se('d', '2026-09-30T10:00:00+02:00'), se('m', '2026-09-16T10:00:00+02:00')];
  const series = [sr('a', 'dc'), sr('a', 'dc'), sr('a', 'dc', 'echauffement'), sr('b', 'dc'), sr('b', 'curl'),
    sr('c', 'dc'), sr('d', 'dc'), sr('m', 'marche')];
  const v = Semaine.semainesDeVolume(seances, series, EXOS, '2026-10-01T18:00:00+02:00');
  test('de la semaine de la 1re séance à celle qui PRÉCÈDE la séance, vides comprises', () => {
    expect(v.pectoraux.map((w) => w.semaine)).toEqual(['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21']);
    // La semaine du 28 sept. est celle de la séance : elle n'entre pas (la séance « d » non plus).
    expect(v.pectoraux.map((w) => w.active)).toEqual([true, false, true, true]);
  });
  test('1 en primaire, 0,5 en secondaire, les séries de TRAVAIL seules', () => {
    expect(v.pectoraux.map((w) => w.volume)).toEqual([3, 0, 0, 1]);
    expect(v.triceps.map((w) => w.volume)).toEqual([1.5, 0, 0, 0.5]);
    expect(v.biceps.map((w) => w.volume)).toEqual([1, 0, 0, 0]);
  });
  test('une semaine active sans le muscle (la marche) reste ACTIVE, à 0', () => {
    expect(v.biceps[2]).toEqual({ semaine: '2026-09-14', active: true, volume: 0 });
  });
  test('sans séance avant : rien', () => {
    expect(Semaine.semainesDeVolume(seances, series, EXOS, '2026-08-01T10:00:00+02:00')).toEqual({});
  });
});

// ── 4. L'ENTRÉE DU PLAN ─────────────────────────────────────────────────────
describe('§14.6 — l\'entrée du plan : `entrees.volume`, la place par exercice, rien d\'affiché', () => {
  const C = { etat: 'progression', zone: 'volume', palier: 25, niveau: 12, n: 3, ligne: { charge: 25, vise: 12 }, haut: null, fondement: {} };
  const plan = (volume, catalogue) => {
    let n = 0;
    const id = () => 's' + (++n);
    let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'curl', id, { series: 3 });
    const e = { seance: { id: 'S1', debut: '2026-10-01T10:00:00+00:00', edition: false, exercices: se.exercices },
      consignes: { curl: { consigne: C, libelles: M.libellesConsigne(C) } }, reglage: 'normal', paris: [], suites: {},
      catalogue: catalogue === undefined ? { curl: { equipement: 'barre', muscles_primaires: ['biceps'] } } : catalogue };
    if (volume !== undefined) e.volume = volume;
    return { e, p: T.planDeSeance(e) };
  };
  const oui = { place: true, moyenne: 5, seuil: 6, fenetres: 10 };
  test('de la place sur le biceps : la série de plus est permise (le fait, pour la PR 2c)', () => {
    const { e, p } = plan({ biceps: oui });
    expect(p.exercices[0].placeSerieDePlus).toBe(true);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('pas de base sur le biceps (`null`) : pas de place', () => {
    expect(plan({ biceps: null }).p.exercices[0].placeSerieDePlus).toBe(false);
  });
  test('sans entrée de volume : `null` (rien n\'est décidé)', () => {
    expect(plan(undefined).p.exercices[0].placeSerieDePlus).toBeNull();
  });
  test('rien ne s\'affiche : l\'en-tête et les lignes sont les mêmes avec ou sans le volume', () => {
    const avec = plan({ biceps: oui }).p.exercices[0];
    const sans = plan(undefined).p.exercices[0];
    expect(avec.entete).toEqual(sans.entete);
    expect(avec.lignes).toEqual(sans.lignes);
    expect(avec.escalier).toEqual(sans.escalier);
  });
});
