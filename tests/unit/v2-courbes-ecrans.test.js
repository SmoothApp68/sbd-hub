//
// 206 — LES COURBES À L'ÉCRAN : « Tes exercices » en tête de Progression (mini-courbes), « Rétrospectives » en une ligne, et la
// courbe en tête de la page d'exercice (périodes, toucher un point → bulle), l'historique replié par mois.
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/moteur.js');
const Courbe = require('../../v2/js/courbe.js');
require('../../v2/js/rendu.js');

const J = (a, m, j) => new Date(a, m, j, 18, 0, 0);
const P = (d, valeur, extra) => Object.assign({ debut: d.toISOString(), valeur, charge: null, reps: null, record: false }, extra || {});

function sommaire(extra) {
  const cible = document.createElement('div');
  const pts = [P(J(2026, 5, 1), 141), P(J(2026, 6, 1), 145), P(J(2026, 9, 28), 152, { record: true })];
  const vue = Object.assign({
    mois: { titre: 'Octobre', kg: 22000, series: 40, records: 28, paris: { verifies: 30, tenus: 27 }, surChoix: () => {} },
    records: { dernier: null, surChoix: null },
    volume: { quand: '19-25 oct.', zones: [], surChoix: () => {} },
    poids: { resume: null, surChoix: () => {} },
    parcours: { phrase: 'Ta phrase.', surChoix: () => {} },
    annee: { an: 2026, surChoix: () => {} },
    saison: { titre: 'Fall Arc 2026', surChoix: () => {} },
    exercices: { legende: 'Max estimé, 6 derniers mois', lignes: [
      { slug: 'squat', nom: 'Squat', mesure: '141 → 152 kg', mini: Courbe.mini(pts) },
      { slug: 'dc', nom: 'Développé couché', mesure: '102 kg', mini: Courbe.mini([P(J(2026, 9, 1), 102)]) }
    ], surExercice: () => {}, surTous: () => {} }
  }, extra || {});
  window.THRendu.rendreSommaire(cible, vue);
  return cible;
}

describe('206 — Progression en courbes', () => {
  test('l\'ordre : Tes exercices, le mois, les rétrospectives, Volume, Poids', () => {
    const c = sommaire();
    const quoi = [...c.querySelectorAll('.bloc-quoi')].map((e) => e.textContent);
    expect(quoi[0]).toBe('Tes exercices');
    expect(quoi.slice(1, 4)).toEqual(['Octobre', 'Records', 'Rétrospectives']);
    expect(quoi.indexOf('Volume par muscle')).toBeGreaterThan(quoi.indexOf('Rétrospectives'));
    expect(quoi[quoi.length - 1]).toBe('Poids de corps');
  });

  test('une ligne par exercice : nom, « 141 → 152 kg », mini-courbe ; sans deux points, pas de courbe', () => {
    const c = sommaire();
    const l = [...c.querySelectorAll('.bloc-exo')];
    expect(l.map((x) => x.querySelector('.bloc-exo-nom').textContent)).toEqual(['Squat', 'Développé couché']);
    expect(l[0].querySelector('.bloc-exo-val').textContent).toBe('141 → 152 kg');
    expect(l[0].querySelector('svg.bloc-exo-mini polyline')).not.toBeNull();
    expect(l[0].querySelector('svg circle.record')).not.toBeNull();
    expect(l[1].querySelector('svg')).toBeNull();
  });

  test('toucher une ligne ouvre la page de l\'exercice ; « Tous mes exercices » sa porte', () => {
    const vus = []; let tous = 0;
    const c = sommaire({ exercices: { lignes: [{ slug: 'squat', nom: 'Squat', mesure: '1 kg', mini: null }], surExercice: (s) => vus.push(s), surTous: () => { tous++; } } });
    c.querySelector('.bloc-exo').click();
    c.querySelector('.bloc-tous').click();
    expect([vus, tous]).toEqual([['squat'], 1]);
  });

  test('Rétrospectives : une ligne qui nomme les trois, replie les blocs existants, s\'ouvre au toucher', () => {
    const c = sommaire();
    const tete = c.querySelector('.retro-tete');
    expect(tete.querySelector('.bloc-quand').textContent).toBe('ton parcours, ton année, Fall Arc 2026');
    const liste = c.querySelector('.retro-liste');
    expect(liste.hidden).toBe(true);
    expect([...liste.querySelectorAll('.bloc-quoi')].map((e) => e.textContent)).toEqual(['Ton parcours', 'Ton année 2026', 'Fall Arc 2026']);
    tete.click();
    expect([liste.hidden, tete.getAttribute('aria-expanded')]).toEqual([false, 'true']);
  });

  test('⚠️ sans contenu, pas de ligne Rétrospectives', () => {
    const c = sommaire({ parcours: null, annee: null, saison: null });
    expect(c.querySelector('.bloc-retro')).toBeNull();
    const vide = sommaire({ parcours: { phrase: '', surChoix: () => {} }, annee: null, saison: null });
    expect(vide.querySelector('.bloc-retro')).toBeNull();
  });
});

function page(extra, nb) {
  const cible = document.createElement('div');
  const maintenant = J(2026, 10, 1);
  const pts = [P(J(2026, 4, 20), 141, { charge: 120, reps: 5 }), P(J(2026, 6, 20), 146, { charge: 125, reps: 5 }),
    P(J(2026, 8, 20), 150, { charge: 128, reps: 5, record: true }), P(J(2026, 9, 28), 152, { charge: 130, reps: 5, record: true })];
  const fenetre = Courbe.dansLaPeriode(pts, '6m', maintenant);
  const vue = Object.assign({
    nom: 'Squat', mesure: 'charge_reps', onglet: 'resume', historique: [],
    courbe: { nom: 'Squat', genre: 'charge', geo: Courbe.geometrie(fenetre), resume: Courbe.resume(fenetre), periode: '6m',
      periodeLongue: '6 mois', periodes: Courbe.PERIODES, surPeriode: () => {} },
    volume: {}, table: []
  }, extra || {});
  window.THRendu.rendrePageExercice(cible, vue);
  return cible;
}

describe('206 — la courbe de la page d\'exercice', () => {
  test('en tête du Résumé : la valeur, le sens, l\'écart sur la période', () => {
    const c = page();
    expect(c.querySelector('.courbe-val').textContent).toBe('152 kg');
    expect(c.querySelector('.courbe-sous').textContent).toBe('max estimé · +11 kg en 6 mois');
    expect(c.querySelector('.courbe-carte').compareDocumentPosition(c.querySelector('.section-t')) & 4).toBeTruthy();
  });

  test('quatre périodes ; la période choisie est marquée ; toucher appelle le choix', () => {
    const choisies = [];
    const base = Courbe.dansLaPeriode([P(J(2026, 4, 20), 141), P(J(2026, 9, 28), 152)], '6m', J(2026, 10, 1));
    const c2 = page({ courbe: { nom: 'Squat', genre: 'charge', geo: Courbe.geometrie(base), resume: Courbe.resume(base), periode: '6m',
      periodeLongue: '6 mois', periodes: Courbe.PERIODES, surPeriode: (k) => choisies.push(k) } });
    const b = [...c2.querySelectorAll('.courbe-per-b')];
    expect(b.map((x) => x.textContent)).toEqual(['3 mois', '6 mois', '1 an', 'Tout']);
    expect(b.map((x) => x.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false']);
    b[3].click();
    expect(choisies).toEqual(['tout']);
  });

  test('un point pâle par séance, un trait, les records en ambre', () => {
    const c = page();
    expect(c.querySelectorAll('.courbe-pale').length).toBe(4);
    expect(c.querySelectorAll('polyline.courbe-trait').length).toBe(1);
    expect(c.querySelectorAll('.courbe-rec').length).toBe(2);
    expect(c.querySelector('svg.courbe-svg').getAttribute('aria-label')).toMatch(/de 141\s?kg à 152\s?kg ; 2 records/);
  });

  test('toucher un point : la bulle dit la date, la meilleure série, le max estimé et le record', () => {
    const c = page();
    const bulle = c.querySelector('.courbe-bulle');
    expect(bulle.classList.contains('on')).toBe(false);
    const cibles = [...c.querySelectorAll('.courbe-cible')];
    expect(cibles).toHaveLength(4);
    cibles[3].dispatchEvent(new window.Event('click'));
    expect(bulle.textContent).toBe('Le 28 oct. · 130 kg × 5 · max estimé 152 kg · record');
    expect(bulle.classList.contains('on')).toBe(true);
  });

  test('au poids du corps et sur un maintien : meilleures reps, meilleures secondes — pas de « max estimé »', () => {
    const base = Courbe.dansLaPeriode([P(J(2026, 4, 20), 12, { reps: 12 }), P(J(2026, 9, 28), 14, { reps: 14 })], '6m', J(2026, 10, 1));
    const c = page({ courbe: { nom: 'Tractions', genre: 'reps', geo: Courbe.geometrie(base), resume: Courbe.resume(base), periode: '6m',
      periodeLongue: '6 mois', periodes: Courbe.PERIODES, surPeriode: () => {} } });
    expect(c.querySelector('.courbe-sous').textContent).toBe('meilleures reps · +2 reps en 6 mois');
    expect(c.querySelector('.courbe-note').textContent).not.toMatch(/10 reps ou moins/);
  });

  test('une seule séance sur la période : on le dit, les périodes restent', () => {
    const un = Courbe.dansLaPeriode([P(J(2026, 9, 28), 152)], '6m', J(2026, 10, 1));
    const c = page({ courbe: { nom: 'Squat', genre: 'charge', geo: Courbe.geometrie(un), resume: Courbe.resume(un), periode: '6m',
      periodeLongue: '6 mois', periodes: Courbe.PERIODES, surPeriode: () => {} } });
    expect(c.querySelector('.courbe-vide').textContent).toBe('Une seule séance sur cette période.');
    expect(c.querySelectorAll('.courbe-per-b')).toHaveLength(4);
    expect(c.querySelector('svg.courbe-svg')).toBeNull();
  });

  test('sans courbe (exercice sans mesure chiffrée), rien ne s\'ajoute', () => {
    expect(page({ courbe: null }).querySelector('.courbe-carte')).toBeNull();
  });

  test('l\'historique est replié par mois : le plus récent ouvert, les autres fermés, le compte dit', () => {
    const s = (id, d) => ({ id, titre: 'Séance', debut: d.toISOString(), note: '', record: 0, blocs: [] });
    const c = page({ onglet: 'historique', historique: [s('a', J(2026, 9, 28)), s('b', J(2026, 9, 21)), s('c', J(2026, 8, 20))], surSeance: () => {} });
    const m = [...c.querySelectorAll('details.exo-mois')];
    expect(m.map((x) => x.open)).toEqual([true, false]);
    expect(m.map((x) => x.querySelector('summary').textContent)).toEqual(['octobre 2026 · 2 séances', 'septembre 2026 · 1 séance']);
    expect(c.querySelectorAll('.exo-jour')).toHaveLength(3);
  });
});
