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
    largeur: n.querySelector('.piste i').style.width
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

  // ⚠️ LA DERNIÈRE IMAGE DESSINÉE EST 0:01, ET C'EST LE CHANTIER 51. Le 0:00
  // n'est plus une image : `rendreChrono` éteint la barre avant de la dessiner
  // (voir plus bas). Ce qu'on épingle ici est donc l'AVANT-DERNIÈRE seconde,
  // seule fin de course que l'écran voie encore.
  test('la dernière image dessinée est 0:01', () => {
    expect(barre(180, Seance.secondesRestantes(180, 179)).grand).toBe('0:01');
  });

  // §7 ter.3 — il informe, il ne commande pas. Un « −3:40 » qui grossit est un
  // reproche, et c'est exactement ce qu'un rebours naïf produirait. La fonction
  // ne le produit pas, même si plus personne ne lui demande de dessiner ce cas.
  test('trois minutes après l’échéance, il ne reste toujours rien', () => {
    expect(Seance.secondesRestantes(180, 360)).toBe(0);
    expect(Seance.secondesRestantes(180, 100000)).toBe(0);
  });

  // L'étiquette garde son sens, et elle en gagne : le grand nombre ne dit plus
  // QUELLE est la cible une fois lancé. C'est elle que −15/+15 règlent.
  test('la cible reste écrite à côté — le rebours ne la dit plus', () => {
    expect(barre(180, 140).etiquette).toBe('cible 3:00');
  });
});

// ══ CE QUE LA CAMPAGNE DE MUTATIONS A TROUVÉ (N1, N8) ═════════════════
//
// Deux lignes du chantier survivaient à leur mutant : la garde « sans cible » de
// `secondesRestantes`, et le FIL entre la fonction et l'écran. La première ne se
// distingue que sur un écoulé NÉGATIF ; le second ne se voyait qu'au banc.

describe('§1 — `secondesRestantes` répond pour toute entrée', () => {
  // ⚠️ LA CONFIGURATION QUI SÉPARE : un écoulé NÉGATIF sur une cible absente.
  // Partout ailleurs, `s >= c ? 0 : c - s` rend déjà zéro quand la cible est
  // nulle — la garde paraît donc redondante, et un nettoyage l'emporterait.
  // Ici elle est seule à empêcher `0 − (−5) = 5` : un chronomètre SANS cible
  // afficherait un nombre qui monte, ce que le chantier 45 a fermé.
  test('sans cible, même un écoulé négatif ne fabrique pas de temps', () => {
    expect(Seance.secondesRestantes(0, -5)).toBe(0);
    expect(Seance.secondesRestantes(null, -1)).toBe(0);
    expect(Seance.secondesRestantes(undefined, -3600)).toBe(0);
  });

  test('et une entrée illisible ne rend jamais NaN', () => {
    expect(Seance.secondesRestantes('abc', 10)).toBe(0);
    expect(Seance.secondesRestantes(180, 'abc')).toBe(180);
  });
});

// ⚠️ LE FIL ENTRE LA FONCTION ET L'ÉCRAN, EXÉCUTÉ. `secondesRestantes` juste et
// une barre qui affiche autre chose, c'est le défaut même qu'on répare — et
// `restant: secondes` (le chronomètre montant, remis en place) passait TOUS les
// tests ci-dessus. On extrait donc `rendreChrono` de la source réelle et on
// regarde ce qu'il passe à `Rendu.rendreRepos`.
describe('§1 — `rendreChrono` passe le RESTANT au rendu, pas l’écoulé', () => {
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');

  function vueRendue(cible, ecoule) {
    const re = /^  function rendreChrono\(\)[\s\S]*?^  }/m;
    const m = APP.match(re);
    if (!m) throw new Error('`rendreChrono` introuvable dans v2/js/app.js');
    let vue = null;
    const eteintes = [];
    const ctx = {
      Seance: Seance,
      Rendu: { rendreRepos: (n, v) => { vue = v; } },
      $: () => ({ hidden: false }),
      chrono: { depuis: 0, cible: cible, sonne: false, exo: { i: 0, slug: 'squat-barre' } },
      sourdine: false,
      secondesDeRepos: () => ecoule,
      signalerEcheance: () => {},
      arreterMinuteur: () => {},
      assurerMinuteur: () => {},
      mesurerBarres: () => {},
      // 78 — la question de réserve de la carte de repos : hors de ce test.
      vueDeLaQuestion: () => null, questionDuRepos: () => null,
      ajusterRepos: () => {},
      basculerSourdine: () => {},
      eteindreChrono: () => { eteintes.push(true); }
    };
    vm.createContext(ctx);
    vm.runInContext(m[0], ctx);
    vm.runInContext('rendreChrono()', ctx);
    return { vue: vue, eteint: eteintes.length > 0 };
  }

  // À 0:40 sous une cible de 3:00 : le restant vaut 140, l'écoulé 40. Un
  // chronomètre montant passerait 40.
  test('il passe 140 — pas 40', () => {
    expect(vueRendue(180, 40).vue.restant).toBe(140);
  });

  test('à l’armement il passe la cible entière', () => {
    expect(vueRendue(180, 0).vue.restant).toBe(180);
  });

  // ⚠️ LE CHANTIER 51, VU D'ICI : à l'échéance il ne DESSINE plus rien, il
  // éteint. Le 0:00 n'est jamais une image, et c'est pour ça que la barre s'en va
  // toute seule sans qu'on ait touché à quoi que ce soit.
  test('à l’échéance il n’envoie rien au rendu — il éteint', () => {
    const r = vueRendue(180, 180);
    expect(r.eteint).toBe(true);
    expect(r.vue).toBe(null);
  });

  test('et une seconde avant, il dessine encore', () => {
    const r = vueRendue(180, 179);
    expect(r.eteint).toBe(false);
    expect(r.vue.restant).toBe(1);
  });

  // La cible part à côté du restant : c'est elle que − 15/+15 règlent, et le
  // grand nombre ne la dit plus.
  test('et la cible continue de partir à côté', () => {
    expect(vueRendue(180, 40).vue.cible).toBe(180);
  });
});

describe('§1 — la piste se vide', () => {
  // ⚠️ LE SENS, PAS SEULEMENT LA VALEUR. Une piste qui se remplit sous un
  // nombre qui descend raconte deux histoires sur le même écran. On mesure
  // donc que la largeur DÉCROÎT quand le temps passe.
  test('pleine à l’armement, presque vide à la dernière image', () => {
    expect(barre(180, Seance.secondesRestantes(180, 0)).largeur).toBe('100%');
    expect(barre(180, Seance.secondesRestantes(180, 179)).largeur).toBe('1%');
  });

  test('et elle décroît, elle ne croît pas', () => {
    const largeurs = [0, 45, 90, 135, 179]
      .map((s) => parseInt(barre(180, Seance.secondesRestantes(180, s)).largeur, 10));
    expect(largeurs).toEqual([100, 75, 50, 25, 1]);
    for (let i = 1; i < largeurs.length; i++) {
      expect(largeurs[i]).toBeLessThan(largeurs[i - 1]);
    }
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
