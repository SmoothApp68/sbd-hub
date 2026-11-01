/** @jest-environment node */
//
// 208 — UN SEUL « JOUR LOCAL ». `Moteur.jourCivil` est la clé de jour (AAAA-MM-JJ, heure locale) : une fonction qui
// recopie `getFullYear() + '-' + … getMonth … getDate` hors d'elle est une seconde définition du jour, qui finira
// par diverger (l'assistant écrivait « 2026-1-5 »). Un nouveau formateur échoue ici ; le geste conscient est de
// l'inscrire à RESTE avec sa raison — ou, mieux, d'appeler `Moteur.jourCivil`.

const fs = require('fs');
const path = require('path');

const JS = path.join(__dirname, '../../v2/js');

// Les formateurs de jour qui subsistent, comptés par fichier, chacun avec sa raison.
const RESTE = {
  'jeu.js': { n: 1, raison: '64A : le jeu ne nomme jamais le moteur (garde d’architecture) ; il garde sa clé de semaine locale, identique à `jourCivil`.' },
  'moteur.js': { n: 1, raison: 'LA définition : `jourCivil`.' },
  'calendrier.js': { n: 2, raison: 'clés de cellule internes à la grille (mois de 0 à 11, sans zéro) : jamais un jour civil échangé avec un autre module.' },
  'equilibres.js': { n: 1, raison: 'dette signalée (208) : `cleDeJour` rend « NaN-NaN-NaN » d’une date illisible, `jourCivil` rendrait null.' },
  'routeur.js': { n: 1, raison: 'dette signalée (208) : `versDate`, module chargé sans le moteur.' },
  'routines.js': { n: 1, raison: 'dette signalée (208) : `jourCle`.' },
  'semaine.js': { n: 1, raison: 'dette signalée (208) : module chargé avant le moteur, testé sans lui.' }
};

// Un formateur de jour : année + '-' + mois + '-' + jour, par les accesseurs locaux, avec zéro de tête (`deux`).
const FORMATEUR = /getFullYear\(\)\s*\+\s*'-'\s*\+\s*\w+\(\s*\w+\.getMonth\(\)\s*\+\s*1\s*\)\s*\+\s*'-'\s*\+\s*\w+\(\s*\w+\.getDate\(\)\s*\)/g;
// Et le même sans zéro de tête (« 2026-1-5 »), ou à mois seul décalé : tout `getFullYear() + '-' + … getDate()`.
const NU = /getFullYear\(\)\s*\+\s*'-'[^;]*?getDate\(\)/g;

function compte(src, re) { return (src.match(re) || []).length; }

describe('208 — un seul jour local', () => {
  const fichiers = fs.readdirSync(JS).filter((f) => f.endsWith('.js'));

  test('aucun formateur de jour hors la fonction unique et la liste signalée', () => {
    const ecarts = [];
    fichiers.forEach((f) => {
      const src = fs.readFileSync(path.join(JS, f), 'utf8');
      const n = Math.max(compte(src, FORMATEUR), compte(src, NU));
      const attendu = RESTE[f] ? RESTE[f].n : 0;
      if (n !== attendu) ecarts.push(f + ' : ' + n + ' formateur(s), ' + attendu + ' attendu(s)');
    });
    expect(ecarts).toEqual([]);
  });

  test('la liste ne ment pas : chaque entrée a sa raison', () => {
    Object.keys(RESTE).forEach((f) => {
      expect(fichiers).toContain(f);
      expect(RESTE[f].raison.length).toBeGreaterThan(10);
    });
  });

  test('les copies câblées (social, assistant) rendent la clé de Moteur.jourCivil', () => {
    ['social.js', 'assistant.js'].forEach((f) => {
      const src = fs.readFileSync(path.join(JS, f), 'utf8');
      expect(src).toMatch(/racine\.THMoteur\.jourCivil\(/);
    });
  });
});
