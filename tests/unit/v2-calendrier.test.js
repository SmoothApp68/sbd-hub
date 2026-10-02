/** @jest-environment node */
//
// v2/js/calendrier.js — la grille d'un mois.
//
// CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : tester TOUS LES SEPT
// JOURS d'une ligne, pas seulement le lundi. Avec le lundi seul, « sélectionne
// la semaine du jour touché » et « sélectionne la semaine du lundi » donnent le
// même résultat et le banc ne prouve rien.

// PR 7 de la consolidation — les nombres, les dates et les mois s'écrivent
// dans le formateur unique, `modele.js`, lu à l'appel.
require('../../v2/js/modele.js');
const Calendrier = require('../../v2/js/calendrier.js');

const seance = (iso) => ({ id: iso, debut: iso });
const cle = (d) => d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();

describe('grilleMois — la forme du mois', () => {
  test('six lignes de sept jours, toujours', () => {
    [[2026, 7], [2026, 1], [2026, 10], [2027, 0]].forEach(([a, m]) => {
      const g = Calendrier.grilleMois(a, m, []);
      expect(g.lignes).toHaveLength(6);
      g.lignes.forEach((l) => expect(l.jours).toHaveLength(7));
    });
  });

  test('chaque ligne commence un lundi, et les lignes se suivent de 7 jours', () => {
    const g = Calendrier.grilleMois(2026, 7, []);
    g.lignes.forEach((l, i) => {
      expect(l.lundi.getDay()).toBe(1);
      expect(l.jours[0].date.getTime()).toBe(l.lundi.getTime());
      if (i > 0) {
        expect(l.lundi.getTime() - g.lignes[i - 1].lundi.getTime())
          .toBe(7 * 24 * 3600 * 1000);
      }
    });
  });

  test('les jours du mois voisin sont marqués hors mois', () => {
    const g = Calendrier.grilleMois(2026, 7, []);   // août 2026 commence un samedi
    const dedans = [].concat.apply([], g.lignes.map((l) => l.jours)).filter((j) => !j.horsMois);
    expect(dedans).toHaveLength(31);
    expect(dedans.every((j) => j.date.getMonth() === 7)).toBe(true);
  });

  test('un mois invalide ne casse pas', () => {
    expect(Calendrier.grilleMois(2026, 7, null).lignes).toHaveLength(6);
  });
});

// ── LA configuration discriminante ─────────────────────────────────────────
describe('sélection par LIGNE — chacun des sept jours donne la même semaine', () => {
  test('tous les jours d’une ligne, sur tout un mois', () => {
    const g = Calendrier.grilleMois(2026, 7, []);
    g.lignes.forEach((ligne) => {
      const semaines = ligne.jours.map((j) => Calendrier.semaineDuJour(j.date).getTime());
      expect(new Set(semaines).size).toBe(1);                    // les 7 donnent UNE semaine
      expect(semaines[0]).toBe(ligne.lundi.getTime());           // et c'est le lundi de la ligne
    });
  });

  test('le dimanche ne bascule pas sur la semaine suivante', () => {
    // Le piège classique : getDay() met dimanche à 0.
    const g = Calendrier.grilleMois(2026, 7, []);
    g.lignes.forEach((ligne) => {
      const dimanche = ligne.jours[6];
      expect(dimanche.date.getDay()).toBe(0);
      expect(Calendrier.semaineDuJour(dimanche.date).getTime()).toBe(ligne.lundi.getTime());
    });
  });
});

describe('semaine à cheval sur deux mois', () => {
  // Du 31 août au 6 septembre 2026 : lundi en août, le reste en septembre.
  test('elle est sélectionnable depuis le mois d’août ET depuis septembre', () => {
    const aout = Calendrier.grilleMois(2026, 7, []);
    const sept = Calendrier.grilleMois(2026, 8, []);
    const cible = new Date(2026, 7, 31).getTime();

    const ligneAout = aout.lignes.filter((l) => l.lundi.getTime() === cible)[0];
    const ligneSept = sept.lignes.filter((l) => l.lundi.getTime() === cible)[0];
    expect(ligneAout).toBeDefined();
    expect(ligneSept).toBeDefined();

    // Depuis chacun des deux mois, n'importe lequel des sept jours la choisit.
    [ligneAout, ligneSept].forEach((ligne) => {
      ligne.jours.forEach((j) => {
        expect(Calendrier.semaineDuJour(j.date).getTime()).toBe(cible);
      });
    });
    // Et les deux grilles montrent les mêmes sept dates.
    expect(ligneAout.jours.map((j) => cle(j.date))).toEqual(ligneSept.jours.map((j) => cle(j.date)));
  });

  test('les jours hors mois GARDENT leurs points — sinon la semaine à cheval ment', () => {
    const sept = Calendrier.grilleMois(2026, 8, [seance('2026-08-31T10:00:00')]);
    const ligne = sept.lignes.filter((l) => l.lundi.getTime() === new Date(2026, 7, 31).getTime())[0];
    const lundi = ligne.jours[0];
    expect(lundi.horsMois).toBe(true);
    expect(lundi.points).toBe(1);
  });
});

describe('les points — un par séance', () => {
  test('deux séances le même jour donnent deux points', () => {
    const g = Calendrier.grilleMois(2026, 7, [
      seance('2026-08-24T10:00:00'), seance('2026-08-24T18:00:00'),
      seance('2026-08-26T10:00:00')
    ]);
    const jours = [].concat.apply([], g.lignes.map((l) => l.jours));
    const le24 = jours.filter((j) => !j.horsMois && j.jour === 24)[0];
    const le26 = jours.filter((j) => !j.horsMois && j.jour === 26)[0];
    const le25 = jours.filter((j) => !j.horsMois && j.jour === 25)[0];
    expect(le24.points).toBe(2);
    expect(le26.points).toBe(1);
    expect(le25.points).toBe(0);
  });

  test('le total des points vaut le nombre de séances du mois', () => {
    const seances = ['2026-08-03T10:00:00', '2026-08-03T19:00:00', '2026-08-12T10:00:00',
                     '2026-08-28T10:00:00'].map(seance);
    const g = Calendrier.grilleMois(2026, 7, seances);
    const total = [].concat.apply([], g.lignes.map((l) => l.jours))
      .filter((j) => !j.horsMois)
      .reduce((t, j) => t + j.points, 0);
    expect(total).toBe(4);
  });

  test('une séance sans date, ou datée n’importe comment, ne produit pas de point', () => {
    const g = Calendrier.grilleMois(2026, 7, [{ id: 'x' }, { id: 'y', debut: 'pas une date' }]);
    const total = [].concat.apply([], g.lignes.map((l) => l.jours)).reduce((t, j) => t + j.points, 0);
    expect(total).toBe(0);
  });
});

describe('navigation de mois', () => {
  test('décembre + 1 passe en janvier de l’année suivante', () => {
    expect(Calendrier.decalerMois(2026, 11, 1)).toEqual({ annee: 2027, mois: 0 });
    expect(Calendrier.decalerMois(2026, 0, -1)).toEqual({ annee: 2025, mois: 11 });
  });

  test('la ligne de la semaine affichée est retrouvée', () => {
    const g = Calendrier.grilleMois(2026, 7, []);
    const i = Calendrier.ligneDeLaSemaine(g, new Date(2026, 7, 24));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(g.lignes[i].lundi.getTime()).toBe(new Date(2026, 7, 24).getTime());
    expect(Calendrier.ligneDeLaSemaine(g, new Date(2020, 0, 6))).toBe(-1);
    expect(Calendrier.ligneDeLaSemaine(null, new Date())).toBe(-1);
  });
});
