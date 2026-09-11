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

// ── 3 et 4. La cible du retour ──────────────────────────────────────────────
describe('decisionRetour — quatre issues réellement distinctes', () => {
  const depuis = (chemin, ctx) => R.decisionRetour(R.analyser(chemin), ctx).action;

  test('depuis le détail d’une séance : l’historique fait le travail', () => {
    expect(depuis('/seance/' + UUID)).toBe('historique');
  });

  test('depuis une semaine : l’historique aussi', () => {
    expect(depuis('/semaine/2026-09-07')).toBe('historique');
  });

  test('depuis la racine : on demande avant de quitter', () => {
    expect(depuis('/')).toBe('confirmer');
  });

  test('depuis la connexion : on quitte sans rien demander', () => {
    expect(depuis('/connexion')).toBe('quitter');
  });

  test('les quatre issues sont deux à deux distinctes', () => {
    const actions = ['/seance/' + UUID, '/', '/connexion'].map(c => depuis(c));
    actions.push(R.decisionRetour(R.analyser('/'), { gardes: [() => ({ raison: 'test' })] }).action);
    expect(new Set(actions).size).toBe(4);
  });

  test('une URL inconnue se comporte comme la racine — elle demande', () => {
    expect(depuis('/nawak')).toBe('confirmer');
  });
});

// ── 5. Le point d’accroche : une vue peut refuser la sortie ─────────────────
describe('gardes — une vue peut refuser la sortie', () => {
  test('une garde bloquante l’emporte sur tout le reste', () => {
    const garde = () => ({ raison: 'seance-en-cours', question: 'Abandonner la séance ?' });
    // Même depuis la connexion, où l'on quitterait normalement sans rien demander.
    const d = R.decisionRetour(R.analyser('/connexion'), { gardes: [garde] });
    expect(d.action).toBe('garde');
    expect(d.garde.raison).toBe('seance-en-cours');
    expect(d.garde.question).toBe('Abandonner la séance ?');
  });

  test('une garde qui laisse passer ne change rien', () => {
    const d = R.decisionRetour(R.analyser('/seance/' + UUID), { gardes: [() => null] });
    expect(d.action).toBe('historique');
  });

  test('la première garde bloquante gagne, et les suivantes ne sont pas consultées', () => {
    const vues = [];
    const g1 = () => { vues.push('g1'); return null; };
    const g2 = () => { vues.push('g2'); return { raison: 'deux' }; };
    const g3 = () => { vues.push('g3'); return { raison: 'trois' }; };
    const d = R.decisionRetour(R.analyser('/'), { gardes: [g1, g2, g3] });
    expect(d.garde.raison).toBe('deux');
    expect(vues).toEqual(['g1', 'g2']);
  });

  test('aucune garde, garde absente ou non-fonction : rien ne casse', () => {
    expect(R.premiereGardeBloquante(null)).toBeNull();
    expect(R.premiereGardeBloquante([])).toBeNull();
    expect(R.premiereGardeBloquante(['pas une fonction', null])).toBeNull();
  });
});
