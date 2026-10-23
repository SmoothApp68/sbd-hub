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
    expect(l.map((x) => x.etiquette)).toEqual([null, 'Chauffe', 'Dégressive', 'Échec', null]);
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
