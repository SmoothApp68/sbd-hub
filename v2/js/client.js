// v2/js/client.js — instance unique du client Supabase.
//
// Le SDK est bundlé dans v2/vendor/supabase.js (aucun CDN externe, contrainte
// du dépôt) et expose le global `supabase`.

(function (racine) {
  'use strict';

  var instance = null;

  // UNE SEULE définition de la clé de stockage du jeton. `auth.js` la relit pour
  // sa sonde synchrone ; l'écrire deux fois serait se donner deux vérités sur
  // l'endroit où vit la session.
  var CLE_AUTH = 'th-v2-auth';

  function obtenir() {
    if (instance) return instance;
    if (typeof racine.supabase === 'undefined' || !racine.supabase.createClient) {
      throw new Error('SDK Supabase absent : v2/vendor/supabase.js doit être chargé avant client.js');
    }
    var cfg = racine.THConfig;
    instance = racine.supabase.createClient(cfg.URL, cfg.CLE_PUBLISHABLE, {
      auth: {
        // Session persistée : l'app doit rester connectée après fermeture.
        persistSession: true,
        autoRefreshToken: true,
        // Clé de stockage propre à la v2 : aucune collision avec les clés du v1.
        storageKey: CLE_AUTH
      }
    });
    return instance;
  }

  racine.THClient = { obtenir: obtenir, CLE_AUTH: CLE_AUTH };
})(typeof self !== 'undefined' ? self : this);
