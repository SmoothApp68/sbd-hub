/** @jest-environment node */
//
// v2/js/palier.js — portage de MOTEUR-PROGRESSION-V2 §4 -> §7.
//
// CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) pour la circularité du
// §7.3 : une séance-exercice où LES DEUX ORDRES DE CALCUL DONNENT DES PALIERS
// DIFFÉRENTS. Sur une séance sans chauffe non taguée — ou dont la chauffe est
// en tête — une passe et deux passes donnent le même résultat, et le banc ne
// prouverait rien. Le cas qui sépare est le TOP SET SUIVI DE BACK-OFFS.

require('../../v2/js/modele.js'); // la lecture des nombres (`lireNombre`), chargée avant, comme dans index.html
const P = require('../../v2/js/palier.js');
// ⚠️ LE MODULE, LUI, NE DÉPEND DE RIEN — c'est SON TEST qui va chercher
// `RESSENTIS` chez l'écran de saisie, pour vérifier que la table de crans de
// `palier.js` ne dérive pas de la liste qui fait foi (§2 undecies). La flèche
// de dépendance reste à l'endroit dans le code livré.
const Seance = require('../../v2/js/seance.js');

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
    expect(Object.keys(r).sort())
      .toEqual(['erreur', 'meilleure', 'palier', 'reps', 'retenues', 'series', 'votantes']);
    expect(Object.keys(r).join(' ')).not.toMatch(/provisoire/);
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

  // ⚠️ TEST INVERSÉ LE 19/09/2026 (§5.2, §7.3). Il affirmait qu'en « monte » la
  // rampe partait — n = 2, requis = 1 — et que le palier valait 110. C'était le
  // défaut, écrit en test : trois séries montantes dont aucune n'est répétée,
  // c'est une PYRAMIDE, et 110 n'y a été tenu qu'une fois. Il n'y a pas de palier
  // provisoire, donc pas de rampe, donc pas de palier — dans les trois états.
  // Le dénominateur, lui, continue de bouger : les deux tests ci-dessus le
  // montrent sur une séance où une rampe est vraiment prononcée (n = 2 / n = 3).
  test('une pyramide ne rend aucun palier, quel que soit l’état', () => {
    const montante = seance(s(90, 10), s(100, 10), s(110, 10));
    expect(P.analyser(montante, etat('monte')).palier).toBeNull();
    expect(P.analyser(montante, etat('ne_monte_pas')).palier).toBeNull();
    expect(P.analyser(montante, etat('indetermine')).palier).toBeNull();
    // Et la rampe n'est plus prononcée : les trois séries restent du travail.
    expect(roles(P.analyser(montante, etat('monte')))).toEqual(['travail', 'travail', 'travail']);
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

// ── 5 bis — CONTRE QUOI SE JUGE LA RAMPE (§5.2, corrigé le 19/09/2026) ─────
//
// CONFIGURATION DISCRIMINANTE (`CADRAGE-V2` §2 quater) : la plus lourde des
// séries suivantes doit être une EXPLORATION, c'est-à-dire plus lourde que le
// palier provisoire. Sur une séance qui finit au palier — le squat du 2 février,
// le soulevé hexagonal du 21 août — les deux repères coïncident et le banc ne
// prouverait rien. Le cas qui sépare est celui qui MONTE À LA FIN.
//
// Les cinq premiers cas ÉCHOUENT avec l'ancienne comparaison (vérifié : elle
// rend respectivement 130 × 3, 295,7 × 12, 84 × 8, 46,1 × 10 et 210 × 1). Les
// deux recettes passent avant comme après : elles gardent ce qui marchait.
//
// Toutes ces séances sont RÉELLES, lues en base. `echauffement` et `degressive`
// sont les tags portés par les séries ; l'état « monte » est celui que
// `etatsExercices` mesure sur ces exercices.
describe('§5.2 — la rampe se juge contre le palier provisoire, pas contre la plus lourde', () => {
  // ✱ Le cas constaté sur appareil : la page Développé Couché annonçait
  // « Dernière séance : 130 × 3 » alors que 130 n'a été tenu qu'UNE fois et que
  // 125 l'a été deux fois. La série de 125 × 4 était écartée comme rampe parce
  // qu'elle est plus légère que le 130 — qui est une exploration.
  test('✱ couché barre du 15/09/2026 : palier 125 × 5, et non 130 × 3', () => {
    const r = P.analyser(seance(
      s(20, 15, 'echauffement'), s(60, 10, 'echauffement'), s(100, 5, 'echauffement'),
      s(115, 1, 'echauffement'), s(125, 4), s(125, 5), s(130, 3)), etat('monte'));
    expect(r.palier).toBe(125);
    expect(r.reps).toBe(5);
    // La première série de travail n'est PAS une rampe : elle est au palier.
    expect(roles(r).slice(4)).toEqual(['travail', 'travail', 'exploration']);
  });

  // ✱ Deux séries tenues à 275,7 et une montée à 295,7. L'ancienne règle
  // écartait la première des deux, n tombait à 2, et le §7.2 gardait 295,7 —
  // une charge tenue une seule fois.
  test('✱ presse à cuisses du 14/09/2026 : palier 275,7 × 12, et non 295,7 × 12', () => {
    const r = P.analyser(seance(
      s(195.7, 12, 'echauffement'), s(275.7, 12), s(275.7, 12), s(295.7, 12)), etat('monte'));
    expect(r.palier).toBe(275.7);
    expect(r.reps).toBe(12);
    expect(roles(r)).toEqual(['chauffe', 'travail', 'travail', 'exploration']);
  });

  // ✱ Trois séries seulement, et la plus courte séance où le défaut se voit :
  // deux à 80, une montée à 84.
  test('✱ couché incliné haltères du 15/09/2026 : palier 80 × 10, et non 84 × 8', () => {
    const r = P.analyser(seance(s(80, 10), s(80, 10), s(84, 8)), etat('monte'));
    expect(r.palier).toBe(80);
    expect(r.reps).toBe(10);
    expect(roles(r)).toEqual(['travail', 'travail', 'exploration']);
  });

  // ✱ PAS DE PALIER PROVISOIRE, PAS DE RAMPE — et donc pas de palier du tout.
  // Une pyramide : aucune charge n'est tenue deux fois. L'ancienne règle
  // écartait la première série, ramenait n à 2 (requis 1) et annonçait
  // « palier 46,1 » — une charge tenue UNE fois, sur une séance où rien n'a
  // été tenu. Le moteur se tait, et c'est le comportement voulu (§7.3).
  test('✱ leg curl allongé du 21/08/2026 : une pyramide ne rend AUCUN palier', () => {
    const r = P.analyser(seance(
      s(41, 12), s(42.1, 12), s(46.1, 10), s(32, 10, 'degressive')), etat('monte'));
    expect(r.palier).toBeNull();
    expect(r.reps).toBeNull();
    // Absence CIRCONSTANCIELLE : les séries restent du travail entier, et
    // aucune n'est une rampe.
    expect(roles(r)).toEqual(['travail', 'travail', 'travail', 'degressive']);
    // Ce que la séance a eu de mieux reste lisible : le journal, lui, parle.
    expect(r.meilleure).toEqual({ charge: 46.1, reps: 10 });
  });

  // ✱ Le profil de Jordan, qui pyramide beaucoup. Ici le palier provisoire est
  // nul ET la chauffe probable joue : quatre séries sous 75 % de 210 partent,
  // il reste 180×5, 200×1, 210×1, 200×1. L'ancienne règle écartait le 180 comme
  // rampe, ce qui laissait 200, 210, 200 — et la descente de fin y lisait un
  // choix, d'où « palier 210 » sur une charge tenue une fois.
  test('✱ soulevé de terre de Jordan, 01/03/2026 : palier 200 × 1, et non 210 × 1', () => {
    const r = P.analyser(seance(
      s(20, 20), s(60, 10), s(100, 8), s(140, 6),
      s(180, 5), s(200, 1), s(210, 1), s(200, 1)), etat('monte'));
    expect(r.palier).toBe(200);
    expect(r.reps).toBe(1);
    expect(roles(r).slice(4)).toEqual(['travail', 'travail', 'exploration', 'travail']);
  });

  // RECETTE — inchangée. La séance finit AU palier : les deux repères
  // coïncident, il n'y a pas de rampe ni avant ni après.
  test('recette : le squat du 02/02/2026 rend toujours 125 × 4', () => {
    const r = P.analyser(seance(
      s(60, 8, 'echauffement'), s(80, 6, 'echauffement'), s(100, 4, 'echauffement'),
      s(115, 2, 'echauffement'), s(122.5, 1, 'echauffement'),
      s(125, 4), s(125, 4), s(125, 4)), etat('monte'));
    expect(r.palier).toBe(125);
    expect(r.reps).toBe(4);
    expect(r.retenues).toHaveLength(3);
  });

  // RECETTE — inchangée, et c'est celle qui compte : une VRAIE rampe reste une
  // rampe. Le 120 est plus léger que le palier provisoire (130, tenu trois
  // fois), donc il ne vote pas — exactement le §7.4.
  test('recette : le soulevé hexagonal du 21/08/2026 garde sa rampe à 120', () => {
    const r = P.analyser(seance(
      s(60, 10, 'echauffement'), s(100, 5, 'echauffement'),
      s(120, 10), s(130, 10), s(130, 10), s(130, 10)), etat('monte'));
    expect(r.palier).toBe(130);
    expect(r.reps).toBe(10);
    expect(roles(r)).toEqual(['chauffe', 'chauffe', 'rampe', 'travail', 'travail', 'travail']);
    expect(r.retenues).toHaveLength(3);   // §7.4 — n = 3, k = 3
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
    expect(SQUAT.map((x) => P.repsComptees(x))).toEqual([4, 4, 4]);
  });

  test('TROIS séries sur trois atteignent la cible, et le palier est TENU', () => {
    const comptees = SQUAT.filter((x) => P.repsComptees(x) >= CIBLE).length;
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
    // §17.4 : seul le cran « max » retire une rep — dans le CALCUL PRUDENT
    // seulement (`repsPrudentes`). INVERSÉ LE 11/10/2026 (74) : `repsComptees`
    // compte les reps faites, à RPE 10 comme ailleurs.
    // ⚠️ SIGNATURE CHANGÉE LE 19/09/2026 : les deux prennent la SÉRIE.
    expect(P.repsComptees({ reps: 4, rpe: 10 })).toBe(4);
    expect(P.repsPrudentes({ reps: 4, rpe: 10 })).toBe(3);
    expect(P.repsPrudentes({ reps: 4, rpe: 9.5 })).toBe(4);
    expect(P.repsPrudentes({ reps: 4, rpe: null })).toBe(4);
    expect(P.repsComptees({ reps: 4, rpe: 9.5 })).toBe(4);
    expect(P.repsComptees({ reps: 4, rpe: null })).toBe(4);
  });

  test('moins de deux séries au palier : pas de verdict', () => {
    expect(P.palierTenu([{ reps: 5, rpe: null }], 5).tenu).toBe(false);
    expect(P.palierTenu([], 5).tenu).toBe(false);
  });
});

// ── §17.3 — LE CRAN SE LIT AUSSI SUR UN RESSENTI (48b-1) ───────────────────
//
// CONFIGURATION DISCRIMINANTE (`CADRAGE-V2` §2 quater) : une série qui porte un
// RESSENTI et pas de RPE. Sur une série à RPE, l'ancienne lecture et la nouvelle
// donnent le même cran et le banc ne prouverait rien — c'est d'ailleurs ce que
// vérifie la non-régression du squat du 2 février, plus bas.
//
// Ce que l'ancien code faisait, mesuré avant d'écrire la correction :
//   cranEffort('reste_0')                  -> null   (et non 'max')
//   repsComptees(5, 'reste_0')             -> 5      (et non 4)
//   palierTenu([5 reste_1, 5 reste_0], 5)  -> TENU   (et non « pas encore »)
// La dernière est la seule qui compte vraiment : l'app affirmait qu'un palier
// était tenu le jour où la dernière série était allée à l'échec.
describe('§17.3 — le cran d’effort lit le ressenti autant que le RPE', () => {
  test('les quatre ressentis tombent sur leurs crans', () => {
    expect(P.cranDeSerie({ ressenti: 'reste_3_plus' })).toBe('facile');
    expect(P.cranDeSerie({ ressenti: 'reste_2' })).toBe('dur');
    expect(P.cranDeSerie({ ressenti: 'reste_1' })).toBe('dur');
    expect(P.cranDeSerie({ ressenti: 'reste_0' })).toBe('max');
  });

  test('NON-RÉGRESSION — les bandes du RPE ne bougent pas d’un cran', () => {
    expect(P.cranDeSerie({ rpe: 7 })).toBe('facile');
    expect(P.cranDeSerie({ rpe: 7.5 })).toBe('facile');
    expect(P.cranDeSerie({ rpe: 8 })).toBe('dur');
    expect(P.cranDeSerie({ rpe: 9.5 })).toBe('dur');
    expect(P.cranDeSerie({ rpe: 10 })).toBe('max');
  });

  test('sans effort saisi, ou avec un ressenti inconnu : aucun cran, jamais une hypothèse', () => {
    expect(P.cranDeSerie({ reps: 5 })).toBeNull();
    expect(P.cranDeSerie({ rpe: null, ressenti: null })).toBeNull();
    expect(P.cranDeSerie({ ressenti: 'reste_4' })).toBeNull();
    expect(P.cranDeSerie(null)).toBeNull();
    // La table est interrogée par `hasOwnProperty` : ce qui vient de la base ne
    // doit jamais atteindre la chaîne de prototypes. Sans cette garde, ces deux
    // clés rendent un objet — qui n'est pas un cran, et que le `=== 'max'` de
    // `repsComptees` laisserait passer pour « pas max » sans rien signaler.
    expect(P.cranDeSerie({ ressenti: 'constructor' })).toBeNull();
    expect(P.cranDeSerie({ ressenti: '__proto__' })).toBeNull();
  });

  test('DISCRIMINANT — une série qui porte les deux : le RPE l’emporte', () => {
    // Ne doit pas arriver (`definirEffort` met l'autre à `null`), mais une
    // ligne importée peut le produire, et le RPE est le plus précis des deux.
    expect(P.cranDeSerie({ rpe: 10, ressenti: 'reste_3_plus' })).toBe('max');
    // Et dans l'autre sens, pour que le test ne passe pas par accident : sans
    // le RPE, la même série rendrait 'facile'.
    expect(P.cranDeSerie({ rpe: null, ressenti: 'reste_3_plus' })).toBe('facile');
  });

  // INVERSÉ LE 11/10/2026 (74) : la rep en moins n'existe plus que dans le
  // calcul prudent ; `repsComptees` rend les reps faites.
  test('§17.4 (74) — « reste 0 » retire une rep au calcul prudent, exactement comme un RPE de 10 ; les reps faites comptent', () => {
    expect(P.repsPrudentes({ reps: 5, ressenti: 'reste_0' })).toBe(4);
    expect(P.repsPrudentes({ reps: 5, ressenti: 'reste_1' })).toBe(5);
    expect(P.repsPrudentes({ reps: 5, rpe: 10 })).toBe(4);
    expect(P.repsComptees({ reps: 5, ressenti: 'reste_0' })).toBe(5);
    expect(P.repsComptees({ reps: 5, rpe: 10 })).toBe(5);
    // Sans reps, rien à compter — et surtout pas un zéro inventé.
    expect(P.repsPrudentes({ ressenti: 'reste_0' })).toBeNull();
    expect(P.repsPrudentes(null)).toBeNull();
    expect(P.repsComptees({ ressenti: 'reste_0' })).toBeNull();
    expect(P.repsComptees(null)).toBeNull();
  });

  // INVERSÉ LE 11/10/2026 (74) — « on n'enlève pas des reps durement
  // acquises » : une série à fond compte ses reps, le palier qu'elle atteint
  // est tenu. Ce qui l'empêche de faire monter la suite est au moteur (les
  // plafonds de `consigneDExercice`), pas ici.
  test('DISCRIMINANT (74) — le palier EST tenu quand la dernière série va à fond : ses reps faites comptent', () => {
    const r = P.palierTenu([{ reps: 5, ressenti: 'reste_1' },
                            { reps: 5, ressenti: 'reste_0' }], 5);
    expect(r.tenu).toBe(true);
    // Contre-épreuve : une rep de moins faite n'est pas tenue. Sans elle, le
    // test ci-dessus passerait aussi si `palierTenu` acceptait tout.
    const k = P.palierTenu([{ reps: 5, ressenti: 'reste_1' },
                            { reps: 4, ressenti: 'reste_0' }], 5);
    expect(k.tenu).toBe(false);
    expect(k.raison).toContain('série 2');
  });

  test('NON-RÉGRESSION — le squat du 2 février reste TENU (§17.3)', () => {
    const SQUAT = [{ reps: 4, rpe: 8.5 }, { reps: 4, rpe: 9.5 }, { reps: 4, rpe: 9.5 }];
    expect(SQUAT.map((x) => P.cranDeSerie(x))).toEqual(['dur', 'dur', 'dur']);
    expect(P.palierTenu(SQUAT, 4).tenu).toBe(true);
  });

  // ⚠️ LE TEST QUI EMPÊCHE LES DEUX LISTES DE DÉRIVER (§2 undecies).
  //
  // `palier.js` nomme les quatre ressentis une seconde fois, parce qu'il charge
  // AVANT `seance.js` et qu'il est le seul module sans dépendance. Le prix de ce
  // choix est ici : ajouter une valeur à `THSeance.RESSENTIS` sans lui donner de
  // cran fait tomber ce test, au lieu de rendre `null` en silence sur une série
  // que le moteur lirait alors comme sans effort.
  test('chaque valeur de THSeance.RESSENTIS a un cran dans palier.js', () => {
    expect(Seance.RESSENTIS.length).toBeGreaterThan(0);
    const sansCran = Seance.RESSENTIS.filter((r) => P.cranDeSerie({ ressenti: r }) === null);
    expect(sansCran).toEqual([]);
    // Et l'inverse : aucun cran rendu qui ne soit l'un des trois.
    Seance.RESSENTIS.forEach((r) => {
      expect(['facile', 'dur', 'max']).toContain(P.cranDeSerie({ ressenti: r }));
    });
  });

  // ⚠️ ET LE SENS INVERSE (48b-2). Le test ci-dessus attrape une valeur AJOUTÉE
  // à l'écran sans cran ; celui-ci attrape une valeur RETIRÉE de l'écran qui
  // survivrait dans le moteur. Sans lui, `reste_2` pourrait disparaître de la
  // saisie et continuer d'être lu ici pendant des mois, sur des lignes que plus
  // personne ne produit — du code mort qui a l'air vivant.
  test('et chaque ressenti de la table du moteur existe dans THSeance.RESSENTIS', () => {
    const duMoteur = Object.keys(P.CRAN_DU_RESSENTI);
    expect(duMoteur.length).toBeGreaterThan(0);
    const inconnus = duMoteur.filter((r) => Seance.RESSENTIS.indexOf(r) < 0);
    expect(inconnus).toEqual([]);
    // Les deux listes disent donc exactement la même chose, dans les deux sens.
    expect(duMoteur.slice().sort()).toEqual(Seance.RESSENTIS.slice().sort());
  });
});

// ── §7 bis.5 — LA MEILLEURE SÉRIE (chantier 18) ────────────────────────────
//
// CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : une séance dont la
// DERNIÈRE SÉRIE EST PLUS LOURDE À REPS PLEINES. Sur une séance à charge
// constante, « palier » et « meilleure série » rendent le même couple et rien
// ne les sépare — c'est précisément pourquoi le défaut a traversé le chantier
// 17 sans se voir.
describe('meilleure série — distincte du palier, et les deux sont vraies', () => {
  test('DISCRIMINANT : la dernière série plus lourde à reps pleines gagne', () => {
    // Hack Squat du 24/08/2026, données réelles. Palier 122,6 — juste, c'est la
    // charge tenue sur la majorité. Mais 127,6 × 10 est une performance.
    const r = P.analyser(seance(
      s(122.6, 10), s(122.6, 10), s(122.6, 10), s(127.6, 10)), etat('monte'));
    expect(r.meilleure).toEqual({ charge: 127.6, reps: 10 });
    // Le palier NE BOUGE PAS : c'est la grandeur du moteur.
    expect(r.palier).toBe(122.6);
    expect(r.reps).toBe(10);
    expect(r.meilleure.charge).not.toBe(r.palier);
  });

  test('DISCRIMINANT : une dernière série plus lourde à reps un peu moindres gagne aussi', () => {
    // Développé Couché Haltère du 29/08/2026. 8 reps sur une série la plus
    // longue à 10 : au-dessus de la moitié, donc retenue.
    const r = P.analyser(seance(
      s(84, 10), s(84, 10), s(84, 10), s(88, 8)), etat('indetermine'));
    expect(r.meilleure).toEqual({ charge: 88, reps: 8 });
    expect(r.palier).toBe(84);
  });

  test('une exploration à une rep est ÉCARTÉE — c’est tout le garde-fou', () => {
    // 1 rep sur une série la plus longue à 5 : sous la moitié.
    const r = P.analyser(seance(
      s(122.5, 5), s(122.5, 5), s(122.5, 5), s(140, 1)), etat('indetermine'));
    expect(r.meilleure).toEqual({ charge: 122.5, reps: 5 });
    expect(r.palier).toBe(122.5);
  });

  test('le seuil est « au moins la moitié » — fermé, pas strict', () => {
    // Série la plus longue à 10 reps -> seuil 5. Une série à 5 passe, à 4 non.
    expect(P.analyser(seance(s(100, 10), s(100, 10), s(120, 5)), etat('indetermine')).meilleure)
      .toEqual({ charge: 120, reps: 5 });
    expect(P.analyser(seance(s(100, 10), s(100, 10), s(120, 4)), etat('indetermine')).meilleure)
      .toEqual({ charge: 100, reps: 10 });
  });

  test('le seuil se mesure sur la série LA PLUS LONGUE, pas sur une moyenne', () => {
    // Reps 12, 4, 4 -> la plus longue vaut 12, seuil 6. Les deux séries à 4 sont
    // sous le seuil, même si elles sont majoritaires — et même si elles portent
    // le palier. (100 vaut 83 % de 120 : au-dessus du seuil de chauffe.)
    const r = P.analyser(seance(s(100, 12), s(120, 4), s(120, 4)), etat('indetermine'));
    expect(r.meilleure).toEqual({ charge: 100, reps: 12 });
    expect(r.palier).toBe(120);   // le palier, lui, reste 120
  });

  test('SUR UNE SÉANCE À CHARGE CONSTANTE, palier et meilleure série coïncident', () => {
    // C'est la configuration NON discriminante — celle qui a laissé passer le
    // défaut. Elle est conservée pour que le banc le dise lui-même.
    const r = P.analyser(seance(s(100, 10), s(100, 8), s(100, 12)), etat('indetermine'));
    expect(r.palier).toBe(100);
    expect(r.reps).toBe(12);
    expect(r.meilleure).toEqual({ charge: 100, reps: 12 });
  });

  test('toutes les séries à la même charge -> cette charge, reps maximales', () => {
    const r = P.analyser(seance(s(73, 15), s(73, 15), s(73, 15)), etat('indetermine'));
    expect(r.meilleure).toEqual({ charge: 73, reps: 15 });
  });

  test('une seule série de travail -> elle-même', () => {
    const r = P.analyser(seance(s(92, 1)), etat('indetermine'));
    expect(r.meilleure).toEqual({ charge: 92, reps: 1 });
    expect(r.palier).toBe(92);   // n = 1, requis = 1
  });

  test('aucune série de travail -> pas de meilleure série, jamais une invention', () => {
    const r = P.analyser(seance(s(60, 8, 'echauffement')), etat('monte'));
    expect(r.meilleure).toBeNull();
    expect(r.palier).toBeNull();
  });

  test('les séries ÉCARTÉES ne concourent pas — chauffe, rampe, dégressive, échec', () => {
    // 140 est la plus lourde de la séance mais elle est taguée chauffe ; 60 est
    // une dégressive ; 100 un échec. Aucune des trois ne peut être la meilleure.
    const r = P.analyser(seance(
      s(140, 8, 'echauffement'), s(90, 10), s(90, 10), s(90, 10),
      s(100, 3, 'echec'), s(60, 15, 'degressive')), etat('indetermine'));
    expect(r.meilleure).toEqual({ charge: 90, reps: 10 });
  });

  test('la rampe ne vote pas, et ça change la meilleure série (§5.4)', () => {
    // 100 × 20 en rampe, puis 110 × 10, 110 × 10, 130 × 6.
    //   · état « ne monte pas » : la rampe reste, la série la plus longue fait
    //     20 reps, le seuil monte à 10, et 130 × 6 se retrouve écarté.
    //   · état « monte » : la rampe sort, la plus longue tombe à 10, le seuil à
    //     5, et 130 × 6 devient la meilleure série.
    // La même séance, deux réponses, selon une propriété MESURÉE de l'exercice.
    const avecRampe = seance(s(100, 20), s(110, 10), s(110, 10), s(130, 6));
    expect(P.analyser(avecRampe, etat('ne_monte_pas')).meilleure).toEqual({ charge: 110, reps: 10 });
    expect(P.analyser(avecRampe, etat('monte')).meilleure).toEqual({ charge: 130, reps: 6 });
  });

  test('NON-RÉGRESSION chantier 17 — le développé militaire du 28/08', () => {
    const r = P.analyser(seance(
      s(64, 8, 'echauffement'), s(72, 4, 'echauffement'), s(80, 2, 'echauffement'),
      s(92, 1), s(100, 0, 'echec'), s(92, 1)), etat('monte'));
    expect(r.palier).toBe(92);
    expect(r.meilleure).toEqual({ charge: 92, reps: 1 });
  });

  test('à charge égale, les reps retenues passent elles aussi le seuil', () => {
    // 120 apparaît à 6 reps (au-dessus du seuil de 5) et à 2 reps (dessous).
    // La série à 2 ne doit pas servir, mais elle ne doit pas non plus faire
    // perdre la charge.
    const r = P.analyser(seance(s(100, 10), s(100, 10), s(120, 6), s(120, 2)), etat('indetermine'));
    expect(r.meilleure).toEqual({ charge: 120, reps: 6 });
  });
});

// ── §1.2 — LE TRI, ET CE QU'IL FAIT QUAND LE RANG MANQUE ───────────────────
//
// La règle existait et disait la moitié : « tri explicite sur le rang ». Elle
// ne disait pas ce qui se passe quand le rang N'EST PAS LÀ — le cas d'une
// série en mémoire, pas encore écrite en base. Le départage tombait sur
// `localeCompare` de l'identifiant, un UUID tiré au hasard.
describe('§1.2 — le tri par rang, et l’ordre reçu quand le rang manque', () => {
  // Les identifiants sont à CONTRE-SENS du rang : c'est ce qui sépare les deux
  // lectures. Avec des identifiants dans le même ordre que les rangs, aucun
  // test ne peut distinguer — c'était l'angle mort de toute la suite.
  const lire = (r) => r.series.map((d) => d.serie.charge_kg + '×' + d.serie.reps);

  test('DISCRIMINANT — le rang gagne contre l’ordre des identifiants ET contre celui du tableau', () => {
    // Le tableau est donné DANS UN TROISIÈME ORDRE, exprès : trié sur les
    // identifiants on lirait « 130×4  130×5  120×5 », sur le tableau
    // « 130×4  120×5  130×5 ». Une seule lecture rend la séance réelle, et
    // c'est le rang. Sans ces trois ordres distincts, un tri absent passerait.
    const r = P.analyser([
      { id: 'aaa', rang: 3, type_serie: 'travail', charge_kg: 130, reps: 4, rpe: null },
      { id: 'zzz', rang: 1, type_serie: 'travail', charge_kg: 120, reps: 5, rpe: null },
      { id: 'mmm', rang: 2, type_serie: 'travail', charge_kg: 130, reps: 5, rpe: null }
    ], etat('monte'), { mesure: 'charge_reps' });
    expect(lire(r)).toEqual(['120×5', '130×5', '130×4']);
  });

  test('DISCRIMINANT — sans rang, l’ordre REÇU fait foi, jamais l’identifiant', () => {
    // Le tri de JavaScript est stable : à rangs égaux (tous absents, donc tous
    // à 0), le tableau survit tel qu'on l'a donné. C'est l'ordre de l'écran.
    const sans = (id, kg, reps) => ({ id: id, type_serie: 'travail',
      charge_kg: kg, reps: reps, rpe: null });
    const r = P.analyser([sans('zzz', 120, 5), sans('mmm', 130, 5), sans('aaa', 130, 4)],
      etat('monte'), { mesure: 'charge_reps' });
    expect(lire(r)).toEqual(['120×5', '130×5', '130×4']);
    // Et l'ordre inverse se lit à l'envers : le tri n'invente rien, il garde.
    const inverse = P.analyser([sans('aaa', 130, 4), sans('mmm', 130, 5), sans('zzz', 120, 5)],
      etat('monte'), { mesure: 'charge_reps' });
    expect(lire(inverse)).toEqual(['130×4', '130×5', '120×5']);
  });

  test('un rang manquant ne double pas la place d’un autre', () => {
    // Rang absent → 0, donc AVANT les rangs réels. La série sans rang ne se
    // faufile pas au milieu : elle passe devant, et on le sait.
    const r = P.analyser([
      { id: 'a', rang: 2, type_serie: 'travail', charge_kg: 130, reps: 5, rpe: null },
      { id: 'b', type_serie: 'travail', charge_kg: 120, reps: 5, rpe: null }
    ], etat('monte'), { mesure: 'charge_reps' });
    expect(lire(r)).toEqual(['120×5', '130×5']);
  });
});
