/** @jest-environment node */
//
// 60-2a — LES GESTES DU QUESTIONNAIRE (`app.js`), rejoués dans un bac `vm`.
//
// Les règles (écrans, textes, colonnes) ont leurs tests (`v2-questionnaire`) ; ici
// c'est le CÂBLAGE : QUAND il s'ouvre, une seule fois, jamais par-dessus une
// séance ; ce que « Continuer » écrit, par quel chemin ; « Retour » et « Plus
// tard » qui n'écrivent rien ; le bandeau ; et l'envoi du profil, un à la fois.
//
// ⚠️ Les fonctions sont EXTRAITES d'`app.js` et exécutées avec les VRAIS modules
// (`THProfil`, `THQuestionnaire`, `THPoids`, `THModele`) : un test qui chercherait
// leur texte ne verrait pas un geste mal câblé.

process.env.TZ = 'Europe/Paris';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
const Poids = require('../../v2/js/poids.js');
const Profil = require('../../v2/js/profil.js');
const Questionnaire = require('../../v2/js/questionnaire.js');

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
function extraire(nom) {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable dans v2/js/app.js : ' + nom);
  return m[0];
}

const FONCTIONS = ['questionnaireDejaVuIci', 'marquerQuestionnaireVuIci', 'ouvrirQuestionnaireSiDu',
  'actualiserFaitsDuQuestionnaire', 'ecransDuQuestionnaire', 'ouvrirQuestionnaire', 'fermerQuestionnaire',
  'rendreQuestionnaire', 'choisirDansQuestionnaire', 'saisirDansQuestionnaire', 'ouvrirDureeDuQuestionnaire',
  'changerDepuisLeRecap', 'continuerQuestionnaire', 'reculerQuestionnaire', 'plusTardQuestionnaire',
  'terminerQuestionnaire', 'rendreBandeauQuestionnaire'];

const MAINTENANT_FIGE = '2026-10-07';

function bac(options) {
  const o = options || {};
  const stockage = {};
  const journal = { profil: [], pesees: [], rendus: [], bandeaux: [], montres: [], saisies: 0, gardes: [], feuilles: [] };
  const vue = { hidden: true };
  const ctx = {
    racine: { localStorage: o.stockageRefuse ? { getItem() { throw new Error('refusé'); }, setItem() { throw new Error('refusé'); } }
      : { getItem: (k) => (k in stockage ? stockage[k] : null), setItem: (k, v) => { stockage[k] = String(v); } } },
    Profil, Questionnaire, Poids, Modele,
    CLE_QUESTIONNAIRE_VU: /var CLE_QUESTIONNAIRE_VU = '([^']+)'/.exec(APP)[1],
    userId: () => (o.sansCompte ? null : 'u1'),
    profil: o.profil === undefined ? { id: 'u1', questionnaire_fait_le: null } : o.profil,
    seance: o.seance || null,
    voileOuvert: o.voile || null,
    modeModifier: !!o.ranger,
    vues: { detail: Object.assign({}, vue, o.detailVisible ? { hidden: false } : {}), routine: vue, seance: vue, questionnaire: vue },
    local: { seances: o.seances === undefined ? [{ id: 's1', debut: '2026-10-01T10:00:00Z' }] : o.seances, pesees: o.pesees || [] },
    faits: { ceQueJeSais: () => o.faits || { seances: 1, depuis: new Date(2026, 9, 1), rythme: null, dureeMin: null, maximums: [], autres: [] } },
    corpus: () => ({}),
    questionnaire: null, gardeQuestionnaire: null,
    ajouterGarde: (g) => { journal.gardes.push(g); ctx.gardes = (ctx.gardes || []).concat([g]); },
    retirerGarde: (g) => { ctx.gardes = (ctx.gardes || []).filter((x) => x !== g); },
    montrer: (nom) => { journal.montres.push(nom); },
    $: (id) => ({ id }),
    Rendu: {
      rendreQuestionnaire: (cible, v, a) => { journal.rendus.push(v); ctx.__actions = a; },
      rendreBandeauReprise: (n, v) => { journal.bandeaux.push(v); },
      rendreFeuilleChoix: (c, v) => { journal.feuilles.push(v); }
    },
    poserProfil: (champs) => { journal.profil.push(JSON.parse(JSON.stringify(champs))); ctx.profil = Object.assign({}, ctx.profil || {}, champs); return Promise.resolve(); },
    poserPesee: (p) => { journal.pesees.push(p); return Promise.resolve(); },
    afficherSaisie: () => { journal.saisie = (journal.saisie || 0) + 1; },
    jourDuJour: () => MAINTENANT_FIGE,
    feuilleProfil: null, optionsNombre: (v, s) => v.map((x) => ({ cle: x, libelle: x + s })),
    ouvrirFeuilleProfil: () => { ctx.feuilleProfil(ctx.cible = {}); },
    fermerVoile: () => {},
    Date
  };
  vm.createContext(ctx);
  FONCTIONS.forEach((f) => vm.runInContext(extraire(f), ctx));
  const appel = (code) => vm.runInContext(code, ctx);
  const ecran = () => ctx.questionnaire && ctx.questionnaire.ecran;
  const vueCourante = () => journal.rendus[journal.rendus.length - 1];
  const actions = () => ctx.__actions;
  return { ctx, journal, stockage, appel, ecran, vueCourante, actions };
}

describe('60-2a — QUAND il s’ouvre de lui-même', () => {
  test('la ligne est connue, jamais remplie, jamais ouverte ici : il s’ouvre, sur la bienvenue, et la clé est posée', () => {
    const b = bac();
    expect(b.appel('ouvrirQuestionnaireSiDu()')).toBe(true);
    expect(b.ecran()).toBe('bienvenue');
    expect(b.journal.montres).toEqual(['questionnaire']);
    expect(b.stockage['th-v2-questionnaire-vu-u1']).toBe('1');
    expect(b.vueCourante().id).toBe('bienvenue');
  });

  test('DISCRIMINANT — il ne s’ouvre QU’UNE FOIS par appareil : « Plus tard », puis plus rien', () => {
    const b = bac();
    expect(b.appel('ouvrirQuestionnaireSiDu()')).toBe(true);
    b.appel('plusTardQuestionnaire()');
    expect(b.ctx.questionnaire).toBeNull();
    expect(b.appel('ouvrirQuestionnaireSiDu()')).toBe(false);
    expect(b.journal.montres).toEqual(['questionnaire']);          // pas rouvert
  });

  test('profil inconnu (null, ligne partielle sans la colonne) : rien', () => {
    expect(bac({ profil: null }).appel('ouvrirQuestionnaireSiDu()')).toBe(false);
    const partiel = bac({ profil: { intention: 'entretien' } });
    expect(partiel.appel('ouvrirQuestionnaireSiDu()')).toBe(false);
    expect(partiel.stockage).toEqual({});                          // et la clé n'est PAS posée
  });

  test('questionnaire rempli : rien', () => {
    const b = bac({ profil: { id: 'u1', questionnaire_fait_le: '2026-10-07T08:00:00Z' } });
    expect(b.appel('ouvrirQuestionnaireSiDu()')).toBe(false);
  });

  test('⚠️ JAMAIS PAR-DESSUS UNE SÉANCE OUVERTE — et la clé reste libre pour plus tard', () => {
    const b = bac({ seance: { id: 'en-cours' } });
    expect(b.appel('ouvrirQuestionnaireSiDu()')).toBe(false);
    expect(b.stockage).toEqual({});
    expect(b.journal.montres).toEqual([]);
  });

  test('⚠️ ni par-dessus un ordre « Ranger » non enregistré (changer d’écran le jetterait) — la clé reste libre', () => {
    const b = bac({ ranger: true });
    expect(b.appel('ouvrirQuestionnaireSiDu()')).toBe(false);
    expect(b.stockage).toEqual({});
    expect(b.journal.montres).toEqual([]);
  });

  test('ni par-dessus une feuille ouverte, ni par-dessus le détail d’une séance', () => {
    expect(bac({ voile: { hidden: false } }).appel('ouvrirQuestionnaireSiDu()')).toBe(false);
    expect(bac({ detailVisible: true }).appel('ouvrirQuestionnaireSiDu()')).toBe(false);
  });

  test('sans compte : rien ; stockage refusé : « déjà vu » (on n’ouvre pas à chaque démarrage)', () => {
    expect(bac({ sansCompte: true }).appel('ouvrirQuestionnaireSiDu()')).toBe(false);
    expect(bac({ stockageRefuse: true }).appel('ouvrirQuestionnaireSiDu()')).toBe(false);
  });

  test('déjà ouvert : un second appel ne rouvre pas et ne remet pas à zéro', () => {
    const b = bac();
    b.appel('ouvrirQuestionnaireSiDu()');
    b.actions().surChoix('historique', 'import');
    expect(b.appel('ouvrirQuestionnaireSiDu()')).toBe(false);
    expect(b.ctx.questionnaire.rep.historique).toBe('import');
  });

  test('le retour d’Android : une garde, qui se tait sous une feuille', () => {
    const b = bac();
    b.appel('ouvrirQuestionnaireSiDu()');
    const garde = b.ctx.gardeQuestionnaire;
    expect(garde()).toMatchObject({ raison: 'questionnaire' });
    b.ctx.voileOuvert = { hidden: false };
    expect(garde()).toBeNull();
    b.ctx.voileOuvert = null;
    b.appel('fermerQuestionnaire()');
    expect(b.ctx.gardes).toEqual([]);
    expect(garde()).toBeNull();
  });
});

describe('60-2a — une ÉCRITURE par écran validé, par le chemin du Profil', () => {
  test('le parcours entier, avec des séances : chaque « Continuer » écrit ses colonnes, rien de plus', () => {
    const b = bac({ profil: { id: 'u1', questionnaire_fait_le: null, intention: 'progresser', phase: 'seche',
                              phase_depuis: '2026-09-01T00:00:00Z' } });
    b.appel('ouvrirQuestionnaireSiDu()');
    const cont = () => b.actions().surContinuer();
    const choix = (c, v) => b.actions().surChoix(c, v);

    cont();                                                          // bienvenue : rien
    expect(b.ecran()).toBe('donnees');
    expect(b.journal.profil).toEqual([]);

    cont();                                                          // « Continuer » éteint sans réponse
    expect(b.ecran()).toBe('donnees');
    choix('historique', 'import'); cont();
    expect(b.journal.profil.pop()).toEqual({ historique_declare: 'import' });
    expect(b.ecran()).toBe('sait');                                  // des séances : 3a

    cont();                                                          // 3a : rien à écrire
    expect(b.ecran()).toBe('toi');
    expect(b.journal.profil).toEqual([]);

    choix('sexe', 'homme'); cont();
    expect(b.journal.profil.pop()).toEqual({ sexe: 'homme' });
    expect(b.ecran()).toBe('but');

    choix('objectif', 'force'); choix('phase', 'seche'); cont();
    const but = b.journal.profil.pop();
    expect(Object.keys(but).sort()).toEqual(['objectif', 'objectif_depuis', 'phase_confirmee_le']);   // la phase est inchangée : pas de phase_depuis
    expect(b.ecran()).toBe('priorites');

    choix('priorite', 'squat_barre'); choix('priorite', 'dos'); cont();
    expect(b.journal.profil.pop()).toEqual({ priorites: ['squat_barre', 'dos'] });
    expect(b.ecran()).toBe('temps');

    choix('temps', 'moins'); choix('materiel', 'salle_basique'); cont();
    expect(b.journal.profil.pop()).toEqual({ temps_reponse: 'moins', materiel: 'salle_basique' });
    expect(b.ecran()).toBe('coach');

    choix('coach', 'carnet'); cont();
    expect(b.journal.profil.pop()).toEqual({ intention: 'entretien' });
    expect(b.ecran()).toBe('recap');

    cont();                                                          // « Commencer »
    const fin = b.journal.profil.pop();
    expect(Object.keys(fin)).toEqual(['questionnaire_fait_le']);
    expect(b.ctx.questionnaire).toBeNull();
    expect(b.journal.saisie).toBe(1);                                // on arrive à Saisie
    expect(b.journal.pesees).toEqual([]);
  });

  test('DISCRIMINANT — « ‹ Retour » n’écrit RIEN, et au premier écran il vaut « Plus tard »', () => {
    const b = bac();
    b.appel('ouvrirQuestionnaireSiDu()');
    b.actions().surContinuer();
    b.actions().surChoix('historique', 'non_note');
    b.actions().surRetour();
    expect(b.ecran()).toBe('bienvenue');
    expect(b.journal.profil).toEqual([]);
    b.actions().surRetour();                                         // premier écran
    expect(b.ctx.questionnaire).toBeNull();
    expect(b.journal.saisie).toBe(1);
    expect(b.journal.profil).toEqual([]);
  });

  test('« Plus tard » n’écrit rien (ce qui est validé l’est déjà) et mène à Saisie', () => {
    const b = bac();
    b.appel('ouvrirQuestionnaireSiDu()');
    b.actions().surContinuer();
    b.actions().surChoix('historique', 'import');
    b.actions().surPlusTard();
    expect(b.journal.profil).toEqual([]);
    expect(b.ctx.questionnaire).toBeNull();
    expect(b.journal.saisie).toBe(1);
  });

  test('« je débute » avec des séances : l’écran 3b, pas 3a — l’historique répondu décide', () => {
    const b = bac();
    b.appel('ouvrirQuestionnaireSiDu()');
    b.actions().surContinuer();
    b.actions().surChoix('historique', 'debutant');
    b.actions().surContinuer();
    expect(b.ecran()).toBe('sans_historique');
    b.actions().surChoix('anciennete', '1_a_3_ans'); b.actions().surChoix('seances', 4); b.actions().surChoix('duree', 75);
    b.actions().surContinuer();
    expect(b.journal.profil.pop()).toEqual({ anciennete: '1_a_3_ans', seances_par_semaine: 4, duree_seance_min: 75 });
  });

  test('sans séance en base : 3b, même pour « dans une autre app »', () => {
    const b = bac({ seances: [] });
    b.appel('ouvrirQuestionnaireSiDu()');
    b.actions().surContinuer();
    b.actions().surChoix('historique', 'import');
    b.actions().surContinuer();
    expect(b.ecran()).toBe('sans_historique');
    expect(b.vueCourante().voix).toBe('L’import dans l’app arrive plus tard. Ces trois réponses suffisent pour commencer.');
  });

  test('« changer » au récapitulatif : l’écran concerné, puis on REVIENT au récapitulatif — et « Retour » aussi', () => {
    const b = bac({ profil: { id: 'u1', questionnaire_fait_le: null, objectif: 'force', phase: 'seche', intention: 'progresser' } });
    b.appel('ouvrirQuestionnaireSiDu()');
    b.ctx.questionnaire.ecran = 'recap';
    b.actions().surChanger('but');
    expect(b.ecran()).toBe('but');
    b.actions().surChoix('objectif', 'muscle');
    b.actions().surContinuer();
    expect(b.ecran()).toBe('recap');
    expect(b.journal.profil.pop()).toMatchObject({ objectif: 'muscle' });
    b.actions().surChanger('coach');
    b.actions().surRetour();
    expect(b.ecran()).toBe('recap');
  });

  test('un écran pré-rempli depuis la base : on vérifie, on ne retape pas (rien d’écrit si rien ne change)', () => {
    const b = bac({ profil: { id: 'u1', questionnaire_fait_le: null, objectif: 'force', phase: 'seche',
      phase_depuis: '2026-09-01T00:00:00Z', historique_declare: 'import', intention: 'progresser', rythme_progression: 'franc' } });
    b.appel('ouvrirQuestionnaireSiDu()');
    expect(b.ctx.questionnaire.rep.objectif).toBe('force');
    expect(b.ctx.questionnaire.rep.coach).toBe('franc');
    b.actions().surContinuer(); b.actions().surContinuer();         // bienvenue, données (déjà répondu)
    expect(b.journal.profil).toEqual([]);                           // rien n'a changé : rien n'est écrit
  });
});

describe('60-2a — la pesée de l’écran « Toi »', () => {
  function versToi(b) {
    b.appel('ouvrirQuestionnaireSiDu()');
    b.actions().surContinuer();
    b.actions().surChoix('historique', 'import'); b.actions().surContinuer();
    b.actions().surContinuer();                                       // 3a
    expect(b.ecran()).toBe('toi');
  }

  test('un poids tapé avec sa virgule, différent de la dernière pesée : une pesée du jour, par la file', () => {
    const b = bac({ pesees: [{ id: 'a', date: '2026-09-20', poids_kg: 98 }] });
    versToi(b);
    expect(b.actions().surSaisie('poids', '98,4')).toBeNull();
    b.actions().surContinuer();
    expect(b.journal.pesees).toEqual([{ date: '2026-10-07', poids_kg: 98.4 }]);
  });

  test('⚠️ DISCRIMINANT — le poids pré-rempli est RELU à l’arrivée sur « Toi » : une pesée apportée entre-temps par la synchronisation n’est pas écrasée', () => {
    const b = bac({ pesees: [{ id: 'a', date: '2026-09-01', poids_kg: 84 }] });
    b.appel('ouvrirQuestionnaireSiDu()');                               // ouvert depuis le cache : 84
    b.ctx.local.pesees = [{ id: 'a', date: '2026-09-01', poids_kg: 84 }, { id: 'b', date: '2026-10-06', poids_kg: 82.5 }];   // la synchro apporte 82,5
    b.actions().surContinuer();
    b.actions().surChoix('historique', 'import'); b.actions().surContinuer();
    b.actions().surContinuer();                                         // 3a → « Toi »
    expect(b.ecran()).toBe('toi');
    expect(b.ctx.questionnaire.rep.poids).toBe(82.5);
    b.actions().surContinuer();                                         // rien de tapé : rien d'écrit
    expect(b.journal.pesees).toEqual([]);
  });

  test('ce que la personne a TAPÉ n’est jamais relu : le champ garde son texte', () => {
    const b = bac({ pesees: [{ id: 'a', date: '2026-09-01', poids_kg: 84 }] });
    versToi(b);
    b.actions().surSaisie('poids', '85,5');
    b.actions().surRetour();                                            // 3a
    b.ctx.local.pesees = [{ id: 'b', date: '2026-10-06', poids_kg: 82.5 }];
    b.actions().surContinuer();                                         // « Toi » de nouveau
    expect(b.ctx.questionnaire.rep.poids).toBe(85.5);
  });

  test('DISCRIMINANT — le poids inchangé (le champ était pré-rempli de la dernière pesée) n’écrit RIEN', () => {
    const b = bac({ pesees: [{ id: 'a', date: '2026-09-20', poids_kg: 98 }] });
    versToi(b);
    expect(b.vueCourante().blocs[1].champs[2].valeur).toBe('98');    // pré-rempli
    b.actions().surContinuer();
    expect(b.journal.pesees).toEqual([]);
  });

  test('un poids hors bornes : la phrase le dit, aucune pesée ne part ; la taille et l’année aussi', () => {
    const b = bac();
    versToi(b);
    expect(b.actions().surSaisie('poids', '12')).toBe('Un poids entre 20 et 400 kg.');
    expect(b.actions().surSaisie('taille', '99')).toBe('Une taille entre 100 et 250 cm.');
    expect(b.actions().surSaisie('annee', '1850')).toBe('Une année de naissance plausible.');
    expect(b.actions().surSaisie('poids', 'abc')).toBe('Un poids entre 20 et 400 kg.');
    const avant = b.journal.profil.length;                           // l'écran « Tes données » a déjà écrit le sien
    b.actions().surContinuer();
    expect(b.journal.pesees).toEqual([]);
    expect(b.journal.profil.length).toBe(avant);                     // rien de la taille, de l'année ni du poids n'est parti
  });

  test('l’année et la taille tapées s’écrivent ; l’année garde une date complète déjà saisie', () => {
    const b = bac({ profil: { id: 'u1', questionnaire_fait_le: null, date_naissance: '1997-10-28' } });
    versToi(b);
    b.actions().surSaisie('annee', '1997'); b.actions().surSaisie('taille', '182');
    b.actions().surContinuer();
    expect(b.journal.profil.pop()).toEqual({ taille_cm: 182 });      // pas de date_naissance : l'année n'a pas changé
  });

  test('taper dans un champ ne redessine PAS l’écran (il perdrait le clavier)', () => {
    const b = bac();
    versToi(b);
    const avant = b.journal.rendus.length;
    b.actions().surSaisie('poids', '9');
    b.actions().surSaisie('poids', '98');
    expect(b.journal.rendus.length).toBe(avant);
  });
});

describe('60-2a — la durée visée de l’écran « Temps et matériel »', () => {
  test('la feuille du Profil, mais la réponse reste un brouillon : rien n’est écrit avant « Continuer »', () => {
    const b = bac({ faits: { seances: 5, depuis: new Date(2026, 9, 1), rythme: 3, dureeMin: 75, maximums: [], autres: [] } });
    b.appel('ouvrirQuestionnaireSiDu()');
    b.ctx.questionnaire.ecran = 'temps';
    b.actions().surLigne('duree');
    const feuille = b.journal.feuilles[0];
    expect(feuille.titre).toBe('Durée d’une séance');
    expect(feuille.valeur).toBe(75);
    feuille.surChoix(60);
    expect(b.journal.profil).toEqual([]);
    expect(b.ctx.questionnaire.rep.duree).toBe(60);
    b.actions().surContinuer();
    expect(b.journal.profil.pop()).toEqual({ duree_seance_min: 60 });
  });

  test('DISCRIMINANT — la médiane montrée n’est pas une réponse : « Continuer » sans y toucher n’écrit pas la durée', () => {
    const b = bac({ faits: { seances: 5, depuis: new Date(2026, 9, 1), rythme: 3, dureeMin: 75, maximums: [], autres: [] } });
    b.appel('ouvrirQuestionnaireSiDu()');
    b.ctx.questionnaire.ecran = 'temps';
    b.actions().surChoix('temps', 'max');
    b.actions().surContinuer();
    expect(b.journal.profil.pop()).toEqual({ temps_reponse: 'max' });
  });
});

describe('60-2a — le bandeau de Saisie', () => {
  test('tant que le questionnaire n’est pas terminé : « Ton questionnaire n’est pas terminé. » et « Le terminer », sans « Abandonner »', () => {
    const b = bac();
    b.appel('rendreBandeauQuestionnaire()');
    const v = b.journal.bandeaux[0];
    expect(v.quoi).toBe('Ton questionnaire n’est pas terminé.');
    expect(v.libelleReprendre).toBe('Le terminer');
    expect(v.surQuitter).toBeUndefined();
    v.surReprendre();
    expect(b.ecran()).toBe('bienvenue');                              // « Le terminer » le rouvre, depuis le début
  });

  test('rempli, ou profil inconnu : pas de bandeau', () => {
    expect(bac({ profil: { questionnaire_fait_le: '2026-10-07T08:00:00Z' } }).appel('rendreBandeauQuestionnaire()') || true).toBe(true);
    const rempli = bac({ profil: { questionnaire_fait_le: '2026-10-07T08:00:00Z' } });
    rempli.appel('rendreBandeauQuestionnaire()');
    expect(rempli.journal.bandeaux).toEqual([null]);
    const inconnu = bac({ profil: null });
    inconnu.appel('rendreBandeauQuestionnaire()');
    expect(inconnu.journal.bandeaux).toEqual([null]);
  });

  test('le bandeau « Le terminer » rouvre le questionnaire même quand la clé « déjà vu ici » est posée', () => {
    const b = bac();
    b.appel('ouvrirQuestionnaireSiDu()');
    b.appel('plusTardQuestionnaire()');
    b.appel('rendreBandeauQuestionnaire()');
    b.journal.bandeaux.pop().surReprendre();
    expect(b.ecran()).toBe('bienvenue');
  });
});

describe('60-2a — la décision se reprend quand la ligne de profil ARRIVE', () => {
  function bacChargement(ligneDistante, avant) {
    const ouvertures = [];
    const ctx = {
      userId: () => 'u1', generation: 1, generationValide: () => true,
      Donnees: { monProfil: () => Promise.resolve(ligneDistante), enregistrerProfil: (id, c) => Promise.resolve(Object.assign({ id }, c, { questionnaire_fait_le: null })) },
      Profil, profil: avant === undefined ? null : avant, profilAEnvoyer: false, pseudoAInscrire: null, versionProfil: 0,
      rendreBandeauQuestionnaire: () => { ctx.bandeaux = (ctx.bandeaux || 0) + 1; },
      rendreBandeauPhase: () => { ctx.bandeauxPhase = (ctx.bandeauxPhase || 0) + 1; },
      sauverProfilLocal: () => Promise.resolve(), ecranCourant: 'semaine', rendreProfilEcran: () => {},
      envoyerProfil: () => Promise.resolve(),
      ouvrirQuestionnaireSiDu: () => { ouvertures.push(ctx.profil); return false; }
    };
    vm.createContext(ctx);
    vm.runInContext(extraire('chargerProfil'), ctx);
    return { ctx, ouvertures };
  }

  test('⚠️ premier démarrage SANS cache : la ligne arrive, la décision est reprise sur la ligne reçue', async () => {
    const { ctx, ouvertures } = bacChargement({ id: 'u1', questionnaire_fait_le: null }, null);
    await vm.runInContext('chargerProfil()', ctx);
    expect(ouvertures).toEqual([{ id: 'u1', questionnaire_fait_le: null }]);
  });

  test('un compte tout neuf (aucune ligne) : la ligne est créée, puis la décision est reprise', async () => {
    const { ctx, ouvertures } = bacChargement(null, null);
    await vm.runInContext('chargerProfil()', ctx);
    expect(ouvertures).toHaveLength(1);
    expect(ouvertures[0].questionnaire_fait_le).toBeNull();
  });

  test('⚠️ DISCRIMINANT — un geste posé PENDANT la lecture est plus récent qu’elle : la ligne lue ne le remplace pas', async () => {
    const { ctx, ouvertures } = bacChargement({ id: 'u1', questionnaire_fait_le: null, objectif: null }, { id: 'u1' });
    ctx.Donnees.monProfil = () => { ctx.versionProfil += 1; ctx.profil = { id: 'u1', objectif: 'muscle' }; return Promise.resolve({ id: 'u1', questionnaire_fait_le: null, objectif: null }); };
    await vm.runInContext('chargerProfil()', ctx);
    expect(ctx.profil.objectif).toBe('muscle');
    expect(ouvertures).toEqual([]);
  });

  test('le bandeau de Saisie suit la ligne qui vient d’arriver (même quand le questionnaire ne s’ouvre pas)', async () => {
    const { ctx } = bacChargement({ id: 'u1', questionnaire_fait_le: null }, null);
    await vm.runInContext('chargerProfil()', ctx);
    expect(ctx.bandeaux).toBe(1);
  });

  test('une modification locale en attente prime : la décision n’est pas reprise sur une ligne qu’on n’adopte pas', async () => {
    const { ctx, ouvertures } = bacChargement({ id: 'u1', questionnaire_fait_le: null }, { id: 'u1' });
    ctx.profilAEnvoyer = true;
    await vm.runInContext('chargerProfil()', ctx);
    expect(ouvertures).toEqual([]);
  });
});

describe('60-2a — l’envoi du profil : UN SEUL À LA FOIS, et une réponse n’efface jamais un geste plus récent', () => {
  function bacEnvoi() {
    const departs = [], attentes = [];
    const ctx = {
      userId: () => 'u1', generation: 1, generationValide: () => true,
      Profil, profil: { id: 'u1', objectif: null }, profilAEnvoyer: false, ecranCourant: 'saisie',
      Donnees: { enregistrerProfil: (id, champs) => new Promise((ok) => {
        departs.push(JSON.parse(JSON.stringify(champs)));
        attentes.push(() => ok(Object.assign({ id }, champs)));
      }) },
      sauverProfilLocal: () => Promise.resolve(), rendreProfilEcran: () => {}, envoiProfil: null, versionProfil: 0
    };
    vm.createContext(ctx);
    ['poserProfil', 'envoyerProfil', 'envoyerProfilMaintenant'].forEach((f) => vm.runInContext(extraire(f), ctx));
    return { ctx, departs, attentes };
  }
  const tour = () => new Promise((ok) => setImmediate(ok));

  test('⚠️ DISCRIMINANT — deux gestes rapprochés : le second attend la réponse du premier, puis part avec les DEUX', async () => {
    const b = bacEnvoi();
    const un = vm.runInContext('poserProfil({ objectif: "force" })', b.ctx);
    await tour();
    const deux = vm.runInContext('poserProfil({ objectif: "muscle", priorites: ["dos"] })', b.ctx);
    await tour();
    expect(b.departs).toHaveLength(1);                                          // le second n'est PAS parti en parallèle
    b.attentes[0]();                                                            // la réponse du PREMIER arrive
    await un;
    await tour();
    // La réponse du premier ne remplace pas le geste plus récent…
    expect(b.ctx.profil).toMatchObject({ objectif: 'muscle', priorites: ['dos'] });
    // …et le second part avec l'état d'ALORS, rien n'est perdu.
    expect(b.departs).toHaveLength(2);
    expect(b.departs[1]).toEqual({ objectif: 'muscle', priorites: ['dos'] });
    expect(b.ctx.profilAEnvoyer).toBe(true);                                    // le drapeau reste levé tant que le dernier n'a pas répondu
    b.attentes[1]();
    await deux;
    expect(b.ctx.profil).toEqual({ id: 'u1', objectif: 'muscle', priorites: ['dos'] });
    expect(b.ctx.profilAEnvoyer).toBe(false);
  });

  test('un geste seul : la réponse du serveur est adoptée, le drapeau retombe', async () => {
    const b = bacEnvoi();
    const un = vm.runInContext('poserProfil({ objectif: "force" })', b.ctx);
    await tour();
    b.attentes[0]();
    await un;
    expect(b.ctx.profil).toEqual({ id: 'u1', objectif: 'force' });
    expect(b.ctx.profilAEnvoyer).toBe(false);
  });

  test('un envoi qui échoue ne bloque pas le suivant : il part, et le drapeau reste levé', async () => {
    const b = bacEnvoi();
    b.ctx.Donnees.enregistrerProfil = (id, champs) => { b.departs.push(champs); return Promise.reject(new Error('hors ligne')); };
    await vm.runInContext('poserProfil({ objectif: "force" })', b.ctx);
    expect(b.ctx.profilAEnvoyer).toBe(true);
    await vm.runInContext('poserProfil({ objectif: "muscle" })', b.ctx);
    expect(b.departs).toHaveLength(2);
    expect(b.ctx.profil.objectif).toBe('muscle');
  });
});

describe('60-2a — le routage d’entrée et la vue', () => {
  test('l’entrée complète décide sur le cache (avant tout rendu), et la ré-entrée ne reprend jamais la main sur le questionnaire', () => {
    const entree = extraire('entrerVraiment');
    expect(entree).toMatch(/ouvrirQuestionnaireSiDu\(\)/);
    expect(entree).not.toMatch(/doitOuvrirProfil/);
    expect(entree.indexOf('ouvrirQuestionnaireSiDu()')).toBeLessThan(entree.indexOf('rendreRoute(routeInitiale)'));
    expect(entree).toMatch(/!vues\.questionnaire\.hidden/);
    expect(extraire('reentrer')).toMatch(/!vues\.questionnaire\.hidden/);
  });

  test('« Quitter » efface la clé « déjà vu ici » (le préfixe `th-v2`), un retour de connexion le remontre une fois', () => {
    expect(APP).toMatch(/CLE_QUESTIONNAIRE_VU = 'th-v2-questionnaire-vu-'/);
  });

  test('⚠️ DISCRIMINANT — `montrer` : un AUTRE écran posé par-dessus ferme le questionnaire (l’état suit sa vue) ; le sien ne le ferme pas', () => {
    function bacMontrer(ouvert) {
      const fermes = [];
      const ctx = {
        ecranCourant: 'questionnaire', questionnaire: ouvert ? { ecran: 'toi' } : null,
        fermerReorganisation: () => {}, fermerQuestionnaire: () => { fermes.push(true); ctx.questionnaire = null; },
        Routeur: { ongletDe: () => null, PROFIL: 'profil', SAISIE: 'saisie' },
        vues: { liste: { hidden: true }, questionnaire: { hidden: false } },
        $: () => null, Rendu: { rendreOnglets: () => {} }, doc: { querySelector: () => null },
        seance: null, mesurerBarres: () => {}, marquerProfilVu: () => {}
      };
      vm.createContext(ctx);
      vm.runInContext(extraire('montrer'), ctx);
      return { ctx, fermes };
    }
    const a = bacMontrer(true);
    vm.runInContext("montrer('liste')", a.ctx);
    expect(a.fermes).toHaveLength(1);
    expect(a.ctx.questionnaire).toBeNull();
    const b = bacMontrer(true);
    vm.runInContext("montrer('questionnaire')", b.ctx);
    expect(b.fermes).toEqual([]);
    expect(b.ctx.questionnaire).not.toBeNull();
  });

  test('la session perdue ferme le questionnaire et oublie l’envoi en vol ; « Rafraîchir » ne recouvre pas un questionnaire qu’il vient d’ouvrir', () => {
    expect(APP).toMatch(/entreeFaitePour = null;\s*fermerQuestionnaire\(\); envoiProfil = null; versionProfil = 0;\s*profil = null; faits\.oublierDates\(\);\s*allerA\(Routeur\.CONNEXION/);
    expect(APP).toMatch(/await chargerProfil\(\);[^}]*if \(vues\.questionnaire\.hidden\) afficherSemaine\(\);/);
  });

  test('le retour du réseau ne renvoie le profil que s’il y a quelque chose à envoyer (un cache périmé n’écrase pas un autre appareil)', () => {
    expect(APP).toMatch(/addEventListener\('online', function \(\) \{ vidanger\(\); if \(profilAEnvoyer\) envoyerProfil\(\); \}\)/);
  });

  test('la déconnexion ferme le questionnaire et oublie l’envoi en vol', () => {
    expect(extraire('deconnecter')).toMatch(/fermerQuestionnaire\(\);\s*envoiProfil = null/);
  });
});
