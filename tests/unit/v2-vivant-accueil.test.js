//
// 173 (refonte « Vivant », lot 3) — l'accueil : « Prochaine séance » = la routine qui SUIT la dernière faite dans son dossier ;
// [Démarrer] est le même démarrage que Saisie ; pendant une séance en cours, [Continuer la séance].
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

  test('pendant une séance en cours, le bouton devient « Continuer la séance »', () => {
    const { cible, appels } = rendre({ enCours: true });
    expect(cible.querySelector('.prochaine-go').textContent).toBe('Continuer la séance');
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

describe('« J\u2019ai peu de temps » sur « Prochaine séance » (27/11/2026, MOTEUR §9.18)', () => {
  function rendre(extra) {
    const cible = document.createElement('div');
    const appels = { peu: [], demarrer: [], autre: 0 };
    window.THRendu.rendreProchaineSeance(cible, Object.assign({
      routine: R('b', 'Bas', 2, 'Prise'), catalogue: [], temps: () => ({ texte: '≈ 70 min (estimation)', peuDeTemps: true }),
      enCours: false,
      surDemarrer: (id) => appels.demarrer.push(id), surPeuDeTemps: (id) => appels.peu.push(id), surAutre: () => { appels.autre++; }
    }, extra || {}));
    return { cible, appels };
  }

  test('le lien appelle le même geste, pour la routine montrée, à côté de « Autre routine »', () => {
    const { cible, appels } = rendre();
    const lien = cible.querySelector('.prochaine-peu-de-temps');
    expect(lien.textContent).toBe('J\u2019ai peu de temps');
    expect(lien.parentNode).toBe(cible.querySelector('.prochaine-autre').parentNode);
    lien.click();
    expect(appels).toEqual({ peu: ['b'], demarrer: [], autre: 0 });
  });

  test('absent pendant une décharge, ou quand la routine est déjà courte (mêmes conditions que Saisie)', () => {
    expect(rendre({ temps: () => ({ texte: '≈ 40 min', peuDeTemps: false }) }).cible.querySelector('.prochaine-peu-de-temps')).toBeNull();
    expect(rendre({ temps: () => null }).cible.querySelector('.prochaine-peu-de-temps')).toBeNull();
  });

  test('3 + 1 : le nom, le résumé et « Démarrer » ; deux liens discrets, aucune carte de plus', () => {
    const { cible } = rendre();
    expect(cible.querySelectorAll('.prochaine-pied button.principal').length).toBe(1);
    expect(cible.querySelectorAll('.prochaine-pied button.discret').length).toBe(2);
  });

  test('pendant une séance en cours, ni ce lien ni « Autre routine »', () => {
    const { cible } = rendre({ enCours: true, seance: { titre: 'Haut B', nbExercices: 5, nbSeries: 16, faites: 3 } });
    expect(cible.querySelector('.prochaine-peu-de-temps')).toBeNull();
  });
});

describe('la carte pendant une séance en cours (21/11/2026)', () => {
  function rendre(extra) {
    const cible = document.createElement('div');
    const appels = { reprendre: 0, autre: 0, demarrer: [] };
    window.THRendu.rendreProchaineSeance(cible, Object.assign({
      routine: R('b', 'Bas A', 2, 'Prise'), catalogue: [], temps: () => ({ texte: '≈ 42 min' }),
      enCours: true, seance: { titre: 'Haut B', nbExercices: 5, nbSeries: 16, faites: 3 },
      surDemarrer: (id) => appels.demarrer.push(id), surReprendre: () => { appels.reprendre++; }, surAutre: () => { appels.autre++; }
    }, extra || {}));
    return { cible, appels };
  }

  test('elle nomme la séance en cours, pas la routine qui suit', () => {
    const { cible, appels } = rendre();
    expect(cible.querySelector('.prochaine-eti').textContent).toBe('SÉANCE EN COURS');
    expect(cible.querySelector('.prochaine-nom').textContent).toBe('Haut B');
    expect(cible.querySelector('.prochaine-meta').textContent).toBe('5 exercices · 3/16 séries');
    expect(cible.textContent).not.toMatch(/Bas A|PROCHAINE/);
    expect(cible.querySelector('.prochaine-go').textContent).toBe('Continuer la séance');
    cible.querySelector('.prochaine-go').click();
    expect(appels).toEqual({ reprendre: 1, autre: 0, demarrer: [] });
  });

  test('« Autre routine » est masqué', () => {
    expect(rendre().cible.querySelector('.prochaine-autre')).toBeNull();
  });

  test('sans routine suivante, la séance en cours a quand même sa carte', () => {
    const { cible } = rendre({ routine: null });
    expect(cible.hidden).toBe(false);
    expect(cible.querySelector('.prochaine-nom').textContent).toBe('Haut B');
  });
});
