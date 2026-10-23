// 144-4 — le direct du groupe montre tout, avec une étiquette (jsdom : `rendu.js` se termine par `this`).
require('../../v2/js/routeur.js');
require('../../v2/js/semaine.js');
require('../../v2/js/modele.js');
require('../../v2/js/routines.js');
require('../../v2/js/rendu.js');
const Social = require('../../v2/js/social.js');

const T0 = Date.parse('2026-10-23T10:00:00Z');
const iso = (t) => new Date(t).toISOString();
const ligne = (type, n) => ({ pseudo: 'jordan', exercise_slug: 'squat', charge_kg: 60, reps: 5, type_serie: type, validee_a: iso(T0 - n * 1000) });
const mesure = (d) => d.charge_kg + ' kg × ' + d.reps;

describe('144-4 — le direct étiqueté', () => {
  test('tout est montré ; chauffe, dégressive et échec portent leur étiquette, le travail aucune', () => {
    const l = Social.lignesDuDirect([ligne('travail', 1), ligne('echauffement', 2), ligne('degressive', 3), ligne('echec', 4), ligne(null, 5)],
      iso(T0), (s) => s, mesure);
    expect(l.map((x) => x.etiquette)).toEqual([null, 'Chauffe', 'Dégressive', 'Tentative manquée', null]);
  });
  test('la ligne rendue porte l\'étiquette dans un .g-etiq, et pas pour le travail', () => {
    const l = Social.lignesDuDirect([ligne('travail', 1), ligne('echauffement', 2)], iso(T0), (s) => s, mesure);
    const cible = document.createElement('div');
    window.THRendu.rendreGroupeSeance(cible, { groupe: { titre: 'Groupe · 2', pastilles: [], lignes: l, rapides: [], max: 100,
      surMuet() {}, surInviter: null, toutVoir: null } });
    const rangs = Array.from(cible.querySelectorAll('.g-l'));
    expect(rangs.length).toBe(2);
    expect(rangs[0].querySelector('.g-etiq')).toBeNull();
    expect(rangs[1].querySelector('.g-etiq').textContent).toBe('Chauffe');
  });
});

// 144-6 — « Comment faire » chez un ami : la même fiche, en lecture seule.
describe('144-6 — « Comment faire » dans la séance d\'un ami', () => {
  const fiche = { description: 'Dos droit.\nDescends sous les genoux.', materiel: 'Barre', travaille: 'Quadriceps', aussi: 'Fessiers' };
  const vueAmi = (detail) => ({ etat: 'ok', profil: { pseudo: 'jordan', couleur: '#888' },
    calendrier: { libelle: 'octobre', lignes: [] }, surMois() {}, surJour() {},
    resume: { titre: 'Push', quand: 'hier', tonnes: '12 t', detail } });

  test('un exercice avec fiche s\'ouvre ; sans fiche, il ne s\'ouvre pas', () => {
    const cible = document.createElement('div');
    let ouvert = 0;
    window.THRendu.rendreAmi(cible, vueAmi([
      { nom: 'Squat', fait: '180 kg × 3', surOuvrir: () => { ouvert++; } },
      { nom: 'Gainage', fait: '1 min' }]));
    const rangs = cible.querySelectorAll('.s-ex');
    expect(rangs.length).toBe(2);
    expect(rangs[0].getAttribute('role')).toBe('button');
    expect(rangs[1].getAttribute('role')).toBeNull();
    rangs[0].click(); rangs[1].click();
    expect(ouvert).toBe(1);
  });

  test('la feuille rend la fiche et les étapes, un « Fermer », et ni échelle ni record', () => {
    const cible = document.createElement('div');
    let ferme = 0;
    window.THRendu.rendreFeuilleCommentFaire(cible, { nom: 'Squat (barre)', comment: fiche, surFermer: () => { ferme++; } });
    expect(cible.querySelector('.feuille-t').textContent).toMatch(/Comment faire/);
    expect(Array.from(cible.querySelectorAll('.exo-li')).map((n) => n.textContent)).toEqual(['MatérielBarre', 'TravailleQuadriceps', 'AussiFessiers']);
    expect(Array.from(cible.querySelectorAll('.etape-t')).map((n) => n.textContent)).toEqual(['Dos droit.', 'Descends sous les genoux.']);
    expect(cible.textContent).not.toMatch(/échelle|record|PR/i);
    Array.from(cible.querySelectorAll('button')).filter((b) => b.textContent === 'Fermer')[0].click();
    expect(ferme).toBe(1);
  });
});
