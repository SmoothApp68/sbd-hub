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
    CLE_PUBLISHABLE: 'sb_publishable_JDEEN5nMLQjvfWOX0UfBNw_R38Olz-T'
  };
  racine.THConfig = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
