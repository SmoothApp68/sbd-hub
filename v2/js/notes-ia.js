// v2/js/notes-ia.js — « Lire mes notes » (250, L9, décisions d'Aurélien du 05/11/2026).
//
// À la fin de la séance, sur le récap, le coach PROPOSE de ranger ce que la personne a écrit dans une note : la réserve d'une série
// (« RPE 9 »), un type de série (échec, dégressive), son réglage (« ta note pour cet exercice »), une douleur. Quatre genres, une liste
// fermée ; la variante n'en fait pas partie (aucun chemin n'existe pour changer l'exercice d'une série faite : un lot à part).
//
// ⚠️ MODULE PUR, SANS DOM, SANS ÉCRITURE : aucun `poser*`, aucun `executer`, aucun accès à la base ni au cache. `app.js` le câble. Ce
// module dit CE QUI PEUT PARTIR (`candidates`), CE QUI PART (`corps`), CE QUI SE MONTRE (`retenir`, `ligne`, `phrase`) et fait l'appel
// réseau (`lire`). Ce qui s'écrit passe par `enregistrerCorrection` (effort, type, douleur) ou la note de l'exercice de 242 (réglage),
// dans `app.js`, et par le geste de la personne : ✓.
//
// L'IA ne décide rien et n'écrit rien. Elle lit une note qui a passé le filtre du téléphone et rend des CODES dans un schéma fermé, avec un
// EXTRAIT mot pour mot de la note. Le code vérifie tout (la fonction `lire-notes`, puis ce module sur la note et la séance LOCALES),
// fabrique une phrase FIXE dans la voix du coach ; l'extrait est le seul texte non fixe, entre « ».
//
// ⚠️ LES LISTES DE SANTÉ SONT CELLES DE `THAssistant` (aucune recopie) : `estSante` (le filtre LARGE : une note qu'il attrape ne part
// jamais) et, pour PROPOSER une douleur, le filtre ÉTROIT (`douleurProposable`, les mêmes motifs sans la branche « partie du corps sans
// mot de séance »). Une douleur ne part JAMAIS chez le modèle : elle est repérée ici, proposée, jamais cochée.
// ⚠️ LE MOTIF DE « L'AUTRE PERSONNE », LA LISTE DE LA SANTÉ INCIDENTE ET LES MOTS D'INJECTION SONT COPIÉS DANS
// `supabase/functions/lire-notes/controle-notes.js` (le dossier n'est pas servi) ; `tests/unit/v2-notes-ia-controle.test.js` prouve
// qu'ils sont identiques.

(function (racine) {
  'use strict';

  var MAX_NOTES = 8;
  var MAX_EXERCICES = 12;
  var MAX_SERIES = 12;
  var MAX_SIGNES = 500;
  var MAX_CITATION = 60;
  var MAX_PROPOSITIONS = 3;
  var DELAI_MS = 25000;   // 252 : au-delà des 20 s de la fonction (le modèle réfléchit avant de répondre)
  var GENRES = ['effort', 'type_serie', 'reglage', 'douleur'];      // l'ordre fixe d'affichage
  var GENRES_IA = ['effort', 'type_serie', 'reglage'];              // ceux que le modèle peut rendre (pas la douleur, pas la variante)
  // Le TYPE `travail` au sens strict (ni `test`, ni `recul`, ni une série déjà `echec` ou `degressive`) : L9 ne remplit qu'une série de travail.
  // Ce n'est pas `Modele.estTravail` (qui compte aussi le test, le recul et l'échec à 1 rep et plus) : le sens de « un champ vide ».
  var TYPE_TRAVAIL = 'travail';
  function seulementTravail(s) { return Modele().typeDe(s) === TYPE_TRAVAIL; }

  function A() { return racine.THAssistant; }
  function Modele() { return racine.THModele; }
  function Seance() { return racine.THSeance; }

  // ── La normalisation, avec la carte vers le texte d'origine ──────────────────
  // Même arithmétique que `THAssistant.normaliser` (casse, accents, apostrophes, espaces), mais chaque caractère normalisé se souvient de sa
  // place dans le texte d'ORIGINE : c'est ce qui permet d'afficher les mots EXACTS de la personne (fautes comprises) quand le modèle a rendu
  // un extrait à la casse ou aux espaces près.
  function carte(texte) {
    var s = String(texte === null || texte === undefined ? '' : texte);
    var norm = '', idx = [];
    for (var i = 0; i < s.length; i++) {
      var n = s.charAt(i).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\u2019\u2018\x60\u00b4]/g, "'");
      if (/^\s+$/.test(n)) {
        if (/^\s*[,.:;]/.test(s.slice(i))) continue;   // « curl : » = « curl: » (le téléphone nettoie ainsi avant l'envoi)
        if (norm.length && norm.charAt(norm.length - 1) === ' ') continue;
        n = ' ';
      }
      for (var k = 0; k < n.length; k++) { norm += n.charAt(k); idx.push(i); }
    }
    return { norm: norm, idx: idx };
  }
  function norm(texte) { return carte(texte).norm; }

  // Les mots EXACTS de la note qui correspondent à l'extrait (casse, accents, espaces et apostrophes mis à part) : une sous-chaîne de la
  // note d'origine, ou `null`. La seule source du texte cité.
  function retrouver(extrait, original) {
    var e = norm(extrait).trim();
    if (e.length < 2) return null;
    var m = carte(original);
    var k = m.norm.indexOf(e);
    if (k < 0) return null;
    return String(original).slice(m.idx[k], m.idx[k + e.length - 1] + 1);
  }

  // ── Ce qui ne part jamais ──────────────────────────────────────────────────
  // Une note qui parle d'une autre personne : ni envoi, ni douleur, ni proposition pour elle. « il m'en restait 2 » parle de soi (la phrase
  // de l'effort) : elle ne compte pas comme un tiers.
  var RE_IL_DE_SOI = /\bil (?:m\x27en|m\x27|me|nous) ?(?:en )?rest\w*|\bil y (?:a|avait|aura)\b|\bil (?:faut|fallait)\b/g;
  var MOTIF_TIERS = "\\[quelqu'un\\]|@[a-z_]\\w*|\\b(?:il|elle|sa|son|ses|mon pote|ma pote|mon binome|ma binome|mon partenaire|ma partenaire|mon coach)\\b";
  var RE_TIERS = new RegExp(MOTIF_TIERS);
  function parleDUnTiers(texte) {
    return RE_TIERS.test(norm(texte).replace(RE_IL_DE_SOI, ' '));
  }

  // La santé INCIDENTE (propre à L9) : le DPA d'Anthropic ne prévoit aucune catégorie particulière de données. Une note qui la contient
  // ne part pas, même si elle porte un mot d'entraînement.
  var MOTIF_SANTE_INCIDENTE = '\\b(?:malade|maladie|grippe|covid|fievre|kine|kinesi\\w*|osteo\\w*|medecin|docteur|medic\\w*|traitement|operation|opere|chirurg\\w*|enceinte|grossesse|migraine|sommeil|insomnie)\\b';
  var RE_SANTE_INCIDENTE = new RegExp(MOTIF_SANTE_INCIDENTE);

  // Les mots d'entraînement : seules les notes qui en contiennent un partent (minimisation). SANS les mots de variante.
  var MOTIF_CANDIDAT = '\\b(?:rpe|r p e|rir|reserve|restait|a fond|drop|degressi|echec|fail|left|last set|cran|siege|secu|reglage)|@\\d';
  var RE_CANDIDAT = new RegExp(MOTIF_CANDIDAT);

  // Un motif d'injection (la note est une entrée hostile) : elle ne part pas. Un lien non plus.
  var MOTIF_INJECTION = '\\b(?:ignore|instruction|prompt|system|consigne|reponds)|[{}<>]|https?://|www\\.';
  var RE_INJECTION = new RegExp(MOTIF_INJECTION);

  // ── La douleur : repérée sur le téléphone, jamais par l'IA ───────────────────
  // Le filtre ÉTROIT : les motifs de `THAssistant.MOTIFS_SANTE`, et une partie du corps nommée hors d'un nom d'exercice AVEC un symptôme.
  // Sans la troisième branche du filtre large (« partie du corps sans mot de séance ») : elle prend « une jambe à la fois » pour une douleur.
  function filtresDeSante() {
    var a = A();
    if (!filtresDeSante.memo || filtresDeSante.source !== a) {
      var liens = a.LIENS_EXERCICES;
      filtresDeSante.source = a;
      filtresDeSante.memo = {
        motifs: a.MOTIFS_SANTE.map(function (m) { return new RegExp(m); }),
        corps: new RegExp('\\b(?:' + a.PARTIES_CORPS + ')\\b'),
        corpsG: new RegExp('\\b(?:' + a.PARTIES_CORPS + ')\\b', 'g'),
        exercice: new RegExp('\\b' + a.NOMS_EXERCICES + '\\b(?:[ \']+(?:' + liens + ')\\b){0,5}', 'g'),
        symptomes: new RegExp('\\b' + a.SYMPTOMES + '\\b'),
        malAbrege: new RegExp('\\bmal (?:' + a.PARTIES_CORPS + ')\\b'),
        ok: new RegExp('\\b(?:' + a.PARTIES_CORPS + ') (?:ok|nickel|ca va|rien|bien)\\b')
      };
    }
    return filtresDeSante.memo;
  }

  function sansNomsDExercices(t) { return t.replace(filtresDeSante().exercice, ' '); }

  // La partie du corps lue dans la note (le mot de la note, avec ses accents), ou `null`.
  function partieDuCorps(texte) {
    var f = filtresDeSante();
    var q = sansNomsDExercices(norm(texte));
    var m = f.corps.exec(q);
    if (!m) return null;
    var mots = String(texte).match(/[\p{L}\p{N}]+/gu) || [];
    for (var i = 0; i < mots.length; i++) if (norm(mots[i]) === m[0]) return mots[i].toLowerCase();
    return m[0];
  }

  // `douleurProposable(texte)` → vrai si la note PEUT donner la proposition d'une marque « douleur ». Le filtre large (`estSante`) a déjà
  // gardé la note sur le téléphone ; celui-ci décide seulement de PROPOSER. Jamais si la partie du corps est suivie de « ok », « nickel »,
  // « ça va », « rien », « bien ».
  function douleurProposable(texte) {
    var f = filtresDeSante();
    var q = norm(texte);
    if (f.ok.test(q)) return false;
    if (f.motifs.some(function (re) { return re.test(q); })) return true;
    if (f.malAbrege.test(q)) return true;
    var sans = sansNomsDExercices(q);
    return f.corps.test(sans) && f.symptomes.test(sans);
  }

  // ── L'article de la douleur et de la note de l'exercice (le français, sans deviner) ──
  var ARTICLES_CORPS = {
    'au': 'dos genou coude poignet cou ventre coeur thorax mollet biceps triceps pied bras pec tendon doigt pouce sternum tibia talon orteil trapeze menisque ligament ischio quadriceps pectoral deltoide',
    'à la': 'hanche cheville nuque tete poitrine cuisse main jambe fesse articulation rotule machoire gorge clavicule omoplate',
    "à l'": 'epaule aine abdos',
    'aux': 'genoux coudes poignets mollets pieds mains jambes fesses epaules pecs pectoraux ischios cervicales lombaires lombes doigts orteils talons adducteurs'
  };
  function douleurAu(partie) {
    if (!partie) return 'douleur';
    var p = norm(partie);
    var cles = Object.keys(ARTICLES_CORPS);
    for (var i = 0; i < cles.length; i++) {
      if ((' ' + ARTICLES_CORPS[cles[i]] + ' ').indexOf(' ' + p + ' ') >= 0) {
        return 'douleur ' + cles[i] + (cles[i] === "à l'" ? '' : ' ') + partie;
      }
    }
    return 'douleur : ' + partie;
  }

  var ARTICLES_NOM = {
    'du': 'squat developpe curl rowing souleve tirage ecarte oiseau shrug pullover pull-over crunch gainage dips hip kickback face',
    'de la': 'presse traction fente flexion poussee elevation',
    "de l'": 'extension',
    'des': 'ecartes tirages souleves dips'
  };
  // « de la presse », « du squat », « de l'extension triceps » ; un nom qu'on ne sait pas accorder : « pour <nom> » (jamais deviné).
  function deLExercice(nom) {
    var n = String(nom || '').trim();
    if (!n) return 'pour cet exercice';
    var mot = norm(n).split(' ')[0].replace(/s$/, '');
    var cles = Object.keys(ARTICLES_NOM);
    for (var i = 0; i < cles.length; i++) {
      if ((' ' + ARTICLES_NOM[cles[i]].replace(/\bdips\b/, 'dip') + ' ').indexOf(' ' + mot + ' ') >= 0 ||
          (cles[i] === 'des' && /s$/.test(norm(n).split(' ')[0]) && ARTICLES_NOM.des.indexOf(mot) >= 0)) {
        if (cles[i] === 'des' && !/s$/.test(norm(n).split(' ')[0])) continue;
        return cles[i] + (cles[i] === "de l'" ? '' : ' ') + n.charAt(0).toLowerCase() + n.slice(1);
      }
    }
    return 'pour ' + n.charAt(0).toLowerCase() + n.slice(1);
  }

  // ── Les nombres d'un extrait (chiffres et mots : « r p e neuf », « deux en réserve ») ──
  var NOMBRES_EN_MOTS = { zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
                          one: 1, two: 2, three: 3, four: 4, five: 5, seven: 7, eight: 8, nine: 9, ten: 10 };

  // ── Les notes d'une séance terminée ──────────────────────────────────────────
  function seriesFaites(exo) {
    return ((exo && exo.series) || []).filter(function (s) { return !!s && !!s.validee_a; });
  }
  function estImportee(exo) {
    return ((exo && exo.series) || []).some(function (s) { return !!s && !!s.source && s.source !== 'app'; });
  }
  function texteNet(t) { return typeof t === 'string' ? t.trim() : ''; }

  // Les notes ÉCRITES sur un exercice : la note d'exercice, ou les notes de série (une même note projetée sur plusieurs séries = UNE note).
  function notesDeLExercice(exo) {
    var vus = [], sortie = [];
    [exo && exo.note].concat(((exo && exo.series) || []).map(function (s) { return s && s.note; })).forEach(function (t) {
      var n = texteNet(t);
      if (n && vus.indexOf(n) < 0) { vus.push(n); sortie.push(n); }
    });
    return sortie;
  }

  // L'exercice porte-t-il assez pour une proposition ? Des séries FAITES, mesurées en charge et en reps (le cardio, jamais), au plus 12.
  function exerciceLisible(exo) {
    var f = seriesFaites(exo);
    if (!f.length || f.length > MAX_SERIES) return false;
    return f.every(function (s) {
      var reps = Number(s.reps);
      return s.reps !== null && s.reps !== undefined && s.reps !== '' && isFinite(reps) && reps >= 0;
    });
  }

  var MOTS_VIDES = ['avec', 'sans', 'barre', 'haltere', 'halteres', 'machine', 'poulie', 'prise', 'serre', 'large', 'neutre', 'incline',
                    'couche', 'assis', 'assise', 'debout', 'unilateral', 'vertical', 'horizontal'];
  function singulier(m) { return m.replace(/[sx]$/, ''); }
  // Les exercices de la séance que la note NOMME (un mot distinctif de son nom, entier). Pour une note de séance seulement.
  function exercicesNommes(texte, finie, contexte) {
    var q = ' ' + norm(texte).replace(/[^a-z0-9' -]/g, ' ').split(/[\s'-]+/).map(singulier).join(' ') + ' ';
    var sortie = [];
    (finie.exercices || []).forEach(function (exo, i) {
      if (!exerciceLisible(exo)) return;
      var nom = norm(contexte.nom ? contexte.nom(exo.exercise_slug) : exo.exercise_slug);
      var mots = nom.replace(/\([^)]*\)/g, ' ').split(/[\s'-]+/).filter(function (m) {
        return m.length >= 4 && MOTS_VIDES.indexOf(m) < 0;
      }).map(singulier);
      if (mots.some(function (m) { return q.indexOf(' ' + m + ' ') >= 0; })) sortie.push(i);
    });
    return sortie;
  }

  function coupeAuMot(t, max) {
    if (t.length <= max) return t;
    var c = t.slice(0, max);
    var espace = c.lastIndexOf(' ');
    return (espace > max * 0.8 ? c.slice(0, espace) : c).trim();
  }
  // Ce qui sort du téléphone : liens retirés, @pseudo et pseudos connus → [quelqu'un], dates retirées, 500 signes au plus.
  function nettoyer(texte, pseudos) {
    var t = String(texte === null || texte === undefined ? '' : texte);
    t = t.replace(/https?:\/\/\S+|www\.\S+/gi, ' ');
    t = t.replace(/@[A-Za-z_]\w*/g, "[quelqu'un]");
    (pseudos || []).forEach(function (p) {
      var s = String(p || '').replace(/^@/, '').trim();
      if (s.length < 2) return;
      t = t.replace(new RegExp('\\b' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), "[quelqu'un]");
    });
    t = A().sansDate(t);
    return coupeAuMot(t.replace(/\s+/g, ' ').trim(), MAX_SIGNES);
  }

  // `candidates(finie, contexte)` → { envoyer: [{ iExo, brute, texte }], douleurs: [{ iExo, partie, brute }] }
  //   · finie : la séance terminée (`exercices[].note`, `exercices[].series[].note/validee_a/source`, `note`) ;
  //   · contexte : { consignes(slug) → [textes], noteEcrite(texte, consignes) (= `faits.estUneNote`), nom(slug), pseudos }.
  //   · `iExo` : le rang dans `finie.exercices` (`null` pour une note de séance). `brute` : la note telle que la personne l'a écrite.
  // Dans l'ordre, pour chaque note : (1) pas une note, (2) un tiers, (3) la santé — le filtre large la garde, le filtre étroit peut en
  // tirer une douleur LOCALE —, (4) la santé incidente, (5) aucun mot d'entraînement, (6) injection, (7) une note de séance sans
  // exercice nommé, (8) le nettoyage.
  function candidates(finie, contexte) {
    var c = contexte || {};
    var sortie = { envoyer: [], douleurs: [] };
    if (!finie || (finie.source && finie.source !== 'app')) return sortie;
    var exos = finie.exercices || [];

    function une(brute, iExo, nommes) {
      var texte = texteNet(brute);
      if (texte.length < 3) return;
      var slug = iExo === null ? null : exos[iExo].exercise_slug;
      // 1. identique à la consigne de la routine : ce n'est pas une note
      if (slug && c.noteEcrite && !c.noteEcrite(texte, c.consignes ? c.consignes(slug) : [])) return;
      // 2. une autre personne
      if (parleDUnTiers(texte)) return;
      // 3. la santé : le filtre large la garde ; le filtre étroit peut la PROPOSER, sur le téléphone seulement
      if (A().estSante(texte)) {
        if (!douleurProposable(texte)) return;
        var partie = partieDuCorps(texte);
        if (iExo !== null) {
          sortie.douleurs.push({ iExo: iExo, partie: partie, brute: texte });
        } else if (partie && nommes.length) {
          sortie.douleurs.push({ iExo: nommes[0], partie: partie, brute: texte });
        }
        return;
      }
      var q = norm(texte);
      // 4. la santé incidente, 5. aucun mot d'entraînement, 6. une injection
      if (RE_SANTE_INCIDENTE.test(q)) return;
      if (!RE_CANDIDAT.test(q)) return;
      if (RE_INJECTION.test(q)) return;
      // 7. une note de séance doit nommer un exercice de la séance
      if (iExo === null && !nommes.length) return;
      // 8. le nettoyage (liens, @pseudo, dates, 500 signes)
      var net = nettoyer(texte, c.pseudos);
      if (net.length < 3) return;
      if (sortie.envoyer.length >= MAX_NOTES) return;
      sortie.envoyer.push({ iExo: iExo, brute: texte, texte: net });
    }

    exos.forEach(function (exo, i) {
      if (!exerciceLisible(exo) || estImportee(exo)) return;
      notesDeLExercice(exo).forEach(function (t) { une(t, i, []); });
    });
    var ns = texteNet(finie.note);
    if (ns) une(ns, null, exercicesNommes(ns, finie, c));
    return sortie;
  }

  // Les exercices qui partent (leurs rangs dans `finie.exercices`) : ceux qui portent une note envoyée, et ceux qu'une note de séance
  // nomme. Au plus 12. Le même calcul pour `corps` et `retenir` : le rang `i` du corps y est lu.
  function exercicesEnvoyes(finie, envoyer, contexte) {
    var rangs = [];
    (envoyer || []).forEach(function (n) {
      if (n.iExo !== null && n.iExo !== undefined) { if (rangs.indexOf(n.iExo) < 0) rangs.push(n.iExo); return; }
      exercicesNommes(n.brute || n.texte, finie, contexte || {}).forEach(function (i) { if (rangs.indexOf(i) < 0) rangs.push(i); });
    });
    rangs.sort(function (a, b) { return a - b; });
    return rangs.slice(0, MAX_EXERCICES);
  }

  // `corps(finie, envoyer, contexte)` → { exercices: [{ i, nom, series: [{ type, kg, reps }] }], notes: [{ id, i, texte }] }.
  // RIEN d'autre : ni slug, ni identifiant de séance ou de série, ni date, ni pseudo. Le texte est nettoyé UNE FOIS DE PLUS ici : un corps
  // ne contient jamais un lien, un @pseudo ou une date, même si la liste `envoyer` était mal formée.
  function corps(finie, envoyer, contexte) {
    var c = contexte || {};
    var rangs = exercicesEnvoyes(finie, envoyer, c);
    var exercices = rangs.map(function (iFinie, i) {
      var exo = finie.exercices[iFinie];
      return {
        i: i,
        nom: coupeAuMot(nettoyer(c.nom ? c.nom(exo.exercise_slug) : '', c.pseudos), 120),
        series: seriesFaites(exo).map(function (s) {
          var kg = Number(s.charge_kg);
          return { type: Modele().typeDe(s), kg: s.charge_kg === null || s.charge_kg === undefined || !isFinite(kg) ? 0 : kg, reps: Number(s.reps) };
        })
      };
    });
    var notes = [];
    (envoyer || []).forEach(function (n, k) {
      var rang = n.iExo === null || n.iExo === undefined ? null : rangs.indexOf(n.iExo);
      if (rang === -1) return;
      var texte = nettoyer(n.texte, c.pseudos);
      if (!texte) return;
      notes.push({ id: 'n' + (k + 1), i: rang, texte: texte });
    });
    return { exercices: exercices, notes: notes };
  }

  // ── La réserve : par `THReserve`, jamais une seconde table ───────────────────
  var RESSENTI_DE = { 0: 'reste_0', 1: 'reste_1', 2: 'reste_2', 3: 'reste_3_plus' };
  // `effortDe({ rpe, reserve })` → `reste_N`, ou `null` : une réserve entière seulement (RPE 8,5 : rien).
  function effortDe(p) {
    if (!p) return null;
    var r = null;
    if (p.rpe !== null && p.rpe !== undefined) {
      var rpe = Number(p.rpe);
      if (!isFinite(rpe) || rpe < 5 || rpe > 10 || Math.floor(rpe) !== rpe) return null;
      r = racine.THReserve.reserveDe({ rpe: rpe });
    } else if (p.reserve !== null && p.reserve !== undefined) {
      var m = { '0': 0, '1': 1, '2': 2, '3+': 3, '3': 3 };
      r = Object.prototype.hasOwnProperty.call(m, String(p.reserve)) ? m[String(p.reserve)] : null;
    }
    if (r === null || Math.floor(r) !== r || !RESSENTI_DE[r]) return null;
    return RESSENTI_DE[r];
  }

  // ── Les séries désignées, relues sur la séance LOCALE ────────────────────────
  // `designees(exo, code)` → les rangs (dans `exo.series`) des séries FAITES que le code désigne ; `[]` si le code ne tient pas.
  function designees(exo, code) {
    var rangs = [];
    var faites = [];
    ((exo && exo.series) || []).forEach(function (s, j) { if (s && s.validee_a) faites.push(j); });
    if (!faites.length || faites.length > MAX_SERIES) return [];
    if (code === 'derniere') rangs = [faites[faites.length - 1]];
    else if (code === 'deux_dernieres') rangs = faites.length >= 2 ? faites.slice(-2) : [];
    else if (code === 'toutes') rangs = faites.slice();
    else {
      var m = /^s(\d{1,2})$/.exec(String(code));
      var n = m ? Number(m[1]) : 0;
      rangs = n >= 1 && n <= faites.length ? [faites[n - 1]] : [];
    }
    return rangs;
  }

  // ── Ce qui se montre ─────────────────────────────────────────────────────────
  function majuscule(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }
  function citationCourte(t) {
    var s = String(t).replace(/\s+/g, ' ').trim();
    return s.length > MAX_CITATION ? s.slice(0, MAX_CITATION).trimEnd() + '…' : s;
  }

  // `retenir(reponse, finie, envoyer, douleurs, etat)` → la liste affichée, ordonnée.
  //   · reponse : { propositions: [...] } (la fonction les a déjà passées à C1-C9) ;
  //   · etat : { nom(slug), noteExistante(slug) → le texte de la note de l'exercice, ou null, pseudos, consignes... } ;
  // Revérifie sur la note LOCALE et la séance LOCALE : l'extrait est une sous-chaîne de la note de la personne (C1) ; la série désignée
  // existe, est faite et de travail (C4) ; une seule proposition par (exercice, genre) (C5) ; UN CHAMP VIDE SEULEMENT (C5 bis : jamais
  // sur un effort déjà répondu, un type déjà changé, une douleur déjà posée, une note identique). Ajoute les douleurs locales. ORDRE FIXE :
  // effort, type de série, réglage, douleur ; trois au plus, UNE PLACE GARDÉE à la douleur, qui reste en dernier.
  // Chaque élément : { cle, genre, iExo, slug, nom, serieIds, repere, valeur, extrait, partie?, ancienne? }.
  function retenir(reponse, finie, envoyer, douleurs, etat) {
    var e = etat || {};
    var exos = (finie && finie.exercices) || [];
    var liste = (reponse && Array.isArray(reponse.propositions)) ? reponse.propositions : [];
    var rangs = exercicesEnvoyes(finie, envoyer, e);
    var nom = function (slug) { return majuscule(Modele().nomCourt(e.nom ? e.nom(slug) : slug)); };
    var vus = {};
    var ia = [];

    liste.forEach(function (p, k) {
      if (!p || typeof p !== 'object' || GENRES_IA.indexOf(p.genre) < 0) return;
      var n = /^n(\d{1,2})$/.exec(String(p.note));
      var entree = n ? (envoyer || [])[Number(n[1]) - 1] : null;
      if (!entree || typeof p.extrait !== 'string') return;
      // C1 — contre la note LOCALE ; ce qui s'affiche, ce sont ses mots exacts
      var extrait = retrouver(p.extrait, entree.brute);
      if (!extrait) return;
      // l'exercice : celui de la note, ou celui que le modèle désigne (rang dans le corps) pour une note de séance
      var iExo = entree.iExo;
      if (iExo === null || iExo === undefined) {
        if (!Number.isInteger(p.exercice) || p.exercice < 0 || p.exercice >= rangs.length) return;
        iExo = rangs[p.exercice];
      } else if (p.exercice !== null && p.exercice !== undefined && rangs[p.exercice] !== iExo) return;
      var exo = exos[iExo];
      if (!exo || !exo.exercise_slug) return;
      var cle = p.genre + ':' + iExo;
      if (vus[cle]) return;                                            // C5 : jamais deux fois (exercice, genre)

      var prop = { cle: cle, genre: p.genre, iExo: iExo, slug: exo.exercise_slug, nom: nom(exo.exercise_slug), extrait: extrait,
                   repere: ((exo.series || [])[0] || {}).id || null };
      if (p.genre === 'effort') {
        var valeur = effortDe(p);
        var cibles = designees(exo, p.series);
        // C4 + C5 bis — des séries de travail faites, SANS effort : ce que la personne a répondu en séance gagne toujours
        cibles = cibles.filter(function (j) {
          var s = exo.series[j];
          return seulementTravail(s) && (s.rpe === null || s.rpe === undefined) && !s.ressenti;
        });
        if (!valeur || !cibles.length) return;
        prop.valeur = valeur;
        prop.rangs = cibles;
      } else if (p.genre === 'type_serie') {
        if (p.type !== 'degressive' && p.type !== 'echec') return;
        if (p.series === 'toutes') return;                              // une dégressive se désigne
        var cibles2 = designees(exo, p.series).filter(function (j) { return seulementTravail(exo.series[j]); });
        if (!cibles2.length) return;
        prop.valeur = p.type;
        prop.rangs = cibles2;
      } else {
        // le réglage : la note de l'exercice devient l'extrait ; jamais identique à celle qui existe
        var ancienne = e.noteExistante ? e.noteExistante(exo.exercise_slug) : null;
        if (ancienne && norm(ancienne).trim() === norm(extrait).trim()) return;
        prop.valeur = extrait.slice(0, MAX_SIGNES);
        if (ancienne) prop.ancienne = ancienne;
      }
      if (prop.rangs) {
        prop.serieIds = prop.rangs.map(function (j) { return exo.series[j].id; }).filter(Boolean);
        if (prop.serieIds.length !== prop.rangs.length) return;
      }
      vus[cle] = true;
      ia.push(Object.assign(prop, { _ordre: k }));
    });

    // L'ordre fixe : effort, type de série, réglage (la douleur vient APRÈS, à sa place gardée).
    ia.sort(function (a, b) { return GENRES.indexOf(a.genre) - GENRES.indexOf(b.genre) || a._ordre - b._ordre; });
    ia.forEach(function (p) { delete p._ordre; });

    // La douleur : locale, jamais déjà posée, une seule place (la première note), en dernier.
    var douleur = null;
    (douleurs || []).some(function (d) {
      var exo = exos[d.iExo];
      if (!exo || !exo.exercise_slug || Seance().occurrenceDouloureuse(exo)) return false;
      var extrait = citationCourte(d.brute);
      douleur = { cle: 'douleur:' + d.iExo, genre: 'douleur', iExo: d.iExo, slug: exo.exercise_slug, nom: nom(exo.exercise_slug), extrait: extrait,
                  repere: ((exo.series || [])[0] || {}).id || null, valeur: d.partie || null, partie: d.partie || null };
      return true;
    });

    // Trois au plus ; la place de la douleur est RÉSERVÉE avant le plafond (elle ne tombe jamais sous lui).
    var places = douleur ? MAX_PROPOSITIONS - 1 : MAX_PROPOSITIONS;
    var sortie = ia.slice(0, places);
    sortie.forEach(function (p) { p.extrait = citationCourte(p.extrait); });
    if (douleur) sortie.push(douleur);
    return sortie;
  }

  // ── Les phrases (fixes ; VOIX-DU-COACH « Les notes (250) ») ───────────────────
  function rangsTexte(p, total) {
    var r = p.rangs || [];
    return r.map(function (j) { return j + 1; });
  }
  // La désignation des séries : « dernière série », « séries 2 et 3 », « toutes les séries ». `p.rangs` : les rangs dans `exo.series`,
  // `p.nFaites` / `p.derniere` : posés par `ligne` depuis la séance.
  function designation(p, ctx) {
    var n = ctx && ctx.faites ? ctx.faites : [];
    var r = p.rangs || [];
    if (r.length === 1) return n.length && r[0] === n[n.length - 1] ? 'dernière série' : 'série ' + (n.indexOf(r[0]) + 1);
    var numeros = r.map(function (j) { return n.indexOf(j) + 1; });
    if (n.length && r.length === n.length) return 'toutes les séries';
    return 'séries ' + Modele().enumerer(numeros);   // 251 : une seule façon d'écrire « A, B et C »
  }
  function reserveTexte(valeur) {
    return { reste_0: 'sans marge', reste_1: '1 en réserve', reste_2: '2 en réserve', reste_3_plus: '3 en réserve ou plus' }[valeur] || null;
  }
  // `phrase(prop, ctx)` → la proposition, sans son préfixe : « Squat, dernière série, 1 en réserve. »
  //   ctx.faites : les rangs des séries faites de l'exercice (pour dire « dernière série »).
  function phrase(p, ctx) {
    var nom = p.nom;
    if (p.genre === 'effort') return nom + ', ' + designation(p, ctx) + ', ' + reserveTexte(p.valeur) + '.';
    if (p.genre === 'type_serie') return nom + ', ' + designation(p, ctx) + (p.valeur === 'echec' ? ' en échec.' : ' en dégressive.');
    if (p.genre === 'reglage') {
      return 'ta note ' + deLExercice(nom) + (p.ancienne ? ', à la place de « ' + citationCourte(p.ancienne) + ' ».' : '.');
    }
    return douleurAu(p.partie) + ', sur ' + nom + '.';
  }
  // Ce qui sera noté, sans la phrase (le nom du bouton ✓ pour un lecteur d'écran) : « 1 en réserve », « douleur au coude ».
  function libelle(p, ctx) {
    if (p.genre === 'effort') return reserveTexte(p.valeur);
    if (p.genre === 'type_serie') return designation(p, ctx) + (p.valeur === 'echec' ? ' en échec' : ' en dégressive');
    if (p.genre === 'reglage') return 'ta note ' + deLExercice(p.nom);
    return douleurAu(p.partie);
  }
  // `apres(prop)` → ce que la ligne dit une fois ✓ touché (« Annuler » suit).
  function apres(p) {
    if (p.genre === 'effort') return p.valeur === 'reste_0' ? 'Sans marge noté.' : reserveTexte(p.valeur) + ' noté.';
    if (p.genre === 'douleur') return p.partie ? 'Douleur notée : ' + p.partie + '.' : 'Douleur notée.';
    return 'Noté.';
  }
  // La ligne que l'écran dessine : { cle, genre, cite, propose, accepter, refuser, fait }.
  function ligne(p, ctx) {
    return {
      cle: p.cle, genre: p.genre,
      cite: 'Ta note dit « ' + p.extrait + ' »',
      propose: '→ je propose : ' + phrase(p, ctx),
      accepter: 'Accepter : ' + libelle(p, ctx),
      refuser: 'Refuser',
      fait: apres(p)
    };
  }

  // ── Les textes de l'accord, de « En savoir plus » et du réglage (maquette v4, mot pour mot) ──
  var TEXTES = {
    titre: 'Dans tes notes',
    accordTitre: 'Je peux lire tes notes ?',
    accord: [
      ['Quand tu écris « RPE 9 » ou « siège cran 4 », je te propose de le noter au bon endroit, à la fin de la séance. Le coach en tiendra compte la prochaine fois.'],
      ['Pour les comprendre, j’envoie ces notes à l’IA Claude (Anthropic, aux États-Unis), ', 'sans ton nom ni tes pseudos', '. Elle ne s’en sert pas pour apprendre.'],
      ['Si tu parles d’une douleur, ', 'ça reste sur ton téléphone', '.'],
      ['Un toucher pour dire oui, ou rien du tout. Tu peux arrêter quand tu veux.']
    ],
    plus: 'En savoir plus ›',
    plusTexte: 'Ce qui part : seulement le texte des notes qui contiennent un mot d’entraînement (coupé à 500 signes, sans lien, sans @pseudo ni date), ' +
      'le nom de l’exercice et les chiffres de ses séries. Un prénom écrit dans une note part tel quel. Une note peut parler de ta santé ; ' +
      'une douleur, elle, ne part jamais. Rien n’est gardé chez TrainHub. Anthropic ne s’en sert jamais pour entraîner ses modèles. ' +
      'Anthropic les efface sous 30 jours (jusqu’à 2 ans si un contrôle de sécurité les signale). Pour couper : Profil › Mon coach › Lire mes notes.',
    oui: 'Oui, vas-y',
    non: 'Non merci',
    reglage: 'Lire mes notes',
    reglageAide: 'À la fin d’une séance, je te propose de ranger ce que tu as écrit. Rien n’est envoyé quand c’est coupé.',
    reglagePart: 'Ce qui part, et ce qui ne part jamais',
    annuler: 'Annuler'
  };

  // ── L'appel ──────────────────────────────────────────────────────────────────
  // `lire({ url, jeton, cle, corps, fetch, signal })` → une Promise de `{ propositions: [...] }`. Sur TOUTE erreur (réseau, 4xx, 5xx, JSON
  // invalide, délai, abandon), `{ propositions: [] }` : le récap d'aujourd'hui, sans ligne ni message. Jamais par la file : une lecture
  // n'a pas de sens rejouée plus tard.
  function lire(o) {
    var vide = { propositions: [] };
    var f = (o && o.fetch) || racine.fetch;
    if (typeof f !== 'function') return Promise.resolve(vide);
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var minuteur = ctrl ? setTimeout(function () { ctrl.abort(); }, DELAI_MS) : null;
    if (ctrl && o.signal) {
      if (o.signal.aborted) ctrl.abort();
      else o.signal.addEventListener('abort', function () { ctrl.abort(); });
    }
    return Promise.resolve().then(function () {
      return f(o.url + '/functions/v1/lire-notes', {
        method: 'POST', signal: ctrl ? ctrl.signal : undefined,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + o.jeton, 'apikey': o.cle || '' },
        body: JSON.stringify(o.corps)
      });
    }).then(function (r) {
      if (!r || !r.ok) return vide;
      return r.json().then(function (j) {
        return { propositions: j && Array.isArray(j.propositions) ? j.propositions : [] };
      });
    }).catch(function () { return vide; }).then(function (res) {
      if (minuteur) clearTimeout(minuteur);
      return res;
    });
  }

  var api = {
    candidates: candidates, douleurProposable: douleurProposable, partieDuCorps: partieDuCorps, corps: corps, exercicesEnvoyes: exercicesEnvoyes,
    retenir: retenir, effortDe: effortDe, phrase: phrase, libelle: libelle, apres: apres, ligne: ligne, lire: lire, designees: designees,
    seulementTravail: seulementTravail, retrouver: retrouver, nettoyer: nettoyer, parleDUnTiers: parleDUnTiers, notesDeLExercice: notesDeLExercice, seriesFaites: seriesFaites,
    TEXTES: TEXTES, GENRES: GENRES, NOMBRES_EN_MOTS: NOMBRES_EN_MOTS,
    MOTIF_TIERS: MOTIF_TIERS, MOTIF_SANTE_INCIDENTE: MOTIF_SANTE_INCIDENTE, MOTIF_CANDIDAT: MOTIF_CANDIDAT, MOTIF_INJECTION: MOTIF_INJECTION,
    MAX_NOTES: MAX_NOTES, MAX_EXERCICES: MAX_EXERCICES, MAX_SIGNES: MAX_SIGNES, MAX_CITATION: MAX_CITATION, MAX_PROPOSITIONS: MAX_PROPOSITIONS
  };
  racine.THNotesIA = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
