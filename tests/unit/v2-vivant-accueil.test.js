//
// 173 (refonte « Vivant », lot 3) — l'accueil : « Prochaine séance » = la routine qui SUIT la dernière faite dans son dossier ;
// [Démarrer] est le même démarrage que Saisie ; pendant une séance en cours, [Reprendre].
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/moteur.js');
require('../../v2/js/routines.js');
require('../../v2/js/rendu.js');
const Routines = window.THRoutines;

const R = (id, nom, rang, dossier, extra) => Object.assign({ id, nom, rang, dossier: dossier || null, exercices: [] }, extra || {});
const S = (routine_id, debut) => ({ routine_id, debut });

describe('la routine qui suit la dernière faite (173)', () => {
  const rs = [R('a', 'Haut A', 1, 'Prise'), R('b', 'Bas', 2, 'Prise'), R('c', 'Haut B', 3, 'Prise'), R('z', 'Autre', 4, 'Sèche')];

  test('la suivante, pas la première', () => {
    const r = Routines.routineSuivante(rs, [S('a', '2026-10-20T10:00:00Z'), S('b', '2026-10-22T10:00:00Z')]);
    expect(r.routine.id).toBe('c');
  });

  test('après la dernière du dossier, on reprend la première ; l\'ordre des séances importe peu', () => {
    const r = Routines.routineSuivante(rs, [S('c', '2026-10-24T10:00:00Z'), S('a', '2026-10-20T10:00:00Z')]);
    expect(r.routine.id).toBe('a');
  });

  test('le dossier en cours est celui de la dernière routine faite', () => {
    const r = Routines.routineSuivante(rs.concat([R('y', 'Sèche 2', 5, 'Sèche')]), [S('a', '2026-10-20T10:00:00Z'), S('z', '2026-10-23T10:00:00Z')]);
    expect(r.routine.id).toBe('y');
  });

  test('aucune séance de routine, ou une routine disparue ou archivée : pas de carte', () => {
    expect(Routines.routineSuivante(rs, [])).toBeNull();
    expect(Routines.routineSuivante(rs, [S(null, '2026-10-20T10:00:00Z'), S('fantome', '2026-10-21T10:00:00Z')])).toBeNull();
    const arch = [R('a', 'A', 1, null, { archivee_a: '2026-01-01' }), R('b', 'B', 2, null)];
    expect(Routines.routineSuivante(arch, [S('a', '2026-10-20T10:00:00Z')])).toBeNull();
  });
});

describe('la carte « Prochaine séance » (173)', () => {
  function rendre(extra) {
    const cible = document.createElement('div');
    const appels = { demarrer: [], reprendre: 0, autre: 0 };
    window.THRendu.rendreProchaineSeance(cible, Object.assign({
      routine: R('b', 'Bas', 2, 'Prise'), catalogue: [], temps: () => ({ texte: '≈ 55 min (estimation)' }),
      enCours: false,
      surDemarrer: (id) => appels.demarrer.push(id), surReprendre: () => { appels.reprendre++; }, surAutre: () => { appels.autre++; }
    }, extra || {}));
    return { cible, appels };
  }

  test('le nom, le résumé, Démarrer lance la routine montrée, « Autre routine » mène à Saisie', () => {
    const { cible, appels } = rendre();
    expect(cible.hidden).toBe(false);
    expect(cible.querySelector('.prochaine-eti').textContent).toBe('PROCHAINE SÉANCE');
    expect(cible.querySelector('.prochaine-nom').textContent).toBe('Bas');
    expect(cible.querySelector('.prochaine-meta').textContent).toMatch(/^0 exercice · 0 série · ≈ 55 min/);
    cible.querySelector('.prochaine-go').click();
    cible.querySelector('.prochaine-autre').click();
    expect(appels).toEqual({ demarrer: ['b'], reprendre: 0, autre: 1 });
  });

  test('pendant une séance en cours, le bouton devient Reprendre', () => {
    const { cible, appels } = rendre({ enCours: true });
    expect(cible.querySelector('.prochaine-go').textContent).toBe('Reprendre');
    cible.querySelector('.prochaine-go').click();
    expect(appels.reprendre).toBe(1);
    expect(appels.demarrer).toEqual([]);
  });

  test('sans routine déduite : pas de carte', () => {
    const { cible } = rendre({ routine: null });
    expect(cible.hidden).toBe(true);
    expect(cible.children.length).toBe(0);
  });
});
