/** @jest-environment node */
//
// 60-1 — LE MATÉRIEL RANGE, IL NE CACHE JAMAIS (QUESTIONNAIRE-COACH-V2 §4).
//
// `profiles.materiel` n'était lu par rien (relevé 60-0) et l'écran promettait
// « Il décide quels exercices peuvent être proposés ». Il range, désormais : dans
// la recherche du catalogue et dans les frères de « Machine prise », ce qui sort
// du matériel passe APRÈS, jamais retiré ; un exercice déjà fait n'est jamais
// rétrogradé ; sans matériel renseigné, rien ne change.
//
// ⚠️ TROIS NIVEAUX : la table et le rangement (purs, `profil.js`) ; la limite de
// la recherche (le rangement passe AVANT elle, sinon un exercice du matériel
// au-delà de la trentième place resterait invisible) ; le branchement dans
// `app.js`, extrait et exécuté (un matériel qu'on oublierait de passer au
// rangement échoue ici, pas sur un téléphone).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

require('../../v2/js/modele.js');
const Profil = require('../../v2/js/profil.js');
const Routines = require('../../v2/js/routines.js');
const Seance = require('../../v2/js/seance.js');
const Modele = require('../../v2/js/modele.js');

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const extraire = (nom) => {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable : ' + nom);
  return m[0];
};

const TOUS = ['aucun', 'barre', 'haltere', 'machine', 'machine_smith', 'poulie', 'elastique', 'kettlebell', 'disque'];
const tri = (l) => l.slice().sort();

describe('60-1 — la table du matériel, exacte', () => {
  test('les neuf équipements de la base au 07/10/2026', () => {
    expect(tri(Profil.EQUIPEMENTS)).toEqual(tri(TOUS));
  });

  test('Salle complète : tout — rien à ranger', () => {
    expect(Profil.equipementsDe('salle_complete')).toBeNull();
  });

  test('Salle basique : tout sauf machine et machine_smith', () => {
    expect(tri(Profil.equipementsDe('salle_basique'))).toEqual(tri(TOUS.filter((e) => e !== 'machine' && e !== 'machine_smith')));
  });

  test('Maison équipée : barre, haltère, disque, kettlebell, élastique, aucun', () => {
    expect(tri(Profil.equipementsDe('maison_equipee'))).toEqual(tri(['barre', 'haltere', 'disque', 'kettlebell', 'elastique', 'aucun']));
  });

  test('Maison minimale : haltère, kettlebell, élastique, aucun', () => {
    expect(tri(Profil.equipementsDe('maison_minimal'))).toEqual(tri(['haltere', 'kettlebell', 'elastique', 'aucun']));
  });

  test('Poids du corps : aucun, élastique', () => {
    expect(tri(Profil.equipementsDe('poids_du_corps'))).toEqual(tri(['aucun', 'elastique']));
  });

  test('la poulie est « salle seulement » : complète et basique, aucune maison', () => {
    expect(Profil.equipementsDe('salle_basique')).toContain('poulie');
    ['maison_equipee', 'maison_minimal', 'poids_du_corps'].forEach((m) => {
      expect(Profil.equipementsDe(m)).not.toContain('poulie');
    });
  });

  test('pas de matériel renseigné (ou une valeur inconnue) : rien à ranger', () => {
    [null, undefined, '', 'salle', 'constructor', '__proto__'].forEach((v) => {
      expect(Profil.equipementsDe(v)).toBeNull();
    });
  });

  test('la liste rendue est une copie : la table ne se modifie pas de l’extérieur', () => {
    const a = Profil.equipementsDe('maison_minimal');
    a.push('machine');
    expect(Profil.equipementsDe('maison_minimal')).not.toContain('machine');
  });

  test('estHorsMateriel : un équipement connu que le matériel n’a pas, et rien d’autre', () => {
    const maison = Profil.equipementsDe('maison_minimal');
    expect(Profil.estHorsMateriel('machine', maison)).toBe(true);
    expect(Profil.estHorsMateriel('haltere', maison)).toBe(false);
    // On ne devine pas : l'absence de valeur, ou une valeur inconnue, ne sort jamais du matériel.
    [null, undefined, '', 'trx'].forEach((e) => expect(Profil.estHorsMateriel(e, maison)).toBe(false));
    expect(Profil.estHorsMateriel('machine', null)).toBe(false);
  });
});

describe('60-1 — rangerParMateriel : après, jamais retiré', () => {
  const CAT = [
    { slug: 'presse', equipement: 'machine' }, { slug: 'dc-barre', equipement: 'barre' },
    { slug: 'curl-h', equipement: 'haltere' }, { slug: 'tractions', equipement: 'aucun' },
    { slug: 'ecarte-poulie', equipement: 'poulie' }, { slug: 'smith', equipement: 'machine_smith' },
    { slug: 'kb', equipement: 'kettlebell' }, { slug: 'inconnu', equipement: 'trx' }, { slug: 'sans', equipement: null }
  ];
  const slugs = (l) => l.map((x) => x.slug);

  test('⚠️ DISCRIMINANT — Maison minimale : l’haltère, le poids du corps, le kettlebell en premier ; les machines APRÈS, toutes présentes', () => {
    const r = Profil.rangerParMateriel(CAT, 'maison_minimal', null);
    // Ce qui est dans le matériel (et ce qu'on ne sait pas classer), dans l'ordre d'origine ;
    // puis ce qui n'y est pas, dans l'ordre d'origine.
    expect(slugs(r)).toEqual(['curl-h', 'tractions', 'kb', 'inconnu', 'sans',
      'presse', 'dc-barre', 'ecarte-poulie', 'smith']);
  });

  test('NE CACHE JAMAIS : la même longueur, les mêmes exercices, pour chaque matériel', () => {
    ['salle_complete', 'salle_basique', 'maison_equipee', 'maison_minimal', 'poids_du_corps', null, 'inconnu'].forEach((m) => {
      const r = Profil.rangerParMateriel(CAT, m, null);
      expect(r).toHaveLength(CAT.length);
      expect(tri(slugs(r))).toEqual(tri(slugs(CAT)));
    });
  });

  test('Salle complète et « pas renseigné » : la liste reçue, dans l’ordre reçu', () => {
    expect(slugs(Profil.rangerParMateriel(CAT, 'salle_complete', null))).toEqual(slugs(CAT));
    expect(slugs(Profil.rangerParMateriel(CAT, null, null))).toEqual(slugs(CAT));
    expect(slugs(Profil.rangerParMateriel(CAT, undefined, {}))).toEqual(slugs(CAT));
  });

  test('un exercice DÉJÀ FAIT n’est jamais rétrogradé, même hors matériel', () => {
    const faits = { presse: '2026-09-30T10:00:00Z', smith: '2026-09-01T10:00:00Z' };
    const r = slugs(Profil.rangerParMateriel(CAT, 'maison_minimal', faits));
    // « presse » et « smith » restent à leur rang d'origine parmi le premier groupe.
    expect(r.slice(0, 7)).toEqual(['presse', 'curl-h', 'tractions', 'smith', 'kb', 'inconnu', 'sans']);
    expect(r.slice(7)).toEqual(['dc-barre', 'ecarte-poulie']);
  });

  test('témoin : sans historique, les mêmes exercices sortent bien du matériel (sinon le test d’au-dessus ne prouve rien)', () => {
    const r = slugs(Profil.rangerParMateriel(CAT, 'maison_minimal', {}));
    expect(r.indexOf('presse')).toBeGreaterThan(r.indexOf('kb'));
    expect(r.indexOf('smith')).toBeGreaterThan(r.indexOf('kb'));
  });

  test('l’ordre relatif est conservé dans chaque groupe (rangement stable)', () => {
    const r = slugs(Profil.rangerParMateriel(CAT, 'maison_minimal', null));
    const apres = r.slice(r.indexOf('presse'));
    expect(apres).toEqual(['presse', 'dc-barre', 'ecarte-poulie', 'smith']);
  });
});

// 126 (ES §7 quindecies.11) — le rangement du matériel est un critère de `Routines.chercher` (`options.equipements`,
// la règle `Profil.estHorsMateriel`), il remplace l'ancien 4ᵉ argument `ordre`. Il range toujours AVANT la limite.
describe('60-1 — la recherche du catalogue : le rangement passe AVANT la limite', () => {
  // 40 machines qui précèdent, par le nom, 5 haltères : sans rangement, la
  // limite de 30 ne montre que des machines.
  const CAT = [];
  for (let i = 1; i <= 40; i++) CAT.push({ slug: 'a' + i, nom: 'Aaa ' + (i < 10 ? '0' : '') + i, equipement: 'machine' });
  for (let i = 1; i <= 5; i++) CAT.push({ slug: 'z' + i, nom: 'Zzz ' + i, equipement: 'haltere' });
  const avecMateriel = (o) => Object.assign({ equipements: Profil.equipementsDe('maison_minimal') }, o || {});

  test('témoin : sans rangement, la limite de 30 ne montre aucun haltère', () => {
    const r = Routines.chercher(CAT, '');
    expect(r).toHaveLength(30);
    expect(r.filter((x) => x.equipement === 'haltere')).toEqual([]);
  });

  test('⚠️ DISCRIMINANT — avec le matériel, les cinq haltères sont en tête, et les machines suivent (jusqu’à la limite)', () => {
    const r = Routines.chercher(CAT, '', avecMateriel());
    expect(r).toHaveLength(30);
    expect(r.slice(0, 5).map((x) => x.slug)).toEqual(['z1', 'z2', 'z3', 'z4', 'z5']);
    expect(r[5].equipement).toBe('machine');
  });

  test('NE CACHE JAMAIS : sans limite, les 45 exercices sont là', () => {
    const r = Routines.chercher(CAT, '', avecMateriel({ limite: 100000 }));
    expect(r).toHaveLength(45);
  });

  test('une requête garde sa pertinence : « commence par » passe avant le matériel (126), le matériel range à rang égal', () => {
    const cat = [{ slug: 'pc', nom: 'Presse à cuisses', equipement: 'machine' },
      { slug: 'pb', nom: 'Presse bulgare haltères', equipement: 'haltere' },
      { slug: 'pm', nom: 'Développé presse militaire', equipement: 'haltere' }];
    expect(Routines.chercher(cat, 'presse').map((x) => x.slug)).toEqual(['pc', 'pb', 'pm']);
    // 126 — avant : ['pb', 'pm', 'pc'] (le matériel passait devant la pertinence). ES §7 quindecies.11 : le critère 1
    // (le nom commence par le mot tapé) précède le matériel (critère 6) — « pm » ne commence pas par « presse ».
    expect(Routines.chercher(cat, 'presse', avecMateriel()).map((x) => x.slug)).toEqual(['pb', 'pc', 'pm']);
  });

  test('sans matériel, champ vide : l’alphabet (la liste « Tous mes exercices » ne change pas)', () => {
    expect(Routines.chercher(CAT, '', { limite: 100000 }).map((x) => x.slug)).toEqual(CAT.map((x) => x.slug));
  });
});

describe('60-1 — « Machine prise » : les frères que le matériel n’a pas passent après', () => {
  const IDX = {
    base: { slug: 'base', nom: 'Presse à cuisses', mouvement: 'presse', equipement: 'machine' },
    hack: { slug: 'hack', nom: 'Hack squat', mouvement: 'presse', equipement: 'machine' },
    split: { slug: 'split', nom: 'Squat bulgare', mouvement: 'presse', equipement: 'haltere' },
    goblet: { slug: 'goblet', nom: 'Goblet squat', mouvement: 'presse', equipement: 'kettlebell' },
    pistol: { slug: 'pistol', nom: 'Pistol squat', mouvement: 'presse', equipement: 'aucun' }
  };
  const autorises = Profil.equipementsDe('maison_minimal');
  const hors = (s) => Profil.estHorsMateriel(IDX[s].equipement, autorises);
  const ordre = (faits, h) => Seance.freresProposes('base', IDX, faits, ['base'], h).map((f) => f.slug);

  test('témoin : sans matériel, l’ordre d’avant (par nom)', () => {
    expect(ordre({}, undefined)).toEqual(['goblet', 'hack', 'pistol', 'split']);
  });

  test('⚠️ DISCRIMINANT — Maison minimale : la machine passe après, toujours proposée', () => {
    const r = ordre({}, hors);
    expect(r).toEqual(['goblet', 'pistol', 'split', 'hack']);
    expect(r).toContain('hack');
  });

  test('un frère déjà fait n’est jamais rétrogradé : il reste avant ceux sans historique', () => {
    const faits = { hack: { date: '2026-09-30T10:00:00Z' } };
    const r = ordre(faits, hors);
    expect(r[0]).toBe('hack');
    expect(r.slice(1)).toEqual(['goblet', 'pistol', 'split']);
  });
});

describe('60-1 — le branchement dans app.js', () => {
  // 126 — le champ vide montre les suggestions (ES §7 quindecies.11) : on tape « exo », que tous les noms portent.
  const CAT = [];
  for (let i = 1; i <= 40; i++) CAT.push({ slug: 'a' + i, nom: 'Exo Aaa ' + (i < 10 ? '0' : '') + i, equipement: 'machine' });
  for (let i = 1; i <= 5; i++) CAT.push({ slug: 'z' + i, nom: 'Exo Zzz ' + i, equipement: 'haltere' });

  function bacCatalogue(profil, comptes) {
    const sorties = [];
    const ctx = {
      Profil, Routines, Modele, profil, local: { exercices: CAT, alias: [] }, seance: null, vues: { seance: { hidden: true } },
      brouillon: null, construit: null, intentionCatalogue: { apres: null, remplace: null, apercu: null, rattacher: null },
      // 126 — le nombre de séances de chaque exercice fait (`faits.seancesParExercice`), plus sa date.
      faits: { seancesParExercice: () => comptes || {} }, corpus: () => ({}),
      $: () => ({ value: 'exo' }), Rendu: { rendreResultatsExo: (c, liste) => sorties.push(liste.map((x) => x.slug)), message: () => {},
                                           rendreFiltresExo: () => {} },
      // 67B — les filtres du catalogue (leurs tests : `v2-catalogue-filtres`).
      filtresCatalogue: { equipement: null, muscle: null }, FILTRES_CATALOGUE: { equipement: { tous: 'Tout le matériel', libelle: (c) => c }, muscle: { tous: 'Tous les muscles', libelle: (c) => c } }, descriptionExo: () => '', ouvrirChoixFiltre: () => {}, retirerFiltre: () => {},
      fermerVoile: () => {}, faitsDuCatalogue: null, contexteDuCatalogue: null, sorties
    };
    vm.createContext(ctx);
    ['optionsDuCatalogue', 'contexteCatalogue', 'slugsDesLignes', 'mentionsExo', 'rendreCatalogue']
      .forEach((n) => vm.runInContext(extraire(n), ctx));
    return ctx;
  }

  test('⚠️ DISCRIMINANT — Maison minimale : le catalogue s’ouvre sur les haltères', () => {
    const c = bacCatalogue({ materiel: 'maison_minimal' });
    vm.runInContext('rendreCatalogue()', c);
    expect(c.sorties[0].slice(0, 5)).toEqual(['z1', 'z2', 'z3', 'z4', 'z5']);
  });

  test('témoin : sans matériel, ou en Salle complète, l’ordre d’avant', () => {
    [null, { materiel: null }, { materiel: 'salle_complete' }].forEach((p) => {
      const c = bacCatalogue(p);
      vm.runInContext('rendreCatalogue()', c);
      expect(c.sorties[0].slice(0, 3)).toEqual(['a1', 'a2', 'a3']);
    });
  });

  test('un exercice déjà fait (même une machine) garde son rang', () => {
    const c = bacCatalogue({ materiel: 'maison_minimal' }, { a1: 3 });
    vm.runInContext('rendreCatalogue()', c);
    expect(c.sorties[0].slice(0, 6)).toEqual(['a1', 'z1', 'z2', 'z3', 'z4', 'z5']);
  });

  function bacFreres(profil) {
    const vues = [];
    const ctx = {
      Profil, Modele, Seance, profil,
      local: { exercices: [
        { slug: 'base', nom: 'Presse à cuisses', mouvement: 'presse', equipement: 'machine' },
        { slug: 'hack', nom: 'Aaa machine', mouvement: 'presse', equipement: 'machine' },
        { slug: 'goblet', nom: 'Goblet squat', mouvement: 'presse', equipement: 'kettlebell' }] },
      seance: { exercices: [{ exercise_slug: 'base', series: [] }] },
      faitsDesFreres: () => ({}), fermerVoile: () => {}, remplacerDansLaSeance: () => {}, demanderRemplacement: () => {},
      vues
    };
    vm.createContext(ctx);
    ['horsDuMateriel', 'freresDe', 'cousinsDe', 'blocsPourPlusTard', 'vueMachinePrise'].forEach((n) => vm.runInContext(extraire(n), ctx));
    ctx.blocs = [{ exercices: [{ slug: 'base', nom: 'Presse à cuisses', series: [] }] }];
    return ctx;
  }

  test('témoin : sans matériel, la machine passe d’abord (par le nom)', () => {
    [{ materiel: null }, { materiel: 'salle_complete' }, null].forEach((p) => {
      const c = bacFreres(p);
      expect(vm.runInContext('vueMachinePrise(blocs, 0, 0).freres.map(function (f) { return f.nom; })', c))
        .toEqual(['Aaa machine', 'Goblet squat']);
    });
  });

  test('⚠️ DISCRIMINANT — « Machine prise » en Maison minimale : le kettlebell avant la machine, la machine toujours là', () => {
    const c = bacFreres({ materiel: 'maison_minimal' });
    expect(vm.runInContext('vueMachinePrise(blocs, 0, 0).freres.map(function (f) { return f.nom; })', c))
      .toEqual(['Goblet squat', 'Aaa machine']);
  });
});
