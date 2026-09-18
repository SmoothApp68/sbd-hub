//
// Chantier 50 §2 — la molette retarge le décompte en cours (§7 quatervicies.2).
//
// ══ LE DÉFAUT, TEL QU'IL A ÉTÉ CONSTATÉ ════════════════════════════════════
//
//   on se repose · on ouvre la molette sous le nom de l'exercice · on passe le
//   repos de 1:30 à 3:00 · la barre ne bouge pas
//
// Parce que le chronomètre avait COPIÉ sa cible à l'armement et que plus
// personne ne la relisait : `repos_cible_s` n'était lu que par
// `demarrerChrono`, à la validation SUIVANTE.
//
// ══ CE QU'ON ÉPINGLE, ET DANS QUEL ORDRE ═══════════════════════════════════
//
//   §A · le fil lui-même — la molette change le décompte en cours ;
//   §B · la GARDE, qui est la moitié risquée : seulement si ce décompte a été
//        armé par CET exercice. Sans elle, régler le repos de B retargerait le
//        repos lancé par A — pire que le trou qu'on bouche ;
//   §C · le sens unique — « −15 » ne touche toujours pas la consigne
//        (non-régression du §7 tervicies) ;
//   §D · le branchement, exécuté : la feuille relit la valeur POSÉE, pas celle
//        qu'on lui a passée.
//
// vm-extraction de la source réelle, comme au chantier 49 : ces fonctions
// vivent dans l'IIFE de `app.js` et rien ne les exporte.

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

// Une séance à DEUX exercices, et c'est la configuration discriminante : avec
// un seul, « il retarge le bon » et « il retarge n'importe lequel » rendent
// exactement le même résultat.
const SEANCE = () => ({
  exercices: [
    { exercise_slug: 'squat-barre', repos_cible_s: 90, series: [] },
    { exercise_slug: 'developpe-couche', repos_cible_s: 180, series: [] }
  ]
});

function bac(options) {
  const o = options || {};
  const journal = { arrets: 0, rendus: 0, audio: 0 };
  const ctx = {
    Seance: Seance,
    Date: Date,
    seance: o.seance || SEANCE(),
    chrono: null,
    secondesDeRepos: () => o.ecoule || 0,
    arreterMinuteur: () => { journal.arrets++; },
    rendreChrono: () => { journal.rendus++; },
    reveillerAudio: () => { journal.audio++; }
  };
  vm.createContext(ctx);
  ['eteindreChrono', 'appliquerCible', 'chronoDeCetExo', 'retargeterChrono',
   'ajusterRepos', 'demarrerChrono'].forEach((n) => vm.runInContext(extraire(n), ctx));
  return {
    journal,
    ctx,
    // Armer comme le fait `validerSerie` : la cible de l'exercice, son indice,
    // son slug.
    armer: (i) => {
      ctx.__i = i;
      vm.runInContext(
        'demarrerChrono(seance.exercices[__i].repos_cible_s, __i, seance.exercices[__i].exercise_slug)',
        ctx);
    },
    // Poser un repos comme le fait la feuille : on écrit, puis on relit.
    molette: (i, v) => {
      ctx.__i = i; ctx.__v = v;
      vm.runInContext('seance = Seance.definirReposCible(seance, __i, __v)', ctx);
      vm.runInContext('retargeterChrono(__i, seance.exercices[__i].repos_cible_s)', ctx);
    },
    chrono: () => ctx.chrono,
    exo: (i) => ctx.seance.exercices[i]
  };
}

// ════════════════════════════════════════════════════════════════════════════
// §A — LE FIL
// ════════════════════════════════════════════════════════════════════════════

describe('§A — régler le repos change le décompte qui court', () => {
  test('1:30 → 3:00 pendant le repos : la barre suit', () => {
    const b = bac({ ecoule: 20 });
    b.armer(0);
    expect(b.chrono().cible).toBe(90);
    b.molette(0, 180);
    expect(b.chrono().cible).toBe(180);
    expect(b.exo(0).repos_cible_s).toBe(180);      // la consigne aussi
  });

  // Raccourcir marche dans l'autre sens, et la conséquence du §7 tervicies
  // suit : si la nouvelle cible est DERRIÈRE l'écoulé, le décompte est à zéro.
  test('3:00 → 0:05 alors qu’on est à 20 s : il ne reste rien', () => {
    const b = bac({ ecoule: 20 });
    b.armer(1);
    b.molette(1, 5);
    expect(b.chrono().cible).toBe(5);
    expect(Seance.secondesRestantes(b.chrono().cible, 20)).toBe(0);
  });

  // Repousser la cible AU-DELÀ de l'écoulé réarme l'échéance — la même règle
  // que « +15 », et c'est le point d'avoir une seule `appliquerCible`.
  test('repousser la cible réarme la sonnerie', () => {
    const b = bac({ ecoule: 100 });
    b.armer(0);                                     // cible 90, écoulé 100 → dépassé
    b.chrono().sonne = true;
    b.molette(0, 180);
    expect(b.chrono().sonne).toBe(false);
  });

  // Désactiver le repos pendant qu'il court, c'est dire « pas de repos ici ».
  // La barre s'en va, exactement comme le −15 arrivé à zéro (§7 tervicies).
  test('désactiver le repos éteint le chronomètre', () => {
    const b = bac({ ecoule: 20 });
    b.armer(0);
    const arrets = b.journal.arrets;
    b.molette(0, null);
    expect(b.chrono()).toBe(null);
    expect(b.journal.arrets).toBe(arrets + 1);
    expect(b.exo(0).repos_cible_s).toBe(null);
  });

  // ⚠️ UNE VALEUR REFUSÉE NE DOIT RIEN BOUGER NON PLUS. `definirReposCible`
  // écarte tout ce qui sort de [5, 1800] et rend la séance INCHANGÉE. Retarger
  // sur la valeur demandée ferait bouger la barre pendant que la consigne, elle,
  // n'aurait pas bougé — les deux se remettraient à dire deux choses.
  test('une valeur hors bornes ne bouge ni la consigne ni la barre', () => {
    const b = bac({ ecoule: 10 });
    b.armer(0);
    b.molette(0, 4);                                // sous REPOS_CIBLE_MIN
    expect(b.exo(0).repos_cible_s).toBe(90);
    expect(b.chrono().cible).toBe(90);
    b.molette(0, 1801);                             // au-dessus de REPOS_CIBLE_MAX
    expect(b.chrono().cible).toBe(90);
  });

  // Sans repos en cours, la molette règle la consigne et rien d'autre : elle ne
  // doit surtout pas FABRIQUER un chronomètre. C'est `demarrerChrono`, et lui
  // seul, qui arme (non-régression du chantier 45).
  test('sans décompte en cours, elle ne fabrique aucun chronomètre', () => {
    const b = bac();
    b.molette(0, 180);
    expect(b.chrono()).toBe(null);
    expect(b.exo(0).repos_cible_s).toBe(180);
    expect(b.journal.rendus).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §B — LA GARDE : SEULEMENT LE DÉCOMPTE DE CET EXERCICE
// ════════════════════════════════════════════════════════════════════════════

describe('§B — il ne retarge que le repos qu’il a lui-même lancé', () => {
  // ⚠️ LA CONFIGURATION DISCRIMINANTE DU §2 QUATER. Le repos court sur
  // l'exercice 0 ; on règle l'exercice 1. Avec un seul exercice au banc, la
  // garde et son absence rendent le même écran.
  test('régler l’exercice B ne touche pas le repos lancé par A', () => {
    const b = bac({ ecoule: 20 });
    b.armer(0);
    b.molette(1, 300);
    expect(b.chrono().cible).toBe(90);              // intact
    expect(b.exo(1).repos_cible_s).toBe(300);       // la consigne de B, elle, est posée
  });

  test('et désactiver B n’éteint pas le repos de A', () => {
    const b = bac({ ecoule: 20 });
    b.armer(0);
    b.molette(1, null);
    expect(b.chrono()).not.toBe(null);
    expect(b.chrono().cible).toBe(90);
  });

  // ⚠️ LA MOITIÉ QUI ÉCHOUE FERMÉ. La séance n'a aucun identifiant par
  // exercice : l'indice bouge à la réorganisation, et le slug ne distingue pas
  // deux fois le même exercice. L'identité est donc le COUPLE — et dès que les
  // deux divergent, on ne retarge RIEN plutôt que de retarger au hasard.
  test('après une réorganisation, il ne retarge plus — il se tait', () => {
    const b = bac({ ecoule: 20 });
    b.armer(0);
    // L'exercice 0 n'est plus le même : les deux ont permuté.
    b.ctx.seance = {
      exercices: [b.ctx.seance.exercices[1], b.ctx.seance.exercices[0]]
    };
    b.molette(0, 300);
    expect(b.chrono().cible).toBe(90);              // pas touché
  });

  test('`chronoDeCetExo` répond non sur un indice qui n’existe plus', () => {
    const b = bac({ ecoule: 20 });
    b.armer(0);
    b.ctx.__i = 7;
    expect(vm.runInContext('chronoDeCetExo(__i)', b.ctx)).toBe(false);
    b.ctx.__i = 0;
    expect(vm.runInContext('chronoDeCetExo(__i)', b.ctx)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §C — LE SENS EST UNIQUE (non-régression du §7 tervicies)
// ════════════════════════════════════════════════════════════════════════════

describe('§C — « −15 » ne touche toujours pas la consigne', () => {
  test('la barre raccourcit le décompte, la routine ne bouge pas', () => {
    const b = bac({ ecoule: 10 });
    b.armer(0);
    vm.runInContext('ajusterRepos(-Seance.PAS_REPOS)', b.ctx);
    expect(b.chrono().cible).toBe(75);
    expect(b.exo(0).repos_cible_s).toBe(90);        // la consigne, intacte
  });

  test('et même à zéro, quand la barre s’en va', () => {
    const b = bac({ ecoule: 10 });
    b.armer(0);
    for (let i = 0; i < 6; i++) vm.runInContext('ajusterRepos(-Seance.PAS_REPOS)', b.ctx);
    expect(b.chrono()).toBe(null);
    expect(b.exo(0).repos_cible_s).toBe(90);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §D — LE BRANCHEMENT DE LA FEUILLE, EXÉCUTÉ
// ════════════════════════════════════════════════════════════════════════════
//
// `poserRepos` vit dans `rendreFeuille`. On extrait sa déclaration et on
// l'EXÉCUTE : ce n'est pas un grep, on appelle la fonction réelle et on regarde
// ce qu'elle fait. C'est elle qui porte le point délicat — relire la valeur
// POSÉE plutôt que celle qu'on lui a passée.

describe('§D — la feuille relit la valeur posée, pas celle demandée', () => {
  function bacFeuille(demande) {
    const re = /^      var poserRepos = function \(v\) \{[\s\S]*?^      \};/m;
    const m = APP.match(re);
    if (!m) throw new Error('`poserRepos` introuvable dans v2/js/app.js');
    const vus = [];
    const ctx = {
      Seance: Seance,
      seance: SEANCE(),
      feuille: { iExo: 0 },
      retargeterChrono: (i, cible) => vus.push({ i, cible }),
      apresGeste: () => {},
      fermerVoile: () => {}
    };
    vm.createContext(ctx);
    vm.runInContext(m[0], ctx);
    ctx.__v = demande;
    vm.runInContext('poserRepos(__v)', ctx);
    return { vus, ctx };
  }

  test('valeur acceptée → elle retarge avec elle', () => {
    const b = bacFeuille(180);
    expect(b.vus).toEqual([{ i: 0, cible: 180 }]);
  });

  // LE cas : 4 s est refusé par `definirReposCible`, qui rend la séance
  // inchangée. Retarger sur `v` porterait la barre à 4 s pendant que la
  // consigne resterait à 90.
  test('valeur REFUSÉE → elle retarge avec l’ancienne, pas avec la demandée', () => {
    const b = bacFeuille(4);
    expect(b.vus).toEqual([{ i: 0, cible: 90 }]);
    expect(b.ctx.seance.exercices[0].repos_cible_s).toBe(90);
  });

  test('désactiver → elle retarge avec `null`', () => {
    const b = bacFeuille(null);
    expect(b.vus).toEqual([{ i: 0, cible: null }]);
  });
});
