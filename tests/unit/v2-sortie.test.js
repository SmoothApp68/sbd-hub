/** @jest-environment node */
//
// v2/js/sortie.js — le bouton retour et la sortie.
//
// Le banc d'essai donne au mécanisme un History de PAPIER : une vraie pile
// d'entrées, un index, et un compteur de DÉBORDEMENTS — les reculs demandés
// au-delà de l'entrée par laquelle l'app est entrée. C'est exactement le défaut
// corrigé (`history.go(-(profondeur + 2))`), et c'est ce compteur qui le prouve
// absent, plutôt qu'une assertion sur du vocabulaire qui n'existe plus.
//
// Deux contextes, parce qu'ils diffèrent et que c'est le piège du chantier :
//   avant = 0 → PWA installée : rien sous l'entrée de lancement, le retour ferme.
//   avant = 1 → onglet Chrome : une page précédente, le retour quitte le document.

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

  const lancement = entrees.length - 1;   // l'entrée par laquelle l'app est entrée
  let index = lancement;

  const journal = [];        // tout ce que l'app demande à History
  const questions = [];      // { garde, oui, non }
  const rendus = [];         // vues rendues
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
        // L'app sort de ses propres entrées : navigation de DOCUMENT, pas de
        // popstate — la coquille se recharge. C'est le redémarrage à froid.
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
    demander: (garde, oui, non) => questions.push({ garde, oui, non }),
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

  // Miroir minimal de `allerA` (app.js) : le mécanisme ne connaît que le couple
  // « on a empilé / on n'a pas empilé ».
  function naviguer(vue, params) {
    const chemin = Routeur.construire(vue, params);
    let empilee = false;
    if (chemin !== entrees[index].chemin) { hist.pushState({ vue }, '', chemin); empilee = true; }
    sortie.apresNavigation({ vue, params: params || {} }, empilee);
  }

  function ouvrir() { sortie.apresNavigation(Routeur.analyser(entrees[index].chemin), false); }
  function repondre(oui) {
    const q = questions[questions.length - 1];
    if (oui) q.oui(); else q.non();
  }
  const ancres = () => journal.filter((e) => e.ancre).length;

  return {
    ouvrir, naviguer, retourSysteme, repondre, ancres,
    journal, questions, rendus, evenements,
    debordements: () => debordements,
    etat: () => sortie.etat()
  };
}

describe('v2/sortie — premier retour sur la vue racine', () => {
  test('l\'ancre est posée à l\'ouverture, absorbe l\'appui, la question s\'affiche, l\'app reste', () => {
    const b = creerBanc();
    b.ouvrir();
    expect(b.journal).toEqual([{ op: 'pushState', chemin: '/', ancre: true }]);
    expect(b.etat().ancree).toBe(true);

    expect(b.retourSysteme()).toBe('popstate');   // sans ancre, le système aurait fermé ici
    expect(b.questions).toHaveLength(1);
    expect(b.questions[0].garde).toBeUndefined();
    expect(b.evenements).toEqual([]);             // ni fermeture, ni redémarrage à froid
    expect(b.etat().ancree).toBe(true);           // l'entrée est RÉINSTALLÉE
    expect(b.ancres()).toBe(2);
  });
});

describe('v2/sortie — refus', () => {
  test('retour à l\'état initial : l\'interception est toujours active', () => {
    const b = creerBanc();
    b.ouvrir();
    b.retourSysteme();
    b.repondre(false);

    expect(b.etat()).toEqual({ pile: 0, intercepte: true, ancree: true });
    expect(b.evenements).toEqual([]);

    // La preuve n'est pas le drapeau : c'est que le geste suivant est repris.
    expect(b.retourSysteme()).toBe('popstate');
    expect(b.questions).toHaveLength(2);
    expect(b.evenements).toEqual([]);
  });
});

describe('v2/sortie — confirmation', () => {
  test('l\'interception est levée : le retour suivant n\'est plus capté et le système ferme', () => {
    const b = creerBanc();
    b.ouvrir();
    b.retourSysteme();
    b.repondre(true);

    expect(b.etat().intercepte).toBe(false);
    expect(b.etat().ancree).toBe(false);          // l'ancre a été rendue au système
    expect(b.debordements()).toBe(0);

    expect(b.retourSysteme()).toBe('fermeture');  // Android ferme la PWA
    expect(b.questions).toHaveLength(1);          // aucune nouvelle question
    expect(b.evenements).toEqual(['fermeture']);
  });

  test('en onglet : le retour suivant quitte le document, sans redémarrage à froid', () => {
    const b = creerBanc({ avant: 1 });
    b.ouvrir();
    b.retourSysteme();
    b.repondre(true);

    expect(b.retourSysteme()).toBe('sortie-du-document');
    expect(b.evenements).not.toContain('redemarrage-a-froid');
    expect(b.debordements()).toBe(0);
  });
});

describe('v2/sortie — aucun rembobinage au-delà des entrées de l\'app', () => {
  // Le défaut corrigé. Parcours complet : ouverture, deux vues empilées, trois
  // retours, confirmation, retour final.
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
      expect(b.questions).toHaveLength(0);          // aucune question en chemin

      expect(b.retourSysteme()).toBe('popstate');   // racine -> question
      expect(b.questions).toHaveLength(1);
      b.repondre(true);
      b.retourSysteme();

      expect(b.debordements()).toBe(0);
      expect(b.evenements).not.toContain('redemarrage-a-froid');
      expect(b.journal.filter((e) => e.op === 'go' && e.delta < -1)).toEqual([]);
    });
  });
});

describe('v2/sortie — les autres vues n\'interceptent pas', () => {
  test.each([
    ['/semaine/2026-09-07'],
    ['/seance/' + UUID],
    ['/connexion']
  ])('%s : aucune ancre posée à l\'ouverture', (chemin) => {
    const b = creerBanc({ chemin });
    b.ouvrir();
    expect(b.journal).toEqual([]);
    expect(b.etat().ancree).toBe(false);
    expect(b.questions).toHaveLength(0);
  });

  test('un retour qui atterrit sur une semaine la rend, sans question ni ancre', () => {
    const b = creerBanc();
    b.ouvrir();
    b.naviguer(Routeur.SEMAINE, { lundi: LUNDI });
    b.naviguer(Routeur.SEANCE, { id: UUID });
    const ancresAvant = b.ancres();

    expect(b.retourSysteme()).toBe('popstate');
    expect(b.rendus).toContain(Routeur.SEMAINE);
    expect(b.questions).toHaveLength(0);
    expect(b.ancres()).toBe(ancresAvant);
  });
});

describe('v2/sortie — une vue peut refuser la sortie', () => {
  test('la garde fournit sa propre question, et l\'ancre est posée pour elle', () => {
    const b = creerBanc({
      gardes: [() => ({ question: 'Terminer la séance en cours ?' })]
    });
    b.ouvrir();
    b.naviguer(Routeur.SEMAINE, { lundi: LUNDI });
    b.naviguer(Routeur.SEANCE, { id: UUID });

    expect(b.retourSysteme()).toBe('popstate');
    expect(b.questions).toHaveLength(1);
    expect(b.questions[0].garde.question).toBe('Terminer la séance en cours ?');
    expect(b.etat().ancree).toBe(true);
    expect(b.evenements).toEqual([]);

    b.repondre(false);
    expect(b.etat().intercepte).toBe(true);
    expect(b.debordements()).toBe(0);
  });
});

describe('v2/sortie — « intercepte » et « n\'intercepte plus » sont distinguables', () => {
  // Le piège des deux chantiers précédents : deux cas chacun conforme de son
  // côté, mais que rien ne sépare. Ici le MÊME geste suit les deux réponses,
  // et on exige que ses effets soient opposés.
  function apresReponse(oui) {
    const b = creerBanc();
    b.ouvrir();
    b.retourSysteme();
    const ancresAvant = b.ancres(), questionsAvant = b.questions.length;
    b.repondre(oui);
    const issue = b.retourSysteme();
    return {
      issue,
      nouvellesQuestions: b.questions.length - questionsAvant,
      nouvellesAncres: b.ancres() - ancresAvant,
      evenements: b.evenements.slice()
    };
  }

  test('le même appui sur retour produit des effets opposés', () => {
    const refus = apresReponse(false);
    const confirme = apresReponse(true);

    expect(refus).toEqual({
      issue: 'popstate', nouvellesQuestions: 1, nouvellesAncres: 1, evenements: []
    });
    expect(confirme).toEqual({
      issue: 'fermeture', nouvellesQuestions: 0, nouvellesAncres: 0, evenements: ['fermeture']
    });
    expect(refus).not.toEqual(confirme);
  });
});
