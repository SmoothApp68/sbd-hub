//
// 60-4 (5/7) — « JE N'EN VEUX PAS » DANS L'ÉDITEUR, ET LES EXERCICES ÉCARTÉS EN FIN DE LISTE
// (ECRAN-SAISIE §7 quindecies.9, MOTEUR §9.19 ; décidé le 08/10/2026).
//
//   · `Profil.ecartesALaFin` / `rangerParMateriel` : une partition stable — jamais un filtre — appliquée APRÈS le
//     rangement par matériel ; la même liste de frères (`freresDe`) pour « Machine prise », « Remplacer » et le geste ;
//   · le rendu : l'entrée « Je n'en veux pas » du menu ⋯ (à côté de « Remplacer »), la mention « écarté » sous un frère
//     et sous un résultat du catalogue ;
//   · les gestes (`app.js`, bac `vm`, vrais modules) : le premier frère qui n'est ni écarté ni déjà dans la routine
//     remplace (rien n'est écrit en base avant « Enregistrer »), l'exercice est écarté AU GESTE (le profil), aucun frère :
//     la feuille de « Remplacer » s'ouvre ; rien en séance.
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
const Profil = require('../../v2/js/profil.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const texte = (n) => n.textContent.replace(/\s+/g, ' ').trim();
const slugs = (l) => l.map((x) => x.slug);

// ═══ LA RÈGLE (`profil.js`) ═════════════════════════════════════════════════
describe('Profil.ecartesALaFin — une partition stable, jamais un filtre', () => {
  const liste = [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }, { slug: 'd' }, { slug: 'e' }];

  test('les écartés passent APRÈS tout le reste, chacun dans l’ordre où il était ; rien n’est retiré', () => {
    expect(slugs(Profil.ecartesALaFin(liste, ['b', 'd']))).toEqual(['a', 'c', 'e', 'b', 'd']);
    expect(slugs(Profil.ecartesALaFin(liste, ['d', 'b']))).toEqual(['a', 'c', 'e', 'b', 'd']);   // l'ordre de la LISTE, pas celui des écartés
    expect(Profil.ecartesALaFin(liste, ['a', 'b', 'c', 'd', 'e'])).toHaveLength(5);
  });

  test('sans écarté (ou un écarté qui n’y est pas) : la liste reçue, la même référence', () => {
    expect(Profil.ecartesALaFin(liste, [])).toBe(liste);
    expect(Profil.ecartesALaFin(liste, null)).toBe(liste);
    expect(Profil.ecartesALaFin(liste, undefined)).toBe(liste);
    expect(slugs(Profil.ecartesALaFin(liste, ['zzz']))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  test('la liste reçue n’est jamais modifiée', () => {
    const copie = JSON.parse(JSON.stringify(liste));
    Profil.ecartesALaFin(liste, ['a']);
    expect(liste).toEqual(copie);
  });

  test('`ecartesDe` : la liste valide du profil, sinon aucune', () => {
    expect(Profil.ecartesDe({ exercices_ecartes: ['x', 'y'] })).toEqual(['x', 'y']);
    expect(Profil.ecartesDe({ exercices_ecartes: ['x', 'x', '', 3, ' y'] })).toEqual(['x']);
    expect(Profil.ecartesDe({ exercices_ecartes: null })).toEqual([]);
    expect(Profil.ecartesDe({})).toEqual([]);
    expect(Profil.ecartesDe(null)).toEqual([]);
  });
});

describe('Profil.rangerParMateriel — les écartés composent avec le matériel', () => {
  const liste = [
    { slug: 'machine1', equipement: 'machine' }, { slug: 'halt1', equipement: 'haltere' },
    { slug: 'machine2', equipement: 'machine' }, { slug: 'halt2', equipement: 'haltere' }];

  test('sans matériel mais avec un écarté : il passe en fin (le matériel n’est pas requis)', () => {
    expect(slugs(Profil.rangerParMateriel(liste, null, {}, ['machine1']))).toEqual(['halt1', 'machine2', 'halt2', 'machine1']);
  });

  test('avec matériel : d’abord ce qu’il a, puis ce qu’il n’a pas, puis les écartés — fait ou non', () => {
    // Maison, minimum : pas de machine.
    expect(slugs(Profil.rangerParMateriel(liste, 'maison_minimal', {}, ['halt1']))).toEqual(['halt2', 'machine1', 'machine2', 'halt1']);
    // Un écarté déjà fait n'est PAS épargné par l'historique : il est écarté.
    expect(slugs(Profil.rangerParMateriel(liste, 'maison_minimal', { halt1: 1 }, ['halt1']))).toEqual(['halt2', 'machine1', 'machine2', 'halt1']);
    // Un exercice hors matériel mais écarté : tout à la fin, pas au milieu des hors-matériel.
    expect(slugs(Profil.rangerParMateriel(liste, 'maison_minimal', {}, ['machine1']))).toEqual(['halt1', 'halt2', 'machine2', 'machine1']);
  });

  test('non-régression : sans écarté, comportement de 60-1 inchangé (la même référence quand rien n’est à ranger)', () => {
    expect(Profil.rangerParMateriel(liste, null, {})).toBe(liste);
    expect(Profil.rangerParMateriel(liste, 'salle_complete', {}, [])).toBe(liste);
    expect(slugs(Profil.rangerParMateriel(liste, 'maison_minimal', {}))).toEqual(['halt1', 'halt2', 'machine1', 'machine2']);
  });
});

// ═══ LE RENDU ═══════════════════════════════════════════════════════════════
describe('le rendu : l’entrée du menu et la mention « écarté »', () => {
  const menu = (extra) => {
    const cible = document.createElement('div');
    Rendu().rendreFeuilleExoRoutine(cible, Object.assign({ nom: 'Développé couché', peutGrouper: true, estGroupe: false,
      surRemplacer: () => {}, surGrouper: () => {}, surDegrouper: () => {}, surReorganiser: null, surSupprimer: () => {} }, extra));
    return cible;
  };

  test('« Je n’en veux pas » est dans le menu ⋯, juste après « Remplacer » ; il porte son geste', () => {
    let appels = 0;
    const cible = menu({ surNeVeuxPas: () => { appels++; } });
    expect(Array.from(cible.querySelectorAll('button')).map(texte)).toEqual(
      ['Remplacer', 'Je n’en veux pas', 'Grouper avec le suivant', 'Dégrouper', 'Réorganiser…', 'Supprimer l’exercice']);
    cible.querySelectorAll('button')[1].click();
    expect(appels).toBe(1);
  });

  test('sans le geste (le menu d’avant) : l’entrée est absente', () => {
    expect(Array.from(menu({}).querySelectorAll('button')).map(texte)).not.toContain('Je n’en veux pas');
  });

  test('un frère écarté porte la mention « écarté » ; les autres gardent leur phrase', () => {
    const cible = document.createElement('div');
    Rendu().rendreFeuilleMachinePrise(cible, { titre: 'Remplacer', nom: 'Développé couché', tard: null, chercher: 'Chercher dans le catalogue',
      freres: [{ nom: 'Haltères', fait: null, surChoisir: () => {} }, { nom: 'Machine', fait: null, ecarte: true, surChoisir: () => {} }] });
    const sous = Array.from(cible.querySelectorAll('.choix-mp .mp-sous')).map(texte);
    expect(sous).toEqual(['Première fois ici', 'écarté · Première fois ici']);
    // Il reste PROPOSÉ : c'est un bouton comme les autres.
    expect(cible.querySelectorAll('.choix-mp.frere, .frere').length).toBe(2);
  });

  test('un résultat du catalogue écarté porte « écarté » ; il reste cliquable', () => {
    const cible = document.createElement('div');
    const choisis = [];
    Rendu().rendreResultatsExo(cible, [{ slug: 'a', nom: 'Aaa' }, { slug: 'b', nom: 'Bbb' }], (e) => choisis.push(e.slug), ['b']);
    const boutons = Array.from(cible.querySelectorAll('.resultat'));
    expect(boutons.map((b) => b.firstChild.textContent)).toEqual(['Aaa', 'Bbb']);
    expect(boutons[0].querySelector('.resultat-mention')).toBeNull();
    expect(texte(boutons[1].querySelector('.resultat-mention'))).toBe('écarté');
    boutons[1].click();
    expect(choisis).toEqual(['b']);
  });

  test('sans écartés (l’appel d’avant) : aucune mention', () => {
    const cible = document.createElement('div');
    Rendu().rendreResultatsExo(cible, [{ slug: 'a', nom: 'Aaa' }], () => {});
    expect(cible.querySelector('.resultat-mention')).toBeNull();
  });

  test('« Machine prise » en séance n’a PAS de « Je n’en veux pas » (un refus y est souvent passager)', () => {
    const cible = document.createElement('div');
    Rendu().rendreFeuilleMachinePrise(cible, { nom: 'Développé couché', tard: { apres: 'Rowing', surChoisir: () => {} },
      freres: [{ nom: 'Haltères', fait: null, surChoisir: () => {} }] });
    expect(texte(cible)).not.toMatch(/n’en veux pas/);
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
  'freresDe', 'cousinsDe', 'neVeutPasDansLEditeur', 'annoncerDansLEditeur', 'faitsDesFreres', 'horsDuMateriel', 'nomExoBrouillon'];

const CATALOGUE = [
  { slug: 'dc-barre', nom: 'Développé couché (barre)', mesure: 'charge_reps', mouvement: 'developpe_couche', equipement: 'barre' },
  { slug: 'dc-halteres', nom: 'Développé couché (haltères)', mesure: 'charge_reps', mouvement: 'developpe_couche', equipement: 'haltere' },
  { slug: 'dc-machine', nom: 'Développé couché (machine)', mesure: 'charge_reps', mouvement: 'developpe_couche', equipement: 'machine' },
  { slug: 'dc-smith', nom: 'Développé couché (Smith)', mesure: 'charge_reps', mouvement: 'developpe_couche', equipement: 'machine_smith' },
  { slug: 'rowing-barre', nom: 'Rowing (barre)', mesure: 'charge_reps', mouvement: 'rowing', equipement: 'barre' },
  { slug: 'squat-barre', nom: 'Squat (barre)', mesure: 'charge_reps', mouvement: 'squat', equipement: 'barre' },
  { slug: 'curl', nom: 'Curl', mesure: 'charge_reps', mouvement: null, equipement: 'haltere' }
];
const ligne = (type, reps, charge) => ({ id: 'set-' + type + reps, type_serie: type, note: null, rpe: null, ressenti: null,
  validee_a: null, reps, charge_kg: charge === undefined ? null : charge, duree_s: null, distance_m: null });
const exo = (id, slug, series, extra) => Object.assign({ id, exercise_slug: slug, series, repos_cible_s: 120, groupe_superset: null, note: null }, extra || {});

function bac(options) {
  const o = options || {};
  const journal = { ecritures: 0, voile: 0, ferme: 0, rendus: 0, profil: [], feuilles: [], voix: [] };
  const profil = { id: 'u1', materiel: o.materiel || null, exercices_ecartes: o.ecartes || null };
  const noeuds = { 'voix-routine': { id: 'voix-routine', textContent: '', hidden: true } };
  const ctx = {
    Routines, Seance, Modele, Profil, profil,
    local: { exercices: CATALOGUE },
    derniereSeanceDe: (slug) => (slug === 'dc-machine' && !o.jamaisFait ? { charge_kg: 70, reps: 8, date: '2026-09-30T10:00:00Z' } : null),
    brouillon: { id: 'r1', nom: 'Push', exercices: o.exercices || [
      exo('e0', 'squat-barre', [ligne('travail', 5, 100)]),
      exo('e1', 'dc-barre', [ligne('echauffement', 10, 40), ligne('travail', 8, 80)], { repos_cible_s: null, note: 'Pause' }),
      exo('e2', 'rowing-barre', [ligne('travail', 10, 60)], { repos_cible_s: 90 })
    ], existantes: [] },
    Donnees: new Proxy({}, { get: () => () => { journal.ecritures++; return Promise.resolve({}); } }),
    poserProfil: (champs) => { journal.profil.push(JSON.parse(JSON.stringify(champs))); Object.assign(ctx.profil, champs); return Promise.resolve(); },
    Rendu: {
      rendreFeuilleExoRoutine: (c, v) => { ctx.__menu = v; },
      rendreFeuilleMachinePrise: (c, v) => { journal.feuilles.push(v); ctx.__feuille = v; },
      message: () => {}
    },
    $: (id) => noeuds[id] || { id, value: '', focus: () => {} },
    ouvrirVoile: () => { journal.voile++; },
    fermerVoile: () => { journal.ferme++; },
    apresEditeur: () => { journal.rendus++; return Promise.resolve(); },
    ouvrirReorganisation: () => {},
    ouvrirCatalogue: () => {},
    Date, Object
  };
  vm.createContext(ctx);
  FONCTIONS.forEach((f) => vm.runInContext(extraire(f), ctx));
  return { ctx, journal, noeud: noeuds['voix-routine'], appel: (code) => vm.runInContext(code, ctx),
           slugs: () => ctx.brouillon.exercices.map((e) => e.exercise_slug) };
}

describe('les gestes : « Je n’en veux pas » dans l’éditeur', () => {
  test('le menu ⋯ porte le geste : il ferme la feuille, puis remplace', () => {
    const b = bac();
    b.appel('ouvrirFeuilleExoRoutine(1)');
    expect(typeof b.ctx.__menu.surNeVeuxPas).toBe('function');
    const avant = b.journal.ferme;
    b.ctx.__menu.surNeVeuxPas();
    expect(b.journal.ferme).toBe(avant + 1);
    expect(b.slugs()[1]).not.toBe('dc-barre');
  });

  test('⚠️ DISCRIMINANT — le remplaçant est LE PREMIER FRÈRE de la feuille de « Remplacer » : le déjà fait d’abord', () => {
    const b = bac();
    b.appel('ouvrirRemplacerDansLEditeur(1)');
    const premier = b.ctx.__feuille.freres[0].nom;                       // ce que « Remplacer » montre en tête
    b.appel('neVeutPasDansLEditeur(1)');
    expect(premier).toBe('Développé couché (machine)');                  // le seul fait
    expect(b.slugs()).toEqual(['squat-barre', 'dc-machine', 'rowing-barre']);
  });

  test('la place est celle de l’exercice : rang, séries et repos gardés, la charge de départ retirée ; rien n’est écrit en base', () => {
    const b = bac();
    b.appel('neVeutPasDansLEditeur(1)');
    const e = b.ctx.brouillon.exercices[1];
    expect(e.series.map((l) => [l.type_serie, l.reps, l.charge_kg])).toEqual([['echauffement', 10, null], ['travail', 8, null]]);
    expect(e.repos_cible_s).toBeNull();
    expect(e.note).toBe('Pause');
    expect(b.journal.rendus).toBeGreaterThan(0);                         // l'éditeur est redessiné (et le brouillon sauvé sur l'appareil)
    expect(b.journal.ecritures).toBe(0);                                 // rien en base avant « Enregistrer »
  });

  test('l’exercice est écarté AU GESTE, par le profil ; la phrase du coach le dit', () => {
    const b = bac();
    b.appel('neVeutPasDansLEditeur(1)');
    expect(b.journal.profil).toEqual([{ exercices_ecartes: ['dc-barre'] }]);
    expect(b.noeud.textContent).toBe('Développé couché (barre) est remplacé par Développé couché (machine). Je ne te le proposerai plus.');
    expect(b.noeud.hidden).toBe(false);
  });

  test('un frère ÉCARTÉ n’est pas pris : on passe au suivant ; il reste dans la feuille, en dernier, avec sa mention', () => {
    const b = bac({ ecartes: ['dc-machine'] });
    b.appel('ouvrirRemplacerDansLEditeur(1)');
    expect(b.ctx.__feuille.freres.map((f) => [f.nom, !!f.ecarte])).toEqual([
      ['Développé couché (haltères)', false], ['Développé couché (Smith)', false], ['Développé couché (machine)', true]]);
    b.appel('neVeutPasDansLEditeur(1)');
    expect(b.slugs()[1]).toBe('dc-halteres');
    expect(b.journal.profil).toEqual([{ exercices_ecartes: ['dc-machine', 'dc-barre'] }]);       // dans l'ordre où on les a écartés
  });

  test('un frère déjà dans la routine n’est pas pris', () => {
    const b = bac({ exercices: [
      exo('e0', 'dc-barre', [ligne('travail', 8, 80)]), exo('e1', 'dc-machine', [ligne('travail', 8, 70)]),
      exo('e2', 'dc-halteres', [ligne('travail', 8, 30)]) ] });
    b.appel('neVeutPasDansLEditeur(0)');
    expect(b.slugs()).toEqual(['dc-smith', 'dc-machine', 'dc-halteres']);
  });

  test('aucun frère possible : la feuille de « Remplacer » s’ouvre, l’exercice reste, et il est écarté quand même', () => {
    const b = bac({ ecartes: ['dc-halteres', 'dc-machine', 'dc-smith'] });
    const voiles = b.journal.voile;
    b.appel('neVeutPasDansLEditeur(1)');
    expect(b.slugs()).toEqual(['squat-barre', 'dc-barre', 'rowing-barre']);
    expect(b.journal.voile).toBe(voiles + 1);
    expect(b.ctx.__feuille.titre).toBe('Remplacer');
    expect(b.ctx.__feuille.nom).toBe('Développé couché (barre)');
    expect(b.journal.profil).toEqual([{ exercices_ecartes: ['dc-halteres', 'dc-machine', 'dc-smith', 'dc-barre'] }]);
    expect(b.noeud.hidden).toBe(true);                                   // pas de phrase : rien n'a été remplacé
  });

  test('un exercice sans frère au catalogue : la feuille de « Remplacer » aussi, et l’écart est écrit', () => {
    const b = bac();
    b.appel('neVeutPasDansLEditeur(0)');                                 // le squat n'a pas de frère
    expect(b.slugs()).toEqual(['squat-barre', 'dc-barre', 'rowing-barre']);
    expect(b.ctx.__feuille.titre).toBe('Remplacer');
    expect(b.journal.profil).toEqual([{ exercices_ecartes: ['squat-barre'] }]);
  });

  test('l’exercice était déjà écarté (une routine qui le contenait) : rien n’est réécrit, le remplacement a lieu', () => {
    const b = bac({ ecartes: ['dc-barre'] });
    b.appel('neVeutPasDansLEditeur(1)');
    expect(b.journal.profil).toEqual([]);
    expect(b.slugs()[1]).toBe('dc-machine');
  });

  test('le geste est dans le profil LOCAL tout de suite (le vrai `poserProfil` met `profil` à jour avant son premier `await` et ne rejette jamais)', () => {
    const b = bac();
    b.appel('neVeutPasDansLEditeur(1)');
    expect(b.ctx.profil.exercices_ecartes).toEqual(['dc-barre']);
    expect(b.slugs()[1]).toBe('dc-machine');
  });

  test('une place inconnue : rien ne se passe', () => {
    const b = bac();
    b.appel('neVeutPasDansLEditeur(9)');
    expect(b.journal.profil).toEqual([]);
    expect(b.journal.rendus).toBe(0);
  });

  test('l’annonce s’efface : `annoncerDansLEditeur("")` cache la phrase', () => {
    const b = bac();
    b.appel('neVeutPasDansLEditeur(1)');
    expect(b.noeud.hidden).toBe(false);
    b.appel("annoncerDansLEditeur('')");
    expect(b.noeud.textContent).toBe('');
    expect(b.noeud.hidden).toBe(true);
  });
});

describe('les gestes : le catalogue et « Machine prise » rangent les écartés en fin de liste', () => {
  function bacCatalogue(profil) {
    const ctx = { Profil, profil, faitsDuCatalogue: null, faits: { datesDesExercices: () => ({}) }, corpus: () => ({}) };
    vm.createContext(ctx);
    vm.runInContext(extraire('ordreDuCatalogue'), ctx);
    return ctx;
  }
  const liste = [{ slug: 'a', equipement: 'machine' }, { slug: 'b', equipement: 'haltere' }, { slug: 'c', equipement: 'machine' }];

  test('sans matériel ni écarté : aucun rangement (comme avant)', () => {
    expect(vm.runInContext('ordreDuCatalogue()', bacCatalogue({ materiel: null }))).toBeNull();
    expect(vm.runInContext('ordreDuCatalogue()', bacCatalogue(null))).toBeNull();
  });

  test('⚠️ DISCRIMINANT — sans matériel mais avec un écarté : il passe en fin de liste (la sortie anticipée ne le saute pas)', () => {
    const c = bacCatalogue({ materiel: null, exercices_ecartes: ['a'] });
    const ordre = vm.runInContext('ordreDuCatalogue()', c);
    expect(typeof ordre).toBe('function');
    expect(slugs(ordre(liste))).toEqual(['b', 'c', 'a']);
  });

  test('avec matériel et écartés : ce qu’il a, ce qu’il n’a pas, puis les écartés', () => {
    const c = bacCatalogue({ materiel: 'maison_minimal', exercices_ecartes: ['b'] });
    const ordre = vm.runInContext('ordreDuCatalogue()', c);
    // Maison, minimum : pas de machine ('a', 'c' passent après 'b') ; 'b' est écarté : il passe tout à la fin.
    expect(slugs(ordre(liste))).toEqual(['a', 'c', 'b']);
    const sansEcarte = vm.runInContext('ordreDuCatalogue()', bacCatalogue({ materiel: 'maison_minimal' }));
    expect(slugs(sansEcarte(liste))).toEqual(['b', 'a', 'c']);
  });

  test('« Machine prise » en séance : l’écarté est le dernier frère, avec sa mention', () => {
    const vues = [];
    const ctx = {
      Profil, Modele, Seance, profil: { materiel: null, exercices_ecartes: ['dc-halteres'] },
      local: { exercices: CATALOGUE },
      seance: { exercices: [{ exercise_slug: 'dc-barre', series: [] }] },
      faitsDesFreres: () => ({}), fermerVoile: () => {}, remplacerDansLaSeance: () => {}, demanderRemplacement: () => {}, vues
    };
    vm.createContext(ctx);
    ['horsDuMateriel', 'freresDe', 'cousinsDe', 'blocsPourPlusTard', 'vueMachinePrise'].forEach((n) => vm.runInContext(extraire(n), ctx));
    ctx.blocs = [{ exercices: [{ slug: 'dc-barre', nom: 'Développé couché (barre)', series: [] }] }];
    const v = vm.runInContext('vueMachinePrise(blocs, 0, 0)', ctx);
    expect(v.freres.map((f) => [f.nom, !!f.ecarte])).toEqual([
      ['Développé couché (machine)', false], ['Développé couché (Smith)', false], ['Développé couché (haltères)', true]]);
  });
});

// ═══ LA REVUE ADVERSE DE 60-4 : les trous de test ═══════════════════════════
describe('revue adverse — « Je n’en veux pas » : ce que les tests ne tenaient pas', () => {
  test('⚠️ DISCRIMINANT — tous les frères sont DÉJÀ dans la routine : aucun n’est pris, la feuille de « Remplacer » s’ouvre (le garde `deja_dans_la_seance`)', () => {
    const b = bac({ exercices: [
      exo('e0', 'dc-barre', [ligne('travail', 8, 80)]), exo('e1', 'dc-halteres', [ligne('travail', 8, 30)]),
      exo('e2', 'dc-machine', [ligne('travail', 8, 70)]), exo('e3', 'dc-smith', [ligne('travail', 8, 60)]) ] });
    b.appel('neVeutPasDansLEditeur(0)');
    expect(b.slugs()).toEqual(['dc-barre', 'dc-halteres', 'dc-machine', 'dc-smith']);       // rien n'est remplacé
    expect(b.ctx.__feuille.titre).toBe('Remplacer');
    expect(b.noeud.hidden).toBe(true);
    expect(b.journal.profil).toEqual([{ exercices_ecartes: ['dc-barre'] }]);                // écarté quand même
  });

  test('⚠️ DISCRIMINANT — « Je n’en veux pas » n’est dans AUCUN menu de séance (le bloc, le bloc d’un superset, l’exercice d’un superset)', () => {
    const menus = [
      (c) => Rendu().rendreFeuilleBloc(c, { superset: false, noms: 'Squat', surMachinePrise: () => {}, surJaiMal: () => {}, surRemplacer: () => {},
        surGrouper: () => {}, peutGrouper: true, surAjouterApres: () => {}, surReorganiser: () => {}, surProgression: () => {}, surSupprimer: () => {} }),
      (c) => Rendu().rendreFeuilleBloc(c, { superset: true, noms: 'Squat · Curl', surGrouper: () => {}, peutGrouper: false, surAjouterApres: () => {},
        surReorganiser: () => {}, surProgression: () => {}, surSupprimer: () => {} }),
      (c) => Rendu().rendreFeuilleExercice(c, { nom: 'Squat', surMachinePrise: () => {}, surJaiMal: () => {}, surRemplacer: () => {},
        surDegrouper: () => {}, surProgression: () => {}, surSupprimer: () => {} })
    ];
    menus.forEach((rendre) => {
      const cible = document.createElement('div');
      rendre(cible);
      expect(cible.querySelectorAll('button').length).toBeGreaterThan(3);
      expect(texte(cible)).not.toMatch(/n’en veux pas/);
    });
  });

  test('la phrase d’un geste précédent s’efface à l’ouverture du menu d’un exercice (elle ne reste pas sur un état qui a changé)', () => {
    const b = bac();
    b.appel('neVeutPasDansLEditeur(1)');
    expect(b.noeud.hidden).toBe(false);
    b.appel('ouvrirFeuilleExoRoutine(2)');
    expect(b.noeud.textContent).toBe('');
    expect(b.noeud.hidden).toBe(true);
  });

  test('la phrase est AU-DESSUS des exercices et collante (sous une longue routine, elle resterait hors de l’écran)', () => {
    const html = fs.readFileSync(path.join(__dirname, '../../v2/index.html'), 'utf8');
    expect(html.indexOf('id="voix-routine"')).toBeGreaterThan(0);
    expect(html.indexOf('id="voix-routine"')).toBeLessThan(html.indexOf('id="exos-routine"'));
    expect(html).toMatch(/id="voix-routine" class="q-voix voix-collante"/);
    const css = fs.readFileSync(path.join(__dirname, '../../v2/styles.css'), 'utf8');
    expect(css).toMatch(/\.voix-collante\{position:sticky;/);
  });
});

describe('revue adverse — le catalogue : la mention, la limite de 30, la remise à zéro', () => {
  const CAT = [];
  for (let i = 1; i <= 35; i++) CAT.push({ slug: 'curl' + i, nom: 'Curl ' + (i < 10 ? '0' : '') + i, equipement: 'haltere' });

  function bacCat(profil) {
    const rendus = [];
    const ctx = {
      Profil, Routines, profil, local: { exercices: CAT }, seance: null, vues: { seance: { hidden: true } },
      faits: { datesDesExercices: () => ({ frais: true }) }, corpus: () => ({}),
      $: () => ({ value: '', focus: () => {} }),
      Rendu: { rendreResultatsExo: (c, liste, choisir, ecartes) => rendus.push({ slugs: liste.map((x) => x.slug), ecartes }), message: () => {} },
      fermerVoile: () => {}, ouvrirVoile: () => {}, faitsDuCatalogue: { vieux: 1 }, intentionCatalogue: null, rendus,
      indiceOuNul: (v) => (v === undefined || v === null ? null : v)
    };
    vm.createContext(ctx);
    ['ordreDuCatalogue', 'rendreCatalogue', 'ouvrirCatalogue'].forEach((n) => vm.runInContext(extraire(n), ctx));
    return ctx;
  }

  test('⚠️ DISCRIMINANT — le catalogue passe la liste des écartés au rendu (la mention « écarté » en dépend)', () => {
    const c = bacCat({ exercices_ecartes: ['curl3', 'curl9'] });
    vm.runInContext('rendreCatalogue()', c);
    expect(c.rendus[0].ecartes).toEqual(['curl3', 'curl9']);
    expect(c.rendus[0].slugs.slice(-0)).toBeDefined();
    expect(c.rendus[0].slugs.indexOf('curl3')).toBe(-1);                   // rangé en fin de liste, donc hors des 30 premiers…
    expect(c.rendus[0].slugs.length).toBe(30);
  });

  test('⚠️ DISCRIMINANT — la limite de 30 s’applique APRÈS le rangement : un écarté reste TROUVABLE en tapant son nom, et sans écarté la liste d’avant', () => {
    expect(slugs(Routines.chercher(CAT, 'curl', undefined, (l) => l.slice().reverse()))[0]).toBe('curl35');   // l'ordre précède la limite
    const ordre = (l) => Profil.ecartesALaFin(l, ['curl3']);
    const trente = Routines.chercher(CAT, 'curl', undefined, ordre);
    expect(trente.length).toBe(30);
    expect(slugs(trente)).not.toContain('curl3');                              // en fin de liste : hors des 30
    expect(slugs(Routines.chercher(CAT, 'Curl 03', undefined, ordre))).toContain('curl3');   // …mais trouvable par son nom
    expect(slugs(Routines.chercher(CAT, 'curl', undefined, null)).slice(0, 3)).toEqual(['curl1', 'curl2', 'curl3']);
  });

  test('l’ouverture du catalogue remet à zéro les exercices faits relevés (un balayage UNE FOIS par ouverture)', () => {
    const c = bacCat({ exercices_ecartes: ['curl3'] });
    vm.runInContext('ouvrirCatalogue(null, null)', c);
    // Remis à zéro puis relevé de nouveau (ici par la liste de l'ouverture) : jamais le relevé de la fois d'avant.
    expect(c.faitsDuCatalogue).toEqual({ frais: true });
  });
});
