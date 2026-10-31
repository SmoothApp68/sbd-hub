/** @jest-environment node */
//
// 193-2 (commit 2) — LA LIGNE PORTE SES RECULS ET SA ZONE jusqu'à la routine, et les places liées (la même barre, deux zones) se
// remplacent ENSEMBLE. Jamais deux lignes d'une même barre qui se séparent en silence.
const fs = require('fs');
const path = require('path');

const F = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-193-2-programmes-force.json'), 'utf8'));
const CAS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-60-6-generateur.json'), 'utf8'));

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/profil.js');
require('../../v2/js/moteur.js');
const R = require('../../v2/js/routines.js');
const G = require('../../v2/js/generateur.js');

const catalogue = () => {
  const c = {};
  Object.keys(CAS.catalogue).forEach((slug) => {
    const [equipement, primaires, secondaires] = CAS.catalogue[slug];
    c[slug] = { equipement, muscles_primaires: primaires.slice(), muscles_secondaires: secondaires.slice() };
  });
  Object.keys(F.catalogue_ajouts).forEach((slug) => {
    const [equipement, primaires, secondaires, mouvement] = F.catalogue_ajouts[slug];
    c[slug] = { equipement, muscles_primaires: primaires.slice(), muscles_secondaires: secondaires.slice(), mouvement };
  });
  return c;
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const BASE = { materiel: 'salle_complete', anciennete: '3_a_5_ans', phase: 'maintien', priorites: [], menager: [], ecartes: [], faits: {} };
const entree = (o) => Object.assign(clone(BASE), o);
const SQUAT = 'squat_barre';

describe('routineDeduite : reculs et zone', () => {
  const deduite = (exercices) => ({ nom: 'Séance', exercices });

  test('une grosse série et ses reculs : 1 série de travail puis N séries `recul`, aux reps du recul', () => {
    const r = R.routineDeduite(deduite([{ exercise_slug: SQUAT, series: 1, reps: 4, reculs: 3, reps_recul: 6 }]), { exercices: [] });
    const s = r.exercices[0].series;
    expect(s.map((x) => x.type_serie)).toEqual(['travail', 'recul', 'recul', 'recul']);
    expect(s.map((x) => x.reps_visees)).toEqual([4, 6, 6, 6]);
  });

  test('la zone du jour part sur la ligne de l’exercice ; sans zone, la clé n’existe pas', () => {
    const avec = R.routineDeduite(deduite([{ exercise_slug: SQUAT, series: 5, reps: 4, zone: 'lourd' }]), { exercices: [] });
    expect(avec.exercices[0].zone).toBe('lourd');
    const sans = R.routineDeduite(deduite([{ exercise_slug: SQUAT, series: 5, reps: 4 }]), { exercices: [] });
    expect('zone' in sans.exercices[0]).toBe(false);
  });

  test('la charge de départ ne va jamais sur un recul', () => {
    const r = R.routineDeduite(deduite([{ exercise_slug: SQUAT, series: 1, reps: 4, reculs: 2, reps_recul: 6, charge_cible_kg: 100 }]),
      { exercices: [] });
    expect(r.exercices[0].series.map((x) => x.charge_cible_kg || null)).toEqual([100, null, null]);
  });

  test('sans reculs ni zone, la structure est celle d’avant', () => {
    const r = R.routineDeduite(deduite([{ exercise_slug: SQUAT, series: 3, reps: 8 }]), { exercices: [] });
    expect(r.exercices[0].series.map((x) => x.type_serie)).toEqual(['travail', 'travail', 'travail']);
    expect('zone' in r.exercices[0]).toBe(false);
  });
});

describe('les places liées se remplacent ensemble', () => {
  const cat = catalogue();
  const e = entree({ objectif: 'force', jours: 4 });
  const prog = () => G.generer(cat, clone(e));
  const places = (rs, slug) => {
    const o = [];
    rs.forEach((rt, i) => rt.exercices.forEach((x, k) => { if (x.exercise_slug === slug) o.push([i, k]); }));
    return o;
  };

  test('lieesDe : une barre à deux zones donne deux places ; une ligne sans lien, elle seule', () => {
    const rs = prog();
    const p = places(rs, SQUAT);
    expect(p.length).toBe(2);
    expect(G.lieesDe(rs, p[0][0], p[0][1]).length).toBe(2);
    const seule = rs.map((rt, i) => rt.exercices.map((x, k) => (!x.lien ? [i, k] : null)).filter(Boolean)).filter((l) => l.length)[0][0];
    expect(G.lieesDe(rs, seule[0], seule[1])).toEqual([seule]);
  });

  test('remplacePar : les deux places du squat prennent le même remplaçant, chacune garde sa zone', () => {
    const rs = prog();
    const p = places(rs, SQUAT);
    const zones = p.map(([i, k]) => rs[i].exercices[k].zone);
    expect(new Set(zones).size).toBe(2);
    const neuf = G.remplacePar(cat, rs, e, p[0][0], p[0][1], 'presse_a_cuisses');
    expect(places(neuf, SQUAT)).toEqual([]);
    const q = places(neuf, 'presse_a_cuisses');
    expect(q.length).toBe(2);
    expect(q.map(([i, k]) => neuf[i].exercices[k].zone).sort()).toEqual(zones.slice().sort());
    expect(rs.length).toBe(neuf.length);
  });

  test('remplacer la deuxième place remplace aussi la première', () => {
    const rs = prog();
    const p = places(rs, SQUAT);
    const neuf = G.remplacePar(cat, rs, e, p[1][0], p[1][1], 'presse_a_cuisses');
    expect(places(neuf, 'presse_a_cuisses').length).toBe(2);
  });

  test('neVeuxPas : les deux places changent ensemble, avec le même remplaçant, et l’écarté est écarté', () => {
    const rs = prog();
    const p = places(rs, SQUAT);
    const res = G.neVeuxPas(cat, rs, e, p[0][0], p[0][1]);
    expect(res.ecartes).toContain(SQUAT);
    expect(places(res.routines, SQUAT)).toEqual([]);
    const nouveaux = p.map(([i, k]) => res.routines[i].exercices[k].exercise_slug);
    expect(nouveaux[0]).toBe(nouveaux[1]);
    expect(nouveaux[0]).not.toBe(SQUAT);
  });

  test('rien n’est modifié en place', () => {
    const rs = prog();
    const avant = JSON.stringify(rs);
    const p = places(rs, SQUAT);
    G.remplacePar(cat, rs, e, p[0][0], p[0][1], 'presse_a_cuisses');
    G.neVeuxPas(cat, rs, e, p[0][0], p[0][1]);
    expect(JSON.stringify(rs)).toBe(avant);
  });

  test('un remplaçant qui charge une zone à ménager perd sa série lourde sur ses DEUX places (Lourd devient Mix en Force)', () => {
    const m = entree({ objectif: 'force', jours: 4, menager: ['dos'] });
    const rs = G.generer(cat, clone(e));                 // le programme d'abord, sans rien à ménager
    const p = places(rs, SQUAT);
    expect(p.length).toBe(2);
    const neuf = G.remplacePar(cat, rs, m, p[0][0], p[0][1], 'souleve_de_terre_roumain_barre');
    const q = places(neuf, 'souleve_de_terre_roumain_barre').filter(([i, k]) => neuf[i].exercices[k].lien);
    expect(q.length).toBe(2);
    q.forEach(([i, k]) => {
      const x = neuf[i].exercices[k];
      expect(x.menage).toBe(true);
      expect(x.zone).not.toBe('lourd');
      expect(x.reculs || 0).toBe(0);
    });
  });
});

describe('193-2 (commit 4) — l’aperçu dit le programme de famille', () => {
  const cat = catalogue();
  const nommer = (s) => s;
  const dit = (objectif, jours, o) => {
    const e = entree(Object.assign({ objectif, jours }, o || {}));
    const rs = G.generer(cat, clone(e));
    return { e, rs, p: G.phrasesDeLApercu(rs, e, nommer, rs.length) };
  };

  test('Force 4 jours : combien de fois chaque barre, la zone de chaque jour, la semaine allégée, la fréquence', () => {
    const { p } = dit('force', 4);
    expect(p.famille).toEqual([
      'Dans la semaine : squat 2 fois, couché 3 fois, soulevé 1 fois lourd.',
      'Chaque jour a sa zone : la même barre passe de Lourd à Mix ou à Hypertrophie.',
      'Une semaine allégée toutes les 5 semaines : mêmes charges, moins de séries.',
      'Fréquence : environ 3 % de force de plus par séance hebdomadaire ajoutée sur un mouvement (Pelland 2026).']);
  });

  test('Les deux 4 jours : la grosse série et ses reculs sont dits', () => {
    const { p } = dit('les_deux', 4);
    expect(p.famille[0]).toBe('Dans la semaine : squat 2 fois, couché 2 fois, soulevé 1 fois lourd.');
    expect(p.famille[1]).toMatch(/grosse série puis des reculs/);
  });

  test('Les deux 2 jours : chaque barre une fois, et l’en-tête le dit', () => {
    const { p } = dit('les_deux', 2);
    expect(p.famille[0]).toBe('Dans la semaine : squat 1 fois, couché 1 fois, soulevé 1 fois lourd.');
    expect(p.famille).toContain('Avec 2 séances, chaque barre passe une fois.');
    expect(p.famille.join(' ')).not.toMatch(/Fréquence/);
  });

  test('Muscle, Forme, débutant, maison sans barre : aucune phrase de famille', () => {
    expect(dit('muscle', 4).p.famille).toEqual([]);
    expect(dit('forme', 3).p.famille).toEqual([]);
    expect(dit('force', 3, { anciennete: 'moins_1_an' }).p.famille).toEqual([]);
    expect(dit('les_deux', 3, { materiel: 'maison_minimal' }).p.famille).toEqual([]);
  });

  test('les phrases ne sont pas plus faibles qu’un fait : pas d’ordre, pas de « palier », pas de « bravo »', () => {
    ['force', 'les_deux'].forEach((o) => [2, 3, 4, 5, 6].forEach((j) => {
      dit(o, j).p.famille.forEach((t) => expect(t).not.toMatch(/palier|bravo|il faut|tu dois|assidu|la science|les études/i));
    }));
  });

  test('mentionsDeLigne : la zone du jour avec ses reps, avant le reste ; une place sans zone n’en dit rien', () => {
    const { e, rs } = dit('les_deux', 4);
    const lourde = rs[0].exercices.find((x) => x.zone === 'lourd');
    expect(G.mentionsDeLigne(lourde, e)).toEqual(['zone Lourd (3-5)']);
    const hyper = rs[0].exercices.find((x) => x.zone === 'hypertrophie');
    expect(G.mentionsDeLigne(hyper, e)).toEqual(['zone Hypertrophie (8-10)']);
    const libre = rs[0].exercices.find((x) => !x.zone);
    expect(G.mentionsDeLigne(libre, e).join(' ')).not.toMatch(/zone/);
  });

  test('pourquoi : les reculs comptent dans les séries d’une zone du radar', () => {
    const { rs } = dit('les_deux', 4);
    // Bas A : squat 1 + 3 reculs, roumain 3, leg curl 3, mollets 3 → Jambes 13
    expect(G.pourquoi(cat, rs[1])).toMatch(/^Jambes 13 séries$/);
  });
});
