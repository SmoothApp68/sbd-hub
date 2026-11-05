/** @jest-environment node */
//
// v2/js/poids.js — le poids de corps.
//
// CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) — test 4 : des pesées
// IRRÉGULIÈREMENT ESPACÉES, avec au moins un long trou. Sur des pesées
// régulières, « espacer selon la date » et « espacer uniformément » donnent
// exactement les mêmes abscisses, et le banc ne prouve rien. C'est la forme
// des vraies données : 93 des 114 pesées tombent en 2024, sept en 2025, quatre
// en 2026, écart maximal 233 jours.

// PR 7 de la consolidation — les nombres, les dates et les mois s'écrivent
// dans le formateur unique, `modele.js`, lu à l'appel.
require('../../v2/js/modele.js');
const Poids = require('../../v2/js/poids.js');

const pesee = (date, poids, source) => ({ id: date, date, poids_kg: poids, source: source || 'import_hevy' });
const jour = (d) => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();

// ── 1 ──────────────────────────────────────────────────────────────────────
describe('resume — la dernière pesée, sa date, le compte', () => {
  test('la dernière pesée est la plus RÉCENTE, quel que soit l’ordre des lignes', () => {
    // Les lignes arrivent dans l'ordre de la clé primaire, pas de la date.
    const r = Poids.resume([
      pesee('2026-03-18', 97.4), pesee('2026-08-30', 95.5),
      pesee('2026-02-19', 95.0), pesee('2026-03-14', 98.55)
    ]);
    expect(r.poids).toBe(95.5);
    expect(jour(r.date)).toBe('2026-8-30');
    expect(r.nb).toBe(4);
  });

  test('une date « AAAA-MM-JJ » se lit en LOCAL, pas en UTC', () => {
    // new Date('2026-08-30') vaut minuit UTC : sous un fuseau négatif, le
    // getDate() retomberait sur le 29.
    const r = Poids.resume([pesee('2026-08-30', 95.5)]);
    expect(r.date.getFullYear()).toBe(2026);
    expect(r.date.getMonth()).toBe(7);
    expect(r.date.getDate()).toBe(30);
  });

  test('aucune pesée -> null ; une seule -> pas de variation', () => {
    expect(Poids.resume([])).toBeNull();
    expect(Poids.resume(null)).toBeNull();
    expect(Poids.resume([pesee('2026-08-30', 95.5)]).variation).toBeNull();
  });

  test('une ligne sans date lisible ou sans poids fini est écartée', () => {
    const r = Poids.resume([
      pesee('2026-08-30', 95.5), pesee('pas-une-date', 90),
      pesee('2026-02-30', 90), pesee('2026-01-01', null), pesee('2026-01-02', 'abc')
    ]);
    expect(r.nb).toBe(1);
    expect(r.poids).toBe(95.5);
  });
});

// ── 2 ──────────────────────────────────────────────────────────────────────
describe('resume — la variation est DATÉE et porte sur la pesée précédente', () => {
  test('l’écart se mesure avec l’avant-dernière pesée, et donne sa date', () => {
    const r = Poids.resume([
      pesee('2026-02-19', 95.0), pesee('2026-03-14', 98.55),
      pesee('2026-03-18', 97.4), pesee('2026-08-30', 95.5)
    ]);
    // 95,5 − 97,4 = −1,9, depuis le 18 mars. Pas « sur 3 mois » : il n'y a
    // qu'une seule pesée dans les 90 derniers jours des vraies données.
    expect(r.variation.valeur).toBe(-1.9);
    expect(jour(r.variation.depuis)).toBe('2026-3-18');
  });

  test('une prise de poids est un écart POSITIF, sans autre qualification', () => {
    const r = Poids.resume([pesee('2026-03-14', 95.0), pesee('2026-03-18', 97.4)]);
    expect(r.variation.valeur).toBe(2.4);
  });

  test('l’écart est arrondi au dixième, comme le poids', () => {
    const r = Poids.resume([pesee('2026-03-14', 98.55), pesee('2026-03-18', 97.4)]);
    expect(r.variation.valeur).toBe(-1.2);   // -1.1499999… en flottant
    expect(r.poids).toBe(97.4);
  });
});

// ── 3 ──────────────────────────────────────────────────────────────────────
describe('filtrer — la fenêtre est ancrée sur AUJOURD’HUI', () => {
  const aujourdhui = new Date(2026, 8, 11);      // 11 septembre 2026
  const corpus = [
    pesee('2023-01-25', 82.0), pesee('2025-02-10', 85.4), pesee('2025-07-01', 88.6),
    pesee('2026-02-19', 95.0), pesee('2026-03-18', 97.4), pesee('2026-08-30', 95.5)
  ];

  test('« 3 mois » ne garde que les 90 derniers jours', () => {
    const f = Poids.filtrer(corpus, 90, aujourdhui);
    expect(f.map((p) => jour(p.date))).toEqual(['2026-8-30']);
  });

  test('« 1 an » en garde davantage, « Tout » les garde toutes', () => {
    expect(Poids.filtrer(corpus, 365, aujourdhui)).toHaveLength(3);
    expect(Poids.filtrer(corpus, null, aujourdhui)).toHaveLength(6);
  });

  test('la fenêtre ne suit PAS la dernière pesée : une pesée vieille de 12 jours reste dedans, pas au-delà', () => {
    // Ancrée sur la dernière pesée (30 août), « 3 mois » remonterait au 1er juin
    // et ramasserait une pesée de juin. Ancrée sur aujourd'hui (11 sept.), non.
    const avecJuin = corpus.concat([pesee('2026-06-05', 96.0)]);
    expect(Poids.filtrer(avecJuin, 90, aujourdhui).map((p) => jour(p.date)))
      .toEqual(['2026-8-30']);
  });

  test('la sortie de filtrer est triée du plus ancien au plus récent', () => {
    const f = Poids.filtrer(corpus, null, aujourdhui);
    for (let i = 1; i < f.length; i++) expect(f[i].date >= f[i - 1].date).toBe(true);
  });
});

// ── 4 ── LA CONFIGURATION DISCRIMINANTE ────────────────────────────────────
describe('courbe — les points sont espacés par la DATE, jamais par leur rang', () => {
  // Trois pesées en trois jours, puis un trou de six mois. Espacées
  // uniformément, les quatre points seraient à 0 / 1/3 / 2/3 / 1 de la largeur.
  // Espacées par la date, les trois premiers sont COLLÉS à gauche.
  const irregulier = [
    pesee('2026-01-01', 90), pesee('2026-01-02', 91),
    pesee('2026-01-03', 92), pesee('2026-07-02', 95)
  ];
  const L = 300, H = 104, M = Poids.MARGE;
  const utile = L - 2 * M;

  test('trois pesées en trois jours suivies d’un trou de six mois restent collées à gauche', () => {
    const c = Poids.courbe(Poids.filtrer(irregulier, null), L, H);
    const x = c.points.map((p) => p.x);

    expect(x[0]).toBeCloseTo(M, 1);
    expect(x[3]).toBeCloseTo(L - M, 1);
    // 1 jour sur 182 : moins d'un centième de la largeur utile.
    expect(x[1] - x[0]).toBeLessThan(utile * 0.01);
    expect(x[2] - x[0]).toBeLessThan(utile * 0.02);
    // Et surtout : très loin du tiers qu'un espacement uniforme donnerait.
    expect(x[1] - x[0]).toBeLessThan((utile / 3) * 0.1);
  });

  test('l’écart entre deux points est PROPORTIONNEL à l’écart de dates', () => {
    // 1 jour, puis 1 jour, puis 180 jours : le dernier segment vaut 180 fois
    // le premier. Un espacement uniforme donnerait trois segments égaux.
    const c = Poids.courbe(Poids.filtrer(irregulier, null), L, H);
    const seg = [c.points[1].x - c.points[0].x, c.points[2].x - c.points[1].x,
                 c.points[3].x - c.points[2].x];
    expect(seg[1] / seg[0]).toBeCloseTo(1, 1);
    expect(seg[2] / seg[0]).toBeCloseTo(180, 0);
  });

  test('sur des pesées RÉGULIÈRES les deux règles coïncident — d’où la configuration ci-dessus', () => {
    const regulier = [pesee('2026-01-01', 90), pesee('2026-01-08', 91),
                      pesee('2026-01-15', 92), pesee('2026-01-22', 93)];
    const c = Poids.courbe(Poids.filtrer(regulier, null), L, H);
    c.points.forEach((p, i) => expect(p.x).toBeCloseTo(M + (i / 3) * utile, 1));
  });

  test('l’ordonnée suit le poids, échelle de la fenêtre, minimum EN BAS', () => {
    const c = Poids.courbe(Poids.filtrer(irregulier, null), L, H);
    expect(c.min).toBe(90);
    expect(c.max).toBe(95);
    expect(c.points[0].y).toBeCloseTo(H - M, 1);      // 90 kg : le plus bas
    expect(c.points[3].y).toBeCloseTo(M, 1);          // 95 kg : le plus haut
  });

  test('cas dégénérés : zéro point, un seul point, un poids constant', () => {
    expect(Poids.courbe([], L, H).points).toEqual([]);
    const un = Poids.courbe(Poids.filtrer([pesee('2026-08-30', 95.5)], null), L, H);
    expect(un.points).toHaveLength(1);
    expect(un.points[0].x).toBeCloseTo(L / 2, 1);
    const plat = Poids.courbe(Poids.filtrer(
      [pesee('2026-01-01', 95), pesee('2026-06-01', 95)], null), L, H);
    plat.points.forEach((p) => expect(p.y).toBeCloseTo(H / 2, 1));
  });
});

// ── 5 ──────────────────────────────────────────────────────────────────────
describe('dernieres — la liste, plus récente d’abord, avec son écart', () => {
  const corpus = Poids.filtrer([
    pesee('2026-02-19', 95.0), pesee('2026-03-14', 98.55),
    pesee('2026-03-18', 97.4), pesee('2026-08-30', 95.5)
  ], null);

  test('l’ordre est inverse de la courbe, et l’écart porte sur la pesée qui PRÉCÈDE dans le temps', () => {
    const l = Poids.dernieres(corpus, 3);
    expect(l.map((p) => jour(p.date))).toEqual(['2026-8-30', '2026-3-18', '2026-3-14']);
    expect(l[0].ecart).toBe(-1.9);   // 95,5 − 97,4
    expect(l[1].ecart).toBe(-1.2);   // 97,4 − 98,55
    expect(l[2].ecart).toBe(3.6);    // 98,55 − 95,0
  });

  test('la plus ancienne pesée du corpus n’a pas d’écart — il n’y a rien avant', () => {
    const l = Poids.dernieres(corpus, 99);
    expect(l).toHaveLength(4);
    expect(l[3].ecart).toBeNull();
  });
});

// ── 6 ──────────────────────────────────────────────────────────────────────
describe('PERIODES — trois choix, « Tout » par défaut', () => {
  test('les trois périodes de la spec, dans l’ordre, avec leurs durées', () => {
    expect(Poids.PERIODES.map((p) => p.cle)).toEqual(['3mois', '1an', 'tout']);
    expect(Poids.PERIODES.map((p) => p.libelle)).toEqual(['3 mois', '1 an', 'Tout']);
    expect(Poids.PERIODES.map((p) => p.jours)).toEqual([90, 365, null]);
  });

  test('« Tout » est le défaut : c’est la seule qui montre quelque chose sur un suivi irrégulier', () => {
    expect(Poids.PERIODE_DEFAUT).toBe('tout');
    expect(Poids.periodeDe(Poids.PERIODE_DEFAUT).jours).toBeNull();
    expect(Poids.periodeDe('inconnue').cle).toBe('tout');
  });
});

// ── 246 · P2 — LE SEUL « POIDS À UNE DATE » ───────────────────────────────
describe('poidsALaDate — la dernière pesée ≤ le jour, d’au plus N jours, jamais interpolée', () => {
  const L = [pesee('2026-06-01', 90), pesee('2026-06-10', 88)];
  test('une pesée postérieure au jour n’est jamais rendue', () => {
    expect(Poids.poidsALaDate(L, '2026-06-05').poids).toBe(90);
    expect(Poids.poidsALaDate([pesee('2026-06-10', 88)], '2026-06-05')).toBeNull();
  });
  test('13 jours oui, 14 jours non (défaut)', () => {
    expect(Poids.poidsALaDate([pesee('2026-06-01', 90)], '2026-06-14').poids).toBe(90);
    expect(Poids.poidsALaDate([pesee('2026-06-01', 90)], '2026-06-15')).toBeNull();
  });
  test('89 jours oui, 90 jours non (jours: 90)', () => {
    expect(Poids.poidsALaDate([pesee('2026-01-01', 90)], '2026-03-31', { jours: 90 }).poids).toBe(90);
    expect(Poids.poidsALaDate([pesee('2026-01-01', 90)], '2026-04-01', { jours: 90 })).toBeNull();
  });
  test('aucune pesée : null', () => {
    expect(Poids.poidsALaDate([], '2026-06-01')).toBeNull();
    expect(Poids.poidsALaDate(null, '2026-06-01')).toBeNull();
  });
  test('un jour sans pesée ce jour-là prend la pesée d’AVANT (le trou corrigé), même si une plus récente existe', () => {
    const r = Poids.poidsALaDate(L, '2026-06-09');
    expect(r.poids).toBe(90);
    expect(jour(r.date)).toBe('2026-6-1');
    expect(Poids.rapportAuPoids(180, L, '2026-06-09').rapport).toBe(2);
  });
});

// ── 246 · P1 / P4 — LA TENDANCE ────────────────────────────────────────────
describe('tendance — des semaines lundi-dimanche, chacune à ≥ 2 pesées, 4 à 12', () => {
  // AUJ = jeudi 12/11/2026 ; la semaine en cours = lundi 9/11. Lundis : 9/11, 2/11, 26/10, 19/10, 12/10, 5/10, 28/9…
  const AUJ = new Date(2026, 10, 12, 10, 0, 0);
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  // `semaine(k, n)` : n pesées dans la semaine d'il y a k semaines (lundi et jeudi…), poids donné par `f`.
  const lundi = (k) => new Date(2026, 10, 9 - 7 * k);
  const semaine = (k, n, f) => {
    const out = [];
    for (let i = 0; i < n; i++) { const d = new Date(lundi(k).getFullYear(), lundi(k).getMonth(), lundi(k).getDate() + i * 3); out.push(pesee(iso(d), f(d))); }
    return out;
  };
  const nj = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5;   // jours civils (le passage à l'heure d'hiver ne compte pas)
  const lin = (pente) => { const j0 = nj(new Date(2026, 8, 1)); return (d) => 90 + pente * (nj(d) - j0) / 7; };
  const serie = (ks, n, f) => ks.reduce((a, k) => a.concat(semaine(k, n, f)), []);

  test('P1 — 4 semaines × 2 pesées : oui', () => {
    expect(Poids.tendanceDuPoids(serie([1, 2, 3, 4], 2, lin(-0.5)), AUJ).semaines).toBe(4);
  });
  test('P1 — 3 semaines × 2, puis une à 1 : null', () => {
    expect(Poids.tendanceDuPoids(serie([1, 2, 3], 2, lin(-0.5)).concat(semaine(4, 1, lin(-0.5))), AUJ)).toBeNull();
  });
  test('P1 — 7 pesées sur 4 semaines dont une semaine à 1 : null', () => {
    expect(Poids.tendanceDuPoids(serie([1, 2, 4], 2, lin(-0.5)).concat(semaine(3, 1, lin(-0.5))), AUJ)).toBeNull();
  });
  test('P1 — la semaine en cours à 1 pesée est ignorée ; à 2 pesées elle compte', () => {
    const base = serie([1, 2, 3, 4], 2, lin(-0.5));
    expect(Poids.tendanceDuPoids(base.concat(semaine(0, 1, lin(-0.5))), AUJ).semaines).toBe(4);
    expect(Poids.tendanceDuPoids(base.concat(semaine(0, 2, lin(-0.5))), new Date(2026, 10, 15, 22, 0)).semaines).toBe(5);
  });
  test('P1 — plafond de 12 semaines', () => {
    const ks = []; for (let k = 1; k <= 20; k++) ks.push(k);
    const t = Poids.tendanceDuPoids(serie(ks, 2, lin(-0.5)), AUJ);
    expect(t.semaines).toBe(12);
    expect(t.pesees).toBe(24);
  });
  test('moins de 4 semaines, aucune pesée : null', () => {
    expect(Poids.tendanceDuPoids(serie([1, 2, 3], 2, lin(0)), AUJ)).toBeNull();
    expect(Poids.tendanceDuPoids([], AUJ)).toBeNull();
  });
  test('pente exacte sur une série linéaire connue : −0,5 kg/7 j → « −0,5 kg par semaine… »', () => {
    const t = Poids.tendanceDuPoids(serie([1, 2, 3, 4, 5, 6], 2, lin(-0.5)), AUJ);
    expect(t.kgParSemaine).toBeCloseTo(-0.5, 6);
    expect(t.erreur).toBeCloseTo(0, 6);
    expect(Poids.phraseDeTendance(t)).toBe('−0,5 kg par semaine en moyenne, sur les 6 dernières semaines.');
    expect(Poids.noteDeTendance(t)).toBe('Calculée sur tes 12 pesées de ces 6 semaines.');
  });
  test('une montée : signe « + »', () => {
    expect(Poids.phraseDeTendance(Poids.tendanceDuPoids(serie([1, 2, 3, 4, 5], 2, lin(0.3)), AUJ)))
      .toBe('+0,3 kg par semaine en moyenne, sur les 5 dernières semaines.');
  });
  test('série très bruitée (±1,5 kg alterné, 8 pesées, pente vraie −0,2) : « Pas de sens net »', () => {
    let i = 0;
    const f = (d) => lin(-0.2)(d) + (i++ % 2 ? 1.5 : -1.5);
    const t = Poids.tendanceDuPoids(serie([1, 2, 3, 4], 2, f), AUJ);
    expect(t.pesees).toBe(8);
    expect(Poids.phraseDeTendance(t)).toBe('Pas de sens net sur les 4 dernières semaines.');
  });
  test('série plate peu bruitée : « Stable »', () => {
    let i = 0;
    const f = () => 90 + (i++ % 2 ? 0.05 : -0.05);
    expect(Poids.phraseDeTendance(Poids.tendanceDuPoids(serie([1, 2, 3, 4], 2, f), AUJ))).toBe('Stable sur les 4 dernières semaines.');
  });
  test('P4 — aucune des phrases ne juge ni n’invite', () => {
    const MOTS = /\b(bien|bravo|trop|objectif|idéal|pèse-toi|pense à|continue|attention)\b/i;
    let i = 0;
    const phrases = [
      Poids.phraseDeTendance(Poids.tendanceDuPoids(serie([1, 2, 3, 4], 2, lin(-0.5)), AUJ)),
      Poids.phraseDeTendance(Poids.tendanceDuPoids(serie([1, 2, 3, 4], 2, lin(0.4)), AUJ)),
      Poids.phraseDeTendance(Poids.tendanceDuPoids(serie([1, 2, 3, 4], 2, () => 90), AUJ)),
      Poids.phraseDeTendance(Poids.tendanceDuPoids(serie([1, 2, 3, 4], 2, (d) => 90 + (i++ % 2 ? 1.5 : -1.5)), AUJ)),
      Poids.noteDeTendance({ pesees: 8, semaines: 4 })
    ];
    phrases.forEach((p) => { expect(typeof p).toBe('string'); expect(p).not.toMatch(MOTS); });
    expect(Poids.phraseDeTendance(null)).toBeNull();
  });
});
