//
// 119 (audit du 16/10/2026) — LES ÉCRANS QUI MONTRENT UNE DURÉE OU UNE DISTANCE : ce qui s'affiche dépend de la
// mesure. Environnement jsdom (PAS de docblock `node`) : `modele.js` et `rendu.js` se terminent par `this`.

require('../../v2/js/routeur.js');
require('../../v2/js/semaine.js');
require('../../v2/js/modele.js');
require('../../v2/js/routines.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const sommaire = (mois) => {
  const cible = document.createElement('div');
  Rendu().rendreSommaire(cible, { mois: Object.assign({ titre: 'Septembre', surChoix: () => {} }, mois),
    volume: { quand: '', zones: [] }, poids: {}, exercices: { quand: '', lignes: [] } });
  return cible.querySelector('.bloc-ligne').textContent;
};

describe('119 — F8 : le bloc du mois écoulé, sans tonnes', () => {
  test('un mois au poids du corps dit ses séries de travail, pas « Pas encore de série »', () => {
    expect(sommaire({ kg: 0, series: 24 })).toBe('24 séries de travail');
    expect(sommaire({ kg: 0, series: 1 })).toBe('1 série de travail');
  });
  test('sans série de travail (rien, ou des sorties seules) : « Pas encore de série de travail »', () => {
    expect(sommaire({ kg: 0, series: 0 })).toBe('Pas encore de série de travail');
  });
  test('avec des tonnes : les tonnes, comme avant', () => {
    expect(sommaire({ kg: 52000, series: 80 })).toMatch(/soulevées$/);
  });
});

describe('119 — E8 : la colonne du détail suit la mesure', () => {
  const Modele = window.THModele;
  const CAT = [
    { slug: 'planche', nom: 'Planche', mesure: 'temps', charge: 'aucune', muscles_primaires: ['abdominaux'] },
    { slug: 'tapis', nom: 'Tapis de course', mesure: 'distance_temps', charge: 'aucune', muscles_primaires: [] },
    { slug: 'dc', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', muscles_primaires: ['pectoraux'] },
    { slug: 'dips', nom: 'Dips', mesure: 'reps', muscles_primaires: ['triceps'] }
  ];
  let r = 0;
  const s = (slug, champs, g) => Object.assign({ id: 'x' + (++r), session_id: 'S', exercise_slug: slug, rang: r,
    type_serie: 'travail', charge_kg: null, reps: null, duree_s: null, distance_m: null, groupe_superset: g || null,
    source: 'import' }, champs);
  const series = [s('planche', { duree_s: 90 }), s('planche', { duree_s: 75 }),
    s('tapis', { duree_s: 1200, distance_m: 3200 }), s('dc', { charge_kg: 100, reps: 5 }),
    s('dc', { charge_kg: 100, reps: 5 }, 7), s('dips', { reps: 12 }, 7), s('inconnu', { duree_s: 30 })];
  const blocs = Modele.construireBlocs(series, CAT);
  test('« Durée » sur une planche, « Distance · durée » sur un tapis (131b), « Charge » sur le couché', () => {
    expect(blocs.map((b) => b.entete)).toEqual(['Durée', 'Distance · durée', 'Charge', 'Mesure', 'Durée']);
  });
  test('l’écran l’affiche : jamais « Charge » au-dessus de « 1 min 30 » ni de « 3,2 km · 20 min »', () => {
    const cible = document.createElement('div');
    Rendu().rendreDetail(cible, { titre: 'Gainage', debut: '2026-10-16T17:00:00Z' }, blocs, {});
    const tetes = [...cible.querySelectorAll('.entetes')].map((x) => x.textContent);
    expect(tetes).toEqual(['SérieDurée', 'SérieDistance · durée', 'SérieCharge', 'SérieMesure', 'SérieDurée']);
    expect(cible.textContent).toContain('3,2 km · 20 min');  // 131 : distance, puis durée
  });
});

describe('119 — E10 : l’aperçu « En faire une routine » écrit une durée en durée', () => {
  test('« L-Sit : 20 s », « Planche : 45 s », jamais « 0 min » ni « 1 min » pour 45 s', () => {
    const cible = document.createElement('div');
    Rendu().rendreApercuRoutine(cible, { nom: 'Gainage', dossier: null, surDossier: () => {}, surNom: () => {},
      surCreer: () => {}, surAnnuler: () => {}, lignes: [
        { nom: 'L-Sit', series: [{ type_serie: 'travail', duree_s: 20 }], repos: null },
        { nom: 'Planche', series: [{ type_serie: 'travail', duree_s: 45 }], repos: 90, origine: null },
        { nom: 'Tapis', series: [{ type_serie: 'travail', duree_s: 1200 }], repos: null }
      ] });
    const t = cible.querySelector('.apercu-routine').textContent;
    expect(t).toContain('20 s');
    expect(t).toContain('45 s');
    expect(t).toContain('20 min');
    expect(t).not.toMatch(/(^|[^\d])[01] min/);
  });
});

describe('119 — E12 : la feuille « Terminer » et le récap d’une séance de cardio', () => {
  const feuille = (compte) => {
    const cible = document.createElement('div');
    Rendu().rendreFeuilleFin(cible, { compte, titre: '', salle: '', note: '', surTitre: () => {}, surSalle: () => {},
      surNote: () => {}, surTerminer: () => {}, surAnnuler: () => {}, surAbandonner: () => {} });
    return cible.querySelector('.feuille-t em').textContent;
  };
  test('« 1 série enregistrée · 3,2 km · 20 min » (131b), jamais « 0 série de travail enregistrée »', () => {
    expect(feuille({ travail: 0, horsMusculation: { series: 1, duree_s: 1200, distance_m: 3200 } }))
      .toBe('1 série enregistrée · 3,2 km · 20 min');
  });
  test('une séance de musculation garde son compte de séries de travail', () => {
    expect(feuille({ travail: 12, horsMusculation: { series: 1, duree_s: 600, distance_m: 1000 } }))
      .toBe('12 séries de travail enregistrées');
  });
  test('le récap a un groupe « Cardio », une ligne par exercice', () => {
    const cible = document.createElement('div');
    Rendu().rendreRecap(cible, { recap: { titre: 'Cardio', debut: '2026-10-16T17:00:00Z', fin: '2026-10-16T17:20:00Z',
      duree_min: 20, series: 0, volume_texte: '0 t', exercices: 0, muscles: { premiers: [], autres: null },
      cardio: [{ slug: 'tapis', nom: 'Tapis roulant', fait: '20 min · 3,2 km' }], records: [], paris: null } });
    expect(cible.textContent).toContain('Cardio');
    expect(cible.querySelector('.recap-cardio').textContent).toBe('Tapis roulant20 min · 3,2 km');
  });
});
