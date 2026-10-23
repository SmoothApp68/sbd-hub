/** @jest-environment node */
//
// 136 (audit du 16/10/2026, E15 ; ECRAN-SAISIE §7 sexies : « la file ne perd rien en silence ») — LA FILE QUI NE
// S'ÉCRIT PAS SUR DISQUE LE DIT.
//
// `poser` (et `poserPaquet`) avalaient l'échec de `Cache.ecrireAttente` dans un `console.warn` : la promesse d'envoi
// n'existait plus qu'en mémoire, un rechargement la perdait, et rien à l'écran ne le disait. Elles disent désormais
// la phrase de la séance, à la place de la séance (`#erreur-seance`), par la même fonction que `sauverSeance`.
// Le nouvel essai de `Cache` (134, I-02) passe avant : un premier échec rattrapé ne dit rien — seul celui qui
// remonte de `Cache` le fait (épinglé par `v2-cache.test.js`, « UN seul nouvel essai »).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
function extraire(nom) {
  const m = APP.match(new RegExp('^  (?:async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable dans v2/js/app.js : ' + nom);
  return m[0];
}
function extraireVar(nom) {
  const m = APP.match(new RegExp('^  var ' + nom + ' = [^\\n]*$', 'm'));
  if (!m) throw new Error('introuvable dans v2/js/app.js : var ' + nom);
  return m[0];
}

function bac(ecrireAttente) {
  const journal = { messages: [], avertis: [], vidanges: 0, etats: 0 };
  const noeud = { id: 'erreur-seance' };
  const ctx = {
    attente: [], gestesEnVol: {},   // 148 — la garde commune que `poser` renseigne
    Attente: { poser: (f, op) => f.concat([op]) },
    Cache: { ecrireAttente, ecrireBrouillon: () => Promise.reject(new Error('quota')) },
    Rendu: { message: (c, t, g) => journal.messages.push([c && c.id, t, g]) },
    $: (id) => (id === 'erreur-seance' ? noeud : null),
    console: { warn: (...a) => journal.avertis.push(a.join(' ')), error: (...a) => journal.avertis.push(a.join(' ')) },
    texteErreur: (e) => String(e && e.message),
    rendreEtatSync: () => { journal.etats++; },
    vidanger: () => { journal.vidanges++; },
    suppressionDifferee: null, solderSuppression: () => Promise.resolve(),
    semerSeance: () => {}, demanderPersistance: () => {}, seance: { id: 's1' }
  };
  vm.createContext(ctx);
  vm.runInContext([extraireVar('PHRASE_SAUVEGARDE_IMPOSSIBLE'), extraire('direSauvegardeImpossible'),
    extraire('noterGesteEnVol'), extraire('poser'), extraire('poserPaquet'), extraire('sauverSeance'),
    'this.poser = poser; this.poserPaquet = poserPaquet; this.sauverSeance = sauverSeance;'].join('\n'), ctx);
  return { ctx, journal };
}
const PHRASE = 'Sauvegarde impossible sur cet appareil. Ne ferme pas l’app.';

describe('136 — E15 : la file qui ne s’écrit pas sur disque le dit', () => {
  test('DISCRIMINANT — `poser` : le disque refuse, la phrase de la séance, à sa place ; l’envoi part quand même', async () => {
    const { ctx, journal } = bac(() => Promise.reject(new Error('disque plein')));
    await ctx.poser({ cle: 'sets:s1' });
    expect(journal.messages).toEqual([['erreur-seance', PHRASE, 'erreur']]);
    expect(ctx.attente).toHaveLength(1);       // la file en mémoire garde l'entrée : elle part au réseau
    expect(journal.vidanges).toBe(1);
  });

  test('`poserPaquet` (l’import) : la même phrase', async () => {
    const { ctx, journal } = bac(() => Promise.reject(new Error('disque plein')));
    await ctx.poserPaquet([{ cle: 'a' }, { cle: 'b' }]);
    expect(journal.messages).toEqual([['erreur-seance', PHRASE, 'erreur']]);
  });

  test('le disque qui accepte : rien n’est dit', async () => {
    const { ctx, journal } = bac(() => Promise.resolve());
    await ctx.poser({ cle: 'sets:s1' });
    await ctx.poserPaquet([{ cle: 'a' }]);
    expect(journal.messages).toEqual([]);
  });

  test('la séance et la file disent la MÊME phrase, par la même fonction', async () => {
    const { ctx, journal } = bac(() => Promise.reject(new Error('x')));
    await ctx.sauverSeance();
    await ctx.poser({ cle: 'sets:s1' });
    expect(journal.messages.map((m) => m[1])).toEqual([PHRASE, PHRASE]);
    expect((APP.match(/Sauvegarde impossible sur cet appareil\. Ne ferme pas/g) || []).length).toBe(1);
  });

  test('après le nouvel essai de `Cache` (I-02) : `poser` passe par `Cache.ecrireAttente`, qui rejoue une connexion perdue', () => {
    const cache = fs.readFileSync(path.join(__dirname, '../../v2/js/cache.js'), 'utf8');
    expect(cache).toMatch(/function ecrireAttente\(file\) \{ return remplacerTout\('attente'/);
    expect(cache).toMatch(/function remplacerTout\([\s\S]*?return operation\(/);
  });
});
