//
// v2 — 233 : LE REPOS RÉEL (MOTEUR §9.27 ter). Le repos d'un exercice est l'écart entre deux séries de travail VALIDÉES du MÊME
// exercice (`validee_a`), pas la valeur du minuteur. Configuration discriminante : un SUPERSET dont le minuteur est à 90 s mais dont
// l'exercice revient ~3 min plus tard — la règle du repos long (188-2) ne doit PAS se déclencher.
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
const Moteur = require('../../v2/js/moteur.js');
const Seance = require('../../v2/js/seance.js');
const { progTravail } = require('./aide-routine-programmee.js');

const t = (min, sec) => new Date(Date.UTC(2026, 10, 4, 10, min, sec || 0)).toISOString();
const serie = (type, validee) => ({ exercise_slug: 'squat_barre', type_serie: type, validee_a: validee, charge_kg: 100, reps: 5 });

describe('233 — Moteur.reposReel : la médiane des écarts entre séries de travail validées du même exercice', () => {
  test('3 séries à 3 minutes : 180 s', () => {
    expect(Moteur.reposReel([serie('travail', t(0)), serie('travail', t(3)), serie('travail', t(6))])).toBe(180);
  });
  test('la chauffe n’est pas un repos de travail ; une dégressive non plus', () => {
    expect(Moteur.reposReel([serie('echauffement', t(0)), serie('travail', t(1)), serie('degressive', t(1, 20))])).toBeNull();
    expect(Moteur.reposReel([serie('echauffement', t(0)), serie('travail', t(2)), serie('travail', t(4))])).toBe(120);
  });
  test('sans validee_a (séries importées) ou avec une seule série validée : null — on ne devine pas', () => {
    expect(Moteur.reposReel([serie('travail', null), serie('travail', null)])).toBeNull();
    expect(Moteur.reposReel([serie('travail', t(0)), serie('travail', null)])).toBeNull();
    expect(Moteur.reposReel([])).toBeNull();
  });
  test('au-delà d’une heure c’est une interruption, pas un repos', () => {
    expect(Moteur.reposReel([serie('travail', t(0)), serie('travail', t(2)), serie('travail', new Date(Date.UTC(2026, 10, 4, 10, 2) + 4000000).toISOString())])).toBe(120);
    expect(Moteur.reposReel([serie('travail', t(0)), serie('travail', new Date(Date.UTC(2026, 10, 4, 12, 0)).toISOString())])).toBeNull();
  });
  test('l’ordre de saisie n’y change rien : les écarts se lisent dans l’ordre des validations', () => {
    expect(Moteur.reposReel([serie('travail', t(6)), serie('travail', t(0)), serie('travail', t(3))])).toBe(180);
  });
  test('l’habituel : la médiane des séances (la plus récente d’abord), les séances sans mesure ignorées', () => {
    const s = (a, b) => [serie('travail', t(0)), serie('travail', t(a)), serie('travail', t(a + b))];
    const h = Moteur.reposReelHabituel([s(2, 2), [serie('travail', null)], s(3, 3), s(5, 5)]);
    expect(h.parSeance).toEqual([120, null, 180, 300]);
    expect(h.habituel).toBe(180);
    expect(Moteur.reposReelHabituel([]).habituel).toBeNull();
  });
});

describe('233 — un superset à 90 s de minuteur : le repos réel est celui de l’exercice, pas du minuteur', () => {
  test('A1 B1 A2 B2 A3 B3, une minute et demie entre deux validations : A revient ~3 min après', () => {
    let s = Seance.creer({ id: 'S', userId: 'u', idSerie: (() => { let n = 0; return () => 'x' + (++n); })(),
      routine: { id: 'r', exercices: ['squat_barre', 'leg_curl'].map((slug, i) => ({ id: 're' + i, exercise_slug: slug,
        series: progTravail(3), reps_visees: null, repos_cible_s: 90, groupe_superset: 1 })) } });
    let ms = Date.UTC(2026, 10, 4, 10, 0, 0);
    [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]].forEach(([i, j]) => { ms += 90000; s = Seance.valider(s, i, j, new Date(ms)); });
    const lignes = Seance.lignes(s).filter((l) => l.exercise_slug === 'squat_barre');
    // `repos_s` (écart à la validation PRÉCÉDENTE, tout exercice confondu) dit 90 s : c'est le minuteur, pas le repos de l'exercice.
    expect(lignes.slice(1).map((l) => l.repos_s)).toEqual([90, 90]);
    expect(Moteur.reposReel(lignes)).toBe(180);
    // La règle du repos long lit le réel : 180 s > 90 s, elle ne dit rien malgré un minuteur à 90 s.
    expect(Moteur.reposAConseiller({ grand: true, stagne: true, chutes: [0.4, 0.4, 0.4], reposS: Moteur.reposReel(lignes) })).toBe(false);
    expect(Moteur.reposAConseiller({ grand: true, stagne: true, chutes: [0.4, 0.4, 0.4], reposS: 90 })).toBe(true);
  });
});

describe('233 — faits.reposReelsDe : les séries rangées par séance', () => {
  test('les 3 dernières séances mesurées ; une séance importée (sans validee_a) est sautée', () => {
    const F = require('../../v2/js/faits.js').creer();
    const jeu = {};
    const seance = (jour, ecart, mesure) => {
      const id = 's' + jour;
      jeu[id] = [0, 1, 2].map((k) => ({ exercise_slug: 'squat_barre', type_serie: 'travail', rang: k, charge_kg: 100, reps: 5,
        validee_a: mesure === false ? null : new Date(Date.UTC(2026, 9, jour, 8, 0, k * ecart)).toISOString() }));
      return { id, debut: new Date(Date.UTC(2026, 9, jour, 8)).toISOString() };
    };
    const c = { seances: [seance(1, 120), seance(8, 150), seance(12, 60, false), seance(15, 240)], seriesDe: (id) => jeu[id] };
    const r = F.reposReelsDe(c, 'squat_barre', 3);
    expect(r.parSeance).toEqual([240, 150, 120]);
    expect(r.habituel).toBe(150);
    expect(F.reposReelsDe(c, 'autre', 3).habituel).toBeNull();
  });
});
