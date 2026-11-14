/** @jest-environment node */
//
// PR 6 des mots (14/11/2026) — « Ton parcours » : le MOIS qui porte chaque chiffre du pied, les fenêtres datées, le levier.
//
// CONFIGURATIONS DISCRIMINANTES : J = 11/10/2026 (la date `aujourdhui` du fixture réel : le fixture s'arrête au 10/10, lui donner
// J = 14/11 change les verdicts) ; un meilleur mois qui n'est NI le début NI le dernier (squat : sept. 2026) ; un meilleur = dernier
// (couché, soulevé) ; une séance à 23:30 UTC la veille du 1er du mois (le mois suivant à Paris) ; un mois unique.
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
require('../../v2/js/seance.js');
const Parcours = require('../../v2/js/parcours.js');
const Faits = require('../../v2/js/faits.js');
const REEL = require('./fixtures/cas-75-reel.json');

const SERIES = REEL.series.map((l) => ({ debut: l[0], seance: l[1], slug: REEL.slugs[l[2]], reps: l[3], charge: l[4] }));
const entree = (extra) => Object.assign({ aujourdhui: REEL.aujourdhui, sexe: REEL.sexe, priorites: REEL.priorites, catalogue: REEL.catalogue, series: SERIES }, extra || {});
const BARRES = ['squat_barre', 'developpe_couche_barre', 'souleve_de_terre_barre', 'developpe_militaire_barre'];

// L'arithmétique INDÉPENDANTE : le mois civil de Paris de chaque série (Intl), sans passer par le module.
const jourParis = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
function reperesIndependants(slug) {
  const par = {};
  SERIES.forEach((s) => {
    if (s.slug !== slug || !(s.charge > 0) || s.reps < 5 || s.reps > 15) return;
    const m = jourParis.format(new Date(s.debut)).slice(0, 7);
    if (!(par[m] >= s.charge)) par[m] = s.charge;
  });
  const mois = Object.keys(par).sort();
  let max = 0, moisMax = null;
  mois.forEach((m) => { if (par[m] > max) { max = par[m]; moisMax = m; } });
  return { debut: { mois: mois[0], kg: par[mois[0]] }, meilleur: { mois: moisMax, kg: max },
           dernier: { mois: mois[mois.length - 1], kg: par[mois[mois.length - 1]] }, n: mois.length };
}

describe('PR 6 — Parcours : les repères du pied portent leur mois', () => {
  const p = Parcours.parcours(entree());
  const parSlug = (slug) => p.courbes.filter((c) => c.slug === slug)[0];

  test('les quatre barres du fixture : le tableau de la maquette, et le même résultat par le calendrier de Paris (Intl)', () => {
    const attendu = {
      squat_barre: { debut: ['2024-03', 60], meilleur: ['2026-09', 130], dernier: ['2026-10', 125], n: 27 },
      developpe_couche_barre: { debut: ['2024-01', 60], meilleur: ['2026-09', 125], dernier: ['2026-09', 125], n: 31 },
      souleve_de_terre_barre: { debut: ['2024-02', 95], meilleur: ['2026-10', 160], dernier: ['2026-10', 160], n: 22 },
      developpe_militaire_barre: { debut: ['2023-11', 25], meilleur: ['2025-10', 60], dernier: ['2026-10', 55], n: 22 }
    };
    BARRES.forEach((slug) => {
      const c = parSlug(slug), a = attendu[slug], i = reperesIndependants(slug);
      ['debut', 'meilleur', 'dernier'].forEach((k) => {
        expect([slug, k, c.reperes[k].mois, c.reperes[k].kg]).toEqual([slug, k, a[k][0], a[k][1]]);
        expect([slug, k, c.reperes[k]]).toEqual([slug, k, i[k]]);
      });
      expect([slug, c.mois.length]).toEqual([slug, a.n]);
      expect(i.n).toBe(a.n);
    });
  });

  test('les trois nombres de la référence (`debut / meilleur / maintenant`) ne bougent pas', () => {
    BARRES.forEach((slug) => {
      const c = parSlug(slug);
      expect([c.debut, c.meilleur, c.maintenant]).toEqual([c.reperes.debut.kg, c.reperes.meilleur.kg, c.reperes.dernier.kg]);
    });
  });

  test('le meilleur est le PREMIER mois qui a atteint le maximum (A12), pas le dernier', () => {
    const e = entree({ series: [
      { debut: '2026-03-02', seance: 'a', slug: 'squat_barre', reps: 5, charge: 100 },
      { debut: '2026-05-04', seance: 'b', slug: 'squat_barre', reps: 5, charge: 120 },
      { debut: '2026-07-06', seance: 'c', slug: 'squat_barre', reps: 5, charge: 120 },
      { debut: '2026-09-07', seance: 'd', slug: 'squat_barre', reps: 5, charge: 110 }] });
    const c = Parcours.parcours(e).courbes[0];
    expect([c.reperes.debut.mois, c.reperes.meilleur.mois, c.reperes.dernier.mois]).toEqual(['2026-03', '2026-05', '2026-09']);
  });

  test('un seul mois : début, meilleur et dernier sont le même mois', () => {
    const e = entree({ aujourdhui: '2026-11-14', series: [{ debut: '2026-11-03', seance: 'a', slug: 'squat_barre', reps: 5, charge: 100 }] });
    const c = Parcours.parcours(e).courbes[0];
    expect([c.reperes.debut.mois, c.reperes.meilleur.mois, c.reperes.dernier.mois]).toEqual(['2026-11', '2026-11', '2026-11']);
  });

  test('une série hors de 5 à 15 reps ne fait pas un mois (le mois sans 5 à 15 reps n’existe pas)', () => {
    const e = entree({ series: [
      { debut: '2026-03-02', seance: 'a', slug: 'squat_barre', reps: 3, charge: 140 },
      { debut: '2026-04-02', seance: 'b', slug: 'squat_barre', reps: 5, charge: 100 }] });
    const c = Parcours.parcours(e).courbes[0];
    expect(c.reperes.debut.mois).toBe('2026-04');
    expect(c.mois.map((m) => m[0])).toEqual(['2026-04']);
  });
});

describe('PR 6 — Parcours : les fenêtres datées et le levier', () => {
  test('le jour J et les fenêtres R et P sont dans la sortie : 12 avr. → 11 oct. contre 11 oct. 2025 → 11 avr. 2026', () => {
    const p = Parcours.parcours(entree());
    expect(p.aujourdhui).toBe('2026-10-11');
    expect(p.bornes).toEqual({ R: ['2026-04-12', '2026-10-11'], P: ['2025-10-11', '2026-04-11'] });
  });

  test('la phrase de tête : « 6 derniers mois » en chiffres, jamais « six »', () => {
    const p = Parcours.parcours(entree());
    expect(p.phrase.startsWith('Tes 6 derniers mois : ')).toBe(true);
    expect(/six|douze/i.test(p.phrase)).toBe(false);
  });

  // Un historique SYNTHÉTIQUE : les jambes montent (deux exercices à +20 %), le dos recule (deux exercices à −20 %). Cinq séances dans
  // chaque période, deux nombres de reps communs : le moteur compare, le levier (la plus petite moyenne) est le dos, qui RECULE.
  function historiqueLevierQuiRecule() {
    const series = [];
    let n = 0;
    const poser = (slug, jour, charge) => { [10, 12].forEach((reps) => series.push({ debut: jour, seance: slug + n++ + jour, slug, reps, charge })); };
    const jours = (a, m) => [1, 4, 8, 12, 16].map((d) => a + '-' + m + '-' + (d < 10 ? '0' + d : d));
    [['abduction_hanche', 50, 60], ['adduction_hanche', 50, 60], ['rowing_assis_machine', 60, 48], ['rowing_divergent_machine', 60, 48]].forEach(([slug, avant, apres]) => {
      jours('2025', '12').forEach((j) => poser(slug, j, avant));    // P : 11 oct. 2025 → 11 avr. 2026
      jours('2026', '07').forEach((j) => poser(slug, j, apres));    // R : 12 avr. → 11 oct. 2026
    });
    return series;
  }

  test('un levier qui ne progresse pas se dit « le moins bien des groupes » ; jamais « avance le plus lentement » pour un groupe qui recule', () => {
    const p = Parcours.parcours(entree({ priorites: [], series: historiqueLevierQuiRecule() }));
    const dos = p.zones.filter((z) => z.zone === 'dos')[0], jambes = p.zones.filter((z) => z.zone === 'jambes')[0];
    expect([jambes.verdict, dos.verdict]).toEqual(['↑', '↓']);
    expect(p.levier).toBe('dos');
    expect(p.phrase).toContain('Dos : le moins bien des groupes.');
    expect(p.phrase).not.toContain('avance le plus lentement');
  });

  test('et le levier qui avance garde « ce qui avance le plus lentement » (le cas réel : les épaules)', () => {
    const p = Parcours.parcours(entree());
    expect(p.levier).toBe('epaules');
    expect(p.phrase).toContain('Épaules : ce qui avance le plus lentement.');
  });
});

// G2 — le mois d'une séance est son mois CIVIL LOCAL (celui de l'appareil, Europe/Paris sous jest), pas son mois UTC : une séance à
// 23:30 UTC la veille du 1er est déjà du mois suivant à Paris ; une séance du jour du changement d'heure (25/10/2026) reste du jour.
describe('G2 — le mois nommé est le mois des données (calendrier de Paris, séances proches d’une frontière)', () => {
  const catalogue = { squat_barre: { slug: 'squat_barre', nom: 'Squat (Barre)', muscles_primaires: ['quadriceps'], mouvement: 'squat',
                                     schema_mouvement: 'accroupir', habilete: false, equipement: 'barre' } };
  const mois = (debuts) => {
    const seances = debuts.map((d, i) => ({ id: 's' + i, debut: d, statut: 'terminee' }));
    const series = debuts.map((d, i) => ({ id: 'x' + i, session_id: 's' + i, exercise_slug: 'squat_barre', type_serie: 'travail', reps: 5, charge_kg: 100 + i }));
    const c = { seances, series, exercices: [], journal: [], seriesDe: (id) => series.filter((x) => x.session_id === id), catalogue: () => catalogue };
    const e = Faits.creer().entreeDuParcours(c, new Date(2026, 10, 14, 12), { sexe: 'homme', priorites: [] });
    return Parcours.parcours(e).courbes[0].reperes;
  };

  test('une séance du 31/10 à 23:30 UTC est de NOVEMBRE à Paris (et le jour du changement d’heure reste octobre)', () => {
    const r = mois(['2026-10-25T01:30:00Z', '2026-10-31T23:30:00Z']);
    expect([r.debut.mois, r.dernier.mois]).toEqual(['2026-10', '2026-11']);
    expect(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date('2026-10-31T23:30:00Z')).slice(0, 7)).toBe('2026-11');
  });

  test('une séance du 30/09 à 22:30 UTC (1er octobre 00:30 à Paris) est d’octobre ; celle de 21:30 UTC est de septembre', () => {
    expect(mois(['2026-09-30T21:30:00Z', '2026-09-30T22:30:00Z']).dernier.mois).toBe('2026-10');
    expect(mois(['2026-09-30T21:30:00Z', '2026-09-30T22:30:00Z']).debut.mois).toBe('2026-09');
  });
});
