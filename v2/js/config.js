// v2/js/config.js — configuration du projet Supabase.
//
// La clé « publishable » est conçue pour vivre dans un client public : elle
// n'ouvre que ce que les politiques RLS autorisent. La vraie barrière est le
// RLS, pas le secret de cette chaîne. Mêmes valeurs que le v1 — c'est le même
// projet Supabase, pas une copie de code v1.

(function (racine) {
  'use strict';
  var api = {
    URL: 'https://swwygywahfdenyzotrce.supabase.co',
    CLE_PUBLISHABLE: 'sb_publishable_JDEEN5nMLQjvfWOX0UfBNw_R38Olz-T',
    // 247 — la clé de SITE du captcha Cloudflare Turnstile. Comme CLE_PUBLISHABLE, elle est PUBLIQUE ; la clé SECRÈTE
    // ne vit que dans Supabase (Authentication › Bot and Abuse Protection), JAMAIS dans le dépôt. VIDE = captcha
    // désactivé côté app : aucun script chargé, aucun widget, appels d'authentification identiques à ceux d'avant.
    // Ordre de mise en service : poser la clé ICI et la mettre en ligne AVANT d'activer le réglage dans Supabase.
    TURNSTILE_SITE_KEY: ''
  };
  racine.THConfig = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
