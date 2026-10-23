/** @jest-environment node */
// 153 — les records hors des barres : l'allure pour au moins N, la première fois sur une marche, le D+, les étages
// (MOTEUR §9.23). `Modele.recordsBattus` est la seule fonction qui les décide.
global.self = global;
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');

const esp = (t) => String(t).replace(/[  ]/g, ' ');
const T = (slug, duree, distance, extra) => Object.assign({ exercise_slug: slug, type_serie: 'travail', duree_s: duree, distance_m: distance }, extra || {});
const passee = (jour, ...series) => ({ debut: '2026-0' + jour + 'T10:00:00Z', series: series });
const aujourdhui = '2026-09-01T10:00:00Z';
// Les records de la série `i` de la séance du jour, face à l'historique.
const records = (histo, series, i, options) =>
  Modele.recordsBattus(histo, { debut: aujourdhui, series: series }, i === undefined ? series.length - 1 : i, options || {});
const de = (r, type) => r.filter((x) => x.type === type)[0] || null;

describe('153 (A) — l’allure pour au moins N', () => {
  test('999 m : rien ; 1 000 m : le palier de 1 km ; 6,2 km : le palier de 5 km', () => {
    expect(Modele.allureDeSerie(T('tapis_roulant', 360, 999))).toBeNull();
    expect(Modele.allureDeSerie(T('tapis_roulant', 420, 1000))).toMatchObject({ palier: 1000, allure: 420, unite: 's_km' });
    expect(Modele.allureDeSerie(T('tapis_roulant', 2232, 6200))).toMatchObject({ palier: 5000, unite: 's_km' });
    expect(Modele.allureDeSerie(T('course_a_pieds', 7000, 21097)).palier).toBe(21097);
    expect(Modele.allureDeSerie(T('course_a_pieds', 15000, 42195)).palier).toBe(42195);
  });
  test('un record : plus vite que toute série passée d’au moins ce palier ; « Avant » dit l’ancienne allure et sa date', () => {
    const histo = [passee('1-19', T('tapis_roulant', 433, 1000)), passee('2-03', T('tapis_roulant', 600, 1200))];
    const r = records(histo, [T('tapis_roulant', 420, 1000)]);
    expect(de(r, 'allure')).toMatchObject({ valeur: 420, unite: 's_km', palier_m: 1000, ancien: 433, ancien_le: '2026-01-19T10:00:00Z' });
    const p = Modele.phraseDeRecord(r, 'tapis de course', aujourdhui, (s) => s);
    expect(esp(p[0])).toBe('Record d’allure sur 1 km ou plus : 7:00 /km.');
    expect(esp(p[1])).toBe('Avant : 7:13 /km, le 19 janv.');
  });
  test('6,2 km : comparé aux séries d’au moins 5 km seulement (un 1 km très rapide ne compte pas)', () => {
    const histo = [passee('1-10', T('tapis_roulant', 250, 1000)), passee('1-20', T('tapis_roulant', 2500, 5000))];
    const r = records(histo, [T('tapis_roulant', 3100, 6200)]);          // 500 s/km, contre 500 s/km à 5 km : égal -> rien
    expect(de(r, 'allure')).toBeNull();
    const r2 = records(histo, [T('tapis_roulant', 3000, 6200)]);         // 483,9 s/km < 500
    expect(de(r2, 'allure')).toMatchObject({ palier_m: 5000, ancien: 500 });
  });
  test('l’égalité n’est pas un record ; sans série passée d’au moins ce palier : rien à battre', () => {
    expect(de(records([passee('1-19', T('tapis_roulant', 420, 1000))], [T('tapis_roulant', 420, 1000)]), 'allure')).toBeNull();
    expect(de(records([passee('1-19', T('tapis_roulant', 420, 800))], [T('tapis_roulant', 600, 1000)]), 'allure')).toBeNull();
    // Une série passée plus longue compte (elle est « d’au moins » le palier) : 600 s/km sur 5 km, battu par 420 sur 1 km.
    expect(de(records([passee('1-19', T('tapis_roulant', 3000, 5000))], [T('tapis_roulant', 420, 1000)]), 'allure')).toMatchObject({ ancien: 600 });
  });
  test('le vélo (dehors ou d’appartement), la marche et la randonnée n’ont pas d’allure', () => {
    ['cyclisme', 'velo_machine', 'randonnee', 'marche'].forEach((slug) => {
      expect(Modele.allureDeSerie(T(slug, 1000, 10000))).toBeNull();
      expect(de(records([passee('1-19', T(slug, 4000, 10000))], [T(slug, 1000, 10000)]), 'allure')).toBeNull();
    });
    expect(Modele.SPORTS.velo.unite).toBeUndefined();
  });
  test('sans distance ou sans durée : pas d’allure', () => {
    expect(Modele.allureDeSerie(T('tapis_roulant', null, 5000))).toBeNull();
    expect(Modele.allureDeSerie(T('tapis_roulant', 1800, null))).toBeNull();
  });
  test('la natation (s/100 m) et le rameur (s/500 m) : leurs paliers, leurs unités, leurs phrases', () => {
    const nage = records([passee('1-14', T('natation', 1920, 900), T('natation', 1900, 1000))], [T('natation', 1840, 1000)]);
    expect(de(nage, 'allure')).toMatchObject({ unite: 's_100m', palier_m: 1000, valeur: 184, ancien: 190 });
    expect(esp(Modele.phraseDeRecord(nage, 'natation', aujourdhui)[0])).toBe('Record d’allure sur 1 000 m ou plus : 3:04 /100 m.');
    const rame = records([passee('1-14', T('rameur', 480, 2000))], [T('rameur', 440, 2000)]);
    expect(de(rame, 'allure')).toMatchObject({ unite: 's_500m', palier_m: 2000, valeur: 110 });
    expect(esp(Modele.phraseDeRecord(rame, 'rameur', aujourdhui)[0])).toBe('Record d’allure sur 2 000 m ou plus : 1:50 /500 m.');
  });
  test('semi et marathon se disent « un semi », « un marathon »', () => {
    const semi = records([passee('1-14', T('course_a_pieds', 8000, 21097))], [T('course_a_pieds', 7000, 21097)]);
    expect(esp(Modele.phraseDeRecord(semi, 'course', aujourdhui)[0])).toMatch(/^Record d’allure sur un semi ou plus : /);
  });
  test('une série dans la séance du jour compte aussi comme passée (la première, plus lente, puis la seconde)', () => {
    const histo = [passee('1-19', T('tapis_roulant', 500, 1000))];
    const series = [T('tapis_roulant', 480, 1000), T('tapis_roulant', 450, 1000)];
    expect(de(records(histo, series, 0), 'allure')).toMatchObject({ valeur: 480 });
    expect(de(records(histo, series, 1), 'allure')).toMatchObject({ valeur: 450, ancien: 480 });
  });
  test('toute la vie : la ligne du journal n’est jamais « sur 12 mois »', () => {
    const r = records([passee('1-19', T('tapis_roulant', 500, 1000))], [T('tapis_roulant', 450, 1000)], 0, { equipement: 'machine' });
    expect(de(r, 'allure').douzeMois).toBe(false);
  });
});

const INDEX = {
  tractions: { slug: 'tractions', nom: 'Tractions', echelle: 'tractions', echelle_rang: 1, nature: 'force' },
  tractions_lestees: { slug: 'tractions_lestees', nom: 'Tractions Lestées', echelle: 'tractions', echelle_rang: 2, nature: 'force' },
  tractions_un_bras: { slug: 'tractions_un_bras', nom: 'Traction à un Bras', echelle: 'tractions', echelle_rang: 3, nature: 'habilete' },
  muscle_up: { slug: 'muscle_up', nom: 'Muscle-Up', echelle: 'muscle_up', echelle_rang: 1, nature: 'habilete' },
  squat: { slug: 'squat', nom: 'Squat', nature: 'force' }
};
const W = (slug, reps, extra) => Object.assign({ exercise_slug: slug, type_serie: 'travail', reps: reps, charge_kg: 0 }, extra || {});
const marche = (histo, series, i) => records(histo, series, i, { marche: { index: INDEX, passees: histo } });

describe('153 (B) — la première fois sur une marche', () => {
  test('une marche gravie : plus haute que toute marche déjà faite ; « Avant : » nomme la marche d’avant et sa date', () => {
    const histo = [passee('2-05', W('tractions', 8)), passee('4-10', W('tractions', 10))];
    const r = marche(histo, [W('tractions_lestees', 4, { charge_kg: 5 })]);
    expect(de(r, 'marche')).toMatchObject({ valeur: 2, ancien: 1, ancien_le: '2026-02-05T10:00:00Z', slug: 'tractions_lestees', ancien_slug: 'tractions' });
    const p = Modele.phraseDeRecord(r, 'tractions lestées', aujourdhui, (s) => INDEX[s].nom);
    expect(p[0]).toBe('Première fois : Tractions Lestées.');
    expect(p[1]).toBe('Avant : Tractions, depuis le 5 févr.');
  });
  test('une habileté pour la première fois, même sans marche d’avant ; gris « Une habileté. »', () => {
    const histo = [passee('2-05', W('squat', 5, { charge_kg: 100 }))];
    const r = marche(histo, [W('muscle_up', 1)]);
    expect(de(r, 'marche')).toMatchObject({ habilete: true, ancien: null, ancien_le: null });
    const p = Modele.phraseDeRecord(r, 'muscle-up', aujourdhui, (s) => INDEX[s].nom);
    expect(p).toEqual(['Première fois : Muscle-Up.', 'Une habileté.']);
  });
  test('jamais à la toute première séance de la personne dans l’app', () => {
    expect(marche([], [W('muscle_up', 1)])).toEqual([]);
    expect(marche([], [W('tractions', 8), W('tractions_lestees', 4)], 1)).toEqual([]);
  });
  test('une seule fois par exercice : la seconde série, ou une séance plus tard, ne dit plus rien', () => {
    const histo = [passee('2-05', W('tractions', 8))];
    expect(de(marche(histo, [W('tractions_lestees', 4), W('tractions_lestees', 4)], 1), 'marche')).toBeNull();
    const histo2 = histo.concat([passee('6-01', W('tractions_lestees', 4))]);
    expect(de(marche(histo2, [W('tractions_lestees', 4)]), 'marche')).toBeNull();
  });
  test('pas de marche d’avant sur l’échelle (hors habileté) : rien ; une marche plus basse : rien', () => {
    const histo = [passee('2-05', W('squat', 5, { charge_kg: 100 }))];
    expect(de(marche(histo, [W('tractions_lestees', 4)]), 'marche')).toBeNull();
    const histo2 = [passee('2-05', W('tractions_lestees', 4))];
    expect(de(marche(histo2, [W('tractions', 8)]), 'marche')).toBeNull();
  });
  test('une marche faite plus tôt dans la séance du jour compte comme déjà faite', () => {
    const histo = [passee('2-05', W('squat', 5, { charge_kg: 100 }))];
    const series = [W('tractions', 8), W('tractions_lestees', 4)];
    expect(de(marche(histo, series, 1), 'marche')).toMatchObject({ valeur: 2, ancien: 1 });
  });
  test('une chauffe n’est pas une marche faite', () => {
    const histo = [passee('2-05', W('tractions', 8, { type_serie: 'echauffement' }), W('squat', 5, { charge_kg: 100 }))];
    expect(de(marche(histo, [W('tractions_lestees', 4)]), 'marche')).toBeNull();
  });
});

describe('153 (C) — le plus gros D+, le plus d’étages', () => {
  test('toute la vie, la même règle que la distance ; « Avant : » dit l’ancien et sa date', () => {
    const histo = [passee('1-04', T('randonnee', 20000, 15000, { denivele_m: 850 })), passee('2-04', T('randonnee', 18000, 12000, { denivele_m: 500 }))];
    const r = records(histo, [T('randonnee', 25000, 14000, { denivele_m: 920 })]);
    expect(de(r, 'denivele_m')).toMatchObject({ valeur: 920, ancien: 850, ancien_le: '2026-01-04T10:00:00Z' });
    const p = Modele.phraseDeRecord(r.filter((x) => x.type === 'denivele_m'), 'randonnée', aujourdhui);
    expect(esp(p[0])).toBe('Record de D+ : 920 m.');
    expect(esp(p[1])).toBe('Avant : 850 m, le 4 janv.');
    const e = records([passee('1-04', T('escaliers', 900, null, { etages: 60 }))], [T('escaliers', 1000, null, { etages: 72 })]);
    expect(de(e, 'etages')).toMatchObject({ valeur: 72, ancien: 60 });
    const pe = Modele.phraseDeRecord(e.filter((x) => x.type === 'etages'), 'escaliers', aujourdhui);
    expect(pe[0]).toBe('Record d’étages : 72.');
    expect(pe[1]).toMatch(/^Avant : 60, le 4 janv\.$/);
  });
  test('égal ou plus bas : pas de record', () => {
    const histo = [passee('1-04', T('randonnee', 20000, 15000, { denivele_m: 850 }))];
    expect(de(records(histo, [T('randonnee', 20000, 15000, { denivele_m: 850 })]), 'denivele_m')).toBeNull();
  });
});

describe('153 — une médaille qui nomme plusieurs records', () => {
  test('la distance et le D+ (et l’allure) dans le même gras, une seule médaille', () => {
    const histo = [passee('1-04', T('randonnee', 20000, 15000, { denivele_m: 850 }))];
    const r = records(histo, [T('randonnee', 25000, 22700, { denivele_m: 920 })]);
    expect(r.map((x) => x.type)).toEqual(['duree_s', 'distance_m', 'denivele_m']);
    const p = Modele.phraseDeRecord(r, 'randonnée', aujourdhui);
    expect(esp(p[0])).toBe('Plus longue durée : 6 h 56. Plus longue distance : 22,7 km. Record de D+ : 920 m.');
  });
});
