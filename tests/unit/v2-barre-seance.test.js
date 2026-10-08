// 62 — LA BARRE DE LA SÉANCE EN COURS (ECRAN-SAISIE §7 octies bis).
//
// Le temps et « Terminer » restent sous les yeux pendant qu'on descend. Du pur
// affichage : ce fichier ne teste NI le moteur NI le plan — la durée, son format,
// son réveil unique, la mesure de la barre, et ce que la barre montre selon le mode.
//
// ══ CE QUI SE VOIT ICI, ET CE QUI NE SE VOIT PAS ═══════════════════════════
//
// jsdom ne fait aucune mise en page : `position: sticky`, la hauteur mesurée, un
// champ qui prend le focus sous la barre ne se constatent QUE dans un vrai navigateur
// (section « barre » du banc d'écran, Chromium). Ici : les règles pures (minutes,
// format, délai), le DOM que la barre produit, la fonction qui le réécrit sur place,
// le réveil (le VRAI code d'`app.js`, extrait, face à des minuteurs de papier) et la
// mesure. Le CSS n'est lu qu'en dernier recours, pour que sticky/opaque/z-index ne
// puissent pas disparaître sans bruit.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
const Seance = require('../../v2/js/seance.js');
const Bilan = require('../../v2/js/bilan.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '../../v2/styles.css'), 'utf8');

const MIN = 60000;
const DEBUT = '2026-10-08T10:00:00.000Z';
const T0 = new Date(DEBUT).getTime();

// ════════════════════════════════════════════════════════════════════════════
// LE FORMAT — « 47 min » sous une heure, « 1 h 12 » au-delà
// ════════════════════════════════════════════════════════════════════════════

describe('le format de la durée', () => {
  test.each([
    [0, '0 min'], [1, '1 min'], [47, '47 min'], [59, '59 min'],
    [60, '1 h 00'], [61, '1 h 01'], [72, '1 h 12'], [125, '2 h 05']
  ])('%i min s’écrit « %s »', (minutes, attendu) => {
    expect(Rendu().libelleDuree(minutes)).toBe(attendu);
  });

  // ⚠️ MUTATION (f) : « 72 min » au lieu de « 1 h 12 ». Au-delà d'une heure, le mot
  // « min » ne doit plus porter un nombre à trois chiffres.
  test('jamais « 72 min » : au-delà d’une heure, la barre passe aux heures', () => {
    [60, 72, 125, 600].forEach((m) => {
      expect(Rendu().libelleDuree(m)).not.toMatch(/\bmin\b/);
      expect(Rendu().libelleDuree(m)).toMatch(/^\d+ h \d\d$/);
    });
  });

  test('c’est le format du bilan du mois, pas un second', () => {
    [0, 5, 59, 60, 130].forEach((m) => expect(Rendu().libelleDuree(m)).toBe(Bilan.texteTemps(m)));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LES MINUTES — recalculées depuis le départ, jamais un compteur
// ════════════════════════════════════════════════════════════════════════════

describe('Seance.minutesEcoulees', () => {
  test('0, 1, 59, 60, 61, 72, 125 minutes après le départ', () => {
    [0, 1, 59, 60, 61, 72, 125].forEach((m) => {
      expect(Seance.minutesEcoulees(DEBUT, T0 + m * MIN)).toBe(m);
    });
  });

  test('une date invalide vaut zéro, jamais « NaN min »', () => {
    ['pas une date', '', null, undefined, {}, NaN].forEach((d) => {
      expect(Seance.minutesEcoulees(d, T0)).toBe(0);
    });
    expect(Seance.minutesEcoulees(DEBUT, NaN)).toBe(0);
    expect(Seance.minutesEcoulees(DEBUT, 'xx')).toBe(0);
  });

  test('un départ dans l’avenir (horloge réglée à la main) vaut zéro, jamais négatif', () => {
    expect(Seance.minutesEcoulees(DEBUT, T0 - 5 * MIN)).toBe(0);
    expect(Seance.minutesEcoulees(DEBUT, T0 - 1)).toBe(0);
  });

  // L'arrondi est celui du bandeau d'avant la barre : le texte « N min » ne change
  // pas d'un octet (le relevé du texte visible n'y voit rien).
  test('arrondi à la minute la plus proche, comme avant la barre', () => {
    expect(Seance.minutesEcoulees(DEBUT, T0 + 29999)).toBe(0);
    expect(Seance.minutesEcoulees(DEBUT, T0 + 30000)).toBe(1);
    expect(Seance.minutesEcoulees(DEBUT, T0 + 89999)).toBe(1);
    expect(Seance.minutesEcoulees(DEBUT, T0 + 90000)).toBe(2);
  });

  test('sans « maintenant » fourni, elle lit l’horloge', () => {
    const il = new Date(Date.now() - 12 * MIN).toISOString();
    expect(Seance.minutesEcoulees(il)).toBe(12);
  });

  // ⚠️ LE RETOUR D'ARRIÈRE-PLAN : une soustraction, pas un compteur. Rien ne dérive
  // quoi qu'on ait fait entre deux appels — appeler deux fois, dans le désordre, ou
  // après une veille donne le même chiffre pour le même instant.
  test('elle ne garde aucun état : le même instant donne la même durée, dans n’importe quel ordre', () => {
    const instants = [T0 + 125 * MIN, T0 + 3 * MIN, T0 + 72 * MIN, T0 + 3 * MIN];
    const attendu = instants.map((t) => Math.round((t - T0) / MIN));
    expect(instants.map((t) => Seance.minutesEcoulees(DEBUT, t))).toEqual(attendu);
    expect(instants.slice().reverse().map((t) => Seance.minutesEcoulees(DEBUT, t))).toEqual(attendu.slice().reverse());
  });
});

describe('Seance.delaiProchaineMinute', () => {
  test('à 26 s, le texte change dans ~4 s (à 30 s, l’arrondi passe à 1)', () => {
    expect(Seance.delaiProchaineMinute(DEBUT, T0 + 26000)).toBe(4000 + 50);
  });

  test('à 31 s (déjà « 1 min »), la prochaine bascule est à 1 min 30', () => {
    expect(Seance.delaiProchaineMinute(DEBUT, T0 + 31000)).toBe(59000 + 50);
  });

  // ⚠️ LA PROPRIÉTÉ QUI COMPTE : le réveil tombe EXACTEMENT sur le changement du
  // texte. Ni avant (un réveil pour rien), ni après (une durée qui retarde).
  test('à l’échéance le texte a changé de +1 ; juste avant, non — sur 400 instants', () => {
    for (let k = 0; k < 400; k++) {
      const t = T0 + Math.floor((k * 7919) % (200 * MIN));
      const d = Seance.delaiProchaineMinute(DEBUT, t);
      expect(d).toBeGreaterThanOrEqual(1000);
      expect(d).toBeLessThanOrEqual(90000);
      const m = Seance.minutesEcoulees(DEBUT, t);
      if (d > 1000 + 60) {
        expect(Seance.minutesEcoulees(DEBUT, t + d - 60)).toBe(m);
      }
      expect(Seance.minutesEcoulees(DEBUT, t + d)).toBe(m + 1);
    }
  });

  test('une date invalide : une minute, jamais un réveil à vide', () => {
    expect(Seance.delaiProchaineMinute('pas une date', T0)).toBe(60000);
    expect(Seance.delaiProchaineMinute(null, T0)).toBe(60000);
    expect(Seance.delaiProchaineMinute(DEBUT, NaN)).toBe(60000);
  });

  test('un départ dans l’avenir : on attend 30 s après lui, borné à 1 min 30', () => {
    expect(Seance.delaiProchaineMinute(DEBUT, T0 - 10 * MIN)).toBe(90000);
    expect(Seance.delaiProchaineMinute(DEBUT, T0 - 40000)).toBe(70000 + 50);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CE QUE LA BARRE MONTRE
// ════════════════════════════════════════════════════════════════════════════

function barre(sur) {
  const cible = document.createElement('header');
  cible.id = 'bandeau-seance';
  Rendu().rendreBandeauSeance(cible, Object.assign({
    titre: 'Haut du corps', debut: new Date(Date.now() - 47 * MIN).toISOString(),
    compte: { series: 6, validees: 6, travail: 5 }, modifier: false, selection: null, edition: false,
    surModifier: () => {}, surAnnulerSelection: () => {}, surTerminer: () => {}
  }, sur || {}));
  return cible;
}
// jsdom n'a pas d'`innerText` : on lit les nœuds texte dans l'ordre, séparés par une
// espace — ce que l'œil lit entre deux éléments de la barre.
const lire = (n) => {
  const mots = [];
  const parcourir = (x) => {
    x.childNodes.forEach((c) => { if (c.nodeType === 3) mots.push(c.nodeValue); else parcourir(c); });
  };
  parcourir(n);
  return mots.join(' ').replace(/\s+/g, ' ').trim();
};

describe('ce que la barre montre', () => {
  test('en séance : titre, durée, séries de travail, Modifier, Terminer — rien d’autre', () => {
    const b = barre();
    expect(lire(b)).toBe('Haut du corps 47 min · 5 séries de travail Modifier Terminer');
    expect(b.querySelector('.bandeau-fin').textContent).toBe('Terminer');
    expect(b.querySelectorAll('button')).toHaveLength(2);
  });

  test('« 1 h 12 » au-delà d’une heure, « 1 série » au singulier', () => {
    const b = barre({ debut: new Date(Date.now() - 72 * MIN).toISOString(), compte: { series: 1, validees: 1, travail: 1 } });
    expect(lire(b.querySelector('.bandeau-ch'))).toBe('1 h 12 · 1 série de travail');
  });

  test('« Terminer » reste un bouton neutre (`discret`), jamais l’ambre de la forge', () => {
    const fin = barre().querySelector('.bandeau-fin');
    expect(fin.classList.contains('discret')).toBe(true);
    expect(fin.classList.contains('principal')).toBe(false);
  });

  // ⚠️ UNE SEULE PHRASE, UN SEUL NŒUD TEXTE : le relevé du texte visible compare les
  // textes propres de chaque élément ; la scinder en deux nœuds en ferait deux textes.
  test('la phrase de durée est UN seul nœud texte (le relevé du texte visible n’y voit rien)', () => {
    const ch = barre().querySelector('.bandeau-ch');
    expect(ch.childNodes).toHaveLength(1);
    expect(ch.firstChild.nodeType).toBe(3);
    expect(ch.className).toBe('bandeau-ch num');
  });

  test('un tap sur Terminer appelle `surTerminer` (la confirmation actuelle est gardée)', () => {
    const surTerminer = jest.fn();
    barre({ surTerminer }).querySelector('.bandeau-fin').click();
    expect(surTerminer).toHaveBeenCalledTimes(1);
  });

  // ⚠️ MUTATION (e) : « Terminer » affiché pendant « Grouper avec… ».
  test('en sélection (« Grouper avec… ») : la consigne et Annuler, JAMAIS Terminer', () => {
    const b = barre({ selection: 2 });
    expect(lire(b)).toBe('Grouper avec… Touche le bloc à joindre Annuler');
    expect(b.querySelector('.bandeau-fin')).toBe(null);
    expect(lire(b)).not.toMatch(/Terminer/);
    expect(b.querySelector('.bandeau-ch[data-suite]')).toBe(null);
  });

  test('l’index 0 est une sélection aussi (le premier bloc)', () => {
    const b = barre({ selection: 0 });
    expect(b.querySelector('.bandeau-fin')).toBe(null);
  });

  // ⚠️ MUTATION (g) : la durée affichée en édition d'une séance passée.
  test('en correction d’une séance passée : « Modification », « Enregistrer », AUCUNE durée', () => {
    const b = barre({ edition: true, debut: new Date(Date.now() - 3 * 86400000).toISOString() });
    expect(lire(b)).toBe('Haut du corps Modification · 5 séries de travail Modifier Enregistrer');
    expect(lire(b)).not.toMatch(/\bmin\b|\bh \d\d/);
    expect(b.querySelector('.bandeau-ch[data-suite]')).toBe(null);
  });

  test('le mode Modifier ne change que le libellé du bouton, comme avant', () => {
    const b = barre({ modifier: true });
    expect(b.querySelector('.bandeau-modifier').textContent).toBe('Terminé');
    expect(b.querySelector('.bandeau-modifier').getAttribute('aria-pressed')).toBe('true');
    expect(b.querySelector('.bandeau-fin')).not.toBe(null);
  });

  test('une date de départ invalide : « 0 min », jamais « NaN min »', () => {
    expect(lire(barre({ debut: 'nope' }).querySelector('.bandeau-ch'))).toBe('0 min · 5 séries de travail');
    expect(lire(barre({ debut: null }).querySelector('.bandeau-ch'))).toBe('0 min · 5 séries de travail');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA DURÉE SE RÉÉCRIT SUR PLACE — jamais un nouveau rendu
// ════════════════════════════════════════════════════════════════════════════

describe('Rendu.majDureeBandeau', () => {
  test('réécrit le seul texte de la durée, à la minute', () => {
    const b = barre({ debut: DEBUT });
    expect(Rendu().majDureeBandeau(b, DEBUT, T0 + 72 * MIN)).toBe(true);
    expect(lire(b.querySelector('.bandeau-ch'))).toBe('1 h 12 · 5 séries de travail');
    Rendu().majDureeBandeau(b, DEBUT, T0 + 47 * MIN);
    expect(lire(b.querySelector('.bandeau-ch'))).toBe('47 min · 5 séries de travail');
  });

  // ⚠️ MUTATION (b) : la durée redessinée par `rendreSeance`. Un nœud qu'on
  // reconstruit n'est plus le même objet — et le focus d'un champ voisin s'en va.
  test('les nœuds de la barre restent LES MÊMES : rien n’est reconstruit', () => {
    const b = barre({ debut: DEBUT });
    const avant = Array.from(b.querySelectorAll('*'));
    const ch = b.querySelector('.bandeau-ch');
    const texte = ch.firstChild;
    Rendu().majDureeBandeau(b, DEBUT, T0 + 90 * MIN);
    expect(Array.from(b.querySelectorAll('*'))).toEqual(avant);
    avant.forEach((n, i) => expect(b.querySelectorAll('*')[i]).toBe(n));
    expect(b.querySelector('.bandeau-ch')).toBe(ch);
  });

  test('et si le texte ne change pas, le DOM n’est pas touché du tout', () => {
    const b = barre({ debut: DEBUT });
    Rendu().majDureeBandeau(b, DEBUT, T0 + 10 * MIN);
    const journal = [];
    const obs = new MutationObserver((m) => journal.push(...m));
    obs.observe(b, { subtree: true, childList: true, characterData: true, attributes: true });
    Rendu().majDureeBandeau(b, DEBUT, T0 + 10 * MIN);
    Rendu().majDureeBandeau(b, DEBUT, T0 + 10 * MIN + 1000);
    obs.takeRecords();
    expect(journal).toEqual([]);
  });

  test('rien à réécrire en sélection, en correction, ou sans barre', () => {
    expect(Rendu().majDureeBandeau(barre({ selection: 1 }), DEBUT, T0)).toBe(false);
    expect(Rendu().majDureeBandeau(barre({ edition: true }), DEBUT, T0)).toBe(false);
    expect(Rendu().majDureeBandeau(null, DEBUT, T0)).toBe(false);
    expect(Rendu().majDureeBandeau(document.createElement('header'), DEBUT, T0)).toBe(false);
  });

  test('une barre sans durée n’en reçoit pas : la correction reste « Modification »', () => {
    const b = barre({ edition: true });
    Rendu().majDureeBandeau(b, DEBUT, T0 + 30 * MIN);
    expect(lire(b.querySelector('.bandeau-ch'))).toBe('Modification · 5 séries de travail');
  });

  test('le nombre de séries (la fin de la phrase) n’est jamais perdu en route', () => {
    const b = barre({ debut: DEBUT, compte: { series: 9, validees: 9, travail: 9 } });
    Rendu().majDureeBandeau(b, DEBUT, T0 + 5 * MIN);
    expect(lire(b.querySelector('.bandeau-ch'))).toBe('5 min · 9 séries de travail');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// UN SEUL MINUTEUR — le VRAI code d'`app.js`, extrait, face à des minuteurs de papier
// ════════════════════════════════════════════════════════════════════════════

function extraire(nom) {
  // Une fonction d'une ligne, ou un bloc fermé par « ^  } ».
  const une = new RegExp('^  function ' + nom + '\\b[^\\n]*\\}\\s*$', 'm');
  const m1 = APP.match(une);
  if (m1) return m1[0];
  const bloc = new RegExp('^  function ' + nom + '\\b[\\s\\S]*?^  }', 'm');
  const m = APP.match(bloc);
  if (!m) throw new Error('introuvable dans v2/js/app.js : ' + nom);
  return m[0];
}

// Le bac exécute la VRAIE `armerDuree` / `arreterDuree` / `rafraichirDuree`. Ce qui
// n'est pas dans son contexte n'existe pas : `rendreSeance` n'y est PAS — si le réveil
// la rappelait (mutation b), le test lèverait une ReferenceError. Et `setInterval` y
// jette : un second intervalle (mutation c) ne passe pas.
function bac(etat) {
  const reveils = new Map();
  let n = 0;
  const journal = { majs: [], intervalles: 0, arrets: 0 };
  const noeud = { id: 'bandeau-seance' };
  const ctx = {
    Seance: Seance,
    Date: Date,
    seance: etat && 'seance' in etat ? etat.seance : { debut: DEBUT, statut: 'en_cours' },
    ecranCourant: etat && etat.ecran ? etat.ecran : 'seance',
    dureeTimer: null,
    $: () => noeud,
    Rendu: { majDureeBandeau: (cible, debut, t) => { journal.majs.push({ cible, debut, t }); return true; } },
    racine: {
      setTimeout: (f, d) => { n += 1; reveils.set(n, { f, d }); return n; },
      clearTimeout: (id) => { journal.arrets += 1; reveils.delete(id); },
      setInterval: () => { journal.intervalles += 1; throw new Error('un second setInterval'); }
    }
  };
  vm.createContext(ctx);
  ['enEdition', 'arreterDuree', 'rafraichirDuree', 'armerDuree'].forEach((nom) => vm.runInContext(extraire(nom), ctx));
  return {
    ctx, journal, reveils, noeud,
    // Ce que fait le navigateur à l'échéance : le réveil unique part.
    sonner: () => {
      const [id, r] = Array.from(reveils.entries())[0];
      reveils.delete(id);
      r.f();
    },
    arme: () => reveils.size
  };
}

describe('UN SEUL réveil de durée, jamais un second intervalle', () => {
  test('armer pose UN réveil, sur le prochain changement du texte', () => {
    const b = bac();
    vm.runInContext('armerDuree()', b.ctx);
    expect(b.arme()).toBe(1);
    const d = Array.from(b.reveils.values())[0].d;
    expect(d).toBeGreaterThanOrEqual(1000);
    expect(d).toBeLessThanOrEqual(90000);
    expect(b.journal.intervalles).toBe(0);
  });

  test('armer deux fois n’en laisse qu’UN (le précédent est coupé)', () => {
    const b = bac();
    vm.runInContext('armerDuree(); armerDuree(); armerDuree()', b.ctx);
    expect(b.arme()).toBe(1);
    expect(b.journal.arrets).toBe(2);
  });

  test('arrêter coupe le réveil, et arrêter à vide ne casse rien', () => {
    const b = bac();
    vm.runInContext('armerDuree(); arreterDuree(); arreterDuree()', b.ctx);
    expect(b.arme()).toBe(0);
    expect(b.ctx.dureeTimer).toBe(null);
  });

  // ⚠️ MUTATION (b) : le réveil qui redessine la séance. `rendreSeance` n'existe pas
  // dans ce contexte : si le réveil la rappelle, `sonner()` lève.
  test('à l’échéance il réécrit la durée SUR PLACE et se réarme — il ne redessine pas la séance', () => {
    const b = bac();
    vm.runInContext('armerDuree()', b.ctx);
    expect(() => b.sonner()).not.toThrow();
    expect(b.journal.majs).toHaveLength(1);
    expect(b.journal.majs[0].cible).toBe(b.noeud);
    expect(b.journal.majs[0].debut).toBe(DEBUT);
    expect(typeof b.journal.majs[0].t).toBe('number');
    expect(b.arme()).toBe(1);                      // réarmé pour la minute suivante
    expect(b.journal.intervalles).toBe(0);
  });

  test('et il tient sur une heure de séance : 200 réveils, toujours UN seul armé', () => {
    const b = bac();
    vm.runInContext('armerDuree()', b.ctx);
    for (let k = 0; k < 200; k++) { b.sonner(); expect(b.arme()).toBe(1); }
  });

  // Après « Terminer » / « Annuler », la séance n'existe plus : le réveil en attente,
  // s'il part quand même, ne réécrit rien et ne se réarme pas.
  test('séance terminée entre-temps : le réveil qui part ne réécrit rien et ne se réarme pas', () => {
    const b = bac();
    vm.runInContext('armerDuree()', b.ctx);
    b.ctx.seance = null;
    b.sonner();
    expect(b.journal.majs).toHaveLength(0);
    expect(b.arme()).toBe(0);
  });

  test('un autre écran affiché entre-temps : il ne réécrit rien et ne se réarme pas', () => {
    const b = bac();
    vm.runInContext('armerDuree()', b.ctx);
    b.ctx.ecranCourant = 'progression';
    b.sonner();
    expect(b.journal.majs).toHaveLength(0);
    expect(b.arme()).toBe(0);
  });

  test('en correction d’une séance passée : rien n’est armé, rien n’est réécrit', () => {
    const b = bac({ seance: { debut: DEBUT, statut: Seance.TERMINEE } });
    vm.runInContext('armerDuree(); rafraichirDuree()', b.ctx);
    expect(b.arme()).toBe(0);
    expect(b.journal.majs).toHaveLength(0);
  });

  test('sans séance : rien n’est armé', () => {
    const b = bac({ seance: null });
    vm.runInContext('armerDuree(); rafraichirDuree()', b.ctx);
    expect(b.arme()).toBe(0);
    expect(b.journal.majs).toHaveLength(0);
  });

  test('`rafraichirDuree` (le retour d’arrière-plan) lit `seance.debut` et l’heure d’ici, pas un compteur', () => {
    const b = bac();
    vm.runInContext('rafraichirDuree()', b.ctx);
    expect(b.journal.majs).toHaveLength(1);
    expect(b.journal.majs[0].debut).toBe(DEBUT);
  });

  // La garde de structure : `app.js` n'a QU'UN `setInterval`, celui du repos.
  test('app.js ne pose qu’UN `setInterval` (le chronomètre de repos), et la durée n’en pose aucun', () => {
    const sansCommentaires = APP.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    const appels = sansCommentaires.match(/\bsetInterval\s*\(/g) || [];
    expect(appels).toHaveLength(1);
    expect(extraire('assurerMinuteur')).toMatch(/setInterval/);
    ['armerDuree', 'arreterDuree', 'rafraichirDuree'].forEach((nom) => {
      expect(extraire(nom).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')).not.toMatch(/setInterval/);
    });
  });

  // L'unique porte de sortie d'écran coupe le réveil (elle ne se teste pas sans le DOM
  // de l'app : le banc le joue pour de vrai — « hors de l'écran de séance : aucun réveil »).
  test('`montrer` coupe le réveil pour tout autre écran que la séance', () => {
    const montrer = extraire('montrer');
    expect(montrer).toMatch(/if \(nom !== 'seance'\) arreterDuree\(\);/);
  });

  test('`rendreSeance` arme le réveil et mesure la barre APRÈS l’avoir dessinée', () => {
    const rendre = extraire('rendreSeance');
    const iBandeau = rendre.indexOf('Rendu.rendreBandeauSeance');
    const iMesure = rendre.indexOf('mesurerBarres();');
    const iArme = rendre.indexOf('armerDuree();');
    expect(iBandeau).toBeGreaterThan(-1);
    expect(iMesure).toBeGreaterThan(iBandeau);
    expect(iArme).toBeGreaterThan(iBandeau);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA HAUTEUR MESURÉE — écrite seulement si elle change
// ════════════════════════════════════════════════════════════════════════════

function bacMesure(hauteurs) {
  const ecrit = [];
  const rect = (h) => ({ getBoundingClientRect: () => ({ height: h }) });
  const noeuds = { 'bandeau-seance': rect(hauteurs.barre), repos: Object.assign(rect(0), { hidden: true }),
    'pied-reorg': Object.assign(rect(0), { hidden: true }) };
  const ctx = {
    Math: Math,
    barresMesurees: { onglets: null, repos: null, pied: null, seance: null },
    $: (id) => noeuds[id] || null,
    doc: {
      documentElement: { style: { setProperty: (k, v) => ecrit.push([k, v]) } },
      querySelector: () => rect(hauteurs.onglets)
    }
  };
  vm.createContext(ctx);
  vm.runInContext(extraire('mesurerBarres'), ctx);
  // `var barresMesurees` est déclarée hors de la fonction : on la remet dans le contexte.
  return { ctx, ecrit, noeuds, mesurer: () => vm.runInContext('mesurerBarres()', ctx) };
}

describe('--h-barre-seance, mesurée comme les barres du bas', () => {
  test('la hauteur de la barre est écrite en px, arrondie vers le haut', () => {
    const b = bacMesure({ barre: 56.2, onglets: 68 });
    b.mesurer();
    expect(b.ecrit).toContainEqual(['--h-barre-seance', '57px']);
  });

  test('et seulement si elle change : la même hauteur ne réécrit rien', () => {
    const b = bacMesure({ barre: 57, onglets: 68 });
    b.mesurer();
    const apres1 = b.ecrit.filter((e) => e[0] === '--h-barre-seance').length;
    b.mesurer(); b.mesurer();
    expect(b.ecrit.filter((e) => e[0] === '--h-barre-seance').length).toBe(apres1);
    b.noeuds['bandeau-seance'] = { getBoundingClientRect: () => ({ height: 65 }) };
    b.mesurer();
    expect(b.ecrit.filter((e) => e[0] === '--h-barre-seance')).toEqual(
      [['--h-barre-seance', '57px'], ['--h-barre-seance', '65px']]);
  });

  test('la barre cachée avec sa vue rend un rectangle nul : le bon zéro', () => {
    const b = bacMesure({ barre: 57, onglets: 68 });
    b.mesurer();
    b.noeuds['bandeau-seance'] = { getBoundingClientRect: () => ({ height: 0 }) };
    b.mesurer();
    expect(b.ecrit.filter((e) => e[0] === '--h-barre-seance').pop()).toEqual(['--h-barre-seance', '0px']);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LE CSS — sticky, opaque, sous les feuilles (le vrai test est dans le banc, en vrai navigateur)
// ════════════════════════════════════════════════════════════════════════════

function regle(selecteur) {
  const i = CSS.indexOf(selecteur + '{');
  if (i < 0) return null;
  return CSS.slice(i + selecteur.length + 1, CSS.indexOf('}', i));
}

describe('la barre dans la feuille de style', () => {
  const r = regle('#bandeau-seance');

  // ⚠️ MUTATION (a) : `sticky` remplacé par `static`.
  test('`position: sticky; top: 0` — dans le flux, jamais `fixed`', () => {
    expect(r).toMatch(/position:sticky/);
    expect(r).toMatch(/top:0/);
    expect(r).not.toMatch(/position:\s*fixed/);
  });

  test('fond OPAQUE (`--fond`) : sans lui les blocs défilent à travers la barre', () => {
    expect(r).toMatch(/background:var\(--fond\)/);
  });

  test('z-index entre les lignes de saisie (1) et la rangée prise (9)', () => {
    const z = Number((r.match(/z-index:(\d+)/) || [])[1]);
    expect(z).toBeGreaterThan(1);
    expect(z).toBeLessThan(9);
    expect(CSS).toMatch(/\.bloc-seance\.pris,\.routine-rangee\.pris\{position:relative;z-index:9;/);
    expect(CSS).toMatch(/\.voile\{position:fixed;inset:0;z-index:60;/);
  });

  test('aucun jaune : la barre n’utilise ni l’accent ni le jaune', () => {
    const toutes = [r, regle('#bandeau-seance .discret'), regle('.bandeau-seance')].join(' ');
    expect(toutes).not.toMatch(/--accent|#f2b84b|yellow/i);
  });

  test('« Terminer » et ses voisins : 40 px de haut au moins', () => {
    expect(regle('#bandeau-seance .discret')).toMatch(/min-height:40px/);
  });

  // ⚠️ MUTATION (d) : `scroll-margin-top` retiré. Et la réserve du défileur, sans
  // laquelle Chromium ne déplace pas un champ focalisé à moitié sous la barre.
  test('la réserve du défileur porte la hauteur mesurée, la marge garde l’air', () => {
    expect(CSS).toMatch(/html\{scroll-padding-top:var\(--h-barre-seance, 0px\)\}/);
    expect(CSS).toMatch(/#vue-seance :is\([^)]*\.bloc-seance[^)]*input[^)]*\)\{\s*scroll-margin-top:var\(--e3\)\}/);
  });
});
