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

