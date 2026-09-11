/** @jest-environment node */
//
// v2/js/sortie.js — le bouton retour.
//
// Décision produit : au fond de la pile, le retour ne fait RIEN. Il est absorbé
// par l'ancre, réinstallée à chaque fois. Au-dessus du fond, il navigue.
//
// Le banc donne au mécanisme un History de PAPIER : une vraie pile d'entrées,
// un index, et un compteur de DÉBORDEMENTS — les reculs demandés au-delà de
// l'entrée par laquelle l'app est entrée. C'était le défaut du chantier
// précédent ; le test qui le surveille est conservé tel quel.
//
// LA CONFIGURATION COMPTE PLUS QUE LE NOMBRE (CADRAGE-V2 §2 quater).
// « Réinstalle » et « ne réinstalle pas » ne donnent des résultats différents
// que sur une pile MINIMALE : une seule entrée de lancement, rien dessous, et
// rien que l'app ait empilé. Partout ailleurs il reste toujours quelque chose à
// consommer, et les deux comportements sont indistinguables. Chaque test de la
// réinstallation tourne donc sur `pileMinimale()`, et sa contrepartie permissive
// `pileProfonde()` est là pour prouver l'ASYMÉTRIE, pas pour rassurer.
//
//   avant = 0 → PWA lancée depuis l'icône : rien sous l'entrée de lancement.
//   avant = 1 → onglet Chrome : une page précédente.

const Routeur = require('../../v2/js/routeur.js');
const Sortie = require('../../v2/js/sortie.js');

const UUID = '11111111-2222-3333-4444-555555555555';
const LUNDI = new Date(2026, 8, 7);

function creerBanc(options) {
  const o = options || {};
  const gardes = o.gardes || [];
  let entrees = [];
  for (let i = 0; i < (o.avant || 0); i++) entrees.push({ etat: null, chemin: '/page-' + i });
  entrees.push({ etat: o.etat === undefined ? null : o.etat, chemin: o.chemin || '/' });

  const lancement = entrees.length - 1;
  let index = lancement;

  const journal = [];        // tout ce que l'app demande à History
  const rendus = [];         // vues rendues — un retour absorbé n'en produit AUCUNE
  const evenements = [];     // 'fermeture' | 'sortie-du-document' | 'redemarrage-a-froid'
  let debordements = 0;

  const hist = {
    get state() { return entrees[index].etat; },
    pushState(etat, titre, chemin) {
      journal.push({ op: 'pushState', chemin, ancre: !!(etat && etat.ancre) });
      entrees = entrees.slice(0, index + 1);
      entrees.push({ etat, chemin });
      index = entrees.length - 1;
    },
    replaceState(etat, titre, chemin) {
      journal.push({ op: 'replaceState', chemin, ancre: !!(etat && etat.ancre) });
      entrees[index] = { etat, chemin };
    },
    back() { hist.go(-1); },
    go(delta) {
      journal.push({ op: 'go', delta });
      const cible = index + delta;
      if (cible < lancement) {
        debordements += 1;
        evenements.push('redemarrage-a-froid');
        index = Math.max(0, cible);
        return;
      }
      index = cible;
      sortie.surRetour();
    }
  };

  const sortie = Sortie.creer({
    history: hist,
    routeur: Routeur,
    chemin: () => entrees[index].chemin,
    etatHistorique: () => hist.state,
    gardes: () => gardes,
    rendre: (route) => rendus.push(route.vue)
  });

  // L'appui sur le bouton retour d'Android. Ce que fait le SYSTÈME, pas l'app.
  function retourSysteme() {
    if (index === 0) { evenements.push('fermeture'); return 'fermeture'; }
    if (index - 1 < lancement) { index -= 1; evenements.push('sortie-du-document'); return 'sortie-du-document'; }
    index -= 1;
    sortie.surRetour();
    return 'popstate';
  }

  // Miroir minimal de `allerA` (app.js).
  function naviguer(vue, params) {
    const chemin = Routeur.construire(vue, params);
    let empilee = false;
    if (chemin !== entrees[index].chemin) { hist.pushState({ vue }, '', chemin); empilee = true; }
    sortie.apresNavigation(empilee);
  }
  function ouvrir() { sortie.apresNavigation(false); }
  const ancres = () => journal.filter((e) => e.ancre).length;

  return {
    ouvrir, naviguer, retourSysteme, ancres,
    journal, rendus, evenements,
    chemin: () => entrees[index].chemin,
    debordements: () => debordements,
    profondeur: () => entrees.length,        // hauteur réelle de la pile
    position: () => index,
    etat: () => sortie.etat()
  };
}

// La configuration où les deux comportements DIFFÈRENT : une seule entrée,
// rien dessous, rien d'empilé. C'est la PWA lancée depuis l'icône.
function pileMinimale(options) {
  const b = creerBanc(Object.assign({ avant: 0 }, options || {}));
  b.ouvrir();
  return b;
}

// La configuration PERMISSIVE : l'app a empilé ses propres entrées, donc un
// retour trouve toujours quelque chose à consommer. Les deux comportements y
// sont indistinguables — c'est précisément ce qu'on veut démontrer.
function pileProfonde(n) {
  const b = creerBanc({ avant: 0 });
  b.ouvrir();
  for (let i = 0; i < (n || 12); i++) {
    b.naviguer(Routeur.SEMAINE, { lundi: new Date(2026, 8, 7 - 7 * i) });
  }
  return b;
}

// ── 1 et 2. La réinstallation, sur la seule pile qui la distingue ──────────
describe('v2/sortie — pile MINIMALE : l’entrée consommée est rendue', () => {
  test('une absorption : l’ancre est réinstallée, la profondeur revient à son état initial', () => {
    const b = pileMinimale();
    const profondeurAuRepos = b.profondeur();
    const positionAuRepos = b.position();
    expect(profondeurAuRepos).toBe(2);            // lancement + ancre, rien d'autre
    expect(b.ancres()).toBe(1);

    expect(b.retourSysteme()).toBe('popstate');
    expect(b.ancres()).toBe(2);                   // RENDUE, pas seulement consommée
    expect(b.profondeur()).toBe(profondeurAuRepos);
    expect(b.position()).toBe(positionAuRepos);
    expect(b.rendus).toEqual([]);
    expect(b.evenements).toEqual([]);
  });

  test('dix absorptions consécutives : jamais sous l’entrée de lancement', () => {
    const b = pileMinimale();
    for (let i = 0; i < 10; i++) {
      expect(b.retourSysteme()).toBe('popstate');
      expect(b.position()).toBeGreaterThanOrEqual(1);   // jamais retombé sur le fond
    }
    expect(b.ancres()).toBe(11);                  // 1 au démarrage + 10 rendues
    expect(b.evenements).toEqual([]);
    expect(b.rendus).toEqual([]);
    expect(b.profondeur()).toBe(2);
  });

  test('un retour qui atterrit SUR l’ancre en rend une aussi', () => {
    // Le défaut exact : cette branche rendait la vue sans rendre l'entrée.
    const b = pileMinimale();
    b.naviguer(Routeur.SEMAINE, { lundi: LUNDI });
    const ancresAvant = b.ancres();

    expect(b.retourSysteme()).toBe('popstate');   // semaine -> ancre
    expect(b.rendus).toEqual([Routeur.RACINE]);
    expect(b.ancres()).toBe(ancresAvant + 1);

    // et l'appui SUIVANT — celui qui fermait l'app — est absorbé lui aussi
    expect(b.retourSysteme()).toBe('popstate');
    expect(b.evenements).toEqual([]);
  });

  test('un état qui RESSEMBLE à une ancre, restauré d’un lancement précédent, n’en tient pas lieu', () => {
    // Android peut restaurer history.state au redémarrage de la PWA. Une ancre
    // d'hier n'est pas une entrée de rechange d'aujourd'hui.
    const b = pileMinimale({ etat: { ancre: true } });
    expect(b.ancres()).toBe(1);                   // une VRAIE ancre a été posée
    expect(b.profondeur()).toBe(2);

    expect(b.retourSysteme()).toBe('popstate');
    expect(b.retourSysteme()).toBe('popstate');
    expect(b.evenements).toEqual([]);             // l'app ne se ferme pas au 2e appui
  });

  test('en onglet aussi, pile minimale : on ne sort pas du document', () => {
    const b = creerBanc({ avant: 1 });
    b.ouvrir();
    for (let i = 0; i < 5; i++) expect(b.retourSysteme()).toBe('popstate');
    expect(b.evenements).toEqual([]);
  });
});

// ── 3. La contrepartie PERMISSIVE — non-régression, et preuve de l'asymétrie ─
describe('v2/sortie — pile profonde : le même scénario passe toujours', () => {
  test('dix retours sur une pile profonde : l’app reste, et navigue normalement', () => {
    const b = pileProfonde(12);
    for (let i = 0; i < 10; i++) expect(b.retourSysteme()).toBe('popstate');
    expect(b.evenements).toEqual([]);
    expect(b.rendus).toHaveLength(10);            // ce sont des navigations, pas des absorptions
    expect(b.debordements()).toBe(0);
  });
});

// ── 2. Le défaut corrigé au chantier précédent — test conservé ──────────────
describe('v2/sortie — aucun rembobinage au-delà des entrées de l’app', () => {
  [0, 1].forEach((avant) => {
    test(`parcours complet (${avant === 0 ? 'PWA' : 'onglet'}) : aucun débordement`, () => {
      const b = creerBanc({ avant });
      b.ouvrir();
      b.naviguer(Routeur.SEMAINE, { lundi: LUNDI });
      b.naviguer(Routeur.SEANCE, { id: UUID });

      expect(b.retourSysteme()).toBe('popstate');   // séance -> semaine
      expect(b.rendus[b.rendus.length - 1]).toBe(Routeur.SEMAINE);
      expect(b.retourSysteme()).toBe('popstate');   // semaine -> ancre -> racine
      expect(b.rendus[b.rendus.length - 1]).toBe(Routeur.RACINE);
      expect(b.retourSysteme()).toBe('popstate');   // fond de pile -> absorbé
      expect(b.retourSysteme()).toBe('popstate');

      expect(b.debordements()).toBe(0);
      expect(b.evenements).not.toContain('redemarrage-a-froid');
      expect(b.journal.filter((e) => e.op === 'go')).toEqual([]);
    });
  });
});

// ── 3. Ouverture directe sur une URL de vue ────────────────────────────────
describe('v2/sortie — une ouverture directe pose l’ancre malgré tout', () => {
  test.each([
    ['/semaine/2026-09-07'],
    ['/seance/' + UUID],
    ['/connexion'],
    ['/']
  ])('%s : ancre posée, retour absorbé, app pas fermée', (chemin) => {
    const b = creerBanc({ chemin });
    b.ouvrir();
    expect(b.journal).toEqual([{ op: 'pushState', chemin, ancre: true }]);

    expect(b.retourSysteme()).toBe('popstate');
    expect(b.rendus).toEqual([]);
    expect(b.chemin()).toBe(chemin);
    expect(b.evenements).toEqual([]);
  });
});

// ── 5. Au-dessus du fond, le retour navigue ────────────────────────────────
describe('v2/sortie — au-dessus du fond, le retour navigue normalement', () => {
  test('il rend la vue de l’entrée précédente, sans poser d’ancre', () => {
    const b = creerBanc();
    b.ouvrir();
    b.naviguer(Routeur.SEMAINE, { lundi: LUNDI });
    b.naviguer(Routeur.SEANCE, { id: UUID });
    const ancresAvant = b.ancres();

    expect(b.retourSysteme()).toBe('popstate');
    expect(b.rendus).toEqual([Routeur.SEMAINE]);
    expect(b.ancres()).toBe(ancresAvant);         // aucune ancre n'est posée
    expect(b.etat().pile).toBe(1);
  });

  test('« absorbé » et « navigue » sont réellement distinguables', () => {
    // Le MÊME geste, à deux profondeurs différentes, doit produire des effets
    // opposés — pas seulement être conforme chacun de son côté.
    // Deux entrées empilées : le retour atterrit sur une VRAIE vue, pas sur
    // l'ancre — sinon on comparerait l'absorption à elle-même.
    const profond = creerBanc();
    profond.ouvrir();
    profond.naviguer(Routeur.SEMAINE, { lundi: LUNDI });
    profond.naviguer(Routeur.SEANCE, { id: UUID });
    const aAvant = profond.ancres();
    profond.retourSysteme();
    const navigue = { rendus: profond.rendus.length, ancresPosees: profond.ancres() - aAvant };

    const fond = creerBanc();
    fond.ouvrir();
    const bAvant = fond.ancres();
    fond.retourSysteme();
    const absorbe = { rendus: fond.rendus.length, ancresPosees: fond.ancres() - bAvant };

    expect(navigue).toEqual({ rendus: 1, ancresPosees: 0 });
    expect(absorbe).toEqual({ rendus: 0, ancresPosees: 1 });
    expect(navigue).not.toEqual(absorbe);
  });
});

// ── 6. Le point d'accroche des gardes ──────────────────────────────────────
describe('v2/sortie — une vue peut toujours refuser la sortie', () => {
  test('la garde absorbe le retour et présente sa propre confirmation', () => {
    const presentees = [];
    const b = creerBanc({
      gardes: [() => ({
        question: 'Terminer la séance en cours ?',
        afficher: () => presentees.push('confirmation de la garde')
      })]
    });
    b.ouvrir();
    b.naviguer(Routeur.SEMAINE, { lundi: LUNDI });
    b.naviguer(Routeur.SEANCE, { id: UUID });
    const ancresAvant = b.ancres();

    expect(b.retourSysteme()).toBe('popstate');
    expect(presentees).toEqual(['confirmation de la garde']);
    expect(b.ancres()).toBe(ancresAvant + 1);     // le retour est absorbé
    expect(b.rendus).toEqual([]);                 // la vue gardée reste
    expect(b.evenements).toEqual([]);
    expect(b.debordements()).toBe(0);
  });

  test('une garde qui laisse passer ne change rien : le retour navigue', () => {
    const b = creerBanc({ gardes: [() => null] });
    b.ouvrir();
    b.naviguer(Routeur.SEMAINE, { lundi: LUNDI });
    b.naviguer(Routeur.SEANCE, { id: UUID });

    b.retourSysteme();
    expect(b.rendus).toEqual([Routeur.SEMAINE]);
  });

  test('une garde sans présentation ne casse rien — elle absorbe quand même', () => {
    const b = creerBanc({ gardes: [() => ({ raison: 'seance-en-cours' })] });
    b.ouvrir();
    b.naviguer(Routeur.SEMAINE, { lundi: LUNDI });
    const ancresAvant = b.ancres();

    expect(() => b.retourSysteme()).not.toThrow();
    expect(b.ancres()).toBe(ancresAvant + 1);
    expect(b.rendus).toEqual([]);
  });
});
