//
// Prompt 131 — audit 130 n°1 (P0) : l'éditeur de routine perdait la durée et la
// distance cibles.
//
// La grille de l'éditeur EST celle de la séance (§7 quindecies) : `rangeeDeSerie`
// rappelle `surChamp` avec le nom du CHAMP DE SAISIE (`duree`, `distance_km`, les
// noms de `THModele.CHAMPS_MESURE`). La ligne du brouillon porte, elle, les noms de
// colonne (`duree_s`, `distance_m`) que `Routines.normaliserSerie` lit. Sans
// traduction, la valeur tapée se posait sous un nom que personne ne relisait :
// l'enregistrement écrivait `null`, et le rendu suivant vidait le champ.
//
// ⚠️ CONFIGURATION DISCRIMINANTE : une course (`distance_temps`) — deux champs dont
// le nom de saisie diffère du nom de colonne, et un facteur (km → m) qu'une
// recopie brute ne ferait pas. Une charge passerait dans les deux cas : son nom de
// saisie EST son nom de colonne.
//
// Environnement jsdom (pas de docblock `node`).

const fs = require('fs');
const path = require('path');
const Routines = require('../../v2/js/routines.js');
require('../../v2/js/semaine.js');
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/seance.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const CAT = [
  { slug: 'course', nom: 'Course à Pied', mesure: 'distance_temps', charge: 'aucune',
    muscles_primaires: [] }
];

function taper(input, suite) {
  for (const c of String(suite)) {
    input.dispatchEvent(new InputEvent('beforeinput',
      { inputType: 'insertText', data: c, cancelable: true, bubbles: true }));
  }
}

// Le geste de `app.js` (éditeur de routine, `surChamp`), recopié trait pour trait :
// la garde de source plus bas vérifie que `app.js` fait bien ce geste-là.
function rendre(brouillon) {
  const cible = document.createElement('div');
  Rendu().rendreBlocsSeance(cible, null, {
    programme: true,
    blocs: Modele.blocsDeSeance(brouillon, CAT),
    exercice: (slug) => CAT.filter((e) => e.slug === slug)[0],
    precedent: () => null,
    surChamp: (i, j, champ, valeur) => {
      const l = brouillon.exercices[i].series[j];
      const t = Routines.champDeLEditeur(champ, valeur);
      l[t.cle] = t.valeur;
    },
    surNumero: () => {}, surNote: () => {}, surRepos: () => {},
    surAjoutSerie: () => {}, surSupprimerSerie: () => {},
    surMenuBloc: () => {}, surMenuExercice: () => {}
  });
  return cible;
}

const brouillonCourse = () => ({ exercices: [{
  id: 'e1', exercise_slug: 'course', rang: 0, repos_cible_s: null, note: null,
  groupe_superset: null, series: [Routines.enSaisie(null)]
}] });

describe('audit 130 n°1 — la durée et la distance cibles tapées dans l’éditeur restent', () => {
  test('taper 10:00 et 5 km, enregistrer, relire : les deux valeurs reviennent', () => {
    const b = brouillonCourse();
    const c = rendre(b);
    const duree = c.querySelector('[data-champ="duree"] input');
    const distance = c.querySelector('[data-champ="distance_km"] input');
    expect(duree).not.toBeNull();
    expect(distance).not.toBeNull();
    taper(duree, '1000');
    distance.value = '5,5';
    distance.dispatchEvent(new Event('input', { bubbles: true }));

    // Le brouillon porte les noms de COLONNE, en secondes et en mètres.
    const l = b.exercices[0].series[0];
    expect(l.duree_s).toBe(600);
    expect(l.distance_m).toBe(5500);
    expect('duree' in l).toBe(false);
    expect('distance_km' in l).toBe(false);

    // Enregistrer : la ligne de `routine_sets`.
    const ecrite = Routines.normaliserSerie(l, 're1', 1, 'u1');
    expect(ecrite.duree_cible_s).toBe(600);
    expect(ecrite.distance_cible_m).toBe(5500);

    // Relire : la base vers l'écran, puis le rendu. Les champs ne sont pas vidés.
    const relu = { exercices: [Object.assign({}, b.exercices[0], {
      series: [Routines.enSaisie(Object.assign({ id: 's1', type_serie: 'travail' }, ecrite))] })] };
    const c2 = rendre(relu);
    expect(c2.querySelector('[data-champ="duree"] input').value).toBe('10:00');
    expect(c2.querySelector('[data-champ="distance_km"] input').value).toBe('5,5');
  });

  test('effacer la distance la remet à vide, sans laisser l’ancienne valeur', () => {
    expect(Routines.champDeLEditeur('distance_km', '')).toEqual({ cle: 'distance_m', valeur: null });
    expect(Routines.champDeLEditeur('duree', null)).toEqual({ cle: 'duree_s', valeur: null });
  });

  test('la charge et les reps passent telles quelles (leur nom de saisie est leur colonne)', () => {
    expect(Routines.champDeLEditeur('charge_kg', '22,5')).toEqual({ cle: 'charge_kg', valeur: '22,5' });
    expect(Routines.champDeLEditeur('reps', '8')).toEqual({ cle: 'reps', valeur: '8' });
  });

  test('garde de source : le `surChamp` de l’éditeur de routine traduit par `champDeLEditeur`', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
    const i = src.indexOf('surChamp: function (i, j, champ, valeur) {\n        var l = ligneBrouillon(i, j);');
    expect(i).toBeGreaterThan(0);
    const corps = src.slice(i, i + 600);
    expect(corps).toMatch(/Routines\.champDeLEditeur\(champ, valeur\)/);
    expect(corps).not.toMatch(/l\[champ\] = valeur/);
  });
});
