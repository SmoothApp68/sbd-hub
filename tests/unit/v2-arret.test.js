/** @jest-environment node */
//
// 53-2 ter — L'ARRÊT D'UN PROGRAMME REND LA ZONE D'AVANT (MOTEUR §9.22, delta
// 53-2 ter). Les 5 cas de `cas_arret53.json` (référence `arret53.py`), sur la
// fonction d'arrêt (`lignesDArret` : les lignes écrites) et sur la seule lecture
// des zones (`lignesDeZoneValides` : les zones lues à `lire_a`).
//
// Les cas donnent l'instant de l'arrêt (`arrete_a`) à côté du bloc ; l'app le
// porte sur le bloc lui-même : son statut (`arrete`, ou `termine` après sa fin)
// et `modifie_a`. C'est la seule traduction faite ici.

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
const F = require('./fixtures/cas_arret53.json');

const sansId = (l) => ({ exercise_slug: l.exercise_slug, zone: l.zone, corrigee_a: l.corrigee_a,
  origine: l.origine, bloc_id: l.bloc_id });
// L'état des blocs APRÈS l'arrêt, comme l'app le pose.
function blocsApres(c) {
  return c.blocs.map((b) => {
    if (b.arrete_a) return Object.assign({}, b, { modifie_a: b.arrete_a });
    if (c.bloc && b.id === c.bloc.id && c.arrete_a) {
      const fini = M.blocTermine(b, M.jourCivil(c.arrete_a));
      return Object.assign({}, b, { statut: fini ? 'termine' : 'arrete', modifie_a: c.arrete_a });
    }
    return b;
  });
}

describe('53-2 ter — les 5 cas de l’arrêt', () => {
  test('le fichier : 5 cas', () => {
    expect(F.cas.length).toBe(5);
  });
  F.cas.forEach((c, i) => {
    test('cas ' + (i + 1) + ' — ' + c.titre, () => {
      const blocs = blocsApres(c);
      const bloc = c.bloc ? blocs.filter((b) => b.id === c.bloc.id)[0] : null;
      const ecrites = bloc ? M.lignesDArret(bloc, blocs, c.lignes, c.arrete_a, null, null) : [];
      expect(ecrites.map(sansId)).toEqual(c.attendu_lignes_ecrites);
      const lues = M.lignesDeZoneValides(c.lignes.concat(ecrites), blocs);
      const zones = {};
      Object.keys(c.attendu_zones).forEach((slug) => { zones[slug] = M.zoneEnVigueur(lues, slug, c.lire_a); });
      expect(zones).toEqual(c.attendu_zones);
    });
  });
});

describe('53-2 ter — une ligne inerte est ignorée, jamais lue comme « sans zone »', () => {
  const c = F.cas[2];   // l'arrêt avant le début
  test('⚠️ DISCRIMINANT — le lundi venu, le soulevé reste en Lourd (sa correction du 28/09), pas en automatique', () => {
    const lues = M.lignesDeZoneValides(c.lignes, blocsApres(c));
    expect(M.ligneDeZoneAu(lues, 'souleve_de_terre_barre', c.lire_a, true).origine).toBe('personne');
    // Sans la lecture : la ligne du bloc l'emporterait (Mix).
    expect(M.zoneEnVigueur(c.lignes, 'souleve_de_terre_barre', c.lire_a)).toBe('mix');
  });
  test('la ligne de l’arrêt (datée de l’arrêt, avec ou sans zone) n’est jamais inerte', () => {
    const c1 = F.cas[0];
    const blocs = blocsApres(c1);
    const ecrites = M.lignesDArret(blocs[0], blocs, c1.lignes, c1.arrete_a, null, null);
    expect(M.lignesDeZoneValides(ecrites, blocs)).toEqual(ecrites);
  });
});

describe('53-2 ter — ce que l’arrêt écrit n’est pas un début de bloc', () => {
  const c = F.cas[0];
  const blocs = blocsApres(c);
  const ecrites = M.lignesDArret(blocs[0], blocs, c.lignes, c.arrete_a, null, null);
  test('« Nouveau bloc » et « · bloc » : seulement pour une ligne posée au début de son bloc', () => {
    const pose = c.lignes.filter((l) => l.bloc_id === 'b1' && l.exercise_slug === 'souleve_de_terre_barre')[0];
    expect(M.ligneDeDebutDeBloc(pose, blocs)).toBe(pose);
    const arret = ecrites.filter((l) => l.exercise_slug === 'souleve_de_terre_barre')[0];
    expect(arret.zone).toBe('lourd');
    expect(M.ligneDeDebutDeBloc(arret, blocs)).toBe(null);
    expect(M.etiquetteZone({ zone: 'lourd' }, M.ligneDeDebutDeBloc(arret, blocs))).toBe('Lourd 3-5');
  });
});
