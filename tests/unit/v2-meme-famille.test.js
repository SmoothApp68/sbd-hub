/** @jest-environment node */
//
// 67A — « MÊME FAMILLE » DANS REMPLACER (MOTEUR §13.6 bis). `Modele.cousinsDe` est la seule lecture de
// `schema_mouvement` ; la liste de la feuille est rangée comme les frères (`Seance.exercicesProposes`), les écartés à
// la fin, 5 au plus ; le catalogue lit la colonne ; et AUCUN calcul ne la lit — les variantes à la barre du bilan, la
// barre lourde du générateur, les supersets et le frère qui progresse lisent les frères, et eux seuls.

process.env.TZ = 'Europe/Paris';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.self = global;
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
const Profil = require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
require('../../v2/js/parcours.js');            // 76 : la relecture lit son repère squat ÷ couché
const Seance = require('../../v2/js/seance.js');
require('../../v2/js/routines.js');
const Faits = require('../../v2/js/faits.js');
const G = require('../../v2/js/generateur.js');

const copie = (x) => JSON.parse(JSON.stringify(x));
const fiche = (slug, mouvement, schema, extra) => Object.assign({ slug, nom: slug, mesure: 'charge_reps',
  charge: 'externe', equipement: 'machine', mouvement, schema_mouvement: schema,
  muscles_primaires: ['mollets'], muscles_secondaires: [], muscles_stabilisateurs: [] }, extra || {});

describe('67A — Modele.cousinsDe : la même famille, sans lui ni ses frères', () => {
  const INDEX = Modele.indexerExercices([
    fiche('mollets_debout_machine', 'mollets_debout', 'isolation_mollets'),
    fiche('mollets_debout_haltere', 'mollets_debout', 'isolation_mollets'),     // un frère
    fiche('presse_mollets', 'mollets_debout', 'isolation_mollets'),             // un frère
    fiche('mollets_assis', 'mollets_assis', 'isolation_mollets'),               // un cousin
    fiche('mollets_a_une_jambe', 'mollets_une_jambe', 'isolation_mollets'),     // un cousin
    fiche('tirage_visage', null, 'tirer_horizontal'),                           // sans frère
    fiche('rowing_poulie', 'rowing', 'tirer_horizontal'),
    fiche('muscle_up', 'muscle_up', 'tirer_vers_le_bas', { habilete: true }),     // une habileté (colonne mal remplie)
    fiche('tractions', 'tractions', 'tirer_vers_le_bas'),
    fiche('bird_dog', null, null)
  ]);

  test('ni lui-même ni un de ses frères ; triés par slug', () => {
    expect(Modele.cousinsDe(INDEX, 'mollets_debout_machine')).toEqual(['mollets_a_une_jambe', 'mollets_assis']);
    expect(Modele.cousinsDe(INDEX, 'mollets_assis')).toEqual(
      ['mollets_a_une_jambe', 'mollets_debout_haltere', 'mollets_debout_machine', 'presse_mollets']);
    expect(Modele.cousinsDe(INDEX, 'tirage_visage')).toEqual(['rowing_poulie']);
  });

  test('une famille NULL, absente, ou un exercice inconnu : `[]`', () => {
    expect(Modele.cousinsDe(INDEX, 'bird_dog')).toEqual([]);
    const sans = copie(INDEX);
    Object.keys(sans).forEach((s) => { delete sans[s].schema_mouvement; });   // un cache d'avant v2_074
    expect(Modele.cousinsDe(sans, 'mollets_debout_machine')).toEqual([]);
    expect(Modele.cousinsDe(INDEX, 'inconnu')).toEqual([]);
    expect(Modele.cousinsDe(null, 'tractions')).toEqual([]);
  });

  test('une habileté n’a jamais de cousin et n’en est jamais un, même si la colonne lui donne une famille', () => {
    expect(Modele.cousinsDe(INDEX, 'muscle_up')).toEqual([]);
    expect(Modele.cousinsDe(INDEX, 'tractions')).toEqual([]);
  });
});

// La liste de la feuille : le VRAI `cousinsDe` de app.js et `vueMachinePrise`, sur les vrais Modele, Seance et Profil.
const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const extraire = (nom) => {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable dans v2/js/app.js : ' + nom);
  return m[0];
};

function bac(exercices, opts) {
  const o = opts || {};
  const appels = [];
  const ctx = {
    Profil, Modele, Seance,
    profil: Object.assign({ materiel: null, exercices_ecartes: null }, o.profil || {}),
    local: { exercices: exercices },
    seance: { exercices: (o.seance || ['base']).map((s) => ({ exercise_slug: s, series: [] })) },
    // Les faits passent par `faitsDesFreres`, avec la liste des cousins (3e paramètre).
    faitsDesFreres: (index, slug, slugs) => {
      appels.push(slugs === undefined ? null : slugs.slice());
      const f = {};
      (slugs || Modele.freresDe(index, slug)).forEach((s) => { if (o.faits && o.faits[s]) f[s] = o.faits[s]; });
      return f;
    },
    fermerVoile: () => {}, remplacerDansLaSeance: (i, s) => { ctx.remplace = [i, s]; }, demanderRemplacement: () => {}
  };
  vm.createContext(ctx);
  ['horsDuMateriel', 'freresDe', 'cousinsDe', 'blocsPourPlusTard', 'vueMachinePrise'].forEach((n) => vm.runInContext(extraire(n), ctx));
  ctx.blocs = [{ exercices: [{ slug: 'base', nom: 'base', series: [] }] }];
  ctx.appels = appels;
  return ctx;
}
const vue = (c) => vm.runInContext('vueMachinePrise(blocs, 0, 0)', c);
const fait = (date) => ({ date, charge_kg: 40, reps: 10 });

describe('67A — la liste « Même famille » de la feuille', () => {
  const famille = (n, extra) => Array.from({ length: n }, (_, i) => fiche('f' + String(i).padStart(2, '0'), 'm' + i, 'abdos', extra));
  const BASE = fiche('base', 'base', 'abdos');

  test('rangée comme les frères : le déjà fait d’abord (le plus récent d’abord), le hors matériel après, déjà dans la séance à la fin', () => {
    const ex = [BASE,
      fiche('a_jamais', 'a', 'abdos'), fiche('b_ancien', 'b', 'abdos'), fiche('c_recent', 'c', 'abdos'),
      fiche('d_kettlebell', 'd', 'abdos', { equipement: 'kettlebell' }), fiche('e_present', 'e', 'abdos')];
    const c = bac(ex, { seance: ['base', 'e_present'], profil: { materiel: 'maison_minimal' },
      faits: { b_ancien: fait('2026-09-01T10:00:00Z'), c_recent: fait('2026-10-01T10:00:00Z') } });
    expect(vue(c).cousins.map((x) => x.nom)).toEqual(['c_recent', 'b_ancien', 'd_kettlebell', 'a_jamais', 'e_present']);
    // Le fait sous un cousin arrive tout fait, par le même chemin que les frères (la liste en 3e paramètre).
    expect(vue(c).cousins[0].fait).toEqual(fait('2026-10-01T10:00:00Z'));
    expect(c.appels.some((a) => a && a.indexOf('c_recent') >= 0)).toBe(true);
  });

  test('les écartés à la fin, avec leur mention ; 5 au plus — une famille de 40 abdos n’en montre que 5', () => {
    const c = bac([BASE].concat(famille(40)), { profil: { exercices_ecartes: ['f00'] } });
    const v = vue(c);
    expect(Seance.COUSINS_PROPOSES).toBe(5);
    expect(v.cousins.map((x) => [x.nom, x.ecarte])).toEqual([['f01', false], ['f02', false], ['f03', false],
      ['f04', false], ['f05', false]]);
    const peu = bac([BASE].concat(famille(3)), { profil: { exercices_ecartes: ['f00'] } });
    expect(vue(peu).cousins.map((x) => [x.nom, x.ecarte])).toEqual([['f01', false], ['f02', false], ['f00', true]]);
  });

  test('un cousin choisi fait ce que fait un frère : le même remplacement', () => {
    const c = bac([BASE, fiche('frere', 'base', 'abdos'), fiche('cousin', 'autre', 'abdos')]);
    const v = vue(c);
    expect(v.freres.map((x) => x.nom)).toEqual(['frere']);
    expect(v.cousins.map((x) => x.nom)).toEqual(['cousin']);
    v.cousins[0].surChoisir();
    expect(c.remplace).toEqual([0, 'cousin']);
    v.freres[0].surChoisir();
    expect(c.remplace).toEqual([0, 'frere']);
  });

  test('sans famille : aucun cousin, et la feuille ne cherche rien de plus', () => {
    const c = bac([fiche('base', 'base', null), fiche('autre', 'x', null)]);
    expect(vue(c).cousins).toEqual([]);
  });
});

describe('67A — le catalogue lit `schema_mouvement`', () => {
  let requetes;
  afterEach(() => { delete globalThis.THClient; });
  test('la requête du catalogue nomme `schema_mouvement` (et garde `mouvement`)', async () => {
    requetes = [];
    const c = { select(colonnes) { requetes.push(colonnes); return c; }, eq() { return c; }, gt() { return c; },
      or() { return c; }, order() { return c; }, limit() { return c; },
      then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej); } };
    globalThis.THSeance = Seance;
    globalThis.THClient = { obtenir: () => ({ from: () => c }) };
    delete require.cache[require.resolve('../../v2/js/donnees.js')];
    const Donnees = require('../../v2/js/donnees.js');
    await Donnees.tousLesExercices();
    const demandees = requetes[0].split(',').map((x) => x.trim());
    expect(demandees).toContain('schema_mouvement');
    expect(demandees).toContain('mouvement');
  });
});

// ⚠️ RIEN D'AUTRE NE BOUGE : sur des catalogues où des exercices de même famille ne sont PAS frères, chaque calcul qui
// lit les frères rend le même résultat avec et sans `schema_mouvement`.
describe('67A — aucun calcul ne lit la famille', () => {
  const sansFamille = (cat) => {
    const c = copie(cat);
    (Array.isArray(c) ? c : Object.keys(c).map((k) => c[k])).forEach((f) => { delete f.schema_mouvement; });
    return c;
  };
  // Une famille par premier muscle principal : beaucoup de non-frères partagent une famille.
  const avecFamille = (cat) => {
    const c = copie(cat);
    (Array.isArray(c) ? c : Object.keys(c).map((k) => c[k])).forEach((f) => {
      f.schema_mouvement = 'fam_' + ((f.muscles_primaires || [])[0] || 'aucun');
    });
    return c;
  };

  test('les frères eux-mêmes : identiques pour chaque exercice', () => {
    const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-66d-generateur.json'), 'utf8'));
    const a = avecFamille(D.catalogue), b = sansFamille(D.catalogue);
    Object.keys(a).forEach((s) => expect([s, Modele.freresDe(a, s)]).toEqual([s, Modele.freresDe(b, s)]));
  });

  test('les variantes à la barre du bilan : un exercice à la barre de même famille, pas frère, n’y entre pas', () => {
    const f = (slug, equipement, mouvement, prim, schema) => ({ slug, nom: slug, mesure: 'charge_reps', charge: 'externe',
      equipement, mouvement, schema_mouvement: schema, muscles_primaires: prim, muscles_secondaires: [], muscles_stabilisateurs: [] });
    const CAT = [f('squat_barre', 'barre', 'squat', ['quadriceps'], 'accroupir'),
      f('squat_pause_barre', 'barre', 'squat', ['quadriceps'], 'accroupir'),
      f('front_squat_barre', 'barre', 'front_squat', ['quadriceps'], 'accroupir'),      // même famille, pas frère
      f('developpe_couche_barre', 'barre', 'couche', ['pectoraux'], 'pousser_horizontal')];
    const jour = (n) => new Date(2026, 9, 10 - n, 18, 0, 0);
    const corpus = (cat) => {
      const seances = [], parSeance = {}, series = [];
      [[3, 'front_squat_barre', 200], [10, 'squat_barre', 100], [17, 'squat_pause_barre', 90]].forEach(([n, slug, kg], i) => {
        const id = 's' + i;
        seances.push({ id, debut: jour(n).toISOString(), fin: null });
        parSeance[id] = [1, 2, 3].map((k) => ({ id: id + k, session_id: id, rang: k, exercise_slug: slug, charge_kg: kg,
          reps: 5, type_serie: 'travail' }));
        parSeance[id].forEach((x) => series.push(x));
      });
      const index = Modele.indexerExercices(cat);
      return { seances, series, exercices: cat, seriesDe: (id) => parSeance[id] || [], catalogue: () => index, journal: [] };
    };
    const AUJ = new Date(2026, 9, 10, 20);
    const avec = Faits.creer().barresDuBilan(corpus(CAT), AUJ);
    expect(avec).toEqual(Faits.creer().barresDuBilan(corpus(sansFamille(CAT)), AUJ));
    expect(JSON.stringify(avec)).not.toMatch(/front_squat_barre/);
  });

  test('la relecture (barre lourde, variantes), le complément et les supersets : mêmes sorties avec et sans famille', () => {
    const R = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-66-relire.json'), 'utf8'));
    R.cas.forEach((c) => {
      const e = (cat) => Object.assign(copie(c.entree), { catalogue: cat });
      expect([c.nom, G.relireSemaine(e(avecFamille(R.catalogue)))]).toEqual([c.nom, G.relireSemaine(e(sansFamille(R.catalogue)))]);
    });
    const C = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-66c-generateur.json'), 'utf8'));
    C.cas.forEach((c) => {
      const e = (cat) => Object.assign(copie(c.entree), { catalogue: cat });
      expect([c.nom, G.completer(e(avecFamille(C.catalogue)))]).toEqual([c.nom, c.attendu]);
    });
    const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-66d-generateur.json'), 'utf8'));
    D.cas.forEach((c) => {
      const e = Object.assign(copie(c.entree), { catalogue: avecFamille(D.catalogue) });
      expect([c.nom, G[c.fonction](e)]).toEqual([c.nom, c.attendu]);
    });
  });
});
