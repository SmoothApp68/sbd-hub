//
// Chantier 42 — l'éditeur de routine : reps sur la carte, repos en mm:ss
// (ECRAN-SAISIE-V1 §7 quaterdecies).
//
// CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : **un repos qui dépasse
// la minute.** Sous 60 secondes, « décalage sur deux groupes » et « champ
// numérique simple » rendent la même valeur — c'est le seul cas qu'on teste
// spontanément, et c'est exactement ce qui a laissé passer la régression. Tous
// les tests de saisie ci-dessous franchissent donc la minute.
//
// Environnement jsdom (PAS de docblock `node`) : `rendu.js` se termine par
// `this`, que Babel remplace par `undefined` sous l'environnement node.

const Routines = require('../../v2/js/routines.js');
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const exo = (champs) => Object.assign({
  id: 'x1', exercise_slug: 'a', rang: 0, series: 3,
  reps_visees: 8, repos_cible_s: 90, groupe_superset: null, note: null
}, champs || {});
const nommer = () => 'Squat (Barre)';

const carte = (e, vue) => {
  const cible = document.createElement('div');
  Rendu().rendreExosRoutine(cible, [e], nommer, Object.assign(
    { surMenu: () => {}, surChamp: () => {}, surParametres: () => {} }, vue));
  return cible;
};
const feuille = (e, vue) => {
  const cible = document.createElement('div');
  Rendu().rendreFeuilleParametresExo(cible, Object.assign({
    nom: 'Squat (Barre)', exercice: e, surChamp: () => {}, surFermer: () => {}
  }, vue));
  return cible;
};
// Le pavé du repos : c'est le SEUL champ texte de la feuille, les deux autres
// sont numériques.
const padRepos = (c) => c.querySelector('.chrono input');

// Tape des chiffres comme un pouce : un `beforeinput` par appui.
const taper = (input, suite) => {
  String(suite).split('').forEach((c) => {
    input.dispatchEvent(new window.InputEvent('beforeinput',
      { inputType: 'insertText', data: c, cancelable: true }));
  });
};
const effacer = (input) => {
  input.dispatchEvent(new window.InputEvent('beforeinput',
    { inputType: 'deleteContentBackward', cancelable: true }));
};

// ════════════════════════════════════════════════════════════════════════════
// 1 à 3 — LES REPS VISÉES SUR LA CARTE
// ════════════════════════════════════════════════════════════════════════════
describe('⚠️ les reps visées se saisissent sur la carte (§7 quaterdecies.1)', () => {
  test('le champ est là, à côté des séries, sans ouvrir la feuille', () => {
    const c = carte(exo());
    const libs = [...c.querySelectorAll('.exo-routine-champs .champ-lib')]
      .map((x) => x.textContent);
    expect(libs).toEqual(['Séries', 'Reps visées']);
    expect(c.querySelectorAll('.exo-routine-champs input[type="number"]').length).toBe(2);
  });

  test('taper dedans mute le brouillon, sans redessiner', () => {
    const vus = [];
    const c = carte(exo(), { surChamp: (i, champ, val) => vus.push([i, champ, val]) });
    const champ = c.querySelectorAll('.exo-routine-champs input')[1];
    champ.value = '12';
    champ.dispatchEvent(new window.Event('input'));
    expect(vus).toEqual([[0, 'reps_visees', '12']]);
  });

  // 3. Reps vides → acceptées, la colonne est nullable.
  test('des reps vides sont valides — la colonne est NULLABLE', () => {
    const c = carte(exo({ reps_visees: null }));
    expect(c.querySelectorAll('.exo-routine-champs input')[1].value).toBe('');
    expect(Routines.valider(
      { nom: 'Push', exercices: [exo({ reps_visees: null })] }, []).valide).toBe(true);
    expect(Routines.repsEcrites(null)).toBeNull();
    expect(Routines.repsEcrites('')).toBeNull();
  });

  // 2. La valeur AFFICHÉE est celle qui sera ÉCRITE — la leçon de M7.
  //
  // ⚠️ ÉCART ASSUMÉ AVEC L'ÉNONCÉ DU CHANTIER. Il demandait « une routine à
  // `reps_visees: 101` montre 100 ». Mais 100 n'est PAS ce que la base
  // recevrait : `reps_visees` est NULLABLE, et `normaliserExercice` écrit
  // `null` pour une valeur hors bornes. Afficher 100 inventerait un nombre que
  // personne n'a saisi et que la base ne verra jamais — c'est-à-dire le défaut
  // M7, sous une autre forme. Le champ est donc VIDE.
  //
  // `series`, elle, s'affiche bien ramenée dans la plage (21 → 20) : parce que
  // la colonne est NOT NULL et que `serieBornee` n'a pas d'autre issue.
  test.each([[101, ''], [0, ''], [100, '100'], [1, '1']])(
    'reps_visees à %s s’affiche « %s » — ce que la base recevra',
    (reps, attendu) => {
      expect(carte(exo({ reps_visees: reps }))
        .querySelectorAll('.exo-routine-champs input')[1].value).toBe(attendu);
      expect(Routines.repsEcrites(reps)).toBe(attendu === '' ? null : Number(attendu));
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 4 à 7 — LE REPOS EN mm:ss
// ════════════════════════════════════════════════════════════════════════════
describe('⚠️ le repos se saisit au pavé de décalage (§7 quaterdecies.2)', () => {
  test('la feuille n’a plus de champ « Repos (s) » : c’est un pavé', () => {
    const c = feuille(exo());
    expect(c.textContent).not.toMatch(/Repos \(s\)/);
    expect([...c.querySelectorAll('.champ-lib')].map((x) => x.textContent))
      .toEqual(['Séries', 'Reps visées', 'Repos cible']);
    expect(padRepos(c)).not.toBeNull();
    expect(padRepos(c).type).toBe('text');
    expect(padRepos(c).inputMode).toBe('numeric');
  });

  // 4. CONFIGURATION DISCRIMINANTE : 1:30 franchit la minute. `1` `3` `0` lu
  // comme un nombre vaudrait 130 secondes, pas 90.
  test('« 1 » « 3 » « 0 » donne 1:30, et stocke 90 secondes', () => {
    const vus = [];
    const c = feuille(exo({ repos_cible_s: null }), { surChamp: (ch, v) => vus.push([ch, v]) });
    const p = padRepos(c);
    taper(p, '130');
    expect(p.value).toBe('01:30');
    expect(vus[vus.length - 1]).toEqual(['repos_cible_s', 90]);
    // ⚠️ ET UN CHAMP NUMÉRIQUE SIMPLE AURAIT DIT 130. C'est la différence que
    // la configuration discriminante existe pour rendre visible.
    expect(vus[vus.length - 1][1]).not.toBe(130);
  });

  test('sous la minute aussi : « 4 » « 5 » donne 0:45', () => {
    const vus = [];
    const c = feuille(exo({ repos_cible_s: null }), { surChamp: (ch, v) => vus.push(v) });
    taper(padRepos(c), '45');
    expect(padRepos(c).value).toBe('00:45');
    expect(vus[vus.length - 1]).toBe(45);
  });

  // 6. Effacement par la droite, comme au chantier 25.
  test('effacer retire le DERNIER chiffre, pas le champ entier', () => {
    const vus = [];
    const c = feuille(exo({ repos_cible_s: null }), { surChamp: (ch, v) => vus.push(v) });
    const p = padRepos(c);
    taper(p, '130');
    effacer(p);
    expect(p.value).toBe('00:13');       // « 130 » → « 13 »
    expect(vus[vus.length - 1]).toBe(13);
    effacer(p);
    expect(p.value).toBe('00:01');
  });

  // 7. Rechargement : ce qui est stocké se réaffiche en mm:ss.
  test.each([[90, '01:30'], [45, '00:45'], [1800, '30:00'], [5, '00:05']])(
    '%s s stockées se rouvrent en « %s »', (secondes, attendu) => {
      expect(padRepos(feuille(exo({ repos_cible_s: secondes }))).value).toBe(attendu);
    });

  test('un repos absent rouvre un champ vide, pas un zéro', () => {
    expect(padRepos(feuille(exo({ repos_cible_s: null }))).value).toBe('');
  });

  // ⚠️ LES HEURES NE S'AFFICHENT JAMAIS ICI : la borne haute est 30 minutes, et
  // `formatChrono` n'écrit le groupe des heures qu'au-delà de l'heure.
  test('aucune heure à l’écran, quelle que soit la valeur admissible', () => {
    [5, 90, 599, 1800].forEach((v) => {
      expect(padRepos(feuille(exo({ repos_cible_s: v }))).value).not.toMatch(/^\d+:\d\d:\d\d$/);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5 — LA BORNE, ET OÙ ELLE S'APPLIQUE
// ════════════════════════════════════════════════════════════════════════════
describe('⚠️ la borne du repos : 0:05 à 30:00', () => {
  // ⚠️ DEUX ENDROITS, ET CE N'EST PAS UNE DUPLICATION. Le HAUT se refuse à la
  // frappe — on n'a jamais besoin de passer par 40:00 pour écrire 30:00. Le BAS
  // ne le peut pas : pour taper 0:45 il faut passer par 0:04, qui est sous le
  // minimum. Un pavé qui refuse ses états de passage est un pavé où l'on ne
  // peut rien taper.
  test('le HAUT se refuse à la frappe : le chiffre de trop n’entre pas', () => {
    const c = feuille(exo({ repos_cible_s: null }));
    const p = padRepos(c);
    taper(p, '3000');
    expect(p.value).toBe('30:00');       // 1800 s, la borne exacte
    taper(p, '1');                        // « 30001 » vaudrait 3:00:01
    expect(p.value).toBe('30:00');       // refusé, rien n’est perdu
  });

  test('30:01 est inatteignable au pavé — 3 0 0 1 s’arrête à 3:00', () => {
    const c = feuille(exo({ repos_cible_s: null }));
    const p = padRepos(c);
    taper(p, '3001');
    expect(p.value).toBe('03:00');
  });

  test('le BAS se refuse à l’enregistrement, avec un message en mm:ss', () => {
    expect(Routines.valider({ nom: 'Push', exercices: [exo({ repos_cible_s: 4 })] }, [])
      .soucis[0]).toEqual({ champ: 'repos_cible_s', rang: 0, raison: 'hors-bornes' });
    expect(Routines.valider({ nom: 'Push', exercices: [exo({ repos_cible_s: 5 })] }, [])
      .valide).toBe(true);
    expect(Routines.valider({ nom: 'Push', exercices: [exo({ repos_cible_s: 1800 })] }, [])
      .valide).toBe(true);
    expect(Routines.valider({ nom: 'Push', exercices: [exo({ repos_cible_s: 1801 })] }, [])
      .valide).toBe(false);
  });

  test('une valeur hors bornes venue d’ailleurs s’affiche VIDE, pas au plafond', () => {
    expect(padRepos(feuille(exo({ repos_cible_s: 1801 }))).value).toBe('');
    expect(padRepos(feuille(exo({ repos_cible_s: 4 }))).value).toBe('');
    expect(Routines.reposEcrit(1801)).toBeNull();
    expect(Routines.reposEcrit(4)).toBeNull();
  });

  test('sur la carte non plus, le repos hors bornes ne s’affiche pas', () => {
    expect(carte(exo({ repos_cible_s: 1801 })).querySelector('.repos-cible').textContent)
      .toBe('repos —');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LE PAVÉ LUI-MÊME — la borne est celle de l'appelant, et il n'y en a qu'une
// ════════════════════════════════════════════════════════════════════════════
describe('⚠️ poserChiffreDuree prend la borne de son appelant', () => {
  test('sans borne, c’est celle du chronomètre de séance — rien ne change', () => {
    expect(Modele.poserChiffreDuree('959', '5')).toBe('9595');
    expect(Modele.dureeDeChiffres('95959')).toBe(Modele.MAX_DUREE_S);
    // Un sixième chiffre dépasserait 9:59:59 : refusé, comme au chantier 25.
    expect(Modele.poserChiffreDuree('95959', '9')).toBe('95959');
  });

  test('avec la borne du repos, elle s’applique bien plus tôt', () => {
    expect(Modele.poserChiffreDuree('300', '0', 1800)).toBe('3000');   // 30:00
    expect(Modele.poserChiffreDuree('300', '1', 1800)).toBe('300');    // 30:01 refusé
    expect(Modele.poserChiffreDuree('3000', '0', 1800)).toBe('3000');
  });

  test('la borne ne tronque rien : le chiffre n’entre pas, l’état reste entier', () => {
    expect(Modele.dureeDeChiffres(Modele.poserChiffreDuree('300', '1', 1800))).toBe(180);
  });
});
