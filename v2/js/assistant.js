// v2/js/assistant.js — « Demander au coach » (160, décisions d'Aurélien du 24/10/2026).
//
// L'IA EXPLIQUE une décision du moteur, elle n'en prend jamais. Depuis la feuille « Pourquoi cette consigne » (et nulle
// part ailleurs), une question sur la ligne part à la fonction Edge `demander-coach`, qui rend trois phrases rédigées par
// un modèle — après avoir contrôlé que chaque nombre de la réponse est dans le contexte.
//
// ⚠️ RIEN N'EST CALCULÉ ICI. Le contexte (`contexteDe`) est tiré du PLAN (`x`, le plan d'un exercice : ses paragraphes
// « Pourquoi », ses lignes), des FAITS (les séances de l'exercice, lues par l'appelant dans `faits.js`) et de la salle
// (`Profil.salleDeLExercice`, lue par l'appelant). Une décision du coach ne se recalcule pas ici : elle se recopie.
// Jamais dans le contexte : nom, pseudo, id, date, poids du corps, notes libres. Les dates que le coach écrit dans ses
// phrases (« mardi », « le 13 sept. ») sont retirées (`sansDate`).
//
// ⚠️ `estSante` EST LA MÊME LISTE QUE CELLE DE LA FONCTION (`supabase/functions/demander-coach/controle.js`) : copiée, parce
// que ce dossier n'est pas servi ; `tests/unit/v2-assistant-controle.test.js` prouve que les deux listes sont identiques.
// Une douleur ne part jamais.
//
// La conversation vit EN MÉMOIRE seulement (rien en cache, rien en base côté app). La seule chose gardée : le nombre de
// questions qui restent aujourd'hui, en mémoire, pour le jour.

(function (racine) {
  'use strict';

  var MAX_PAR_JOUR = 10;
  var MAX_QUESTION = 500;

  // ── La santé (copie de controle.js, prouvée identique par un test) ──────
  var PARTIES = 'dos|genou|genoux|epaule|epaules|coude|coudes|poignet|poignets|hanche|hanches|cheville|chevilles|cou|nuque|tete|ventre|coeur|poitrine|thorax|cuisse|cuisses|mollet|mollets|biceps|triceps|pied|pieds|main|mains|bras|jambe|jambes|lombaires|cote|cotes|pec|pecs|fesse|fesses|aine|tendon|tendons|articulation|articulations|ischio|ischios|quadriceps';
  var MOTIFS_SANTE = [
    '\\b(?:douleurs?|douloureu[xs]e?s?|blessures?|blesse|blessee|tendinites?|tendinopathies?|claquage|claquages|claque|claquee|dechirures?|dechire|dechiree|entorses?|luxations?|fractures?|hernies?|lumbago|sciatique|contractures?|elongations?|inflammations?|vertiges?|malaises?|nausees?|palpitations?)\\b',
    "\\bj'?ai (?:tres |vraiment |super |trop )?mal\\b",
    '\\bavoir (?:tres |vraiment )?mal\\b',
    '\\bme sens (?:tres |vraiment )?mal\\b',
    '\\bfai(?:t|ts) (?:tres |vraiment |super |trop )?mal\\b',
    '\\bmal (?:au|aux)\\b',
    "\\bmal a (?:l'|la |le |les |mon |ma |mes |ton |ta |tes |son |sa |ses )",
    '\\bmal (?:de |du |des )(?:' + PARTIES + ')\\b',
    "\\bmal dans (?:le |la |les |l'|mon |ma |mes )",
    '\\b(?:' + PARTIES + ') qui (?:tire|tirent|craque|craquent|claque|lache|bloque|brule|pique|gonfle|fait|me|saute|coince|grince|cede)\\b',
    '\\b(?:dos|genou|genoux|epaule|epaules|cou|nuque|poignet|coude|hanche|cheville) (?:est |sont )?(?:bloque|bloques|coince|coinces|gonfle|gonfles|enfle|enfles)\\b'
  ];
  var REGEX_SANTE = MOTIFS_SANTE.map(function (m) { return new RegExp(m); });
  function normaliser(texte) {
    return String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[’‘`´]/g, "'").replace(/\s+/g, ' ');
  }
  function estSante(question) {
    var q = normaliser(question);
    return REGEX_SANTE.some(function (re) { return re.test(q); });
  }

  // ── Les textes locaux (aucune IA) ───────────────────────────────────────
  var TEXTES = {
    bouton: 'Demander au coach',
    parJour: MAX_PAR_JOUR + ' questions par jour',
    horsLigne: 'Demande le réseau',
    mention: 'Rédigé par une IA à partir de la consigne du coach.',
    sante: 'Je ne réponds pas sur une douleur. Dis-le au coach avec « J’ai mal » : il adapte ta séance.',
    quota: 'Tu as posé tes ' + MAX_PAR_JOUR + ' questions d’aujourd’hui. Le compteur repart demain.',
    indisponible: 'Je ne peux pas répondre pour l’instant. Regarde la feuille Pourquoi, ou réessaie plus tard.',
    reseau: 'Pas de réseau : je ne peux pas répondre.',
    bloquee: 'Je n’ai pas de réponse sûre : regarde la feuille Pourquoi.',
    accordTitre: 'Avant ta première question',
    accord: [
      ['Pour rédiger la réponse, ', 'ta question et la consigne de cet exercice', ' (charges, reps, tes 3 dernières séances) partent chez ', 'Anthropic, aux États-Unis', '.'],
      ['', 'Rien qui t’identifie', ' : ni nom, ni pseudo, ni date. Anthropic ne s’en sert pas pour entraîner ses modèles.'],
      ['', 'Une douleur ne part jamais', ' : l’app te renvoie vers « J’ai mal ».'],
      ['La réponse ', 'explique', ' la consigne ; elle ne la change jamais.'],
      ['Tes questions sont gardées 30 jours, sans ton nom, pour améliorer les réponses.']
    ],
    accordOk: 'J’ai compris, continuer',
    accordNon: 'Pas maintenant'
  };

  // ── Les dates, retirées ─────────────────────────────────────────────────
  // (écrit en deux morceaux : la liste des jours ne s'écrit que dans le formateur, `modele.js`)
  var JOURS = '(?:(?:lun|mar|mercre|jeu|vendre|sam)di|diman' + 'che)';
  function sansDate(texte) {
    var t = String(texte === null || texte === undefined ? '' : texte);
    t = t.replace(/[  ]/g, ' ');
    t = t.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '');
    // « Hier, tu as fait… » en tête de phrase : la phrase garde sa majuscule.
    t = t.replace(/(^|[.!?]\s+)(?:avant-)?hier,?\s+(\S)/gi, function (m, a, c) { return a + c.toUpperCase(); });
    t = t.replace(new RegExp('\\s*(?:de |du |le )?' + JOURS + '(?: dernier)?\\b', 'gi'), '');
    t = t.replace(/\s*\b(?:le|du|de) \d{1,2}(?:er)? [a-zéûè]+\.?(?: \d{4})?/gi, '');
    t = t.replace(/\s*\b(?:avant-hier|hier)\b/gi, '');
    t = t.replace(/\s*\bil y a \d+ (?:jours?|semaines?|mois)\b/gi, '');
    return t.replace(/ +([,.:;])/g, '$1').replace(/([.!?]),/g, '$1').replace(/ {2,}/g, ' ').trim();
  }
  function net(texte, max) {
    var t = sansDate(texte);
    if (!t) return null;
    return t.length > max ? t.slice(0, max - 1) + '…' : t;
  }

  // ── Les crans du matériel ───────────────────────────────────────────────
  function kg(v) {
    var n = Number(v);
    if (!isFinite(n)) return null;
    return racine.THModele.nombreTexte(n, 2);
  }
  // `salle` : ce que rend `Profil.salleDeLExercice` (`{ materiel, charges }`, charges croissantes) ou null.
  // Les charges de la salle AUTOUR du palier (deux crans de chaque côté de la charge de travail, ou de la ligne) ;
  // sans salle : les charges déjà faites sur cet exercice.
  function cransDe(salle, repere, deja) {
    var liste = salle && salle.materiel !== 'elastique' && Array.isArray(salle.charges)
      ? salle.charges.filter(function (c) { return isFinite(Number(c)); }).map(Number).sort(function (a, b) { return a - b; }) : [];
    if (liste.length) {
      var r = isFinite(Number(repere)) && repere !== null ? Number(repere) : liste[0];
      var i = 0;
      while (i < liste.length - 1 && liste[i] < r) i++;
      // le plus proche de r
      if (i > 0 && Math.abs(liste[i - 1] - r) <= Math.abs(liste[i] - r)) i--;
      var bas = Math.max(0, i - 3), haut = Math.min(liste.length, i + 4);
      return { genre: 'salle', charges: liste.slice(bas, haut).map(kg) };
    }
    var vues = [];
    (deja || []).forEach(function (c) {
      var n = Number(c);
      if (c !== null && c !== undefined && isFinite(n) && n > 0 && vues.indexOf(n) < 0) vues.push(n);
    });
    vues.sort(function (a, b) { return a - b; });
    return vues.length ? { genre: 'faites', charges: vues.slice(-12).map(kg) } : null;
  }

  // ── Le contexte d'une ligne ─────────────────────────────────────────────
  // `e` : { nom, x, groupes, salle }
  //   · x : l'exercice du plan (`planDuSlug`) : `x.pourquoi` (paragraphes, « Donc », lignes), `x.entete`, `x.consigne` ;
  //   · groupes : les séances de l'exercice lues dans `faits.js` (la plus récente d'abord), `[{ seance, series }]` ;
  //   · salle : `Profil.salleDeLExercice`.
  // Rend l'objet que la fonction revérifie (liste blanche) ; `null` si le plan ne dit rien de cet exercice.
  function contexteDe(e) {
    var x = e && e.x, p = x && x.pourquoi;
    if (!x || !p || !x.consigne) return null;
    var Modele = racine.THModele;
    var ctx = { exercice: net(e.nom, 120) || 'cet exercice' };
    var jaune = x.entete && Array.isArray(x.entete.jaune) ? x.entete.jaune.filter(Boolean).join(' ') : '';
    var consigne = net(jaune, 240);
    if (consigne) ctx.consigne = consigne;
    [['coach', p.donc, 300], ['zone', p.zone, 300], ['palier', p.palier, 300], ['etat', p.etat, 600],
     ['compteur', p.compteur, 300], ['frere', p.frere, 300], ['chauffes', p.chauffes, 300], ['reglage', p.reglage, 300]]
      .forEach(function (c) { var v = net(c[1], c[2]); if (v) ctx[c[0]] = v; });
    if (x.consigne.etat) ctx.etat_cle = String(x.consigne.etat).slice(0, 40);
    var lignes = (p.lignes || []).slice(0, 12).map(function (l) {
      return { texte: net(l.texte, 120) || '', role: net([l.libelle, l.raison, l.faite].filter(Boolean).join(' · '), 200) };
    }).filter(function (l) { return l.texte; });
    if (lignes.length) ctx.lignes = lignes;
    var der = ((p.seance && p.seance.lignes) || []).slice(0, 12).map(function (l) {
      return { texte: net(l.texte, 120) || '', role: net(l.role, 200) };
    }).filter(function (l) { return l.texte; });
    if (der.length) ctx.derniere = der;

    // Les 3 dernières séances de cet exercice : « charge × reps », SANS date.
    var deja = [];
    var seances = [];
    (e.groupes || []).forEach(function (g) {
      var vus = [];
      ((g && g.series) || []).forEach(function (s) {
        if (!s || !Modele.estTravail(s)) return;
        if (s.charge_kg !== null && s.charge_kg !== undefined) deja.push(s.charge_kg);
        if (s.reps === null || s.reps === undefined) return;
        vus.push(Modele.serieFaite(s.charge_kg, s.reps));
      });
      if (vus.length && seances.length < 3) seances.push(vus.slice(0, 12).map(function (t) { return net(t, 40); }).filter(Boolean));
    });
    if (seances.length) ctx.seances = seances;
    var repere = x.consigne.palier !== undefined ? x.consigne.palier : null;
    var crans = cransDe(e.salle, repere, deja);
    if (crans) ctx.crans = crans;
    return ctx;
  }

  // ── Les questions toutes prêtes, selon l'état de la ligne ───────────────
  var PUCES_PAR_ETAT = {
    test_propose: ['Pourquoi ce test ?', 'Pourquoi pas plus ?', 'Et après le test ?'],
    retest: ['Pourquoi ce nouveau test ?', 'Pourquoi pas plus ?', 'Et ensuite ?'],
    retest_un_cran: ['Pourquoi ce nouveau test ?', 'Pourquoi pas plus ?', 'Et ensuite ?'],
    garde: ['Pourquoi tu gardes cette charge ?', 'Qu’est-ce qui la ferait monter ?', 'Et ensuite ?'],
    attend: ['Pourquoi tu attends ?', 'Qu’est-ce qui la ferait monter ?', 'Et ensuite ?'],
    tenue_apres_chute: ['Pourquoi tu tiens la charge ?', 'Pourquoi ma série n’est pas comptée ?', 'Et ensuite ?'],
    reprise_courte: ['Pourquoi je reprends plus bas ?', 'Pourquoi pas une rep de plus ?', 'Et ensuite ?'],
    reprise_longue: ['Pourquoi je reprends plus bas ?', 'Pourquoi pas une rep de plus ?', 'Et ensuite ?'],
    salle_max: ['Pourquoi je ne monte plus la charge ?', 'Pourquoi plus de reps ?', 'Et quand j’aurai fait le maximum ?'],
    silence: ['Pourquoi pas de charge proposée ?', 'Comment tu en choisiras une ensuite ?', 'Qu’est-ce que tu retiens de cette séance ?'],
    depart_routine: ['Pourquoi pas de charge proposée ?', 'Comment tu en choisiras une ensuite ?', 'Qu’est-ce que tu retiens de cette séance ?'],
    depart_leste: ['Pourquoi ce départ ?', 'Pourquoi pas plus ?', 'Et ensuite ?'],
    nouvelle_zone: ['Pourquoi cette charge ?', 'Pourquoi ma zone change ?', 'Et ensuite ?']
  };
  var PUCES_DEFAUT = ['Pourquoi cette charge ?', 'Pourquoi pas plus ?', 'Et ensuite ?'];
  function puces(etat) {
    return (PUCES_PAR_ETAT[etat] || PUCES_DEFAUT).slice();
  }

  // ── Le nombre de questions qui restent aujourd'hui (mémoire seulement) ──
  var memoire = { jour: null, reste: null };
  function jourLocal(d) {
    var t = d || new Date();
    return t.getFullYear() + '-' + (t.getMonth() + 1) + '-' + t.getDate();
  }
  function resteDuJour() {
    return memoire.jour === jourLocal() ? memoire.reste : null;
  }
  function noterReste(n) {
    if (typeof n !== 'number' || !isFinite(n) || n < 0) return;
    memoire = { jour: jourLocal(), reste: Math.min(MAX_PAR_JOUR, Math.floor(n)) };
  }
  function oublier() { memoire = { jour: null, reste: null }; }

  // ── L'appel ─────────────────────────────────────────────────────────────
  // demander({ url, jeton, question, slug, contexte, fetch }) → une Promise de :
  //   { genre: 'reponse', texte, reste } · { genre: 'bloquee', texte, reste, sante? } · { genre: 'quota' } ·
  //   { genre: 'accord' } · { genre: 'indisponible' } · { genre: 'reseau' }
  // JAMAIS par la file : une question n'a pas de sens rejouée plus tard.
  function demander(o) {
    var f = o.fetch || racine.fetch;
    if (typeof f !== 'function') return Promise.resolve({ genre: 'reseau' });
    return Promise.resolve().then(function () {
      return f(o.url + '/functions/v1/demander-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + o.jeton, 'apikey': o.cle || '' },
        body: JSON.stringify({ question: o.question, slug: o.slug || undefined, contexte: o.contexte })
      });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        j = j || {};
        if (j.quota) return { genre: 'quota' };
        if (r.status === 403 && j.erreur === 'accord') return { genre: 'accord' };
        if (r.status === 401 || r.status === 503 || !r.ok) return { genre: 'indisponible' };
        if (j.bloquee) return { genre: 'bloquee', texte: String(j.reponse || TEXTES.bloquee), sante: !!j.sante, reste: typeof j.reste === 'number' ? j.reste : null };
        return { genre: 'reponse', texte: String(j.reponse || ''), reste: typeof j.reste === 'number' ? j.reste : null };
      });
    }).catch(function () { return { genre: 'reseau' }; });
  }

  var api = {
    estSante: estSante, MOTIFS_SANTE: MOTIFS_SANTE, normaliser: normaliser, sansDate: sansDate, contexteDe: contexteDe,
    cransDe: cransDe, puces: puces, TEXTES: TEXTES, MAX_PAR_JOUR: MAX_PAR_JOUR, MAX_QUESTION: MAX_QUESTION,
    resteDuJour: resteDuJour, noterReste: noterReste, oublier: oublier, demander: demander
  };
  racine.THAssistant = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
