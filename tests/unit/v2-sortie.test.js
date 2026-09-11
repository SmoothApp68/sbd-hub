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
// Deux contextes, parce qu'ils diffèrent :
//   avant = 0 → PWA installée : rien sous l'entrée de lancement.
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
    etat: () => sortie.etat()
  };
}

// ── 1. Le retour au fond de la pile est absorbé ─────────────────────────────
describe('v2/sortie — au fond de la pile, le retour ne fait rien', () => {
  test('absorbé : ancre réinstallée, aucun rendu, rien ne bouge à l’écran', () => {
    const b = creerBanc();
    b.ouvrir();
    expect(b.journal).toEqual([{ op: 'pushState', chemin: '/', ancre: true }]);

    expect(b.retourSysteme()).toBe('popstate');   // l'ancre a absorbé l'appui
    expect(b.ancres()).toBe(2);                   // elle est RÉINSTALLÉE
    expect(b.etat().ancree).toBe(true);
    expect(b.rendus).toEqual([]);                 // rien n'est re-rendu
    expect(b.chemin()).toBe('/');                 // l'URL n'a pas bougé
    expect(b.evenements).toEqual([]);             // l'app ne se ferme pas
  });

  test('l’app ne se ferme jamais par accident, même sur dix appuis d’affilée', () => {
    const b = creerBanc();
    b.ouvrir();
    for (let i = 0; i < 10; i++) expect(b.retourSysteme()).toBe('popstate');
    expect(b.evenements).toEqual([]);
    expect(b.rendus).toEqual([]);
    expect(b.etat()).toEqual({ pile: 0, ancree: true });
  });

  test('en onglet aussi : le retour n’emmène pas hors du document', () => {
    const b = creerBanc({ avant: 1 });
    b.ouvrir();
    b.retourSysteme();
    b.retourSysteme();
    expect(b.evenements).toEqual([]);
    expect(b.etat().ancree).toBe(true);
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
    const profond = creerBanc();
    profond.ouvrir();
    profond.naviguer(Routeur.SEMAINE, { lundi: LUNDI });
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
