'use strict';
// 92 — LA PESÉE DEPUIS LE PROFIL (ECRAN-PROFIL §2.1, 14/10/2026).
//   · la règle pure (`THPoids.peseeDuProfil`) : les bornes du questionnaire, le jour, jamais après aujourd'hui ;
//   · le câblage : la ligne « Poids » ouvre la feuille, et la feuille n'écrit QUE par `poserPesee`.
const fs = require('fs');
const path = require('path');
require('../../v2/js/modele.js');
const Poids = require('../../v2/js/poids.js');

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
function corpsDe(src, nom) {
  const i = src.indexOf('function ' + nom + '(');
  if (i < 0) return null;
  let j = src.indexOf('{', i), n = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') n++;
    else if (src[k] === '}' && --n === 0) return src.slice(j, k + 1);
  }
  return null;
}

describe('92 — `peseeDuProfil` : un poids et un jour tapés', () => {
  test('un poids plausible, le jour donné : la pesée, à la forme de `poserPesee`', () => {
    expect(Poids.peseeDuProfil(96.84, '2026-10-13', '2026-10-14')).toEqual({ pesee: { date: '2026-10-13', poids_kg: 96.8 } });
  });
  test('la même valeur que la dernière pesée S’ÉCRIT quand même (on pèse, on ne confirme pas)', () => {
    expect(Poids.peseeDuProfil(96.8, '2026-10-14', '2026-10-14').pesee).toEqual({ date: '2026-10-14', poids_kg: 96.8 });
  });
  test('les bornes sont celles du questionnaire (`poidsValide`), et la phrase les dit', () => {
    [Poids.POIDS_MIN, Poids.POIDS_MAX, null, NaN, 5].forEach((v) => {
      expect(Poids.peseeDuProfil(v, '2026-10-14', '2026-10-14')).toEqual(
        { erreur: 'Un poids entre ' + Poids.POIDS_MIN + ' et ' + Poids.POIDS_MAX + ' kg.' });
    });
    expect(Poids.peseeDuProfil(Poids.POIDS_MIN + 0.1, '2026-10-14', '2026-10-14').pesee).toBeTruthy();
  });
  test('une date absente, impossible, ou après aujourd’hui est refusée', () => {
    expect(Poids.peseeDuProfil(80, '', '2026-10-14').erreur).toBe('Une date valide.');
    expect(Poids.peseeDuProfil(80, '2026-02-30', '2026-10-14').erreur).toBe('Une date valide.');
    expect(Poids.peseeDuProfil(80, '2026-10-15', '2026-10-14').erreur).toBe('Une date passée ou aujourd’hui.');
  });
});

describe('92 — le câblage : un seul chemin d’écriture', () => {
  const ouvrir = corpsDe(APP, 'ouvrirPeseeProfil');
  test('la feuille existe, et la ligne « Poids » du Profil l’ouvre', () => {
    expect(ouvrir).toBeTruthy();
    expect(APP).toMatch(/libelle: 'Poids',[\s\S]{0,300}surChoix: ouvrirPeseeProfil/);
  });
  test('elle écrit par `poserPesee`, avec la règle `Poids.peseeDuProfil` — et par rien d’autre', () => {
    expect(ouvrir).toMatch(/Poids\.peseeDuProfil\(/);
    expect(ouvrir).toMatch(/poserPesee\(r\.pesee\)/);
    expect(ouvrir).not.toMatch(/Attente\.PESEES|Cache\.ecrireLot|ajouterPesee|body_weight_log|poser\(\{/);
  });
});
