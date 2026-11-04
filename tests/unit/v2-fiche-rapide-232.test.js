/** @jest-environment node */
//
// 232 — LA FICHE D'UN EXERCICE RAPIDE : le contrat de l'exercice lu une fois par état des données, la chaîne des plafonds de
// l'habitude relue séance par séance, les dates lues une fois, et les records d'une séance qui partagent ce que les séries ont en
// commun. Les résultats ne changent pas : ce test charge le moteur, le modèle et les faits D'AVANT (git, le commit parent du
// chantier) dans un contexte à part et compare, sur des historiques tirés.

process.env.TZ = 'Europe/Paris';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');

const RACINE = path.join(__dirname, '..', '..');
const FICHIERS = ['modele', 'semaine', 'periode', 'bilan', 'profil', 'palier', 'moteur', 'seance', 'faits'];
const AVANT_232 = '4950551e';   // main avant le chantier 232

function lireAncien(nom) {
  return cp.execFileSync('git', ['show', AVANT_232 + ':v2/js/' + nom + '.js'], { cwd: RACINE, maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
}
function charger(source) {
  const bac = {}; bac.self = bac; bac.console = console; bac.globalThis = bac;
  vm.createContext(bac);
  FICHIERS.forEach((nom) => vm.runInContext(source(nom), bac, { filename: nom + '.js' }));
  return bac;
}
let ANCIEN = null, NOUVEAU = null, ANCIEN_DISPO = true;
try {
  ANCIEN = charger(lireAncien);
  NOUVEAU = charger((nom) => fs.readFileSync(path.join(RACINE, 'v2/js', nom + '.js'), 'utf8'));
} catch (e) { ANCIEN_DISPO = false; }   // pas d'historique git (copie sans .git) : le test ne dit rien

let x = 232; const alea = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
const JOUR = 86400000;

// Un historique tiré : un exercice principal, des séances aux formats variés (palier tenu ou non, échauffements, une série
// plus lourde seule, des douleurs, des séries « hors calcul ») + un second exercice pour les records.
function tirer(n) {
  const seances = [], series = [], parSeance = {}, groupes = [];
  let t = Date.parse('2025-09-01T17:00:00Z');
  let charge = 60 + Math.floor(alea() * 8) * 5;
  for (let i = 0; i < n; i++) {
    t += (1 + alea() * 5) * JOUR;
    const id = 'S' + i, debut = new Date(t).toISOString();
    if (alea() < 0.3) charge += 2.5;
    if (alea() < 0.05) charge -= 5;
    const format = alea();
    const reps = format < 0.35 ? 4 + Math.floor(alea() * 3) : format < 0.7 ? 7 + Math.floor(alea() * 3) : 10 + Math.floor(alea() * 5);
    const liste = [];
    const ns = 2 + Math.floor(alea() * 4);
    for (let k = 0; k < ns; k++) {
      const type = k === 0 && alea() < 0.25 ? 'echauffement' : 'travail';
      const s = { id: id + '-a' + k, session_id: id, rang: k, exercise_slug: 'exo-a', type_serie: type,
        charge_kg: type === 'echauffement' ? Math.round(charge * 0.5) : charge + (alea() < 0.15 ? 5 : 0),
        reps: Math.max(1, reps - (alea() < 0.3 ? Math.floor(alea() * 4) : 0)), rpe: alea() < 0.3 ? 7 + Math.floor(alea() * 3) : null,
        ressenti: null, validee_a: debut };
      if (alea() < 0.04) s.douleur = true;
      if (alea() < 0.03) s.hors_calcul = true;
      liste.push(s);
    }
    liste.push({ id: id + '-b0', session_id: id, rang: 9, exercise_slug: 'exo-b', type_serie: 'travail', charge_kg: 40 + Math.floor(i / 6) * 2.5, reps: 8 + Math.floor(alea() * 3), validee_a: debut });
    seances.push({ id, debut, fin: null });
    parSeance[id] = liste; liste.forEach((s) => series.push(s));
    groupes.push({ seance: { id, debut }, series: liste.filter((s) => s.exercise_slug === 'exo-a') });
  }
  return { seances: seances.slice().reverse(), series, parSeance, groupes: groupes.slice().reverse() };
}
function corpusDe(ctx, h) {
  const M = ctx.THModele;
  const catalogue = [{ slug: 'exo-a', nom: 'Exo A', mesure: 'charge_reps', equipement: 'barre', muscles_primaires: ['dos'] },
    { slug: 'exo-b', nom: 'Exo B', mesure: 'charge_reps', equipement: 'haltere', muscles_primaires: ['dos'] }];
  const index = M.indexerExercices(catalogue);
  return { seances: h.seances, series: h.series, exercices: catalogue, seriesDe: (id) => h.parSeance[id] || [], catalogue: () => index, journal: [] };
}
const copie = (v) => JSON.parse(JSON.stringify(v));
const dire = (v) => JSON.stringify(v);

(ANCIEN_DISPO ? describe : describe.skip)('232 — la fiche d’un exercice : le même résultat, plus vite', () => {
  test('60 historiques tirés : le contrat, la consigne et les charges de travail sont ceux d’avant, sur chaque préfixe', () => {
    let consignes = 0, paliers = 0, sansPalier = 0;
    for (let essai = 0; essai < 60; essai++) {
      const h = tirer(8 + Math.floor(alea() * 60));
      const options = { mesure: 'charge_reps', reglage: ['normal', 'franc', 'prudent'][essai % 3], equipement: 'barre', intention: 'progresser',
        debutant: essai % 4 === 0, prudence: essai % 5 === 0 ? { plafond: 5, unCran: true, raison: 'age' } : undefined };
      const optsC = { reglage: options.reglage, equipement: 'barre', correction: null, salle: null };
      // Plusieurs fois de suite, comme la fiche (consigne puis charges de travail), et sur des préfixes qui grandissent :
      // le mémo ne doit jamais servir un contrat périmé.
      [Math.ceil(h.groupes.length / 3), Math.ceil(h.groupes.length / 2), h.groupes.length, h.groupes.length].forEach((m) => {
        const g = copie(h.groupes.slice(h.groupes.length - m));
        const avant = new Date(Date.parse(h.groupes[0].seance.debut) + JOUR).toISOString();
        const a = ANCIEN.THMoteur.consigneDExercice(copie(g), undefined, avant, copie(options));
        const b = NOUVEAU.THMoteur.consigneDExercice(copie(g), undefined, avant, copie(options));
        expect(dire(b)).toBe(dire(a));
        expect(dire(NOUVEAU.THMoteur.chargesDeTravailDe(copie(g), undefined, optsC)))
          .toBe(dire(ANCIEN.THMoteur.chargesDeTravailDe(copie(g), undefined, optsC)));
        if (b && b.consigne) { consignes++; if (b.consigne.palier) paliers++; }
      });
      sansPalier += h.groupes.filter((g) => !g.series.some((s) => s.type_serie === 'travail' && s.reps >= 9)).length;
    }
    expect(consignes).toBeGreaterThan(100);
    expect(paliers).toBeGreaterThan(50);
    expect(sansPalier).toBeGreaterThan(100);   // la fixture rejoue vraiment des séances sans palier (le chemin de la consigne par séance)
  });

  test('records : les médailles de chaque séance et le drapeau des points sont ceux d’avant', () => {
    let medailles = 0;
    for (let essai = 0; essai < 12; essai++) {
      const h = tirer(10 + Math.floor(alea() * 50));
      const FA = ANCIEN.THFaits.creer(), FN = NOUVEAU.THFaits.creer();
      const ca = corpusDe(ANCIEN, h), cn = corpusDe(NOUVEAU, h);
      FA.seancesAvecSeries(ca).forEach((s) => {
        const a = FA.recordsDeLaSeance(ca, s), b = FN.recordsDeLaSeance(cn, s);
        expect(dire(b)).toBe(dire(a));
        medailles += a.length;
      });
      ['exo-a', 'exo-b'].forEach((slug) => {
        expect(dire(FN.pointsDeLExercice(cn, slug).points.map((p) => p.record))).toBe(dire(FA.pointsDeLExercice(ca, slug).points.map((p) => p.record)));
      });
    }
    expect(medailles).toBeGreaterThan(30);
  });
});
