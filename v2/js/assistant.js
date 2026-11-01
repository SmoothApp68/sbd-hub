// v2/js/assistant.js — « Demander au coach » (160, décisions d'Aurélien du 24/10/2026).
//
// L'IA EXPLIQUE une décision du moteur, elle n'en prend jamais. Depuis la feuille « Pourquoi cette consigne » (et nulle
// part ailleurs), une question sur la ligne part à la fonction Edge `demander-coach`, qui rend trois phrases rédigées par
// un modèle — après avoir contrôlé que chaque nombre de la réponse est dans le contexte.
//
// ⚠️ RIEN N'EST CALCULÉ ICI. Le contexte (`contexteDe`) est tiré du PLAN (`x`, le plan d'un exercice : ses paragraphes
// « Pourquoi », ses lignes), des FAITS (les séances de l'exercice, lues par l'appelant dans `faits.js`) et des charges du plan
// (lignes de l'exercice). Une décision du coach ne se recalcule pas ici : elle se recopie.
// Jamais dans le contexte : nom, pseudo, id, date, poids du corps, notes libres. Les dates que le coach écrit dans ses
// phrases (« mardi », « le 13 sept. ») sont retirées (`sansDate`).
//
// ⚠️ `estSante` ET `MOTIFS_DATE` SONT LES MÊMES LISTES QUE CELLES DE LA FONCTION (`supabase/functions/demander-coach/controle.js`) : copiée, parce
// que ce dossier n'est pas servi ; `tests/unit/v2-assistant-controle.test.js` prouve que les deux listes sont identiques.
// Une douleur ne part jamais.
//
// La conversation vit EN MÉMOIRE seulement (rien en cache, rien en base côté app). La seule chose gardée : le nombre de
// questions qui restent aujourd'hui, en mémoire, pour le jour.

(function (racine) {
  'use strict';

  var MAX_PAR_JOUR = 10;
  var MAX_QUESTION = 500;

  // ── La santé (copie de controle.js, prouvée identique par un test) : une douleur ne part JAMAIS (166, D4) ─────────────────────
  // Le motif exige une PARTIE du corps ou « ça » : « tirage », « tirer la barre », « tire-bouchon » ne sont pas des douleurs.
  var PARTIES = 'dos|genou|genoux|epaule|epaules|coude|coudes|poignet|poignets|hanche|hanches|cheville|chevilles|cou|nuque|tete|ventre|coeur|poitrine|thorax|cuisse|cuisses|mollet|mollets|biceps|triceps|pied|pieds|main|mains|bras|jambe|jambes|lombaires|cote|cotes|pec|pecs|fesse|fesses|aine|tendon|tendons|articulation|articulations|ischio|ischios|quadriceps';
  // 179 (B-H1) — DEUX ENSEMBLES : une partie du corps × (un symptôme | autre chose qu'un mot de séance), plus des expressions qui
  // coupent seules. Le nom d'un exercice (« développé épaules », « extension mollets ») n'est pas une partie du corps nommée.
  var PARTIES_CORPS = 'dos|genou|genoux|epaule|epaules|coude|coudes|poignet|poignets|hanche|hanches|cheville|chevilles|cou|nuque|tete|ventre|coeur|poitrine|thorax|cuisse|cuisses|mollet|mollets|biceps|triceps|pied|pieds|main|mains|bras|jambe|jambes|lombaires|lombes|pec|pecs|pectoraux|fesse|fesses|aine|tendon|tendons|articulation|articulations|ischio|ischios|quadriceps|trapeze|trapezes|doigt|doigts|pouce|rotule|rotules|menisque|ligament|ligaments|cervicales|abdos|sternum|tibia|talon|talons|orteil|orteils|machoire|gorge|clavicule|omoplate|omoplates|adducteurs?|rhomboides|deltoide|deltoides';
  var NOMS_EXERCICES = '(?:developpes?|elevations?|curls?|extensions?|presse|releves?|leg|rowing|tirages?|tractions?|ecartes?|oiseau|shrugs?|pull-?over|dips?|fentes?|souleves?|squats?|crunch|hip thrust|pompes?|gainage|kickbacks?|face pull)';
  var LIENS_EXERCICES = 'de|du|des|d|a|au|aux|la|le|les|l|en|sur|debout|assis|assise|couche|incline|inclines|decline|machine|poulie|barre|haltere|halteres|ez|unilateral|vertical|horizontal|serre|large|neutre|supination|pronation|laterale|laterales|frontale|frontales|arriere|avant|libre|smith|bulgare|roumain|' + PARTIES_CORPS;
  var SYMPTOMES = "(?:tue|fourmi\\w*|fourmillements?|engourdi\\w*|raide|raideur|crispe\\w*|crispation|crampes?|tiraille\\w*|sensibles?|souci|soucis|probleme|problemes|gene|genent|bloque\\w*|craque\\w*|claque\\w*|coince\\w*|brule\\w*|pique|piquent|lance|lancent|pince|pincent|gonfle\\w*|enfle\\w*|grince\\w*|cede|faible|faiblit|tremble\\w*|inquiet\\w*|peur|bizarre|etrange|anormal\\w*|fatigue\\w*|souffre|chaud|mou|lache|lachent|(?:qui|ca|me|m') ?(?:tire|tirent)|tire (?:dans|a|au|aux|sur)|pas bien|va pas|pas normal)";
  var MOTS_DE_SEANCE = "(?:kg|kilos?|charges?|reps?|repetitions?|series?|palier|cran|crans|barre|disques?|poids|lourds?|lourde|legers?|legere|monter|monte|baisser|baisse|augmenter|garder|garde|tester|teste|consigne|zone|volume|seances?|echauffements?|exercices?|programme|routine|entrainements?|travail\\w*|progress\\w*|intensite|rpe|rir|reserve|marche|escalier|deload|decharge|echec|machine|halteres?|elastiques?|lest|pourquoi|combien|1rm)";
  var MOTIFS_SANTE = [
    '\\b(?:douleurs?|douloureu[xs]e?s?|blessures?|blesse|blessee|tendinites?|tendinopathies?|claquage|claquages|claque|claquee|dechirures?|dechire|dechiree|entorses?|luxations?|fractures?|hernies?|lumbago|sciatique|contractures?|elongations?|inflammations?|vertiges?|malaises?|nausees?|palpitations?|elancements?|pincements?|picotements?|souffrances?|souffre)\\b',
    "\\bj'?ai (?:tres |vraiment |super |trop )?mal\\b",
    '\\bavoir (?:tres |vraiment )?mal\\b',
    '\\bme sens (?:tres |vraiment )?mal\\b',
    '\\bfai(?:t|ts) (?:tres |vraiment |super |trop )?mal\\b',
    "\\b(?:me|se|te|m') ?fai(?:s|re|t) mal\\b",
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
    "\\bj'?ai (?:une |un )?(?:legere |petite |vague |grosse )?gene\\b",
    // 179 : les expressions qui coupent seules, sans partie du corps nommée
    '\\bme tue(?:nt)?\\b',
    '\\bfourmi(?:s|llements?|llent)?\\b',
    '\\bengourdi\\w*',
    '\\bcrispe\\w*|\\bcrispations?\\b',
    '\\bcrampes?\\b|\\braideurs?\\b',
    "\\b(?:ca|qui) (?:me |m')?(?:tire|tirent|tiraille|tiraillent|lache|lachent|bloque|brule|pique|lance|pince)\\b",
    "\\b(?:me|m') ?(?:lache|lachent|gene|genent|bloque|brule|pique|pince|tiraille)\\b",
    '\\bsouci (?:physique|de sante|medical)\\b',
    '\\bje boite\\b|\\bje boitille\\b'
  ];
  function normaliser(texte) {
    return String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[’‘`´]/g, "'").replace(/\s+/g, ' ');
  }
  var REGEX_SANTE = MOTIFS_SANTE.map(function (m) { return new RegExp(m); });
  var RE_CORPS = new RegExp('\\b(?:' + PARTIES_CORPS + ')\\b');
  var RE_NOM_EXERCICE = new RegExp('\\b' + NOMS_EXERCICES + '\\b(?:[ \']+(?:' + LIENS_EXERCICES + ')\\b){0,5}', 'g');
  var RE_SYMPTOMES = new RegExp('\\b' + SYMPTOMES + '\\b');
  var RE_SEANCE = new RegExp('\\b' + MOTS_DE_SEANCE + '\\b');
  // Une douleur ne part jamais : un motif, OU une partie du corps nommée hors d'un nom d'exercice avec un symptôme, OU une partie
  // du corps nommée sans aucun mot de séance (« mon épaule ? »). « Pourquoi 20 kg au développé épaules ? » n'en est pas une.
  function estSante(question) {
    var q = normaliser(question);
    if (REGEX_SANTE.some(function (re) { return re.test(q); })) return true;
    var sansExercice = q.replace(RE_NOM_EXERCICE, ' ');
    if (!RE_CORPS.test(sansExercice)) return false;
    return RE_SYMPTOMES.test(sansExercice) || !RE_SEANCE.test(sansExercice);
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
    accordEnAttente: 'Ton accord part dès que le réseau revient.',
    accordOk: 'J’ai compris, continuer',
    accordNon: 'Pas maintenant'
  };

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
  // 179 (B-B9) — les charges que le plan a DÉCIDÉES pour cet exercice, rien d'autre : celles de ses lignes (la séance du jour et la suite
  // qu'il annonce) et sa charge de travail. Plus de charges voisines de la salle calculées par l'écran : le modèle ne pouvait citer, comme
  // « la suite », un cran que le coach n'a pas choisi (gros cran, deux crans en Franc). `lignes` : `x.lignes` du plan ; `repere` : le palier.
  function cransDe(lignes, repere) {
    var vues = [];
    function pose(c) {
      var n = Number(c);
      if (c !== null && c !== undefined && c !== '' && isFinite(n) && n > 0 && vues.indexOf(n) < 0) vues.push(n);
    }
    (lignes || []).forEach(function (l) { if (l) { pose(l.charge); if (l.faite) pose(l.faite.charge); } });
    pose(repere);
    vues.sort(function (a, b) { return a - b; });
    return vues.length ? { genre: 'plan', charges: vues.slice(-12).map(kg) } : null;
  }

  // ── L'accord refusé (403 « accord ») : boucle ou attente ? (166, D9) ────────
  // Le profil local porte déjà l'accord (écrit dans la file, il part dès que le réseau revient) : on le dit en une ligne et on
  // ne revient PAS à l'écran d'accord. Sans accord local, l'écran d'accord se rouvre comme avant.
  function issueAccordRefuse(profilLocal) {
    return profilLocal && profilLocal.assistant_accord_a ? 'attente' : 'accord';
  }

  // ── Le contexte d'une ligne ─────────────────────────────────────────────
  // `e` : { nom, x, groupes, salle }
  //   · x : l'exercice du plan (`planDuSlug`) : `x.pourquoi` (paragraphes, « Donc », lignes), `x.entete`, `x.consigne` ;
  //   · groupes : les séances de l'exercice lues dans `faits.js` (la plus récente d'abord), `[{ seance, series }]` ;
  //   · salle : n'est plus lue (179, B-B9 : les charges citables sont celles du plan).
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
    var seances = [];
    (e.groupes || []).forEach(function (g) {
      var vus = [];
      ((g && g.series) || []).forEach(function (s) {
        if (!s || !Modele.estTravail(s)) return;
        if (s.reps === null || s.reps === undefined) return;
        vus.push(Modele.serieFaite(s.charge_kg, s.reps));
      });
      if (vus.length && seances.length < 3) seances.push(vus.slice(0, 12).map(function (t) { return net(t, 40); }).filter(Boolean));
    });
    if (seances.length) ctx.seances = seances;
    var repere = x.consigne.palier !== undefined ? x.consigne.palier : null;
    var crans = cransDe(x.lignes, repere);
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
  // 208 — la clé de jour local est UNE fonction, `jourCivil`. L'ancienne clé (« 2026-1-5 », sans zéro) ne vivait
  // que dans `memoire`, en mémoire du processus : jamais écrite en base ni en cache, comparée seulement à elle-même.
  function jourLocal(d) { return racine.THMoteur.jourCivil(d || new Date()); }
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
    estSante: estSante, MOTIFS_SANTE: MOTIFS_SANTE, PARTIES_CORPS: PARTIES_CORPS, SYMPTOMES: SYMPTOMES, MOTS_DE_SEANCE: MOTS_DE_SEANCE, NOMS_EXERCICES: NOMS_EXERCICES, MOTIFS_DATE: MOTIFS_DATE, contientDate: contientDate, issueAccordRefuse: issueAccordRefuse,
    normaliser: normaliser, sansDate: sansDate, contexteDe: contexteDe,
    cransDe: cransDe, puces: puces, TEXTES: TEXTES, MAX_PAR_JOUR: MAX_PAR_JOUR, MAX_QUESTION: MAX_QUESTION,
    resteDuJour: resteDuJour, noterReste: noterReste, oublier: oublier, demander: demander
  };
  racine.THAssistant = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
