/** @jest-environment node */
//
// 95 — LES ÉCRANS DE « TON ANNÉE » (`v2/js/annee.js`, `ecrans`) : ce que l'écran et l'image disent, mis en mots
// depuis le bilan (`THBilans`). Jamais le nombre de séances de l'année, jamais une comparaison sans données ; les
// heures et les jours à la salle (97) : un écran exigé, jamais comparé.

process.env.TZ = 'Europe/Paris';

global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/bilan.js');
require('../../v2/js/parcours.js');
const Bilans = require('../../v2/js/bilans.js');
const Annee = require('../../v2/js/annee.js');

const CAT = [
  { slug: 'squat_barre', nom: 'Squat (Barre)', equipement: 'barre', muscles_primaires: ['quadriceps'], muscles_secondaires: [] },
  { slug: 'developpe_couche_barre', nom: 'Développé Couché (Barre)', equipement: 'barre', muscles_primaires: ['pectoraux'], muscles_secondaires: [] },
  { slug: 'souleve_de_terre_barre', nom: 'Soulevé de Terre (Barre)', equipement: 'barre', muscles_primaires: ['ischio_jambiers'], muscles_secondaires: [] },
  { slug: 'curl_halteres', nom: 'Curl (Haltère)', equipement: 'haltere', muscles_primaires: ['biceps'], muscles_secondaires: [] }
];
let n = 0;
function seance(jour, series) {
  const id = 's' + (++n);
  return { id, jour, titre: 'Bas A', series: series.map((x, i) => ({ id: id + i, session_id: id, exercise_slug: x[0],
    charge_kg: x[1], reps: x[2], type_serie: 'travail', rang: i })) };
}
function semaines(de, a, fn) {
  const out = [];
  let k = 0;
  for (let d = new Date(de + 'T12:00:00Z'); d <= new Date(a + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 7)) {
    out.push(seance(d.toISOString().slice(0, 10), fn(k++)));
  }
  return out;
}
const tout = (ecrans) => JSON.stringify(ecrans);
const bilan = (seances, aujourdhui) => Bilans.bilanDeLaPeriode({ periode: Bilans.periodeDeLAnnee(2026),
  aujourdhui: aujourdhui || '2026-12-31', seances, exercices: CAT, pesees: [], paris: [] });

describe('95 — les écrans de l’année pleine', () => {
  // 52 séances de barres en 2025 et en 2026, plus UNE séance de curl en 2026 : 53 séances, aucun exercice à 53.
  const s = semaines('2025-01-02', '2025-12-25', () => [['squat_barre', 120, 5], ['squat_barre', 100, 8],
    ['developpe_couche_barre', 100, 5], ['souleve_de_terre_barre', 160, 3]])
    .concat(semaines('2026-01-01', '2026-12-24', (k) => [['squat_barre', 130, 5], ['squat_barre', 110, 8],
      ['developpe_couche_barre', 100, 5], ['souleve_de_terre_barre', k === 3 ? 170 : 165, 3]]))
    .concat([seance('2026-06-06', [['curl_halteres', 14, 12]])]);
  const e = Annee.ecrans({ bilan: bilan(s), qui: 'aurel_br', jeu: null });
  const cles = e.map((x) => x.cle);
  test('l’ordre de la maquette, la plaque en dernier', () => {
    expect(cles).toEqual(['ouverture', 'tonnes', 'mois', 'reps', 'profil', 'muscle', 'exercice', 'seance', 'barres',
                          'avance', 'plaque']);
    expect(e[e.length - 1].d).toBe(0);
  });
  test('⚠️ jamais le nombre de séances de l’année (53)', () => {
    expect(tout(e)).not.toMatch(/\b53\b/);
    expect(e.find((x) => x.cle === 'exercice').txt[0][0]).toBe('52 séances');
  });
  test('les barres : la plus lourde de ta vie, l’écart à 2025', () => {
    const b = e.find((x) => x.cle === 'barres');
    expect(b.chiffre.v).toBe(170);
    expect(b.txt[0]).toBe('au Soulevé de Terre (Barre). La plus lourde de ta vie.');
    expect(b.lignes).toEqual([{ n: 'Squat (Barre)', v: '120 → ', em: '130\u00a0kg' },
                              { n: 'Développé Couché (Barre)', v: '100\u00a0kg, comme en 2025' }]);
    expect(b.total.map((x) => (Array.isArray(x) ? x[0] : x)).join('')).toBe(
      'Squat, couché et soulevé ensemble : 400\u00a0kg, 20 de plus qu’en 2025.');
  });
  test('ce qui a le plus avancé, et la plaque sans le coach', () => {
    const a = e.find((x) => x.cle === 'avance');
    expect(a.titre).toBe('Squat (Barre)');
    const p = e.find((x) => x.cle === 'plaque').plaque;
    expect(p.qui).toBe('aurel_br');
    expect(p.cases.map((c) => c.k)).toEqual(['Soulevé', 'Barre la plus lourde', 'Exercices qui progressent',
      'Squat, couché, soulevé', 'Plus gros progrès', 'Muscle de l’année']);
    expect(tout(p)).not.toMatch(/pari|coach/i);
  });
  test('le profil : force ≤ 5, mix 6 à 8, muscle ≥ 9', () => {
    const p = e.find((x) => x.cle === 'profil');
    expect(p.lignes.map((l) => l.v)).toEqual(['75 % · force, 5 reps ou moins', '25 % · mix, 6 à 8 reps',
                                               '0 % · muscle, 9 reps et plus']);
  });
});

describe('95 — moins de 2 mois de données : les faits seulement', () => {
  const s = semaines('2026-10-01', '2026-10-29', () => [['squat_barre', 100, 5], ['developpe_couche_barre', 80, 5],
    ['souleve_de_terre_barre', 120, 5]]);
  const e = Annee.ecrans({ bilan: bilan(s, '2026-10-30'), qui: '', jeu: null });
  test('⚠️ aucune comparaison : ni flèche, ni « comme », ni « de plus »', () => {
    expect(tout(e)).not.toMatch(/→|comme |de plus|de moins|2025|début d’année/);
    expect(e.map((x) => x.cle)).not.toContain('avance');
  });
});

describe('95 — le jeu, le coach, une année vide', () => {
  test('l’écran du jeu lit l’état du jeu', () => {
    const s = semaines('2026-01-01', '2026-03-01', () => [['squat_barre', 100, 5]]);
    const e = Annee.ecrans({ bilan: bilan(s), jeu: { debut: { niveau: { niveau: 3 }, succes: { nombre: 4 } },
                                                     fin: { niveau: { niveau: 7 }, succes: { nombre: 10 } } } });
    const j = e.find((x) => x.cle === 'jeu');
    expect(j.chiffre).toMatchObject({ v: 7, avant: 'Niveau ' });
    expect(j.lignes[0].v).toBe('6 succès gagnés cette année');
  });
  test('une année sans série : un seul écran après l’ouverture', () => {
    const e = Annee.ecrans({ bilan: bilan([]), jeu: null });
    expect(e.map((x) => x.cle)).toEqual(['ouverture', 'vide']);
  });
});

describe('97 — l’écran des heures et des jours à la salle', () => {
  const s = semaines('2025-01-02', '2025-12-25', () => [['squat_barre', 120, 5]])
    .concat(semaines('2026-01-01', '2026-12-24', () => [['squat_barre', 130, 5]]));
  const avec = (salle) => Annee.ecrans({ bilan: Bilans.bilanDeLaPeriode({ periode: Bilans.periodeDeLAnnee(2026),
    aujourdhui: '2026-12-31', seances: s, exercices: CAT, pesees: [], paris: [], salle }), qui: '', jeu: null });
  const texte = (t) => t.map((x) => (Array.isArray(x) ? x[0] : x)).join('');
  test('⚠️ exigé, juste après les tonnes, avec l’équivalence', () => {
    const e = avec({ jours: 180, minutes: 260 * 60 });
    const cles = e.map((x) => x.cle);
    expect(cles.indexOf('salle')).toBe(cles.indexOf('tonnes') + 1);
    const sa = e.find((x) => x.cle === 'salle');
    expect(sa.chiffre).toMatchObject({ v: 260, unite: 'h' });
    expect(texte(sa.txt)).toBe('sur 180 jours. ≈ 11 jours entiers sous la barre.');
  });
  test('⚠️ jamais comparé : ni écart, ni flèche, ni l’année d’avant (même quand elle existe)', () => {
    const sa = JSON.stringify(avec({ jours: 180, minutes: 260 * 60 }).find((x) => x.cle === 'salle'));
    expect(sa).not.toMatch(/[+−→↑↗↘↓]|de plus|de moins|comme|2025|qu’en|avant/);
  });
  test('sans aucune fin : les jours seuls ; peu d’heures : pas d’équivalence', () => {
    expect(avec({ jours: 12, minutes: 0 }).find((x) => x.cle === 'salle').chiffre).toMatchObject({ v: 12, unite: 'jours' });
    expect(texte(avec({ jours: 20, minutes: 30 * 60 }).find((x) => x.cle === 'salle').txt)).toBe('sur 20 jours.');
  });
});
