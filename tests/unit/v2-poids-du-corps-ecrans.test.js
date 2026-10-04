//
// 50-1 bis (MOTEUR §9.17) — TROIS RETOUCHES D'ÉCRAN, UN TEST CHACUNE.
//
//   1. La page d'un exercice en reps ne dit plus « pas de palier en kilos » : le
//      poids du corps est COACHÉ. Sa phrase vient du formateur (`THModele`).
//   2. La jauge de la table par reps d'une aide se lit à l'ENVERS : moins d'aide,
//      c'est monter (−25 → −22,5), donc la barre la plus longue est la moins aidée.
//   3. L'éditeur de routine dit « AIDE (KG) » pour un exercice assisté, et la cible
//      d'une aide y reste POSITIVE : la conversion en négatif se fait à la
//      validation d'une série (`rangerAide`), pas à la frappe dans l'éditeur.
//
// Environnement jsdom (PAS de docblock `node`) : `modele.js` et `rendu.js` se
// terminent par `this`, que Babel remplace par `undefined` sous `node`.

require('../../v2/js/routeur.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/seance.js');
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const NB = String.fromCharCode(160);

// ── 1. LA PHRASE DE LA PAGE ─────────────────────────────────────────────────
const page = (vue) => {
  const cible = document.createElement('div');
  Rendu().rendrePageExercice(cible, Object.assign({
    nom: 'Tractions', mesure: 'reps', onglet: 'resume', sousTitre: '', surOnglet: () => {},
    seanceEnCours: null, derniere: { valeur: '12', date: '2026-09-11' },
    record: { valeur: '12', date: null }, volume: { nbSeries: 6, nbSeances: 2 },
    table: [], cibleReps: null, historique: [], surSeance: () => {}, reste: 0, surVoirPlus: () => {}
  }, vue));
  return cible;
};

describe('50-1 bis — la page d’un exercice en reps dit que le coach suit les reps', () => {
  test('⚠️ DISCRIMINANT — « Ta charge, c’est ton poids du corps : le coach suit tes reps. », par le formateur', () => {
    const c = page({});
    const note = [...c.querySelectorAll('.exo-note')].map((n) => n.textContent);
    expect(note).toContain('Ta charge, c’est ton poids du corps' + NB + ': le coach suit tes reps.');
    expect(note).toContain(Modele.PHRASE_POIDS_DU_CORPS);
    // L'ancienne phrase est partie, et avec elle « palier » (§20.2).
    expect(c.textContent).not.toMatch(/palier|pas de charge|répétitions : il/);
    // La durée et la distance gardent leur phrase : seule la mesure en reps change.
    expect(page({ nom: 'Planche', mesure: 'temps' }).textContent).toMatch(/se mesure en durée/);
    // Et une charge × reps n'en a aucune.
    expect(page({ mesure: 'charge_reps' }).querySelector('.exo-note')).toBeNull();
  });
});

// ── 2. LA JAUGE D'UNE AIDE ──────────────────────────────────────────────────
const largeurs = (table, mesure) => {
  const c = page({ mesure: mesure || 'charge_reps', table: table });
  return [...c.querySelectorAll('.tr-ligne')].map((l) => parseFloat(l.querySelector('.tr-jauge i').style.width));
};
const ligne = (reps, charge) => ({ reps: reps, charge: charge, date: '2026-09-10', deduit: false });

describe('50-1 bis — la jauge de la table par reps d’une aide se lit à l’envers', () => {
  test('⚠️ DISCRIMINANT — moins d’aide, barre plus longue (−30 < −25 < −20) ; jamais à zéro', () => {
    const l = largeurs([ligne(8, -30), ligne(10, -25), ligne(12, -20)]);
    expect(l[0]).toBeLessThan(l[1]);
    expect(l[1]).toBeLessThan(l[2]);
    expect(l.every((w) => w > 0)).toBe(true);
    // Avant : `plafond` restait à 0, donc TOUTES les barres valaient 0 %.
    expect(l.some((w) => w === 0)).toBe(false);
    // Une seule ligne d'aide : une barre, pas un vide.
    expect(largeurs([ligne(8, -25)])[0]).toBeGreaterThan(0);
  });

  test('une charge ordinaire ne change pas : la plus lourde a la barre la plus longue', () => {
    expect(largeurs([ligne(8, 60), ligne(10, 80), ligne(12, 100)])).toEqual([60, 80, 100]);
  });
});

// ── 3. L'ÉDITEUR DE ROUTINE ─────────────────────────────────────────────────
const CAT = [
  { slug: 'aide', nom: 'Tractions assistées', mesure: 'charge_reps', charge: 'assistance', equipement: 'machine' },
  { slug: 'dc', nom: 'Développé couché', mesure: 'charge_reps', charge: 'externe', equipement: 'barre' }
];
const L = (o) => Object.assign({ id: 'l' + Math.random(), type_serie: 'travail', charge_kg: null, reps: 8,
  rang: 1, validee_a: null }, o);
const gestes = (recu) => ({
  surChamp: (i, j, champ, v) => recu.push([champ, v]), surNumero: () => {}, surNote: () => {}, surRepos: () => {},
  surAjoutSerie: () => {}, surSupprimerSerie: () => {}, surMenuBloc: () => {}, surMenuExercice: () => {},
  surValider: () => {}, surEffort: () => {}
});
function rendre(programme, charge, recu, slug) {
  const exos = [{ id: 'e', exercise_slug: slug || 'aide', rang: 0, repos_cible_s: null, note: null,
    groupe_superset: null, series: [L({ charge_kg: charge })] }];
  const s = { exercices: exos };
  const cible = document.createElement('div');
  Rendu().rendreBlocsSeance(cible, programme ? null : s, Object.assign({
    programme: programme, blocs: Modele.blocsDeSeance(s, CAT),
    exercice: (sl) => CAT.filter((e) => e.slug === sl)[0],
    precedent: () => null, fantome: () => ({}), tourAtteint: () => 0
  }, gestes(recu)));
  return cible;
}
const taper = (cible, valeur) => {
  const champ = cible.querySelector('.ch-serie input');
  champ.value = valeur;
  champ.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('50-1 bis — l’éditeur de routine : « AIDE (KG) », la cible reste positive', () => {
  test('⚠️ DISCRIMINANT — en-tête « AIDE (KG) » ; « 25 » tapé dans l’éditeur reste 25, en séance il devient −25', () => {
    const dansEditeur = [], enSeance = [];
    const e = rendre(true, null, dansEditeur);
    const entetes = [...e.querySelectorAll('.cols-seance span')].map((n) => n.textContent.trim()).filter(Boolean);
    expect(entetes).toContain('AIDE (KG)');
    expect(entetes).not.toContain('KG');
    taper(e, '25');
    expect(dansEditeur).toEqual([['charge_kg', '25']]);   // positif : la cible de la routine

    const s = rendre(false, null, enSeance);
    taper(s, '25');
    expect(enSeance).toEqual([['charge_kg', -25]]);       // rangé par `rangerAide`

    // Une cible déjà rangée en positif s'affiche telle quelle ; une aide de séance, sans signe.
    expect(rendre(true, 25, []).querySelector('.ch-serie input').value).toBe('25');
    expect(rendre(false, -22.5, []).querySelector('.ch-serie input').value).toBe('22,5');
    // Et une charge ordinaire ne passe jamais par `rangerAide`.
    const dc = [];
    taper(rendre(false, null, dc, 'dc'), '100');
    expect(dc).toEqual([['charge_kg', '100']]);
  });
});
