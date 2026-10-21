//
// 126 — LA RECHERCHE D'EXERCICE (ECRAN-SAISIE §7 quindecies.11, décidée le 17/10/2026, précisée le 21/10/2026).
//
// Une seule recherche (`Routines.chercher`) pour tous les écrans qui ouvrent le catalogue : les noms alternatifs
// (`exercise_alias`, dans le cache local), une faute tolérée à 5 lettres et plus, l'ordre par contexte, et ce que le
// champ vide montre (`Routines.suggestions`, `Routines.plusProches`).
//
// LA RÉFÉRENCE est `fixtures/recherche126.py` ; ses cas (`fixtures/cas-126.json`) se rejouent ici À 0 ÉCART, cas par
// cas. Un cas qui semble faux se rapporte, il ne se corrige pas.
//
// Puis : le repli, l'index mémoïsé, les faits de la recherche (`faits.js`), le câblage d'app.js (le contexte
// d'ouverture, les suggestions, les mentions, Rattacher qui s'ouvre vide), le rendu, le cache et la synchronisation.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.self = global;
const Modele = require('../../v2/js/modele.js');
const Semaine = require('../../v2/js/semaine.js');
require('../../v2/js/bilan.js');
const Profil = require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
require('../../v2/js/seance.js');
require('../../v2/js/periode.js');
const Faits = require('../../v2/js/faits.js');
const Routines = require('../../v2/js/routines.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const CAS = require('./fixtures/cas-126.json');

// Le catalogue du fichier de cas, à la forme des fiches de l'app (`mp` → `muscles_primaires`).
const CATALOGUE = CAS.catalogue.map((e) => ({ slug: e.slug, nom: e.nom, nature: e.nature, hors_salle: e.hors_salle,
  equipement: e.equipement, muscles_primaires: e.mp, mouvement: e.mouvement }));
const faitsDu = (c) => (c.faits === true ? CAS.faits : (c.faits || {}));
const slugs = (l) => l.map((e) => e.slug);

describe('126 — le fichier de cas : la concordance avec la référence, à 0 écart', () => {
  test('le fichier est celui de la référence (13 mots, 35 recherches, 6 suggestions, 7 « plus proches »)', () => {
    expect([CAS.mots.length, CAS.recherche.length, CAS.suggestions.length, CAS.plus_proches.length]).toEqual([13, 35, 6, 7]);
    expect([CAS.catalogue.length, CAS.alias.length]).toEqual([158, 263]);
  });

  test.each(CAS.mots.map((c) => [c.mot, c.texte, c.attendu]))('mots : « %s » dans « %s » → %s', (mot, texte, attendu) => {
    expect(Routines.motTrouve(mot, texte.split(' '))).toBe(attendu);
  });

  test.each(CAS.recherche.map((c, i) => [i, c.requete, c]))('recherche n° %i : « %s » — les 12 premiers, dans l’ordre', (i, q, c) => {
    const r = Routines.chercher(CATALOGUE, c.requete, {
      alias: CAS.alias, faits: faitsDu(c), contexte: c.ctx, equipements: c.materiel || null,
      ecartes: c.ecartes, exclu: c.exclu, limite: c.limite
    });
    expect(slugs(r).slice(0, 12)).toEqual(c.attendu);
  });

  test.each(CAS.suggestions.map((c, i) => [i, c.contexte.type, c]))('suggestions n° %i (%s) : les sections, titres et contenus dans l’ordre', (i, t, c) => {
    const r = Routines.suggestions(CATALOGUE, c.contexte, { alias: CAS.alias, faits: faitsDu(c), ecartes: c.ecartes,
      equipements: c.materiel || null });
    expect(r.map((s) => [s.titre, s.slugs])).toEqual(c.attendu);
  });

  // ⚠️ ÉCART DE LECTURE RAPPORTÉ (PR 126) : les cas `plus_proches` ne portent pas de clé `faits`, que `_lire` dit
  // valoir « aucun historique ». Ils ont pourtant été produits AVEC le dictionnaire `faits` du fichier : sans lui, le
  // cas « Plank » diffère (le départage « déjà fait » range les planches autrement). On les rejoue donc avec `faits`,
  // comme la référence les a produits — le cas n'est pas corrigé.
  test.each(CAS.plus_proches.map((c) => [c.nom_hevy, c]))('les plus proches de « %s » : slug, « comme » et mots en commun', (nom, c) => {
    expect(Routines.plusProches(CATALOGUE, c.nom_hevy, { alias: CAS.alias, faits: CAS.faits })).toEqual(c.attendu);
  });
});

describe('126 — le texte : le repli, la faute, les mots', () => {
  test('le repli : minuscules, sans accents, ponctuation, tirets, parenthèses, apostrophes et barres deviennent des espaces', () => {
    expect(Routines.replier('Développé Couché - (Haltère)')).toBe('developpe couche haltere');
    expect(Routines.replier('developpe couche haltere')).toBe('developpe couche haltere');
    expect(Routines.replier('Soulevé-de-Terre')).toBe('souleve de terre');
    // L'apostrophe typographique devient un espace, comme le dit la spec (la référence l'effaçait jusqu'au 21/10 : 129).
    expect(Routines.replier('Haussement d’Épaules (Barre)')).toBe('haussement d epaules barre');
    expect(Routines.replier("Haussement d'Épaules")).toBe('haussement d epaules');
    expect(Routines.replier("Pull-up / Chin-up 2.0")).toBe('pull up chin up 2 0');
    expect(Routines.replier('  ÉLÉVATIONS  ')).toBe('elevations');
    expect(Routines.replier(null)).toBe('');
    expect(Routines.replier(undefined)).toBe('');
  });

  // 129 — CONCORDANCE DU REPLI AVEC LA RÉFÉRENCE CORRIGÉE (21/10/2026). `recherche126.py` effaçait l'apostrophe
  // typographique (`encode('ascii', 'ignore')`) : « Haussement d’Épaules » y donnait « haussement depaules » — l'écart
  // rapporté par #457. Elle ne retire plus que les marques combinantes, et donne « haussement d epaules » (lancée sur
  // ces trois textes le 21/10) : le JS, la même chose. Aucun cas de `cas-126.json` ne porte d'apostrophe : ce test est
  // la seule concordance sur ce point.
  test('129 — concordance du repli avec la référence corrigée : « Haussement d’Épaules » → « haussement d epaules »', () => {
    const REFERENCE = [
      ['Haussement d’Épaules', 'haussement d epaules'],
      ['Haussement d’Épaules (Barre)', 'haussement d epaules barre'],
      ["Haussement d'Épaules", 'haussement d epaules']
    ];
    REFERENCE.forEach(([texte, attendu]) => expect(Routines.replier(texte)).toBe(attendu));
    expect(Routines.replier('Haussement d’Épaules')).not.toBe('haussement depaules');   // l'ancienne référence
  });

  test('« Soulevé-de-Terre » et « souleve de terre » trouvent la même chose', () => {
    const a = slugs(Routines.chercher(CATALOGUE, 'Soulevé-de-Terre', { alias: CAS.alias }));
    expect(a).toEqual(slugs(Routines.chercher(CATALOGUE, 'souleve de terre', { alias: CAS.alias })));
    expect(a.length).toBeGreaterThan(0);
  });

  test('une faute : en plus, en moins, changée, deux voisines inversées — pas deux', () => {
    expect(Routines.aUneFaute('squat', 'squat')).toBe(true);
    expect(Routines.aUneFaute('squart', 'squat')).toBe(true);    // en plus
    expect(Routines.aUneFaute('sqat', 'squat')).toBe(true);      // en moins
    expect(Routines.aUneFaute('crunsh', 'crunch')).toBe(true);   // changée
    expect(Routines.aUneFaute('couhce', 'couche')).toBe(true);   // inversées
    expect(Routines.aUneFaute('cohuce', 'couche')).toBe(false);  // deux
    expect(Routines.aUneFaute('squ', 'squat')).toBe(false);
  });

  test('la faute n’est tolérée qu’à 5 lettres et plus, la première lettre juste', () => {
    expect(Routines.MIN_FAUTE).toBe(5);
    expect(Routines.motTrouve('sqat', ['squat'])).toBe(false);     // 4 lettres : aucune faute
    expect(Routines.motTrouve('squart', ['squat'])).toBe(true);
    expect(Routines.motTrouve('wquat', ['squat'])).toBe(false);    // la première lettre fausse
    expect(Routines.motTrouve('lat', ['plateau'])).toBe(false);    // le DÉBUT d'un mot, pas le milieu
  });

  test('tous les mots tapés dans un MÊME texte, dans n’importe quel ordre', () => {
    const a = slugs(Routines.chercher(CATALOGUE, 'rowing halt', { alias: CAS.alias, faits: CAS.faits }));
    expect(slugs(Routines.chercher(CATALOGUE, 'halt rowing', { alias: CAS.alias, faits: CAS.faits })).sort()).toEqual(a.slice().sort());
  });
});

describe('126 — l’index des textes : construit une fois par catalogue', () => {
  test('deux recherches successives sur le même catalogue et les mêmes alias ne reconstruisent pas l’index', () => {
    const cat = CATALOGUE.slice(), alias = CAS.alias.slice();
    const ix = Routines.indexDeRecherche(cat, alias);
    Routines.chercher(cat, 'curl', { alias });
    Routines.chercher(cat, 'squat', { alias });
    Routines.suggestions(cat, { type: 'routine', dans: ['squat_barre'] }, { alias });
    expect(Routines.indexDeRecherche(cat, alias)).toBe(ix);
  });

  test('un autre catalogue (la synchronisation en rend un nouveau) ou d’autres alias : un nouvel index', () => {
    const cat = CATALOGUE.slice(), alias = CAS.alias.slice();
    const ix = Routines.indexDeRecherche(cat, alias);
    expect(Routines.indexDeRecherche(cat.slice(), alias)).not.toBe(ix);
    const ix2 = Routines.indexDeRecherche(cat, alias);
    expect(Routines.indexDeRecherche(cat, alias.slice())).not.toBe(ix2);
  });

  test('les noms alternatifs dans l’ordre alphabétique de l’alias brut, sans doublon replié, le nom d’abord', () => {
    const cat = [{ slug: 'x', nom: 'Tirage Poitrine (Poulie)' }];
    const ix = Routines.indexDeRecherche(cat, [{ alias: 'Lat Pulldown', slug: 'x' }, { alias: 'Lat pulldown', slug: 'x' },
      { alias: 'Cable Pulldown', slug: 'x' }, { alias: 'Tirage poitrine poulie', slug: 'x' }, { alias: 'Ailleurs', slug: 'y' }]);
    expect(ix.textes.x).toEqual(['tirage poitrine poulie', 'cable pulldown', 'lat pulldown']);
    expect(ix.bruts.x).toEqual(['Tirage Poitrine (Poulie)', 'Cable Pulldown', 'Lat Pulldown']);
  });
});

describe('126 — l’ordre : les règles qui se voient', () => {
  const cat = [
    { slug: 'tirage', nom: 'Tirage Poitrine (Poulie)', nature: 'force', equipement: 'poulie', muscles_primaires: ['grand_dorsal'] },
    { slug: 'rowing', nom: 'Rowing Assis (Poulie)', nature: 'force', equipement: 'poulie', muscles_primaires: ['haut_du_dos'] },
    { slug: 'nage', nom: 'Natation', nature: 'cardio', hors_salle: true, equipement: 'aucun', muscles_primaires: [] },
    { slug: 'nat_street', nom: 'Natte Street', nature: 'habilete', equipement: 'aucun', muscles_primaires: [] },
    { slug: 'natte', nom: 'Natte (Machine)', nature: 'force', equipement: 'machine', muscles_primaires: [] }
  ];
  const alias = [{ alias: 'Tirage horizontal', slug: 'rowing' }];

  test('le nom avant le nom alternatif (« tirage » : Tirage Poitrine avant Rowing Assis)', () => {
    expect(slugs(Routines.chercher(cat, 'tirage', { alias }))).toEqual(['tirage', 'rowing']);
  });

  test('la musculation, puis le street, puis le hors salle ; un hors salle déjà fait remonte au premier rang', () => {
    expect(slugs(Routines.chercher(cat, 'nat', { alias }))).toEqual(['natte', 'nat_street', 'nage']);
    expect(slugs(Routines.chercher(cat, 'nat', { alias, faits: { nage: 2 } }))).toEqual(['nage', 'natte', 'nat_street']);
  });

  test('l’exercice remplacé n’apparaît jamais', () => {
    expect(slugs(Routines.chercher(cat, 'tirage', { alias, exclu: 'tirage' }))).toEqual(['rowing']);
    expect(Routines.suggestions(cat, { type: 'remplacer', remplace: 'tirage', dans: [], freres: ['tirage', 'rowing'] }, { alias })
      .map((s) => s.slugs)).toEqual([['rowing']]);
  });

  test('une fiche sans `nature` (cache d’avant 125) compte comme la force : elle n’est pas rétrogradée', () => {
    const sans = [{ slug: 'a', nom: 'Natte A' }, { slug: 'b', nom: 'Natte B', nature: 'habilete' }];
    expect(slugs(Routines.chercher(sans, 'natte'))).toEqual(['a', 'b']);
  });
});

// ── Les faits de la recherche (`faits.js`) ─────────────────────────────────────────────────────────────────────────
describe('126 — les faits : le nombre de séances, l’historique d’une routine, les récents', () => {
  const s = (id, debut, routine) => ({ id, debut, routine_id: routine || null });
  const t = (id, session, slug, rang, type) => ({ id, session_id: session, exercise_slug: slug, rang, type_serie: type || 'travail' });
  function corpus() {
    const seances = [s('s1', '2026-06-01T10:00:00Z', 'r1'), s('s2', '2026-09-01T10:00:00Z', 'r1'),
      s('s3', '2026-10-10T10:00:00Z', null), s('s4', '2026-10-15T10:00:00Z', 'r1'), { id: 's5', debut: null }];
    const series = [
      t('a', 's1', 'squat', 1), t('b', 's1', 'presse', 2), t('c', 's1', 'curl', 3),
      t('d', 's2', 'squat', 1), t('e', 's2', 'presse', 2), t('e2', 's2', 'presse', 3),
      t('f', 's3', 'tapis', 1), t('g', 's3', 'chauffe', 2, 'echauffement'), t('h', 's3', 'squat', 3),
      t('i', 's4', 'presse', 1), t('j', 's4', 'leg', 2),
      t('k', 's5', 'squat', 1)
    ];
    return { seances, series, exercices: [], seriesDe: (id) => series.filter((x) => x.session_id === id),
             catalogue: () => ({}), journal: [] };
  }

  test('le nombre de SÉANCES par exercice (pas de séries) ; une chauffe seule ne fait pas un exercice fait ; une séance sans début ne compte pas', () => {
    const f = Faits.creer();
    expect(f.seancesParExercice(corpus())).toEqual({ squat: 3, presse: 3, curl: 1, tapis: 1, leg: 1 });
  });

  test('la même définition de « fait » que `datesDesExercices` : les mêmes exercices', () => {
    const f = Faits.creer();
    expect(Object.keys(f.seancesParExercice(corpus())).sort()).toEqual(Object.keys(f.datesDesExercices(corpus())).sort());
  });

  test('le mémo : le même corpus, le même objet ; une série de plus, un nouveau compte', () => {
    const f = Faits.creer();
    const c = corpus();
    const a = f.seancesParExercice(c);
    expect(f.seancesParExercice(c)).toBe(a);
    c.series.push(t('z', 's3', 'curl', 4));
    expect(f.seancesParExercice(c)).not.toBe(a);
    expect(f.seancesParExercice(c).curl).toBe(2);
  });

  test('les exercices d’une routine : le plus fréquent d’abord, puis le plus récent ; la séance en cours n’y est pas', () => {
    const f = Faits.creer();
    // r1 : s1 (squat, presse, curl), s2 (squat, presse), s4 (presse, leg). presse 3, squat 2, puis leg (15/10) avant curl (01/06).
    expect(f.exercicesDeLaRoutine(corpus(), 'r1')).toEqual(['presse', 'squat', 'leg', 'curl']);
    expect(f.exercicesDeLaRoutine(corpus(), 'r1', 's4')).toEqual(['presse', 'squat', 'curl']);
    expect(f.exercicesDeLaRoutine(corpus(), null)).toEqual([]);
  });

  test('les récents (le plus récent d’abord ; dans une séance, le dernier fait d’abord) et les plus faits sur 3 mois', () => {
    const f = Faits.creer();
    const r = f.exercicesRecents(corpus(), new Date('2026-10-21T12:00:00Z'));
    expect(r.recents).toEqual(['leg', 'presse', 'squat', 'tapis', 'curl']);
    // Depuis le 21/07 : s2, s3, s4 — presse 2 (15/10), squat 2 (10/10), puis leg, tapis.
    expect(r.plusFaits).toEqual(['presse', 'squat', 'leg', 'tapis']);
    expect(f.exercicesRecents(corpus(), new Date('2026-10-21T12:00:00Z'), 's4').recents).toEqual(['squat', 'tapis', 'presse', 'curl']);
  });
});

// ── Le câblage d'app.js : le contexte d'ouverture, les suggestions, les mentions ────────────────────────────────────
const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const extraire = (nom) => {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable dans v2/js/app.js : ' + nom);
  return m[0];
};

const CAT_APP = [
  { slug: 'dc-barre', nom: 'Développé Couché (Barre)', nature: 'force', equipement: 'barre', mouvement: 'dc', muscles_primaires: ['pectoraux'] },
  { slug: 'dc-halteres', nom: 'Développé Couché (Haltère)', nature: 'force', equipement: 'haltere', mouvement: 'dc', muscles_primaires: ['pectoraux'] },
  { slug: 'dc-smith', nom: 'Développé Couché (Machine Smith)', nature: 'force', equipement: 'machine_smith', mouvement: 'dc', muscles_primaires: ['pectoraux'] },
  { slug: 'ecarte', nom: 'Écarté (Machine)', nature: 'force', equipement: 'machine', mouvement: 'ecarte', muscles_primaires: ['pectoraux'] },
  { slug: 'tirage', nom: 'Tirage Poitrine (Poulie)', nature: 'force', equipement: 'poulie', mouvement: 'tirage', muscles_primaires: ['grand_dorsal'] },
  { slug: 'rowing', nom: 'Rowing Assis (Poulie)', nature: 'force', equipement: 'poulie', mouvement: 'rowing', muscles_primaires: ['grand_dorsal'] },
  { slug: 'curl', nom: 'Curl Biceps (Haltère)', nature: 'force', equipement: 'haltere', mouvement: 'curl', muscles_primaires: ['biceps'] },
  { slug: 'natation', nom: 'Natation', nature: 'cardio', hors_salle: true, equipement: 'aucun', mouvement: null, muscles_primaires: [] }
];
const ALIAS_APP = [{ alias: 'DC', slug: 'dc-barre' }, { alias: 'Lat Pulldown', slug: 'tirage' },
  { alias: 'Seated Cable Row', slug: 'rowing' }];
const FONCTIONS = ['ouvrirCatalogue', 'rendreCatalogue', 'contexteCatalogue', 'optionsDuCatalogue', 'slugsDesLignes',
  'mentionsExo', 'descriptionExo', 'indiceOuNul'];

function bac(o) {
  const opts = o || {};
  const noeuds = {};
  const $ = (id) => noeuds[id] || (noeuds[id] = { id, value: '', hidden: false, textContent: '', focus: () => {} });
  const appels = { routine: [], recents: [] };
  const ctx = {
    Routines, Profil, Semaine, Modele, Import: { titreRattacher: (n) => '« ' + n + ' » chez Hevy, c’est…' },
    profil: opts.profil || {}, local: { exercices: CAT_APP, alias: ALIAS_APP },
    seance: opts.seance || null, vues: { seance: { hidden: !opts.seance } },
    brouillon: opts.brouillon || null, construit: opts.construit || null,
    faits: {
      seancesParExercice: () => opts.comptes || {},
      exercicesDeLaRoutine: (c, r, sauf) => { appels.routine.push([r, sauf]); return opts.souvent || []; },
      exercicesRecents: (c, m, sauf) => { appels.recents.push(sauf); return opts.recents || { recents: [], plusFaits: [] }; }
    },
    corpus: () => ({}), $,
    freresDe: (slug, dans) => { appels.freres = [slug, dans]; return (opts.freres || []).map((s) => ({ slug: s })); },
    Rendu: {
      rendreFiltresExo: () => {},
      rendreResultatsExo: (c, liste, choisir, ecartes, decrire, mentions) => {
        ctx.__vue = { liste: liste.map((e) => e.slug), mentions: liste.map((e) => (mentions ? mentions(e) : [])), ecartes };
      },
      rendreSuggestionsExo: (c, v) => {
        ctx.__vue = { sections: v.sections.map((s) => [s.titre, s.lignes.map((l) => l.exo.slug)]),
                      mentions: v.sections.map((s) => s.lignes.map((l) => l.mentions)), pied: v.pied };
      },
      message: () => {}
    },
    ouvrirVoile: () => {}, fermerVoile: () => {},
    intentionCatalogue: null, faitsDuCatalogue: null, contexteDuCatalogue: null,
    filtresCatalogue: { equipement: null, muscle: null },
    FILTRES_CATALOGUE: { equipement: { tous: 'Tout le matériel', libelle: (c) => c }, muscle: { tous: 'Tous les muscles', libelle: (c) => c } },
    ouvrirChoixFiltre: () => {}, retirerFiltre: () => {}, appels, noeuds
  };
  vm.createContext(ctx);
  FONCTIONS.forEach((n) => vm.runInContext(extraire(n), ctx));
  return { ctx, appel: (code) => vm.runInContext(code, ctx), taper: (q) => { $('champ-recherche-exo').value = q; vm.runInContext('rendreCatalogue()', ctx); } };
}
const ligne = (slug) => ({ exercise_slug: slug, series: [] });

describe('126 — le champ vide selon le contexte (app.js décide, le rendu affiche)', () => {
  test('en séance partie d’une routine : « Souvent avec cette séance » puis « Pour les mêmes muscles », sans ce qui est déjà là', () => {
    const b = bac({ seance: { id: 'en-cours', routine_id: 'r1', exercices: [ligne('tirage')] },
      souvent: ['tirage', 'curl', 'natation', 'dc-barre'], comptes: { curl: 4 } });
    b.appel('ouvrirCatalogue()');
    expect(b.ctx.appels.routine).toEqual([['r1', 'en-cours']]);
    expect(b.ctx.__vue.sections).toEqual([['Souvent avec cette séance', ['curl', 'dc-barre']],
      ['Pour les mêmes muscles', ['rowing']]]);
    expect(b.ctx.__vue.pied).toBe('Tape pour chercher dans les 8 exercices.');
  });

  test('en séance libre : « Récents » puis « Les plus faits », la séance en cours exclue', () => {
    const b = bac({ seance: { id: 'libre', routine_id: null, exercices: [ligne('curl')] },
      recents: { recents: ['curl', 'tirage', 'rowing'], plusFaits: ['tirage', 'dc-barre', 'curl'] }, comptes: { tirage: 3, rowing: 1, 'dc-barre': 2 } });
    b.appel('ouvrirCatalogue()');
    expect(b.ctx.appels.recents).toEqual(['libre']);
    expect(b.ctx.__vue.sections).toEqual([['Récents', ['tirage', 'rowing']], ['Les plus faits', ['dc-barre']]]);
  });

  test('l’éditeur de routine : « Pour les mêmes muscles » si la routine a des exercices ; vide, la phrase seule', () => {
    const b = bac({ brouillon: { exercices: [ligne('dc-barre')] } });
    b.appel('ouvrirCatalogue()');
    expect(b.ctx.__vue.sections).toEqual([['Pour les mêmes muscles', ['dc-halteres', 'dc-smith', 'ecarte']]]);
    const vide = bac({ brouillon: { exercices: [] } });
    vide.appel('ouvrirCatalogue()');
    expect([vide.ctx.__vue.sections, vide.ctx.__vue.pied]).toEqual([[], 'Tape pour chercher dans les 8 exercices.']);
  });

  test('« Remplacer » en séance → « Chercher dans le catalogue » : « Le même mouvement » (l’ordre de la feuille), « Les mêmes muscles », jamais le remplacé', () => {
    const b = bac({ seance: { id: 's', routine_id: 'r1', exercices: [ligne('dc-barre'), ligne('tirage')] },
      freres: ['dc-smith', 'dc-halteres'] });
    b.appel('ouvrirCatalogue(null, 0)');
    expect(b.ctx.appels.freres).toEqual(['dc-barre', ['dc-barre', 'tirage']]);
    expect(b.ctx.__vue.sections).toEqual([['Le même mouvement', ['dc-smith', 'dc-halteres']], ['Les mêmes muscles', ['ecarte']]]);
    expect(b.ctx.__vue.pied).toBe('Tape pour chercher dans tout le catalogue.');
    // Et en tapant : le remplacé n'apparaît pas ; ses frères (« va avec le contexte » : 0) passent devant, rangés entre
    // eux par la suite de l'ordre (ici l'alphabet).
    b.taper('couche');
    expect(b.ctx.__vue.liste).toEqual(['dc-halteres', 'dc-smith']);
    b.taper('e');
    expect(b.ctx.__vue.liste).toEqual(['ecarte']);
  });

  test('« Remplacer » dans l’éditeur et dans l’aperçu du programme : le même contexte', () => {
    const ed = bac({ brouillon: { exercices: [ligne('curl'), ligne('dc-barre')] }, freres: ['dc-halteres'] });
    ed.appel('ouvrirCatalogue(null, 1)');
    expect(ed.ctx.__vue.sections[0]).toEqual(['Le même mouvement', ['dc-halteres']]);
    const ap = bac({ construit: { routines: [{ exercices: [ligne('tirage'), ligne('dc-barre')] }] }, freres: ['dc-smith'] });
    ap.appel('ouvrirCatalogue(null, null, { i: 0, k: 1, retour: function () {} })');
    expect(ap.ctx.appels.freres).toEqual(['dc-barre', ['tirage', 'dc-barre']]);
    expect(ap.ctx.__vue.sections[0]).toEqual(['Le même mouvement', ['dc-smith']]);
    expect(ap.ctx.__vue.pied).toBe('Tape pour chercher dans tout le catalogue.');
  });

  test('Rattacher : le champ s’ouvre VIDE, « Les plus proches » disent pourquoi (« comme … »), puis « Ou tape le nom de l’exercice. »', () => {
    const b = bac();
    b.ctx.noeuds['champ-recherche-exo'] = { value: 'reste de la fois d’avant', focus: () => {} };
    b.appel('ouvrirCatalogue(null, null, null, "Lat Pulldown (Cable)")');
    expect(b.ctx.noeuds['champ-recherche-exo'].value).toBe('');
    expect(b.ctx.__vue.sections).toEqual([['Les plus proches', ['tirage']]]);
    // Les guillemets français, avec leurs espaces insécables.
    expect(b.ctx.__vue.mentions).toEqual([[['comme \u00ab\u00a0Lat Pulldown\u00a0\u00bb']]]);
    expect(b.ctx.__vue.pied).toBe('Ou tape le nom de l’exercice.');
  });

  test('un filtre actif, champ vide : pas de sections, la liste filtrée dans l’ordre de la recherche', () => {
    const b = bac({ brouillon: { exercices: [ligne('dc-barre')] } });
    b.appel('ouvrirCatalogue()');
    b.appel('filtresCatalogue.muscle = "grand_dorsal"; rendreCatalogue();');
    expect(b.ctx.__vue.sections).toBeUndefined();
    expect(b.ctx.__vue.liste).toEqual(['rowing', 'tirage']);
  });

  test('la recherche tapée cherche les noms alternatifs du cache (« dc », « lat pulldown »)', () => {
    const b = bac({ brouillon: { exercices: [] } });
    b.appel('ouvrirCatalogue()');
    b.taper('dc');
    expect(b.ctx.__vue.liste).toEqual(['dc-barre']);
    b.taper('lat pulldown');
    expect(b.ctx.__vue.liste).toEqual(['tirage']);
    b.taper('develope');                          // une faute (une lettre en moins), 8 lettres
    expect(b.ctx.__vue.liste.length).toBe(3);
    b.taper('devellope');                         // deux fautes : rien
    expect(b.ctx.__vue.liste).toEqual([]);
  });
});

describe('126 — les mentions d’un résultat', () => {
  test('« Pas dans Ma salle » : hors du matériel déclaré ET jamais fait ; sans matériel déclaré, jamais', () => {
    const b = bac({ brouillon: { exercices: [] }, profil: { materiel: 'maison_minimal' }, comptes: { 'dc-barre': 2 } });
    b.appel('ouvrirCatalogue()');
    b.taper('developpe');
    const m = {};
    b.ctx.__vue.liste.forEach((s, i) => { m[s] = b.ctx.__vue.mentions[i]; });
    expect(m).toEqual({ 'dc-barre': [], 'dc-halteres': [], 'dc-smith': ['Pas dans Ma salle'] });
    const sans = bac({ brouillon: { exercices: [] } });
    sans.appel('ouvrirCatalogue()');
    sans.taper('developpe');
    expect(sans.ctx.__vue.mentions).toEqual([[], [], []]);
  });

  test('« Déjà dans la routine » : dans l’éditeur seulement — et l’exercice reste trouvable', () => {
    const b = bac({ brouillon: { exercices: [ligne('curl')] } });
    b.appel('ouvrirCatalogue()');
    b.taper('curl');
    expect([b.ctx.__vue.liste, b.ctx.__vue.mentions]).toEqual([['curl'], [['Déjà dans la routine']]]);
    const s = bac({ seance: { id: 's', routine_id: null, exercices: [ligne('curl')] } });
    s.appel('ouvrirCatalogue()');
    s.taper('curl');
    expect(s.ctx.__vue.mentions).toEqual([[]]);
  });
});

describe('126 — le rendu du champ vide (`rendreSuggestionsExo`)', () => {
  const texte = (n) => (n ? n.textContent : null);
  test('les sections titrées, leurs résultats (sous-ligne, mentions), puis la phrase ; une section vide ne s’affiche pas', () => {
    const c = document.createElement('div');
    const choisis = [];
    Rendu().rendreSuggestionsExo(c, {
      sections: [{ titre: 'Les plus proches', lignes: [{ exo: { slug: 'tirage', nom: 'Tirage Poitrine (Poulie)' }, mentions: ['comme « Lat Pulldown »'] }] },
                 { titre: 'Vide', lignes: [] }],
      pied: 'Ou tape le nom de l’exercice.', surChoix: (e) => choisis.push(e.slug), ecartes: ['tirage'],
      decrire: () => 'Poulie · Grand dorsal'
    });
    expect(Array.from(c.querySelectorAll('.resultats-groupe')).map(texte)).toEqual(['Les plus proches']);
    const b = c.querySelector('.resultat');
    expect(b.firstChild.textContent).toBe('Tirage Poitrine (Poulie)');
    expect(texte(b.querySelector('.resultat-sous'))).toBe('Poulie · Grand dorsal');
    expect(Array.from(b.querySelectorAll('.resultat-mention')).map(texte)).toEqual(['écarté', 'comme « Lat Pulldown »']);
    expect(texte(c.querySelector('.resultats-plus'))).toBe('Ou tape le nom de l’exercice.');
    expect(c.lastChild.className).toBe('resultats-plus');
    b.click();
    expect(choisis).toEqual(['tirage']);
  });

  test('`rendreResultatsExo` : les mentions de l’app sous « écarté »', () => {
    const c = document.createElement('div');
    Rendu().rendreResultatsExo(c, [{ slug: 'a', nom: 'Aaa' }], () => {}, ['a'], () => '', () => ['Pas dans Ma salle']);
    expect(Array.from(c.querySelectorAll('.resultat-mention')).map(texte)).toEqual(['écarté', 'Pas dans Ma salle']);
  });

  test('les styles de la maquette, sans couleur nouvelle', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../v2/styles.css'), 'utf8');
    expect(css).toMatch(/\.resultats-groupe\{[^}]*color:var\(--texte-3\)/);
    expect(css).toMatch(/\.resultats-plus\{[^}]*color:var\(--texte-3\)/);
  });
});

describe('126 — les données : `hors_salle` lu, les noms alternatifs dans le cache, hors ligne', () => {
  const src = (f) => fs.readFileSync(path.join(__dirname, '../../v2/js/' + f), 'utf8');
  test('le catalogue lit `hors_salle`', () => {
    expect(src('donnees.js')).toMatch(/from\('exercises'\)[\s\S]{0,400}hors_salle'\)/);
  });

  test('la synchronisation lit `Donnees.aliasCommuns` (une seule fonction), les range dans le magasin `alias` ; le démarrage les relit', () => {
    const app = src('app.js');
    expect(app).toMatch(/var alias = await essayer\(Donnees\.aliasCommuns\);/);
    expect(app).toMatch(/if \(alias\) local\.alias = Sync\.remplacer\(alias\);/);
    expect(app).toMatch(/await Cache\.remplacerTout\('alias', local\.alias\);/);
    expect(app).toMatch(/local\.alias = await Cache\.lireTout\('alias'\);/);
    // Aucune autre lecture d'`exercise_alias` que `aliasCommuns`.
    expect((src('donnees.js').match(/from\('exercise_alias'\)/g) || []).length).toBe(1);
  });

  test('« Mes exercices » cherche aussi les noms alternatifs (la même recherche)', () => {
    expect(extraire('rendreMesExercices')).toMatch(/Routines\.chercher\(local\.exercices, recherche, \{ limite: SANS_LIMITE, alias: local\.alias \}\)/);
  });
});
