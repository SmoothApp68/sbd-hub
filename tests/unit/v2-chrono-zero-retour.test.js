//
// Chantier 49 — le chronomètre à zéro, et le bouton qui nomme sa destination.
//
// ══ CE QUE CE FICHIER TIENT ════════════════════════════════════════════════
//
//   §1 · `ajusterRepos` ÉTEINT à zéro (§7 tervicies) — la barre s'en va, elle
//        ne se fige pas sur une cible nulle, et elle ne refuse pas de descendre ;
//   §2 · `afficherSemaine(lundi, true)` REMPLACE au lieu d'empiler — le
//        mécanisme derrière « ← Séances » (§7 tervicies.2) ;
//   §3 · la garde de `modifierSeance`, devenue inatteignable depuis l'écran,
//        épinglée pour qu'un nettoyage ne l'emporte pas (§3.2 du prompt).
//
// ══ POURQUOI DU vm, ET PAS UN GREP ═════════════════════════════════════════
//
// Ces trois fonctions vivent DANS l'IIFE de `v2/js/app.js` : rien ne les
// exporte, et charger `app.js` en entier demanderait Supabase, l'auth et tout
// le DOM. On EXTRAIT donc la source réelle et on l'EXÉCUTE dans un bac à sable
// dont on fournit les voisines — c'est l'infrastructure des tests v1
// (`app-version.test.js`, `autoreg-apply.test.js`), et c'est la différence
// entre prouver un comportement et vérifier une orthographe.
//
// ⚠️ LE SEUL PIÈGE : le texte extrait est la VRAIE source. Si quelqu'un renomme
// une voisine sans toucher au bac à sable, le test tombe avec un `ReferenceError`
// — c'est bruyant, et c'est voulu : une garde qu'on ne peut plus construire
// n'est plus une garde.
//
// `THSeance` est le VRAI module, pas un double : `reposEcoule` et `ajusterCible`
// sont exactement l'arithmétique bornée du §7 tervicies.1.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const Seance = require('../../v2/js/seance.js');
const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');

// Les fonctions de `app.js` sont indentées de deux espaces (elles sont dans
// l'IIFE) : l'accolade fermante à extraire est donc `^  }`, pas `^}`.
function extraire(nom) {
  const re = new RegExp('^  function ' + nom + '\\b[\\s\\S]*?^  }', 'm');
  const m = APP.match(re);
  if (!m) throw new Error('introuvable dans v2/js/app.js : ' + nom);
  return m[0];
}

// ════════════════════════════════════════════════════════════════════════════
// §1 — LE REPOS EN COURS S'ÉTEINT À ZÉRO
// ════════════════════════════════════════════════════════════════════════════

function bacChrono(cible) {
  const journal = { arrets: 0, rendus: 0, ecoule: 0 };
  const ctx = {
    Seance: Seance,
    chrono: cible === null ? null : { depuis: 0, cible: cible, sonne: false },
    // Le temps écoulé est FIXE : ce qui est testé est la décision, pas l'horloge.
    secondesDeRepos: () => journal.ecoule,
    arreterMinuteur: () => { journal.arrets++; },
    rendreChrono: () => { journal.rendus++; }
  };
  vm.createContext(ctx);
  // ⚠️ `appliquerCible` S'EST AJOUTÉE AU CHANTIER 50, et ce bac est tombé avec
  // un `ReferenceError` dès qu'`ajusterRepos` a délégué sa règle. C'est ce que
  // l'en-tête annonçait : le texte extrait est la VRAIE source, donc une
  // voisine renommée ou déplacée fait tomber le test bruyamment. Une garde
  // qu'on ne peut plus construire n'est plus une garde.
  vm.runInContext(extraire('eteindreChrono'), ctx);
  vm.runInContext(extraire('appliquerCible'), ctx);
  vm.runInContext(extraire('ajusterRepos'), ctx);
  return {
    journal,
    ctx,
    moins: () => vm.runInContext('ajusterRepos(-Seance.PAS_REPOS)', ctx),
    plus: () => vm.runInContext('ajusterRepos(Seance.PAS_REPOS)', ctx),
    chrono: () => ctx.chrono
  };
}

describe('§1 — quatre « −15 » pendant un repos veulent dire « arrête-toi »', () => {
  // ⚠️ CONFIGURATION DISCRIMINANTE (§2 quater) : 50 s, PAS 60. À 60, le
  // quatrième −15 tombe pile sur zéro, et « borner à zéro » comme « refuser de
  // descendre » rendent le même nombre : le test passerait avec le défaut du
  // 47 en place. À 50, le quatrième passerait SOUS zéro — c'est là, et
  // seulement là, que les deux règles se séparent.
  test('depuis 50 s, le quatrième −15 éteint le chronomètre', () => {
    const b = bacChrono(50);
    b.moins(); expect(b.chrono().cible).toBe(35);
    b.moins(); expect(b.chrono().cible).toBe(20);
    b.moins(); expect(b.chrono().cible).toBe(5);
    // Ici le refus du 47 aurait laissé `cible === 5` et un chronomètre vivant.
    b.moins();
    expect(b.chrono()).toBe(null);
  });

  // L'extinction n'est pas qu'un objet mis à null : le minuteur DOIT être
  // arrêté, sinon `setInterval` rend un chronomètre absent une fois par
  // seconde, pour toujours. Et l'écran doit être re-rendu, sinon la barre
  // reste à l'image.
  test('et l’extinction arrête le minuteur ET redessine', () => {
    const b = bacChrono(15);
    const avant = b.journal.arrets;
    b.moins();
    expect(b.chrono()).toBe(null);
    expect(b.journal.arrets).toBe(avant + 1);
    expect(b.journal.rendus).toBeGreaterThan(0);
  });

  // Tant qu'il reste quelque chose à compter, on ne touche à rien d'autre que
  // la cible : pas d'arrêt, pas d'extinction.
  test('au-dessus de zéro, il raccourcit sans éteindre', () => {
    const b = bacChrono(50);
    b.moins();
    expect(b.chrono()).not.toBe(null);
    expect(b.chrono().cible).toBe(35);
    expect(b.journal.arrets).toBe(0);
  });

  // L'autre sens (§5.3) : repousser la cible AU-DELÀ de l'écoulé réarme
  // l'échéance. Sans ça, un repos raccourci puis rallongé resterait sonné et
  // ne préviendrait plus.
  test('un +15 près de zéro fait repartir le décompte, et réarme la sonnerie', () => {
    const b = bacChrono(20);
    b.journal.ecoule = 18;
    b.ctx.chrono.sonne = true;
    b.moins();                                  // 20 → 5, sous l'écoulé
    expect(b.chrono().cible).toBe(5);
    expect(b.chrono().sonne).toBe(true);        // 5 < 18 : toujours dépassé
    b.plus(); b.plus();                         // 5 → 35, au-delà de 18
    expect(b.chrono().cible).toBe(35);
    expect(b.chrono().sonne).toBe(false);       // échéance neuve, posée à la main
  });

  // NON-RÉGRESSION DU CHANTIER 45 (§5.2) : rien à ajuster quand rien ne court.
  // `ajusterRepos` ne doit surtout pas FABRIQUER un chronomètre — c'est
  // `demarrerChrono`, et lui seul, qui consulte `cibleArmable`.
  test('sans chronomètre en cours, « −15 » ne fabrique rien', () => {
    const b = bacChrono(null);
    b.moins(); b.plus();
    expect(b.chrono()).toBe(null);
    expect(b.journal.rendus).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §2 — « ← SÉANCES » NOMME SA DESTINATION, DONC IL Y VA
// ════════════════════════════════════════════════════════════════════════════
//
// Ce qui est épinglé ici est le MÉCANISME : `afficherSemaine(lundi, true)`
// remplace l'entrée courante au lieu d'en empiler une. Le BRANCHEMENT (quel
// bouton appelle quoi) vit dans `brancher()` et se prouve au banc, sur une page
// NEUVE — `history.length` sature à 50 dans Chrome, et une page réutilisée rend
// toute mesure de profondeur vide de sens (c'est ce qui a rendu vaine
// l'assertion du chantier 47).

function bacSemaine() {
  const Semaine = require('../../v2/js/semaine.js');
  const journal = [];
  const ctx = {
    Semaine: Semaine,
    Routeur: { RACINE: 'racine', SEMAINE: 'semaine' },
    Date: Date,
    lundiAffiche: '2026-07-20',
    allerA: (vue, params, remplacer) => journal.push({ vue, params, remplacer }),
    rendreSemaine: () => {}
  };
  vm.createContext(ctx);
  vm.runInContext(extraire('afficherSemaine'), ctx);
  return { journal, ctx };
}

describe('§2 — la liste des séances se rejoint en remplaçant', () => {
  test('`afficherSemaine(lundi, true)` REMPLACE', () => {
    const b = bacSemaine();
    b.ctx.__l = '2026-07-20';
    vm.runInContext('afficherSemaine(__l, true)', b.ctx);
    expect(b.journal).toHaveLength(1);
    expect(b.journal[0].remplacer).toBe(true);
    expect(b.journal[0].params.lundi).toBe('2026-07-20');
  });

  // La navigation ordinaire — onglet Séances, flèches de semaine, calendrier —
  // continue d'EMPILER : c'est elle qui rend le retour d'Android utile.
  test('sans le drapeau, elle empile comme avant', () => {
    const b = bacSemaine();
    b.ctx.__l = '2026-07-20';
    vm.runInContext('afficherSemaine(__l)', b.ctx);
    vm.runInContext('afficherSemaine(__l, false)', b.ctx);
    expect(b.journal[0].remplacer).toBe(false);
    expect(b.journal[1].remplacer).toBe(false);
  });

  // ⚠️ ET LE BRANCHEMENT LUI-MÊME, EXÉCUTÉ. Le mécanisme ci-dessus ne dit pas
  // QUEL bouton l'emprunte, et c'est précisément là que le chantier 47 s'est
  // trompé : il a donné à un bouton à destination nommée le comportement d'un
  // bouton qui n'en nomme aucune. On extrait donc les DEUX lignes de
  // `brancher()` et on les EXÉCUTE : `$` rend un faux nœud qui retient le
  // gestionnaire, et on le déclenche.
  //
  // Ce n'est pas un grep : on ne cherche pas un motif dans du texte, on APPELLE
  // le gestionnaire réel et on regarde qui il appelle. Un renommage innocent
  // passe ; une inversion des deux boutons tombe. Le banc le prouve aussi, mais
  // il coûte dix-huit minutes par mutant — ici c'est une milliseconde.
  function bacBranchement() {
    const ligne = (id) => {
      const re = new RegExp("^ *\\$\\('" + id + "'\\)\\.addEventListener\\(.*$", 'm');
      const m = APP.match(re);
      if (!m) throw new Error('branchement introuvable : ' + id);
      return m[0];
    };
    const appels = [];
    const poses = {};
    const ctx = {
      $: (id) => ({ addEventListener: (ev, fn) => { poses[id] = { ev, fn }; } }),
      afficherSemaine: (lundi, remplacer) => appels.push({ quoi: 'afficherSemaine', lundi, remplacer }),
      remonter: (repli) => appels.push({ quoi: 'remonter', repli: typeof repli })
    };
    vm.createContext(ctx);
    vm.runInContext(ligne('btn-retour'), ctx);
    vm.runInContext(ligne('btn-retour-exercice'), ctx);
    return { appels, poses };
  }

  test('« ← Séances » NAVIGUE vers la liste, en remplaçant', () => {
    const b = bacBranchement();
    expect(b.poses['btn-retour'].ev).toBe('click');
    b.poses['btn-retour'].fn();
    expect(b.appels).toHaveLength(1);
    expect(b.appels[0].quoi).toBe('afficherSemaine');
    expect(b.appels[0].remplacer).toBe(true);
  });

  test('« ← Retour », lui, REMONTE l’historique — il ne choisit pas', () => {
    const b = bacBranchement();
    b.poses['btn-retour-exercice'].fn();
    expect(b.appels).toHaveLength(1);
    expect(b.appels[0].quoi).toBe('remonter');
    expect(b.appels[0].repli).toBe('function');
  });

  // ⚠️ `remonter` PASSE `afficherSemaine` COMME REPLI, sans argument. Si le
  // drapeau était le PREMIER paramètre, ou s'il était vrai par défaut, le repli
  // de « ← Retour » se mettrait à remplacer en silence. Le défaut serait
  // invisible : même écran, historique différent.
  test('appelée sans argument — le repli de « ← Retour » — elle empile', () => {
    const b = bacSemaine();
    vm.runInContext('afficherSemaine()', b.ctx);
    expect(b.journal[0].remplacer).toBe(false);
    expect(b.journal[0].params.lundi).toBe('2026-07-20');  // la semaine à l'écran
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §3 — LA GARDE INATTEIGNABLE DE `modifierSeance`, ÉPINGLÉE
// ════════════════════════════════════════════════════════════════════════════
//
// ⚠️ CE TEST PORTE SUR UN CHEMIN QUE L'ÉCRAN NE PREND PLUS, ET C'EST VOULU.
// Depuis le chantier 47, la carte et le détail refusent tous deux le geste en
// amont : cette garde-ci ne se déclenche plus jamais depuis l'interface, et la
// campagne de mutations du 47 l'a confirmé — son mutant survit par
// construction. Elle reste quand même, parce qu'elle est la DERNIÈRE avant
// `remplacerSeries`, qui EFFACE en base tout ce qui ne lui est pas passé : une
// troisième surface qui oublierait de demander ne doit pas pouvoir effacer.
//
// C'est exactement le cas du §2 undecies — une garde qui double une garde
// ACTIVE ne protège de rien, mais celle-ci protège un chemin d'ÉCRITURE que
// d'autres appelants pourraient prendre. Sans ce test elle disparaîtrait au
// premier nettoyage, comme la garde de table du chantier 37.

function bacModifier(incompletes) {
  const journal = { reprises: 0, sauves: 0, navigations: 0, rendus: 0, feuille: null, voile: 0 };
  const ctx = {
    Seance: { reprendre: (ligne) => { journal.reprises++; return { id: ligne.id }; } },
    Rendu: { rendreFeuilleConfirmer: (cible, opts) => { journal.feuille = opts; } },
    $: () => ({}),
    ouvrirVoile: () => { journal.voile++; },
    fermerVoile: () => {},
    seanceEnCoursBloque: () => false,
    seriesIncompletes: () => incompletes,
    sauverSeance: () => { journal.sauves++; },
    allerA: () => { journal.navigations++; },
    Routeur: { SAISIE: 'saisie' },
    rendreSeance: () => { journal.rendus++; },
    seance: null,
    chrono: { cible: 90 }
  };
  vm.createContext(ctx);
  vm.runInContext(extraire('modifierSeance'), ctx);
  ctx.__ligne = { id: 's1' };
  ctx.__blocs = [];
  vm.runInContext('modifierSeance(__ligne, __blocs)', ctx);
  return { journal, ctx };
}

describe('§3 — `modifierSeance` refuse une séance dont les séries manquent', () => {
  test('séries incomplètes → AUCUNE réouverture, AUCUNE écriture', () => {
    const b = bacModifier(true);
    expect(b.journal.reprises).toBe(0);      // `Seance.reprendre` jamais appelée
    expect(b.journal.sauves).toBe(0);        // rien n'est sauvé
    expect(b.journal.navigations).toBe(0);   // on ne quitte même pas l'écran
    expect(b.ctx.seance).toBe(null);
  });

  test('…et elle DIT pourquoi, au lieu de ne rien faire', () => {
    const b = bacModifier(true);
    expect(b.journal.voile).toBe(1);
    expect(b.journal.feuille).not.toBe(null);
    expect(b.journal.feuille.titre).toMatch(/pas encore compl/i);
    expect(b.journal.feuille.aide).toMatch(/Réessaie/);
  });

  // Le contre-cas : sans lui, une garde qui refuse TOUT passerait le test
  // précédent. C'est la moitié qui prouve que la garde discrimine.
  test('séries complètes → la séance se rouvre et part en saisie', () => {
    const b = bacModifier(false);
    expect(b.journal.reprises).toBe(1);
    expect(b.journal.sauves).toBe(1);
    expect(b.journal.navigations).toBe(1);
    expect(b.journal.rendus).toBe(1);
    expect(b.journal.voile).toBe(0);
    expect(b.ctx.seance).toEqual({ id: 's1' });
    expect(b.ctx.chrono).toBe(null);          // rouvrir n'hérite pas d'un repos
  });
});
