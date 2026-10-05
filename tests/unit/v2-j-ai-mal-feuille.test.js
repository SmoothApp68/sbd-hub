//
// 51-3 — la feuille « J'ai mal » et la carte de reprise (MOTEUR §9.20), au
// DOM. Elles ne décident rien : leurs phrases viennent du moteur
// (`feuilleDouleur`, `carteRepriseTextes`), leurs gestes de l'app.

require('../../v2/js/semaine.js');
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/moteur.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;
const Moteur = () => window.THMoteur;
const textes = (c, sel) => Array.from(c.querySelectorAll(sel)).map((n) => n.textContent);

describe('51-3 — la feuille « J’ai mal »', () => {
  test('le titre, la phrase, quatre choix avec leur raison, la phrase de sécurité en bas', () => {
    const c = document.createElement('div');
    const cles = [];
    Rendu().rendreFeuilleDouleur(c, { textes: Moteur().feuilleDouleur('Squat (Barre)'), surChoix: (k) => cles.push(k) });
    expect(c.querySelector('.feuille-t').textContent).toBe('Squat (Barre) : tu as mal');
    expect(c.querySelector('.douleur-phrase').textContent)
      .toBe('Pour aujourd’hui, Squat (Barre) est sans coach : il ne comptera pas comme un recul.');
    expect(textes(c, '.choix-mp .mp-titre')).toEqual(['Alléger', 'Changer de position', 'Un frère', 'Arrêter cet exercice']);
    expect(c.lastChild.className).toMatch(/douleur-securite/);
    expect(c.lastChild.textContent).toBe('Si la douleur dépasse 5 sur 10, ou ne redescend pas en 24 heures, demande l’avis d’un professionnel.');
    c.querySelectorAll('.choix-mp').forEach((b) => b.click());
    expect(cles).toEqual(['alleger', 'position', 'frere', 'arreter']);
  });

  test('« J’ai mal » est dans le menu d’un exercice seul et d’une branche, après « Machine prise »', () => {
    const bloc = document.createElement('div');
    Rendu().rendreFeuilleBloc(bloc, { superset: false, noms: 'X', peutGrouper: true, surMachinePrise: () => {},
      surJaiMal: () => {}, surRemplacer: () => {}, surGrouper: () => {}, surAjouterApres: () => {},
      surReorganiser: null, surProgression: null, surSupprimer: () => {} });
    expect(textes(bloc, '.feuille-menu button').slice(0, 2)).toEqual(['Machine prise', 'J’ai mal']);
    const exo = document.createElement('div');
    Rendu().rendreFeuilleExercice(exo, { nom: 'X', surMachinePrise: () => {}, surJaiMal: () => {},
      surRemplacer: () => {}, surDegrouper: () => {}, surProgression: null, surSupprimer: () => {} });
    expect(textes(exo, '.feuille-menu button').slice(0, 2)).toEqual(['Machine prise', 'J’ai mal']);
  });
});

describe('51-3 — la carte de reprise', () => {
  test('le titre, la phrase, trois choix — le même composant que les propositions d’exercice', () => {
    const appels = [];
    const carte = { titre: 'Ta dernière séance de X était douloureuse.',
      phrase: 'On reprend comme tu veux. Tu peux toujours changer d’avis depuis l’étiquette de l’exercice.',
      choix: [{ cle: 'avant', texte: 'Comme avant : 120 kg × 5' }, { cle: 'leger', texte: 'Plus léger, plus de reps : 110 kg × 6' },
        { cle: 'sans', texte: 'Sans coach cette fois' }] };
    const n = Rendu().propositionDeReprise(carte, 2, { surReprise: (i, k) => appels.push(i + ':' + k) });
    expect(n.className).toMatch(/proposition-exercice proposition-reprise/);
    expect(n.querySelector('.pc-texte').textContent).toBe(carte.titre);
    expect(n.querySelector('.pc-detail').textContent).toBe(carte.phrase);
    expect(textes(n, 'button')).toEqual(carte.choix.map((q) => q.texte));
    n.querySelectorAll('button').forEach((b) => b.click());
    expect(appels).toEqual(['2:avant', '2:leger', '2:sans']);
  });
});
