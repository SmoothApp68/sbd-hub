/** @jest-environment node */
//
// 179 — Sécurité et vérité : ce que le coach écrit est vrai, et ce qui vit dans le plan ne se recopie pas dans l'écran.
// (La douleur de l'assistant a son fichier : `v2-assistant-douleur.test.js`.)

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');

describe('179 (C-F8) — le pourcentage de la série de plus est calculé (1 série sur n de la routine)', () => {
  const carte = (n) => M.carteSerieDePlus({ palier: 100, niveau: 8 }, 4, false, [], null, n);
  test.each([[1, 100], [2, 50], [3, 33], [4, 25], [5, 20], [8, 13]])('%i série(s) de routine : %i %%', (n, pct) => {
    expect(carte(n).detail).toContain('environ ' + pct + ' % de travail en plus');
  });
  test('sans nombre de séries lu : pas de pourcentage inventé', () => {
    const d = carte(null).detail;
    expect(d).toContain('du travail en plus');
    expect(d).not.toMatch(/\d+ %/);
  });
});

describe('179 (C-F6) — « peut relancer », jamais « relance souvent »', () => {
  test('les deux détails de schéma', () => {
    expect(M.DETAIL_BORD_SCHEMA === undefined || !/souvent/.test(M.DETAIL_BORD_SCHEMA)).toBe(true);
  });
});

describe('179 (B-B4) — « Alléger N jours » vient du moteur', () => {
  test('libelleAlleger lit la constante de durée', () => {
    expect(M.libelleAlleger()).toMatch(/^Alléger \d+ jours$/);
    expect(M.libelleAlleger()).toBe('Alléger 7 jours');   // la durée vit dans le moteur (DUREE_ALLEGEE_JOURS)
  });
});

describe('179 (B-B8) — un seul prédicat « le coach se tait »', () => {
  test('profil en Entretenir : tout se tait', () => {
    expect(M.coachSeTait('entretien')).toBe(true);
    expect(M.coachSeTait('entretien', 'progresser')).toBe(true);
  });
  test('exercice en Entretenir sous un profil qui progresse : cet exercice se tait', () => {
    expect(M.coachSeTait('progresser', 'entretien')).toBe(true);
    expect(M.coachSeTait('progresser', 'progresser')).toBe(false);
    expect(M.coachSeTait('progresser')).toBe(false);
    expect(M.coachSeTait(null, null)).toBe(false);
  });
});

describe('179 (B-B1) — « muet » est une donnée du plan, pas une recherche dans le texte', () => {
  test('la source de l\'écran ne cherche plus « ne compte » dans une phrase', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../v2/js/rendu.js'), 'utf8');
    expect(src).toMatch(/l\.muet === true/);
    expect(src).not.toMatch(/ne compte\|/);
  });
  test('le moteur dit « série d\'approche » et jamais « rampe » dans une phrase', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../v2/js/moteur.js'), 'utf8');
    expect(src).toContain("série d\\'approche, ne compte pas");
    expect(src).not.toMatch(/'rampe, ne compte pas'/);
  });
});

describe('179 (D1) — « en retard » ne s\'écrit plus, le fait reste', () => {
  test('le rendu n\'écrit plus l\'étiquette', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../v2/js/rendu.js'), 'utf8');
    expect(src).not.toMatch(/en retard sur/);
    expect(src).not.toMatch(/rl-retard/);
  });
  test('le générateur propose une priorité, sans étiquette', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../v2/js/generateur.js'), 'utf8');
    expect(src).toContain('En faire une priorité ?');
    expect(src).toContain('repère de pratiquants');
    expect(src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')).not.toMatch(/en retard/);
  });
});

describe('179 (A-F-06) — le constat ne dit rien de faux', () => {
  const dateJour = '2026-10-11T10:00:00Z';
  const sp = (t) => String(t || '').replace(/[  ]/g, ' ');
  const consigne = (palier, over) => Object.assign({ etat: 'bord', palier: palier, zone: null, ligne: { charge: palier, vise: 1 }, haut: null,
    n: 3, niveau: 1, fondement: { date: dateJour, reps: [1], test: null } }, over || {});
  test('règle de bord (aucune zone) : jamais « null » dans le verdict d\'un test', () => {
    const test = { charge: 34, reps: 1, niveau: 1, date: dateJour };
    const av = consigne(34, { fondement: { date: '2026-10-04T10:00:00Z', reps: [1], test: null } });
    const ap = consigne(34, { fondement: { date: dateJour, reps: [1], test: test } });
    const c = M.constatDuJour(av, ap, 'normal', 36, { series: [{ charge_kg: 34, reps: 1 }], montee: null }, dateJour, false);
    expect(sp(c.verdict)).toBe('34 kg : 1 aujourd\'hui.');
    expect(c.verdict).not.toMatch(/null|undefined|NaN/);
  });
  test('premier repère : le chiffre cité est celui de la charge faite, pas les reps d\'une autre charge', () => {
    const av = consigne(24, { etat: 'silence', fondement: { date: '2026-10-04T10:00:00Z', reps: [], test: null } });
    const ap = consigne(26, { fondement: { date: dateJour, reps: [5], test: null } });
    const jour = { series: [{ charge_kg: 24, reps: 5 }, { charge_kg: 22, reps: 4 }, { charge_kg: 26, reps: 1 }], montee: null };
    const c = M.constatDuJour(av, ap, 'normal', 28, jour, dateJour, false);
    expect(sp(c.verdict)).toContain('26 kg × 1');
    expect(sp(c.verdict)).not.toContain('26 kg × 5');
  });
  test('palier absent : les séries faites, jamais « le cran au-dessus × . »', () => {
    const av = consigne(null, { etat: 'silence', fondement: { date: '2026-10-04T10:00:00Z', reps: [], test: null } });
    const ap = consigne(null, { fondement: { date: dateJour, reps: [12], test: null } });
    const jour = { series: [{ charge_kg: 30, reps: 12 }, { charge_kg: 28, reps: 12 }, { charge_kg: 32, reps: 5 }], montee: null };
    const c = M.constatDuJour(av, ap, 'normal', 34, jour, dateJour, false);
    expect(sp(c.verdict)).toBe('Premier repère : 30 kg × 12, 28 kg × 12, 32 kg × 5.');
    expect(c.verdict).not.toMatch(/× \.|null/);
  });
});
