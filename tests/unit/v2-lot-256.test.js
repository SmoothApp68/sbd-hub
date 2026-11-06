/** @jest-environment jsdom */
// 256 — LE LOT DE LA RECETTE DE MAIN (défauts mineurs D4 à D14 et reliquats de la recette 585).
// Chaque bloc porte la preuve de son défaut : il échoue sur main, il passe avec le correctif.
process.env.TZ = 'Europe/Paris';
const fs = require('fs');
const path = require('path');
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/seance.js');
require('../../v2/js/rendu.js');
const Profil = require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const CSS = fs.readFileSync(path.join(__dirname, '../../v2/styles.css'), 'utf8');
const regle = (sel) => {
  let i = CSS.indexOf('}' + sel + '{');
  if (i < 0) i = CSS.indexOf('\n' + sel + '{');
  if (i < 0) i = CSS.indexOf(sel + '{');
  if (i < 0) throw new Error('règle absente : ' + sel);
  return CSS.slice(i + 1, CSS.indexOf('}', i + 1));
};

describe('256 D4 — « Pourquoi ? » ne raye pas la ligne suivante', () => {
  test('le soulignement est collé au texte (text-decoration), plus une bordure du bouton de 44 px', () => {
    const r = regle('.lien-pourquoi');
    expect(CSS).toMatch(/\.pourquoi-ligne\{margin-top:2px\}\.lien-pourquoi\{/);
    expect(r).toMatch(/text-decoration:underline dotted/);
    expect(r).not.toMatch(/border-bottom/);
    expect(r).toMatch(/padding:12px 4px;margin:-12px -4px/);   // la cible de 44 px est gardée
  });
});

describe('256 D6 — les cibles tactiles sont à 44 px', () => {
  test('les boutons d’une carte du coach, le « Pourquoi ? » de la veille et de l’escalier, « Reprendre »', () => {
    expect(regle('.proposition-exercice button')).toMatch(/min-height:44px/);
    expect(regle('.carte-mobilite .cm-pourquoi summary')).toMatch(/min-height:44px/);
    expect(regle('.carte-escalier .ce-pourquoi summary')).toMatch(/min-height:44px/);
    expect(regle('.exo-reprendre')).toMatch(/min-height:44px/);
  });
});

describe('256 D5 — « null » n’est jamais affiché sous TA PHASE', () => {
  const MAINTENANT = new Date('2026-10-05T10:00:00+02:00');
  test('une phase posée sans date de début : le pied est vide (null), pas le mot « null »', () => {
    const sec = Profil.sectionPhase({ phase: 'seche', phase_depuis: null }, () => {}, MAINTENANT);
    expect(sec.pied).toBeNull();
    const avecNote = Profil.sectionPhase({ phase: 'seche', phase_depuis: null }, () => {}, MAINTENANT, 'Tes séries reviennent à ta routine.');
    expect(avecNote.pied).toBe('Tes séries reviennent à ta routine.');
  });
  test('avec une date, le pied est inchangé', () => {
    const sec = Profil.sectionPhase({ phase: 'seche', phase_depuis: '2026-09-29T10:00:00.000Z' }, () => {}, MAINTENANT);
    expect(sec.pied).toMatch(/^Depuis /);
  });
  test('sans phase : « Maintien (par défaut) », comme avant', () => {
    expect(Profil.sectionPhase({ phase: null }, () => {}, MAINTENANT).pied).toBe(Profil.LIBELLE_PHASE_VIDE);
  });
});

