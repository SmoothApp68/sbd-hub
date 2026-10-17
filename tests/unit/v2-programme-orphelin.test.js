//
// 118 (audit du 16/10/2026, 03 #5) — UN PROGRAMME DONT LE DOSSIER N'A PLUS DE ROUTINE GARDE SON BADGE ET « ARRÊTER ».
//
// LE CONSTAT : le badge du bloc et « Arrêter le programme » ne s'atteignaient que par l'en-tête d'un dossier de la
// bibliothèque, et la bibliothèque ne montrait que les dossiers qui ont une routine. Une personne qui supprimait ses
// routines, ou les rangeait ailleurs, gardait un bloc `en_cours` — sa semaine de décharge, ses zones — sans aucun
// moyen de l'arrêter. Le geste existant le plus proche : le dossier reste montré, vide, avec son badge.

const fs = require('fs');
const path = require('path');

global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/routines.js');
require('../../v2/js/rendu.js');
const Rendu = window.THRendu;

const routine = (id, nom, dossier, rang) => ({ id, nom, dossier, rang, exercices: [] });
const BADGE = 'Bloc Lourd · semaine 2 sur 4';

function rendre(routines, vue) {
  const c = document.createElement('div');
  const ouverts = [];
  Rendu.rendreListeRoutines(c, routines, Object.assign({
    programme: (d) => (d === 'Mon programme' ? { badge: BADGE } : { creer: false }),
    dossiersDeProgramme: () => ['Mon programme'],
    surBadgeProgramme: (d) => ouverts.push(d)
  }, vue || {}));
  return { c, ouverts };
}
const badgeDe = (c, d) => {
  const l = Array.from(c.querySelectorAll('.dossier-ligne')).find((x) => x.getAttribute('data-dossier') === d);
  return l ? l.querySelector('.dossier-badge') : null;
};

describe('118 — le dossier d’un programme en cours reste montré, même vide', () => {
  test('⚠️ DISCRIMINANT — ses routines rangées dans « Sèche » : « Mon programme » reste, son badge ouvre le bloc', () => {
    const { c, ouverts } = rendre([routine('r1', 'Haut', 'Sèche', 1), routine('r2', 'Bas', 'Sèche', 2)]);
    const b = badgeDe(c, 'Mon programme');
    expect(b).not.toBeNull();
    expect(b.textContent).toBe(BADGE);
    b.click();
    expect(ouverts).toEqual(['Mon programme']);
    // Le dossier vide ne porte aucune routine, « Sèche » garde les siennes.
    expect(c.querySelectorAll('.routine').length).toBe(2);
  });

  test('aucune routine rangée dans un dossier (liste plate) : le dossier du programme apparaît, puis « Sans dossier »', () => {
    const { c } = rendre([routine('r1', 'Haut', null, 1)]);
    expect(badgeDe(c, 'Mon programme')).not.toBeNull();
    expect(Array.from(c.querySelectorAll('.dossier-ligne')).map((x) => x.getAttribute('data-dossier'))).toEqual(['Mon programme', '']);
    expect(c.querySelectorAll('.routine').length).toBe(1);
  });

  test('plus aucune routine du tout : le dossier du programme suit l’écran vide', () => {
    const { c } = rendre([]);
    expect(c.querySelector('.vide-routines')).not.toBeNull();
    expect(badgeDe(c, 'Mon programme')).not.toBeNull();
  });

  test('un dossier qui a encore ses routines n’est pas doublé ; pendant qu’on range, rien ne change', () => {
    const { c } = rendre([routine('r1', 'Haut', 'Mon programme', 1)]);
    expect(c.querySelectorAll('.dossier-ligne[data-dossier="Mon programme"]').length).toBe(1);
    const r = rendre([routine('r1', 'Haut', 'Sèche', 1)], { reorganiser: true });
    expect(r.c.querySelectorAll('.dossier-ligne').length).toBe(0);
  });

  test('le branchement (app.js) : les dossiers des blocs en cours, rien en carnet', () => {
    const app = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
    const i = app.indexOf('function dossiersDeProgramme(');
    const corps = app.slice(i, app.indexOf('\n  }\n', i));
    expect(corps).toMatch(/Moteur\.coachSeTait\(profil && profil\.intention\)\) return \[\]/);
    expect(corps).toMatch(/Moteur\.blocEnCours\(local\.blocs, b\.dossier\) === b/);
    expect(app).toMatch(/dossiersDeProgramme: dossiersDeProgramme,/);
  });
});
