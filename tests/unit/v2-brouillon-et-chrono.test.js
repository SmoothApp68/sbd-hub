//
// Chantier 45 — le brouillon de routine, et le chronomètre qui s'armait pour rien
// (ECRAN-SAISIE-V1 §7 octodecies et §7 novodecies).
//
// ══ POURQUOI CE FICHIER EXISTE ═════════════════════════════════════════════
//
// Le chantier 44 portait un test nommé « un repos désactivé vaut NULL en
// séance, et n'arme aucune cible ». Il vérifiait le STOCKAGE de `null` et
// n'a jamais touché à l'armement. Mesuré au chantier 45 : en forçant
// `chrono.cible` à 1 s dans `app.js`, **1 916 tests restaient verts**.
//
// Un test qui ne teste pas ce qu'il prétend est pire qu'aucun test — il occupe
// la place. Ce fichier tient la décision d'armement là où elle peut être tuée :
// dans une fonction PURE, `Seance.cibleArmable`.
//
// Environnement jsdom (PAS de docblock `node`) : `rendu.js`, `modele.js` et
// `routines.js` se terminent par `this`.

const Routines = require('../../v2/js/routines.js');
require('../../v2/js/semaine.js');
const Modele = require('../../v2/js/modele.js');
const Seance = require('../../v2/js/seance.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const CAT = [
  { slug: 'dc', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', muscles_primaires: ['pectoraux'] },
  { slug: 'row', nom: 'Rowing Poulie Assis', mesure: 'charge_reps', muscles_primaires: ['dos'] }
];
const L = (o) => Object.assign(Routines.enSaisie(null), o);

// ⚠️ CONFIGURATION DISCRIMINANTE (§2 quater) POUR LE TEST 1 : un exercice dont
// le repos est DÉSACTIVÉ **à côté** d'un exercice qui en a un. Si tous les
// repos étaient désactivés, « lit la valeur » et « n'arme jamais » rendraient
// exactement le même écran — et une implémentation qui n'arme plus rien du
// tout passerait pour correcte.
const ROUTINE_MIXTE = () => ({
  id: 'r1', nom: 'Push', exercices: [
    { id: 'e-dc', exercise_slug: 'dc', rang: 0, repos_cible_s: 120,
      note: null, groupe_superset: null,
      series: [L({ type_serie: 'echauffement', reps: 15 }),
               L({ type_serie: 'travail', reps: 5 }),
               L({ type_serie: 'degressive', reps: 3 }),
               L({ type_serie: 'echec', reps: 1 })] },
    { id: 'e-row', exercise_slug: 'row', rang: 1, repos_cible_s: null,
      note: null, groupe_superset: null,
      series: [L({ type_serie: 'echauffement', reps: 15 }),
               L({ type_serie: 'travail', reps: 12 }),
               L({ type_serie: 'degressive', reps: 8 }),
               L({ type_serie: 'echec', reps: 5 })] }
  ]
});

let n = 0;
const creer = (routine) => Seance.creer({
  id: 'sess', userId: 'u1', debut: '2026-09-17T10:00:00.000Z',
  routine: routine, idSerie: () => 'ls-' + (++n)
});

// ════════════════════════════════════════════════════════════════════════════
// 1 à 3 — LE CHRONOMÈTRE NE S'ARME PAS SUR UN REPOS DÉSACTIVÉ (§7 novodecies)
// ════════════════════════════════════════════════════════════════════════════
describe('⚠️ un repos désactivé n’arme aucun chronomètre', () => {
  // 1. Les deux exercices, les quatre types de série.
  //
  // ⚠️ L'ARMEMENT SE DÉCIDE PAR EXERCICE, PAS PAR LIGNE : `repos_cible_s` vit
  // sur l'exercice, donc ses quatre types de série partagent la même décision.
  // Le test la parcourt quand même pour les quatre — c'est ce que le §6.1 du
  // chantier demande, et c'est ce qui dirait qu'une ligne a pris le dessus.
  test('les quatre types de série, sur l’exercice désactivé comme sur l’autre', () => {
    const s = creer(ROUTINE_MIXTE());
    const avec = s.exercices[0], sans = s.exercices[1];
    expect(avec.repos_cible_s).toBe(120);
    expect(sans.repos_cible_s).toBeNull();
    expect(avec.series.map((x) => x.type_serie))
      .toEqual(['echauffement', 'travail', 'degressive', 'echec']);
    // L'exercice SANS repos n'arme rien, quelle que soit la ligne validée.
    sans.series.forEach(() => expect(Seance.cibleArmable(sans.repos_cible_s)).toBeNull());
    // Et celui d'à côté arme, toujours. Sans cette moitié, « n'arme jamais »
    // passerait pour « lit la valeur ».
    avec.series.forEach(() => expect(Seance.cibleArmable(avec.repos_cible_s)).toBe(120));
  });

  // 2. Non-régression : la borne basse existe, et 5 s arme.
  test('un repos à 5 s arme — la borne basse n’est pas un zéro déguisé', () => {
    expect(Seance.cibleArmable(5)).toBe(5);
    expect(Seance.cibleArmable(1)).toBe(1);
    expect(Seance.cibleArmable(1800)).toBe(1800);
    // Et zéro n'arme pas : `routine_exos_repos_borne` commence à 5 s, donc un
    // zéro ne peut venir que d'un défaut — et « 0:00 de repos » serait une
    // prescription, pas une absence.
    expect(Seance.cibleArmable(0)).toBeNull();
    expect(Seance.cibleArmable(-30)).toBeNull();
    expect(Seance.cibleArmable(null)).toBeNull();
    expect(Seance.cibleArmable(undefined)).toBeNull();
    expect(Seance.cibleArmable('')).toBeNull();
    expect(Seance.cibleArmable('nawak')).toBeNull();
  });

  // 3. ⚠️ LE TEST QUI NE MORDAIT PAS, ET CE QU'IL AURAIT DÛ REGARDER.
  //
  // `definirReposCible(s, i, null)` range bien `null` — c'est ce que le
  // chantier 44 vérifiait, et c'est vrai. Mais le stockage et l'armement sont
  // DEUX choses, et la seconde n'était vérifiée nulle part. Les deux
  // assertions ci-dessous se tiennent : la première dit ce qui est rangé, la
  // seconde ce qu'on en fait.
  test('stocker `null` et n’armer rien sont deux faits distincts', () => {
    let s = creer(ROUTINE_MIXTE());
    s = Seance.definirReposCible(s, 0, null);
    expect(s.exercices[0].repos_cible_s).toBeNull();            // ce que le ch. 44 voyait
    expect(Seance.cibleArmable(s.exercices[0].repos_cible_s)).toBeNull();  // ce qu'il ratait
    // Et le chemin inverse, pour que « toujours null » ne passe pas non plus.
    s = Seance.definirReposCible(s, 0, 90);
    expect(s.exercices[0].repos_cible_s).toBe(90);
    expect(Seance.cibleArmable(s.exercices[0].repos_cible_s)).toBe(90);
  });

  // ⚠️ ET LA COUCHE D'AFFICHAGE NE RATTRAPE RIEN. Avec une cible nulle,
  // `reposFige` est faux pour TOUT `s` — l'intervalle d'une seconde ne
  // s'arrêtait donc jamais, et le compteur montait sans but. C'est la moitié
  // du défaut qui rendait l'autre visible.
  test('avec une cible nulle, rien ne fige jamais — d’où le compteur sans but', () => {
    [0, 60, 3600, 86400].forEach((sec) => {
      expect(Seance.reposFige(null, sec)).toBe(false);
      expect(Seance.echeanceAtteinte(null, sec, false)).toBe(false);
      expect(Seance.secondesAffichees(null, sec)).toBe(sec);
    });
    // Avec une cible, il fige — et c'est ce contraste qui rend le défaut lisible.
    expect(Seance.reposFige(120, 120)).toBe(true);
    expect(Seance.secondesAffichees(120, 300)).toBe(120);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4 à 8 — LE BROUILLON DE ROUTINE (§7 octodecies.2 et .3)
// ════════════════════════════════════════════════════════════════════════════
//
// ⚠️ CONFIGURATION DISCRIMINANTE (§2 quater) POUR LE TEST 4 : un brouillon
// MODIFIÉ PUIS QUITTÉ SANS ENREGISTRER. Sur un brouillon enregistré,
// « persisté » et « en mémoire » sont indistinguables — c'est tout le sujet.
describe('⚠️ le brouillon de routine vit sur l’appareil', () => {
  const NEUF = () => ({
    id: null, nom: 'Mardi', nomChange: false, existantes: [],
    exercices: [{ id: null, exercise_slug: 'dc', repos_cible_s: 120,
                  groupe_superset: null, note: null, series: [L({ reps: 5 })] }]
  });
  const local = (o) => Object.assign({
    modifie_a: '2026-09-17T09:00:00.000Z', nom: 'Mardi', brouillon: NEUF()
  }, o || {});

  test('un enregistrement local se relit tel quel, exercices compris', () => {
    const b = Routines.brouillonReprenable(local(), null);
    expect(b).not.toBeNull();
    expect(b.nom).toBe('Mardi');
    expect(b.exercices.length).toBe(1);
    expect(b.exercices[0].series[0].reps).toBe(5);
  });

  // ⚠️ IL NE SE DÉVERSE PAS DANS N'IMPORTE QUEL ÉDITEUR. Un brouillon de la
  // routine Y ouvert dans l'éditeur de X écraserait X à l'écran — et le
  // premier enregistrement écrirait Y sous le nom de X.
  test('il ne reprend QUE sur sa propre routine', () => {
    const deY = local({ brouillon: Object.assign(NEUF(), { id: 'r-Y' }) });
    expect(Routines.brouillonReprenable(deY, 'r-Y')).not.toBeNull();
    expect(Routines.brouillonReprenable(deY, 'r-X')).toBeNull();
    expect(Routines.brouillonReprenable(deY, null)).toBeNull();
    // Une création porte `null`, et `undefined` est ramené dessus — sinon un
    // appelant qui passe l'un ne retrouverait jamais ce que l'autre a écrit.
    expect(Routines.brouillonReprenable(local(), undefined)).not.toBeNull();
    expect(Routines.brouillonReprenable(local(), '')).not.toBeNull();
    // ⚠️ ET DE L'AUTRE CÔTÉ AUSSI. Un brouillon écrit par une version qui
    // n'avait pas encore de champ `id` n'en porte pas du tout : sans le
    // ramener sur `null`, il ne se reprendrait JAMAIS, et le bandeau
    // renverrait sur un éditeur qui ne le retrouve pas.
    const sansChamp = local({ brouillon: NEUF() });
    delete sansChamp.brouillon.id;
    expect(Routines.brouillonReprenable(sansChamp, null)).not.toBeNull();
    expect(Routines.brouillonReprenable(sansChamp, 'r-Y')).toBeNull();
  });

  // Il vient du disque : il a pu être écrit par une version précédente.
  test('une forme inattendue ne casse rien — elle ne signale rien', () => {
    [null, undefined, {}, { brouillon: null }, { brouillon: {} },
     { brouillon: { exercices: 'trois' } }].forEach((mauvais) => {
      expect(Routines.brouillonASignaler(mauvais)).toBeNull();
      expect(Routines.brouillonReprenable(mauvais, null)).toBeNull();
    });
  });

  // 8. Ce que le bandeau annonce.
  test('ce qu’il y a à signaler : le nom, l’ancienneté, le nombre d’exercices', () => {
    expect(Routines.brouillonASignaler(local())).toEqual({
      id: null, nom: 'Mardi', modifie_a: '2026-09-17T09:00:00.000Z', nbExercices: 1
    });
    // Le nom du disque prime sur celui du brouillon — c'est le champ tel qu'il
    // était à la dernière frappe.
    const renomme = local({ nom: '  Jeudi  ' });
    expect(Routines.brouillonASignaler(renomme).nom).toBe('Jeudi');
    // Sans nom, on ne prétend pas en avoir un : c'est l'écran qui dira
    // « Sans nom ».
    expect(Routines.brouillonASignaler(local({ nom: '   ', brouillon:
      Object.assign(NEUF(), { nom: '' }) })).nom).toBe('');
  });
});

// ⚠️ L'ANCIENNETÉ RÈGLE LE SEUIL SANS QU'ON EN FIXE UN (§7 nonies). On n'a
// jamais su dire à partir de quand un brouillon devient un oubli : on ne le dit
// pas, on affiche « depuis 3 jours » et ça se lit tout seul.
describe('⚠️ l’ancienneté, en clair', () => {
  const T = (iso) => Date.parse(iso);
  const depuis = '2026-09-17T09:00:00.000Z';

  test('à l’instant, en minutes, en heures, en jours', () => {
    expect(Modele.anciennete(depuis, T('2026-09-17T09:00:30.000Z'))).toBe('à l’instant');
    expect(Modele.anciennete(depuis, T('2026-09-17T09:00:59.999Z'))).toBe('à l’instant');
    expect(Modele.anciennete(depuis, T('2026-09-17T09:01:00.000Z'))).toBe('depuis 1 min');
    expect(Modele.anciennete(depuis, T('2026-09-17T09:42:00.000Z'))).toBe('depuis 42 min');
    expect(Modele.anciennete(depuis, T('2026-09-17T11:00:00.000Z'))).toBe('depuis 2 h');
    expect(Modele.anciennete(depuis, T('2026-09-18T08:59:00.000Z'))).toBe('depuis 23 h');
    expect(Modele.anciennete(depuis, T('2026-09-18T09:00:00.000Z'))).toBe('depuis 1 jour');
    // L'exemple du §7 octodecies.3, et le pluriel qui va avec.
    expect(Modele.anciennete(depuis, T('2026-09-20T09:00:00.000Z'))).toBe('depuis 3 jours');
  });

  // ⚠️ UNE HORLOGE D'APPAREIL EN AVANCE NE DOIT PAS PRODUIRE « depuis -2 h ».
  test('le futur et l’illisible retombent sur quelque chose de vrai', () => {
    expect(Modele.anciennete(depuis, T('2026-09-17T07:00:00.000Z'))).toBe('à l’instant');
    expect(Modele.anciennete(null, T(depuis))).toBe('');
    expect(Modele.anciennete('pas une date', T(depuis))).toBe('');
    expect(Modele.anciennete(depuis, NaN)).toBe('');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LE BANDEAU — UN SEUL COMPOSANT POUR DEUX SUJETS (§7 nonies, §7 octodecies.3)
// ════════════════════════════════════════════════════════════════════════════
describe('⚠️ le bandeau de reprise sert aux deux', () => {
  const rendre = (vue) => {
    const cible = document.createElement('div');
    Rendu().rendreBandeauReprise(cible, vue);
    return cible;
  };
  const VUE = (o) => Object.assign({
    quoi: 'Routine en cours d’édition', sujet: 'Mardi', depuis: 'depuis 3 jours',
    surReprendre: () => {}, surQuitter: () => {}
  }, o || {});

  test('il dit quoi, sur quoi, et depuis quand', () => {
    const c = rendre(VUE());
    expect(c.hidden).toBe(false);
    expect(c.querySelector('.reprise-quoi').textContent).toBe('Routine en cours d’édition');
    expect(c.querySelector('.reprise-sujet').textContent).toBe('Mardi');
    expect(c.querySelector('.reprise-depuis').textContent).toBe('depuis 3 jours');
  });

  test('deux actions, et chacune appelle la sienne', () => {
    const vus = [];
    const c = rendre(VUE({
      surReprendre: () => vus.push('reprendre'), surQuitter: () => vus.push('quitter')
    }));
    const b = [...c.querySelectorAll('.reprise-actions button')];
    expect(b.map((x) => x.textContent)).toEqual(['Abandonner', 'Reprendre']);
    b.forEach((x) => x.click());
    expect(vus).toEqual(['quitter', 'reprendre']);
  });

  // ⚠️ C'EST LE MÊME COMPOSANT QUE POUR LA SÉANCE (§7 nonies), et c'est tout
  // l'objet de l'avoir écrit ici : deux bandeaux pour la même question auraient
  // été la duplication du §2 undecies avant même d'exister. Ce qui varie est
  // donné par l'appelant ; le mécanisme, non.
  test('la séance en cours l’utilise tel quel — seuls les libellés changent', () => {
    const seance = rendre(VUE({
      quoi: 'Séance en cours', sujet: 'Mardi — Pecs Dos', depuis: 'depuis 2 h',
      libelleQuitter: 'Terminer', libelleReprendre: 'Reprendre'
    }));
    expect([...seance.querySelectorAll('.reprise-actions button')].map((x) => x.textContent))
      .toEqual(['Terminer', 'Reprendre']);
    // Même structure des deux côtés : c'est ça, « le même composant ».
    const routine = rendre(VUE());
    const forme = (n) => [...n.querySelectorAll('*')].map((x) => x.className).join('|');
    expect(forme(seance)).toBe(forme(routine));
  });

  test('rien à signaler : le bandeau se cache, il ne rend pas une coquille vide', () => {
    const c = rendre(null);
    expect(c.hidden).toBe(true);
    expect(c.querySelectorAll('.bandeau-reprise').length).toBe(0);
    expect(rendre({}).hidden).toBe(true);
  });

  // ⚠️ RIEN N'EST DESTRUCTIF AU TAP. « Abandonner » n'efface rien lui-même : il
  // appelle son gestionnaire, et c'est l'appelant qui demande confirmation. Un
  // bandeau qui effacerait un brouillon de trois jours au premier tap serait le
  // pire endroit pour un geste irréversible.
  test('« Abandonner » ne fait qu’appeler — il n’efface pas lui-même', () => {
    let appels = 0;
    const c = rendre(VUE({ surQuitter: () => { appels++; } }));
    c.querySelector('.reprise-actions button').click();
    expect(appels).toBe(1);
  });
});
