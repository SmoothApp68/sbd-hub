//
// Chantier 47 — les défauts de l'état des lieux du 18/09.
//
// ══ CE QUE CE FICHIER TIENT ════════════════════════════════════════════════
//
//   §1 · « Modifier » sur une séance dont les séries ne sont pas arrivées
//        n'efface plus rien — et la règle qui le dit est UNE seule, consultée
//        par la carte, par le détail et par la garde de la réouverture ;
//   §2 · « −15 » sous la borne REFUSE de descendre au lieu de fabriquer une
//        cible nulle — testé dans `v2-statut-seance.test.js`, §8 ;
//   §3 · le texte de l'éditeur ne promet plus un moteur qui n'existe pas.
//
// ══ CONFIGURATIONS DISCRIMINANTES (CADRAGE-V2 §2 quater) ═══════════════════
//
// ⚠️ UNE SÉANCE PRÉSENTE, SANS SES SÉRIES. C'est LA configuration, et c'est son
// absence qui a laissé passer le défaut : sur une séance complète, « la règle
// est consultée » et « elle ne l'est pas » rendent exactement le même écran.
// Il faut donc une séance que le cache CONNAÎT et dont il n'a AUCUNE série —
// l'état de tout compte neuf pendant sa première synchronisation.
//
// ⚠️ ET LES DEUX SURFACES DANS LE MÊME FICHIER. Le défaut n'était pas « une
// surface se trompe » : c'était « deux surfaces répondent différemment à la
// même question sur la même séance ». Une seule des deux, testée seule, ne
// montre pas l'écart.
//
// ⚠️ `source` SUR LES FIXTURES COMPLÈTES. `donnees.js` lit `source` dans
// `COLONNES_SET` : une série venue de la base en porte toujours une. Une
// fixture qui l'omet décrit un cache PÉRIMÉ (chantier 34), pas un cache sain —
// et confondre les deux ferait passer la garde pour un faux positif.
//
// Environnement jsdom (PAS de docblock `node`) : `modele.js` et `rendu.js` se
// terminent par `this`.

require('../../v2/js/semaine.js');
require('../../v2/js/seance.js');
const Modele = require('../../v2/js/modele.js');
// `rendreListeRoutines` demande son tri à `THRoutines.visibles` (test 6).
require('../../v2/js/routines.js');
require('../../v2/js/rendu.js');
const Seance = require('../../v2/js/seance.js');
const R = () => window.THRendu;

const CAT = [{ slug: 'dc', nom: 'Développé Couché (Barre)' }];
const LIGNE = { id: 'se-1', titre: 'Pecs', debut: '2026-09-15T18:00:00Z', salle: null };

// Une série telle que la base la rend : elle porte sa provenance, et `source`
// vaut `'import'` — comme les 28 103 séries du corpus.
//
// ⚠️ PAS `source: 'app'` AVEC `validee_a: null`. `partEnBase` (chantier 34)
// répond « cette série doit-elle exister en base ? » par DEUX raisons : validée
// dans l'app, ou VENUE de la base. Une ligne `app` jamais validée n'est ni
// l'une ni l'autre — c'est une case vide, et elle ne part pas. Une fixture
// bâtie comme ça décrirait une séance sans aucune ligne à écrire, ce qui est
// précisément l'état qu'on cherche à distinguer.
const serie = (n) => ({ id: 's' + n, exercise_slug: 'dc', rang: n, type_serie: 'travail',
                        charge_kg: 80, reps: 5, source: 'import', validee_a: null });

function cible() {
  const n = document.createElement('div');
  document.body.appendChild(n);
  return n;
}

// ════════════════════════════════════════════════════════════════════════════
// LA RÈGLE, UNE SEULE
// ════════════════════════════════════════════════════════════════════════════

describe('« ai-je vraiment les séries de cette séance ? » — une seule question', () => {
  test('aucune série en cache : on ne les a pas', () => {
    expect(Seance.seriesIncompletes([])).toBe(true);
    expect(Seance.seriesIncompletes(null)).toBe(true);
    expect(Seance.seriesIncompletes(undefined)).toBe(true);
  });

  test('des séries sans provenance : on ne les a pas non plus', () => {
    expect(Seance.seriesIncompletes([{ id: 'a' }])).toBe(true);
    expect(Seance.seriesIncompletes([serie(1), { id: 'b' }])).toBe(true);
  });

  test('des séries complètes : on les a', () => {
    expect(Seance.seriesIncompletes([serie(1), serie(2)])).toBe(false);
  });

  // `source: null` est une provenance CONNUE et vide — une série d'avant la
  // colonne. Elle ne manque pas, elle dit qu'elle ne sait pas.
  test('`source: null` n’est pas une provenance manquante', () => {
    expect(Seance.seriesIncompletes([{ id: 'a', source: null }])).toBe(false);
  });

  // ⚠️ CE QUE `provenanceIncomplete` DIT, ET CE QU'ELLE NE DIT PAS. Elle parle
  // de la provenance de séries qui EXISTENT — elle rend donc faux sur une liste
  // vide, et c'est juste. C'est précisément par cet écart que le défaut est
  // passé : la garde de la réouverture posait cette question-là, plus étroite
  // que celle qu'il fallait poser.
  test('elle n’est pas `provenanceIncomplete`, et l’écart est celui du défaut', () => {
    expect(Seance.provenanceIncomplete([])).toBe(false);
    expect(Seance.seriesIncompletes([])).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TEST 1 — LES DEUX SURFACES RÉPONDENT LA MÊME CHOSE
// ════════════════════════════════════════════════════════════════════════════

describe('test 1 — la carte et le détail refusent le geste ensemble', () => {
  // La carte, telle que `rendreJours` la construit : c'est `resumerSeance` qui
  // décide, et c'est lui qu'on interroge.
  const resume = (series) => Modele.resumerSeance(LIGNE, series, CAT);

  test('la carte d’une séance sans ses séries est incomplète, et le dit', () => {
    expect(resume([]).incomplet).toBe(true);
    const c = cible();
    R().rendreJours(c, [{ nom: 'Mar', date: new Date(2026, 8, 15), seances: [LIGNE] }],
      () => resume([]), () => {}, () => {});
    expect(c.textContent).toContain('séries pas encore reçues');
    // Le « ⋯ » n'est pas offert : la carte n'est pas enveloppée.
    expect(c.querySelectorAll('.menu-pts')).toHaveLength(0);
  });

  test('le DÉTAIL de la MÊME séance refuse les mêmes gestes', () => {
    const c = cible();
    R().rendreDetail(c, LIGNE, [], {
      incomplet: true,
      surSupprimer: () => {}, surModifier: () => {}, surRefaire: () => {}
    });
    expect(c.querySelectorAll('.detail-gestes button')).toHaveLength(0);
  });

  // ⚠️ ET IL NE MENT PLUS SUR LA RAISON. « Aucune série sur cette séance »
  // présentait un MANQUE comme un fait — sur l'écran d'où part le geste qui
  // efface, et au moment précis où c'était faux.
  test('…et il dit pourquoi, au lieu d’affirmer qu’il n’y a rien', () => {
    const c = cible();
    R().rendreDetail(c, LIGNE, [], { incomplet: true, surSupprimer: () => {} });
    expect(c.querySelector('.vide').textContent).toContain('finissent d’arriver');
    expect(c.textContent).not.toContain('Aucune série sur cette séance');
  });

  test('des séries sans provenance ferment les deux surfaces aussi', () => {
    expect(resume([{ id: 'a', exercise_slug: 'dc', rang: 1 }]).incomplet).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TEST 3 — NON-RÉGRESSION DU CHANTIER 29 : UNE SÉANCE COMPLÈTE SE MODIFIE
// ════════════════════════════════════════════════════════════════════════════

describe('test 3 — une séance complète garde ses trois gestes', () => {
  test('la carte porte son menu, et son compte', () => {
    const r = Modele.resumerSeance(LIGNE, [serie(1), serie(2)], CAT);
    expect(r.incomplet).toBe(false);
    const c = cible();
    R().rendreJours(c, [{ nom: 'Mar', date: new Date(2026, 8, 15), seances: [LIGNE] }],
      () => r, () => {}, () => {});
    expect(c.querySelectorAll('.menu-pts')).toHaveLength(1);
    expect(c.textContent).not.toContain('séries pas encore reçues');
  });

  test('le détail porte ses trois gestes, et ils marchent', () => {
    const c = cible();
    const vus = [];
    R().rendreDetail(c, LIGNE, Modele.construireBlocs([serie(1), serie(2)], CAT), {
      incomplet: false,
      surSupprimer: () => vus.push('sup'),
      surModifier: () => vus.push('mod'),
      surRefaire: () => vus.push('ref')
    });
    const boutons = Array.from(c.querySelectorAll('.detail-gestes button'));
    expect(boutons.map((b) => b.textContent))
      .toEqual(['Refaire cette séance', 'Modifier', 'Supprimer']);
    boutons.forEach((b) => b.click());
    expect(vus).toEqual(['ref', 'mod', 'sup']);
  });

  // Le troisième cas, qui n'est ni l'un ni l'autre : une séance INCONNUE. Elle
  // n'a aucun geste parce qu'elle n'existe pas — pas parce qu'elle est
  // incomplète. Les deux se ressemblent à l'écran et ne se corrigent pas pareil.
  test('une séance inconnue n’a pas de gestes non plus, pour une autre raison', () => {
    const c = cible();
    R().rendreDetail(c, null, [], { incomplet: false, surSupprimer: null });
    expect(c.querySelectorAll('.detail-gestes button')).toHaveLength(0);
    expect(c.textContent).toContain('Aucune série sur cette séance');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TEST 2 — SI « MODIFIER » RESTAIT ATTEIGNABLE, RIEN NE DOIT PARTIR
// ════════════════════════════════════════════════════════════════════════════
//
// La garde de `modifierSeance` vit dans `app.js` et n'est pas atteignable d'ici.
// Ce qu'on peut tenir, c'est la CHAÎNE qu'elle protège : ce que produit une
// séance rouverte vide, et ce que cette production ferait partir en base.

describe('test 2 — ce qu’une séance rouverte vide ferait partir', () => {
  test('rouvrir une séance SANS ses séries produit zéro ligne à écrire', () => {
    const rouverte = Seance.reprendre(LIGNE, Modele.construireBlocs([], CAT));
    // ⚠️ C'EST ÇA, LE COÛT. `remplacerSeries(id, [])` met la base À L'IMAGE de
    // ce tableau : il SUPPRIME tout ce qui n'y figure pas (donnees.js,
    // `aRetirer`). Zéro ligne ne veut donc pas dire « rien à faire », ça veut
    // dire « efface tout ».
    expect(Seance.lignes(rouverte)).toHaveLength(0);
    // Et c'est bien la garde qui l'empêche, pas la chaîne : la séance rouverte
    // est parfaitement valide, elle est simplement vide.
    expect(rouverte.statut).toBe(Seance.TERMINEE);
  });

  test('rouvrir une séance AVEC ses séries les rend toutes', () => {
    const rouverte = Seance.reprendre(LIGNE, Modele.construireBlocs([serie(1), serie(2)], CAT));
    expect(Seance.lignes(rouverte)).toHaveLength(2);
  });

  // La garde elle-même, telle que `app.js` la pose : `seriesIncompletes(id)`
  // consulte la liste du cache. Sur les deux entrées qui comptent, elle tranche.
  test('la garde répond OUI sur le cas qui efface, NON sur celui qui corrige', () => {
    expect(Seance.seriesIncompletes([])).toBe(true);
    expect(Seance.seriesIncompletes([serie(1), serie(2)])).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TEST 5 — LE CHRONOMÈTRE SE FIGE ENCORE, APRÈS UN AJUSTEMENT, DANS LES DEUX SENS
// ════════════════════════════════════════════════════════════════════════════
//
// ⚠️ CE QUE LE DÉFAUT CASSAIT N'ÉTAIT PAS LE RÉGLAGE, C'ÉTAIT LE GEL. Une cible
// à 0 rend `reposFige` faux pour TOUTE seconde, donc `rendreChrono` relançait
// l'intervalle à chaque passage : le chronomètre comptait jusqu'à la fin de la
// séance. On vérifie donc les deux moitiés — la valeur ET le gel.
//
// ⚠️ INVERSÉ AU CHANTIER 49 (§7 tervicies). Le 47 avait fermé ces limbes en
// REFUSANT de descendre sous la borne ; le 49 les ferme par l'autre bout, qui
// est le bon : zéro est atteignable et signifie FINI — `ajusterRepos` éteint
// le chronomètre avant que `rendreChrono` ne voie jamais une cible nulle. Les
// limbes restent donc impossibles, et l'utilisateur récupère son « arrête-toi
// maintenant ». Ce qui suit vérifie les DEUX sorties : la valeur bornée, et le
// gel sur tout ce qui reste au-dessus de zéro.

describe('test 5 — après un ajustement, le chronomètre se fige ou s\'éteint', () => {
  // ⚠️ CONFIGURATION DISCRIMINANTE : 50 s, PAS 60. À 60, quatre −15 tombent
  // pile sur zéro et la borne du 49 comme le refus du 47 rendent le même
  // nombre. À 50, le quatrième passerait sous zéro : le refus rendrait 5, la
  // borne rend 0. C'est la seule cible qui distingue les deux règles.
  test('quatre −15 depuis 50 s tombent À zéro — et zéro veut dire fini', () => {
    let c = 50;
    for (let i = 0; i < 4; i++) c = Seance.ajusterCible(c, -15);
    expect(c).toBe(0);
    expect(Seance.reposTermine(c, 0)).toBe(true);
  });

  // Tant qu'il RESTE quelque chose à compter, l'ancien contrat tient : la cible
  // fige, elle ne s'éteint pas. C'est la moitié que l'inversion ne doit pas
  // emporter avec elle.
  test('trois −15 depuis 50 s laissent 5 s, qui FIGENT encore', () => {
    let c = 50;
    for (let i = 0; i < 3; i++) c = Seance.ajusterCible(c, -15);
    expect(c).toBe(5);
    expect(Seance.reposTermine(c, 0)).toBe(false);
    expect(Seance.reposTermine(c, 30)).toBe(true);
    expect(Seance.secondesRestantes(c, 30)).toBe(0);   // figé : il ne reste rien
  });

  test('et un cinquième −15 ne descend pas sous zéro', () => {
    expect(Seance.ajusterCible(0, -15)).toBe(0);
    expect(Seance.reposTermine(Seance.ajusterCible(0, -15), 0)).toBe(true);
  });

  // L'autre sens : le +15 qui repousse la cible AU-DELÀ de l'écoulé remet en
  // marche. Un arrêt qui ne sait pas repartir figerait le repos suivant pour
  // toujours — c'est la moitié qu'on oublie quand on ne teste qu'une direction.
  test('un +15 qui repousse la cible au-delà de l’écoulé dégèle', () => {
    expect(Seance.reposTermine(15, 30)).toBe(true);
    const repoussee = Seance.ajusterCible(15, 15);
    expect(repoussee).toBe(30);
    expect(Seance.reposTermine(repoussee, 30)).toBe(true);  // pile à l'échéance
    expect(Seance.reposTermine(Seance.ajusterCible(repoussee, 15), 30)).toBe(false);
  });

  // ⚠️ L'INVARIANTE QUI RÉSUME TOUT, RÉÉCRITE AU 49 : quelle que soit la suite
  // d'ajustements, un chronomètre FINIT toujours par s'arrêter — soit il se
  // fige à son échéance, soit il est écoulé et la barre s'en va. Ce qui est
  // interdit, c'est le TROISIÈME état : une cible qui ne fige jamais et qu'on
  // continue pourtant d'afficher. Le 47 l'excluait en gardant tout armable ;
  // le 49 l'exclut en éteignant à zéro.
  test('aucune suite d’ajustements ne produit un chronomètre qui court sans fin', () => {
    [5, 15, 20, 50, 60, 90, 1800, 3600].forEach((depart) => {
      let c = depart;
      [-15, -15, 15, -15, -15, -15, -15, 15].forEach((d) => {
        c = Seance.ajusterCible(c, d);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(Seance.REPOS_MAX);
        // Écoulé → la barre disparaît ; sinon → il existe une seconde à
        // laquelle `reposFige` rend vrai, et c'est la cible elle-même.
        if (Seance.reposTermine(c, 0)) expect(Seance.cibleArmable(c)).toBe(null);
        else expect(Seance.reposTermine(c, c)).toBe(true);
      });
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TEST 6 — LA NOTE DE L'ÉDITEUR NE PROMET PLUS UN MOTEUR QUI N'EXISTE PAS
// ════════════════════════════════════════════════════════════════════════════
//
// ⚠️ OUI, CE TEST LIT UN FICHIER SOURCE, ET C'EST LE SEUL CAS OÙ C'EST JUSTE.
// La règle du dépôt est qu'une assertion doit EXÉCUTER plutôt que de grepper —
// ~10 % des tests v1 greppaient la source et ne prouvaient rien. Ici, le défaut
// EST le texte : il n'y a pas de comportement derrière à exécuter, et la seule
// chose à vérifier est ce qui est écrit sur la surface. Grepper la surface,
// c'est exercer exactement l'objet du défaut.

describe('test 6 — aucune surface ne promet un moteur au présent', () => {
  const fs = require('fs');
  const lire = (p) => fs.readFileSync(require('path').join(__dirname, '../../', p), 'utf8');

  test('la note de l’éditeur de routine ne dit plus « le moteur recalcule »', () => {
    const html = lire('v2/index.html');
    const note = /<p id="note-routine"[^>]*>([\s\S]*?)<\/p>/.exec(html);
    expect(note).not.toBe(null);
    expect(note[1]).not.toMatch(/le moteur recalcule/);
    expect(note[1]).not.toMatch(/séance après séance/);
    // Et elle dit ce qui est VRAI aujourd'hui : rien ne recalcule.
    expect(note[1]).toMatch(/rien ne les recalcule/);
  });

  // `seance.js` déclare en toutes lettres ce que la surface promettait :
  // « Rien n'est prédit ici ; le moteur parlera au chantier 5 ». Les deux
  // doivent dire la même chose, sinon l'une des deux ment.
  test('…et le code, lui, n’a pas changé d’avis', () => {
    expect(lire('v2/js/seance.js')).toMatch(/le moteur parlera au chantier 5/);
  });

  // La même promesse vivait sur une SECONDE surface — l'état vide de la
  // bibliothèque. En corriger une sur deux, c'est la maladie que ce chantier
  // soigne par ailleurs.
  //
  // ⚠️ CELLE-CI S'EXÉCUTE, elle. Le texte est produit par `rendreListeRoutines`,
  // donc on le lit dans le DOM plutôt que dans le fichier — et on ne dépend pas
  // de la façon dont l'apostrophe est échappée dans la source, ce qui est
  // exactement le genre de détail qui fait passer un grep pour une preuve.
  //
  // 54-1 — le moteur parle désormais : la phrase validée le 06/10 dit « Le
  // coach décide des charges à chaque séance. », au présent, et c'est vrai.
  // Ce qu'elle ne dit plus : « pas ce que tu soulèves » (une routine porte une
  // charge de départ, §9.21) ni « le moteur » (l'aperçu dit « le coach »).
  test('l’état vide de la bibliothèque dit le vrai', () => {
    const c = cible();
    R().rendreListeRoutines(c, [], { etat: { code: 'ok' } });
    expect(c.textContent).toMatch(/Une routine, c’est une liste d’exercices dans un ordre\. Le coach décide des charges à chaque séance\./);
    expect(c.textContent).not.toMatch(/pas ce que tu soulèves/);
    expect(c.textContent).not.toMatch(/le moteur/);
  });
});
