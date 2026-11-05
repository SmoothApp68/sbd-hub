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

  // 218 — le crédit des silhouettes du bonhomme des muscles et le texte de leur licence (MIT), à conserver avec elles.
  var LICENCE_SILHOUETTES = [
    'MIT License',
    'Copyright (c) 2022 ELABBASSI Hicham',
    'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:',
    'The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.',
    'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.'
  ].join('\n\n');

  function contactAffichable() { return CONTACT !== A_COMPLETER && String(CONTACT).trim() !== ''; }

  // Une page : { cle, titre, blocs: [{ titre?, texte }] }
  function pages() {
    var mentions = [
      { titre: 'Éditeur', texte: 'Aurélien, à titre personnel.' }
    ];
    if (contactAffichable()) mentions.push({ titre: 'Contact', texte: CONTACT });
    mentions.push(
      { titre: 'Hébergement de l’app', texte: 'Cloudflare, Inc. (Cloudflare Pages).' },
      { titre: 'Base de données', texte: 'Supabase, région UE (Irlande, eu-west-1).' },
      // 247 — sous-traitant de la vérification anti-robot (connexion, inscription, mot de passe oublié). Phrase courte,
      // sans promesse non relue : la page de Cloudflare sur Turnstile est https://www.cloudflare.com/turnstile-privacy-policy/
      // (non relue en séance : accès web refusé ; Aurélien relit ce qu'elle dit avant d'ajouter un engagement, par exemple
      // sur les cookies). Base légale annoncée : intérêt légitime, la sécurité du service.
      { titre: 'Vérification anti-robot', texte: 'Cloudflare Turnstile, à la connexion, à l’inscription et à la réinitialisation du mot de passe. Cloudflare traite alors des données techniques de ton navigateur pour distinguer une personne d’un robot (sécurité du service, intérêt légitime). Détails : cloudflare.com/turnstile-privacy-policy.' }
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
      { cle: 'sante', titre: 'Santé', blocs: [{ texte: SANTE }] },
      { cle: 'credits', titre: 'Crédits', blocs: [
        { titre: 'Silhouettes du bonhomme des muscles',
          texte: 'Les tracés du corps viennent de react-native-body-highlighter 3.2.0 (licence MIT, © 2022 ELABBASSI Hicham). Texte de la licence ci-dessous.' },
        { titre: 'Licence MIT', texte: LICENCE_SILHOUETTES }
      ] }
    ];
  }

  function page(cle) {
    var l = pages();
    for (var i = 0; i < l.length; i++) if (l[i].cle === cle) return l[i];
    return null;
  }

  var api = { pages: pages, page: page, contactAffichable: contactAffichable, A_COMPLETER: A_COMPLETER,
              CONTACT: CONTACT, AGE_MINIMUM: AGE_MINIMUM, SANTE: SANTE, LICENCE_SILHOUETTES: LICENCE_SILHOUETTES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  racine.THMentions = api;
})(typeof self !== 'undefined' ? self : globalThis);
