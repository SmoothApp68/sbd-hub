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

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const extraire = (nom) => {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable : ' + nom);
  return m[0];
};
const session = (id, jeton) => ({ user: { id }, access_token: jeton || 'j-' + id });
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
      entreeEnCours: null, entreeFaitePour: null,
      CLE_CONSIGNES: 'consignes', CLE_BROUILLON: 'brouillon-routine',
      vues: { detail: {}, routine: {}, seance: {}, questionnaire: {} },
      Seance: { verifierColonnes: () => {} },
      Routeur: { analyser: () => ({ vue: 'liste', params: {} }), interditAvecSession: () => false, RACINE: 'liste', PROFIL: 'profil' },
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
      entrer: (s) => { ctx.__s = s; return vm.runInContext('entrer(__s)', ctx); } };
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

  test('l’entrée en vol qui échoue ne bloque pas la session suivante', async () => {
    const b = bac();
    b.ctx.chargerCache = () => Promise.reject(new Error('disque'));
    const pA = b.entrer(session('A'));
    await tic();
    const pB = b.entrer(session('B'));
    await b.liberer();
    await pA.catch(() => {});
    await pB.catch(() => {});
    expect(b.ctx.sessionActive.user.id).toBe('B');
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
      Auth: { sessionCourante: () => (etat.client ? Promise.resolve(session(etat.client)) : Promise.resolve(null)) },
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
      versionProfil: 0, envoiProfil: null, ecranCourant: 'saisie',
      rendreBandeauQuestionnaire: () => {}, rendreBandeauPhase: () => {}, ouvrirQuestionnaireSiDu: () => false,
      sauverProfilLocal: () => Promise.resolve(), rendreProfilEcran: () => {},
      envoyerProfil: () => vm.runInContext('envoyerProfil()', ctx), texteErreur: (e) => String(e && e.message || e)
    };
    vm.createContext(ctx);
    ['idDeSession', 'identifiantDuProfil', 'chargerProfil', 'envoyerProfil', 'envoyerProfilMaintenant', 'poserProfil']
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
