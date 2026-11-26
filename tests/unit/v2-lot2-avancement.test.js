/**
 * Lot 2, n° 2 (25/11/2026) — la barre de séance dit « 7 sur 12 séries » : les séries de travail FAITES sur celles que la séance
 * contient. Un fait de `Seance.compter` (aucune décision), écrit par UN formateur (`Modele.avancementDeSeance`).
 *
 * Ce que ce fichier prouve : le total compte les séries de travail de toute la séance (chauffes et sorties exclues), faites ou non ;
 * « + Série », un exercice ajouté les font monter, une suppression les fait baisser ; le texte, ses pluriels ; la durée avance seule
 * sans redessiner (`data-suite`) ; la correction garde « Modification · N séries de travail » ; sans série prévue : « N séries de travail ».
 */
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
const Seance = require('../../v2/js/seance.js');
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const T = new Date('2026-11-25T10:00:00Z');
const serie = (type, n, valide) => ({ id: 's' + n, type_serie: type, charge_kg: 60, reps: 8, validee_a: valide ? T.toISOString() : null });
const seance = (exos) => ({ id: 'x', debut: T.toISOString(), exercices: exos.map((series, i) => ({ exercise_slug: 'e' + i, series })) });
const CAT = [{ slug: 'e0', nom: 'A', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['pectoraux'] },
  { slug: 'e1', nom: 'B', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['dos'] },
  { slug: 'tapis', nom: 'Tapis', mesure: 'distance_temps', charge: 'aucune', muscles_primaires: [], nature: 'cardio', hors_salle: false }];

describe('le total : les séries de travail de la séance, faites ou non, chauffes exclues', () => {
  test('7 faites sur 12 : 2 chauffes ne comptent ni dans l\'un ni dans l\'autre', () => {
    const faites = Array.from({ length: 4 }, (_, i) => serie('travail', i, true));
    const reste = Array.from({ length: 2 }, (_, i) => serie('travail', 10 + i, false));
    const b = Array.from({ length: 3 }, (_, i) => serie('travail', 20 + i, true));
    const b2 = Array.from({ length: 3 }, (_, i) => serie('travail', 30 + i, false));
    const s = seance([[serie('echauffement', 90, true), serie('echauffement', 91, true)].concat(faites, reste), b.concat(b2)]);
    const c = Seance.compter(s, CAT);
    expect([c.travail, c.prevues]).toEqual([7, 12]);
    expect(c.series).toBe(14);          // les chauffes sont des lignes, pas des séries de travail
  });
  test('« + Série » et un exercice ajouté font monter le total ; une série supprimée le fait baisser', () => {
    const base = seance([[serie('travail', 1, true), serie('travail', 2, false)]]);
    expect(Seance.compter(base, CAT).prevues).toBe(2);
    const plus = seance([[serie('travail', 1, true), serie('travail', 2, false), serie('travail', 3, false)]]);
    expect(Seance.compter(plus, CAT).prevues).toBe(3);
    const ajoute = seance([[serie('travail', 1, true), serie('travail', 2, false)], [serie('travail', 3, false)]]);
    expect(Seance.compter(ajoute, CAT).prevues).toBe(3);
    const moins = seance([[serie('travail', 1, true)]]);
    expect(Seance.compter(moins, CAT).prevues).toBe(1);
  });
  test('⚠️ la même règle que le fait : le cardio n\'entre ni dans le fait ni dans le prévu', () => {
    const s = { id: 'x', debut: T.toISOString(), exercices: [
      { exercise_slug: 'e0', series: [serie('travail', 1, true), serie('travail', 2, false)] },
      { exercise_slug: 'tapis', series: [{ id: 't1', type_serie: 'travail', duree_s: 600, validee_a: T.toISOString() }] }] };
    const c = Seance.compter(s, CAT);
    expect([c.travail, c.prevues]).toEqual([1, 2]);
  });
});

describe('le texte — un formateur, ses pluriels', () => {
  test('« 7 sur 12 séries », « 0 sur 3 séries », « 1 sur 1 série » ; sans série prévue, rien', () => {
    expect(Modele.avancementDeSeance(7, 12)).toBe('7 sur 12 séries');
    expect(Modele.avancementDeSeance(0, 3)).toBe('0 sur 3 séries');
    expect(Modele.avancementDeSeance(1, 1)).toBe('1 sur 1 série');
    expect(Modele.avancementDeSeance(0, 0)).toBeNull();
    expect(Modele.avancementDeSeance(2, undefined)).toBeNull();
  });
});

describe('la barre', () => {
  const barre = (sur) => {
    const cible = document.createElement('header');
    Rendu().rendreBandeauSeance(cible, Object.assign({ titre: 'Haut A', debut: new Date(Date.now() - 34 * 60000).toISOString(),
      compte: { series: 14, validees: 9, travail: 7, prevues: 12 }, modifier: false, selection: null, edition: false,
      surModifier() {}, surAnnulerSelection() {}, surTerminer() {} }, sur || {}));
    return cible;
  };
  const ch = (b) => b.querySelector('.bandeau-ch');
  test('« 34 min · 7 sur 12 séries » ; « Terminer » reste à droite', () => {
    const b = barre();
    expect(ch(b).textContent).toBe('34 min · 7 sur 12 séries');
    const enfants = Array.from(b.children);
    expect(enfants[enfants.length - 1].textContent).toBe('Terminer');
  });
  test('la durée avance seule : seul le début est réécrit, la fin (« 7 sur 12 séries ») vient de `data-suite`', () => {
    const b = barre();
    expect(ch(b).getAttribute('data-suite')).toBe(' · 7 sur 12 séries');
    Rendu().majDureeBandeau(b, new Date(Date.now() - 35 * 60000).toISOString(), Date.now());
    expect(ch(b).textContent).toBe('35 min · 7 sur 12 séries');
  });
  test('en correction : « Modification · N séries de travail », inchangé', () => {
    expect(ch(barre({ edition: true })).textContent).toBe('Modification · 7 séries de travail');
  });
  test('sans série prévue (fixture sans total) : « N séries de travail », comme avant', () => {
    expect(ch(barre({ compte: { series: 6, validees: 6, travail: 5 } })).textContent).toBe('34 min · 5 séries de travail');
    expect(ch(barre({ compte: { series: 0, validees: 0, travail: 0, prevues: 0 } })).textContent).toBe('34 min · 0 série de travail');
  });
});
