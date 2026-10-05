//
// 51-2 — la feuille « Machine prise » (MOTEUR §9.19) et les menus ⋯ qui y
// mènent. La feuille ne décide rien : elle écrit les phrases de §9.19 sur ce
// qu'on lui donne (`Seance.plusTard`, `Seance.freresProposes`, « Dernière
// séance »), avec le formateur de la page d'exercice.

require('../../v2/js/semaine.js');
require('../../v2/js/modele.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const ANNEE = new Date().getFullYear();
const iso = (a, m, j) => new Date(a, m - 1, j, 12).toISOString();

function feuille(vue) {
  const cible = document.createElement('div');
  Rendu().rendreFeuilleMachinePrise(cible, vue);
  return cible;
}
const textes = (c, sel) => Array.from(c.querySelectorAll(sel)).map((n) => n.textContent);

describe('51-2 — le fait sous un frère', () => {
  test('« Dernière fois : 80 kg × 10, le 12 sept. », et l’année quand ce n’est pas celle-ci', () => {
    expect(Rendu().texteFaitFrere({ date: iso(ANNEE, 9, 12), charge: 80, reps: 10 }))
      .toBe('Dernière fois : 80 kg × 10, le 12 sept.');
    expect(Rendu().texteFaitFrere({ date: iso(2025, 3, 2), charge: 102.5, reps: 5 }))
      .toBe('Dernière fois : 102,5 kg × 5, le 2 mars 2025');
  });

  test('jamais fait : « Première fois ici »', () => {
    expect(Rendu().texteFaitFrere(null)).toBe('Première fois ici');
  });

  test('une mesure sans charge : la valeur de la page d’exercice', () => {
    expect(Rendu().texteFaitFrere({ date: iso(ANNEE, 9, 12), charge: null, valeur: '12 reps' }))
      .toBe('Dernière fois : 12 reps, le 12 sept.');
  });
});

describe('51-2 — la feuille « Machine prise »', () => {
  test('« Plus tard » d’abord, avec sa raison ; puis les frères, dans l’ordre reçu, chacun son fait', () => {
    const appels = [];
    const c = feuille({
      nom: 'Hip thrust (machine)',
      tard: { apres: 'Leg curl', surChoisir: () => appels.push('tard') },
      freres: [
        { nom: 'Hip thrust (barre)', fait: { date: iso(ANNEE, 9, 12), charge: 80, reps: 10 }, surChoisir: () => appels.push('barre') },
        { nom: 'Hip thrust une jambe (haltère)', fait: null, surChoisir: () => appels.push('jambe') }],
      surCatalogue: () => appels.push('catalogue')
    });
    expect(c.querySelector('.feuille-t').textContent).toBe('Machine priseHip thrust (machine)');
    expect(textes(c, '.choix-mp .mp-titre')).toEqual(['Plus tard', 'Un frère : Hip thrust (barre)',
      'Un frère : Hip thrust une jambe (haltère)']);
    expect(textes(c, '.choix-mp .mp-sous')).toEqual(['Il passe après Leg curl. Ta consigne ne change pas.',
      'Dernière fois : 80 kg × 10, le 12 sept.', 'Première fois ici']);
    c.querySelectorAll('.choix-mp').forEach((b) => b.click());
    expect(appels).toEqual(['tard', 'barre', 'jambe']);
    expect(c.querySelector('.sans-frere')).toBe(null);
  });

  test('« Plus tard » absent (dernier bloc, exercice commencé) : seuls les frères', () => {
    const c = feuille({ nom: 'X', tard: null, freres: [{ nom: 'Y', fait: null, surChoisir: () => {} }], surCatalogue: () => {} });
    expect(textes(c, '.choix-mp .mp-titre')).toEqual(['Un frère : Y']);
    expect(c.querySelector('.plus-tard')).toBe(null);
  });

  test('sans frère : la phrase de §9.19, et le catalogue habituel', () => {
    let ouvert = false;
    const c = feuille({ nom: 'Pull-over', tard: null, freres: [], surCatalogue: () => { ouvert = true; } });
    expect(c.querySelector('.sans-frere').textContent).toBe('Pas de frère au catalogue pour cet exercice.');
    const b = Array.from(c.querySelectorAll('button')).filter((x) => x.textContent === 'Remplacer l’exercice')[0];
    b.click();
    expect(ouvert).toBe(true);
  });
});

describe('51-2 — « Machine prise » dans les menus ⋯', () => {
  test('le menu d’un bloc d’un seul exercice la porte en tête', () => {
    const c = document.createElement('div');
    Rendu().rendreFeuilleBloc(c, { superset: false, noms: 'X', peutGrouper: true,
      surMachinePrise: () => {}, surRemplacer: () => {}, surGrouper: () => {}, surAjouterApres: () => {},
      surReorganiser: null, surProgression: null, surSupprimer: () => {} });
    expect(textes(c, '.feuille-menu button')[0]).toBe('Machine prise');
  });

  test('le menu d’un superset ne la porte pas (elle vise un exercice : le menu de la branche)', () => {
    const c = document.createElement('div');
    Rendu().rendreFeuilleBloc(c, { superset: true, noms: 'X · Y', peutGrouper: true,
      surMachinePrise: null, surRemplacer: () => {}, surGrouper: () => {}, surAjouterApres: () => {},
      surReorganiser: null, surProgression: null, surSupprimer: () => {} });
    expect(textes(c, '.feuille-menu button')).not.toContain('Machine prise');
  });

  test('le menu d’une branche de superset la porte en tête', () => {
    const c = document.createElement('div');
    Rendu().rendreFeuilleExercice(c, { nom: 'X', surMachinePrise: () => {}, surRemplacer: () => {},
      surDegrouper: () => {}, surProgression: null, surSupprimer: () => {} });
    expect(textes(c, '.feuille-menu button')[0]).toBe('Machine prise');
  });
});
