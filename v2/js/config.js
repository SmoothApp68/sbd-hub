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
    TURNSTILE_SITE_KEY: '',
    // 250 (L9) — « Lire mes notes » : l'interrupteur de MISE EN SERVICE (décision d'Aurélien du 05/11/2026). FAUX : l'accord ne s'affiche
    // pas, la section du Profil n'existe pas, aucune note n'est lue ni envoyée. On l'allume par une PR d'une ligne, une fois les 60 cas
    // joués par Claude.ai contre `lire-notes` déployée (`v2-atelier/banc/notes-ia/`).
    // 254 (06/11/2026) — ALLUMÉ : les 60 cas sont passés (22 montrées, 0 fausse ; v2-atelier/banc/notes-ia/RESULTATS-2026-11-06.md),
    // `lire-notes` redéployée depuis main après la PR 252.
    NOTES_IA_OUVERTE: true
  };
  racine.THConfig = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
