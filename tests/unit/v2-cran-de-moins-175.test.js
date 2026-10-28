//
// 175 (commit 4) — « un cran de moins » : le badge du recul (174), à côté du chiffre du jour, en --donnees. Le plan le dit
// (`cranDeMoins`, seulement sur bord_recul et bord_vague), l'écran le dessine ; la phrase lue (aria-label) le dit aussi.
process.env.TZ = 'Europe/Paris';
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
require('../../v2/js/rendu.js');
const Modele = window.THModele;
const Rendu = () => window.THRendu;

let n = 0;
const brute = (kg, reps, ressenti) => ({
  id: 'r' + (++n), rang: n, charge_kg: kg, reps, rpe: null,
  ressenti: ressenti === undefined ? null : ressenti, type_serie: 'travail', exercise_slug: 'dc'
});
const OPTIONS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false };
const jourN = (i) => new Date(Date.UTC(2026, 8, 1 + i * 3, 18)).toISOString();   // une séance tous les 3 jours

// `liste` : chronologique, `[kg, reps | [reps…], ressenti?]`.
function groupes(liste) {
  return liste.map(([kg, reps, ressenti], i) => ({
    seance: { id: 'H' + i, debut: jourN(i) },
    series: (Array.isArray(reps) ? reps : [reps, reps, reps]).map((r, j, tout) =>
      brute(kg, r, j === tout.length - 1 ? ressenti : null))
  }));
}
const avantDe = (liste, jours) => new Date(Date.parse(jourN(liste.length - 1)) + (jours || 3) * 864e5).toISOString();
const consigne = (liste, options) =>
  M.consigneDExercice(groupes(liste), undefined, avantDe(liste), Object.assign({}, OPTIONS, options || {})).consigne;

// Une montée régulière jusqu'à 140 (pas de 2,5) : le cran est connu, l'exercice est sans zone (2 reps).
const MONTEE = [[130, 2], [132.5, 2], [135, 2], [137.5, 2]];
const planDe = (liste) => {
  let k = 0;
  const id = () => 'q-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'dc', id, { series: 3 });
  const avant = avantDe(liste);
  const c = M.consigneDExercice(groupes(liste), undefined, avant, OPTIONS);
  return T.planDeSeance({ seance: { id: 'S', debut: avant, edition: false, exercices: se.exercices }, consignes: { dc: c }, paris: [], suites: {} });
};

describe('175 — le plan dit « un cran de moins » sur un recul, jamais ailleurs', () => {
  test('bord_recul : le badge ; bord_garde et la montée ordinaire : rien', () => {
    const recul = planDe(MONTEE.concat([[140, [1, 1, 1]]])).exercices[0];
    expect(recul.consigne.etat).toBe('bord_recul');
    expect(recul.cranDeMoins).toBe('un cran de moins');
    const garde = planDe(MONTEE.concat([[140, 2, 'reste_0']])).exercices[0];
    expect(garde.consigne.etat).toBe('bord_garde');
    expect(garde.cranDeMoins).toBeNull();
    const monte = planDe(MONTEE.concat([[140, 2]])).exercices[0];
    expect(monte.cranDeMoins).toBeNull();
  });
  test('bord_vague : le badge', () => {
    const vague = planDe(MONTEE.concat([[140, 2], [140, 2], [140, 2], [140, 2]])).exercices[0];
    expect(vague.consigne.etat).toBe('bord_vague');
    expect(vague.cranDeMoins).toBe('un cran de moins');
  });
});

const NB = '\u00a0';
const EXOS = [{ slug: 'dc', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', equipement: 'barre', muscles_primaires: ['pectoraux'] }];
function rendre(libelles, extra) {
  let m = 0;
  const uuid = () => 'v-' + (++m);
  let s = S.creer({ id: 'S', userId: 'u', idSerie: uuid });
  s = S.ajouterExercice(s, 'dc', uuid);
  const cible = document.createElement('div');
  Rendu().rendreBlocsSeance(cible, s, Object.assign({
    blocs: Modele.blocsDeSeance(s, EXOS), modifier: false, selection: null, programme: false,
    surGrouper: () => {}, surDeplacerBloc: () => {}, surMenuBloc: () => {}, surMenuExercice: () => {},
    tourAtteint: () => 0, exercice: (slug) => EXOS.filter((e) => e.slug === slug)[0], precedent: () => null, fantome: () => ({}),
    libelles: libelles, surChamp: () => {}, surValider: () => {}, surNumero: () => {}, surEffort: () => {}, surNote: () => {},
    surRepos: () => {}, surSupprimerSerie: () => {}, surAjoutSerie: () => {}
  }, extra || {}));
  return cible;
}
describe('175 — le badge « un cran de moins » à côté du chiffre héros', () => {
  const AUJ = 'Aujourd\'hui' + NB + ': 137,5' + NB + 'kg' + NB + '\u00d7' + NB + '2.';
  test('il est dessiné dans le héros, la phrase lue le dit aussi', () => {
    const c = rendre(() => ({ jaune: [AUJ] }), { cranDeMoins: () => 'un cran de moins' });
    const h = c.querySelector('.consigne-heros');
    const b = h.querySelector('.badge-recul');
    expect(b).not.toBeNull();
    expect(b.textContent).toBe('un cran de moins');
    expect(h.getAttribute('aria-label')).toBe(AUJ + ' un cran de moins');
    expect(h.querySelector('.c-charge').textContent).toBe('137,5');
  });
  test('DISCRIMINANT — sans recul, aucun badge, la phrase lue est inchangée', () => {
    const c = rendre(() => ({ jaune: [AUJ] }), { cranDeMoins: () => null });
    const h = c.querySelector('.consigne-heros');
    expect(h.querySelector('.badge-recul')).toBeNull();
    expect(h.getAttribute('aria-label')).toBe(AUJ);
    const sans = rendre(() => ({ jaune: [AUJ] }));
    expect(sans.querySelector('.badge-recul')).toBeNull();
  });
  test('un seul badge, sur la première ligne', () => {
    const c = rendre(() => ({ jaune: [AUJ, 'Si ça passe, 140' + NB + 'kg' + NB + '\u00d7' + NB + '2, à la série que tu veux.'] }), { cranDeMoins: () => 'un cran de moins' });
    expect(c.querySelectorAll('.badge-recul')).toHaveLength(1);
  });
});
