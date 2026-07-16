// RGPD Art.17 — cœur de décision de la suppression de compte (requestAccountDeletion).
// Règle : ne purger le local QUE si l'Edge Function delete-account confirme que les
// données ont disparu côté cloud. Sinon on effacerait en local ce qui reste en ligne.
// _deleteAccountDecision est extraite de la VRAIE source (app.js) via vm — pas de copie.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');

function extractFn(src, name) {
  const m = src.match(new RegExp('^function ' + name + '\\b[\\s\\S]*?^}', 'm'));
  if (!m) throw new Error('Could not extract fn ' + name);
  return m[0];
}

function decide(res) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(extractFn(APP, '_deleteAccountDecision'), ctx);
  ctx._res = res;
  return vm.runInContext('_deleteAccountDecision(_res)', ctx);
}

describe('RGPD — _deleteAccountDecision : ne purge le local que si le cloud a bien effacé', () => {
  test('(a) échec de l\'Edge Function (pas de corps) → PAS de purge', () => {
    // fetch KO / réponse vide : on garde le local, il reste la seule copie fiable
    expect(decide(null)).toEqual({ purge: false, authIncomplete: false });
    expect(decide(undefined)).toEqual({ purge: false, authIncomplete: false });
  });

  test('(a bis) erreur métier sans dataDeleted → PAS de purge', () => {
    expect(decide({ error: 'RPC failed' })).toEqual({ purge: false, authIncomplete: false });
    expect(decide({ success: false })).toEqual({ purge: false, authIncomplete: false });
  });

  test('(b) success:true → purge le local, auth complète', () => {
    expect(decide({ success: true })).toEqual({ purge: true, authIncomplete: false });
  });

  test('(c) dataDeleted:true + error (auth non supprimé) → purge le local MAIS signale l\'incomplétude', () => {
    // Les données santé/logs ont bien disparu côté cloud → on doit purger le local aussi
    // (sinon résurrection). Mais l'utilisateur auth subsiste → à remonter (toast + Sentry).
    const dec = decide({ dataDeleted: true, error: 'auth user delete failed' });
    expect(dec).toEqual({ purge: true, authIncomplete: true });
  });

  test('cohérence : authIncomplete implique toujours purge (jamais signaler sans avoir purgé)', () => {
    [{ dataDeleted: true, error: 'x' }, { success: true }, null, { error: 'y' }].forEach((res) => {
      const dec = decide(res);
      if (dec.authIncomplete) expect(dec.purge).toBe(true);
    });
  });
});
