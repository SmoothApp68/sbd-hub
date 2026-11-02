// 217 — UNE SEULE SOMME PONDÉRÉE des séries par muscle (`Semaine.sommeDesSeries`).
// Refactor sans changement de comportement : les trois anciennes boucles (volumeParMuscle, volume du générateur,
// volume prévu des équilibres) sont GARDÉES ICI, telles qu'elles étaient, et comparées à la fonction unique sur un
// historique synthétique à graine fixe. Le jeu (MAX par zone) n'est pas touché : son écart est mesuré, non corrigé.
global.self = global;
const Modele = require('../../v2/js/modele.js');
const Semaine = require('../../v2/js/semaine.js');

let graine = 217;
const alea = () => { graine = (graine * 1664525 + 1013904223) % 4294967296; return graine / 4294967296; };
const choisir = (l) => l[Math.floor(alea() * l.length)];
const MUSCLES = ['pectoraux', 'triceps', 'deltoide_anterieur', 'grand_dorsal', 'biceps', 'avant_bras', 'abdominaux',
  'quadriceps', 'fessiers', 'ischio_jambiers', 'bas_du_dos', 'mollets', 'trapezes', 'haut_du_dos'];
const catalogue = [];
for (let i = 0; i < 25; i++) {
  const pris = MUSCLES.slice().sort(() => alea() - 0.5);
  const np = 1 + Math.floor(alea() * 2), ns = Math.floor(alea() * 3), nt = Math.floor(alea() * 3);
  catalogue.push({ slug: 'x' + i, nom: 'X' + i, mesure: 'charge_reps', charge: 'externe',
    muscles_primaires: pris.slice(0, np), muscles_secondaires: pris.slice(np, np + ns),
    muscles_stabilisateurs: pris.slice(np + ns, np + ns + nt) });
}
catalogue.push({ slug: 'vide', nom: 'Vide', mesure: 'charge_reps', charge: 'externe' }); // sans muscle
const slugs = catalogue.map((e) => e.slug).concat(['inconnu']);
const series = [];
for (let i = 0; i < 400; i++) {
  series.push({ id: 's' + i, session_id: 'z' + (i % 20), exercise_slug: choisir(slugs),
    type_serie: choisir(['travail', 'travail', 'travail', 'echauffement']), charge_kg: 60, reps: 8, rang: i });
}
const routines = [0, 1, 2, 3].map((r) => ({ id: 'r' + r, nom: 'R' + r, exercices: Array.from({ length: 6 }, () => ({
  exercise_slug: choisir(slugs), n: Math.floor(alea() * 6) })) }));

// ── AVANT : les trois boucles d'origine, copiées à l'identique ──
function avantVolumeParMuscle(ser, exercices) {
  const cat = {}; exercices.forEach((e) => { cat[e.slug] = e; });
  const total = {};
  ser.forEach((s) => {
    if (!Modele.estTravail(s)) return;
    const exo = cat[s.exercise_slug]; if (!exo) return;
    Semaine.musclesPonderes(exo).forEach((x) => { total[x.muscle] = (total[x.muscle] || 0) + x.poids; });
  });
  return Object.keys(total).map((m) => ({ muscle: m, libelle: Semaine.libelleMuscle(m),
    series: Math.round(total[m] * 100) / 100 }))
    .sort((a, b) => b.series - a.series || a.libelle.localeCompare(b.libelle));
}
function avantVolumeDuGenerateur(rs, cat) {
  const v = {};
  rs.forEach((r) => r.exercices.forEach((x) => {
    Semaine.musclesPonderes(cat[x.exercise_slug]).forEach((p) => { v[p.muscle] = (v[p.muscle] || 0) + p.poids * x.n; });
  }));
  return v;
}
function avantPrevuEquilibres(rs, cat, muscle) {
  let t = 0;
  rs.forEach((r) => r.exercices.forEach((x) => {
    const f = cat[x.exercise_slug]; if (!f) return;
    Semaine.musclesPonderes(f).forEach((p) => { if (p.muscle === muscle) t += p.poids * x.n; });
  }));
  return Math.round(t * 100) / 100;
}
const parSlug = {}; catalogue.forEach((e) => { parSlug[e.slug] = e; });

describe('217 — une seule somme pondérée, sorties identiques aux trois anciennes boucles', () => {
  test('volumeParMuscle (le volume fait)', () => {
    const apres = Semaine.volumeParMuscle(series, catalogue);
    expect(apres.length).toBeGreaterThan(5);
    expect(apres).toEqual(avantVolumeParMuscle(series, catalogue));
  });
  test('volume du générateur (routines, toutes ensemble et une à une)', () => {
    const lignes = (rs) => { const l = []; rs.forEach((r) => r.exercices.forEach((x) => l.push({ exo: parSlug[x.exercise_slug], n: x.n }))); return l; };
    expect(Semaine.sommeDesSeries(lignes(routines))).toEqual(avantVolumeDuGenerateur(routines, parSlug));
    routines.forEach((r) => expect(Semaine.sommeDesSeries(lignes([r]))).toEqual(avantVolumeDuGenerateur([r], parSlug)));
  });
  test('volume prévu des équilibres (muscle par muscle)', () => {
    const l = []; routines.forEach((r) => r.exercices.forEach((x) => { if (parSlug[x.exercise_slug]) l.push({ exo: parSlug[x.exercise_slug], n: x.n }); }));
    const somme = Semaine.sommeDesSeries(l);
    MUSCLES.forEach((m) => expect(Math.round((somme[m] || 0) * 100) / 100).toBe(avantPrevuEquilibres(routines, parSlug, m)));
  });
  test('entrées vides ou fiche absente : rien, sans exception', () => {
    expect(Semaine.sommeDesSeries(null)).toEqual({});
    expect(Semaine.sommeDesSeries([{ exo: undefined, n: 3 }, null])).toEqual({});
  });
});
