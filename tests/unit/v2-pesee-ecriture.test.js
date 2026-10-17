/** @jest-environment node */
//
// 60-2a — L'ÉCRITURE DE LA PESÉE (`body_weight_log`), de bout en bout.
//
// Jusqu'ici la table n'était que LUE. Le questionnaire pose une pesée du jour :
//   · `Donnees.enregistrerPesee` — un upsert sur (`user_id`, `date`) qui
//     FUSIONNE (deux pesées le même jour : la dernière l'emporte) ;
//   · une entrée de la file (`Attente.PESEES`), un identifiant par jour ;
//   · la branche d'`executer` — SANS elle, la table inconnue est vidée par le
//     dernier `return` sans rien écrire (la perte silencieuse) ;
//   · la pose locale (`poserPesee`) : la courbe la voit tout de suite, hors
//     ligne comprise, et la synchronisation ne l'efface pas.
//
// ⚠️ `executer` et `poserPesee` se REJOUENT dans un bac `vm` (les fonctions
// d'`app.js`, extraites) : un test qui chercherait leur TEXTE ne verrait pas une
// branche morte ou mal câblée.

process.env.TZ = 'Europe/Paris';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
require('../../v2/js/modele.js');
const Attente = require('../../v2/js/attente.js');
const { extraire } = require('./aide-profil-ecran.js');

function charger(client) {
  jest.resetModules();
  global.THClient = { obtenir: () => client };
  return require('../../v2/js/donnees.js');
}
afterEach(() => { delete global.THClient; });

describe('60-2a — `Donnees.enregistrerPesee` : un upsert qui FUSIONNE sur (user_id, date)', () => {
  const LIGNE = { user_id: 'u-1', date: '2026-10-07', poids_kg: 98.4, source: 'app' };

  test('la bonne table, la ligne telle quelle (sans identifiant : la base le tire), le bon conflit', async () => {
    const vus = [];
    const D = charger({ from: (t) => ({ upsert: (l, o) => { vus.push({ t, l, o }); return Promise.resolve({ error: null }); } }) });
    await D.enregistrerPesee(LIGNE);
    expect(vus).toEqual([{ t: 'body_weight_log', l: LIGNE, o: { onConflict: 'user_id,date' } }]);
    expect(vus[0].l).not.toHaveProperty('id');
  });

  test('DISCRIMINANT : elle FUSIONNE — l’inverse du journal des records, qui ignore les doublons', async () => {
    const vus = [];
    const D = charger({ from: () => ({ upsert: (l, o) => { vus.push(o); return Promise.resolve({ error: null }); } }) });
    await D.enregistrerPesee(LIGNE);
    expect(vus[0]).not.toHaveProperty('ignoreDuplicates');
  });

  test('une erreur de la base est levée telle quelle (la file lit son `code`)', async () => {
    const erreur = { code: '23514', message: 'poids hors bornes' };
    const D = charger({ from: () => ({ upsert: () => Promise.resolve({ error: erreur }) }) });
    await expect(D.enregistrerPesee(LIGNE)).rejects.toBe(erreur);
  });
});

describe('60-2a — la file : une entrée par jour, la dernière gagne', () => {
  test('la table est `body_weight_log`', () => {
    expect(Attente.PESEES).toBe('body_weight_log');
  });

  test('deux pesées le même jour se COMPRESSENT en une (la dernière) ; un autre jour est une autre entrée', () => {
    let f = [];
    f = Attente.poser(f, { table: Attente.PESEES, op: Attente.UPSERT, id: 'pesee-2026-10-07', donnees: { poids_kg: 98 } });
    f = Attente.poser(f, { table: Attente.PESEES, op: Attente.UPSERT, id: 'pesee-2026-10-07', donnees: { poids_kg: 98.4 } });
    expect(f).toHaveLength(1);
    expect(f[0].donnees.poids_kg).toBe(98.4);
    f = Attente.poser(f, { table: Attente.PESEES, op: Attente.UPSERT, id: 'pesee-2026-10-08', donnees: { poids_kg: 98.1 } });
    expect(f).toHaveLength(2);
  });

  test('`protegees` rend les pesées qui attendent — ce que la synchronisation ne doit pas effacer', () => {
    const f = Attente.poser([], { table: Attente.PESEES, op: Attente.UPSERT, id: 'pesee-2026-10-07', donnees: {} });
    expect(Attente.protegees(f, Attente.PESEES)).toEqual({ 'pesee-2026-10-07': true });
    expect(Attente.protegees(f, Attente.RECORDS)).toEqual({});
  });

  test('un refus de la base (CHECK, 23514) est DÉFINITIF : l’entrée est bloquée, pas retentée sans fin', () => {
    expect(Attente.estDefinitive({ code: '23514' })).toBe(true);
    expect(Attente.estDefinitive({ code: '42501' })).toBe(true);
    expect(Attente.estDefinitive({ message: 'TypeError: Failed to fetch' })).toBe(false);   // le réseau : on réessaie
  });
});

describe('60-2a — `executer` envoie la pesée (et ne la laisse PAS tomber en silence)', () => {
  const envoyes = [];
  const ctx = { Attente, Donnees: { enregistrerPesee: (d) => { envoyes.push(d); return Promise.resolve('ok'); } } };
  vm.createContext(ctx);
  vm.runInContext(extraire('executer'), ctx);

  test('une entrée de la table des pesées appelle l’écrivain, avec ses données', () => {
    const donnees = { user_id: 'u-1', date: '2026-10-07', poids_kg: 98.4, source: 'app' };
    ctx.op = { table: Attente.PESEES, op: Attente.UPSERT, id: 'pesee-2026-10-07', donnees };
    vm.runInContext('executer(op)', ctx);
    expect(envoyes).toEqual([donnees]);
  });

  // 117 (audit du 16/10, 06 #17) — et elle n'est plus un SUCCÈS : refusée (`TH001`), elle reste dans la file.
  test('DISCRIMINANT : une table que `executer` ne connaît pas n’écrit rien — c’est CE que la branche de la pesée évite', async () => {
    envoyes.length = 0;
    ctx.op = { table: 'inconnue', op: Attente.UPSERT, id: 'x', donnees: { a: 1 } };
    await expect(vm.runInContext('executer(op)', ctx)).rejects.toMatchObject({ code: 'TH001' });
    expect(envoyes).toEqual([]);
  });
});

describe('60-2a — `poserPesee` : sur l’appareil d’abord, puis par la file', () => {
  function bac(pesees) {
    const lot = [], retirees = [], posees = [];
    const ctx = {
      Attente,
      local: { pesees: pesees || [] },
      idUtilisateur: () => 'u-1',
      Cache: {
        ecrireLot: (m, l) => { lot.push({ m, l }); return Promise.resolve(); },
        supprimer: (m, ids) => { retirees.push({ m, ids }); return Promise.resolve(); }
      },
      poser: (op) => { posees.push(op); return Promise.resolve(); }
    };
    vm.createContext(ctx);
    vm.runInContext(extraire('poserPesee'), ctx);
    return { ctx, lot, retirees, posees };
  }

  test('la ligne locale (un identifiant par jour) et l’entrée de la file (user_id, date, poids, source)', async () => {
    const b = bac([{ id: 'u1', date: '2026-10-05', poids_kg: 98, source: 'import_hevy' }]);
    b.ctx.pesee = { date: '2026-10-07', poids_kg: 98.4 };
    await vm.runInContext('poserPesee(pesee)', b.ctx);
    expect(b.ctx.local.pesees.map((p) => p.id).sort()).toEqual(['pesee-2026-10-07', 'u1']);
    expect(b.lot).toEqual([{ m: 'pesees', l: [{ id: 'pesee-2026-10-07', date: '2026-10-07', poids_kg: 98.4, source: 'app' }] }]);
    expect(b.posees).toEqual([{
      table: 'body_weight_log', op: 'upsert', id: 'pesee-2026-10-07',
      donnees: { user_id: 'u-1', date: '2026-10-07', poids_kg: 98.4, source: 'app' } }]);
    expect(b.retirees).toEqual([]);
  });

  test('DISCRIMINANT : la ligne du serveur pour le MÊME jour est remplacée (mémoire ET cache) — la courbe n’a pas deux points', async () => {
    const b = bac([{ id: 'u2', date: '2026-10-07', poids_kg: 97, source: 'import_hevy' }, { id: 'u1', date: '2026-10-05', poids_kg: 98 }]);
    b.ctx.pesee = { date: '2026-10-07', poids_kg: 98.4 };
    await vm.runInContext('poserPesee(pesee)', b.ctx);
    const duJour = b.ctx.local.pesees.filter((p) => p.date === '2026-10-07');
    expect(duJour).toHaveLength(1);
    expect(duJour[0].poids_kg).toBe(98.4);
    expect(b.retirees).toEqual([{ m: 'pesees', ids: ['u2'] }]);
  });

  test('l’appareil ne dépend pas du réseau : la pose locale passe même si le cache refuse', async () => {
    const b = bac([]);
    b.ctx.Cache.ecrireLot = () => Promise.reject(new Error('quota'));
    b.ctx.pesee = { date: '2026-10-07', poids_kg: 84 };
    await vm.runInContext('poserPesee(pesee)', b.ctx);
    expect(b.ctx.local.pesees).toHaveLength(1);
    expect(b.posees).toHaveLength(1);
  });
});

describe('60-2a — la synchronisation garde la pesée qui attend', () => {
  test('la lecture du serveur passe par `Poids.fondreEnAttente`, avec ce que la file n’a pas encore envoyé', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
    expect(src).toMatch(/Poids\.fondreEnAttente\(\s*pesees\s*,\s*local\.pesees\s*,\s*Attente\.protegees\(\s*attente\s*,\s*Attente\.PESEES\s*\)\s*\)/);
    expect(src).not.toMatch(/local\.pesees\s*=\s*Sync\.remplacer\(\s*pesees\s*\)/);
  });
});
