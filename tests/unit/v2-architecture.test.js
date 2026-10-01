/** @jest-environment node */
//
// LA GARDE D'ARCHITECTURE — « un seul coach, un seul câblage » (29/09/2026).
//
// C1 à C6 ont fait de `planDeSeance` le seul coach : la garde de C6 vérifie
// chaque plan (`verifierPlan`, I1 à I15), et le banc vérifie les invariants
// après chaque geste. Ils protègent le RÉSULTAT. Ce test protège le CÂBLAGE :
// un calcul du coach appelé directement depuis l'écran, en contournant le
// plan, ne se verrait dans les invariants que s'il produisait une
// contradiction visible. Ici, il se voit à la lecture du source.
//
// LA RÈGLE. Chaque fonction de calcul du coach (liste `GARDEES`) ne s'appelle
// que depuis le module qui la définit, `plan.js`, ou un fichier inscrit pour
// elle dans `AUTORISATIONS`, AVEC SA RAISON. Élargir la liste est un geste
// conscient, visible dans une PR — jamais un blocage : c'est ce qui laisse
// passer les chantiers suivants (programmes, poids du corps, chauffes…) sans
// laisser passer un second coach.
//
// LE PÉRIMÈTRE : ce que l'app sert — `v2/js/*.js` et `v2/index.html`. Les
// tests et les bancs sont hors du périmètre (ils appellent le moteur exprès).
//
// LA LECTURE : le source, commentaires et chaînes retirés. Un appel se
// reconnaît à l'accès par propriété (`Moteur.x`, `M.x`, `racine.THMoteur.x`,
// `Moteur().x` — l'alias ne compte pas), ou à l'accès entre crochets
// (`Moteur['x']`). Limite assumée : un alias de la FONCTION elle-même
// (`var f = …`) se voit à sa création, pas à ses appels.

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '../..');
const V2 = path.join(RACINE, 'v2');

// ── LES FONCTIONS DE CALCUL DU COACH ────────────────────────────────────────
//
// `module` : le fichier qui la définit et l'exporte (il a toujours le droit de
// l'appeler). `motif` : seulement quand le nom est AUSSI un champ ou un rappel
// ordinaire ailleurs — `fantome` est un champ des lignes du plan et un rappel
// de la vue (`vue.fantome(i, j)` dans `rendu.js`) : on ne garde que l'appel
// qualifié par le module.
const GARDEES = [
  // moteur.js — la consigne
  { fn: 'consignePour', module: 'moteur.js' },
  { fn: 'consigneDExercice', module: 'moteur.js' },
  { fn: 'contratDe', module: 'moteur.js' },
  { fn: 'sansPalierRetenues', module: 'moteur.js' },
  { fn: 'consigneFigee', module: 'moteur.js' },
  { fn: 'habitudeDe', module: 'moteur.js' },
  { fn: 'zoneRetenue', module: 'moteur.js' },
  { fn: 'zoneEnVigueur', module: 'moteur.js' },
  { fn: 'niveauValide', module: 'moteur.js' },
  { fn: 'chargeVoisine', module: 'moteur.js' },
  { fn: 'pasDeSalle', module: 'moteur.js' },
  { fn: 'repriseDe', module: 'moteur.js' },
  { fn: 'ecartHabituel', module: 'moteur.js' },
  // moteur.js — la réaction, la seconde charge, la couverture, les paris
  { fn: 'reactionPour', module: 'moteur.js' },
  { fn: 'contexteReaction', module: 'moteur.js' },
  { fn: 'secondeCharge', module: 'moteur.js' },
  { fn: 'sautsDeMontee', module: 'moteur.js' },
  { fn: 'planDeCouverture', module: 'moteur.js' },
  { fn: 'lignesDePari', module: 'moteur.js' },
  { fn: 'revisionsDuPlan', module: 'moteur.js' },
  { fn: 'observationDe', module: 'moteur.js' },
  { fn: 'idDePrediction', module: 'moteur.js' },
  // moteur.js — ce que le coach dit (phrases, en-tête, pourquoi, constat)
  { fn: 'phraseReaction', module: 'moteur.js' },
  { fn: 'enteteDeDisposition', module: 'moteur.js' },
  { fn: 'libellesConsigne', module: 'moteur.js' },
  { fn: 'pourquoiConsigne', module: 'moteur.js' },
  { fn: 'etiquetteZone', module: 'moteur.js' },
  { fn: 'constatDe', module: 'moteur.js' },
  { fn: 'constatDuJour', module: 'moteur.js' },
  { fn: 'suiteDExercice', module: 'moteur.js' },
  // moteur.js — les chauffes et les dégressives (§9.15, 49-U10)
  { fn: 'situationChauffe', module: 'moteur.js' },
  { fn: 'chauffesDe', module: 'moteur.js' },
  { fn: 'degressiveDe', module: 'moteur.js' },
  // moteur.js — la chute de fin de séance (§9.2 bis, 49-U12)
  { fn: 'chuteDe', module: 'moteur.js' },
  // moteur.js — le compteur de stagnation (§12.9, 49-U13)
  { fn: 'compteurDe', module: 'moteur.js' },
  { fn: 'phraseCompteur', module: 'moteur.js' },
  // moteur.js — l'escalier, la semaine allégée (§14.4, 49-U14)
  { fn: 'blocageGeneralise', module: 'moteur.js' },
  { fn: 'phraseCarte', module: 'moteur.js' },
  { fn: 'consigneAllegee', module: 'moteur.js' },
  { fn: 'phraseAllegee', module: 'moteur.js' },
  { fn: 'detailAllegee', module: 'moteur.js' },
  { fn: 'bandeauAllegee', module: 'moteur.js' },
  { fn: 'periodeAllegee', module: 'moteur.js' },
  { fn: 'carteAutorisee', module: 'moteur.js' },
  { fn: 'observationSemaineAllegee', module: 'moteur.js' },
  { fn: 'idDEscalier', module: 'moteur.js' },
  // moteur.js — l'escalier, le blocage isolé (§14.5, 49-U15)
  { fn: 'nIsole', module: 'moteur.js' },
  { fn: 'declenchementsRepondus', module: 'moteur.js' },
  { fn: 'marcheIsolee', module: 'moteur.js' },
  { fn: 'autresAvancent', module: 'moteur.js' },
  { fn: 'carteSchema', module: 'moteur.js' },
  { fn: 'phraseSeche', module: 'moteur.js' },
  { fn: 'repliEscalier', module: 'moteur.js' },
  { fn: 'consigneRepli', module: 'moteur.js' },
  { fn: 'phraseRepli', module: 'moteur.js' },
  { fn: 'observationMarche', module: 'moteur.js' },
  // moteur.js — la règle de volume, la place pour une série de plus (§14.6, 49-U16)
  { fn: 'placeDeVolume', module: 'moteur.js' },
  { fn: 'placePourExercice', module: 'moteur.js' },
  // seance.js — le fantôme, la couverture, les lignes figées, les paris
  { fn: 'fantome', module: 'seance.js',
    motif: /(?:\bSeance|\bS|\bSeance\(\)|\bS\(\)|racine\.THSeance)\s*\.\s*fantome\b/g },
  { fn: 'planDe', module: 'seance.js' },
  { fn: 'couvertureDe', module: 'seance.js' },
  { fn: 'couvertureSeance', module: 'seance.js' },
  { fn: 'figeesDe', module: 'seance.js' },
  { fn: 'observationTenue', module: 'seance.js' },
  { fn: 'peutObserver', module: 'seance.js' },
  { fn: 'parisAObserver', module: 'seance.js' },
  { fn: 'observationsARenvoyer', module: 'seance.js' }
];

// ── LA LISTE D'AUTORISATIONS ────────────────────────────────────────────────
//
// `plan.js` : le coach. Il a le droit d'appeler toutes les fonctions gardées —
// c'est sa raison d'être (`planDeSeance`, MOTEUR §9.13 bis).
const LE_COACH = 'plan.js';
//
// Les AUTRES fichiers, fonction par fonction, chacun avec sa raison. Une
// entrée qui n'a plus d'appel fait échouer le test : la liste dit exactement
// ce qui est, jamais ce qui a été.
//
// ⚠️ Toutes les entrées ci-dessous existaient à la pose de la garde
// (29/09/2026) et sont RAPPORTÉES dans sa PR pour décision : elles ne sont pas
// forcées dans le plan par ce commit.
const AUTORISATIONS = {
  consigneDExercice: {
    'app.js': 'calcule les ENTRÉES du plan (`entrees.consignes`) : le plan n’a pas l’historique ' +
      '(app.js, `consigneDe`) ; et l’étiquette de zone de la page d’exercice, hors séance, où ' +
      'il n’y a pas de plan (app.js, `rendreExercice`).'
  },
  placeDeVolume: {
    'app.js': 'calcule l’ENTRÉE `entrees.volume` du plan, une fois par séance, sur tout ' +
      'l’historique (le plan ne l’a pas) — préparer les entrées du plan (app.js, ' +
      '`volumeDeLaSeance`, 49-U16).'
  },
  suiteDExercice: {
    'app.js': 'calcule l’ENTRÉE `entrees.suites` du plan (la consigne de la prochaine séance, ' +
      'sur l’historique augmenté du jour) : le plan n’a pas l’historique (app.js, `suiteDe`).'
  },
  zoneEnVigueur: {
    'app.js': 'lit la zone CHOISIE dans les lignes `zones` (§9.1.1) pour la passer en ' +
      '`correction` au moteur : une entrée, pas une décision (app.js, `zoneDe`).'
  },
  pourquoiConsigne: {
    'app.js': 'rédige les paragraphes de la feuille « Pourquoi » à partir de la consigne FIGÉE ' +
      'du plan (`x.consigne`) : de la présentation sur une sortie du plan (app.js, `pourquoiDe`).'
  },
  idDePrediction: {
    'app.js': 'l’identifiant déterministe d’un pari au moment de l’écrire en base : de la ' +
      'persistance, le pari lui-même vient du plan (app.js, `finirPari`).'
  },
  observationSemaineAllegee: {
    'app.js': 'l’observation SANS SÉRIE du pari de la semaine allégée, au moment de l’écrire ' +
      'en base : de la persistance (app.js, `observerEscalier`) ; la règle vit dans le moteur.'
  },
  idDEscalier: {
    'app.js': 'l’identifiant déterministe du pari de l’escalier au moment de l’écrire en base : ' +
      'de la persistance, la carte (ou la marche isolée, 49-U15) vient du plan (app.js, ' +
      '`repondreCarte`, `repondreSchema`, `ecrireReplis`).'
  },
  observationMarche: {
    'app.js': 'l’observation SANS SÉRIE du pari d’une marche isolée (schéma accepté, repli), au ' +
      'moment de l’écrire en base : de la persistance (app.js, `observerEscalier`) ; la règle ' +
      'vit dans le moteur (49-U15).'
  },
  observationDe: {
    'app.js': 'l’observation d’un pari par sa série, au moment de l’écrire en base : de la ' +
      'persistance d’une ligne du plan (app.js, `observerPari`).'
  },
  peutObserver: {
    'app.js': 'la garde d’écriture d’une observation (une ligne observée par une AUTRE série ' +
      'n’est jamais réécrite) : de la persistance (app.js, `observerPari`).'
  },
  parisAObserver: {
    'app.js': 'les paris de la séance à observer, pour la file d’écriture : de la persistance ' +
      '(app.js).'
  },
  observationsARenvoyer: {
    'app.js': 'les observations à renvoyer à la reprise d’une séance : de la persistance (app.js).'
  },
  fantome: {
    'app.js': 'la cascade d’AVANT le plan (routine, dernière séance, durée, distance) pour les ' +
      'séries que le plan ne couvre pas — `fantomeDe` prend le fantôme du plan dès qu’il existe.'
  },
  planDe: {
    'app.js': 'traduit la réaction DU PLAN (`r.reaction.plan`, `r.figees`) en lignes de la ' +
      'grille : de la présentation sur une sortie du plan (app.js, `planDe`).'
  }
};

const CONSEIL = 'Passe par `planDeSeance` (v2/js/plan.js), ou ajoute ce fichier à la liste ' +
  'AUTORISATIONS de tests/unit/v2-architecture.test.js, avec sa raison, dans une PR qui le justifie.';

// ── LA LECTURE DU SOURCE ────────────────────────────────────────────────────
//
// Les commentaires deviennent des espaces, les chaînes aussi (sauf quand on
// cherche l'accès entre crochets) ; les sauts de ligne restent, pour que les
// numéros de ligne soient ceux de l'éditeur.
function nettoyer(src, garderChaines) {
  let out = '';
  let i = 0;
  const n = src.length;
  const blanc = (c) => (c === '\n' ? '\n' : ' ');
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') { out += ' '; i++; }
    } else if (c === '/' && d === '*') {
      out += '  '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += blanc(src[i]); i++; }
      out += '  '; i += 2;
    } else if (c === '<' && src.startsWith('<!--', i)) {
      while (i < n && !src.startsWith('-->', i)) { out += blanc(src[i]); i++; }
      out += '   '; i += 3;
    } else if (c === '"' || c === '\'' || c === '`') {
      const q = c;
      out += c; i++;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { out += garderChaines ? src[i] + (src[i + 1] || '') : '  '; i += 2; continue; }
        out += garderChaines ? src[i] : blanc(src[i]);
        i++;
      }
      if (i < n) { out += q; i++; }
    } else {
      out += c; i++;
    }
  }
  return out;
}

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function ligneDe(texte, index) {
  let l = 1;
  for (let i = 0; i < index; i++) if (texte.charCodeAt(i) === 10) l++;
  return l;
}

// Les appels d'une fonction gardée dans un source : `[{ ligne }]`.
function appels(src, g) {
  const trouves = [];
  const code = nettoyer(src, false);
  const motif = g.motif ? new RegExp(g.motif.source, 'g') : new RegExp('\\.\\s*' + echapper(g.fn) + '\\b', 'g');
  let m;
  while ((m = motif.exec(code)) !== null) trouves.push({ ligne: ligneDe(code, m.index) });
  const avecChaines = nettoyer(src, true);
  const crochets = new RegExp('\\[\\s*([\'"`])' + echapper(g.fn) + '\\1\\s*\\]', 'g');
  while ((m = crochets.exec(avecChaines)) !== null) trouves.push({ ligne: ligneDe(avecChaines, m.index) });
  return trouves;
}

function perimetre() {
  const fichiers = fs.readdirSync(path.join(V2, 'js'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({ nom: f, chemin: path.join(V2, 'js', f) }));
  fichiers.push({ nom: 'index.html', chemin: path.join(V2, 'index.html') });
  return fichiers.map((f) => Object.assign(f, { src: fs.readFileSync(f.chemin, 'utf8') }));
}

// Le relevé : pour chaque fonction gardée, ses appels hors de son module.
function releve(fichiers, gardees) {
  const r = {};
  gardees.forEach((g) => {
    r[g.fn] = {};
    fichiers.forEach((f) => {
      if (f.nom === g.module) return;
      const a = appels(f.src, g);
      if (a.length) r[g.fn][f.nom] = a.map((x) => x.ligne);
    });
  });
  return r;
}

function violations(rel, autorisations) {
  const v = [];
  Object.keys(rel).forEach((fn) => {
    Object.keys(rel[fn]).forEach((fichier) => {
      if (fichier === LE_COACH) return;
      const permis = autorisations[fn] && Object.prototype.hasOwnProperty.call(autorisations[fn], fichier);
      if (!permis) {
        v.push('`' + fn + '` est appelée dans v2/' + (fichier === 'index.html' ? '' : 'js/') + fichier +
          ', ligne' + (rel[fn][fichier].length > 1 ? 's ' : ' ') + rel[fn][fichier].join(', ') +
          '. Seul le plan appelle les calculs du coach. ' + CONSEIL);
      }
    });
  });
  return v;
}

function perimees(rel, autorisations) {
  const v = [];
  Object.keys(autorisations).forEach((fn) => {
    Object.keys(autorisations[fn]).forEach((fichier) => {
      if (!rel[fn] || !rel[fn][fichier]) {
        v.push('AUTORISATIONS.' + fn + '[\'' + fichier + '\'] n’a plus d’appel : retire l’entrée — ' +
          'la liste dit ce qui est, pas ce qui a été.');
      }
    });
  });
  return v;
}

// ── LES TESTS ───────────────────────────────────────────────────────────────

describe('architecture — un seul coach, un seul câblage', () => {
  const FICHIERS = perimetre();
  const REL = releve(FICHIERS, GARDEES);

  test('chaque fonction gardée existe, exportée par le module qui la définit', () => {
    global.self = global;
    require('../../v2/js/modele.js');
    require('../../v2/js/palier.js');
    const modules = { 'moteur.js': require('../../v2/js/moteur.js'), 'seance.js': require('../../v2/js/seance.js') };
    const absentes = GARDEES.filter((g) => typeof modules[g.module][g.fn] !== 'function')
      .map((g) => g.module + ' n’exporte plus `' + g.fn + '` : mets la liste GARDEES à jour.');
    expect(absentes).toEqual([]);
  });

  test('la liste d’autorisations ne nomme que des fonctions gardées, et chaque entrée a sa raison', () => {
    const noms = new Set(GARDEES.map((g) => g.fn));
    Object.keys(AUTORISATIONS).forEach((fn) => {
      expect([fn, noms.has(fn)]).toEqual([fn, true]);
      Object.keys(AUTORISATIONS[fn]).forEach((f) => {
        expect([fn, f, f !== LE_COACH]).toEqual([fn, f, true]);
        const raison = AUTORISATIONS[fn][f];
        expect([fn, f, typeof raison === 'string' && raison.length > 20]).toEqual([fn, f, true]);
      });
    });
  });

  test('⚠️ LA GARDE — seuls le plan et les fichiers autorisés appellent les calculs du coach', () => {
    // Le message dit la fonction, le fichier, la ligne, et quoi faire.
    expect(violations(REL, AUTORISATIONS)).toEqual([]);
  });

  test('la liste d’autorisations dit exactement ce qui est : aucune entrée sans appel', () => {
    expect(perimees(REL, AUTORISATIONS)).toEqual([]);
  });

  test('le plan appelle bien le moteur : la garde lit le vrai câblage, pas un fichier vide', () => {
    ['reactionPour', 'planDeCouverture', 'lignesDePari', 'constatDuJour', 'consigneFigee']
      .forEach((fn) => expect([fn, !!REL[fn][LE_COACH]]).toEqual([fn, true]));
  });
});

// La lecture elle-même : sans ces cas, un défaut du lecteur rendrait la garde
// muette sans que rien ne tombe.
describe('architecture — la lecture du source', () => {
  const G = (fn, extra) => Object.assign({ fn, module: 'moteur.js' }, extra || {});
  const FANTOME = GARDEES.filter((g) => g.fn === 'fantome')[0];

  test('les accès par propriété se voient, quel que soit l’alias', () => {
    const src = 'var a = Moteur.reactionPour(x);\nvar b = M.reactionPour(y);\n' +
      'racine.THMoteur.reactionPour(z);\nMoteur().reactionPour(w);\nMoteur[\'reactionPour\'](v);';
    expect(appels(src, G('reactionPour')).map((x) => x.ligne)).toEqual([1, 2, 3, 4, 5]);
  });

  test('les commentaires et les chaînes ne comptent pas, les lignes restent justes', () => {
    const src = '// Moteur.reactionPour(x)\n/* M.reactionPour(\n y) */\nvar s = "Moteur.reactionPour()";\n' +
      'var t = \'M.reactionPour\';\nMoteur.reactionPour(ok);';
    expect(appels(src, G('reactionPour')).map((x) => x.ligne)).toEqual([6]);
  });

  test('un préfixe ne compte pas : `reactionPourTout` n’est pas `reactionPour`', () => {
    expect(appels('Moteur.reactionPourTout(x);', G('reactionPour'))).toEqual([]);
  });

  test('`fantome` : l’appel qualifié par le module compte, le champ et le rappel de la vue non', () => {
    const src = 'Seance.fantome(s, 0, 1);\nvar f = vue.fantome(i, j);\nl.fantome = null;\nS().fantome(a);';
    expect(appels(src, FANTOME).map((x) => x.ligne)).toEqual([1, 4]);
  });

  test('le message d’échec dit la fonction, le fichier, la ligne, et quoi faire', () => {
    const rel = { reactionPour: { 'rendu.js': [12, 40] } };
    const v = violations(rel, {});
    expect(v).toHaveLength(1);
    expect(v[0]).toContain('`reactionPour`');
    expect(v[0]).toContain('v2/js/rendu.js');
    expect(v[0]).toContain('lignes 12, 40');
    expect(v[0]).toContain('planDeSeance');
    expect(v[0]).toContain('AUTORISATIONS');
  });
});
