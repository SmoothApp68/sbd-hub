// 152 — « À l'échec » : une série `echec` se lit par ses reps (1 rep et + = travail à fond, 0 rep = tentative manquée).
// jsdom : `rendu.js` se termine par `this`.
require('../../v2/js/routeur.js');
require('../../v2/js/semaine.js');
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/routines.js');
const P = require('../../v2/js/palier.js');
require('../../v2/js/rendu.js');
const Social = require('../../v2/js/social.js');

const s = (kg, reps, type, extra) => Object.assign({ type_serie: type || 'travail', charge_kg: kg, reps: reps, rpe: null }, extra || {});
const seance = (...liste) => liste.map((x, i) => Object.assign({ id: 'x' + i, rang: i + 1 }, x));

describe('152 — la lecture unique (modele.js)', () => {
  test('echec à 0 rep, reps vides ou nulles : une tentative manquée, pas du travail', () => {
    [0, '', null, undefined, 'x'].forEach((r) => {
      const x = s(130, r, 'echec');
      expect(Modele.estTravail(x)).toBe(false);
      expect(Modele.estAEchec(x)).toBe(false);
      expect(Modele.estManquee(x)).toBe(true);
      expect(Modele.motDEchec(x)).toBe('manquée');
    });
  });
  test('echec à 1 rep ou plus : une série de travail à l’échec', () => {
    [1, 3, '3', '2,0'].forEach((r) => {
      const x = s(130, r, 'echec');
      expect(Modele.estTravail(x)).toBe(true);
      expect(Modele.estAEchec(x)).toBe(true);
      expect(Modele.estManquee(x)).toBe(false);
      expect(Modele.motDEchec(x)).toBe('à l’échec');
    });
  });
  test('les autres types n’ont pas de mot d’échec ; le travail reste du travail', () => {
    expect(Modele.motDEchec(s(100, 5))).toBeNull();
    expect(Modele.motDEchec(s(60, 5, 'echauffement'))).toBeNull();
    expect(Modele.estTravail(s(100, 5))).toBe(true);
    expect(Modele.estTravail(s(60, 5, 'degressive'))).toBe(false);
  });
  test('un bloc : la série à l’échec prend un numéro et son mot, la manquée n’en prend pas', () => {
    const brutes = [
      { id: 'a', session_id: 'S', exercise_slug: 'squat', rang: 1, type_serie: 'travail', charge_kg: 125, reps: 5 },
      { id: 'b', session_id: 'S', exercise_slug: 'squat', rang: 2, type_serie: 'echec', charge_kg: 130, reps: 3 },
      { id: 'c', session_id: 'S', exercise_slug: 'squat', rang: 3, type_serie: 'echec', charge_kg: 142.5, reps: 0 }
    ];
    const exo = Modele.construireBlocs(brutes.map((x) => Object.assign({ groupe_superset: null }, x)))[0].exercices[0];
    expect(exo.series.map((x) => x.estTravail)).toEqual([true, true, false]);
    expect(exo.series.map((x) => x.tour)).toEqual([1, 2, null]);
    expect(exo.series.map((x) => x.motEchec)).toEqual([null, 'à l’échec', 'manquée']);
  });
});

describe('152 — le palier et le cran', () => {
  test('le cran d’une série à l’échec est « max » ; à 0 rep, rien', () => {
    expect(P.cranDeSerie(s(130, 3, 'echec'))).toBe('max');
    expect(P.cranDeSerie(s(130, 0, 'echec'))).toBeNull();
    expect(P.repsPrudentes(s(130, 3, 'echec'))).toBe(2);
    expect(P.repsPrudentes(s(130, 0, 'echec'))).toBe(0);
  });
  test('palier de 125×5, 125×5, 130×3 (echec) : la série à l’échec est lue comme du travail (ici une exploration), plus comme un tag écarté', () => {
    const r = P.analyser(seance(s(125, 5), s(125, 5), s(130, 3, 'echec')), { etat: 'indetermine', part: 0, total: 99 });
    expect(r.series.map((d) => d.role)).toEqual(['travail', 'travail', 'exploration']);
    expect(r.palier).toBe(125);
    const m = P.analyser(seance(s(125, 5), s(125, 5), s(130, 3, 'echec', { reps: 0 })), { etat: 'indetermine', part: 0, total: 99 });
    expect(m.series[2].role).toBe('echec');
  });
  test('la même séance avec 130 × 0 : la manquée est ignorée, le palier reste 125 × 5', () => {
    const r = P.analyser(seance(s(125, 5), s(125, 5), s(130, 0, 'echec')), { etat: 'indetermine', part: 0, total: 99 });
    expect(r.series.map((d) => d.role)).toEqual(['travail', 'travail', 'echec']);
    expect(r.palier).toBe(125);
  });
  test('trois séries dont une à l’échec plus lourde : 130 devient le palier à 3 voix sur 3 (n=3, requis 2)', () => {
    const r = P.analyser(seance(s(130, 5), s(130, 4), s(130, 3, 'echec')), { etat: 'indetermine', part: 0, total: 99 });
    expect(r.palier).toBe(130);
    expect(r.series[2].role).toBe('travail');
  });
});

describe('152 — le direct et la feuille', () => {
  const T0 = Date.parse('2026-10-23T10:00:00Z');
  const ligne = (type, reps) => ({ pseudo: 'jordan', exercise_slug: 'squat', charge_kg: 170, reps: reps, type_serie: type,
    validee_a: new Date(T0 - 1000).toISOString() });
  test('le direct dit « à l’échec » à 1 rep et plus, « manquée » à 0', () => {
    const l = Social.lignesDuDirect([ligne('echec', 2), ligne('echec', 0), ligne('travail', 5)], new Date(T0).toISOString(), (x) => x, () => '');
    expect(l.map((x) => x.etiquette)).toEqual(['à l’échec', 'manquée', null]);
  });
  test('la feuille du type dit « À l’échec » avec sa règle', () => {
    const cible = document.createElement('div');
    window.THRendu.rendreFeuilleSerie(cible, { quoi: 'type', numero: 2, exercice: 'Squat', serie: s(130, 3, 'echec'), surType() {},
      surSupprimer() {}, surNoteSerie() {} });
    const txt = cible.textContent;
    expect(txt).toContain('À l’échec');
    expect(txt).toContain('Tes reps comptent, sans marge. À 0 rep : une tentative manquée.');
    expect(txt).not.toContain('Tentative manquée');
  });
});
