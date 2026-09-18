//
// Chantier 50 §1 — le chronomètre est un COMPTE À REBOURS (§7 quatervicies).
//
// ══ CE QUE CE FICHIER TIENT ════════════════════════════════════════════════
//
//   · le grand nombre descend de la cible vers 0:00, et ne passe jamais en
//     négatif ;
//   · la piste SE VIDE avec lui — deux signaux, un seul sens ;
//   · l'arrêt du minuteur (`reposFige`) et le zéro affiché tombent au même
//     instant, sans que l'un dérive de l'autre ;
//   · le `−15` du §7 tervicies fait maintenant DESCENDRE le grand nombre, ce
//     qui est tout l'intérêt du changement.
//
// ══ POURQUOI ON EXÉCUTE LE RENDU ═══════════════════════════════════════════
//
// `secondesRestantes` seule ne prouve rien de l'écran : le défaut qu'on répare
// vivait justement entre une fonction juste et une surface qui en affichait
// une autre. On fait donc rendre la vraie barre et on lit le DOM — le grand
// nombre, la largeur de la piste.
//
// Environnement jsdom (PAS de docblock `node`) : `rendu.js` se termine par `this`.

require('../../v2/js/semaine.js');
require('../../v2/js/seance.js');
require('../../v2/js/modele.js');
require('../../v2/js/routines.js');
require('../../v2/js/rendu.js');
const Seance = require('../../v2/js/seance.js');
const R = () => (global.self || global).THRendu;

function barre(cible, restant, extra) {
  const n = document.createElement('div');
  const vue = Object.assign({
    restant: restant,
    fige: Seance.reposFige(cible, cible - restant),
    cible: cible,
    sourdine: false,
    pas: Seance.PAS_REPOS,
    surAjuster: () => {},
    surSourdine: () => {},
    surPasser: () => {}
  }, extra || {});
  R().rendreRepos(n, vue);
  return {
    grand: n.querySelector('.repos-g').textContent,
    etiquette: n.querySelector('.repos-c').textContent,
    largeur: n.querySelector('.piste i').style.width,
    fige: n.querySelector('.repos-g').classList.contains('fige')
  };
}

describe('§1 — le grand nombre descend', () => {
  // ⚠️ LA CONFIGURATION QUI SÉPARE LES DEUX LECTURES : une cible de 3:00 et
  // 0:40 d'écoulé. Un chronomètre montant afficherait 0:40, un rebours 2:20.
  // À mi-parcours exact (1:30 / 1:30) les deux rendraient le même nombre — et
  // le test ne prouverait rien.
  test('à 0:40 sous une cible de 3:00, il affiche 2:20 — pas 0:40', () => {
    const b = barre(180, Seance.secondesRestantes(180, 40));
    expect(b.grand).toBe('2:20');
    expect(b.grand).not.toBe('0:40');
  });

  test('à l’armement il affiche la cible entière', () => {
    expect(barre(180, Seance.secondesRestantes(180, 0)).grand).toBe('3:00');
  });

  test('à l’échéance il affiche 0:00, et le dit figé', () => {
    const b = barre(180, Seance.secondesRestantes(180, 180));
    expect(b.grand).toBe('0:00');
    expect(b.fige).toBe(true);
  });

  // §7 ter.3 — il informe, il ne commande pas. Un « −3:40 » qui grossit est un
  // reproche, et c'est exactement ce qu'un rebours naïf produirait.
  test('trois minutes après l’échéance, toujours 0:00 — jamais de négatif', () => {
    const b = barre(180, Seance.secondesRestantes(180, 360));
    expect(b.grand).toBe('0:00');
    expect(b.grand).not.toMatch(/-|−/);
  });

  // L'étiquette garde son sens, et elle en gagne : le grand nombre ne dit plus
  // QUELLE est la cible une fois lancé. C'est elle que −15/+15 règlent.
  test('la cible reste écrite à côté — le rebours ne la dit plus', () => {
    expect(barre(180, 140).etiquette).toBe('cible 3:00');
  });
});

describe('§1 — la piste se vide', () => {
  // ⚠️ LE SENS, PAS SEULEMENT LA VALEUR. Une piste qui se remplit sous un
  // nombre qui descend raconte deux histoires sur le même écran. On mesure
  // donc que la largeur DÉCROÎT quand le temps passe.
  test('pleine à l’armement, vide à l’échéance', () => {
    expect(barre(180, Seance.secondesRestantes(180, 0)).largeur).toBe('100%');
    expect(barre(180, Seance.secondesRestantes(180, 180)).largeur).toBe('0%');
  });

  test('et elle décroît, elle ne croît pas', () => {
    const largeurs = [0, 45, 90, 135, 180]
      .map((s) => parseInt(barre(180, Seance.secondesRestantes(180, s)).largeur, 10));
    expect(largeurs).toEqual([100, 75, 50, 25, 0]);
    for (let i = 1; i < largeurs.length; i++) {
      expect(largeurs[i]).toBeLessThan(largeurs[i - 1]);
    }
  });

  test('au dépassement elle reste à zéro, jamais négative', () => {
    expect(barre(180, Seance.secondesRestantes(180, 600)).largeur).toBe('0%');
  });
});

describe('§1 — le « −15 » du §7 tervicies fait DESCENDRE le grand nombre', () => {
  // C'est l'argument du changement : avant, le même appui faisait MONTER le
  // grand nombre (l'écoulé ne bougeait pas, mais la cible descendait vers lui,
  // donc l'écran paraissait avancer). Maintenant les deux vont dans le sens du
  // geste.
  test('un −15 pendant un repos retire quinze secondes à ce qui reste', () => {
    const ecoule = 40;
    let cible = 180;
    expect(barre(cible, Seance.secondesRestantes(cible, ecoule)).grand).toBe('2:20');
    cible = Seance.ajusterCible(cible, -Seance.PAS_REPOS);
    expect(barre(cible, Seance.secondesRestantes(cible, ecoule)).grand).toBe('2:05');
    cible = Seance.ajusterCible(cible, Seance.PAS_REPOS);
    expect(barre(cible, Seance.secondesRestantes(cible, ecoule)).grand).toBe('2:20');
  });
});
