//
// 211 — LES PREMIÈRES MINUTES : le coach DIT son mécanisme (il parie, il vérifie), sans rien inventer ni prévoir.
//   · le plan porte « Mon premier pari : 60 kg × 9. … » aux chiffres de la ligne (I26), jamais sur une première fois ;
//   · l'écran la montre sous la consigne quand le compte n'a aucun pari (le plan l'écrit, l'écran la lit) ;
//   · le « Pourquoi ? » de la 204 porte un point tant que l'appareil n'a jamais ouvert un « Pourquoi ».
// (Le récap — « Point de départ », « Mon premier pari tenu. » — est dans v2-recap-fin.test.js.)
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

let n = 0;
const brute = (kg, reps) => ({ id: 'r' + (++n), rang: n, charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: 'dc' });
const OPTIONS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false };
const jourN = (i) => new Date(Date.UTC(2026, 8, 1 + i * 3, 18)).toISOString();
const groupes = (liste) => liste.map(([kg, reps], i) => ({ seance: { id: 'H' + i, debut: jourN(i) }, series: [brute(kg, reps), brute(kg, reps), brute(kg, reps)] }));
const planDe = (liste) => {
  let k = 0;
  const id = () => 'q-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'dc', id, { series: 3 });
  const avant = new Date(Date.parse(jourN(Math.max(liste.length - 1, 0))) + 3 * 864e5).toISOString();
  const c = M.consigneDExercice(groupes(liste), undefined, avant, OPTIONS);
  return T.planDeSeance({ seance: { id: 'S', debut: avant, edition: false, exercices: se.exercices }, consignes: { dc: c }, paris: [], suites: {} });
};

describe('211 — le plan porte le premier pari', () => {
  test('une consigne chiffrée : « Mon premier pari : 60 kg × 9. Je te dirai… », aux chiffres de la ligne, I26 sans écart', () => {
    const p = planDe([[60, 9], [60, 9]]);
    const x = p.exercices[0];
    expect(x.consigne.etat).not.toBe('silence');
    expect(x.premierPari).not.toBeNull();
    const ligne = x.paris.filter(Boolean)[0];
    expect(x.premierPari.charge).toBe(ligne.fondement.charge);
    expect(x.premierPari.reps).toBe(ligne.valeur_predite);
    expect(x.premierPari.phrase).toMatch(/^Mon premier pari : .+ kg × \d+\. Je te dirai après la série si j’avais vu juste\.$/);
    expect(T.verifierPhrases(p)).toEqual([]);
    expect(x.phrases.some((q) => q.ou === 'entete.premierPari')).toBe(true);
    expect(/bravo/i.test(x.premierPari.phrase)).toBe(false);
  });
  test('une première fois sur l’exercice (silence) : aucun pari, donc aucune phrase', () => {
    const x = planDe([]).exercices[0];
    expect(x.paris.filter(Boolean)).toHaveLength(0);
    expect(x.premierPari).toBeNull();
  });
});

const EXOS = [{ slug: 'dc', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', equipement: 'barre', muscles_primaires: ['pectoraux'] }];
const NB = ' ';
function rendre(extra) {
  let m = 0;
  const uuid = () => 'v-' + (++m);
  let s = S.creer({ id: 'S', userId: 'u', idSerie: uuid });
  s = S.ajouterExercice(s, 'dc', uuid);
  const cible = document.createElement('div');
  window.THRendu.rendreBlocsSeance(cible, s, Object.assign({
    blocs: Modele.blocsDeSeance(s, EXOS), modifier: false, selection: null, programme: false,
    surGrouper: () => {}, surDeplacerBloc: () => {}, surMenuBloc: () => {}, surMenuExercice: () => {},
    tourAtteint: () => 0, exercice: (slug) => EXOS.filter((e) => e.slug === slug)[0], precedent: () => null, fantome: () => ({}),
    libelles: () => ({ jaune: ['Aujourd’hui' + NB + ': 60' + NB + 'kg' + NB + '×' + NB + '9.'], gris: 'Mardi, 60' + NB + 'kg' + NB + '×' + NB + '9.' }),
    surPourquoi: () => {},
    surChamp: () => {}, surValider: () => {}, surNumero: () => {}, surEffort: () => {}, surNote: () => {},
    surRepos: () => {}, surSupprimerSerie: () => {}, surAjoutSerie: () => {}
  }, extra || {}));
  return cible;
}

describe('211 — l’écran lit : la ligne du premier pari et le point du « Pourquoi »', () => {
  test('la ligne du plan s’affiche une fois, sous la consigne ; sans elle, rien', () => {
    const avec = rendre({ premierPari: () => 'Mon premier pari' + NB + ': 60' + NB + 'kg' + NB + '×' + NB + '9. Je te dirai après la série si j’avais vu juste.' });
    expect(avec.querySelectorAll('.premier-pari')).toHaveLength(1);
    expect(avec.querySelector('.premier-pari').textContent).toMatch(/^Mon premier pari/);
    expect(rendre({ premierPari: () => null }).querySelector('.premier-pari')).toBeNull();
    expect(rendre().querySelector('.premier-pari')).toBeNull();
  });
  test('le point : tant que le « Pourquoi » n’a jamais été ouvert ; ensuite plus', () => {
    expect(rendre({ pourquoiNeuf: () => true }).querySelector('.consigne-dit[data-pourquoi]').classList.contains('pourquoi-neuf')).toBe(true);
    expect(rendre({ pourquoiNeuf: () => false }).querySelector('.consigne-dit[data-pourquoi]').classList.contains('pourquoi-neuf')).toBe(false);
    expect(rendre().querySelector('.consigne-dit[data-pourquoi]').classList.contains('pourquoi-neuf')).toBe(false);
  });
});
