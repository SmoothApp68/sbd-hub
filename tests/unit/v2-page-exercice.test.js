//
// Chantier 40 — la page d'exercice (§7 quater).
//
// CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater), et il en faut trois :
//
//   · table par reps — un jeu où UNE ligne au moins est déduite, et une autre
//     ne l'est pas. Si toutes les charges montent avec les reps, « déduit » et
//     « pas déduit » rendent le même tableau, et la règle n'est pas mesurée.
//   · mesures sans charge — un exercice en `temps` ET un en `reps`. Les deux
//     prennent des chemins DIFFÉRENTS dans `palier.js` (`MESURES_SANS_CHARGE`
//     les range ensemble, mais `meilleureSerieDe` les sépare : reps d'un côté,
//     durée de l'autre). Un seul des deux laisserait l'autre à découvert.
//   · meilleure série de tout l'historique — DEUX séances où la plus récente
//     n'est PAS la plus lourde. Sinon « le record » et « la dernière séance »
//     rendent le même chiffre et on ne sait pas lequel on mesure.
//
// Environnement jsdom (PAS de docblock `node`) : `v2/js/modele.js` et
// `v2/js/rendu.js` se terminent par `this`, que Babel remplace par `undefined`
// sous l'environnement node.

const R = require('../../v2/js/routeur.js');
const Palier = require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

// Le catalogue, fidèle : `mesure` ET `muscles_primaires`. Sans les muscles, la
// règle « porte du volume » du §1 écarterait tout (chantier 39/40).
const EXOS = [
  { slug: 'dc', nom: 'Développé Couché (Barre)', mesure: 'charge_reps',
    muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'] },
  { slug: 'tractions', nom: 'Tractions', mesure: 'reps',
    muscles_primaires: ['dos'], muscles_secondaires: [] },
  { slug: 'planche', nom: 'Planche', mesure: 'temps',
    muscles_primaires: ['abdominaux'], muscles_secondaires: [] },
  { slug: 'rando', nom: 'Randonnée', mesure: 'distance_temps',
    muscles_primaires: [], muscles_secondaires: [] }
];

let n = 0;
const s = (slug, champs) => Object.assign({
  id: 'set-' + (++n), session_id: 'S', exercise_slug: slug, type_serie: 'travail',
  rang: n, charge_kg: null, reps: null, duree_s: null, distance_m: null,
  validee_a: null, source: 'import', rpe: null, ressenti: null, repos_s: null
}, champs);
beforeEach(() => { n = 0; });

const kgxr = (charge, reps, extra) =>
  s('dc', Object.assign({ charge_kg: charge, reps: reps }, extra || {}));

// ════════════════════════════════════════════════════════════════════════════
// 7. LA TABLE PAR NOMBRE DE RÉPÉTITIONS — brut, lignes déduites signalées
// ════════════════════════════════════════════════════════════════════════════
describe('⚠️ tableParReps — le cas mesuré du couché d’aurel_br', () => {
  // CONFIGURATION DISCRIMINANTE : le 14 reps à 42,5 kg est DOMINÉ par le
  // 15 reps à 80 kg. Le 6, le 8 et le 15 ne le sont pas. Une seule ligne
  // déduite sur quatre : les deux réponses ne peuvent pas se confondre.
  const HISTOIRE = () => [
    kgxr(120, 6, { session_id: 'a' }),
    kgxr(110, 8, { session_id: 'b' }),
    kgxr(42.5, 14, { session_id: 'c' }),
    kgxr(80, 15, { session_id: 'd' })
  ];
  const DATES = { a: '2026-09-01', b: '2025-11-22', c: '2024-02-10', d: '2025-07-03' };
  const dateDe = (x) => DATES[x.session_id];
  const table = () => Modele.tableParReps(HISTOIRE(), 'charge_reps', dateDe);

  test('une ligne par nombre de reps, triée par reps croissantes', () => {
    expect(table().map((l) => l.reps)).toEqual([6, 8, 14, 15]);
  });

  test('le BRUT est conservé, y compris sur la ligne dominée', () => {
    expect(table().map((l) => l.charge)).toEqual([120, 110, 42.5, 80]);
  });

  test('SEULE la ligne dominée est déduite — et elle dit par quoi', () => {
    const t = table();
    expect(t.map((l) => l.deduit)).toEqual([false, false, true, false]);
    expect(t[2].chargeDeduite).toBe(80);
    // Les lignes non déduites ne portent PAS la clé : « rien » n'est pas « 0 ».
    expect(t[0].chargeDeduite).toBeUndefined();
  });

  test('la date vient de la SÉANCE, et elle change la lecture', () => {
    const t = table();
    expect(t[0].date).toBe('2026-09-01');   // 6 reps : hier
    expect(t[1].date).toBe('2025-11-22');   // 8 reps : novembre dernier
  });

  test('les chauffes ne votent pas', () => {
    const avec = HISTOIRE().concat([
      kgxr(200, 1, { type_serie: 'echauffement', session_id: 'a' })
    ]);
    expect(Modele.tableParReps(avec, 'charge_reps', dateDe).map((l) => l.reps))
      .toEqual([6, 8, 14, 15]);
  });
});

describe('⚠️ tableParReps — ce qui n’a pas de table', () => {
  test('`distance_temps` n’en a pas : hors du moteur (§3 ter.3)', () => {
    expect(Modele.tableParReps([s('rando', { duree_s: 7200, distance_m: 8400 })],
      'distance_temps', () => '2026-01-01')).toEqual([]);
  });

  test('`temps` n’en a pas non plus — écart assumé, pas comblé', () => {
    expect(Modele.tableParReps([s('planche', { duree_s: 90 })], 'temps', () => 'x'))
      .toEqual([]);
  });

  // ⚠️ SANS CHARGE À COMPARER, TOUT CE QUI EST SOUS LE MAXIMUM EST DÉDUIT. La
  // règle des charges ne déduirait JAMAIS rien ici (0 > 0 est faux) alors que
  // tout l'est : on ne fait pas 15 tractions sans pouvoir en faire 12.
  test('`reps` : une seule ligne pleine, la plus haute', () => {
    const t = Modele.tableParReps([
      s('tractions', { reps: 12, session_id: 'a' }),
      s('tractions', { reps: 15, session_id: 'b' }),
      s('tractions', { reps: 8, session_id: 'c' })
    ], 'reps', (x) => x.session_id);
    expect(t.map((l) => l.reps)).toEqual([8, 12, 15]);
    expect(t.map((l) => l.deduit)).toEqual([true, true, false]);
    // Pas de charge déduite : un « 0 kg » serait un chiffre inventé.
    expect(t.every((l) => l.chargeDeduite === undefined)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA MEILLEURE SÉRIE DE TOUT L'HISTORIQUE — on rappelle, on ne recalcule pas
// ════════════════════════════════════════════════════════════════════════════
describe('⚠️ meilleureSerieDeTout — le record n’est pas la dernière séance', () => {
  // CONFIGURATION DISCRIMINANTE : la séance la PLUS RÉCENTE (index 0) est la
  // plus LÉGÈRE. Si la fonction rendait simplement la dernière, elle donnerait
  // 100 ; si elle prenait la première venue, elle donnerait 100 aussi.
  const RECENTE = () => [kgxr(100, 5), kgxr(100, 5), kgxr(100, 4)];
  const VIEILLE = () => [kgxr(140, 3), kgxr(140, 2), kgxr(135, 3)];
  const groupes = () => [
    { cle: '2026-09-11', series: RECENTE() },
    { cle: '2026-01-10', series: VIEILLE() }
  ];

  test('elle rend la plus lourde de TOUTES les séances', () => {
    const m = Modele.meilleureSerieDeTout('dc', groupes(), EXOS, Palier, {});
    expect(m.charge).toBe(140);
    expect(m.reps).toBe(3);
  });

  test('et elle dit DE QUELLE séance elle vient', () => {
    expect(Modele.meilleureSerieDeTout('dc', groupes(), EXOS, Palier, {}).cle)
      .toBe('2026-01-10');
  });

  test('sur la séance récente seule, c’est bien 100 — les deux ne se confondent pas', () => {
    const m = Modele.meilleureSerieDe('dc', RECENTE(), EXOS, Palier, {});
    expect(m.charge).toBe(100);
  });

  test('aucune séance : `null`, jamais `undefined` — le contrat de la carte', () => {
    const m = Modele.meilleureSerieDeTout('dc', [], EXOS, Palier, {});
    expect(m.charge).toBeNull();
    expect(m.reps).toBeNull();
  });

  test('sans moteur : aucune clé, comme la carte sans palier', () => {
    expect(Modele.meilleureSerieDeTout('dc', groupes(), EXOS, null, {})).toEqual({});
  });

  // Les mesures sans charge ne passent PAS par la boucle séance par séance :
  // leur meilleure série est un maximum, et un maximum ne dépend pas du
  // découpage. On vérifie que le résultat est bien celui de tout l'historique.
  test('`reps` : le maximum de tout l’historique, pas celui du dernier jour', () => {
    const m = Modele.meilleureSerieDeTout('tractions', [
      { cle: 'b', series: [s('tractions', { reps: 9 })] },
      { cle: 'a', series: [s('tractions', { reps: 15 })] }
    ], EXOS, Palier, {});
    expect(m.valeur).toBe('15');
  });

  test('`temps` : la plus longue de tout l’historique', () => {
    const m = Modele.meilleureSerieDeTout('planche', [
      { cle: 'b', series: [s('planche', { duree_s: 60 })] },
      { cle: 'a', series: [s('planche', { duree_s: 125 })] }
    ], EXOS, Palier, {});
    expect(m.valeur).toBe('2 min 5');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. LES DEUX SOUS-ONGLETS ONT LEUR URL
// ════════════════════════════════════════════════════════════════════════════
describe('⚠️ la page d’exercice est adressable, ses deux onglets aussi', () => {
  test('Résumé et Historique ont des URL DISTINCTES', () => {
    const a = R.analyser('/exercice/dc-barre');
    const b = R.analyser('/exercice/dc-barre/historique');
    expect(a.vue).toBe(R.EXERCICE);
    expect(b.vue).toBe(R.EXERCICE);
    expect(a.params.slug).toBe('dc-barre');
    expect(a.params.onglet).toBeUndefined();
    expect(b.params.onglet).toBe(R.EXO_HISTORIQUE);
  });

  test('le rechargement direct les reconstruit — aller-retour sans perte', () => {
    expect(R.construire(R.EXERCICE, { slug: 'dc-barre' })).toBe('/exercice/dc-barre');
    expect(R.construire(R.EXERCICE, { slug: 'dc-barre', onglet: R.EXO_HISTORIQUE }))
      .toBe('/exercice/dc-barre/historique');
    const r = R.analyser(R.construire(R.EXERCICE, { slug: 'dc-barre', onglet: R.EXO_HISTORIQUE }));
    expect(r.params).toEqual({ slug: 'dc-barre', onglet: R.EXO_HISTORIQUE });
  });

  test('un sous-onglet inconnu retombe sur le Résumé, sans lever', () => {
    const r = R.analyser('/exercice/dc-barre/instructions');
    expect(r.vue).toBe(R.EXERCICE);
    expect(r.params.onglet).toBeUndefined();
    expect(r.repli).toBe('sous-vue-inconnue');
  });

  test('un slug malformé ne devient pas une page', () => {
    expect(R.analyser('/exercice/$$bad').vue).toBe(R.RACINE);
    expect(R.analyser('/exercice/').vue).toBe(R.RACINE);
  });

  test('la page vit sous l’onglet Séances — elle n’en crée pas un sixième', () => {
    expect(R.ongletDe(R.EXERCICE)).toBe(R.RACINE);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3, 5, 6, 7 — CE QUI S'AFFICHE
// ════════════════════════════════════════════════════════════════════════════
const rendre = (vue) => {
  const cible = document.createElement('div');
  Rendu().rendrePageExercice(cible, Object.assign({
    nom: 'Développé Couché (Barre)', mesure: 'charge_reps', onglet: 'resume',
    sousTitre: '', surOnglet: () => {}, seanceEnCours: null,
    derniere: null, record: null, volume: { nbSeries: 0, nbSeances: 0 },
    table: [], cibleReps: null, historique: [], surSeance: () => {},
    reste: 0, surVoirPlus: () => {}
  }, vue));
  return cible;
};

describe('⚠️ le Résumé lit, il ne recalcule pas', () => {
  test('les trois chiffres : dernière séance, record, séries de travail', () => {
    const c = rendre({
      derniere: { charge: 122.5, reps: 6, date: '2026-09-11' },
      record: { charge: 140, reps: 1, date: '2026-01-10' },
      volume: { nbSeries: 312, nbSeances: 123 }
    });
    const v = [...c.querySelectorAll('.exo-li-v')].map((n) => n.textContent);
    expect(v[0]).toBe('122,5 kg × 6');
    expect(v[1]).toBe('140 kg × 1');
    expect(v[2]).toBe('312');
    const k = [...c.querySelectorAll('.exo-li-k em')].map((n) => n.textContent);
    expect(k[2]).toBe('sur 123 séances');
  });

  // 6. Exercice jamais fait → page vide propre, pas de plantage.
  test('un exercice jamais fait rend une page, pas une exception', () => {
    const c = rendre({ nom: 'Soulevé de Terre' });
    expect(c.querySelector('h2').textContent).toBe('Soulevé de Terre');
    // Trois tirets, pas trois zéros : « rien » et « zéro » ne se ressemblent pas.
    expect([...c.querySelectorAll('.exo-li-v')].map((n) => n.textContent))
      .toEqual(['—', '—', '—']);
    expect(c.querySelector('.vide')).not.toBeNull();
  });
});

// 5. Exercice sans charge : pas de « 0 kg », l'affichage suit la MESURE.
describe('⚠️ un exercice sans charge n’affiche jamais 0 kg', () => {
  // CONFIGURATION DISCRIMINANTE : `temps` ET `reps`, les deux chemins.
  test.each([
    ['temps', 'Planche', { valeur: '1 min 30 s' }, 'durée'],
    ['reps', 'Tractions', { valeur: '15' }, 'poids du corps']
  ])('%s : la valeur est celle de la mesure, et la phrase la nomme', (mesure, nom, serie, mot) => {
    const c = rendre({
      nom: nom, mesure: mesure,
      derniere: Object.assign({ date: '2026-09-11' }, serie),
      record: Object.assign({ date: null }, serie),
      volume: { nbSeries: 4, nbSeances: 2 }
    });
    const v = [...c.querySelectorAll('.exo-li-v')].map((n) => n.textContent);
    expect(v[0]).toBe(serie.valeur);
    expect(v[1]).toBe(serie.valeur);
    expect(c.textContent).not.toMatch(/0 kg/);
    // ⚠️ L'AFFICHAGE LIT LA MESURE, JAMAIS UN CODE D'ERREUR DU MOTEUR.
    expect(c.textContent).toContain(mot);
    expect(c.textContent).not.toMatch(/sans-charge|hors-moteur|aucune-serie/);
  });

  test('`distance_temps` le dit aussi, et sans code d’erreur', () => {
    const c = rendre({ nom: 'Randonnée', mesure: 'distance_temps',
      derniere: { valeur: '2 h 10', complement: '· 8,4 km', date: '2026-09-11' } });
    expect(c.querySelector('.exo-li-v').textContent).toBe('2 h 10 · 8,4 km');
    expect(c.textContent).not.toMatch(/hors-moteur/);
    // 119 (E5) — la voix du coach : « le coach ne le suit pas », jamais « hors du moteur ».
    expect(c.textContent).toContain('le coach ne le suit pas');
    expect(c.textContent).not.toMatch(/hors du moteur|palier/);
  });

  // 119 (audit du 16/10/2026, E5) — Aurélien, 16/10 : « Pour les exercices calculés en temps, il ne faut pas mettre
  // les reps. » La page d'une planche ou d'un tapis annonçait « PAR NOMBRE DE RÉPÉTITIONS ».
  test.each([
    ['temps', 'Planche', 'Plus longue durée'],
    ['distance_temps', 'Tapis de course', 'Plus longue durée']
  ])('119 — %s : ni table par répétitions, ni « palier », ni « hors du moteur » ; « %s » dit sa meilleure durée',
    (mesure, nom, libelle) => {
      const c = rendre({ nom: nom, mesure: mesure, record: { valeur: '1 min 30', date: null } });
      expect(c.textContent).not.toMatch(/RÉPÉTITIONS|répétitions|palier|hors du moteur/);
      expect(c.querySelector('.table-reps')).toBeNull();
      const k = [...c.querySelectorAll('.exo-li-k')].map((x) => x.firstChild.textContent);
      expect(k).toContain(libelle);
      expect(k).not.toContain('Record');
    });

  test('119 — au poids du corps : « Record de reps », et la table par répétitions reste', () => {
    const c = rendre({ nom: 'Tractions', mesure: 'reps', record: { valeur: '15', date: null } });
    expect([...c.querySelectorAll('.exo-li-k')].map((x) => x.firstChild.textContent)).toContain('Record de reps');
    expect(c.textContent).toMatch(/PAR NOMBRE DE RÉPÉTITIONS/);
    // Sans série : « Aucune série de travail », jamais « Pas de table par répétitions » (l'état des lieux du 18/09).
    expect(c.textContent).toContain('Aucune série de travail enregistrée.');
  });

  test('sur `charge_reps`, aucune phrase d’exercice sans charge', () => {
    const c = rendre({ derniere: { charge: 100, reps: 5, date: 'x' } });
    expect(c.textContent).not.toMatch(/pas de palier en kilos/);
  });
});

// 7. La table : valeurs brutes, lignes déduites grisées.
describe('⚠️ la table par reps — déduit grisé, cible en avant', () => {
  const TABLE = () => [
    { reps: 6, charge: 120, date: '2026-09-01', deduit: false },
    { reps: 8, charge: 110, date: '2025-11-22', deduit: false },
    { reps: 14, charge: 42.5, date: '2024-02-10', deduit: true, chargeDeduite: 80 },
    { reps: 15, charge: 80, date: '2025-07-03', deduit: false }
  ];

  test('une ligne par entrée, et la déduite porte la classe qui la grise', () => {
    const c = rendre({ table: TABLE(), cibleReps: 6 });
    const l = [...c.querySelectorAll('.tr-ligne')];
    expect(l.length).toBe(4);
    expect(l.map((x) => x.classList.contains('deduit')))
      .toEqual([false, false, true, false]);
  });

  test('la ligne déduite montre ce qu’on pourrait revendiquer, pas le brut', () => {
    const c = rendre({ table: TABLE(), cibleReps: 6 });
    const kg = [...c.querySelectorAll('.tr-charge')].map((x) => x.textContent);
    expect(kg).toEqual(['120', '110', '80', '80']);
    // Et « déduit » remplace la date : celle du brut désignerait une autre
    // performance que celle affichée.
    const q = [...c.querySelectorAll('.tr-quand')].map((x) => x.textContent);
    expect(q[2]).toBe('déduit');
    expect(q[0]).toMatch(/2026/);
  });

  test('la note n’apparaît QUE s’il y a une ligne déduite', () => {
    const avec = rendre({ table: TABLE() });
    expect(avec.textContent).toContain('Les lignes grisées');
    const sans = rendre({ table: TABLE().filter((l) => !l.deduit) });
    expect(sans.textContent).not.toContain('Les lignes grisées');
  });

  test('la cible courante est mise en avant, et elle seule', () => {
    const c = rendre({ table: TABLE(), cibleReps: 8 });
    const cibles = [...c.querySelectorAll('.tr-ligne.cible')];
    expect(cibles.length).toBe(1);
    expect(cibles[0].querySelector('.tr-reps').textContent).toBe('8');
  });

  test('sans cible, aucune ligne n’est mise en avant', () => {
    expect(rendre({ table: TABLE(), cibleReps: null })
      .querySelectorAll('.tr-ligne.cible').length).toBe(0);
  });

  test('sur une mesure sans table, la colonne de charge n’existe pas', () => {
    const c = rendre({ mesure: 'reps', table: [
      { reps: 8, charge: 0, date: 'a', deduit: true },
      { reps: 15, charge: 0, date: 'b', deduit: false }
    ] });
    expect(c.querySelector('.table-reps').classList.contains('sans-charge')).toBe(true);
    expect(c.querySelectorAll('.tr-charge').length).toBe(0);
  });
});

describe('⚠️ les deux sous-onglets, et le bandeau de séance', () => {
  test('un seul onglet actif, et il suit la vue', () => {
    const c = rendre({ onglet: 'historique' });
    const actifs = [...c.querySelectorAll('.sous-onglet.actif')];
    expect(actifs.length).toBe(1);
    expect(actifs[0].textContent).toBe('Historique');
  });

  test('ni Instructions ni Classement — un onglet vide coûte la confiance', () => {
    const c = rendre({});
    expect([...c.querySelectorAll('.sous-onglet')].map((n) => n.textContent))
      .toEqual(['Résumé', 'Historique']);
  });

  test('taper l’autre onglet le demande au routeur, il ne bascule pas tout seul', () => {
    const vus = [];
    const c = rendre({ surOnglet: (o) => vus.push(o) });
    c.querySelectorAll('.sous-onglet')[1].click();
    expect(vus).toEqual(['historique']);
  });

  // §7 quater.1 — on consulte sans avoir l'impression d'avoir quitté.
  test('le bandeau n’existe QUE si une séance est en cours', () => {
    expect(rendre({}).querySelector('.exo-bandeau')).toBeNull();
    const vus = [];
    const c = rendre({ seanceEnCours: { titre: 'Pecs – Dos', surReprendre: () => vus.push(1) } });
    expect(c.querySelector('.exo-bandeau').textContent).toContain('Pecs – Dos');
    expect(c.querySelector('.exo-bandeau').textContent).toContain('en cours');
    c.querySelector('.exo-reprendre').click();
    expect(vus).toEqual([1]);
  });
});

describe('⚠️ l’Historique réutilise le rendu du détail de séance', () => {
  const blocsDe = (series) => Modele.construireBlocs(series, EXOS);
  const JOUR = () => ({
    id: 'S1', titre: 'Pecs – Dos', debut: '2026-09-11T18:00:00Z', note: '',
    record: 0,
    blocs: blocsDe([kgxr(60, 10, { type_serie: 'echauffement' }), kgxr(122.5, 6)])
  });

  test('chaque jour porte ses séries, chauffe comprise, via `rendreBloc`', () => {
    const c = rendre({ onglet: 'historique', historique: [JOUR()] });
    const lignes = [...c.querySelectorAll('.exo-jour .serie')];
    expect(lignes.length).toBe(2);
    // La chauffe est en retrait — la classe du détail, pas une seconde règle.
    expect(lignes[0].classList.contains('hors-travail')).toBe(true);
    expect(lignes[1].classList.contains('hors-travail')).toBe(false);
    expect(lignes[1].querySelector('.mesure').textContent).toBe('122,5 kg × 6');
  });

  test('le titre de la séance mène au détail complet', () => {
    const vus = [];
    const c = rendre({ onglet: 'historique', historique: [JOUR()], surSeance: (id) => vus.push(id) });
    c.querySelector('.exo-jour-s').click();
    expect(vus).toEqual(['S1']);
  });

  test('un record du jour est signalé, et il dit à combien de reps', () => {
    const sans = rendre({ onglet: 'historique', historique: [JOUR()] });
    expect(sans.querySelector('.exo-jour-s b')).toBeNull();
    const avec = rendre({ onglet: 'historique',
      historique: [Object.assign(JOUR(), { record: 6 })] });
    expect(avec.querySelector('.exo-jour-s b').textContent).toContain('record à 6 reps');
  });

  // 115 (audit du 16/10, E3 ; décision d'Aurélien D8) — `repos_s` n'est pas un repos : il contient le temps
  // d'exécution, 45 s sur une série de superset enchaînée, une valeur inventée en Édition. MODIFICATEURS §4 :
  // « enregistré, jamais affiché ». Même mesuré, même fourni par l'appelant, aucun « Repos moyen ».
  test('le repos moyen ne s’affiche jamais, même mesuré (D8)', () => {
    const sans = rendre({ onglet: 'historique', historique: [JOUR()] });
    expect(sans.textContent).not.toContain('Repos moyen');
    const avec = rendre({ onglet: 'historique',
      historique: [Object.assign(JOUR(), { reposMoyen: 140 })] });
    expect(avec.textContent).not.toMatch(/repos/i);
    expect(avec.textContent).not.toContain('2:20');
  });

  test('la note de séance est rendue quand il y en a une', () => {
    const c = rendre({ onglet: 'historique',
      historique: [Object.assign(JOUR(), { note: 'Dur de se réveiller' })] });
    expect(c.textContent).toContain('Dur de se réveiller');
  });

  test('« voir plus » n’existe que s’il reste quelque chose à voir', () => {
    const sans = rendre({ onglet: 'historique', historique: [JOUR()], reste: 0 });
    expect(sans.textContent).not.toContain('Voir plus');
    const avec = rendre({ onglet: 'historique', historique: [JOUR()], reste: 103 });
    expect(avec.textContent).toContain('Voir plus — 103 séances avant');
  });

  test('aucune séance : un constat, pas un écran nu', () => {
    const c = rendre({ onglet: 'historique', historique: [] });
    expect(c.querySelector('.vide').textContent).toContain('Aucune séance');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. LE TAP SUR UN NOM D'EXERCICE — inerte depuis le chantier 27
// ════════════════════════════════════════════════════════════════════════════
describe('⚠️ le nom d’un exercice mène à sa page (§2.8)', () => {
  const bloc = () => Modele.construireBlocs([kgxr(122.5, 6)], EXOS)[0];

  test('dans le détail d’une séance, le nom devient un bouton', () => {
    const cible = document.createElement('div');
    const vus = [];
    Rendu().rendreDetail(cible, { id: 'S', titre: 'Pecs – Dos' }, [bloc()],
      { surExercice: (slug) => vus.push(slug) });
    const lien = cible.querySelector('.exos .nom');
    expect(lien.tagName).toBe('BUTTON');
    lien.click();
    expect(vus).toEqual(['dc']);
  });

  // ⚠️ SANS `surExercice`, LE BLOC EST EXACTEMENT CE QU'IL ÉTAIT. C'est ce qui
  // permet à l'historique de la page de le réutiliser sans se rappeler.
  test('sans destination, le nom reste du texte — pas un bouton mort', () => {
    const cible = document.createElement('div');
    Rendu().rendreDetail(cible, { id: 'S', titre: 'Pecs – Dos' }, [bloc()], null);
    expect(cible.querySelector('.exos .nom').tagName).toBe('SPAN');
  });

  test('et l’historique de la page d’exercice n’y renvoie pas non plus', () => {
    const c = rendre({ onglet: 'historique', historique: [{
      id: 'S1', titre: 'Pecs – Dos', debut: '2026-09-11T18:00:00Z', note: '',
      record: 0, blocs: [bloc()]
    }] });
    expect(c.querySelector('.exo-jour .nom').tagName).toBe('SPAN');
  });

  test('dans Progression, la ligne devient un bouton qui porte son slug', () => {
    const cible = document.createElement('div');
    const vus = [];
    Rendu().rendreSommaire(cible, {
      volume: { quand: '', zones: [] }, poids: {},
      exercices: { quand: '2 exercices', surExercice: (slug) => vus.push(slug),
        lignes: [{ slug: 'dc', nom: 'Développé Couché (Barre)', mesure: '122,5 kg × 6', jour: null }] }
    });
    const b = cible.querySelector('.bloc-exo');
    expect(b.tagName).toBe('BUTTON');
    b.click();
    expect(vus).toEqual(['dc']);
  });

  test('sans destination, la ligne de Progression reste inerte', () => {
    const cible = document.createElement('div');
    Rendu().rendreSommaire(cible, {
      volume: { quand: '', zones: [] }, poids: {},
      exercices: { quand: '', lignes: [{ slug: 'dc', nom: 'DC', mesure: '', jour: null }] }
    });
    expect(cible.querySelector('.bloc-exo').tagName).toBe('DIV');
  });
});

// ⚠️ ET PAS PENDANT LA SÉLECTION (§5.7). Là, la carte ENTIÈRE est la cible du
// tap : un bouton au milieu d'elle qui ferait autre chose est un piège. C'est
// la même raison qui fait disparaître le menu à trois points.
describe('⚠️ le nom en séance : tapable, sauf quand la carte l’est', () => {
  const Seance = require('../../v2/js/seance.js');
  let k = 0;
  const idSerie = () => 'x-' + (++k);
  const seanceDeDeux = () => {
    let s = Seance.creer({ id: 'S', userId: 'u', idSerie: idSerie });
    s = Seance.ajouterExercice(s, 'dc', idSerie);
    s = Seance.ajouterExercice(s, 'tractions', idSerie);
    return s;
  };
  const rendreSeance = (selection) => {
    const cible = document.createElement('div');
    const s = seanceDeDeux();
    Rendu().rendreBlocsSeance(cible, s, {
      blocs: Modele.blocsDeSeance(s, EXOS),
      modifier: false, selection: selection,
      surGrouper: () => {}, surDeplacerBloc: () => {},
      surMenuBloc: () => {}, surMenuExercice: () => {},
      surExercice: () => {},
      tourAtteint: () => 0,
      exercice: (slug) => EXOS.filter((e) => e.slug === slug)[0],
      precedent: () => null, fantome: () => ({}),
      surChamp: () => {}, surValider: () => {}, surNumero: () => {},
      surEffort: () => {}, surNote: () => {}, surRepos: () => {},
      surSupprimerSerie: () => {}, surAjoutSerie: () => {}
    });
    return cible;
  };

  test('hors sélection, le nom est un bouton qui mène à sa page', () => {
    const c = rendreSeance(null);
    const noms = [...c.querySelectorAll('.exo-seance .nom-exo')];
    expect(noms.length).toBe(2);
    expect(noms.every((n) => n.tagName === 'BUTTON')).toBe(true);
  });

  test('EN sélection, il redevient du texte — la carte entière est la cible', () => {
    const c = rendreSeance(0);
    const noms = [...c.querySelectorAll('.exo-seance .nom-exo')];
    expect(noms.length).toBe(2);
    expect(noms.every((n) => n.tagName === 'SPAN')).toBe(true);
    // Et la carte visée est bien passée en mode cible : sans ça, le test
    // mesurerait un écran de sélection qui n'a pas eu lieu.
    expect(c.querySelectorAll('.bloc-seance.cible-groupe').length).toBe(1);
  });
});

// ⚠️ DEUX GARDES QUI SE RESSEMBLENT ET NE SE DOUBLENT PAS.
describe('⚠️ tableParReps — les deux bords de la règle', () => {
  test('à charge ÉGALE, la ligne de gauche n’est PAS déduite : elle a été faite', () => {
    // CONFIGURATION DISCRIMINANTE : 80 × 13 et 80 × 15. Avec `>=`, le 13 serait
    // grisé alors qu'il a réellement eu lieu et qu'il n'y a rien de plus à
    // revendiquer. Le cas mesuré du couché le confirme : 13 et 15 sont tous
    // deux à 80, et seul le 14 (fait à 42,5) est déduit.
    const t = Modele.tableParReps([
      kgxr(80, 13, { session_id: 'a' }), kgxr(80, 15, { session_id: 'b' })
    ], 'charge_reps', (x) => x.session_id);
    expect(t.map((l) => l.deduit)).toEqual([false, false]);
  });

  test('une série en `temps` QUI PORTE AUSSI des reps ne fabrique pas de table', () => {
    // CONFIGURATION DISCRIMINANTE : sans les reps, la table serait vide de toute
    // façon — la garde sur la mesure ne serait pas mesurée. Un import peut poser
    // les deux colonnes ; c'est la mesure qui tranche, pas les données du jour.
    expect(Modele.tableParReps([s('planche', { duree_s: 90, reps: 3 })],
      'temps', () => '2026-01-01')).toEqual([]);
    expect(Modele.tableParReps([s('rando', { duree_s: 7200, distance_m: 8400, reps: 1 })],
      'distance_temps', () => '2026-01-01')).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 125 (ECRAN-SAISIE §7 quater.5) — « COMMENT FAIRE »
// ════════════════════════════════════════════════════════════════════════════
describe('125. « Comment faire » est adressable', () => {
  test('/exercice/<slug>/comment s’analyse et se reconstruit — aller-retour sans perte', () => {
    const r = R.analyser('/exercice/dc-barre/comment');
    expect(r.vue).toBe(R.EXERCICE);
    expect(r.params).toEqual({ slug: 'dc-barre', onglet: R.EXO_COMMENT });
    expect(r.repli).toBeUndefined();
    expect(R.construire(R.EXERCICE, { slug: 'dc-barre', onglet: R.EXO_COMMENT })).toBe('/exercice/dc-barre/comment');
    expect(R.analyser(R.construire(R.EXERCICE, { slug: 'dc-barre', onglet: R.EXO_COMMENT })).params)
      .toEqual({ slug: 'dc-barre', onglet: R.EXO_COMMENT });
  });
});

// CONFIGURATION DISCRIMINANTE : les quatre combinaisons (séances oui/non × description oui/non), sans onglet demandé,
// puis chaque onglet demandé. Une règle « toujours Résumé » ou « Comment faire dès qu'il y a une description »
// échoue sur au moins une ligne.
describe('125. l’onglet ouvert — Résumé, sauf un exercice jamais fait qui a une description', () => {
  test.each([
    [undefined, false, true, 'comment'],
    [undefined, true, true, 'resume'],
    [undefined, false, false, 'resume'],
    [undefined, true, false, 'resume'],
    ['comment', true, true, 'comment'],
    ['comment', false, false, 'resume'],
    ['historique', false, true, 'historique'],
    ['n-importe', false, true, 'resume']
  ])('demande %s, séances %s, description %s → %s', (demande, seances, desc, attendu) => {
    expect(R.ongletExercice(demande, seances, desc)).toBe(attendu);
  });
});

describe('125. le rendu de « Comment faire »', () => {
  const ETAPES = ['Place la barre sur le haut du dos.', 'Descends en poussant les hanches en arrière.',
    'Remonte en poussant le sol : « 2 × 5 », mot pour mot.'];
  const COMMENT = { description: ETAPES.join('\n'), materiel: 'Barre', travaille: 'Quadriceps · Fessiers', aussi: 'Adducteurs' };

  test('trois onglets avec une description, deux sans', () => {
    const avec = rendre({ comment: COMMENT });
    expect([...avec.querySelectorAll('.sous-onglet')].map((x) => x.textContent))
      .toEqual(['Résumé', 'Historique', 'Comment faire']);
    const sans = rendre({ comment: null });
    expect([...sans.querySelectorAll('.sous-onglet')].map((x) => x.textContent)).toEqual(['Résumé', 'Historique']);
  });

  test('les étapes : numérotées dans l’ordre, le texte au caractère près, la fiche avant', () => {
    const c = rendre({ onglet: 'comment', comment: COMMENT });
    const etapes = [...c.querySelectorAll('ol.etapes li.etape')];
    expect(etapes.map((li) => li.querySelector('.etape-n').textContent)).toEqual(['1', '2', '3']);
    expect(etapes.map((li) => li.querySelector('.etape-t').textContent)).toEqual(ETAPES);
    expect([...c.querySelectorAll('.exo-comment-fiche .exo-li')].map((l) =>
      [l.querySelector('.exo-li-k').textContent, l.querySelector('.exo-li-v').textContent]))
      .toEqual([['Matériel', 'Barre'], ['Travaille', 'Quadriceps · Fessiers'], ['Aussi', 'Adducteurs']]);
    expect(c.querySelector('.sous-onglet.actif').textContent).toBe('Comment faire');
  });

  test('une fiche sans muscles : seule la ligne Matériel ; une ligne vide de la description ne fait pas d’étape', () => {
    const c = rendre({ onglet: 'comment', comment: { description: 'Une.\n\nDeux.\nTrois.', materiel: 'Sans matériel', travaille: '', aussi: '' } });
    expect([...c.querySelectorAll('.exo-comment-fiche .exo-li-k')].map((x) => x.textContent)).toEqual(['Matériel']);
    expect([...c.querySelectorAll('.etape-n')].map((x) => x.textContent)).toEqual(['1', '2', '3']);
  });

  test('un onglet « comment » sans description rend le Résumé, jamais une page vide', () => {
    const c = rendre({ onglet: 'comment', comment: null });
    expect(c.querySelector('ol.etapes')).toBeNull();
    expect(c.querySelector('.sous-onglet.actif')).toBeNull();
  });
});
