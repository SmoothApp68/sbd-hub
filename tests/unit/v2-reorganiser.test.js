//
// Chantier 46 §3 — Réorganiser : un mode, un glissement à la poignée
// (ECRAN-SAISIE-V1 §7 vicies).
//
// ══ CE QUE CE FICHIER TIENT ════════════════════════════════════════════════
//
//   · l'ordre de la bibliothèque, qui passe du NOM au `rang` (v2_043) ;
//   · le plan d'écritures de ce rang, sous un index NON DIFFÉRABLE ;
//   · le réordonnancement d'une séance ou d'une routine par TRANCHES ;
//   · le composant de glissement, et le fait que la poignée isole le geste.
//
// ⚠️ CONFIGURATIONS DISCRIMINANTES (CADRAGE-V2 §2 quater) :
//
//   · un déplacement AU MILIEU, jamais en bout. Sur deux éléments, ou en
//     déplaçant le dernier, « renuméroter » et « ne rien faire » rendent le
//     même tableau — c'est écrit en toutes lettres dans v2-routines.test.js ;
//   · un ÉCHANGE, c'est-à-dire un cycle. Sans cycle, le rang tampon ne sert
//     jamais et sa disparition ne se verrait pas ;
//   · un SUPERSET, c'est-à-dire une tranche de plusieurs. Sur des blocs d'un
//     seul exercice, « déplacer un bloc » et « déplacer un exercice » sont la
//     même chose.
//
// Environnement jsdom (PAS de docblock `node`) : `routines.js` et `rendu.js`
// se terminent par `this`.

const Routines = require('../../v2/js/routines.js');
require('../../v2/js/semaine.js');
require('../../v2/js/modele.js');
const Seance = require('../../v2/js/seance.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const R = (id, nom, rang, archivee) => ({
  id: id, nom: nom, rang: rang === undefined ? null : rang,
  archivee_a: archivee || null, exercices: []
});

// ════════════════════════════════════════════════════════════════════════════
// 1 — L'ORDRE DE LA BIBLIOTHÈQUE : LE RANG, PUIS LE NOM
// ════════════════════════════════════════════════════════════════════════════
describe('⚠️ la bibliothèque se range par `rang`, le nom ne départage plus que', () => {
  test('le rang l’emporte sur l’alphabet', () => {
    const liste = [R('a', 'Zèbre', 0), R('b', 'Abeille', 1), R('c', 'Marmotte', 2)];
    expect(Routines.visibles(liste).map((r) => r.nom))
      .toEqual(['Zèbre', 'Abeille', 'Marmotte']);
  });

  // ⚠️ `routines.rang` EST NULLABLE EN BASE, SANS VALEUR PAR DÉFAUT. Une
  // routine écrite par une version qui ne le connaissait pas n'en a pas.
  test('sans rang, on passe DERRIÈRE — être rangé à la main se respecte', () => {
    const liste = [R('a', 'Aaa', null), R('b', 'Zzz', 0), R('c', 'Bbb', null)];
    expect(Routines.visibles(liste).map((r) => r.nom)).toEqual(['Zzz', 'Aaa', 'Bbb']);
  });

  test('à rang égal — deux archivées, hors index partiel — le nom départage', () => {
    const liste = [R('a', 'Zzz', 3, '2026-01-01'), R('b', 'Aaa', 3, '2026-01-01')];
    expect(Routines.visibles(liste).map((r) => r.nom)).toEqual(['Aaa', 'Zzz']);
  });

  test('un rang en texte compte comme un nombre — PostgREST peut le rendre ainsi', () => {
    const liste = [R('a', 'Deux', '10'), R('b', 'Un', '9')];
    expect(Routines.visibles(liste).map((r) => r.nom)).toEqual(['Un', 'Deux']);
  });

  // ⚠️ UNE CHAÎNE VIDE N'EST PAS LE RANG ZÉRO. `Number('')` vaut 0 : sans le
  // test explicite, une routine au rang vide passerait DEVANT tout le monde, et
  // pourrait heurter `routines_user_rang_uniq` en réclamant un 0 déjà pris.
  test('une chaîne vide vaut « pas de rang », jamais zéro', () => {
    expect(Routines.rangOuNul('')).toBeNull();
    expect(Routines.rangOuNul('   ')).toBeNull();
    expect(Routines.rangOuNul(0)).toBe(0);
    expect(Routines.rangOuNul('nawak')).toBeNull();
    const liste = [R('a', 'Vide', ''), R('b', 'Zero', 0)];
    expect(Routines.visibles(liste).map((r) => r.nom)).toEqual(['Zero', 'Vide']);
  });

  test('`visibles` ne modifie pas le tableau reçu', () => {
    const liste = [R('a', 'Zzz', 1), R('b', 'Aaa', 0)];
    const avant = liste.slice();
    Routines.visibles(liste);
    expect(liste).toEqual(avant);
  });

  // Les archivées restent AFFICHÉES (chantier 41) mais ne se rangent pas :
  // elles sont hors de `routines_user_rang_uniq`, qui est partiel.
  test('`reordonnables` écarte les archivées, `visibles` les garde', () => {
    const liste = [R('a', 'Push', 0), R('b', 'Vieille', 1, '2026-01-01'), R('c', 'Pull', 2)];
    expect(Routines.visibles(liste).length).toBe(3);
    expect(Routines.reordonnables(liste).map((r) => r.id)).toEqual(['a', 'c']);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2 — LE PLAN D'ÉCRITURES SOUS UN INDEX NON DIFFÉRABLE
// ════════════════════════════════════════════════════════════════════════════
//
// ⚠️ `routines_user_rang_uniq` porte sur (user_id, rang) WHERE archivee_a IS
// NULL, et n'est PAS différable — relevé en base le 18/09. Les PATCH partent un
// par un, chacun dans sa transaction : un plan qui passe par un état en
// collision est refusé au milieu.
describe('⚠️ réordonner sans jamais viser un rang encore occupé', () => {
  // Rejoue ce que Postgres ferait : refuse deux rangs identiques.
  const appliquer = (routines, plan) => {
    const etat = {};
    routines.forEach((r) => { etat[r.id] = Routines.rangOuNul(r.rang); });
    plan.forEach((e) => {
      const vise = e.champs.rang;
      const tenant = Object.keys(etat).filter((id) => id !== e.id && etat[id] === vise);
      if (tenant.length) {
        throw new Error('23505 routines_user_rang_uniq — ' + e.id + ' vise ' + vise +
          ', occupé par ' + tenant.join(','));
      }
      etat[e.id] = vise;
    });
    return etat;
  };
  const finalOrdonne = (etat) => Object.keys(etat)
    .sort((a, b) => etat[a] - etat[b]);

  test('un plan rejoué sur une bibliothèque déjà rangée est VIDE', () => {
    const liste = [R('a', 'A', 0), R('b', 'B', 1), R('c', 'C', 2)];
    expect(Routines.planRangs(liste, ['a', 'b', 'c'])).toEqual([]);
  });

  // ⚠️ L'ÉCHANGE EST UN CYCLE : il PASSE forcément par un rang tampon. C'est la
  // seule forme qui distingue un plan ordonné d'une boucle naïve.
  test('échanger deux voisines passe par un rang tampon, et ne heurte rien', () => {
    const liste = [R('a', 'A', 0), R('b', 'B', 1), R('c', 'C', 2)];
    const plan = Routines.planRangs(liste, ['b', 'a', 'c']);
    expect(plan.length).toBe(3);                       // 2 déplacements + 1 détour
    expect(plan[0].champs.rang).toBeGreaterThan(2);    // le tampon, au-dessus de tout
    expect(finalOrdonne(appliquer(liste, plan))).toEqual(['b', 'a', 'c']);
  });

  // ⚠️ AU MILIEU, JAMAIS EN BOUT. Remonter la dernière laisse les autres en
  // place à un décalage près ; au milieu, tout le monde bouge.
  test('remonter celle du MILIEU tout en haut : six rangs, aucune collision', () => {
    const liste = [R('a', 'A', 0), R('b', 'B', 1), R('c', 'C', 2),
                   R('d', 'D', 3), R('e', 'E', 4)];
    const plan = Routines.planRangs(liste, ['c', 'a', 'b', 'd', 'e']);
    expect(finalOrdonne(appliquer(liste, plan))).toEqual(['c', 'a', 'b', 'd', 'e']);
    // Et `d`/`e` n'ont pas bougé : on n'écrit QUE ce qui change.
    expect(plan.filter((e) => e.id === 'd' || e.id === 'e')).toEqual([]);
  });

  test('renverser quatre routines tient aussi — deux cycles imbriqués', () => {
    const liste = [R('a', 'A', 0), R('b', 'B', 1), R('c', 'C', 2), R('d', 'D', 3)];
    const plan = Routines.planRangs(liste, ['d', 'c', 'b', 'a']);
    expect(finalOrdonne(appliquer(liste, plan))).toEqual(['d', 'c', 'b', 'a']);
  });

  // ⚠️ LE TAMPON DOIT ÊTRE LIBRE CHEZ TOUT L'UTILISATEUR, pas dans une
  // sous-liste : l'index porte sur (user_id, rang). Une routine hors de l'ordre
  // voulu — une archivée — occupe quand même son rang.
  test('le tampon passe AU-DESSUS d’une archivée qui occupe un rang haut', () => {
    const liste = [R('a', 'A', 0), R('b', 'B', 1), R('v', 'Vieille', 9, '2026-01-01')];
    const plan = Routines.planRangs(liste, ['b', 'a']);
    expect(plan[0].champs.rang).toBeGreaterThan(9);
    expect(() => appliquer(liste, plan)).not.toThrow();
  });

  test('une routine sans rang en reçoit un, sans déranger les autres', () => {
    const liste = [R('a', 'A', 0), R('n', 'Neuve', null), R('b', 'B', 1)];
    const plan = Routines.planRangs(liste, ['a', 'b', 'n']);
    expect(finalOrdonne(appliquer(liste, plan))).toEqual(['a', 'b', 'n']);
  });

  test('un id inconnu ou répété est ignoré, il ne fabrique pas de rang', () => {
    const liste = [R('a', 'A', 0), R('b', 'B', 1)];
    expect(Routines.planRangs(liste, ['a', 'fantome', 'b', 'a'])).toEqual([]);
    expect(Routines.planRangs(liste, [])).toEqual([]);
    expect(Routines.planRangs(null, ['a'])).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3 — RÉORDONNER UNE SÉANCE PAR TRANCHES (le superset d'un tenant)
// ════════════════════════════════════════════════════════════════════════════
describe('⚠️ un superset se déplace d’un tenant', () => {
  let n = 0;
  const uuid = () => 'id-' + (++n);
  beforeEach(() => { n = 0; });

  // A seul · B+C en superset · D seul.
  const seance = () => {
    let s = Seance.creer({ id: 's1', userId: 'u1', idSerie: uuid });
    ['squat-barre', 'dc-barre', 'curl', 'tractions']
      .forEach((slug) => { s = Seance.ajouterExercice(s, slug, uuid); });
    return Seance.grouperBlocs(s, [1], [2]);
  };
  const slugs = (s) => s.exercices.map((e) => e.exercise_slug);

  test('le décor : quatre exercices, dont un superset au milieu', () => {
    const s = seance();
    expect(slugs(s)).toEqual(['squat-barre', 'dc-barre', 'curl', 'tractions']);
    expect(s.exercices[1].groupe_superset).toBe(s.exercices[2].groupe_superset);
    expect(s.exercices[1].groupe_superset).not.toBeNull();
  });

  test('le superset remonte ENTIER, et reste un superset', () => {
    const s = seance();
    // Tranches : [le superset] · [A] · [D]
    const apres = Seance.reordonnerBlocs(s, [[1, 2], [0], [3]]);
    expect(slugs(apres)).toEqual(['dc-barre', 'curl', 'squat-barre', 'tractions']);
    expect(apres.exercices[0].groupe_superset).toBe(apres.exercices[1].groupe_superset);
    expect(apres.exercices[0].groupe_superset).not.toBeNull();
    expect(apres.exercices[2].groupe_superset).toBeNull();
  });

  // ⚠️ SANS L'OUBLI DES RANGS D'ORIGINE, l'écran bouge et la base ne bouge pas
  // — le défaut exact du chantier 35, D2.
  test('les rangs d’origine sont OUBLIÉS, sinon la base garderait l’ancien ordre', () => {
    let s = seance();
    s = { ...s, exercices: s.exercices.map((e) => ({
      ...e, series: e.series.map((x) => ({ ...x, rang_origine: 7 })) })) };
    const apres = Seance.reordonnerBlocs(s, [[3], [0], [1, 2]]);
    const rangs = apres.exercices.flatMap((e) => e.series.map((x) => x.rang_origine));
    expect(rangs.every((r) => r === null)).toBe(true);
  });

  test('un ordre INCOMPLET ne change rien — on ne devine pas', () => {
    const s = seance();
    expect(Seance.reordonnerBlocs(s, [[1, 2], [0]])).toBe(s);
    expect(Seance.reordonnerBlocs(s, [[0], [0], [1, 2]])).toBe(s);
    expect(Seance.reordonnerBlocs(s, [[0], [1], [2], [9]])).toBe(s);
    expect(Seance.reordonnerBlocs(s, null)).toBe(s);
  });

  test('l’ordre identique rend la même séance, sans rien casser', () => {
    const s = seance();
    expect(slugs(Seance.reordonnerBlocs(s, [[0], [1, 2], [3]]))).toEqual(slugs(s));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4 — LE COMPOSANT DE GLISSEMENT
// ════════════════════════════════════════════════════════════════════════════
//
// ⚠️ JSDOM NE FAIT PAS DE MISE EN PAGE : `getBoundingClientRect` y rend des
// zéros. On les pose donc à la main, une hauteur par rangée — c'est la seule
// grandeur dont le composant se sert pour décider d'une permutation. Ce que ce
// test prouve : la MÉCANIQUE (qui écoute, qui bouge, ce qui est rendu). Que ça
// tienne au pouce, seul le banc et l'appareil le disent.
describe('⚠️ le glissement ne part que de la poignée', () => {
  const HAUTEUR = 60;

  const liste = (cles) => {
    const c = document.createElement('div');
    cles.forEach((cle) => {
      const r = document.createElement('div');
      r.setAttribute('data-cle', cle);
      const p = document.createElement('div');
      p.className = 'poignee';
      r.appendChild(p);
      c.appendChild(r);
    });
    // Une pièce de décor SANS clé : le composant doit l'ignorer.
    const pied = document.createElement('button');
    pied.textContent = 'Séance vide';
    c.appendChild(pied);
    document.body.appendChild(c);
    placer(c);
    return c;
  };
  // ⚠️ LA POSITION SE RELIT À CHAQUE APPEL, comme dans un vrai navigateur :
  // déplacer un nœud dans le DOM change sa place, sans que personne ne « repose »
  // les rectangles. Un `indexOf` figé à la pose ferait un banc plus clément que
  // le navigateur — et le composant passerait en mentant.
  const placer = (c) => {
    [...c.children].forEach((n) => {
      n.getBoundingClientRect = () => {
        const i = [...c.children].indexOf(n);
        const dy = n.style.transform
          ? Number((/translateY\((-?\d+(?:\.\d+)?)px\)/.exec(n.style.transform) || [0, 0])[1])
          : 0;
        return { top: i * HAUTEUR + dy, height: HAUTEUR,
                 bottom: i * HAUTEUR + dy + HAUTEUR, left: 0, right: 100, width: 100 };
      };
    });
  };
  const ordre = (c) => [...c.children]
    .filter((n) => n.getAttribute('data-cle') !== null)
    .map((n) => n.getAttribute('data-cle'));

  // ⚠️ JSDOM N'A PAS `PointerEvent`. On fabrique un `MouseEvent` et on lui pose
  // les deux champs que le composant lit — `pointerId` et `pointerType`. Le
  // banc, lui, envoie de VRAIS pointer events dans un navigateur réel : c'est
  // la différence entre « la mécanique est branchée » et « le geste marche ».
  const ev = (type, cible, y) => {
    const e = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientY: y });
    Object.defineProperty(e, 'pointerId', { value: 1 });
    Object.defineProperty(e, 'pointerType', { value: 'touch' });
    cible.dispatchEvent(e);
    return e;
  };

  beforeEach(() => { document.body.innerHTML = ''; });

  test('un pointeur posé AILLEURS que sur la poignée ne prend rien', () => {
    const c = liste(['a', 'b', 'c']);
    const vus = [];
    Rendu().brancherReorganisation(c, { surOrdre: (o) => vus.push(o) });
    const e = ev('pointerdown', c.children[0], 0);
    // Pas de `preventDefault` : la page garde son défilement. C'est LA
    // non-régression du §7 vicies.3 — la poignée isole le geste.
    expect(e.defaultPrevented).toBe(false);
    ev('pointermove', c.children[0], 200);
    ev('pointerup', c.children[0], 200);
    expect(ordre(c)).toEqual(['a', 'b', 'c']);
    expect(vus).toEqual([]);
  });

  test('depuis la poignée, la rangée descend d’un cran et l’ordre est rendu', () => {
    const c = liste(['a', 'b', 'c']);
    const vus = [];
    Rendu().brancherReorganisation(c, { surOrdre: (o) => vus.push(o) });
    const p = c.children[0].querySelector('.poignee');
    const e = ev('pointerdown', p, 0);
    expect(e.defaultPrevented).toBe(true);          // ici, oui : on prend la main
    expect(c.children[0].classList.contains('pris')).toBe(true);
    ev('pointermove', p, HAUTEUR + 5);              // le milieu passe celui de `b`
    ev('pointerup', p, HAUTEUR + 5);
    expect(ordre(c)).toEqual(['b', 'a', 'c']);
    expect(vus).toEqual([['b', 'a', 'c']]);
  });

  test('la rangée relâchée ne garde ni sa classe ni sa translation', () => {
    const c = liste(['a', 'b']);
    Rendu().brancherReorganisation(c, { surOrdre: () => {} });
    const p = c.children[0].querySelector('.poignee');
    ev('pointerdown', p, 0);
    ev('pointermove', p, 30);
    const pris = c.querySelector('.pris');
    expect(pris).not.toBeNull();
    ev('pointerup', p, 30);
    expect(c.querySelector('.pris')).toBeNull();
    expect([...c.children].every((n) => !n.style.transform)).toBe(true);
  });

  // ⚠️ UN `pointercancel` ARRIVE VRAIMENT : un appel entrant, un geste système.
  test('un geste interrompu repose la rangée au lieu de la laisser en l’air', () => {
    const c = liste(['a', 'b']);
    const vus = [];
    Rendu().brancherReorganisation(c, { surOrdre: (o) => vus.push(o) });
    const p = c.children[0].querySelector('.poignee');
    ev('pointerdown', p, 0);
    ev('pointermove', p, 20);
    ev('pointercancel', p, 20);
    expect(c.querySelector('.pris')).toBeNull();
    expect(vus.length).toBe(1);                     // l'ordre est quand même rendu
  });

  test('le décor sans clé n’entre jamais dans l’ordre', () => {
    const c = liste(['a', 'b']);
    const vus = [];
    Rendu().brancherReorganisation(c, { surOrdre: (o) => vus.push(o) });
    const p = c.children[1].querySelector('.poignee');
    ev('pointerdown', p, HAUTEUR);
    ev('pointerup', p, HAUTEUR);
    expect(vus[0]).toEqual(['a', 'b']);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5 — LE PIED : PLUSIEURS DÉPLACEMENTS, UN ENREGISTREMENT
// ════════════════════════════════════════════════════════════════════════════
describe('⚠️ le pied du mode', () => {
  const pied = (vue) => {
    const c = document.createElement('div');
    Rendu().rendrePiedReorganisation(c, vue);
    return c;
  };

  test('deux actions, Annuler d’abord — le geste sûr est le plus à gauche', () => {
    const c = pied({ surAnnuler: () => {}, surEnregistrer: () => {} });
    expect([...c.querySelectorAll('button')].map((b) => b.textContent))
      .toEqual(['Annuler', 'Enregistrer']);
    expect(c.hidden).toBe(false);
  });

  test('chacune appelle la sienne', () => {
    const vus = [];
    const c = pied({ surAnnuler: () => vus.push('annuler'),
                     surEnregistrer: () => vus.push('enregistrer') });
    [...c.querySelectorAll('button')].forEach((b) => b.click());
    expect(vus).toEqual(['annuler', 'enregistrer']);
  });

  // Pendant l'écriture, « Enregistrer » se désarme : deux appuis enverraient
  // deux fois le même plan, et le second heurterait l'index.
  test('pendant l’écriture, « Enregistrer » est inerte et « Annuler » reste offert', () => {
    const c = pied({ enCours: true, surAnnuler: () => {}, surEnregistrer: () => {} });
    const b = [...c.querySelectorAll('button')];
    expect(b[0].disabled).toBe(false);
    expect(b[1].disabled).toBe(true);
  });

  test('hors du mode, le pied se cache — il ne rend pas une coquille vide', () => {
    const c = pied(null);
    expect(c.hidden).toBe(true);
    expect(c.querySelectorAll('button').length).toBe(0);
  });

  test('il dit comment faire — un appui long ne se découvre pas tout seul', () => {
    const c = pied({ surAnnuler: () => {}, surEnregistrer: () => {} });
    expect(c.textContent).toContain('poignée');
  });
});
