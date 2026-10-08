//
// 60-3 — la feuille « Tes séances qui reviennent » (ECRAN-SAISIE §7 quindecies.7).
//
//   · le rendu (`rendu.js`) : les textes au mot près, une carte par routine,
//     sa case, « En faire mes routines (N) » inactif à zéro, l'ancienne en gris,
//     la voix du coach, « Rien trouvé » ; la ligne de la bibliothèque ;
//   · les gestes (`app.js`, rejoués dans un bac `vm` avec les VRAIS modules
//     `THRoutines` et `THModele`) : chaque routine cochée créée PAR LE CHEMIN DE
//     « Créer la routine » (`Routines.enregistrer`), dans « Mon programme »
//     (« (2) » s'il existe), dans l'ordre de la feuille, des noms rendus uniques,
//     jamais de charge ; deux taps n'écrivent pas deux fois ; une panne au milieu
//     garde le même dossier ; hors ligne, rien n'est écrit.
//
// Environnement jsdom (PAS de docblock `node`) : `rendu.js` se termine par `this`.

process.env.TZ = 'Europe/Paris';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
require('../../v2/js/periode.js');
const Routines = require('../../v2/js/routines.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const F = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-60-3-deduit.json'), 'utf8'));
const LEA = F.cas[1].attendu;   // BOOTY A (15), DOS A (6, ancienne), BOOTY B (5), DOS B (5)

const texte = (n) => n.textContent.replace(/\s+/g, ' ').trim();

// ═══ LE RENDU ═══════════════════════════════════════════════════════════════
describe('le rendu de la feuille', () => {
  const cartes = [
    { nom: 'BOOTY A', ligne: '15 fois · dernière fois dimanche', exercices: 'Hip thrust 2 × 10 · RDL 3 × 10', ancienne: null, cochee: true },
    { nom: 'DOS A', ligne: '6 fois · dernière fois le 26 juil.', exercices: 'Tractions 2 × 8', ancienne: 'Pas faite depuis le 26 juil.', cochee: false }
  ];
  const rendre = (vue) => {
    const cible = document.createElement('div');
    const appels = [];
    Rendu().rendreFeuilleSeancesQuiReviennent(cible, Object.assign({
      routines: cartes, erreur: '', enCours: false,
      surCocher: (i) => appels.push(['cocher', i]), surCreer: () => appels.push(['creer']),
      surPasMaintenant: () => appels.push(['plus-tard']), surNouvelle: () => appels.push(['nouvelle'])
    }, vue || {}));
    return { cible, appels };
  };

  test('les textes au mot près, une carte par routine, l’ancienne en gris, la voix du coach', () => {
    const { cible } = rendre();
    expect(texte(cible.querySelector('.feuille-t'))).toBe('Tes séances qui reviennent, sur tes 12 dernières semaines.');
    const c = cible.querySelectorAll('.retrouver-carte');
    expect(c.length).toBe(2);
    expect(texte(c[0].querySelector('.rc-nom'))).toBe('BOOTY A');
    expect(texte(c[0].querySelector('.rc-ligne'))).toBe('15 fois · dernière fois dimanche');
    expect(c[0].querySelector('.rc-case').textContent).toBe('☑');
    expect(c[0].getAttribute('aria-pressed')).toBe('true');
    expect(c[0].querySelector('.rc-ancienne')).toBeNull();
    expect(c[1].querySelector('.rc-case').textContent).toBe('☐');
    expect(texte(c[1].querySelector('.rc-ancienne'))).toBe('Pas faite depuis le 26 juil.');
    expect(texte(cible.querySelector('.q-voix'))).toBe('Tu pourras tout changer ensuite : exercices, séries, repos.');
    const boutons = Array.from(cible.querySelectorAll('.feuille-menu button')).map(texte);
    expect(boutons).toEqual(['En faire mes routines (1)', 'Pas maintenant']);
  });

  test('le nombre suit les cases ; à zéro, « En faire mes routines » est inactif', () => {
    const zero = rendre({ routines: cartes.map((x) => Object.assign({}, x, { cochee: false })) });
    const b = zero.cible.querySelector('.retrouver-creer');
    expect(texte(b)).toBe('En faire mes routines (0)');
    expect(b.disabled).toBe(true);
    b.click();
    expect(zero.appels).toEqual([]);
    const deux = rendre({ routines: cartes.map((x) => Object.assign({}, x, { cochee: true })) });
    expect(texte(deux.cible.querySelector('.retrouver-creer'))).toBe('En faire mes routines (2)');
  });

  test('toucher une carte coche ou décoche (le geste), « Pas maintenant » ferme', () => {
    const { cible, appels } = rendre();
    cible.querySelectorAll('.retrouver-carte')[1].click();
    cible.querySelector('.retrouver-creer').click();
    Array.from(cible.querySelectorAll('.feuille-menu button')).filter((b) => texte(b) === 'Pas maintenant')[0].click();
    expect(appels).toEqual([['cocher', 1], ['creer'], ['plus-tard']]);
  });

  test('pendant l’écriture : « Création… », inactif', () => {
    const { cible } = rendre({ enCours: true });
    const b = cible.querySelector('.retrouver-creer');
    expect(texte(b)).toBe('Création…');
    expect(b.disabled).toBe(true);
  });

  test('rien trouvé : la phrase, et « Nouvelle routine »', () => {
    const { cible, appels } = rendre({ routines: [] });
    expect(texte(cible.querySelector('.retrouver-rien')))
      .toBe('Je ne trouve pas encore de séances qui reviennent assez souvent. Tu peux créer tes routines toi-même.');
    expect(cible.querySelector('.retrouver-carte')).toBeNull();
    const b = cible.querySelector('.feuille-menu button');
    expect(texte(b)).toBe('Nouvelle routine');
    b.click();
    expect(appels).toEqual([['nouvelle']]);
  });
});

describe('la ligne « Retrouver mes séances qui reviennent » de la bibliothèque', () => {
  const r = (id, nom, dossier, rang) => ({ id, nom, dossier: dossier || null, rang, exercices: [] });
  const rendre = (routines, vue) => {
    const cible = document.createElement('div');
    let ouvert = 0;
    Rendu().rendreListeRoutines(cible, routines, Object.assign({ surRetrouver: () => { ouvert++; } }, vue || {}));
    return { cible, ouvert: () => ouvert };
  };

  test('en tête de la bibliothèque, pour tout le monde ; elle ouvre la feuille', () => {
    const { cible, ouvert } = rendre([r('a', 'Push', null, 0), r('b', 'Pull', null, 1)]);
    const premier = cible.firstElementChild;
    expect(texte(premier)).toBe('Retrouver mes séances qui reviennent');
    premier.click();
    expect(ouvert()).toBe(1);
  });

  test('avec des dossiers : en tête aussi, et chaque dossier se retrouve par `data-dossier`', () => {
    const { cible } = rendre([r('a', 'Push', 'Mon programme', 0), r('b', 'Pull', null, 1)]);
    expect(texte(cible.firstElementChild)).toBe('Retrouver mes séances qui reviennent');
    expect(Array.from(cible.querySelectorAll('.dossier-ligne')).map((l) => l.getAttribute('data-dossier')))
      .toEqual(['Mon programme', '']);
  });

  test('bibliothèque vide : juste après « Créer une routine »', () => {
    const { cible } = rendre([], { surNouvelle: () => {} });
    const boutons = Array.from(cible.querySelectorAll('button')).map(texte);
    expect(boutons.slice(0, 2)).toEqual(['Créer une routine', 'Retrouver mes séances qui reviennent']);
  });

  test('pendant « Ranger » : pas de ligne', () => {
    const { cible } = rendre([r('a', 'Push', null, 0), r('b', 'Pull', null, 1)], { reorganiser: true });
    expect(texte(cible)).not.toMatch(/Retrouver/);
  });
});

// ═══ LES GESTES (`app.js`) ══════════════════════════════════════════════════
const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
function extraire(nom) {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable dans v2/js/app.js : ' + nom);
  return m[0];
}
const FONCTIONS = ['brouillonDeStructure', 'creerRoutineNeuve', 'creerDansUnDossier', 'ouvrirSeancesQuiReviennent', 'carteDeduite',
  'rendreFeuilleRetrouver', 'creerRoutinesDeduites', 'ouvrirBibliothequeSur', 'rangSuivantBibliotheque',
  'nomsReserves', 'messageVerdict'];

const CATALOGUE = [
  { slug: 'hip_thrust_machine', nom: 'Hip thrust machine', mesure: 'charge_reps', muscles_primaires: ['fessiers'], muscles_secondaires: ['ischios', 'quadriceps'] },
  { slug: 'souleve_de_terre_roumain_barre', nom: 'Soulevé de terre roumain', mesure: 'charge_reps', muscles_primaires: ['ischios'], muscles_secondaires: ['fessiers', 'lombaires'] },
  { slug: 'tractions', nom: 'Tractions', mesure: 'reps', muscles_primaires: ['dos'], muscles_secondaires: ['biceps'] }
];

function bac(options) {
  const o = options || {};
  const journal = { routines: [], exercices: [], series: [], feuilles: [], voile: 0, ferme: 0, saisie: 0, chargements: 0, ouvertes: [] };
  let n = 0;
  const Donnees = {
    creerRoutine: async (ligne) => {
      if (o.panne && o.panne(journal.routines.length)) throw new Error('Failed to fetch');
      journal.routines.push(ligne);
      return Object.assign({ id: 'r' + (++n) }, ligne);
    },
    insererExercices: async (lignes) => { journal.exercices.push(lignes); },
    remplacerSeriesRoutine: async (id, lignes) => { journal.series.push(lignes); },
    supprimerExercices: async () => {}, majExercice: async () => {}, supprimerRoutine: async () => {}
  };
  const ctx = {
    Routines, Modele, Donnees,
    Rendu: { rendreFeuilleSeancesQuiReviennent: (c, v) => { journal.feuilles.push(v); ctx.__vue = v; } },
    faits: { programmeDeduit: () => (o.deduites || LEA).map((d) => JSON.parse(JSON.stringify(d))) },
    corpus: () => ({}),
    catalogueIndexe: () => Modele.indexerExercices(CATALOGUE),
    local: { exercices: CATALOGUE },
    routines: (o.routines || []).slice(),
    etatRoutines: { code: o.nonLues ? 'jamais' : 'ok' },
    chargerRoutines: async () => { journal.chargements++; ctx.etatRoutines = { code: 'ok' };
      ctx.routines = (o.routines || []).concat(journal.routines.map((l, i) => Object.assign({ id: 'r' + (i + 1), exercices: [] }, l))); return true; },
    sessionActive: { user: { id: 'u1' } },
    uuid: () => 'id-' + Math.random().toString(16).slice(2),
    enregistrementEnCours: false,
    retrouver: null,
    DOSSIER_DU_PROGRAMME: /var DOSSIER_DU_PROGRAMME = '([^']+)'/.exec(APP)[1],
    $: (id) => ({ id, querySelectorAll: () => [] }),
    voileOuvert: null,
    ouvrirVoile: (noeud, apres) => { journal.voile++; ctx.voileOuvert = noeud; ctx.__apres = apres; },
    fermerVoile: () => { journal.ferme++; ctx.voileOuvert = null; const a = ctx.__apres; ctx.__apres = null; if (a) a(); },
    ouvrirRoutine: (id) => { journal.ouvertes.push(id); },
    dossiersReplies: o.replies || {},
    memoriserDossiersReplies: () => { journal.replies = Object.assign({}, ctx.dossiersReplies); },
    afficherSaisie: async () => { journal.saisie++; },
    rendreSaisie: () => { journal.rendreSaisie = (journal.rendreSaisie || 0) + 1; },
    vues: { saisie: { hidden: false } },
    seance: null,
    Date, Math, Promise
  };
  vm.createContext(ctx);
  FONCTIONS.forEach((f) => vm.runInContext(extraire(f), ctx));
  return { ctx, journal, vue: () => ctx.__vue, appel: (code) => vm.runInContext(code, ctx) };
}

describe('les gestes : ouvrir la feuille', () => {
  test('les routines déduites, cochées comme la règle le dit ; rien n’est écrit à l’ouverture', async () => {
    const b = bac();
    await b.appel('ouvrirSeancesQuiReviennent()');
    expect(b.journal.voile).toBe(1);
    expect(b.vue().routines.map((r) => [r.nom, r.cochee])).toEqual(
      [['BOOTY A', true], ['DOS A', false], ['BOOTY B', true], ['DOS B', true]]);
    expect(b.vue().routines[1].ancienne).toBe('Pas faite depuis le 26 juil.');
    expect(b.vue().routines[0].ancienne).toBeNull();
    expect(b.vue().routines[0].ligne).toMatch(/^15 fois · dernière fois /);
    expect(b.vue().routines[0].exercices).toMatch(/^Hip thrust machine 2 × 10 · Soulevé de terre roumain 3 × 10 · /);
    expect(b.journal.routines).toEqual([]);
  });

  test('la bibliothèque pas encore lue : elle se charge d’abord (les noms et les repos la lisent)', async () => {
    const b = bac({ nonLues: true });
    await b.appel('ouvrirSeancesQuiReviennent()');
    expect(b.journal.chargements).toBe(1);
  });

  test('une case touchée change le compte, sans rien écrire', async () => {
    const b = bac();
    await b.appel('ouvrirSeancesQuiReviennent()');
    b.vue().surCocher(1);
    expect(b.vue().routines[1].cochee).toBe(true);
    b.vue().surCocher(0);
    expect(b.vue().routines.filter((r) => r.cochee).length).toBe(3);
    expect(b.journal.routines).toEqual([]);
  });
});

describe('les gestes : « En faire mes routines (N) »', () => {
  test('chaque routine cochée, dans l’ordre de la feuille, dans « Mon programme », par le chemin de « Créer la routine »', async () => {
    const b = bac();
    await b.appel('ouvrirSeancesQuiReviennent()');
    await b.vue().surCreer();
    expect(b.journal.routines.map((l) => [l.nom, l.dossier, l.rang])).toEqual([
      ['BOOTY A', 'Mon programme', 0], ['BOOTY B', 'Mon programme', 1], ['DOS B', 'Mon programme', 2]]);
    // Jamais de charge ; chauffes puis séries de travail aux reps visées.
    const toutes = [].concat.apply([], b.journal.series);
    expect(toutes.every((l) => l.charge_cible_kg === null)).toBe(true);
    expect(b.journal.series[0].map((l) => [l.type_serie, l.reps_visees]))
      .toEqual([['echauffement', null], ['travail', 10], ['travail', 10]]);
    // Puis la bibliothèque s'ouvre sur le dossier.
    expect(b.journal.ferme).toBe(1);
    expect(b.journal.saisie).toBe(1);
    expect(b.ctx.retrouver).toBeNull();
  });

  test('« Mon programme » existe déjà : « Mon programme (2) » ; un nom déjà pris : « (2) »', async () => {
    const b = bac({ routines: [{ id: 'x', nom: 'BOOTY A', dossier: 'Mon programme', rang: 4, exercices: [] }] });
    await b.appel('ouvrirSeancesQuiReviennent()');
    b.vue().surCocher(2); b.vue().surCocher(3);       // seulement BOOTY A
    await b.vue().surCreer();
    expect(b.journal.routines.map((l) => [l.nom, l.dossier, l.rang])).toEqual([['BOOTY A (2)', 'Mon programme (2)', 5]]);
  });

  test('⚠️ DISCRIMINANT — deux taps rapides n’écrivent pas deux fois', async () => {
    const b = bac();
    await b.appel('ouvrirSeancesQuiReviennent()');
    const creer = b.vue().surCreer;
    await Promise.all([creer(), creer()]);
    expect(b.journal.routines.length).toBe(3);
  });

  test('une panne au milieu : les routines créées quittent la feuille, l’erreur est dite, et la reprise reste dans le même dossier', async () => {
    let coupe = true;
    const b = bac({ panne: (deja) => coupe && deja === 1, routines: [{ id: 'x', nom: 'Push', dossier: 'Mon programme', rang: 0, exercices: [] }] });
    await b.appel('ouvrirSeancesQuiReviennent()');
    await b.vue().surCreer();
    expect(b.journal.routines.map((l) => l.nom)).toEqual(['BOOTY A']);
    expect(b.vue().erreur).toBe('Pas de réseau : rien n’a été enregistré.');
    expect(b.vue().routines.map((r) => r.nom)).toEqual(['DOS A', 'BOOTY B', 'DOS B']);
    expect(b.journal.ferme).toBe(0);
    // La bibliothèque derrière la feuille montre déjà la routine créée.
    expect(b.journal.rendreSaisie).toBe(1);
    coupe = false;
    await b.vue().surCreer();
    expect(b.journal.routines.map((l) => [l.nom, l.dossier])).toEqual([
      ['BOOTY A', 'Mon programme (2)'], ['BOOTY B', 'Mon programme (2)'], ['DOS B', 'Mon programme (2)']]);
    expect(b.journal.ferme).toBe(1);
  });

  test('hors ligne : rien n’est écrit, la feuille reste ouverte avec le message', async () => {
    const b = bac({ panne: () => true });
    await b.appel('ouvrirSeancesQuiReviennent()');
    await b.vue().surCreer();
    expect(b.journal.routines).toEqual([]);
    expect(b.vue().erreur).toBe('Pas de réseau : rien n’a été enregistré.');
    expect(b.vue().routines.length).toBe(4);
    expect(b.journal.rendreSaisie).toBeUndefined();   // rien de créé : rien à redessiner
  });

  test('la bibliothèque s’ouvre sur le dossier, déplié', async () => {
    const b = bac({ replies: { 'Mon programme': true, Autre: true } });
    await b.appel('ouvrirSeancesQuiReviennent()');
    await b.vue().surCreer();
    expect(b.ctx.dossiersReplies).toEqual({ Autre: true });
  });

  test('« Rien trouvé » : « Nouvelle routine » ouvre l’éditeur', async () => {
    const b = bac({ deduites: [] });
    await b.appel('ouvrirSeancesQuiReviennent()');
    expect(b.vue().routines).toEqual([]);
    b.vue().surNouvelle();
    expect(b.journal.ouvertes).toEqual([null]);
  });
});
