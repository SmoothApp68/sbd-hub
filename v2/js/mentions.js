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
      // fidèle à la page de Cloudflare https://www.cloudflare.com/turnstile-privacy-policy/ (relue le 05/11/2026 : signaux
      // techniques — IP, empreinte TLS, User-Agent —, finalité unique la détection des robots, intérêt légitime ; rien sur la
      // publicité ni sur la durée de conservation : on n'en dit donc rien).
      { titre: 'Vérification anti-robot', texte: 'Cloudflare Turnstile, à la connexion, à l’inscription et à la réinitialisation du mot de passe. Cloudflare traite alors des données techniques de ton navigateur pour distinguer une personne d’un robot (sécurité du service, intérêt légitime). Détails : cloudflare.com/turnstile-privacy-policy.' }
    );
    return [
      { cle: 'mentions', titre: 'Mentions légales', blocs: mentions },
      { cle: 'confidentialite', titre: 'Confidentialité', blocs: [
        { titre: 'Ce qui est enregistré',
          texte: 'Ton compte, tes séances et leurs séries, tes routines, tes réponses au questionnaire, tes pesées si tu en notes, tes marques de douleur « J’ai mal », tes zones à ménager, tes notes d’exercice et de séance, et tes relations dans le jeu et la guilde.' },
        { titre: 'Pourquoi', texte: 'Pour faire fonctionner le coach : sans ton historique, il ne peut rien t’expliquer.' },
        { titre: 'Où', texte: 'Dans l’Union européenne (Irlande), sauf les textes envoyés à l’IA (ci-dessous).' },
        // 250 — l'IA (Demander au coach, Lire mes notes). Hors garde de voix : texte légal, comme le reste du fichier.
        // Sources relues le 05/11/2026 : conditions commerciales d'Anthropic (« Anthropic may not train models on Customer Content
        // from Services »), son DPA (clauses contractuelles types de la Commission européenne, modules 2 et 3), son centre de
        // confidentialité (suppression « within 30 days » ; jusqu'à « 2 years » si un contrôle de sécurité signale l'échange).
        { titre: 'L’IA : ce qui part',
          texte: 'Demander au coach : ta question et la consigne dont tu parles. Lire mes notes : le texte des notes qui contiennent un mot d’entraînement, coupé à 500 signes, sans lien, sans @pseudo ni date, avec le nom de l’exercice et les chiffres de ses séries. Une douleur ne part jamais : elle reste sur ton téléphone.' },
        { titre: 'L’IA : à qui', texte: 'À Anthropic (Claude), aux États-Unis, qui agit comme sous-traitant, avec les clauses contractuelles types de la Commission européenne.' },
        { titre: 'L’IA : combien de temps',
          texte: 'Demander au coach : tes questions sont gardées 30 jours chez TrainHub, sans ton nom. Lire mes notes : rien n’est gardé chez TrainHub. Anthropic efface les textes sous 30 jours, et jusqu’à 2 ans si un contrôle de sécurité les signale.' },
        { titre: 'L’IA : jamais pour entraîner', texte: 'Anthropic ne s’en sert pas pour entraîner ses modèles.' },
        { titre: 'L’IA : sur quelle base', texte: 'Ton accord, que tu donnes d’un toucher et que tu retires dans Profil › Mon coach › Lire mes notes.' },
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
