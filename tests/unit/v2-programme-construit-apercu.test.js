//
// 60-4 (4/7) — L'APERÇU DU PROGRAMME CONSTRUIT ET SA CRÉATION (QUESTIONNAIRE-COACH-V2 §5 bis).
//
//   · le moteur : la cible de durée du programme (G8, MOTEUR §9.18) et le « ≈ 69 min » ;
//   · le générateur : « Remplacer » (SEULE la place change), les mentions sous un exercice, les phrases du haut ;
//   · le rendu : une carte par séance, le nom, la durée, la ligne « pourquoi », séries × reps, « Créer ces N routines » ;
//   · les gestes (`app.js`, rejoués dans un bac `vm` avec les VRAIS modules) : RIEN n'est écrit à l'ouverture ;
//     « Je n'en veux pas » change une place et écrit l'écarté au geste ; « Créer » passe par le chemin de 8a (le
//     dossier « Mon programme », jamais de charge ni de chauffe), puis écrit le dossier et la date ; deux taps ne
//     créent pas deux fois ; une panne au milieu garde le même dossier et ne recrée rien.
//
// Environnement jsdom (PAS de docblock `node`) : `rendu.js` se termine par `this`.

process.env.TZ = 'Europe/Paris';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
const Moteur = require('../../v2/js/moteur.js');
require('../../v2/js/periode.js');
const Routines = require('../../v2/js/routines.js');
const Profil = require('../../v2/js/profil.js');
const Generateur = require('../../v2/js/generateur.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const CAS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-60-4-generateur.json'), 'utf8'));
const cas = (id) => CAS.generer.find((c) => c.id === id);
const clone = (o) => JSON.parse(JSON.stringify(o));
const texte = (n) => n.textContent.replace(/\s+/g, ' ').trim();
const NBSP = ' ';

// Le catalogue de l'app (slug, nom, mesure, équipement, muscles), tiré de celui du fichier de cas.
const CATALOGUE = Object.keys(CAS.catalogue).map((slug) => {
  const [equipement, primaires, secondaires] = CAS.catalogue[slug];
  return { slug, nom: slug.replace(/_/g, ' '), mesure: 'charge_reps', equipement,
           muscles_primaires: primaires.slice(), muscles_secondaires: secondaires.slice() };
});
const INDEX = Modele.indexerExercices(CATALOGUE);
const nom = (slug) => Modele.nommer(INDEX, slug);
const cat = () => {
  const c = {};
  CATALOGUE.forEach((e) => { c[e.slug] = { equipement: e.equipement, muscles_primaires: e.muscles_primaires.slice(),
                                           muscles_secondaires: e.muscles_secondaires.slice() }; });
  return c;
};

// ═══ LE MOTEUR ══════════════════════════════════════════════════════════════
describe('le moteur : la cible de durée du programme (G8) et le « ≈ N min »', () => {
  test('« C’est mon maximum », « Moins en ce moment » et « Ça varie » tiennent la durée déclarée ; « J’ai de la marge » ou rien : pas de raccourci', () => {
    expect(Moteur.cibleDuProgramme('max', 60)).toBe(60);
    expect(Moteur.cibleDuProgramme('moins', 45)).toBe(45);
    expect(Moteur.cibleDuProgramme('varie', 75)).toBe(75);
    expect(Moteur.cibleDuProgramme('marge', 60)).toBeNull();
    expect(Moteur.cibleDuProgramme(null, 60)).toBeNull();
    expect(Moteur.cibleDuProgramme(undefined, 60)).toBeNull();
  });

  test('il faut une durée déclarée valide (10 à 300, entière) ; « Juste un carnet » se tait', () => {
    expect(Moteur.cibleDuProgramme('max', null)).toBeNull();
    expect(Moteur.cibleDuProgramme('max', 5)).toBeNull();
    expect(Moteur.cibleDuProgramme('max', 301)).toBeNull();
    expect(Moteur.cibleDuProgramme('max', 62.5)).toBeNull();
    expect(Moteur.cibleDuProgramme('max', '75')).toBe(75);
    expect(Moteur.cibleDuProgramme('max', 60, 'entretien')).toBeNull();
    expect(Moteur.cibleDuProgramme('max', 60, 'progresser')).toBe(60);
  });

  test('« ≈ 69 min », insécables, arrondi à la minute comme les autres phrases de durée', () => {
    expect(Moteur.texteDureeCourte(4140)).toBe('≈' + NBSP + '69' + NBSP + 'min');
    expect(Moteur.texteDureeCourte(3610)).toBe('≈' + NBSP + '60' + NBSP + 'min');
    expect(Moteur.texteDureeEstimee(4140)).toBe('Environ 69 min (estimation)');
  });
});

// ═══ LE GÉNÉRATEUR : ce que le coach dit de l'aperçu ════════════════════════
describe('le générateur : « Remplacer », les mentions et les phrases', () => {
  const entree = () => Object.assign({ faits: {}, priorites: [], menager: [], ecartes: [] }, clone(cas('neuf_4j_les_deux').entree));

  test('« Remplacer » : SEULE la place touchée change — les séries restent, les reps suivent le nouvel exercice, rien ne s’écarte', () => {
    const c = cat(), e = entree();
    const avant = Generateur.generer(c, e);
    const copie = clone(avant);
    const apres = Generateur.remplacePar(c, avant, e, 0, 0, 'developpe_couche_haltere');
    expect(avant).toEqual(copie);                                   // rien n'est modifié en place
    const x = apres[0].exercices[0], v = avant[0].exercices[0];
    expect(x.exercise_slug).toBe('developpe_couche_haltere');
    expect(x.series).toBe(v.series);
    expect(x.motif).toBe('couche');
    expect(x.reps).toBe(9);                                         // lourd seulement à la barre : un principal hors barre prend les reps d'un secondaire
    expect(v.reps).toBe(5);
    // Les autres places, les autres séances : identiques.
    expect(apres[0].exercices.slice(1)).toEqual(avant[0].exercices.slice(1));
    expect(apres.slice(1)).toEqual(avant.slice(1));
    expect(e.ecartes).toEqual([]);
  });

  test('un slug hors catalogue, une place inconnue : rien ne change', () => {
    const c = cat(), e = entree(), avant = Generateur.generer(c, e);
    expect(Generateur.remplacePar(c, avant, e, 0, 0, 'inconnu')).toEqual(avant);
    expect(Generateur.remplacePar(c, avant, e, 9, 0, 'developpe_couche_haltere')).toEqual(avant);
    expect(Generateur.remplacePar(c, avant, e, 0, 99, 'developpe_couche_haltere')).toEqual(avant);
  });

  test('les mentions sous un exercice : « sans série lourde · ton genou », « demande une barre fixe » (poids du corps seulement)', () => {
    const genou = { menager: ['genou'], materiel: 'salle_complete' };
    expect(Generateur.mentionsDeLigne({ motif: 'squat', barre_fixe: false }, genou)).toEqual(['sans série lourde · ton genou']);
    expect(Generateur.mentionsDeLigne({ motif: 'couche', barre_fixe: false }, genou)).toEqual([]);
    expect(Generateur.mentionsDeLigne({ motif: 'squat' }, { menager: ['genou', 'dos'] }))
      .toEqual(['sans série lourde · ton genou et ton dos']);
    expect(Generateur.mentionsDeLigne({ motif: 'hip_thrust' }, { menager: ['hanche'] })).toEqual(['sans série lourde · ta hanche']);
    expect(Generateur.mentionsDeLigne({ motif: 'tirage_vertical', barre_fixe: true }, { materiel: 'poids_du_corps' }))
      .toEqual(['demande une barre fixe']);
    expect(Generateur.mentionsDeLigne({ motif: 'tirage_vertical', barre_fixe: true }, { materiel: 'salle_complete' })).toEqual([]);
    expect(Generateur.mentionsDeLigne({ motif: 'rowing', barre_fixe: true }, { menager: ['dos'], materiel: 'poids_du_corps' }))
      .toEqual(['sans série lourde · ton dos', 'demande une barre fixe']);
  });

  test('les phrases du haut : le nombre de séances, une phrase par zone, la barre fixe — au mot près', () => {
    const c = cat();
    const e = Object.assign(entree(), { menager: ['genou'] });
    const rts = Generateur.generer(c, e);
    const p = Generateur.phrasesDeLApercu(rts, e, nom);
    expect(p.titre).toBe('4 séances par semaine.');
    expect(p.zones.length).toBe(1);
    expect(p.zones[0]).toMatch(/^Tu ménages ton genou : .+, sans série lourde\. Toutes leurs séries restent\.$/);
    expect(p.zones[0]).toContain(nom('squat_barre'));
    expect(p.barreFixe).toBe('');
    // Le dos ajoute la limite du soulevé quand le programme en porte un.
    const d = Object.assign(entree(), { menager: ['dos'] });
    const pd = Generateur.phrasesDeLApercu(Generateur.generer(c, d), d, nom);
    expect(pd.zones[0]).toMatch(/^Tu ménages ton dos : .+, sans série lourde\. Toutes leurs séries restent ; 8 répétitions au plus au soulevé\.$/);
    // Aucune zone : aucune phrase.
    expect(Generateur.phrasesDeLApercu(rts, entree(), nom).zones).toEqual([]);
    // Le total du programme, quand toutes les séances ne sont pas à créer.
    expect(Generateur.phrasesDeLApercu(rts.slice(2), e, nom, 4).titre).toBe('4 séances par semaine.');
  });

  test('la barre fixe : une phrase, au poids du corps seulement, « demande » / « demandent »', () => {
    const c = cat();
    const e = Object.assign(clone(cas('neuf_3j_poids_du_corps').entree), { faits: {}, priorites: [], menager: [], ecartes: [] });
    const rts = Generateur.generer(c, e);
    const p = Generateur.phrasesDeLApercu(rts, e, nom);
    const fixes = [];
    rts.forEach((rt) => rt.exercices.forEach((x) => { if (x.barre_fixe && fixes.indexOf(nom(x.exercise_slug)) < 0) fixes.push(nom(x.exercise_slug)); }));
    if (fixes.length) {
      expect(p.barreFixe).toBe(fixes.join(' et ') + (fixes.length > 1 ? ' demandent' : ' demande') +
        ' une barre fixe. Sans barre : touche-le, puis Remplacer.');
    } else {
      expect(p.barreFixe).toBe('');
    }
    expect(Generateur.phrasesDeLApercu(rts, Object.assign({}, e, { materiel: 'salle_complete' }), nom).barreFixe).toBe('');
  });
});

// ═══ LE RENDU ═══════════════════════════════════════════════════════════════
describe('le rendu de l’aperçu', () => {
  const vue = (extra) => Object.assign({
    titre: '4 séances par semaine.',
    voix: ['Je te propose tes charges à chaque séance. Touche un exercice pour le changer.', 'Tu ménages ton genou : Squat, sans série lourde. Toutes leurs séries restent.'],
    routines: [
      { nom: 'Haut A', duree: '≈' + NBSP + '69' + NBSP + 'min', pourquoi: 'Poitrine 10 · Dos 6 séries',
        exercices: [{ nom: 'Développé couché', series: '4' + NBSP + '×' + NBSP + '5', mentions: [], neuf: false },
                    { nom: 'Squat', series: '4' + NBSP + '×' + NBSP + '9', mentions: ['sans série lourde · ton genou'], neuf: true }] },
      { nom: 'Bas A', duree: '≈' + NBSP + '50' + NBSP + 'min', pourquoi: '', exercices: [] }
    ],
    erreur: '', enCours: false, libelleCreer: 'Créer ces 2 routines',
    surExercice: () => {}, surCreer: () => {}, surPasMaintenant: () => {}
  }, extra);

  test('le titre, la voix du coach, une carte par séance, chaque exercice en bouton avec séries × reps', () => {
    const cible = document.createElement('div');
    Rendu().rendreApercuProgramme(cible, vue());
    expect(texte(cible.querySelector('.feuille-t'))).toBe('4 séances par semaine.');
    expect(Array.from(cible.querySelectorAll('.q-voix')).map(texte)).toEqual([
      'Je te propose tes charges à chaque séance. Touche un exercice pour le changer.',
      'Tu ménages ton genou : Squat, sans série lourde. Toutes leurs séries restent.']);
    const cartes = cible.querySelectorAll('.ap-routine');
    expect(cartes.length).toBe(2);
    expect(texte(cartes[0].querySelector('.ap-nom'))).toBe('Haut A');
    expect(cartes[0].querySelector('.ap-duree').textContent).toBe('≈' + NBSP + '69' + NBSP + 'min');
    expect(texte(cartes[0].querySelector('.ap-pourquoi'))).toBe('Poitrine 10 · Dos 6 séries');
    expect(cartes[1].querySelector('.ap-pourquoi')).toBeNull();
    const ex = cartes[0].querySelectorAll('.ap-ex');
    expect(Array.from(ex).map((b) => [texte(b.querySelector('.ap-ex-nom')), texte(b.querySelector('.ap-ex-series'))]))
      .toEqual([['Développé couché', '4 × 5'], ['Squat', '4 × 9']]);
    expect(texte(ex[1].querySelector('.ap-ex-mention'))).toBe('sans série lourde · ton genou');
    expect(ex[1].classList.contains('neuf')).toBe(true);
    expect(ex[0].classList.contains('neuf')).toBe(false);
  });

  test('toucher un exercice rend ses indices ; « Créer ces N routines » et « Pas maintenant » sont les deux boutons du pied', () => {
    const cible = document.createElement('div');
    const touches = []; let cree = 0, ferme = 0;
    Rendu().rendreApercuProgramme(cible, vue({ surExercice: (i, k) => touches.push([i, k]), surCreer: () => { cree++; },
      surPasMaintenant: () => { ferme++; } }));
    cible.querySelectorAll('.ap-routine')[0].querySelectorAll('.ap-ex')[1].click();
    expect(touches).toEqual([[0, 1]]);
    const pied = cible.querySelector('.feuille-menu');
    expect(Array.from(pied.querySelectorAll('button')).map(texte)).toEqual(['Créer ces 2 routines', 'Pas maintenant']);
    pied.querySelectorAll('button')[0].click();
    pied.querySelectorAll('button')[1].click();
    expect([cree, ferme]).toEqual([1, 1]);
  });

  test('pendant l’écriture : « Création… », éteint ; l’erreur est dite', () => {
    const cible = document.createElement('div');
    Rendu().rendreApercuProgramme(cible, vue({ enCours: true, erreur: 'Pas de réseau : rien n’a été enregistré.' }));
    const creer = cible.querySelector('.apercu-creer');
    expect(texte(creer)).toBe('Création…');
    expect(creer.disabled).toBe(true);
    expect(texte(cible.querySelector('.erreur'))).toBe('Pas de réseau : rien n’a été enregistré.');
    expect(cible.querySelector('.erreur').getAttribute('role')).toBe('alert');
  });
});

// ═══ LES GESTES (`app.js`) ══════════════════════════════════════════════════
const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
function extraire(n) {
  const m = APP.match(new RegExp('^  (async )?function ' + n + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable dans v2/js/app.js : ' + n);
  return m[0];
}
const FONCTIONS = ['freresDe', 'brouillonDeStructure', 'creerRoutineNeuve', 'creerDansUnDossier', 'ouvrirBibliothequeSur',
  'rangSuivantBibliotheque', 'nomsReserves', 'messageVerdict',
  'entreeDuProgramme', 'deduiteDuProgramme', 'fondreLesVoisins', 'raccourcirLeProgramme', 'lectureDuProgramme',
  'seriesFois', 'rendreApercuDuProgramme', 'ouvrirApercuProgramme', 'ouvrirExerciceDuProgramme',
  'ecarterDansLeProgramme', 'remplacerDansLeProgramme', 'poserDansLeProgramme', 'versLeCatalogueDuProgramme',
  'creerLeProgramme'];

function bac(options) {
  const o = options || {};
  const journal = { routines: [], exercices: [], series: [], feuilles: [], voile: 0, ferme: 0, saisie: 0, chargements: 0,
                    profil: [], catalogue: [], confirmer: [], choix: [], machine: [], rendreSaisie: 0, seriesDe: {} };
  let n = 0;
  const Donnees = {
    creerRoutine: async (ligne) => {
      if (o.panne && o.panne(journal.routines.length)) throw new Error('Failed to fetch');
      journal.routines.push(ligne);
      return Object.assign({ id: 'r' + (++n) }, ligne);
    },
    insererExercices: async (lignes) => { journal.exercices.push(lignes); },
    remplacerSeriesRoutine: async (id, lignes) => { journal.series.push(lignes); journal.seriesDe[id] = lignes; },
    supprimerExercices: async () => {}, majExercice: async () => {}, supprimerRoutine: async () => {}
  };
  const profil = Object.assign({ seances_par_semaine: 4, objectif: 'les_deux', phase: null, materiel: 'salle_complete',
    priorites: null, zones_a_menager: null, exercices_ecartes: null, temps_reponse: null, duree_seance_min: null,
    intention: 'progresser' }, o.profil || {});
  const ctx = {
    Routines, Modele, Moteur, Profil, Generateur, Donnees,
    Seance: o.freres ? { freresProposes: () => o.freres.map((f) => Object.assign({ deja_dans_la_seance: false }, f)) } : { freresProposes: () => [] },
    Rendu: {
      rendreApercuProgramme: (c, v) => { journal.feuilles.push(v); ctx.__vue = v; },
      rendreFeuilleChoix: (c, v) => { journal.choix.push(v); ctx.__choix = v; },
      rendreFeuilleMachinePrise: (c, v) => { journal.machine.push(v); ctx.__machine = v; },
      rendreFeuilleConfirmer: (c, v) => { journal.confirmer.push(v); }
    },
    faits: { historiqueDesExercices: () => (o.faits || {}) },
    corpus: () => ({}),
    catalogueIndexe: () => INDEX,
    local: { exercices: o.catalogueVide ? [] : CATALOGUE },
    profil,
    poserProfil: (champs) => {
      journal.profil.push(clone(champs));
      if (o.profilHorsLigne) return Promise.reject(new Error('Failed to fetch'));
      Object.assign(ctx.profil, champs);
      return Promise.resolve();
    },
    routines: (o.routines || []).slice(),
    etatRoutines: { code: 'ok' },
    chargerRoutines: async () => { journal.chargements++;
      ctx.routines = (o.routines || []).concat(journal.routines.map((l, i) => Object.assign({ id: 'r' + (i + 1), exercices: [] }, l))); return true; },
    sessionActive: { user: { id: 'u1' } },
    uuid: () => 'id-' + Math.random().toString(16).slice(2),
    enregistrementEnCours: false,
    construit: null,
    DOSSIER_DU_PROGRAMME: /var DOSSIER_DU_PROGRAMME = '([^']+)'/.exec(APP)[1],
    faitsDesFreres: () => ({}),
    horsDuMateriel: () => null,
    ouvrirCatalogue: (a, r, apercu) => { journal.catalogue.push({ a, r, apercu }); ctx.__catalogue = apercu; },
    $: (id) => ({ id, querySelectorAll: () => [] }),
    voileOuvert: null,
    ouvrirVoile: (noeud, apres) => { journal.voile++; ctx.voileOuvert = noeud; ctx.__apres = apres; },
    fermerVoile: () => { journal.ferme++; ctx.voileOuvert = null; const a = ctx.__apres; ctx.__apres = null; if (a) a(); },
    dossiersReplies: {}, memoriserDossiersReplies: () => {},
    afficherSaisie: async () => { journal.saisie++; },
    rendreSaisie: () => { journal.rendreSaisie++; },
    vues: { saisie: { hidden: false } },
    seance: null,
    Date, Math, Promise, Object
  };
  vm.createContext(ctx);
  FONCTIONS.forEach((f) => vm.runInContext(extraire(f), ctx));
  return { ctx, journal, vue: () => ctx.__vue, appel: (code) => vm.runInContext(code, ctx) };
}

const NOMS_4J = ['Haut A', 'Bas A', 'Haut B', 'Bas B'];

describe('les gestes : ouvrir l’aperçu', () => {
  test('les 4 séances du générateur, leur nom, leur ligne « pourquoi » (celle du fichier de cas) ; RIEN n’est écrit', async () => {
    const b = bac({ profil: { objectif: 'les_deux' } });
    await b.appel('ouvrirApercuProgramme()');
    const v = b.vue();
    expect(v.titre).toBe('4 séances par semaine.');
    expect(v.routines.map((r) => r.nom)).toEqual(NOMS_4J);
    const attendu = cas('neuf_4j_les_deux').attendu;
    expect(v.routines.map((r) => r.pourquoi)).toEqual(attendu.map((r) => r.pourquoi));
    expect(v.routines[0].exercices.map((x) => x.nom)).toEqual(attendu[0].exercices.map((e) => nom(e[0])));
    expect(v.routines[0].exercices[0].series).toBe('4' + NBSP + '×' + NBSP + '5');
    expect(v.routines.every((r) => /^≈ \d+ min$/.test(r.duree))).toBe(true);
    expect(v.libelleCreer).toBe('Créer ces 4 routines');
    expect(v.voix[0]).toBe('Je te propose tes charges à chaque séance. Touche un exercice pour le changer.');
    expect(b.journal.voile).toBe(1);
    expect(b.journal.routines).toEqual([]);
    expect(b.journal.profil).toEqual([]);
  });

  test('les jours viennent du profil (bornés) : 6 jours, 2 jours ; sans réponse, 3', async () => {
    for (const [jours, attendu] of [[6, 6], [2, 2], [9, 6], [1, 2], [null, 3]]) {
      const b = bac({ profil: { seances_par_semaine: jours } });
      await b.appel('ouvrirApercuProgramme()');
      expect(b.vue().routines.length).toBe(attendu);
    }
  });

  test('la zone à ménager vient du profil : la phrase du haut et la mention sous l’exercice', async () => {
    const b = bac({ profil: { zones_a_menager: ['genou'], objectif: 'force' } });
    await b.appel('ouvrirApercuProgramme()');
    const v = b.vue();
    expect(v.voix.length).toBe(2);
    expect(v.voix[1]).toMatch(/^Tu ménages ton genou : .+, sans série lourde\. Toutes leurs séries restent\.$/);
    const mentions = [].concat.apply([], v.routines.map((r) => r.exercices.map((x) => x.mentions.join('|'))));
    expect(mentions).toContain('sans série lourde · ton genou');
  });

  test('un exercice écarté du profil n’est pas proposé', async () => {
    const b = bac({ profil: { exercices_ecartes: ['developpe_couche_barre'] } });
    await b.appel('ouvrirApercuProgramme()');
    const noms = [].concat.apply([], b.vue().routines.map((r) => r.exercices.map((x) => x.nom)));
    expect(noms).not.toContain(nom('developpe_couche_barre'));
  });

  test('le catalogue n’est pas arrivé : on ne montre pas un programme vide', async () => {
    const b = bac({ catalogueVide: true });
    await b.appel('ouvrirApercuProgramme()');
    expect(b.journal.feuilles).toEqual([]);
    expect(b.journal.confirmer.length).toBe(1);
    expect(b.journal.confirmer[0].titre).toBe('Le catalogue arrive');
    expect(b.ctx.construit).toBeNull();
  });

  test('« Pas maintenant » ferme sans rien écrire', async () => {
    const b = bac();
    await b.appel('ouvrirApercuProgramme()');
    b.vue().surPasMaintenant();
    expect(b.ctx.construit).toBeNull();
    expect(b.journal.routines).toEqual([]);
    expect(b.journal.profil).toEqual([]);
  });
});

describe('les gestes : le temps (G8)', () => {
  const duree = (v) => v.routines.map((r) => Number(/(\d+)/.exec(r.duree)[1]));
  const series = (v) => v.routines.map((r) => r.exercices.reduce((t, x) => t + Number(/^(\d+)/.exec(x.series)[1]), 0));

  test('« J’ai de la marge » : rien n’est raccourci, même avec une durée déclarée', async () => {
    const a = bac({ profil: { temps_reponse: 'marge', duree_seance_min: 30 } });
    await a.appel('ouvrirApercuProgramme()');
    const b = bac();
    await b.appel('ouvrirApercuProgramme()');
    expect(series(a.vue())).toEqual(series(b.vue()));
    expect(duree(a.vue())).toEqual(duree(b.vue()));
  });

  test('« C’est mon maximum » + 45 min : chaque séance passe par le raccourci — moins de séries, jamais plus longue, les muscles gardés', async () => {
    const plein = bac();
    await plein.appel('ouvrirApercuProgramme()');
    const court = bac({ profil: { temps_reponse: 'max', duree_seance_min: 45 } });
    await court.appel('ouvrirApercuProgramme()');
    const d0 = duree(plein.vue()), d1 = duree(court.vue());
    d1.forEach((m, i) => { expect(m).toBeLessThanOrEqual(d0[i]); });
    expect(d1.some((m, i) => m < d0[i])).toBe(true);
    expect(series(court.vue()).reduce((a, c) => a + c, 0)).toBeLessThan(series(plein.vue()).reduce((a, c) => a + c, 0));
    expect(court.vue().routines.length).toBe(4);
    // Chaque séance garde son premier exercice (jamais retiré).
    court.vue().routines.forEach((r, i) => { expect(r.exercices[0].nom).toBe(plein.vue().routines[i].exercices[0].nom); });
  });

  test('« Moins en ce moment » et « Ça varie » raccourcissent de même ; sans durée déclarée, jamais', async () => {
    for (const t of ['moins', 'varie']) {
      const plein = bac();
      await plein.appel('ouvrirApercuProgramme()');
      const court = bac({ profil: { temps_reponse: t, duree_seance_min: 45 } });
      await court.appel('ouvrirApercuProgramme()');
      expect(series(court.vue()).reduce((a, c) => a + c, 0)).toBeLessThan(series(plein.vue()).reduce((a, c) => a + c, 0));
    }
    const sans = bac({ profil: { temps_reponse: 'max', duree_seance_min: null } });
    await sans.appel('ouvrirApercuProgramme()');
    const plein = bac();
    await plein.appel('ouvrirApercuProgramme()');
    expect(series(sans.vue())).toEqual(series(plein.vue()));
  });

  test('« Juste un carnet » : le coach se tait, rien n’est raccourci', async () => {
    const carnet = bac({ profil: { temps_reponse: 'max', duree_seance_min: 30, intention: 'entretien' } });
    await carnet.appel('ouvrirApercuProgramme()');
    const plein = bac();
    await plein.appel('ouvrirApercuProgramme()');
    expect(series(carnet.vue())).toEqual(series(plein.vue()));
  });
});

describe('les gestes : « Je n’en veux pas »', () => {
  const ouvrir = async (options) => {
    const b = bac(options);
    await b.appel('ouvrirApercuProgramme()');
    return b;
  };

  test('toucher un exercice ouvre la feuille : « Je n’en veux pas », « Remplacer », « Annuler » — les phrases de la spec', async () => {
    const b = await ouvrir();
    b.vue().surExercice(0, 0);
    const c = b.ctx.__choix;
    expect(c.titre).toBe(nom('developpe_couche_barre'));
    expect(c.aide).toBe('Haut A · 4' + NBSP + '×' + NBSP + '5');
    expect(c.options.map((o) => [o.cle, o.libelle, o.sous])).toEqual([
      ['refuser', 'Je n’en veux pas', 'Je le remplace par un exercice du même mouvement, et je ne te le proposerai plus.'],
      ['remplacer', 'Remplacer', 'Tu choisis dans le catalogue. La ligne de la séance se met à jour.']]);
    c.surAnnuler();
    expect(b.vue().titre).toBe('4 séances par semaine.');           // l'aperçu est revenu
    expect(b.journal.profil).toEqual([]);
  });

  test('⚠️ DISCRIMINANT — SEULE la place touchée change : les autres séances restent identiques, les séries de la place aussi', async () => {
    const b = await ouvrir();
    const avant = clone(b.vue().routines);
    b.vue().surExercice(0, 0);
    b.ctx.__choix.surChoix('refuser');
    const apres = b.vue().routines;
    expect(apres[0].exercices[0].nom).not.toBe(avant[0].exercices[0].nom);
    expect(apres[0].exercices[0].series).toBe(avant[0].exercices[0].series.replace(/×\u00a05/, '×\u00a09'));   // les mêmes séries ; les reps suivent l'exercice (plus à la barre)
    expect(apres[0].exercices.slice(1)).toEqual(avant[0].exercices.slice(1));
    expect(apres.slice(1).map((r) => [r.nom, r.pourquoi, r.exercices.map((x) => x.nom)]))
      .toEqual(avant.slice(1).map((r) => [r.nom, r.pourquoi, r.exercices.map((x) => x.nom)]));
  });

  test('l’écarté est écrit AU GESTE par le chemin du profil ; la phrase du coach le dit ; l’exercice neuf est marqué', async () => {
    const b = await ouvrir();
    b.vue().surExercice(0, 0);
    b.ctx.__choix.surChoix('refuser');
    expect(b.journal.profil).toEqual([{ exercices_ecartes: ['developpe_couche_barre'] }]);
    const v = b.vue();
    const neuf = v.routines[0].exercices[0].nom;
    expect(v.voix[v.voix.length - 1]).toBe(nom('developpe_couche_barre') + ' est remplacé par ' + neuf + '. Je ne te le proposerai plus.');
    expect(v.routines[0].exercices[0].neuf).toBe(true);
    expect(v.routines[0].exercices.slice(1).every((x) => !x.neuf)).toBe(true);
    expect(b.journal.routines).toEqual([]);                        // rien d'autre n'est écrit
  });

  test('un second refus s’ajoute : les écartés restent dans l’ordre où on les a écartés', async () => {
    const b = await ouvrir();
    b.vue().surExercice(0, 0);
    b.ctx.__choix.surChoix('refuser');
    b.vue().surExercice(0, 0);
    b.ctx.__choix.surChoix('refuser');
    expect(b.journal.profil.length).toBe(2);
    expect(b.journal.profil[1].exercices_ecartes.length).toBe(2);
    expect(b.journal.profil[1].exercices_ecartes[0]).toBe('developpe_couche_barre');
  });

  test('hors ligne : l’écart reste dans l’aperçu et le geste ne plante pas (le profil l’enverra plus tard)', async () => {
    const b = await ouvrir({ profilHorsLigne: true });
    b.vue().surExercice(0, 0);
    expect(() => b.ctx.__choix.surChoix('refuser')).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(b.journal.profil.length).toBe(1);
    expect(b.vue().routines[0].exercices[0].nom).not.toBe(nom('developpe_couche_barre'));
  });

  test('une place sans remplaçant disparaît, et la phrase le dit', async () => {
    // Le catalogue réduit à un seul exercice du motif : le refus ne trouve rien.
    const b = await ouvrir({ profil: { materiel: 'poids_du_corps', objectif: 'forme', seances_par_semaine: 2 } });
    const v0 = b.vue();
    const k = v0.routines[0].exercices.length - 1;
    // On écarte jusqu'à épuisement du motif de la dernière place.
    let guard = 0;
    while (guard++ < 12 && b.vue().routines[0].exercices.length === k + 1) {
      b.vue().surExercice(0, k);
      b.ctx.__choix.surChoix('refuser');
    }
    const phrase = b.vue().voix[b.vue().voix.length - 1];
    expect(phrase).toMatch(/Je ne te le proposerai plus\.$/);
    expect(b.vue().routines[0].exercices.length).toBeLessThanOrEqual(k + 1);
  });
});

describe('les gestes : « Remplacer »', () => {
  test('la feuille de l’éditeur : les frères, « Chercher dans le catalogue » ; un frère prend la place, rien ne s’écarte', async () => {
    const b = bac({ freres: [{ slug: 'developpe_couche_haltere', fait: null }] });
    await b.appel('ouvrirApercuProgramme()');
    const avant = clone(b.vue().routines);
    b.vue().surExercice(0, 0);
    b.ctx.__choix.surChoix('remplacer');
    const m = b.ctx.__machine;
    expect(m.titre).toBe('Remplacer');
    expect(m.nom).toBe(nom('developpe_couche_barre'));
    expect(m.chercher).toBe('Chercher dans le catalogue');
    expect(m.freres.map((f) => f.nom)).toEqual([nom('developpe_couche_haltere')]);
    m.freres[0].surChoisir();
    const apres = b.vue().routines;
    expect(apres[0].exercices[0].nom).toBe(nom('developpe_couche_haltere'));
    expect(apres[0].exercices[0].neuf).toBe(true);
    expect(apres[0].exercices.slice(1)).toEqual(avant[0].exercices.slice(1));
    expect(b.journal.profil).toEqual([]);                          // « Remplacer » n'écarte rien
  });

  test('le catalogue : l’aperçu reste en mémoire, le choix prend la place, la fermeture rouvre l’aperçu', async () => {
    const b = bac();
    await b.appel('ouvrirApercuProgramme()');
    b.vue().surExercice(1, 0);
    b.ctx.__choix.surChoix('remplacer');
    b.ctx.__machine.surCatalogue();
    expect(b.journal.catalogue.length).toBe(1);
    const apercu = b.ctx.__catalogue;
    expect([apercu.i, apercu.k]).toEqual([1, 0]);
    expect(b.ctx.construit).not.toBeNull();
    // L'ouverture du catalogue ferme le voile de l'aperçu : il ne perd pas son état.
    b.ctx.fermerVoile();
    expect(b.ctx.construit).not.toBeNull();
    // La fermeture du catalogue rouvre l'aperçu.
    const voiles = b.journal.voile;
    apercu.retour();
    expect(b.journal.voile).toBe(voiles + 1);
    expect(b.vue().titre).toBe('4 séances par semaine.');
    // Puis le choix prend la place.
    b.appel("poserDansLeProgramme(1, 0, 'squat_barre')");
    expect(b.vue().routines[1].exercices[0].nom).toBe(nom('squat_barre'));
  });

  test('fermer l’aperçu après le catalogue (retour) puis « Pas maintenant » : l’état est libéré', async () => {
    const b = bac();
    await b.appel('ouvrirApercuProgramme()');
    b.vue().surExercice(0, 1);
    b.ctx.__choix.surChoix('remplacer');
    b.ctx.__machine.surCatalogue();
    b.ctx.fermerVoile();
    b.ctx.__catalogue.retour();
    b.vue().surPasMaintenant();
    expect(b.ctx.construit).toBeNull();
  });
});

describe('les gestes : « Créer ces N routines »', () => {
  const creees = (b) => b.journal.routines.map((l) => [l.nom, l.dossier, l.rang]);

  test('chaque séance, dans l’ordre, dans « Mon programme », par le chemin de « Créer la routine » : jamais de charge, jamais de chauffe', async () => {
    const b = bac();
    await b.appel('ouvrirApercuProgramme()');
    const attendu = cas('neuf_4j_les_deux').attendu;
    await b.vue().surCreer();
    expect(creees(b)).toEqual([['Haut A', 'Mon programme', 0], ['Bas A', 'Mon programme', 1], ['Haut B', 'Mon programme', 2], ['Bas B', 'Mon programme', 3]]);
    const toutes = [].concat.apply([], b.journal.series);
    expect(toutes.every((l) => l.charge_cible_kg === null)).toBe(true);
    expect(toutes.every((l) => l.type_serie === 'travail')).toBe(true);
    // Les séries × reps de l'aperçu sont celles de la première routine écrite (son premier exercice : 4 × 5).
    const premier = b.journal.series[0];
    expect(premier.length).toBe(attendu[0].exercices[0][3]);
    expect(premier.every((l) => l.reps_visees === attendu[0].exercices[0][4])).toBe(true);
    expect(b.journal.exercices[0].length).toBe(attendu[0].exercices.length);
    // Puis : le dossier réel et la date, au profil ; la bibliothèque s'ouvre dessus.
    expect(b.journal.profil.length).toBe(1);
    expect(b.journal.profil[0].programme_construit_dossier).toBe('Mon programme');
    expect(b.journal.profil[0].programme_construit_le).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(b.journal.ferme).toBe(1);
    expect(b.journal.saisie).toBe(1);
    expect(b.ctx.construit).toBeNull();
  });

  test('⚠️ DISCRIMINANT — la durée montrée est celle de la structure ÉCRITE (les repos de la création, sans les recalculer ailleurs)', async () => {
    const b = bac();
    await b.appel('ouvrirApercuProgramme()');
    const montrees = b.vue().routines.map((r) => Number(/(\d+)/.exec(r.duree)[1]));
    await b.vue().surCreer();
    // La durée, relue sur les lignes ÉCRITES : les exercices (repos, superset) et leurs séries.
    const reecrites = b.journal.routines.map((_, i) => {
      const exos = b.journal.exercices[i].slice().sort((x, y) => x.rang - y.rang);
      const struct = Moteur.structureDeRoutine(exos.map((e) => ({
        exercise_slug: e.exercise_slug, repos_cible_s: e.repos_cible_s, groupe_superset: e.groupe_superset,
        series: b.journal.seriesDe[e.id]
      })), INDEX);
      return Math.round(Moteur.dureeEstimee(struct) / 60);
    });
    expect(montrees.length).toBe(4);
    montrees.forEach((m) => { expect(m).toBeGreaterThan(0); });
    expect(reecrites).toEqual(montrees);
  });

  test('« Mon programme » existe déjà : « Mon programme (2) » ; un nom déjà pris : « (2) »', async () => {
    const b = bac({ routines: [{ id: 'x', nom: 'Haut A', dossier: 'Mon programme', rang: 4, exercices: [] }] });
    await b.appel('ouvrirApercuProgramme()');
    expect(b.vue().routines[0].nom).toBe('Haut A (2)');           // l'aperçu dit le nom qui sera ÉCRIT
    await b.vue().surCreer();
    expect(creees(b)[0]).toEqual(['Haut A (2)', 'Mon programme (2)', 5]);
    expect(b.journal.profil[0].programme_construit_dossier).toBe('Mon programme (2)');
  });

  test('⚠️ DISCRIMINANT — deux taps rapides n’écrivent pas deux fois', async () => {
    const b = bac();
    await b.appel('ouvrirApercuProgramme()');
    const creer = b.vue().surCreer;
    await Promise.all([creer(), creer()]);
    expect(b.journal.routines.length).toBe(4);
    expect(b.journal.profil.length).toBe(1);
  });

  test('une panne au milieu : les créées quittent l’aperçu, l’erreur est dite, la reprise reste dans le MÊME dossier et ne recrée rien', async () => {
    let coupe = true;
    const b = bac({ panne: (deja) => coupe && deja === 2 });
    await b.appel('ouvrirApercuProgramme()');
    await b.vue().surCreer();
    expect(creees(b).map((c) => c[0])).toEqual(['Haut A', 'Bas A']);
    const v = b.vue();
    expect(v.erreur).toBe('Pas de réseau : rien n’a été enregistré.');
    expect(v.routines.map((r) => r.nom)).toEqual(['Haut B', 'Bas B']);
    expect(v.titre).toBe('4 séances par semaine.');               // le programme reste de 4 séances
    expect(v.libelleCreer).toBe('Créer ces 2 routines');
    expect(b.journal.ferme).toBe(0);
    expect(b.journal.profil).toEqual([]);                          // le programme n'est pas complet : rien au profil
    expect(b.journal.rendreSaisie).toBe(1);                        // la bibliothèque derrière montre déjà ce qui est créé
    coupe = false;
    await b.vue().surCreer();
    expect(creees(b).map((c) => [c[0], c[1]])).toEqual([['Haut A', 'Mon programme'], ['Bas A', 'Mon programme'],
      ['Haut B', 'Mon programme'], ['Bas B', 'Mon programme']]);
    expect(b.journal.profil.length).toBe(1);
    expect(b.journal.profil[0].programme_construit_dossier).toBe('Mon programme');
    expect(b.journal.ferme).toBe(1);
  });

  test('hors ligne : rien n’est écrit, l’aperçu reste ouvert avec le message', async () => {
    const b = bac({ panne: () => true });
    await b.appel('ouvrirApercuProgramme()');
    await b.vue().surCreer();
    expect(b.journal.routines).toEqual([]);
    expect(b.vue().erreur).toBe('Pas de réseau : rien n’a été enregistré.');
    expect(b.vue().routines.length).toBe(4);
    expect(b.journal.profil).toEqual([]);
    expect(b.journal.ferme).toBe(0);
  });

  test('un exercice refusé avant « Créer » n’est pas dans les routines écrites', async () => {
    const b = bac();
    await b.appel('ouvrirApercuProgramme()');
    b.vue().surExercice(0, 0);
    b.ctx.__choix.surChoix('refuser');
    const neuf = b.vue().routines[0].exercices[0].nom;
    await b.vue().surCreer();
    const premiers = b.journal.exercices[0].slice().sort((x, y) => x.rang - y.rang);
    expect(premiers.map((e) => e.exercise_slug)).not.toContain('developpe_couche_barre');
    expect(nom(premiers[0].exercise_slug)).toBe(neuf);
  });

  test('la fermeture pendant l’écriture : rien n’est ramené, mais le dossier et la date s’écrivent quand même', async () => {
    const b = bac();
    await b.appel('ouvrirApercuProgramme()');
    const p = b.vue().surCreer();
    b.ctx.fermerVoile();
    await p;
    expect(b.journal.routines.length).toBe(4);
    expect(b.journal.profil.length).toBe(1);
    expect(b.journal.saisie).toBe(0);                              // on n'a ramené personne dans la bibliothèque
  });
});
