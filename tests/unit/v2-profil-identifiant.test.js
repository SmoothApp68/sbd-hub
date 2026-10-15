/** @jest-environment node */
//
// 60-2b — LE 403 À LA CRÉATION DU PROFIL : L'IDENTIFIANT VIENT DE LA SESSION DU CLIENT.
//
// LE CONSTAT (journaux de la base du 07/10/2026, compte Test0710) : un `POST
// /profiles` en 403 (« new row violates row-level security policy »), puis un 201
// 27 secondes plus tard, avec le MÊME jeton. `profiles_creation` exige
// `id = auth.uid()` : l'`id` envoyé n'était pas celui du compte connecté.
//
// LE MÉCANISME, lu dans le code :
//   · l'`id` du corps vient de `userId()`, la mémoire de l'app (`sessionActive`) ;
//     le jeton, lui, est relu dans le stockage par le SDK au moment du `fetch` ;
//   · `entrer(session)` rendait l'entrée EN COURS sans regarder la session reçue :
//     le lien de confirmation du compte B, absorbé par le SDK pendant l'entrée de
//     l'ancien compte A (la sonde synchrone avait lu A avant), était jeté ;
//   · `monProfil(A)` sous le jeton de B rend zéro ligne (RLS), que `chargerProfil`
//     lit comme « compte neuf » et crée avec l'id de A — refusé, et avalé en silence.
//
// Les fonctions d'`app.js` se REJOUENT dans un bac `vm` ; la base est un faux qui
// REFUSE une ligne dont l'`id` n'est pas le sujet du jeton, comme la vraie.

process.env.TZ = 'Europe/Paris';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
const Profil = require('../../v2/js/profil.js');
const Sync = require('../../v2/js/sync.js');
// 70 — la VRAIE phrase d'inscription (`Auth.phraseInscription`) : `auth.js` se pose sur le global, sans client.
global.THClient = { CLE_AUTH: 'th-v2-auth', obtenir: () => { throw new Error('pas de client ici'); } };
require('../../v2/js/auth.js');
const phraseInscription = global.THAuth.phraseInscription;

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const extraire = (nom) => {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable : ' + nom);
  return m[0];
};
const session = (id, jeton, metadonnees) => ({
  user: Object.assign({ id }, metadonnees === undefined ? {} : { user_metadata: metadonnees }),
  access_token: jeton || 'j-' + id });
// 60-3b — le stockage local d'un bac : de vraies lectures et écritures, relevées.
const stockageFactice = () => {
  const cles = {};
  return { cles, getItem: (k) => (k in cles ? cles[k] : null), setItem: (k, v) => { cles[k] = String(v); },
           removeItem: (k) => { delete cles[k]; } };
};
const CLE_PSEUDO_PRIS = /var CLE_PSEUDO_PRIS = '([^']+)'/.exec(APP)[1];
const tic = () => new Promise((r) => setImmediate(r));

// ── 1. `entrer` : la session d'un autre compte n'est plus jetée ─────────────
describe('`entrer` : une entrée en vol n’absorbe que la session de SON compte', () => {
  function bac() {
    const journal = { profils: [], syncs: [] };
    let liberer = null;
    const ctx = {
      console: { warn: () => {} },
      racine: { location: { pathname: '/' } },
      Cache: { lireTout: () => Promise.resolve([]), lireBrouillon: () => Promise.resolve(null),
               lireAttente: () => Promise.resolve([]), lireMeta: () => Promise.resolve(null) },
      local: {}, seance: null, attente: [], consignesSauvees: null, brouillonLocal: null,
      sessionActive: null, profil: null, etat: null, verificationSeance: null,
      entreeEnCours: null, entreeFaitePour: null, entreeEnCoursPour: null, departs: 0,
      // 70 — le lien de récupération : aucun ici (sa règle a ses tests et son banc, [E70]).
      renduPour: null, ouvrirRecuperationSiDue: () => {},
      // Le stockage porte la session reçue en dernier (l'évènement du SDK l'a écrite avant de nous l'envoyer).
      persistee: null, Auth: { sessionPersistee: () => ctx.persistee },
      CLE_CONSIGNES: 'consignes', CLE_BROUILLON: 'brouillon-routine',
      vues: { detail: {}, routine: {}, seance: {}, questionnaire: {} },
      Seance: { verifierColonnes: () => {} },
      Routeur: { analyser: () => ({ vue: 'liste', params: {} }), interditAvecSession: () => false, estVueDuJeu: () => false, RACINE: 'liste', PROFIL: 'profil' },
      ouvrirQuestionnaireSiDu: () => false, fermerQuestionnaire: () => {}, envoiProfil: null,
      Sync: { deciderEtat: () => ({}) }, Rendu: { message: () => {} }, sortie: { apresNavigation: () => {} },
      $: () => ({}), texteErreur: String,
      garantirProprietaire: () => Promise.resolve(),
      rangerSeances: () => {}, indexerParSeance: () => {}, recalculerEtats: () => {},
      lireModeRPE: () => {}, lireSourdine: () => {},
      reparerIdentifiantsManquants: () => Promise.resolve(), reparerFileHorsBornes: () => Promise.resolve(),
      reparerFileConflitsEnCours: () => Promise.resolve(), chargerProfilLocal: () => Promise.resolve(),
      // Le profil se charge avec l'identifiant de la MÉMOIRE de l'app à cet instant.
      chargerProfil: () => { journal.profils.push(ctx.sessionActive && ctx.sessionActive.user.id); return Promise.resolve(); },
      resoudreSeanceEnCoursDistante: () => Promise.resolve(),
      allerA: () => {}, montrer: () => {}, rendreRoute: () => {}, rendreEtatSync: () => {},
      // La synchronisation de la PREMIÈRE entrée attend : c'est « l'entrée en vol ».
      synchroniser: () => { journal.syncs.push(ctx.sessionActive && ctx.sessionActive.user.id);
        return journal.syncs.length === 1 ? new Promise((r) => { liberer = r; }) : Promise.resolve(); },
      vidanger: () => {}, rejeuDemande: null, ouvrirRejeu: () => {}
    };
    vm.createContext(ctx);
    ['idDeSession', 'entrer', 'reentrer', 'entrerVraiment', 'chargerCache', 'chargerSeanceLocale', 'chargerBrouillonLocal']
      .forEach((n) => vm.runInContext(extraire(n), ctx));
    return { ctx, journal,
      // La synchronisation en vol se libère quand elle a commencé (l'entrée enchaîne plusieurs `await`).
      liberer: async () => { for (let i = 0; i < 50 && !liberer; i++) await tic(); if (liberer) liberer(); },
      entrer: (s) => { ctx.__s = s; ctx.persistee = s; return vm.runInContext('entrer(__s)', ctx); } };
  }

  test('⚠️ DISCRIMINANT — la session du compte B reçue PENDANT l’entrée de A entre à son tour : la mémoire finit sur B', async () => {
    const b = bac();
    const pA = b.entrer(session('A'));
    await tic();
    expect(b.ctx.sessionActive.user.id).toBe('A');          // l'entrée de A est en vol
    const pB = b.entrer(session('B'));
    expect(pB).not.toBe(pA);                                // ce n'est PAS l'entrée de A rendue telle quelle
    await b.liberer();
    await pB;
    expect(b.ctx.sessionActive.user.id).toBe('B');
    expect(b.ctx.entreeFaitePour).toBe('B');
    // Le profil de B est chargé sous B (le dernier chargement est celui de B).
    expect(b.journal.profils[b.journal.profils.length - 1]).toBe('B');
  });

  test('l’entrée de A va jusqu’au bout avant celle de B (jamais deux entrées de comptes différents en même temps)', async () => {
    const b = bac();
    const pA = b.entrer(session('A'));
    await tic();
    const pB = b.entrer(session('B'));
    await tic();
    expect(b.ctx.sessionActive.user.id).toBe('A');          // B attend tant que A n'a pas fini
    await b.liberer();
    await pA;
    await pB;
    expect(b.journal.syncs).toEqual(['A', 'B']);
  });

  test('un évènement du MÊME compte pendant son entrée : la même promesse, et l’objet de session est remplacé (le jeton neuf)', async () => {
    const b = bac();
    const pA = b.entrer(session('A', 'vieux'));
    await tic();
    const p2 = b.entrer(session('A', 'neuf'));
    expect(p2).toBe(pA);
    expect(b.ctx.sessionActive.access_token).toBe('neuf');
    await b.liberer();
    await pA;
  });

  test('l’entrée en vol qui ÉCHOUE ne bloque pas la session suivante', async () => {
    const b = bac();
    // `chargerCache` est dans un try/catch de `entrerVraiment` : seule la lecture de la séance
    // locale fait vraiment rejeter l'entrée. Elle échoue pour A, pas pour B.
    let n = 0;
    b.ctx.chargerSeanceLocale = () => (++n === 1 ? Promise.reject(new Error('disque')) : Promise.resolve());
    const pA = b.entrer(session('A'));
    await tic();
    const pB = b.entrer(session('B'));
    await expect(pA).rejects.toThrow('disque');
    await b.liberer();
    await pB;
    expect(b.ctx.sessionActive.user.id).toBe('B');
    expect(b.ctx.entreeFaitePour).toBe('B');
    expect(b.ctx.entreeEnCours).toBeNull();
  });

  test('⚠️ DISCRIMINANT — « Quitter » entre la mise en file et le tour de B : B n’entre pas, la mémoire ne revient pas sur un compte parti', async () => {
    const b = bac();
    const pA = b.entrer(session('A'));
    await tic();
    const pB = b.entrer(session('B'));
    b.ctx.departs += 1;                                      // « Quitter » (deconnecter) pendant l'attente
    b.ctx.sessionActive = null;
    await b.liberer();
    await pA;
    await pB;
    expect(b.ctx.sessionActive).toBeNull();
    expect(b.journal.syncs).toEqual(['A']);                  // B n'a jamais synchronisé
    expect(b.ctx.entreeFaitePour).toBe('A');                 // et n'a rien posé comme fait
  });

  test('⚠️ DISCRIMINANT — le stockage ne porte plus B à son tour (un autre compte a pris sa place) : B n’entre pas', async () => {
    const b = bac();
    const pA = b.entrer(session('A'));
    await tic();
    const pB = b.entrer(session('B'));
    b.ctx.persistee = session('C');
    await b.liberer();
    await pA;
    await pB;
    expect(b.journal.syncs).toEqual(['A']);
    expect(b.ctx.sessionActive.user.id).toBe('A');
  });

  test('sans entrée en vol, le comportement est celui d’avant : deux entrées simultanées du même compte partagent la promesse', async () => {
    const b = bac();
    const p1 = b.entrer(session('u1'));
    const p2 = b.entrer(session('u1'));
    expect(p2).toBe(p1);
    await b.liberer();
    await p1;
    expect(b.ctx.entreeEnCours).toBeNull();
  });
});

// ── 2. L'identifiant d'une écriture de profil ───────────────────────────────
describe('l’identifiant d’une écriture de profil est celui de la session du CLIENT', () => {
  // Un faux qui se comporte comme la base : `monProfil(id)` ne rend la ligne que si
  // `id` est le sujet du jeton ; `enregistrerProfil(id)` refuse (42501) un `id` autre.
  function bac(o) {
    const opt = o || {};
    const base = { lignes: {}, refus: [], posts: [], gets: [] };
    const etat = { client: opt.client === undefined ? 'B' : opt.client, memoire: opt.memoire === undefined ? 'B' : opt.memoire, entrees: [] };
    const ctx = {
      console: { warn: (...a) => { ctx.avertissements.push(a.join(' ')); } },
      avertissements: [],
      generation: 1, generationValide: (g) => g === ctx.generation,
      userId: () => etat.memoire,
      Auth: { sessionCourante: () => (etat.client ? Promise.resolve(session(etat.client, undefined, opt.metadonnees)) : Promise.resolve(null)) },
      racine: { localStorage: stockageFactice() }, CLE_PSEUDO_PRIS,
      entrer: (s) => { etat.entrees.push(s.user.id); },
      Donnees: {
        monProfil: (id) => { base.gets.push(id); return Promise.resolve(id === etat.client ? (base.lignes[id] || null) : null); },
        enregistrerProfil: (id, champs) => {
          base.posts.push(id);
          if (opt.echecs && opt.echecs > 0) { opt.echecs -= 1; return Promise.reject(new Error('réseau')); }
          if (id !== etat.client) {
            const e = new Error('new row violates row-level security policy for table "profiles"'); e.code = '42501';
            base.refus.push(id);
            return Promise.reject(e);
          }
          base.lignes[id] = Object.assign({}, base.lignes[id] || { id, questionnaire_fait_le: null }, champs, { id });
          return Promise.resolve(base.lignes[id]);
        }
      },
      Profil, profil: opt.profil === undefined ? null : opt.profil, profilAEnvoyer: !!opt.aEnvoyer, pseudoAInscrire: opt.pseudo || null,
      versionProfil: 0, ligneACreer: false, envoiProfil: null, ecranCourant: 'saisie',
      rendreBandeauQuestionnaire: () => {}, rendreBandeauPhase: () => {}, rendreCarteCycles: () => {}, jeuSuitLeProfil: () => {}, parcoursSuitLeProfil: () => {}, ouvrirQuestionnaireSiDu: () => false,
      sauverProfilLocal: () => Promise.resolve(), rendreProfilEcran: () => {},
      envoyerProfil: () => vm.runInContext('envoyerProfil()', ctx), texteErreur: (e) => String(e && e.message || e)
    };
    vm.createContext(ctx);
    ['idDeSession', 'identifiantDuProfil', 'metadonneesDuCompte', 'retenirPseudoPris', 'chargerProfil', 'envoyerProfil',
      'envoyerProfilMaintenant', 'poserProfil']
      .forEach((n) => vm.runInContext(extraire(n), ctx));
    // `chargerProfil` appelle `envoyerProfil` du bac (la vraie) — on la laisse faire.
    delete ctx.envoyerProfil;
    vm.runInContext(extraire('envoyerProfil'), ctx);
    return { ctx, base, etat, charger: () => vm.runInContext('chargerProfil()', ctx),
      envoyer: () => vm.runInContext('envoyerProfilMaintenant()', ctx),
      poser: (c) => { ctx.__c = c; return vm.runInContext('poserProfil(__c)', ctx); } };
  }

  test('témoin — l’app et le client sont sur le même compte : la ligne se crée du premier coup', async () => {
    const b = bac({ client: 'B', memoire: 'B', pseudo: 'test_0710' });
    await b.charger();
    expect(b.base.refus).toEqual([]);
    expect(b.base.posts).toEqual(['B']);
    expect(b.base.lignes.B.username).toBe('test_0710');
    expect(b.ctx.pseudoAInscrire).toBeNull();
  });

  test('⚠️ DISCRIMINANT — l’app est restée sur A pendant que le client porte B : AUCUNE écriture sous l’id de A, la session de B entre', async () => {
    const b = bac({ client: 'B', memoire: 'A', pseudo: 'test_0710' });
    await b.charger();
    expect(b.base.posts).toEqual([]);                        // pas de création sous A (ni sous B : l'app n'est pas B)
    expect(b.base.gets).toEqual([]);
    expect(b.base.refus).toEqual([]);
    expect(b.etat.entrees).toEqual(['B']);                   // le client entre sur SON compte
    expect(b.ctx.pseudoAInscrire).toBe('test_0710');         // le pseudo attend l'entrée de B
  });

  test('⚠️ DISCRIMINANT — `envoyerProfilMaintenant` : la ligne de A n’est jamais envoyée sous l’id de B (ni l’inverse)', async () => {
    const b = bac({ client: 'B', memoire: 'A', profil: { id: 'A', objectif: 'muscle' }, aEnvoyer: true });
    await b.envoyer();
    expect(b.base.posts).toEqual([]);
    expect(b.ctx.profilAEnvoyer).toBe(true);                 // elle attend, rien n'est perdu
    expect(b.etat.entrees).toEqual(['B']);
  });

  test('l’envoi d’une ligne de profil se fait sous l’id de la session du client quand tout concorde', async () => {
    const b = bac({ client: 'B', memoire: 'B', profil: { id: 'B', objectif: null } });
    await b.poser({ objectif: 'force' });
    expect(b.base.posts).toEqual(['B']);
    expect(b.base.refus).toEqual([]);
    expect(b.ctx.profilAEnvoyer).toBe(false);
  });

  test('sans session lisible côté client (hors ligne avec un jeton à renouveler, stockage fermé) : on n’écrit pas un id deviné', async () => {
    const b = bac({ client: null, memoire: 'B', pseudo: 'x' });
    await b.charger();
    expect(b.base.posts).toEqual([]);
    expect(b.etat.entrees).toEqual([]);
    const c = bac({ client: null, memoire: 'B', profil: { id: 'B' }, aEnvoyer: true });
    await c.envoyer();
    expect(c.base.posts).toEqual([]);
    expect(c.ctx.profilAEnvoyer).toBe(true);
  });

  test('une lecture de session qui échoue vaut « pas de session » : rien n’est écrit, aucune erreur', async () => {
    const b = bac({ client: 'B', memoire: 'B', pseudo: 'x' });
    b.ctx.Auth.sessionCourante = () => Promise.reject(new Error('verrou'));
    await b.charger();
    expect(b.base.posts).toEqual([]);
  });

  test('la déconnexion pendant l’attente de la session : plus rien ne part', async () => {
    const b = bac({ client: 'B', memoire: 'B', pseudo: 'x' });
    const p = b.charger();
    b.ctx.generation += 1;                                   // « Quitter » pendant l'attente
    await p;
    expect(b.base.posts).toEqual([]);
    expect(b.base.gets).toEqual([]);
  });

  test('⚠️ DISCRIMINANT — « Quitter » pendant la lecture de la session : aucune ré-entrée dans le compte quitté', async () => {
    // Le jeton est encore là quand la lecture aboutit (`signOut` n'a pas fini) : sans la garde, la
    // session de A, lue après le départ, ENTRERAIT de nouveau (`id` ≠ `userId()` qui est `null`).
    const b = bac({ client: 'A', memoire: 'A' });
    b.ctx.Auth.sessionCourante = () => { b.ctx.generation += 1; b.etat.memoire = null; return Promise.resolve(session('A')); };
    const id = await vm.runInContext('identifiantDuProfil()', b.ctx);
    expect(id).toBeNull();
    expect(b.etat.entrees).toEqual([]);
    // Sans départ, la même situation (l'app est sur A, le client porte B) entre bien sur B.
    const c = bac({ client: 'B', memoire: 'A' });
    expect(await vm.runInContext('identifiantDuProfil()', c.ctx)).toBeNull();
    expect(c.etat.entrees).toEqual(['B']);
  });

  // ── La création qui échoue ne se perd plus en silence ──────────────────────
  test('⚠️ DISCRIMINANT — une création qui échoue se DIT, garde le pseudo, et se REJOUE au prochain chargement du profil', async () => {
    const b = bac({ client: 'B', memoire: 'B', pseudo: 'test_0710', echecs: 1 });
    await b.charger();
    expect(b.base.lignes.B).toBeUndefined();                 // rien de créé
    expect(b.ctx.avertissements.length).toBe(1);
    expect(b.ctx.avertissements[0]).toMatch(/Profil non créé/);
    expect(b.ctx.pseudoAInscrire).toBe('test_0710');         // le pseudo attend la suite
    // Le prochain chargement (une entrée, « Rafraîchir »…) retente — et réussit.
    await b.charger();
    expect(b.base.posts).toEqual(['B', 'B']);
    expect(b.base.lignes.B.username).toBe('test_0710');
    expect(b.ctx.pseudoAInscrire).toBeNull();
    expect(b.ctx.avertissements.length).toBe(1);             // plus de bruit une fois créée
  });

  test('une création refusée par la base (42501) se dit aussi, et ne casse rien', async () => {
    const b = bac({ client: 'B', memoire: 'B', pseudo: 'x' });
    b.ctx.Donnees.enregistrerProfil = () => { const e = new Error('violates row-level security'); e.code = '42501'; return Promise.reject(e); };
    await expect(b.charger()).resolves.toBeUndefined();
    expect(b.ctx.avertissements.join(' ')).toMatch(/violates row-level security/);
  });

  test('la déconnexion pendant la création qui échoue : rien n’est dit (le compte est parti)', async () => {
    const b = bac({ client: 'B', memoire: 'B', pseudo: 'x' });
    b.ctx.Donnees.enregistrerProfil = () => { b.ctx.generation += 1; return Promise.reject(new Error('réseau')); };
    await b.charger();
    expect(b.ctx.avertissements).toEqual([]);
  });

  // ── Un seul endroit donne l'identifiant ───────────────────────────────────
  test('GARDE — la lecture, la création et l’envoi du profil passent TOUS par `identifiantDuProfil` (et plus par `userId()`)', () => {
    ['chargerProfil', 'envoyerProfilMaintenant'].forEach((f) => {
      const corps = extraire(f);
      expect(corps).toMatch(/await identifiantDuProfil\(\)/);
      expect(corps).not.toMatch(/var id = userId\(\)/);
    });
  });

  test('GARDE — `Donnees.enregistrerProfil` et `Donnees.monProfil` ne sont appelées qu’avec cet identifiant', () => {
    const tout = APP.match(/Donnees\.(enregistrerProfil|monProfil)\(([^,)]+)/g) || [];
    expect(tout.length).toBeGreaterThanOrEqual(3);
    tout.forEach((appel) => expect(appel).toMatch(/\(id\b/));
    expect(APP).not.toMatch(/Donnees\.(enregistrerProfil|monProfil)\(\s*userId\(\)/);
  });
});

// ── 3. Le pseudo saisi à l'inscription traverse l'entrée du compte (60-2c) ───
//
// LE DÉFAUT (relevé par 60-2b) : « Quitter », puis une inscription dans la même page → la ligne de
// profil naissait SANS pseudo. Où il se perdait : `garantirProprietaire` — appelée par l'entrée du
// compte, entre la pose du pseudo par `soumettreEntree` et sa lecture par `chargerProfil` — remettait
// `pseudoAInscrire` à zéro dans sa branche « le cache n'appartient pas au compte qui entre ». Or un
// compte NEUF n'est jamais propriétaire du cache (appareil vierge, après « Quitter », après un autre
// compte) : cette branche s'exécutait à CHAQUE inscription à session immédiate, pas seulement après
// « Quitter ». Aucun test ne jouait la chaîne entière : `chargerProfil` seule posait un pseudo à la main.
describe('le pseudo saisi à l’inscription traverse l’entrée du compte jusqu’à la ligne de profil', () => {
  function bac(o) {
    const opt = o || {};
    const base = { lignes: {}, refus: [], posts: [], gets: [] };
    const journal = { vide: 0, meta: [], generations: 0 };
    const etat = { client: 'B', memoire: 'B' };
    const ctx = {
      console: { warn: (...a) => { ctx.avertissements.push(a.join(' ')); } },
      avertissements: [],
      generation: 1, generationValide: (g) => g === ctx.generation,
      nouvelleGeneration: () => { ctx.generation++; journal.generations++; },
      userId: () => etat.memoire,
      Auth: { sessionCourante: () => Promise.resolve(session(etat.client, undefined, opt.metadonnees)) },
      racine: { localStorage: stockageFactice() }, CLE_PSEUDO_PRIS,
      entrer: () => {},
      Sync,
      Cache: {
        lireMeta: () => Promise.resolve(opt.meta === undefined ? null : opt.meta),
        viderTout: () => { journal.vide++; return Promise.resolve(); },
        ecrireMeta: (cle, v) => { journal.meta.push([cle, v]); return Promise.resolve(); }
      },
      routines: ['x'], brouillon: {}, etatRoutines: {}, seance: {}, attente: [1], chrono: {},
      local: {}, journalDecide: true, remplissage: {},
      fermerQuestionnaire: () => {}, faits: { oublierDates: () => {} },
      Donnees: {
        monProfil: (id) => Promise.resolve(id === etat.client ? (base.lignes[id] || null) : null),
        enregistrerProfil: (id, champs) => {
          base.posts.push([id, champs]);
          if (opt.echecs && opt.echecs > 0) { opt.echecs -= 1; return Promise.reject(new Error('réseau')); }
          if (id !== etat.client) { base.refus.push(id); return Promise.reject(new Error('42501')); }
          base.lignes[id] = Object.assign({ id }, champs);
          return Promise.resolve(base.lignes[id]);
        }
      },
      Profil, profil: opt.profil === undefined ? null : opt.profil, profilAEnvoyer: false,
      pseudoAInscrire: opt.pseudo === undefined ? 'test_0710' : opt.pseudo,
      versionProfil: 0, ligneACreer: false, envoiProfil: null, ecranCourant: 'saisie',
      rendreBandeauQuestionnaire: () => {}, rendreBandeauPhase: () => {}, rendreCarteCycles: () => {}, jeuSuitLeProfil: () => {}, parcoursSuitLeProfil: () => {}, ouvrirQuestionnaireSiDu: () => false,
      sauverProfilLocal: () => Promise.resolve(), rendreProfilEcran: () => {},
      texteErreur: (e) => String(e && e.message || e)
    };
    vm.createContext(ctx);
    ['idDeSession', 'garantirProprietaire', 'identifiantDuProfil', 'metadonneesDuCompte', 'retenirPseudoPris', 'chargerProfil',
      'envoyerProfil', 'envoyerProfilMaintenant']
      .forEach((n) => vm.runInContext(extraire(n), ctx));
    return { ctx, base, journal, etat, stockage: ctx.racine.localStorage.cles,
      metadonnees: (id) => { ctx.__i = id; return vm.runInContext('metadonneesDuCompte(__i)', ctx); },
      garantir: (id) => { ctx.__i = id; return vm.runInContext('garantirProprietaire(__i)', ctx); },
      charger: () => vm.runInContext('chargerProfil()', ctx) };
  }

  test('⚠️ DISCRIMINANT — appareil vierge ou après « Quitter » (le cache n’a plus de propriétaire) : le pseudo SURVIT à l’entrée, le reste est remis à zéro', async () => {
    const b = bac({ meta: null, profil: { id: 'A', objectif: 'force' } });
    b.ctx.profilAEnvoyer = true;
    await b.garantir('B');
    expect(b.ctx.pseudoAInscrire).toBe('test_0710');
    // Tout ce qui appartenait au compte précédent est parti, comme avant.
    expect([b.ctx.profil, b.ctx.profilAEnvoyer, b.ctx.attente, b.ctx.routines]).toEqual([null, false, [], []]);
    expect(b.journal.vide).toBe(1);
    expect(b.journal.meta).toEqual([['proprietaire', { userId: 'B' }]]);
  });

  test('⚠️ DISCRIMINANT — le cache est celui d’un AUTRE compte (A, sans « Quitter ») : le pseudo de l’inscription de B survit aussi', async () => {
    const b = bac({ meta: { userId: 'A' }, profil: { id: 'A' } });
    await b.garantir('B');
    expect(b.ctx.pseudoAInscrire).toBe('test_0710');
    expect([b.journal.vide, b.ctx.profil]).toEqual([1, null]);
  });

  test('le cache est déjà celui du compte qui entre : rien n’est touché, le pseudo non plus', async () => {
    const b = bac({ meta: { userId: 'B' }, profil: { id: 'B' } });
    await b.garantir('B');
    expect(b.ctx.pseudoAInscrire).toBe('test_0710');
    expect([b.journal.vide, b.journal.meta, b.ctx.profil]).toEqual([0, [], { id: 'B' }]);
  });

  test('⚠️ DISCRIMINANT — LA CHAÎNE : l’entrée de B (cache vidé) puis le chargement du profil créent la ligne AVEC le pseudo tapé', async () => {
    const b = bac({ meta: null });
    await b.garantir('B');
    await b.charger();
    expect(b.base.refus).toEqual([]);
    expect(b.base.posts).toHaveLength(1);                        // du premier coup, une seule écriture
    expect(b.base.lignes.B.username).toBe('test_0710');
    expect(b.ctx.pseudoAInscrire).toBeNull();                    // posé : plus rien en attente
  });

  test('la chaîne après un autre compte : la ligne de B porte son pseudo, pas celui de personne', async () => {
    const b = bac({ meta: { userId: 'A' }, profil: { id: 'A', username: 'compte_a' }, pseudo: 'bob_21' });
    await b.garantir('B');
    await b.charger();
    expect(b.base.lignes.B.username).toBe('bob_21');
  });

  test('sans pseudo tapé (connexion, lien de confirmation) : la ligne naît sans pseudo, comme avant', async () => {
    const b = bac({ meta: null, pseudo: null });
    await b.garantir('B');
    await b.charger();
    expect(b.base.lignes.B.username == null).toBe(true);
  });

  // ── Un pseudo pris entre-temps (relecture adverse de 60-2c) ───────────────
  test('⚠️ DISCRIMINANT — le pseudo heurte l’unicité (23505) : la ligne se crée QUAND MÊME, sans pseudo, du même chargement', async () => {
    const b = bac({ meta: null, pseudo: 'deja_pris' });
    const posts = b.base.posts;
    b.ctx.Donnees.enregistrerProfil = (id, champs) => {
      posts.push([id, champs]);
      if (champs.username === 'deja_pris') {
        const e = new Error('duplicate key value violates unique constraint "profiles_username_uniq"'); e.code = '23505';
        return Promise.reject(e);
      }
      b.base.lignes[id] = Object.assign({ id }, champs);
      return Promise.resolve(b.base.lignes[id]);
    };
    await b.garantir('B');
    await b.charger();
    expect(posts.map((p) => p[1].username || null)).toEqual(['deja_pris', null]);   // une tentative avec, une sans
    expect(b.base.lignes.B).toBeDefined();                                           // la ligne existe
    expect(b.base.lignes.B.username == null).toBe(true);
    expect(b.ctx.pseudoAInscrire).toBeNull();                                        // plus rien en attente
    expect(b.ctx.avertissements.join(' ')).toMatch(/Pseudo déjà pris/);               // dit, dans le journal
    expect(b.ctx.avertissements.join(' ')).not.toMatch(/Profil non créé/);            // mais la ligne, elle, est créée
  });

  test('une AUTRE erreur de création garde le pseudo et se rejoue, comme avant (pas de repli sans pseudo)', async () => {
    const b = bac({ meta: null, pseudo: 'bob_21', echecs: 1 });
    await b.garantir('B');
    await b.charger();
    expect(b.ctx.pseudoAInscrire).toBe('bob_21');
    expect(b.base.lignes.B).toBeUndefined();
    await b.charger();
    expect(b.base.lignes.B.username).toBe('bob_21');
  });

  test('une collision SANS pseudo en attente n’est pas rattrapée (rien à retirer) : elle se dit', async () => {
    const b = bac({ meta: null, pseudo: null });
    b.ctx.Donnees.enregistrerProfil = () => { const e = new Error('unique'); e.code = '23505'; return Promise.reject(e); };
    await b.garantir('B');
    await b.charger();
    expect(b.ctx.avertissements.join(' ')).toMatch(/Profil non créé/);
  });

  // ── Ce qui reste remis à zéro, et par qui ─────────────────────────────────
  test('GARDE — `garantirProprietaire` n’écrit plus le pseudo ; « Quitter » (`deconnecter`) le remet toujours à zéro', () => {
    expect(extraire('garantirProprietaire')).not.toMatch(/pseudoAInscrire\s*=/);
    expect(extraire('deconnecter')).toMatch(/pseudoAInscrire = null/);
    // L'échec d'une inscription, et la lecture qui le pose dans la ligne, le remettent aussi à zéro.
    expect(extraire('soumettreEntree')).toMatch(/catch \(err\) \{\s*pseudoAInscrire = null;/);
    expect(extraire('chargerProfil')).toMatch(/pseudoAInscrire = null;/);
  });
});

describe('`soumettreEntree` : le pseudo est posé AVANT l’inscription, et une CONNEXION n’en garde aucun', () => {
  function bac(mode, pseudoRestant, options) {
    const appels = [];
    const opt = options || {};
    const noeuds = {};
    const ctx = {
      modeEntree: mode,
      pseudoAInscrire: pseudoRestant === undefined ? null : pseudoRestant,
      racine: { location: { origin: 'https://exemple.test' } },
      $: (id) => noeuds[id] || (noeuds[id] = { textContent: '', className: '', disabled: false,
        value: id === 'champ-email' ? 'b@banc.test' : 'motdepasse123' }),
      // 70 — sans session, la phrase de §5.6 et « Mot de passe oublié ? » dessous (`oubliSous`).
      champsEntree: () => ({}),
      Rendu: { rendreEntree: (c) => { ctx.__entree = c; } },
      etatEntree: () => ({ pseudo: 'Test 0710', email: 'b@banc.test', mdp: 'motdepasse123' }),
      majBoutonEntree: () => {},
      texteErreur: (e) => String(e && e.message || e),
      Profil,
      Auth: {
        // Ce que `pseudoAInscrire` valait AU MOMENT de l'appel : c'est l'ordre qui compte.
        inscrire: async (email, mdp, retour, pseudo) => {
          appels.push(['inscrire', ctx.pseudoAInscrire]);
          ctx.__args = [email, mdp, retour, pseudo];
          return opt.sansSession ? { session: null, user: { id: 'B' } } : { session: { user: { id: 'B' } } };
        },
        phraseInscription,
        connecter: async () => { appels.push(['connecter', ctx.pseudoAInscrire]); }
      }
    };
    vm.createContext(ctx);
    vm.runInContext(extraire('soumettreEntree'), ctx);
    return { ctx, appels, noeuds, soumettre: () => vm.runInContext('soumettreEntree({ preventDefault: function () {} })', ctx) };
  }

  test('⚠️ DISCRIMINANT — l’inscription : le pseudo normalisé est posé AVANT `signUp` (l’évènement d’auth peut partir avant sa réponse)', async () => {
    const b = bac('inscription');
    await b.soumettre();
    expect(b.appels).toEqual([['inscrire', 'test_0710']]);
    expect(b.ctx.pseudoAInscrire).toBe('test_0710');             // en attente de la création de la ligne
  });

  test('⚠️ DISCRIMINANT — une CONNEXION n’emporte aucun pseudo resté en mémoire (celui d’une création échouée, d’un autre compte)', async () => {
    const b = bac('connexion', 'reste_de_a');
    await b.soumettre();
    expect(b.appels).toEqual([['connecter', null]]);
    expect(b.ctx.pseudoAInscrire).toBeNull();
  });

  test('l’échec de l’inscription remet le pseudo à zéro, comme avant', async () => {
    const b = bac('inscription');
    b.ctx.Auth.inscrire = async () => { throw new Error('refusé'); };
    await b.soumettre();
    expect(b.ctx.pseudoAInscrire).toBeNull();
  });

  // 60-3b — le pseudo PART AVEC LE COMPTE (`options.data.pseudo` de `signUp`, par `Auth.inscrire`).
  test('⚠️ 60-3b DISCRIMINANT — l’inscription donne à `Auth.inscrire` le pseudo NORMALISÉ (« Test 0710 » → « test_0710 »), avec l’adresse de retour', async () => {
    const b = bac('inscription');
    await b.soumettre();
    expect(b.ctx.__args).toEqual(['b@banc.test', 'motdepasse123', 'https://exemple.test/', 'test_0710']);
  });

  test('60-3b — confirmation d’e-mail requise (pas de session) : le message le dit, le pseudo reste en mémoire de CETTE page', async () => {
    const b = bac('inscription', undefined, { sansSession: true });
    await b.soumettre();
    expect(b.ctx.__args[3]).toBe('test_0710');
    expect(b.ctx.pseudoAInscrire).toBe('test_0710');             // l'autre page, elle, le reprendra des données du compte
    // 70 — la phrase de §5.6, en gris, et « Mot de passe oublié ? » juste dessous.
    expect(b.noeuds['erreur-connexion'].textContent).toBe(phraseInscription({ session: null }));
    expect(b.noeuds['erreur-connexion'].className).toBe('erreur ok');
    expect(b.ctx.__entree).toEqual({ mode: 'inscription', oubliSous: true });
  });

  test('60-3b — une CONNEXION n’inscrit personne : aucun pseudo ne part', async () => {
    const b = bac('connexion', 'reste_de_a');
    await b.soumettre();
    expect(b.ctx.__args).toBeUndefined();
  });
});

// ── 4. 60-3b — le pseudo traverse la confirmation d'e-mail ──────────────────
//
// La confirmation d'e-mail est activée sur le projet : le lien s'ouvre souvent dans une AUTRE page, où
// `pseudoAInscrire` n'existe plus. L'inscription a déposé le pseudo dans les données du compte
// (`user_metadata.pseudo`) ; la création de la ligne de profil le reprend de là. Un seul endroit choisit
// (`Profil.pseudoDeLInscription`) : la page d'abord, puis le compte. « Pris entre-temps » : la ligne se crée
// sans lui, et l'état est retenu en local, par compte, pour la ligne « Pseudo » du Profil.
describe('60-3b — le pseudo des données du compte, repris à la création de la ligne', () => {
  function bac(o) {
    const opt = o || {};
    const base = { lignes: {}, posts: [] };
    const etat = { client: 'B', memoire: 'B' };
    const ctx = {
      console: { warn: (...a) => { ctx.avertissements.push(a.join(' ')); } },
      avertissements: [],
      generation: 1, generationValide: (g) => g === ctx.generation,
      userId: () => etat.memoire,
      Auth: { sessionCourante: () => Promise.resolve(session(etat.client, undefined, opt.metadonnees)) },
      racine: { localStorage: stockageFactice() }, CLE_PSEUDO_PRIS,
      entrer: () => {},
      Donnees: {
        monProfil: (id) => Promise.resolve(id === etat.client ? (base.lignes[id] || null) : null),
        enregistrerProfil: (id, champs) => {
          base.posts.push([id, champs]);
          if (opt.echecs && opt.echecs > 0) { opt.echecs -= 1; return Promise.reject(new Error('réseau')); }
          if (champs.username && (opt.pris || []).indexOf(champs.username) >= 0) {
            const e = new Error('duplicate key value violates unique constraint "profiles_username_uniq"'); e.code = '23505';
            return Promise.reject(e);
          }
          base.lignes[id] = Object.assign({ id }, champs);
          return Promise.resolve(base.lignes[id]);
        }
      },
      Profil, profil: null, profilAEnvoyer: false,
      pseudoAInscrire: opt.pseudo === undefined ? null : opt.pseudo,
      versionProfil: 0, ligneACreer: false, envoiProfil: null, ecranCourant: 'saisie',
      rendreBandeauQuestionnaire: () => {}, rendreBandeauPhase: () => {}, rendreCarteCycles: () => {}, jeuSuitLeProfil: () => {}, parcoursSuitLeProfil: () => {}, ouvrirQuestionnaireSiDu: () => false,
      sauverProfilLocal: () => Promise.resolve(), rendreProfilEcran: () => {},
      texteErreur: (e) => String(e && e.message || e)
    };
    vm.createContext(ctx);
    ['idDeSession', 'identifiantDuProfil', 'metadonneesDuCompte', 'retenirPseudoPris', 'chargerProfil', 'envoyerProfil', 'envoyerProfilMaintenant']
      .forEach((n) => vm.runInContext(extraire(n), ctx));
    return { ctx, base, etat, stockage: ctx.racine.localStorage.cles,
      charger: () => vm.runInContext('chargerProfil()', ctx),
      metadonnees: (id) => { ctx.__i = id; return vm.runInContext('metadonneesDuCompte(__i)', ctx); } };
  }
  const usernameCree = (b) => (b.base.lignes.B ? (b.base.lignes.B.username === undefined ? null : b.base.lignes.B.username) : 'AUCUNE LIGNE');

  test('⚠️ DISCRIMINANT — LE LIEN DANS UNE AUTRE PAGE : plus de mémoire, le pseudo vient des données du compte', async () => {
    const b = bac({ pseudo: null, metadonnees: { pseudo: 'test_0710' } });
    await b.charger();
    expect(usernameCree(b)).toBe('test_0710');
    expect(b.base.posts).toHaveLength(1);                      // du premier coup
  });

  test('⚠️ DISCRIMINANT — la mémoire de la page passe AVANT les données du compte (le choix est à un seul endroit)', async () => {
    const b = bac({ pseudo: 'bob_21', metadonnees: { pseudo: 'autre_pseudo' } });
    await b.charger();
    expect(usernameCree(b)).toBe('bob_21');
  });

  test('les données du compte sont NORMALISÉES à nouveau, par la même fonction (accents, espaces, majuscules)', async () => {
    const b = bac({ pseudo: null, metadonnees: { pseudo: '  Mélodie Dupont ' } });
    await b.charger();
    expect(usernameCree(b)).toBe('melodie_dupont');
  });

  test('des données qui ne valent pas un pseudo sont IGNORÉES : la ligne naît sans lui, comme avant (aucune valeur de confiance)', async () => {
    for (const valeur of ['ab', '1abc', '___', '', 42, null, { a: 1 }, ['x_y_z']]) {
      const b = bac({ pseudo: null, metadonnees: { pseudo: valeur } });
      await b.charger();
      expect([JSON.stringify(valeur), usernameCree(b)]).toEqual([JSON.stringify(valeur), null]);
    }
    for (const metadonnees of [undefined, null, {}, 'texte']) {
      const b = bac({ pseudo: null, metadonnees });
      await b.charger();
      expect(usernameCree(b)).toBeNull();
    }
  });

  test('les données d’un AUTRE compte que celui de la ligne ne se lisent pas', async () => {
    const b = bac({ pseudo: null, metadonnees: { pseudo: 'pseudo_de_b' } });
    expect(await b.metadonnees('B')).toEqual({ pseudo: 'pseudo_de_b' });
    expect(await b.metadonnees('A')).toBeNull();
    expect(await b.metadonnees(null)).toBeNull();
    b.etat.client = null;
    b.ctx.Auth.sessionCourante = () => Promise.resolve(null);
    expect(await b.metadonnees('B')).toBeNull();
    b.ctx.Auth.sessionCourante = () => Promise.reject(new Error('réseau'));
    expect(await b.metadonnees('B')).toBeNull();
  });

  test('⚠️ DISCRIMINANT — HORS LIGNE : la création échoue, la page est rechargée (la mémoire part), la reprise retrouve le pseudo dans le compte', async () => {
    const b = bac({ pseudo: 'test_0710', metadonnees: { pseudo: 'test_0710' }, echecs: 1 });
    await b.charger();
    expect(b.base.lignes.B).toBeUndefined();
    expect(b.ctx.avertissements.join(' ')).toMatch(/Profil non créé/);
    b.ctx.pseudoAInscrire = null;                              // « la page est rechargée »
    await b.charger();
    expect(usernameCree(b)).toBe('test_0710');
  });

  // ── Pris entre-temps ────────────────────────────────────────────────────
  test('⚠️ DISCRIMINANT — le pseudo des données du compte est PRIS entre-temps (23505) : la ligne se crée sans lui, et l’état est retenu pour le Profil', async () => {
    const b = bac({ pseudo: null, metadonnees: { pseudo: 'deja_pris' }, pris: ['deja_pris'] });
    await b.charger();
    expect(b.base.posts.map((p) => p[1].username || null)).toEqual(['deja_pris', null]);
    expect(usernameCree(b)).toBeNull();
    expect(b.stockage[CLE_PSEUDO_PRIS + 'B']).toBe('1');       // en local, PAR COMPTE
    expect(Object.keys(b.stockage)).toEqual([CLE_PSEUDO_PRIS + 'B']);
    expect(b.ctx.avertissements.join(' ')).toMatch(/Pseudo déjà pris/);
  });

  test('le pseudo de la page, pris entre-temps, est retenu de même', async () => {
    const b = bac({ pseudo: 'deja_pris', pris: ['deja_pris'] });
    await b.charger();
    expect(b.stockage[CLE_PSEUDO_PRIS + 'B']).toBe('1');
    expect(b.ctx.pseudoAInscrire).toBeNull();
  });

  test('rien n’est retenu quand le pseudo n’est pas pris : ni création réussie, ni échec réseau, ni collision SANS pseudo', async () => {
    const libre = bac({ pseudo: 'libre_21', metadonnees: { pseudo: 'libre_21' } });
    await libre.charger();
    expect(libre.stockage).toEqual({});
    const reseau = bac({ pseudo: 'libre_21', echecs: 1 });
    await reseau.charger();
    expect(reseau.stockage).toEqual({});
    const sans = bac({ pseudo: null });
    sans.ctx.Donnees.enregistrerProfil = () => { const e = new Error('unique'); e.code = '23505'; return Promise.reject(e); };
    await sans.charger();
    expect(sans.stockage).toEqual({});
    expect(sans.ctx.avertissements.join(' ')).toMatch(/Profil non créé/);
  });

  test('le compte est parti pendant la création (déconnexion) : rien n’est retenu — « Quitter » a déjà tout effacé', async () => {
    const b = bac({ pseudo: 'deja_pris', pris: ['deja_pris'] });
    const enregistrer = b.ctx.Donnees.enregistrerProfil;
    b.ctx.Donnees.enregistrerProfil = (id, champs) => { b.ctx.generation++; return enregistrer(id, champs); };
    await b.charger();
    expect(b.stockage).toEqual({});
  });

  test('le stockage refusé (mode privé) ne casse pas la création : la ligne se crée, la phrase ne s’affichera pas', async () => {
    const b = bac({ pseudo: 'deja_pris', pris: ['deja_pris'] });
    b.ctx.racine.localStorage.setItem = () => { throw new Error('refusé'); };
    await b.charger();
    expect(usernameCree(b)).toBeNull();
  });

  test('GARDE — `chargerProfil` choisit par `Profil.pseudoDeLInscription` (un seul endroit) et ne passe plus `pseudoAInscrire` tel quel', () => {
    const src = extraire('chargerProfil');
    expect(src).toMatch(/Profil\.pseudoDeLInscription\(pseudoAInscrire, await metadonneesDuCompte\(id\)\)/);
    expect(src).not.toMatch(/creer\(pseudoAInscrire\)/);
    // Les données du compte se lisent sur la session du CLIENT, jamais sur `sessionActive` (forme réduite).
    expect(extraire('metadonneesDuCompte')).not.toMatch(/sessionActive/);
  });
});

