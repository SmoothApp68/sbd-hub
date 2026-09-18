// tests/unit/v2-routeur.test.js — routeur d'URL et bouton retour.
//
// Piège du commit précédent, évité ici : un test ne prouve rien si les cas
// qu'il oppose rendent la même chose. Les quatre issues du retour — garde,
// historique, confirmer, quitter — sont donc vérifiées deux à deux distinctes,
// et pas seulement « chacune vaut ce qu'on attend ».

const R = require('../../v2/js/routeur.js');

const lundi7sept = new Date(2026, 8, 7);          // lundi 7 septembre 2026
const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

// ── 1. URL → vue et paramètres ──────────────────────────────────────────────
describe('analyser — chemin vers vue', () => {
  test('la racine est la semaine courante', () => {
    expect(R.analyser('/').vue).toBe('racine');
    expect(R.analyser('').vue).toBe('racine');
  });

  test('une semaine porte le lundi qu’elle désigne', () => {
    const r = R.analyser('/semaine/2026-09-07');
    expect(r.vue).toBe('semaine');
    expect(r.params.lundi.getFullYear()).toBe(2026);
    expect(r.params.lundi.getMonth()).toBe(8);
    expect(r.params.lundi.getDate()).toBe(7);
    expect(r.params.lundi.getHours()).toBe(0);      // minuit local, pas UTC
  });

  test('une séance porte son identifiant', () => {
    const r = R.analyser('/seance/' + UUID);
    expect(r.vue).toBe('seance');
    expect(r.params.id).toBe(UUID);
  });

  test('la connexion a sa propre URL', () => {
    expect(R.analyser('/connexion').vue).toBe('connexion');
  });

  test('les paramètres de requête et l’ancre sont ignorés', () => {
    expect(R.analyser('/semaine/2026-09-07?x=1#bas').params.lundi.getDate()).toBe(7);
  });

  test('une URL inconnue retombe sur la racine, sans lever', () => {
    const r = R.analyser('/nawak/profond/encore');
    expect(r.vue).toBe('racine');
    expect(r.repli).toBe('inconnu');
  });
});

// ── 6. URL malformées ───────────────────────────────────────────────────────
describe('analyser — malformé, repli propre', () => {
  test.each([
    ['/semaine/2026-13-01', 'mois 13'],
    ['/semaine/2026-02-30', '30 février'],
    ['/semaine/pas-une-date', 'texte'],
    ['/semaine/20260907', 'sans tirets'],
    ['/semaine/', 'vide']
  ])('%s (%s) → racine', (chemin) => {
    const r = R.analyser(chemin);
    expect(r.vue).toBe('racine');
    expect(() => R.analyser(chemin)).not.toThrow();
  });

  test.each([
    ['/seance/123', 'trop court'],
    ['/seance/pas-un-uuid-du-tout-vraiment-pas', 'mal formé'],
    ['/seance/3f2504e0-4f89-41d3-9a0c-0305e82c330', 'un caractère en moins']
  ])('%s (%s) → racine', (chemin) => {
    expect(R.analyser(chemin).vue).toBe('racine');
  });

  test('un identifiant valide n’est pas rejeté par excès de zèle', () => {
    expect(R.analyser('/seance/' + UUID.toUpperCase()).vue).toBe('seance');
  });

  test('null et undefined ne lèvent pas', () => {
    expect(R.analyser(null).vue).toBe('racine');
    expect(R.analyser(undefined).vue).toBe('racine');
  });
});

// ── 2. Vue → URL, et aller-retour ───────────────────────────────────────────
describe('construire — vue vers chemin', () => {
  test('chaque vue produit son chemin', () => {
    expect(R.construire('racine')).toBe('/');
    expect(R.construire('semaine', { lundi: lundi7sept })).toBe('/semaine/2026-09-07');
    expect(R.construire('seance', { id: UUID })).toBe('/seance/' + UUID);
    expect(R.construire('connexion')).toBe('/connexion');
  });

  test('l’aller-retour est idempotent', () => {
    ['/', '/connexion', '/semaine/2026-09-07', '/seance/' + UUID].forEach((chemin) => {
      const r = R.analyser(chemin);
      expect(R.construire(r.vue, r.params)).toBe(chemin);
    });
  });

  test('la date est écrite en composantes locales, pas en UTC', () => {
    // toISOString() sur un minuit local décalerait d'un jour selon le fuseau.
    // Le 1er janvier à minuit est le cas où ça se voit : il deviendrait le 31/12.
    expect(R.construire('semaine', { lundi: new Date(2026, 0, 1) })).toBe('/semaine/2026-01-01');
    expect(R.versDate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  test('des paramètres invalides retombent sur la racine plutôt que de produire un lien cassé', () => {
    expect(R.construire('semaine', {})).toBe('/');
    expect(R.construire('semaine', { lundi: 'pas une date' })).toBe('/');
    expect(R.construire('seance', { id: 'bidon' })).toBe('/');
  });
});


// ── Onglets ────────────────────────────────────────────────────────────────
describe('onglets — chaque onglet est une vue avec son URL', () => {
  test.each([
    ['/saisie', 'saisie'],
    ['/progression', 'progression'],
    ['/profil', 'profil']
  ])('%s résout vers la vue %s', (chemin, vue) => {
    const r = R.analyser(chemin);
    expect(r.vue).toBe(vue);
    expect(r.repli).toBeUndefined();
    expect(R.construire(vue, {})).toBe(chemin);
  });

  test('l’aller-retour URL ↔ vue est idempotent pour les quatre onglets', () => {
    R.ONGLETS.forEach((vue) => {
      expect(R.analyser(R.construire(vue, {})).vue).toBe(vue);
    });
  });

  test('la racine est l’onglet Séances, et son chemin reste « / »', () => {
    expect(R.construire('racine', {})).toBe('/');
    expect(R.analyser('/').vue).toBe('racine');
    expect(R.ONGLETS[0]).toBe('racine');
  });

  test('un onglet inconnu retombe sur la racine, sans erreur', () => {
    expect(R.analyser('/reglages').repli).toBe('inconnu');
    expect(R.analyser('/saisie/truc').repli).toBe('inconnu');
  });

  test('une vue authentifiée : un onglet exige une session comme le reste', () => {
    R.ONGLETS.forEach((vue) => {
      expect(R.routeAffichable({ vue, params: {} }, { session: null }).vue).toBe('connexion');
    });
  });
});

describe('ongletDe — l’onglet actif reflète la vue courante', () => {
  test.each([
    ['racine', 'racine'],
    ['semaine', 'racine'],
    ['seance', 'racine'],
    ['saisie', 'saisie'],
    ['progression', 'progression'],
    ['profil', 'profil']
  ])('la vue %s allume l’onglet %s', (vue, onglet) => {
    expect(R.ongletDe(vue)).toBe(onglet);
  });

  test('la connexion n’allume aucun onglet — la barre n’y est pas', () => {
    expect(R.ongletDe('connexion')).toBeNull();
    expect(R.ongletDe('nawak')).toBeNull();
  });

  test('une semaine et un détail allument le MÊME onglet que la racine', () => {
    // Sinon la barre changerait d'onglet en ouvrant une séance.
    expect(new Set(['racine', 'semaine', 'seance'].map(R.ongletDe)).size).toBe(1);
  });
});

// ── 3 et 4. La route affichable : sans session, rien d'authentifié ──────────
describe('routeAffichable — une vue authentifiée exige une session', () => {
  const avec = (chemin, session) => R.routeAffichable(R.analyser(chemin), { session });
  const SESSION = { user: { id: 'u' } };

  test.each([
    ['/'],
    ['/semaine/2026-09-07'],
    ['/seance/' + UUID]
  ])('%s sans session renvoie à la connexion, et dit d’où l’on vient', (chemin) => {
    const r = avec(chemin, null);
    expect(r.vue).toBe('connexion');
    expect(r.redirigeDepuis).toBe(R.analyser(chemin).vue);
  });

  test.each([
    ['/', 'racine'],
    ['/semaine/2026-09-07', 'semaine'],
    ['/seance/' + UUID, 'seance']
  ])('%s avec session est rendue telle quelle', (chemin, vue) => {
    const r = avec(chemin, SESSION);
    expect(r.vue).toBe(vue);
    expect(r.redirigeDepuis).toBeUndefined();
  });

  test('la connexion n’exige pas de session — sinon elle se renverrait à elle-même', () => {
    expect(R.exigeSession('connexion')).toBe(false);
    const r = avec('/connexion', null);
    expect(r.vue).toBe('connexion');
    expect(r.redirigeDepuis).toBeUndefined();
  });

  test('les deux issues sont réellement distinctes sur la MÊME route', () => {
    const sans = avec('/semaine/2026-09-07', null);
    const avecSession = avec('/semaine/2026-09-07', SESSION);
    expect(sans.vue).not.toBe(avecSession.vue);
    expect(sans).not.toEqual(avecSession);
  });

  test('une session absente sous toutes ses formes renvoie à la connexion', () => {
    [null, undefined, false, ''].forEach((s) => {
      expect(R.routeAffichable({ vue: 'racine', params: {} }, { session: s }).vue).toBe('connexion');
    });
    expect(R.routeAffichable({ vue: 'racine', params: {} }).vue).toBe('connexion');
  });
});

// ── 5. Le point d’accroche : une vue peut refuser la sortie ─────────────────
describe('gardes — une vue peut refuser la sortie', () => {
  test('une garde bloquante rend son verdict, avec de quoi se présenter', () => {
    const garde = () => ({ raison: 'seance-en-cours', question: 'Abandonner la séance ?' });
    const v = R.premiereGardeBloquante([garde]);
    expect(v.raison).toBe('seance-en-cours');
    expect(v.question).toBe('Abandonner la séance ?');
  });

  test('une garde qui laisse passer ne bloque rien', () => {
    expect(R.premiereGardeBloquante([() => null])).toBeNull();
  });

  test('la première garde bloquante gagne, et les suivantes ne sont pas consultées', () => {
    const vues = [];
    const g1 = () => { vues.push('g1'); return null; };
    const g2 = () => { vues.push('g2'); return { raison: 'deux' }; };
    const g3 = () => { vues.push('g3'); return { raison: 'trois' }; };
    expect(R.premiereGardeBloquante([g1, g2, g3]).raison).toBe('deux');
    expect(vues).toEqual(['g1', 'g2']);
  });

  test('aucune garde, garde absente ou non-fonction : rien ne casse', () => {
    expect(R.premiereGardeBloquante(null)).toBeNull();
    expect(R.premiereGardeBloquante([])).toBeNull();
    expect(R.premiereGardeBloquante(['pas une fonction', null])).toBeNull();
  });
});

// ── Les vues sous Progression (chantier 16) ────────────────────────────────
//
// CONFIGURATION DISCRIMINANTE : on teste les DEUX sous-chemins ET un
// sous-chemin inconnu. Avec « /progression/volume » seul, « reconnaître la
// liste des sous-vues » et « accepter n'importe quel second segment » donnent
// le même résultat, et le banc ne prouve rien.
describe('Progression est un sommaire, et ses blocs ont leur propre chemin', () => {
  test('/progression reste le SOMMAIRE, pas une des vues', () => {
    expect(R.analyser('/progression')).toEqual({ vue: R.PROGRESSION, params: {} });
  });

  test('/progression/volume et /progression/poids ouvrent leur vue', () => {
    expect(R.analyser('/progression/volume')).toEqual({ vue: R.VOLUME, params: {} });
    expect(R.analyser('/progression/poids')).toEqual({ vue: R.POIDS, params: {} });
  });

  test('un sous-chemin inconnu retombe sur le SOMMAIRE, pas sur la racine', () => {
    const r = R.analyser('/progression/exercices');
    expect(r.vue).toBe(R.PROGRESSION);
    expect(r.repli).toBe('sous-vue-inconnue');
    // Un lien qui a vieilli reste dans Progression : c'est le moins surprenant.
    expect(r.vue).not.toBe(R.RACINE);
  });

  test('l’aller-retour construire/analyser est idempotent sur les deux vues', () => {
    [R.VOLUME, R.POIDS].forEach((v) => {
      const chemin = R.construire(v, {});
      expect(chemin).toBe('/progression/' + v);
      expect(R.analyser(chemin).vue).toBe(v);
    });
  });

  test('les deux vues allument l’onglet PROGRESSION, pas un onglet à elles', () => {
    expect(R.ongletDe(R.VOLUME)).toBe(R.PROGRESSION);
    expect(R.ongletDe(R.POIDS)).toBe(R.PROGRESSION);
    // Et elles ne s'ajoutent pas à la barre : quatre onglets, pas six.
    expect(R.ONGLETS).toHaveLength(4);
    expect(R.ONGLETS).not.toContain(R.VOLUME);
  });

  test('elles exigent une session, comme toute vue de données', () => {
    expect(R.routeAffichable({ vue: R.POIDS, params: {} }, { session: null }).vue)
      .toBe(R.CONNEXION);
    expect(R.routeAffichable({ vue: R.VOLUME, params: {} }, { session: { user: {} } }).vue)
      .toBe(R.VOLUME);
  });

  test('un chemin à trois segments sous progression n’est pas une vue', () => {
    expect(R.analyser('/progression/volume/2026').vue).toBe(R.RACINE);
  });
});

// ── L'éditeur de routine (chantier 21) ─────────────────────────────────────
//
// Il est une VUE avec son URL, sur le modèle de `/seance/<uuid>` : un
// rechargement direct la rouvre, et le retour d'Android remonte à la
// bibliothèque sans qu'on ait à l'écrire.

describe('l’éditeur de routine a son propre chemin', () => {
  const UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  test('/routine/<uuid> et /routine/nouvelle sont deux formes de la même vue', () => {
    expect(R.analyser('/routine/' + UUID)).toEqual({ vue: R.ROUTINE, params: { id: UUID } });
    expect(R.analyser('/routine/nouvelle')).toEqual({ vue: R.ROUTINE, params: { neuve: true } });
  });

  test('l’aller-retour construire/analyser est idempotent', () => {
    expect(R.construire(R.ROUTINE, { id: UUID })).toBe('/routine/' + UUID);
    expect(R.construire(R.ROUTINE, { neuve: true })).toBe('/routine/nouvelle');
    expect(R.analyser(R.construire(R.ROUTINE, { id: UUID })).params.id).toBe(UUID);
  });

  test('un id malformé retombe sur la BIBLIOTHÈQUE, pas sur la racine', () => {
    // Un lien qui a vieilli reste dans l'onglet où on l'a suivi : c'est le
    // moins surprenant, et c'est déjà la règle des sous-chemins de Progression.
    const r = R.analyser('/routine/bidon');
    expect(r.vue).toBe(R.SAISIE);
    expect(r.repli).toBe('id-invalide');
    expect(R.construire(R.ROUTINE, {})).toBe('/saisie');
  });

  test('elle allume l’onglet SAISIE, et n’ajoute pas un onglet à elle', () => {
    expect(R.ongletDe(R.ROUTINE)).toBe(R.SAISIE);
    expect(R.ONGLETS).toHaveLength(4);
    expect(R.ONGLETS).not.toContain(R.ROUTINE);
  });

  test('elle exige une session : une routine est une donnée de compte', () => {
    expect(R.routeAffichable({ vue: R.ROUTINE, params: { id: UUID } }, { session: null }).vue)
      .toBe(R.CONNEXION);
  });

  test('« routine » ne mange pas « seance » : les deux motifs cohabitent', () => {
    expect(R.analyser('/seance/' + UUID).vue).toBe(R.SEANCE);
    expect(R.ongletDe(R.SEANCE)).toBe(R.RACINE);
    expect(R.analyser('/routine/' + UUID + '/extra').vue).toBe(R.RACINE);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CHANTIER 46 §2 — /inscription et /profil/exercices
// ════════════════════════════════════════════════════════════════════════════

describe('l’inscription est une VUE, pas un repli de la connexion', () => {
  test('elle a son chemin, et l’aller-retour est idempotent', () => {
    expect(R.analyser('/inscription').vue).toBe(R.INSCRIPTION);
    expect(R.construire(R.INSCRIPTION, {})).toBe('/inscription');
  });

  // ⚠️ SANS ÇA, C'EST UNE BOUCLE. L'inscription est l'écran où l'on n'a, par
  // définition, pas encore de compte : la renvoyer à la connexion faute de
  // session la rendrait inatteignable.
  test('elle n’exige PAS de session — sinon on ne pourrait jamais s’inscrire', () => {
    expect(R.exigeSession(R.INSCRIPTION)).toBe(false);
    expect(R.routeAffichable({ vue: R.INSCRIPTION, params: {} }, { session: null }).vue)
      .toBe(R.INSCRIPTION);
  });

  // L'envers : les deux écrans d'entrée n'ont plus de sens une fois la session
  // ouverte. Un rechargement sur /connexion avec un jeton valide doit rendre
  // l'app, pas un formulaire.
  test('les deux écrans d’entrée sont interdits AVEC une session', () => {
    expect(R.interditAvecSession(R.CONNEXION)).toBe(true);
    expect(R.interditAvecSession(R.INSCRIPTION)).toBe(true);
    expect(R.interditAvecSession(R.PROFIL)).toBe(false);
    expect(R.interditAvecSession(R.RACINE)).toBe(false);
  });

  test('elle n’allume aucun onglet — la barre n’est pas affichée', () => {
    expect(R.ongletDe(R.INSCRIPTION)).toBe(null);
    expect(R.ONGLETS).not.toContain(R.INSCRIPTION);
  });
});

describe('« Tous mes exercices » vit SOUS le profil', () => {
  test('son chemin dit d’où l’on vient, et l’onglet reste Profil', () => {
    expect(R.analyser('/profil/exercices').vue).toBe(R.EXERCICES);
    expect(R.construire(R.EXERCICES, {})).toBe('/profil/exercices');
    expect(R.ongletDe(R.EXERCICES)).toBe(R.PROFIL);
  });

  // Même règle que Progression : un lien qui a vieilli reste dans l'écran qu'il
  // visait. Retomber sur la racine enverrait ailleurs pour rien.
  test('un sous-chemin inconnu reste DANS le profil', () => {
    const r = R.analyser('/profil/nimporte');
    expect(r.vue).toBe(R.PROFIL);
    expect(r.repli).toBe('sous-vue-inconnue');
  });

  test('elle exige une session : c’est l’historique d’un compte', () => {
    expect(R.routeAffichable({ vue: R.EXERCICES, params: {} }, { session: null }).vue)
      .toBe(R.CONNEXION);
  });

  // ⚠️ « exercices » (la liste, sous /profil) ET « exercice » (la page, à la
  // racine) sont DEUX vues, et leurs motifs ne doivent pas se manger.
  test('« exercices » ne mange pas « exercice » : les deux motifs cohabitent', () => {
    expect(R.analyser('/exercice/squat-barre').vue).toBe(R.EXERCICE);
    expect(R.analyser('/exercice/squat-barre').params.slug).toBe('squat-barre');
    expect(R.analyser('/profil/exercices').vue).toBe(R.EXERCICES);
    expect(R.analyser('/exercices').vue).toBe(R.RACINE);
  });
});
