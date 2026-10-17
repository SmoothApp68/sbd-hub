/** @jest-environment node */
//
// 60-5 — UN PSEUDO REFUSÉ NE BLOQUE PLUS LE PROFIL (ECRAN-PROFIL §3.1, delta R2).
//
// LE DÉFAUT (relevé par 60-3b, constat 1) : un pseudo déjà pris, tapé depuis la ligne « Pseudo » du Profil,
//   · était posé en local et affiché comme posé (`SAISIES.username.valider` passait `pris = null` : aucune
//     question à la base) ;
//   · partait avec TOUTE la ligne (le profil n'a pas de file : `profilAEnvoyer`, un `upsert` entier) ; la
//     base refusait (`23505`, `profiles_username_uniq`), et l'envoi restait en attente — à l'identique, à
//     chaque départ. Toutes les colonnes de la ligne, les réponses du questionnaire comprises, attendaient
//     un pseudo qui ne passerait jamais.
//
// LE CORRECTIF : (1) la feuille vérifie avant de se fermer (`Donnees.pseudoPris`, les trois états de §5.2) ;
// (2) si la base refuse quand même, le refus est définitif POUR LE PSEUDO SEUL : un second envoi, la même
// ligne moins `username`.
//
// Les fonctions d'`app.js` se REJOUENT dans un bac `vm`, avec le vrai `Profil` et une base fausse qui fait
// comme la vraie : l'`upsert` n'écrit que les colonnes reçues, et un pseudo déjà tenu par un autre refuse la
// ligne ENTIÈRE (`23505`, rien d'écrit).

process.env.TZ = 'Europe/Paris';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
const Profil = require('../../v2/js/profil.js');

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const extraire = (nom) => {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable : ' + nom);
  return m[0];
};
const SAISIES = APP.match(/^  var SAISIES = \{[\s\S]*?^  \};/m)[0];
const CLE_PSEUDO_PRIS = /var CLE_PSEUDO_PRIS = '([^']+)'/.exec(APP)[1];
const DELAI_PSEUDO_MS = Number(/var DELAI_PSEUDO_MS = (\d+);/.exec(APP)[1]);
const tic = () => new Promise((r) => setImmediate(r));

const erreur23505 = (nom, contrainte) => Object.assign(new Error('duplicate key value violates unique constraint "' + (contrainte || 'profiles_username_uniq') + '"'),
  { code: '23505', details: 'Key (lower(username::text))=(' + String(nom).toLowerCase() + ') already exists.' });

// ═══ 1. LES DEUX FONCTIONS PURES ═══════════════════════════════════════════
describe('Profil.estRefusDePseudo / Profil.sansPseudo', () => {
  test('le refus d’unicité du pseudo, sur une ligne qui en portait un', () => {
    expect(Profil.estRefusDePseudo(erreur23505('x'), { username: 'x' })).toBe(true);
  });

  test('une erreur réduite (le code seul) vaut refus de pseudo — la lecture de `chargerProfil` depuis 60-2c', () => {
    expect(Profil.estRefusDePseudo({ code: '23505' }, { username: 'x' })).toBe(true);
  });

  test('⚠️ pas de pseudo dans la ligne → ce n’est pas un refus de pseudo', () => {
    expect(Profil.estRefusDePseudo(erreur23505('x'), { username: null, objectif: 'force' })).toBe(false);
    expect(Profil.estRefusDePseudo(erreur23505('x'), { username: '' })).toBe(false);
    expect(Profil.estRefusDePseudo(erreur23505('x'), { objectif: 'force' })).toBe(false);
  });

  test('⚠️ une autre contrainte nommée (la clé primaire), un autre code, pas d’erreur : non', () => {
    expect(Profil.estRefusDePseudo(erreur23505('x', 'profiles_pkey'), { username: 'x' })).toBe(false);
    expect(Profil.estRefusDePseudo({ code: '23514', message: 'check constraint "profiles_username_check"' }, { username: 'x' })).toBe(false);
    expect(Profil.estRefusDePseudo({ code: '42501' }, { username: 'x' })).toBe(false);
    expect(Profil.estRefusDePseudo(null, { username: 'x' })).toBe(false);
    expect(Profil.estRefusDePseudo(new Error('réseau'), { username: 'x' })).toBe(false);
  });

  test('`sansPseudo` : la même ligne moins `username`, sans toucher à l’entrée', () => {
    const ligne = { username: 'x', objectif: 'force', temps_reponse: 'max', bio: null };
    const copie = JSON.parse(JSON.stringify(ligne));
    expect(Profil.sansPseudo(ligne)).toEqual({ objectif: 'force', temps_reponse: 'max', bio: null });
    expect(Object.prototype.hasOwnProperty.call(Profil.sansPseudo(ligne), 'username')).toBe(false);
    expect(ligne).toEqual(copie);
    expect(Profil.sansPseudo(null)).toEqual({});
  });
});

// ═══ 2. L'ENVOI : UN PSEUDO REFUSÉ QUITTE L'ENVOI, LE RESTE PART ═══════════
function bacEnvoi(o) {
  const opt = o || {};
  const stock = {};
  const etat = { posts: [], reseau: opt.reseau !== false, avertissements: [],
    // La « base » : sa ligne, et le pseudo qu'un TIERS tient.
    ligne: Object.assign({ id: 'u1', username: null, objectif: null, temps_reponse: null, intention: null }, opt.ligne || {}),
    pris: (opt.pris || []).map((p) => p.toLowerCase()) };
  const ctx = {
    console: { warn: (...a) => etat.avertissements.push(a.join(' ')) },
    Promise, Date, Object, Array, Math, String,
    Profil,
    racine: { localStorage: { getItem: (k) => (k in stock ? stock[k] : null), setItem: (k, v) => { stock[k] = String(v); }, removeItem: (k) => { delete stock[k]; } } },
    CLE_PSEUDO_PRIS,
    texteErreur: (e) => String(e && e.message || e),
    profil: Object.assign({ id: 'u1', username: null }, opt.profil || {}), profilAEnvoyer: true, envoiProfil: null, versionProfil: 0, ligneACreer: false,
    generation: 1, generationValide: (g) => g === ctx.generation,
    ecranCourant: 'profil', rendreProfilEcran: () => { etat.rendus = (etat.rendus || 0) + 1; }, objectifsSuiventLeProfil: () => {},
    userId: () => 'u1',
    identifiantDuProfil: async () => 'u1',
    sauverProfilLocal: async () => {},
    userEmail: () => null,
    pseudoAInscrire: null, metadonneesDuCompte: async () => null,
    rendreBandeauQuestionnaire: () => {}, rendreBandeauPhase: () => {}, rendreCarteCycles: () => {},
    ouvrirQuestionnaireSiDu: () => {},
    Donnees: {
      monProfil: async () => (opt.lecture ? opt.lecture(ctx, etat) : Object.assign({}, etat.ligne)),
      enregistrerProfil: async (id, champs) => {
        etat.posts.push(Object.assign({}, champs));
        if (opt.apresPost) opt.apresPost(etat.posts.length, ctx);
        if (!etat.reseau) throw new Error('réseau');
        if (opt.echecDuDeuxieme && etat.posts.length === 2) throw new Error('réseau coupé');
        if (typeof champs.username === 'string' && etat.pris.indexOf(champs.username.toLowerCase()) >= 0) throw erreur23505(champs.username, opt.contrainte);
        // `upsert` : seules les colonnes REÇUES changent.
        Object.keys(champs).forEach((c) => { etat.ligne[c] = champs[c]; });
        return Object.assign({}, etat.ligne);
      }
    }
  };
  vm.createContext(ctx);
  ['retenirPseudoPris', 'effacerPseudoPris', 'pseudoPrisSignale', 'envoyerProfil', 'envoyerProfilMaintenant', 'poserProfil',
    'chargerProfil'].forEach((n) => vm.runInContext(extraire(n), ctx));
  return { ctx, etat, stock, envoyer: () => vm.runInContext('envoyerProfil()', ctx),
           poser: (champs) => { ctx.__c = champs; return vm.runInContext('poserProfil(__c)', ctx); },
           charger: () => vm.runInContext('chargerProfil()', ctx),
           signal: () => vm.runInContext('pseudoPrisSignale()', ctx) };
}

describe('envoyerProfilMaintenant — un pseudo refusé par la base', () => {
  const REPONSES = { objectif: 'force', temps_reponse: 'max', intention: 'progresser' };

  test('⚠️ DISCRIMINANT — les réponses du questionnaire arrivent en base, le pseudo refusé non', async () => {
    const b = bacEnvoi({ pris: ['deja_pris'], profil: Object.assign({ username: 'deja_pris' }, REPONSES) });
    await b.envoyer();
    expect(b.etat.ligne).toMatchObject(REPONSES);                   // les réponses sont en base
    expect(b.etat.ligne.username).toBe(null);                       // le pseudo refusé n'y est pas
    expect(b.ctx.profilAEnvoyer).toBe(false);                       // plus rien n'attend
  });

  test('DEUX envois : le premier porte le pseudo (refusé en bloc), le second la même ligne MOINS `username`', async () => {
    const b = bacEnvoi({ pris: ['deja_pris'], profil: Object.assign({ username: 'deja_pris', bio: 'salut' }, REPONSES) });
    await b.envoyer();
    expect(b.etat.posts).toHaveLength(2);
    expect(b.etat.posts[0].username).toBe('deja_pris');
    expect(Object.prototype.hasOwnProperty.call(b.etat.posts[1], 'username')).toBe(false);
    // aucun autre champ perdu : le second est exactement le premier, sans le pseudo.
    const sans = Object.assign({}, b.etat.posts[0]); delete sans.username;
    expect(b.etat.posts[1]).toEqual(sans);
    expect(b.etat.ligne.bio).toBe('salut');
  });

  test('⚠️ la ligne locale reprend la vérité de la base : le pseudo refusé en sort', async () => {
    const b = bacEnvoi({ pris: ['deja_pris'], profil: Object.assign({ username: 'deja_pris' }, REPONSES) });
    await b.envoyer();
    expect(b.ctx.profil.username).toBe(null);
    expect(b.ctx.profil).toMatchObject(REPONSES);
  });

  test('un pseudo déjà posé n’est pas écrasé : l’ancien revient, le nouveau n’est jamais écrit', async () => {
    const b = bacEnvoi({ pris: ['deja_pris'], ligne: { username: 'ancien' },
      profil: Object.assign({ username: 'deja_pris' }, REPONSES) });
    await b.envoyer();
    expect(b.etat.ligne.username).toBe('ancien');
    expect(b.ctx.profil.username).toBe('ancien');
    expect(b.etat.ligne).toMatchObject(REPONSES);
  });

  test('⚠️ DISCRIMINANT (revue, 3 relecteurs sur 3) — l’ancien pseudo est REVENU : la ligne le montre ET dit la phrase, pas un silence', async () => {
    const b = bacEnvoi({ pris: ['deja_pris'], ligne: { username: 'ancien' },
      profil: Object.assign({ username: 'deja_pris' }, REPONSES) });
    await b.envoyer();
    expect(b.stock[CLE_PSEUDO_PRIS + 'u1']).toBe('p:ancien');          // retenu AVEC le pseudo que la ligne porte
    expect(b.signal()).toBe(true);
    const ligne = Profil.lignePseudo(b.ctx.profil, b.signal(), () => {});
    expect(ligne.valeur).toBe('ancien');
    expect(ligne.sous).toBe('Ce pseudo vient d’être pris : choisis-en un autre.');
  });

  test('(revue) choisir ensuite un pseudo remet l’état à zéro ; une autre réponse n’y touche pas', async () => {
    const b = bacEnvoi({ pris: ['deja_pris'], ligne: { username: 'ancien' },
      profil: Object.assign({ username: 'deja_pris' }, REPONSES) });
    await b.envoyer();
    expect(b.signal()).toBe(true);
    await b.poser({ intention: 'entretenir' });                        // une réponse du questionnaire : l'état reste
    expect(b.signal()).toBe(true);
    await b.poser({ username: 'nouveau_pseudo' });                     // un pseudo choisi : l'état est effacé
    expect(b.stock[CLE_PSEUDO_PRIS + 'u1']).toBeUndefined();
    expect(b.signal()).toBe(false);
    expect(b.etat.ligne.username).toBe('nouveau_pseudo');
  });

  test('(revue) le pseudo choisi est refusé à son tour, après un premier refus : l’état est reposé, pour l’ancien pseudo', async () => {
    const b = bacEnvoi({ pris: ['deja_pris', 'autre_pris'], ligne: { username: 'ancien' },
      profil: Object.assign({ username: 'deja_pris' }, REPONSES) });
    await b.envoyer();
    await b.poser({ username: 'autre_pris' });
    expect(b.ctx.profil.username).toBe('ancien');
    expect(b.stock[CLE_PSEUDO_PRIS + 'u1']).toBe('p:ancien');
    expect(b.signal()).toBe(true);
  });

  test('l’état « pris entre-temps » de 60-3b est posé : la même mémoire locale, la même phrase', async () => {
    const b = bacEnvoi({ pris: ['deja_pris'], profil: Object.assign({ username: 'deja_pris' }, REPONSES) });
    expect(b.signal()).toBe(false);
    await b.envoyer();
    expect(b.signal()).toBe(true);
    expect(b.stock[CLE_PSEUDO_PRIS + 'u1']).toBe('1');
    const ligne = Profil.lignePseudo(b.ctx.profil, b.signal(), () => {});
    expect(ligne.sous).toBe('Ce pseudo vient d’être pris : choisis-en un autre.');
    expect(ligne.valeur).toBe(null);                                 // « à renseigner »
    expect(b.etat.avertissements.some((a) => /Pseudo déjà pris/.test(a))).toBe(true);   // il se dit, il n'est pas avalé
  });

  test('un pseudo libre : UN envoi, rien de retenu', async () => {
    const b = bacEnvoi({ profil: Object.assign({ username: 'libre_ici' }, REPONSES) });
    await b.envoyer();
    expect(b.etat.posts).toHaveLength(1);
    expect(b.etat.ligne.username).toBe('libre_ici');
    expect(b.signal()).toBe(false);
  });

  test('93 — la ligne naît de l’envoi (`ligneACreer`) : elle porte le pseudo de l’inscription et `onboarding_completed: false`', async () => {
    const b = bacEnvoi({ profil: { sexe: 'femme' } });
    delete b.ctx.profil.username; delete b.ctx.profil.id;
    b.ctx.ligneACreer = true; b.ctx.pseudoAInscrire = 'test_0710';
    await b.envoyer();
    expect(b.etat.posts).toHaveLength(1);
    expect(b.etat.posts[0]).toEqual(expect.objectContaining({ sexe: 'femme', username: 'test_0710', onboarding_completed: false }));
    expect(b.ctx.ligneACreer).toBe(false);
    expect(b.ctx.pseudoAInscrire).toBe(null);
  });

  test('93 — ⚠️ DISCRIMINANT : sans `ligneACreer` (ligne non lue, mais peut-être existante), l’envoi n’ajoute NI pseudo NI `onboarding_completed`', async () => {
    const b = bacEnvoi({ profil: { sexe: 'femme' } });
    delete b.ctx.profil.username; delete b.ctx.profil.id;
    b.ctx.pseudoAInscrire = 'test_0710';
    await b.envoyer();
    expect(b.etat.posts).toHaveLength(1);
    expect(Object.prototype.hasOwnProperty.call(b.etat.posts[0], 'username')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(b.etat.posts[0], 'onboarding_completed')).toBe(false);
  });

  test('⚠️ PAS DE REJEU SANS FIN : le second envoi qui échoue laisse l’attente levée, sans troisième essai', async () => {
    const b = bacEnvoi({ pris: ['deja_pris'], echecDuDeuxieme: true, profil: Object.assign({ username: 'deja_pris' }, REPONSES) });
    await b.envoyer();
    expect(b.etat.posts).toHaveLength(2);                            // deux, pas trois, pas une boucle
    expect(b.ctx.profilAEnvoyer).toBe(true);                         // rien n'est perdu : il repartira
    expect(b.ctx.profil).toMatchObject(REPONSES);
    // Le réseau revient : le prochain départ refait la paire (le pseudo est encore dans la ligne locale)
    // et se résout — les réponses arrivent.
    await b.envoyer();
    expect(b.etat.posts).toHaveLength(4);
    expect(b.etat.ligne).toMatchObject(REPONSES);
    expect(b.ctx.profilAEnvoyer).toBe(false);
  });

  test('une autre contrainte (la clé primaire) n’est pas un refus de pseudo : un envoi, l’attente levée comme avant', async () => {
    const b = bacEnvoi({ pris: ['deja_pris'], contrainte: 'profiles_pkey', profil: Object.assign({ username: 'deja_pris' }, REPONSES) });
    await b.envoyer();
    expect(b.etat.posts).toHaveLength(1);
    expect(b.ctx.profilAEnvoyer).toBe(true);
    expect(b.signal()).toBe(false);
  });

  test('hors ligne : l’envoi attend (une tentative, rien retenu), puis se résout au retour du réseau', async () => {
    const b = bacEnvoi({ reseau: false, profil: Object.assign({ username: 'libre_ici' }, REPONSES) });
    await b.envoyer();
    expect(b.etat.posts).toHaveLength(1);
    expect(b.ctx.profilAEnvoyer).toBe(true);
    expect(b.signal()).toBe(false);
    expect(b.etat.ligne.username).toBe(null);
    b.etat.reseau = true;                                            // le gestionnaire `online` fait `envoyerProfil()`
    await b.envoyer();
    expect(b.ctx.profilAEnvoyer).toBe(false);
    expect(b.etat.ligne).toMatchObject(Object.assign({ username: 'libre_ici' }, REPONSES));
  });

  test('hors ligne PUIS pseudo pris entre-temps : au retour du réseau, le pseudo sort, les réponses arrivent', async () => {
    const b = bacEnvoi({ reseau: false, pris: ['deja_pris'], profil: Object.assign({ username: 'deja_pris' }, REPONSES) });
    await b.envoyer();
    expect(b.ctx.profilAEnvoyer).toBe(true);
    b.etat.reseau = true;
    await b.envoyer();
    expect(b.etat.ligne).toMatchObject(REPONSES);
    expect(b.etat.ligne.username).toBe(null);
    expect(b.signal()).toBe(true);
    expect(b.ctx.profilAEnvoyer).toBe(false);
  });

  test('un geste posé PENDANT l’envoi n’est pas écrasé par la réponse (la règle de 60-2a tient aussi pour le second envoi)', async () => {
    const b = bacEnvoi({ pris: ['deja_pris'], profil: Object.assign({ username: 'deja_pris' }, REPONSES),
      apresPost: (n, ctx) => { if (n === 2) { ctx.versionProfil++; ctx.profil = Object.assign({}, ctx.profil, { intention: 'entretenir' }); } } });
    await b.envoyer();
    expect(b.ctx.profil.intention).toBe('entretenir');               // le geste plus récent est intact
    expect(b.ctx.profilAEnvoyer).toBe(true);                         // et son propre envoi l'attend
    expect(b.signal()).toBe(true);                                   // le refus, lui, est un fait : retenu
  });

  test('⚠️ DISCRIMINANT (revue) — une adoption est un changement d’état : une lecture PARTIE AVANT ne remet pas une valeur plus ancienne', async () => {
    // Le geste « objectif = force » est posé ; l'envoi part ; un `chargerProfil` lancé APRÈS le geste lit la base AVANT que
    // le second envoi n'y écrive — et sa réponse arrive APRÈS l'adoption du second envoi : valeur périmée (objectif nul).
    let rendreLecture;
    const lectureTenue = new Promise((r) => { rendreLecture = r; });
    const b = bacEnvoi({ pris: ['deja_pris'], profil: { username: 'deja_pris' }, ligne: { objectif: null },
      lecture: async (ctx, etat) => { const vue = Object.assign({}, etat.ligne); await lectureTenue; return vue; } });
    const geste = b.poser({ objectif: 'force' });                     // version +1, l'envoi part
    const lecture = b.charger();                                      // capte la version, lit l'état d'AVANT l'écriture
    await geste;
    expect(b.etat.ligne.objectif).toBe('force');                      // le second envoi a écrit
    expect(b.ctx.profilAEnvoyer).toBe(false);
    rendreLecture();                                                  // la lecture, périmée, arrive maintenant
    await lecture;
    expect(b.ctx.profil.objectif).toBe('force');                      // elle n'a PAS remis l'ancienne valeur
    // Et le geste suivant, qui envoie la ligne entière, n'écrase donc rien en base.
    await b.poser({ temps_reponse: 'max' });
    expect(b.etat.ligne.objectif).toBe('force');
  });

  test('(revue) la version bouge à l’adoption — et seulement à l’adoption', async () => {
    const b = bacEnvoi({ profil: { username: 'libre_ici' } });
    expect(b.ctx.versionProfil).toBe(0);
    await b.envoyer();
    expect(b.ctx.versionProfil).toBe(1);
    const c = bacEnvoi({ reseau: false, profil: { username: 'libre_ici' } });
    await c.envoyer();                                                 // pas de réponse : rien n'est adopté
    expect(c.ctx.versionProfil).toBe(0);
  });

  test('⚠️ (revue) le pseudo refusé sort de la ligne LOCALE même quand la réponse n’est pas adoptée — l’envoi qui suit ne le porte plus', async () => {
    const b = bacEnvoi({ pris: ['deja_pris'], profil: Object.assign({ username: 'deja_pris' }, REPONSES),
      apresPost: (n, ctx) => { if (n === 2) { ctx.versionProfil++; ctx.profil = Object.assign({}, ctx.profil, { intention: 'entretenir' }); } } });
    await b.envoyer();
    expect(b.ctx.profil.username).toBe(null);                        // il ne reste pas « posé » à l'écran
    expect(b.ctx.profil.intention).toBe('entretenir');
    await b.envoyer();                                               // l'envoi du geste plus récent : UN seul, sans le pseudo refusé
    expect(b.etat.posts).toHaveLength(3);
    expect(b.etat.posts[2].username).toBe(null);
    expect(b.ctx.profilAEnvoyer).toBe(false);
    expect(b.etat.ligne.intention).toBe('entretenir');
  });

  test('(revue) un pseudo RETAPÉ pendant l’envoi n’est pas écrasé par la correction locale', async () => {
    const b = bacEnvoi({ pris: ['deja_pris'], profil: Object.assign({ username: 'deja_pris' }, REPONSES),
      apresPost: (n, ctx) => { if (n === 2) { ctx.versionProfil++; ctx.profil = Object.assign({}, ctx.profil, { username: 'autre_pseudo' }); } } });
    await b.envoyer();
    expect(b.ctx.profil.username).toBe('autre_pseudo');
    expect(b.ctx.profilAEnvoyer).toBe(true);
  });
});

// ═══ 3. LA FEUILLE : ELLE VÉRIFIE AVANT DE SE FERMER ═══════════════════════
function bacFeuille(o) {
  const opt = o || {};
  const etat = { ecrits: [], fermetures: 0, questions: [], vue: null, ouvertures: 0 };
  const ctx = {
    Promise, Date, Object, Array, Math, String, console,
    // Les minuteurs passent par `racine` (comme dans l'app) : les faux minuteurs de jest les voient.
    racine: { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (h) => clearTimeout(h) },
    DELAI_PSEUDO_MS,
    Profil, Modele: global.THModele,
    profil: opt.profil === undefined ? { id: 'u1', username: null } : opt.profil,
    sessionActive: { user: { email: opt.email === undefined ? 'melodie.dupont@exemple.fr' : opt.email } },
    Donnees: { pseudoPris: async (nom) => {
      etat.questions.push(nom);
      if (opt.differe) await opt.differe;
      if (opt.exception) throw new Error('réseau');
      return opt.pris === undefined ? null : opt.pris;
    } },
    Rendu: { rendreFeuilleSaisie: (cible, vue) => { etat.vue = vue; } },
    feuilleProfil: null,
    $: () => ({}),
    ouvrirVoile: (el, apres) => { etat.ouvertures++; etat.apres = apres; },
    fermerVoile: () => { etat.fermetures++; const a = etat.apres; etat.apres = null; if (a) a(); },
    ecrireProfil: (champs) => { etat.ecrits.push(champs); }
  };
  vm.createContext(ctx);
  vm.runInContext(SAISIES, ctx);
  vm.runInContext(extraire('ouvrirFeuilleProfil'), ctx);
  vm.runInContext(extraire('ouvrirSaisieProfil'), ctx);
  return { ctx, etat, ouvrir: (cle) => { vm.runInContext('ouvrirSaisieProfil("' + cle + '")', ctx); return etat.vue; } };
}

describe('la feuille « Pseudo » du Profil', () => {
  test('⚠️ DISCRIMINANT — un pseudo PRIS : le refus et ses deux alternatives, la feuille reste ouverte, RIEN n’est écrit', async () => {
    const b = bacFeuille({ pris: true });
    const vue = b.ouvrir('username');
    const verdict = vue.surValider('Mélodie');
    expect(verdict && typeof verdict.then).toBe('function');         // elle attend la base
    const refus = await verdict;
    expect(refus).toMatch(/^Déjà pris — essaie « [a-z0-9_]+ » ou « [a-z0-9_]+ »\.$/);
    expect(b.etat.questions).toEqual(['melodie']);                   // le pseudo normalisé
    expect(b.etat.ecrits).toEqual([]);                               // rien n'est écrit
    expect(b.etat.fermetures).toBe(0);                               // la feuille reste ouverte
    expect(b.ctx.feuilleProfil).not.toBe(null);
  });

  test('les alternatives viennent de l’e-mail du compte (ECRAN-PROFIL §5.3)', async () => {
    const b = bacFeuille({ pris: true, email: 'jordan.durand@exemple.fr' });
    const refus = await b.ouvrir('username').surValider('jo');
    // « jo » est trop court ? non : 3 caractères minimum → refus local, sans question.
    expect(refus).toBe(Profil.PSEUDO_MIN + ' caractères minimum.');
    const refus2 = await b.ouvrir('username').surValider('jor');
    expect(refus2).toContain('« jordan »');
  });

  test('un pseudo LIBRE : la feuille se ferme et le pseudo (normalisé) s’écrit', async () => {
    const b = bacFeuille({ pris: false });
    const refus = await b.ouvrir('username').surValider('Mélodie B');
    expect(refus).toBe(null);
    expect(b.etat.ecrits).toEqual([{ username: 'melodie_b' }]);
    expect(b.etat.fermetures).toBe(1);
  });

  test('« on ne sait pas » (hors ligne, la fonction absente) : la feuille se ferme et l’envoi part', async () => {
    const b = bacFeuille({ pris: null });
    expect(await b.ouvrir('username').surValider('melodie_b')).toBe(null);
    expect(b.etat.ecrits).toEqual([{ username: 'melodie_b' }]);
    expect(b.etat.fermetures).toBe(1);
  });

  test('la question qui échoue (une exception) vaut « on ne sait pas » : jamais de blocage', async () => {
    const b = bacFeuille({ exception: true });
    expect(await b.ouvrir('username').surValider('melodie_b')).toBe(null);
    expect(b.etat.ecrits).toEqual([{ username: 'melodie_b' }]);
  });

  test('son propre pseudo n’est pas redemandé (il serait « pris » par lui-même)', async () => {
    const b = bacFeuille({ profil: { id: 'u1', username: 'melodie_b' }, pris: true });
    expect(await b.ouvrir('username').surValider('Melodie_B')).toBe(null);
    expect(b.etat.questions).toEqual([]);
    expect(b.etat.ecrits).toEqual([{ username: 'melodie_b' }]);
  });

  test('un pseudo trop court ou mal formé est refusé AVANT la question, de façon synchrone', () => {
    const b = bacFeuille({ pris: true });
    expect(b.ouvrir('username').surValider('')).toBe('Un pseudo, même court.');
    expect(b.ouvrir('username').surValider('ab')).toBe(Profil.PSEUDO_MIN + ' caractères minimum.');
    expect(b.ouvrir('username').surValider('1abc')).toBe('Commence par une lettre.');
    expect(b.etat.questions).toEqual([]);
    expect(b.etat.ecrits).toEqual([]);
  });

  test('⚠️ « Annuler » pendant la vérification : rien n’est écrit, même si la réponse arrive « libre »', async () => {
    let liberer;
    const differe = new Promise((r) => { liberer = r; });
    const b = bacFeuille({ pris: false, differe });
    const verdict = b.ouvrir('username').surValider('melodie_b');
    await tic();
    b.ctx.fermerVoile();                                             // « Annuler » : la feuille se ferme
    liberer();
    expect(await verdict).toBe(null);
    expect(b.etat.ecrits).toEqual([]);
    expect(b.etat.fermetures).toBe(1);                               // la seule fermeture est celle d'« Annuler »
  });

  test('une autre feuille ouverte entre-temps n’est pas fermée par la réponse', async () => {
    let liberer;
    const differe = new Promise((r) => { liberer = r; });
    const b = bacFeuille({ pris: false, differe });
    const verdict = b.ouvrir('username').surValider('melodie_b');
    await tic();
    b.ouvrir('bio');                                                 // une autre feuille prend la place
    liberer();
    await verdict;
    expect(b.etat.ecrits).toEqual([]);
  });

  test('⚠️ (revue) une vérification qui PEND : au bout du délai, « on ne sait pas » — la feuille se ferme, le pseudo s’écrit', async () => {
    jest.useFakeTimers();
    try {
      const b = bacFeuille({ differe: new Promise(() => {}), pris: true });     // la question ne répond jamais
      const verdict = b.ouvrir('username').surValider('melodie_b');
      await Promise.resolve(); await Promise.resolve();
      expect(b.etat.ecrits).toEqual([]);                                         // elle attend
      jest.advanceTimersByTime(DELAI_PSEUDO_MS - 1);
      await Promise.resolve(); await Promise.resolve();
      expect(b.etat.ecrits).toEqual([]);                                         // pas avant le délai
      jest.advanceTimersByTime(1);
      expect(await verdict).toBe(null);
      expect(b.etat.ecrits).toEqual([{ username: 'melodie_b' }]);
      expect(b.etat.fermetures).toBe(1);
    } finally { jest.useRealTimers(); }
  });

  test('(revue) une réponse qui arrive à temps annule le minuteur : aucun minuteur ne reste en route', async () => {
    jest.useFakeTimers();
    try {
      const b = bacFeuille({ pris: true });
      await b.ouvrir('username').surValider('melodie_b');
      expect(jest.getTimerCount()).toBe(0);
    } finally { jest.useRealTimers(); }
  });

  test('non-régression — la taille, la bio : validation SYNCHRONE, écriture immédiate, aucune question à la base', () => {
    const b = bacFeuille({ pris: true });
    expect(b.ouvrir('taille_cm').surValider('182')).toBe(null);
    expect(b.etat.ecrits).toEqual([{ taille_cm: 182 }]);
    expect(b.ouvrir('bio').surValider(' salut ')).toBe(null);
    expect(b.etat.ecrits[1]).toEqual({ bio: 'salut' });
    expect(b.etat.questions).toEqual([]);
  });
});
