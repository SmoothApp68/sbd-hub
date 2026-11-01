// v2/js/mentions.js — Mentions légales, Confidentialité, Santé (212). MODULE DE TEXTES : aucun calcul, aucune lecture,
// aucune écriture. Les écrans lisent `THMentions.pages` ; la ligne contact ne s'affiche pas tant qu'elle vaut le marqueur.
// Ce ne sont pas des conseils juridiques : à faire relire avant toute ouverture au public. (Hors garde de voix I26 : textes légaux.)
(function (racine) {
  'use strict';

  var A_COMPLETER = 'À COMPLÉTER';
  // Le contact de l'éditeur. Tant qu'il vaut le marqueur, rien ne s'affiche à l'écran.
  var CONTACT = A_COMPLETER;
  var AGE_MINIMUM = 15;

  var SANTE = 'TrainHub t’aide à t’entraîner, ce n’est pas un avis médical. Avant de commencer ou de reprendre, demande l’avis d’un médecin si tu as une maladie, une blessure, des douleurs, si tu es enceinte ou si tu viens d’accoucher. Arrête la série si tu as mal, et note-le : le coach adaptera la suite. L’app est réservée aux personnes de ' + AGE_MINIMUM + ' ans et plus.';

  function contactAffichable() { return CONTACT !== A_COMPLETER && String(CONTACT).trim() !== ''; }

  // Une page : { cle, titre, blocs: [{ titre?, texte }] }
  function pages() {
    var mentions = [
      { titre: 'Éditeur', texte: 'Aurélien, à titre personnel.' }
    ];
    if (contactAffichable()) mentions.push({ titre: 'Contact', texte: CONTACT });
    mentions.push(
      { titre: 'Hébergement de l’app', texte: 'Cloudflare, Inc. (Cloudflare Pages).' },
      { titre: 'Base de données', texte: 'Supabase, région UE (Irlande, eu-west-1).' }
    );
    return [
      { cle: 'mentions', titre: 'Mentions légales', blocs: mentions },
      { cle: 'confidentialite', titre: 'Confidentialité', blocs: [
        { titre: 'Ce qui est enregistré',
          texte: 'Ton compte, tes séances et leurs séries, tes routines, tes réponses au questionnaire, tes pesées si tu en notes, tes marques de douleur « J’ai mal », tes zones à ménager, et tes relations dans le jeu et la guilde.' },
        { titre: 'Pourquoi', texte: 'Pour faire fonctionner le coach : sans ton historique, il ne peut rien t’expliquer.' },
        { titre: 'Où', texte: 'Dans l’Union européenne (Irlande).' },
        { titre: 'Qui le voit', texte: 'Toi. Tes amis et ta guilde voient seulement ce que tu partages.' },
        { titre: 'Revente et publicité', texte: 'Aucune revente de tes données, aucune publicité.' },
        { titre: 'Tes droits',
          texte: 'Tu peux exporter tes données (Profil › Mon compte › Exporter mes données), supprimer ton compte (Profil, tout en bas) et rectifier ce qui est faux depuis ton profil. Tu peux aussi adresser une réclamation à la CNIL.' }
      ] },
      { cle: 'sante', titre: 'Santé', blocs: [{ texte: SANTE }] }
    ];
  }

  function page(cle) {
    var l = pages();
    for (var i = 0; i < l.length; i++) if (l[i].cle === cle) return l[i];
    return null;
  }

  var api = { pages: pages, page: page, contactAffichable: contactAffichable, A_COMPLETER: A_COMPLETER,
              CONTACT: CONTACT, AGE_MINIMUM: AGE_MINIMUM, SANTE: SANTE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  racine.THMentions = api;
})(typeof self !== 'undefined' ? self : globalThis);
