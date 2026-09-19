/** @jest-environment node */
//
// v2/js/moteur.js — le niveau validé, le format, l'habitude et la zone.
// MOTEUR-PROGRESSION-V2 §8.2 · §9.1.1 · §9.1.2 · §9.2 · §9.12.
//
// CONFIGURATION DISCRIMINANTE (`CADRAGE-V2` §2 quater) pour l'habitude : des
// séances RÉELLES où chaque variante fautive du calcul rend une AUTRE valeur.
// Une fixture idéalisée — dix séances au même nombre de reps — donnerait la
// même habitude quelle que soit la fenêtre, quel que soit l'arrondi, et avec ou
// sans filtre de couple : elle ne prouverait rien. Chaque cas ci-dessous porte,
// en commentaire, ce que rendrait le code fautif ; les huit valeurs ont été
// mesurées en exécutant les variantes sur les mêmes données.

require('../../v2/js/palier.js');          // `moteur.js` lit `THPalier`
const M = require('../../v2/js/moteur.js');
const P = require('../../v2/js/palier.js');

// Une série au palier. `charge_kg` vaut le palier : c'est ce qui la fait voter.
const s = (reps, effort) => Object.assign({ reps: reps, rpe: null, ressenti: null },
  typeof effort === 'number' ? { rpe: effort } : (effort ? { ressenti: effort } : {}));

// Une séance-exercice, telle que `THPalier.analyser` la décrit, datée par
// `sessions.debut`. Toutes les séries données sont AU palier.
const se = (debut, palier, ...reps) => ({
  debut: debut, palier: palier,
  retenues: reps.map((r) => ({ charge_kg: palier, reps: r, rpe: null, ressenti: null }))
});

const AVANT = '2026-09-20';

// ── LA MÉDIANE, TESTÉE DIRECTEMENT ─────────────────────────────────────────
//
// ⚠️ ELLE NE SE TESTE PAS PAR SES APPELANTS, et le banc de mutation l'a montré.
// `formatDe` et `habitudeDe` arrondissent AU-DESSUS juste après : sur deux
// entiers voisins, `ceil((a + b) / 2)` vaut exactement `b`, donc une médiane
// fautive qui rendrait « le plus haut des deux » passerait tous leurs tests.
// L'écart n'apparaît qu'à partir de deux valeurs distantes de deux — et une
// habitude se calcule sur des dizaines de séries, où ce cas est la règle.
describe('la médiane — la brique sous le format et l’habitude', () => {
  test('DISCRIMINANT — longueur paire : la MOYENNE des deux du milieu', () => {
    expect(M.mediane([4, 8])).toBe(6);          // « le plus haut » rendrait 8
    expect(M.mediane([1, 2, 3, 4])).toBe(2.5);  // rendrait 3
    expect(M.mediane([2, 10])).toBe(6);         // rendrait 10
    // Et « le plus bas des deux » rendrait 4, 2 et 2.
  });

  test('longueur impaire : la valeur du milieu', () => {
    expect(M.mediane([5])).toBe(5);
    expect(M.mediane([3, 1, 2])).toBe(2);
  });

  test('elle trie ce qu’on lui donne, elle ne le suppose pas trié', () => {
    expect(M.mediane([8, 4])).toBe(6);
    expect(M.mediane([12, 3, 7, 1])).toBe(5);
    expect(M.mediane([10, 2, 8, 4, 6])).toBe(6);
  });

  test('rien à médianer : rien, jamais un zéro', () => {
    expect(M.mediane([])).toBeNull();
    expect(M.mediane(null)).toBeNull();
  });
});

// ── §9.2 — LE NIVEAU VALIDÉ ────────────────────────────────────────────────
describe('§9.2 — le niveau validé', () => {
  test('le tableau de la spec', () => {
    expect(M.niveauValide([s(5), s(5), s(4), s(4)])).toBe(5);
    expect(M.niveauValide([s(4), s(5)])).toBe(4);
    expect(M.niveauValide([s(12), s(12), s(11)])).toBe(12);
  });

  test('une seule série au palier : son propre compte', () => {
    expect(M.niveauValide([s(8)])).toBe(8);
  });

  test('aucune série au palier : pas de niveau, jamais un zéro inventé', () => {
    expect(M.niveauValide([])).toBeNull();
    expect(M.niveauValide(null)).toBeNull();
  });

  test('DISCRIMINANT — il compte en reps COMPTÉES, pas brutes (§17.4)', () => {
    // Deux séries de 5, la seconde allée à l'échec : elle compte 4, donc le
    // niveau est 4. Sur les reps BRUTES, les deux tests ci-dessous rendraient 5.
    expect(M.niveauValide([s(5), s(5, 'reste_0')])).toBe(4);
    expect(M.niveauValide([s(5, 10), s(5), s(5)])).toBe(4);
    // Contre-épreuve : sans l'échec, les mêmes séries donnent 5.
    expect(M.niveauValide([s(5), s(5)])).toBe(5);
  });

  test('la tolérance à −1 ne vaut QUE pour les séries au-delà de la deuxième', () => {
    // `5-4-4` : la 2ᵉ série est sous la cible, le niveau tombe à 4.
    expect(M.niveauValide([s(5), s(4), s(4)])).toBe(4);
    // `5-5-4` : la 3ᵉ a droit à −1, le niveau reste 5.
    expect(M.niveauValide([s(5), s(5), s(4)])).toBe(5);
    // La tolérance ne s'empile pas : une 4ᵉ à −2 fait bien tomber le niveau.
    expect(M.niveauValide([s(5), s(5), s(4), s(3)])).toBe(4);
  });

  test('une série dont les reps ne se comptent pas : pas de niveau', () => {
    // La sauter décalerait le rang des suivantes, donc changerait qui est « la
    // deuxième série ». On ne conclut pas plutôt que de conclure de travers.
    expect(M.niveauValide([s(5), s(null), s(5)])).toBeNull();
  });
});

// ── §8.2 — LE FORMAT ───────────────────────────────────────────────────────
describe('§8.2 — le format d’une séance-exercice', () => {
  test('les bandes, et la médiane entre deux entiers qui se range AU-DESSUS', () => {
    expect(M.formatDe([s(5), s(6)])).toBe('force');          // médiane 5,5 -> 6
    expect(M.formatDe([s(6), s(7)])).toBe('mixte');          // médiane 6,5 -> 7
    expect(M.formatDe([s(8), s(8)])).toBe('mixte');          // médiane 8
    expect(M.formatDe([s(8), s(9)])).toBe('hypertrophie');   // médiane 8,5 -> 9
  });

  test('DISCRIMINANT — l’arrondi en dessous ferait basculer deux de ces quatre', () => {
    // 5,5 arrondi en dessous vaut 5 : encore 'force', le cas ne prouve rien.
    // 6,5 en dessous vaut 6 -> 'force' au lieu de 'mixte' ;
    // 8,5 en dessous vaut 8 -> 'mixte' au lieu de 'hypertrophie'.
    expect(M.formatDe([s(6), s(7)])).not.toBe('force');
    expect(M.formatDe([s(8), s(9)])).not.toBe('mixte');
  });

  test('aucune série : pas de format', () => {
    expect(M.formatDe([])).toBeNull();
    expect(M.formatDe(null)).toBeNull();
    expect(M.formatDe([s(null)])).toBeNull();
  });
});

// ── §9.1.2 — LE RANGEMENT EN ZONES ─────────────────────────────────────────
describe('§9.1.2 — la table de rangement, habitude par habitude', () => {
  const cle = (h) => { const z = M.zoneDe(h); return z ? z.cle : null; };

  test('chaque borne de la table, des deux côtés', () => {
    expect(cle(2)).toBeNull();
    expect(cle(3)).toBe('lourd');
    expect(cle(5)).toBe('lourd');
    expect(cle(6)).toBe('mix');
    expect(cle(7)).toBe('mix');
    expect(cle(8)).toBe('hypertrophie');
    expect(cle(9)).toBe('hypertrophie');
    expect(cle(10)).toBe('volume');
    expect(cle(12)).toBe('volume');
    expect(cle(13)).toBe('series_longues');
    expect(cle(30)).toBe('series_longues');
  });

  test('sous 3 reps, aucune zone — les maximaux ne se prescrivent pas (§9.1.2)', () => {
    expect(M.zoneDe(1)).toBeNull();
    expect(M.zoneDe(2)).toBeNull();
    expect(M.zoneDe(null)).toBeNull();
    expect(M.zoneDe(undefined)).toBeNull();
  });

  test('la zone rendue porte son bas et son haut, pas seulement sa clé', () => {
    // L'appelant écrira la consigne avec : aller les rechercher ailleurs
    // rouvrirait la porte à une seconde table de zones.
    expect(M.zoneDe(4)).toEqual({ cle: 'lourd', libelle: 'Lourd', bas: 3, haut: 5 });
    // ⚠️ Le rangement et la zone NE SE RECOUVRENT PAS : une habitude de 13
    // range en Séries longues, dont la zone commence à 15 (§9.1.2).
    expect(M.zoneDe(13)).toEqual({ cle: 'series_longues', libelle: 'Séries longues', bas: 15, haut: 20 });
  });

  test('les cinq zones, et rien d’autre — les clés sont celles de `zones_exercice`', () => {
    expect(M.ZONES.map((z) => z.cle))
      .toEqual(['lourd', 'mix', 'hypertrophie', 'volume', 'series_longues']);
    M.ZONES.forEach((z) => {
      expect(typeof z.libelle).toBe('string');
      expect(z.bas).toBeLessThanOrEqual(z.haut);
    });
    // Toute clé du rangement doit exister dans la table des zones (ou être
    // l'absence de zone) : les deux tables ne peuvent pas dériver.
    M.RANGEMENT.forEach((r) => {
      if (r.cle === null) return;
      expect(M.zoneParCle(r.cle)).not.toBeNull();
    });
  });
});

// ── §9.1.1 — LA PRIORITÉ : CORRECTION, SINON HABITUDE ──────────────────────
describe('§9.1.1 — la correction prime sur l’habitude', () => {
  test('le tableau de la spec', () => {
    expect(M.zoneRetenue('volume', 4).cle).toBe('volume');
    expect(M.zoneRetenue(null, 4).cle).toBe('lourd');
    expect(M.zoneRetenue('bidule', 4).cle).toBe('lourd');
    expect(M.zoneRetenue(null, 2)).toBeNull();
  });

  test('une clé VIDE rend la main à la déduction — c’est son sens en base (`v2_046`)', () => {
    expect(M.zoneRetenue('', 4).cle).toBe('lourd');
    expect(M.zoneRetenue(undefined, 4).cle).toBe('lourd');
  });

  test('une clé venue de la base n’atteint jamais la chaîne de prototypes', () => {
    expect(M.zoneRetenue('constructor', 4).cle).toBe('lourd');
    expect(M.zoneRetenue('__proto__', 4).cle).toBe('lourd');
  });

  test('une correction sur un exercice sans habitude tient quand même', () => {
    // C'est tout l'intérêt de la correction : elle parle là où la déduction
    // se tait (un exercice neuf, ou une habitude de maximaux).
    expect(M.zoneRetenue('lourd', null).cle).toBe('lourd');
    expect(M.zoneRetenue('mix', 2).cle).toBe('mix');
  });
});

// ── §9.1.2 / §9.12 — L'HABITUDE, SUR DES SÉANCES RÉELLES ───────────────────
//
// Les deux premiers jeux sont des séances d'aurel_br lues en base ; le
// troisième est construit pour isoler le filtre de couple, qu'aucune séance
// réelle d'un même exercice ne sépare aussi nettement.
describe('§9.1.2 — l’habitude, et ce que chaque variante fautive rendrait', () => {
  // Développé couché, couple FORCE — dix séances du 14/07 au 15/09.
  const F1 = [
    se('2026-07-14', 120, 5, 5, 5, 4), se('2026-07-21', 120, 5, 5, 4, 4),
    se('2026-07-28', 120, 5, 5, 5, 5), se('2026-08-04', 122.5, 4, 4, 3, 3),
    se('2026-08-12', 122.5, 3, 4, 3), se('2026-08-22', 122.5, 5, 4, 4, 3),
    se('2026-08-26', 125, 2, 3, 4), se('2026-09-01', 122.5, 5, 5, 5),
    se('2026-09-08', 122.5, 6, 5, 5), se('2026-09-15', 125, 4, 5)
  ];

  // Triceps à la corde, couple HYPERTROPHIE — dix séances du 16/04 au 10/09.
  const F2 = [
    se('2026-04-16', 22.5, 12, 12, 12), se('2026-04-24', 22.5, 12, 12),
    se('2026-05-12', 20.3, 12, 12, 12), se('2026-05-29', 20.3, 13, 13),
    se('2026-06-25', 20.3, 15, 15, 12), se('2026-07-02', 20.3, 15, 15, 12),
    se('2026-07-09', 20.3, 15, 15, 12), se('2026-08-22', 22.5, 12, 12),
    se('2026-09-03', 24.8, 12, 15), se('2026-09-10', 24.8, 15, 15, 15)
  ];

  // Construit : trois séances d'hypertrophie et UNE de force au milieu.
  const F4 = [
    se('2026-09-01', 40, 10, 10), se('2026-09-04', 60, 4, 4, 4, 4),
    se('2026-09-08', 40, 12, 12), se('2026-09-12', 40, 12, 12)
  ];

  test('F1 — la FENÊTRE DE 8 : habitude 4, donc zone Lourd', () => {
    // Sur tout l'historique donné (10 séances) : 5. Les deux séances de juillet
    // écartées sont à 5 reps pleines et tirent la médiane vers le haut.
    expect(M.habitudeDe(F1, AVANT)).toBe(4);
    expect(M.zoneDe(M.habitudeDe(F1, AVANT)).cle).toBe('lourd');
  });

  test('F2 — la FENÊTRE DE 8 : habitude 13, donc Séries longues', () => {
    // Avec une fenêtre de 10 : 12, soit la zone Volume. Un exercice qui a
    // dérivé vers 15 reps serait rangé sur sa pratique d'il y a cinq mois.
    expect(M.habitudeDe(F2, AVANT)).toBe(13);
    expect(M.zoneDe(M.habitudeDe(F2, AVANT)).cle).toBe('series_longues');
  });

  test('F2 + une séance du 20/09 — la COUPURE EST STRICTE (§9.12)', () => {
    // Le jour même ne vote pas pour la consigne du jour même. Coupure incluse
    // (`<=` au lieu de `<`) : 15.
    const avec = F2.concat([se('2026-09-20', 24.8, 20, 20, 20)]);
    expect(M.habitudeDe(avec, AVANT)).toBe(13);
  });

  test('F2 + une séance du 24/09 — LA COUPURE ELLE-MÊME (§9.12)', () => {
    // Le moteur ne lit jamais l'avenir. Sans coupure du tout : 15.
    const avec = F2.concat([se('2026-09-24', 24.8, 20, 20, 20)]);
    expect(M.habitudeDe(avec, AVANT)).toBe(13);
  });

  test('F2 — TOUTES les séries au palier, pas la meilleure de chaque séance', () => {
    // Sur la meilleure série de chaque séance : 15. C'est la même erreur que
    // le §7 bis.5 sépare depuis le chantier 18 — « ce qu'on a fait de mieux »
    // n'est pas « ce qu'on tient d'habitude ».
    expect(M.habitudeDe(F2, AVANT)).toBe(13);
    const fenetre = F2.slice(-8);
    const meilleures = fenetre.map((x) => Math.max.apply(null, x.retenues.map((r) => r.reps)));
    expect(Math.ceil(M.mediane(meilleures))).toBe(15);   // la valeur fautive, mesurée
  });

  test('F4 — le FILTRE DE COUPLE : habitude 12, donc Volume', () => {
    // Sans filtre, les quatre séries de 4 reps de la séance de force tirent la
    // médiane à 10. Vingt kilos séparent les deux formats du même mouvement
    // (§8.1) : les mélanger fait lire une chute là où il y a changement de
    // format.
    expect(M.habitudeDe(F4, AVANT)).toBe(12);
    expect(M.zoneDe(M.habitudeDe(F4, AVANT)).cle).toBe('volume');
  });

  test('F4 + 15/09 en force — le couple est désigné par la DERNIÈRE séance', () => {
    // La dernière séance repasse en force : l'habitude se recalcule sur les
    // séances de force, et tombe à 4. Pris sur la PREMIÈRE séance, le couple
    // serait hypertrophie et l'habitude 12.
    const avec = F4.concat([se('2026-09-15', 60, 5, 5, 5)]);
    expect(M.habitudeDe(avec, AVANT)).toBe(4);
    expect(M.zoneDe(M.habitudeDe(avec, AVANT)).cle).toBe('lourd');
  });

  test('une seule séance (10, 11) — l’ARRONDI AU-DESSUS', () => {
    // Médiane 10,5. Arrondie en dessous : 10 — même zone ici, mais c'est
    // l'arrondi qui fait basculer 6,5 en Mix et 8,5 en Hypertrophie.
    expect(M.habitudeDe([se('2026-09-15', 50, 10, 11)], AVANT)).toBe(11);
  });

  // ⚠️ AJOUTÉE APRÈS LE BANC DE MUTATION. F1 et F2 tuent la fenêtre de 7 et
  // celle de 10, mais PAS celle de 9 : les deux rendent la même habitude sur ces
  // deux jeux (F1 : 4 en 8 comme en 9 · F2 : 13 en 8 comme en 9). Un seuil
  // qu'aucun test ne sépare de son voisin n'est pas un seuil vérifié.
  //
  // Neuf séances, toutes de format hypertrophie — donc un seul couple, le filtre
  // ne joue pas —, alternant `10, 10` et `12, 12`. La fenêtre décide seule :
  // 7 -> 12 · 8 -> 11 · 9 -> 10. Trois valeurs distinctes pour trois fenêtres.
  test('DISCRIMINANT — la fenêtre est de 8, ni 7 ni 9', () => {
    const F5 = [
      se('2026-05-01', 50, 10, 10),
      se('2026-06-01', 50, 10, 10), se('2026-06-08', 50, 12, 12),
      se('2026-06-15', 50, 10, 10), se('2026-06-22', 50, 12, 12),
      se('2026-07-01', 50, 10, 10), se('2026-07-08', 50, 12, 12),
      se('2026-07-15', 50, 10, 10), se('2026-07-22', 50, 12, 12)
    ];
    // Toutes du même couple : c'est bien la fenêtre qu'on mesure, pas le filtre.
    expect(new Set(F5.map((x) => M.formatDe(x.retenues))).size).toBe(1);
    expect(M.habitudeDe(F5, AVANT)).toBe(11);
  });

  test('DISCRIMINANT — l’ordre d’arrivée n’est pas supposé : on trie', () => {
    // La même F1 à l'envers — l'ordre de `local.seances` dans l'app est du plus
    // récent au plus ancien, exactement l'inverse de celui des fixtures. Sans
    // tri, la « dernière séance » serait celle de juillet et la fenêtre de 8
    // prendrait les huit PLUS ANCIENNES.
    expect(M.habitudeDe(F1.slice().reverse(), AVANT)).toBe(4);
    expect(M.habitudeDe(F2.slice().reverse(), AVANT)).toBe(13);
  });

  test('une date en objet `Date` se compare comme une chaîne ISO', () => {
    const enDate = F1.map((x) => Object.assign({}, x, { debut: new Date(x.debut + 'T00:00:00Z') }));
    expect(M.habitudeDe(enDate, new Date('2026-09-20T00:00:00Z'))).toBe(4);
  });

  test('SANS DATE DE COUPURE, PAS D’HABITUDE — le §9.12 rendu impossible à oublier', () => {
    expect(M.habitudeDe(F1, null)).toBeNull();
    expect(M.habitudeDe(F1, undefined)).toBeNull();
    expect(M.habitudeDe(F1, '')).toBeNull();
  });

  test('une séance sans palier ne prend pas un créneau de la fenêtre', () => {
    // Une pyramide n'a pas de palier (§7.3) : elle ne dit pas ce qui a été
    // tenu. La laisser entrer ferait une fenêtre annoncée de 8 et réelle de 7.
    const avecPyramide = F1.concat([
      { debut: '2026-09-16', palier: null, retenues: [s(20), s(20)] }
    ]);
    expect(M.habitudeDe(avecPyramide, AVANT)).toBe(4);
  });

  test('une séance sans date ne vote pas', () => {
    const avecSansDate = F1.concat([{ debut: null, palier: 120, retenues: [s(20), s(20)] }]);
    expect(M.habitudeDe(avecSansDate, AVANT)).toBe(4);
  });

  test('aucune séance utilisable : pas d’habitude', () => {
    expect(M.habitudeDe([], AVANT)).toBeNull();
    expect(M.habitudeDe(null, AVANT)).toBeNull();
    // Toutes postérieures à la coupure.
    expect(M.habitudeDe(F1, '2026-01-01')).toBeNull();
  });

  test('DISCRIMINANT — seules les séries AU palier votent', () => {
    // Une séance `120 ×3 + 110` : le 110 est du travail entier, mais il n'a pas
    // tenu le palier. Sans le filtre, la médiane des quatre reps descendrait.
    const avecBackOff = {
      debut: '2026-09-15', palier: 120,
      retenues: [{ charge_kg: 120, reps: 5 }, { charge_kg: 120, reps: 5 },
                 { charge_kg: 120, reps: 5 }, { charge_kg: 110, reps: 12 }]
    };
    expect(M.habitudeDe([avecBackOff], AVANT)).toBe(5);
    expect(M.seriesAuPalier(avecBackOff)).toHaveLength(3);
  });
});

// ── LE PONT ENTRE `analyser` ET LE MOTEUR ──────────────────────────────────
describe('`seriesAuPalier` — de la séance décrite aux séries qui ont tenu', () => {
  test('il se branche sur la sortie réelle de `THPalier.analyser`', () => {
    // La séance du 2 février en base : cinq chauffes taguées, trois séries à
    // 125. C'est la recette du §6.1, prise par le bout du moteur cette fois.
    const brut = [
      { id: 'a', rang: 1, type_serie: 'echauffement', charge_kg: 60, reps: 8 },
      { id: 'b', rang: 2, type_serie: 'echauffement', charge_kg: 100, reps: 4 },
      { id: 'c', rang: 3, type_serie: 'travail', charge_kg: 125, reps: 4, rpe: 8.5 },
      { id: 'd', rang: 4, type_serie: 'travail', charge_kg: 125, reps: 4, rpe: 9.5 },
      { id: 'e', rang: 5, type_serie: 'travail', charge_kg: 125, reps: 4, rpe: 9.5 }
    ];
    const r = P.analyser(brut, { etat: 'monte' }, { mesure: 'charge_reps' });
    expect(r.palier).toBe(125);
    const auPalier = M.seriesAuPalier({ palier: r.palier, retenues: r.retenues });
    expect(auPalier).toHaveLength(3);
    // §17.3 : 9,5 est au cran « dur », donc les reps comptent pleines.
    expect(M.niveauValide(auPalier)).toBe(4);
    expect(M.formatDe(r.retenues)).toBe('force');
  });

  test('sans palier, aucune série n’a tenu', () => {
    expect(M.seriesAuPalier({ palier: null, retenues: [s(5)] })).toEqual([]);
    expect(M.seriesAuPalier(null)).toEqual([]);
  });
});
