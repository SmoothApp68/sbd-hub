/** @jest-environment node */
//
// 135 — LES DÉLAIS FIXES DES BANCS : ON N'EN AJOUTE PLUS, ET CEUX QUI RESTENT DISENT POURQUOI.
//
// Un délai fixe (`attendre(900)`) est calibré sur la machine où on l'écrit. Sous charge (deux ou trois agents,
// six navigateurs pour deux cœurs), il devient une intermittence : le contrôle lit l'écran d'avant. Au 135, les
// bancs des routines, de la création du profil et du service worker attendent l'ÉTAT que lit le contrôle suivant ;
// ce qui y reste de délais fixes est marqué :
//   · « VOULU » (sur la ligne ou dans les trois au-dessus) : un vrai temps — le rythme d'un doigt qui glisse, ou
//     l'absence d'un évènement, qu'aucun état ne prouve (un envoi qui ne part pas, un rechargement qui ne vient pas) ;
//   · « le pas d » : le pas d'une boucle qui lit l'état à chaque tour ;
//   · « plafond » : la borne d'une course (`Promise.race`) — l'état gagne dès qu'il vient.
// Le banc de séance en garde encore des centaines : leur nombre ne peut que BAISSER (le plafond ci-dessous). Qui en
// retire baisse le plafond ; qui en ajoute fait échouer ce test.
const fs = require('fs');
const os = require('os');
const path = require('path');

const BANC = path.join(__dirname, '../banc');
const DELAI = /\b(attendre|pause)\(\s*\d+\s*\)|setTimeout\(\s*r\s*,\s*\d+\s*\)/;
const DEFINITION = /=\s*(async\s*)?\(ms\)\s*=>/;

function delaisNus(fichier, dossier) {
  const lignes = fs.readFileSync(path.join(dossier || BANC, fichier), 'utf8').split('\n');
  const nus = [];
  lignes.forEach((l, i) => {
    if (!DELAI.test(l) || DEFINITION.test(l)) return;
    if (/le pas d|plafond/.test(l)) return;
    if (lignes.slice(Math.max(0, i - 3), i + 1).some((x) => /VOULU/.test(x))) return;
    nus.push(fichier + ':' + (i + 1) + '  ' + l.trim());
  });
  return nus;
}

describe('135 — les délais fixes des bancs', () => {
  test.each(['routines-ecran.js', 'profil-creation.js', 'sw-navigation.js', 'journal-mesure.js'])(
    '⚠️ %s : aucun délai fixe sans sa raison (« VOULU », « le pas d », « plafond »)', (f) => {
      expect(delaisNus(f)).toEqual([]);
    });

  // Le banc de séance : 1 016 délais fixes avant le 135, 1 000 après (`attendre(N)`, `pause(N)` non marqués).
  const PLAFOND_SEANCE = 1000;
  test('⚠️ seance-ecran.js : le nombre de délais fixes ne monte pas (il ne peut que baisser)', () => {
    expect(delaisNus('seance-ecran.js').length).toBeLessThanOrEqual(PLAFOND_SEANCE);
  });

  test('la garde voit vraiment un délai nu, et accepte un délai marqué', () => {
    // Hors de `tests/banc` : un fichier de passage y serait vu par les autres gardes qui parcourent le dépôt.
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'delais-'));
    const essai = (texte) => {
      fs.writeFileSync(path.join(dossier, 'essai.js'), texte);
      return delaisNus('essai.js', dossier).length;
    };
    expect(essai("const attendre = (ms) => new Promise((r) => setTimeout(r, ms));\n")).toBe(0);
    expect(essai("  await attendre(900);\n")).toBe(1);
    expect(essai("  await new Promise((r) => setTimeout(r, 500));\n")).toBe(1);
    expect(essai("  // VOULU : le rythme d'un doigt\n  await attendre(18);\n")).toBe(0);
    expect(essai("    await attendre(200);   // le pas d'une attente d'état\n")).toBe(0);
  });
});
