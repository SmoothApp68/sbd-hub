/** @jest-environment node */
//
// 30/09/2026 — la ré-entrée du même utilisateur ne relit plus le disque.
//
// LE CONSTAT (séance du 29/09, journaux Supabase) : le SDK émet `SIGNED_IN` à
// chaque déverrouillage du téléphone → `entrer(session)` relisait la séance,
// la file et les paris depuis le disque. Un pari posé pendant la lecture
// disparaissait de la file, pour toujours (il n'est posé qu'une fois).
//
// Le bac exécute les VRAIES fonctions d'entrée de `app.js` — `entrer`,
// `reentrer`, `entrerVraiment` et les trois lectures du disque —, avec un
// cache de papier qui compte ce qu'on lui lit. Tout le reste est un bouchon.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');

function extraire(nom) {
  const re = new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm');
  const m = APP.match(re);
  if (!m) throw new Error('introuvable dans v2/js/app.js : ' + nom);
  return m[0];
}

function bac() {
  const lectures = [];
  const journal = { syncs: 0, vidanges: 0, rendus: 0 };
  const lire = (quoi, valeur) => () => { lectures.push(quoi); return Promise.resolve(valeur); };
  const cache = {
    lireTout: (m) => { lectures.push('tout:' + m); return Promise.resolve([]); },
    lireBrouillon: (c) => { lectures.push('brouillon:' + c); return Promise.resolve(null); },
    lireAttente: lire('attente', []),
    lireMeta: (c) => { lectures.push('meta:' + c); return Promise.resolve(null); }
  };
  const vue = { hidden: true };
  const ctx = {
    console: { warn: () => {} },
    racine: { location: { pathname: '/' } },
    Cache: cache,
    local: {}, seance: null, attente: [], consignesSauvees: null, brouillonLocal: null,
    sessionActive: null, profil: null, etat: null, verificationSeance: null,
    entreeEnCours: null, entreeFaitePour: null,
    // 70 — le lien de récupération : aucun ici (sa règle a ses tests et son banc, [E70]).
    renduPour: null, ouvrirRecuperationSiDue: () => {},
    CLE_CONSIGNES: 'consignes', CLE_BROUILLON: 'brouillon-routine',
    // 71 — le récap de fin de séance est protégé comme les écrans d'édition.
    vues: { detail: vue, routine: vue, seance: vue, questionnaire: vue, recap: vue },
    Seance: { verifierColonnes: () => {} },
    Routeur: { analyser: () => ({ vue: 'liste', params: {} }), interditAvecSession: () => false, estVueDuJeu: () => false,
               RACINE: 'liste', PROFIL: 'profil' },
    // 60-2a — le questionnaire : rien à ouvrir ici (sa règle a ses tests), mais la
    // ré-entrée ne doit jamais reprendre la main sur lui.
    ouvrirQuestionnaireSiDu: () => false, fermerQuestionnaire: () => {}, envoiProfil: null,
    Sync: { deciderEtat: () => ({}) },
    Rendu: { message: () => {} },
    sortie: { apresNavigation: () => {} },
    $: () => ({}),
    texteErreur: String,
    garantirProprietaire: () => Promise.resolve(),
    rangerSeances: () => {}, indexerParSeance: () => {}, recalculerEtats: () => {},
    lireModeRPE: () => {}, lireSourdine: () => {},
    reparerIdentifiantsManquants: () => Promise.resolve(),
    reparerFileHorsBornes: () => Promise.resolve(),
    reparerFileConflitsEnCours: () => Promise.resolve(),
    reparerFileSchema: () => Promise.resolve(),
    chargerProfilLocal: () => Promise.resolve(),
    chargerProfil: () => Promise.resolve(),
    resoudreSeanceEnCoursDistante: () => Promise.resolve(),
    allerA: () => {}, montrer: () => {},
    rendreRoute: () => { journal.rendus++; },
    rendreEtatSync: () => {},
    synchroniser: () => { journal.syncs++; return Promise.resolve(); },
    vidanger: () => { journal.vidanges++; },
    // L'outil de rejeu (développement) : rien demandé ici.
    rejeuDemande: null, ouvrirRejeu: () => {}, apresSynchroAnnee: () => {}
  };
  vm.createContext(ctx);
  ['idDeSession', 'entrer', 'reentrer', 'entrerVraiment', 'chargerCache',
   'chargerSeanceLocale', 'chargerBrouillonLocal']
    .forEach((n) => vm.runInContext(extraire(n), ctx));
  const session = (id, jeton) => ({ user: { id }, access_token: jeton || 'j' });
  const entrer = (s) => { ctx.__s = s; return vm.runInContext('entrer(__s)', ctx); };
  return { ctx, lectures, journal, session, entrer };
}

// Ce qui, relu en pleine séance, écrase la mémoire.
const DANGEREUSES = ['brouillon:seance', 'attente', 'tout:predictions', 'tout:series'];

describe('la ré-entrée du même utilisateur', () => {
  test('témoin — la première entrée lit la séance, la file et les paris depuis le disque', async () => {
    const b = bac();
    await b.entrer(b.session('u1'));
    DANGEREUSES.forEach((l) => expect(b.lectures).toContain(l));
    expect(b.ctx.entreeFaitePour).toBe('u1');
  });

  test('⚠️ DISCRIMINANT — une seconde entrée du même compte ne relit RIEN de ce qui écrase la mémoire', async () => {
    const b = bac();
    await b.entrer(b.session('u1'));
    b.lectures.length = 0;
    await b.entrer(b.session('u1', 'jeton-neuf'));
    DANGEREUSES.forEach((l) => expect(b.lectures).not.toContain(l));
    // Aucune lecture de la séance, de la file, des paris, ni de l'historique.
    expect(b.lectures.filter((l) => /^(tout|brouillon):|^attente$/.test(l))).toEqual([]);
  });

  test('⚠️ DISCRIMINANT — la mémoire posée entre-temps n’est pas écrasée', async () => {
    const b = bac();
    await b.entrer(b.session('u1'));
    // Ce que la séance a posé depuis : une série validée, un pari en file.
    b.ctx.seance = { id: 's1', exercices: [{ series: [{ id: 'x', validee_a: 'maintenant' }] }] };
    b.ctx.attente = [{ cle: 'predictions:p1' }];
    b.ctx.local.predictions = [{ id: 'p1' }];
    await b.entrer(b.session('u1'));
    expect(b.ctx.seance && b.ctx.seance.id).toBe('s1');
    expect(b.ctx.attente).toEqual([{ cle: 'predictions:p1' }]);
    expect(b.ctx.local.predictions).toEqual([{ id: 'p1' }]);
  });

  test('elle met la session à jour (le jeton), synchronise et vide la file', async () => {
    const b = bac();
    await b.entrer(b.session('u1'));
    const avant = { syncs: b.journal.syncs, vidanges: b.journal.vidanges };
    const neuve = b.session('u1', 'jeton-neuf');
    await b.entrer(neuve);
    expect(b.ctx.sessionActive).toBe(neuve);
    expect(b.journal.syncs).toBe(avant.syncs + 1);
    expect(b.journal.vidanges).toBe(avant.vidanges + 1);
  });

  test('un écran en cours d’édition n’est pas redessiné par la ré-entrée', async () => {
    const b = bac();
    await b.entrer(b.session('u1'));
    b.ctx.vues.seance = { hidden: false };
    const rendus = b.journal.rendus;
    await b.entrer(b.session('u1'));
    expect(b.journal.rendus).toBe(rendus);
  });

  test('⚠️ 71 — le récap de fin de séance ouvert n’est pas remplacé par la ré-entrée', async () => {
    const b = bac();
    await b.entrer(b.session('u1'));
    b.ctx.vues.recap = { hidden: false };
    const rendus = b.journal.rendus;
    await b.entrer(b.session('u1'));
    expect(b.journal.rendus).toBe(rendus);
  });
});

describe('ce qui reste une entrée complète', () => {
  test('⚠️ DISCRIMINANT — un AUTRE compte relit tout', async () => {
    const b = bac();
    await b.entrer(b.session('u1'));
    b.lectures.length = 0;
    await b.entrer(b.session('u2'));
    DANGEREUSES.forEach((l) => expect(b.lectures).toContain(l));
    expect(b.ctx.entreeFaitePour).toBe('u2');
  });

  test('après une sortie (déconnexion, jeton disparu), le même compte repart du disque', async () => {
    const b = bac();
    await b.entrer(b.session('u1'));
    b.ctx.entreeFaitePour = null;   // ce que font `deconnecter` et le rappel sans session
    b.lectures.length = 0;
    await b.entrer(b.session('u1'));
    DANGEREUSES.forEach((l) => expect(b.lectures).toContain(l));
  });

  test('`deconnecter` et le rappel sans session remettent bien la marque à zéro', () => {
    const deco = extraire('deconnecter');
    expect(deco).toMatch(/entreeFaitePour = null/);
    // 70 — le rappel reçoit aussi l'événement (`PASSWORD_RECOVERY`).
    const rappel = APP.match(/Auth\.surChangement\(function \(session, evenement\) \{[\s\S]*?\n    \}\);/);
    expect(rappel && rappel[0]).toMatch(/entreeFaitePour = null/);
  });

  test('deux entrées simultanées au démarrage partagent la même promesse (garde existante)', async () => {
    const b = bac();
    const p1 = b.entrer(b.session('u1'));
    const p2 = b.entrer(b.session('u1'));
    expect(p2).toBe(p1);
    await p1;
  });
});
