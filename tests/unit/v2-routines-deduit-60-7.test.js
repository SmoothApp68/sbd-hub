/** @jest-environment node */
//
// 60-7 — le programme déduit : les SIX CHOIX du portage (QUESTIONNAIRE-COACH-V2 §5).
//
// Le portage `Routines.seancesQuiReviennent` est la règle ; la référence s'aligne sur lui
// (`deduit60c.py`). Six cas (`cas-60-7-deduit.json`), rejoués à l'ÉGALITÉ STRICTE :
//
//   1. un titre vide ou absent ne compte pas dans le nom ; sans aucun titre : « Routine » ;
//   2. les titres sont rognés (espaces de bord) avant d'être comptés ;
//   3. « Pecs » et « pecs » sont le même nom : les lettres A, B… se posent sur le nom
//      comparé sans casse ;
//   4. l'ordre d'affichage : le plus de séances d'abord, puis la dernière séance, à l'instant
//      près (deux routines qui finissent le même jour ne sont pas à égalité) ;
//   5. la fenêtre de 84 jours se compte en jours civils locaux (Europe/Paris), pas en 24 h
//      glissantes ;
//   6. une séance qu'aucun profil n'atteint à la réaffectation reste dans son groupe.
//
// Le fuseau est fixé ICI : le cas « jour_local » ne se lit que le 1er octobre à Paris.
//
// Chaque choix a été retiré du portage, un à un (`tests/banc/muter.js --lot`) : ce fichier
// seul tue chaque mutation. Voir le rapport de la PR.

process.env.TZ = 'Europe/Paris';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
require('../../v2/js/periode.js');
const R = require('../../v2/js/routines.js');

const CHEMIN = path.join(__dirname, 'fixtures/cas-60-7-deduit.json');
const F = JSON.parse(fs.readFileSync(CHEMIN, 'utf8'));
const empreinte = (brut) => crypto.createHash('sha256').update(brut).digest('hex');

// Une séance du fichier, à la forme des faits (`faits.js`) : des séries
// `{ rang, exercise_slug, type_serie, reps }`.
const seancesDe = (c) => c.seances.map((s) => ({
  id: s.id, debut: s.debut, titre: s.titre,
  series: s.series.map((x) => ({ rang: x[0], exercise_slug: x[1], type_serie: x[2], reps: x[3] }))
}));
const cas = (profil) => F.cas.filter((c) => c.profil === profil)[0];
const rejouer = (c) => R.seancesQuiReviennent(seancesDe(c), c.mesures);

describe('le fichier de cas', () => {
  test('son empreinte est celle du fichier reçu de Claude.ai', () => {
    const brut = fs.readFileSync(CHEMIN);
    expect(brut.length).toBe(17697);
    expect(empreinte(brut)).toBe('b9d255d2a23c059df7b679ce6c2206f3ce106b8bfcceac753da3e3dfe3b291a8');
    expect(F.reference).toBe('deduit60c.py');
    expect(F.fuseau).toBe('Europe/Paris');
    expect(F.cas.map((c) => c.profil)).toEqual([
      'titres_vides_et_rognes', 'homonymes_sans_casse', 'tri_par_instant',
      'jour_local', 'egalite_de_titres_meme_jour', 'seance_non_atteinte_reste']);
  });

  // La référence est rangée à côté du fichier de cas, comme `deduit60b.py` l'est de ceux de 60-3 : une trace, pas
  // un test à lancer (elle lit `catalogue.json` et `seances12s.json`, qui ne sont pas au dépôt).
  test('la référence deduit60c.py est celle reçue de Claude.ai', () => {
    const brut = fs.readFileSync(path.join(__dirname, 'fixtures/deduit60c.py'));
    expect(brut.length).toBe(8386);
    expect(empreinte(brut)).toBe('d4dbe9ae1be90574623a117a5027294722196d5b7b1cc5585252b6c8a7e656f1');
  });
});

describe('le fuseau', () => {
  test('le test joue à Paris : 22 h 30 UTC le 30 septembre est déjà le 1er octobre', () => {
    const d = new Date('2026-09-30T22:30:00Z');
    expect([d.getMonth() + 1, d.getDate()]).toEqual([10, 1]);
  });
});

describe('seancesQuiReviennent — les six choix du portage, à l’égalité stricte', () => {
  test('choix 1 et 2 — titres vides et rognés : « Haut A », puis « Routine A » et « Routine B »', () => {
    expect(rejouer(cas('titres_vides_et_rognes'))).toStrictEqual(cas('titres_vides_et_rognes').attendu);
  });

  test('choix 2 et 3 — « Pecs » et « pecs » sont le même nom : « Pecs A », « pecs B »', () => {
    expect(rejouer(cas('homonymes_sans_casse'))).toStrictEqual(cas('homonymes_sans_casse').attendu);
  });

  test('choix 4 — deux routines de 4 séances qui finissent le même jour : la dernière à l’instant près', () => {
    // « Matin » finit à 8 h, « Soir » à 18 h (heure de Paris) : le même jour, deux instants.
    const c = cas('tri_par_instant');
    expect(rejouer(c)).toStrictEqual(c.attendu);
    expect(c.attendu.map((r) => r.derniere)).toEqual(['2026-09-08', '2026-09-08']);
  });

  test('choix 5 — jours civils locaux : la séance du 9 juillet est hors de la fenêtre qui finit le 1er octobre', () => {
    // 30/09 à 22 h 30 UTC = le 1er octobre à Paris ; le 1er octobre − 83 jours = le 10 juillet. En UTC, ou en
    // 24 h glissantes, la séance du 9 juillet à midi entrerait : 5 séances au lieu de 4.
    const c = cas('jour_local');
    expect(rejouer(c)).toStrictEqual(c.attendu);
    expect(c.attendu[0]).toMatchObject({ fois: 4, derniere: '2026-10-01' });
  });

  test('à égalité de titres, le plus récent : la séance la plus tardive du groupe, même jour', () => {
    const c = cas('egalite_de_titres_meme_jour');
    expect(rejouer(c)).toStrictEqual(c.attendu);
    expect(c.attendu.map((r) => r.nom)).toEqual(['Bravo']);
  });

  test('choix 6 — une séance qu’aucun profil n’atteint reste dans son groupe', () => {
    const c = cas('seance_non_atteinte_reste');
    expect(rejouer(c)).toStrictEqual(c.attendu);
    expect(c.attendu.map((r) => [r.nom, r.fois])).toEqual([['S A', 7], ['S B', 5]]);
  });
});

describe('seancesQuiReviennent — les six cas, comme l’app les reçoit', () => {
  // Le cache rend les séances de la plus récente à la plus ancienne : l'ordre d'arrivée ne change rien.
  F.cas.forEach((c) => {
    test(c.profil + ' : dans l’ordre inverse, le même résultat', () => {
      expect(R.seancesQuiReviennent(seancesDe(c).reverse(), c.mesures)).toStrictEqual(c.attendu);
    });
  });

  test('ses entrées ne sont pas modifiées', () => {
    F.cas.forEach((c) => {
      const entree = seancesDe(c);
      const copie = JSON.parse(JSON.stringify(entree));
      R.seancesQuiReviennent(entree, c.mesures);
      expect(entree).toEqual(copie);
    });
  });
});
