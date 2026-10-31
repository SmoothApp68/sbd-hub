/** @jest-environment node */
// 195-1 — LES QUATRE ÉCHELLES DE LA CALISTHÉNIE (v2_125) et la marche d'habileté en objectif calisthénie.
process.env.TZ = 'Europe/Paris';
const Mo = require('../../v2/js/modele.js');

const e = (slug, echelle, rang, nature, charge) => ({ slug, nom: slug, echelle, echelle_rang: rang, nature: nature || 'force',
  habilete: nature === 'habilete', charge: charge || 'aucune', mesure: 'reps' });
const INDEX = {};
[
  e('squat_poids_du_corps', 'squat_poids_du_corps', 1), e('split_squat_bulgare_poids_du_corps', 'squat_poids_du_corps', 2),
  e('pistol_squat', 'squat_poids_du_corps', 3, 'habilete'), e('pistol_squat_leste', 'squat_poids_du_corps', 4, 'habilete', 'ajoutee'),
  e('pont_fessier', 'pont_fessier', 1), e('pont_fessier_une_jambe', 'pont_fessier', 2), e('souleve_de_terre_une_jambe', 'pont_fessier', 3),
  e('leg_curl_nordique_assiste_elastique', 'pont_fessier', 4, 'force', 'assistance'), e('leg_curl_nordique', 'pont_fessier', 5),
  e('rowing_inverse', 'rowing_inverse', 1), e('rowing_inverse_pieds_sureleves', 'rowing_inverse', 2),
  e('pompes_pike', 'pompes_pike', 1), e('pompes_pike_surelevees', 'pompes_pike', 2),
  e('pompes_equilibre_mur', 'pompes_pike', 3, 'habilete'), e('pompes_equilibre_libre', 'pompes_pike', 4, 'habilete')
].forEach((x) => { INDEX[x.slug] = x; });

describe('195-1 — marches de force : proposées pour tous', () => {
  test.each([
    ['squat_poids_du_corps', 'split_squat_bulgare_poids_du_corps'],
    ['pont_fessier', 'pont_fessier_une_jambe'], ['pont_fessier_une_jambe', 'souleve_de_terre_une_jambe'],
    ['souleve_de_terre_une_jambe', 'leg_curl_nordique_assiste_elastique'],
    ['leg_curl_nordique_assiste_elastique', 'leg_curl_nordique'],
    ['rowing_inverse', 'rowing_inverse_pieds_sureleves'], ['pompes_pike', 'pompes_pike_surelevees']
  ])('%s -> %s', (de, vers) => {
    expect(Mo.marcheSuivante(INDEX, de)).toEqual({ type: 'marche', cible: [vers], proposable: true });
  });
  test('le sommet d\'une échelle n\'a pas de suivante', () => {
    expect(Mo.marcheSuivante(INDEX, 'leg_curl_nordique')).toBeNull();
    expect(Mo.marcheSuivante(INDEX, 'rowing_inverse_pieds_sureleves')).toBeNull();
  });
});

describe('195-1 — une marche d\'habileté seulement en objectif calisthénie', () => {
  const ENTREES = [
    ['split_squat_bulgare_poids_du_corps', 'pistol_squat'], ['pistol_squat', 'pistol_squat_leste'],
    ['pompes_pike_surelevees', 'pompes_equilibre_mur'], ['pompes_equilibre_mur', 'pompes_equilibre_libre']
  ];
  test.each(ENTREES)('sans objectif calisthénie : %s ne propose pas %s', (de, vers) => {
    [undefined, { objectif: 'force' }, { objectif: 'les_deux' }, { objectif: 'muscle' }, { objectif: 'forme' }, { objectif: null }].forEach((o) => {
      expect(Mo.marcheSuivante(INDEX, de, o)).toEqual({ type: 'habilete', cible: [vers], proposable: false });
    });
  });
  test.each(ENTREES)('en calisthénie : %s propose %s', (de, vers) => {
    expect(Mo.marcheSuivante(INDEX, de, { objectif: 'calisthenie' })).toEqual({ type: 'marche', cible: [vers], proposable: true });
  });
  test('l\'objectif ne change rien aux marches de force', () => {
    expect(Mo.marcheSuivante(INDEX, 'pont_fessier', { objectif: 'calisthenie' })).toEqual(Mo.marcheSuivante(INDEX, 'pont_fessier'));
  });
  test('un catalogue sans les colonnes d\'échelle : rien ne change', () => {
    expect(Mo.marcheSuivante({ pont_fessier: { slug: 'pont_fessier' } }, 'pont_fessier', { objectif: 'calisthenie' })).toBeNull();
  });
});
