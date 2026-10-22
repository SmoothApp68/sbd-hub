/** @jest-environment node */
//
// 134 — L'iPhone, la partie technique (audit iPhone du 21/10/2026). Les gardes de la coquille et des styles.

const fs = require('fs');
const path = require('path');

const lire = (f) => fs.readFileSync(path.join(__dirname, '../../v2', f), 'utf8');
const css = lire('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
const regle = (sel) => {
  const re = new RegExp('(?:^|})\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'm');
  const m = css.match(re);
  return m ? m[1] : null;
};

describe('I-09 — le bas des feuilles laisse la place à la barre d’accueil', () => {
  test('⚠️ DISCRIMINANT — `.voile` : padding-bottom = max(l’actuel, env(safe-area-inset-bottom))', () => {
    const r = regle('.voile');
    expect(r).not.toBeNull();
    expect(r).toMatch(/padding:var\(--e4\)/);
    expect(r).toMatch(/padding-bottom:\s*max\(\s*var\(--e4\)\s*,\s*env\(safe-area-inset-bottom\s*,\s*0px\)\s*\)/);
  });

  test('la navigation du bas l’avait déjà', () => {
    expect(regle('.onglets')).toMatch(/env\(safe-area-inset-bottom/);
  });
});
