//
// Chantier 51 — le décompte à zéro éteint la barre, PAR TOUS LES CHEMINS.
//
// ══ LE DÉFAUT ══════════════════════════════════════════════════════════════
//
//   −15 −15 −15 jusqu'à zéro   →  la barre DISPARAÎT        ✅
//   le décompte y arrive seul  →  la barre RESTE, figée     ❌
//
// L'extinction était branchée sur le GESTE d'ajustement, pas sur l'ÉTAT « le
// décompte est à zéro ». Même maladie que le fantôme au 39, le volume au 40,
// `derniereSaisie` au 46 et `cibleArmable` au 47 : une règle appliquée à un
// endroit sur deux (CADRAGE-V2 §2 undecies).
//
// ══ LA CONFIGURATION DISCRIMINANTE (§2 quater) ═════════════════════════════
//
// ⚠️ LES DEUX CHEMINS DANS LE MÊME TEST. Sur le chemin du « −15 » SEUL,
// « éteint sur l'état » et « éteint sur le geste » donnent exactement le même
// écran — c'est précisément ce qui a laissé passer le défaut, et ce qu'un test
// par chemin ne montrerait toujours pas. Ils sont donc appariés : une seule
// règle, ou aucune.
//
// ⚠️ ET ON MESURE L'EXISTENCE DE LA BARRE, PAS SON CONTENU. Lire `#repos`
// entier ne prouve rien : l'étiquette « cible 0:15 » y reste affichée quoi
// qu'il arrive — piège trouvé au chantier 49. Ici c'est `noeud.hidden` et
// `chrono`, les deux seules choses qui disent si la barre est à l'écran.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const Seance = require('../../v2/js/seance.js');
const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');

function extraire(nom) {
  const re = new RegExp('^  function ' + nom + '\\b[\\s\\S]*?^  }', 'm');
  const m = APP.match(re);
  if (!m) throw new Error('introuvable dans v2/js/app.js : ' + nom);
  return m[0];
}

// Le bac exécute la VRAIE chaîne : `demarrerChrono` arme, `rendreChrono` décide
// à chaque seconde, `ajusterRepos` ajuste. Rien de la règle n'est simulé — s'il
// fallait la reproduire ici pour que le test passe, c'est qu'elle ne serait pas
// dans le code.
function bac(cible) {
  const noeud = { hidden: false };
  const journal = { ecoule: 0, arrets: 0, relances: 0, dessins: 0, bips: 0 };
  const ctx = {
    Seance: Seance,
    Date: Date,
    chrono: null,
    sourdine: false,
    $: () => noeud,
    Rendu: { rendreRepos: (n, v) => { journal.dessins++; journal.derniere = v; } },
    secondesDeRepos: () => journal.ecoule,
    arreterMinuteur: () => { journal.arrets++; },
    assurerMinuteur: () => { journal.relances++; },
    signalerEcheance: () => { journal.bips++; },
    mesurerBarres: () => {},
    basculerSourdine: () => {},
    reveillerAudio: () => {}
  };
  vm.createContext(ctx);
  ['eteindreChrono', 'rendreChrono', 'appliquerCible', 'ajusterRepos', 'demarrerChrono']
    .forEach((n) => vm.runInContext(extraire(n), ctx));
  ctx.__c = cible;
  vm.runInContext('demarrerChrono(__c, 0, "squat-barre")', ctx);
  return {
    journal,
    noeud,
    ctx,
    // Ce que fait le `setInterval` : une seconde passe, on redessine.
    tic: (n) => {
      for (let k = 0; k < (n || 1); k++) {
        journal.ecoule += 1;
        vm.runInContext('rendreChrono()', ctx);
      }
    },
    moins: (n) => {
      for (let k = 0; k < (n || 1); k++) vm.runInContext('ajusterRepos(-Seance.PAS_REPOS)', ctx);
    },
    plus: (n) => {
      for (let k = 0; k < (n || 1); k++) vm.runInContext('ajusterRepos(Seance.PAS_REPOS)', ctx);
    },
    // Valider une série : c'est le seul geste qui arme. L'écoulé repart de zéro,
    // comme le `depuis: Date.now()` de `demarrerChrono`.
    armer: (c) => {
      journal.ecoule = 0;
      ctx.__c2 = c;
      vm.runInContext('demarrerChrono(__c2, 0, "squat-barre")', ctx);
    },
    // « La barre est-elle à l'écran ? » — la seule question du chantier.
    barre: () => ctx.chrono !== null && noeud.hidden === false
  };
}

// ════════════════════════════════════════════════════════════════════════════
// LES DEUX CHEMINS, APPARIÉS
// ════════════════════════════════════════════════════════════════════════════

describe('une seule règle — le décompte à zéro éteint la barre', () => {
  // ⚠️ LE TEST DU CHANTIER. Les deux chemins, côte à côte, même assertion. Une
  // règle branchée sur le geste fait tomber le premier ; une règle branchée sur
  // l'état les passe tous les deux ; AUCUNE règle les fait tomber tous les deux.
  test('les deux chemins vers zéro éteignent, et de la même façon', () => {
    // Chemin A — il y arrive SEUL. C'est celui qui était cassé.
    const seul = bac(45);
    seul.tic(44);
    expect(seul.barre()).toBe(true);        // à 0:01, elle est encore là
    seul.tic(1);                            // 45ᵉ seconde : il ne reste rien
    expect(seul.barre()).toBe(false);

    // Chemin B — on l'y pousse. C'était déjà corrigé au chantier 49.
    const pousse = bac(45);
    pousse.moins(3);                        // 45 → 30 → 15 → 0
    expect(pousse.barre()).toBe(false);

    // Et la MÊME sortie : ni objet, ni barre à l'écran.
    expect(seul.ctx.chrono).toBe(null);
    expect(pousse.ctx.chrono).toBe(null);
    expect(seul.noeud.hidden).toBe(true);
    expect(pousse.noeud.hidden).toBe(true);
  });

  // ⚠️ CIBLE NON MULTIPLE DE 15 sur le chemin du geste (§2 quater, ch. 49) : à
  // 45 s, trois −15 tombent pile ; à 50, le quatrième passerait sous zéro. Les
  // deux doivent éteindre — borner et refuser ne sont pas la même chose.
  test('depuis 50 s aussi, par les deux chemins', () => {
    const seul = bac(50);
    seul.tic(50);
    expect(seul.barre()).toBe(false);

    const pousse = bac(50);
    pousse.moins(4);                        // 50 → 35 → 20 → 5 → 0
    expect(pousse.barre()).toBe(false);
  });

  // L'extinction n'est pas qu'un objet mis à null : le minuteur DOIT s'arrêter,
  // sinon `setInterval` rebâtit un chronomètre absent une fois par seconde.
  test('et les deux arrêtent le minuteur', () => {
    const seul = bac(20);
    const avantSeul = seul.journal.arrets;
    seul.tic(20);
    expect(seul.journal.arrets).toBe(avantSeul + 1);

    const pousse = bac(20);
    const avantPousse = pousse.journal.arrets;
    pousse.moins(2);
    expect(pousse.journal.arrets).toBe(avantPousse + 1);
  });

  // ⚠️ L'ORDRE : le repos qui se termine s'ANNONCE, puis la barre s'en va.
  // Éteindre avant de sonner avalerait le bip du dernier passage — celui,
  // justement, qui dit que c'est fini.
  test('arrivé seul, il sonne AVANT de s’éteindre', () => {
    const b = bac(20);
    expect(b.journal.bips).toBe(0);
    b.tic(20);
    expect(b.journal.bips).toBe(1);
    expect(b.barre()).toBe(false);
  });

  // Et couper son repos à la main ne sonne pas : quelqu'un qui appuie sur −15
  // n'a pas besoin qu'on lui annonce ce qu'il vient de décider.
  test('poussé à zéro, il ne sonne pas', () => {
    const b = bac(20);
    b.moins(2);
    expect(b.journal.bips).toBe(0);
    expect(b.barre()).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CE QUE ÇA NE REMET PAS EN CAUSE
// ════════════════════════════════════════════════════════════════════════════

describe('avant zéro, rien ne change', () => {
  test('le décompte tourne, et la barre reste', () => {
    const b = bac(60);
    b.tic(30);
    expect(b.barre()).toBe(true);
    expect(b.journal.derniere.restant).toBe(30);
    expect(b.journal.relances).toBeGreaterThan(0);
    expect(b.journal.arrets).toBe(1);        // le seul de `demarrerChrono`
  });

  // §5.5 du prompt — un +15 avant zéro : le décompte repart, la barre reste.
  test('un +15 près de zéro fait repartir le décompte', () => {
    const b = bac(20);
    b.tic(18);                               // il reste 2 s
    expect(b.journal.derniere.restant).toBe(2);
    b.plus(2);                               // 20 → 50
    expect(b.barre()).toBe(true);
    expect(b.journal.derniere.restant).toBe(32);
    b.tic(10);
    expect(b.barre()).toBe(true);
    expect(b.journal.derniere.restant).toBe(22);
  });

  // ⚠️ NON-RÉGRESSION DU CHANTIER 45, et c'est la distinction du §7 unvicies :
  // `cibleArmable` décide de l'ARMEMENT, jamais de l'extinction. Un repos
  // JAMAIS PRESCRIT n'arme aucun chronomètre — ce n'est pas la même chose qu'un
  // repos arrivé à son terme.
  test('un repos jamais prescrit (NULL) n’arme toujours rien', () => {
    [null, undefined, 0].forEach((cible) => {
      const b = bac(cible);
      expect(b.ctx.chrono).toBe(null);
      expect(b.noeud.hidden).toBe(true);
      expect(b.journal.dessins).toBe(0);
      b.tic(5);
      expect(b.ctx.chrono).toBe(null);       // et le temps ne le fait pas naître
    });
  });

  // Le contre-cas, sans lequel le précédent passerait avec un armement cassé.
  test('…mais un repos prescrit, lui, arme bien', () => {
    const b = bac(90);
    expect(b.ctx.chrono).not.toBe(null);
    expect(b.barre()).toBe(true);
    expect(b.journal.derniere.restant).toBe(90);
  });

  // ⚠️ TROUVÉ PAR LA CAMPAGNE DE MUTATIONS, ET C'ÉTAIT LE SEUL SURVIVANT.
  //
  // Éteindre CACHE le nœud ; plus rien ne le remontre si `rendreChrono` ne le
  // révèle pas à chaque passage vivant. Retirer `noeud.hidden = false` donne donc
  // une app où le PREMIER repos s'affiche normalement, s'éteint normalement — et
  // où plus JAMAIS aucune barre ne revient de la séance. Invisible sur un seul
  // repos, ce qui est exactement pourquoi il fallait en enchaîner deux.
  //
  // C'est la sortie de l'extinction, et une extinction dont on ne revient pas
  // est pire que le défaut qu'on répare.
  test('après une extinction, valider réarme une barre VISIBLE', () => {
    const b = bac(20);
    b.tic(20);
    expect(b.barre()).toBe(false);
    expect(b.noeud.hidden).toBe(true);
    b.armer(60);                             // la série suivante
    expect(b.barre()).toBe(true);
    expect(b.noeud.hidden).toBe(false);
    expect(b.journal.derniere.restant).toBe(60);
    // Et le repos suivant se comporte comme le premier : il descend, puis part.
    b.tic(60);
    expect(b.barre()).toBe(false);
  });
});
