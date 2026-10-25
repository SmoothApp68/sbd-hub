// supabase/functions/demander-coach/controle.js — les contrôles de « Demander au coach » (160).
//
// PUR, SANS DENO : importé par la fonction (`index.ts`, effet de bord, le résultat se lit sur `globalThis.THControle`)
// et par Jest (`require`). Rien ici ne parle au réseau, à la base ni à l'horloge.
//
// L'IA EXPLIQUE une décision du moteur, elle n'en prend jamais. Ces contrôles tiennent ce qu'elle n'a pas le droit de faire :
//   · un NOMBRE absent du contexte (ni dans ce que l'app a envoyé, ni dans la question) → la réponse n'est pas montrée ;
//   · plus de 3 phrases → on garde les 3 premières ; un mot de louange → la phrase qui le porte est retirée ;
//   · une douleur ou une blessure → aucun appel au modèle (`estSante`) ;
//   · un contexte qui sort de la liste blanche (une clé inattendue, une date) → refusé.

(function (racine) {
  'use strict';

  var MAX_PHRASES = 3;
  var MAX_QUESTION = 500;
  // Les mots refusés : la phrase qui les porte est retirée (le coach dit un fait, jamais un bravo).
  var MOTS_REFUSES = ['bravo', 'félicit', 'génial'];

  // ── Les nombres ─────────────────────────────────────────────────────────
  // « 130,4 » = « 130.4 » ; « 12 » = « 12.0 » ; « 1 000 » (espace, insécable ou fine) = 1000. Rend des nombres.
  function nombresDe(texte, sansGroupes) {
    var s = String(texte === null || texte === undefined ? '' : texte);
    var out = [];
    var re = sansGroupes ? /\d+(?:[.,]\d+)?/g : /\d{1,3}(?:[\u00a0\u202f ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g;
    var m;
    while ((m = re.exec(s)) !== null) {
      var v = Number(m[0].replace(/[\u00a0\u202f ]/g, '').replace(',', '.'));
      if (isFinite(v)) out.push(v);
    }
    return out;
  }

  // ── Les phrases ─────────────────────────────────────────────────────────
  // On coupe après . ! ? … suivis d'une espace puis d'une majuscule, d'un guillemet ou d'un chiffre : « 130.4 » reste entier.
  function phrasesDe(texte) {
    var s = String(texte || '').replace(/\s+/g, ' ').trim();
    if (!s) return [];
    return s.split(/(?<=[.!?\u2026])\s+(?=[A-Z\u00c0-\u00d6\u00d8-\u00de\u00ab"\u201c(\d])/).map(function (p) { return p.trim(); }).filter(Boolean);
  }

  function contientMotRefuse(phrase) {
    var b = String(phrase).toLowerCase();
    return MOTS_REFUSES.some(function (m) { return b.indexOf(m) >= 0; });
  }

  // controlerReponse(reponse, contexteTexte, question) → { ok, raison, texte }
  //   · `raison` : 'nombre_absent' | 'vide' | null ; `texte` : la réponse à montrer (3 phrases au plus, sans mot refusé).
  function controlerReponse(reponse, contexteTexte, question) {
    var phrases = phrasesDe(reponse).filter(function (p) { return !contientMotRefuse(p); });
    if (!phrases.length) return { ok: false, raison: 'vide', texte: '' };
    var texte = phrases.slice(0, MAX_PHRASES).join(' ');
    // Le contexte se lit aussi SANS regrouper les milliers : « 20 130,4 » (deux séries côte à côte) n'est pas 20 130,4.
    var connus = nombresDe(contexteTexte).concat(nombresDe(contexteTexte, true), nombresDe(question), nombresDe(question, true));
    var absent = nombresDe(texte).some(function (n) { return connus.indexOf(n) < 0; });
    if (absent) return { ok: false, raison: 'nombre_absent', texte: '' };
    return { ok: true, raison: null, texte: texte };
  }

  // ── La santé ────────────────────────────────────────────────────────────
  // ⚠️ LA MÊME LISTE EST DANS LE TÉLÉPHONE (`v2/js/assistant.js`, `MOTIFS_SANTE`) : `tests/unit/v2-assistant-controle.test.js`
  // prouve qu'elles sont identiques. Une douleur ne part JAMAIS chez le modèle. À écrire avec soin : « je m'y prends mal »
  // ne déclenche pas, « mal au genou » oui.
  // ── La santé : une douleur ne part JAMAIS (166, D4) ─────────────────────
  // Le motif exige une PARTIE du corps ou « ça » : « tirage », « tirer la barre », « tire-bouchon » ne sont pas des douleurs.
  var PARTIES = 'dos|genou|genoux|epaule|epaules|coude|coudes|poignet|poignets|hanche|hanches|cheville|chevilles|cou|nuque|tete|ventre|coeur|poitrine|thorax|cuisse|cuisses|mollet|mollets|biceps|triceps|pied|pieds|main|mains|bras|jambe|jambes|lombaires|cote|cotes|pec|pecs|fesse|fesses|aine|tendon|tendons|articulation|articulations|ischio|ischios|quadriceps';
  var MOTIFS_SANTE = [
    '\\b(?:douleurs?|douloureu[xs]e?s?|blessures?|blesse|blessee|tendinites?|tendinopathies?|claquage|claquages|claque|claquee|dechirures?|dechire|dechiree|entorses?|luxations?|fractures?|hernies?|lumbago|sciatique|contractures?|elongations?|inflammations?|vertiges?|malaises?|nausees?|palpitations?|elancements?|pincements?|picotements?|souffrances?|souffre)\\b',
    "\\bj'?ai (?:tres |vraiment |super |trop )?mal\\b",
    '\\bavoir (?:tres |vraiment )?mal\\b',
    '\\bme sens (?:tres |vraiment )?mal\\b',
    '\\bfai(?:t|ts) (?:tres |vraiment |super |trop )?mal\\b',
    '\\bmal (?:au|aux)\\b',
    "\\bmal a (?:l'|la |le |les |mon |ma |mes |ton |ta |tes |son |sa |ses )",
    '\\bmal (?:de |du |des )(?:' + PARTIES + ')\\b',
    "\\bmal dans (?:le |la |les |l'|mon |ma |mes )",
    '\\b(?:' + PARTIES + ') qui (?:tire|tirent|craque|craquent|claque|lache|bloque|brule|pique|gonfle|fait|me|saute|coince|grince|cede)\\b',
    '\\b(?:dos|genou|genoux|epaule|epaules|cou|nuque|poignet|coude|hanche|cheville) (?:est |sont )?(?:bloque|bloques|coince|coinces|gonfle|gonfles|enfle|enfles)\\b',
    "\\b(?:mon|ma|mes|ton|ta|tes|le|la|les|l'|son|sa|ses) ?(?:" + PARTIES + ') (?:me )?(?:tire|tirent|pince|pincent|lance|lancent|brule|brulent|picote|elance|gene|genent|craque|craquent|claque|coince|grince|fait souffrir)\\b',
    "\\b(?:pince|pincement|tire|tirent|lance|elancement|brulure|picotement|gene) (?:dans|a|au|aux|sur) (?:le |la |les |l'|mon |ma |mes )?(?:" + PARTIES + ')\\b',
    "\\bca (?:me |m')?(?:fait souffrir|lance|pince|coince|tire|brule|craque|claque|elance|gene|picote)\\b",
    '\\b(?:une |la |ma |cette |de la )?gene (?:a |au |aux |dans |sur |autour |sous )',
    "\\bj'?ai (?:une |un )?(?:legere |petite |vague |grosse )?gene\\b"
  ];
  function normaliser(texte) {
    return String(texte || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u2019\u2018`\u00b4]/g, "'").replace(/\s+/g, ' ');
  }
  var REGEX_SANTE = MOTIFS_SANTE.map(function (m) { return new RegExp(m); });
  function estSante(question) {
    var q = normaliser(question);
    return REGEX_SANTE.some(function (re) { return re.test(q); });
  }

  // ── Le contexte reçu : liste blanche, longueurs bornées, aucune date ─────
  var CHAMPS_TEXTE = { exercice: 120, consigne: 240, coach: 300, zone: 300, palier: 300, etat: 600, compteur: 300,
                       frere: 300, chauffes: 300, reglage: 300, etat_cle: 40 };
  // ── Les dates : une seule liste de motifs, copiée dans la fonction (`MOTIFS_DATE`), prouvée identique par un test ──
  // Une VRAIE date seulement (166, D1) : « le 13 sept. », « le 3 octobre 2026 », « 24/10 », ISO, noms de jours, « hier »,
  // « il y a N jours ». « de 5 reps », « de 3 min », « de 12 kg » n'en sont pas : le mois est nommé, jamais deviné.
  // (la liste des jours s'écrit en deux morceaux : elle ne s'écrit en entier que dans le formateur, `modele.js`)
  var MOIS = 'janv(?:ier)?|f[ée]vr(?:ier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|ao[uû]t|sept(?:embre)?|oct(?:obre)?|nov(?:embre)?|d[ée]c(?:embre)?';
  var JOURS = '(?:(?:lun|mar|mercre|jeu|vendre|sam)di|diman' + 'che)';
  var PREP = '(?:(?:depuis le|le|du|de) )?';
  var MOTIFS_DATE = [
    '\\b' + PREP + '\\d{4}-\\d{2}-\\d{2}\\b',
    '\\b' + PREP + '\\d{1,2}(?:er)?\\s+(?:' + MOIS + ')(?![a-zéûèôî])\\.?(?:\\s+\\d{4})?',
    '\\b' + PREP + '(?:0?[1-9]|[12]\\d|3[01])/(?:0?[1-9]|1[0-2])(?:/\\d{2,4})?(?![\\d/])',
    '\\b' + PREP + '(?:0?[1-9]|[12]\\d|3[01])\\.(?:0?[1-9]|1[0-2])\\.\\d{2,4}\\b',
    '\\b(?:(?:de|du|le) )?' + JOURS + '(?: dernier)?\\b',
    '\\b(?:avant-hier|hier)\\b',
    '\\bil y a \\d+ (?:jours?|semaines?|mois)\\b'
  ];
  var REGEX_DATE = MOTIFS_DATE.map(function (m) { return new RegExp(m, 'i'); });
  function contientDate(texte) {
    var t = String(texte === null || texte === undefined ? '' : texte).replace(/[  ]/g, ' ');
    return REGEX_DATE.some(function (re) { return re.test(t); });
  }
  function sansDate(texte) {
    var t = String(texte === null || texte === undefined ? '' : texte);
    t = t.replace(/[  ]/g, ' ');
    // « Hier, tu as fait… » en tête de phrase : la phrase garde sa majuscule.
    t = t.replace(/(^|[.!?]\s+)(?:avant-)?hier,?\s+(\S)/gi, function (m, a, c) { return a + c.toUpperCase(); });
    MOTIFS_DATE.forEach(function (m) { t = t.replace(new RegExp('\\s*' + m, 'gi'), ''); });
    return t.replace(/ +([,.:;])/g, '$1').replace(/([.!?]),/g, '$1').replace(/ {2,}/g, ' ').trim();
  }

  // Le filtre de la fonction (166, D7) : le MÊME que l'app, quel que soit le format, sur la question et sur le contexte.
  var MAX_CORPS = 16384;   // octets : le plus grand contexte permis tient en moins de 12 Ko
  function corpsTropGros(longueur, max) {
    var n = Number(longueur);
    return longueur !== null && longueur !== undefined && longueur !== '' && isFinite(n) && n > (max || MAX_CORPS);
  }
  function nettoyerQuestion(q) { return sansDate(q); }
  function nettoyerValeur(v) {
    if (typeof v === 'string') return sansDate(v);
    if (Array.isArray(v)) return v.map(nettoyerValeur);
    if (v && typeof v === 'object') {
      var o = {};
      Object.keys(v).forEach(function (k) { o[k] = nettoyerValeur(v[k]); });
      return o;
    }
    return v;
  }
  function nettoyerContexte(c) { return nettoyerValeur(c); }
  function texteBorne(v, max) { return typeof v === 'string' && v.length <= max; }

  // verifierContexte(c) → { ok, raison } : `raison` dit la première clé fautive.
  function verifierContexte(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return { ok: false, raison: 'contexte' };
    var cles = Object.keys(c);
    for (var i = 0; i < cles.length; i++) {
      var k = cles[i], v = c[k];
      if (Object.prototype.hasOwnProperty.call(CHAMPS_TEXTE, k)) {
        if (v === null) continue;
        if (!texteBorne(v, CHAMPS_TEXTE[k])) return { ok: false, raison: k };
      } else if (k === 'lignes' || k === 'derniere') {
        if (!Array.isArray(v) || v.length > 12) return { ok: false, raison: k };
        for (var j = 0; j < v.length; j++) {
          var l = v[j];
          if (!l || typeof l !== 'object' || Object.keys(l).some(function (x) { return x !== 'texte' && x !== 'role'; }) ||
              !texteBorne(l.texte, 120) || !(l.role === null || l.role === undefined || texteBorne(l.role, 200))) return { ok: false, raison: k };
        }
      } else if (k === 'crans') {
        if (!v || typeof v !== 'object' || Object.keys(v).some(function (x) { return x !== 'genre' && x !== 'charges'; }) ||
            (v.genre !== 'salle' && v.genre !== 'faites') || !Array.isArray(v.charges) || v.charges.length > 24 ||
            !v.charges.every(function (x) { return texteBorne(x, 20); })) return { ok: false, raison: k };
      } else if (k === 'seances') {
        if (!Array.isArray(v) || v.length > 3 || !v.every(function (s) {
          return Array.isArray(s) && s.length <= 12 && s.every(function (x) { return texteBorne(x, 40); });
        })) return { ok: false, raison: k };
      } else {
        return { ok: false, raison: k };   // une clé inattendue : refusée
      }
    }
    if (contientDate(JSON.stringify(c))) return { ok: false, raison: 'date' };
    return { ok: true, raison: null };
  }

  // ── CORS ────────────────────────────────────────────────────────────────
  function origineAutorisee(origine) {
    var o = String(origine || '');
    return o === 'https://sbd-hub.pages.dev' || /^https:\/\/[a-z0-9-]+\.sbd-hub\.pages\.dev$/.test(o) ||
      /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(o);
  }

  var api = {
    nombresDe: nombresDe, phrasesDe: phrasesDe, controlerReponse: controlerReponse, estSante: estSante,
    verifierContexte: verifierContexte, origineAutorisee: origineAutorisee, normaliser: normaliser,
    MOTIFS_SANTE: MOTIFS_SANTE, MOTIFS_DATE: MOTIFS_DATE, sansDate: sansDate, contientDate: contientDate,
    nettoyerQuestion: nettoyerQuestion, nettoyerContexte: nettoyerContexte, corpsTropGros: corpsTropGros, MAX_CORPS: MAX_CORPS, MAX_QUESTION: MAX_QUESTION, MAX_PHRASES: MAX_PHRASES
  };
  racine.THControle = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
