//
// Chantier 36 — trois chemins vers une file définitivement bloquée.
//
// LE POINT COMMUN : une valeur que la base refuse avec un code DÉFINITIF
// (`23514`, `22P02`, `23505`). L'entrée devient la tête de file, `prochaine()`
// s'arrête dessus, et tout ce qui suit ne monte plus JAMAIS.
//
// CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) :
//   · D5 — une DÉVIATION QUI VIDE UN EXERCICE AJOUTÉ. C'est le seul geste qui
//     produit `series: 0`, et il passe par le REPORT, pas par l'éditeur. Un
//     report avec des valeurs normales ne distingue pas « borné » de « non
//     borné » : `valider()` n'est jamais appelée sur ce chemin.
//   · D6 — un nombre HORS `int4`. En deçà, borner et ne pas borner donnent
//     exactement la même ligne.
//   · D6 bis — une erreur NON définitive. Avec un code définitif, `bloquee` est
//     posée et l'état le disait déjà.
//
// Environnement jsdom (PAS de docblock `node`) : `v2/js/modele.js` se termine
// par `this`, que Babel remplace par `undefined` sous l'environnement node.

const Routines = require('../../v2/js/routines.js');
const Seance = require('../../v2/js/seance.js');
const Attente = require('../../v2/js/attente.js');

let n = 0;
const uuid = () => 'id-' + (++n);
beforeEach(() => { n = 0; });

const ROUTINE = {
  id: 'r1', nom: 'Push',
  exercices: [{
    id: 're1', exercise_slug: 'dc-barre', rang: 0, series: 3,
    reps_visees: 8, repos_cible_s: 120, groupe_superset: null, note: null
  }]
};

// ── D5 — LE REPORT SUR LA ROUTINE N'APPLIQUAIT AUCUNE BORNE ─────────────────
describe('D5 — le report de fin de séance', () => {
  // Le geste réel, de bout en bout : on ajoute un exercice en séance, on
  // supprime sa dernière série, on termine. `ecartsRoutine` rend alors
  // `series: 0`, et `routine_exos_series_bornees` exige 1..20.
  const seanceAvecExoVide = () => {
    let s = Seance.creer({ id: 's1', userId: 'u1', routine: ROUTINE, idSerie: uuid });
    s = Seance.ajouterExercice(s, 'curl', uuid);
    const i = s.exercices.findIndex((e) => e.exercise_slug === 'curl');
    return Seance.retirerSerie(s, i, 0);
  };

  test('⚠️ vider un exercice ajouté produit bien `series: 0` — le geste existe', () => {
    const v = Seance.ecartsRoutine(seanceAvecExoVide(), ROUTINE);
    const curl = v.voulues.filter((x) => x.exercise_slug === 'curl')[0];
    expect(curl).toBeDefined();
    expect(curl.series).toBe(0);
  });

  test('et ce qui PART est borné : plus rien ne viole `routine_exos_series_bornees`', () => {
    const v = Seance.ecartsRoutine(seanceAvecExoVide(), ROUTINE);
    const voulues = v.voulues.map((x) => (x.id ? x : Object.assign({}, x, { id: uuid() })));
    const plan = Routines.planEcritures(ROUTINE.exercices, voulues, 'r1');
    const lignes = [].concat(plan.insertions || [], (plan.majs || []).map((m) => m.champs || m));
    expect(lignes.length).toBeGreaterThan(0);
    lignes.forEach((l) => {
      if (l.series === undefined) return;
      expect(l.series).toBeGreaterThanOrEqual(1);
      expect(l.series).toBeLessThanOrEqual(20);
    });
  });

  test('21 séries sont ramenées à 20, 0 à 1 — on borne, on ne jette pas la ligne', () => {
    expect(Routines.normaliserExercice({ exercise_slug: 'x', series: 21 }, 'r1', 0).series).toBe(20);
    expect(Routines.normaliserExercice({ exercise_slug: 'x', series: 0 }, 'r1', 0).series).toBe(1);
    expect(Routines.normaliserExercice({ exercise_slug: 'x', series: -3 }, 'r1', 0).series).toBe(1);
    expect(Routines.normaliserExercice({ exercise_slug: 'x', series: 999 }, 'r1', 0).series).toBe(20);
  });

  test('une valeur normale traverse intacte — borner n’est pas déformer', () => {
    expect(Routines.normaliserExercice({ exercise_slug: 'x', series: 4 }, 'r1', 0).series).toBe(4);
    expect(Routines.serieBornee(1)).toBe(1);
    expect(Routines.serieBornee(20)).toBe(20);
  });

  test('`series` absente retombe sur le défaut, jamais sur une valeur refusée', () => {
    expect(Routines.serieBornee(null)).toBe(Routines.SERIES_DEFAUT);
    expect(Routines.serieBornee(undefined)).toBe(Routines.SERIES_DEFAUT);
    expect(Routines.serieBornee('bonjour')).toBe(Routines.SERIES_DEFAUT);
  });

  // ⚠️ ON BORNE CE QUI DOIT EXISTER, ON ANNULE CE QUI PEUT ÊTRE ABSENT.
  // `reps_visees` et `repos_cible_s` acceptent NULL, et NULL veut dire « non
  // renseigné » — plus honnête qu'une valeur inventée par un cap.
  test('`reps_visees` et `repos_cible_s` hors bornes deviennent NULL, pas un cap', () => {
    const o = Routines.normaliserExercice(
      { exercise_slug: 'x', series: 3, reps_visees: 150, repos_cible_s: 9000 }, 'r1', 0);
    expect(o.reps_visees).toBeNull();
    expect(o.repos_cible_s).toBeNull();
  });

  test('et dans les bornes, elles passent telles quelles', () => {
    const o = Routines.normaliserExercice(
      { exercise_slug: 'x', series: 3, reps_visees: 8, repos_cible_s: 120 }, 'r1', 0);
    expect(o.reps_visees).toBe(8);
    expect(o.repos_cible_s).toBe(120);
  });

  // La borne est sur le chemin du REPORT, pas seulement dans l'éditeur (test 3).
  test('⚠️ la borne vit dans `normaliserExercice`, que `valider()` soit appelée ou NON', () => {
    const brouillon = { nom: 'R', exercices: [{ exercise_slug: 'x', series: 0 }] };
    // L'éditeur refuse, et c'est son rôle.
    expect(Routines.valider(brouillon, []).valide).toBe(false);
    // Le report n'appelle pas `valider` — et il est borné quand même.
    expect(Routines.normaliserExercice(brouillon.exercices[0], 'r1', 0).series).toBe(1);
  });
});

// ── D6 — `reps` ET `duree_s` SONT `integer`, ET RIEN NE LES BORNAIT ─────────
describe('D6 — les colonnes `integer` de `sets`', () => {
  const uneSerie = () => {
    const s = Seance.creer({ id: 's1', userId: 'u1', idSerie: uuid });
    return Seance.ajouterExercice(s, 'squat', uuid);
  };
  const repsDe = (v) => Seance.modifierSerie(uneSerie(), 0, 0, { reps: v }).exercices[0].series[0].reps;
  const dureeDe = (v) => Seance.modifierSerie(uneSerie(), 0, 0, { duree_s: v }).exercices[0].series[0].duree_s;

  test('11 chiffres : borné avant l’envoi — c’était `22003`', () => {
    expect(repsDe('99999999999')).toBe(Seance.REPS_MAX_SERIE);
    expect(repsDe('99999999999')).toBeLessThanOrEqual(2147483647);
  });

  test('⚠️ ≥ 1e21 : borné aussi — c’était `22P02`, code DÉFINITIF, file morte', () => {
    expect(repsDe('1e21')).toBe(Seance.REPS_MAX_SERIE);
    expect(Number.isSafeInteger(repsDe('1e21'))).toBe(true);
    // Et le JSON ne part plus en notation exponentielle, qui est la cause exacte.
    expect(JSON.stringify(repsDe('1e21'))).not.toMatch(/e\+/i);
  });

  test('juste au-dessus d’`int4` : borné', () => {
    expect(repsDe('2147483648')).toBe(Seance.REPS_MAX_SERIE);
  });

  // ⚠️ 104 reps existent en base sur une vraie série : le plafond écarte
  // l'absurde, il ne prétend pas dire ce qui est plausible.
  test('une valeur réelle traverse : 104 reps restent 104', () => {
    expect(repsDe('104')).toBe(104);
    expect(repsDe('12')).toBe(12);
    expect(repsDe('0')).toBe(0);
  });

  test('vide reste vide — « non renseigné » n’est pas zéro', () => {
    expect(repsDe('')).toBeNull();
    expect(repsDe(null)).toBeNull();
  });

  // Le prompt donnait `duree_s` pour protégé. Il l'est contre le NÉGATIF, pas
  // contre le dépassement : c'est aussi un `integer` sans CHECK.
  test('⚠️ `duree_s` est `integer` LUI AUSSI, et débordait pareil', () => {
    expect(dureeDe('99999999999')).toBe(Seance.DUREE_MAX_S);
    expect(dureeDe('99999999999')).toBeLessThanOrEqual(2147483647);
    expect(dureeDe('3600')).toBe(3600);
    expect(dureeDe('-5')).toBeNull();
  });

  test('`plafonne` laisse passer null et ramène le négatif à zéro', () => {
    expect(Seance.plafonne(null, 10)).toBeNull();
    expect(Seance.plafonne(-4, 10)).toBe(0);
    expect(Seance.plafonne(4, 10)).toBe(4);
    expect(Seance.plafonne(40, 10)).toBe(10);
  });
});

// ── D6, SECOND SYMPTÔME — L'ÉTAT QUI RASSURE ALORS QUE RIEN NE MONTE ───────
describe('l’état de la file', () => {
  const entree = (o) => Object.assign({
    cle: 'sets:s1', seq: 1, table: 'sets', op: 'remplacer', id: 's1',
    donnees: [], version: 1, essais: 0, bloquee: null
  }, o);

  test('rien tenté : « N à envoyer » — c’est vrai, et ça le reste', () => {
    const e = Attente.deciderEtat({ code: 'a-jour' }, [entree({})]);
    expect(e.code).toBe('a-envoyer');
    expect(e.libelle).toBe('1 à envoyer');
  });

  // ⚠️ LE DÉFAUT : `22003` n'est pas définitif, donc `bloquee` reste null —
  // mais `vidanger` s'arrête quand même sur la tête de file. L'état affichait
  // « N à envoyer », c'est-à-dire exactement ce qu'il affiche quand tout va bien.
  test('⚠️ tenté et refusé sans être définitif : l’état LE DIT', () => {
    const e = Attente.deciderEtat({ code: 'a-jour' }, [entree({ essais: 1 })]);
    expect(e.code).toBe('echec');
    expect(e.libelle).toMatch(/échec/i);
    expect(e.libelle).not.toBe('1 à envoyer');
  });

  test('définitif : « refusé » prime sur « en échec »', () => {
    const e = Attente.deciderEtat({ code: 'a-jour' },
      [entree({ essais: 1, bloquee: { code: '23514', message: 'x' } })]);
    expect(e.code).toBe('bloque');
    expect(e.libelle).toMatch(/refusé/);
  });

  test('`marquerEchec` sur un code non définitif compte les essais sans bloquer', () => {
    const f = Attente.marquerEchec([entree({})], 'sets:s1', { code: '22003' });
    expect(f[0].bloquee).toBeNull();
    expect(f[0].essais).toBe(1);
    expect(Attente.deciderEtat({ code: 'a-jour' }, f).code).toBe('echec');
    // Et la tête de file reste servable : on réessaiera, contrairement à un définitif.
    expect(Attente.prochaine(f)).not.toBeNull();
  });

  test('file vide : l’état de LECTURE passe, l’écriture ne dit rien', () => {
    expect(Attente.deciderEtat({ code: 'a-jour', libelle: 'À jour' }, []).code).toBe('a-jour');
  });

  test('`resume` compte les trois catégories séparément', () => {
    const r = Attente.resume([
      entree({ cle: 'a', seq: 1 }),
      entree({ cle: 'b', seq: 2, essais: 2 }),
      entree({ cle: 'c', seq: 3, essais: 1, bloquee: { code: '23505' } })
    ]);
    expect(r.enAttente).toBe(3);
    expect(r.enEchec).toBe(1);
    expect(r.bloquees).toBe(1);
  });
});
