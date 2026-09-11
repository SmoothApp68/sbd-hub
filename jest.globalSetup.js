// jest.globalSetup.js — fixe le fuseau horaire AVANT le démarrage des workers.
//
// Pourquoi c'est nécessaire. `sessions.debut` est un `timestamptz` : la base
// stocke un instant, et c'est l'heure LOCALE de la personne qui décide dans
// quel jour — donc dans quelle semaine — la séance tombe. Un runner en UTC ne
// peut pas distinguer `getDay()` de `getUTCDay()`, puisque les deux y donnent
// le même résultat : le test qui protège cette règle passerait sans rien
// prouver.
//
// `process.env.TZ` posé dans un fichier de test arrive trop tard — Node fige le
// fuseau au premier usage de Date, bien avant. Seul un globalSetup, exécuté
// dans le process principal, est hérité par les workers.
//
// Europe/Paris est le fuseau réel de l'utilisateur. Vérifié : la suite complète
// passe à l'identique sous ce fuseau (940 verts), aucun test existant n'en
// dépendait.
module.exports = function () {
  process.env.TZ = 'Europe/Paris';
};
