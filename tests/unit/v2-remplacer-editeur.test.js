//
// 60-3 — « Remplacer » dans l'éditeur de routine (ECRAN-SAISIE §7 quindecies.8).
//
//   · `Routines.exerciceRemplace` : le remplaçant prend la place — même rang,
//     même groupe de superset, mêmes séries (types, reps visées, durée,
//     distance), même repos, même note — et la charge de départ est RETIRÉE ;
//   · §7 decies reste vrai : remplacer un exercice d'un superset À DEUX garde
//     un superset à deux (configuration discriminante : sur trois, un groupe
//     amputé d'un exercice resterait un groupe) ;
//   · la feuille est celle de « Machine prise » SANS « Plus tard », avec
//     « Chercher dans le catalogue » ; la séance garde la sienne ;
//   · les gestes (`app.js`, bac `vm`, vrais modules) : les frères par
//     `Seance.freresProposes` (la même fonction), le choix — frère ou
//     catalogue — remplace à sa place, et rien n'est écrit avant « Enregistrer ».
//
// Environnement jsdom (PAS de docblock `node`) : `rendu.js` se termine par `this`.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
const Routines = require('../../v2/js/routines.js');
const Seance = require('../../v2/js/seance.js');
const ProfilReel = require('../../v2/js/profil.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const texte = (n) => n.textContent.replace(/\s+/g, ' ').trim();

// Un exercice de routine en édition, au vocabulaire de la saisie (`enSaisie`).
const ligne = (type, reps, charge, duree, distance) => ({ id: 'set-' + type + reps, type_serie: type, note: null, rpe: null,
  ressenti: null, validee_a: null, reps, charge_kg: charge === undefined ? null : charge,
  duree_s: duree === undefined ? null : duree, distance_m: distance === undefined ? null : distance });
const exo = (id, slug, groupe, series, extra) => Object.assign({ id, exercise_slug: slug, series,
  repos_cible_s: 120, groupe_superset: groupe === undefined ? null : groupe, note: null }, extra || {});

describe('Routines.exerciceRemplace — à sa place, sans la charge de départ', () => {
  const avant = exo('re-1', 'dc-barre', 2, [ligne('echauffement', 10, 40), ligne('travail', 8, 80), ligne('degressive', 12, 60)],
    { repos_cible_s: 150, note: 'Coudes serrés' });

  test('les séries (types, reps visées), le repos, la note, le groupe restent ; la charge part ; c’est une ligne neuve', () => {
    const r = Routines.exerciceRemplace(avant, 'dc-halteres');
    expect(r.exercise_slug).toBe('dc-halteres');
    expect(r.id).toBeNull();
    expect(r.groupe_superset).toBe(2);
    expect(r.repos_cible_s).toBe(150);
    expect(r.note).toBe('Coudes serrés');
    expect(r.series.map((l) => [l.type_serie, l.reps, l.charge_kg, l.id])).toEqual([
      ['echauffement', 10, null, null], ['travail', 8, null, null], ['degressive', 12, null, null]]);
    // L'original n'est pas touché (le brouillon garde sa forme jusqu'au remplacement).
    expect(avant.series[1].charge_kg).toBe(80);
    expect(avant.exercise_slug).toBe('dc-barre');
  });

  test('le même exercice choisi : rien ne change, sa charge de départ reste', () => {
    expect(Routines.exerciceRemplace(avant, 'dc-barre')).toBe(avant);
    expect(avant.series[1].charge_kg).toBe(80);
  });

  test('la durée et la distance du cardio restent', () => {
    const tapis = exo('re-2', 'tapis', null, [ligne('travail', null, null, 600, 1500)]);
    const r = Routines.exerciceRemplace(tapis, 'velo');
    expect(r.series.map((l) => [l.duree_s, l.distance_m])).toEqual([[600, 1500]]);
  });

  test('⚠️ DISCRIMINANT §7 decies — un exercice d’un superset À DEUX remplacé : le superset reste à deux', () => {
    const liste = [exo('a', 'squat-barre', null, [ligne('travail', 5)]),
      exo('b', 'dc-barre', 1, [ligne('travail', 8)]), exo('c', 'rowing-barre', 1, [ligne('travail', 10)])];
    liste[1] = Routines.exerciceRemplace(liste[1], 'dc-halteres');
    const apres = Routines.renumeroter(liste);
    expect(apres.map((e) => [e.exercise_slug, e.groupe_superset])).toEqual([
      ['squat-barre', null], ['dc-halteres', 1], ['rowing-barre', 1]]);
    expect(Routines.estGroupe(apres, 1)).toBe(true);
    expect(Routines.estGroupe(apres, 2)).toBe(true);
  });
});

describe('la feuille : celle de « Machine prise », sans « Plus tard »', () => {
  const rendre = (vue) => {
    const cible = document.createElement('div');
    const appels = [];
    Rendu().rendreFeuilleMachinePrise(cible, Object.assign({
      surCatalogue: () => appels.push('catalogue')
    }, vue));
    return { cible, appels };
  };
  const freres = [
    { nom: 'Développé couché haltères', fait: { date: '2026-09-20T10:00:00Z', charge_kg: 30, reps: 10 }, surChoisir: () => {} },
    { nom: 'Développé couché machine', fait: null, surChoisir: () => {} }];

  test('l’éditeur : « Remplacer », les frères et leur « Dernière fois… », puis « Chercher dans le catalogue »', () => {
    const { cible, appels } = rendre({ titre: 'Remplacer', nom: 'Développé couché', tard: null, freres,
      chercher: 'Chercher dans le catalogue' });
    expect(cible.querySelector('.feuille-t').firstChild.textContent).toBe('Remplacer');
    expect(texte(cible.querySelector('.feuille-t em'))).toBe('Développé couché');
    expect(cible.querySelector('.plus-tard')).toBeNull();
    const boutons = Array.from(cible.querySelectorAll('.feuille-menu button')).map((b) => b.querySelector('.mp-titre')
      ? texte(b.querySelector('.mp-titre')) : texte(b));
    expect(boutons).toEqual(['Un frère : Développé couché haltères', 'Un frère : Développé couché machine', 'Chercher dans le catalogue']);
    expect(texte(cible.querySelectorAll('.choix-mp .mp-sous')[1])).toBe('Première fois ici');
    cible.querySelector('.chercher-catalogue').click();
    expect(appels).toEqual(['catalogue']);
  });

  test('l’éditeur, sans frère : la phrase, puis « Chercher dans le catalogue » (pas « Remplacer l’exercice »)', () => {
    const { cible } = rendre({ titre: 'Remplacer', nom: 'Planche', tard: null, freres: [], chercher: 'Chercher dans le catalogue' });
    expect(texte(cible.querySelector('.sans-frere'))).toBe('Pas de frère au catalogue pour cet exercice.');
    expect(Array.from(cible.querySelectorAll('.feuille-menu button')).map(texte)).toEqual(['Chercher dans le catalogue']);
  });

  test('la séance garde la sienne : avec des frères, pas d’entrée vers le catalogue ; sans, « Remplacer l’exercice »', () => {
    const avec = rendre({ nom: 'Développé couché', tard: null, freres });
    expect(avec.cible.querySelector('.feuille-t').firstChild.textContent).toBe('Machine prise');
    expect(avec.cible.querySelector('.chercher-catalogue')).toBeNull();
    const sans = rendre({ nom: 'Planche', tard: null, freres: [] });
    expect(Array.from(sans.cible.querySelectorAll('.feuille-menu button')).map(texte)).toEqual(['Remplacer l’exercice']);
  });

  test('le menu ⋯ d’un exercice de l’éditeur porte « Remplacer », en tête', () => {
    const cible = document.createElement('div');
    let remplace = 0;
    Rendu().rendreFeuilleExoRoutine(cible, { nom: 'Développé couché', peutGrouper: true, estGroupe: false,
      surRemplacer: () => { remplace++; }, surGrouper: () => {}, surDegrouper: () => {}, surReorganiser: null, surSupprimer: () => {} });
    const boutons = Array.from(cible.querySelectorAll('.feuille-menu button'));
    expect(boutons.map(texte)).toEqual(['Remplacer', 'Grouper avec le suivant', 'Dégrouper', 'Réorganiser…', 'Supprimer l’exercice']);
    boutons[0].click();
    expect(remplace).toBe(1);
  });
});

// ═══ LES GESTES (`app.js`) ══════════════════════════════════════════════════
const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
function extraire(nom) {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable dans v2/js/app.js : ' + nom);
  return m[0];
}
const FONCTIONS = ['ouvrirFeuilleExoRoutine', 'ouvrirRemplacerDansLEditeur', 'remplacerDansLEditeur', 'renumeroterBrouillon',
  'freresDe', 'neVeutPasDansLEditeur', 'annoncerDansLEditeur', 'faitsDesFreres', 'horsDuMateriel', 'nomExoBrouillon', 'rendreCatalogue', 'ouvrirCatalogue', 'indiceOuNul'];

const CATALOGUE = [
  { slug: 'dc-barre', nom: 'Développé couché (barre)', mesure: 'charge_reps', mouvement: 'developpe_couche', equipement: 'barre' },
  { slug: 'dc-halteres', nom: 'Développé couché (haltères)', mesure: 'charge_reps', mouvement: 'developpe_couche', equipement: 'halteres' },
  { slug: 'dc-machine', nom: 'Développé couché (machine)', mesure: 'charge_reps', mouvement: 'developpe_couche', equipement: 'machine' },
  { slug: 'rowing-barre', nom: 'Rowing (barre)', mesure: 'charge_reps', mouvement: 'rowing', equipement: 'barre' },
  { slug: 'squat-barre', nom: 'Squat (barre)', mesure: 'charge_reps', mouvement: 'squat', equipement: 'barre' },
  { slug: 'curl', nom: 'Curl', mesure: 'charge_reps', mouvement: null, equipement: 'halteres' }
];

function bac(options) {
  const o = options || {};
  const journal = { ecritures: 0, voile: 0, ferme: 0, rendus: 0, sauves: 0, catalogue: 0 };
  const ctx = {
    Routines, Seance, Modele,
    local: { exercices: o.catalogue || CATALOGUE },
    profil: { materiel: o.equipements ? 'banc' : null },
    // 60-1 — le matériel du profil RANGE les frères (`horsDuMateriel`) : `o.equipements` le pose.
    Profil: { equipementsDe: () => o.equipements || null,
              estHorsMateriel: (eq, autorises) => autorises.indexOf(eq) < 0,
              // 60-4 — les écartés en fin de liste : les VRAIES fonctions du profil.
              ecartesDe: ProfilReel.ecartesDe, ecartesALaFin: ProfilReel.ecartesALaFin, preparerChamps: ProfilReel.preparerChamps },
    // `derniereSeanceDe` : le fait du frère, la fonction de « Dernière séance ».
    derniereSeanceDe: (slug) => (!o.jamaisFait && slug === 'dc-machine' ? { charge_kg: 70, reps: 8, date: '2026-09-30T10:00:00Z' } : null),
    brouillon: { id: 'r1', nom: 'Push', exercices: [
      exo('e0', 'squat-barre', null, [ligne('travail', 5, 100)]),
      exo('e1', 'dc-barre', 1, [ligne('echauffement', 10, 40), ligne('travail', 8, 80)], { repos_cible_s: null, note: 'Pause' }),
      exo('e2', 'rowing-barre', 1, [ligne('travail', 10, 60)], { repos_cible_s: 90 })
    ], existantes: [] },
    Donnees: new Proxy({}, { get: () => () => { journal.ecritures++; return Promise.resolve({}); } }),
    Rendu: {
      rendreFeuilleExoRoutine: (c, v) => { ctx.__menu = v; },
      rendreFeuilleMachinePrise: (c, v) => { ctx.__feuille = v; },
      rendreResultatsExo: (c, liste, choisir) => { ctx.__choisir = choisir; },
      message: () => {}
    },
    $: (id) => ({ id, value: '', focus: () => {} }),
    ouvrirVoile: () => { journal.voile++; },
    fermerVoile: () => { journal.ferme++; },
    apresEditeur: () => { journal.rendus++; journal.sauves++; return Promise.resolve(); },
    ouvrirReorganisation: () => {},
    intentionCatalogue: { apres: null, remplace: null },
    faitsDuCatalogue: null,
    ordreDuCatalogue: () => null,
    seance: null, vues: { seance: { hidden: true } },
    faits: { datesDesExercices: () => ({}) }, corpus: () => ({})
  };
  vm.createContext(ctx);
  FONCTIONS.forEach((f) => vm.runInContext(extraire(f), ctx));
  return { ctx, journal, appel: (code) => vm.runInContext(code, ctx) };
}

describe('les gestes : « Remplacer » dans l’éditeur', () => {
  test('le menu ⋯ ouvre la feuille : les frères par `freresProposes` (même ordre : le déjà fait d’abord), sans « Plus tard »', () => {
    const b = bac();
    b.appel('ouvrirFeuilleExoRoutine(1)');
    b.ctx.__menu.surRemplacer();
    const v = b.ctx.__feuille;
    expect(v.titre).toBe('Remplacer');
    expect(v.nom).toBe('Développé couché (barre)');
    expect(v.tard).toBeNull();
    expect(v.chercher).toBe('Chercher dans le catalogue');
    const attendus = Seance.freresProposes('dc-barre', Modele.indexerExercices(CATALOGUE),
      { 'dc-machine': { charge_kg: 70, reps: 8, date: '2026-09-30T10:00:00Z' } }, ['squat-barre', 'dc-barre', 'rowing-barre'], null);
    expect(v.freres.map((f) => f.nom)).toEqual(attendus.map((f) => Modele.nommer(Modele.indexerExercices(CATALOGUE), f.slug)));
    expect(v.freres.map((f) => f.nom)).toEqual(['Développé couché (machine)', 'Développé couché (haltères)']);
    expect(v.freres[0].fait).toEqual({ charge_kg: 70, reps: 8, date: '2026-09-30T10:00:00Z' });
  });

  test('un frère choisi prend la place : rang, superset, séries, repos, note — sans la charge ; rien n’est écrit', () => {
    const b = bac();
    b.appel('ouvrirRemplacerDansLEditeur(1)');
    b.ctx.__feuille.freres[0].surChoisir();
    const ex = b.ctx.brouillon.exercices;
    expect(ex.map((e) => [e.exercise_slug, e.groupe_superset])).toEqual([
      ['squat-barre', null], ['dc-machine', 1], ['rowing-barre', 1]]);
    expect(ex[1].series.map((l) => [l.type_serie, l.reps, l.charge_kg])).toEqual([['echauffement', 10, null], ['travail', 8, null]]);
    expect(ex[1].note).toBe('Pause');
    expect(ex[1].id).toBeNull();
    // Les autres exercices gardent leur charge : seule la place remplacée la perd.
    expect(ex[0].series[0].charge_kg).toBe(100);
    expect(b.journal.ecritures).toBe(0);
    expect(b.journal.sauves).toBe(1);   // le brouillon, sur l'appareil — pas la base
  });

  test('« Chercher dans le catalogue » : le choix remplace à sa place, il ne s’ajoute pas en fin', () => {
    const b = bac();
    b.appel('ouvrirRemplacerDansLEditeur(2)');
    b.ctx.__feuille.surCatalogue();
    b.ctx.__choisir({ slug: 'curl' });
    const ex = b.ctx.brouillon.exercices;
    expect(ex.map((e) => [e.exercise_slug, e.groupe_superset])).toEqual([
      ['squat-barre', null], ['dc-barre', 1], ['curl', 1]]);
    expect(ex[2].series.map((l) => [l.reps, l.charge_kg])).toEqual([[10, null]]);
    expect(ex[2].repos_cible_s).toBe(90);
    expect(b.journal.ecritures).toBe(0);
  });

  test('⚠️ DISCRIMINANT — « Ajouter un exercice » après un « Remplacer » abandonné : l’intention ne colle pas, il ajoute en fin', () => {
    const b = bac();
    b.appel('ouvrirRemplacerDansLEditeur(1)');
    b.ctx.__feuille.surCatalogue();          // le catalogue s'ouvre en remplacement… et se ferme sans choix
    expect(b.ctx.intentionCatalogue.remplace).toBe(1);
    b.appel('ouvrirCatalogue()');            // « Ajouter un exercice »
    b.ctx.__choisir({ slug: 'curl' });
    expect(b.ctx.brouillon.exercices.map((e) => e.exercise_slug)).toEqual(['squat-barre', 'dc-barre', 'rowing-barre', 'curl']);
  });

  test('le même exercice choisi dans le catalogue : sa ligne et sa charge restent', () => {
    const b = bac();
    b.appel('ouvrirRemplacerDansLEditeur(1)');
    b.ctx.__feuille.surCatalogue();
    b.ctx.__choisir({ slug: 'dc-barre' });
    expect(b.ctx.brouillon.exercices[1].id).toBe('e1');
    expect(b.ctx.brouillon.exercices[1].series[1].charge_kg).toBe(80);
  });

  test('le matériel du profil RANGE les frères, comme « Machine prise » : celui qu’on n’a pas passe après', () => {
    const sans = bac({ jamaisFait: true });
    sans.appel('ouvrirRemplacerDansLEditeur(1)');
    expect(sans.ctx.__feuille.freres.map((f) => f.nom)).toEqual(['Développé couché (haltères)', 'Développé couché (machine)']);
    const avec = bac({ jamaisFait: true, equipements: ['barre', 'machine'] });
    avec.appel('ouvrirRemplacerDansLEditeur(1)');
    expect(avec.ctx.__feuille.freres.map((f) => f.nom)).toEqual(['Développé couché (machine)', 'Développé couché (haltères)']);
  });
});
