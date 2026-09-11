/** @jest-environment node */
//
// v2/js/palier.js — portage de MOTEUR-PROGRESSION-V2 §4 -> §7.
//
// CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) pour la circularité du
// §7.3 : une séance-exercice où LES DEUX ORDRES DE CALCUL DONNENT DES PALIERS
// DIFFÉRENTS. Sur une séance sans chauffe non taguée — ou dont la chauffe est
// en tête — une passe et deux passes donnent le même résultat, et le banc ne
// prouverait rien. Le cas qui sépare est le TOP SET SUIVI DE BACK-OFFS.

const P = require('../../v2/js/palier.js');

// Fabrique de séries, dans l'ordre où elles ont été faites.
const s = (kg, reps, type, rpe) => ({ type_serie: type || 'travail', charge_kg: kg, reps: reps, rpe: rpe === undefined ? null : rpe });
const seance = (...liste) => liste.map((x, i) => Object.assign({ id: 'x' + i, rang: i + 1 }, x));
const etat = (e) => ({ etat: e, part: 0, total: 99 });
const roles = (r) => r.series.map((d) => d.role);

// ── 1 — la chauffe TAGUÉE ──────────────────────────────────────────────────
describe('§4 — le tag prime toujours', () => {
  test('une chauffe taguée est exclue et ne compte pas dans n', () => {
    // n compterait 5 avec les chauffes, donc requis = 3 ; sans elles n = 3 et
    // requis = 2. C'est bien le DÉNOMINATEUR qui change, pas seulement le tri.
    const r = P.analyser(seance(
      s(60, 8, 'echauffement'), s(100, 4, 'echauffement'),
      s(120, 5), s(120, 5), s(120, 4)), etat('indetermine'));
    expect(roles(r)).toEqual(['chauffe', 'chauffe', 'travail', 'travail', 'travail']);
    expect(r.retenues).toHaveLength(3);
    expect(r.palier).toBe(120);
    expect(r.reps).toBe(5);
  });

  test('une chauffe taguée LOURDE reste une chauffe — le tag ne se discute pas', () => {
    // 140 est la plus lourde de la séance ; taguée chauffe, elle ne fait pas
    // palier et ne sert même pas à calculer le seuil des 75 %.
    const r = P.analyser(seance(
      s(140, 1, 'echauffement'), s(100, 5), s(100, 5), s(100, 5)), etat('indetermine'));
    expect(roles(r)[0]).toBe('chauffe');
    expect(r.palier).toBe(100);
  });

  test('une dégressive taguée est écartée du palier, sans aucune inférence (§6.3)', () => {
    const r = P.analyser(seance(
      s(100, 10), s(100, 10), s(100, 10), s(60, 15, 'degressive')), etat('indetermine'));
    expect(roles(r)[3]).toBe('degressive');
    expect(r.palier).toBe(100);
  });

  test('une série taguée `echec` NE VOTE PAS — arbitré le 11/09/2026', () => {
    // Cas réel, aurel_br, séance du 28/08/2026, développé militaire haltère :
    // 92x1, [echec] 100x0, 92x1. En laissant l'échec voter — le trou de
    // `banc_etage1.py` — n = 3, la descente coupe la dernière, et le palier
    // sort à 100 pour 0 rep : l'app affirme qu'on a TENU 100 kg le jour où on
    // a ÉCHOUÉ à 100 kg. Écarté, il reste 92x1 et 92x1 : palier 92, 1 rep.
    const r = P.analyser(seance(
      s(92, 1), s(100, 0, 'echec'), s(92, 1)), etat('indetermine'));
    expect(roles(r)).toEqual(['travail', 'echec', 'travail']);
    expect(r.palier).toBe(92);
    expect(r.reps).toBe(1);
    expect(r.retenues).toHaveLength(2);
  });

  test('l’échec ne compte NI au numérateur NI au dénominateur', () => {
    // Avec l'échec, n = 4 et requis = 2 : 110 n'aurait pas fait palier non
    // plus, mais la plus lourde retenue changerait le seuil des 75 %. Sans
    // lui, n = 3 et le calcul ne le voit jamais.
    const r = P.analyser(seance(
      s(100, 5), s(100, 5), s(100, 5), s(130, 0, 'echec')), etat('indetermine'));
    expect(r.retenues).toHaveLength(3);
    expect(r.palier).toBe(100);
    expect(roles(r)[3]).toBe('echec');
    // Et l'échec reste DÉCRIT : il est conservé, pas jeté (§4, tonnage).
    expect(r.series).toHaveLength(4);
  });

  test('§6.3 — un échec en fin de séance n’est jamais lu comme une descente choisie', () => {
    // Le tag déclare une descente SUBIE : aucune inférence ne s'y applique,
    // et il ne peut donc pas jouer le rôle de « dernière série » du §6.
    const r = P.analyser(seance(
      s(100, 10), s(100, 10), s(100, 10), s(80, 0, 'echec')), etat('indetermine'));
    expect(roles(r)[3]).toBe('echec');
    expect(r.retenues).toHaveLength(3);
    expect(r.palier).toBe(100);
  });

  test('aucune série de travail -> absence propre, jamais une valeur inventée', () => {
    const r = P.analyser(seance(s(60, 8, 'echauffement'), s(80, 5, 'echauffement')), etat('monte'));
    expect(r.palier).toBeNull();
    expect(r.reps).toBeNull();
    expect(r.erreur).toBe('aucune-serie-de-travail');
  });
});

// ── 2 — la chauffe NON taguée (§4.1) ───────────────────────────────────────
describe('§4.1 — la chauffe probable, sous 75 % et AVANT le palier', () => {
  test('une série à 75 % ou moins, en tête, est détectée', () => {
    const r = P.analyser(seance(
      s(70, 10), s(100, 5), s(100, 5), s(100, 5)), etat('indetermine'));
    expect(roles(r)[0]).toBe('chauffe_probable');   // 70 <= 0,75 x 100
    expect(r.palier).toBe(100);
  });

  test('le seuil est FERMÉ à 75 % : 75 est dedans, 75,5 est dehors', () => {
    const dedans = P.analyser(seance(s(75, 10), s(100, 5), s(100, 5), s(100, 5)), etat('indetermine'));
    expect(roles(dedans)[0]).toBe('chauffe_probable');
    const dehors = P.analyser(seance(s(75.5, 10), s(100, 5), s(100, 5), s(100, 5)), etat('indetermine'));
    expect(roles(dehors)[0]).toBe('travail');
  });

  test('le seuil se mesure sur la plus lourde DE TRAVAIL, pas sur la chauffe taguée', () => {
    // Avec 200 (taguée) dans le calcul, le seuil serait 150 et le 100 tomberait.
    const r = P.analyser(seance(
      s(200, 1, 'echauffement'), s(100, 8), s(120, 5), s(120, 5), s(120, 5)), etat('indetermine'));
    expect(roles(r)[1]).toBe('travail');            // 100 > 0,75 x 120
    expect(r.palier).toBe(120);
  });
});

// ── 3 — LA CIRCULARITÉ DU §7.3, LE TEST CENTRAL ────────────────────────────
describe('§7.3 — deux passes, et un cas où une seule passe se trompe', () => {
  // TOP SET PUIS BACK-OFFS. 100 x 5, puis trois séries à 60. Le 60 vaut 60 %
  // de la plus lourde, donc il passe le critère des 75 % — mais il arrive
  // APRÈS la première série au palier provisoire, donc ce n'est pas de la
  // chauffe, ce sont des back-offs.
  const topSet = seance(s(100, 5), s(60, 12), s(60, 12), s(60, 12));

  test('DEUX PASSES : le palier est 60 — la charge tenue sur la majorité', () => {
    const r = P.analyser(topSet, etat('indetermine'));
    // Palier provisoire sur les séries brutes : n = 4, requis = 2, seul 60
    // atteint le compte -> 60. La frontière de chauffe tombe donc au rang 2,
    // et aucune série ne la précède en étant sous 75 %.
    expect(roles(r)).toEqual(['exploration', 'travail', 'travail', 'travail']);
    expect(r.palier).toBe(60);
    expect(r.reps).toBe(12);
  });

  test('UNE SEULE PASSE donnerait 100 — une charge tenue UNE fois', () => {
    // Reproduction de ce que ferait un calcul sans palier provisoire : la règle
    // des 75 % appliquée sans condition de position écarte les trois back-offs,
    // il ne reste que le top set, et n = 1 suffit à faire palier.
    const unePasse = (series) => {
      const trav = P.trier(series).filter(P.serieDeTravail);
      const lourde = Math.max.apply(null, trav.map((x) => Number(x.charge_kg)));
      const retenues = trav.filter((x) => Number(x.charge_kg) > 0.75 * lourde);
      return P.calculerPalier(retenues);
    };
    expect(unePasse(topSet)).toBe(100);
    // Les deux lectures divergent : c'est ce qui rend le cas discriminant.
    expect(unePasse(topSet)).not.toBe(P.analyser(topSet, etat('indetermine')).palier);
  });

  test('sur une chauffe EN TÊTE, les deux ordres coïncident — d’où le cas ci-dessus', () => {
    // 60 puis trois séries à 100 : la légère précède le palier, une passe et
    // deux passes l'écartent pareil. Ce cas ne prouve rien sur la circularité.
    const chauffeEnTete = seance(s(60, 12), s(100, 5), s(100, 5), s(100, 5));
    const r = P.analyser(chauffeEnTete, etat('indetermine'));
    expect(r.palier).toBe(100);
    const trav = P.trier(chauffeEnTete).filter(P.serieDeTravail);
    const lourde = Math.max.apply(null, trav.map((x) => Number(x.charge_kg)));
    expect(P.calculerPalier(trav.filter((x) => Number(x.charge_kg) > 0.75 * lourde))).toBe(100);
  });

  test('le palier PROVISOIRE ne sort jamais du calcul', () => {
    // Il vaut 60 ici et le définitif aussi, mais rien dans la sortie ne le
    // nomme : il n'est ni rendu, ni stocké, ni comparable.
    const r = P.analyser(topSet, etat('indetermine'));
    expect(Object.keys(r).sort()).toEqual(['erreur', 'palier', 'reps', 'retenues', 'series']);
  });
});

// ── 4 — la descente de fin (§6) ────────────────────────────────────────────
describe('§6 — trois mécanismes de descente, et un tag qui en tranche deux', () => {
  test('descente CHOISIE : l’avant-dernière tient le compte -> elle ne vote pas', () => {
    const r = P.analyser(seance(
      s(100, 10), s(100, 10), s(100, 10), s(80, 10)), etat('indetermine'));
    expect(roles(r)[3]).toBe('descente_choisie');
    expect(r.retenues).toHaveLength(3);
    expect(r.palier).toBe(100);
  });

  test('descente SUBIE : l’avant-dernière a raté le compte -> elle est conservée', () => {
    // Compte de référence au palier = 10 ; l'avant-dernière n'en fait que 6,
    // c'est un signal de fatigue et il reste dans le calcul.
    const r = P.analyser(seance(
      s(100, 10), s(100, 10), s(100, 6), s(80, 10)), etat('indetermine'));
    expect(roles(r)[3]).toBe('travail');
    expect(r.retenues).toHaveLength(4);
    expect(r.palier).toBe(100);
  });

  test('le DÉGRESSIF tagué n’est jamais lu comme de la fatigue (§6.4)', () => {
    // Cas réel du §6.4, séance du 24/08/2026 : 59x15, 59x15, 32x8 [dégressif].
    // La v1 concluait « fatigue » sur un dégressif volontaire — un sur quatre.
    const r = P.analyser(seance(
      s(59, 15), s(59, 15), s(32, 8, 'degressive')), etat('indetermine'));
    expect(roles(r)).toEqual(['travail', 'travail', 'degressive']);
    expect(r.palier).toBe(59);
  });

  test('§6.5 — le compte de référence se prend AU PALIER, pas sur toutes les séries', () => {
    // La série de montée fait 15 reps, les séries au palier 8. Pris sur toutes
    // les séries, le compte de référence serait 15, l'avant-dernière (8) le
    // raterait, et la descente passerait pour de la fatigue. Au palier, il
    // vaut 8, et la descente est bien un choix.
    const r = P.analyser(seance(
      s(90, 15), s(100, 8), s(100, 8), s(80, 12)), etat('indetermine'));
    expect(roles(r)[3]).toBe('descente_choisie');
    expect(r.palier).toBe(100);
  });

  test('la descente ne s’applique pas à moins de trois séries retenues', () => {
    const r = P.analyser(seance(s(100, 10), s(80, 10)), etat('indetermine'));
    expect(roles(r)[1]).not.toBe('descente_choisie');
    expect(r.palier).toBe(100);   // n = 2, requis = 1
  });
});

// ── 5 — l’état de l’exercice (§5) ──────────────────────────────────────────
describe('§5 — la rampe ne vote que si l’exercice « monte »', () => {
  const rampe = seance(s(90, 10), s(100, 10), s(100, 10));

  test('état « monte » : la première série est une rampe et ne juge pas le palier', () => {
    const r = P.analyser(rampe, etat('monte'));
    expect(roles(r)).toEqual(['rampe', 'travail', 'travail']);
    expect(r.retenues).toHaveLength(2);
    expect(r.palier).toBe(100);   // n = 2, requis = 1
  });

  test('état « ne monte pas » : toutes les séries sont retenues, la branche NE s’applique PAS', () => {
    const r = P.analyser(rampe, etat('ne_monte_pas'));
    expect(roles(r)).toEqual(['travail', 'travail', 'travail']);
    expect(r.retenues).toHaveLength(3);
    expect(r.palier).toBe(100);   // n = 3, requis = 2, k = 2
  });

  test('l’état change le palier quand il change le dénominateur', () => {
    // Trois séries montantes, aucune répétée. En « monte », la rampe part,
    // n = 2, requis = 1 -> palier 110. Sinon n = 3, requis = 2 -> aucun palier.
    const montante = seance(s(90, 10), s(100, 10), s(110, 10));
    expect(P.analyser(montante, etat('monte')).palier).toBe(110);
    expect(P.analyser(montante, etat('ne_monte_pas')).palier).toBeNull();
    expect(P.analyser(montante, etat('indetermine')).palier).toBeNull();
  });

  test('aucun état fourni -> « indéterminé », jamais une hypothèse', () => {
    expect(P.analyser(rampe, null).retenues).toHaveLength(3);
    expect(P.analyser(rampe, undefined).retenues).toHaveLength(3);
  });

  test('etatsExercices : 8 séances avant de conclure, puis 60 % / 35 %', () => {
    const seances = (n, montantes) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        out.push({ slug: 'exo', series: i < montantes
          ? seance(s(90, 10), s(100, 10), s(100, 10))
          : seance(s(100, 10), s(100, 10), s(100, 10)) });
      }
      return out;
    };
    // 7 séances toutes montantes : sous le seuil, aucune hypothèse.
    expect(P.etatsExercices(seances(7, 7)).exo.etat).toBe('indetermine');
    expect(P.etatsExercices(seances(8, 8)).exo.etat).toBe('monte');
    expect(P.etatsExercices(seances(10, 6)).exo.etat).toBe('monte');          // 60 %
    expect(P.etatsExercices(seances(10, 5)).exo.etat).toBe('indetermine');    // 50 %
    expect(P.etatsExercices(seances(10, 3)).exo.etat).toBe('ne_monte_pas');   // 30 %
    // Une séance de moins de trois séries ne compte pas du tout.
    const courtes = [{ slug: 'exo', series: seance(s(90, 10), s(100, 10)) }];
    expect(P.etatsExercices(courtes).exo).toBeUndefined();
  });
});

// ── 6 — l’exploration (§7.5) ───────────────────────────────────────────────
describe('§7.5 — une série plus lourde que le palier ne valide rien', () => {
  test('le top set d’une séance de back-offs est une exploration', () => {
    const r = P.analyser(seance(s(122.5, 5), s(122.5, 5), s(122.5, 5), s(125, 3)), etat('indetermine'));
    expect(roles(r)[3]).toBe('exploration');
    expect(r.palier).toBe(122.5);
    // Et surtout : les reps affichées sont celles du PALIER, pas celles de
    // l'exploration. « j'ai fait 122,5 x 5 », pas « 125 x 3 ».
    expect(r.reps).toBe(5);
  });

  test('les reps affichées sont les MEILLEURES au palier, pas les premières', () => {
    // Trois séries à la même charge, comptes différents, la meilleure au
    // milieu. Prendre la première dirait « 100 × 3 » alors qu'on a fait 5.
    const r = P.analyser(seance(s(100, 3), s(100, 5), s(100, 4)), etat('indetermine'));
    expect(r.palier).toBe(100);
    expect(r.reps).toBe(5);
    // Et la meilleure en dernier, pour ne pas tester un ordre par accident.
    expect(P.analyser(seance(s(100, 3), s(100, 4), s(100, 6)), etat('indetermine')).reps).toBe(6);
  });

  test('une exploration reste dans la sortie — elle est conservée, pas jetée', () => {
    const r = P.analyser(seance(s(100, 5), s(100, 5), s(100, 5), s(110, 1)), etat('indetermine'));
    expect(r.series).toHaveLength(4);
    expect(roles(r)[3]).toBe('exploration');
    expect(r.retenues).toHaveLength(3);   // mais elle ne vote pas
  });
});

// ── 7 — l’absence de palier ────────────────────────────────────────────────
describe('§7.2 — la règle de majorité, et l’absence propre', () => {
  test('le plancher : 2 -> 1 · 3 -> 2 · 4 -> 2 · 5 et plus -> 3', () => {
    const p = (kgs) => P.calculerPalier(kgs.map((k, i) => ({ id: i, charge_kg: k })));
    expect(p([100, 90])).toBe(100);                       // n=2, requis 1
    expect(p([100, 90, 90])).toBe(90);                    // n=3, requis 2
    expect(p([100, 100, 90, 90])).toBe(100);              // n=4, requis 2
    expect(p([100, 100, 90, 90, 90])).toBe(90);           // n=5, requis 3
    expect(p([100, 100, 90, 90, 80, 80])).toBeNull();     // n=6, requis 3
  });

  test('une pyramide sans charge répétée ne rend AUCUN palier', () => {
    // 70 vaut 78 % de 90 : au-dessus du seuil de chauffe probable, donc les
    // trois séries sont retenues. n = 3, requis = 2, aucune charge répétée.
    const r = P.analyser(seance(s(70, 10), s(80, 10), s(90, 10)), etat('ne_monte_pas'));
    expect(r.palier).toBeNull();
    expect(r.reps).toBeNull();
    expect(r.erreur).toBeNull();          // ce n'est pas une erreur, c'est un fait
    expect(r.series).toHaveLength(3);     // et les séries restent décrites
  });

  test('la charge la PLUS LOURDE qui atteint le compte gagne, pas la plus fréquente', () => {
    // 80 x 4 contre 100 x 3 : les deux atteignent le compte, le palier est 100.
    const r = P.analyser(seance(
      s(80, 10), s(80, 10), s(80, 10), s(80, 10), s(100, 5), s(100, 5), s(100, 5)),
      etat('indetermine'));
    expect(r.palier).toBe(100);
  });

  test('une série sans charge ou sans reps ne participe pas', () => {
    const brut = seance(s(100, 5), s(100, 5), s(100, 5));
    brut.push({ id: 'z', rang: 9, type_serie: 'travail', charge_kg: null, reps: 12 });
    brut.push({ id: 'y', rang: 10, type_serie: 'travail', charge_kg: 120, reps: null });
    const r = P.analyser(brut, etat('indetermine'));
    expect(r.series).toHaveLength(3);
    expect(r.palier).toBe(100);
  });

  test('zéro rep est une VALEUR, pas une absence — la tentative manquée est décrite', () => {
    // Elle est conservée et porte son rôle, mais elle ne vote pas : §7 bis.16
    // de l'écran de saisie — « une tentative ne compte pas comme record, et
    // l'affichage doit la montrer comme telle ».
    const r = P.analyser(seance(s(100, 5), s(100, 5), s(100, 5), s(140, 0, 'echec')), etat('indetermine'));
    expect(r.series).toHaveLength(4);
    expect(roles(r)[3]).toBe('echec');
    expect(r.palier).toBe(100);
    expect(r.reps).toBe(5);
  });

  test('une série NON taguée à zéro rep, elle, reste du travail', () => {
    // Le tag est ce qui distingue les deux. Sans tag, l'app ne suppose rien.
    const r = P.analyser(seance(s(100, 5), s(100, 5), s(100, 5), s(100, 0)), etat('indetermine'));
    expect(roles(r)[3]).toBe('travail');
    expect(r.palier).toBe(100);
    expect(r.reps).toBe(5);
  });

  test('§1.2 — les séries sont triées sur le RANG, pas sur l’ordre d’arrivée', () => {
    // Mêmes séries, ordre de requête inversé : le palier ne bouge pas, et la
    // chauffe probable reste en tête.
    const ordre = seance(s(60, 12), s(100, 5), s(100, 5), s(100, 5));
    const inverse = ordre.slice().reverse();
    const a = P.analyser(ordre, etat('indetermine'));
    const b = P.analyser(inverse, etat('indetermine'));
    expect(b.palier).toBe(a.palier);
    expect(roles(b)).toEqual(roles(a));
    expect(b.series[0].serie.rang).toBe(1);
  });
});

// ── LA RECETTE DU §6.1 DU BANC, reproduite telle quelle ────────────────────
//
// Sortie de référence de `recette_palier.py`, exécuté :
//   série 1 : 4 reps @ RPE 8.5 -> cran 'dur' -> 4 comptée(s)
//   série 2 : 4 reps @ RPE 9.5 -> cran 'dur' -> 4 comptée(s)
//   série 3 : 4 reps @ RPE 9.5 -> cran 'dur' -> 4 comptée(s)
//   séries à la cible : 3 / 3 · palier : TENU
describe('RECETTE §6.1 — le squat du 2 février 2026', () => {
  const SQUAT = [{ reps: 4, rpe: 8.5 }, { reps: 4, rpe: 9.5 }, { reps: 4, rpe: 9.5 }];
  const CIBLE = 4;

  test('les trois séries sont au cran « dur », donc comptées pleines', () => {
    expect(SQUAT.map((x) => P.cranEffort(x.rpe))).toEqual(['dur', 'dur', 'dur']);
    expect(SQUAT.map((x) => P.repsComptees(x.reps, x.rpe))).toEqual([4, 4, 4]);
  });

  test('TROIS séries sur trois atteignent la cible, et le palier est TENU', () => {
    const comptees = SQUAT.filter((x) => P.repsComptees(x.reps, x.rpe) >= CIBLE).length;
    expect(comptees).toBe(3);
    expect(P.palierTenu(SQUAT, CIBLE).tenu).toBe(true);
  });

  test('CONTRE-ÉPREUVE — si 9,5 basculait en cran « max », le palier serait REFUSÉ', () => {
    // C'est le bug du §812 de la v1 : 4-3-3, une seule série à la cible, et
    // une prudence qui punit quelqu'un qui a fait le travail.
    const penalise = SQUAT.map((x) => (x.rpe >= 9.5 ? x.reps - 1 : x.reps));
    expect(penalise).toEqual([4, 3, 3]);
    expect(penalise.filter((r) => r >= CIBLE).length).toBe(1);
    expect(P.palierTenu(penalise.map((r) => ({ reps: r, rpe: null })), CIBLE).tenu).toBe(false);
  });

  test('la séance réelle en base rend bien un palier de 125', () => {
    // Données exactes de la base, aurel_br, 02/02/2026 :
    // W60x8, W80x6, W100x4, W115x2, W122.5x1, T125x4, T125x4, T125x4
    const r = P.analyser(seance(
      s(60, 8, 'echauffement'), s(80, 6, 'echauffement'), s(100, 4, 'echauffement'),
      s(115, 2, 'echauffement'), s(122.5, 1, 'echauffement'),
      s(125, 4, 'travail', 8.5), s(125, 4, 'travail', 9.5), s(125, 4, 'travail', 9.5)),
      etat('monte'));
    expect(r.palier).toBe(125);
    expect(r.reps).toBe(4);
    expect(r.retenues).toHaveLength(3);
  });

  test('SANITY §9.2 — le tableau de la spec, cible 5', () => {
    const cas = [[[5, 5, 5, 5], true], [[5, 5, 4, 4], true], [[5, 5, 4], true],
                 [[5, 4, 4, 3], false], [[5, 3, 3, 3], false]];
    cas.forEach(([profil, attendu]) => {
      expect(P.palierTenu(profil.map((r) => ({ reps: r, rpe: null })), 5).tenu).toBe(attendu);
    });
  });

  test('§17.3 — les bandes sont fermées : < 8 facile, 8 à 9,5 dur, 10 max', () => {
    expect([7, 7.5, 7.9].map(P.cranEffort)).toEqual(['facile', 'facile', 'facile']);
    expect([8, 9, 9.5].map(P.cranEffort)).toEqual(['dur', 'dur', 'dur']);
    expect(P.cranEffort(10)).toBe('max');
    expect(P.cranEffort(null)).toBeNull();
    // §17.4 : seul le cran « max » retire une rep, et seulement pour valider.
    expect(P.repsComptees(4, 10)).toBe(3);
    expect(P.repsComptees(4, 9.5)).toBe(4);
    expect(P.repsComptees(4, null)).toBe(4);
  });

  test('moins de deux séries au palier : pas de verdict', () => {
    expect(P.palierTenu([{ reps: 5, rpe: null }], 5).tenu).toBe(false);
    expect(P.palierTenu([], 5).tenu).toBe(false);
  });
});
