/** @jest-environment node */
//
// 117 (audit du 16/10/2026, 06 #6) — LA FILE APPARTIENT À SON COMPTE, ET ELLE LUI EST RENDUE.
//
// LE CONSTAT : une session qui expire ne vide rien. Si un AUTRE compte entrait ensuite sur l'appareil,
// `garantirProprietaire` vidait tout (`viderTout`) — la file du premier comprise : ses séances pas encore montées,
// ses pesées, ses paris — sans la fenêtre de « Quitter ».
//
// Ici : la règle pure (`Attente.changerDeCompte`), la transaction du cache (`Cache.changerDeCompte`, sur une base
// locale de papier), et le branchement d'`app.js` (garantirProprietaire, la fenêtre de « Quitter »).

const fs = require('fs');
const path = require('path');
const A = require('../../v2/js/attente.js');

const entree = (cle, seq) => ({ cle, seq, table: cle.split(':')[0], id: cle.split(':')[1], op: 'upsert' });

describe('la règle : garder la file du compte qui part, rendre celle du compte qui revient', () => {
  test('⚠️ DISCRIMINANT — A s’en va (session expirée), B entre : la file de A est gardée, B part d’une file vide', () => {
    const r = A.changerDeCompte({}, 'A', [entree('sessions:s1', 1), entree('sets:s1', 2)], 'B');
    expect(r.rendue).toEqual([]);
    expect(Object.keys(r.gardees)).toEqual(['A']);
    expect(r.gardees.A.map((e) => e.cle)).toEqual(['sessions:s1', 'sets:s1']);
  });

  test('A revient : sa file lui est rendue, celle de B est gardée à son tour', () => {
    const g = { A: [entree('sessions:s1', 1)] };
    const r = A.changerDeCompte(g, 'B', [entree('body_weight_log:p1', 1)], 'A');
    expect(r.rendue.map((e) => e.cle)).toEqual(['sessions:s1']);
    expect(Object.keys(r.gardees)).toEqual(['B']);
    expect(g.A.length).toBe(1);   // rien n'est muté
  });

  test('un compte sans rien en attente ne laisse rien derrière lui', () => {
    expect(A.changerDeCompte({}, 'A', [], 'B')).toEqual({ gardees: {}, rendue: [] });
  });

  test('entreesGardees met toutes les files gardées à plat (la fenêtre de « Quitter » les compte)', () => {
    expect(A.entreesGardees({ A: [entree('sessions:s1', 1)], B: [entree('sets:s2', 1)] }).map((e) => e.cle))
      .toEqual(['sessions:s1', 'sets:s2']);
  });
});

// 118 (suite de 117) — CE QUI ATTEND HORS DE LA FILE : la réponse de profil pas encore envoyée, les messages du groupe.
describe('118 — la règle : garder ce qui attend hors de la file, le rendre au compte qui revient', () => {
  const msg = (id) => ({ id, groupe_id: 'g1', texte: 'Allez', le: '2026-10-16T10:00:00Z' });
  test('⚠️ DISCRIMINANT — A s’en va avec une réponse de profil et un message : gardés sous A ; B ne reçoit rien', () => {
    const r = A.changerDeCompteAutres({}, 'A', { 'meta:profil-a-envoyer': { rythme_progression: 'franc' },
      'meta:profil': { id: 'A' }, 'brouillon:groupe-messages': [msg('m1')] }, 'B');
    expect(r.rendues).toEqual({});
    expect(Object.keys(r.gardes)).toEqual(['A']);
    expect(r.gardes.A['brouillon:groupe-messages']).toEqual([msg('m1')]);
  });
  test('A revient : tout lui est rendu ; une valeur vide (rien en attente) n’est jamais gardée', () => {
    const g = { A: { 'meta:profil-a-envoyer': { phase: 'seche' } } };
    const r = A.changerDeCompteAutres(g, 'B', { 'meta:profil-a-envoyer': null, 'meta:profil': null,
      'brouillon:groupe-messages': [] }, 'A');
    expect(r.rendues).toEqual({ 'meta:profil-a-envoyer': { phase: 'seche' } });
    expect(r.gardes).toEqual({});
    expect(g.A['meta:profil-a-envoyer']).toEqual({ phase: 'seche' });   // rien n'est muté
  });
  test('compterGardesAutres : une liste compte ses éléments, une valeur pour une', () => {
    expect(A.compterGardesAutres({ A: { 'meta:profil-a-envoyer': true, 'brouillon:groupe-messages': [msg('a'), msg('b')] } })).toBe(3);
    expect(A.compterGardesAutres({})).toBe(0);
  });
});

// ── Une base locale de papier : des magasins, des requêtes qui répondent plus tard, une transaction qui se
// termine quand plus aucune requête n'attend. Assez pour jouer `Cache.changerDeCompte` pour de vrai.
function basePapier() {
  const magasins = {};
  const cles = { brouillon: 'cle', attente: 'cle', meta: 'cle' };
  const tx = () => {
    let enVol = 0, fini = false;
    const t = {};
    const terminer = () => { if (!enVol && !fini) { fini = true; setTimeout(() => t.oncomplete && t.oncomplete(), 0); } };
    const requete = (valeur) => {
      enVol++;
      const req = {};
      setTimeout(() => { req.result = valeur(); if (req.onsuccess) req.onsuccess(); enVol--; terminer(); }, 0);
      return req;
    };
    t.objectStore = (nom) => {
      const m = magasins[nom] = magasins[nom] || new Map();
      const cle = (v) => v[cles[nom] || 'id'];
      return {
        get: (k) => requete(() => m.get(k)),
        getAll: () => requete(() => Array.from(m.values())),
        put: (v) => { m.set(cle(v), v); },
        clear: () => { m.clear(); },
        delete: (k) => { m.delete(k); }
      };
    };
    setTimeout(terminer, 0);
    return t;
  };
  const db = { objectStoreNames: { contains: () => true }, transaction: tx };
  return {
    magasins,
    indexedDB: { open() { const req = {}; setTimeout(() => { req.result = db; req.onsuccess && req.onsuccess(); }, 0); return req; } }
  };
}

describe('le cache : une transaction qui vide tout, sauf la file du compte qui part', () => {
  let papier;
  beforeEach(() => {
    jest.resetModules();
    papier = basePapier();
    global.indexedDB = papier.indexedDB;
    global.THAttente = A;
    require('../../v2/js/cache.js');
  });
  afterEach(() => { delete global.indexedDB; delete global.THAttente; delete global.THCache; });

  test('⚠️ DISCRIMINANT — A → B → A : la séance que A n’avait pas envoyée lui revient, rien n’est perdu', async () => {
    const C = global.THCache;
    await C.ecrireAttente([entree('sessions:s1', 1), entree('sets:s1', 2)]);
    await C.ecrireLot('series', [{ id: 'serie-de-A', session_id: 's1' }]);

    const versB = await C.changerDeCompte('A', 'B');
    expect(versB.rendue).toEqual([]);
    expect(await C.lireAttente()).toEqual([]);              // B ne voit pas la file de A
    expect(await C.lireTout('series')).toEqual([]);         // le reste du cache de A est bien vidé
    expect(Object.keys(await C.lireFilesGardees())).toEqual(['A']);

    await C.ecrireAttente([entree('body_weight_log:p1', 1)]);
    const versA = await C.changerDeCompte('B', 'A');
    expect(versA.rendue.map((e) => e.cle)).toEqual(['sessions:s1', 'sets:s1']);
    expect((await C.lireAttente()).map((e) => e.cle).sort()).toEqual(['sessions:s1', 'sets:s1']);
    expect(Object.keys(await C.lireFilesGardees())).toEqual(['B']);
  });

  test('⚠️ DISCRIMINANT — 118 : A → B → A, la réponse de profil et le message du groupe de A lui reviennent', async () => {
    const C = global.THCache;
    const AUTRES = [{ magasin: 'meta', cle: 'profil-a-envoyer' }, { magasin: 'meta', cle: 'profil' },
                    { magasin: 'brouillon', cle: 'groupe-messages' }];
    const msg = { id: 'm1', groupe_id: 'g1', texte: 'Allez', le: '2026-10-16T10:00:00Z' };
    await C.ecrireMeta('profil-a-envoyer', { rythme_progression: 'franc' });
    await C.ecrireMeta('profil', { id: 'A', rythme_progression: 'franc' });
    await C.ecrireBrouillon('groupe-messages', [msg]);

    const versB = await C.changerDeCompte('A', 'B', AUTRES);
    expect(versB.rendues).toEqual({});
    expect(await C.lireMeta('profil-a-envoyer')).toBeNull();     // B ne voit rien de A
    expect(await C.lireBrouillon('groupe-messages')).toBeNull();
    expect(Object.keys(await C.lireGardesAutres())).toEqual(['A']);

    const versA = await C.changerDeCompte('B', 'A', AUTRES);
    expect(Object.keys(versA.rendues).sort()).toEqual(['brouillon:groupe-messages', 'meta:profil', 'meta:profil-a-envoyer']);
    expect(await C.lireMeta('profil-a-envoyer')).toEqual({ rythme_progression: 'franc' });
    expect(await C.lireMeta('profil')).toEqual({ id: 'A', rythme_progression: 'franc' });
    expect(await C.lireBrouillon('groupe-messages')).toEqual([msg]);
    expect(await C.lireGardesAutres()).toEqual({});
    // « Quitter » vide aussi ce qui est gardé.
    await C.changerDeCompte('A', 'B', AUTRES);
    await C.viderTout();
    expect(await C.lireGardesAutres()).toEqual({});
  });

  test('118 — `preparer` choisit ce qui se garde (la ligne de profil seule n’est pas une attente)', async () => {
    const C = global.THCache;
    await C.ecrireMeta('profil', { id: 'A' });
    const r = await C.changerDeCompte('A', 'B', [{ magasin: 'meta', cle: 'profil' }], () => ({ 'meta:profil': null }));
    expect(r.rendues).toEqual({});
    expect(await C.lireGardesAutres()).toEqual({});
  });

  test('« Quitter » (`viderTout`) vide aussi les files gardées', async () => {
    const C = global.THCache;
    await C.ecrireAttente([entree('sessions:s1', 1)]);
    await C.changerDeCompte('A', 'B');
    await C.viderTout();
    expect(await C.lireFilesGardees()).toEqual({});
  });
});

describe('le branchement dans app.js', () => {
  const app = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
  const corps = (nom) => {
    const i = app.search(new RegExp('\\n  (?:async )?function ' + nom + '\\('));
    const j = app.indexOf('\n  }\n', i);
    return app.slice(i, j);
  };

  test('⚠️ `garantirProprietaire` change de compte par `Cache.changerDeCompte`, jamais par `viderTout`', () => {
    const g = corps('garantirProprietaire');
    expect(g).toMatch(/Cache\.changerDeCompte\(\s*meta && meta\.userId,\s*userId,\s*gardesDuCompte\(\),\s*preparerGardesDuCompte\s*\)/);
    expect(g).not.toMatch(/Cache\.viderTout\(/);
  });

  test('118 — ce qui attend hors de la file : la réponse de profil (avec sa ligne), les messages du groupe', () => {
    expect(corps('gardesDuCompte')).toMatch(/\{ magasin: 'meta', cle: CLE_PROFIL_ENVOI \}, \{ magasin: 'meta', cle: CLE_PROFIL \},\s*\{ magasin: 'brouillon', cle: CLE_FILE_GROUPE \}/);
    const q = corps('quitterSansRienPerdre');
    expect(q).toMatch(/Attente\.compterGardesAutres\(await Cache\.lireGardesAutres\(\)\)/);
    expect(q).toMatch(/autres: function \(\) \{ return grp\.file\.length \+ autresGardes; \}/);
    expect(corps('envoyerAvantDeQuitter')).toMatch(/grp\.file\.length \? envoyerFileGroupe\(\)/);
  });

  test('la fenêtre de « Quitter » compte les files gardées pour un autre compte', () => {
    const q = corps('quitterSansRienPerdre');
    expect(q).toMatch(/Attente\.entreesGardees\(await Cache\.lireFilesGardees\(\)\)/);
    expect(q).toMatch(/file:\s*function \(\) \{ return attente\.concat\(gardees\); \}/);
  });
});
