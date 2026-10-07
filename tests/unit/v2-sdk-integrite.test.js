/** @jest-environment node */
//
// 59-2 — LE SDK SUPABASE EST FIGÉ PAR SON EMPREINTE (SRI).
//
// `v2/vendor/supabase.js` est versé au dépôt (aucun CDN). La page le charge
// avec `integrity="sha384-…"` : un fichier qui changerait — remplacé à la main,
// altéré en route — ne s'exécute pas. Ce test refuse qu'on change le fichier
// sans changer l'empreinte (ou l'inverse) : sinon l'app ne démarrerait plus.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const V2 = path.join(__dirname, '../../v2');

describe('59-2 — l’empreinte du SDK', () => {
  const sdk = fs.readFileSync(path.join(V2, 'vendor/supabase.js'));
  const index = fs.readFileSync(path.join(V2, 'index.html'), 'utf8');

  test('⚠️ la balise du SDK porte l’empreinte sha384 du fichier versé', () => {
    const balises = index.match(/<script[^>]*vendor\/supabase\.js[^>]*>/g) || [];
    expect(balises).toHaveLength(1);
    const m = /integrity="sha384-([A-Za-z0-9+/=]+)"/.exec(balises[0]);
    expect(m).not.toBeNull();
    expect(m[1]).toBe(crypto.createHash('sha384').update(sdk).digest('base64'));
  });

  test('le fichier relevé le 07/10/2026 (SHA-256) : un changement du SDK est un geste conscient', () => {
    expect(crypto.createHash('sha256').update(sdk).digest('hex'))
      .toBe('4e0497735b6919dca6213324cbae9e81e9d0e046b77f84bde20108d505298481');
    expect(sdk.toString('utf8')).toMatch(/"2\.105\.1"/);
  });
});
