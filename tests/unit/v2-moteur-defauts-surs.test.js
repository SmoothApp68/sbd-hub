/** @jest-environment node */
//
// Lot b2 (28/11/2026, SYNTHESE-VAGUE-1 §6) — les défauts sûrs du moteur, chacun avec son test (qui échoue sans son correctif).
// (1) jour sans : « ta grosse série » et « tes reculs » sont deux lectures distinctes.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
require('../../v2/js/generateur.js');
require('../../v2/js/bilan.js');
const M = require('../../v2/js/moteur.js');

const g = (kg, reps, t) => ({ charge_kg: kg, reps, type_serie: t || 'travail' });
const jour = (i) => new Date(Date.UTC(2026, 10, 8 + i * 4, 18)).toISOString();
const seance = (i, series, slug) => ({ seance: { id: 'H' + i, debut: jour(i) }, series: series.map((s, j) => Object.assign({ id: 'h' + i + '_' + j, rang: j, rpe: null, ressenti: null, exercise_slug: slug || 'squat' }, s)) });
const OPT = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false, debutant: false };
const bonne = () => [g(140, 3), g(125, 6, 'recul'), g(125, 6, 'recul')];

describe('b2 (1) — jour sans : la grosse série et les reculs ne sont pas la même expression', () => {
  const js = (zero) => {
    const liste = [bonne(), bonne(), zero];
    const avant = new Date(Date.parse(jour(2)) + 4 * 864e5).toISOString();
    return M.consigneDExercice(liste.map((s, i) => seance(i, s)), undefined, avant, OPT).consigne.fondement.zeroRep.jourSans;
  };
  test('une séance de reculs seuls, tous à 0 : il n\'y a pas de grosse série à dire, les reculs oui', () => {
    expect(js([g(125, 0, 'recul'), g(125, 0, 'recul')])).toMatchObject({ grosse: false, reculs: true });
  });
  test('la grosse série et ses reculs à 0 : les deux', () => {
    expect(js([g(140, 0, 'echec'), g(125, 0, 'recul')])).toMatchObject({ grosse: true, reculs: true });
  });
  test('la grosse série seule à 0 (bloc sans reculs) : ni l\'un ni l\'autre', () => {
    expect(js([g(140, 0, 'echec')])).toMatchObject({ grosse: false, reculs: false });
  });
});

describe('b2 (2) — une seule table de crans de repli (REPLI_MATERIEL) : la réaction au raté la lit', () => {
  const serie = (materiel, charge, reps) => M.reactionAuRate({ niveau: 'serie', role: 'travail', materiel: materiel, reps: reps, vise: 10, bas: 8, charge: charge, rang: 1, reserve: 0 });
  const paris = (materiel, charge) => M.reactionAuRate({ niveau: 'paris', materiel: materiel, n: 2, charge: charge, reps: 8 });
  test('une machine sans cran connu baisse d\'un cran de machine (5 kg), pas de 2,5 kg', () => {
    const r = serie('machine', 100, 6);                  // 82,5 kg avec l'ancien pas de 2,5
    expect(r.charge && r.charge.action).toBe('baisse');
    expect(r.charge.kg).toBe(80);
    expect(serie('machine', 120, 5).charge.kg).toBe(95);   // 97,5 avant
  });
  test('un kettlebell baisse de 4 kg (la série 8 · 12 · 16 · 20 · 24)', () => {
    expect(serie('kettlebell', 24, 5).charge.kg).toBe(16);   // 17,5 avant
  });
  test('le « un cran dessous » des paris lit la même table : machine 100 kg → 95 kg', () => {
    expect(paris('machine', 100).cran.charge).toBe(95);
  });
  test('la table propre à la réaction a disparu : chaque matériel connu a le pas de REPLI_MATERIEL', () => {
    expect(M.pasDeRepliDe('machine')).toBe(5);
    expect(M.pasDeRepliDe('kettlebell')).toBe(4);
    expect(M.pasDeRepliDe('poulie')).toBe(2.5);
    expect(M.pasDeRepliDe('haltere')).toBe(2);
    expect(M.pasDeRepliDe('haltere_seul')).toBe(1);
    expect(M.pasDeRepliDe('inconnu')).toBe(2.5);
  });
});

describe('b2 (3) — la dégressive à la barre lit les disques de la salle (jusqu\'à 0,25 kg), pas une liste coupée à 1,25', () => {
  const deg = (der) => M.degressiveDe({ equipement: 'barre', derniere_serie: der, reps_travail: 10 });
  afterEach(() => M.brancherPlusPetitDisque(null));
  test('une salle qui a des disques de 0,5 kg : 6 kg → on enlève 0,5 de chaque côté (5 kg)', () => {
    M.brancherPlusPetitDisque(() => 0.5);
    const r = deg(6);
    expect(r.charge).toBe(5);
    expect(r.enleve).toBe(0.5);
  });
  test('une salle qui a des disques de 1 kg : 8 kg → on enlève 1 de chaque côté (6 kg)', () => {
    M.brancherPlusPetitDisque(() => 1);
    expect(deg(8).enleve).toBe(1);
  });
  test('sans salle connue (disques de 1 kg et moins supposés absents) : inchangé, « Trop léger »', () => {
    expect(deg(6).charge).toBeNull();
  });
  test('un disque plus petit que celui de la salle n\'est jamais proposé (1,25 → pas de 1)', () => {
    M.brancherPlusPetitDisque(() => 1.25);
    expect(deg(8).charge).toBeNull();
  });
});

describe('b2 (4) — le calage part de la barre DÉCLARÉE, pas de 20 kg', () => {
  const cal = () => M.calagePremiereFois({ equipement: 'barre', mesure: 'charge_reps', reps: 8, series: [], prochain: 'travail' });
  afterEach(() => M.brancherBarreDeLaSalle(null));
  test('barre de 15 kg déclarée : le plancher et la première charge sont 15 kg', () => {
    M.brancherBarreDeLaSalle(() => 15);
    const r = cal();
    expect(r.plancher).toBe(15);
    expect(r.suivante.charge).toBe(15);
  });
  test('sans barre déclarée : 20 kg, comme avant', () => {
    const r = cal();
    expect(r.plancher).toBe(20);
    expect(r.suivante.charge).toBe(20);
  });
});

describe('b2 (5) — chauffes : jamais de silence sans date', () => {
  const T = Date.UTC(2026, 10, 28, 10);
  const JOUR = 864e5;
  test('deux refus datés d\'il y a 10 jours : en silence', () => {
    expect(M.chauffesEnSilence({ n: 2, quand: T - 10 * JOUR }, T)).toBe(true);
  });
  test('deux refus datés d\'il y a 29 jours : le silence est échu', () => {
    expect(M.chauffesEnSilence({ n: 2, quand: T - 29 * JOUR }, T)).toBe(false);
  });
  test('deux refus SANS date (entrée d\'avant les dates) : pas de silence éternel', () => {
    expect(M.chauffesEnSilence({ n: 2 }, T)).toBe(false);
    expect(M.chauffesEnSilence({ n: 2, quand: null }, T)).toBe(false);
    expect(M.chauffesEnSilence({ n: 2, quand: 'hier' }, T)).toBe(false);
  });
  test('un seul refus : jamais de silence', () => {
    expect(M.chauffesEnSilence({ n: 1, quand: T - JOUR }, T)).toBe(false);
  });
});

describe('b2 (6) — les pluriels : « pour les étirer » et le pari de programme à 1 ou 0 exercice', () => {
  const kine = (zones, muscles, menager) => M.blocDeMobilite({ zones: zones, faites: {}, muscles: muscles, slugs: [], menager: menager, douleurs: [] }).fin.kine[0];
  test('un nom pluriel (Tes épaules, Tes quadriceps, Tes ischios) : « pour les étirer »', () => {
    expect(kine(['epaules'], [], ['epaule'])).toBe('Tes épaules sont à ménager : pour les étirer, demande l’avis d’un kiné.');
    expect(kine(['quadriceps'], ['quadriceps'], ['genou'])).toBe('Tes quadriceps sont à ménager : pour les étirer, demande l’avis d’un kiné.');
  });
  test('un nom singulier (Ta hanche, Ton haut du dos) : « pour l’étirer »', () => {
    expect(kine(['hanches'], [], ['hanche'])).toBe('Ta hanche est à ménager : pour l’étirer, demande l’avis d’un kiné.');
    expect(kine(['haut_du_dos'], [], ['dos'])).toBe('Ton haut du dos est à ménager : pour l’étirer, demande l’avis d’un kiné.');
  });
  const pari = (predite, observee) => M.carteFinDeBloc({ zone: 'mix', exercices: [], semaines: 4 }, { exercices: {}, paris: 0, tenus: 0 }, {}, { predite: predite, observee: observee }).pari.replace(/[\u00a0\u202f]/g, ' ');
  test('un seul exercice parié : « ton exercice », jamais « tes 1 exercices »', () => {
    expect(pari(1, 1)).toBe('Le coach avait parié que ton exercice progresserait : il a progressé.');
    expect(pari(1, 0)).toBe('Le coach avait parié que ton exercice progresserait : il n’a pas progressé.');
  });
  test('aucun n\'a progressé : jamais « 0 a progressé »', () => {
    expect(pari(2, 0)).toBe('Le coach avait parié que tes 2 exercices progresseraient : aucun n’a progressé.');
  });
  test('inchangé : 2 paris, 1 a progressé ; 3 paris, 3 ont progressé', () => {
    expect(pari(2, 1)).toBe('Le coach avait parié que tes 2 exercices progresseraient : 1 a progressé.');
    expect(pari(3, 3)).toBe('Le coach avait parié que tes 3 exercices progresseraient : 3 ont progressé.');
  });
});

describe('b2 (7) — decomposerCharge : un disque à 0 ne boucle jamais', () => {
  // Sans la garde, la boucle ne finit pas : le test la joue dans un processus à part, avec un délai (un test synchrone ne peut pas s'interrompre lui-même).
  const { spawnSync } = require('child_process');
  const joue = (presents, charge) => {
    const code = "global.self = global; var M = require(" + JSON.stringify(require.resolve('../../v2/js/moteur.js')) + ");" +
      "console.log(JSON.stringify(M.decomposerCharge(" + (charge || 60) + ", 20, " + JSON.stringify(presents) + ")));";
    const r = spawnSync(process.execPath, ['-e', code], { timeout: 8000, encoding: 'utf8', env: Object.assign({}, process.env, { TZ: 'Europe/Paris' }) });
    return { fini: r.error === undefined, sortie: (r.stdout || '').trim() };
  };
  test('un disque à 0 parmi les disques présents, charge impossible : { ok: false }, sans boucle', () => {
    const r = joue([10, 0], 62);
    expect(r.fini).toBe(true);
    expect(JSON.parse(r.sortie)).toEqual({ ok: false });
  });
  test('un disque à 0 parmi les disques présents, charge possible : rend, sans l\'utiliser', () => {
    const r = joue([0, 10, 5]);
    expect(r.fini).toBe(true);
    expect(JSON.parse(r.sortie)).toEqual({ ok: true, parCote: [10, 10] });
  });
  test('que des disques à 0 (ou négatifs) : { ok: false }, sans boucle', () => {
    const r = joue([0, -5]);
    expect(r.fini).toBe(true);
    expect(JSON.parse(r.sortie)).toEqual({ ok: false });
  });
  test('inchangé : les disques présents valides', () => {
    expect(M.decomposerCharge(60, 20, [25, 20, 10, 5, 2.5, 1.25])).toEqual({ ok: true, parCote: [20] });
    expect(M.decomposerCharge(65, 20, [25, 20, 10, 5, 2.5, 1.25])).toEqual({ ok: true, parCote: [20, 2.5] });
  });
});

describe('b2 (8) — le mémo des plafonds et de la charge la plus lourde ne sert pas un résultat périmé quand une séance passée est corrigée EN PLACE', () => {
  // Les corrections de la fiche d'un exercice modifient parfois le tableau de séries d'une séance passée sans le remplacer : même référence, même longueur.
  // Le test tranche : la consigne rejouée sur l'historique corrigé en place est celle d'une copie neuve du même historique (verdict du 28/11/2026 : aucun défaut).
  const jourH = (i) => new Date(Date.UTC(2026, 9, 1 + i * 4, 18)).toISOString();
  const hist = (reps) => reps.map((r, i) => seance(i, r.map((x) => g(100, x))));
  const run = (l) => JSON.stringify(M.consigneDExercice(l, undefined, new Date(Date.parse(jourH(9)) + 4 * 864e5).toISOString(), OPT));
  const huit = () => hist(Array.from({ length: 10 }, () => [8, 8, 8]));
  test('les reps de neuf séances passées corrigées en place : même consigne qu\'une copie neuve (et la consigne a bien changé)', () => {
    const L = huit();
    const avant = run(L);
    L.slice(0, 9).forEach((se) => se.series.forEach((s) => { s.reps = 3; }));
    const enPlace = run(L);
    expect(enPlace).toBe(run(JSON.parse(JSON.stringify(L))));
    expect(enPlace).not.toBe(avant);          // la fixture déclenche vraiment le chemin : la correction change la consigne
  });
  test('une charge passée corrigée en place (la plus lourde charge de la séance) : même consigne qu\'une copie neuve', () => {
    const L = huit();
    const avant = run(L);
    L.slice(0, 9).forEach((se, i) => se.series.forEach((s) => { s.charge_kg = 60 + 7.5 * i; }));   // un plan de charges de 7,5 kg, écrit en place
    const enPlace = run(L);
    expect(enPlace).toBe(run(JSON.parse(JSON.stringify(L))));
    expect(enPlace).not.toBe(avant);
  });
});
