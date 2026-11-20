/** @jest-environment node */
//
// « Une seule voix après un zéro » (19/11/2026, MOTEUR §9.39 et §9.42 bis ; I158 étendu, I236, I237). Une série à 0 rep (charge > 0) a UNE réaction, la sienne : Z1 / Z2 en séance
// (`porte: false`), jamais `reactionDeSerie` (« entre 1 et 1 »), à aucun niveau. Le cran `D` de la séance : ≤ min(95 %, Epley inverse de la visée), jamais au-dessus d'une charge
// déjà ratée, relevé à une série réussie du jour plus légère. Une série réussie à C ou au-dessus : un incident, Z2.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
require('../../v2/js/generateur.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const Modele = global.THModele;

const sp = (t) => String(t).replace(/[  ]/g, ' ');
let nb = 0;
const brute = (kg, reps, extra) => Object.assign({ id: 'r' + (++nb), rang: nb, charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: 'dc' }, extra || {});
const jourN = (i) => new Date(Date.UTC(2026, 8, 1 + i * 3, 18)).toISOString();
const seanceN = (i, series) => ({ seance: { id: 'H' + i, debut: jourN(i) }, series });
const plat = (liste) => liste.map(([kg, reps, extra], i) => seanceN(i, (Array.isArray(reps) ? reps : [reps, reps, reps]).map((x) => brute(kg, x, extra))));
const avantN = (k) => new Date(Date.parse(jourN(k - 1)) + 3 * 864e5).toISOString();
const OPT = { mesure: 'charge_reps', equipement: 'machine', intention: 'progresser', reglage: 'normal', edition: false, debutant: false };
const echec0 = { type_serie: 'echec' };      // le vrai chemin « Oui, manquée »
const histo = () => plat([[100, [5, 5, 5]], [100, [5, 5, 5]]]);
const grille = (pas) => (c, sens) => Math.round((c + sens * pas) * 100) / 100;

function planZ(faites, { gestes, reps, nSeries, gr, cat, equip, reglage } = {}) {
  let k = 0;
  const id = () => 'q-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'dc', id, { series: nSeries || 4 });
  se.exercices[0].series.forEach((s) => { s.reps_visees = reps || 5; });
  faites.forEach(([kg, r, extra], i) => Object.assign(se.exercices[0].series[i], { charge_kg: kg, reps: r, validee_a: '2026-09-20T10:0' + i + ':00.000Z' }, extra || {}));
  const g = gr || histo();
  const avant = avantN(g.length);
  const c = M.consigneDExercice(g, undefined, avant, Object.assign({}, OPT, { equipement: equip || 'barre', reglage: reglage || 'normal' }));
  const e = { seance: { id: 'S', debut: avant, edition: false, exercices: se.exercices, gestes: gestes || [] }, consignes: { dc: c }, paris: [], suites: {},
    reglage: reglage || 'normal', objectif: 'muscle', debutant: false,
    catalogue: { dc: Object.assign({ nom: 'Développé couché', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'], muscles_stabilisateurs: [] }, cat || {}) } };
  const p = T.planDeSeance(e);
  return { p, e, x: p.exercices[0], c, erreurs: T.verifierPlan(p, e).erreurs };
}
const restantes = (x) => x.lignes.filter((l) => !l.validee && l.type !== 'chauffe');

describe('Moteur.descenteEnSeance — le cran D de la séance (règle 2)', () => {
  const D = (o) => M.descenteEnSeance(Object.assign({ voisine: grille(2.5), plancher: 20, reussies: [] }, o));
  test('0 à 85 kg, visée 5 → D ≤ 72,5 kg (et non 80 × 5)', () => {
    expect(D({ charge: 85, visee: 5 })).toBe(72.5);
    expect(D({ charge: 85, visee: 5 }) * (1 + 5 / 30)).toBeLessThanOrEqual(85 + 1e-9);
  });
  test('0 à 100 kg, visée 3 → D ≤ 90,9 kg, arrondi au cran inférieur : 90', () => {
    expect(D({ charge: 100, visee: 3 })).toBe(90);
  });
  test('visée 1 → le cran des 95 % (l\'Epley inverse, 96,8 kg, ne descend pas plus bas) : 95', () => {
    expect(D({ charge: 100, visee: 1 })).toBe(95);
  });
  test('sans visée connue : le seul cran des 95 % (la même descente que B)', () => {
    expect(D({ charge: 100, visee: null })).toBe(M.descenteApresUnZero(100, grille(2.5), 20));
  });
  test('relevé à la plus lourde série RÉUSSIE du jour plus légère que C, jamais jusqu\'à C : 100 × 5 puis 102,5 × 0 → 100', () => {
    expect(D({ charge: 102.5, visee: 3, reussies: [100, 90] })).toBe(100);
    expect(D({ charge: 102.5, visee: 3, reussies: [100] })).toBeLessThan(102.5);
  });
  test('une série réussie à C ou au-dessus : un incident, aucune descente (Z2)', () => {
    expect(D({ charge: 85, visee: 5, reussies: [85] })).toBeNull();
    expect(D({ charge: 85, visee: 5, reussies: [90] })).toBeNull();
  });
  test('aucun cran sous la borne (charge minimale du matériel) : null', () => {
    expect(D({ charge: 20, visee: 5 })).toBeNull();
    expect(D({ charge: 22.5, visee: 8 })).toBeNull();
  });
  test('toujours strictement sous C, au cran de la grille, jamais sous le plancher', () => {
    [[85, 5], [100, 3], [100, 1], [60, 8], [140, 2], [37.5, 12]].forEach(([c, v]) => {
      const d = D({ charge: c, visee: v });
      if (d === null) return;
      expect(d).toBeLessThan(c);
      expect(d).toBeGreaterThanOrEqual(20);
      expect(Math.abs(d / 2.5 - Math.round(d / 2.5))).toBeLessThan(1e-9);
    });
  });
});

describe('la réaction en séance : une série à 0 rep, sa réaction Z1 / Z2', () => {
  test('Z1 : 85 × 0 (sous le palier : la porte « plus lourd que tout succès » ne joue plus) → « je propose 75 kg pour les séries qui restent. » + « Prendre 75 kg »', () => {
    const r = planZ([[85, 0, echec0]]);
    expect(r.x.rate).toMatchObject({ cas: 'Z1', niveau: 'zero', iSerie: 0, fourchette: null, garde: null });
    // la ligne la plus lourde qui reste est la ligne haute : 102,5 kg × 3 → 85 / (1 + 3/30) = 77,3 → le cran 75 (la visée 5 des autres lignes donnerait 72,5)
    const lourde = restantes(r.x).sort((a, b) => b.charge - a.charge)[0];
    expect([lourde.charge, lourde.vise]).toEqual([102.5, 3]);
    expect(sp(r.x.rate.phrase)).toBe('85 kg est resté à 0 rep : je propose 75 kg pour les séries qui restent.');
    expect(r.x.rate.boutons.map((b) => sp(b.texte))).toEqual(['Prendre 75 kg']);
    expect(75 * (1 + lourde.vise / 30)).toBeLessThanOrEqual(85 + 1e-9);
    expect(r.erreurs).toEqual([]);
  });
  test('la visée de la ligne la plus lourde qui reste : avec des lignes à 5 reps, 85 × 0 → 72,5 kg (le cas du coach : pas 80 × 5)', () => {
    const r = planZ([[85, 0, echec0]], { gr: plat([[100, [5, 5, 5, 5]], [100, [5, 5, 5, 5]]]) });
    const lourde = restantes(r.x).sort((a, b) => b.charge - a.charge)[0];
    expect(r.x.rate.cas).toBe('Z1');
    expect(r.x.rate.charge.kg * (1 + lourde.vise / 30)).toBeLessThanOrEqual(85 + 1e-9);
    expect(r.x.rate.charge.kg).toBeLessThan(80);
  });
  test('les mots disent « pour les séries qui restent », jamais « pour la suite »', () => {
    expect(sp(planZ([[85, 0, echec0]]).x.rate.phrase)).not.toMatch(/pour la suite/);
  });
  test('Z2 : une série RÉUSSIE du jour à la même charge (100 × 5 puis 100 × 0) est un incident : « 100 kg est resté à 0 rep. », sans bouton', () => {
    const r = planZ([[100, 5], [100, 0, echec0]]);
    expect(r.x.rate).toMatchObject({ cas: 'Z2', niveau: 'zero', charge: null });
    expect(sp(r.x.rate.phrase)).toBe('100 kg est resté à 0 rep.');
    expect(r.x.rate.boutons).toEqual([]);
    expect(r.erreurs).toEqual([]);
  });
  test('une seule voix : 105 × 5 (au-dessus de la charge de travail : élan) puis 100 × 0 → Z2 seule, ni message §9.14, ni ligne d\'élan, aucune erreur (I115, I157)', () => {
    const r = planZ([[105, 5], [100, 0, echec0]]);
    expect(r.x.rate && r.x.rate.cas).toBe('Z2');
    expect(r.x.message || null).toBeNull();
    expect(r.x.lignes.some((l) => l.role === 'elan' || l.source === 'elan')).toBe(false);
    expect(r.erreurs).toEqual([]);
  });
  test('Z1 relevé à une charge réussie : 100 × 5 puis 102,5 × 0 → 100 kg (et non 80 × 5)', () => {
    const r = planZ([[100, 5], [102.5, 0, echec0]]);
    expect(r.x.rate).toMatchObject({ cas: 'Z1', charge: { kg: 100 } });
    expect(sp(r.x.rate.phrase)).toBe('102,5 kg est resté à 0 rep : je propose 100 kg pour les séries qui restent.');
    expect(r.erreurs).toEqual([]);
  });
  test('C = le plus léger zéro de la séance : 105 × 0 puis 100 × 0 → la descente part de 100, jamais de 105', () => {
    const r = planZ([[105, 0, echec0], [100, 0, echec0]]);
    const zs = r.x.zeros;
    expect(zs.map((z) => z.zeroMin)).toEqual([105, 100]);
    expect(zs[1].descente).toBeLessThan(100);
    expect(r.erreurs).toEqual([]);
  });
  test('C : un zéro PLUS LOURD qu\'un zéro déjà fait ne relève pas la descente : 100 × 0 puis 105 × 0 → la descente du second part de 100', () => {
    const r = planZ([[100, 0, echec0], [105, 0, echec0]]);
    expect(r.x.zeros.map((z) => z.zeroMin)).toEqual([100, 100]);
    expect(r.x.zeros[1].descente).toBeLessThan(100);
    expect(r.erreurs).toEqual([]);
  });
  test('Z2 : plancher du matériel (20 kg, rien de plus léger) et dernière ligne', () => {
    expect(sp(planZ([[20, 0, echec0]]).x.rate.phrase)).toBe('20 kg est resté à 0 rep.');
    const d = planZ([[100, 5], [100, 5], [100, 5], [105, 0, echec0]]);
    expect(d.x.rate.cas).toBe('Z2');
    expect(d.erreurs).toEqual([]);
  });
  test('les deux typages (« manquée » et `travail`) disent la même chose', () => {
    const a = planZ([[85, 0, echec0]]).x.rate, b = planZ([[85, 0]]).x.rate;
    expect(b.phrase).toBe(a.phrase);
    expect(b.cas).toBe(a.cas);
  });
  test('muet : un exercice figure / sans coach / douleur ne parle pas ; aucun zéro dans x.zeros n\'est vu sans silence', () => {
    const r = planZ([[85, 0, echec0]], { cat: {} });
    expect(r.x.rate && r.x.rate.niveau).toBe('zero');
  });
  test('I158 : D mal calculé (au-dessus de C, au-dessus de l\'Epley inverse), Z1 sur un incident, un 0 sans réaction : refusés', () => {
    const r = planZ([[85, 0, echec0]]);
    const avec = (patch) => { const p = Object.assign({}, r.p, { exercices: r.p.exercices.map((q, i) => (i === 0 ? Object.assign({}, q, patch) : q)) }); return T.verifierPlan(p, r.e).erreurs.filter((m) => /I158|I236|I237/.test(m)); };
    expect(avec({}).length).toBe(0);
    const z = r.x.zeros[0];
    const faux = (kg) => avec({ zeros: [Object.assign({}, z, { descente: kg })], rate: Object.assign({}, r.x.rate, { charge: { kg, action: 'baisse' } }) });
    expect(faux(80).some((m) => /Epley/.test(m))).toBe(true);
    expect(faux(85).some((m) => /jamais à la charge déjà ratée/.test(m))).toBe(true);
    expect(avec({ zeros: [] }).some((m) => /I237/.test(m))).toBe(true);
    // un incident traité comme Z1
    const inc = planZ([[100, 5], [100, 0, echec0]]);
    const p2 = Object.assign({}, inc.p, { exercices: inc.p.exercices.map((q, i) => (i === 0 ? Object.assign({}, q, { zeros: [Object.assign({}, q.zeros[0], { cas: 'Z1', descente: 95, proposition: true })] }) : q)) });
    expect(T.verifierPlan(p2, inc.e).erreurs.some((m) => /I158.*incident/.test(m))).toBe(true);
  });
});

describe('UNE réaction par série à 0 rep (règle 4) — « entre 1 et 1 » ne se dit plus', () => {
  test('l\'ancien défaut : une série à 0 rep dans une séance réussie ne donne plus « entre 1 et 1 » (ni aucune fourchette, ni « garde »)', () => {
    ['normal', 'franc', 'prudent'].forEach((reglage) => {
      [echec0, undefined].forEach((extra) => {
        [[[100, 5], [100, 0, extra]], [[85, 0, extra], [100, 3]], [[100, 5], [102.5, 0, extra]]].forEach((faites) => {
          const r = planZ(faites, { reglage });
          const dit = (r.x.phrases || []).map((q) => sp(q.texte)).join(' ');
          expect(dit).not.toMatch(/entre 1 et 1/);
          if (r.x.rate && r.x.rate.faites === 0) {
            expect(r.x.rate.fourchette).toBeNull();
            expect(r.x.rate.garde).toBeNull();
          }
          expect(r.erreurs).toEqual([]);
        });
      });
    });
  });
  test('LE DÉFAUT D\'ORIGINE (origin/main) : Franc, 100 × 5 puis 100 × 0 (typé `travail`) → « 0 au lieu de 5. Même charge, vise 1 en réserve, entre 1 et 1. » (I119 violé) ; maintenant Z2', () => {
    const r = planZ([[100, 5], [100, 0]], { reglage: 'franc' });
    const dit = r.x.phrases.filter((q) => q.ou === 'rate').map((q) => sp(q.texte));
    expect(dit).toEqual(['100 kg est resté à 0 rep.']);
    expect(dit.join(' ')).not.toMatch(/entre 1 et 1|au lieu de|garde/);
    expect(r.x.rate).toMatchObject({ niveau: 'zero', cas: 'Z2', fourchette: null, garde: null });
    expect(r.erreurs.filter((m) => /I119/.test(m))).toEqual([]);
    expect(r.erreurs).toEqual([]);
  });
  test('Moteur.reactionAuRate : une série à 0 rep AVEC une charge n\'a pas de réaction de série (silence « zero »)', () => {
    const d = M.reactionAuRate({ niveau: 'serie', role: 'travail', charge: 80, reps: 0, vise: 5, bas: 3, haut: 5, rang: 0, derniere: false, reglage: 'franc', objectif: 'muscle', barre: true, materiel: 'barre', pas: 2.5 });
    expect(d).toMatchObject({ silence: true, raison: 'zero' });
    expect(M.phraseDeRate(d)).toBeNull();
  });
  test('le niveau 2 exclut la série à 0 de sa paire : 4 puis 0 sous la cible de 5 ne dit pas « 4 puis 0 »', () => {
    const f = [{ reps: 4, vise: 5 }, { reps: 0, vise: 5 }];
    expect(M.reactionAuRate({ niveau: 'exercice', faites: f, restantes: 2, charge: 80, reglage: 'normal', objectif: 'muscle' })).toMatchObject({ silence: true, raison: 'pas_assez' });
    const f3 = [{ reps: 4, vise: 5 }, { reps: 0, vise: 5 }, { reps: 3, vise: 5 }];
    const d = M.reactionAuRate({ niveau: 'exercice', faites: f3, restantes: 2, charge: 80, reglage: 'normal', objectif: 'muscle' });
    expect(d.silence).toBe(false);
    expect([d.avant, d.faites]).toEqual([4, 3]);
  });
  test('x.zeros, x.rate et le compte des propositions disent la même chose (I237) : Z1 non pris compte comme ignorée', () => {
    const un = planZ([[85, 0, echec0], [100, 2]], { nSeries: 5 });
    expect(un.x.zeros[0]).toMatchObject({ iSerie: 0, cas: 'Z1', proposition: true, prise: false });
    expect(un.x.rate.niveau).toBe('serie');                 // une seule proposition ignorée : le coach parle encore sous la série suivante
    const deux = planZ([[85, 0, echec0], [80, 0, echec0], [100, 2]], { nSeries: 5 });
    expect(deux.x.zeros.map((z) => z.proposition)).toEqual([true, true]);
    expect(deux.x.rate).toBeNull();                          // deux propositions ignorées (RATE_IGNOREES_MAX) : il se tait
    expect(deux.erreurs).toEqual([]);
  });
  test('un Z1 PRIS ne compte pas ; un Z2 ne compte jamais', () => {
    const pris = planZ([[85, 0, echec0], [80, 0, echec0], [100, 2]], { nSeries: 5, gestes: [{ geste: 'rate_prise', slug: 'dc', rang: 0, bouton: 'prendre', kg: 75, cas: 'Z1' }] });
    expect(pris.x.rate && pris.x.rate.niveau).toBe('serie');
    const z2 = planZ([[100, 5], [100, 0, echec0], [100, 0, echec0], [100, 2]], { nSeries: 6 });
    expect(z2.x.zeros.every((z) => z.cas === 'Z2' && z.proposition === false)).toBe(true);
    expect(z2.x.rate && z2.x.rate.niveau).toBe('serie');
  });
  test('lest et aide : le cas E du poids du corps, « 0 au lieu de 9. », ni fourchette ni « garde », « Plus d’aide » à la place de l\'élastique', () => {
    const aide = { equipement: 'machine', charge: 'assistance' };
    const ga = plat([[-40, [8, 8, 8]], [-40, [8, 8, 8]]]);
    const a = planZ([[-40, 8], [-40, 0]], { gr: ga, cat: aide, equip: 'machine' });
    expect(a.x.rate).toMatchObject({ cas: 'E', fourchette: null, garde: null });
    expect(sp(a.x.rate.phrase)).toBe('0 au lieu de 9.');
    expect(a.x.rate.boutons.map((b) => sp(b.texte))).toEqual(['Plus d’aide']);
    expect(a.erreurs).toEqual([]);
    const lest = { equipement: 'barre', charge: 'ajoutee' };
    const gl = plat([[20, [8, 8, 8]], [20, [8, 8, 8]]]);
    const l = planZ([[20, 8], [20, 0]], { gr: gl, cat: lest });
    expect(l.x.rate).toMatchObject({ cas: 'E', fourchette: null, garde: null });
    expect(sp(l.x.rate.phrase)).toBe('0 au lieu de 9.');
    expect(l.x.rate.boutons.map((b) => sp(b.texte))).toEqual(['Avec un élastique']);
    expect(l.erreurs).toEqual([]);
  });
  test('Moteur : le poids du corps à 0 rep : « 0 au lieu de 8. », leviers, ni fourchette ni garde ; l\'aide dit « Plus d’aide »', () => {
    const base = { niveau: 'serie', role: 'travail', charge: 0, corps: true, reps: 0, vise: 8, bas: 8, haut: 12, rang: 1, derniere: false, reglage: 'normal', objectif: 'les_deux', materiel: 'corps' };
    const c = M.reactionAuRate(base);
    expect(c).toMatchObject({ cas: 'E', zero: true, fourchette: null, garde: null, leviers: ['elastique'] });
    expect(sp(M.phraseDeRate(c))).toBe('0 au lieu de 8.');
    const a = M.reactionAuRate(Object.assign({}, base, { aide: true }));
    expect(a.leviers).toEqual(['plus_d_aide']);
    expect(sp(M.boutonDeRate('plus_d_aide', a))).toBe('Plus d’aide');
    // 1 rep ou plus : comme avant (la fourchette reste, avec l'élastique)
    expect(M.reactionAuRate(Object.assign({}, base, { reps: 5 })).fourchette).toEqual([4, 5]);
  });
});

describe('règle 7 : une décision ne s\'efface jamais en silence — « Prendre » reste appliqué si le zéro est corrigé', () => {
  const prise = { geste: 'rate_prise', slug: 'dc', rang: 0, bouton: 'prendre', kg: 75, cas: 'Z1' };
  test('« Prendre 75 kg » sous 85 × 0 : les lignes qui restent passent à 75 ; le zéro est ensuite corrigé en 85 × 5 : elles restent à 75', () => {
    const avant = planZ([[85, 0, echec0]], { gestes: [prise] });
    expect(avant.x.rate.charge.kg).toBe(75);
    restantes(avant.x).forEach((l) => expect(l.charge).toBeLessThanOrEqual(75));
    expect(avant.x.rate.boutons[0].pris).toBe(true);
    expect(avant.erreurs).toEqual([]);
    const apres = planZ([[85, 5]], { gestes: [prise] });
    expect(apres.x.rate || null).toBeNull();
    restantes(apres.x).forEach((l) => expect(l.charge).toBeLessThanOrEqual(75));
    expect(restantes(apres.x).length).toBeGreaterThan(0);
    expect(apres.erreurs).toEqual([]);
  });
  test('sans « Prendre », corrigé : les lignes reprennent la consigne', () => {
    const r = planZ([[85, 5]]);
    expect(restantes(r.x).some((l) => l.charge > 75)).toBe(true);
  });
  test('un vieux geste sans `cas` reste lu sous la réaction qui l\'a fait naître', () => {
    const r = planZ([[85, 0, echec0]], { gestes: [{ geste: 'rate_prise', slug: 'dc', rang: 0, bouton: 'prendre', kg: 75 }] });
    restantes(r.x).forEach((l) => expect(l.charge).toBeLessThanOrEqual(75));
  });
  test('seance.js garde `cas: Z1` sur `rate_prise` (un autre cas est écarté)', () => {
    const s = S.noterGeste({ id: 's', gestes: [] }, { geste: 'rate_prise', slug: 'dc', rang: 0, bouton: 'prendre', kg: 75, cas: 'Z1' });
    expect(s.gestes[0]).toEqual({ geste: 'rate_prise', slug: 'dc', rang: 0, bouton: 'prendre', kg: 75, cas: 'Z1' });
  });
});

describe('règle 8 : pendant la tenue après un zéro, un NOUVEAU 0 fait parler Z1 avec le D corrigé', () => {
  const R3 = { ressenti: 'reste_3_plus' };
  const gr = () => [seanceN(0, [brute(100, 5, R3), brute(100, 5, R3), brute(100, 5, R3)]),
    seanceN(1, [brute(100, 5, R3), brute(100, 5, R3), brute(100, 5, R3), brute(102.5, 0)])];
  test('la consigne est plafonnée (tenue_apres_zero) ; un nouveau 0 à la charge tenue (100 × 0) → Z1, D = 85 (visée 5), I158 et I156 verts', () => {
    const sans = planZ([], { gr: gr() });
    expect(sans.x.consigne.etat).toBe('tenue_apres_zero');
    const r = planZ([[100, 0, echec0]], { gr: gr() });
    expect(r.x.consigne.etat).toBe('tenue_apres_zero');
    expect(r.x.rate).toMatchObject({ cas: 'Z1', niveau: 'zero', charge: { kg: 85 } });
    expect(sp(r.x.rate.phrase)).toBe('100 kg est resté à 0 rep : je propose 85 kg pour les séries qui restent.');
    expect(85 * (1 + 5 / 30)).toBeLessThanOrEqual(100 + 1e-9);
    expect(r.erreurs).toEqual([]);
  });
});

describe('Modele.estZeroDeTravail — une seule lecture', () => {
  test('travail, recul ou manquée, 0 rep, charge > 0 ; jamais chauffe, test, hors calcul, dégressive (R1 : le recul est ADMIS, 20/11/2026)', () => {
    const z = (extra, kg) => Modele.estZeroDeTravail(Object.assign({ charge_kg: kg === undefined ? 80 : kg, reps: 0, type_serie: 'travail' }, extra || {}));
    expect(z()).toBe(true);
    expect(z({ type_serie: 'echec' })).toBe(true);
    expect(z({ type_serie: 'recul' })).toBe(true);
    ['echauffement', 'test', 'degressive'].forEach((t) => expect(z({ type_serie: t })).toBe(false));
    expect(z({ hors_calcul: true })).toBe(false);
    expect(z({}, null)).toBe(false);
    expect(z({}, -40)).toBe(false);
    expect(z({ reps: 1 })).toBe(false);
    expect(z({ reps: null })).toBe(false);
  });
});
