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
// `moteur.js` lit AUSSI `THModele` (la virgule décimale des phrases, §3.12).
// Le `require` suffit depuis que `modele.js` retombe sur `globalThis` — avant
// ce commit il retombait sur `this`, `undefined` en mode strict sous Jest, et
// le module était inchargeable ici. L'ordre reproduit celui d'`index.html`.
require('../../v2/js/modele.js');
// Et `THProfil` depuis 48b-6a : la feuille « Pourquoi » nomme le réglage
// (« Ton réglage : Normal »), et ce libellé vit dans `profil.js`, avec les
// clés et les phrases du rythme. Le recopier dans le moteur ferait deux
// tables pour un seul réglage. `profil.js` charge après `moteur.js` dans
// `index.html` ; la lecture, elle, n'a lieu qu'au rendu.
require('../../v2/js/profil.js');
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

  // INVERSÉ LE 11/10/2026 (74) — une série à fond compte ses reps : le niveau
  // validé se lit sur les reps faites (68B le comptait 4).
  test('DISCRIMINANT (74) — il compte les reps FAITES, à fond comme ailleurs (§17.4)', () => {
    expect(M.niveauValide([s(5), s(5, 'reste_0')])).toBe(5);
    expect(M.niveauValide([s(5, 10), s(5), s(5)])).toBe(5);
    // Contre-épreuve : une rep de moins FAITE, elle, abaisse le niveau.
    expect(M.niveauValide([s(5), s(4, 'reste_0')])).toBe(4);
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

// ── §8.2 — LE FORMAT, LU SUR LE NIVEAU VALIDÉ (48b-5a) ─────────────────────
//
// ⚠️ LES CAS DE 48b-2 SONT REMPLACÉS, PAS COMPLÉTÉS. Ils lisaient une médiane
// des séries retenues ; le format se lit désormais sur le NIVEAU VALIDÉ des
// séries AU PALIER (§9.2). Deux d'entre eux changeaient de verdict et sont
// partis avec la règle qu'ils servaient : `6, 7` valait « mixte » par la
// médiane (6,5 -> 7), il vaut « force » par le niveau (6).
//
// CONFIGURATION DISCRIMINANTE (`CADRAGE-V2` §2 quater) : `8, 5`. Sur des séries
// égales, médiane et niveau validé rendent le même nombre et le banc ne
// prouverait rien. Il faut une PREMIÈRE SÉRIE EN FORME — exactement le cas réel
// qui a fait basculer le couché en « mixte » pendant la simulation.
describe('§8.2 — le format se lit sur le niveau validé, pas sur une médiane', () => {
  test('DISCRIMINANT — une première série en forme ne fait plus basculer la séance', () => {
    // Niveau validé de `8, 5` : 5, donc force. Par la médiane : 6,5 -> 7,
    // donc « mixte » — et la zone se tirait alors de vieilles séances à 100 kg.
    expect(M.formatDe([s(8), s(5)])).toBe('force');
    expect(M.formatDe([s(5), s(5), s(4), s(4)])).toBe('force');
  });

  test('les bornes, des deux côtés — 6 · 7 · 8 · 9', () => {
    expect(M.formatDe([s(6), s(6)])).toBe('force');          // seuil abaissé à 5 -> mixte
    expect(M.formatDe([s(7), s(7)])).toBe('mixte');          // seuil relevé à 7 -> force
    expect(M.formatDe([s(8), s(8)])).toBe('mixte');          // seuil abaissé à 7 -> hypertrophie
    expect(M.formatDe([s(9), s(9)])).toBe('hypertrophie');   // seuil relevé à 9 -> mixte
    expect(M.formatDe([s(12), s(12), s(11)])).toBe('hypertrophie');
  });

  test('une seule série au palier : son propre compte décide', () => {
    expect(M.formatDe([s(7)])).toBe('mixte');
  });

  // INVERSÉ LE 11/10/2026 (74) — `7, 7` dont la seconde va à fond : elle
  // compte 7, donc mixte (68B la comptait 6 : force).
  test('DISCRIMINANT (74) — il compte les reps FAITES (§17.4)', () => {
    expect(M.formatDe([s(7), s(7, 'reste_0')])).toBe('mixte');
    // Contre-épreuve : 7, 6 faits donnent force.
    expect(M.formatDe([s(7), s(6, 'reste_0')])).toBe('force');
  });

  test('aucune série au palier : pas de format', () => {
    expect(M.formatDe([])).toBeNull();
    expect(M.formatDe(null)).toBeNull();
    // Une série dont les reps ne se comptent pas ne se juge pas : `niveauValide`
    // le dit déjà, et le format en hérite.
    expect(M.formatDe([s(null)])).toBeNull();
    expect(M.formatDe([s(5), s(null)])).toBeNull();
  });
});

// ── §9.1.2 — LE COUPLE, À LA MAJORITÉ DE 2 SUR 3 (48b-5a) ──────────────────
describe('§9.1.2 — `coupleDe` : deux formats sur trois, la plus récente tranche', () => {
  test('deux sur trois l’emportent, où qu’ils soient', () => {
    expect(M.coupleDe(['mixte', 'mixte', 'force'])).toBe('mixte');
    expect(M.coupleDe(['force', 'force', 'hypertrophie'])).toBe('force');
    expect(M.coupleDe(['mixte', 'force', 'force'])).toBe('force');
    expect(M.coupleDe(['force', 'mixte', 'force'])).toBe('force');
  });

  test('DISCRIMINANT — trois formats différents : la PLUS RÉCENTE tranche', () => {
    // La plus récente est en dernier. « La plus ancienne » rendrait 'force'.
    expect(M.coupleDe(['force', 'mixte', 'hypertrophie'])).toBe('hypertrophie');
    expect(M.coupleDe(['hypertrophie', 'mixte', 'force'])).toBe('force');
  });

  test('moins de trois séances : la majorité si elle existe, sinon la plus récente', () => {
    expect(M.coupleDe(['force', 'force'])).toBe('force');
    expect(M.coupleDe(['force', 'mixte'])).toBe('mixte');
    expect(M.coupleDe(['mixte'])).toBe('mixte');
    expect(M.coupleDe([])).toBeNull();
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

  // ⚠️ CE TEST EST INVERSÉ DEPUIS 48b-5a. Il affirmait qu'une séance de force
  // ajoutée à la fin faisait basculer le couple, et l'habitude de 12 à 4 : la
  // dernière séance désignait le couple à elle seule. C'était le défaut —
  // mesuré sur les vraies séances, une décharge isolée suffisait à faire
  // basculer la zone d'un bloc entier. Sur 2 des 3 dernières séances
  // (hypertrophie, hypertrophie, force), l'hypertrophie l'emporte et
  // l'habitude reste 12.
  test('F5 — une séance de force isolée ne fait PLUS basculer le couple', () => {
    const avec = F4.concat([se('2026-09-15', 60, 5, 5, 5)]);
    expect(M.habitudeDe(avec, AVANT)).toBe(12);
    expect(M.zoneDe(M.habitudeDe(avec, AVANT)).cle).toBe('volume');
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
    expect(new Set(F5.map((x) => M.formatDe(M.seriesAuPalier(x)))).size).toBe(1);
    expect(M.habitudeDe(F5, AVANT)).toBe(11);
  });

  // ── LE COUPLE SUR 3 SÉANCES — LES CAS DE LA SIMULATION (48b-5a) ─────────
  //
  // Ces cinq jeux viennent de `banc_consigne48.py`, qui a rejoué la consigne
  // séance après séance sur les vraies séances d'Aurélien. Ils opposent les
  // deux défauts que la règle de 2 sur 3 soigne ensemble : la dernière séance
  // seule est trop nerveuse, la majorité des 8 trop lente.

  test('DISCRIMINANT — un nouveau bloc est suivi dès sa 2ᵉ séance', () => {
    // Cinq séances de squat à 7 reps, puis le bloc change le 31/08 : 5 reps,
    // confirmées le 07/09. Deux séances sur trois sont en force -> habitude 5.
    // La majorité des 8 dernières rendrait 7 : le nouveau bloc resterait
    // ignoré cinq séances. Une fenêtre de couple de 5 rendrait 7 aussi.
    const bloc = [
      se('2026-06-01', 110, 7, 7, 7), se('2026-06-08', 110, 7, 7, 7),
      se('2026-06-15', 110, 7, 7, 7), se('2026-07-06', 110, 7, 7, 7),
      se('2026-07-13', 110, 7, 7, 7),
      se('2026-08-31', 120, 5, 5), se('2026-09-07', 125, 5, 5)
    ];
    expect(M.habitudeDe(bloc, AVANT)).toBe(5);
    expect(M.zoneDe(M.habitudeDe(bloc, AVANT)).cle).toBe('lourd');

    // ⚠️ ET L'AUTRE MOITIÉ DE LA RÈGLE : à la PREMIÈRE séance du nouveau bloc,
    // le couple ne bascule pas encore. Une seule séance ne décide jamais.
    // « La dernière séance » rendrait 5 dès le 31/08.
    const premiere = bloc.slice(0, 6);
    expect(M.habitudeDe(premiere, AVANT)).toBe(7);
    expect(M.zoneDe(M.habitudeDe(premiere, AVANT)).cle).toBe('mix');
  });

  test('DISCRIMINANT — une décharge isolée ne fait pas basculer la zone', () => {
    // Quatre séances de force, puis une décharge à 10 reps. « La dernière
    // séance » rendrait 10, soit la zone Volume sur un bloc de force ; une
    // fenêtre de couple de 2 aussi, faute de majorité.
    const decharge = [
      se('2026-08-03', 120, 5, 5, 5), se('2026-08-10', 120, 5, 5, 5),
      se('2026-08-17', 120, 5, 5, 5), se('2026-08-24', 120, 5, 5, 5),
      se('2026-08-31', 90, 10, 10, 10)
    ];
    expect(M.habitudeDe(decharge, AVANT)).toBe(5);
    expect(M.zoneDe(M.habitudeDe(decharge, AVANT)).cle).toBe('lourd');
  });

  test('DISCRIMINANT — la fenêtre du couple est de 3 séances, pas de 4', () => {
    // force, mixte, mixte, force : sur les TROIS dernières, le mixte l'emporte
    // -> habitude 7. Sur quatre, force et mixte sont à deux chacun, et la plus
    // récente tranche en force -> 5.
    const alterne = [
      se('2026-09-01', 100, 5, 5), se('2026-09-04', 100, 7, 7),
      se('2026-09-08', 100, 7, 7), se('2026-09-12', 100, 5, 5)
    ];
    expect(M.habitudeDe(alterne, AVANT)).toBe(7);
  });

  test('DISCRIMINANT — trois formats différents : la plus récente tranche', () => {
    // Aucune majorité : force, mixte, hypertrophie. La plus récente gagne, donc
    // hypertrophie -> 10. « La plus ancienne des trois » rendrait 5.
    const trois = [
      se('2026-09-01', 120, 5, 5), se('2026-09-05', 110, 7, 7),
      se('2026-09-09', 90, 10, 10)
    ];
    expect(M.habitudeDe(trois, AVANT)).toBe(10);
  });

  test('DISCRIMINANT — le couché en forme reste une séance de FORCE', () => {
    // Le F1 réel, dont la dernière séance fait `8, 5` au lieu de `4, 5` : une
    // première série en forme. Par le NIVEAU VALIDÉ elle vaut 5, donc force, et
    // l'habitude monte à 5. Par la MÉDIANE elle valait 6,5 -> « mixte » : la
    // séance sortait du couple, l'habitude retombait à 4, et le moteur oubliait
    // le test en cours. C'est le défaut que la simulation a trouvé.
    const enForme = F1.slice(0, 9).concat([se('2026-09-15', 125, 8, 5)]);
    expect(M.habitudeDe(enForme, AVANT)).toBe(5);
    // Contre-épreuve : le F1 d'origine, dont la même séance fait `4, 5`.
    expect(M.habitudeDe(F1, AVANT)).toBe(4);
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

  // ⚠️ AJOUTÉ APRÈS LE BANC DE MUTATION. Le test juste en dessous n'était PAS
  // discriminant : sur F1, dix séances de force, une pyramide ajoutée à la fin
  // ne gagne jamais le couple — les deux autres séances des trois dernières
  // suffisent à faire majorité, et le filtre l'écarte ensuite de toute façon.
  // Le même résultat sortait avec et sans la garde.
  //
  // Il faut que la séance muette puisse EMPORTER le couple : trois séances,
  // trois formats — force, mixte, et rien. Sans majorité, c'est la plus récente
  // qui tranche ; si la pyramide y entre, le couple vaut `null`, le filtre ne
  // garde qu'elle, et l'habitude disparaît alors qu'on a deux séances lisibles.
  test('DISCRIMINANT — une séance qui ne dit pas ce qui a été tenu n’emporte pas le couple', () => {
    const pyramide = { debut: '2026-09-09', palier: null,
      retenues: [{ charge_kg: 41, reps: 12 }, { charge_kg: 46, reps: 10 }] };
    const jeu = [se('2026-09-01', 120, 5, 5), se('2026-09-05', 110, 7, 7), pyramide];
    // Écartée AVANT le couple : il reste force et mixte, la plus récente gagne.
    expect(M.habitudeDe(jeu, AVANT)).toBe(7);
    // Sans la garde, le couple vaudrait `null` et l'habitude aussi.
    expect(M.habitudeDe(jeu, AVANT)).not.toBeNull();
    // Contre-épreuve : un palier ANNONCÉ mais qu'aucune série n'a tenu compte
    // pour la même chose — c'est « au moins une série au palier » qui décide,
    // pas la seule présence d'un nombre dans `palier`.
    const palierSansSerie = { debut: '2026-09-09', palier: 50,
      retenues: [{ charge_kg: 41, reps: 12 }, { charge_kg: 46, reps: 10 }] };
    expect(M.habitudeDe([se('2026-09-01', 120, 5, 5), se('2026-09-05', 110, 7, 7),
                         palierSansSerie], AVANT)).toBe(7);
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
    expect(M.formatDe(auPalier)).toBe('force');
  });

  test('sans palier, aucune série n’a tenu', () => {
    expect(M.seriesAuPalier({ palier: null, retenues: [s(5)] })).toEqual([]);
    expect(M.seriesAuPalier(null)).toEqual([]);
  });
});

// ── §10.2 / §12.6 / §9.9 — LE PAS, L'ÉCART, LA COUPURE, LA REPRISE (48b-3) ──
//
// CONVENTION DES CAS `P` : la coupure est le 20/09/2026 à 10 h UTC, et chaque
// séance est datée d'un nombre de jours AVANT elle, à la même heure. Sauf
// mention, les séances sont espacées de 7 jours et la dernière tombe 7 jours
// avant la coupure. Chaque séance ne porte QU'UNE charge : elle est donc à la
// fois sa plus lourde série et sa charge utilisée, ce qui isole le calcul du
// pas de tout le reste.
//
// Chaque cas tue une erreur précise, et la valeur fautive est en commentaire :
// elle a été MESURÉE en rejouant la variante sur les mêmes données.
describe('§10.2 — le pas de la salle, et quelle charge proposer', () => {
  const COUPURE = '2026-09-20T10:00:00+00:00';
  const JOUR = 86400000;
  const ilYA = (j) => new Date(Date.parse(COUPURE) - j * JOUR).toISOString();

  // Une séance-exercice à une seule charge, telle que `analyser` la décrit.
  const une = (kg, jours) => ({
    debut: ilYA(jours), palier: kg,
    retenues: [{ charge_kg: kg, reps: 5 }],
    votantes: [{ charge_kg: kg, reps: 5 }]
  });
  // n séances espacées de 7 jours, la dernière 7 jours avant la coupure.
  const jeu = (...charges) =>
    charges.map((kg, i) => une(kg, 7 * (charges.length - i)));
  const dessus = (ses, eq, palier) => M.chargeVoisine(ses, COUPURE, palier, eq, 1);
  const dessous = (ses, eq, palier) => M.chargeVoisine(ses, COUPURE, palier, eq, -1);

  test('P1 — un pas exact de 2,5 kg, dans les deux sens', () => {
    const P1 = jeu(115, 117.5, 120, 122.5, 125, 130);
    expect(M.pasDeSalle(P1, COUPURE)).toEqual({ pas: 2.5, nature: 'exact' });
    expect(dessus(P1, 'barre', 125)).toBe(127.5);
    expect(dessous(P1, 'barre', 125)).toBe(122.5);
  });

  test('P2 — DISCRIMINANT : un écart est récurrent à partir de TROIS fois', () => {
    // Écarts : 2,5 · 2,5 · 5 · 5 · 5. Seul le 5 revient trois fois.
    // À deux fois, 2,5 deviendrait récurrent -> 122,5.
    // À quatre fois, plus rien ne l'est -> repli de la barre -> 122,5 aussi.
    const P2 = jeu(100, 102.5, 105, 110, 115, 120);
    expect(M.pasDeSalle(P2, COUPURE)).toEqual({ pas: 5, nature: 'exact' });
    expect(dessus(P2, 'barre', 120)).toBe(125);
  });

  test('P3 — sans écart récurrent, la charge DÉJÀ UTILISÉE juste au-delà', () => {
    // Élévation latérale poulie réelle : 4,6 · 6,8 · 9 · 11,5 · 13,6.
    // Écarts 2,2 · 2,2 · 2,5 · 2,1 : aucun ne revient trois fois.
    // Écarts 2,1 · 2,2 · 2,2 · 2,5 : la médiane vaut 2,2 — APPROCHÉ, donc le
    // rang 1 se tait quand même et c'est la charge attestée qui répond.
    const P3 = jeu(4.6, 6.8, 9, 11.5, 13.6);
    expect(M.pasDeSalle(P3, COUPURE)).toEqual({ pas: 2.2, nature: 'approche' });
    expect(dessus(P3, 'poulie', 9)).toBe(11.5);
    expect(dessous(P3, 'poulie', 9)).toBe(6.8);
  });

  test('P4 — DISCRIMINANT : la charge utilisée passe AVANT le repli', () => {
    // 60 · 65 · 70, un seul écart de 5 : pas de pas. La charge 70 est attestée.
    // Si le repli de la barre passait d'abord : 67,5 — jamais soulevé.
    const P4 = jeu(60, 65, 70);
    // 186 (MOTEUR §10.2, décision d'Aurélien du 29/10/2026) — LE RANG 2 NE VAUT PLUS POUR LA BARRE NI LES HALTÈRES : leur cran est le pas
    // du matériel, jamais une charge déjà notée (A4 : un single de test à 190 kg était pris pour le cran). Il reste pour les machines.
    expect(dessus(P4, 'poulie', 65)).toBe(70);
    expect(dessus(P4, 'machine', 65)).toBe(70);
    expect(dessus(P4, 'barre', 65)).toBe(67.5);
    expect(dessus(P4, 'haltere', 65)).toBe(69);
  });

  test('P5 — DISCRIMINANT : le repli de la barre vaut 2,5 kg, pas 5', () => {
    // Curl barre EZ : 25 · 30, rien au-dessus. Le repli parle.
    // À 5 kg, le moteur proposerait 35 — un saut de 17 % sur une barre légère.
    const P5 = jeu(25, 30);
    expect(dessus(P5, 'barre', 30)).toBe(32.5);
    expect(dessus(P5, 'machine_smith', 30)).toBe(32.5);
  });

  test('P6 — le pas des haltères se déduit comme les autres', () => {
    const P6 = jeu(18, 20, 24, 28, 32);
    expect(M.pasDeSalle(P6, COUPURE)).toEqual({ pas: 4, nature: 'exact' });
    expect(dessus(P6, 'haltere', 28)).toBe(32);
  });

  test('P7 — deux écarts récurrents : c’est le plus petit qui est le cran', () => {
    // Écarts 1 · 1 · 1 · 2 · 2 · 2 : les deux reviennent trois fois, et le
    // cran de la salle est le plus petit — les autres en sont des multiples.
    const P7 = jeu(10, 11, 12, 13, 15, 17, 19);
    expect(M.pasDeSalle(P7, COUPURE)).toEqual({ pas: 1, nature: 'exact' });
    expect(dessus(P7, 'barre', 13)).toBe(14);
  });

  // ⚠️ AJOUTÉ APRÈS LE BANC DE MUTATION. P7 ne départageait PAS « le plus
  // petit » de « le plus fréquent » : à trois occurrences chacun, les deux
  // lectures tombent sur le même écart selon l'ordre de parcours. Il faut une
  // majorité franche pour que les deux règles divergent.
  test('DISCRIMINANT — le plus PETIT récurrent, même quand un autre est plus fréquent', () => {
    // Écarts 1 · 1 · 1 · 2 · 2 · 2 · 2 · 2 : le 2 revient cinq fois, le 1 trois.
    // « Le plus fréquent » rendrait 2, donc 15 depuis un palier de 13.
    const P7b = jeu(10, 11, 12, 13, 15, 17, 19, 21, 23);
    expect(M.pasDeSalle(P7b, COUPURE)).toEqual({ pas: 1, nature: 'exact' });
    expect(dessus(P7b, 'barre', 13)).toBe(14);
  });

  test('P8 — DISCRIMINANT : un pas non multiple de 0,5 est APPROCHÉ, donc inutilisable', () => {
    // Poulie convertie des livres : écarts de 2,2 kg, récurrents trois fois.
    // Sans le test du 0,5, le moteur proposerait 18,8 — une charge que la
    // machine ne fait pas. Rien au-dessus : le repli de la poulie (163, 2,5 kg), jamais 18,8.
    // 163 (24/10/2026) — INVERSÉ : la poulie a maintenant son repli (avant : `toBeNull`, le « sans chiffre »).
    const P8 = jeu(10, 12.2, 14.4, 16.6);
    expect(M.pasDeSalle(P8, COUPURE)).toEqual({ pas: 2.2, nature: 'approche' });
    expect(dessus(P8, 'poulie', 16.6)).toBe(19.1);
  });

  // ⚠️ AJOUTÉ EN 48b-5a-2, quand le code a rejoint la spec. Le §10.2 dit
  // depuis 48b-5a-1 qu'un pas approché « vaut l'écart MÉDIAN » ; `pasDeSalle`
  // rendait le plus petit écart récurrent, et rien du tout quand aucun écart ne
  // revenait trois fois. P8 ne séparait pas les deux lectures : à écarts tous
  // égaux, médiane et plus petit valent la même chose. Il faut des écarts
  // FRANCHEMENT différents, et aucun récurrent.
  test('P8b — DISCRIMINANT : un pas approché vaut l’écart MÉDIAN, pas le plus petit', () => {
    // Écarts 2 · 5 · 10 : aucun ne revient trois fois. La médiane vaut 5.
    // « Le plus petit » rendrait 2 ; l'ancien code, qui exigeait la récurrence,
    // ne rendait rien du tout.
    const P8b = jeu(10, 12, 17, 27);
    expect(M.pasDeSalle(P8b, COUPURE)).toEqual({ pas: 5, nature: 'approche' });
    // ⚠️ ET SANS EFFET SUR LES CHARGES : approché, donc le rang 1 se tait. Il
    // n'y a rien au-dessus de 27 : le repli de la poulie (163, inversé — avant : `toBeNull`).
    expect(dessus(P8b, 'poulie', 27)).toBe(29.5);
    // Contre-épreuve du rang 2 : depuis 12, la charge attestée au-dessus est 17,
    // pas 12 + 5.
    expect(dessus(P8b, 'poulie', 12)).toBe(17);
  });

  test('P9 — la fenêtre du pas est de 24 MOIS, pas de 12', () => {
    // Trois séances il y a ~18 mois, deux récentes. Les cinq charges donnent
    // un pas de 2,5. Sur 12 mois, il ne resterait que 47,5 et 50 : pas de pas,
    // rien au-dessus, pas de repli pour une machine -> `null`.
    const P9 = [une(40, 540), une(42.5, 530), une(45, 520), une(47.5, 20), une(50, 10)];
    expect(M.pasDeSalle(P9, COUPURE)).toEqual({ pas: 2.5, nature: 'exact' });
    expect(dessus(P9, 'machine', 50)).toBe(52.5);
  });

  test('P9b — DISCRIMINANT : au-delà de 24 mois, les charges ne comptent plus', () => {
    // Quatre séances il y a ~2,5 ans, deux récentes. Le pas de 2,5 kg d'alors
    // ne dit plus rien de la salle d'aujourd'hui. Sans fenêtre : 47,5.
    // ⚠️ Mais le rang 2 n'a PAS de limite de date — il ne trouve simplement
    // aucune charge au-dessus de 45.
    const P9b = [une(20, 930), une(22.5, 920), une(25, 910), une(27.5, 900),
                 une(40, 20), une(45, 10)];
    // Dans la fenêtre il ne reste que 40 et 45 : un seul écart, donc aucun
    // récurrent — le pas est APPROCHÉ à 5, et le rang 1 ne le lit pas.
    expect(M.pasDeSalle(P9b, COUPURE)).toEqual({ pas: 5, nature: 'approche' });
    // 163 — INVERSÉ (avant : `toBeNull`) : rien au-dessus sur 12 mois, le repli de la machine (5 kg) répond.
    expect(dessus(P9b, 'machine', 45)).toBe(50);
    // Contre-épreuve du rang 2 (§10.2, delta 49-36) : sur une MACHINE, seulement les 12 derniers mois
    // en montant — c'est 40 (il y a 20 jours). Vers le bas, sans limite.
    // 186 — INVERSÉ pour la barre : elle n'a plus de rang 2 (son pas est celui du matériel), 22 + 2,5, et non la charge de 22,5 d'il y a
    // deux ans et demi.
    expect(dessus(P9b, 'barre', 22)).toBe(24.5);
    expect(dessus(P9b, 'machine', 22)).toBe(40);
    expect(dessous(P9b, 'machine', 26)).toBe(25);
  });

  test('P10 — DISCRIMINANT : les haltères basculent À 20 kg, la paire incluse', () => {
    // Sous une paire de 20 : +2 (1 kg par main). À partir de 20 : +4.
    // Si 20 restait dans la bande légère, le moteur proposerait 22 — une paire
    // d'haltères de 11 kg, que les salles ne font pas.
    expect(dessus(jeu(14, 18), 'haltere', 18)).toBe(20);
    expect(dessus(jeu(16, 20), 'haltere', 20)).toBe(24);
  });

  test('P11 — DISCRIMINANT : en descendant, 20 reste dans la bande légère', () => {
    // L'asymétrie est voulue : on SORT de la bande en montant depuis 20
    // (20 -> 24), on y RESTE en descendant (20 -> 18). Les deux sens décrivent
    // le même plan de charges — 18, 20, 24, 28.
    expect(dessous(jeu(24, 28), 'haltere', 24)).toBe(20);
    expect(dessous(jeu(20, 24), 'haltere', 20)).toBe(18);
  });

  // 163 (24/10/2026, décision d'Aurélien) — INVERSÉ : « sans repli connu, le moteur se tait » devient « un pas par
  // matériel » (machine 5, poulie 2,5, kettlebell 4) ; la charge qui en sort est APPROCHÉE (`estApprochee`).
  test('P12 — un pas par matériel : plus jamais de charge sans chiffre en kg (163)', () => {
    expect(dessus(jeu(40, 45), 'machine', 45)).toBe(50);
    expect(dessus(jeu(40, 45), 'poulie', 45)).toBe(47.5);
    expect(dessus(jeu(40, 45), 'kettlebell', 45)).toBe(49);
    // Sans pas : ce qui ne se monte pas en kg (disque, élastique, aucun).
    expect(dessus(jeu(40, 45), 'disque', 45)).toBeNull();
    expect(dessus(jeu(40, 45), 'elastique', 45)).toBeNull();
    expect(dessus(jeu(40, 45), 'aucun', 45)).toBeNull();
  });

  test('163 — approchée : jamais faite = « ≈ » ; faite (ou pas exact) = connue', () => {
    const h = jeu(30, 30, 30);
    expect(M.estApprochee(h, COUPURE, 35, 'machine')).toBe(true);
    // Après 32,5 noté : une charge connue de l'exercice, plus de « ≈ ».
    const h2 = jeu(30, 30, 32.5);
    expect(M.estApprochee(h2, COUPURE, 32.5, 'machine')).toBe(false);
    expect(M.estApprochee(h2, COUPURE, 35, 'machine')).toBe(true);
    // Barre fixe de jadis : 32,5 et 27,5 se disent approchés, plus affirmés (le repli 2,5 d'une barre).
    expect(M.estApprochee(jeu(30), COUPURE, 32.5, 'barre')).toBe(true);
    expect(M.estApprochee(jeu(30), COUPURE, 27.5, 'barre')).toBe(true);
    // Un pas EXACT de l'historique porte la charge (comme avant).
    expect(M.estApprochee(jeu(10, 12.5, 15, 17.5), COUPURE, 20, 'barre')).toBe(false);
    // Rien qui ne se monte en kg, ni charge nulle ou d'aide.
    expect(M.estApprochee(h, COUPURE, 35, 'elastique')).toBe(false);
    expect(M.estApprochee(h, COUPURE, 0, 'machine')).toBe(false);
    expect(M.estApprochee(h, COUPURE, -10, 'machine')).toBe(false);
    // Haltères : la PAIRE, +2 jusqu'à 20 kg la paire (1 kg par haltère), puis +4 (2 par haltère).
    expect(dessus(jeu(18), 'haltere', 18)).toBe(20);
    expect(dessus(jeu(20), 'haltere', 20)).toBe(24);
    expect(M.phraseApprochee('haltere')).toMatch(/l’haltère au-dessus/);
    expect(M.phraseApprochee('barre')).toMatch(/petits disques/);
    expect(M.phraseApprochee('poulie')).toMatch(/petit disque/);
    expect(M.phraseApprochee('machine')).toMatch(/ta machine permet/);
  });

  test('un matériel venu de la base n’atteint jamais la chaîne de prototypes', () => {
    expect(dessus(jeu(40, 45), 'constructor', 45)).toBeNull();
    expect(dessus(jeu(40, 45), '__proto__', 45)).toBeNull();
  });

  test('sans palier, sans coupure, ou sans séance : rien', () => {
    expect(dessus(jeu(40, 45), 'barre', null)).toBeNull();
    expect(M.chargeVoisine(jeu(40, 45), null, 45, 'barre', 1)).toBeNull();
    expect(M.pasDeSalle(jeu(40, 45), null)).toBeNull();
    expect(M.pasDeSalle([], COUPURE)).toBeNull();
    // Une seule charge distincte : aucun écart à mesurer.
    expect(M.pasDeSalle(jeu(50, 50, 50), COUPURE)).toBeNull();
  });

  test('DISCRIMINANT — le pas se lit sur la PLUS LOURDE série, explorations comprises', () => {
    // Une séance `100, 100, 105` : c'est 105 qui décrit le plan de charges,
    // même si le palier vaut 100. Sur le palier seul, les charges seraient
    // 100, 105, 110 -> écarts de 5 ; sur la plus lourde, 105, 110, 115.
    const avecExplorations = [
      { debut: ilYA(21), palier: 100,
        retenues: [{ charge_kg: 100, reps: 5 }],
        votantes: [{ charge_kg: 100, reps: 5 }, { charge_kg: 105, reps: 2 }] },
      { debut: ilYA(14), palier: 105,
        retenues: [{ charge_kg: 105, reps: 5 }],
        votantes: [{ charge_kg: 105, reps: 5 }, { charge_kg: 110, reps: 2 }] },
      { debut: ilYA(7), palier: 110,
        retenues: [{ charge_kg: 110, reps: 5 }],
        votantes: [{ charge_kg: 110, reps: 5 }, { charge_kg: 115, reps: 2 }] }
    ];
    // Plus lourdes : 105, 110, 115 -> écarts 5 · 5, deux fois seulement : pas
    // de récurrence, donc un pas APPROCHÉ de 5 que le rang 1 ne lit pas.
    expect(M.pasDeSalle(avecExplorations, COUPURE)).toEqual({ pas: 5, nature: 'approche' });
    // Mais le rang 2 les connaît : depuis 110, la charge juste au-dessus est 115.
    expect(dessus(avecExplorations, 'machine', 110)).toBe(115);
  });

  // ⚠️ AJOUTÉ APRÈS LE BANC DE MUTATION. Le cas ci-dessus ne séparait PAS « la
  // plus lourde » de « la plus légère » : ses deux suites donnent des écarts de
  // 5, donc le même verdict. Il faut que les séries de travail et les
  // explorations progressent à des pas DIFFÉRENTS.
  test('DISCRIMINANT — c’est la plus LOURDE série de chaque séance qui décrit le plan', () => {
    // Travail : 100 · 101 · 102 · 103 (écarts de 1). Explorations :
    // 110 · 112,5 · 115 · 117,5 (écarts de 2,5). Lue sur la plus légère, la
    // salle aurait un cran de 1 kg — et le moteur proposerait 116 depuis 115.
    const deuxPentes = [
      { debut: ilYA(28), palier: 100, retenues: [{ charge_kg: 100, reps: 5 }],
        votantes: [{ charge_kg: 100, reps: 5 }, { charge_kg: 110, reps: 2 }] },
      { debut: ilYA(21), palier: 101, retenues: [{ charge_kg: 101, reps: 5 }],
        votantes: [{ charge_kg: 101, reps: 5 }, { charge_kg: 112.5, reps: 2 }] },
      { debut: ilYA(14), palier: 102, retenues: [{ charge_kg: 102, reps: 5 }],
        votantes: [{ charge_kg: 102, reps: 5 }, { charge_kg: 115, reps: 2 }] },
      { debut: ilYA(7), palier: 103, retenues: [{ charge_kg: 103, reps: 5 }],
        votantes: [{ charge_kg: 103, reps: 5 }, { charge_kg: 117.5, reps: 2 }] }
    ];
    expect(M.pasDeSalle(deuxPentes, COUPURE)).toEqual({ pas: 2.5, nature: 'exact' });
    expect(dessus(deuxPentes, 'machine', 115)).toBe(117.5);
  });

  test('les chauffes, dégressives et séries ratées ne décrivent aucun plan de charges', () => {
    // `votantes` les exclut déjà (§7) : une chauffe à 20 kg ne dit rien du cran.
    const s1 = { debut: ilYA(14), palier: 100,
      retenues: [{ charge_kg: 100, reps: 5 }], votantes: [{ charge_kg: 100, reps: 5 }] };
    const s2 = { debut: ilYA(7), palier: 105,
      retenues: [{ charge_kg: 105, reps: 5 }], votantes: [{ charge_kg: 105, reps: 5 }] };
    // Rien en dessous de 100 dans l'historique : la chauffe de la vraie séance n'y est pas. 163 — INVERSÉ (avant :
    // `toBeNull`) : le repli de la machine (5 kg) donne 95, jamais la chauffe à 20.
    expect(dessous([s1, s2], 'machine', 100)).toBe(95);
  });
});

// ── §12.6 / §9.9 — L'ÉCART HABITUEL ET LA REPRISE ──────────────────────────
describe('§9.9 — la coupure et les deux reprises', () => {
  const COUPURE = '2026-09-20T10:00:00+00:00';
  const JOUR = 86400000;
  const ilYA = (j) => new Date(Date.parse(COUPURE) - j * JOUR).toISOString();
  const une = (jours) => ({
    debut: ilYA(jours), palier: 100,
    retenues: [{ charge_kg: 100, reps: 5 }], votantes: [{ charge_kg: 100, reps: 5 }]
  });
  // Cinq séances espacées de 7 jours, la dernière N jours avant la coupure.
  const cinq = (n) => [une(n + 28), une(n + 21), une(n + 14), une(n + 7), une(n)];

  test('l’écart habituel est la médiane des écarts, en jours', () => {
    expect(M.ecartHabituel(cinq(7), COUPURE)).toBe(7);
    // Une médiane, pas une moyenne : une seule longue coupure ne doit pas
    // rendre la règle muette pour toujours. 7 · 7 · 90 · 7 -> 7, pas 27,75.
    const irregulier = [une(118), une(111), une(21), une(14), une(7)];
    expect(M.ecartHabituel(irregulier, COUPURE)).toBe(7);
  });

  test('moins de deux séances : pas d’écart, donc pas de coupure', () => {
    expect(M.ecartHabituel([une(100)], COUPURE)).toBeNull();
    expect(M.repriseDe([une(100)], COUPURE)).toBe('aucune');
    expect(M.ecartHabituel([], COUPURE)).toBeNull();
    expect(M.repriseDe([], COUPURE)).toBe('aucune');
  });

  test('DISCRIMINANT — la coupure est STRICTE, et le facteur est 3', () => {
    // Écart habituel 7, donc le seuil est 21 jours.
    expect(M.repriseDe(cinq(22), COUPURE)).toBe('courte');
    // À 21 pile, il n'y a PAS de coupure. Avec `>=`, ce serait « courte ».
    expect(M.repriseDe(cinq(21), COUPURE)).toBe('aucune');
    // À 15 jours non plus. Avec un facteur 2 (seuil 14), ce serait « courte ».
    expect(M.repriseDe(cinq(15), COUPURE)).toBe('aucune');
  });

  test('DISCRIMINANT — 84 jours INCLUS restent une reprise courte', () => {
    // Douze semaines pile : la borne mesurée au banc M14. Exclue, ce serait
    // « longue », et le moteur retirerait un cran sans raison.
    expect(M.repriseDe(cinq(84), COUPURE)).toBe('courte');
    expect(M.repriseDe(cinq(90), COUPURE)).toBe('longue');
  });

  test('sans coupure de date, aucune reprise — le §9.12 vaut ici aussi', () => {
    expect(M.repriseDe(cinq(22), null)).toBe('aucune');
    expect(M.ecartHabituel(cinq(22), null)).toBeNull();
  });
});

// ── §9.12 — LES DATES SONT DES INSTANTS, PAS DES TEXTES ────────────────────
//
// ⚠️ LE DÉFAUT QUE CE COMMIT CORRIGE, ET IL ÉTAIT INVISIBLE.
//
// Un même instant s'écrit de deux façons dans ce projet : l'app écrit
// `new Date().toISOString()` — « …T10:00:00.000Z » —, tandis que `sessions.debut`
// est un `timestamptz` et revient du serveur en « …T10:00:00+00:00 ». En TEXTE,
// « + » (0x2B) précède « . » (0x2E) : la seconde écriture se classe AVANT la
// première, à instant égal.
//
// Aucun test ne le voyait parce que tout le corpus du dépôt s'écrit avec « Z ».
describe('§9.12 — deux écritures d’un même instant se classent pareil', () => {
  const JOUR = 86400000;
  // La coupure écrite par l'app, la séance écrite par le serveur.
  const COUPURE_Z = '2026-09-20T10:00:00.000Z';
  const DU_JOUR = '2026-09-20T10:00:00+00:00';
  const ilYA = (j) => new Date(Date.parse(COUPURE_Z) - j * JOUR).toISOString();

  test('le même instant, écrit des deux façons, ne se classe pas pareil en TEXTE', () => {
    // Le constat qui justifie tout ce qui suit.
    expect(Date.parse(DU_JOUR)).toBe(Date.parse(COUPURE_Z));
    expect(DU_JOUR < COUPURE_Z).toBe(true);        // …et pourtant
  });

  test('DISCRIMINANT — la séance du jour ne compte pas parmi ses antécédents', () => {
    const une = (jours) => ({
      debut: ilYA(jours), palier: 100,
      retenues: [{ charge_kg: 100, reps: 5 }], votantes: [{ charge_kg: 100, reps: 5 }]
    });
    const cinq = [une(50), une(43), une(36), une(29), une(22)];
    const duJour = { debut: DU_JOUR, palier: 100,
      retenues: [{ charge_kg: 100, reps: 5 }], votantes: [{ charge_kg: 100, reps: 5 }] };
    // En texte, la séance du jour passait pour antérieure : la dernière séance
    // devenait « aujourd'hui », donc plus aucune coupure.
    expect(M.repriseDe(cinq.concat([duJour]), COUPURE_Z)).toBe('courte');
    expect(M.anterieures(cinq.concat([duJour]), COUPURE_Z)).toHaveLength(5);
  });

  test('DISCRIMINANT — `habitudeDe` en hérite : le triceps corde reste à 13', () => {
    // Le jeu F2 de 48b-2, plus une séance du jour même à 20 reps. Comptée, elle
    // ferait basculer l'habitude de 13 à 15, donc la zone ne changerait pas —
    // mais la consigne, si.
    const F2 = [
      se('2026-04-16', 22.5, 12, 12, 12), se('2026-04-24', 22.5, 12, 12),
      se('2026-05-12', 20.3, 12, 12, 12), se('2026-05-29', 20.3, 13, 13),
      se('2026-06-25', 20.3, 15, 15, 12), se('2026-07-02', 20.3, 15, 15, 12),
      se('2026-07-09', 20.3, 15, 15, 12), se('2026-08-22', 22.5, 12, 12),
      se('2026-09-03', 24.8, 12, 15), se('2026-09-10', 24.8, 15, 15, 15)
    ];
    const avec = F2.concat([se(DU_JOUR, 24.8, 20, 20, 20)]);
    expect(M.habitudeDe(avec, COUPURE_Z)).toBe(13);
    // Contre-épreuve : datée de la veille, elle compte bien.
    const laVeille = F2.concat([se('2026-09-19T10:00:00+00:00', 24.8, 20, 20, 20)]);
    expect(M.habitudeDe(laVeille, COUPURE_Z)).toBe(15);
  });

  test('une date illisible ne se compare pas de travers : elle ne compte pas', () => {
    const bancal = { debut: 'pas une date', palier: 100,
      retenues: [{ charge_kg: 100, reps: 5 }], votantes: [{ charge_kg: 100, reps: 5 }] };
    expect(M.anterieures([bancal], COUPURE_Z)).toEqual([]);
    expect(M.repriseDe([bancal], COUPURE_Z)).toBe('aucune');
  });

  // ⚠️ AJOUTÉ APRÈS LE BANC DE MUTATION, et c'est le cas qui manquait le plus.
  // Une COUPURE illisible ne rend pas `null` par elle-même : `Date.parse` rend
  // `NaN`, et toute comparaison avec `NaN` est fausse. Les rangs 1 et 2 se
  // taisent donc d'eux-mêmes — mais le rang 3, le repli du matériel, ne lit
  // AUCUNE séance : sans la garde, il proposerait une charge alors qu'on ne
  // sait pas ce qu'est « l'avenir ». C'est `isFinite` qui ferme la porte.
  test('DISCRIMINANT — une COUPURE illisible ne laisse pas parler le repli', () => {
    const uneSeance = [{ debut: '2026-09-13T10:00:00+00:00', palier: 100,
      retenues: [{ charge_kg: 100, reps: 5 }], votantes: [{ charge_kg: 100, reps: 5 }] }];
    ['pas une date', 'NaN', '2026-13-45'].forEach((coupure) => {
      expect(M.chargeVoisine(uneSeance, coupure, 45, 'barre', 1)).toBeNull();
      expect(M.pasDeSalle(uneSeance, coupure)).toBeNull();
      expect(M.ecartHabituel(uneSeance, coupure)).toBeNull();
      expect(M.repriseDe(uneSeance, coupure)).toBe('aucune');
      expect(M.habitudeDe(uneSeance, coupure)).toBeNull();
    });
    // Contre-épreuve : la même demande avec une coupure lisible parle bien.
    // Depuis 100, rien n'est attesté au-dessus, donc c'est le repli qui rend
    // 102,5 — exactement ce que la coupure illisible doit empêcher.
    expect(M.chargeVoisine(uneSeance, COUPURE_Z, 100, 'barre', 1)).toBe(102.5);
  });
});

// ── §9.13 — LA CONSIGNE, PILOTÉE PAR LE FICHIER DE CAS ─────────────────────
//
// ⚠️ C'EST LE FICHIER QUI FAIT FOI, PAS CE TEST. `consigne-48b5a2.json` sort de
// la référence que Claude.ai a rejouée sur tout l'historique des cinq profils —
// 6 109 consignes par réglage, aucune anomalie. Le test ne redit pas la règle :
// il rejoue les 29 cas et compare. Écrire les attendus à la main ici, c'est se
// donner deux sources pour un seul verdict (`CADRAGE-V2` §2 undecies).
//
// Chaque cas porte `tue` : l'erreur qu'il doit tuer, et ce que rendrait le code
// fautif. Les valeurs y sont MESURÉES, pas supposées — c'est la configuration
// discriminante du §2 quater, apportée par le fichier lui-même.
//
// La SEULE conversion que ce test s'autorise : le fichier écrit `ligne` et
// `haut` en tableaux `[charge, vise]` / `[charge, vise, k]`, `consignePour`
// rend des objets `{ charge, vise }` / `{ charge, vise, k }`. Un seul choix,
// documenté des deux côtés ; la conversion vit ici, en un seul endroit.
describe('§9.13 — la consigne, en calcul pur', () => {
  // 74 (11/10/2026) — INVERSÉ : un test à RPE 10 compte ses reps faites.
  // N10, 130 × 5 à RPE 10 : 68B le comptait 4 (haut 130 × 4) ; il se garde à
  // 130 × 5 — pas de rep de plus (plafond 3), et toujours pas une de moins.
  const CAS = require('./fixtures/consigne-48b5a2.json').map((c) => (c.id !== 'N10' ? c
    : Object.assign({}, c, { attendu: Object.assign({}, c.attendu, { haut: [130, 5, 2] }) })));
  const CHAMPS = ['etat', 'zone', 'n', 'ligne', 'haut', 'raison'];

  const enObjet = (t, avecK) => {
    if (t === null || t === undefined) return t;
    return avecK ? { charge: t[0], vise: t[1], k: t[2] } : { charge: t[0], vise: t[1] };
  };
  // Les champs que le fichier ne nomme PAS doivent être absents du rendu : un
  // silence n'a ni zone ni `n`, une consigne n'a pas de `raison`. On compare
  // donc deux objets réduits aux mêmes clés — `toEqual` fait le reste.
  const lire = (o) => {
    const vu = {};
    CHAMPS.forEach((c) => { if (o[c] !== undefined) vu[c] = o[c]; });
    return vu;
  };
  const attendu = (a) => {
    const att = {};
    CHAMPS.forEach((c) => {
      if (!(c in a)) return;
      att[c] = c === 'ligne' ? enObjet(a[c], false) : c === 'haut' ? enObjet(a[c], true) : a[c];
    });
    return att;
  };

  test('le fichier de cas est complet et nomme ses erreurs', () => {
    expect(CAS).toHaveLength(29);
    const erreurs = new Set();
    CAS.forEach((c) => {
      expect(typeof c.id).toBe('string');
      expect(typeof c.titre).toBe('string');
      expect(['prudent', 'normal', 'franc']).toContain(c.reglage);
      expect(c.attendu).toBeTruthy();
      (c.tue || []).forEach((t) => erreurs.add(t.erreur));
    });
    // 24 erreurs nommées : c'est le tableau du prompt, et c'est ce que la
    // campagne de mutation doit tuer une à une.
    expect(erreurs.size).toBe(24);
  });

  CAS.forEach((c) => {
    test(`${c.id} — ${c.titre} (${c.reglage})`, () => {
      // 74 — la consigne que l'app affiche : sur les reps faites, plafonnée
      // après une série à fond (`consigneApresAFond`, comme `consigneDExercice`).
      const rendu = M.consigneApresAFond(c.seances, c.avant, {
        reglage: c.reglage, equipement: c.equipement, correction: null
      });
      // 163 — `approchee` est un drapeau d'affichage (« ≈ »), testé à part : ici on compare les charges et les reps.
      const sans = (o) => (o && typeof o === 'object' ? Object.keys(o).filter((k) => k !== 'approchee')
        .reduce((a, k) => { a[k] = o[k]; return a; }, {}) : o);
      const lu = lire(rendu);
      if (lu.ligne) lu.ligne = sans(lu.ligne);
      if (lu.haut) lu.haut = sans(lu.haut);
      expect(lu).toEqual(attendu(c.attendu));
    });
  });

  // ⚠️ CE QUE LE FICHIER NE COUVRE PAS : `correction` y vaut toujours `null`
  // (elle est lue au commit 7). Le contrat dit pourtant qu'elle L'EMPORTE SUR
  // TOUT — sans ce cas, un `zoneRetenue` court-circuité passerait inaperçu.
  test('DISCRIMINANT — la correction de zone l’emporte sur l’habitude', () => {
    const n2 = CAS.find((c) => c.id === 'N2');
    const sans = M.consignePour(n2.seances, n2.avant,
      { reglage: 'normal', equipement: 'barre', correction: null });
    const avec = M.consignePour(n2.seances, n2.avant,
      { reglage: 'normal', equipement: 'barre', correction: 'volume' });
    // Sans correction : habitude 5 -> Lourd, le niveau touche le haut, test.
    expect(sans.zone).toBe('lourd');
    expect(sans.etat).toBe('test_propose');
    // Avec « Volume » (10-12), le même niveau de 5 est loin du haut : on
    // progresse d'une rep, et plus aucun test n'est proposé.
    expect(avec.zone).toBe('volume');
    expect(avec.etat).toBe('progression');
    expect(avec.ligne).toEqual({ charge: 125, vise: 6 });
  });

  // Le contrat rend AUSSI `palier` et `niveau`, que le fichier ne vérifie pas :
  // 48b-5b en a besoin pour écrire la phrase.
  test('le rendu porte le palier et le niveau validé de la dernière séance', () => {
    const n1 = CAS.find((c) => c.id === 'N1');
    const rendu = M.consignePour(n1.seances, n1.avant,
      { reglage: 'normal', equipement: 'barre', correction: null });
    expect(rendu.palier).toBe(125);
    expect(rendu.niveau).toBe(4);
  });

  // §9.12 — sans coupure lisible, pas de consigne : la garde vaut ici comme
  // partout ailleurs dans `moteur.js`.
  test('DISCRIMINANT — sans coupure lisible, le moteur se tait', () => {
    const n1 = CAS.find((c) => c.id === 'N1');
    ['pas une date', null, ''].forEach((coupure) => {
      expect(M.consignePour(n1.seances, coupure,
        { reglage: 'normal', equipement: 'barre' }))
        .toEqual({ etat: 'silence', raison: 'premiere_fois', fondement: {} });
    });
  });

  // Un rôle venu de la base ne doit pas atteindre la chaîne de prototypes :
  // `constructor` et `__proto__` ne sont ni du travail, ni une exploration.
  test('un rôle venu de la base n’atteint jamais la chaîne de prototypes', () => {
    const seance = {
      debut: '2026-09-13T18:00:00+00:00', palier: 100,
      series: [{ charge_kg: 100, reps: 5, rpe: null, role: 'constructor' },
               { charge_kg: 100, reps: 5, rpe: null, role: '__proto__' }]
    };
    // ⚠️ LE FONDEMENT LE PROUVE MIEUX QUE L'ÉTAT : `charges` est VIDE, donc
    // ni `constructor` ni `__proto__` n'est entré dans les votantes. La séance,
    // elle, est bien LÀ depuis 48b-6a — la feuille « Pourquoi » liste ses
    // séries, sans rôle : « rien n'a été répété » se montre, il ne se résume
    // pas. Les rôles douteux y arrivent tels quels, et c'est voulu : le
    // fondement rapporte ce qui a été fait, il ne juge pas une seconde fois.
    expect(M.consignePour([seance], '2026-09-20T10:00:00+00:00',
      { reglage: 'normal', equipement: 'barre' }))
      .toEqual({ etat: 'silence', raison: 'pas_de_palier',
                 fondement: { date: '2026-09-13T18:00:00+00:00', charges: [],
                   seance: [
                     { charge_kg: 100, reps: 5, rpe: null, ressenti: null, role: 'constructor', origine: null },
                     { charge_kg: 100, reps: 5, rpe: null, ressenti: null, role: '__proto__', origine: null }
                   ] } });
  });

  // ── CE QUE LES 29 CAS NE TOUCHENT PAS ────────────────────────────────────
  //
  // ⚠️ SIX RÈGLES DU §9.7/§9.8 SURVIVAIENT AU BANC DE MUTATION, et c'est le
  // fichier de cas qui ne les atteint pas : il sort de l'historique réel, où
  // personne ne fait 30 reps, ne pose deux explorations dans la même séance, ni
  // ne revient à un ancien palier. Les règles existent quand même, et un code
  // qui les perd doit tomber. Chaque cas ci-dessous a été MESURÉ : la valeur
  // fautive en commentaire vient de l'exécution de la variante.
  const serie = (kg, reps, role, effort) => Object.assign(
    { charge_kg: kg, reps: reps, rpe: null, ressenti: null, role: role },
    typeof effort === 'number' ? { rpe: effort } : {});
  const seance = (debut, palier, ...series) => ({ debut: debut, palier: palier, series: series });
  const auPalier = (kg, reps, n) => Array.from({ length: n }, () => serie(kg, reps, 'palier'));
  const PRESCRITE = '2026-09-20T10:00:00+00:00';
  const pour = (seances, reglage, equipement) => M.consignePour(seances, PRESCRITE,
    { reglage: reglage, equipement: equipement, correction: null });

  test('DISCRIMINANT — aucune cible ne dépasse 30 reps (§9.1.2)', () => {
    // Zone Séries longues (15-20), niveau 30, test raté à 5 : la cible de
    // l'étirement vaudrait `20 + 30 − 5` = 45. Plafonnée à 30, le niveau
    // l'atteint DÉJÀ — donc on reteste. Sans plafond : 30 < 45, la zone
    // continuerait de s'étirer, `etirement` et « vise 31 ».
    const s = [
      seance('2026-08-30T18:00:00+00:00', 200, ...auPalier(200, 30, 3)),
      seance('2026-09-06T18:00:00+00:00', 200, ...auPalier(200, 30, 3)),
      seance('2026-09-13T18:00:00+00:00', 200, ...auPalier(200, 30, 3),
             serie(205, 5, 'exploration'))
    ];
    const r = pour(s, 'normal', 'machine');
    expect(r.zone).toBe('series_longues');
    expect(r.etat).toBe('retest');
    expect(r.ligne).toEqual({ charge: 200, vise: 30 });
    expect(r.haut).toEqual({ charge: 205, vise: 15, k: 1 });
  });

  test('DISCRIMINANT — Prudent exige les deux séances AU MÊME palier', () => {
    // Le repère « 2-pour-2 » compte deux séances de suite au haut, au MÊME
    // palier : un palier qui change rouvre le compteur, sinon la montée de la
    // veille vaudrait preuve pour la montée du jour. Sans le test du palier :
    // `test_propose`, haut { 127,5 · 3 · 1 }.
    const s = [
      seance('2026-07-19T18:00:00+00:00', 115, ...auPalier(115, 5, 3)),
      seance('2026-07-26T18:00:00+00:00', 117.5, ...auPalier(117.5, 5, 3)),
      seance('2026-08-02T18:00:00+00:00', 120, ...auPalier(120, 5, 3)),
      seance('2026-09-06T18:00:00+00:00', 122.5, ...auPalier(122.5, 5, 3)),
      seance('2026-09-13T18:00:00+00:00', 125, ...auPalier(125, 5, 3))
    ];
    expect(pour(s, 'prudent', 'barre')).toMatchObject({
      etat: 'progression', zone: 'lourd', ligne: { charge: 125, vise: 5 }, haut: null
    });
    // Contre-épreuve : les deux dernières au même palier, et le test part.
    const memePalier = s.slice(0, 3).concat([
      seance('2026-09-06T18:00:00+00:00', 125, ...auPalier(125, 5, 3)),
      seance('2026-09-13T18:00:00+00:00', 125, ...auPalier(125, 5, 3))
    ]);
    expect(pour(memePalier, 'prudent', 'barre').etat).toBe('test_propose');
  });

  test('DISCRIMINANT — l’épisode d’étirement s’arrête à un changement de palier', () => {
    // Un test raté à 100 kg, PUIS une séance à 110, PUIS un retour à 100 : le
    // vieil épisode est clos par le changement de palier. Si la remontée le
    // traversait, le moteur croirait l'étirement en cours et rendrait
    // `etirement`, « vise 14 », au lieu de proposer le test.
    const s = [
      seance('2026-08-16T18:00:00+00:00', 100, ...auPalier(100, 12, 3)),
      seance('2026-08-23T18:00:00+00:00', 100, ...auPalier(100, 12, 2),
             serie(110, 4, 'exploration')),
      seance('2026-08-30T18:00:00+00:00', 110, ...auPalier(110, 12, 3)),
      seance('2026-09-13T18:00:00+00:00', 100, ...auPalier(100, 13, 3))
    ];
    expect(pour(s, 'normal', 'machine')).toMatchObject({
      etat: 'test_propose', zone: 'volume',
      ligne: { charge: 100, vise: 12 }, haut: { charge: 110, vise: 8, k: 1 }
    });
  });

  test('DISCRIMINANT — c’est la plus LOURDE exploration qui fait le test', () => {
    // Deux explorations le même jour : 130 × 4 (dans la zone) et 135 × 2 (sous
    // le bas). C'est la plus lourde qui juge — le test a été poussé jusque-là.
    // Sur la plus légère, le moteur lirait un test réussi et rendrait `etend`,
    // haut { 130 · 4 · 2 }, au lieu de réduire le cran.
    const s = [
      seance('2026-07-19T18:00:00+00:00', 115, ...auPalier(115, 5, 3)),
      seance('2026-07-26T18:00:00+00:00', 117.5, ...auPalier(117.5, 5, 3)),
      seance('2026-08-02T18:00:00+00:00', 120, ...auPalier(120, 5, 3)),
      seance('2026-08-09T18:00:00+00:00', 122.5, ...auPalier(122.5, 5, 3)),
      seance('2026-09-13T18:00:00+00:00', 125, ...auPalier(125, 5, 2),
             serie(130, 4, 'exploration'), serie(135, 2, 'exploration'))
    ];
    expect(pour(s, 'normal', 'barre')).toMatchObject({
      etat: 'retest_un_cran', n: 4,
      ligne: { charge: 125, vise: 5 }, haut: { charge: 127.5, vise: 3, k: 1 }
    });
  });

  test('DISCRIMINANT — après la bascule, « tout passe » couvre AUSSI les restes', () => {
    // Franc, zone Volume, la charge a basculé et une série est restée à 90 :
    // au haut de la zone, tout passe d'un coup — les trois séries, la restée
    // comprise. Sur les seules séries au palier : k = 2, et la série de 90 ne
    // recevrait jamais sa consigne.
    const s = [
      seance('2026-07-19T18:00:00+00:00', 80, ...auPalier(80, 10, 3)),
      seance('2026-07-26T18:00:00+00:00', 82.5, ...auPalier(82.5, 10, 3)),
      seance('2026-08-02T18:00:00+00:00', 85, ...auPalier(85, 10, 3)),
      seance('2026-09-06T18:00:00+00:00', 90, ...auPalier(90, 10, 2),
             serie(92.5, 12, 'exploration')),
      seance('2026-09-13T18:00:00+00:00', 92.5, serie(90, 10, 'rampe'),
             ...auPalier(92.5, 12, 2))
    ];
    expect(pour(s, 'franc', 'barre')).toMatchObject({
      etat: 'tout_passe', zone: 'volume', n: 3,
      ligne: null, haut: { charge: 92.5, vise: 12, k: 3 }
    });
  });

  test('DISCRIMINANT — la zone figée est celle du PREMIER test raté de l’épisode', () => {
    // ⚠️ AUCUN DES 42 CAS NE L'ATTEINT : leurs épisodes d'étirement n'ont qu'UN
    // test raté, où « le premier » et « le dernier » sont la même séance.
    // Mesuré le 20/09 — le mutant qui prend `rates[0]` leur survivait.
    //
    // Avec DEUX ratés, l'écart compte : la zone reste celle du 6 sept., pas
    // celle du 13. C'est tout l'objet du §9.7 — si elle suivait le test le
    // plus récent, les reps déjà étirées entreraient dans l'habitude et
    // déplaceraient la zone que l'épisode a justement pour but de tenir.
    const N8 = require('./fixtures/consigne-48b7.json').filter((c) => c.id === 'N8')[0];
    const derniere = N8.seances[N8.seances.length - 1];
    const avantDerniere = JSON.parse(JSON.stringify(derniere));
    avantDerniere.debut = '2026-09-06T18:00:00+00:00';
    const r = M.consignePour(
      N8.seances.slice(0, -1).concat([avantDerniere, derniere]), N8.avant,
      { reglage: 'normal', equipement: N8.equipement, correction: null });
    expect(r.etat).toBe('etirement');
    expect(r.fondement.zoneFigee).toEqual({ date: '2026-09-06T18:00:00+00:00' });
    // Et la feuille le dit avec cette date-là.
    expect(M.pourquoiConsigne(r, 'normal').zone)
      .toBe('Ta zone\u00a0: Volume, 10 à 12 reps, celle de ton test le 6\u00a0sept.\u00a0: '
            + 'elle ne bouge pas pendant que ta zone s\'étire.'
            + ' Touche l\'étiquette pour la changer.');
  });

  test('DISCRIMINANT — un niveau illisible fait taire le moteur, il ne l’invente pas', () => {
    // Une série au palier sans reps : `niveauValide` ne conclut pas (§9.2), et
    // tout ce qui suit se calculerait sur `null`. Sans la garde, le moteur
    // rendrait `progression` et « vise 1 » — une consigne inventée.
    const s = [seance('2026-09-13T18:00:00+00:00', 100,
      serie(100, null, 'palier'), serie(100, 5, 'palier'))];
    expect(pour(s, 'normal', 'barre')).toEqual({
      etat: 'silence', raison: 'pas_de_palier',
      fondement: { date: '2026-09-13T18:00:00+00:00', charges: [100],
        seance: [
          { charge_kg: 100, reps: null, rpe: null, ressenti: null, role: 'palier', origine: null },
          { charge_kg: 100, reps: 5, rpe: null, ressenti: null, role: 'palier', origine: null }
        ] }
    });
    // ⚠️ 49-U9 (§20.2) — la phrase « pas de palier » est partie : la chaîne
    // complète n'y arrive plus (`analyser` écarte une série sans reps, et le
    // §7.6 retient une charge ou neutralise la séance). Ce silence n'existe
    // plus que sur un contrat brut, et il ne dit rien — il n'invente pas non
    // plus de reps. Avant : « Pas de palier le 13 sept. : 100 kg, aucune
    // charge répétée. Rien à proposer. »
    expect(M.libellesConsigne(pour(s, 'normal', 'barre'))).toEqual({ jaune: [], gris: '' });
  });
});

// ── ECRAN-SAISIE §3.12 — LE FONDEMENT ET LES PHRASES ───────────────────────
//
// ⚠️ C'EST LE FICHIER QUI FAIT FOI, comme pour 48b-5a-2. `consigne-48b7.json`
// reprend les 39 cas de `consigne-48b5b1.json` — mêmes consignes, mêmes
// phrases, fondement ENRICHI — et en ajoute trois (Y1 à Y3) qui font traverser
// au pont les rôles d'`analyser` que le contrat résume en `autre` : une
// dégressive, une série arrêtée, une chauffe non déclarée, une descente.
// Le test rejoue, il ne redit pas la règle.
//
// Trois vérifications par cas, et elles sont distinctes :
//   · le FONDEMENT, clé pour clé — y compris les clés ABSENTES. « Une clé n'y
//     figure que lorsqu'elle a un sens » (§9.13) : un fondement qui porterait
//     toujours `palierPrecedent`, parfois nul, passerait un `toEqual` indulgent
//     et obligerait chaque lecteur à retrancher les cas.
//   · les PHRASES de l'en-tête, octet pour octet. Les espaces insécables en
//     font partie.
//   · la FEUILLE « POURQUOI », ses sept champs, octet pour octet aussi — c'est
//     le plus long texte que l'app écrive, et le seul qui explique un calcul.
describe('§9.13 / ECRAN-SAISIE §3.12 et §3.10 — le fondement, les phrases et le pourquoi', () => {
  // 74 (11/10/2026) — INVERSÉS : la rep en moins ne compte plus que dans le
  // calcul prudent. Le reste du fichier est la consigne, ses phrases et son
  // « Pourquoi », à l'identique.
  //   · N10 — le test 130 × 5 à RPE 10 vaut 5 (68B : 4), le haut vise 5, et
  //     la phrase dit qu'il a touché le haut de la zone (68B : « dans ta zone ») ;
  //   · X1, X6, X10 — 125 × 5, 5, 4 avec une série à fond : la note « sans
  //     marge » reste (le calcul prudent revient par le plafond 2), mais le
  //     niveau dit dans le « Pourquoi » est celui des reps faites : 5 (68B : 4).
  const INVERSES_74 = {
    N10: (c) => {
      c.fondement.test.niveau = 5;
      // 5 reps faites, le haut de la zone lourde (3-5) : il l'a touché.
      c.phrases.gris = c.phrases.gris.replace('est dans ta zone', 'a touché le haut de ta zone');
      c.phrases.jaune = c.phrases.jaune.map((l) => l.replace('130\u00a0kg\u00a0×\u00a04', '130\u00a0kg\u00a0×\u00a05'));
      // Le « Pourquoi » : plus de « compté 4 » — « Ton test : 130 kg × 5, sans
      // marge. » puis la suite (retouche 74), et le test est au haut de la zone.
      c.pourquoi = JSON.parse(JSON.stringify(c.pourquoi)
        .split('130\u00a0kg\u00a0×\u00a04').join('130\u00a0kg\u00a0×\u00a05')
        .split('Ton test à 130\u00a0kg a fait 5 reps à RPE 10, compté 4, dans ta zone')
        .join('Ton test\u00a0: 130\u00a0kg\u00a0×\u00a05, sans marge. Le haut de ta zone')
        .split('test, dans ta zone').join('test, au haut de ta zone'));
    },
    X1: (c) => { c.pourquoi.palier = c.pourquoi.palier.replace('validée à 4 reps', 'validée à 5 reps'); },
    X6: (c) => { c.pourquoi.palier = c.pourquoi.palier.replace('validée à 4 reps', 'validée à 5 reps'); },
    X10: (c) => { c.pourquoi.palier = c.pourquoi.palier.replace('validée à 4 reps', 'validée à 5 reps'); }
  };
  const CAS = require('./fixtures/consigne-48b7.json').map((c) => {
    if (!INVERSES_74[c.id]) return c;
    const k = JSON.parse(JSON.stringify(c));
    INVERSES_74[c.id](k);
    return k;
  });
  // Les cinq corrections de 48b-7 : sans elles, `correction` serait toujours
  // nulle et la moitié de §9.1.1 ne serait jouée par aucun cas.
  test('le fichier porte des cas AVEC correction, et des cas sans', () => {
    const avec = CAS.filter((c) => c.correction);
    expect(avec.map((c) => c.id)).toEqual(['C1', 'C3', 'C4', 'C5']);
    expect(CAS.filter((c) => !c.correction).length).toBe(43);
  });
  const NB = ' ';
  // ⚠️ LA CORRECTION VIENT DU CAS DEPUIS 48b-7. La passer en dur à `null`
  // laisserait les cinq cas C muets : ils rendraient la zone déduite, leurs
  // phrases tomberaient, et c'est justement ce qu'ils existent pour prouver.
  // 74 — la consigne plafonnée, celle que l'app affiche (voir plus haut).
  const pour = (c) => M.consigneApresAFond(c.seances, c.avant,
    { reglage: c.reglage, equipement: c.equipement, correction: c.correction });

  // Les deux branches de chaque règle de rédaction (prompt 48b-5b-1 §3.4).
  // Si le fichier perd un de ces cas, la mutation correspondante redevient
  // inkillable — et ce test tombe avant elle.
  const BRANCHES = [
    ['ordre des lignes',                    ['N3'],        ['N4', 'X3']],
    ['« celle d’avant » ou « les m d’avant »', ['N4'],    ['X3', 'X4']],
    ['annonce du retest à un seul cran',    ['X7'],        ['X8']],
    ['garde au bas ou dans la zone',        ['N3'],        ['P3']],
    ['étend depuis la zone ou depuis le haut', ['N4'],     ['P4', 'F6']],
    ['seuil de l’attente selon le réglage', ['N6'],        ['P5']],
    ['une ou plusieurs séries restées',     ['N5', 'N6'],  ['X9', 'X4']],
    ['tout passe avec ou sans test',        ['F5'],        ['X5']],
    ['preuve par le haut ou par l’effort',  ['F2'],        ['F4b']],
    ['série à fond : RPE ou ressenti, par sa charge', ['X1'], ['X6', 'X10']],
    ['charge connue ou « le cran au-dessus »', ['N2'],     ['X2']]
  ];

  test('le fichier porte les DEUX branches de chaque règle de rédaction', () => {
    const ids = new Set(CAS.map((c) => c.id));
    BRANCHES.forEach(([regle, oui, non]) => {
      oui.concat(non).forEach((id) => {
        expect([regle, id, ids.has(id)]).toEqual([regle, id, true]);
      });
    });
    // Tous les états du §9.13 sont représentés : un état sans cas est un état
    // dont la phrase n'a jamais été jouée.
    const etats = new Set(CAS.map((c) => c.attendu.etat));
    ['progression', 'test_propose', 'garde', 'etend', 'rejoint', 'attend', 'tout_passe',
     'retest_un_cran', 'etirement', 'retest', 'reprise_courte', 'reprise_longue',
     'bord', 'silence'].forEach((e) => expect([e, etats.has(e)]).toEqual([e, true]));
  });

  CAS.forEach((c) => {
    test(`${c.id} — ${c.titre} (${c.reglage})`, () => {
      const rendu = pour(c);
      // Les clés d'abord : c'est l'ABSENCE qui porte le sens.
      // 163 — la clé `approchee` du fondement (une charge jamais faite, « ≈ ») est testée à part.
      const fond = Object.assign({}, rendu.fondement);
      delete fond.approchee;
      // 186 — un saut de plusieurs crans dit combien (crans), de combien le haut est dépassé (depasse), son plafond et le matériel.
      if (fond.preuve) { delete fond.crans; delete fond.depasse; delete fond.plafond; delete fond.materiel; }
      expect(Object.keys(fond).sort()).toEqual(Object.keys(c.fondement).sort());
      expect(fond).toEqual(c.fondement);
      // §20.2 (49-U9) — la référence des dates est `avant`, comme dans l'app.
      expect(M.libellesConsigne(rendu, c.avant)).toEqual(c.phrases);
      expect(M.pourquoiConsigne(rendu, c.reglage, c.avant)).toEqual(c.pourquoi);
    });
  });

  // ── Ce que le fichier ne couvre pas ──────────────────────────────────────

  // 184 (B4) — LE MOT DU MATÉRIEL : « Ta barre / Tes haltères / Ta machine ne permet(tent) pas un plus petit cran ».
  // La condition de la phrase ne change pas (le cas N8 reste un étirement) ; seul le mot suit le matériel de l'exercice.
  describe('184 — le mot du matériel dans la phrase de l’étirement', () => {
    const N8 = CAS.filter((c) => c.id === 'N8')[0];
    const MOTS = [['barre', 'Ta barre ne permet', 'ta barre ne permet'],
                  ['haltere', 'Tes haltères ne permettent', 'tes haltères ne permettent'],
                  ['machine', 'Ta machine ne permet', 'ta machine ne permet'],
                  ['poulie', 'Ta machine ne permet', 'ta machine ne permet'],
                  [undefined, 'Ta machine ne permet', 'ta machine ne permet']];
    MOTS.forEach(([equipement, maj, min]) => {
      test(`${equipement}`, () => {
        const rendu = pour(Object.assign({}, N8, { equipement: 'haltere' }));
        expect(rendu.etat).toBe('etirement');
        const c = JSON.parse(JSON.stringify(rendu));
        c.fondement.equipement = equipement;
        const grise = [M.libellesConsigne(c, N8.avant), M.pourquoiConsigne(c, N8.reglage, N8.avant)]
          .map((x) => JSON.stringify(x)).join(' ');
        expect(grise).toContain(maj);
        expect(grise).not.toMatch(equipement === 'haltere' ? /Ta machine ne permet|Ta barre ne permet/
          : equipement === 'barre' ? /Ta machine ne permet|Tes haltères/ : /Ta barre ne permet|Tes haltères/);
      });
    });
    test('de bout en bout : le matériel de l’exercice arrive dans le fondement', () => {
      expect(pour(Object.assign({}, N8, { equipement: 'haltere' })).fondement.equipement).toBe('haltere');
      ['barre', 'machine'].forEach((e) => {
        const r = pour(Object.assign({}, N8, { equipement: e }));
        if (r.etat === 'etirement') expect(r.fondement.equipement).toBe(e);
      });
    });
  });

  test('DISCRIMINANT — les mois abrégés suivent `Calendrier.MOIS`, un pour un', () => {
    // Seconde liste assumée (l'abréviation ne se dérive pas : « mars » n'a pas
    // de point, « févr. » en a un). Ce qui est interdit, c'est qu'elles
    // DÉRIVENT : même longueur, même ordre, chaque abrégé préfixe son mois.
    const Calendrier = require('../../v2/js/calendrier.js');
    expect(M.MOIS_COURTS).toHaveLength(Calendrier.MOIS.length);
    M.MOIS_COURTS.forEach((court, i) => {
      const entier = Calendrier.MOIS[i];
      expect([i, entier.startsWith(court.replace('.', ''))]).toEqual([i, true]);
    });
    expect(M.MOIS_COURTS[8]).toBe('sept.');
  });

  test('DISCRIMINANT — une charge inconnue se dit « en dessous » à la reprise longue', () => {
    // Le rang 4 du §10.2 : le moteur sait qu'il faut descendre d'un cran, pas
    // de combien. Une machine sans historique au-dessous ne donne rien — et la
    // phrase le dit plutôt que d'inventer. « au-dessus » ici serait un contresens.
    const s = (d, kg, reps) => ({ debut: d, palier: kg,
      series: [1, 2, 3].map(() => ({ charge_kg: kg, reps: reps, rpe: null, role: 'palier' })) });
    const loin = [s('2026-01-05T18:00:00+00:00', 100, 5),
                  s('2026-01-12T18:00:00+00:00', 100, 5),
                  s('2026-01-19T18:00:00+00:00', 100, 5)];
    const r = M.consignePour(loin, '2026-09-20T10:00:00+00:00',
      { reglage: 'normal', equipement: 'machine', correction: null });
    expect(r.etat).toBe('reprise_longue');
    // 163 — INVERSÉ (avant : `charge: null`, « Le cran en dessous × 5 ») : la machine a son pas (5 kg) → 95, « ≈ ».
    expect(r.ligne).toEqual({ charge: 95, vise: 5, approchee: true });
    expect(M.libellesConsigne(r).jaune).toEqual(['\u2248\u00a095\u00a0kg\u00a0×\u00a05']);
  });

  test('DISCRIMINANT — et « Le cran au-dessus » en tête de ligne à la règle de bord', () => {
    const s = (d, kg) => ({ debut: d, palier: kg,
      series: [1, 2, 3].map(() => ({ charge_kg: kg, reps: 2, rpe: null, role: 'palier' })) });
    const maximaux = [s('2026-08-30T18:00:00+00:00', 100), s('2026-09-06T18:00:00+00:00', 100),
                      s('2026-09-13T18:00:00+00:00', 100)];
    const r = M.consignePour(maximaux, '2026-09-20T10:00:00+00:00',
      { reglage: 'normal', equipement: 'machine', correction: null });
    expect(r.etat).toBe('bord');
    // 163 — INVERSÉ (avant : `charge: null`, « Le cran au-dessus × 2 ») : la machine a son pas (5 kg) → 105, « ≈ ».
    expect(r.ligne).toEqual({ charge: 105, vise: 2, approchee: true });
    expect(M.libellesConsigne(r).jaune).toEqual(['\u2248\u00a0105\u00a0kg\u00a0×\u00a02']);
    expect(M.libellesConsigne(r).gris)
      .toBe('Sous 3 reps, pas de rep de plus' + NB + ': le cran au-dessus, aux mêmes reps.');
  });

  test('DISCRIMINANT — les espaces insécables sont bien U+00A0, pas des espaces ordinaires', () => {
    // Un espace ordinaire entre « 127,5 » et « kg » coupe la charge en deux en
    // bout de ligne à 360 px. Le test le voit ; l'œil, sur une maquette, non.
    const n2 = CAS.find((c) => c.id === 'N2');
    const p = M.libellesConsigne(pour(n2), n2.avant);
    expect(p.jaune[0]).toBe('125' + NB + 'kg' + NB + '×' + NB + '5');
    expect(p.jaune[1]).toBe('puis 127,5' + NB + 'kg' + NB + '×' + NB + '3 sur la dernière série');
    expect(p.gris).toContain('Le 13' + NB + 'sept.' + NB + ':');
    expect(p.gris).toContain('125' + NB + 'kg' + NB + '×' + NB + '5, 5, 5');
    // Contre-épreuve : aucune de ces chaînes ne porte l'espace ORDINAIRE au
    // même endroit.
    expect(p.jaune[0]).not.toContain('125 kg');
    expect(p.jaune[0]).not.toContain('kg ×');
    const n7 = CAS.find((c) => c.id === 'N7');
    expect(M.libellesConsigne(pour(n7), n7.avant).gris).toContain('130' + NB + 'kg' + NB + '×' + NB + '2');
  });

  test('sans consigne, la fonction rend des libellés vides plutôt que de casser', () => {
    expect(M.libellesConsigne(null)).toEqual({ jaune: [], gris: '' });
  });
});
