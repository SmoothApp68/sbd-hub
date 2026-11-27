// Trois phrases rendues vraies : aucune décision du coach ne change.
const fs = require('fs');
const path = require('path');
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
const lire = (f) => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');

describe('la puissance : la source parle de fonction physique, pas de chutes', () => {
  test('le « pourquoi » ne promet pas de protéger des chutes', () => {
    expect(M.FORME_PUISSANCE_POURQUOI).not.toMatch(/chute/i);
    expect(M.FORME_PUISSANCE_POURQUOI).toMatch(/fonction physique \(ACSM 2026\)/);
  });
  test('la spec ne le dit plus non plus', () => {
    expect(lire('v2-atelier/specs/MOTEUR-PROGRESSION-V2.md')).not.toMatch(/protège des chutes/);
  });
});

describe('la douleur : enregistrée avec la séance, jamais envoyée à l’IA', () => {
  const faux = /reste sur ton téléphone|elle reste sur ton téléphone/;
  test.each(['v2/confidentialite.html', 'v2/js/mentions.js', 'v2/js/notes-ia.js'])('%s dit la vérité', (f) => {
    const s = lire(f);
    expect(s).not.toMatch(faux);
    expect(s).toMatch(/n’est jamais envoyée à l’IA|elle n’est jamais envoyée à l’IA/);
    expect(s).toMatch(/enregistrée avec ta séance/);
  });
});
