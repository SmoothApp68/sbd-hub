/** @jest-environment node */
// Le squat des familles sur un VRAI catalogue (extrait du catalogue partagé du 27/11/2026, colonnes comprises, dont `accent_allonge` :
// la fixture 60-6 ne l'a pas, d'où un défaut qu'aucun test ne voyait). Aucune donnée d'utilisateur.
// Défaut : un compte neuf en Force ou « Les deux » recevait `split_squat_bulgare` (haltère, `accent_allonge`) à la place de `squat_barre` :
// 196 plaçait le critère d'allongement devant l'ordre des candidats. Il ne départage plus que des candidats équivalents.
const fs = require('fs');
const path = require('path');
const ROWS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/catalogue-reel-extrait.json'), 'utf8'));

let G, M, cat;
beforeAll(() => {
  require('../../v2/js/modele.js');
  require('../../v2/js/semaine.js');
  require('../../v2/js/palier.js');
  require('../../v2/js/moteur.js');
  require('../../v2/js/profil.js');
  G = require('../../v2/js/generateur.js');
  M = global.THModele;
  cat = M.indexerExercices(ROWS);
});

const entree = (objectif, jours, extra) => Object.assign({ jours, objectif, materiel: 'salle_complete', anciennete: '3_5_ans', plus65: null,
  faits: {}, priorites: [], menager: [], ecartes: [] }, extra || {});
const slugs = (rs) => [].concat.apply([], rs.map((rt) => rt.exercices.map((x) => x.exercise_slug)));

describe('le catalogue réel porte bien la colonne qui piégeait', () => {
  test('split_squat_bulgare est allongé, squat_barre ne l\'est pas', () => {
    expect(cat.split_squat_bulgare.accent_allonge).toBe(true);
    expect(cat.squat_barre.accent_allonge).toBe(false);
    expect(cat.squat_barre.equipement).toBe('barre');
  });
});

describe('squat barre = mouvement principal', () => {
  ['force', 'les_deux'].forEach((objectif) => [2, 3, 4, 5, 6].forEach((j) => ['3_5_ans', 'moins_1_an'].forEach((anc) => {
    test(objectif + ' · ' + j + ' j · ' + anc + ' : chaque place « squat » est la barre (ou sa pause)', () => {
      const rs = G.generer(cat, entree(objectif, j, { anciennete: anc }));
      const ex = slugs(rs);
      expect(ex).toContain('squat_barre');
      const jambes = rs.filter((rt) => rt.exercices.some((x) => x.motif === 'squat'));
      expect(jambes.length).toBeGreaterThan(0);
      jambes.forEach((rt) => expect(rt.exercices.find((x) => x.motif === 'squat').exercise_slug).toMatch(/^squat_(avec_pause_)?barre$/));
      expect(ex.filter((s) => s === 'split_squat_bulgare').length).toBeLessThanOrEqual(1);
    });
  })));
  test('Force 3 j : la barre de la famille en jour A, sa pause en jour B', () => {
    const rs = G.generer(cat, entree('force', 3));
    expect(rs[0].exercices.map((x) => x.exercise_slug)).toContain('squat_barre');
    expect(rs[1].exercices.map((x) => x.exercise_slug)).toContain('squat_avec_pause_barre');
  });
  test('Muscle : le squat barre est la place de squat', () => {
    expect(slugs(G.generer(cat, entree('muscle', 3)))).toContain('squat_barre');
  });
});

describe('l\'allongement départage toujours des candidats équivalents', () => {
  test('sans squat_barre (écarté), l\'allongé repasse devant : le bulgare reste une préférence', () => {
    const rs = G.generer(cat, entree('muscle', 3, { ecartes: ['squat_barre'] }));
    expect(slugs(rs)).not.toContain('squat_barre');
    expect(slugs(rs)).toContain('split_squat_bulgare');
  });
  test('le leg curl assis (allongé) reste devant le couché', () => {
    expect(slugs(G.generer(cat, entree('muscle', 4)))).toContain('leg_curl_assis');
  });
  test('les autres familles de barre restent la barre (couché, soulevé, militaire, rowing)', () => {
    const ex = slugs(G.generer(cat, entree('force', 4)));
    ['developpe_couche_barre', 'souleve_de_terre_barre'].forEach((s) => expect(ex).toContain(s));
    expect(ex.filter((s) => /couche|souleve|militaire|rowing/.test(s) && cat[s].equipement === 'barre').length).toBeGreaterThan(2);
  });
});
