/** @jest-environment node */
//
// v2/js/periode.js — deux périodes qui se comparent, et la géométrie du radar.
//
// CONFIGURATIONS DISCRIMINANTES (CADRAGE-V2 §2 quater), une par sujet :
//
//  · Fenêtres — la date de référence est le 11 SEPTEMBRE, en milieu de mois.
//    Un 1er du mois ne distingue pas « 30 jours glissants » de « le mois
//    calendaire », et c'est exactement l'écart assumé avec la maquette.
//
//  · Radar — les deux périodes ont des volumes de TAILLES DIFFÉRENTES et un
//    classement de zones DIFFÉRENT. À volumes égaux, « échelle commune » et
//    « échelle par période » donnent le même dessin ; à classement identique,
//    « ordre géométrique fixe » et « ordre par taille » aussi.
//
//  · Cartes — les deux zones principales CHANGENT d'une période à l'autre.
//    Sinon « les deux plus grosses de la période courante » et « … de la
//    précédente » sont indiscernables.

// PR 6 de la consolidation — la série de travail et son compte vivent dans
// `modele.js` et `semaine.js`, lus à l'appel par les autres modules.
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
const Periode = require('../../v2/js/periode.js');

const jour = (d) => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
const zone = (cle, series) => ({ zone: cle, libelle: cle, series });
const TABLE = [
  { cle: 'jambes', libelle: 'Jambes' }, { cle: 'dos', libelle: 'Dos' },
  { cle: 'bras', libelle: 'Bras' }, { cle: 'epaules', libelle: 'Épaules' },
  { cle: 'poitrine', libelle: 'Poitrine' }, { cle: 'tronc', libelle: 'Tronc' }
];

// ── 5 ──────────────────────────────────────────────────────────────────────
describe('fenetres — deux fenêtres glissantes, contiguës et de même longueur', () => {
  const ref = new Date(2026, 8, 11);   // vendredi 11 septembre 2026

  test('30 jours : la courante finit aujourd’hui, la précédente finit la veille de son début', () => {
    const f = Periode.fenetres(30, ref);
    expect(jour(f.courante.debut)).toBe('2026-8-13');   // 13 août
    expect(jour(f.courante.fin)).toBe('2026-9-11');
    expect(jour(f.precedente.debut)).toBe('2026-7-14'); // 14 juillet
    expect(jour(f.precedente.fin)).toBe('2026-8-12');
  });

  test('ce ne sont PAS des mois calendaires — 30 jours glissants au 11 septembre commencent le 13 août', () => {
    // Un mois calendaire donnerait « septembre » (11 jours) contre « août »
    // (31 jours) : un radar effondré tous les débuts de mois, sans que rien
    // n'ait changé dans l'entraînement.
    const f = Periode.fenetres(30, ref);
    expect(f.courante.debut.getMonth()).toBe(7);        // août, pas septembre
    expect(f.courante.debut.getDate()).not.toBe(1);
  });

  test('les deux fenêtres couvrent exactement le même nombre de jours, et ne se chevauchent pas', () => {
    // Comptées en jours de CALENDRIER, pas en millisecondes : la fenêtre de
    // 180 jours traverse le passage à l'heure d'été (29 mars 2026) et vaut une
    // heure de moins. C'est le nombre de jours qui doit être identique, pas la
    // durée absolue.
    const joursCouverts = (w) => {
      let n = 0;
      for (let d = new Date(w.debut); d <= w.fin; d.setDate(d.getDate() + 1)) n++;
      return n;
    };
    [30, 90, 7, 1].forEach((n) => {
      const f = Periode.fenetres(n, ref);
      expect(joursCouverts(f.courante)).toBe(n);
      expect(joursCouverts(f.precedente)).toBe(n);
      expect(f.precedente.fin < f.courante.debut).toBe(true);
      // Contiguës : une milliseconde entre les deux, pas un jour de trou.
      expect(f.courante.debut - f.precedente.fin).toBe(1);
    });
  });

  test('les bornes sont locales, minuit à 23:59:59.999 — un entraînement du soir reste dans son jour', () => {
    const f = Periode.fenetres(30, ref);
    expect(f.courante.fin.getHours()).toBe(23);
    expect(f.courante.debut.getHours()).toBe(0);
    expect(Periode.dans(new Date(2026, 8, 11, 23, 30), f.courante)).toBe(true);
    expect(Periode.dans(new Date(2026, 7, 12, 23, 30), f.courante)).toBe(false);
    expect(Periode.dans(new Date(2026, 7, 12, 23, 30), f.precedente)).toBe(true);
  });

  test('un changement de mois se traverse sans trou : 90 jours au 11 septembre remontent au 14 juin', () => {
    const f = Periode.fenetres(90, ref);
    expect(jour(f.courante.debut)).toBe('2026-6-14');
    expect(jour(f.precedente.debut)).toBe('2026-3-16');
  });
});

describe('decouper — les séries suivent LEUR SÉANCE', () => {
  const ref = new Date(2026, 8, 11);
  const f = Periode.fenetres(30, ref);
  const seances = [
    { id: 'a', debut: '2026-09-01T18:00:00Z' },   // dans la courante
    { id: 'b', debut: '2026-07-20T18:00:00Z' },   // dans la précédente
    { id: 'c', debut: '2026-01-05T18:00:00Z' }    // hors des deux
  ];
  const series = [
    { id: 1, session_id: 'a' }, { id: 2, session_id: 'a' },
    { id: 3, session_id: 'b' }, { id: 4, session_id: 'c' }
  ];

  test('une série est retenue par la DATE DE SA SÉANCE, jamais par sa propre created_at', () => {
    // `sets.created_at` est la date de l'IMPORT, la même pour des milliers de
    // lignes : s'en servir mettrait tout l'historique dans la même fenêtre.
    const c = Periode.decouper(seances, series, f.courante);
    expect(c.seances.map((s) => s.id)).toEqual(['a']);
    expect(c.series.map((s) => s.id)).toEqual([1, 2]);
    const p = Periode.decouper(seances, series, f.precedente);
    expect(p.series.map((s) => s.id)).toEqual([3]);
  });

  test('une série orpheline n’entre dans aucune fenêtre', () => {
    const orpheline = series.concat([{ id: 9, session_id: 'inconnue' }]);
    expect(Periode.decouper(seances, orpheline, f.courante).series.map((s) => s.id))
      .toEqual([1, 2]);
  });
});

// ── 6 ──────────────────────────────────────────────────────────────────────
describe('comparerZones — six zones, ordre géométrique fixe, échelle commune', () => {
  // Août contre juillet, les chiffres de la maquette. Les tailles DIFFÈRENT
  // (juillet est plus gros) et le classement aussi : en juillet Jambes > Bras
  // > Dos, en août Jambes > Bras > Dos également, mais Poitrine passe devant
  // Tronc dans les deux — on force donc un écart de classement ci-dessous.
  const courante = [zone('jambes', 142.5), zone('bras', 127.5), zone('dos', 123.5),
                    zone('epaules', 77), zone('poitrine', 51.5), zone('tronc', 7.5)];
  const precedente = [zone('jambes', 192), zone('bras', 179), zone('dos', 160.5),
                      zone('epaules', 108), zone('poitrine', 55), zone('tronc', 18)];

  test('les six zones sortent dans l’ordre de l’HEXAGONE, pas dans celui de la table ni par taille', () => {
    const c = Periode.comparerZones(courante, precedente, TABLE);
    expect(c.zones.map((z) => z.cle))
      .toEqual(['jambes', 'poitrine', 'epaules', 'tronc', 'bras', 'dos']);
    // L'ordre par taille serait jambes, bras, dos, epaules, poitrine, tronc.
    expect(c.zones.map((z) => z.cle)).not.toEqual(courante.map((z) => z.zone));
  });

  test('l’ordre ne bouge pas quand les volumes bougent — sinon deux polygones superposés ne veulent rien dire', () => {
    const inverse = Periode.comparerZones(precedente, courante, TABLE);
    expect(inverse.zones.map((z) => z.cle))
      .toEqual(['jambes', 'poitrine', 'epaules', 'tronc', 'bras', 'dos']);
  });

  test('une zone absente d’une période vaut ZÉRO, elle ne manque pas', () => {
    const c = Periode.comparerZones([zone('jambes', 40)], precedente, TABLE);
    expect(c.zones).toHaveLength(6);
    expect(c.zones.find((z) => z.cle === 'tronc').courante).toBe(0);
    expect(c.zones.find((z) => z.cle === 'tronc').precedente).toBe(18);
  });

  test('une zone absente des DEUX périodes reste un sommet, à zéro', () => {
    // Configuration discriminante : avec une zone absente d'UNE SEULE période,
    // « valoir zéro » et « ne garder que les zones vues quelque part » donnent
    // le même hexagone. Il faut une zone que personne n'a travaillée — celle
    // de quelqu'un qui ne fait jamais d'abdominaux — pour que l'omission
    // fabrique un pentagone au lieu d'un hexagone creusé.
    const sansTronc = (l) => l.filter((z) => z.zone !== 'tronc');
    const c = Periode.comparerZones(sansTronc(courante), sansTronc(precedente), TABLE);
    expect(c.zones).toHaveLength(6);
    expect(c.zones.map((z) => z.cle))
      .toEqual(['jambes', 'poitrine', 'epaules', 'tronc', 'bras', 'dos']);
    const tronc = c.zones.find((z) => z.cle === 'tronc');
    expect(tronc.courante).toBe(0);
    expect(tronc.precedente).toBe(0);
    // Et le polygone garde bien SIX sommets : un hexagone, pas un pentagone.
    expect(Periode.polygone(c.zones.map((z) => z.courante), c.max, 92)).toHaveLength(6);
  });

  test('le maximum est celui des DEUX périodes : l’échelle est commune', () => {
    const c = Periode.comparerZones(courante, precedente, TABLE);
    expect(c.max).toBe(192);          // le maximum est en juillet, pas en août
    expect(c.vide).toBe(false);
  });

  test('à l’échelle commune, la période plus petite dessine un polygone PLUS PETIT', () => {
    const c = Periode.comparerZones(courante, precedente, TABLE);
    const R = 92;
    const pc = Periode.polygone(c.zones.map((z) => z.courante), c.max, R);
    const pp = Periode.polygone(c.zones.map((z) => z.precedente), c.max, R);
    // Sommet 0 = Jambes : 142,5 contre 192, sur la même échelle.
    expect(Math.abs(pc[0].y)).toBeCloseTo((142.5 / 192) * R, 1);
    expect(Math.abs(pp[0].y)).toBeCloseTo(R, 1);
    // Normalisé par période, le sommet courant toucherait le bord comme l'autre.
    expect(Math.abs(pc[0].y)).toBeLessThan(R - 1);
  });

  test('deux périodes vides -> `vide`, et aucune division par zéro', () => {
    const c = Periode.comparerZones([], [], TABLE);
    expect(c.vide).toBe(true);
    expect(c.max).toBe(0);
    Periode.polygone(c.zones.map((z) => z.courante), c.max, 92)
      .forEach((p) => { expect(isFinite(p.x)).toBe(true); expect(isFinite(p.y)).toBe(true); });
  });

  test('`hors-zone` n’entre pas dans l’hexagone — six sommets, pas sept', () => {
    const c = Periode.comparerZones(
      courante.concat([{ zone: 'hors-zone', libelle: 'Hors zone', series: 12 }]),
      precedente, TABLE);
    expect(c.zones).toHaveLength(6);
    expect(c.zones.map((z) => z.cle)).not.toContain('hors-zone');
  });
});

describe('hexagone — la géométrie', () => {
  test('six sommets réguliers, le premier EN HAUT, dans le sens des aiguilles', () => {
    const h = Periode.hexagone(92);
    expect(h).toHaveLength(6);
    expect(h[0]).toEqual({ x: 0, y: -92 });        // haut
    expect(h[1].x).toBeGreaterThan(0);             // puis vers la droite
    expect(h[3]).toEqual({ x: 0, y: 92 });         // bas
    expect(h[4].x).toBeLessThan(0);
    h.forEach((p) => expect(Math.hypot(p.x, p.y)).toBeCloseTo(92, 1));
  });

  test('une valeur nulle ou négative retombe au CENTRE, pas hors du cadre', () => {
    const p = Periode.polygone([0, -5, null, undefined, NaN, 10], 10, 92);
    [0, 1, 2, 3, 4].forEach((k) => expect(Math.hypot(p[k].x, p[k].y)).toBeCloseTo(0, 5));
    expect(Math.hypot(p[5].x, p[5].y)).toBeCloseTo(92, 1);
  });
});

// ── 7 ──────────────────────────────────────────────────────────────────────
describe('cartes — séances, séries, et les deux zones principales de la période COURANTE', () => {
  // Classement RENVERSÉ entre les deux périodes : en courante Dos domine, en
  // précédente Jambes. Sans ce renversement, « principales de la courante » et
  // « principales de la précédente » rendraient la même paire.
  const courante = [zone('dos', 90), zone('bras', 70), zone('jambes', 10),
                    zone('epaules', 5), zone('poitrine', 4), zone('tronc', 1)];
  const precedente = [zone('jambes', 200), zone('epaules', 150), zone('dos', 12),
                      zone('bras', 8), zone('poitrine', 3), zone('tronc', 2)];
  const c = Periode.comparerZones(courante, precedente, TABLE);
  const cartes = Periode.cartes(c,
    { nbSeances: 14, nbSeriesTravail: 265 },
    { nbSeances: 19, nbSeriesTravail: 357 });

  test('quatre cartes : deux comptes, puis deux zones', () => {
    expect(cartes).toHaveLength(4);
    expect(cartes.map((k) => k.cle)).toEqual(['seances', 'series', 'dos', 'bras']);
  });

  test('les zones retenues sont les plus grosses de la période COURANTE, pas de la précédente', () => {
    // Les deux plus grosses de la précédente seraient Jambes et Épaules.
    expect(cartes.slice(2).map((k) => k.cle)).not.toContain('jambes');
    expect(cartes.slice(2).map((k) => k.cle)).not.toContain('epaules');
  });

  test('chaque carte porte les DEUX valeurs, sans écart ni pourcentage calculé', () => {
    expect(cartes[0]).toEqual({ cle: 'seances', libelle: 'Séances', courante: 14, precedente: 19 });
    expect(cartes[1].courante).toBe(265);
    expect(cartes[1].precedente).toBe(357);
    expect(cartes[2]).toEqual({ cle: 'dos', libelle: 'Dos', courante: 90, precedente: 12 });
    // Aucune clé de variation : pas de flèche, pas de pourcentage, pas de sens.
    cartes.forEach((k) => {
      expect(Object.keys(k).sort()).toEqual(['cle', 'courante', 'libelle', 'precedente']);
    });
  });

  test('un bilan manquant vaut zéro, il ne fait pas tomber la carte', () => {
    const k = Periode.cartes(c, null, null);
    expect(k[0].courante).toBe(0);
    expect(k[1].precedente).toBe(0);
  });
});

describe('PERIODES du radar — 30 jours et 3 mois, glissants', () => {
  test('deux choix, 30 jours par défaut', () => {
    expect(Periode.PERIODES.map((p) => p.cle)).toEqual(['30j', '3mois']);
    expect(Periode.PERIODES.map((p) => p.jours)).toEqual([30, 90]);
    expect(Periode.PERIODE_DEFAUT).toBe('30j');
    expect(Periode.periodeDe('inconnue').cle).toBe('30j');
  });

  test('les libellés disent GLISSANT, pas un nom de mois', () => {
    // « Août » / « Juillet » laisserait croire à des mois calendaires.
    Periode.PERIODES.forEach((p) => {
      expect(p.courante).toMatch(/derniers jours/);
      expect(p.precedente).toMatch(/précédents/);
      // Les cartes n'emploient pas « sur » : « 123 sur 30 jours » se lirait
      // comme une fraction.
      expect(p.avant).toMatch(/^les \d+ jours d/);
      expect(p.avant).not.toMatch(/sur/);
    });
  });
});

// ── §5.5 — la somme des six zones vaut la somme des dix-huit muscles ───────
//
// Sur les DEUX périodes. C'est l'invariant du §7 bis.10 : on regroupe, on ne
// tronque pas. Il est déjà vérifié sur `volumeParZone` ; ce qui est neuf ici,
// c'est que le RADAR le préserve — il rend six sommets fixes, pas les zones
// que `volumeParZone` a bien voulu produire, et une zone escamotée par ce
// passage-là se cacherait dans une somme qu'on croirait exacte.
describe('le radar ne perd pas de volume — somme des zones = somme des muscles', () => {
  const Semaine = require('../../v2/js/semaine.js');

  const EXOS = [
    { slug: 'squat', nom: 'Squat', muscles_primaires: ['quadriceps', 'fessiers'],
      muscles_secondaires: ['ischio_jambiers', 'bas_du_dos'] },
    { slug: 'couche', nom: 'Couché', muscles_primaires: ['pectoraux'],
      muscles_secondaires: ['triceps', 'deltoide_anterieur'] },
    { slug: 'rowing', nom: 'Rowing', muscles_primaires: ['grand_dorsal', 'haut_du_dos'],
      muscles_secondaires: ['biceps'] },
    { slug: 'gainage', nom: 'Gainage', muscles_primaires: ['abdominaux'], muscles_secondaires: [] },
    { slug: 'mollets', nom: 'Mollets', muscles_primaires: ['mollets'], muscles_secondaires: [] }
  ];
  const serie = (id, session, slug) => ({ id, session_id: session, exercise_slug: slug, type_serie: 'travail' });

  const ref = new Date(2026, 8, 11);
  const f = Periode.fenetres(30, ref);
  const seances = [
    { id: 'c1', debut: '2026-09-02T18:00:00' }, { id: 'c2', debut: '2026-08-20T18:00:00' },
    { id: 'p1', debut: '2026-07-25T18:00:00' }, { id: 'p2', debut: '2026-08-05T18:00:00' }
  ];
  const series = [];
  ['squat', 'squat', 'couche', 'rowing', 'gainage'].forEach((x, i) => series.push(serie('a' + i, 'c1', x)));
  ['mollets', 'rowing', 'couche'].forEach((x, i) => series.push(serie('b' + i, 'c2', x)));
  ['squat', 'couche', 'couche', 'gainage'].forEach((x, i) => series.push(serie('d' + i, 'p1', x)));
  ['rowing', 'mollets'].forEach((x, i) => series.push(serie('e' + i, 'p2', x)));

  const somme = (l, champ) => Math.round(l.reduce((t, z) => t + z[champ], 0) * 10) / 10;

  test('sur la période COURANTE, les six sommets totalisent le volume des muscles', () => {
    const d = Periode.decouper(seances, series, f.courante);
    const muscles = Semaine.volumeParMuscle(d.series, EXOS);
    const c = Periode.comparerZones(
      Semaine.volumeParZone(d.series, EXOS), [], Semaine.ZONES);
    expect(c.zones).toHaveLength(6);
    expect(somme(c.zones, 'courante')).toBe(somme(muscles, 'series'));
    expect(somme(muscles, 'series')).toBeGreaterThan(0);   // la fixture mord vraiment
  });

  test('sur la période PRÉCÉDENTE aussi, et les deux totaux diffèrent', () => {
    const dc = Periode.decouper(seances, series, f.courante);
    const dp = Periode.decouper(seances, series, f.precedente);
    const c = Periode.comparerZones(
      Semaine.volumeParZone(dc.series, EXOS),
      Semaine.volumeParZone(dp.series, EXOS), Semaine.ZONES);
    expect(somme(c.zones, 'precedente'))
      .toBe(somme(Semaine.volumeParMuscle(dp.series, EXOS), 'series'));
    // Deux périodes de tailles différentes : sans ça, « échelle commune » et
    // « échelle par période » resteraient indiscernables.
    expect(somme(c.zones, 'courante')).not.toBe(somme(c.zones, 'precedente'));
  });

  test('les libellés des six sommets viennent de THSemaine.ZONES, pas d’une copie', () => {
    const c = Periode.comparerZones([], [], Semaine.ZONES);
    const attendus = {};
    Semaine.ZONES.forEach((z) => { attendus[z.cle] = z.libelle; });
    c.zones.forEach((z) => expect(z.libelle).toBe(attendus[z.cle]));
    expect(c.zones.map((z) => z.libelle))
      .toEqual(['Jambes', 'Poitrine', 'Épaules', 'Tronc', 'Bras', 'Dos']);
  });
});

// ── §5.6 — période précédente vide ─────────────────────────────────────────
describe('une période précédente vide laisse la courante seule, sans erreur', () => {
  const courante = [zone('jambes', 45), zone('dos', 29.5), zone('bras', 24),
                    zone('poitrine', 16), zone('epaules', 15), zone('tronc', 1.5)];

  test('les six sommets restent, la précédente est à zéro partout', () => {
    const c = Periode.comparerZones(courante, [], TABLE);
    expect(c.vide).toBe(false);
    expect(c.zones).toHaveLength(6);
    expect(c.zones.every((z) => z.precedente === 0)).toBe(true);
    expect(c.zones.find((z) => z.cle === 'jambes').courante).toBe(45);
  });

  test('l’échelle est celle de la courante seule — elle touche le bord', () => {
    const c = Periode.comparerZones(courante, [], TABLE);
    expect(c.max).toBe(45);
    const pc = Periode.polygone(c.zones.map((z) => z.courante), c.max, 92);
    expect(Math.abs(pc[0].y)).toBeCloseTo(92, 1);   // Jambes au bord
  });

  test('le polygone de la période vide s’effondre AU CENTRE, il ne disparaît pas', () => {
    // Six points à l'origine : un polygone dégénéré mais valide. Rendre une
    // liste vide donnerait un attribut `points` vide, et SVG ne dessinerait
    // rien — le radar perdrait sa légende sans que rien ne l'explique.
    const c = Periode.comparerZones(courante, [], TABLE);
    const pp = Periode.polygone(c.zones.map((z) => z.precedente), c.max, 92);
    expect(pp).toHaveLength(6);
    pp.forEach((p) => { expect(p.x).toBe(0); expect(p.y).toBe(0); });
  });

  test('les cartes tiennent : deux zones de la courante, précédente à zéro', () => {
    const c = Periode.comparerZones(courante, [], TABLE);
    const k = Periode.cartes(c, { nbSeances: 5, nbSeriesTravail: 60 },
                                { nbSeances: 0, nbSeriesTravail: 0 });
    expect(k.map((x) => x.cle)).toEqual(['seances', 'series', 'jambes', 'dos']);
    expect(k[2].precedente).toBe(0);
    expect(k[0].precedente).toBe(0);
  });
});
