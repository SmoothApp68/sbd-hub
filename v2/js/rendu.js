// v2/js/rendu.js — rendu DOM.
//
// Tout est construit par createElement / textContent : aucune interpolation de
// chaîne dans du HTML. Les titres de séance, noms de salle et notes viennent de
// la base et sont donc du texte utilisateur — ils ne doivent jamais être
// interprétés comme du balisage.
//
// Le formatage des valeurs (durées, distances, charges) vit dans modele.js,
// qui est pur et testé. Ce module ne fait que le poser dans le DOM.

(function (racine) {
  'use strict';

  var doc = racine.document;
  function M() { return racine.THModele; }

  // ⚠️ LES NOMBRES ET LES DATES S'ÉCRIVENT DANS `modele.js`, LE FORMATEUR
  // UNIQUE (consolidation, PR 7). Ces noms ne sont plus que des appels.
  function nombreFr(n) { return M().nombreSigne(n); }
  // 175 — « 1 265 » : l'espace fine insécable des milliers (le formateur de `Modele.nombreGroupe`, jamais un second), pour les
  // nombres que Progression AFFICHE (les champs de saisie gardent `nombreFr`, que `lireNombre` relit à l'identique).
  function grand(n) { return M().nombreGroupe(nombreFr(n)); }
  function dateCourte(iso) { return M().dateCourte(iso); }
  function dateLongue(iso) { return M().dateLongue(iso); }
  function mmss(secondes) { return M().mmss(secondes); }

  function el(balise, classe, texte) {
    var n = doc.createElement(balise);
    if (classe) n.className = classe;
    if (texte !== undefined && texte !== null) n.textContent = String(texte);
    return n;
  }

  function vider(noeud) {
    while (noeud.firstChild) noeud.removeChild(noeud.firstChild);
    return noeud;
  }

  // SVG vit dans son propre espace de noms : `createElement('polygon')` rend un
  // élément HTML inconnu, invisible et silencieux. Une seule fabrique, pour ne
  // pas refaire l'erreur à chaque graphe.
  var NS_SVG = 'http://www.w3.org/2000/svg';
  function svg(balise, classe, attributs) {
    var n = doc.createElementNS(NS_SVG, balise);
    if (classe) n.setAttribute('class', classe);
    if (attributs) Object.keys(attributs).forEach(function (k) {
      n.setAttribute(k, String(attributs[k]));
    });
    return n;
  }

  function listePoints(points) {
    return (points || []).map(function (p) { return p.x + ',' + p.y; }).join(' ');
  }

  // « 30 août », ou « 30 août 2024 » quand l'année n'est pas celle de la
  // référence. Une variation « depuis le 18 mars » qui remonterait en fait à
  // l'an dernier serait fausse sans le dire.
  function jour(d, anneeRef) {
    return M().jourMois(d, typeof anneeRef === 'number' ? anneeRef : new Date().getFullYear());
  }

  // Le signe est le vrai signe moins (U+2212), pas le tiret du clavier : sur un
  // chiffre, un trait d'union se lit comme une césure.
  function signe(v) {
    var n = Number(v) || 0;
    if (n > 0) return '+' + nombreFr(n);
    if (n < 0) return nombreFr(n);
    return '0';
  }

  // « 22,7 km · 6 h 35 » — ce qui résume une sortie, au lieu d'un compte de séries. 131b : la distance d'abord,
  // dans l'ordre de la prose (ECRAN §3 ter.5).
  function resumeSortie(r) {
    return [M().formatDistance(r.distanceTotale), M().formatDuree(r.dureeTotale)]
      .filter(Boolean).join(' · ');
  }

  // LA LIGNE SOUS LE TITRE D'UNE CARTE DE SÉANCE, UNE FOIS (les deux listes la lisent). Une sortie : sa distance et sa
  // durée. Une séance de musculation : « 3 exercices · 12 séries de travail ».
  // 133 (ECRAN-SAISIE §3 ter.4, 133b) — une séance sans série de musculation qui n'est pas une sortie (des étirements
  // seuls, depuis qu'un étirement n'est plus une sortie) se résume par ses exercices et sa durée, jamais « 0 série ».
  function metaDeSeance(r) {
    if (r.estSortie) return resumeSortie(r);
    var exos = r.nbExercices + ' exercice' + (r.nbExercices > 1 ? 's' : '');
    if (!r.nbSeriesTravail) return [exos, M().formatDuree(r.dureeTotale)].filter(Boolean).join(' · ');
    return exos + ' · ' + r.nbSeriesTravail + ' série' + (r.nbSeriesTravail > 1 ? 's' : '') + ' de travail';
  }

  function rendreListeSeances(cible, resumes, surChoix) {
    vider(cible);
    if (!resumes.length) {
      cible.appendChild(el('p', 'vide', 'Aucune séance sur ce compte.'));
      return;
    }
    resumes.forEach(function (r) {
      // Une sortie garde sa place dans la liste — elle fait partie de
      // l'entraînement — mais sur une carte compacte d'une seule ligne.
      var carte = el('button', r.estSortie ? 'seance sortie' : 'seance');
      carte.type = 'button';

      var haut = el('div', 'seance-haut');
      haut.appendChild(el('span', 'seance-titre', r.titre));
      haut.appendChild(el('span', 'seance-date', dateCourte(r.debut)));
      carte.appendChild(haut);

      var res = metaDeSeance(r);
      if (res) carte.appendChild(el('div', 'seance-meta', res));
      if (!r.estSortie && r.salle) carte.appendChild(el('div', 'seance-salle', r.salle));

      carte.addEventListener('click', function () { surChoix(r.id); });
      cible.appendChild(carte);
    });
  }

  // Le menu d'une séance de la liste. Les mêmes trois gestes que le détail, au
  // même endroit du même ordre — on ne réapprend pas un menu d'un écran à
  // l'autre. « Partager » n'y est pas : c'est du social, et il vient en dernier.
  function rendreFeuilleSeance(cible, vue) {
    vider(cible);
    var t = el('div', 'feuille-t', 'Séance');
    t.appendChild(el('em', '', vue.titre || 'Séance'));
    cible.appendChild(t);

    var menu = el('div', 'feuille-menu');
    entreeMenu(menu, 'Refaire cette séance', { surClic: vue.surRefaire });
    // §7 quindecies.4 (52-1) — la structure de cette séance, en routine.
    if (vue.surEnFaireUneRoutine) entreeMenu(menu, 'En faire une routine', { surClic: vue.surEnFaireUneRoutine });
    entreeMenu(menu, 'Modifier', { surClic: vue.surModifier });
    cible.appendChild(menu);

    var sup = el('div', 'feuille-menu');
    entreeMenu(sup, 'Supprimer', { classe: 'danger', surClic: vue.surSupprimer });
    cible.appendChild(sup);
    return cible;
  }

  // ⚠️ `surExercice` EST FACULTATIF. Sans lui le bloc est exactement ce qu'il
  // était — et c'est ce qui permet à la page d'exercice de réutiliser
  // `rendreBloc` pour son historique sans s'y rappeler elle-même.
  // 131 (écran 4) — `ajout` (facultatif) : pour une série, `{ texte, sur }` (« Ajouter le D+ ») ou `null` ; l'app
  // le décide, le rendu le pose sous la valeur.
  function rendreBloc(bloc, surExercice, ajout) {
    var section = el('section', 'bloc' + (bloc.superset ? ' superset' : ''));

    // Légende A/B/C en tête de bloc : le nom de l'exercice n'apparaît qu'une
    // fois (§2.3), ce qui règle le problème de largeur à 380 px.
    //
    // §2.8 — un tap sur le NOM donne sa page. Le reste de la ligne ne réagit
    // pas : la carte entière est déjà le chemin vers le détail de la séance.
    var exos = el('div', 'exos');
    bloc.exercices.forEach(function (x) {
      var ligne = el('div', 'exo');
      if (x.lettre) ligne.appendChild(el('span', 'lettre', x.lettre));
      if (surExercice && x.slug) {
        var nom = el('button', 'nom lien', x.nom);
        nom.type = 'button';
        nom.addEventListener('click', function () { surExercice(x.slug); });
        ligne.appendChild(nom);
      } else {
        ligne.appendChild(el('span', 'nom', x.nom));
      }
      exos.appendChild(ligne);
    });
    section.appendChild(exos);
    section.appendChild(el('div', 'resume', bloc.resume));

    var entetes = el('div', 'entetes');
    entetes.appendChild(el('span', null, 'Série'));
    // 119 (E8) — l'en-tête suit la mesure du bloc (`Modele.construireBlocs` le pose) : « Durée » sur une planche.
    entetes.appendChild(el('span', null, bloc.entete || 'Charge'));
    section.appendChild(entetes);

    bloc.series.forEach(function (s) {
      // §2.5 : les séries qui ne sont pas du travail ne sont jamais surlignées.
      // Elles portent la lettre de leur exercice, jamais un libellé de type :
      // la distinction se fait par le style.
      var ligne = el('div', 'serie' + (s.estTravail ? '' : ' hors-travail') +
        (s.debutTour ? ' debut-tour' : ''));
      var t = s.estTravail ? null : ETIQUETTE_TYPE[typeAffiche(s)];
      // Hors superset, `etiquette` est vide sur une série qui n'est pas du
      // travail : elle n'a pas de lettre à porter. On retombe alors sur le
      // libellé de type — `W` pour une chauffe — plutôt que sur un badge nu.
      ligne.appendChild(el('span', 'tag' + (t ? ' ' + t.classe : ''),
        s.etiquette || (t ? t.texte : '')));
      var mesure = el('span', 'mesure', M().formatMesure(s));
      var a = typeof ajout === 'function' ? ajout(s) : null;
      if (a) {
        var lien = el('button', 'lien ajouter-manque', a.texte);
        lien.type = 'button';
        lien.addEventListener('click', a.sur);
        mesure.appendChild(lien);
      }
      // 152 — « à l'échec » (ambre) ou « manquée » : le mot vient de la lecture unique (`Modele.motDEchec`).
      if (s.motEchec) mesure.appendChild(el('span', 'etq' + (s.estTravail ? ' fond' : ''), s.motEchec));
      // 196 — rest-pause : les reps de la série et de ses mini-séries, cumulées, dites à part.
      if (s.repsCumulees) mesure.appendChild(el('span', 'etq', s.repsCumulees + ' reps avec les mini-séries'));
      ligne.appendChild(mesure);
      section.appendChild(ligne);
    });

    return section;
  }

  function rendreDetail(cible, seance, blocs, vue) {
    vider(cible);
    var tete = el('div', 'detail-tete');
    tete.appendChild(el('h2', null, (seance && seance.titre) || 'Séance'));
    var sousTitre = [dateCourte(seance && seance.debut),
                     (seance && (seance.salle_norme || seance.salle)) || '']
      .filter(Boolean).join(' · ');
    if (sousTitre) tete.appendChild(el('span', 'detail-meta', sousTitre));
    cible.appendChild(tete);
    // La note déclarée à la fin (§7 septies.4). Sans ce point de lecture, la
    // colonne serait une valeur écrite dont personne ne se sert — le piège n° 2
    // de `SCHEMA-REEL.md`, celui qu'on passe son temps à réparer ailleurs.
    if (seance && seance.note) cible.appendChild(el('p', 'detail-note', seance.note));

    if (!blocs.length) {
      // ⚠️ « AUCUNE SÉRIE » ET « PAS ENCORE REÇUES » NE SE DISENT PAS PAREIL
      // (chantier 47). La carte de la liste distingue les deux depuis le
      // chantier 40 ; le détail, lui, affirmait « Aucune série sur cette
      // séance » pendant la synchronisation initiale — un MANQUE présenté
      // comme un fait, sur l'écran d'où part le geste qui efface.
      cible.appendChild(el('p', 'vide', vue && vue.incomplet
        ? 'Ses séries finissent d\u2019arriver. Rouvre cette séance dans un instant.'
        : 'Aucune série sur cette séance.'));
    } else {
      blocs.forEach(function (b) {
        cible.appendChild(rendreBloc(b, vue && vue.surExercice, vue && !vue.incomplet ? vue.ajout : null));
      });
    }

    // §7 octies — les gestes sur une séance. Aucun n'existait : deux séances
    // ont dû être supprimées directement en base le 13/09 faute de bouton.
    // « Partager » n'est pas là : c'est du social, et il vient en dernier.
    //
    // ⚠️ LA MÊME RÈGLE QUE LA LISTE LES REFUSE (chantier 47). Le « ⋯ » de la
    // carte est refusé sur une séance incomplète depuis le chantier 40
    // (`r.incomplet`, plus haut dans ce fichier) ; le détail offrait les trois
    // gestes pour la MÊME séance, au même instant. « Modifier » rouvrait alors
    // une séance vide, et « Enregistrer » effaçait en base les séries qu'on
    // n'avait pas encore reçues. Une incohérence de surface était le symptôme ;
    // la perte de données était la maladie.
    if (vue && vue.surSupprimer && !vue.incomplet) {
      var gestes = el('div', 'detail-gestes');
      var refaire = el('button', 'discret', 'Refaire cette séance');
      refaire.type = 'button';
      refaire.addEventListener('click', vue.surRefaire);
      gestes.appendChild(refaire);

      // §7 quindecies.4 (52-1) — le même geste que le menu ⋯ de la carte.
      if (vue.surEnFaireUneRoutine) {
        var enRoutine = el('button', 'discret', 'En faire une routine');
        enRoutine.type = 'button';
        enRoutine.addEventListener('click', vue.surEnFaireUneRoutine);
        gestes.appendChild(enRoutine);
      }

      var modifier = el('button', 'discret', 'Modifier');
      modifier.type = 'button';
      modifier.addEventListener('click', vue.surModifier);
      gestes.appendChild(modifier);

      var sup = el('button', 'discret danger', 'Supprimer');
      sup.type = 'button';
      sup.addEventListener('click', vue.surSupprimer);
      gestes.appendChild(sup);
      cible.appendChild(gestes);
    }
  }

  // ══ LA PAGE D'EXERCICE (§7 quater) ═══════════════════════════════════════
  //
  // Une seule page, atteinte depuis la séance en cours, depuis le détail d'une
  // séance passée, depuis Progression. Deux sous-onglets, chacun avec son URL.
  //
  // ⚠️ ELLE LIT, ELLE NE RECALCULE RIEN (`CADRAGE-V2` §2 undecies). Tout ce
  // qu'elle affiche est calculé ailleurs et lui est PASSÉ :
  //   · meilleure série → `Modele.meilleureSerieDeTout`, qui rappelle le chemin
  //                       de la carte de séance, séance par séance ;
  //   · palier          → `THPalier.analyser` ;
  //   · séries de travail → `THSemaine.compteSeriesTravail`, la règle unique ;
  //   · historique      → `Modele.construireBlocs`, qui rend déjà le détail ;
  //   · table par reps  → `Modele.tableParReps`.
  // Écrire ici un second calcul de meilleure série ou de palier serait
  // exactement la maladie que ce chantier soigne.
  // 125 (ECRAN-SAISIE §7 quater.5) — « Comment faire » n'est montré QUE si la vue porte une description
  // (`vue.comment`) : pas d'onglet vide. Un exercice personnel garde ses deux onglets.
  var SOUS_ONGLETS = [['resume', 'Résumé'], ['historique', 'Historique'], ['comment', 'Comment faire']];

  // ⚠️ CE QU'ON DIT D'UN EXERCICE SANS PALIER SE LIT SUR SA MESURE, JAMAIS SUR
  // UN CODE D'ERREUR (nuance posée au chantier 24, moteur au chantier 31). Une
  // planche n'a pas « échoué » à produire un palier : elle n'en aura jamais, et
  // `sans-charge` est un mot de moteur, pas une phrase pour quelqu'un.
  //
  // 50-1 bis (§9.17) — LE POIDS DU CORPS EST COACHÉ : la page d'un exercice en
  // reps ne dit plus « pas de palier en kilos » (le coach suit ses reps, la
  // charge vaut 0) ; sa phrase vient du formateur (`THModele`), la seule voix.
  //
  // 119 (audit du 16/10/2026, E5) — LA VOIX DU COACH : ni « palier » (« ta charge de travail ») ni « hors du moteur »
  // (un mot d'atelier). Une durée ou une distance : le coach ne la suit pas (CADRAGE §2 ter, I13), et la page le dit.
  var PHRASE_SANS_PALIER = {
    reps: null,   // la phrase du formateur — voir `phraseSansPalier`
    temps: 'Cet exercice se mesure en durée : le coach ne le suit pas.',
    distance_temps: 'Cet exercice se mesure en distance et en durée : le coach ne le suit pas.'
  };
  // 119 (E5) — LA TABLE PAR NOMBRE DE RÉPÉTITIONS n'existe que là où il y a des répétitions : jamais sur une planche,
  // un tapis ou une randonnée (« PAR NOMBRE DE RÉPÉTITIONS » au-dessus d'une durée, vu par Aurélien le 16/10).
  function aDesRepetitions(mesure) { return mesure === 'charge_reps' || mesure === 'reps'; }

  // `undefined` pour une mesure qui n'en a pas (charge × reps). Le choix entre
  // « a une phrase » et « n'en a pas » se lit ICI, jamais sur la table.
  function phraseSansPalier(mesure) {
    if (mesure === 'reps') return M().PHRASE_POIDS_DU_CORPS;
    return PHRASE_SANS_PALIER[mesure];
  }

  // La barre d'une aide la plus forte : visible, jamais à zéro.
  var JAUGE_MIN = 8;

  // 127 — le formateur vit dans `modele.js` (`texteMeilleure`) : « Ton échelle » écrit le même meilleur que la fiche.
  function texteMeilleure(m) { return M().texteMeilleure(m); }

  function ligneFiche(fiche, libelle, sous, valeur) {
    var li = el('div', 'exo-li');
    var k = el('span', 'exo-li-k', libelle);
    if (sous) k.appendChild(el('em', null, sous));
    li.appendChild(k);
    li.appendChild(el('span', 'exo-li-v num', valeur || '—'));
    fiche.appendChild(li);
  }

  function sousOngletsExo(vue) {
    var barre = el('div', 'sous-onglets');
    SOUS_ONGLETS.forEach(function (o) {
      if (o[0] === 'comment' && !vue.comment) return;
      var actif = vue.onglet === o[0];
      var b = el('button', 'sous-onglet' + (actif ? ' actif' : ''), o[1]);
      b.type = 'button';
      b.setAttribute('aria-current', actif ? 'page' : 'false');
      b.addEventListener('click', function () { vue.surOnglet(o[0]); });
      barre.appendChild(b);
    });
    return barre;
  }

  // §7 quater.1 — le bandeau de séance. On arrive ici DEPUIS une séance en
  // cours : elle reste visible en haut, et « Reprendre » y ramène. On consulte
  // sans avoir l'impression d'avoir quitté.
  function bandeauExoSeance(vue) {
    var bandeau = el('div', 'exo-bandeau');
    bandeau.appendChild(el('span', 'exo-point'));
    var t = el('span', 'exo-bandeau-t', vue.seanceEnCours.titre || 'Séance');
    t.appendChild(el('em', null, ' · en cours'));
    bandeau.appendChild(t);
    var b = el('button', 'exo-reprendre', 'Reprendre');
    b.type = 'button';
    b.addEventListener('click', vue.seanceEnCours.surReprendre);
    bandeau.appendChild(b);
    return bandeau;
  }

  // §7 quater.3 — LA TABLE PAR NOMBRE DE RÉPÉTITIONS. « C'est elle qui dit le
  // niveau réel » : « mon record c'est 140 » ne veut rien dire sans les reps.
  //
  // ⚠️ UNE LIGNE DÉDUITE MONTRE CE QU'ON POURRAIT REVENDIQUER, PAS LE BRUT —
  // et elle le dit. Sur le couché d'aurel_br, le brut du 14 reps donnerait
  // 42,5 kg de février 2024 alors qu'il a fait 80 × 15 en juillet 2025 : la
  // ligne porte donc 80, grisée, en italique, marquée « déduit » à la place de
  // la date. Le brut n'est pas perdu — `tableParReps` le garde dans `charge`.
  function rendreTableReps(cible, vue) {
    // ECRAN §7 quater.3 (H3, #371) — le même périmètre que le record, dit.
    var titre = el('div', 'section-t', 'PAR NOMBRE DE RÉPÉTITIONS');
    if (vue.tableSurDouzeMois) titre.appendChild(el('span', 'section-sous', ' \u00b7 sur 12 mois'));
    cible.appendChild(titre);
    if (!vue.table || !vue.table.length) {
      // 119 (E5) — la table n'est rendue que pour une mesure en reps (`aDesRepetitions`) : une absence ici est
      // toujours « rien encore à y mettre » — l'exercice sans table par nature ne passe plus par là.
      cible.appendChild(el('p', 'vide', 'Aucune série de travail enregistrée.'));
      return;
    }
    var avecCharge = vue.mesure === 'charge_reps';
    var table = el('div', 'table-reps' + (avecCharge ? '' : ' sans-charge'));
    var plafond = 0, deduites = 0;
    // 50-1 bis (§9.17) — LA JAUGE D'UNE AIDE SE LIT À L'ENVERS : moins d'aide, c'est
    // monter (−25 → −22,5), donc la barre la plus LONGUE est la moins aidée. Une
    // aide est une table dont les charges sont négatives ; l'échelle part alors
    // de la plus forte aide (barre minimale, jamais vide : la ligne existe) et
    // monte à pleine largeur vers « sans aide ».
    var pire = 0;
    vue.table.forEach(function (l) {
      var kg = l.deduit && l.chargeDeduite !== undefined ? l.chargeDeduite : l.charge;
      if (kg > plafond) plafond = kg;
      if (kg < 0 && -kg > pire) pire = -kg;
    });
    var aide = plafond <= 0 && pire > 0;
    var largeurDe = function (kg) {
      if (aide) return Math.max(JAUGE_MIN, Math.round((1 - (-kg) / pire) * 100));
      return plafond > 0 ? Math.round((kg / plafond) * 100) : 0;
    };

    vue.table.forEach(function (l) {
      if (l.deduit) deduites++;
      var ligne = el('div', 'tr-ligne' + (l.deduit ? ' deduit' : '') +
        (vue.cibleReps === l.reps ? ' cible' : ''));
      ligne.appendChild(el('span', 'tr-reps', l.reps === 1 ? '1 rep' : String(l.reps)));
      if (avecCharge) {
        var kg = l.deduit && l.chargeDeduite !== undefined ? l.chargeDeduite : l.charge;
        // La jauge est une LECTURE de la colonne d'à côté, pas une donnée de
        // plus : elle rend la progression lisible d'un coup d'œil à 380 px.
        var jauge = el('span', 'tr-jauge');
        var barre = el('i');
        barre.style.width = largeurDe(kg) + '%';
        jauge.appendChild(barre);
        ligne.appendChild(jauge);
        // §9.17 — une aide se lit « Aide 22,5 kg », jamais « −22,5 » : la même
        // phrase que la séance et le journal (`chargeTexte`, le formateur).
        // 133 — 0 kg : « PDC » (la colonne fait 66 px), jamais « 0 » (`chargeEnColonne`).
        ligne.appendChild(el('span', 'tr-charge num', kg < 0 ? M().formatMesure({ charge_kg: kg })
          : Number(kg) === 0 ? M().chargeEnColonne(kg) : nombreFr(kg)));
      }
      ligne.appendChild(el('span', 'tr-quand' + (l.deduit ? '' : ' num'),
        l.deduit ? 'déduit' : dateCourte(l.date)));
      table.appendChild(ligne);
    });
    cible.appendChild(table);
    if (deduites) {
      cible.appendChild(el('p', 'exo-note', 'Les lignes grisées ne sont pas des ' +
        'performances réelles : elles se déduisent d’un meilleur résultat à plus ' +
        'de répétitions.'));
    }
  }

  // MOTEUR §9.23 (55-1), ECRAN §7 bis.15 — LES RECORDS EN TÊTE DE LA VUE
  // (maquette « Un exercice ») : la charge la plus lourde, le tableau à reps égales avec son recul (6 mois, 1 an — l'écart
  // en couleur du coach quand il monte, rien sinon : un record ne baisse
  // jamais, pas de rouge), puis le rapport au poids.
  function ecartRecord(maintenant, avant) {
    if (!maintenant || !avant) return null;
    var e = Math.round((maintenant.charge - avant.charge) * 100) / 100;
    return e > 0 ? e : null;
  }
  // « 06 oct. 2026 · sur 12 mois » : la date, et la fenêtre quand elle s'applique.
  var SUR_DOUZE_MOIS = 'sur 12 mois';
  function sousDouzeMois(date, douze) {
    if (!douze) return date;
    return date ? date + ' \u00b7 ' + SUR_DOUZE_MOIS : SUR_DOUZE_MOIS;
  }
  function rendreTeteRecords(cible, t) {
    var carte = el('div', 'exo-records');
    var h = el('div', 'section-t', 'TES RECORDS');
    carte.appendChild(h);
    var fiche = el('div', 'exo-fiche');
    if (t.lourde) {
      ligneFiche(fiche, 'Charge la plus lourde', sousDouzeMois(t.lourde.date ? dateCourte(t.lourde.date) : null, t.douzeMois),
        M().chargeFois(t.lourde.charge, t.lourde.reps));
    }
    carte.appendChild(fiche);

    var lignes = (t.tableau || []).filter(function (l) { return l.valeurs[0]; });
    if (lignes.length) {
      var tab = el('table', 'tableau-records num');
      var tete = el('tr');
      ['Au moins', t.douzeMois ? 'Record ' + SUR_DOUZE_MOIS : 'Record', 'Le', 'Il y a 6 mois', 'Il y a 1 an']
        .forEach(function (x) { tete.appendChild(el('th', null, x)); });
      tab.appendChild(tete);
      lignes.forEach(function (l) {
        var tr = el('tr');
        var v = l.valeurs;
        tr.appendChild(el('td', null, M().repsTexte(l.reps)));
        var rec = el('td');
        rec.appendChild(el('b', null, M().charge(v[0].charge)));
        tr.appendChild(rec);
        tr.appendChild(el('td', 'tr-date', v[0].date ? jour(new Date(v[0].date)) : ''));
        [v[1], v[2]].forEach(function (avant) {
          var td = el('td', null, avant ? nombreFr(avant.charge) : '\u2014');
          var e = ecartRecord(v[0], avant);
          if (e !== null) td.appendChild(el('span', 'plus-record', ' +' + nombreFr(e)));
          tr.appendChild(td);
        });
        tab.appendChild(tr);
      });
      var defile = el('div', 'defile-records');
      defile.appendChild(tab);
      carte.appendChild(defile);
    }

    if (t.travail) {
      carte.appendChild(el('div', 'section-t', 'RAPPORTÉ À TON POIDS'));
      if (t.rapport) {
        var r = el('div', 'exo-fiche');
        ligneFiche(r, 'Ta charge de travail', null, M().chargeFois(t.travail.palier, t.travail.niveau));
        ligneFiche(r, 'Ton poids', 'pesée du ' + dateCourte(t.rapport.pesee.date),
          nombreFr(t.rapport.pesee.poids) + '\u00a0kg');
        ligneFiche(r, 'Rapport', null, nombreFr(t.rapport.rapport));
        carte.appendChild(r);
      } else {
        carte.appendChild(el('p', 'exo-note', 'Pèse-toi pour voir ce rapport.'));
      }
    }
    cible.appendChild(carte);
    // 120 (D1, audit du 16/10/2026) — LA FORCE ESTIMÉE, HORS DES RECORDS : « La force estimée reste, comme progression
    // (page de l'exercice : « Force estimée ≈ 157 kg, d'après 140 × 5 », sa courbe) ; elle sort des records, des
    // médailles, du fil et de l'XP ; les records sont les vraies barres. » La meilleure estimation du périmètre des
    // records (12 mois pour un matériel de salle), de 3 à 10 reps (`Modele.recordsDeLExercice(...).unRM`), avec la série
    // qui la donne. Pas de courbe : la page n'en a pas (une courbe demanderait une maquette).
    if (t.unRM) {
      var force = el('div', 'exo-fiche exo-force');
      // 193-4 : un max MESURÉ par une semaine de test se dit mesuré, sans « ≈ » (c'est une mesure, pas une estimation).
      if (t.unRM.mesure) {
        ligneFiche(force, 'Max mesuré', 'à ta semaine de test, ' + M().chargeFois(t.unRM.charge, t.unRM.reps),
          nombreFr(Math.round(t.unRM.valeur * 10) / 10) + '\u00a0kg');
      } else {
        ligneFiche(force, 'Force estimée', 'd\u2019après ' + M().chargeFois(t.unRM.charge, t.unRM.reps),
          '\u2248\u00a0' + nombreFr(Math.round(t.unRM.valeur)) + '\u00a0kg');
      }
      cible.appendChild(force);
    }
  }

  // 109 (MOTEUR §9.25) — « MON OBJECTIF », en tête de la page d'exercice (maquette salle-objectif v1, écran 3). Le
  // rendu ne décide rien : tout vient de `THObjectif.vue` (le titre, la jauge depuis le record de la pose, le record
  // d'aujourd'hui, UNE ligne de date, figée). Jamais de rouge : la jauge est dans la couleur du coach, la ligne en
  // texte ordinaire. Sans objectif, un seul bouton. Absente sans la table `objectifs` (migration v2_089).
  function rendreCarteObjectif(cible, o) {
    var carte = el('section', 'exo-objectif');
    carte.appendChild(el('div', 'section-t', 'MON OBJECTIF'));
    var v = o.vue;
    if (v) {
      var fiche = el('div', 'exo-fiche objectif-fiche');
      fiche.appendChild(el('div', 'objectif-titre num', v.titre));
      var jauge = el('div', 'objectif-jauge');
      jauge.setAttribute('role', 'progressbar');
      jauge.setAttribute('aria-valuemin', '0');
      jauge.setAttribute('aria-valuemax', '100');
      jauge.setAttribute('aria-valuenow', String(Math.round(v.jauge * 100)));
      var plein = el('i', '');
      plein.style.width = Math.round(v.jauge * 100) + '%';
      jauge.appendChild(plein);
      fiche.appendChild(jauge);
      if (v.aujourdhui) fiche.appendChild(el('div', 'objectif-aujourdhui num', v.aujourdhui));
      if (v.ligne) {
        var ligne = el('p', 'objectif-date', v.ligne);
        if (v.pari) ligne.appendChild(el('span', 'objectif-pari', v.pari));
        fiche.appendChild(ligne);
        if (v.rythme) fiche.appendChild(el('p', 'objectif-rythme', v.rythme));
      }
      carte.appendChild(fiche);
    }
    var b = el('button', 'discret bloc-large objectif-changer', v ? 'Changer l\u2019objectif' : 'Poser un objectif');
    b.type = 'button';
    b.addEventListener('click', o.surPoser);
    carte.appendChild(b);
    cible.appendChild(carte);
  }

  // 109 — LA FEUILLE « POSER UN OBJECTIF » (maquette, écran 4) : la charge, les reps, la phrase du record pour les
  // reps tapées (`vue.phrasePour`). « Poser l'objectif » attend la réponse de `vue.surValider` (une promesse) : un
  // refus (« Déjà fait : … », une saisie hors bornes) reste dans la feuille. « Retirer l'objectif » quand il existe.
  function rendreFeuilleObjectif(cible, vue) {
    vider(cible);
    teteFeuille(cible, vue.existe ? 'Changer l\u2019objectif' : 'Poser un objectif', vue.nom, null);
    var champ = function (etiquette, valeur, mode, cle) {
      var env = el('label', 'champ-texte');
      env.appendChild(el('span', '', etiquette));
      var n = doc.createElement('input');
      n.type = 'text';
      n.inputMode = mode;
      n.setAttribute('data-cle', cle);
      n.value = valeur === null || valeur === undefined ? '' : String(valeur);
      env.appendChild(n);
      cible.appendChild(env);
      return n;
    };
    var charge = champ('Charge (kg)', vue.charge, 'decimal', 'charge');
    var reps = champ('Reps', vue.reps, 'numeric', 'reps');
    var phrase = el('p', 'feuille-aide objectif-phrase', vue.phrasePour(reps.value));
    reps.addEventListener('input', function () { phrase.textContent = vue.phrasePour(reps.value); });
    cible.appendChild(phrase);
    var err = el('p', 'feuille-err', '');
    cible.appendChild(err);
    piedFeuille(cible, [
      vue.existe ? { classe: 'des', texte: 'Retirer l\u2019objectif', surClic: vue.surRetirer } : null,
      { classe: 'sec', texte: 'Annuler', surClic: vue.surAnnuler },
      { classe: 'pri', texte: 'Poser l\u2019objectif', surClic: function (ev) {
        var bouton = ev && ev.currentTarget;
        if (bouton) bouton.disabled = true;
        err.textContent = '';
        Promise.resolve(vue.surValider(charge.value, reps.value)).then(function (refus) {
          if (bouton) bouton.disabled = false;
          if (refus) { err.textContent = refus; charge.focus(); }
        }, function () { if (bouton) bouton.disabled = false; });
      } }
    ]);
    return cible;
  }

  // 127 (ECRAN-SAISIE §7 quater.6, maquette `maquette-echelle-page-v1.html`, validée le 21/10/2026) — « TON ÉCHELLE »,
  // en tête du Résumé. Le dessin seulement : les marches (du plus difficile au plus facile), ta marche en ambre, la
  // suivante en contour, l'habileté en pointillé, la marche de la page soulignée ; chaque exercice est un bouton qui
  // ouvre sa page (44 px au moins). Les textes et les chiffres arrivent faits (`Modele.vueEchelle`, l'app) : ici, rien
  // ne se calcule.
  function rendreTonEchelle(cible, v, surMarche) {
    var carte = el('section', 'ton-echelle');
    carte.appendChild(el('h3', 'te-titre', 'Ton échelle'));
    var ol = el('ol', 'te-marches');
    (v.marches || []).forEach(function (m) {
      var faite = (m.exercices || []).some(function (x) { return x.fait; });
      var li = el('li', 'te-marche' + (m.tienne ? ' tienne' : faite ? ' faite' : '') + (m.suivante ? ' suivante' : '') +
        (m.vue ? ' vue' : ''));
      li.appendChild(el('span', 'te-rond num', String(m.rang)));
      var corps = el('div', 'te-corps');
      var ligne = el('div', 'te-exos');
      (m.exercices || []).forEach(function (x, i) {
        if (i) ligne.appendChild(el('span', 'te-sep', '\u00b7'));
        var b = el('button', 'te-exo');
        b.type = 'button';
        b.setAttribute('data-slug', x.slug);
        b.appendChild(el('span', 'te-nom', x.nom));
        if (x.habilete) b.appendChild(el('span', 'te-etiq hab', 'habileté'));
        if (x.fait && x.meilleur) {
          var det = el('span', 'te-det', 'Ton meilleur : ');
          det.appendChild(el('b', 'num', x.meilleur));
          if (x.quand) det.appendChild(doc.createTextNode(' \u00b7 ' + x.quand));
          b.appendChild(det);
        }
        b.addEventListener('click', function () { if (surMarche) surMarche(x.slug); });
        ligne.appendChild(b);
      });
      if (m.tienne) ligne.appendChild(el('span', 'te-etiq ici', 'ta marche'));
      if (m.suivante) ligne.appendChild(el('span', 'te-etiq next', 'la suivante'));
      corps.appendChild(ligne);
      li.appendChild(corps);
      ol.appendChild(li);
    });
    carte.appendChild(ol);
    if (v.phrase) carte.appendChild(el('p', 'te-phrase', v.phrase));
    cible.appendChild(carte);
  }

  // 175 (MOTEUR §10 bis) — « POUR CONTINUER À MONTER » : les leviers de la carte du plafond, gardés sur la page de l'exercice
  // (refusés ou non). Le dessin seulement : tout arrive fait (`plan.exercices[i].leviersGardes`). Un geste par levier quand la
  // séance est ouverte (`surLevier`), sinon la liste se lit.
  function rendreLeviersGardes(cible, v) {
    if (!v || !(v.liste || []).length) return;
    var carte = el('section', 'pour-monter');
    carte.appendChild(el('h3', 'te-titre', 'Pour continuer à monter'));
    var ul = el('ul', 'pm-leviers');
    v.liste.forEach(function (lv) {
      var li = el('li', 'pm-levier pm-' + lv.cle);
      if (v.surLevier) {
        var b = el('button', 'pm-geste', lv.texte);
        b.type = 'button';
        b.addEventListener('click', function () { v.surLevier(lv.cle); });
        li.appendChild(b);
      } else {
        li.appendChild(doc.createTextNode(lv.texte));
      }
      ul.appendChild(li);
    });
    carte.appendChild(ul);
    cible.appendChild(carte);
  }

  // 145 (ECRAN-SAISIE §7 quater.7, maquette `maquette-semaine-echelles-v1.html`, validée le 23/10/2026) — « TES ÉCHELLES
  // CETTE SEMAINE », en tête de Saisie. Le dessin seulement : tout arrive fait (`Modele.vueEchellesDeLaSemaine`, l'app).
  // La carte s'ouvre sur la page « Ton échelle » (`vue.surOuvrir(slug)`, celle de la première échelle). Ni flèche, ni
  // rouge : « nouvelle » est le seul fait en couleur ; les ronds sont pleins quand la séance a tenu la condition.
  function rendreCarteEchelles(cible, vue) {
    vider(cible);
    if (!vue || !vue.echelles || !vue.echelles.length) { cible.hidden = true; return cible; }
    cible.hidden = false;
    var carte = el('button', 'carte-echelles');
    carte.type = 'button';
    carte.setAttribute('data-slug', vue.echelles[0].ouvre);
    carte.appendChild(el('span', 'ce-etiquette', 'Tes échelles \u00b7 semaine du ' + vue.libelle));
    vue.echelles.forEach(function (e) {
      var bloc = el('span', 'ce-ech');
      var tete = el('span', 'ce-tete');
      tete.appendChild(el('span', 'ce-nom', e.nom));
      var marche = el('span', 'ce-marche', 'ta marche : ');
      marche.appendChild(el('b', null, e.marche.nom));
      if (e.nouvelle) marche.appendChild(el('span', 'ce-nouvelle', 'nouvelle'));
      tete.appendChild(marche);
      bloc.appendChild(tete);
      if (e.fait) {
        var f = el('span', 'ce-fait');
        var dit = (e.fait.slug !== e.marche.slug ? e.fait.nom + ' : ' : '') + e.fait.meilleur;
        f.appendChild(doc.createTextNode(e.nouvelle ? 'Première fois : ' + dit : dit));
        var gris = e.nouvelle ? (e.nouvelle.avant ? 'avant : ' + e.nouvelle.avant : '')
          : (e.fait.avant ? 'la semaine d\u2019avant : ' + e.fait.avant : '');
        if (gris) f.appendChild(el('span', 'ce-gris', ' \u00b7 ' + gris));
        bloc.appendChild(f);
      }
      if (e.suite) {
        var s = el('span', 'ce-suite');
        s.appendChild(doc.createTextNode(e.suite.phrase + ' '));
        if (e.suite.ronds) {
          var pas = el('span', 'ce-pas');
          e.suite.ronds.forEach(function (plein) { pas.appendChild(el('i', plein ? 'ok' : null)); });
          s.appendChild(pas);
        }
        if (e.suite.serie) { s.appendChild(el('br')); s.appendChild(doc.createTextNode('Cette semaine : ' + e.suite.serie + '.')); }
        bloc.appendChild(s);
      }
      carte.appendChild(bloc);
    });
    var lien = el('span', 'ce-lien');
    lien.appendChild(el('b', null, vue.echelles.length > 1 ? 'Tes échelles' : 'Ton échelle'));
    lien.appendChild(doc.createTextNode(' \u203a'));
    carte.appendChild(lien);
    carte.addEventListener('click', function () { if (vue.surOuvrir) vue.surOuvrir(vue.echelles[0].ouvre); });
    cible.appendChild(carte);
    return cible;
  }

  function rendreResumeExo(cible, vue) {
    if (vue.tonEchelle) rendreTonEchelle(cible, vue.tonEchelle, vue.surMarche);
    if (vue.leviers) rendreLeviersGardes(cible, vue.leviers);
    if (vue.objectif) rendreCarteObjectif(cible, vue.objectif);
    if (vue.teteRecords) rendreTeteRecords(cible, vue.teteRecords);
    cible.appendChild(el('div', 'section-t', 'RECORDS'));
    var fiche = el('div', 'exo-fiche');

    // La dernière séance porte la MEILLEURE SÉRIE du jour, comme Progression
    // et la carte de séance ; le record de charge, la ligne la plus lourde de
    // la table (PR 5 de la consolidation, décision du 02/10/2026).
    var d = vue.derniere;
    ligneFiche(fiche, 'Dernière séance', d ? dateCourte(d.date) : null,
      d ? texteMeilleure(d) : '');
    var r = vue.record;
    // §9.23 (H1, #371) — un matériel de salle : le record se lit sur 12 mois,
    // et l'écran le dit, à côté de lui.
    // 119 (E5) — le libellé suit la mesure (`THModele.affichageDeMesure`) : « Plus longue durée » sur une planche ou
    // un tapis, « Record de reps » au poids du corps ; « Record » pour une mesure inconnue.
    var aff = M().affichageDeMesure(vue.mesure);
    // Prompt 131 (audit 130 n°5) — une meilleure série en distance seule porte son libellé.
    ligneFiche(fiche, r && r.libelle ? r.libelle : (aff ? aff.meilleure : 'Record'),
      sousDouzeMois(r && r.date ? dateCourte(r.date) : null, vue.recordSurDouzeMois), r ? texteMeilleure(r) : '');
    var v = vue.volume || {};
    ligneFiche(fiche, 'Séries de travail',
      v.nbSeances ? 'sur ' + v.nbSeances + ' séance' + (v.nbSeances > 1 ? 's' : '') : null,
      v.nbSeries ? String(v.nbSeries) : '');
    cible.appendChild(fiche);

    // ⚠️ L'AFFICHAGE LIT LA MESURE, PAS LE CODE D'ERREUR DU MOTEUR.
    var sansPalier = phraseSansPalier(vue.mesure);
    if (sansPalier) cible.appendChild(el('p', 'exo-note', sansPalier));

    if (aDesRepetitions(vue.mesure)) rendreTableReps(cible, vue);
  }

  // §7 quater.4 — l'historique. Chaque séance avec TOUTES ses séries : chauffe
  // en retrait, tentative marquée, effort selon ce qui a été saisi — c'est
  // `rendreBloc` qui sait déjà tout ça, et `construireBlocs` qui le prépare.
  // Le titre mène au détail complet, pour qui veut le contexte des autres
  // exercices.
  function rendreHistoriqueExo(cible, vue) {
    var liste = vue.historique || [];
    if (!liste.length) {
      cible.appendChild(el('p', 'vide', 'Aucune séance avec cet exercice.'));
      return;
    }
    liste.forEach(function (s) {
      var carte = el('section', 'exo-jour');

      var tete = el('div', 'exo-jour-tete');
      tete.appendChild(el('span', 'exo-jour-d', dateLongue(s.debut)));
      var sous = el('button', 'exo-jour-s', s.titre || 'Séance');
      sous.type = 'button';
      // Un record atteint ce jour-là est signalé : c'est ce qui donne envie de
      // défiler. Il porte SON nombre de reps — « record » nu ne dirait pas de
      // quoi.
      if (s.record) {
        sous.appendChild(el('b', null, ' · record à ' + M().repsTexte(s.record)));
      }
      sous.addEventListener('click', function () { vue.surSeance(s.id); });
      tete.appendChild(sous);
      carte.appendChild(tete);

      (s.blocs || []).forEach(function (b) { carte.appendChild(rendreBloc(b)); });

      // 115 (audit du 16/10, E3 ; décision d'Aurélien D8) — PAS DE « REPOS MOYEN ». `repos_s` n'est pas un
      // repos (le temps d'exécution y entre, une série de superset enchaînée y vaut 45 s) : enregistré, jamais
      // affiché (MODIFICATEURS §4), tant qu'il n'est pas un vrai repos. Seule la note de séance reste.
      if (s.note) carte.appendChild(el('div', 'exo-jour-note', s.note));
      cible.appendChild(carte);
    });

    // « Voir plus » : 20 séances d'abord, le reste sur demande. Absent quand il
    // n'y a rien de plus — un bouton qui ne révèle rien est un mensonge.
    if (vue.reste) {
      var plus = el('button', 'discret bloc-large',
        'Voir plus — ' + vue.reste + ' séance' + (vue.reste > 1 ? 's' : '') + ' avant');
      plus.type = 'button';
      plus.addEventListener('click', vue.surVoirPlus);
      cible.appendChild(plus);
    }
  }

  // 125 (ECRAN-SAISIE §7 quater.5, maquette « comment faire ») — L'ONGLET « COMMENT FAIRE ». Une fiche (Matériel,
  // Travaille, Aussi), puis les étapes numérotées. ⚠️ AUCUN TEXTE ÉCRIT ICI : les libellés arrivent faits
  // (`app.js` appelle `Profil.libelleEquipement` et `Semaine.libelleMuscle`), et chaque étape est une ligne de
  // `exercises.description`, MOT POUR MOT — l'écran ne fait que numéroter. Une ligne sans valeur ne s'affiche pas ;
  // une fiche sans ligne non plus (une mobilité n'a que son matériel).
  function rendreCommentExo(cible, vue) {
    var c = vue.comment || {};
    var fiche = el('div', 'exo-fiche exo-comment-fiche');
    [['Matériel', c.materiel], ['Travaille', c.travaille], ['Aussi', c.aussi]].forEach(function (l) {
      if (!l[1]) return;
      var li = el('div', 'exo-li');
      li.appendChild(el('span', 'exo-li-k', l[0]));
      li.appendChild(el('span', 'exo-li-v', l[1]));
      fiche.appendChild(li);
    });
    if (fiche.childNodes.length) cible.appendChild(fiche);
    var etapes = el('ol', 'etapes');
    var n = 0;
    String(c.description || '').split('\n').forEach(function (ligne) {
      if (!ligne.trim()) return;
      n++;
      var li = el('li', 'etape');
      li.appendChild(el('span', 'etape-n', String(n)));
      li.appendChild(el('span', 'etape-t', ligne));
      etapes.appendChild(li);
    });
    if (n) cible.appendChild(etapes);
  }

  // 144-6 — la feuille « Comment faire » d'un exercice vu chez un ami : LE MÊME rendu que l'onglet (`rendreCommentExo`),
  // en lecture seule. Ni « Ton échelle » ni record : ce seraient les siens ou les tiens, et ce n'est ni l'un ni l'autre.
  function rendreFeuilleCommentFaire(cible, vue) {
    vider(cible);
    teteFeuille(cible, 'Comment faire', vue.nom, null);
    var corps = el('div', 'exo-comment-feuille');
    rendreCommentExo(corps, { comment: vue.comment });
    cible.appendChild(corps);
    piedFeuille(cible, [{ classe: 'des', texte: 'Fermer', surClic: vue.surFermer }]);
    return cible;
  }

  function rendrePageExercice(cible, vue) {
    vider(cible);
    if (vue.seanceEnCours) cible.appendChild(bandeauExoSeance(vue));

    var tete = el('div', 'exo-tete');
    tete.appendChild(el('h2', null, vue.nom));
    // §7 quater — LA MÊME ÉTIQUETTE QU'EN SÉANCE, et pour la même raison : la
    // zone appartient à l'exercice, pas à la séance où on le croise.
    if (vue.etiquette) {
      var puce = puceZone(vue.etiquette, vue.zoneChoisie, vue.surZone);
      puce.classList.add('puce-seule');
      tete.appendChild(puce);
    } else if (vue.modeEntretien) {
      // §9.17 — « Entretien » : le coach se tait sur cet exercice, par choix.
      var pe = puceZone('Entretien', true, vue.surZone);
      pe.classList.add('puce-seule');
      tete.appendChild(pe);
    }
    if (vue.sousTitre) tete.appendChild(el('div', 'exo-meta num', vue.sousTitre));
    // 193-3 (D3) — les zones que les routines fixent à cet exercice, une ligne chacune.
    (vue.lignesDeRoutine || []).forEach(function (t) { tete.appendChild(el('div', 'exo-meta', t)); });
    cible.appendChild(tete);

    cible.appendChild(sousOngletsExo(vue));

    if (vue.onglet === 'historique') rendreHistoriqueExo(cible, vue);
    else if (vue.onglet === 'comment' && vue.comment) rendreCommentExo(cible, vue);
    else rendreResumeExo(cible, vue);
    return cible;
  }

  // ⚠️ UNE CONFIRMATION GÉNÉRIQUE, pour ce qui ne se rattrape pas. Celle des
  // blocs (`rendreFeuilleSupprimer`) parle d'exercices et compte des séries ;
  // celle-ci ne suppose rien de ce qu'elle efface.
  function rendreFeuilleConfirmer(cible, vue) {
    vider(cible);
    var t = el('div', 'feuille-t', vue.titre);
    if (vue.sujet) t.appendChild(el('em', '', vue.sujet));
    cible.appendChild(t);
    if (vue.aide) cible.appendChild(el('p', 'feuille-aide', vue.aide));
    var menu = el('div', 'feuille-menu');
    entreeMenu(menu, vue.libelle || 'Confirmer',
      { classe: vue.danger ? 'danger' : '', surClic: vue.surConfirmer });
    // 84 — un libellé d'annulation au choix (« Pas maintenant ») ; défaut inchangé.
    entreeMenu(menu, vue.libelleAnnuler || 'Annuler', { surClic: vue.surAnnuler });
    cible.appendChild(menu);
    return cible;
  }

  // 59-2 — LA FENÊTRE DE SORTIE : des séances pas encore envoyées. Elle
  // n'écrit aucune phrase : le titre, l'aide et les deux libellés viennent de
  // `THQuitter.fenetreDeSortie`. « Rester » est le bouton principal ; « Quitter
  // quand même » prend le rouge (`--manque`), seul usage permis : une action
  // destructive.
  function rendreFeuilleSortie(cible, vue) {
    vider(cible);
    cible.appendChild(el('div', 'feuille-t', vue.titre));
    cible.appendChild(el('p', 'feuille-aide', vue.aide));
    var actions = el('div', 'sortie-actions');
    var rester = el('button', 'principal sortie-rester', vue.rester);
    rester.type = 'button';
    rester.addEventListener('click', function () { vue.surRester(); });
    actions.appendChild(rester);
    var quitter = el('button', 'sortie-quitter', vue.quitter);
    quitter.type = 'button';
    quitter.addEventListener('click', function () { vue.surQuitter(); });
    actions.appendChild(quitter);
    cible.appendChild(actions);
    return cible;
  }

  // §9.18 (51-1) — LE CHOIX DE DURÉE (45 ou 60 min), avant la carte.
  function rendreFeuilleTemps(cible, vue) {
    vider(cible);
    var t = el('div', 'feuille-t', 'J’ai peu de temps');
    if (vue.sujet) t.appendChild(el('em', '', vue.sujet));
    cible.appendChild(t);
    if (vue.aide) cible.appendChild(el('p', 'feuille-aide', vue.aide));
    var menu = el('div', 'feuille-menu choix-temps');
    (vue.choix || []).forEach(function (c) { entreeMenu(menu, c.libelle, { surClic: c.surClic }); });
    entreeMenu(menu, 'Annuler', { surClic: vue.surAnnuler });
    cible.appendChild(menu);
    return cible;
  }

  // §9.18 (51-1) — LA CARTE DU RACCOURCI. Elle n'écrit aucune phrase : tout
  // vient de `THMoteur.carteRaccourcir` (titre, lignes, phrase, boutons).
  function rendreCarteRaccourci(cible, vue) {
    vider(cible);
    var c = vue.carte || {};
    var carte = el('div', 'carte-raccourci' + (c.tient ? '' : ' au-plus-court'));
    carte.appendChild(el('div', 'feuille-t cr-titre', c.titre || ''));
    var liste = el('ul', 'cr-lignes');
    (c.lignes || []).forEach(function (l) { liste.appendChild(el('li', '', l)); });
    carte.appendChild(liste);
    if (c.phrase) carte.appendChild(el('p', 'feuille-aide cr-phrase', c.phrase));
    cible.appendChild(carte);
    var menu = el('div', 'feuille-menu');
    entreeMenu(menu, c.oui || 'Raccourcir', { classe: 'cr-oui', surClic: vue.surRaccourcir });
    entreeMenu(menu, c.non || 'Garder la séance', { classe: 'cr-non', surClic: vue.surGarder });
    cible.appendChild(menu);
    return cible;
  }

  // Indicateur discret : il dit d'où viennent les données, il n'alarme pas et
  // ne bloque rien. Une app qui refuse de s'ouvrir faute de synchronisation est
  // pire que le problème qu'elle résout.
  function rendreEtat(cible, etat) {
    if (!cible) return;
    vider(cible);
    if (!etat || !etat.libelle) return;
    cible.className = 'etat-sync ' + (etat.code || '');
    cible.appendChild(el('span', 'etat-pastille', ''));
    cible.appendChild(el('span', null, etat.libelle));
  }


  // ── Vue hebdomadaire ────────────────────────────────────────────────────


  function MOIS() { return M().MOIS_COURTS; }

  // « 7 – 13 sept. 2026 », ou « 31 août – 6 sept. 2026 » à cheval sur deux mois.
  function libelleSemaine(lundi, dimanche) {
    if (!lundi || !dimanche) return '';
    var memeMois = lundi.getMonth() === dimanche.getMonth() && lundi.getFullYear() === dimanche.getFullYear();
    var g = lundi.getDate() + (memeMois ? '' : ' ' + MOIS()[lundi.getMonth()]);
    return g + ' – ' + dimanche.getDate() + ' ' + MOIS()[dimanche.getMonth()] + ' ' + dimanche.getFullYear();
  }

  // Bilan : le compte brut, puis le volume par muscle. Strictement descriptif —
  // aucun seuil, aucune couleur d'alarme, aucun verdict. La règle de volume
  // exige trois semaines actives et deux fenêtres de persistance : rien ne peut
  // être conclu d'une semaine isolée, donc rien n'est conclu.
  // ── La barre de semaine, identique dans les deux onglets ────────────────
  //
  // Construite en JS plutôt que dupliquée dans le balisage : une seule
  // définition, deux emplacements, et la semaine affichée se conserve en
  // passant d'un onglet à l'autre.
  function rendreBarreSemaine(cible, vue) {
    if (!cible) return;
    vider(cible);
    var barre = el('div', 'barre-sem');

    var prec = el('button', 'barre-fl', '\u2039');
    prec.type = 'button'; prec.setAttribute('aria-label', 'Semaine précédente');
    prec.addEventListener('click', vue.surPrecedente);
    barre.appendChild(prec);

    var milieu = el('button', 'barre-milieu');
    milieu.type = 'button';
    milieu.setAttribute('aria-label', 'Choisir une semaine');
    var date = el('span', 'barre-date', vue.libelle);
    date.appendChild(el('span', 'barre-chevron', '\u2304'));
    milieu.appendChild(date);
    if (vue.sousTitre) milieu.appendChild(el('span', 'barre-totaux', vue.sousTitre));
    milieu.addEventListener('click', vue.surDate);
    barre.appendChild(milieu);

    var suiv = el('button', 'barre-fl', '\u203a');
    suiv.type = 'button'; suiv.setAttribute('aria-label', 'Semaine suivante');
    suiv.addEventListener('click', vue.surSuivante);
    barre.appendChild(suiv);

    cible.appendChild(barre);

    // « Cette semaine » APPARAÎT dès qu'on a quitté la semaine courante, et
    // disparaît quand on y est. Il vivait dans le pied du calendrier depuis le
    // chantier 13 : mauvaise décision, vérifiée à l'usage — dès qu'on recule de
    // deux ou trois semaines on veut revenir, et ouvrir le calendrier pour ça
    // est un détour. Il reste AUSSI dans le pied du calendrier ; les deux ne se
    // gênent pas.
    //
    // Absent sur la semaine courante plutôt que grisé : un bouton qui ne fait
    // rien est un bouton de trop, et sa disparition dit à elle seule « tu y es ».
    if (vue.surCetteSemaine) {
      var retour = el('button', 'barre-retour', 'Cette semaine');
      retour.type = 'button';
      retour.addEventListener('click', vue.surCetteSemaine);
      cible.appendChild(retour);
    }
  }

  // ── La ligne de rappel (Séances) ────────────────────────────────────────
  //
  // Les six zones en trois colonnes sur deux rangs, ~40 px. Le relevé complet
  // occupait ~250 px avant la première séance : sur une semaine à six séances,
  // une seule était visible. Séances répond à « qu'ai-je fait », Progression à
  // « comment ça se répartit ».
  function rendreRappel(cible, zones, surChoix) {
    if (!cible) return;
    vider(cible);
    // Pas de rappel quand la semaine est vide : rien à rappeler.
    if (!zones || !zones.length) return;

    var ligne = el('button', 'rappel');
    ligne.type = 'button';
    ligne.setAttribute('aria-label', 'Voir la répartition dans Progression');
    var grille = el('span', 'rappel-zones');
    zones.forEach(function (z) {
      var item = el('span', 'rappel-zone');
      item.appendChild(el('span', null, z.libelle + ' '));
      item.appendChild(el('b', null, nombreFr(z.series)));
      grille.appendChild(item);
    });
    ligne.appendChild(grille);
    ligne.appendChild(el('span', 'rappel-fl', '\u203a'));
    ligne.addEventListener('click', surChoix);
    cible.appendChild(ligne);
  }

  // ── Le relevé par zones (Progression) ───────────────────────────────────
  //
  // Trois niveaux, UN SEUL cran d'indentation : la zone déplie ses muscles en
  // place, le muscle ouvre une fenêtre. Trois indentations écrasent les noms à
  // 360 px — c'est l'erreur des trois premières tentatives.
  function rendreReleveZones(cible, zones, ouverte, surZone, surMuscle) {
    if (!cible) return;
    vider(cible);
    if (!zones || !zones.length) {
      cible.appendChild(el('p', 'semaine-vide', 'Aucune séance cette semaine.'));
      return;
    }
    var releve = el('div', 'releve');
    zones.forEach(function (z) {
      var estOuverte = z.zone === ouverte;
      var bloc = el('div', 'zone' + (estOuverte ? ' ouvert' : '') + (z.horsTable ? ' hors-table' : ''));

      var tete = el('button', 'zone-tete');
      tete.type = 'button';
      tete.setAttribute('aria-expanded', estOuverte ? 'true' : 'false');
      tete.appendChild(el('span', 'zone-chevron', '\u25b6'));
      tete.appendChild(el('span', 'zone-nom', z.libelle));
      tete.appendChild(el('span', 'zone-pointille'));
      tete.appendChild(el('span', 'zone-valeur', nombreFr(z.series)));
      tete.addEventListener('click', function () { surZone(z.zone); });
      bloc.appendChild(tete);

      if (estOuverte) {
        var liste = el('div', 'zone-muscles');
        z.muscles.forEach(function (m) {
          var mu = el('button', 'muscle-ligne');
          mu.type = 'button';
          mu.appendChild(el('span', 'muscle-nom', m.libelle));
          mu.appendChild(el('span', 'muscle-pointille'));
          mu.appendChild(el('span', 'muscle-valeur', nombreFr(m.series)));
          mu.appendChild(el('span', 'muscle-fl', '\u203a'));
          mu.addEventListener('click', function () { surMuscle(m); });
          liste.appendChild(mu);
        });
        bloc.appendChild(liste);
      }
      releve.appendChild(bloc);
    });
    cible.appendChild(releve);
  }

  // ── La fenêtre d'un muscle ──────────────────────────────────────────────
  //
  // Elle répond à « d'où vient ce 11,5 » : chaque exercice porte son apport, le
  // jour, et le nombre de séries RÉELLES. C'est là que se lit l'écart entre
  // 5 séries et 2,5 points. La ligne dit la classe (« muscle secondaire »,
  // « muscle stabilisateur ») ; la note l'explique UNE fois, en bas, et ne nomme
  // que les classes présentes (65, ECRAN-SAISIE §7 bis).
  function rendreFenetreMuscle(cible, muscle, zone, apports, bornes) {
    if (!cible) return;
    vider(cible);
    var haut = el('div', 'fen-haut');
    var quoi = el('span', 'fen-quoi', muscle.libelle);
    var situe = zone ? zone + ' \u00b7 ' : '';
    quoi.appendChild(el('span', 'fen-zone', situe + libelleSemaine(bornes.lundi, bornes.dimanche)));
    haut.appendChild(quoi);
    var combien = el('span', 'fen-combien', nombreFr(muscle.series));
    combien.appendChild(el('em', null, 'séries'));
    haut.appendChild(combien);
    cible.appendChild(haut);

    var secondaire = false, stabilisateur = false;
    apports.forEach(function (a) {
      if (a.secondaire) secondaire = true;
      if (a.stabilisateur) stabilisateur = true;
      var ligne = el('div', 'fen-exo');
      var nom = el('span', 'fen-nom', a.nom);
      var ou = a.jour ? M().JOURS_COURTS[(a.jour.getDay() + 6) % 7] + ' ' + a.jour.getDate() + ' \u00b7 ' : '';
      nom.appendChild(el('em', null, ou + a.seriesReelles + ' série' +
        (a.seriesReelles > 1 ? 's' : '') +
        (a.secondaire ? ', muscle secondaire' : a.stabilisateur ? ', muscle stabilisateur' : '')));
      ligne.appendChild(nom);
      ligne.appendChild(el('span', 'fen-valeur', nombreFr(a.apport)));
      cible.appendChild(ligne);
    });

    var note = secondaire && stabilisateur
      ? 'Un muscle secondaire compte pour un demi-point par série, un stabilisateur pour un quart.'
      : secondaire ? 'Un muscle secondaire compte pour un demi-point par série.'
      : stabilisateur ? 'Un muscle stabilisateur compte pour un quart de point par série.' : null;
    if (note) cible.appendChild(el('p', 'fen-note', note));
  }

  // ── Le calendrier ───────────────────────────────────────────────────────
  //
  // Ce sont les LIGNES qui se sélectionnent. Chaque jour d'une ligne, y compris
  // ceux du mois voisin, choisit la même semaine — et garde ses points.
  function rendreCalendrier(cible, grille, lundiChoisi, surSemaine) {
    if (!cible) return;
    vider(cible);
    M().INITIALES_JOURS.forEach(function (d) {
      cible.appendChild(el('span', 'cal-entete', d));
    });
    var courant = lundiChoisi ? lundiChoisi.getTime() : null;
    grille.lignes.forEach(function (ligne) {
      var choisie = courant !== null && ligne.lundi.getTime() === courant;
      ligne.jours.forEach(function (j) {
        var cel = el('button', 'cal-jour' + (j.horsMois ? ' hors' : '') + (choisie ? ' choisie' : ''));
        cel.type = 'button';
        cel.appendChild(el('span', 'cal-num', String(j.jour)));
        var pts = el('span', 'cal-points');
        for (var i = 0; i < j.points; i++) pts.appendChild(el('i', null, ''));
        cel.appendChild(pts);
        cel.addEventListener('click', function () { surSemaine(ligne.lundi); });
        cible.appendChild(cel);
      });
    });
  }


  // Les sept jours, vides compris. Un jour sans séance s'affiche et ne se juge
  // pas : le système ne commente jamais l'assiduité (CADRAGE-V2 §3.1 bis).
  // Les trois premiers exercices d'une séance. Le premier en clair, les deux
  // suivants en gris : un seul pivot par carte. UNE LIGNE PAR NOM, pas une
  // grille : tant que le palier n'est pas porté, la colonne de droite est vide
  // et une grille à deux colonnes y ferait passer un nom sur deux.
  // La colonne de droite : « nom | meilleure série ». Revenue au chantier 17,
  // corrigée au 18 — elle portait le palier, qui est la grandeur du moteur et
  // pas celle du journal (§7 bis.5).
  // Elle était vide au chantier 13 faute de palier, et la spec demandait alors
  // une liste d'une colonne — une grille à moitié vide fait passer un nom sur
  // deux. Maintenant que la colonne porte quelque chose, la grille reprend.
  //
  // Un exercice sans palier reconnaissable n'affiche QUE son nom. Le nom prend
  // alors toute la largeur : pas de tiret, pas de « — », rien qui ressemble à
  // une valeur manquante. Point de rupture connu à 360 px : les noms longs du
  // catalogue se tronquent, c'est assumé (§7 bis.5).
  function rendreApercu(carte, apercu) {
    if (!apercu || !apercu.tete.length) return;
    var liste = el('div', 'seance-apercu');
    apercu.tete.forEach(function (e, i) {
      var ligne = el('div', 'apercu-exo' + (i === 0 ? ' pivot' : ''));
      ligne.appendChild(el('span', 'apercu-nom', e.nom));
      if (e.charge !== null && e.charge !== undefined) {
        var val = el('span', 'apercu-val', nombreFr(e.charge));
        if (e.reps !== null && e.reps !== undefined) {
          val.appendChild(el('em', null, '\u00d7 ' + e.reps));
        }
        ligne.appendChild(val);
      } else if (e.valeur) {
        // Les mesures sans charge portent leur propre grandeur — « 12 »,
        // « 50 s », « 2 h 10 · 8,4 km ». Le modèle a déjà formaté : la vue
        // n'a rien à convertir.
        var autre = el('span', 'apercu-val', e.valeur);
        if (e.complement) autre.appendChild(el('em', null, ' ' + e.complement));
        ligne.appendChild(autre);
      }
      liste.appendChild(ligne);
    });
    var autres = M().libelleAutres(apercu.autres);
    if (autres) liste.appendChild(el('div', 'apercu-autres', autres));
    carte.appendChild(liste);
  }

  // L'onglet actif reflète la vue courante — une seule source, la route.
  function rendreOnglets(barre, vue) {
    if (!barre) return;
    var boutons = barre.querySelectorAll('.onglet');
    for (var i = 0; i < boutons.length; i++) {
      var actif = boutons[i].getAttribute('data-vue') === vue;
      boutons[i].className = 'onglet' + (actif ? ' actif' : '');
      boutons[i].setAttribute('aria-current', actif ? 'page' : 'false');
    }
  }

  // ⚠️ `surMenu` EST FACULTATIF : sans lui, la carte reste exactement ce qu'elle
  // était. C'est ce qui permet d'ajouter le menu sans toucher aux appelants qui
  // n'en veulent pas.
  function rendreJours(cible, jours, resumeDe, surChoix, surMenu) {
    vider(cible);

    // Une semaine entièrement vide dit qu'elle est vide, plutôt que de rendre
    // un écran nu : sinon on ne distingue pas « je ne me suis pas entraîné »
    // de « l'app a échoué ». Un constat, rien d'autre — le système ne commente
    // jamais l'assiduité (CADRAGE-V2 §3.1 bis).
    if (!jours.length) {
      cible.appendChild(el('p', 'semaine-vide', 'Aucune séance cette semaine.'));
      return;
    }

    jours.forEach(function (j) {
      var bloc = el('div', 'jour');
      var tete = el('div', 'jour-tete');
      tete.appendChild(el('span', 'jour-nom', j.nom));
      tete.appendChild(el('span', 'jour-date', M().jourMois(j.date)));
      bloc.appendChild(tete);

      j.seances.forEach(function (s) {
        var r = resumeDe(s);
        var carte = el('button', 'seance' + (r.estSortie ? ' sortie' : '') +
          (r.incomplet ? ' incomplete' : ''));
        carte.type = 'button';
        var haut = el('div', 'seance-haut');
        haut.appendChild(el('span', 'seance-titre', r.titre));
        carte.appendChild(haut);
        // `de travail` — le qualificatif que le jumeau `rendreListeSeances`
        // porte encore et que celui-ci avait perdu (audit, C1) : une fonction
        // pour les deux depuis 133 (`metaDeSeance`).
        var meta = r.incomplet ? 'séries pas encore reçues' : metaDeSeance(r);
        if (meta) carte.appendChild(el('div', 'seance-meta', meta));
        // Une sortie garde sa carte évidée : durée et distance, pas d'aperçu.
        if (!r.estSortie) rendreApercu(carte, r.apercu);
        carte.addEventListener('click', function () { surChoix(r.id); });

        // §7 octies — LE MENU SUR LA CARTE. Supprimer une séance demandait de
        // l'ouvrir : un détour pour un geste courant. Les trois gestes datent du
        // chantier 29 — c'est un point d'entrée, pas une fonction de plus.
        //
        // ⚠️ LE « ⋯ » EST À CÔTÉ DE LA CARTE, PAS DEDANS. La carte EST un
        // bouton : en imbriquer un second donnerait un balisage invalide, et le
        // tap ouvrirait la séance en même temps que le menu. Une sortie n'en a
        // pas — elle ne se refait pas et ne se modifie pas ici.
        if (!surMenu || r.estSortie || r.incomplet) { bloc.appendChild(carte); return; }
        var enveloppe = el('div', 'seance-enveloppe');
        enveloppe.appendChild(carte);
        enveloppe.appendChild(menuTroisPoints('Actions sur ' + (r.titre || 'la séance'),
          function () { surMenu(r.id); }));
        bloc.appendChild(enveloppe);
      });
      cible.appendChild(bloc);
    });
  }


  // ── Progression : le sommaire (ECRAN-SAISIE §7 bis.14) ──────────────────
  //
  // Des blocs empilés, chacun donnant sa réponse en deux lignes, chacun
  // s'ouvrant sur une vue complète. PAS une barre de sous-onglets : elle
  // coûterait un rang permanent et supposerait des sections de même nature —
  // or le volume et le poids se lisent d'un coup d'œil, l'entrée par exercice
  // est un parcours.
  //
  // L'écran doit être utile SANS RIEN TOUCHER : chaque bloc porte déjà sa
  // réponse, l'ouvrir n'est qu'un approfondissement.
  //
  // La barre de semaine n'est pas ici : le volume est hebdomadaire, le poids ne
  // l'est pas. Elle vit dans la vue Volume.
  function coquilleBloc(quoi, quand, inerte) {
    var bloc = el(inerte ? 'div' : 'button', 'bloc-som' + (inerte ? ' inerte' : ''));
    if (!inerte) bloc.type = 'button';
    var haut = el('div', 'bloc-haut');
    haut.appendChild(el('span', 'bloc-quoi', quoi));
    if (quand) haut.appendChild(el('span', 'bloc-quand', quand));
    // La chevron dit « ça s'ouvre ». Un bloc inerte n'en porte pas : une
    // affordance sans destination est un mensonge d'interface.
    if (!inerte) haut.appendChild(el('span', 'bloc-fl', '\u203a'));
    bloc.appendChild(haut);
    return bloc;
  }

  function blocVolume(v) {
    var bloc = coquilleBloc('Volume par muscle', v.quand, false);
    if (v.zones && v.zones.length) {
      // 173 (« Vivant ») — les mêmes nombres, en barres horizontales `--donnees` : largeur proportionnelle au plus grand, le nombre à droite.
      var grille = el('div', 'bloc-zones');
      var plusGrand = Math.max.apply(null, v.zones.map(function (z) { return Number(z.series) || 0; }).concat([0]));
      v.zones.forEach(function (z) {
        var item = el('span', 'bloc-zone');
        item.appendChild(el('span', 'bz-nom', z.libelle));
        item.appendChild(doc.createTextNode(' '));
        var piste = el('i', 'bz-piste');
        var barre = el('i', 'bz-barre');
        barre.style.width = (plusGrand > 0 ? Math.round((Number(z.series) || 0) / plusGrand * 100) : 0) + '%';
        piste.appendChild(barre);
        item.appendChild(piste);
        item.appendChild(el('b', null, grand(z.series)));
        grille.appendChild(item);
      });
      bloc.appendChild(grille);
    } else {
      bloc.appendChild(el('div', 'bloc-rien', 'Aucune séance cette semaine.'));
    }
    bloc.addEventListener('click', v.surChoix);
    return bloc;
  }

  // Dernière valeur, sa date, l'écart avec la pesée précédente, le nombre de
  // mesures. Strictement descriptif : pas d'objectif, pas de poids cible, pas
  // de commentaire sur la variation — donc aucune couleur de jugement, le
  // chiffre est du texte ordinaire, qu'il monte ou qu'il descende.
  function blocPoids(v) {
    var r = v.resume;
    var bloc = coquilleBloc('Poids de corps', r ? jour(r.date) : '', false);
    if (r) {
      var ligne = el('div', 'bloc-pesee');
      ligne.appendChild(el('span', 'pesee-gros', nombreFr(r.poids)));
      ligne.appendChild(el('span', 'pesee-unite', 'kg'));
      // 173 — ligne 1 : le poids à gauche, la variation à droite (même ligne de base) ; ligne 2 : « depuis le … · N pesées », pleine largeur.
      var an = r.date.getFullYear();
      ligne.appendChild(el('span', 'pesee-var', r.variation ? signe(r.variation.valeur) + ' kg' : ''));
      bloc.appendChild(ligne);
      bloc.appendChild(el('div', 'pesee-depuis',
        (r.variation ? 'depuis le ' + jour(r.variation.depuis, an) + ' \u00b7 ' : '') +
        r.nb + ' pesée' + (r.nb > 1 ? 's' : '')));
    } else {
      bloc.appendChild(el('div', 'bloc-rien', 'Aucune pesée enregistrée.'));
    }
    bloc.addEventListener('click', v.surChoix);
    // 173 — « Peser » : un bouton posé sur la carte (à côté d'elle dans le DOM : la carte est un bouton, on n'en imbrique pas un second).
    if (v.surPeser) {
      bloc.classList.add('avec-peser');
      var env = el('div', 'bloc-enveloppe');
      env.appendChild(bloc);
      var rangeePeser = el('div', 'bloc-peser-rangee');
      var pe = el('button', 'bloc-peser', 'Peser');
      pe.type = 'button';
      pe.setAttribute('aria-label', 'Peser');
      pe.addEventListener('click', function () { v.surPeser(); });
      rangeePeser.appendChild(pe);
      env.appendChild(rangeePeser);
      return env;
    }
    return bloc;
  }

  // Bloc INERTE : il donne sa réponse — les trois derniers exercices pratiqués
  // — et dit que la vue arrive. Il ne s'ouvre pas, donc il n'a ni chevron ni
  // réaction au toucher.
  // ⚠️ LES LIGNES MÈNENT À LA PAGE D'EXERCICE (§7 quater). C'est la troisième
  // porte vers UNE seule page — les deux autres sont le détail d'une séance et
  // le menu de bloc en séance. « La vue par exercice arrive » a disparu : elle
  // est arrivée.
  function blocExercices(v) {
    var bloc = coquilleBloc('Par exercice', v.quand, true);
    (v.lignes || []).forEach(function (l) {
      var cliquable = !!(v.surExercice && l.slug);
      var ligne = el(cliquable ? 'button' : 'div', 'bloc-exo');
      if (cliquable) {
        ligne.type = 'button';
        ligne.addEventListener('click', function () { v.surExercice(l.slug); });
      }
      ligne.appendChild(el('span', 'bloc-exo-nom', l.nom));
      ligne.appendChild(el('span', 'bloc-exo-val', l.mesure));
      ligne.appendChild(el('span', 'bloc-exo-jour', jour(l.jour)));
      bloc.appendChild(ligne);
    });
    // 173 — « Tous mes exercices » sous les trois derniers : la même destination que la porte du Profil (qui reste).
    if (v.surTous) {
      var tous = el('button', 'bloc-tous', 'Tous mes exercices \u203a');
      tous.type = 'button';
      tous.addEventListener('click', function () { v.surTous(); });
      bloc.appendChild(tous);
    }
    return bloc;
  }

  // MOTEUR §9.23 (55-1) — LE MOIS ÉCOULÉ, en tête : « Septembre — 22 séances
  // · 33 records · 27 paris tenus sur 30 ». Un compte, sans jugement : rien
  // n'est dit d'un nombre nul, aucune couleur.
  // (`pluriel` est déclarée plus bas, une fois pour le module.)
  function blocMois(v) {
    var bloc = coquilleBloc(v.titre, '', false);
    bloc.classList.add('neuf');
    var bouts = [];
    // 98 (BILANS-V1) — jamais le nombre de séances : le mois dit ses tonnes ; il s'ouvre sur la story du mois.
    // 119 (audit du 16/10/2026, F8) — UN MOIS SANS TONNES N'EST PAS UN MOIS SANS SÉRIE : au poids du corps (tractions,
    // pompes, dips), le mois dit ses séries de travail ; « Pas encore » seulement quand il n'en a aucune (les sorties
    // seules n'en sont pas, comme la story du mois).
    bouts.push(v.kg ? tonnes(v.kg) + ' soulevées'
      : (v.series ? grand(v.series) + ' série' + (v.series > 1 ? 's' : '') + ' de travail' : 'Pas encore de série de travail'));
    if (v.records) bouts.push(pluriel(v.records, 'record'));
    if (v.paris && v.paris.verifies) bouts.push(grand(v.paris.tenus) + ' pari' + (v.paris.tenus > 1 ? 's' : '') +
      ' tenu' + (v.paris.tenus > 1 ? 's' : '') + ' sur ' + grand(v.paris.verifies));
    // 173 (« Vivant ») — le chiffre en héros : « 13 t » (puis « soulevées »), « 14 » (puis « records ») ; le texte, lui, ne change pas.
    var ligneM = el('div', 'bloc-ligne bloc-heros');
    bouts.forEach(function (b, i) {
      // Le « · » reste dans le texte lu (banc, lecteurs) mais ne se dessine pas : l'espace (gap) sépare les blocs, rien ne pend en fin de ligne.
      if (i > 0) { var sepM = el('span', 'bh-sep', ' \u00b7 '); sepM.setAttribute('aria-hidden', 'true'); ligneM.appendChild(sepM); }
      var m = /^(\d[\d,.\u00a0\u202f]*?(?:\u00a0t)?)( .*)$/.exec(b);
      var bout = el('span', 'bh-bout' + (i === 0 ? ' bh-premier' : ''));
      if (m) { bout.appendChild(el('span', 'bh-n', m[1])); bout.appendChild(doc.createTextNode(m[2])); }
      else bout.appendChild(doc.createTextNode(b));
      ligneM.appendChild(bout);
    });
    bloc.appendChild(ligneM);
    bloc.addEventListener('click', v.surChoix);
    return bloc;
  }
  // LES RECORDS : « Le dernier : couché 130 kg × 4, le 22 sept. » Sans
  // record, le bloc le dit et ne s'ouvre pas.
  function blocRecords(v) {
    var bloc = coquilleBloc('Records', '', !v.surChoix);
    bloc.classList.add('neuf');
    var haut = bloc.querySelector('.bloc-quoi');
    if (haut) haut.insertBefore(pastilleMedaille(), haut.firstChild);
    // 173 (« Vivant ») — la charge × reps en gras sur le dernier record (la pastille `--record`, en CSS). Même texte.
    var ligneR = el('div', 'bloc-ligne');
    if (v.dernier) {
      ligneR.classList.add('bloc-dernier');
      // L'étoile et la pastille « RECORD » sont dessinées par CSS (::before) : le texte de la ligne reste celui d'avant.
      ligneR.appendChild(doc.createTextNode('Le dernier : '));
      if (v.dernier.nom && v.dernier.mesure) {
        ligneR.appendChild(doc.createTextNode(v.dernier.nom + ' '));
        ligneR.appendChild(el('b', 'rec-mesure', v.dernier.mesure));
      } else ligneR.appendChild(doc.createTextNode(v.dernier.texte));
      ligneR.appendChild(doc.createTextNode(', le ' + v.dernier.date + (/\.$/.test(v.dernier.date) ? '' : '.')));
    } else ligneR.appendChild(doc.createTextNode('Aucun record pour l\u2019instant.'));
    bloc.appendChild(ligneR);
    if (v.surChoix) bloc.addEventListener('click', v.surChoix);
    return bloc;
  }

  // ── 75 — « TON PARCOURS » (ECRAN-SAISIE §7 bis.14 ter, maquette v3) ─────
  //
  // Le bloc du sommaire : sa phrase en deux lignes, il s'ouvre sur la page. La page, dans l'ordre de M1 : la phrase
  // · les courbes des grands mouvements · par muscle (les six groupes, leurs exercices au toucher) · tes équilibres ·
  // ton levier · ta phase · tous tes exercices (replié). L'écran LIT le parcours (`THParcours`, par `faits.js`) : il
  // ne calcule aucun verdict, aucun rapport. Ambre pour le coach, or pour « ton meilleur », aucun rouge.
  var PHRASE_VIDE = 'Pas encore assez de séances comparables sur douze mois.';
  function blocParcours(v) {
    var bloc = coquilleBloc('Ton parcours', '', false);
    bloc.classList.add('neuf', 'bloc-parcours');
    bloc.appendChild(el('div', 'bloc-ligne', v.phrase || PHRASE_VIDE));
    bloc.addEventListener('click', v.surChoix);
    return bloc;
  }
  // 95 — « Ton année » (BILANS-V1) : il s'ouvre plein écran.
  function blocAnnee(v) {
    var bloc = coquilleBloc('Ton année ' + v.an, '', false);
    bloc.classList.add('neuf', 'bloc-annee');
    bloc.appendChild(el('div', 'bloc-ligne', 'Ton année sous la barre, à faire défiler.'));
    bloc.addEventListener('click', v.surChoix);
    return bloc;
  }
  // 98 — la saison écoulée (« Fall Arc 2026 ») : la saison suivante durant, elle s'ouvre plein écran.
  function blocSaison(v) {
    var bloc = coquilleBloc(v.titre, '', false);
    bloc.classList.add('neuf', 'bloc-saison');
    bloc.appendChild(el('div', 'bloc-ligne', 'Ta saison sous la barre, à faire défiler.'));
    bloc.addEventListener('click', v.surChoix);
    return bloc;
  }
  var MOTS_DU_VERDICT = { '↑': '↑ progresse', '↗': '↗ légèrement', '▬': '▬ stable', '↘': '↘ en léger recul',
                          '↓': '↓ recule', moins: 'moins pratiqué', nouveau: 'nouveau', peu: 'peu de séances',
                          'pas comparable': 'tu as changé de fourchette' };
  function classeDuVerdict(etat) { return etat === '↑' || etat === '↗' ? 'pc-monte' : 'pc-neutre'; }
  function kg(n) { return M().nombreTexte(n) + ' kg'; }
  function majuscule(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }
  var NOMS_DES_GRANDS = { squat_barre: 'Squat', developpe_couche_barre: 'Couché',
                          souleve_de_terre_barre: 'Soulevé de terre', developpe_militaire_barre: 'Militaire' };

  // La courbe d'un grand mouvement : un point par mois (placé à sa date), la ligne dorée du meilleur atteint
  // jusque-là, le dernier mois en blanc.
  function courbeDuParcours(c) {
    var L = 300, H = 90, marge = 8;
    var rang = function (m) { var p = m.split('-'); return Number(p[0]) * 12 + Number(p[1]) - 1; };
    var r0 = rang(c.mois[0][0]), r1 = rang(c.mois[c.mois.length - 1][0]);
    var vals = c.mois.map(function (m) { return m[1]; });
    var bas = Math.min.apply(null, vals), haut = Math.max.apply(null, vals);
    var x = function (m) { return r1 === r0 ? L / 2 : marge + (rang(m) - r0) / (r1 - r0) * (L - 2 * marge); };
    var y = function (v) { return haut === bas ? H / 2 : H - marge - (v - bas) / (haut - bas) * (H - 2 * marge); };
    var dessin = svg('svg', 'pc-courbe', { viewBox: '0 0 ' + L + ' ' + H, preserveAspectRatio: 'none', role: 'img',
      'aria-label': NOMS_DES_GRANDS[c.slug] + ', ' + c.mois.length + ' mois' });
    var meilleur = -Infinity, ligne = [];
    c.mois.forEach(function (m) {
      meilleur = Math.max(meilleur, m[1]);
      ligne.push(x(m[0]).toFixed(1) + ',' + y(meilleur).toFixed(1));
    });
    dessin.appendChild(svg('polyline', 'pc-meilleur', { points: ligne.join(' ') }));
    c.mois.forEach(function (m) { dessin.appendChild(svg('circle', 'pc-point', { cx: x(m[0]).toFixed(1), cy: y(m[1]).toFixed(1), r: 2.4 })); });
    var der = c.mois[c.mois.length - 1];
    dessin.appendChild(svg('circle', 'pc-maintenant', { cx: x(der[0]).toFixed(1), cy: y(der[1]).toFixed(1), r: 4 }));
    return dessin;
  }

  // La ligne d'un exercice dans un groupe : son nom (× 2 pour une barre qui compte double), et ce qu'il dit.
  function ligneDExercice(o, noms) {
    var l = el('div', 'pc-exo');
    var gauche = el('span', 'pc-exo-nom', o.nom + (o.poids > 1 ? ' ×2' : ''));
    var droite;
    if (o.etat === 'moins') {
      var relais = (o.relais || []).map(function (s) { return noms[s] || s; });
      droite = el('span', 'pc-gris', 'moins pratiqué' + (relais.length ? ' → ' + relais.join(', ') : ''));
    } else if (o.methode === 'courbe') {
      droite = el('span', classeDuVerdict(o.etat), 'sur ta courbe ' + o.etat);
    } else if (o.methode === 'reps') {
      droite = el('span', classeDuVerdict(o.etat), MOTS_DU_VERDICT[o.etat]);
    } else {
      droite = el('span', 'pc-gris', MOTS_DU_VERDICT[o.etat] || '');
    }
    var haut = el('div', 'pc-exo-haut');
    haut.appendChild(gauche);
    haut.appendChild(droite);
    l.appendChild(haut);
    if (o.methode === 'reps' && o.detail.length) {
      l.appendChild(el('div', 'pc-exo-detail', o.detail.map(function (d) {
        return M().nombreTexte(d[1]) + ' → ' + M().nombreTexte(d[2]) + ' à ' + M().repsTexte(d[0]);
      }).join(' · ')));
    }
    return l;
  }

  // ══ 188-1 — « TA SEMAINE ET TES ÉQUILIBRES » (MOTEUR §9.27, maquette-semaine-equilibres-v6) ═══════════════════════════
  //
  // ⚠️ LE RENDU NE DÉCIDE RIEN. `vue.analyse` est la sortie de `THEquilibres.analyser` : les cartes qui parlent, les
  // constats, les mesures calmes. Il dessine, il ne compte pas. Les gestes (une proposition, « Pas maintenant »,
  // « Annuler ») sont des rappels : rien ne s'écrit ici. `vue.fait` : `{ texte, surAnnuler }`, ce que la dernière
  // proposition acceptée vient de faire — elle se voit et s'annule.
  function carteDEquilibre(c, vue, parle) {
    var carte = el('div', 'carte-mois eq-carte' + (parle ? '' : ' eq-constat'));
    carte.setAttribute('data-equilibre', c.cle);
    carte.appendChild(el('div', 'eq-titre', c.titre));
    if (c.kind === 'priorites' || c.kind === 'frequence') {
      if (c.fait) { /* le fait vient après le tableau */ }
      var tab = el('div', 'eq-tab');
      (c.lignes || []).forEach(function (l) {
        var r = el('div', 'eq-ligne-tab' + (l.gris ? ' gris' : ''));
        r.appendChild(el('span', null, l.libelle));
        r.appendChild(el('span', 'eq-val', l.texte));
        tab.appendChild(r);
      });
      carte.appendChild(tab);
      if (c.fait) carte.appendChild(el('p', 'pc-note', c.fait));
      // 188-2 : le repère de la fréquence vient sous le tableau.
      if (c.kind === 'frequence' && c.repere) carte.appendChild(el('p', 'pc-note', c.repere));
    } else {
      carte.appendChild(el('div', 'eq-fait', c.fait));
      if (c.kind === 'rapport' && c.barre) {
        var barre = el('div', 'eq-barre');
        var a = el('i', 'eq-a'); a.style.width = c.barre.a + '%';
        var b = el('i', 'eq-b'); b.style.width = c.barre.b + '%';
        barre.appendChild(a); barre.appendChild(b);
        carte.appendChild(barre);
        var et = el('div', 'eq-etiq');
        et.appendChild(el('span', null, c.etiquettes.a));
        et.appendChild(el('span', null, c.etiquettes.b));
        carte.appendChild(et);
      }
      // 188-2 : un repère ou plusieurs (la carte du temps en a deux : la durée et la règle).
      if (c.reperes && c.reperes.length && parle) c.reperes.forEach(function (t) { carte.appendChild(el('p', 'pc-note', t)); });
      else if (c.repere) carte.appendChild(el('p', 'pc-note', c.repere + (c.tendance ? ' ' + c.tendance : '')));
    }
    if (parle) {
      if ((c.causes || []).length) {
        carte.appendChild(el('div', 'eq-sous', 'D’où ça vient'));
        var ul = el('ul', 'eq-causes');
        c.causes.forEach(function (x) { ul.appendChild(el('li', null, x.texte)); });
        carte.appendChild(ul);
      }
      var actions = el('div', 'eq-actions');
      (c.propositions || []).forEach(function (p, i) {
        var bt = el('button', i === 0 ? 'principal' : 'discret', p.libelle);
        bt.type = 'button';
        bt.setAttribute('data-proposition', p.type);
        bt.addEventListener('click', function () { vue.surProposition(c, p); });
        actions.appendChild(bt);
      });
      // 188-2 : « Garder 6 jours », « Garder 90 min » — la même réponse que « Pas maintenant », dite avec les mots de la carte.
      var pm = el('button', 'discret', c.libelleRefus || 'Pas maintenant');
      pm.type = 'button';
      pm.setAttribute('data-pas-maintenant', c.cle);
      pm.addEventListener('click', function () { vue.surPlusTard(c); });
      actions.appendChild(pm);
      carte.appendChild(actions);
    }
    return carte;
  }

  function rendreEquilibres(parent, vue) {
    var a = vue && vue.analyse;
    if (!a || a.etat === 'peu') return;
    parent.appendChild(el('div', 'section-t', 'Ta semaine et tes équilibres'));
    var section = el('div', 'eq-section');
    section.setAttribute('data-equilibres', a.etat);
    if (a.quand) section.appendChild(el('div', 'eq-quand', a.quand));
    if (vue.fait) {
      var f = el('div', 'eq-fait-pose');
      f.appendChild(el('span', null, vue.fait.texte));
      // 188-2 : une suite proposée, jamais faite d'office (« Refaire mon programme pour 70 min »).
      if (vue.fait.suite) {
        var su = el('button', 'principal', vue.fait.suite.libelle);
        su.type = 'button';
        su.setAttribute('data-suite-equilibre', '1');
        su.addEventListener('click', function () { vue.fait.suite.surClic(); });
        f.appendChild(su);
      }
      var an = el('button', 'discret', 'Annuler');
      an.type = 'button';
      an.setAttribute('data-annuler-equilibre', '1');
      an.addEventListener('click', function () { vue.fait.surAnnuler(); });
      f.appendChild(an);
      section.appendChild(f);
    }
    var parlent = {};
    (a.cartes || []).forEach(function (c) { parlent[c.cle] = true; section.appendChild(carteDEquilibre(c, vue, true)); });
    (a.constats || []).forEach(function (c) { if (!parlent[c.cle]) section.appendChild(carteDEquilibre(c, vue, false)); });
    (a.calmes || []).forEach(function (c) {
      var k = el('div', 'carte-mois eq-carte eq-calme');
      k.setAttribute('data-equilibre', c.cle);
      k.appendChild(el('div', 'eq-titre', c.titre));
      k.appendChild(el('div', 'eq-calme-texte', c.texte));
      section.appendChild(k);
    });
    parent.appendChild(section);
  }

  // 197 (MOTEUR §9.36) — « Ta semaine » en Forme et santé. Les textes viennent de l'app (qui lit `faits.semaineDeForme`) ; ici on dessine.
  function rendreSemaineForme(parent, vue) {
    if (!vue) return;
    var k = el('div', 'carte-mois eq-carte forme-semaine');
    k.setAttribute('data-forme-semaine', '1');
    k.appendChild(el('div', 'eq-titre', 'Ta semaine'));
    [vue.renforcement, vue.cardio].forEach(function (x) {
      var l = el('div', 'forme-ligne');
      l.appendChild(el('span', 'forme-libelle', x.libelle));
      l.appendChild(el('span', 'forme-texte', x.texte));
      k.appendChild(l);
    });
    k.appendChild(el('div', 'eq-calme-texte', vue.cardio.reste));
    if (vue.cardio.intense) k.appendChild(el('div', 'eq-calme-texte', vue.cardio.intense));
    var d = el('details', 'forme-pourquoi');
    d.appendChild(el('summary', null, 'Pourquoi ces chiffres ?'));
    d.appendChild(el('p', null, vue.pourquoi));
    d.appendChild(el('p', null, vue.douleur));
    k.appendChild(d);
    var m = el('button', 'discret', 'Masquer cette carte');
    m.type = 'button';
    m.setAttribute('data-masquer-forme', '1');
    m.addEventListener('click', function () { vue.surMasquer(); });
    k.appendChild(m);
    parent.appendChild(k);
  }

  // La ligne de l'écran Séances, sous la barre de la semaine : UNE seule, quand une carte d'équilibre parle.
  function rendreLigneEquilibre(cible, vue) {
    if (!cible) return cible;
    vider(cible);
    if (!vue || !vue.texte) { cible.hidden = true; return cible; }
    cible.hidden = false;
    var l = el('div', 'eq-ligne');
    l.appendChild(el('span', 'eq-ligne-texte', vue.texte));
    var b = el('button', 'discret', 'Voir mes équilibres');
    b.type = 'button';
    b.addEventListener('click', function () { vue.surOuvrir(); });
    l.appendChild(b);
    cible.appendChild(l);
    return cible;
  }

  function rendreParcours(cible, vue) {
    if (!cible) return;
    vider(cible);
    var p = vue.parcours;
    var noms = {};
    p.exercices.forEach(function (o) { noms[o.slug] = o.nom; });
    cible.appendChild(el('h2', 'titre-vue', 'Ton parcours'));

    // La phrase.
    cible.appendChild(el('div', 'pc-phrase', p.phrase || PHRASE_VIDE));

    // 188-1 — « Ta semaine et tes équilibres » : en tête, au-dessus de « Tes équilibres » (les barres sur douze mois).
    rendreSemaineForme(cible, vue.forme);
    rendreEquilibres(cible, vue.equilibres);
    // 189 — « Juste un carnet » : le constat de la baisse, une carte sans proposition (aucune section de plus).
    if (vue.fatigue) {
      var kf = el('div', 'carte-mois eq-carte eq-fatigue');
      kf.setAttribute('data-fatigue', '1');
      kf.appendChild(el('div', 'eq-titre', vue.fatigue.titre));
      kf.appendChild(el('div', 'eq-fait', vue.fatigue.texte));
      cible.appendChild(kf);
    }

    // Les courbes des grands mouvements.
    if (p.courbes.length) {
      cible.appendChild(el('div', 'section-t', 'Tes grands mouvements'));
      p.courbes.forEach(function (c) {
        var carte = el('div', 'carte-mois pc-lift');
        var tete = el('div', 'pc-lift-tete');
        tete.appendChild(el('span', 'pc-lift-nom', NOMS_DES_GRANDS[c.slug]));
        if (c.etat) tete.appendChild(el('span', classeDuVerdict(c.etat), MOTS_DU_VERDICT[c.etat] || ''));
        carte.appendChild(tete);
        carte.appendChild(courbeDuParcours(c));
        var pied = el('div', 'pc-lift-pied');
        pied.appendChild(el('span', null, 'au début ' + kg(c.debut)));
        pied.appendChild(el('span', 'pc-or', 'ton meilleur ' + kg(c.meilleur) + ' × 5+'));
        pied.appendChild(el('span', null, 'en ce moment ' + kg(c.maintenant)));
        carte.appendChild(pied);
        cible.appendChild(carte);
      });
      cible.appendChild(el('p', 'pc-note', 'Ligne dorée : ton meilleur, à 5 reps ou plus. Points : ton meilleur de chaque mois.'));
    }

    // Par muscle.
    cible.appendChild(el('div', 'section-t', 'Par muscle · 6 derniers mois'));
    cible.appendChild(el('p', 'pc-note', 'Chaque exercice comparé à lui-même, au même nombre de reps. Touche un groupe pour le détail.'));
    var avec = p.zones.filter(function (z) { return z.verdict; }).length;
    p.zones.forEach(function (z) {
      var groupe = el('details', 'pc-groupe');
      groupe.setAttribute('data-zone', z.zone);
      var resume = el('summary', null);
      resume.appendChild(el('span', null, z.libelle));
      if (z.verdict) {
        var lent = p.levier === z.zone && avec > 1;
        resume.appendChild(el('span', classeDuVerdict(z.verdict),
          lent ? z.verdict + ' le plus lent' : MOTS_DU_VERDICT[z.verdict]));
      } else {
        resume.appendChild(el('span', 'pc-gris', z.raison));
      }
      groupe.appendChild(resume);
      var corps = el('div', 'pc-groupe-corps');
      var siens = p.exercices.filter(function (o) { return o.zone === z.zone && o.etat !== 'peu'; });
      siens.forEach(function (o) { corps.appendChild(ligneDExercice(o, noms)); });
      if (!siens.length) corps.appendChild(el('div', 'pc-gris', 'Aucun exercice suivi en charge sur douze mois.'));
      groupe.appendChild(corps);
      cible.appendChild(groupe);
    });

    // Tes équilibres.
    if (p.rapports.length) {
      cible.appendChild(el('div', 'section-t', 'Tes équilibres'));
      cible.appendChild(el('p', 'pc-note', 'Tes vraies barres, au même nombre de reps, sur douze mois.'));
      p.rapports.forEach(function (r) {
        var carte = el('div', 'carte-mois pc-rapport');
        carte.appendChild(ligneMois(majuscule(vue.nomsCourts[r.num]) + ' / ' + vue.nomsCourts[r.den],
          el('span', r.lecture === 'en dessous' ? 'pc-neutre' : 'pc-gris', r.affiche)));
        if (r.repere !== null) {
          // 179 (D1) — un fait : le rapport et le repère de pratiquants, sans « pour t’y aligner » (descriptif, jamais prescriptif).
          var t = 'Ton ' + vue.nomsCourts[r.num] + ' vaut ' + r.affiche + ' × ton ' + vue.nomsCourts[r.den] +
            ' ; repère de pratiquants ' + M().nombreFixe(r.repere, 2) + '.';
          carte.appendChild(el('p', 'pc-note', t));
        }
        cible.appendChild(carte);
      });
      var pourquoi = el('details', 'pc-pourquoi');
      pourquoi.appendChild(el('summary', null, 'Pourquoi possible'));
      pourquoi.appendChild(el('p', 'pc-note', 'La morphologie, un mouvement travaillé plus tôt et plus souvent, tes priorités ' +
        'passées. Ce sont des repères de pratiquants, pas de compétiteurs. Ce n’est pas une alerte.'));
      cible.appendChild(pourquoi);
    }

    // Ton levier.
    cible.appendChild(el('div', 'section-t', 'Ton levier'));
    var lev = el('div', 'pc-levier');
    var zLevier = p.zones.filter(function (z) { return z.zone === p.levier; })[0];
    if (zLevier) {
      lev.appendChild(el('b', null, zLevier.libelle + '.'));
      lev.appendChild(doc.createTextNode(' ' + (vue.priorites.length
        ? 'De tes priorités (' + vue.priorites.join(', ') + '), c’est celle qui avance le plus lentement.'
        : 'De tes groupes, c’est celui qui avance le plus lentement.')));
    } else {
      lev.appendChild(doc.createTextNode('Pas encore de groupe à comparer.'));
    }
    cible.appendChild(lev);

    // Ta phase.
    cible.appendChild(el('div', 'section-t', 'Ta phase'));
    var phase = el('div', 'carte-mois pc-phase');
    phase.appendChild(el('div', null, vue.phase));
    if (vue.noteDePhase) phase.appendChild(el('p', 'pc-note', vue.noteDePhase));   // 189 : « Tes séries reviennent à ta routine. »
    phase.appendChild(el('p', 'pc-note', vue.pesees.assez
      ? vue.pesees.nombre + ' pesées en huit semaines.'
      : 'Pas assez de pesées : ' + vue.pesees.nombre + ' en huit semaines. Une par semaine suffit.'));
    cible.appendChild(phase);

    // Tous tes exercices.
    cible.appendChild(el('div', 'section-t', 'Tous tes exercices'));
    var tous = el('details', 'pc-tous');
    tous.appendChild(el('summary', null, pluriel(p.exercices.length, 'exercice') + ' · ouvrir'));
    p.exercices.forEach(function (o) {
      var b = el('button', 'pc-tous-ligne');
      b.type = 'button';
      b.setAttribute('data-slug', o.slug);
      b.appendChild(el('span', null, o.nom));
      b.appendChild(el('span', o.methode ? classeDuVerdict(o.etat) : 'pc-gris',
        (o.methode === 'courbe' ? 'sur ta courbe ' + o.etat : MOTS_DU_VERDICT[o.etat]) || ''));
      b.addEventListener('click', function () { vue.surExercice(o.slug); });
      tous.appendChild(b);
    });
    cible.appendChild(tous);
  }

  function rendreSommaire(cible, vue) {
    if (!cible) return;
    vider(cible);
    if (vue.mois) cible.appendChild(blocMois(vue.mois));
    if (vue.parcours) cible.appendChild(blocParcours(vue.parcours));
    if (vue.annee) cible.appendChild(blocAnnee(vue.annee));
    if (vue.saison) cible.appendChild(blocSaison(vue.saison));
    if (vue.records) cible.appendChild(blocRecords(vue.records));
    cible.appendChild(blocVolume(vue.volume));
    cible.appendChild(blocPoids(vue.poids));
    cible.appendChild(blocExercices(vue.exercices));
  }

  // ── MOTEUR §9.23 (55-1) — LES RECORDS D'UN MOIS, et leur navigation ─────
  function navMois(vue, titre) {
    var nav = el('div', 'mois-nav');
    var av = el('button', 'discret mois-precedent', '\u2039');
    av.type = 'button';
    av.setAttribute('aria-label', 'Mois précédent');
    av.addEventListener('click', vue.surPrecedent);
    nav.appendChild(av);
    nav.appendChild(el('h2', 'titre-vue', titre));
    var ap = el('button', 'discret mois-suivant', '\u203a');
    ap.type = 'button';
    ap.setAttribute('aria-label', 'Mois suivant');
    if (vue.surSuivant) ap.addEventListener('click', vue.surSuivant);
    else ap.disabled = true;
    nav.appendChild(ap);
    return nav;
  }
  function carteMois(titre) {
    var c = el('div', 'carte-mois');
    if (titre) c.appendChild(el('h3', null, titre));
    return c;
  }
  function ligneMois(gauche, droite, classe) {
    var l = el('div', 'ligne-mois' + (classe ? ' ' + classe : ''));
    l.appendChild(typeof gauche === 'string' ? el('span', null, gauche) : gauche);
    l.appendChild(typeof droite === 'string' ? el('span', null, droite) : droite);
    return l;
  }
  function tonnes(kg) {
    var t = (Number(kg) || 0) / 1000;
    return grand(Math.round(t * (t < 10 ? 10 : 1)) / (t < 10 ? 10 : 1)) + '\u00a0t';
  }
  // 98 (BILANS-V1) — l'ancien bilan du mois (`rendreBilanMois`) n'existe plus : la story du mois le remplace
  // (`annee.js`), et en reprend les records et les paris.

  // LES RECORDS D'UN MOIS : une ligne par série médaillée, qui mène à sa
  // séance.
  function rendreRecordsDuMois(cible, vue) {
    if (!cible) return;
    vider(cible);
    cible.appendChild(navMois(vue, 'Records \u2014 ' + vue.titre));
    if (!vue.records.length) {
      cible.appendChild(el('p', 'vide', 'Aucun record ce mois-ci.'));
      return;
    }
    var c = carteMois(null);
    vue.records.forEach(function (x) {
      var droite = el('span', 'gris', x.date);
      var l = ligneMois(x.texte, droite, 'lien');
      l.addEventListener('click', function () { vue.surSeance(x.seanceId); });
      c.appendChild(l);
    });
    cible.appendChild(c);
  }

  // ── Sélecteur de période, en pastilles ──────────────────────────────────
  function rendrePeriodes(cible, periodes, choisie, surChoix) {
    if (!cible) return;
    vider(cible);
    var barre = el('div', 'periodes');
    periodes.forEach(function (p) {
      var b = el('button', 'periode' + (p.cle === choisie ? ' actif' : ''), p.libelle);
      b.type = 'button';
      b.setAttribute('aria-pressed', p.cle === choisie ? 'true' : 'false');
      b.addEventListener('click', function () { surChoix(p.cle); });
      barre.appendChild(b);
    });
    cible.appendChild(barre);
  }

  // ── Le radar de répartition (ECRAN-SAISIE §7 bis.17) ────────────────────
  //
  // Six zones sur un hexagone, période courante contre période précédente.
  // AUCUNE FLÈCHE VERTE OU ROUGE, aucun pourcentage de variation coloré : deux
  // périodes se comparent, elles ne se jugent pas (CADRAGE-V2 §3.1 bis) — un
  // mois plus court n'est pas un échec, et l'app ne connaît pas la raison.
  // La période précédente est en gris neutre, la courante en accent.
  var RAYON = 92;
  var CENTRE = { x: 150, y: 112 };
  var CADRE = { largeur: 300, hauteur: 240 };
  // Les étiquettes, dans l'ordre géométrique de THPeriode.ORDRE.
  var ANCRES = [
    { x: 0, y: -100, ancre: 'middle' },      // haut
    { x: 88, y: -48, ancre: 'start' },       // haut-droite
    { x: 88, y: 52, ancre: 'start' },        // bas-droite
    { x: 0, y: 108, ancre: 'middle' },       // bas
    { x: -88, y: 52, ancre: 'end' },         // bas-gauche
    { x: -88, y: -48, ancre: 'end' }         // haut-gauche
  ];

  function rendreRadar(cible, comparaison, periode, geometrie) {
    if (!cible) return;
    vider(cible);
    if (!comparaison || comparaison.vide) {
      cible.appendChild(el('p', 'semaine-vide', 'Aucune série de travail sur ces deux périodes.'));
      return;
    }

    var cadre = el('div', 'radar');
    var dessin = svg('svg', null, {
      viewBox: '0 0 ' + CADRE.largeur + ' ' + CADRE.hauteur,
      role: 'img',
      'aria-label': 'Répartition du volume par zone, ' + periode.courante + ' contre ' + periode.precedente
    });
    var g = svg('g', null, { transform: 'translate(' + CENTRE.x + ',' + CENTRE.y + ')' });

    // Grille : quatre anneaux, sans graduation chiffrée. Le radar donne une
    // FORME, pas des valeurs — les valeurs sont dans le relevé au-dessus et
    // dans les cartes en dessous.
    [1, 0.75, 0.5, 0.25].forEach(function (f) {
      g.appendChild(svg('polygon', 'radar-grille', { points: listePoints(geometrie.hexagone(RAYON * f)) }));
    });
    geometrie.hexagone(RAYON).forEach(function (p) {
      g.appendChild(svg('line', 'radar-axe', { x1: 0, y1: 0, x2: p.x, y2: p.y }));
    });

    var valeursP = comparaison.zones.map(function (z) { return z.precedente; });
    var valeursC = comparaison.zones.map(function (z) { return z.courante; });
    // La PRÉCÉDENTE d'abord : dessinée dessous, elle ne masque pas la courante.
    g.appendChild(svg('polygon', 'radar-prec',
      { points: listePoints(geometrie.polygone(valeursP, comparaison.max, RAYON)) }));
    g.appendChild(svg('polygon', 'radar-cour',
      { points: listePoints(geometrie.polygone(valeursC, comparaison.max, RAYON)) }));

    comparaison.zones.forEach(function (z, i) {
      var a = ANCRES[i] || ANCRES[0];
      var t = svg('text', 'radar-et', { x: a.x, y: a.y, 'text-anchor': a.ancre });
      t.textContent = z.libelle;
      g.appendChild(t);
    });

    dessin.appendChild(g);
    cadre.appendChild(dessin);

    var legende = el('div', 'radar-lg');
    [['cour', periode.courante], ['prec', periode.precedente]].forEach(function (paire) {
      var item = el('span', 'radar-lg-item');
      item.appendChild(el('i', 'puce-' + paire[0], ''));
      item.appendChild(doc.createTextNode(paire[1]));
      legende.appendChild(item);
    });
    cadre.appendChild(legende);
    cible.appendChild(cadre);
  }

  // Quatre cartes de contexte. La valeur précédente est écrite EN TOUTES
  // LETTRES sous la courante — « 19 sur la période précédente » — plutôt qu'en
  // écart : un écart demande un signe, un signe appelle une couleur, et une
  // couleur est un verdict.
  function rendreCartesPeriode(cible, cartes, periode) {
    if (!cible) return;
    vider(cible);
    if (!cartes || !cartes.length) return;
    var grille = el('div', 'cartes-per');
    cartes.forEach(function (c) {
      var carte = el('div', 'carte-per');
      carte.appendChild(el('div', 'carte-k', c.libelle));
      carte.appendChild(el('div', 'carte-v', nombreFr(c.courante)));
      carte.appendChild(el('div', 'carte-d', nombreFr(c.precedente) + ' ' + periode.avant));
      grille.appendChild(carte);
    });
    cible.appendChild(grille);
  }

  // ── Le poids de corps ───────────────────────────────────────────────────
  //
  // Une courbe descriptive : pas de ligne d'objectif, pas de zone colorée
  // « bien / insuffisant », pas de projection. Elle décrit, elle ne juge pas.
  function rendreCourbePoids(cible, courbe) {
    if (!cible) return;
    vider(cible);
    if (!courbe || courbe.points.length < 2) {
      cible.appendChild(el('p', 'semaine-vide', courbe && courbe.points.length === 1
        ? 'Une seule pesée sur cette période.'
        : 'Aucune pesée sur cette période.'));
      return;
    }

    var cadre = el('div', 'graphe');
    var tete = el('div', 'graphe-tete');
    tete.appendChild(el('span', 'graphe-q', 'Poids de corps'));
    var v = el('span', 'graphe-v', nombreFr(Math.round(courbe.points[courbe.points.length - 1].poids * 10) / 10));
    v.appendChild(el('small', null, 'kg'));
    tete.appendChild(v);
    cadre.appendChild(tete);

    // `preserveAspectRatio="none"` : l'étirement horizontal est voulu, c'est
    // lui qui donne toute la largeur au temps. Les points, eux, sont déjà
    // placés à la date (THPoids.courbe) — l'étirement ne change pas leur ordre
    // ni leurs écarts relatifs.
    var dessin = svg('svg', null, {
      viewBox: '0 0 ' + courbe.largeur + ' ' + courbe.hauteur,
      preserveAspectRatio: 'none', role: 'img',
      'aria-label': courbe.points.length + ' pesées, de ' + nombreFr(courbe.min) +
        ' à ' + nombreFr(courbe.max) + ' kg'
    });
    dessin.appendChild(svg('polyline', 'courbe-trait', { points: listePoints(courbe.points) }));
    var dernier = courbe.points[courbe.points.length - 1];
    dessin.appendChild(svg('circle', 'courbe-pt', { cx: dernier.x, cy: dernier.y, r: 3.5 }));
    cadre.appendChild(dessin);

    var axe = el('div', 'graphe-axe');
    axe.appendChild(el('span', null, jour(courbe.debut, -1)));
    axe.appendChild(el('span', 'graphe-ampl',
      nombreFr(courbe.min) + ' \u2013 ' + nombreFr(courbe.max) + ' kg'));
    axe.appendChild(el('span', null, jour(courbe.fin, -1)));
    cadre.appendChild(axe);
    cible.appendChild(cadre);
  }

  function rendreListePesees(cible, pesees, total) {
    if (!cible) return;
    vider(cible);
    if (!pesees || !pesees.length) return;
    cible.appendChild(el('div', 'section-t', 'Dernières pesées'));
    var liste = el('div', 'pesees');
    pesees.forEach(function (p) {
      var ligne = el('div', 'pesee-l');
      ligne.appendChild(el('span', 'pesee-d', jour(p.date, -1)));
      ligne.appendChild(el('span', 'pesee-p', nombreFr(p.poids) + ' kg'));
      ligne.appendChild(el('span', 'pesee-e', p.ecart === null ? '' : signe(p.ecart)));
      liste.appendChild(ligne);
    });
    cible.appendChild(liste);
    if (total > pesees.length) {
      cible.appendChild(el('p', 'pesees-total', total + ' pesées en tout.'));
    }
  }

  // ══ LA SÉANCE EN COURS (chantier 22) ═════════════════════════════════════

  function S() { return racine.THSeance; }

  // « 47 min » sous une heure, « 1 h 12 » au-delà (« 1 h 00 » à l'heure pile).
  // C'est le format du bilan du mois (`Bilan.texteTemps`), pas un second : « 72 min »
  // ne se lit pas d'un coup d'œil entre deux séries.
  function libelleDuree(minutes) { return racine.THBilan.texteTemps(minutes); }

  // La durée de la barre, réécrite SUR PLACE : le texte du nœud, rien d'autre. On
  // ne touche au DOM que si la valeur change (un nœud réécrit pour rien fait
  // clignoter un lecteur d'écran). Renvoie vrai si la barre portait une durée.
  function majDureeBandeau(cible, debut, maintenant) {
    var ch = cible && cible.querySelector ? cible.querySelector('.bandeau-ch[data-suite]') : null;
    if (!ch) return false;
    var texte = libelleDuree(S().minutesEcoulees(debut, maintenant)) + ch.getAttribute('data-suite');
    if (ch.textContent !== texte) ch.textContent = texte;
    return true;
  }

  function rendreBandeauSeance(cible, vue) {
    vider(cible);

    // ⚠️ LE MODE SÉLECTION PREND LE BANDEAU (§5.7). Pendant qu'on choisit avec
    // qui grouper, l'écran ne sert qu'à ça : la consigne remplace le titre, et
    // « Annuler » est la seule autre sortie. Laisser « Terminer » sous la main
    // à ce moment-là, c'est proposer de finir sa séance par erreur.
    if (vue.selection !== null && vue.selection !== undefined) {
      var c = el('div', 'bandeau-t');
      c.appendChild(el('div', 'bandeau-nom', 'Grouper avec…'));
      c.appendChild(el('div', 'bandeau-ch', 'Touche le bloc à joindre'));
      cible.appendChild(c);
      var an = el('button', 'discret', 'Annuler');
      an.type = 'button';
      an.addEventListener('click', vue.surAnnulerSelection);
      cible.appendChild(an);
      return;
    }

    var t = el('div', 'bandeau-t');
    t.appendChild(el('div', 'bandeau-nom', vue.titre));
    // ⚠️ ECRAN-SAISIE §7 octies bis (62) — LA DURÉE AVANCE SEULE, SANS REDESSINER.
    // Le texte reste UN SEUL nœud (« 12 min · 3 séries de travail », comme avant la
    // barre : le relevé du texte visible n'y voit rien changer) ; `data-suite` garde
    // la fin de la phrase, et `majDureeBandeau` réécrit le seul début, à la minute,
    // sans rappeler le rendu de la séance — qui reconstruirait les blocs et ferait
    // perdre le focus d'un champ en cours de saisie.
    //
    // §7 octies.2 — en modification, le temps écoulé n'a plus de sens : la
    // séance date d'avant-hier, et « 3 240 min » ne dirait rien à personne. Pas de
    // `data-suite` : rien à rafraîchir.
    // ⚠️ `travail`, PAS `validees` (chantier 39, C1). Le même mot portait trois
    // comptes sur cinq écrans : 4 chauffes + 2 séries de travail s'affichaient
    // « 6 » ici et sur l'écran de fin, « 2 » sur la carte et la barre. Les
    // chauffes ne sont pas des séries de travail — et `Seance.compter().travail`
    // existe depuis le chantier 22 sans que personne le lise.
    var nT = vue.compte.travail;
    var suite = nT + ' série' + (nT > 1 ? 's' : '') + ' de travail';
    var ch = el('div', 'bandeau-ch num');
    if (vue.edition) {
      ch.textContent = 'Modification \u00b7 ' + suite;
    } else {
      ch.setAttribute('data-suite', ' \u00b7 ' + suite);
      ch.textContent = libelleDuree(S().minutesEcoulees(vue.debut, Date.now())) + ' \u00b7 ' + suite;
    }
    t.appendChild(ch);
    cible.appendChild(t);

    // §5.3 — Modifier replie la séance sur une ligne par bloc. Il ne remplace
    // pas les menus (§5 bis) : il sert au réordonnancement multiple et à la vue
    // d'ensemble qui manque pendant qu'on s'entraîne.
    var m = el('button', 'discret bandeau-modifier' + (vue.modifier ? ' sel' : ''),
      vue.modifier ? 'Terminé' : 'Modifier');
    m.type = 'button';
    m.setAttribute('aria-pressed', vue.modifier ? 'true' : 'false');
    m.addEventListener('click', vue.surModifier);
    cible.appendChild(m);

    var b = el('button', 'discret bandeau-fin', vue.edition ? 'Enregistrer' : 'Terminer');
    b.type = 'button';
    b.addEventListener('click', vue.surTerminer);
    cible.appendChild(b);
  }

  // Le numéro porte le TYPE de la série (§3 bis.1) : les quatre valeurs de
  // `sets.type_serie` sont couvertes sans un champ de plus. Le compte de travail
  // n'avance que sur les séries de travail — une chauffe ne prend pas un numéro.
  // ⚠️ §7 undecies.1 — LA CHAUFFE SE LIT EN UNE DEMI-SECONDE. Même forme carrée
  // que les séries de travail, distinguée par la TEINTE : la colonne garde son
  // rythme, ce qui compte sur une colonne qu'on parcourt verticalement. Dans un
  // superset le badge porte la LETTRE de son exercice (voir `etiquetteDeSerie`) ;
  // hors superset, un `W` — il n'y a pas de lettre à porter.
  var ETIQUETTE_TYPE = {
    echauffement: { texte: 'W', classe: 'c' },
    degressive: { texte: 'D', classe: 'd' },
    echec: { texte: '✕', classe: 'x' },
    // 185 (v2_116) — « Non, ne compte pas » : gardée au journal, hors du calcul.
    hors_calcul: { texte: '–', classe: 'h' }
  };
  // Le type qui s'AFFICHE : une série hors calcul garde son type en base (travail), mais se montre à part.
  function typeAffiche(s) { return s && s.horsCalcul ? 'hors_calcul' : (s && s.type_serie); }

  function etiquetteSerie(type, nTravail) {
    var e = ETIQUETTE_TYPE[type];
    return e || { texte: String(nTravail), classe: '' };
  }

  // Un champ de saisie numérique. Il MUTE l'état sans redessiner : re-rendre à
  // chaque frappe arracherait le focus et le clavier d'Android avec lui.
  // La valeur fantôme s'affiche en gris quand rien n'est saisi — on valide sans
  // rien taper quand c'est juste (§3 bis.3).
  // ⚠️ LE PAVÉ DE CHRONOMÉTRAGE (§3 ter.2 bis).
  //
  // Les chiffres entrent par la DROITE et poussent les autres vers la gauche.
  // Le champ n'accepte donc RIEN d'autre qu'un chiffre et l'effacement : tout
  // le reste — collage, sélection, point, virgule — est refusé à la source, par
  // `beforeinput`. C'est ce qui rend l'état sûr : la valeur affichée est
  // toujours exactement `formatChrono(dureeDeChiffres(tampon))`.
  //
  // Le tampon vit sur le nœud (`dataset.chiffres`) et NON dans l'état de la
  // séance : il ne sert qu'à la frappe en cours, et il se recompose depuis la
  // valeur au rendu suivant. Le détail qui l'impose est dans `modele.js` —
  // « 6350 » et « 10350 » valent la même durée mais ne se poursuivent pas
  // pareil au chiffre suivant.
  // ⚠️ `options.max` ET `options.libelle` SONT FACULTATIFS. Sans eux, le pavé
  // est exactement celui du chantier 25 — c'est ce qui permet à l'éditeur de
  // routine de l'appeler au lieu d'en écrire un second (§7 quaterdecies.2).
  function champChrono(classe, secondes, fantomeVal, surSaisie, options) {
    var o = options || {};
    var vide = secondes === null || secondes === undefined;
    var enveloppe = el('div', classe + ' chrono' + (vide && fantomeVal !== null &&
      fantomeVal !== undefined ? ' fantome' : ''));
    var input = doc.createElement('input');
    input.type = 'text';
    // `numeric` et non `decimal` : il n'y a ni virgule ni point à taper ici, et
    // un clavier qui les propose invite à une saisie que le champ refusera.
    input.inputMode = 'numeric';
    input.setAttribute('aria-label', o.libelle || 'Durée, en heures, minutes et secondes');
    input.dataset.chiffres = M().chiffresDeDuree(vide ? null : secondes);
    input.value = vide ? '' : M().formatChrono(secondes);
    if (vide && fantomeVal !== null && fantomeVal !== undefined) {
      input.placeholder = M().formatChrono(fantomeVal);
    }

    function rendre() {
      var v = M().dureeDeChiffres(input.dataset.chiffres);
      input.value = v === null ? '' : M().formatChrono(v);
      surSaisie(v);
    }

    input.addEventListener('beforeinput', function (e) {
      // Tout passe par ici, et rien ne passe autrement : `preventDefault` est
      // inconditionnel. Un `inputType` inconnu (collage, dictée, correction
      // automatique) ne fait donc rien plutôt que d'écrire n'importe quoi.
      e.preventDefault();
      // ⚠️ UNE SÉLECTION VEUT DIRE « REMPLACE ÇA ».
      //
      // Le pavé n'a pas de curseur : les chiffres entrent toujours par la
      // droite. Ignorer la sélection donnait donc une valeur silencieusement
      // fausse — tout sélectionner puis taper `9` AJOUTAIT le 9 à la durée
      // existante au lieu de la remplacer. Le pavé n'ayant pas de notion de
      // sélection partielle, toute sélection vaut « on recommence ».
      var selection = input.selectionStart !== input.selectionEnd;
      if (e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward' ||
          e.inputType === 'deleteWordBackward' || e.inputType === 'deleteByCut') {
        var apresEffacement = selection ? '' : M().retirerChiffreDuree(input.dataset.chiffres);
        // Effacer un champ DÉJÀ vide ne change rien : le dire quand même
        // coûterait une écriture disque et un envoi réseau par appui.
        if (apresEffacement === input.dataset.chiffres) return;
        input.dataset.chiffres = apresEffacement;
        return rendre();
      }
      // ⚠️ `insertText` ET RIEN D'AUTRE — surtout pas `insertCompositionText`.
      //
      // Un clavier qui compose (Samsung, dictée, suggestion au glissé) livre la
      // composition ENTIÈRE à chaque événement, pas le caractère ajouté : taper
      // `5` puis `0` émet « 5 » puis « 50 », et poser les deux reviendrait à
      // saisir « 5 5 0 ». Pire, `preventDefault()` ne retient pas une
      // composition. Reproduit en navigateur réel à la revue de ce chantier.
      //
      // On ne traite donc que la frappe franche. Sur un clavier qui compose,
      // rien n'entre — ce qui est sûr — et l'écouteur `input` ci-dessous remet
      // l'affichage sur le tampon. `inputMode="numeric"` rend le cas très
      // improbable : un pavé numérique ne compose pas.
      if (e.inputType !== 'insertText') return;
      var texte = String(e.data === null || e.data === undefined ? '' : e.data);
      // ⚠️ ON NE REMPLACE QUE SI QUELQUE CHOSE REMPLACE.
      //
      // La sélection part d'un tampon vide — « remplace ça » — mais vider
      // d'abord et poser ensuite effaçait la durée quand le caractère était
      // REFUSÉ : tout sélectionner puis taper une virgule perdait « 13:00 ».
      // On construit donc à côté, et on ne commet que si au moins un chiffre
      // est entré.
      var base = selection ? '' : input.dataset.chiffres;
      var suite = base, pose = false;
      // Un clavier peut livrer plusieurs caractères d'un coup : on les pose un
      // par un, dans l'ordre, exactement comme s'ils étaient tapés.
      for (var i = 0; i < texte.length; i++) {
        var apres = M().poserChiffreDuree(suite, texte[i], o.max);
        if (apres !== suite) pose = true;
        suite = apres;
      }
      if (!pose) return;
      input.dataset.chiffres = suite;
      rendre();
    });

    // Ceinture et bretelles : si `beforeinput` n'était pas annulable — certains
    // claviers, certaines dictées — le navigateur insérerait quand même son
    // caractère PAR-DESSUS ce qu'on vient d'écrire. On réaffirme donc
    // l'invariant après coup : ce qui s'affiche est toujours le tampon, jamais
    // ce que le navigateur a cru bon d'ajouter.
    input.addEventListener('input', function () {
      var v = M().dureeDeChiffres(input.dataset.chiffres);
      var attendu = v === null ? '' : M().formatChrono(v);
      if (input.value !== attendu) input.value = attendu;
    });

    enveloppe.appendChild(input);
    return enveloppe;
  }

  // Un champ de texte libre — note d'exercice, note de série, titre, salle.
  // Il MUTE l'état sans redessiner, pour la même raison que les champs
  // numériques : re-rendre à chaque frappe arracherait le focus, et le clavier
  // d'Android avec lui.
  //
  // `max` n'est pas décoratif là où il est posé : `sessions.salle` porte un
  // CHECK de 1 à 60 caractères, et un dépassement remonterait en 23514 — que la
  // file classe DÉFINITIVE. Le champ empêche donc ce que le modèle tronque.
  function champTexte(etiquette, valeur, options, surSaisie) {
    var o = options || {};
    var env = el('label', 'champ-texte');
    env.appendChild(el('span', '', etiquette));
    var n = doc.createElement(o.lignes ? 'textarea' : 'input');
    if (o.lignes) n.rows = o.lignes; else n.type = 'text';
    if (o.max) n.maxLength = o.max;
    if (o.placeholder) n.placeholder = o.placeholder;
    n.value = (valeur === null || valeur === undefined) ? '' : String(valeur);
    n.addEventListener('input', function () { surSaisie(n.value); });
    env.appendChild(n);
    return env;
  }

  // `options.indication` : un texte à montrer dans un champ VIDE qui n'a pas
  // de fantôme — la fourchette de reps de la ligne proposée (§9.14, ECRAN
  // §3.2). Ce n'est pas une valeur : rien ne la recopie à la validation.
  // `options.surQuitte` : la sortie du champ (`change`), pour redessiner après
  // une correction sans voler le focus à chaque frappe.
  function champSerie(classe, valeur, fantomeVal, suffixe, surSaisie, options) {
    var o = options || {};
    var vide = valeur === null || valeur === undefined;
    var indication = vide && (fantomeVal === null || fantomeVal === undefined) && o.indication
      ? o.indication : null;
    var enveloppe = el('div', classe + (vide && fantomeVal !== null && fantomeVal !== undefined
      ? ' fantome' : '') + (indication ? ' indication' : ''));
    var input = doc.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.value = vide ? '' : nombreFr(valeur);
    if (vide && fantomeVal !== null && fantomeVal !== undefined) {
      input.placeholder = nombreFr(fantomeVal) + (o.plus ? '+' : '');   // 193-6 : « 8+ », la ligne « Au max »
    } else if (indication) {
      input.placeholder = indication;
    }
    // Prompt 131 (audit 130 n°8) — `options.max`, la borne du champ en unité de saisie
    // (`THModele.maxDeSaisie`) : au-delà, le chiffre tapé n'entre pas — comme au pavé de
    // la durée (§3 ter.2 ter). Le champ revient au dernier texte accepté, et rien n'est
    // écrit.
    var accepte = input.value;
    input.addEventListener('input', function () {
      if (o.max !== null && o.max !== undefined) {
        var n = M().lireNombre(input.value);
        if (n !== null && n > o.max) { input.value = accepte; return; }
      }
      accepte = input.value;
      surSaisie(input.value);
    });
    if (typeof o.surQuitte === 'function') {
      input.addEventListener('change', function () { o.surQuitte(); });
    }
    enveloppe.appendChild(input);
    if (suffixe) enveloppe.appendChild(el('u', '', suffixe));
    return enveloppe;
  }

  // De la colonne à ce qu'on tape. `null` reste `null` : un champ vide n'est
  // pas un zéro.
  function enUniteDeSaisie(valeur, facteur) {
    if (valeur === null || valeur === undefined) return null;
    var n = Number(valeur);
    if (!isFinite(n)) return null;
    var f = Number(facteur) || 1;
    return f === 1 ? n : Math.round((n / f) * 100) / 100;
  }

  function texteEffort(serie) {
    if (serie.rpe !== null && serie.rpe !== undefined) return nombreFr(serie.rpe);
    if (serie.ressenti) return '−' + serie.ressenti.replace('reste_', '').replace('3_plus', '3+');
    return '';
  }

  // ⚠️ LE GLISSEMENT LATÉRAL — la famille de geste qui a coûté trois chantiers.
  //
  // La règle qui le rend sûr : LA DIRECTION SE DÉCIDE UNE FOIS, au premier
  // mouvement qui dépasse le seuil, et ne change plus. Tant qu'elle n'est pas
  // décidée on ne préempte rien, donc le défilement vertical part normalement ;
  // une fois décidée horizontale, on appelle `preventDefault` et la page ne
  // bouge plus. C'est l'indécision qui fait les gestes qui se battent.
  //
  // Et il n'est JAMAIS le seul chemin : le menu du numéro porte « Supprimer ».
  // Un geste qui rate ne doit pas enfermer.
  var SEUIL = 12;      // px avant de décider de la direction
  var OUVERTURE = 84;  // px de découvert quand la ligne est ouverte

  function brancherGlissement(ligne, surSupprimer) {
    var x0 = 0, y0 = 0, sens = null, actif = false;

    ligne.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      x0 = e.clientX; y0 = e.clientY; sens = null; actif = true;
    });

    ligne.addEventListener('pointermove', function (e) {
      if (!actif) return;
      var dx = e.clientX - x0, dy = e.clientY - y0;
      if (sens === null) {
        if (Math.abs(dx) < SEUIL && Math.abs(dy) < SEUIL) return;
        // Décidé une fois pour toutes. Vertical → on ne touche plus à rien.
        sens = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
        if (sens === 'v') { actif = false; return; }
        ligne.setPointerCapture(e.pointerId);
      }
      if (sens !== 'h') return;
      e.preventDefault();
      var d = Math.max(-OUVERTURE, Math.min(0, dx));
      ligne.firstChild.style.transform = 'translateX(' + d + 'px)';
    });

    function fin(e) {
      if (!actif) { remettre(); return; }
      actif = false;
      if (sens !== 'h') { remettre(); return; }
      var dx = e.clientX - x0;
      if (dx <= -OUVERTURE * 0.6) surSupprimer();
      else remettre();
    }
    function remettre() { ligne.firstChild.style.transform = ''; }

    ligne.addEventListener('pointerup', fin);
    ligne.addEventListener('pointercancel', function () { actif = false; remettre(); });
  }

  // ══ RÉORGANISER — UN GLISSEMENT À LA POIGNÉE (§7 vicies) ═════════════════
  //
  // ⚠️ UN SEUL COMPOSANT POUR TROIS SURFACES : la séance, l'éditeur de routine
  // et la bibliothèque. Ce qui varie est le CONTENU des rangées ; le geste, non.
  // Trois glissements auraient divergé le jour où l'un se corrige — c'est le
  // §2 undecies, et le glissement est précisément l'endroit où une divergence
  // ne se voit qu'au pouce.
  //
  // ⚠️ LA POIGNÉE ISOLE LE GESTE, ET C'EST TOUT LE DISPOSITIF DE SÛRETÉ. Le
  // glissement vertical a coûté trois chantiers sur le bouton retour, et le
  // §5.3 mesure qu'à 360 px deux poignées se confondent au pouce. Ici :
  //
  //   · `touch-action: none` sur la POIGNÉE SEULE (styles.css) — le navigateur
  //     ne lui vole plus le geste vertical ;
  //   · le reste de la rangée garde `pan-y` — donc le doigt posé ailleurs
  //     DÉFILE, et c'est la non-régression à vérifier explicitement ;
  //   · aucun seuil directionnel, aucune indécision : partir de la poignée EST
  //     la décision. `brancherGlissement` doit trancher une direction parce que
  //     sa surface de départ est toute la ligne ; ici la surface répond déjà.
  //
  // ⚠️ ON DÉPLACE LE NŒUD, ON NE REPEINT PAS. Repeindre à chaque permutation
  // perdrait la capture du pointeur — le doigt lâcherait le bloc en cours de
  // route. `insertBefore` garde le même élément, donc la même capture.
  var BORD_AUTO = 64;    // px depuis le bord où le défilement s'entraîne
  var PAS_AUTO = 10;     // px par battement

  function brancherReorganisation(conteneur, vue) {
    var pris = null, depart = 0, decal = 0, minuteur = null, dernierY = 0;

    function rangees() {
      return Array.prototype.filter.call(conteneur.children, function (n) {
        return n.getAttribute && n.getAttribute('data-cle') !== null;
      });
    }
    function ordre() {
      return rangees().map(function (n) { return n.getAttribute('data-cle'); });
    }
    // Le haut de la rangée SANS la translation en cours : c'est la seule
    // grandeur stable pendant qu'on la déplace.
    function hautPropre() {
      return pris.getBoundingClientRect().top - decal;
    }
    function poser() {
      pris.style.transform = decal ? 'translateY(' + decal + 'px)' : '';
    }

    // Une permutation à la fois : on compare le MILIEU de la rangée prise au
    // milieu de son voisin. Comparer les hauts ferait sauter deux crans sur des
    // rangées de hauteurs différentes — et un superset est plus haut.
    function permuter() {
      var r = pris.getBoundingClientRect();
      var milieu = r.top + r.height / 2;
      var avant = pris.previousElementSibling;
      var apres = pris.nextElementSibling;
      var cible = null, devant = null;
      if (avant && avant.getAttribute && avant.getAttribute('data-cle') !== null) {
        var ra = avant.getBoundingClientRect();
        if (milieu < ra.top + ra.height / 2) { cible = avant; devant = avant; }
      }
      if (!cible && apres && apres.getAttribute && apres.getAttribute('data-cle') !== null) {
        var rb = apres.getBoundingClientRect();
        if (milieu > rb.top + rb.height / 2) { cible = apres; devant = apres.nextSibling; }
      }
      if (!cible) return false;
      var avantTop = hautPropre();
      conteneur.insertBefore(pris, devant);
      // La rangée a changé de place dans le flux : on corrige l'origine pour
      // qu'elle reste EXACTEMENT sous le doigt. Sans ça elle saute d'une hauteur
      // à chaque permutation, et le geste devient impilotable.
      depart += hautPropre() - avantTop;
      decal = dernierY - depart;
      poser();
      return true;
    }

    // ⚠️ AUTANT DE PERMUTATIONS QUE LE DOIGT EN A FRANCHI. `permuter` n'en fait
    // qu'UNE : un pointeur qui saute deux rangées en un seul événement — un
    // glissement rapide, ou un `pointermove` avalé par une image perdue — n'en
    // déclencherait alors qu'une, et la rangée traînerait derrière le doigt.
    // Mesuré au banc : un glissement de deux crans n'en faisait qu'un.
    function rattraper() {
      var filet = 32;                       // un filet, pas une limite attendue
      while (filet-- > 0 && permuter()) { /* on recommence tant qu'on franchit */ }
    }

    function battre() {
      if (pris === null) return;
      var h = (doc.documentElement && doc.documentElement.clientHeight) || 0;
      var d = 0;
      if (dernierY < BORD_AUTO) d = -PAS_AUTO;
      else if (dernierY > h - BORD_AUTO) d = PAS_AUTO;
      if (!d) return;
      var avant = racine.scrollY || 0;
      racine.scrollBy(0, d);
      var fait = (racine.scrollY || 0) - avant;
      if (!fait) return;
      // La page a glissé sous le doigt : la rangée doit suivre le DOIGT, pas la
      // page. On rattrape l'écart sur l'origine, puis on re-teste les voisins.
      depart -= fait;
      decal = dernierY - depart;
      poser();
      rattraper();
    }

    function relacher() {
      if (pris === null) return;
      if (minuteur) { clearInterval(minuteur); minuteur = null; }
      pris.classList.remove('pris');
      pris.style.transform = '';
      pris = null; decal = 0;
      if (vue && vue.surOrdre) vue.surOrdre(ordre());
    }

    conteneur.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      var p = e.target.closest && e.target.closest('.poignee');
      if (!p || !conteneur.contains(p)) return;
      var r = p.closest('[data-cle]');
      if (!r || r.parentNode !== conteneur) return;
      pris = r; depart = e.clientY; dernierY = e.clientY; decal = 0;
      pris.classList.add('pris');
      try { pris.setPointerCapture(e.pointerId); } catch (x) { /* souris de banc */ }
      e.preventDefault();
      minuteur = setInterval(battre, 16);
    });

    conteneur.addEventListener('pointermove', function (e) {
      if (pris === null) return;
      e.preventDefault();
      dernierY = e.clientY;
      decal = e.clientY - depart;
      poser();
      rattraper();
    });

    conteneur.addEventListener('pointerup', relacher);
    conteneur.addEventListener('pointercancel', relacher);
    return { ordre: ordre };
  }

  // La poignée. ⚠️ Elle porte `aria-hidden` : le glissement n'est pas accessible
  // au clavier, et les flèches ↑/↓ restent le chemin qui l'est. Un geste qui
  // rate ne doit pas enfermer — c'est la doctrine du glissement latéral, et elle
  // vaut deux fois ici.
  function poignee() {
    var p = el('div', 'poignee');
    p.setAttribute('aria-hidden', 'true');
    p.appendChild(el('span', '', '\u2261'));
    return p;
  }

  // Le pied du mode : plusieurs déplacements, UN enregistrement (§7 vicies.1).
  function rendrePiedReorganisation(cible, vue) {
    vider(cible);
    if (!vue) { cible.hidden = true; return cible; }
    cible.hidden = false;
    var pied = el('div', 'pied-reorg');
    pied.appendChild(el('p', 'reorg-aide', vue.aide || 'Maintiens la poignée et fais glisser.'));
    var rangee = el('div', 'reorg-actions');
    var annuler = el('button', 'discret', 'Annuler');
    annuler.type = 'button';
    annuler.addEventListener('click', function () { vue.surAnnuler(); });
    rangee.appendChild(annuler);
    var ok = el('button', 'principal', 'Enregistrer');
    ok.type = 'button';
    ok.disabled = !!vue.enCours;
    ok.addEventListener('click', function () { vue.surEnregistrer(); });
    rangee.appendChild(ok);
    pied.appendChild(rangee);
    cible.appendChild(pied);
    return cible;
  }

  // ══ L'UNITÉ DE L'ÉCRAN EST LE BLOC, PAS L'EXERCICE (§2.1) ════════════════
  //
  // Un exercice normal est un bloc d'un seul ; un superset est un bloc de 2 à 6.
  // Même carte, même code, pas de « mode superset » — c'est ce qui évite d'avoir
  // deux rendus à tenir d'accord.
  //
  // Les blocs arrivent déjà construits (`THModele.blocsDeSeance`), donc par la
  // MÊME fonction que le détail de séance. Ici on ne fait que poser dans le DOM.
  // ── §3.9 (48b-6b-2) — RÉÉCRIRE LES DEUX LIGNES DU CONSTAT, ET RIEN D'AUTRE
  //
  // ⚠️ DETTE ASSUMÉE, PAS UN SECOND CHEMIN DE RENDU. Taper dans un champ ne
  // redessine pas la séance (`app.js`, `apresGeste({ rendre: false })`) : le
  // champ écoute chaque frappe, et le redessiner volerait le focus au milieu
  // d'un nombre. Le constat, lui, doit suivre. D'où cette porte étroite : elle
  // touche le texte de `.constat` et de `.constat-suite`, pose ou retire la
  // seconde ligne, et NE CONSTRUIT RIEN. Elle ne fait pas revenir la consigne
  // et ne crée pas un constat absent : le prochain vrai rendu s'en charge.
  // Toute envie de lui faire davantage est le signal qu'il faut un rendu.
  // Prérequis d'« adapter » — `iExo` (facultatif) désigne l'occurrence : un
  // exercice présent deux fois a deux légendes, et seule celle que le coach
  // suit porte un constat.
  function majConstat(racine, slug, constat, iExo) {
    if (!racine || !slug) return;
    var sel = '.legende-exo[data-exo="' + slug + '"]';
    var legende = (iExo !== undefined && iExo !== null
      ? racine.querySelector(sel + '[data-iexo="' + iExo + '"]') : null) || racine.querySelector(sel);
    if (!legende) return;
    var ligne = legende.querySelector('.constat');
    if (!ligne || !constat) return;
    ligne.textContent = constat.verdict === null || constat.verdict === undefined
      ? '' : String(constat.verdict);
    var suite = legende.querySelector('.constat-suite');
    if (!constat.suite) { if (suite) suite.parentNode.removeChild(suite); return; }
    if (suite) { suite.textContent = constat.suite; return; }
    legende.insertBefore(el('div', 'constat-suite', constat.suite), ligne.nextSibling);
  }

  function rendreBlocsSeance(cible, seance, vue) {
    vider(cible);
    var blocs = vue.blocs || [];
    if (!blocs.length) {
      cible.appendChild(el('p', 'vide', 'Aucun exercice. Ajoute le premier ci-dessous.'));
      return;
    }
    // 194-1 (MOTEUR §9.31) — la préparation avant la séance, en mouvement seulement : lue sur le plan, jamais calculée ici.
    var mob = !vue.modifier && typeof vue.propositionMobilite === 'function' ? vue.propositionMobilite() : null;
    if (mob && mob.avant) cible.appendChild(carteDeMobilite(mob.avant, 'avant', vue));
    blocs.forEach(function (bloc, iBloc) {
      // §5.3 — le mode Modifier replie TOUT sur une ligne par bloc. Deux
      // poignées à 360 px, l'une déplaçant six lignes et l'autre une seule, se
      // confondent au pouce ; repliées, elles mesurent pareil.
      cible.appendChild(vue.modifier
        ? blocReplie(bloc, iBloc, blocs.length, vue)
        : rendreBlocSaisie(bloc, iBloc, vue));
    });
    if (mob && mob.fin) cible.appendChild(carteDeMobilite(mob.fin, 'fin', vue));
  }

  // 194-1 — LA CARTE DU BLOC DE MOBILITÉ (maquette-mobilite-v1) : le titre, les exercices avec leurs séries et leurs tenues, la consigne,
  // « Ajouter » / « Non merci » (le composant des chauffes), le « Pourquoi ». `ou` : 'avant' (préparation) ou 'fin'. Une fin sans zone
  // (toutes à ménager) ne montre que la phrase du kiné, sans geste.
  function carteDeMobilite(b, ou, vue) {
    var n = el('section', 'carte-mobilite carte-mobilite-' + ou);
    n.setAttribute('data-mobilite', ou);
    var zones = b.zones ? b.zones : [b];
    if (b.titre) {
      n.appendChild(el('h3', 'cm-titre', b.titre));
      n.appendChild(el('div', 'cm-sous', b.sousTitre));
      var liste = el('ol', 'cm-liste');
      zones.forEach(function (z) {
        (z.exercices || []).forEach(function (x) {
          // 200-1 — le catalogue d'abord, puis le nom français du plan ; jamais l'identifiant.
          var nom = typeof vue.nomMobilite === 'function' ? vue.nomMobilite(x.slug) : x.slug;
          if (!nom || nom === x.slug || /^[a-z0-9]+(_[a-z0-9]+)+$/.test(nom)) nom = x.nom || 'Exercice de mobilit\u00e9';
          var ligne = el('li', 'cm-ligne');
          ligne.appendChild(el('span', 'cm-nom', nom));
          ligne.appendChild(el('span', 'cm-dose', x.series + '\u00a0\u00d7\u00a0' + x.duree_s + '\u00a0s' + (x.cote ? ' par c\u00f4t\u00e9' : '')));
          ligne.appendChild(el('span', 'cm-zone', z.libelle));
          liste.appendChild(ligne);
        });
      });
      n.appendChild(liste);
      n.appendChild(el('div', 'cm-consigne', b.consigne));
    }
    (b.kine || []).forEach(function (k) { n.appendChild(el('div', 'cm-kine', k)); });
    if (b.titre) {
      var p = propositionDExercice({
        classe: 'proposition-mobilite', texte: ou === 'avant' ? 'Ajouter la préparation\u00a0?' : 'Ajouter le bloc de mobilité\u00a0?', oui: 'Ajouter', non: 'Non merci',
        surOui: function () { vue.surAjouterMobilite(ou); },
        surNon: function () { vue.surRefuserMobilite(); }
      }, -1);
      n.appendChild(p);
      var det = el('details', 'cm-pourquoi');
      det.appendChild(el('summary', null, 'Pourquoi\u00a0?'));
      det.appendChild(el('p', null, b.pourquoi));
      n.appendChild(det);
    }
    return n;
  }

  // ⚠️ LE MODE SÉLECTION DU §5.7. Grouper est une opération sur une PAIRE :
  // le menu passe en sélection, les AUTRES blocs s'allument et deviennent
  // tapables, on tape celui à joindre. Un tap de plus, aucune ambiguïté, et ça
  // marche à n'importe quelle distance dans la liste — ce qu'un glissement ne
  // sait pas faire.
  function enCoursDeSelection(vue) {
    return vue.selection !== null && vue.selection !== undefined;
  }

  // La SOURCE n'est pas une cible : se grouper avec soi-même n'a pas de sens, et
  // l'autoriser rendrait le geste muet. Elle reste affichée, en retrait — on
  // doit savoir d'où l'on part autant que vers quoi l'on va.
  function marquerSelection(noeud, vue, iBloc) {
    if (vue.selection === iBloc) { noeud.classList.add('source-groupe'); return noeud; }
    noeud.classList.add('cible-groupe');
    noeud.setAttribute('role', 'button');
    noeud.addEventListener('click', function () { vue.surGrouper(vue.selection, iBloc); });
    return noeud;
  }

  // ⚠️ IL N'A PLUS QU'UN APPELANT : le mode Modifier de la séance. L'éditeur de
  // routine s'en servait aussi jusqu'au chantier 41, où ses gestes sont passés
  // au menu à trois points (§7 duodecies.2). Il reste ici parce que replier un
  // bloc DOIT garder ses deux flèches sous le pouce — c'est tout l'intérêt du
  // mode (§5.3), et un menu de plus y serait un geste de plus.
  function geste(texte, titre, desactive, surClic) {
    var b = el('button', 'geste', texte);
    b.type = 'button';
    b.setAttribute('aria-label', titre);
    b.title = titre;
    b.disabled = !!desactive;
    if (!desactive) b.addEventListener('click', surClic);
    return b;
  }

  // La carte repliée : la légende, l'avancement, et deux flèches. Rien d'autre —
  // c'est la vue d'ensemble qui manque pendant qu'on s'entraîne (§5.3).
  function blocReplie(bloc, iBloc, total, vue) {
    var noeud = el('div', 'bloc-seance replie' + (bloc.superset ? ' superset' : ''));
    // ⚠️ LA CLÉ EST L'INDICE DU BLOC, PAS UN IDENTIFIANT. Un bloc de séance n'a
    // pas d'id propre — c'est une TRANCHE d'exercices (§2.1). L'appelant relit
    // donc l'ordre des indices et reconstruit la tranche ; c'est aussi ce qui
    // fait qu'un superset se déplace d'un tenant sans rien de spécial ici.
    noeud.setAttribute('data-cle', String(iBloc));
    var haut = el('div', 'replie-haut');
    // Le glissement (§7 vicies.2) s'ajoute aux flèches, il ne les remplace pas.
    if (vue.reorganiser) haut.appendChild(poignee());

    var noms = el('div', 'replie-noms');
    bloc.exercices.forEach(function (x) {
      var l = el('div', 'replie-nom');
      if (x.lettre) l.appendChild(el('span', 'lettre-exo', x.lettre));
      l.appendChild(el('span', '', x.nom));
      noms.appendChild(l);
    });
    haut.appendChild(noms);

    var gestes = el('div', 'replie-gestes');
    gestes.appendChild(geste('↑', 'Monter le bloc', iBloc === 0,
      function () { vue.surDeplacerBloc(iBloc, -1); }));
    gestes.appendChild(geste('↓', 'Descendre le bloc', iBloc === total - 1,
      function () { vue.surDeplacerBloc(iBloc, 1); }));
    haut.appendChild(gestes);
    noeud.appendChild(haut);

    // L'avancement remplace le palier (§5.3) : combien de séries de travail
    // sont faites sur combien. Un fait, aucune prescription.
    // `faite`, pas `validee_a` (chantier 35, D3) — voir `Modele.faiteEnBase` :
    // une séance importée n'a aucun `validee_a`, et affichait « 0 / 4 ».
    // ⚠️ DANS L'ÉDITEUR, RIEN N'EST « FAIT » (ch. 46). Le même bloc replié sert
    // maintenant à la routine, où « 0 / 4 séries » serait faux ET décourageant :
    // une routine ne se fait pas, elle se programme. Même composant, un compte
    // qui dit ce qu'il y a à dire de chaque côté.
    var pluriel = bloc.nbTravail > 1 ? 's' : '';
    if (vue.programme) {
      noeud.appendChild(el('div', 'replie-avancement num',
        bloc.nbTravail + ' série' + pluriel));
      return noeud;
    }
    var faites = bloc.series.filter(function (s) { return s.estTravail && s.faite; }).length;
    noeud.appendChild(el('div', 'replie-avancement num',
      faites + ' / ' + bloc.nbTravail + ' série' + pluriel));
    return noeud;
  }

  // Le gabarit d'un exercice du bloc. ⚠️ Un superset peut MÉLANGER les mesures
  // (un exercice en `charge_reps`, un en `temps`) : chaque ligne garde le sien.
  // Prompt 131 (ECRAN §3 ter.5) — LA GRILLE d'un exercice : le gabarit de sa mesure, plus les
  // champs en plus du catalogue (`THModele.grilleDe` : `colonnes`, `dessous`). Dans l'éditeur
  // de routine, aucun champ en plus.
  // 132 (ECRAN-SAISIE §3 ter.6) — un exercice noté par nom (`vue.elastique(slug)`, hors éditeur de routine) : la
  // colonne « ÉLASTIQUE » (`THModele.grilleElastique`).
  function gabaritDe(vue, slug) {
    var g = M().grilleDe(vue.exercice(slug), !!vue.programme);
    // 163 — et un exercice à l'élastique dont la liste est vide : la colonne « Élastique » aussi, « Ajoute tes élastiques ».
    var parNom = !vue.programme && ((typeof vue.elastique === 'function' && vue.elastique(slug)) ||
      (typeof vue.elastiqueAAjouter === 'function' && vue.elastiqueAAjouter(slug)));
    return parNom ? M().grilleElastique(g) : g;
  }
  function colonnesDe(g) { return g.colonnes || g.champs; }
  // La classe de la grille : celle de la mesure, et `g-plus` quand un champ en plus prend une
  // colonne (Escaliers : durée · étages, la grille à deux cases de la distance). 132 : `g-elastique`.
  function classeDeGrille(g) {
    if (g.elastique) return ' grille g-elastique';
    return ' grille g-' + g.mesure + (colonnesDe(g).length > g.champs.length ? ' g-plus' : '');
  }

  function rendreBlocSaisie(bloc, iBloc, vue) {
    var noeud = el('div', 'bloc-seance' + (bloc.superset ? ' superset' : ''));
    var gabarits = bloc.exercices.map(function (x) { return gabaritDe(vue, x.slug); });

    noeud.appendChild(teteDeBloc(bloc, iBloc, gabarits, vue));

    // ⚠️ EN SÉLECTION, TOUT LE MONDE SE RÉDUIT À SA TÊTE — la source comme les
    // cibles. On choisit un bloc, on ne lit pas des séries : la liste tient
    // alors à l'écran, et c'est ce qui fait marcher le geste « à n'importe
    // quelle distance » (§5.7). Réduire les cibles en laissant la source
    // déployée n'aurait été qu'une asymétrie sans raison.
    if (enCoursDeSelection(vue)) { marquerSelection(noeud, vue, iBloc); return noeud; }

    // ⚠️ L'EN-TÊTE DE COLONNES NE S'AFFICHE QUE S'IL DIT VRAI. Dans un superset
    // à mesures mélangées, une seule ligne d'en-têtes mentirait sur la moitié
    // des rangées. On la tait plutôt que de nommer KG au-dessus d'une durée ; le
    // type de mesure reste écrit sous chaque nom, dans la légende.
    var memeGabarit = gabarits.every(function (g) {
      return g.mesure === gabarits[0].mesure && (g.nature || null) === (gabarits[0].nature || null) &&
        colonnesDe(g).join() === colonnesDe(gabarits[0]).join();
    });
    // §7 quindecies.3 (52-1) — dans l'éditeur, la colonne de charge dit ce
    // qu'elle est : « DÉPART » sur un exercice jamais fait, absente sinon. Des
    // exercices qui ne s'accordent pas là-dessus taisent l'en-tête, comme des
    // mesures mélangées.
    var charges = vue.programme && vue.chargeProgramme
      ? bloc.exercices.map(function (x) { return vue.chargeProgramme(x.slug); }) : null;
    var cleCharge = function (cp) { return cp ? (cp.depart ? 'depart' : 'coach') : ''; };
    var memeCharge = !charges || charges.every(function (cp) { return cleCharge(cp) === cleCharge(charges[0]); });
    if (memeGabarit && memeCharge) {
      noeud.appendChild(enTetesColonnes(gabarits[0], vue.programme, charges && charges.length ? charges[0] : null));
    }

    // §2.6 — l'éclairage porte sur le TOUR entier, pas sur une ligne isolée.
    // Dans un bloc d'un seul exercice, le tour n'a qu'une série : la règle
    // dégénère exactement en l'ancien comportement, sans cas particulier.
    var complets = M().toursComplets(bloc);

    var proposees = {};
    bloc.series.forEach(function (s) {
      // MOTEUR §9.15.2 (49-U10) — la proposition de chauffes, au-dessus de la
      // première série de l'exercice : une ligne à accepter, jamais des séries
      // insérées d'office.
      if (!vue.programme && !proposees[s._iExo]) {
        proposees[s._iExo] = true;
        // MOTEUR §14.5 (49-U15) — la carte de schéma d'abord : la seule
        // question du coach sur cet exercice.
        // MOTEUR §9.17 (50-1) — la carte du lest passe AVANT toute autre : elle est
        // la seule question du coach quand elle se pose (une seule, en tête de
        // l'exercice), et le plan ne la pose jamais avec une carte de schéma.
        // §9.20 — la carte de reprise d'abord : elle ne se pose qu'après une
        // séance douloureuse, et c'est elle qui décide comment l'exercice reprend.
        var pr = typeof vue.propositionReprise === 'function' ? vue.propositionReprise(s._iExo) : null;
        if (pr) noeud.appendChild(propositionDeReprise(pr, s._iExo, vue));
        var pl = typeof vue.propositionLest === 'function' ? vue.propositionLest(s._iExo) : null;
        if (pl) noeud.appendChild(propositionDeLest(pl, s._iExo, vue));
        // MOTEUR §9.17 bis (127) — la carte « marche suivante » : la place et le composant de la carte du lest (le
        // plan ne pose jamais les deux sur un exercice).
        var pm = typeof vue.propositionMarche === 'function' ? vue.propositionMarche(s._iExo) : null;
        if (pm) noeud.appendChild(propositionDeMarche(pm, s._iExo, vue));
        var ps = typeof vue.propositionSchema === 'function' ? vue.propositionSchema(s._iExo) : null;
        if (ps) noeud.appendChild(propositionDeSchema(ps, s._iExo, vue));
        var pc = typeof vue.propositionChauffes === 'function' ? vue.propositionChauffes(s._iExo) : null;
        if (pc) noeud.appendChild(propositionDeChauffes(pc, s._iExo, vue));
        // 193-6 (MOTEUR §9.30) — « Dernière série au max ? » : une fois par exercice, du plan ; trois gestes.
        var pa = typeof vue.propositionAuMax === 'function' ? vue.propositionAuMax(s._iExo) : null;
        if (pa) noeud.appendChild(propositionDAuMax(pa, s._iExo, vue));
        // 193-4 (MOTEUR §9.32) — la semaine de test : la barre testée aujourd'hui, ou la note d'un accessoire.
        var pt = typeof vue.semaineDeTest === 'function' ? vue.semaineDeTest(s._iExo) : null;
        if (pt) { var ct = carteDeTest(pt, s._iExo, vue); if (ct) noeud.appendChild(ct); }
      }
      // §9.14 (49-R2) — LA RÉACTION PARLE DANS LA GRILLE, au-dessus de la
      // ligne qu'elle concerne (ECRAN §3.2, maquette variante A). Une ligne de
      // plus DANS le bloc, jamais une seconde couche. Une SŒUR de la ligne, et
      // pas son enfant : le glissement déplace le premier enfant de la ligne.
      var info = !vue.programme && typeof vue.reaction === 'function'
        ? vue.reaction(s._iExo, s._iSerie) : null;
      // MOTEUR §9.15.3 (94) — une dégressive que le coach ne peut pas remplir :
      // la phrase dit pourquoi, et deux gestes, lus sur le plan.
      if (info && info.message && info.message.gestes && typeof vue.surDegressiveVide === 'function') {
        noeud.appendChild(propositionDeDegressiveVide(info.message, s._iExo, s._iSerie, vue));
      } else if (info && info.message) noeud.appendChild(phraseDeReaction(info.message, s.debutTour));
      var rangee = rangeeDeSerie(bloc, s, complets, vue, info);
      noeud.appendChild(rangee);
      // 185 — LA QUESTION DE VRAISEMBLANCE, sous la série, avant qu'elle soit écrite (ou, pour un record énorme, après) : une
      // ligne et ses boutons, jamais une fenêtre. Lue sur l'app (`vue.questionSaisie`), la règle n'est pas ici.
      var qs = !vue.programme && typeof vue.questionSaisie === 'function' ? vue.questionSaisie(s._iExo, s._iSerie) : null;
      if (qs) {
        if (qs.champ) {
          var douteux = rangee.querySelector('[data-champ="' + qs.champ + '"]');
          if (douteux && qs.mode !== 'record') douteux.classList.add('doute');
        }
        noeud.appendChild(questionDeSaisie(qs, s._iExo, s._iSerie, vue.surQuestion));
      }
      // 149 (MOTEUR §9.17 ter) — UNE FIGURE EN SECONDES : l'étiquette de la ligne (« max », « après ton max ») et, la tenue
      // max validée, la phrase du coach sous elle. Lues sur le plan (`info`), jamais recomposées.
      if (info && info.etiquette) noeud.appendChild(el('div', 'fig-eti', info.etiquette));
      if (info && info.apres) noeud.appendChild(phraseDeReaction({ type: 'figure', phrase: info.apres }, false));
      // ECRAN §3 ter.5 (prompt 131, maquette mesures-cardio écran 1) — LE D+, SUR SA PROPRE LIGNE,
      // SOUS LA SÉRIE : une troisième colonne ne tient pas à 360 px à côté d'une durée en horloge.
      // Facultatif, sans chiffre gris ; jamais dans l'éditeur de routine.
      if (!vue.programme) {
        (gabaritDe(vue, s.exercise_slug).dessous || []).forEach(function (nom) {
          noeud.appendChild(ligneEnPlus(s, nom, vue));
        });
      }
      // MOTEUR §9.23 (55-1) — LA MÉDAILLE, SOUS LA RANGÉE de la série qui bat
      // un record. Une sœur de la ligne, comme la réaction (qui reste
      // au-dessus de la ligne suivante : elle parle de la suite, la médaille
      // de cette série). Lue sur l'app, jamais calculée ici.
      var med = !vue.programme && typeof vue.medaille === 'function' ? vue.medaille(s._iExo, s._iSerie) : null;
      if (med) noeud.appendChild(medailleDeSerie(med));
      // 154 (MOTEUR §9.26) — L'EFFORT VISÉ : sous la dernière série de travail, les puces « Il t'en restait combien ? » ;
      // une fois la réponse donnée, la phrase du coach. Lu sur le plan (`vue.effortVise`), jamais décidé ici.
      var ef = !vue.programme && typeof vue.effortVise === 'function' ? vue.effortVise(s._iExo, s._iSerie) : null;
      if (ef) noeud.appendChild(effortViseDeSerie(ef));
    });

    noeud.appendChild(boutonsAjoutSerie(bloc, vue));
    return noeud;
  }

  // §3.8 — L'ÉTIQUETTE DE ZONE, FABRIQUÉE UNE SEULE FOIS. L'écran de séance et
  // la page d'exercice la montrent tous les deux ; deux constructions, c'était
  // deux états à tenir d'accord et une divergence garantie le jour où l'un des
  // deux gagne une classe.
  //
  // Sans geste, elle reste un `span` : un bouton qui ne fait rien est une
  // promesse, et c'est ce que 48b-6a refusait d'afficher.
  function puceZone(texte, choisie, surClic) {
    var classe = 'puce-zone' + (choisie ? ' choisie' : '');
    if (typeof surClic !== 'function') return el('span', classe, texte);
    var b = el('button', classe, texte);
    b.type = 'button';
    b.addEventListener('click', surClic);
    return b;
  }

  function teteDeBloc(bloc, iBloc, gabarits, vue) {
    var tete = el('div', 'tete-seance');

    var haut = el('div', 'tete-haut');
    // §2.7 — le tour ATTEINT, et il ne recule pas. C'est le seul endroit où il
    // se voit ; sans lui, « le tour avance » ne serait qu'une idée.
    //
    // ⚠️ CE SONT LES TOURS FAITS, PAS LE TOUR EN COURS (§7 undecies.3). Un `+1`
    // affichait « tour 1/3 » avant d'avoir rien fait, et « 2/3 » une fois le
    // premier tour bouclé : lu sur l'appareil, ça donnait l'impression qu'une
    // chauffe faisait avancer le compteur. Elle ne l'a jamais fait — 22 272
    // configurations éprouvées — c'est ce décalage d'un cran qu'on voyait.
    // ⚠️ EN MODE PROGRAMME (§7 quindecies), IL N'Y A PAS DE TOUR ATTEINT.
    // Une routine ne s'exécute pas : « tour 0/3 » y annoncerait un retard sur
    // un entraînement qui n'a pas commencé. La structure, elle, se dit — c'est
    // le nombre de tours que le bloc PRESCRIT.
    var n = bloc.superset && !vue.programme
      ? Math.min(vue.tourAtteint(bloc.groupe), bloc.nbTours) : 0;
    haut.appendChild(el('div', 'superset-t', bloc.superset
      ? 'Superset' + (bloc.nbTours
          ? (vue.programme
              ? ' · ' + bloc.nbTours + ' tour' + (bloc.nbTours > 1 ? 's' : '')
              : ' · tour ' + n + '/' + bloc.nbTours)
          : '') : ''));
    // ⚠️ LE MENU DE BLOC EST ACCESSIBLE EN PLEINE SÉANCE (§5 bis). Remplacer un
    // exercice arrive quand la machine est prise : basculer en mode Modifier
    // pour ça, puis revenir, c'est trois gestes pour un.
    //
    // Sauf PENDANT la sélection (§5.7) : là, la carte entière est la cible du
    // tap, et un bouton au milieu d'elle qui ferait autre chose est un piège.
    // « L'écran ne sert qu'à ça » vaut aussi pour ses boutons.
    //
    // ⚠️ ET EN MODE PROGRAMME, PAS DE MENU DE BLOC SUR UN SUPERSET. Les cinq
    // gestes de l'éditeur (§7 duodecies.2) portent tous sur un EXERCICE —
    // grouper, dégrouper, monter, descendre, supprimer. Sur un bloc d'un seul,
    // bloc et exercice sont le même objet et le menu est sans ambiguïté ; sur
    // un superset, il y aurait deux menus pour une même branche et aucun pour
    // le bloc. C'est le pendant exact de la règle d'en dessous, qui ne donne
    // un menu d'exercice QUE dans un bloc à plusieurs : les deux se complètent
    // sans jamais se recouvrir.
    if (!enCoursDeSelection(vue) &&
        !(vue.programme && bloc.exercices.length > 1)) {
      haut.appendChild(menuTroisPoints('Actions du bloc',
        function () { vue.surMenuBloc(iBloc); }));
    }
    tete.appendChild(haut);

    bloc.exercices.forEach(function (x, i) {
      var g = gabarits[i];
      var entree = el('div', 'legende-exo');
      // Le slug sur la légende : la SEULE chose dont `majConstat` a besoin
      // pour retrouver ses deux lignes (48b-6b-2).
      if (x.slug) entree.setAttribute('data-exo', x.slug);
      if (x._iExo !== undefined && x._iExo !== null) entree.setAttribute('data-iexo', String(x._iExo));

      var ligne = el('div', 'legende-haut');
      var nom = el('div', 'exo-seance');
      // La lettre n'existe QUE dans un superset (§2.3) : un bloc d'un seul
      // n'a rien à alterner, et l'étiqueter « A » était le défaut de la
      // première maquette.
      if (x.lettre) nom.appendChild(el('span', 'lettre-exo', x.lettre));
      // §2.8 — UN TAP SUR LE NOM DONNE SA PAGE (§7 quater). Inerte depuis le
      // chantier 27 faute de page ; elle existe.
      //
      // Jamais PENDANT la sélection : là, la carte entière est la cible du tap,
      // et un bouton au milieu d'elle qui ferait autre chose est un piège —
      // exactement la raison pour laquelle le menu à trois points disparaît.
      if (vue.surExercice && x.slug && !enCoursDeSelection(vue)) {
        var lien = el('button', 'nom-exo lien', x.nom);
        lien.type = 'button';
        lien.addEventListener('click', function () { vue.surExercice(x.slug); });
        nom.appendChild(lien);
      } else {
        nom.appendChild(el('span', 'nom-exo', x.nom));
      }
      ligne.appendChild(nom);
      // §3.8 — L'ÉTIQUETTE DE ZONE, à côté du nom. Elle dit dans quelle zone le
      // moteur fait travailler, et elle n'est JAMAIS jaune : le jaune est la
      // seule voix du moteur (§7 bis.4), l'étiquette n'en est qu'un repère.
      //
      // ⚠️ ELLE SE TOUCHE DEPUIS 48b-7, et son état dit d'où vient la zone :
      // au contour quand elle est déduite des séances, au fond plein avec un
      // point quand c'est un choix. Jamais jaune dans les deux cas — le jaune
      // est la voix du moteur, l'étiquette est un repère et une porte.
      // Elle ne paraît que si la consigne porte une zone : pas en silence, pas
      // sous 3 reps d'habitude, pas en Entretenir, pas sur une mesure sans
      // charge, jamais en mode programme.
      var eti = !vue.programme && vue.etiquette ? vue.etiquette(x.slug, x._iExo) : null;
      if (eti) nom.appendChild(puceZone(eti, vue.zoneChoisie && vue.zoneChoisie(x.slug),
        vue.surZone && function () { vue.surZone(x.slug); }));
      // §9.17 — UN EXERCICE EN ENTRETENIR PAR SON PROPRE CHOIX n'a plus de
      // consigne, donc plus de zone : sans cette puce, le seul chemin du retour
      // à « Progresser » aurait disparu avec la zone. Elle ne se montre pas
      // quand c'est le PROFIL qui entretient (le réglage général y est).
      else if (!vue.programme && vue.modeEntretien && vue.modeEntretien(x.slug)) {
        nom.appendChild(puceZone('Entretien', true, vue.surZone && function () { vue.surZone(x.slug); }));
      }
      // §5.6 — le menu d'un EXERCICE n'existe que dans un bloc à plusieurs. Sur
      // un bloc d'un seul, le menu du bloc porte déjà ses gestes : deux boutons
      // pour le même objet dérouteraient.
      if (bloc.superset && !enCoursDeSelection(vue)) {
        ligne.appendChild(menuTroisPoints('Actions sur ' + x.nom,
          function () { vue.surMenuExercice(iBloc, x._iExo); }));
      }
      entree.appendChild(ligne);

      // Le type de mesure est rappelé sous le nom : sans lui, une ligne à deux
      // colonnes au milieu de lignes à trois désoriente. Tu par prudence quand
      // la mesure est inconnue — on ne nomme pas ce qu'on ne sait pas.
      if (g.libelle) entree.appendChild(el('div', 'type-mesure', g.libelle));

      // §3.1 — LA VOIX DU MOTEUR, entre la ligne de mesure et les réglages : les
      // lignes jaunes de `libellesConsigne`, puis sa phrase grise. Le jaune est
      // la SEULE voix du moteur (§7 bis.4) ; le gris, le jeton du texte
      // secondaire. Rien en mode programme : une routine n'est pas une séance,
      // elle n'a ni début ni dernière fois.
      //
      // ⚠️ L'EN-TÊTE NE CALCULE RIEN : il lit `vue.libelles(slug)`, qui rend ce
      // que `app.js` a mémoïsé à l'ouverture. Un en-tête qui appellerait le
      // moteur se recalculerait à chaque validation.
      // §3.9 — LE CONSTAT REMPLACE LA CONSIGNE, IL NE S'Y AJOUTE PAS. Quand
      // l'exercice est fini, la consigne ne dit plus rien d'utile : elle
      // prescrivait ce qui vient d'être fait. Les deux ensemble donneraient
      // deux voix pour un même bloc.
      //
      // ⚠️ ET JAMAIS EN JAUNE. Le jaune est la voix de la CONSIGNE — ce qu'il
      // reste à faire. Un constat en jaune se lirait comme une prescription
      // qu'on aurait déjà remplie.
      var constat = !vue.programme && vue.constat ? vue.constat(x.slug, x._iExo) : null;
      if (constat) {
        entree.appendChild(el('div', 'constat', constat.verdict));
        if (constat.suite) entree.appendChild(el('div', 'constat-suite', constat.suite));
        // MOTEUR §14.5 (49-U15) — au silence de l'escalier, la phrase du
        // compteur, une fois, dans le constat — sans alarme.
        if (constat.escalier) entree.appendChild(el('div', 'constat-suite constat-escalier', constat.escalier));
        // 193-1 — « Tes reculs tiennent 6-6-6. » (un fait, du plan).
        if (constat.reculs) entree.appendChild(el('div', 'constat-suite constat-reculs', constat.reculs));
        if (constat.auMax) entree.appendChild(el('div', 'constat-suite constat-au-max', constat.auMax));
      }
      // §7 quindecies.3 (52-1) — DANS L'ÉDITEUR, CE QUE DEVIENT LA CHARGE, en
      // gris : un point de départ la première fois, le coach seul ensuite.
      var cpx = vue.programme && vue.chargeProgramme ? vue.chargeProgramme(x.slug) : null;
      if (cpx) entree.appendChild(el('div', 'consigne-dit charge-programme', texteChargeProgramme(cpx)));
      // 197 (MOTEUR §9.36) — la consigne de puissance des 65 ans et plus, posée par le plan (un fait du plan, pas un calcul d'écran).
      var pu = !vue.programme && vue.puissance ? vue.puissance(x.slug) : null;
      if (pu) {
        var lp = el('div', 'consigne-dit puissance', pu.texte);
        lp.setAttribute('data-puissance', '1');
        if (pu.pourquoi) lp.title = pu.pourquoi;
        entree.appendChild(lp);
      }
      var lib = constat ? null : (!vue.programme && vue.libelles ? vue.libelles(x.slug, x._iExo) : null);
      if (lib) {
        // §3.10 — TOUCHER LA CONSIGNE OUVRE LE CALCUL. Les lignes jaunes comme
        // la phrase grise, et le silence compris : « pourquoi rien ? » est la
        // question qu'on se pose le plus. Chaque ligne porte le geste plutôt
        // qu'un conteneur autour d'elles — l'ordre des enfants de la légende
        // est une règle du §3.1, et l'envelopper la changerait pour rien.
        var tapable = function (n) {
          if (!vue.surPourquoi || !x.slug) return n;
          n.setAttribute('role', 'button');
          n.tabIndex = 0;
          n.addEventListener('click', function () { vue.surPourquoi(x.slug); });
          return n;
        };
        // 154 — « garde-en N » : l'étiquette de la réserve visée, UNE FOIS, au bout de la première ligne de la consigne.
        var gardeEn = !vue.programme && typeof vue.reserveVisee === 'function' ? vue.reserveVisee(x._iExo) : null;
        (lib.jaune || []).forEach(function (l, iJ) {
          var ligneJ = consigneVivante(l, iJ);
          // Un attribut, rendu par CSS (`::after`) : le texte de la consigne reste celui du moteur, mot pour mot.
          if (iJ === 0 && gardeEn !== null && gardeEn !== undefined) ligneJ.setAttribute('data-garde', 'garde-en\u00a0' + gardeEn);
          // 175 — « un cran de moins » : le badge du recul, au bout du chiffre du jour (couleur --donnees) ; la phrase lue le dit aussi.
          if (iJ === 0 && !vue.programme && typeof vue.cranDeMoins === 'function') {
            var recul = vue.cranDeMoins(x._iExo);
            if (recul && ligneJ.classList.contains('consigne-heros')) {
              ligneJ.appendChild(el('span', 'badge-recul', recul));
              ligneJ.setAttribute('aria-label', (ligneJ.getAttribute('aria-label') || '') + ' ' + recul);
            }
          }
          entree.appendChild(tapable(ligneJ));
        });
        if (lib.gris) entree.appendChild(tapable(el('div', 'consigne-dit', lib.gris)));
        // 187 (MOTEUR §9.21 bis) — « Ta charge habituelle ? » : une réponse facultative, ou « Je ne sais pas ».
        var hab = !vue.programme && typeof vue.habituelle === 'function' ? vue.habituelle(x._iExo) : null;
        if (hab) entree.appendChild(blocHabituelle(hab));
        // 163 (MOTEUR §10.2 bis) — UNE CHARGE JAMAIS FAITE : « ≈ 35 kg : vise la charge la plus proche que ta machine
        // permet… », sous la ligne, lue sur le plan (jamais rédigée ici).
        if (lib.approchee) entree.appendChild(tapable(el('div', 'consigne-dit approchee', lib.approchee)));
        // §12.9 (49-U13) — le compteur de stagnation, à 4 séances ou plus : une
        // seconde ligne grise, lue sur le plan (`lib.compteur`), jamais calculée ici.
        if (lib.compteur) entree.appendChild(tapable(el('div', 'consigne-dit compteur', lib.compteur)));
        // MOTEUR §13.6 (49-U20) — « Pendant ce temps, … » : le frère qui
        // progresse, en gris, après le compteur. Lu sur le plan.
        if (lib.frere) entree.appendChild(tapable(el('div', 'consigne-dit frere', lib.frere)));
        // MOTEUR §14.7 (49-U17) — « une série de plus, jusqu'à ton prochain progrès ».
        if (lib.plus) entree.appendChild(tapable(el('div', 'consigne-dit serie-de-plus', lib.plus)));
        // 189 — « 3 séries au lieu de 4, pendant ta sèche » (ou « 2 séries, comme ta routine »).
        if (lib.moins) entree.appendChild(tapable(el('div', 'consigne-dit serie-de-moins', lib.moins)));
        // 174 — la 4e marche : « une série de moins, sans dégressive, jusqu'à ton prochain progrès », ou le rappel d'une marche refusée.
        if (lib.alleger) entree.appendChild(tapable(el('div', 'consigne-dit alleger-en-cours', lib.alleger)));
        // 175 — le tempo lent en cours (le levier accepté au plafond) : « 3 s en descente, jusqu'à ton prochain progrès ».
        if (lib.tempo) entree.appendChild(tapable(el('div', 'consigne-dit tempo-en-cours', lib.tempo)));
      }
      // 99 (MOTEUR §9.24) — un exercice ajouté pour cette semaine seulement : « ajouté : séance manquée de mardi ».
      if (x.ajout) entree.appendChild(el('div', 'consigne-dit ajout-semaine', 'ajouté : ' + x.ajout));
      entree.appendChild(reglagesExo(x, vue));

      tete.appendChild(entree);
    });
    return tete;
  }

  function blocHabituelle(hab) {
    var b = el('div', 'habituelle');
    b.appendChild(el('div', 'habituelle-q', hab.question));
    var champ = el('input', 'habituelle-champ');
    champ.type = 'text';
    champ.setAttribute('inputmode', 'decimal');
    champ.setAttribute('autocomplete', 'off');
    champ.setAttribute('aria-label', hab.question);
    var ligne = el('div', 'habituelle-saisie');
    ligne.appendChild(champ);
    ligne.appendChild(el('span', 'habituelle-unite', 'kg'));
    var ok = el('button', 'principal habituelle-ok', 'Valider');
    ok.type = 'button';
    ok.addEventListener('click', function () { hab.surValider(champ.value); });
    ligne.appendChild(ok);
    b.appendChild(ligne);
    if (hab.pour) b.appendChild(el('div', 'consigne-dit', hab.pour));
    var passer = el('button', 'discret habituelle-passer', hab.passer);
    passer.type = 'button';
    passer.addEventListener('click', function () { hab.surPasser(); });
    b.appendChild(passer);
    return b;
  }

  // 173 (refonte « Vivant », 25/10/2026) — LA CONSIGNE EN HÉROS. Le texte du coach ne change pas d'un mot : « Aujourd'hui : 105 kg × 5. »
  // reste dans le DOM (textContent identique, lu en entier par les lecteurs d'écran, `aria-label` compris) ; on le découpe en
  // <span> pour que la charge et les reps prennent la taille du chiffre du jour. L'étiquette « AUJOURD'HUI » est dessinée par CSS
  // (le mot « Aujourd'hui : » reste présent, hors de vue). Les autres formes gardent leur phrase, en plus grand.
  // Correctif 173 : le héros vaut pour TOUTE ligne de consigne qui commence par un chiffre (« 102,5 kg × 9 », « Aujourd'hui : 105 kg × 5. »,
  // « ≈ 35 kg × 8 », « 45 s », « 1 min 30 »…) ; l'étiquette AUJOURD'HUI n'existe que là où la phrase « Aujourd'hui : » existait déjà.
  var RE_FOIS = /^(Aujourd'hui\s:\s)?((?:≈\s)?\d[\d,.]*)(\skg\s×\s)(\d+)([\s\S]*)$/;
  var RE_NOMBRE = /^(Aujourd'hui\s:\s)?((?:≈\s)?\d[\d,.]*)([\s\S]*)$/;
  var RE_SI_CA_PASSE = /^(Si ça passe,\s)((?:≈\s)?[\d,.]+\skg\s×\s\d+)(.*)$/;
  function consigneVivante(l, iJ) {
    var m = RE_FOIS.exec(l), n = m ? null : RE_NOMBRE.exec(l);
    if (m || n) {
      var h = el('div', 'consigne consigne-heros' + ((m || n)[1] ? ' avec-mot' : ''));
      h.setAttribute('aria-label', l);
      var mot = (m || n)[1];
      if (mot) h.appendChild(el('span', 'c-mot', mot));
      var groupe = el('span', 'c-chiffre');
      if (m) {
        groupe.appendChild(el('span', 'c-charge', m[2]));
        groupe.appendChild(el('span', 'c-kg', m[3]));
        groupe.appendChild(el('span', 'c-reps', m[4]));
      } else {
        groupe.appendChild(el('span', 'c-charge', n[2]));
        if (n[3]) groupe.appendChild(el('span', 'c-kg', n[3]));
      }
      h.appendChild(groupe);
      var reste = m ? m[5] : '';
      if (reste) h.appendChild(el('span', reste === '.' ? 'c-point' : 'c-reste', reste));
      return h;
    }
    var sp = iJ > 0 ? RE_SI_CA_PASSE.exec(l) : null;
    if (sp) {
      var b = el('div', 'consigne si-ca-passe');
      b.appendChild(el('span', '', sp[1]));
      b.appendChild(el('b', 'sp-chiffre', sp[2]));
      if (sp[3]) b.appendChild(el('span', '', sp[3]));
      return b;
    }
    if (iJ > 0 && /^Si ça passe,/.test(l)) return el('div', 'consigne si-ca-passe', l);
    return el('div', 'consigne consigne-grande', l);
  }

  // ⚠️ PAS DE `stopPropagation` ICI. Le seul parent qui écoute le clic est un
  // bloc EN SÉLECTION — et dans ce mode le menu n'est pas rendu du tout. Une
  // garde contre un cas qui n'existe pas est une garde qu'aucune mutation ne
  // peut tuer : elle a l'air de protéger, elle ne protège rien.
  function menuTroisPoints(titre, surClic) {
    var b = el('button', 'menu-pts', '\u22ef');
    b.type = 'button';
    b.setAttribute('aria-label', titre);
    b.title = titre;
    b.addEventListener('click', function () { surClic(); });
    return b;
  }

  // ⚠️ LES DEUX RÉGLAGES DE L'EXERCICE, SOUS SON NOM (§7 septies.1 et .2).
  //
  // Pas de suggestion de charge : le moteur ne parle pas encore, et inventer un
  // chiffre serait pire que de n'en montrer aucun (§3.3). Ces deux-là ne
  // suggèrent rien, ils portent ce que l'utilisateur a déclaré.
  //
  // Dans un superset, ils sont PAR BRANCHE : chaque exercice a son repos et sa
  // note. Les mettre en tête de bloc aurait mélangé deux exercices sous un seul
  // réglage.
  function reglagesExo(x, vue) {
    var reglages = el('div', 'reglages-exo');

    // Le repos s'affiche MÊME ABSENT, en tiret cadratin : sans ça, il n'y aurait
    // rien à toucher pour en poser un, et le seul chemin serait l'éditeur de
    // routine — c'est-à-dire pas pendant la séance.
    var bRepos = el('button', 'repos-cible num',
      'repos ' + (x.repos_cible_s ? mmss(x.repos_cible_s) : '—'));
    bRepos.type = 'button';
    bRepos.setAttribute('aria-label', 'Repos cible de ' + x.nom);
    bRepos.addEventListener('click', function () { vue.surRepos(x._iExo); });
    reglages.appendChild(bRepos);

    // 193-3 (maquette de l'ondulation, écran 1) — DANS L'ÉDITEUR DE ROUTINE : la zone que la routine fixe à l'exercice ce jour-là,
    // « Automatique » sinon (le coach la lit dans les séances). Absent en séance (`surZoneRoutine` n'y est pas posé).
    if (typeof vue.surZoneRoutine === 'function') {
      var nomZone = x.zone_routine && typeof vue.libelleDeZone === 'function' ? vue.libelleDeZone(x.zone_routine) : 'Automatique';
      var bZone = el('button', 'zone-routine' + (x.zone_routine ? ' fixee' : ''), 'zone\u00a0: ' + nomZone);
      bZone.type = 'button';
      bZone.setAttribute('aria-label', 'Zone de ' + x.nom + ' dans cette routine\u00a0: ' + nomZone);
      bZone.addEventListener('click', function () { vue.surZoneRoutine(x._iExo); });
      reglages.appendChild(bZone);
    }

    var bNote = el('button', 'note-exo' + (x.note ? ' pleine' : ''),
      x.note || '+ Note');
    bNote.type = 'button';
    bNote.setAttribute('aria-label',
      (x.note ? 'Modifier la note de ' : 'Ajouter une note à ') + x.nom);
    bNote.addEventListener('click', function () { vue.surNote(x._iExo); });
    reglages.appendChild(bNote);

    return reglages;
  }

  // ⚠️ LES DEUX COLONNES QUI TOMBENT EN MODE PROGRAMME (§7 quindecies.2) :
  // `PRÉC.` et la coche. La première dit ce qui a été fait la fois d'avant,
  // la seconde ce qui vient d'être fait — deux observations, et une routine
  // n'observe rien. `EFFORT` tombe avec elles pour la même raison, et parce
  // que `routine_sets` n'a pas de colonne où le mettre.
  function enTetesColonnes(g, programme, chargeProgramme) {
    var noms = colonnesDe(g);
    var champs = noms.map(function (n) { return M().champDeMesure(n); });
    var cp = programme ? chargeProgramme : null;
    var sansCharge = !!cp && !cp.depart;
    var entetes = el('div', 'cols-seance' + classeDeGrille(g) +
      (programme ? ' programme' : '') + (sansCharge ? ' sans-charge' : ''));
    entetes.appendChild(el('span', '', ''));
    if (!programme) entetes.appendChild(el('span', 'droite', 'PRÉC.'));
    champs.forEach(function (c, i) {
      if (sansCharge && noms[i] === 'charge_kg') return;
      // §9.17 — la nature de la charge nomme la colonne (« LEST (KG) », « AIDE (KG) »).
      var surcharge = g.entetes && g.entetes[noms[i]];
      // §7 quindecies.3 (52-1) — la charge de départ, sur un exercice jamais fait.
      if (!surcharge && cp && cp.depart && noms[i] === 'charge_kg') surcharge = 'DÉPART (KG)';
      entetes.appendChild(el('span', 'centre', surcharge || c.entete));
    });
    if (g.effort && !programme) entetes.appendChild(el('span', 'centre', 'EFFORT'));
    entetes.appendChild(el('span', 'centre', ''));
    return entetes;
  }

  // Une rangée de saisie. `s` vient de `blocsDeSeance` : c'est une COPIE de la
  // série, qui porte en plus son étiquette, son tour, et les indices `_iExo` /
  // `_iSerie` qui la rebranchent sur le modèle. L'affichage est entrelacé, le
  // modèle reste rangé par exercice — les indices sont le pont entre les deux.
  // Les séries de l'exercice auquel CETTE ligne appartient, dans l'ordre du
  // modèle. L'affichage d'un superset est entrelacé — la ligne voisine n'est pas
  // du même exercice — mais `construireBlocs` garde les séries d'un exercice
  // triées par rang, et `_iSerie` indexe cette liste-là.
  //
  // ⚠️ ON IDENTIFIE PAR `_iExo`, PAS PAR LE SLUG : le même exercice peut occuper
  // deux entrées distinctes de la séance, et les confondre mélangerait leurs
  // antécédents.
  function seriesDeSonExercice(bloc, s) {
    var liste = (bloc && bloc.exercices) || [];
    for (var i = 0; i < liste.length; i++) {
      var ser = liste[i].series || [];
      if (ser.length && ser[0]._iExo === s._iExo) return ser;
    }
    return null;
  }

  // Un champ en plus, sous la série (ECRAN §3 ter.5) : « Dénivelé + (facultatif) », la case et
  // son unité. Le même champ que la grille (`champSerie`, sa borne comprise), sans fantôme.
  function ligneEnPlus(s, nom, vue) {
    var c = M().champDeMesure(nom);
    var iExo = s._iExo, iSerie = s._iSerie;
    var n = el('div', 'serie-plus');
    n.setAttribute('data-iexo', iExo);
    n.setAttribute('data-iserie', iSerie);
    var k = el('span', 'serie-plus-k', (c.texte || c.entete) + ' ');
    k.appendChild(el('small', null, '(facultatif)'));
    n.appendChild(k);
    var caseSerie = champSerie('rp-serie num', s[c.cle], null, c.unite,
      function (v) { vue.surChamp(iExo, iSerie, nom, v); },
      { max: M().maxDeSaisie(nom),
        surQuitte: typeof vue.surChampQuitte === 'function'
          ? function () { vue.surChampQuitte(iExo, iSerie); } : null });
    caseSerie.setAttribute('data-champ', nom);
    n.appendChild(caseSerie);
    return n;
  }

  // 154 — les puces de l'effort visé (0 · 1 · 2 · 3 et + · Passer) ou la phrase d'après. `ef` : `{ cle, demande, phrase,
  // surChoix, surPasser }`. « Passer » n'écrit rien.
  var PUCES_EFFORT = [['reste_0', '0'], ['reste_1', '1'], ['reste_2', '2'], ['reste_3_plus', '3 et +']];
  function effortViseDeSerie(ef) {
    var n = el('div', 'effort-vise');
    n.setAttribute('data-cle', String(ef.cle));
    if (ef.demande) {
      n.appendChild(el('span', 'effort-vise-q', 'Il t’en restait combien ?'));
      var rang = el('span', 'effort-vise-b');
      PUCES_EFFORT.forEach(function (r) {
        var b = el('button', 'effort-puce', r[1]);
        b.type = 'button';
        b.setAttribute('data-ressenti', r[0]);
        b.addEventListener('click', function () { ef.surChoix(r[0]); });
        rang.appendChild(b);
      });
      var passer = el('button', 'effort-puce passer', 'Passer');
      passer.type = 'button';
      passer.setAttribute('data-passer', '1');
      passer.addEventListener('click', function () { ef.surPasser(); });
      rang.appendChild(passer);
      n.appendChild(rang);
    } else if (ef.phrase) {
      n.appendChild(el('span', 'effort-vise-dit', ef.phrase));
    }
    return n;
  }

  // MOTEUR §9.23 (55-1) — la médaille : le rond, le gras, le gris (maquette
  // « La médaille »). Le texte vient de `phraseDeRecord`.
  function pastilleMedaille() {
    var m = el('span', 'medaille');
    m.setAttribute('aria-hidden', 'true');
    return m;
  }
  // 185 — LA QUESTION SOUS LA SÉRIE (maquette-saisie-vraisemblance-v1) : le texte de la règle, ses boutons (44 px au moins, le
  // principal en ambre), jamais une fenêtre. `qs` : `{ texte, genre, mode, refus, boutons: [{ texte, principal }] }`.
  function questionDeSaisie(qs, iExo, iSerie, surBouton) {
    var n = el('div', 'question-saisie' + (qs.mode === 'record' ? ' record' : '') + (qs.refus ? ' refus' : ''));
    n.setAttribute('role', qs.refus ? 'alert' : 'group');
    n.setAttribute('data-iexo', iExo);
    n.setAttribute('data-iserie', iSerie);
    n.setAttribute('data-genre', qs.genre);
    n.appendChild(el('p', 'qs-texte', qs.texte));
    if (qs.boutons && qs.boutons.length) {
      var bs = el('div', 'qs-boutons');
      qs.boutons.forEach(function (b, k) {
        var bt = el('button', 'qs-bouton' + (b.principal ? ' principal' : ''), b.texte);
        bt.type = 'button';
        bt.addEventListener('click', function () { if (typeof surBouton === 'function') surBouton(iExo, iSerie, k); });
        bs.appendChild(bt);
      });
      n.appendChild(bs);
    }
    return n;
  }
  // La LIGNE de la série (`.ligne-serie`, qui porte la rangée et son fond de glissement) : la question s'insère après elle.
  function ligneDeSerie(racine, iExo, iSerie) {
    var r = racine ? racine.querySelector('.serie[data-iexo="' + iExo + '"][data-iserie="' + iSerie + '"]') : null;
    return r ? (r.closest('.ligne-serie') || r) : null;
  }
  function retirerQuestion(racine, iExo, iSerie) {
    var r = ligneDeSerie(racine, iExo, iSerie);
    if (!r) return;
    var champs = r.querySelectorAll('.doute');
    for (var i = 0; i < champs.length; i++) champs[i].classList.remove('doute');
    var q = r.nextSibling;
    while (q && q.nodeType === 1 && q.classList.contains('question-saisie')) {
      var suivant = q.nextSibling;
      q.parentNode.removeChild(q);
      q = suivant;
    }
  }
  // Sans redessiner : le refus des reps se pose pendant la frappe, le focus reste dans le champ.
  function montrerQuestion(racine, iExo, iSerie, qs, surBouton) {
    var r = ligneDeSerie(racine, iExo, iSerie);
    if (!r || !qs) return false;
    retirerQuestion(racine, iExo, iSerie);
    r.parentNode.insertBefore(questionDeSaisie(qs, iExo, iSerie, surBouton), r.nextSibling);
    var champ = qs.champ ? r.querySelector('[data-champ="' + qs.champ + '"]') : null;
    if (champ) champ.classList.add('doute');
    return true;
  }
  // « Corriger » : le curseur revient dans le champ.
  function focusChamp(racine, iExo, iSerie, nom) {
    var r = ligneDeSerie(racine, iExo, iSerie);
    var champ = r && r.querySelector('[data-champ="' + nom + '"]');
    var input = champ && champ.querySelector('input');
    if (!input) return false;
    input.focus();
    if (typeof input.select === 'function') input.select();
    return true;
  }

  function medailleDeSerie(phrase) {
    var n = el('div', 'record-serie');
    n.appendChild(pastilleMedaille());
    var t = el('div', 'record-texte');
    t.appendChild(el('b', null, phrase[0]));
    if (phrase[1]) t.appendChild(el('div', 'record-avant', phrase[1]));
    n.appendChild(t);
    return n;
  }

  // La phrase du coach. `propose` en couleur du coach ; `tenue` et `haut` en
  // blanc, précédés de la coche verte ; `pas_encore` en gris. Le texte vient
  // de `phraseReaction` — le rendu n'en écrit pas un mot.
  function phraseDeReaction(message, debutTour) {
    var n = el('div', 'reaction-serie ' + message.type + (debutTour ? ' debut-tour' : ''));
    if (message.type === 'tenue' || message.type === 'haut') {
      var v = svg('svg', 'coche-verte', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
      v.appendChild(svg('path', null, { d: 'M5 13l4 4L19 7' }));
      n.appendChild(v);
    }
    n.appendChild(doc.createTextNode(message.phrase || ''));
    return n;
  }

  // MOTEUR §14.4 (49-U14) — L'ESCALIER EN TÊTE DE LA SÉANCE. Trois états,
  // jamais deux à la fois, tous LUS sur le plan : la carte de la semaine
  // allégée (« Alléger 7 jours », « Non merci ») ; le bandeau de la période ;
  // le bandeau d'un instant après un refus. Sinon, rien.
  function rendreEscalier(cible, vue) {
    if (!cible) return cible;
    vider(cible);
    var v = vue || {};
    // 198 (MOTEUR §9.34) — la baisse attendue en sèche : une phrase, sans geste, quand aucune carte ne parle.
    if (v.attendue && !v.carte) {
      var att = el('div', 'carte-escalier ce-attendue');
      att.appendChild(el('p', 'ce-titre', v.attendue.titre));
      att.appendChild(el('p', 'ce-phrase', v.attendue.phrase));
      cible.appendChild(att);
    }
    if (v.carte) {
      var c = el('div', 'carte-escalier');
      // 189 (MOTEUR §14.11) — la carte de BAISSE a un titre ; le blocage généralisé n'en a pas.
      if (v.carte.titre) c.appendChild(el('p', 'ce-titre', v.carte.titre));
      c.appendChild(el('p', 'ce-phrase', v.carte.phrase));
      c.appendChild(el('p', 'ce-detail', v.carte.detail));
      var gestes = el('div', 'ce-gestes');
      var oui = el('button', 'ce-alleger', v.carte.oui || 'Alléger');   // 179 (B-B4) : le libellé vient du plan, avec la durée de la règle
      oui.type = 'button';
      oui.addEventListener('click', function () { v.surAlleger(); });
      gestes.appendChild(oui);
      // 189 — en sèche, une 3ᵉ réponse : garder un peu moins de volume jusqu'à la fin de la sèche.
      if (v.carte.serieDeMoins) {
        var moins = el('button', 'ce-moins', v.carte.serieDeMoins);
        moins.type = 'button';
        moins.addEventListener('click', function () { v.surSerieDeMoins(); });
        gestes.appendChild(moins);
      }
      var non = el('button', 'ce-refuser', 'Non merci');
      non.type = 'button';
      non.addEventListener('click', function () { v.surRefuser(); });
      gestes.appendChild(non);
      c.appendChild(gestes);
      // 189 — « Pourquoi ? » : la table par exercice, les stables, les exercices pas comptés et la méthode, au toucher.
      var pq = v.carte.pourquoi;
      if (pq) {
        var det = el('details', 'ce-pourquoi');
        det.appendChild(el('summary', null, 'Pourquoi ?'));
        det.appendChild(el('h3', 'ce-pq-titre', pq.titre));
        var tab = el('table', 'ce-pq-table');
        var tr0 = el('tr', 'ce-pq-tete');
        (pq.entete || []).forEach(function (t, i) { tr0.appendChild(el(i === 0 ? 'td' : 'td', null, t)); });
        tab.appendChild(tr0);
        (pq.lignes || []).forEach(function (l) {
          var tr = el('tr');
          tr.setAttribute('data-exercice', l.nom);
          tr.appendChild(el('td', null, l.nom));
          tr.appendChild(el('td', null, l.avant));
          tr.appendChild(el('td', 'ce-pq-bas', l.apres));
          tab.appendChild(tr);
        });
        if (pq.stables) {
          var trS = el('tr', 'ce-pq-note');
          trS.appendChild(el('td', null, 'Stables ou en hausse'));
          var tdS = el('td', null, pq.stables);
          tdS.colSpan = 2;
          trS.appendChild(tdS);
          tab.appendChild(trS);
        }
        if (pq.pasComptes) {
          var trP = el('tr', 'ce-pq-note');
          trP.appendChild(el('td', null, 'Pas comptés'));
          var tdP = el('td', null, pq.pasComptes);
          tdP.colSpan = 2;
          trP.appendChild(tdP);
          tab.appendChild(trP);
        }
        det.appendChild(tab);
        det.appendChild(el('p', 'ce-detail', pq.methode));
        c.appendChild(det);
      }
      cible.appendChild(c);
    } else if (v.allegee && v.allegee.bandeau) {
      cible.appendChild(el('div', 'bandeau-allegee', v.allegee.bandeau));
    } else if (v.serieDeMoins) {
      // 189 — « Pendant ta sèche : une série de moins par exercice… » et son geste, qui l'arrête.
      var bm = el('div', 'bandeau-allegee bandeau-moins');
      bm.appendChild(doc.createTextNode(v.serieDeMoins.bandeau + ' '));
      var rev = el('button', 'discret ce-revenir', v.serieDeMoins.libelle);
      rev.type = 'button';
      rev.addEventListener('click', function () { v.surRevenir(); });
      bm.appendChild(rev);
      cible.appendChild(bm);
    } else if (v.refus) {
      cible.appendChild(el('div', 'bandeau-allegee refus', v.refus));
    }
    cible.hidden = !cible.firstChild;
    return cible;
  }

  // LA PROPOSITION D'EXERCICE (MOTEUR §9.15.2 ; généralisée en 49-U15) : un
  // texte, un détail facultatif, deux libellés, deux gestes — sous le nom de
  // l'exercice, au-dessus de sa première série. La proposition de chauffes et
  // la carte de schéma (§14.5) en sont deux usages. Les textes viennent du
  // plan ; ce composant n'en écrit aucun.
  // `p` : `{ classe, texte, detail, oui, non, classeOui, classeNon, surOui, surNon }`.
  function propositionDExercice(p, iExo) {
    var n = el('div', 'proposition-exercice ' + (p.classe || ''));
    n.setAttribute('data-iexo', String(iExo));
    n.appendChild(el('div', 'pc-texte', p.texte));
    if (p.detail) n.appendChild(el('div', 'pc-detail', p.detail));
    var gestes = el('div', 'pc-gestes');
    // §9.20 — la carte de reprise a TROIS choix : la même carte, une liste de
    // gestes au lieu de la paire oui / non.
    if (p.gestes) {
      gestes.classList.add('pc-choix');
      p.gestes.forEach(function (g, k) {
        var b = el('button', (k === 0 ? 'pc-ajouter' : 'pc-refuser') + (g.classe ? ' ' + g.classe : ''), g.texte);
        b.type = 'button';
        b.addEventListener('click', function () { g.surClic(); });
        gestes.appendChild(b);
      });
      n.appendChild(gestes);
      return n;
    }
    var oui = el('button', 'pc-ajouter' + (p.classeOui ? ' ' + p.classeOui : ''), p.oui);
    oui.type = 'button';
    oui.addEventListener('click', function () { p.surOui(); });
    var non = el('button', 'pc-refuser' + (p.classeNon ? ' ' + p.classeNon : ''), p.non);
    non.type = 'button';
    non.addEventListener('click', function () { p.surNon(); });
    gestes.appendChild(oui);
    gestes.appendChild(non);
    n.appendChild(gestes);
    return n;
  }

  // MOTEUR §9.20 (51-3) — LA CARTE DE REPRISE après une séance douloureuse :
  // le titre, la phrase et les choix viennent du plan (`x.carteReprise`), sans
  // question. Le MÊME composant que les autres propositions d'exercice.
  function propositionDeReprise(carte, iExo, vue) {
    return propositionDExercice({
      classe: 'proposition-reprise', texte: carte.titre, detail: carte.phrase,
      gestes: (carte.choix || []).map(function (q) {
        return { texte: q.texte, classe: 'pr-' + q.cle, surClic: function () { vue.surReprise(iExo, q.cle); } };
      })
    }, iExo);
  }

  // 193-6 (MOTEUR §9.30) — la carte « Dernière série au max ? » : le titre et la phrase viennent du plan, les trois gestes aussi
  // (« Oui, dans ma routine », « Juste aujourd’hui », « Non merci »). Le MÊME composant que la reprise.
  var CLES_AU_MAX = ['routine', 'aujourdhui', 'non'];
  function propositionDAuMax(carte, iExo, vue) {
    return propositionDExercice({
      classe: 'proposition-au-max', texte: carte.titre, detail: carte.phrase,
      gestes: (carte.boutons || []).map(function (texte, k) {
        return { texte: texte, classe: 'pam-' + CLES_AU_MAX[k], surClic: function () { vue.surAuMax(iExo, CLES_AU_MAX[k]); } };
      })
    }, iExo);
  }

  // 193-4 (MOTEUR §9.32) — LA SEMAINE DE TEST dans la séance : la barre testée aujourd'hui (la montée, la consigne, le « Pourquoi », la
  // mesure, les gestes) et, sur un accessoire, une ligne. Tout vient du plan (`vue.semaineDeTest`) ; rien n'est recalculé ici.
  var ARRETS_DU_TEST = { mal: 'Tu as mal : on ne teste pas ce mouvement.', sans_marge: 'Ton premier essai n’a rien laissé : on s’arrête là, ton max du jour est lu sur lui.',
    rate: 'Un essai raté : on s’arrête là.', technique: 'La technique lâche : on s’arrête là.', sans_cran: 'Rien de plus lourd à ta salle : on s’arrête là.' };
  function carteDeTest(t, iExo, vue) {
    var M = function () { return racine.THModele; };
    // 200-2 — une barre que la semaine de test ne mesure pas CE JOUR-LÀ (une autre barre l'est) : ni « accessoire » ni test.
    if (t.pasDeTest) return el('div', 'proposition-exercice proposition-test-acc', 'Pas de test pour ce mouvement aujourd\u2019hui\u00a0: s\u00e9ance l\u00e9g\u00e8re.');
    if (t.accessoire) {
      return el('div', 'proposition-exercice proposition-test-acc', t.garde
        ? 'Semaine de test : cet accessoire reste léger, sans aller au bout.' : 'Semaine de test : tu peux passer cet accessoire.');
    }
    var n = el('div', 'proposition-exercice proposition-test');
    n.setAttribute('data-iexo', String(iExo));
    n.appendChild(el('div', 'pc-texte', 'Semaine de test · ' + (t.mode === 'max' ? 'viser ton max' : 'série au max')));
    if (t.etat === 'sans_max') {
      n.appendChild(el('div', 'pc-detail', 'Pas assez de séries pour estimer ton max : ce mouvement se fait comme d’habitude.'));
      return n;
    }
    if (t.montee && t.montee.length && t.etat === 'a_faire') {
      n.appendChild(el('div', 'pc-detail test-montee', 'Montée : ' + t.montee.map(function (m) { return M().chargeFois(m.charge, m.reps); }).join(' · ')));
    }
    if (t.consigne) n.appendChild(el('div', 'pc-detail test-consigne', t.consigne.texte));
    if (t.arret) n.appendChild(el('div', 'pc-detail test-arret', ARRETS_DU_TEST[t.arret] || 'On s’arrête là.'));
    if (t.mesure) n.appendChild(el('div', 'pc-detail test-mesure', 'Mesuré : ' + M().chargeFois(t.mesure.charge, t.mesure.reps) +
      (t.mesure.vrai ? '' : ', max lu ' + nombreFr(Math.round(t.mesure.valeur)) + ' kg') + '.'));
    if (t.pourquoi && t.etat === 'a_faire') n.appendChild(el('div', 'pc-detail test-pourquoi', t.pourquoi.texte));
    var gestes = el('div', 'pc-gestes pc-choix');
    var bouton = function (classe, texte, cle) {
      var b = el('button', 'pc-refuser ' + classe, texte);
      b.type = 'button';
      b.addEventListener('click', function () { vue.surTest(iExo, cle); });
      gestes.appendChild(b);
    };
    var enCours = t.etat === 'a_faire' || t.etat === 'en_cours';
    if (t.ajout) bouton('pt-ajouter', t.ajout.suite ? 'Ajouter l’essai suivant' : 'Ajouter ces lignes', 'ajouter');
    if (t.videsPosees) bouton('pt-annuler', 'Annuler les lignes', 'annuler_lignes');
    if (enCours && !(t.essais && t.essais.length)) {
      bouton('pt-mode', t.mode === 'max' ? 'Plutôt une série au max' : 'Plutôt viser mon max', t.mode === 'max' ? 'mode_serie' : 'mode_max');
    }
    if (enCours && t.mode === 'max' && t.essais && t.essais.length) bouton('pt-arret', 'Arrêter le test', 'arret');
    if (enCours && !(t.essais && t.essais.length)) bouton('pt-pas', 'Pas aujourd’hui', 'pas_aujourdhui');
    if (gestes.childNodes.length) n.appendChild(gestes);
    return n;
  }

  // 193-4 — LA FEUILLE « SEMAINE DE TEST » du Profil : l'état, la façon barre par barre, lancer / annuler.
  function rendreFeuilleSemaineDeTest(cible, vue) {
    vider(cible);
    cible.appendChild(el('div', 'feuille-t', 'Semaine de test'));
    if (vue.phrase) cible.appendChild(el('p', 'feuille-aide', vue.phrase));
    var menu = el('div', 'feuille-menu');
    (vue.barres || []).forEach(function (b) {
      var autre = b.mode === 'max' ? 'serie' : 'max';
      var etat = b.mesure ? (b.mesure.valeur !== null && b.mesure.valeur !== undefined
        ? 'mesuré ' + nombreFr(Math.round(b.mesure.valeur * 10) / 10) + ' kg' : 'pas testé') : (b.mode === 'max' ? 'viser mon max' : 'série au max');
      entreeMenu(menu, b.nom + ' · ' + etat, b.mesure ? { desactive: true } : { surClic: function () { vue.surMode(b.slug, autre); } });
    });
    if (vue.peutLancer) entreeMenu(menu, vue.libelleLancer || 'Faire une semaine de test', { surClic: vue.surLancer });
    if (vue.actif) entreeMenu(menu, 'Annuler la semaine de test', { surClic: vue.surAnnuler });
    entreeMenu(menu, 'Fermer', { surClic: vue.surFermer });
    cible.appendChild(menu);
    return cible;
  }

  // 193-4 — LE BILAN DE FIN DE SEMAINE en tête de Saisie : « avant → mesuré », l'objectif « Pas encore », « Compris ».
  function carteBilanTest(k, v) {
    var c = el('div', 'carte-fin-bloc carte-bilan-test');
    c.appendChild(el('p', 'cfb-titre', k.titre));
    var l = el('div', 'cfb-bilan');
    k.lignes.forEach(function (x) { l.appendChild(el('p', 'cfb-ligne', x)); });
    c.appendChild(l);
    (k.objectifs || []).forEach(function (x) { c.appendChild(el('p', 'cfb-paris', x)); });
    var gestes = el('div', 'cfb-gestes');
    var b = el('button', 'cfb-commencer', 'Compris');
    b.type = 'button';
    b.addEventListener('click', function () { if (v.surCompris) v.surCompris(); });
    gestes.appendChild(b);
    c.appendChild(gestes);
    return c;
  }

  // MOTEUR §9.15.3 (94) — « En faire une série normale » / « La retirer ».
  var TEXTES_GESTES_DEGRESSIVE = { serie_normale: 'En faire une série normale', retirer: 'La retirer' };
  function propositionDeDegressiveVide(m, iExo, iSerie, vue) {
    return propositionDExercice({
      classe: 'proposition-degressive', texte: m.phrase,
      gestes: m.gestes.map(function (g) {
        return { texte: TEXTES_GESTES_DEGRESSIVE[g], classe: 'pd-' + g, surClic: function () { vue.surDegressiveVide(iExo, iSerie, g); } };
      })
    }, iExo);
  }

  // MOTEUR §9.15.2 (49-U10) — « Chauffe : 20 kg × 10 · 60 kg × 6 … », avec
  // « Ajouter » et « Non merci ». Le texte vient du plan (`chauffesDe`).
  function propositionDeChauffes(pc, iExo, vue) {
    return propositionDExercice({
      classe: 'proposition-chauffes', texte: pc.phrase, oui: 'Ajouter', non: 'Non merci',
      surOui: function () { vue.surAjouterChauffes(iExo); },
      surNon: function () { vue.surRefuserChauffes(iExo); }
    }, iExo);
  }

  // MOTEUR §9.17 (50-1) — la carte du lest : le titre et le détail viennent du
  // plan (le formateur, une fois), les deux boutons sont « J’ai du lest » et
  // « Pas de lest ». Le MÊME composant que les chauffes et le schéma — aucune
  // seconde carte.
  function propositionDeLest(carte, iExo, vue) {
    // 175 (MOTEUR §9.17 bis) — la variante sans matériel : trois gestes, la même carte (le composant de la reprise).
    if (carte.variante) {
      return propositionDExercice({
        classe: 'proposition-lest', texte: carte.titre, detail: carte.detail,
        gestes: [
          { texte: carte.oui, classe: 'pl-oui', surClic: function () { vue.surLest(iExo, 'oui'); } },
          { texte: carte.variante.nom, classe: 'pl-variante', surClic: function () { vue.surLest(iExo, 'variante'); } },
          { texte: carte.non, classe: 'pl-non', surClic: function () { vue.surLest(iExo, 'non'); } }
        ]
      }, iExo);
    }
    return propositionDExercice({
      classe: 'proposition-lest', texte: carte.titre, detail: carte.detail,
      oui: carte.oui, non: carte.non, classeOui: 'pl-oui', classeNon: 'pl-non',
      surOui: function () { vue.surLest(iExo, 'oui'); },
      surNon: function () { vue.surLest(iExo, 'non'); }
    }, iExo);
  }

  // MOTEUR §9.17 bis (127) — la carte « marche suivante » : LE RENDU DE LA CARTE DU LEST (même composant, mêmes
  // classes, même place) ; `proposition-marche` ne fait que la nommer. Le titre, le détail et les deux libellés
  // viennent du plan.
  function propositionDeMarche(carte, iExo, vue) {
    return propositionDExercice({
      classe: 'proposition-lest proposition-marche', texte: carte.titre, detail: carte.detail,
      oui: carte.oui, non: carte.non, classeOui: 'pl-oui', classeNon: 'pl-non',
      surOui: function () { vue.surMarche(iExo, 'oui'); },
      surNon: function () { vue.surMarche(iExo, 'non'); }
    }, iExo);
  }

  // MOTEUR §14.5 (49-U15) — « Changer de schéma » : la phrase, le détail,
  // « Passer à 6-8 reps » / « Garder 3-5 ». Lue sur le plan (`escalier.carte`).
  function propositionDeSchema(carte, iExo, vue) {
    // MOTEUR §14.7 (49-U17) — la carte de la SÉRIE DE PLUS : « Ajouter une
    // série » / « Non merci », la même réponse (`vue.surSchema`).
    // MOTEUR §14 (111) — la carte de la DÉGRESSIVE PROPOSÉE : la même carte et
    // le même geste que la série de plus, « Ajouter une dégressive » / « Non merci ».
    // MOTEUR §10 bis (113) — AU PLAFOND DE LA SALLE, la troisième marche : un frère plus chargeable, « Changer
    // d'exercice » / « Non merci ». La même carte, la même réponse (`vue.surSchema`).
    // 175 (MOTEUR §10 bis) — À LA PLUS LOURDE DE LA SALLE, LA CARTE DES LEVIERS : « 30 kg × 15, la plus lourde de ta salle. Pour
    // continuer à monter : » puis un geste par levier (un frère plus chargeable, le tempo lent, plus de reps, une charge dans
    // Ma salle) et « Garder ». Le composant des choix de la carte de reprise ; la réponse est `vue.surLevier(iExo, cle)`.
    if (carte.type === 'leviers') {
      var gestesL = (carte.leviers || []).map(function (lv) {
        return { texte: lv.texte, classe: 'pl-levier pl-' + lv.cle, surClic: function () { vue.surLevier(iExo, lv.cle); } };
      });
      gestesL.push({ texte: carte.non, classe: 'pl-garder', surClic: function () { vue.surLevier(iExo, 'garder'); } });
      return propositionDExercice({ classe: 'proposition-leviers', texte: carte.phrase, detail: carte.detail, gestes: gestesL }, iExo);
    }
    if (carte.type === 'remplacement') {
      return propositionDExercice({
        classe: 'proposition-remplacement', texte: carte.phrase, detail: carte.detail,
        oui: carte.oui, non: carte.non, classeOui: 'prp-oui', classeNon: 'prp-non',
        surOui: function () { vue.surSchema(iExo, 'acceptee'); },
        surNon: function () { vue.surSchema(iExo, 'refusee'); }
      }, iExo);
    }
    // 174 — la 4e marche : « Alléger » / « Garder N séries » (« Garder la charge » en force). La même réponse.
    if (carte.type === 'alleger') {
      return propositionDExercice({
        classe: 'proposition-alleger', texte: carte.phrase, detail: carte.detail,
        oui: carte.oui, non: carte.non, classeOui: 'pal-oui', classeNon: 'pal-non',
        surOui: function () { vue.surSchema(iExo, 'acceptee'); },
        surNon: function () { vue.surSchema(iExo, 'refusee'); }
      }, iExo);
    }
    if (carte.type === 'degressive') {
      return propositionDExercice({
        classe: 'proposition-degressive-proposee', texte: carte.phrase, detail: carte.detail,
        oui: carte.oui, non: carte.non, classeOui: 'pdp-oui', classeNon: 'pdp-non',
        surOui: function () { vue.surSchema(iExo, 'acceptee'); },
        surNon: function () { vue.surSchema(iExo, 'refusee'); }
      }, iExo);
    }
    if (carte.type === 'serie_de_plus') {
      return propositionDExercice({
        classe: 'proposition-serie', texte: carte.phrase, detail: carte.detail,
        oui: carte.oui, non: carte.non, classeOui: 'psp-oui', classeNon: 'psp-non',
        surOui: function () { vue.surSchema(iExo, 'acceptee'); },
        surNon: function () { vue.surSchema(iExo, 'refusee'); }
      }, iExo);
    }
    return propositionDExercice({
      classe: 'proposition-schema', texte: carte.phrase, detail: carte.detail,
      oui: carte.oui, non: carte.non, classeOui: 'ps-oui', classeNon: 'ps-non',
      surOui: function () { vue.surSchema(iExo, 'acceptee'); },
      surNon: function () { vue.surSchema(iExo, 'refusee'); }
    }, iExo);
  }

  // §9.14 — la ligne proposée validée à vide : on ne valide pas, on met le
  // curseur dans ses reps et on le montre, sans alarme ni rouge.
  function demanderReps(racine, iExo, iSerie) {
    if (!racine) return false;
    var r = racine.querySelector('.serie[data-iexo="' + iExo + '"][data-iserie="' + iSerie + '"]');
    var champ = r && r.querySelector('.rp-serie');
    var input = champ && champ.querySelector('input');
    if (!input) return false;
    champ.classList.remove('a-taper');
    void champ.offsetWidth;
    champ.classList.add('a-taper');
    input.focus();
    return true;
  }

  // ECRAN §3 bis.3 bis (prompts 100 puis 105) — la série validée avec une case
  // obligatoire vide et sans chiffre gris du coach : CHACUNE de ces cases
  // s'entoure de rouge et tremble (sauf mouvement réduit, en CSS), et le clavier
  // s'ouvre sur la première. `noms` : les cases manquantes, dans l'ordre de la
  // ligne (`THSeance.casesManquantes`). Une case perd son rouge à la première
  // frappe (`beforeinput` : le pavé de durée annule l'`input`).
  function demanderCases(racine, iExo, iSerie, noms) {
    if (!racine || !noms || !noms.length) return false;
    var r = racine.querySelector('.serie[data-iexo="' + iExo + '"][data-iserie="' + iSerie + '"]');
    if (!r) return false;
    var premier = null;
    var rouge = false;
    noms.forEach(function (nom) {
      var champ = r.querySelector('[data-champ="' + nom + '"]');
      // 132 (ECRAN-SAISIE §3 ter.6) — la case « ÉLASTIQUE » est un bouton (elle ouvre la liste) : elle passe au rouge,
      // et le rouge part au choix (le redessin).
      if (champ && champ.classList.contains('el-case')) {
        champ.classList.remove('case-vide');
        void champ.offsetWidth;
        champ.classList.add('case-vide');
        rouge = true;
        return;
      }
      var input = champ && champ.querySelector('input');
      if (!input) return;
      champ.classList.remove('case-vide');
      void champ.offsetWidth;
      champ.classList.add('case-vide');
      var retirer = function () {
        champ.classList.remove('case-vide');
        input.removeEventListener('beforeinput', retirer);
        input.removeEventListener('input', retirer);
      };
      input.addEventListener('beforeinput', retirer);
      input.addEventListener('input', retirer);
      if (!premier) premier = input;
    });
    if (!premier) return rouge;
    premier.focus();
    return true;
  }

  function rangeeDeSerie(bloc, s, complets, vue, reaction) {
    var iExo = s._iExo, iSerie = s._iSerie;
    var g = gabaritDe(vue, s.exercise_slug);
    var noms = colonnesDe(g);
    var champs = noms.map(function (n) { return M().champDeMesure(n); });
    // §7 quindecies.3 (52-1) — dans l'éditeur, un exercice DÉJÀ FAIT n'a plus
    // de champ de charge : le coach décide d'après les séances, et la légende
    // le dit. Rien n'est ignoré sans être dit.
    var cp = vue.programme && vue.chargeProgramme ? vue.chargeProgramme(s.exercise_slug) : null;
    var sansCharge = !!cp && !cp.depart;
    var classeGrille = classeDeGrille(g) + (vue.programme ? ' programme' : '') +
      (sansCharge ? ' sans-charge' : '');

    // §2.6 — l'éclairage porte sur le TOUR, jamais sur la ligne isolée.
    //
    // ⚠️ §2.5 PRÉCISÉ LE 13/09 APRÈS ESSAI SUR DEVICE. « Les échauffements ne
    // sont jamais surlignés » portait sur l'ÉCLAIRAGE DU TOUR, pas sur la
    // validation : une chauffe faite doit se voir comme faite. Le chantier 27
    // avait appliqué la règle trop largement — une chauffe validée restait
    // grise, sur les blocs simples comme dans les supersets.
    //
    // Une série qui appartient à un tour s'allume donc AVEC SON TOUR ; une
    // série qui n'en a pas — chauffe, dégressive, tentative manquée — s'allume
    // dès qu'elle est validée, pour elle seule.
    // En mode programme, rien n'est fait : aucune ligne ne s'allume, jamais.
    var allumee = vue.programme ? false : (s.tour ? complets[s.tour] === true : !!s.faite);

    // §7 undecies.2 — un espace et un filet plus clair entre les tours. Aucun
    // texte : `A1`, `B1`, `C1` disent déjà « tour 1 », et un libellé coûtait
    // cinq rangs sur un bloc à deux tours de chauffe et trois de travail.
    //
    // ⚠️ LA MARQUE VA SUR LA LIGNE, PAS SUR LA RANGÉE. C'est la ligne qui porte
    // le fond de glissement ; une marge posée sur la rangée laisserait le fond
    // rouge dépasser dans l'espace, au-dessus du vide.
    // La marque de tour passe à la phrase du coach quand elle précède la ligne :
    // l'espace va AU-DESSUS de la phrase, pas entre elle et sa série.
    var proposee = !!(reaction && reaction.proposee);
    // MOTEUR §9.14 bis (68A) — une ligne d'élan : la charge du coach, la fourchette.
    var elan = !!(reaction && reaction.elan);
    // MOTEUR §14.7 (49-U17) — la ligne de la série de plus, à la couleur du coach.
    var ajoutee = !!(reaction && reaction.ajoutee);
    var ligne = el('div', 'ligne-serie' +
      (s.debutTour && !(reaction && reaction.message) ? ' debut-tour' : '') +
      (proposee ? ' proposee' : '') + (ajoutee ? ' ajoutee' : ''));
    var fond = el('div', 'glisse-fond', 'Supprimer');
    var rangee = el('div', 'serie' + classeGrille + (allumee ? ' faite' : '') + (!vue.programme && s.faite ? ' fait' : ''));
    rangee.setAttribute('data-iexo', iExo);
    rangee.setAttribute('data-iserie', iSerie);

    var eti = etiquetteDeSerie(bloc, s);
    // 151 — la seconde baisse porte son rang (« D2 », la lecture de « 2ᵉ baisse »), lu sur le plan.
    if (!bloc.superset && s.type_serie === 'degressive' && reaction && reaction.baisse > 1) eti = { texte: 'D' + reaction.baisse, classe: 'd' };
    // Une note propre à CETTE série se signale sur son numéro — sinon elle
    // serait invisible, et une donnée qu'on ne voit pas est une donnée dont on
    // ne se souvient pas.
    var no = el('button', 'no-serie ' + eti.classe + (s.note ? ' a-note' : ''), eti.texte);
    no.type = 'button';
    no.addEventListener('click', function () { vue.surNumero(iExo, iSerie); });
    rangee.appendChild(no);

    // ⚠️ LE SECOND POINT DE RENDU (chantier 39). Le chantier 38 a corrigé le
    // FANTÔME ; la colonne, elle, alignait toujours par indice brut — et les deux
    // se contredisaient à l'écran, sur la même ligne :
    //
    //   ligne de travail n° 1 : fantôme 120 kg ✅ · « précédent » 40 kg ❌
    //
    // C'est la colonne qu'on lit pour savoir quoi charger. Même règle, même
    // fonction : la Nᵉ série d'un type montre la Nᵉ série du MÊME type, et sans
    // correspondant elle ne montre rien.
    //
    // ⚠️ ET ELLE VIENT DE LA SÉANCE PASSÉE UNIQUEMENT, jamais de la saisie en
    // cours — c'est ce qui la distingue du fantôme, et ça restera vrai quand le
    // moteur parlera : le fantôme dira CE QU'IL FAUT FAIRE, la colonne CE QUI A
    // ÉTÉ FAIT. `Seance.correspondant` ne lit que `prec`, donc la distinction
    // tient par construction.
    // ⚠️ MÊME LECTURE DE L'ANTÉCÉDENT DANS LES DEUX MODES, et c'est le point :
    // `correspondant` porte la règle du chantier 38 — la Nᵉ série d'un TYPE
    // regarde la Nᵉ série du MÊME type, jamais l'indice brut. L'éditeur s'en
    // sert aussi depuis le chantier 44, donc il n'y a pas de seconde lecture
    // d'historique à écrire, ni à faire diverger.
    var ligneP = S().correspondant(seriesDeSonExercice(bloc, s), iSerie,
      vue.precedent(s.exercise_slug));
    if (!vue.programme) {
      rangee.appendChild(el('div', 'prec num', M().formatPrecedent(ligneP, g.mesure, g.nature)));
    }

    // ⚠️ EN MODE PROGRAMME, LE GRIS EST CE QU'ON A RÉELLEMENT SOULEVÉ
    // (§7 septendecies.2). Le chantier 43 n'affichait rien, de peur qu'une
    // valeur grise se lise comme une valeur déjà programmée. Arbitré le 15/09 :
    // **ce n'est pas une valeur à arbitrer, c'est du contexte** — la routine
    // dit la structure, et montre où l'on en est. Non modifiable, non
    // enregistrée : elle n'est que le placeholder d'un champ vide.
    //
    // La CHARGE seulement. Les reps, elles, SONT la prescription : un gris
    // dessous rendrait « champ vide » et « 8 reps programmées » indiscernables.
    var f = vue.programme
      ? { charge_kg: ligneP ? ligneP.charge_kg : null }
      : vue.fantome(iExo, iSerie);
    // Une seule boucle pour les quatre gabarits : le champ porte sa colonne, son
    // unité et son facteur de conversion. La vue ne sait rien de la différence
    // entre une seconde et un kilomètre.
    champs.forEach(function (c, iChamp) {
      var classe = (iChamp === 0 ? 'ch-serie' : 'rp-serie') + ' num';
      var nom = noms[iChamp];
      if (sansCharge && nom === 'charge_kg') return;
      // 132 (ECRAN-SAISIE §3 ter.6, maquette `maquette-elastiques-v2.html`, écran 3) — LA CASE « ÉLASTIQUE » : le nom
      // tapé (choisi) de la série, sinon le gris du coach (`f.elastique`, le pré-remplissage du plan), sinon « choisir ».
      // Elle ouvre la feuille de choix (`vue.surElastique`). Jamais une charge : le nom, et sa pastille.
      if (c.saisie === 'elastique') {
        var choisi = s.elastique || null, gris = choisi ? null : (f && f.elastique) || null;
        var caseEl = el('button', classe + ' el-case' + (choisi ? '' : ' vide') + (gris ? ' gris' : '') +
          (proposee || elan ? ' coach' : ''));
        caseEl.type = 'button';
        if (choisi || gris) caseEl.appendChild(pastille(choisi || gris));
        // 163 — sans élastique déclaré : « Ajoute tes élastiques » (la feuille d'ajout), jamais « choisir » dans le vide.
        var aAjouter = !choisi && !gris && typeof vue.elastiqueAAjouter === 'function' && vue.elastiqueAAjouter(s.exercise_slug);
        caseEl.appendChild(el('span', 'el-case-nom', choisi || gris || (aAjouter ? 'Ajoute tes élastiques' : 'choisir')));
        caseEl.setAttribute('aria-label', 'Élastique : ' + (choisi || gris || (aAjouter ? 'ajoute tes élastiques' : 'à choisir')));
        caseEl.setAttribute('data-champ', nom);
        caseEl.addEventListener('click', function () { if (vue.surElastique) vue.surElastique(iExo, iSerie); });
        rangee.appendChild(caseEl);
        return;
      }
      // `data-champ` : la case se retrouve par son nom (§3 bis.3 bis, `demanderCases`).
      if (c.saisie === 'chrono') {
        var chrono = champChrono(classe, s[c.cle], f[c.cle],
          function (v) { vue.surChamp(iExo, iSerie, nom, v); });
        chrono.setAttribute('data-champ', nom);
        rangee.appendChild(chrono);
        return;
      }
      // §9.14 — sur la ligne proposée, la charge est celle du coach, et les
      // reps n'ont que la fourchette pour indication.
      var fourchette = (proposee || elan) && c.cle === 'reps' && reaction.fourchette
        ? reaction.fourchette[0] + '-' + reaction.fourchette[1] : null;
      // §9.17 — UNE AIDE SE TAPE EN POSITIF ET SE RANGE EN NÉGATIF, par
      // `rangerAide` et nulle part ailleurs : le champ montre la valeur absolue
      // (« 22,5 »), la série garde −22,5. Une fonction, pas un signe à retenir.
      //
      // 50-1 bis — SAUF DANS L'ÉDITEUR DE ROUTINE (`vue.programme`) : la CIBLE d'une
      // aide y reste POSITIVE (« 25 » sous « AIDE (KG) », `charge_cible_kg` est borné
      // à 0..1000 et le brouillon garde le texte tapé). La conversion se fait plus
      // tard, à la validation d'une série (`validerSerie`), par la même fonction.
      var aide = g.nature === 'aide' && c.cle === 'charge_kg';
      var versChamp = function (v) { return aide ? M().aideAffichee(v) : v; };
      var caseSerie = champSerie(classe + ((proposee || elan) && c.cle === 'charge_kg' ? ' coach' : ''),
        versChamp(enUniteDeSaisie(s[c.cle], c.facteur)),
        versChamp(enUniteDeSaisie(f[c.cle], c.facteur)),
        c.unite,
        function (v) { vue.surChamp(iExo, iSerie, nom, aide && !vue.programme ? M().rangerAide(v) : v); },
        { indication: fourchette, max: M().maxDeSaisie(nom), plus: s.au_max === true && c.cle === 'reps',
          surQuitte: typeof vue.surChampQuitte === 'function'
            ? function () { vue.surChampQuitte(iExo, iSerie); } : null });
      caseSerie.setAttribute('data-champ', nom);
      rangee.appendChild(caseSerie);
    });

    if (g.effort && !vue.programme) {
      var eff = el('button', 'eff-serie num' + (texteEffort(s) ? ' plein' : ''), texteEffort(s));
      eff.type = 'button';
      // 173 — le mot « fait » d'une série validée sans effort : dessiné par CSS depuis cet attribut (le contenu du bouton reste vide).
      if (s.faite && !texteEffort(s)) eff.setAttribute('data-fait', 'fait');
      eff.addEventListener('click', function () { vue.surEffort(iExo, iSerie); });
      rangee.appendChild(eff);
    }

    if (!vue.programme) {
      var ok = el('button', 'ok-serie' + (s.faite ? ' cochee' : ''));
      ok.type = 'button';
      ok.setAttribute('aria-label', s.faite ? 'Dévalider' : 'Valider');
      var v = svg('svg', null, { viewBox: '0 0 24 24' });
      v.appendChild(svg('path', null, { d: 'M5 13l4 4L19 7' }));
      ok.appendChild(v);
      ok.addEventListener('click', function () { vue.surValider(iExo, iSerie); });
      rangee.appendChild(ok);
    }

    ligne.appendChild(rangee);
    // 152 — le mot d'une série `echec` : « à l'échec » (ambre) à 1 rep et plus, « manquée » à 0.
    if (s.motEchec) ligne.appendChild(el('div', 'etq-ligne etq' + (s.estTravail ? ' fond' : ''), s.motEchec));
    ligne.appendChild(fond);
    brancherGlissement(ligne, function () { vue.surSupprimerSerie(iExo, iSerie); });
    return ligne;
  }

  // §2.3 — dans un superset, le numéro porte la LETTRE de l'exercice et le TOUR.
  // Le type ne s'y écrit plus en toutes lettres : il reste dans la couleur,
  // exactement comme au détail de séance. Hors superset, rien ne change — `C`,
  // `D`, `✕`, ou le numéro de la série de travail.
  function etiquetteDeSerie(bloc, s) {
    if (!bloc.superset) return etiquetteSerie(s.estTravail ? 'travail' : typeAffiche(s), s.tour);
    var e = s.estTravail ? null : ETIQUETTE_TYPE[typeAffiche(s)];
    return { texte: s.etiquette, classe: e ? e.classe : '' };
  }

  // Un « + Série » PAR BRANCHE dans un superset : ajouter une série à A n'a rien
  // à voir avec en ajouter une à B, et un bouton unique ne saurait pas laquelle.
  function boutonsAjoutSerie(bloc, vue) {
    var ajout = el('div', 'ajout-serie');
    bloc.exercices.forEach(function (x) {
      var b = el('button', '', '+ Série' + (x.lettre ? ' ' + x.lettre : ''));
      b.type = 'button';
      b.setAttribute('aria-label', 'Ajouter une série à ' + x.nom);
      b.addEventListener('click', function () { vue.surAjoutSerie(x._iExo); });
      ajout.appendChild(b);
    });
    return ajout;
  }

  // Le chronomètre INFORME, il ne commande pas : pas d'alarme au dépassement,
  // pas de blocage, aucun décompte qui presse.
  //
  // ⚠️ C'EST UN COMPTE À REBOURS (§7 quatervicies, ch. 50), ET LES DEUX SIGNAUX
  // VONT DANS LE MÊME SENS. Le grand nombre descend de la cible vers 0:00 — la
  // question entre deux séries est « combien me reste-t-il », pas « depuis
  // combien de temps je souffle » — et la piste SE VIDE avec lui. Elle se
  // remplissait pendant que le nombre montait ; garder le remplissage sous un
  // nombre qui descend, c'est raconter deux histoires sur le même écran.
  //
  // Trois commandes, et pas une de plus (§3 bis.8) : −15 s, +15 s, et la
  // sourdine. Les deux premières parce qu'une cible mal réglée est le cas
  // courant ; la troisième parce qu'on ne veut pas toujours du son.
  function rendreRepos(cible, vue) {
    // MOTEUR §17.2 bis (78) — LA QUESTION DE RÉSERVE NE SE REDESSINE PAS CHAQUE SECONDE : la barre, elle, se refait
    // à chaque passage du minuteur ; un bouton recréé sous le doigt avalerait le tap. Elle ne se refait que si elle
    // change (une autre série, un autre bouton choisi).
    var q = questionDuRepos(cible, vue.question || null);
    Array.prototype.slice.call(cible.childNodes).forEach(function (n) { if (n !== q) cible.removeChild(n); });
    var pas = vue.pas || 15;

    var h = el('div', 'repos-h');
    // Figé à l'échéance (§7 septies.3) : il ne compte pas au-delà. L'état se
    // voit, sinon un chronomètre arrêté se lit comme un chronomètre planté.
    // ⚠️ PLUS DE CLASSE `fige` (ch. 51). Elle marquait un chronomètre arrêté sur
    // sa cible — un état qui n'existe plus : un décompte arrivé à zéro éteint la
    // barre au lieu de la figer (§7 quinvicies). Une barre affichée est une
    // barre qui compte, et il n'y a plus qu'un état à dessiner.
    h.appendChild(el('span', 'repos-g num', mmss(vue.restant)));

    h.appendChild(boutonRepos('−' + pas, 'Réduire la cible de ' + pas + ' secondes',
      function () { if (vue.surAjuster) vue.surAjuster(-pas); }));
    // Une cible absente se dit, elle ne se devine pas : le tiret cadratin
    // signale qu'il n'y en a pas, et +15 en pose une.
    h.appendChild(el('span', 'repos-c num',
      'cible ' + (vue.cible ? mmss(vue.cible) : '—')));
    h.appendChild(boutonRepos('+' + pas, 'Allonger la cible de ' + pas + ' secondes',
      function () { if (vue.surAjuster) vue.surAjuster(pas); }));

    var son = boutonRepos(vue.sourdine ? 'Son ✕' : 'Son',
      vue.sourdine ? 'Rétablir le son du repos' : 'Couper le son du repos',
      function () { if (vue.surSourdine) vue.surSourdine(); });
    if (vue.sourdine) son.classList.add('coupe');
    son.style.marginLeft = 'auto';
    h.appendChild(son);

    var p = el('button', 'discret', 'Passer');
    p.type = 'button';
    p.addEventListener('click', vue.surPasser);
    h.appendChild(p);
    if (q && q.parentNode !== cible) cible.appendChild(q);
    cible.insertBefore(h, q);

    var piste = el('div', 'piste');
    var barre = el('i', '');
    // Ce qui RESTE, pas ce qui est passé : la piste part pleine et se vide.
    barre.style.width = vue.cible
      ? Math.max(0, Math.min(100, Math.round((vue.restant / vue.cible) * 100))) + '%' : '0%';
    piste.appendChild(barre);
    cible.insertBefore(piste, q);
  }

  // « Dernière série : 130 kg × 5. Il t'en restait combien ? » et 0 · 1 · 2 · 3 ou + — les valeurs de
  // `sets.ressenti`. `vue` : `{ cle, serie, choisi, surChoix }` (l'app), ou `null` : pas de question. Rend le nœud
  // (gardé s'il n'a pas changé), à poser en dernier dans la carte.
  var BOUTONS_RESERVE = [['reste_0', '0'], ['reste_1', '1'], ['reste_2', '2'], ['reste_3_plus', '3 ou +']];
  function questionDuRepos(cible, vue) {
    var ancien = cible.querySelector('.repos-q');
    var cle = vue ? vue.cle + '|' + vue.serie + '|' + (vue.choisi || '') : null;
    if (ancien && ancien.getAttribute('data-cle') === cle) return ancien;
    if (!vue) return null;
    var q = el('div', 'repos-q');
    q.setAttribute('data-cle', cle);
    var t = el('p', 'repos-q-t');
    t.appendChild(doc.createTextNode('Dernière série : '));
    t.appendChild(el('b', '', vue.serie));
    t.appendChild(doc.createTextNode('. Il t’en restait combien ?'));
    q.appendChild(t);
    var rang = el('div', 'repos-q-b');
    BOUTONS_RESERVE.forEach(function (r) {
      var b = el('button', vue.choisi === r[0] ? 'sel' : '', r[1]);
      b.type = 'button';
      b.setAttribute('data-ressenti', r[0]);
      b.setAttribute('aria-pressed', vue.choisi === r[0] ? 'true' : 'false');
      b.addEventListener('click', function () { vue.surChoix(r[0]); });
      rang.appendChild(b);
    });
    q.appendChild(rang);
    return q;
  }

  function boutonRepos(texte, titre, surClic) {
    var b = el('button', 'repos-b', texte);
    b.type = 'button';
    b.setAttribute('aria-label', titre);
    b.title = titre;
    b.addEventListener('click', surClic);
    return b;
  }

  // ── Les feuilles ────────────────────────────────────────────────────────
  var LIBELLE_TYPE = [
    ['travail', 'Série de travail'],
    ['echauffement', 'Échauffement'],
    ['degressive', 'Dégressive'],
    ['echec', 'À l’échec', 'Tes reps comptent, sans marge. À 0 rep : une tentative manquée.'],
    // 186 (v2_117) — la série de test : un max, un single. Un record possible ; elle ne décide pas de la charge de travail.
    ['test', 'Série de test', 'Un max tenté : un record possible, mais elle ne décide pas de ta charge de travail.'],
    // 193-1 (v2_120) — la série de recul : plus légère que la grosse série, qui décide de la charge ; elle compte dans le volume.
    ['recul', 'Série de recul', 'Plus légère que ta grosse série, avec un repos normal. Ta charge se décide sur la grosse série.']
  ];

  var LIBELLE_RESSENTI = [
    ['reste_3_plus', '3+', 'facile'],
    ['reste_2', '2', ''],
    ['reste_1', '1', ''],
    ['reste_0', '0', 'à l’échec']
  ];

  var VALEURS_RPE = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10];

  function rendreFeuilleSerie(cible, vue) {
    vider(cible);
    var titre = el('div', 'feuille-t',
      vue.quoi === 'type' ? 'Série ' + vue.numero : 'Série ' + vue.numero + ' — combien te restait-il ?');
    titre.appendChild(el('em', '', vue.exercice));
    cible.appendChild(titre);

    if (vue.quoi === 'type') {
      var menu = el('div', 'feuille-menu');
      LIBELLE_TYPE.forEach(function (t) {
        var b = el('button', M().typeDe(vue.serie) === t[0] ? 'sel' : '', t[1]);
        if (t[2]) b.appendChild(el('small', 'aide-type', t[2]));
        b.type = 'button';
        b.addEventListener('click', function () { vue.surType(t[0]); });
        menu.appendChild(b);
      });
      cible.appendChild(menu);

      // 193-6 (MOTEUR §9.30) — « Au max » : un interrupteur, pas un type (une série de recul peut l'être aussi). Seulement sur la
      // dernière série de travail ; en séance il ne vaut que pour aujourd'hui, la routine ne change pas.
      if (vue.auMax && vue.auMax.possible) {
        var menuAu = el('div', 'feuille-menu');
        var bAu = el('button', vue.auMax.actif ? 'sel' : '', vue.auMax.actif ? 'Retirer « Au max »' : 'Au max');
        bAu.appendChild(el('small', 'aide-type', vue.auMax.aide));
        bAu.type = 'button';
        bAu.addEventListener('click', function () { vue.surAuMax(!vue.auMax.actif); });
        menuAu.appendChild(bAu);
        cible.appendChild(menuAu);
      }

      // 196 (MOTEUR §9.33) — « Rest-pause » : deux mini-séries à la même charge, une seule série de travail.
      if (vue.restPause && vue.restPause.possible) {
        var menuRp = el('div', 'feuille-menu');
        var bRp = el('button', '', 'Rest-pause');
        bRp.appendChild(el('small', 'aide-type', vue.restPause.aide));
        bRp.type = 'button';
        bRp.addEventListener('click', function () { vue.surRestPause(); });
        menuRp.appendChild(bRp);
        cible.appendChild(menuRp);
      }

      // ⚠️ LA NOTE DE SÉRIE EXISTE, ET ELLE RESTE (§7 septies.1).
      //
      // 11 couples séance-exercice sur 196 portent des notes réellement
      // différentes d'une série à l'autre. Le cas est minoritaire — d'où sa
      // place, dans le menu de la série et pas sur la ligne — mais il est réel,
      // et il ne se supprime pas. Renseignée, elle GAGNE sur celle de
      // l'exercice pour cette série-là.
      // ⚠️ PAS DE NOTE DE SÉRIE EN MODE PROGRAMME. `routine_sets` n'a aucune
      // colonne où la mettre : le champ serait un champ qu'on remplit et que
      // l'enregistrement jette. Mieux vaut qu'il n'existe pas.
      if (!vue.programme) {
        cible.appendChild(champTexte('Note de cette série', vue.serie.note,
          { lignes: 2, placeholder: vue.noteExercice || 'Ce qui ne vaut que pour celle-ci' },
          function (v) { vue.surNoteSerie(v); }));
      }

      var menuSup = el('div', 'feuille-menu');
      var sup = el('button', 'danger', 'Supprimer la série');
      sup.type = 'button';
      sup.addEventListener('click', vue.surSupprimer);
      menuSup.appendChild(sup);
      cible.appendChild(menuSup);
      return;
    }

    // Le RPE est une GRILLE de huit valeurs, jamais un curseur : viser 8,5 sur
    // un curseur à 360 px avec les mains moites est perdu d'avance.
    if (vue.modeRPE) {
      var grille = el('div', 'grille-rpe');
      VALEURS_RPE.forEach(function (v) {
        var b = el('button', vue.serie.rpe === v ? 'sel num' : 'num', nombreFr(v));
        b.type = 'button';
        b.addEventListener('click', function () { vue.surEffort({ rpe: v }); });
        grille.appendChild(b);
      });
      cible.appendChild(grille);
    } else {
      var q = el('div', 'grille-rir');
      LIBELLE_RESSENTI.forEach(function (r) {
        var b = el('button', vue.serie.ressenti === r[0] ? 'sel' : '');
        b.type = 'button';
        b.appendChild(el('span', 'rir-n', r[1]));
        if (r[2]) b.appendChild(el('em', '', r[2]));
        b.addEventListener('click', function () { vue.surEffort({ ressenti: r[0] }); });
        q.appendChild(b);
      });
      cible.appendChild(q);
    }

    var efface = el('button', 'discret bloc-large', 'Effacer');
    efface.type = 'button';
    efface.addEventListener('click', function () { vue.surEffort({}); });
    cible.appendChild(efface);

    var bascule = el('div', 'bascule');
    bascule.appendChild(el('span', '', vue.modeRPE
      ? 'Revenir aux quatre choix ?' : 'Tu préfères le RPE chiffré ?'));
    var bb = el('button', 'discret', vue.modeRPE ? 'Ressenti' : 'RPE');
    bb.type = 'button';
    bb.addEventListener('click', vue.surBascule);
    bascule.appendChild(bb);
    cible.appendChild(bascule);
  }

  // ══ LES MENUS DE DÉVIATION (§5.5, §5.6, §5 bis) ══════════════════════════
  //
  // Une entrée par geste, en toutes lettres. Pas d'icône seule : ces gestes
  // changent la séance, et « ce que fait ce bouton » ne doit jamais être une
  // question qu'on se pose avec une barre en main.
  //
  // « Voir la progression » a été inerte du chantier 27 au chantier 40 : le
  // §2.8 le demandait, mais la page d'exercice (§7 quater) n'existait pas, et
  // câbler sur du vide aurait été pire que de l'annoncer indisponible. Elle
  // existe — il est câblé, et il reste grisé quand l'appelant n'en veut pas.
  function entreeMenu(menu, texte, options) {
    var o = options || {};
    var b = el('button', o.classe || '', texte);
    b.type = 'button';
    if (o.desactive) { b.disabled = true; b.classList.add('inerte'); }
    else b.addEventListener('click', o.surClic);
    menu.appendChild(b);
    return b;
  }

  // ── §3.10 — LA FEUILLE « POURQUOI » ─────────────────────────────────────
  //
  // ⚠️ ELLE N'ÉCRIT AUCUNE PHRASE. Tout son texte vient de `pourquoiConsigne`,
  // qui le tire du fondement (§9.13) ; ici on ne fait que poser des nœuds dans
  // l'ordre des sept lignes. Une phrase composée à l'écran finirait par dire
  // autre chose que le moteur, et personne ne saurait laquelle a raison.
  //
  // Le renvoi au Profil est un LIEN, pas une phrase : « il se change dans
  // Profil » sans moyen d'y aller est une indication, pas une porte.
  function rendreFeuillePourquoi(cible, vue) {
    vider(cible);
    var p = vue.pourquoi;
    if (!p) return cible;
    cible.appendChild(el('div', 'feuille-t', 'Pourquoi cette consigne'));
    cible.appendChild(el('div', 'feuille-sous', vue.nom));

    if (p.seance) {
      // La date vient du formateur de la voix : « mardi », ou « le 13 sept. ».
      cible.appendChild(el('div', 'pq-sec', 'Ta dernière séance, ' + p.seance.date));
      p.seance.lignes.forEach(function (l) {
        var n = el('div', 'pq-ligne' + (l.muet === true ? ' muet' : ''));   // 179 (B-B1) : le plan le dit (`muet`), le texte ne sert plus de signal
        n.appendChild(el('span', 'pq-quoi', l.texte));
        n.appendChild(el('span', 'pq-role', l.role || ''));
        cible.appendChild(n);
      });
    }
    // 193-3 — la zone vient de la routine : la première ligne, avant le détail de la zone.
    if (p.plan) cible.appendChild(el('p', 'pq-p', p.plan));
    ['zone', 'palier', 'etat'].forEach(function (k) {
      if (p[k]) cible.appendChild(el('p', 'pq-p', p[k]));
    });
    if (p.donc) cible.appendChild(el('p', 'pq-p fort', p.donc));
    // ECRAN §3.10 (delta 49-14 W1) — les lignes de la SÉANCE EN COURS, une par
    // une, telles que le plan les porte : la charge d'abord, puis leur rôle, la
    // raison d'une ligne du coach ou d'un retour, et ce qui a été fait. Aucun
    // texte composé ici : il vient du plan.
    (p.lignes || []).forEach(function (l) {
      var n = el('div', 'pq-ligne pq-plan');
      n.appendChild(el('span', 'pq-quoi', l.texte));
      n.appendChild(el('span', 'pq-role', [l.libelle, l.raison, l.faite].filter(Boolean).join(' · ')));
      cible.appendChild(n);
    });
    // MOTEUR §12.9 (49-U13) — le compteur de stagnation, en une ligne.
    if (p.compteur) cible.appendChild(el('p', 'pq-p', p.compteur));
    // MOTEUR §13.6 (49-U20) — le frère qui progresse, après le compteur.
    if (p.frere) cible.appendChild(el('p', 'pq-p', p.frere));
    // 188-2 — le repos d'un gros mouvement qui stagne : une ligne, jamais une carte.
    if (p.repos) cible.appendChild(el('p', 'pq-p', p.repos));
    // 193-1 — comment les séries de recul suivent la grosse série (du plan).
    if (p.recul) cible.appendChild(el('p', 'pq-p', p.recul));
    // MOTEUR §9.15.1 (49-U10) — une routine qui prévoit plus de chauffes que
    // la table : les lignes en trop ne sont pas remplies, et la feuille le dit.
    if (p.chauffes) cible.appendChild(el('p', 'pq-p', p.chauffes));
    if (p.reglage) {
      // « Profil » est le dernier mot de la phrase : on la coupe dessus plutôt
      // que d'en réécrire une seconde à côté du lien.
      var pr = el('p', 'pq-p');
      var i = p.reglage.lastIndexOf('Profil');
      pr.appendChild(doc.createTextNode(p.reglage.slice(0, i)));
      var lien = el('button', 'lien-profil', 'Profil');
      lien.type = 'button';
      lien.addEventListener('click', vue.surProfil);
      pr.appendChild(lien);
      pr.appendChild(doc.createTextNode(p.reglage.slice(i + 'Profil'.length)));
      cible.appendChild(pr);
    }
    if (p.fin) cible.appendChild(el('p', 'pq-p', p.fin));
    // 160 — « Demander au coach » : un bouton en bas, rien ne change au-dessus. Le texte n'est pas écrit ici (`vue.assistant`).
    if (vue.assistant) {
      var a = vue.assistant;
      var bd = el('button', 'principal assistant-demander', a.bouton);
      bd.type = 'button';
      if (a.horsLigne) bd.disabled = true;
      else bd.addEventListener('click', a.surDemander);
      cible.appendChild(bd);
      cible.appendChild(el('div', 'assistant-reste', a.horsLigne ? a.horsLigne : a.reste));
    }
    return cible;
  }

  // ── 160 — « DEMANDER AU COACH » : L'ACCORD, PUIS LA CONVERSATION ─────────
  //
  // ⚠️ ELLES N'ÉCRIVENT AUCUNE RÉPONSE : les textes viennent d'`assistant.js` (`vue.textes`), les réponses de la fonction.
  // La première fois seulement : l'accord (ce qui part, où, ce qui ne part jamais). La conversation vit en mémoire.
  function rendreFeuilleAccord(cible, vue) {
    vider(cible);
    cible.appendChild(el('div', 'feuille-t', vue.textes.accordTitre));
    var ul = el('ul', 'assistant-accord');
    vue.textes.accord.forEach(function (parties) {
      var li = el('li');
      parties.forEach(function (t, i) {
        if (i % 2 === 1) li.appendChild(el('b', '', t));
        else li.appendChild(doc.createTextNode(t));
      });
      ul.appendChild(li);
    });
    cible.appendChild(ul);
    var ok = el('button', 'principal assistant-accord-ok', vue.textes.accordOk);
    ok.type = 'button';
    ok.addEventListener('click', vue.surAccord);
    cible.appendChild(ok);
    var non = el('button', 'discret bloc-large assistant-accord-non', vue.textes.accordNon);
    non.type = 'button';
    non.addEventListener('click', vue.surRefus);
    cible.appendChild(non);
    return cible;
  }

  function rendreFeuilleAssistant(cible, vue) {
    vider(cible);
    cible.appendChild(el('div', 'feuille-t', vue.titre));
    cible.appendChild(el('div', 'feuille-sous', vue.nom));
    if (!vue.bulles.length) {
      var pu = el('div', 'assistant-puces');
      vue.puces.forEach(function (q) {
        var b = el('button', 'assistant-puce', q);
        b.type = 'button';
        if (vue.enCours) b.disabled = true;
        else b.addEventListener('click', function () { vue.surEnvoyer(q); });
        pu.appendChild(b);
      });
      cible.appendChild(pu);
    }
    var fil = el('div', 'assistant-fil');
    vue.bulles.forEach(function (b, i) {
      fil.appendChild(el('div', 'assistant-q', b.q));
      if (b.r === null) {
        fil.appendChild(el('div', 'assistant-r assistant-attente', vue.attente));
        return;
      }
      fil.appendChild(el('div', 'assistant-r' + (b.local ? ' local' : ''), b.r));
      if (!b.local) fil.appendChild(el('div', 'assistant-mention', vue.mention));
      if (b.sante && i === vue.bulles.length - 1) {
        var jm = el('button', 'discret bloc-large assistant-jaimal', 'J\u2019ai mal');
        jm.type = 'button';
        jm.addEventListener('click', vue.surJaiMal);
        fil.appendChild(jm);
      }
    });
    cible.appendChild(fil);
    var form = el('form', 'assistant-champ');
    var inp = el('input');
    inp.type = 'text';
    inp.maxLength = vue.max;
    inp.placeholder = 'Ta question\u2026';
    inp.value = vue.saisie || '';
    inp.setAttribute('aria-label', 'Ta question');
    inp.autocomplete = 'off';
    inp.addEventListener('input', function () { vue.surSaisie(inp.value); });
    var env = el('button', 'assistant-envoyer', 'Envoyer');
    env.type = 'submit';
    if (vue.enCours) { env.disabled = true; inp.disabled = true; }
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var q = inp.value.trim();
      if (q && !vue.enCours) vue.surEnvoyer(q);
    });
    form.appendChild(inp);
    form.appendChild(env);
    cible.appendChild(form);
    if (vue.reste) cible.appendChild(el('div', 'assistant-reste', vue.reste));
    var ret = el('button', 'discret bloc-large assistant-retour', 'Retour \u00e0 la consigne');
    ret.type = 'button';
    ret.addEventListener('click', vue.surRetour);
    cible.appendChild(ret);
    return cible;
  }

  // ── §3.8 — LE MENU DES ZONES ────────────────────────────────────────────
  //
  // Cinq zones, pas de saisie libre : une fourchette tapée à la main serait une
  // sixième règle de rangement, et le moteur n'en a qu'une. La zone en vigueur
  // est cochée ; la zone DÉDUITE porte sa raison, pour qu'on sache ce qu'on
  // remplace. « Revenir » n'existe que s'il y a quelque chose à défaire.
  function rendreFeuilleZone(cible, vue) {
    vider(cible);
    cible.appendChild(el('div', 'feuille-t', 'Zone de travail'));
    cible.appendChild(el('div', 'feuille-sous', vue.nom + ', dans toutes tes routines'));
    // §9.17 — LE MODE DE L'EXERCICE, en tête de la feuille : « Progresser »
    // (le coach prescrit) ou « Entretenir » (il se tait, comme au profil). Le
    // choix est à CET exercice seul. En Entretenir, la feuille ne montre que lui.
    if (typeof vue.surMode === 'function') {
      var modes = el('div', 'mode-exercice');
      [['progresser', 'Progresser'], ['entretien', 'Entretenir']].forEach(function (m) {
        var actif = vue.mode === m[0];
        var b = el('button', 'option-mode' + (actif ? ' active' : ''), m[1]);
        b.type = 'button';
        b.setAttribute('aria-pressed', actif ? 'true' : 'false');
        b.dataset.mode = m[0];
        b.addEventListener('click', function () { if (!actif) vue.surMode(m[0]); });
        modes.appendChild(b);
      });
      cible.appendChild(modes);
      if (vue.mode === 'entretien') {
        cible.appendChild(el('p', 'feuille-aide',
          'Je me tais sur cet exercice : tu charges comme tu veux.'));
        var fermerE = el('button', 'discret bloc-large', 'Fermer');
        fermerE.type = 'button';
        fermerE.addEventListener('click', vue.surFermer);
        cible.appendChild(fermerE);
        return cible;
      }
    }
    var d = vue.deduite || null;
    (vue.zones || []).forEach(function (z) {
      var actif = vue.choisie ? vue.choisie === z.cle : (d && d.zone === z.cle);
      var b = el('button', 'option-zone' + (actif ? ' active' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', actif ? 'true' : 'false');
      b.dataset.cle = z.cle;
      b.appendChild(el('span', 'oz-rond'));
      b.appendChild(el('span', 'oz-nom', z.libelle));
      b.appendChild(el('span', 'oz-reps', z.bas + ' à ' + z.haut + ' reps'));
      // La raison ne vit que sous la zone DÉDUITE : c'est elle qu'elle explique.
      if (d && d.zone === z.cle) {
        b.appendChild(el('span', 'oz-sous', 'D\'après tes ' + d.seances +
          ' dernières séances\u00a0: ' + d.habitude + ' reps d\'habitude.'));
      }
      b.addEventListener('click', function () { vue.surChoix(z.cle); });
      cible.appendChild(b);
    });
    if (vue.choisie) {
      var retour = el('button', 'discret bloc-large', 'Revenir à celle d\'après tes séances');
      retour.type = 'button';
      retour.addEventListener('click', function () { vue.surChoix(null); });
      cible.appendChild(retour);
    }
    cible.appendChild(el('p', 'feuille-aide',
      'La consigne se recalcule dès que tu changes de zone.'));
    var fermer = el('button', 'discret bloc-large', 'Fermer');
    fermer.type = 'button';
    fermer.addEventListener('click', vue.surFermer);
    cible.appendChild(fermer);
    return cible;
  }

  // 193-3 (maquette de l'ondulation, écrans 1 et 4) — LE CHOIX DE LA ZONE D'UNE LIGNE DE ROUTINE : « Automatique » (le coach la lit dans
  // tes séances, comme avant) et les cinq zones. `vue` : { titre, sous, aide, zones, choisie (clé ou null), surChoix(clé | null),
  // surFermer }. La même table de zones que la feuille de zone : aucune seconde liste.
  function rendreFeuilleZoneRoutine(cible, vue) {
    vider(cible);
    cible.appendChild(el('div', 'feuille-t', vue.titre || 'Zone de cet exercice'));
    if (vue.sous) cible.appendChild(el('div', 'feuille-sous', vue.sous));
    var auto = el('button', 'option-zone' + (!vue.choisie ? ' active' : ''));
    auto.type = 'button';
    auto.setAttribute('aria-pressed', !vue.choisie ? 'true' : 'false');
    auto.dataset.cle = '';
    auto.appendChild(el('span', 'oz-rond'));
    auto.appendChild(el('span', 'oz-nom', 'Automatique'));
    auto.appendChild(el('span', 'oz-sous', 'Le coach lit ta zone dans tes séances, comme aujourd\u2019hui.'));
    auto.addEventListener('click', function () { vue.surChoix(null); });
    cible.appendChild(auto);
    (vue.zones || []).forEach(function (z) {
      var actif = vue.choisie === z.cle;
      var b = el('button', 'option-zone' + (actif ? ' active' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', actif ? 'true' : 'false');
      b.dataset.cle = z.cle;
      b.appendChild(el('span', 'oz-rond'));
      b.appendChild(el('span', 'oz-nom', z.libelle));
      b.appendChild(el('span', 'oz-reps', z.bas + ' à ' + z.haut + ' reps'));
      if (actif) b.appendChild(el('span', 'oz-sous', 'Ce jour-là, cet exercice se suit à part, séparé de tes autres jours.'));
      b.addEventListener('click', function () { vue.surChoix(z.cle); });
      cible.appendChild(b);
    });
    if (vue.aide) cible.appendChild(el('p', 'feuille-aide', vue.aide));
    var fermer = el('button', 'discret bloc-large', 'Fermer');
    fermer.type = 'button';
    fermer.addEventListener('click', vue.surFermer);
    cible.appendChild(fermer);
    return cible;
  }

  // 193-3 (maquette de l'ondulation, écran 4) — TOUCHER L'ÉTIQUETTE d'un exercice dont la zone vient de la routine : deux choix, ni
  // plus ni moins. `vue` : { nom, libelle, surRoutine, surAujourdhui, surFermer }. Aucune correction d'exercice (`zones_exercice`)
  // ne s'écrit d'ici : la zone de la routine ne s'efface jamais en silence.
  function rendreFeuilleZonePlan(cible, vue) {
    vider(cible);
    cible.appendChild(el('div', 'feuille-t', 'Zone de travail'));
    cible.appendChild(el('div', 'feuille-sous', vue.nom));
    cible.appendChild(el('p', 'feuille-aide', 'Ta zone d\u2019ici vient de ta routine\u00a0: ' + vue.libelle + '.'));
    [['routine', 'Changer la zone de cette routine', 'Elle change pour les prochaines fois, dans la routine.', vue.surRoutine],
     ['aujourdhui', 'Juste pour aujourd\u2019hui', 'Ta routine ne change pas.', vue.surAujourdhui]].forEach(function (c) {
      var b = el('button', 'option-zone');
      b.type = 'button';
      b.dataset.choix = c[0];
      b.appendChild(el('span', 'oz-nom', c[1]));
      b.appendChild(el('span', 'oz-sous', c[2]));
      b.addEventListener('click', function () { c[3](); });
      cible.appendChild(b);
    });
    var fermer = el('button', 'discret bloc-large', 'Fermer');
    fermer.type = 'button';
    fermer.addEventListener('click', vue.surFermer);
    cible.appendChild(fermer);
    return cible;
  }

  function rendreFeuilleBloc(cible, vue) {
    vider(cible);
    var t = el('div', 'feuille-t', vue.superset ? 'Superset' : 'Exercice');
    t.appendChild(el('em', '', vue.noms));
    cible.appendChild(t);

    var menu = el('div', 'feuille-menu');
    // Sur un bloc d'un seul, le menu du BLOC porte aussi les gestes de
    // l'exercice : il n'y a qu'un objet, et deux menus pour lui seraient un de
    // trop (§5.6 — « Sortir » est masqué, pas grisé, sur un bloc d'un seul).
    if (!vue.superset) {
      // §9.19 — « Machine prise » en tête : c'est le geste du moment où l'on
      // ouvre ce menu en pleine séance.
      if (vue.surMachinePrise) entreeMenu(menu, 'Machine prise', { surClic: vue.surMachinePrise });
      // §9.20 — « J'ai mal », juste après : les deux gestes « adapter ».
      if (vue.surJaiMal) entreeMenu(menu, 'J’ai mal', { surClic: vue.surJaiMal });
      entreeMenu(menu, 'Remplacer l’exercice', { surClic: vue.surRemplacer });
    }
    entreeMenu(menu, 'Grouper en superset…', {
      surClic: vue.surGrouper, desactive: !vue.peutGrouper });
    entreeMenu(menu, 'Ajouter un exercice après', { surClic: vue.surAjouterApres });
    // ⚠️ « MONTER » ET « DESCENDRE » SONT PARTIS (§7 vicies.1, ch. 46). Deux
    // entrées qui bougeaient d'un cran chacune, quand réordonner n'est presque
    // jamais un geste isolé : quand on touche à l'ordre, on bouge plusieurs
    // choses. Une seule entrée ouvre le mode, où tout se déplace au glissement
    // et où l'on enregistre à la fin.
    //
    // Les flèches ↑/↓ du bloc REPLIÉ, elles, restent : elles sont le chemin
    // accessible au clavier et le filet si le glissement rate. « Un geste qui
    // rate ne doit pas enfermer » — la doctrine du glissement latéral.
    entreeMenu(menu, 'Réorganiser…', { surClic: vue.surReorganiser,
      desactive: !vue.surReorganiser });
    entreeMenu(menu, 'Voir la progression',
      { surClic: vue.surProgression, desactive: !vue.surProgression });
    cible.appendChild(menu);

    var sup = el('div', 'feuille-menu');
    entreeMenu(sup, vue.superset ? 'Supprimer le bloc' : 'Supprimer l’exercice',
      { classe: 'danger', surClic: vue.surSupprimer });
    cible.appendChild(sup);
    return cible;
  }

  function rendreFeuilleExercice(cible, vue) {
    vider(cible);
    var t = el('div', 'feuille-t', 'Exercice');
    t.appendChild(el('em', '', vue.nom));
    cible.appendChild(t);

    var menu = el('div', 'feuille-menu');
    if (vue.surMachinePrise) entreeMenu(menu, 'Machine prise', { surClic: vue.surMachinePrise });
    if (vue.surJaiMal) entreeMenu(menu, 'J’ai mal', { surClic: vue.surJaiMal });
    entreeMenu(menu, 'Remplacer l’exercice', { surClic: vue.surRemplacer });
    // §5.8 — sortir agit sur UN exercice, jamais sur le bloc entier, et il se
    // pose JUSTE APRÈS son bloc d'origine : il ne remonte pas en fin de séance.
    entreeMenu(menu, 'Sortir du superset', { surClic: vue.surDegrouper });
    entreeMenu(menu, 'Voir la progression',
      { surClic: vue.surProgression, desactive: !vue.surProgression });
    cible.appendChild(menu);

    var sup = el('div', 'feuille-menu');
    entreeMenu(sup, 'Supprimer l’exercice', { classe: 'danger', surClic: vue.surSupprimer });
    cible.appendChild(sup);
    return cible;
  }

  // ── « MACHINE PRISE » (MOTEUR §9.19, chantier 51) ───────────────────────
  //
  // D'abord « Plus tard », sinon un frère. La feuille ne décide rien : l'ordre
  // des frères, la présence de « Plus tard » et le fait de chaque frère
  // arrivent tout faits (`THSeance.plusTard`, `THSeance.freresProposes`,
  // « Dernière séance » de la page d'exercice). Elle écrit seulement leurs
  // phrases, avec le formateur de la page d'exercice (`texteMeilleure`).
  // §7 quindecies.3 (52-1) — « Charge de départ » sur un exercice jamais fait ;
  // sinon « le coach décide », avec la dernière fois (« Dernière séance »).
  function texteChargeProgramme(cp) {
    if (cp.depart) return 'Charge de départ : je pars d\u2019ici la première fois, puis je décide d\u2019après tes séances.';
    var valeur = texteMeilleure(cp.fait);
    return 'Charge : je décide d\u2019après tes séances' + (valeur ? ' (dernière fois : ' + valeur + ')' : '') + '.';
  }

  function texteFaitFrere(fait) {
    if (!fait) return 'Première fois ici';
    var d = new Date(fait.date);
    var quand = M().jourMois(d, new Date().getFullYear());
    var valeur = texteMeilleure(fait);
    return valeur ? 'Dernière fois : ' + valeur + ', le ' + quand : 'Dernière fois le ' + quand;
  }

  function choixMachinePrise(menu, titre, sous, surClic) {
    var b = el('button', 'choix-mp');
    b.type = 'button';
    b.appendChild(el('span', 'mp-titre', titre));
    b.appendChild(el('span', 'mp-sous', sous));
    b.addEventListener('click', surClic);
    menu.appendChild(b);
    return b;
  }

  function rendreFeuilleMachinePrise(cible, vue) {
    vider(cible);
    var t = el('div', 'feuille-t', vue.titre || 'Machine prise');
    t.appendChild(el('em', '', vue.nom));
    cible.appendChild(t);

    if (vue.tard) {
      var tard = el('div', 'feuille-menu machine-prise');
      choixMachinePrise(tard, 'Plus tard',
        'Il passe après ' + vue.tard.apres + '. Ta consigne ne change pas.',
        vue.tard.surChoisir).classList.add('plus-tard');
      cible.appendChild(tard);
    }

    var freres = el('div', 'feuille-menu machine-prise');
    (vue.freres || []).forEach(function (f) {
      // 60-4 — un frère ÉCARTÉ reste proposé, tout à la fin, avec la mention « écarté » (MOTEUR §9.19).
      choixMachinePrise(freres, 'Un frère : ' + f.nom,
        f.ecarte ? 'écarté \u00b7 ' + texteFaitFrere(f.fait) : texteFaitFrere(f.fait), f.surChoisir)
        .classList.add('frere');
    });
    var sansFrere = !(vue.freres || []).length;
    if (sansFrere) cible.appendChild(el('p', 'feuille-aide sans-frere', 'Pas de frère au catalogue pour cet exercice.'));
    // 67A (MOTEUR §13.6 bis) — la même famille, SOUS les frères : un intitulé, puis chaque exercice avec son nom seul et
    // la même sous-ligne que les frères. Les actions (le catalogue, « Annuler ») passent alors après elle, dans leur
    // propre menu. Sans famille, la feuille est exactement celle d'avant.
    var cousins = vue.cousins || [];
    var actions = freres;
    if (cousins.length) {
      if (!sansFrere) cible.appendChild(freres);
      cible.appendChild(el('div', 'choix-groupe meme-famille-t', 'Même famille'));
      var famille = el('div', 'feuille-menu machine-prise meme-famille');
      cousins.forEach(function (f) {
        choixMachinePrise(famille, f.nom, f.ecarte ? 'écarté \u00b7 ' + texteFaitFrere(f.fait) : texteFaitFrere(f.fait),
          f.surChoisir).classList.add('cousin');
      });
      cible.appendChild(famille);
      actions = el('div', 'feuille-menu machine-prise');
    }
    // 60-3 — l'éditeur (« Remplacer ») dit « Chercher dans le catalogue », frères ou pas.
    if (sansFrere && !vue.chercher) entreeMenu(actions, 'Remplacer l’exercice', { surClic: vue.surCatalogue });
    // ES §7 quindecies.8 (60-3) — après les frères, le sélecteur d'exercices.
    if (vue.chercher) entreeMenu(actions, vue.chercher, { classe: 'chercher-catalogue', surClic: vue.surCatalogue });
    // 60-4 — depuis l'aperçu du programme construit, « Annuler » revient à l'aperçu (sans lui, la seule sortie était de
    // tout fermer, et l'aperçu avec).
    if (vue.surAnnuler) entreeMenu(actions, 'Annuler', { classe: 'annuler-remplacer', surClic: vue.surAnnuler });
    cible.appendChild(actions);
    return cible;
  }

  // ── « J'AI MAL » (MOTEUR §9.20, chantier 51) ─────────────────────────────
  //
  // La feuille ne décide rien : ses phrases viennent du moteur (la voix du
  // coach, `feuilleDouleur`) ; la marque est déjà posée quand elle s'ouvre.
  // Jamais de diagnostic, de localisation ni de conseil médical : une seule
  // phrase de sécurité, telle quelle, en bas.
  function rendreFeuilleDouleur(cible, vue) {
    vider(cible);
    var f = vue.textes;
    cible.appendChild(el('div', 'feuille-t', f.titre));
    cible.appendChild(el('p', 'feuille-aide douleur-phrase', f.phrase));
    var menu = el('div', 'feuille-menu machine-prise');
    f.choix.forEach(function (q) {
      var b = el('button', 'choix-mp douleur-' + q.cle);
      b.type = 'button';
      b.appendChild(el('span', 'mp-titre', q.texte));
      if (q.sous) b.appendChild(el('span', 'mp-sous', q.sous));
      b.addEventListener('click', function () { vue.surChoix(q.cle); });
      menu.appendChild(b);
    });
    cible.appendChild(menu);
    cible.appendChild(el('p', 'feuille-aide douleur-securite', f.securite));
    return cible;
  }

  // ⚠️ RIEN DE DESTRUCTIF EN SILENCE. Supprimer un bloc qui porte des séries
  // VALIDÉES efface du travail réellement fait : on le dit, on le compte, et on
  // demande. Sans série validée, il n'y a rien à perdre — la question serait un
  // bruit qu'on tape sans lire, exactement ce que le §6.2 reproche.
  // ⚠️ UNE SUPPRESSION ANNONCE DES LIGNES (chantier 39, C1).
  //
  // Partout ailleurs « série » veut dire série de TRAVAIL. Ici non : six lignes
  // partent, on en annonce six — sinon l'avertissement ment sur ce qu'il fait.
  // Et parce que le compte ne suit pas la même règle que les autres, il DIT
  // pourquoi : « 6 séries, dont 4 d'échauffement » vaut mieux qu'un nombre nu
  // qui se lirait comme celui du bandeau.
  //
  // Une seule phrase, deux appelants : la feuille d'exercice ou de bloc, et la
  // suppression de séance entière (`app.js`).
  function phraseEffacement(lignes, chauffes) {
    var n = lignes || 0;
    var w = chauffes || 0;
    var detail = w > 0
      ? ', dont ' + w + ' d\u2019échauffement' : '';
    return n + ' série' + (n > 1 ? 's' : '') + detail +
      ' ser' + (n > 1 ? 'ont' : 'a') + ' effacée' + (n > 1 ? 's' : '');
  }

  function rendreFeuilleSupprimer(cible, vue) {
    vider(cible);
    var t = el('div', 'feuille-t', 'Supprimer ' + vue.quoi + ' ?');
    t.appendChild(el('em', '', vue.noms));
    cible.appendChild(t);
    cible.appendChild(el('p', 'feuille-aide',
      phraseEffacement(vue.lignes, vue.chauffes) + '. Rien ne le remet en place.'));
    var menu = el('div', 'feuille-menu');
    entreeMenu(menu, 'Supprimer quand même', { classe: 'danger', surClic: vue.surConfirmer });
    entreeMenu(menu, 'Annuler', { surClic: vue.surAnnuler });
    cible.appendChild(menu);
    return cible;
  }

  // La note de l'EXERCICE (§7 septies.1). Une feuille plutôt qu'un champ sur la
  // tête de bloc : à 380 px, un champ de texte au milieu de la grille pousse
  // tout le reste et se fait taper par accident entre deux séries.
  function rendreFeuilleNote(cible, vue) {
    vider(cible);
    var t = el('div', 'feuille-t', 'Note');
    t.appendChild(el('em', '', vue.exercice));
    cible.appendChild(t);
    cible.appendChild(el('p', 'feuille-aide',
      'Elle s’écrit sur toutes les séries de cet exercice — y compris celles ajoutées ensuite.'));
    cible.appendChild(champTexte('Note de l’exercice', vue.note,
      { lignes: 3, placeholder: 'Réglage du siège, sensation, rappel…' },
      function (v) { vue.surNote(v); }));
    var f = el('button', 'principal', 'Terminé');
    f.type = 'button';
    f.addEventListener('click', vue.surFermer);
    cible.appendChild(f);
  }

  // ══ LA MOLETTE DE REPOS (§7 sexdecies) ═══════════════════════════════════
  //
  // ⚠️ UN SEUL COMPOSANT, AUX DEUX ENDROITS — éditeur de routine ET séance.
  // Il y en avait deux : une grille de huit valeurs en séance, un pavé de
  // décalage dans l'éditeur. Deux systèmes pour la même question, c'est
  // exactement ce que `CADRAGE-V2` §2 undecies interdit.
  //
  // **La molette pour le repos, le pavé de décalage pour les durées
  // d'exercice.** Un temps de repos prend un petit nombre de valeurs sensées ;
  // une durée — planche, rando, gainage — est arbitraire. Chacun là où il a du
  // sens, et `champChrono` reste le pavé des durées.
  //
  // 36 valeurs : de 5 en 5 jusqu'à 2:00 (24), puis de 15 en 15 jusqu'à 5:00
  // (12). Resserré là où la précision compte — 90 et 120 secondes ne sont pas
  // la même chose — large au-delà, où le quart de minute suffit.
  var PAS_FIN = 5, FIN_MAX = 120, PAS_LARGE = 15, LARGE_MAX = 300;
  var VALEURS_REPOS = (function () {
    var v = [], s;
    for (s = PAS_FIN; s <= FIN_MAX; s += PAS_FIN) v.push(s);
    for (s = FIN_MAX + PAS_LARGE; s <= LARGE_MAX; s += PAS_LARGE) v.push(s);
    return v;
  }());

  // La hauteur d'une entrée, en pixels. Elle est dans le CSS ET ici, et c'est
  // assumé : le défilement se mesure en pixels, la sélection se calcule en
  // rangs. Les deux doivent s'accorder, donc la valeur est nommée une fois de
  // chaque côté — `.molette .opt{height:48px}` dans `styles.css`.
  var HAUTEUR_OPT = 48;

  // ⚠️ PAR ARITHMÉTIQUE DE RANG, PAS PAR `offsetTop`. Avec `scroll-snap`, le
  // défilement s'arrête toujours sur un multiple de la hauteur : l'index EST le
  // quotient. Mesurer la position de chaque nœud donnerait le même résultat en
  // plus fragile — et ne se testerait pas hors navigateur, où toute géométrie
  // vaut zéro.
  function indexCentre(defilement) {
    var i = Math.round((Number(defilement) || 0) / HAUTEUR_OPT);
    return Math.max(0, Math.min(VALEURS_REPOS.length - 1, i));
  }

  // Le rang de départ. Une valeur qui n'est pas dans la liste — 3:20 tapé au
  // pavé avant ce chantier, ou une valeur hors bornes — se centre sur la plus
  // PROCHE : la molette montre alors ce que « Valider » écrirait, ce qui est la
  // leçon de la mutation M7 (chantier 41) appliquée à un autre écran.
  //
  // Sans repos programmé, on se centre sur 1:30 : il faut bien se poser
  // quelque part, et c'est le repos le plus courant. Rien n'est écrit tant
  // qu'on n'a pas tapé « Valider » — le défaut est visible, pas silencieux.
  var REPOS_DEFAUT = 90;
  function rangDeRepos(secondes) {
    var v = (secondes === null || secondes === undefined || !isFinite(secondes))
      ? REPOS_DEFAUT : Number(secondes);
    var meilleur = 0, ecart = Infinity;
    VALEURS_REPOS.forEach(function (x, i) {
      var d = Math.abs(x - v);
      if (d < ecart) { ecart = d; meilleur = i; }
    });
    return meilleur;
  }

  // « 45 s » sous la minute, « 1:30 » au-dessus. Sous la minute, `0:45` se lit
  // moins vite qu'un nombre de secondes ; au-dessus, l'horloge gagne.
  function libelleRepos(s) { return s < 60 ? s + ' s' : mmss(s); }

  // ⚠️ ELLE VIT DANS UNE FEUILLE, JAMAIS EN LIGNE DANS LA LISTE (§7 sexdecies.4).
  // La molette est glissante, et le glissement vertical a déjà coûté trois
  // chantiers (§7 terdecies bis). Par-dessus l'écran, rien ne défile derrière —
  // c'est ce qui la rend sûre, et ce n'est pas un détail de présentation.
  //
  // Trois sorties, et elles ne disent pas la même chose :
  //   Valider     → la valeur CENTRÉE ;
  //   Annuler     → rien ne change ;
  //   Désactiver  → `NULL`, jamais zéro (`routine_exos_repos_borne` commence à
  //                 5 s, et « 0:00 de repos » serait une prescription).
  function rendreFeuilleRepos(cible, vue) {
    vider(cible);
    var t = el('div', 'feuille-t', 'Temps de repos');
    t.appendChild(el('em', '', vue.exercice));
    cible.appendChild(t);
    if (vue.aide) cible.appendChild(el('p', 'feuille-aide', vue.aide));

    var molette = el('div', 'molette');
    molette.appendChild(el('div', 'selection'));
    var piste = el('div', 'piste');
    piste.setAttribute('role', 'listbox');
    piste.setAttribute('aria-label', 'Temps de repos');

    var rang = rangDeRepos(vue.repos);
    var options = VALEURS_REPOS.map(function (v) {
      var o = el('div', 'opt', libelleRepos(v));
      o.dataset.v = String(v);
      o.setAttribute('role', 'option');
      o.setAttribute('aria-label', libelleRepos(v));
      piste.appendChild(o);
      return o;
    });

    function marquer(i) {
      piste.dataset.rang = String(i);
      options.forEach(function (o, k) {
        var d = Math.abs(k - i);
        o.className = 'opt' + (d === 0 ? ' sel' : d === 1 ? ' pres' : ' eteint');
        o.setAttribute('aria-selected', d === 0 ? 'true' : 'false');
      });
    }
    marquer(rang);
    piste.addEventListener('scroll', function () { marquer(indexCentre(piste.scrollTop)); });
    molette.appendChild(piste);
    cible.appendChild(molette);
    // Le positionnement initial est une conséquence de l'état, pas un geste :
    // on le pose après l'insertion, sinon le nœud n'a pas encore de hauteur.
    piste.scrollTop = rang * HAUTEUR_OPT;

    var pied = el('div', 'feuille-pied');
    var des = el('button', 'des', 'Désactiver');
    des.type = 'button';
    des.addEventListener('click', function () { vue.surDesactiver(); });
    pied.appendChild(des);
    var ann = el('button', 'sec', 'Annuler');
    ann.type = 'button';
    ann.addEventListener('click', function () { vue.surAnnuler(); });
    pied.appendChild(ann);
    var val = el('button', 'pri', 'Valider');
    val.type = 'button';
    val.addEventListener('click', function () {
      vue.surValider(VALEURS_REPOS[Number(piste.dataset.rang) || 0]);
    });
    pied.appendChild(val);
    cible.appendChild(pied);
    return cible;
  }

  // Une ligne d'écart, en français : ce qui change, pas un nom de colonne.
  // Les écarts de STRUCTURE (§6.2) parlent de la séance entière — ils n'ont pas
  // de nom d'exercice à porter, et en inventer un serait faux.
  function libelleEcart(e) {
    if (e.type === 'repos') {
      return e.nom + ' — repos ' + (e.avant ? mmss(e.avant) : '—') +
        ' → ' + (e.apres ? mmss(e.apres) : '—');
    }
    if (e.type === 'note') return e.nom + (e.apres ? ' — note' : ' — note retirée');
    if (e.type === 'ajoute') return e.nom + ' — ajouté';
    if (e.type === 'retire') return e.nom + ' — retiré';
    if (e.type === 'ordre') return 'L’ordre des exercices a changé';
    if (e.type === 'groupement') return 'Le groupement en superset a changé';
    return e.nom || '';
  }

  // ══ ORGANISER SES ROUTINES (ECRAN-SAISIE §7 duodecies.3, §7 quindecies.4) ══
  //
  // ⚠️ CES FEUILLES NE DÉCIDENT RIEN. La structure vient de
  // `THRoutines.routineDepuisSeance`, les écarts de `THSeance.ecartsRoutine`,
  // le nom de `THRoutines.nomLibre` : ici, on ne pose que des mots sur ce qu'on
  // reçoit. Les repos sont des valeurs par défaut et leur origine se dit.

  function pluriel(n, mot) { return grand(n) + ' ' + mot + (n > 1 ? 's' : ''); }

  // L'origine d'un repos, en français : « par défaut », ou la routine d'où il
  // vient. Dans un superset, le repos est porté par le dernier exercice : les
  // autres n'en disent rien.
  function texteOrigine(o) {
    if (!o || o === R().ORIGINE_SUPERSET) return '';
    if (o === R().ORIGINE_DEFAUT) return 'par défaut';
    if (o === R().ORIGINE_RACCOURCI) return 'raccourci pour tenir ta durée';
    return 'ta routine « ' + o + ' »';
  }

  // Ce qu'annonce une ligne d'aperçu : la structure (chauffes, séries,
  // dégressives — ou la durée d'un cardio), puis le repos et son origine.
  // `series` au vocabulaire de la saisie (`reps`) ou de la cible (`reps_visees`).
  function resumeStructure(series, repos, origine) {
    var ch = 0, deg = 0, rec = 0, travail = [], duree = null;
    (series || []).forEach(function (x) {
      var t = (x && x.type_serie) || 'travail';
      if (t === 'echauffement') { ch++; return; }
      if (t === 'degressive') { deg++; return; }
      if (t === 'recul') { rec++; return; }   // 193-1 — « 1 × 4 · 3 reculs » : la grosse série, puis ses reculs
      var r = x.reps !== undefined ? x.reps : x.reps_visees;
      travail.push(r === undefined ? null : r);
      var d = x.duree_s !== undefined ? x.duree_s : x.duree_cible_s;
      if (duree === null && d !== null && d !== undefined) duree = Number(d);
    });
    var parts = [];
    if (ch) parts.push(pluriel(ch, 'chauffe'));
    if (travail.length) {
      var memes = travail[0] !== null && travail.every(function (r) { return r === travail[0]; });
      // 119 (audit du 16/10/2026, E10) — une durée s'écrit en durée (« 20 s », « 1 min 30 »), jamais « 0 min ».
      if (duree !== null && travail.length === 1) parts.push(M().formatDuree(duree));
      else parts.push(memes ? travail.length + ' \u00d7 ' + travail[0] : pluriel(travail.length, 'série'));
    }
    if (rec) parts.push(pluriel(rec, 'recul'));
    if (deg) parts.push(pluriel(deg, 'dégressive'));
    if (repos !== null && repos !== undefined) {
      var o = texteOrigine(origine);
      parts.push('repos ' + mmss(repos) + (o ? ' (' + o + ')' : ''));
    }
    return parts.join(' \u00b7 ');
  }

  // L'écart `series` (« Mettre à jour » seulement) : « 4 → 5 séries (dont 1
  // dégressive) », et les chauffes à part quand elles changent.
  function texteChangementSeries(e) {
    var a = e.avant || {}, b = e.apres || {};
    var parts = [];
    if (a.series !== b.series) {
      parts.push(a.series + ' \u2192 ' + pluriel(b.series, 'série') +
        (b.degressives ? ' (dont ' + pluriel(b.degressives, 'dégressive') + ')' : ''));
    }
    if (a.chauffes !== b.chauffes) parts.push(a.chauffes + ' \u2192 ' + pluriel(b.chauffes, 'chauffe'));
    return parts.length ? parts.join(' \u00b7 ') : 'séries modifiées';
  }

  function ligneDApercu(liste, gauche, droite, classe) {
    var r = el('div', 'apercu-ligne' + (classe ? ' ' + classe : ''));
    r.appendChild(el('span', 'apercu-nom', gauche));
    r.appendChild(el('span', 'apercu-texte', droite || ''));
    liste.appendChild(r);
  }

  // « En faire une routine » : une nouvelle, ou mettre à jour une existante.
  function rendreFeuilleEnFaireUneRoutine(cible, vue) {
    vider(cible);
    var t = el('div', 'feuille-t', 'En faire une routine');
    if (vue.sujet) t.appendChild(el('em', '', vue.sujet));
    cible.appendChild(t);
    var menu = el('div', 'feuille-menu choix-en-routine');
    choixMachinePrise(menu, 'Une nouvelle routine', 'À partir de cette séance', vue.surNouvelle);
    if (vue.surMettreAJour) {
      choixMachinePrise(menu, 'Mettre à jour une routine', 'Choisir laquelle, puis voir les changements',
        vue.surMettreAJour);
    }
    entreeMenu(menu, 'Annuler', { surClic: vue.surAnnuler });
    cible.appendChild(menu);
    return cible;
  }

  // Le champ « Dossier » : un bouton qui ouvre le choix, partout le même.
  function champDossier(dossier, surClic) {
    var d = el('button', 'champ-dossier');
    d.type = 'button';
    d.appendChild(el('span', 'champ-dossier-k', 'Dossier'));
    d.appendChild(el('span', 'champ-dossier-v', (dossier || 'Sans dossier') + ' \u25be'));
    d.addEventListener('click', surClic);
    return d;
  }

  // L'aperçu d'une routine neuve, avant « Créer la routine ». `lignes` :
  // `[{ nom, series, repos, origine }]`, la structure telle qu'elle sera écrite.
  function rendreApercuRoutine(cible, vue) {
    vider(cible);
    cible.appendChild(el('div', 'feuille-t', 'Nouvelle routine : aperçu'));
    var champs = el('div', 'champs-fin');
    champs.appendChild(champTexte('Nom', vue.nom, { max: R().NOM_MAX }, vue.surNom));
    cible.appendChild(champs);
    cible.appendChild(champDossier(vue.dossier, vue.surDossier));
    var liste = el('div', 'apercu-routine');
    (vue.lignes || []).forEach(function (l) {
      ligneDApercu(liste, l.nom, resumeStructure(l.series, l.repos, l.origine));
    });
    cible.appendChild(liste);
    cible.appendChild(el('p', 'feuille-aide',
      'Les reps sont des repères de départ ; les charges, c\u2019est moi qui te les propose à chaque séance.'));
    var err = el('p', 'erreur', vue.erreur || '');
    err.setAttribute('role', 'alert');
    cible.appendChild(err);
    var menu = el('div', 'feuille-menu');
    entreeMenu(menu, 'Créer la routine', { classe: 'accent-menu', surClic: vue.surCreer });
    entreeMenu(menu, 'Annuler', { surClic: vue.surAnnuler });
    cible.appendChild(menu);
    return cible;
  }

  // Quelle routine mettre à jour : la bibliothèque, dans son ordre.
  function rendreFeuilleChoixRoutine(cible, vue) {
    vider(cible);
    var t = el('div', 'feuille-t', 'Mettre à jour une routine');
    if (vue.sujet) t.appendChild(el('em', '', vue.sujet));
    cible.appendChild(t);
    var menu = el('div', 'feuille-menu');
    (vue.routines || []).forEach(function (r) {
      entreeMenu(menu, r.nom, { surClic: function () { vue.surChoix(r.id); } });
    });
    entreeMenu(menu, 'Annuler', { surClic: vue.surAnnuler });
    cible.appendChild(menu);
    return cible;
  }

  // L'aperçu de « Mettre à jour » : les écarts de `ecartsRoutine` (§6.3),
  // chacun avec ce qu'il change, et les exercices inchangés en une ligne.
  // `ecarts` : ceux de `ecartsRoutine` avec `nom` et, pour un ajout, `series`,
  // `repos`, `origine` ; `inchanges` : leurs noms.
  function rendreFeuilleMajRoutine(cible, vue) {
    vider(cible);
    var t = el('div', 'feuille-t', 'Mettre à jour');
    t.appendChild(el('em', '', '« ' + (vue.nom || '') + ' »'));
    cible.appendChild(t);
    var ecarts = vue.ecarts || [];
    if (!ecarts.length) {
      cible.appendChild(el('p', 'feuille-aide',
        'Cette séance a déjà la structure de cette routine : rien à mettre à jour.'));
      var m0 = el('div', 'feuille-menu');
      entreeMenu(m0, 'Fermer', { surClic: vue.surAnnuler });
      cible.appendChild(m0);
      return cible;
    }
    var liste = el('div', 'apercu-routine');
    ecarts.forEach(function (e) {
      if (e.type === 'ajoute') ligneDApercu(liste, '+ ' + e.nom, resumeStructure(e.series, e.repos, e.origine), 'plus');
      // Un tiret (pas le signe moins du formateur : ce n'est pas un nombre).
      else if (e.type === 'retire') ligneDApercu(liste, '\u2013 ' + e.nom, 'retiré', 'moins');
      else if (e.type === 'series') ligneDApercu(liste, e.nom, texteChangementSeries(e));
      else ligneDApercu(liste, libelleEcart(e), '');
    });
    if ((vue.inchanges || []).length) {
      ligneDApercu(liste, vue.inchanges.join(', '), vue.inchanges.length > 1 ? 'inchangés' : 'inchangé');
    }
    cible.appendChild(liste);
    cible.appendChild(el('p', 'feuille-aide',
      'Tes repos et tes notes restent ceux de ta routine. Aucune charge n\u2019est écrite.'));
    var menu = el('div', 'feuille-menu');
    entreeMenu(menu, 'Mettre à jour la routine', { classe: 'accent-menu', surClic: vue.surMettreAJour });
    entreeMenu(menu, 'Annuler', { surClic: vue.surAnnuler });
    cible.appendChild(menu);
    return cible;
  }

  // Le dossier d'une routine : « Sans dossier », un dossier existant, ou un
  // nouveau nom. Une étiquette, rien de plus (§7 duodecies.3).
  function rendreFeuilleDossier(cible, vue) {
    vider(cible);
    var t = el('div', 'feuille-t', 'Dossier');
    if (vue.sujet) t.appendChild(el('em', '', vue.sujet));
    cible.appendChild(t);
    var menu = el('div', 'feuille-menu');
    var actuel = vue.actuel === undefined ? null : vue.actuel;
    entreeMenu(menu, 'Sans dossier', { classe: actuel === null ? 'sel' : '',
      surClic: function () { vue.surChoix(null); } });
    (vue.dossiers || []).forEach(function (d) {
      entreeMenu(menu, d, { classe: actuel === d ? 'sel' : '', surClic: function () { vue.surChoix(d); } });
    });
    cible.appendChild(menu);
    var saisi = '';
    var champs = el('div', 'champs-fin');
    champs.appendChild(champTexte('Nouveau dossier', '',
      { max: R().DOSSIER_MAX, placeholder: 'Programme force, Prise de masse…' }, function (v) { saisi = v; }));
    cible.appendChild(champs);
    var err = el('p', 'erreur', vue.erreur || '');
    err.setAttribute('role', 'alert');
    cible.appendChild(err);
    var pied = el('div', 'feuille-menu');
    entreeMenu(pied, 'Ranger dans ce nouveau dossier', { surClic: function () { vue.surNouveau(saisi); } });
    entreeMenu(pied, 'Annuler', { surClic: vue.surAnnuler });
    cible.appendChild(pied);
    return cible;
  }

  // 155 — le menu d'un dossier : une entrée, « Renommer le dossier ».
  function rendreFeuilleMenuDossier(cible, vue) {
    vider(cible);
    var t = el('div', 'feuille-t', 'Dossier');
    t.appendChild(el('em', '', vue.dossier));
    cible.appendChild(t);
    var menu = el('div', 'feuille-menu');
    entreeMenu(menu, 'Renommer le dossier', { classe: 'renommer-dossier', surClic: vue.surRenommer });
    entreeMenu(menu, 'Annuler', { surClic: vue.surAnnuler });
    cible.appendChild(menu);
    return cible;
  }

  // 155 — « Renommer le dossier » : le nom prérempli, la phrase de ce qui suit, ou la raison du refus (le bouton
  // reste ÉTEINT). `vue.verdict(texte)` -> { ok, message, phrase } ; le dessin se met à jour SANS se refaire
  // (le champ garde le focus).
  function rendreFeuilleRenommerDossier(cible, vue) {
    vider(cible);
    cible.appendChild(el('div', 'feuille-t', 'Renommer le dossier'));
    var saisi = vue.nom;
    var champs = el('div', 'champs-fin');
    champs.appendChild(champTexte('Nom', vue.nom, { max: R().DOSSIER_MAX }, function (v) { saisi = v; maj(); }));
    cible.appendChild(champs);
    var aide = el('p', 'feuille-aide renommer-aide', '');
    cible.appendChild(aide);
    var err = el('p', 'erreur', vue.erreur || '');
    err.setAttribute('role', 'alert');
    cible.appendChild(err);
    var menu = el('div', 'feuille-menu');
    var bouton = el('button', 'accent-menu renommer-valider', 'Renommer');
    bouton.type = 'button';
    bouton.addEventListener('click', function () { if (!bouton.disabled) vue.surRenommer(saisi); });
    menu.appendChild(bouton);
    entreeMenu(menu, 'Annuler', { surClic: vue.surAnnuler });
    cible.appendChild(menu);
    function maj() {
      var d = vue.verdict(saisi);
      bouton.disabled = !d.ok;
      bouton.classList.toggle('inerte', !d.ok);
      aide.textContent = d.phrase || '';
      err.textContent = d.ok ? '' : d.message;
    }
    maj();
    if (vue.erreur) err.textContent = vue.erreur;
    return cible;
  }

  // Dupliquer : une copie complète, dans le même dossier, sous un nom libre.
  function rendreFeuilleDupliquer(cible, vue) {
    vider(cible);
    var t = el('div', 'feuille-t', 'Dupliquer');
    if (vue.sujet) t.appendChild(el('em', '', vue.sujet));
    cible.appendChild(t);
    cible.appendChild(el('p', 'feuille-aide',
      'Une copie complète, dans le même dossier, que tu modifies sans toucher à l\u2019originale.'));
    var champs = el('div', 'champs-fin');
    champs.appendChild(champTexte('Nom', vue.nom, { max: R().NOM_MAX }, vue.surNom));
    cible.appendChild(champs);
    var err = el('p', 'erreur', vue.erreur || '');
    err.setAttribute('role', 'alert');
    cible.appendChild(err);
    var menu = el('div', 'feuille-menu');
    entreeMenu(menu, 'Dupliquer', { classe: 'accent-menu', surClic: vue.surDupliquer });
    entreeMenu(menu, 'Annuler', { surClic: vue.surAnnuler });
    cible.appendChild(menu);
    return cible;
  }

  // 147 (23/10/2026) — UNE SÉANCE TROP LONGUE : un fait, pas un reproche. Deux phrases au plus (la seconde seulement
  // si « Terminer à <heure> » est proposable), deux choix, et « Revenir à la séance » qui n'écrit rien.
  function rendreFeuilleDuree(cible, vue) {
    vider(cible);
    cible.appendChild(el('div', 'feuille-t', 'Ta séance dure ' + vue.duree + '.'));
    if (vue.derniere) cible.appendChild(el('p', 'feuille-aide', 'Ta dernière série date de ' + vue.derniere + '.'));
    var b1 = el('button', 'principal', vue.surTerminerA ? 'Terminer à ' + vue.derniere : 'Garder ' + vue.duree);
    b1.type = 'button';
    b1.setAttribute('data-choix', vue.surTerminerA ? 'terminer-a' : 'garder');
    b1.addEventListener('click', vue.surTerminerA || vue.surGarder);
    cible.appendChild(b1);
    if (vue.surTerminerA) {
      var b2 = el('button', 'discret bloc-large', 'Garder ' + vue.duree);
      b2.type = 'button';
      b2.setAttribute('data-choix', 'garder');
      b2.addEventListener('click', vue.surGarder);
      cible.appendChild(b2);
    }
    var b3 = el('button', 'discret bloc-large', 'Revenir à la séance');
    b3.type = 'button';
    b3.setAttribute('data-choix', 'revenir');
    b3.addEventListener('click', vue.surRevenir);
    cible.appendChild(b3);
    return cible;
  }

  function rendreFeuilleFin(cible, vue) {
    vider(cible);
    var t = el('div', 'feuille-t', 'Terminer la séance');
    // `travail`, pas `validees` — même règle que le bandeau (chantier 39, C1).
    var nF = vue.compte.travail;
    // 119 (audit du 16/10/2026, E12) — UNE SÉANCE DE CARDIO SEUL dit ce qui part : « 1 série enregistrée · 20 min ·
    // 3,2 km », jamais « 0 série de travail enregistrée ».
    var hm = vue.compte.horsMusculation;
    if (!nF && hm && hm.series) {
      var quoi = [M().formatDistance(hm.distance_m), M().formatDuree(hm.duree_s)].filter(Boolean);  // 131b
      t.appendChild(el('em', '', [hm.series + ' série' + (hm.series > 1 ? 's' : '') + ' enregistrée' +
        (hm.series > 1 ? 's' : '')].concat(quoi).join(' \u00b7 ')));
    } else {
      t.appendChild(el('em', '', nF + ' série' + (nF > 1 ? 's' : '') +
        ' de travail enregistrée' + (nF > 1 ? 's' : '')));
    }
    // 137 (audit du 16/10, E12 ; ECRAN-SAISIE §7 septies.4) — UNE SÉANCE SANS SÉRIE VALIDÉE NE SE TERMINE PAS : elle
    // s'abandonne. « Vide » est décidé par l'appelant (la règle de l'abandon) ; ici on le dit, sans titre, salle,
    // note, question de routine ni case facultative. Rien n'est perdu : l'abandon est immédiat.
    if (vue.vide) {
      var tv = el('div', 'feuille-t', 'Terminer la séance');
      cible.appendChild(tv);
      cible.appendChild(el('p', 'feuille-aide', 'Aucune série validée : rien à enregistrer.'));
      var nR = vue.remplies || 0;
      if (nR) {
        cible.appendChild(el('p', 'feuille-aide', nR > 1
          ? nR + ' séries remplies ne sont pas validées.'
          : '1 série remplie n\u2019est pas validée.'));
        var bv = el('button', 'principal', 'Les valider');
        bv.type = 'button';
        bv.addEventListener('click', vue.surValider);
        cible.appendChild(bv);
        var av = el('button', 'discret bloc-large danger', 'Abandonner');
        av.type = 'button';
        av.addEventListener('click', vue.surAbandonner);
        cible.appendChild(av);
      } else {
        var ab = el('button', 'principal', 'Abandonner');
        ab.type = 'button';
        ab.addEventListener('click', vue.surAbandonner);
        cible.appendChild(ab);
        var co = el('button', 'discret bloc-large', 'Continuer la séance');
        co.type = 'button';
        co.addEventListener('click', vue.surContinuer);
        cible.appendChild(co);
      }
      return cible;
    }
    cible.appendChild(t);

    // ECRAN §7 septies.4 (prompt 131, maquette mesures-cardio écran 6) — UNE donnée facultative restée vide : sa
    // phrase, la série, la case. Rien d'obligatoire : laissée vide, « Terminer » ne demande rien de plus.
    if (vue.manque) {
      var mq = el('div', 'manque-fin');
      mq.appendChild(el('p', 'manque-fin-t', vue.manque.phrase));
      var rang = el('div', 'manque-fin-l');
      rang.appendChild(el('span', 'manque-fin-s', vue.manque.serie));
      var caseFin = champSerie('rp-serie num', vue.manque.valeur, null, vue.manque.unite, vue.manque.surSaisie,
        { max: vue.manque.max });
      caseFin.setAttribute('data-champ', vue.manque.champ);
      rang.appendChild(caseFin);
      mq.appendChild(rang);
      cible.appendChild(mq);
    }

    // 71 (ECRAN-SAISIE §7 septies.4 bis) — LA FEUILLE DÉCLARE, LE RÉCAP CONSTATE. Les records du jour et le
    // bloc « Le jeu » ont quitté cette feuille : ils passent au récap (`rendreRecap`), juste après « Terminer ».

    // §7 septies.4 — trois champs déclarés, pas déduits. La salle surtout :
    // elle se déclare, on ne la devine ni du réseau ni d'une position.
    var champs = el('div', 'champs-fin');
    champs.appendChild(champTexte('Titre', vue.titre,
      { placeholder: 'Séance' }, vue.surTitre));
    champs.appendChild(champTexte('Salle', vue.salle,
      { max: vue.salleMax, placeholder: 'Où t’es-tu entraîné ?' }, vue.surSalle));
    champs.appendChild(champTexte('Note de séance', vue.note,
      { lignes: 3, placeholder: 'Comment ça s’est passé ?' }, vue.surNoteSeance));
    cible.appendChild(champs);

    // ⚠️ UNE SEULE QUESTION, ET SEULEMENT S'IL Y A UN ÉCART (§6.2).
    //
    // « Une séance conforme n'ouvre aucune question, sinon la question devient
    // un bruit qu'on tape sans lire. » Le défaut par défaut est de NE PAS
    // toucher la routine : c'est le geste qui a le moins de conséquences, et il
    // est réversible d'un aller dans l'éditeur.
    if (vue.ecarts && vue.ecarts.length) {
      var q = el('div', 'question-routine');
      q.appendChild(el('p', 'question-t',
        'Cette séance s’écarte de « ' + vue.routine + ' ».'));
      var liste = el('ul', 'ecarts');
      vue.ecarts.forEach(function (e) { liste.appendChild(el('li', null, libelleEcart(e))); });
      q.appendChild(liste);

      var choix = el('div', 'choix-routine');
      [[false, 'Garder la routine'], [true, 'Reporter sur la routine']].forEach(function (c) {
        var b = el('button', !!vue.majRoutine === c[0] ? 'sel' : '', c[1]);
        b.type = 'button';
        b.setAttribute('aria-pressed', !!vue.majRoutine === c[0] ? 'true' : 'false');
        b.addEventListener('click', function () { vue.surMajRoutine(c[0]); });
        choix.appendChild(b);
      });
      q.appendChild(choix);
      cible.appendChild(q);
    }

    var b = el('button', 'principal', 'Terminer');
    b.type = 'button';
    b.addEventListener('click', vue.surTerminer);
    cible.appendChild(b);

    // Abandonner SUPPRIME la séance — et le dit, parce que c'est irréversible.
    var a = el('button', 'discret bloc-large danger', 'Abandonner et tout effacer');
    a.type = 'button';
    a.addEventListener('click', vue.surAbandonner);
    cible.appendChild(a);
  }

  // ══ LE RÉCAP DE FIN DE SÉANCE (71, ECRAN-SAISIE §7 septies.4 bis, maquette v3) ══
  //
  // Dans l'ordre de L1 : l'en-tête, quatre chiffres, la comparaison, les séries par muscle, les records (or),
  // ce que le coach avait visé (ambre), le jeu (le bloc 64B tel quel), la note, « Fermer » et « Voir la
  // séance ». ⚠️ UN BLOC SANS MATIÈRE N'APPARAÎT PAS : pas de « 0 record », pas de bloc vide. Aucun « bravo ».
  // Ce rendu ne calcule rien : `vue.recap` vient de `faits.recapDeLaSeance`.
  function rendreRecap(cible, vue) {
    if (!cible) return;
    vider(cible);
    var r = vue.recap || {};
    cible.appendChild(el('h2', 'recap-titre', r.titre || 'Séance'));
    cible.appendChild(el('div', 'recap-quand', M().plageDeSeance(r.debut, r.fin)));

    var tuiles = el('div', 'recap-tuiles');
    var tuile = function (valeur, libelle) {
      var t = el('div', 'recap-tuile');
      t.appendChild(el('b', null, valeur));
      t.appendChild(el('span', null, libelle));
      tuiles.appendChild(t);
    };
    // La durée en minutes (« 45 min »), en heures au-delà (« 1 h 03 ») — jamais en secondes.
    var dm = r.duree_min;
    tuile(dm === null || dm === undefined ? '\u2014' : dm < 60 ? dm + ' min' : M().formatDuree(dm * 60), 'durée');
    tuile(String(r.series || 0), 'séries');
    tuile(r.volume_texte, 'volume');
    tuile(String(r.exercices || 0), 'exercices');
    cible.appendChild(tuiles);
    if (r.phraseVolume) cible.appendChild(el('p', 'recap-comp', r.phraseVolume));

    var groupe = function (texte, classe) {
      var g = el('div', 'recap-groupe' + (classe ? ' ' + classe : ''));
      g.appendChild(el('i', 'recap-point'));
      g.appendChild(doc.createTextNode(texte));
      cible.appendChild(g);
      return g;
    };

    // Les séries par muscle : les cinq premiers, puis « N autres » et leur somme. Barres grises.
    var mu = r.muscles || { premiers: [], autres: null };
    if (mu.premiers.length) {
      groupe('Séries par muscle');
      var lignes = mu.premiers.map(function (m) { return { libelle: m.libelle, series: m.series }; });
      if (mu.autres) lignes.push({ libelle: mu.autres.n + (mu.autres.n > 1 ? ' autres' : ' autre'), series: mu.autres.series });
      var max = 0;
      lignes.forEach(function (l) { if (l.series > max) max = l.series; });
      lignes.forEach(function (l) {
        var ligne = el('div', 'recap-mu');
        ligne.appendChild(el('span', null, l.libelle));
        var barre = el('i');
        barre.style.width = (max ? Math.max(4, Math.round(l.series / max * 100)) : 0) + '%';
        ligne.appendChild(barre);
        ligne.appendChild(el('b', null, nombreFr(l.series)));
        cible.appendChild(ligne);
      });
    }

    // 119 (audit du 16/10/2026, E12) — LE CARDIO ET LES SORTIES : ni séries de travail ni volume, mais faits. Le récap
    // dit ce qui a été fait, exercice par exercice, dans sa mesure (« Tapis de course · 20 min · 3,2 km »).
    if (r.cardio && r.cardio.length) {
      groupe('Cardio');
      r.cardio.forEach(function (x) {
        var ligne = el('div', 'recap-cardio');
        ligne.appendChild(el('span', 'n', x.nom));
        ligne.appendChild(el('span', 'v', x.fait));
        cible.appendChild(ligne);
      });
    }

    // Les records du jour (or) : une ligne par série médaillée, la phrase de la médaille.
    if (r.records && r.records.length) {
      groupe(r.records.length + (r.records.length > 1 ? ' records' : ' record'), 'or');
      r.records.forEach(function (x) {
        var rec = el('div', 'recap-rec');
        rec.appendChild(el('div', 'l1', x.nom + ' : ' + x.mesure));
        var p = x.phrase || [];
        var texte = [p[0], p[1]].filter(Boolean).join(' ');
        if (texte) rec.appendChild(el('div', 'l2', texte));
        cible.appendChild(rec);
      });
    }

    // Ce que le coach avait visé (ambre) : la phrase aux chiffres tels quels, puis une ligne par exercice.
    if (r.paris && r.paris.verifies) {
      groupe('Ce que le coach avait visé', 'coach');
      cible.appendChild(el('p', 'recap-voix', r.paris.phrase));
      r.paris.lignes.forEach(function (l) {
        var ligne = el('div', 'recap-pari');
        ligne.appendChild(el('span', 'n', l.nom));
        ligne.appendChild(el('span', 'v' + (l.vise ? ' pe' : ''), l.fait + (l.vise ? ' \u00b7 visé ' + l.vise : '')));
        cible.appendChild(ligne);
      });
    }

    // 64B (JEU-V1 §9.4) — le bloc « Le jeu », tel quel. Un rendu qui échouerait ne coûte que son bloc.
    if (vue.jeu) {
      try {
        var bj = blocJeuFin(vue.jeu);
        if (bj) cible.appendChild(bj);
      } catch (e) { /* pas de bloc */ }
    }

    if (r.note) {
      groupe('Ta note');
      cible.appendChild(el('p', 'recap-note', r.note));
    }

    var f = el('button', 'principal recap-bouton recap-fermer', 'Fermer');
    f.type = 'button';
    f.addEventListener('click', vue.surFermer);
    cible.appendChild(f);
    var v = el('button', 'discret recap-bouton recap-voir', 'Voir la séance');
    v.type = 'button';
    v.addEventListener('click', vue.surVoir);
    cible.appendChild(v);
    return cible;
  }

  // 115 (audit du 16/10, E2 ; décision D10) — LE TOAST « SÉRIE SUPPRIMÉE · ANNULER ». Fixe, au-dessus de la barre
  // de repos et du pied (styles.css), le modèle du bandeau « Une nouvelle version est prête » (88) : un fait, un
  // geste. `vue` nulle : il se cache. Le délai et ce qu'« Annuler » remet vivent dans `app.js`.
  function rendreToastAnnuler(cible, vue) {
    if (!cible) return null;
    vider(cible);
    if (!vue) { cible.hidden = true; return cible; }
    cible.appendChild(el('span', 'toast-t', vue.texte));
    var b = el('button', 'toast-b', vue.libelle || 'Annuler');
    b.type = 'button';
    b.addEventListener('click', vue.surAnnuler);
    cible.appendChild(b);
    cible.hidden = false;
    return cible;
  }

  function message(cible, texte, genre) {
    vider(cible);
    cible.appendChild(el('p', genre === 'erreur' ? 'erreur' : 'vide', texte));
  }

  // ── La bibliothèque de routines (chantier 21) ───────────────────────────

  function R() { return racine.THRoutines; }

  // ══ LE BANDEAU DE REPRISE (§7 nonies, §7 octodecies.3) ═══════════════════
  //
  // ⚠️ UN SEUL COMPOSANT POUR DEUX SUJETS. La séance en cours (§7 nonies) et le
  // brouillon de routine (§7 octodecies.3) posent la MÊME question : « il reste
  // quelque chose d'ouvert, veux-tu le reprendre ou en finir ? ». Deux
  // bandeaux, c'était la duplication du §2 undecies avant même de l'avoir
  // écrite — celle du repos a coûté un chantier entier.
  //
  // Ce qui varie est donné par l'appelant : le QUOI (« Routine en cours
  // d'édition »), le sujet (son nom), et le libellé de la seconde action —
  // « Abandonner » pour un brouillon, « Terminer » pour une séance. Le
  // mécanisme, lui, ne varie pas.
  //
  // ⚠️ L'ANCIENNETÉ VIENT DE L'APPELANT, elle ne se calcule pas ici : `rendu.js`
  // ne lit pas l'horloge. `Modele.anciennete` la formate, et se teste sans
  // attendre.
  //
  // ⚠️ RIEN N'EST DESTRUCTIF AU TAP. « Abandonner » ne fait qu'APPELER son
  // gestionnaire ; c'est l'appelant qui demande confirmation. Un bandeau qui
  // efface un brouillon de trois jours au premier tap serait le pire endroit
  // pour un geste irréversible.
  function rendreBandeauReprise(cible, vue) {
    vider(cible);
    if (!vue || !vue.quoi) { cible.hidden = true; return cible; }
    cible.hidden = false;
    var b = el('div', 'bandeau-reprise');

    var t = el('div', 'reprise-t');
    t.appendChild(el('span', 'reprise-quoi', vue.quoi));
    if (vue.sujet) t.appendChild(el('em', 'reprise-sujet', vue.sujet));
    b.appendChild(t);
    if (vue.depuis) b.appendChild(el('div', 'reprise-depuis', vue.depuis));

    var actions = el('div', 'reprise-actions');
    // 60-2a — « Abandonner » est FACULTATIF : le bandeau du questionnaire ne se
    // ferme qu'en le remplissant (QUESTIONNAIRE-COACH-V2 §2), il n'a donc que
    // « Le terminer ». Un bandeau de brouillon, lui, garde les deux boutons.
    if (typeof vue.surQuitter === 'function') {
      var quitter = el('button', 'discret', vue.libelleQuitter || 'Abandonner');
      quitter.type = 'button';
      quitter.addEventListener('click', function () { vue.surQuitter(); });
      actions.appendChild(quitter);
    }
    var reprendre = el('button', 'principal', vue.libelleReprendre || 'Reprendre');
    reprendre.type = 'button';
    reprendre.addEventListener('click', function () { vue.surReprendre(); });
    actions.appendChild(reprendre);
    b.appendChild(actions);

    cible.appendChild(b);
    return cible;
  }

  // 138 (ECRAN-PROFIL §3.5) — LA FEUILLE « COMMENT FAIRE » : installer TrainHub sur l'écran d'accueil de l'iPhone.
  // Le titre, les trois étapes et la phrase des 7 jours viennent de l'appelant (`Auth.PHRASES_IPHONE`, un seul
  // endroit) ; le « Fermer » est celui de la feuille de l'app (le voile). Le pictogramme Partager est dessiné en
  // SVG (un carré ouvert, une flèche vers le haut), jamais une image.
  function rendreFeuilleInstaller(cible, vue) {
    vider(cible);
    cible.appendChild(el('div', 'feuille-t', vue.titre));
    var liste = el('ol', 'installer-etapes');
    (vue.etapes || []).forEach(function (texte, i) {
      var li = el('li', 'installer-etape');
      li.appendChild(el('b', 'installer-n', String(i + 1)));
      var d = el('div', '', texte);
      if (i < 2) {
        var puce = el('span', 'puce-ios');
        var ico = svg('svg', 'ico-part', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
        ico.appendChild(svg('path', '', { d: i === 0 ? 'M12 3v12M8 7l4-4 4 4M6 11v9h12v-9' : 'M12 5v14M5 12h14' }));
        puce.appendChild(ico);
        puce.appendChild(doc.createTextNode(i === 0 ? ' Partager' : ' Sur l\u2019\u00e9cran d\u2019accueil'));
        d.appendChild(doc.createElement('br'));
        d.appendChild(puce);
      }
      li.appendChild(d);
      liste.appendChild(li);
    });
    cible.appendChild(liste);
    cible.appendChild(el('p', 'feuille-aide aide-sept', vue.sept));
    return cible;
  }

  // 99 (MOTEUR §9.24) — LA SEMAINE QUI DÉRAILLE. La carte lit ce que le coach a décidé (`THDeraille`) : la bande
  // de la semaine, la phrase qui parle du plan, les choix (celui mis en avant en principal) et sa raison en une
  // ligne. Après « la suite se décale », la bande montre la semaine décalée et « Démarrer ». Rien n'est calculé ici.
  // `vue` : `{ bande: [{ jour, routine }], aujourdhui (0-6), titre, phrase?, choix: [{ cle, libelle, avant? }],
  // pourquoi?, surChoix(cle) }` ou `{ bande, aujourdhui, apres: { titre, exercices: [nom], surDemarrer } }`.
  // ══ 131 (ECRAN-SAISIE §3 ter.5, maquette mesures-cardio écran 5) — « CE QUI MANQUE À TES SÉANCES » ══
  //
  // Le rendu ne calcule rien : `vue.groupes` vient du fait (`faits.ceQuiManque`), mis en mots par l'app. Par groupe :
  // l'en-tête (« RANDONNÉE · D+ · 29 SÉANCES »), 2 lignes (ou toutes, ouvert), « Voir les N autres », « Je ne sais
  // plus » ; puis « Enregistrer » et « Plus tard ». Chaque ligne : la séance et la série, et une case (sa borne).
  // `null` : la carte est cachée.
  function rendreCarteManque(cible, vue) {
    if (!cible) return cible;
    vider(cible);
    if (!vue || !vue.groupes || !vue.groupes.length) { cible.hidden = true; return cible; }
    cible.hidden = false;
    var c = el('div', 'carte-manque');
    c.appendChild(el('p', 'manque-titre', 'Ce qui manque à tes séances'));
    c.appendChild(el('p', 'manque-phrase', vue.phrase || ''));
    vue.groupes.forEach(function (g) {
      var bloc = el('div', 'manque-groupe');
      bloc.setAttribute('data-cle', g.cle);
      bloc.appendChild(el('div', 'manque-tete', g.titre));
      g.lignes.forEach(function (l) {
        var r = el('div', 'manque-ligne');
        r.setAttribute('data-serie', l.serieId);
        r.appendChild(el('span', 'manque-quoi', l.texte));
        var caseM = champSerie('rp-serie num', l.valeur, null, l.unite,
          function (v) { vue.surSaisie(l.serieId, l.seanceId, g.champ, v); }, { max: l.max });
        caseM.setAttribute('data-champ', g.champ);
        r.appendChild(caseM);
        bloc.appendChild(r);
      });
      var bas = el('div', 'manque-gestes');
      if (g.autres > 0) {
        var voir = el('button', 'discret manque-voir', 'Voir les ' + g.autres + ' autres');
        voir.type = 'button';
        voir.addEventListener('click', function () { vue.surVoir(g.cle); });
        bas.appendChild(voir);
      }
      var non = el('button', 'discret manque-refus', 'Je ne sais plus');
      non.type = 'button';
      non.addEventListener('click', function () { vue.surRefus(g.cle); });
      bas.appendChild(non);
      bloc.appendChild(bas);
      c.appendChild(bloc);
    });
    if (vue.message) c.appendChild(el('p', 'manque-message', vue.message));
    var actions = el('div', 'manque-actions');
    var ok = el('button', 'principal manque-enregistrer', 'Enregistrer');
    ok.type = 'button';
    ok.addEventListener('click', function () { vue.surEnregistrer(); });
    actions.appendChild(ok);
    var tard = el('button', 'discret manque-tard', 'Plus tard');
    tard.type = 'button';
    tard.addEventListener('click', function () { vue.surPlusTard(); });
    actions.appendChild(tard);
    c.appendChild(actions);
    cible.appendChild(c);
    return cible;
  }

  function rendreCarteSemaine(cible, vue) {
    vider(cible);
    if (!vue) { cible.hidden = true; return cible; }
    cible.hidden = false;
    var c = el('div', 'carte-semaine');
    var bande = el('div', 'semaine-bande');
    (vue.bande || []).forEach(function (j, i) {
      var b = el('div', 'semaine-jour' + (i === vue.aujourdhui ? ' aujourdhui' : '') + (j.routine ? '' : ' libre'));
      b.appendChild(el('span', 'semaine-j', j.jour));
      b.appendChild(el('span', 'semaine-r', j.routine || '—'));
      bande.appendChild(b);
    });
    c.appendChild(bande);
    if (vue.apres) {
      c.appendChild(el('p', 'semaine-titre', vue.apres.titre));
      (vue.apres.exercices || []).forEach(function (n) { c.appendChild(el('div', 'semaine-exo', n)); });
      var d = el('button', 'principal', 'Démarrer');
      d.type = 'button';
      d.addEventListener('click', function () { vue.apres.surDemarrer(); });
      c.appendChild(d);
      cible.appendChild(c);
      return cible;
    }
    c.appendChild(el('p', 'semaine-titre', vue.titre));
    if (vue.phrase) c.appendChild(el('p', 'semaine-phrase', vue.phrase));
    var actions = el('div', 'semaine-choix');
    (vue.choix || []).forEach(function (x) {
      var b = el('button', x.avant ? 'principal' : 'discret', x.libelle);
      b.type = 'button';
      b.setAttribute('data-choix', x.cle);
      b.addEventListener('click', function () { vue.surChoix(x.cle); });
      actions.appendChild(b);
    });
    c.appendChild(actions);
    if (vue.pourquoi) c.appendChild(el('p', 'semaine-pourquoi', vue.pourquoi));
    cible.appendChild(c);
    return cible;
  }

  // Le rendu reçoit des routines DÉJÀ NORMALISÉES par app.js : { id, nom,
  // archivee_a, exercices[] }. Il ne connaît pas la forme imbriquée que rend
  // PostgREST — un seul endroit traduit, et ce n'est pas ici.
  //
  // L'état vide est le cas NORMAL au premier lancement : les tables sont vides
  // en base. Une phrase qui dit quoi faire, et rien d'autre — pas d'excuse, pas
  // d'illustration, pas de « oups ».
  function rendreListeRoutines(cible, routines, vue) {
    vider(cible);
    var v = vue || {};
    var liste = R().visibles(routines);
    // ⚠️ PENDANT QU'ON RANGE, L'ORDRE VIENT DE L'ÉCRAN, PAS DE `rang` (ch. 46).
    // Rien n'est écrit tant qu'on n'a pas enregistré : re-rendre pendant le mode
    // remettrait la liste dans l'ordre de la BASE et effacerait les
    // déplacements — « annulable tant qu'on n'a pas validé » suppose que ce
    // qu'on voit survive à un rendu.
    if (v.ordre && v.ordre.length) {
      var rang = {};
      v.ordre.forEach(function (id, i) { rang[id] = i; });
      liste = liste.slice().sort(function (a, b) {
        var ra = rang[a.id], rb = rang[b.id];
        if (ra === undefined) return rb === undefined ? 0 : 1;
        if (rb === undefined) return -1;
        return ra - rb;
      });
    }

    if (!liste.length) {
      var vide = el('div', 'vide-routines');
      vide.appendChild(el('p', 'vide', 'Aucune routine pour l\u2019instant.'));
      // 54-1 (relevé 54-0) — la phrase dit le vrai : une routine peut porter
      // une charge de départ, et c'est le COACH (le mot de l'aperçu) qui décide
      // des charges. Et elle montre le chemin le plus utile avec un historique
      // importé : en faire une depuis une séance passée.
      vide.appendChild(el('p', 'vide-aide',
        'Une routine, c\u2019est une liste d\u2019exercices dans un ordre. Je décide des charges à chaque séance.'));
      var b = el('button', 'principal', 'Créer une routine');
      b.type = 'button';
      b.addEventListener('click', function () { if (v.surNouvelle) v.surNouvelle(); });
      vide.appendChild(b);
      // 60-3 (ES §7 quindecies.7) — à côté de la création : retrouver ses séances.
      if (v.surRetrouver) vide.appendChild(ligneRetrouver(v));
      // L'historique des séances, où vit « En faire une routine » (le ⋯ d'une
      // carte, le détail d'une séance).
      if (v.surDepuisSeance) {
        var ds = el('button', 'discret bloc-large depuis-seance', 'En faire une depuis une séance passée');
        ds.type = 'button';
        ds.addEventListener('click', v.surDepuisSeance);
        vide.appendChild(ds);
      }
      if (v.surSeanceVide) {
        var sv = el('button', 'discret bloc-large', 'Ou commencer une séance vide');
        sv.type = 'button';
        sv.addEventListener('click', v.surSeanceVide);
        vide.appendChild(sv);
      }
      cible.appendChild(vide);
      // 118 — même sans aucune routine, un programme en cours garde son dossier, son badge et « Arrêter ».
      programmesOrphelins(null, v).forEach(function (d) {
        var pr = v.programme ? v.programme(d) : null;
        if (pr && pr.fin) cible.appendChild(carteFinDeBloc(d, pr.fin, v));
        cible.appendChild(ligneDeDossier({ dossier: d, routines: [] }, pr, false, v));
      });
      return;
    }

    // §7 duodecies.3 (52-1) — LES DOSSIERS : la bibliothèque regroupée,
    // chaque dossier repliable, « Sans dossier » en dernier. L'ordre dans un
    // dossier est l'ordre global (`rang`). Pendant qu'on RANGE, la liste reste
    // plate : « Ranger » ne change pas, et il range l'ordre global. Sans aucun
    // dossier, rien ne change non plus — pas de « Sans dossier » seul en tête.
    var groupes = v.reorganiser ? null : R().parDossier(routines);
    // ⚠️ 118 (audit du 16/10, 03 #5) — UN PROGRAMME EN COURS GARDE SON DOSSIER, même vidé de ses routines (supprimées,
    // ou rangées ailleurs) : le bloc continuait — sa décharge, ses zones — sans badge ni « Arrêter le programme »,
    // puisque la bibliothèque ne montrait que les dossiers qui ont une routine. Le dossier reste donc là, vide, avec
    // son badge (et sa carte de fin) : le geste existant, rien de plus.
    var orphelins = v.reorganiser ? [] : programmesOrphelins(groupes, v);
    if (orphelins.length) {
      var sansDossier = groupes ? groupes.filter(function (g) { return g.dossier === null; })
        : [{ dossier: null, routines: liste }];
      groupes = (groupes || []).filter(function (g) { return g.dossier !== null; })
        .concat(orphelins.map(function (d) { return { dossier: d, routines: [] }; }), sansDossier);
    }
    if (groupes) {
      // MOTEUR §9.22 (53-2) — le programme de chaque dossier, lu sur
      // `vue.programme`. LA CARTE DE FIN DE BLOC passe EN TÊTE de l'écran
      // (maquette cycles v1, « Fin ») : la voix du coach, au-dessus des
      // dossiers, jusqu'au choix de la personne.
      var programmes = groupes.map(function (g) {
        return v.programme && g.dossier !== null ? v.programme(g.dossier) : null;
      });
      groupes.forEach(function (g, i) {
        if (programmes[i] && programmes[i].fin) cible.appendChild(carteFinDeBloc(g.dossier, programmes[i].fin, v));
      });
      if (!v.reorganiser && v.surRetrouver) cible.appendChild(ligneRetrouver(v));
      groupes.forEach(function (g, i) {
        var cle = g.dossier === null ? '' : g.dossier;
        var replie = !!(v.replies && v.replies[cle]);
        var pr = programmes[i];
        cible.appendChild(ligneDeDossier(g, pr, replie, v));
        if (!replie && pr && pr.creer) cible.appendChild(rangeeDeProgramme(g.dossier, v));
        // 66B (§5 ter.4 bis) — « Le coach relit ce dossier », sous l'en-tête d'un DOSSIER qui a une routine non
        // archivée (`vue.relirable`, décidé par l'app). « Sans dossier » n'est pas un dossier : pas de rangée.
        // ⚠️ APRÈS « Faire de ce dossier un programme » : celle-ci reste collée à l'en-tête (53-2), avant les routines.
        if (!replie && g.dossier !== null && v.surRelire && v.relirable && v.relirable(g.dossier)) {
          cible.appendChild(rangeeDeRelecture(g.dossier, 'Le coach relit ce dossier', v));
        }
        if (!replie) g.routines.forEach(function (r) { cible.appendChild(rangeeDeRoutine(r, v)); });
      });
    } else {
      if (!v.reorganiser && v.surRetrouver) cible.appendChild(ligneRetrouver(v));
      // 66B — aucun dossier : UNE rangée, près de « Retrouver mes séances qui reviennent ».
      if (!v.reorganiser && v.surRelire && v.relirable && v.relirable(null)) {
        cible.appendChild(rangeeDeRelecture(null, 'Le coach relit ta semaine', v));
      }
      liste.forEach(function (r) { cible.appendChild(rangeeDeRoutine(r, v)); });
    }

    // On entre par où on veut (ECRAN-SAISIE §1) : une séance vide se note
    // exercice par exercice.
    if (!v.reorganiser && v.surSeanceVide) {
      var vide2 = el('button', 'discret bloc-large', 'Séance vide');
      vide2.type = 'button';
      vide2.addEventListener('click', v.surSeanceVide);
      cible.appendChild(vide2);
    }
  }

  // L'en-tête d'un dossier de la bibliothèque : son nom (repliable), et le badge du bloc À LA PLACE du compte, à
  // droite de la tête (« Bloc Mix · semaine 2 sur 4 ») : il ouvre le bloc en cours (ses exercices, « Arrêter le
  // programme »). Aucune rangée de plus.
  function ligneDeDossier(g, pr, replie, v) {
    var cle = g.dossier === null ? '' : g.dossier;
    var ligne = el('div', 'dossier-ligne');
    // 60-3 — la bibliothèque s'ouvre sur un dossier (« Mon programme ») : on le retrouve par ici.
    ligne.setAttribute('data-dossier', cle);
    var tete = el('button', 'dossier-tete' + (replie ? ' replie' : ''));
    tete.type = 'button';
    tete.setAttribute('aria-expanded', replie ? 'false' : 'true');
    tete.appendChild(el('span', 'dossier-nom',
      (replie ? '\u25b8 ' : '\u25be ') + (g.dossier === null ? 'Sans dossier' : g.dossier)));
    if (!(pr && pr.badge)) tete.appendChild(el('span', 'dossier-compte num', String(g.routines.length)));
    tete.addEventListener('click', function () { if (v.surReplier) v.surReplier(cle); });
    ligne.appendChild(tete);
    if (pr && pr.badge) {
      var badge = el('button', 'dossier-badge', pr.badge);
      badge.type = 'button';
      badge.addEventListener('click', function () { if (v.surBadgeProgramme) v.surBadgeProgramme(g.dossier); });
      ligne.appendChild(badge);
    }
    // 155 — le menu « \u22ef » du dossier (« Renommer le dossier »). « Sans dossier » n'est pas un dossier.
    if (g.dossier !== null && v.surMenuDossier) {
      var plus = el('button', 'dossier-menu', '\u22ef');
      plus.type = 'button';
      plus.setAttribute('aria-label', 'Menu du dossier ' + g.dossier);
      plus.addEventListener('click', function () { v.surMenuDossier(g.dossier); });
      ligne.appendChild(plus);
    }
    return ligne;
  }

  // 118 — les dossiers d'un programme en cours que la bibliothèque ne montre pas (plus aucune routine n'y est
  // rangée), dans l'ordre que l'app donne. `groupes` : ceux de `parDossier` (null : aucun dossier montré).
  function programmesOrphelins(groupes, v) {
    if (!v.dossiersDeProgramme) return [];
    var montres = {};
    (groupes || []).forEach(function (g) { if (g.dossier !== null) montres[g.dossier] = true; });
    var vus = {};
    return (v.dossiersDeProgramme() || []).filter(function (d) {
      if (d === null || d === undefined || montres[d] || vus[d]) return false;
      vus[d] = true;
      return true;
    });
  }

  // 60-3 (ECRAN-SAISIE §7 quindecies.7) — « Retrouver mes séances qui
  // reviennent » : une ligne pour tout le monde, en tête de la bibliothèque —
  // sous « Nouvelle routine » de l'en-tête —, ou à côté de « Créer une routine »
  // quand elle est vide. Elle ouvre la feuille « Tes séances qui reviennent ».
  function ligneRetrouver(v) {
    var b = el('button', 'discret bloc-large retrouver-seances', 'Retrouver mes séances qui reviennent');
    b.type = 'button';
    b.addEventListener('click', function () { v.surRetrouver(); });
    return b;
  }

  // ══ « TES SÉANCES QUI REVIENNENT » (ES §7 quindecies.7, 60-3) ═══════════
  //
  // Une carte par routine trouvée : sa case (cochée, ou décochée si elle est
  // ancienne), son nom, « 12 fois · dernière fois mardi », ses exercices avec
  // séries × reps, et en gris « Pas faite depuis le 9 mai. » pour une ancienne.
  // La voix du coach dessous. RIEN N'EST ÉCRIT avant « En faire mes routines
  // (N) » — inactif à zéro —, et pas de second éditeur ici : tout se modifie
  // ensuite, comme toute routine. `vue` : `{ routines: [{ nom, ligne,
  // exercices, ancienne, cochee }], erreur, enCours, surCocher(i), surCreer,
  // surPasMaintenant, surNouvelle }` — les textes viennent de l'app.
  function rendreFeuilleSeancesQuiReviennent(cible, vue) {
    vider(cible);
    var v = vue || {};
    cible.appendChild(el('div', 'feuille-t', 'Tes séances qui reviennent, sur tes 12 dernières semaines.'));
    var routines = v.routines || [];
    if (!routines.length) {
      cible.appendChild(el('p', 'retrouver-rien',
        'Je ne trouve pas encore de séances qui reviennent assez souvent. Tu peux créer tes routines toi-même.'));
      var menuVide = el('div', 'feuille-menu');
      entreeMenu(menuVide, 'Nouvelle routine', { classe: 'principal retrouver-nouvelle', surClic: v.surNouvelle });
      cible.appendChild(menuVide);
      return cible;
    }
    var liste = el('div', 'retrouver-liste');
    var cochees = 0;
    routines.forEach(function (r, i) {
      if (r.cochee) cochees++;
      var carte = el('button', 'retrouver-carte' + (r.cochee ? ' active' : ''));
      carte.type = 'button';
      carte.setAttribute('aria-pressed', r.cochee ? 'true' : 'false');
      carte.appendChild(el('span', 'rc-case', r.cochee ? '\u2611' : '\u2610'));
      var corps = el('span', 'rc-corps');
      corps.appendChild(el('span', 'rc-nom', r.nom));
      corps.appendChild(el('span', 'rc-ligne', r.ligne));
      corps.appendChild(el('span', 'rc-exos', r.exercices));
      if (r.ancienne) corps.appendChild(el('span', 'rc-ancienne', r.ancienne));
      carte.appendChild(corps);
      carte.addEventListener('click', function () { if (v.surCocher) v.surCocher(i); });
      liste.appendChild(carte);
    });
    cible.appendChild(liste);
    cible.appendChild(el('p', 'q-voix retrouver-voix', 'Tu pourras tout changer ensuite : exercices, séries, repos.'));
    var err = el('p', 'erreur', v.erreur || '');
    err.setAttribute('role', 'alert');
    cible.appendChild(err);
    var pied = el('div', 'feuille-menu');
    entreeMenu(pied, v.enCours ? 'Création\u2026' : 'En faire mes routines (' + cochees + ')', {
      classe: 'principal retrouver-creer', desactive: v.enCours || cochees === 0, surClic: v.surCreer
    });
    entreeMenu(pied, 'Pas maintenant', { surClic: v.surPasMaintenant });
    cible.appendChild(pied);
    return cible;
  }

  // ══ L'APERÇU DU PROGRAMME CONSTRUIT (QUESTIONNAIRE §5 bis, 60-4) ═════════
  //
  // « {N} séances par semaine. », la voix du coach (ce qu'il propose, ce qu'il ménage, ce qu'il vient de
  // changer), puis UNE CARTE PAR SÉANCE : son nom, « ≈ 69 min », la ligne « pourquoi » (les séries par zone), et
  // chaque exercice avec séries × reps — un bouton, qui ouvre « Je n'en veux pas / Remplacer / Annuler ». RIEN
  // n'est écrit avant « Créer ces N routines ». Les textes viennent de l'app (les phrases de `THGenerateur`, la
  // durée de `THMoteur`) : ici on pose des nœuds. `vue` : `{ titre, voix: [texte], routines: [{ nom, duree,
  // pourquoi, exercices: [{ nom, series, mentions: [texte], neuf }] }], erreur, enCours, libelleCreer,
  // surExercice(r, k), surCreer, surPasMaintenant }`.
  function rendreApercuProgramme(cible, vue) {
    vider(cible);
    var v = vue || {};
    cible.appendChild(el('div', 'feuille-t', v.titre || ''));
    (v.voix || []).forEach(function (t) { cible.appendChild(el('p', 'q-voix apercu-voix', t)); });
    // 66D (QUESTIONNAIRE §5 quater.5, maquette v2) — « Ce que j'ai changé · N » : une ligne par changement, chacune
    // avec « Retirer » (ou « Remettre », retirée). Aucune ligne : aucun bloc. Les textes viennent du générateur.
    var chg = v.changements;
    if (chg && (chg.lignes || []).length) {
      var bloc = el('section', 'ap-changements');
      bloc.appendChild(el('h2', 'ap-chg-titre', chg.titre));
      chg.lignes.forEach(function (l, n) {
        var ligne = el('div', 'ap-chg' + (l.retire ? ' retire' : ''));
        ligne.appendChild(el('i', 'ap-chg-marque'));
        ligne.appendChild(el('span', 'ap-chg-texte', l.texte));
        var b = el('button', 'ap-chg-geste', l.libelle);
        b.type = 'button';
        b.addEventListener('click', function () { if (v.surChangement) v.surChangement(n); });
        ligne.appendChild(b);
        bloc.appendChild(ligne);
      });
      cible.appendChild(bloc);
    }
    var liste = el('div', 'apercu-programme');
    (v.routines || []).forEach(function (r, i) {
      var carte = el('div', 'ap-routine');
      var tete = el('div', 'ap-tete');
      var gauche = el('span', 'ap-tete-nom');
      gauche.appendChild(el('span', 'ap-nom', r.nom));
      if (r.reprise) gauche.appendChild(el('span', 'ap-reprise', '\u25c6 reprise'));
      tete.appendChild(gauche);
      tete.appendChild(el('span', 'ap-duree', r.duree));
      carte.appendChild(tete);
      if (r.pourquoi) carte.appendChild(el('p', 'ap-pourquoi', r.pourquoi));
      // Deux lignes voisines au même `paire` : un superset, groupé et titré.
      var paire = null, valeur = null;
      (r.exercices || []).forEach(function (x, k) {
        var b = el('button', 'ap-ex' + (x.neuf ? ' neuf' : ''));
        b.type = 'button';
        var corps = el('span', 'ap-ex-corps');
        corps.appendChild(el('span', 'ap-ex-nom', x.nom));
        (x.mentions || []).forEach(function (m) { corps.appendChild(el('small', 'ap-ex-mention', m)); });
        b.appendChild(corps);
        b.appendChild(el('span', 'ap-ex-series', x.series));
        b.addEventListener('click', function () { if (v.surExercice) v.surExercice(i, k); });
        var suivant = (r.exercices || [])[k + 1];
        var groupe = x.paire === null || x.paire === undefined ? null : x.paire;
        if (groupe === null || (groupe !== valeur && !(suivant && suivant.paire === groupe))) {
          paire = null; valeur = null;
          carte.appendChild(b);
          return;
        }
        if (groupe !== valeur) {
          paire = el('div', 'ap-paire');
          paire.appendChild(el('div', 'ap-paire-t', 'Superset'));
          carte.appendChild(paire);
          valeur = groupe;
        }
        paire.appendChild(b);
      });
      liste.appendChild(carte);
    });
    cible.appendChild(liste);
    var err = el('p', 'erreur', v.erreur || '');
    err.setAttribute('role', 'alert');
    cible.appendChild(err);
    var pied = el('div', 'feuille-menu');
    entreeMenu(pied, v.enCours ? 'Création\u2026' : v.libelleCreer, {
      classe: 'principal apercu-creer', desactive: !!v.enCours, surClic: v.surCreer
    });
    entreeMenu(pied, 'Pas maintenant', { surClic: v.surPasMaintenant });
    cible.appendChild(pied);
    return cible;
  }

  // MOTEUR §9.22 (53-2) — « Faire de ce dossier un programme », sous la tête
  // d'un dossier qui n'en a pas. Le bloc en cours n'a pas de rangée : son
  // badge est sur la tête ; la carte de fin est en tête de l'écran.
  // 66B (QUESTIONNAIRE §5 ter.4 bis) — la rangée discrète qui ouvre « Le coach relit ta semaine » sur un dossier.
  function rangeeDeRelecture(dossier, texte, v) {
    var b = el('button', 'discret bloc-large rl-rangee', texte + ' \u203a');
    b.type = 'button';
    if (dossier !== null) b.setAttribute('data-dossier', dossier);
    b.addEventListener('click', function () { v.surRelire(dossier); });
    return b;
  }

  // ══ « LE COACH RELIT TA SEMAINE » (66B, QUESTIONNAIRE §5 ter.4 bis, maquette v5) ══════════
  //
  // AUCUNE RÈGLE ICI : le rendu lit la sortie de `Generateur.relireSemaine` et ce que la vue lui passe — `nommer(slug)`
  // (le nom d'un exercice), `seche` (`null` hors sèche, sinon « le 29 sept. » ou `''` sans date), `message` (« Ta
  // semaine a changé depuis… »), `fait` (`{ section, texte }`, la ligne grise après un « oui »), `replie(p)` (une
  // carte refusée), `surOui(p)`, `surNon(p)`. Classes `rl-`, jetons de la forge, aucune couleur d'alerte.
  function rendreRelecture(noeud, sortie, vue) {
    if (!noeud) return noeud;
    vider(noeud);
    var v = vue || {}, s = sortie || {}, h = s.historique || {}, sem = s.semaine || {};
    var tete = el('div', 'rl-tete');
    tete.appendChild(el('h1', 'rl-titre', 'Le coach relit ta semaine'));
    var sous = pluriel(sem.seances || 0, 'séance') + ' \u00b7 ' + pluriel(sem.series || 0, 'série');
    if (v.seche !== null && v.seche !== undefined) sous += ' \u00b7 en sèche' + (v.seche ? ' depuis ' + v.seche : '');
    tete.appendChild(el('p', 'rl-sous', sous));
    noeud.appendChild(tete);
    if (v.message) noeud.appendChild(el('p', 'rl-message', v.message));

    var barres = h.barres || [];
    if (barres.length || h.ratio || h.peu_travailles) {
      var hist = el('section', 'rl-bloc rl-historique');
      hist.appendChild(el('h2', 'rl-h2', 'Ton historique'));
      if (v.fait && v.fait.section === 'historique') hist.appendChild(el('p', 'rl-fait', v.fait.texte));
      barres.forEach(function (b) {
        var l = el('div', 'rl-barre');
        l.setAttribute('data-slug', b.slug);
        var nom = el('span', 'rl-nom', b.nom);
        l.appendChild(nom);
        var kg = el('span', 'rl-kg num');
        kg.appendChild(el('span', 'rl-medaille'));
        kg.appendChild(doc.createTextNode(nombreFr(b.record) + ' '));
        kg.appendChild(el('small', null, 'kg'));
        l.appendChild(kg);
        l.appendChild(el('span', 'rl-detail', b.detail));
        var jauge = el('span', 'rl-jauge');
        var i = el('i');
        i.style.width = Math.max(0, Math.min(100, Math.round(b.jauge * 100))) + '%';
        jauge.appendChild(i);
        l.appendChild(jauge);
        hist.appendChild(l);
      });
      if (barres.length >= 2) hist.appendChild(el('p', 'rl-legende', 'La jauge : chaque record comparé au plus lourd.'));
      if (h.ratio) {
        var p = h.ratio.proposition;
        var c = el('div', 'rl-coach rl-ratio');
        if (p && v.replie && v.replie(p)) {
          c.appendChild(el('p', 'rl-replie', 'Rien ne change.'));
        } else {
          c.appendChild(el('p', 'rl-phrase', h.ratio.phrase));
          c.appendChild(el('p', 'rl-gris', h.ratio.gris));
          if (p) {
            c.appendChild(el('p', 'rl-question', p.phrase));
            c.appendChild(gestesDeRelecture(p, v));
          }
        }
        hist.appendChild(c);
      }
      if (h.peu_travailles) {
        var pt = el('div', 'rl-coach rl-peu');
        pt.appendChild(el('p', 'rl-phrase', h.peu_travailles));
        hist.appendChild(pt);
      }
      noeud.appendChild(hist);
    }

    var semaine = el('section', 'rl-bloc rl-semaine');
    semaine.appendChild(el('h2', 'rl-h2', 'Ta semaine'));
    if (v.fait && v.fait.section === 'semaine') semaine.appendChild(el('p', 'rl-fait', v.fait.texte));
    if ((sem.verifs || []).length) {
      var ok = el('ul', 'rl-ok');
      sem.verifs.forEach(function (t) { ok.appendChild(el('li', null, t)); });
      semaine.appendChild(ok);
    }
    (sem.constats || []).forEach(function (t) { semaine.appendChild(el('p', 'rl-constat', t)); });
    (sem.propositions || []).forEach(function (p) {
      var c = el('div', 'rl-coach rl-retrait');
      c.setAttribute('data-muscle', p.muscle || '');
      if (v.replie && v.replie(p)) {
        c.appendChild(el('p', 'rl-replie', 'Rien ne change.'));
      } else {
        c.appendChild(el('p', 'rl-phrase', p.phrase));
        c.appendChild(el('p', 'rl-question', p.question));
        var chg = el('ul', 'rl-chg');
        (p.lignes || []).forEach(function (l) {
          var li = el('li', null, (v.nommer ? v.nommer(l.exercise_slug) : l.exercise_slug) + ' \u00b7 ' + l.routine + ' : ');
          li.appendChild(el('s', null, String(l.de)));
          li.appendChild(doc.createTextNode(' ' + l.a));
          chg.appendChild(li);
        });
        c.appendChild(chg);
        c.appendChild(gestesDeRelecture(p, v));
      }
      semaine.appendChild(c);
    });
    noeud.appendChild(semaine);
    return noeud;
  }

  // Les deux boutons d'une proposition, libellés par la sortie (R3).
  function gestesDeRelecture(p, v) {
    var g = el('div', 'rl-gestes');
    var oui = el('button', 'rl-oui', p.oui);
    oui.type = 'button';
    oui.addEventListener('click', function () { if (v.surOui) v.surOui(p); });
    var non = el('button', 'rl-non', p.non);
    non.type = 'button';
    non.addEventListener('click', function () { if (v.surNon) v.surNon(p); });
    g.appendChild(oui);
    g.appendChild(non);
    return g;
  }

  function rangeeDeProgramme(dossier, v) {
    var r = el('div', 'programme-dossier');
    var c = el('button', 'discret programme-creer', 'Faire de ce dossier un programme');
    c.type = 'button';
    c.addEventListener('click', function () { if (v.surProgramme) v.surProgramme(dossier); });
    r.appendChild(c);
    return r;
  }

  // La carte de fin de bloc (maquette cycles v1, « Fin ») : le titre, « Pendant
  // ce bloc », une rangée par exercice (le nom, puis sa première et sa dernière
  // charge de travail), les paris, le bloc suivant (sa zone en gras), et trois
  // gestes pleine largeur. Aucune phrase n'est écrite ici : le moteur les rédige.
  function carteFinDeBloc(dossier, k, v) {
    var c = el('div', 'carte-fin-bloc');
    c.setAttribute('data-dossier', dossier);
    c.appendChild(el('p', 'cfb-titre', k.titre));
    if (k.lignes.length) {
      c.appendChild(el('p', 'cfb-entete', k.entete));
      var l = el('div', 'cfb-bilan');
      k.lignes.forEach(function (x) {
        var rg = el('div', 'cfb-ligne');
        rg.appendChild(el('span', 'cfb-nom', x.nom));
        rg.appendChild(el('span', 'cfb-valeur num', x.valeur));
        l.appendChild(rg);
      });
      c.appendChild(l);
    }
    c.appendChild(el('p', 'cfb-paris', k.paris));
    if (k.pari) c.appendChild(el('p', 'cfb-paris', k.pari));
    if (k.suivant) {
      var p = el('p', 'cfb-suivant');
      var i = k.suivantZone ? k.suivant.indexOf(k.suivantZone) : -1;
      if (i < 0) {
        p.textContent = k.suivant;
      } else {
        p.appendChild(document.createTextNode(k.suivant.slice(0, i)));
        p.appendChild(el('b', '', k.suivantZone));
        p.appendChild(document.createTextNode(k.suivant.slice(i + k.suivantZone.length)));
      }
      c.appendChild(p);
    }
    var gestes = el('div', 'cfb-gestes');
    var bouton = function (classe, texte, fn) {
      var b = el('button', classe, texte);
      b.type = 'button';
      b.addEventListener('click', function () { if (fn) fn(dossier); });
      gestes.appendChild(b);
    };
    // 193-4 — la proposition de la semaine de test (la phrase vient du moteur, la proposition de l'app).
    if (k.test) c.appendChild(el('p', 'cfb-suivant cfb-test', k.test.phrase));
    if (k.test) bouton('cfb-faire-test', k.test.faire, v.surFaireTest);
    if (k.commencer) bouton('cfb-commencer', k.commencer, v.surCommencerBloc);
    if (k.ajuster) bouton('cfb-ajuster', k.ajuster, v.surAjusterBloc);       // 193-2 : une phase ne s'ajuste pas (pas de zone de bloc)
    bouton('cfb-arreter', k.arreter, v.surArreterProgramme);
    c.appendChild(gestes);
    return c;
  }

  // 171 (ECRAN-SAISIE, décision du 25/10/2026) — la fin de cycle EN TÊTE de Saisie (famille A, « à faire »). La MÊME carte
  // que la bibliothèque (`carteFinDeBloc`) : mêmes lignes, mêmes gestes, rien recalculé ici — `items` est la liste des
  // `{ dossier, fin }` que l'app a lue sur `programmeDuDossier`. Sans carte, le conteneur se cache.
  function rendreFinsDeCycleSaisie(cible, items, v) {
    vider(cible);
    if (!items || !items.length) { cible.hidden = true; return cible; }
    cible.hidden = false;
    items.forEach(function (x) { cible.appendChild(x.bilanTest ? carteBilanTest(x.bilanTest, v) : carteFinDeBloc(x.dossier, x.fin, v)); });
    return cible;
  }

  // LA FEUILLE « FAIRE DE CE DOSSIER UN PROGRAMME » (ou « Ajuster le bloc »),
  // maquette cycles v1, « Créer » : quatre champs (le bloc, sa durée, sa
  // décharge, son début), puis les exercices du bloc — cochés, ils prennent
  // la zone du bloc ; décochés, ils gardent la leur. Rien n'est écrit avant
  // « Lancer le programme ».
  function rendreFeuilleProgramme(cible, vue) {
    vider(cible);
    var t = el('div', 'feuille-t', vue.suite ? 'Ajuster le bloc' : 'Faire de ce dossier un programme');
    t.appendChild(el('em', '', vue.dossier));
    cible.appendChild(t);
    var champ = function (cle, titre, options, actuel, fn) {
      var r = el('label', 'champ-programme');
      r.appendChild(el('span', 'cp-k', titre));
      var sel = el('select', 'cp-v');
      sel.setAttribute('data-champ', cle);
      options.forEach(function (o, i) {
        var op = el('option', '', o.texte);
        op.value = String(i);
        if (o.valeur === actuel) op.selected = true;
        sel.appendChild(op);
      });
      sel.addEventListener('change', function () { fn(options[Number(sel.value)].valeur); });
      r.appendChild(sel);
      cible.appendChild(r);
    };
    champ('zone', vue.suite ? 'Bloc' : 'Premier bloc', (vue.zones || []).map(function (z) {
      return { valeur: z.cle, texte: z.texte };
    }), vue.zone, vue.surZone);
    champ('semaines', 'Durée du bloc', (vue.semainesPossibles || []).map(function (n) {
      return { valeur: n, texte: n + ' semaines' + (vue.bornesSemaines ? ' (' + vue.bornesSemaines + ')' : '') };
    }), vue.semaines, vue.surSemaines);
    champ('decharge', 'Décharge à la fin', [{ valeur: true, texte: 'Oui, la dernière semaine' }, { valeur: false, texte: 'Non' }],
      vue.decharge, vue.surDecharge);
    champ('debut', 'Début', (vue.debuts || []).map(function (d) { return { valeur: d.cle, texte: d.texte }; }),
      vue.debut, vue.surDebut);
    cible.appendChild(el('p', 'feuille-aide cp-aide',
      'Exercices du bloc — tes mouvements à la barre. Les autres gardent leur zone.'));
    var ex = el('div', 'exercices-programme');
    (vue.exercices || []).forEach(function (e) {
      var b = el('button', 'case-programme' + (e.coche ? ' active' : ''));
      b.type = 'button';
      b.setAttribute('data-slug', e.slug);
      b.setAttribute('aria-pressed', e.coche ? 'true' : 'false');
      b.appendChild(el('span', 'cp-nom', (e.coche ? '\u2611 ' : '\u2610 ') + e.nom));
      b.appendChild(el('span', 'cp-zone', e.coche ? vue.zoneCourte : 'sa zone'));
      b.addEventListener('click', function () { vue.surCocher(e.slug); });
      ex.appendChild(b);
    });
    cible.appendChild(ex);
    var err = el('p', 'erreur', vue.erreur || '');
    err.setAttribute('role', 'alert');
    cible.appendChild(err);
    var pied = el('div', 'feuille-menu');
    entreeMenu(pied, vue.suite ? 'Commencer le bloc' : 'Lancer le programme',
      { classe: 'principal valider-programme', surClic: vue.surValider });
    entreeMenu(pied, 'Annuler', { surClic: vue.surAnnuler });
    cible.appendChild(pied);
    return cible;
  }

  // Le bloc en cours d'un dossier : son badge, ses exercices, et l'arrêt.
  function rendreFeuilleBlocEnCours(cible, vue) {
    vider(cible);
    var t = el('div', 'feuille-t', vue.badge);
    t.appendChild(el('em', '', vue.dossier));
    cible.appendChild(t);
    cible.appendChild(el('div', 'pq-sec', 'Exercices du bloc'));
    var l = el('ul', 'cfb-bilan');
    (vue.exercices || []).forEach(function (n) { l.appendChild(el('li', '', n)); });
    cible.appendChild(l);
    cible.appendChild(el('p', 'feuille-aide', 'Arrêter le programme rend à ces exercices la zone d’après tes séances.'));
    var pied = el('div', 'feuille-menu');
    entreeMenu(pied, 'Arrêter le programme', { classe: 'danger arreter-programme', surClic: vue.surArreter });
    entreeMenu(pied, 'Fermer', { surClic: vue.surFermer });
    cible.appendChild(pied);
    return cible;
  }

  // 173 (refonte « Vivant ») — « PROCHAINE SÉANCE », en tête de l'accueil : la routine qui suit la dernière faite, son résumé (comme la
  // carte de routine de Saisie) et [Démarrer] — le même démarrage. `vue` : `{ routine, catalogue, temps, enCours, surDemarrer, surReprendre,
  // surAutre }`. Sans routine, le conteneur se cache. Rien n'est calculé ici : l'app a choisi la routine.
  function rendreProchaineSeance(cible, vue) {
    vider(cible);
    var r = vue && vue.routine;
    if (!r) { cible.hidden = true; return cible; }
    cible.hidden = false;
    var carte = el('div', 'prochaine');
    carte.appendChild(el('div', 'prochaine-eti', 'PROCHAINE SÉANCE'));
    carte.appendChild(el('div', 'prochaine-nom', r.nom));
    var a = R().apercu(r.exercices, vue.catalogue);
    var temps = vue.temps ? vue.temps(r) : null;
    carte.appendChild(el('div', 'prochaine-meta',
      a.nbExercices + ' exercice' + (a.nbExercices > 1 ? 's' : '') + ' \u00b7 ' + a.nbSeries + ' série' + (a.nbSeries > 1 ? 's' : '') +
      (temps && temps.texte ? ' \u00b7 ' + temps.texte : '')));
    var pied = el('div', 'prochaine-pied');
    var go = el('button', 'principal prochaine-go', vue.enCours ? 'Reprendre' : 'Démarrer');
    go.type = 'button';
    go.addEventListener('click', function () { if (vue.enCours) { if (vue.surReprendre) vue.surReprendre(); } else if (vue.surDemarrer) vue.surDemarrer(r.id); });
    pied.appendChild(go);
    var autre = el('button', 'discret prochaine-autre', 'Autre routine \u203a');
    autre.type = 'button';
    autre.addEventListener('click', function () { if (vue.surAutre) vue.surAutre(); });
    pied.appendChild(autre);
    carte.appendChild(pied);
    cible.appendChild(carte);
    return cible;
  }

  // Une routine de la bibliothèque : sa carte et ses actions.
  function rangeeDeRoutine(r, v) {
    var carte = el('button', 'routine');
    carte.type = 'button';
    carte.appendChild(el('div', 'routine-nom', r.nom));
    // ⚠️ « 3 × 8 » A DISPARU AU CHANTIER 43, LES CHAUFFES AU 44
    // (§7 septendecies.1). Depuis `v2_042_routine_sets` les lignes d'un
    // exercice ne sont plus identiques, donc « 3 séries × 8 reps » ne veut
    // plus rien dire. Le chantier 43 avait ajouté « + 5 de chauffe » pour
    // lever une ambiguïté de compte : **le détail est inutile dans un
    // résumé**, il se voit en ouvrant la routine.
    //
    // Reste ce qui se compare d'une routine à l'autre : les séries de
    // TRAVAIL, comme partout ailleurs (`compteSeriesTravail`, règle du
    // volume comprise).
    var a = R().apercu(r.exercices, v.catalogue);
    carte.appendChild(el('div', 'routine-meta',
      a.nbExercices + ' exercice' + (a.nbExercices > 1 ? 's' : '') +
      ' \u00b7 ' + a.nbSeries + ' série' + (a.nbSeries > 1 ? 's' : '')));
    // §9.18 (51-1) — LA DURÉE ESTIMÉE, toujours « (estimation) » ; pendant
    // une semaine allégée, sa durée allégée. Lue sur `vue.temps`, jamais
    // calculée ici.
    var temps = v.temps ? v.temps(r) : null;
    // 60-2b — « Ça varie » : l'estimation qui dépasse la durée visée s'écrit en couleur du coach.
    if (temps && temps.texte) carte.appendChild(el('div', 'routine-duree' + (temps.ambre ? ' depasse' : ''), temps.texte));
    carte.disabled = !!v.reorganiser;
    carte.addEventListener('click', function () { if (!v.reorganiser && v.surChoix) v.surChoix(r.id); });

    var rangee = el('div', 'routine-rangee' + (v.reorganiser ? ' reorg' : ''));
    // ⚠️ L'IDENTIFIANT ENTRE DANS LE DOM (ch. 46). Il ne vivait que dans la
    // fermeture du gestionnaire de clic ; un réordonnancement doit pouvoir
    // relire l'ordre AFFICHÉ, donc les rangées portent leur clé.
    rangee.setAttribute('data-cle', r.id);
    if (v.reorganiser) rangee.appendChild(poignee());
    rangee.appendChild(carte);
    // Démarrer est l'action principale d'une routine ; la modifier est
    // secondaire. Deux cibles distinctes plutôt qu'un menu : on part
    // s'entraîner plus souvent qu'on ne remanie.
    //
    // ⚠️ MAIS PAS PENDANT QU'ON RANGE. En mode réorganisation, « Démarrer »
    // est une sortie d'écran à un pouce de la poignée : le garder ferait
    // partir une séance sur un geste raté. La carte, elle, cesse aussi
    // d'ouvrir l'éditeur — pour la même raison.
    if (!v.reorganiser) {
      var actions = el('div', 'routine-actions');
      var go = el('button', 'demarrer', 'Démarrer');
      go.type = 'button';
      go.addEventListener('click', function () { if (v.surDemarrer) v.surDemarrer(r.id); });
      actions.appendChild(go);
      // §9.18 (51-1) — « J'ai peu de temps », à côté de « Démarrer » ; absent
      // pendant une semaine allégée, ou quand la routine tient déjà dans la
      // plus courte des durées proposées.
      if (temps && temps.peuDeTemps && v.surPeuDeTemps) {
        var pt = el('button', 'peu-de-temps', 'J’ai peu de temps');
        pt.type = 'button';
        pt.addEventListener('click', function () { v.surPeuDeTemps(r.id); });
        actions.appendChild(pt);
      }
      rangee.appendChild(actions);
    }
    return rangee;
  }

  // ⚠️ LE MENU D'UN EXERCICE DE ROUTINE — les cinq gestes du §7 duodecies.2, et
  // rien d'autre. Il passe par `entreeMenu`, comme les menus de la séance : une
  // entrée par geste, en toutes lettres, et ce qui n'a pas de sens ici est
  // GRISÉ plutôt qu'absent — « Monter » sur le premier reste à sa place, sinon
  // les entrées bougent d'une carte à l'autre.
  function rendreFeuilleExoRoutine(cible, vue) {
    vider(cible);
    var t = el('div', 'feuille-t', 'Exercice');
    t.appendChild(el('em', '', vue.nom));
    cible.appendChild(t);

    var menu = el('div', 'feuille-menu');
    // ES §7 quindecies.8 (60-3) — la feuille de « Machine prise », sans « Plus tard ».
    if (vue.surRemplacer) entreeMenu(menu, 'Remplacer', { surClic: vue.surRemplacer });
    // 60-4 (ES §7 quindecies.9) — à côté de « Remplacer » : refuser l'exercice, c'est le dire une fois.
    if (vue.surNeVeuxPas) entreeMenu(menu, 'Je n\u2019en veux pas', { surClic: vue.surNeVeuxPas });
    entreeMenu(menu, 'Grouper avec le suivant',
      { surClic: vue.surGrouper, desactive: !vue.peutGrouper });
    entreeMenu(menu, 'Dégrouper',
      { surClic: vue.surDegrouper, desactive: !vue.estGroupe });
    // ⚠️ IDEM ICI (§7 vicies.1) : une entrée au lieu de deux, et le mode fait
    // le reste. L'éditeur gagne au passage le repli et le glissement, qu'il
    // n'avait pas — le même `blocReplie` que la séance, simplement demandé.
    entreeMenu(menu, 'Réorganiser…', { surClic: vue.surReorganiser,
      desactive: !vue.surReorganiser });
    // ⚠️ « MODIFIER LES PARAMÈTRES » EST PARTI AVEC SA FEUILLE (ch. 43). Séries
    // et reps se tapent sur la ligne ; le repos a son propre bouton sous le nom,
    // le même qu'en séance. Une entrée qui ouvrirait la feuille du repos ferait
    // deux chemins vers le même réglage, dont un plus long.
    cible.appendChild(menu);

    var sup = el('div', 'feuille-menu');
    entreeMenu(sup, 'Supprimer l’exercice',
      { classe: 'danger', surClic: vue.surSupprimer });
    cible.appendChild(sup);
    return cible;
  }

  // Les lettres A/B/C de l'éditeur, calculées comme celles de la séance : par
  // suite de liens. Un exercice seul n'en porte pas (§2.3).
  function lettresDeLiens(lies) {
    var lettres = [], i = 0, n = (lies || []).length + 1;
    while (i < n) {
      var j = i;
      while (j < lies.length && lies[j]) j++;
      for (var k = i; k <= j; k++) lettres.push(j > i ? (M().LETTRES[k - i] || '?') : '');
      i = j + 1;
    }
    return lettres;
  }

  // Les résultats du catalogue. 237 entrées, des noms qui vont jusqu'à
  // « Curl Poignets Paumes vers le Haut Assis » : le nom passe sur deux lignes
  // plutôt que d'être tronqué (ECRAN-SAISIE §7 bis.2).
  // 60-4 — `ecartes` (des slugs) : un exercice écarté porte la mention « écarté » (ES §7 quindecies.9) ; l'app l'a
  // déjà rangé en fin de liste.
  // 67B — `decrire(e)` : la sous-ligne « Machine · Grand dorsal » de chaque résultat (ES §7 quindecies.10), écrite par
  // l'app ; absente ou vide, rien.
  // 126 (ES §7 quindecies.11) — `mentions(e)` : les autres mentions (« Pas dans Ma salle », « Déjà dans la routine »),
  // décidées par l'app ; chacune sa ligne `resultat-mention`, sous « écarté ».
  function boutonResultat(e, surChoix, ecarte, sous, autres) {
    var b = el('button', 'resultat', e.nom || e.slug);
    if (sous) b.appendChild(el('small', 'resultat-sous', sous));
    if (ecarte.indexOf(e.slug) >= 0) b.appendChild(el('small', 'resultat-mention', 'écarté'));
    (autres || []).forEach(function (m) { if (m) b.appendChild(el('small', 'resultat-mention', m)); });
    b.type = 'button';
    b.addEventListener('click', function () { surChoix(e); });
    return b;
  }
  function rendreResultatsExo(cible, exercices, surChoix, ecartes, decrire, mentions) {
    vider(cible);
    var liste = exercices || [];
    var ecarte = ecartes || [];
    if (!liste.length) {
      cible.appendChild(el('p', 'vide', 'Aucun exercice ne correspond.'));
      return;
    }
    liste.forEach(function (e) {
      cible.appendChild(boutonResultat(e, surChoix, ecarte, typeof decrire === 'function' ? decrire(e) : '',
        typeof mentions === 'function' ? mentions(e) : []));
    });
  }

  // 126 (ES §7 quindecies.11, maquette `maquette-recherche-v1.html`) — LE CHAMP VIDE : les sections titrées que l'app a
  // décidées (« Souvent avec cette séance », « Les plus proches »…), puis la phrase du pied (« Tape pour chercher dans
  // les N exercices. »). Rien n'est calculé ici ; une section vide ne s'affiche pas.
  //   vue : { sections: [{ titre, lignes: [{ exo, mentions: [texte] }] }], pied, surChoix(exo), ecartes, decrire(exo) }
  function rendreSuggestionsExo(cible, vue) {
    vider(cible);
    var v = vue || {};
    var ecarte = v.ecartes || [];
    (v.sections || []).forEach(function (sec) {
      if (!sec || !(sec.lignes || []).length) return;
      cible.appendChild(el('p', 'resultats-groupe', sec.titre));
      sec.lignes.forEach(function (l) {
        cible.appendChild(boutonResultat(l.exo, v.surChoix, ecarte,
          typeof v.decrire === 'function' ? v.decrire(l.exo) : '', l.mentions));
      });
    });
    if (v.pied) cible.appendChild(el('p', 'resultats-plus', v.pied));
  }

  // 67B (ES §7 quindecies.10, maquette `maquette-catalogue-filtres-v2.html`) — LES DEUX FILTRES DU CATALOGUE, sous le
  // champ : chacun un bouton (« Tout le matériel », « Tous les muscles », ou le choix en vigueur) qui ouvre son choix,
  // et, actif, un « ✕ » qui le retire d'un geste. Puis « N exercices » quand un filtre est actif. Rien n'est calculé ici.
  //   vue : { filtres: [{ cle, libelle, actif }], compte: texte | null, surOuvrir(cle), surRetirer(cle) }
  function rendreFiltresExo(cible, compte, vue) {
    vider(cible);
    var v = vue || {};
    (v.filtres || []).forEach(function (f) {
      var p = el('div', 'filtre-exo' + (f.actif ? ' actif' : ''));
      p.dataset.cle = f.cle;
      var b = el('button', 'filtre-ouvrir', f.libelle);
      b.type = 'button';
      if (!f.actif) b.appendChild(el('span', 'filtre-signe', '\u25be'));
      b.addEventListener('click', function () { v.surOuvrir(f.cle); });
      p.appendChild(b);
      if (f.actif) {
        var x = el('button', 'filtre-retirer', '\u2715');
        x.type = 'button';
        x.setAttribute('aria-label', 'Retirer le filtre ' + f.libelle);
        x.addEventListener('click', function () { v.surRetirer(f.cle); });
        p.appendChild(x);
      }
      cible.appendChild(p);
    });
    if (compte) {
      compte.textContent = v.compte || '';
      compte.hidden = !v.compte;
    }
    return cible;
  }

  // ══ LE PROFIL (chantier 46 §2) ═══════════════════════════════════════════
  //
  // Six blocs, un critère : chaque champ est là parce que quelque chose le lit,
  // ou le lira au chantier 1 (ECRAN-PROFIL-V1). Le rendu, lui, ne connaît aucun
  // de ces champs — il reçoit des SECTIONS et des LIGNES, et les dessine. C'est
  // ce qui permet d'ajouter un champ sans toucher au rendu, et de tester les
  // règles sans navigateur.
  //
  // ⚠️ « à renseigner » N'EST PAS UNE ERREUR, C'EST UN ÉTAT (§4). Rien n'est
  // rouge, rien ne bloque, rien ne compte les fautes : un profil vide est un
  // profil neuf, et le moteur travaille avec ce qu'il a.

  function ligneProfil(l) {
    var cliquable = typeof l.surChoix === 'function';
    var n = el(cliquable ? 'button' : 'div', 'p-ligne');
    if (cliquable) { n.type = 'button'; n.addEventListener('click', l.surChoix); }
    var lib = el('span', 'p-lib', l.libelle);
    if (l.sous) lib.appendChild(el('small', '', l.sous));
    n.appendChild(lib);
    var estVide = l.valeur === null || l.valeur === undefined || l.valeur === '';
    if (!l.sansValeur) {
      n.appendChild(el('span', 'p-val' + (estVide ? ' vide' : ''),
        estVide ? 'à renseigner' : l.valeur));
    }
    if (cliquable) n.appendChild(el('span', 'p-fl', '›'));
    return n;
  }

  // Deux crans, jamais plus : c'est une INTENTION, pas un réglage de finesse.
  function segmentProfil(seg) {
    // Quatre choix longs (la phase) : deux colonnes, sinon « Maintien ou
    // recomposition » ne tient pas dans un quart de 360 px.
    var barre = el('div', 'p-seg' + (seg.deuxColonnes ? ' deux' : ''));
    (seg.options || []).forEach(function (o) {
      var b = el('button', o.cle === seg.valeur ? 'on' : '', o.libelle);
      b.type = 'button';
      b.dataset.cle = o.cle;
      b.setAttribute('aria-pressed', o.cle === seg.valeur ? 'true' : 'false');
      b.addEventListener('click', function () { seg.surChoix(o.cle); });
      barre.appendChild(b);
    });
    return barre;
  }

  function rendreProfil(cible, vue) {
    if (!cible) return;
    vider(cible);

    // 60-2a — LE BANDEAU D'ACCUEIL EST RETIRÉ. C'est le questionnaire du coach qui
    // accueille un compte neuf (ECRAN-PROFIL §4 bis), sur `questionnaire_fait_le`
    // et non plus sur `onboarding_completed` : il s'ouvre de lui-même, et « Plus
    // tard » laisse une ligne en tête de ce profil (`vue.questionnaire`).
    if (vue.questionnaire) {
      var qu = el('div', 'p-groupe p-questionnaire');
      qu.appendChild(ligneProfil({ libelle: vue.questionnaire.libelle, sansValeur: true,
                                   surChoix: vue.questionnaire.surChoix }));
      cible.appendChild(qu);
    }

    // 64B (JEU-V1 §9.3) — la vitrine, jeu allumé et au moins un succès.
    if (vue.vitrine && vue.vitrine.length) {
      cible.appendChild(el('div', 'p-sect', 'VITRINE'));
      cible.appendChild(blocVitrine(vue.vitrine));
    }

    var chiffres = el('div', 'p-chiffres');
    (vue.kpis || []).forEach(function (k) {
      var c = el('div', 'p-kpi');
      c.appendChild(el('b', '', k.valeur));
      c.appendChild(el('span', '', k.libelle));
      chiffres.appendChild(c);
    });
    cible.appendChild(chiffres);

    var groupeVu;
    (vue.sections || []).forEach(function (sec) {
      // ⚠️ UNE SECTION ABSENTE VAUT `null`, ET C'EST ICI QU'ON LA SAUTE.
      // « Ton rythme » n'existe pas en Entretenir (ECRAN-PROFIL §2.3), et
      // d'autres suivront. Filtrer chez l'appelant demandait à chaque écran d'y
      // penser ; une garde ici le fait une fois pour toutes, et elle se teste.
      if (!sec) return;
      // 173 (« Vivant ») — le titre du groupe (« Mon coach »…), une fois, devant la première section du groupe.
      if (sec.groupe !== groupeVu) {
        groupeVu = sec.groupe;
        if (groupeVu) cible.appendChild(el('h2', 'p-grp', groupeVu));
      }
      cible.appendChild(el('div', 'p-sect', sec.titre));
      var g = el('div', 'p-groupe');
      // La voix du coach sous le titre, puis le choix, puis une ligne grise
      // (« Depuis le 29 sept. ») — la phase (49-U11).
      if (sec.aide) g.appendChild(el('div', 'p-aide', sec.aide));
      if (sec.segment) g.appendChild(segmentProfil(sec.segment));
      if (sec.pied) g.appendChild(el('div', 'p-pied', sec.pied));
      (sec.lignes || []).forEach(function (l) { if (l) g.appendChild(ligneProfil(l)); });
      if (sec.note) {
        var note = el('div', 'p-note');
        note.appendChild(el('b', '', sec.note.fort));
        note.appendChild(doc.createTextNode(' ' + sec.note.reste));
        g.appendChild(note);
      }
      cible.appendChild(g);
    });

    // ⚠️ « QUITTER » PUIS « SUPPRIMER », DANS CET ORDRE ET PAS L'INVERSE.
    // Ce sont les deux gestes qu'on ne veut pas confondre — la v1 les avait
    // confondus, et c'est un fix RGPD entier (CLAUDE.md v351-v362). Quitter est
    // bordé et net ; supprimer est discret, dessous, et sa confirmation dit ce
    // qui part.
    // 64B — « LE JEU » en bas, allumé ou éteint : seul reste l'interrupteur quand il est éteint.
    if (vue.jeu) {
      cible.appendChild(el('div', 'p-sect', 'LE JEU'));
      cible.appendChild(blocInterrupteurJeu(vue.jeu));
    }

    var q = el('button', 'p-quitter', 'Quitter');
    q.type = 'button';
    q.id = 'btn-deconnexion';
    q.addEventListener('click', vue.surQuitter);
    cible.appendChild(q);

    var sup = el('button', 'p-supprimer', 'Supprimer mon compte');
    sup.type = 'button';
    sup.id = 'btn-supprimer-compte';
    sup.addEventListener('click', vue.surSupprimer);
    cible.appendChild(sup);
    return cible;
  }

  // ══ LE QUESTIONNAIRE DU COACH (60-2a, QUESTIONNAIRE-COACH-V2 §3) ═══════════
  //
  // ⚠️ LE RENDU NE CONNAÎT NI RÈGLE NI TEXTE. Il dessine la vue que
  // `THQuestionnaire.vueDe` lui donne — le titre, la voix, les blocs, le bouton —
  // et rend les gestes à l'appelant (`actions`). Aucune colonne, aucune valeur
  // de liste, aucun libellé n'est écrit ici : un texte recopié dans le rendu
  // finirait par dire autre chose que le Profil.
  //
  //   `actions.surChoix(cle, valeur)`  une option, une puce touchée ;
  //   `actions.surSaisie(cle, texte)`  un champ tapé — rend l'ERREUR à afficher
  //                                    (ou `null`) : le champ n'est PAS redessiné,
  //                                    sans quoi il perdrait le focus et le clavier ;
  //   `actions.surLigne(cle)`          une ligne qui ouvre une feuille ;
  //   `actions.surChanger(ecran)`      « changer » au récapitulatif ;
  //   `actions.surContinuer()`, `surRetour()`, `surPlusTard()`.
  function blocPuces(b, a) {
    var g = el('div', 'q-puces');
    var valeurs = b.multiple ? (b.valeurs || []) : [b.valeur];
    b.options.forEach(function (o) {
      var on = valeurs.indexOf(o.cle) >= 0;
      var n = el('button', 'q-puce' + (on ? ' on' : ''), o.libelle);
      n.type = 'button';
      n.dataset.cle = o.cle;
      n.setAttribute('aria-pressed', on ? 'true' : 'false');
      n.addEventListener('click', function () { a.surChoix(b.cle, o.cle); });
      g.appendChild(n);
    });
    return g;
  }

  function blocOptions(b, a) {
    var g = el('div', 'q-options');
    b.options.forEach(function (o) {
      var on = o.cle === b.valeur;
      var n = el('button', 'q-opt' + (on ? ' on' : ''));
      n.type = 'button';
      n.dataset.cle = o.cle;
      n.setAttribute('aria-pressed', on ? 'true' : 'false');
      n.appendChild(el('span', 'q-opt-t', o.libelle));
      if (o.sous) n.appendChild(el('span', 'q-sous', o.sous));
      // 187 — une réponse annoncée mais pas encore faite : grisée, inerte, avec sa pastille.
      if (o.desactive) {
        n.disabled = true;
        n.classList.add('desactive');
        n.setAttribute('aria-disabled', 'true');
        if (o.pastille) n.appendChild(el('span', 'q-pastille', o.pastille));
      }
      n.addEventListener('click', function () { if (!o.desactive) a.surChoix(b.cle, o.cle); });
      g.appendChild(n);
      // Une réponse qui DEMANDE combien (60-2c, « Moins en ce moment ») : ses puces s'ouvrent
      // JUSTE DESSOUS, dans la même colonne, avec leur question.
      if (o.apres) {
        if (o.apres.titre) g.appendChild(el('div', 'q-sous-titre', o.apres.titre));
        g.appendChild(blocPuces(o.apres, a));
      }
    });
    return g;
  }

  function blocChamps(b, a) {
    var g = el('div', 'q-champs');
    b.champs.forEach(function (c) {
      var f = el('div', 'q-champ');
      var lib = el('label', 'q-champ-lib', c.libelle);
      var id = 'q-champ-' + c.cle;
      lib.setAttribute('for', id);
      f.appendChild(lib);
      var saisie = el('div', 'q-champ-saisie');
      var champ = el('input', 'q-champ-in');
      champ.id = id;
      champ.type = 'text';
      champ.value = c.valeur === null || c.valeur === undefined ? '' : c.valeur;
      champ.setAttribute('inputmode', c.mode === 'decimal' ? 'decimal' : 'numeric');
      champ.setAttribute('autocomplete', 'off');
      champ.setAttribute('enterkeyhint', 'done');
      saisie.appendChild(champ);
      if (c.unite) saisie.appendChild(el('span', 'q-champ-unite', c.unite));
      f.appendChild(saisie);
      var err = el('small', 'q-err', c.erreur || '');
      err.hidden = !c.erreur;
      champ.addEventListener('input', function () {
        var e = a.surSaisie(c.cle, champ.value);
        err.textContent = e || '';
        err.hidden = !e;
      });
      if (c.aide) f.appendChild(el('small', 'q-champ-aide', c.aide));
      f.appendChild(err);
      g.appendChild(f);
    });
    return g;
  }

  function blocResume(b, a) {
    var g = el('div', 'q-faits q-resume');
    b.lignes.forEach(function (l) {
      var r = el('div', 'q-ligne');
      r.appendChild(el('span', 'q-g', l.libelle));
      var v = el('span', 'q-c');
      v.appendChild(el('span', 'q-c-v', l.valeur));
      var m = el('button', 'q-mod', 'changer');
      m.type = 'button';
      m.dataset.ecran = l.ecran;
      m.addEventListener('click', function () { a.surChanger(l.ecran); });
      v.appendChild(m);
      r.appendChild(v);
      g.appendChild(r);
    });
    return g;
  }

  // Un bloc du questionnaire, posé dans `cible` (le corps de l'écran, ou le contenu d'une section repliée).
  function dessinerBlocDuQuestionnaire(cible, b, a) {
    if (b.titre) cible.appendChild(el('div', 'q-sous-titre', b.titre));
    if (b.type === 'options') cible.appendChild(blocOptions(b, a));
    else if (b.type === 'puces') cible.appendChild(blocPuces(b, a));
    else if (b.type === 'champs') cible.appendChild(blocChamps(b, a));
    else if (b.type === 'resume') cible.appendChild(blocResume(b, a));
    else if (b.type === 'faits') {
      var f = el('div', 'q-faits');
      b.lignes.forEach(function (l) {
        var r = el('div', 'q-ligne');
        r.appendChild(el('span', 'q-g', l.libelle));
        r.appendChild(el('span', 'q-c', l.valeur));
        f.appendChild(r);
      });
      cible.appendChild(f);
    } else if (b.type === 'ligne') {
      var ligne = el('button', 'q-ligne-choix');
      ligne.type = 'button';
      ligne.dataset.cle = b.cle;
      ligne.appendChild(el('span', 'q-lc-lib', b.libelle));
      ligne.appendChild(el('span', 'q-lc-val', b.valeur));
      ligne.appendChild(el('span', 'q-lc-fl', '›'));
      ligne.addEventListener('click', function () { a.surLigne(b.cle); });
      cible.appendChild(ligne);
    } else if (b.type === 'note') cible.appendChild(el('p', 'q-note', b.texte));
    else if (b.type === 'voix') cible.appendChild(el('p', 'q-voix', b.texte));
    if (b.type === 'replie') {
      // 187 — « Ajuster Ma salle » : une section repliée par défaut. Son état est une réponse de l'écran (`b.cle`).
      var sec = el('div', 'q-replie' + (b.ouvert ? ' ouvert' : ''));
      var tete = el('button', 'q-replie-tete');
      tete.type = 'button';
      tete.setAttribute('aria-expanded', b.ouvert ? 'true' : 'false');
      tete.appendChild(el('span', 'q-replie-lib', b.libelle + (b.ouvert ? ' ▴' : ' ▾')));
      if (b.resume) tete.appendChild(el('span', 'q-sous', b.resume));
      tete.addEventListener('click', function () { a.surChoix(b.cle, !b.ouvert); });
      sec.appendChild(tete);
      if (b.ouvert) {
        var dedans = el('div', 'q-replie-corps');
        (b.blocs || []).forEach(function (x) { dessinerBlocDuQuestionnaire(dedans, x, a); });
        sec.appendChild(dedans);
      }
      cible.appendChild(sec);
    }
  }

  function rendreQuestionnaire(cible, vue, actions) {
    if (!cible || !vue) return cible;
    vider(cible);
    var a = actions || {};
    var page = el('div', 'q-page');

    var haut = el('div', 'q-haut');
    if (vue.retour) {
      var retour = el('button', 'q-retour', '‹ Retour');
      retour.type = 'button';
      retour.addEventListener('click', a.surRetour);
      haut.appendChild(retour);
    } else haut.appendChild(el('span', 'q-retour vide'));
    // 60-4 — « Refaire mon programme » (Profil) rejoue l'écran 8b SEUL : pas de barre (il n'y a qu'un écran), pas de
    // « Plus tard » (le retour ramène au Profil). Un espace garde la tête en place.
    if (vue.progression) {
      var barre = el('div', 'q-prog');
      barre.setAttribute('role', 'progressbar');
      barre.setAttribute('aria-valuemin', '1');
      barre.setAttribute('aria-valuemax', String(vue.progression.total));
      barre.setAttribute('aria-valuenow', String(vue.progression.rang + 1));
      var rempli = el('i');
      rempli.style.width = vue.progression.pourcent + '%';
      barre.appendChild(rempli);
      haut.appendChild(barre);
    } else haut.appendChild(el('span', 'q-prog vide'));
    if (!vue.sansPlusTard) {
      var plus = el('button', 'q-plus-tard', 'Plus tard');
      plus.type = 'button';
      plus.addEventListener('click', a.surPlusTard);
      haut.appendChild(plus);
    }
    page.appendChild(haut);

    var corps = el('div', 'q-corps');
    corps.dataset.ecran = vue.id;
    corps.appendChild(el('p', 'q-etape', vue.etape));
    corps.appendChild(el('h2', 'q-titre', vue.titre));
    if (vue.voix) corps.appendChild(el('p', 'q-voix', vue.voix));
    (vue.blocs || []).forEach(function (b) { dessinerBlocDuQuestionnaire(corps, b, a); });
    page.appendChild(corps);

    var bas = el('div', 'q-bas');
    var continuer = el('button', 'principal q-continuer', vue.bouton.libelle);
    continuer.type = 'button';
    continuer.disabled = !vue.bouton.actif;
    continuer.addEventListener('click', a.surContinuer);
    bas.appendChild(continuer);
    page.appendChild(bas);

    cible.appendChild(page);
    return cible;
  }

  // ── Les feuilles du profil ───────────────────────────────────────────────
  //
  // ⚠️ TROIS FEUILLES POUR QUINZE CHAMPS, et c'est délibéré : un choix dans une
  // liste fermée, une saisie libre, une semaine. Une feuille par champ aurait
  // été quinze fois la même chose — « câbler, jamais dupliquer »
  // (CADRAGE-V2 §2 undecies). Elles vivent dans le MÊME voile que les feuilles
  // de séance, donc le retour d'Android les ferme sans qu'on l'écrive.

  function piedFeuille(cible, boutons) {
    var pied = el('div', 'feuille-pied');
    boutons.forEach(function (b) {
      if (!b) return;
      var n = el('button', b.classe, b.texte);
      n.type = 'button';
      n.addEventListener('click', b.surClic);
      pied.appendChild(n);
    });
    cible.appendChild(pied);
    return pied;
  }

  function teteFeuille(cible, titre, sujet, aide) {
    var t = el('div', 'feuille-t', titre);
    if (sujet) t.appendChild(el('em', '', sujet));
    cible.appendChild(t);
    if (aide) cible.appendChild(el('p', 'feuille-aide', aide));
  }

  // Une liste fermée : discipline, matériel, ancienneté, niveau, sexe, unités,
  // séances par semaine, durée. Le choix VALIDE ET FERME — une liste fermée n'a
  // pas de « Valider » à part, le doigt a déjà dit ce qu'il voulait.
  //
  // 60-2c : une réponse peut DEMANDER COMBIEN (`o.apres`, des puces, « Moins en ce moment »). Ses
  // puces s'ouvrent juste dessous, HORS du `.feuille-menu` (qui met en forme des lignes, pas des
  // puces) ; le toucher d'une puce n'écrit rien (`vue.surPuce(cle)`), et la feuille a alors un
  // « Valider » (`vue.surValider`) en plus d'« Annuler ».
  function rendreFeuilleChoix(cible, vue) {
    vider(cible);
    teteFeuille(cible, vue.titre, null, vue.aide);
    var menu = el('div', 'feuille-menu choix');
    (vue.options || []).forEach(function (o) {
      var b = el('button', o.cle === vue.valeur ? 'choisi' : '', '');
      b.type = 'button';
      b.dataset.cle = String(o.cle);
      var t = el('span', 'choix-t', o.libelle);
      if (o.sous) t.appendChild(el('small', '', o.sous));
      b.appendChild(t);
      // La coche dit ce qui est en vigueur. Sans elle, une liste de huit durées
      // ne dit pas laquelle est la sienne.
      if (o.cle === vue.valeur) b.appendChild(el('span', 'choix-coche', '✓'));
      b.addEventListener('click', function () { vue.surChoix(o.cle); });
      menu.appendChild(b);
      if (o.apres) {
        cible.appendChild(menu);
        var q = el('div', 'choix-puces');
        if (o.apres.titre) q.appendChild(el('div', 'choix-groupe', o.apres.titre));
        q.appendChild(blocPuces(o.apres, { surChoix: function (c, v) { vue.surPuce(v); } }));
        cible.appendChild(q);
        menu = el('div', 'feuille-menu choix');
      }
    });
    if (menu.childNodes.length) cible.appendChild(menu);
    piedFeuille(cible, [
      vue.surEffacer ? { classe: 'des', texte: 'Effacer', surClic: vue.surEffacer } : null,
      { classe: 'sec', texte: 'Annuler', surClic: vue.surAnnuler },
      vue.surValider ? { classe: 'pri', texte: 'Valider', surClic: vue.surValider } : null
    ]);
    return cible;
  }

  // Plusieurs réponses dans une liste fermée (les priorités, jusqu'à `max`). Le
  // choix se COCHE et se décoche, « Valider » ferme. Une fois `max` atteint, les
  // lignes non cochées s'éteignent — sans un mot : la quatrième n'est pas
  // refusée après coup, elle n'est pas offerte. « Pas de priorité » est une
  // réponse à part (`aucune`), qui vide la liste.
  //   vue : { titre, aide, groupes: [{ titre, options: [{ cle, libelle }] }],
  //           valeurs, max, aucune: { libelle, actif }, surBasculer(cle),
  //           surAucune(), surValider(), surAnnuler() }
  function rendreFeuilleChoixMultiple(cible, vue) {
    vider(cible);
    teteFeuille(cible, vue.titre, null, vue.aide);
    var valeurs = vue.valeurs || [];
    var plein = valeurs.length >= vue.max;
    (vue.groupes || []).forEach(function (g) {
      if (g.titre) cible.appendChild(el('div', 'choix-groupe', g.titre));
      var menu = el('div', 'feuille-menu choix');
      g.options.forEach(function (o) {
        var coche = valeurs.indexOf(o.cle) >= 0;
        var eteint = plein && !coche;
        var b = el('button', (coche ? 'choisi' : '') + (eteint ? ' inerte' : ''), '');
        b.type = 'button';
        b.dataset.cle = String(o.cle);
        b.setAttribute('aria-pressed', coche ? 'true' : 'false');
        if (eteint) b.setAttribute('aria-disabled', 'true');
        b.appendChild(el('span', 'choix-t', o.libelle));
        if (coche) b.appendChild(el('span', 'choix-coche', '✓'));
        b.addEventListener('click', function () { vue.surBasculer(o.cle); });
        menu.appendChild(b);
      });
      cible.appendChild(menu);
    });
    if (vue.aucune) {
      var menuA = el('div', 'feuille-menu choix');
      var a = el('button', vue.aucune.actif ? 'choisi' : '', '');
      a.type = 'button';
      a.dataset.cle = 'aucune';
      a.setAttribute('aria-pressed', vue.aucune.actif ? 'true' : 'false');
      a.appendChild(el('span', 'choix-t', vue.aucune.libelle));
      if (vue.aucune.actif) a.appendChild(el('span', 'choix-coche', '✓'));
      a.addEventListener('click', vue.surAucune);
      menuA.appendChild(a);
      cible.appendChild(menuA);
    }
    piedFeuille(cible, [
      { classe: 'sec', texte: 'Annuler', surClic: vue.surAnnuler },
      { classe: 'pri', texte: 'Valider', surClic: vue.surValider }
    ]);
    return cible;
  }

  // 108 (MOTEUR §10 bis, ECRAN-PROFIL §2.4 quinquies, maquette `maquette-salle-objectif-v1.html`, écran 1) — « MA
  // SALLE ». Les barres fixes, EZ et droite : des puces cochées, « ＋ » pour un autre poids ; les haltères : « Jusqu'à »
  // (le plus lourd, par haltère) et « De … en … ». La feuille ne décide rien : `vue` porte le brouillon et les gestes
  // (`surBasculer(type, kg)`, `surAjouter(type, texte)`, `surMaxHalteres(texte, i)` sans redessin, `surPasHalteres(kg, i)`,
  // 123 : `surAjouterTranche`, `surRetirerTranche(i)`, `surSansHalteres`, `aucunHaltere()` ; `surValider`, `surEffacer`,
  // `surAnnuler`) ; les puces viennent de `THProfil.pucesDeBarres`.
  function rendreFeuilleSalle(cible, vue) {
    var P = racine.THProfil, M = racine.THModele;
    var b = vue.brouillon || { barres_ez: [], barres_droites: [], halteres: null };
    vider(cible);
    teteFeuille(cible, 'Ma salle', null, P.PHRASE_SALLE);
    // 163 (24/10/2026, décision d'Aurélien) — « Ma salle » ne garde que les élastiques : plus de barres fixes, plus de
    // haltères, plus de bascule « barre chargée ». Le coach lit ces charges dans l'historique (MOTEUR §10.2 bis).
    // 132 (ECRAN-PROFIL §2.4 sexies, maquette `maquette-elastiques-v2.html`, écran 1) — LES DEUX LISTES et le choix.
    // 190 (MOTEUR §10.2) — LES DEUX LIGNES DU MATÉRIEL, les mêmes que celles du questionnaire (« Ajuster Ma salle »,
    // `THProfil.lignesMateriel`) : le plus petit disque, une barre de traction. Elles se montrent à tout le monde ;
    // les élastiques, seulement quand un exercice à l'élastique existe (`vue.avecElastiques`).
    if (vue.surReglage) lignesDuMateriel(cible, b, vue);
    if (vue.surAjouterElastique && vue.avecElastiques !== false) elastiquesDeLaSalle(cible, b, vue);
    cible.appendChild(el('p', 'feuille-err', vue.erreur || ''));
    // « Effacer » seulement quand une salle est déjà déclarée : il écrit le vide (non renseignée).
    piedFeuille(cible, [
      vue.declaree && vue.surEffacer ? { classe: 'des', texte: 'Effacer', surClic: vue.surEffacer } : null,
      { classe: 'sec', texte: 'Annuler', surClic: vue.surAnnuler },
      { classe: 'pri', texte: 'Valider', surClic: vue.surValider }
    ]);
    return cible;
  }

  // 190 — « Le plus petit disque » et « Une barre de traction » : un titre, sa phrase, des puces (`blocPuces`, celles du
  // questionnaire). Le geste est `vue.surReglage(cle, valeur)` ; la feuille ne décide rien.
  function lignesDuMateriel(cible, b, vue) {
    racine.THProfil.lignesMateriel(b).forEach(function (l) {
      var carte = el('div', 'el-carte');
      carte.dataset.reglage = l.cle;
      carte.appendChild(el('div', 'choix-groupe salle-titre', l.titre));
      carte.appendChild(el('p', 'feuille-aide', l.aide));
      carte.appendChild(blocPuces({ cle: l.cle, valeur: l.valeur, options: l.options },
        { surChoix: function (c, v) { vue.surReglage(c, v); } }));
      cible.appendChild(carte);
    });
  }

  // 132 — UNE PASTILLE : la couleur que le nom dit (`THModele.pastilleElastique`), ou neutre.
  function pastille(nom) {
    var p = el('span', 'el-pastille');
    var c = racine.THModele.pastilleElastique(nom);
    if (c) p.style.background = c;
    else p.className += ' neutre';
    return p;
  }

  // 132 — MES ÉLASTIQUES, dans Ma salle : « Grands élastiques » (nom, kg facultatif) et « Mini-bandes » (nom seul),
  // chacune rangée du plus fort au plus léger EN GLISSANT par la poignée ; puis « J'ai noté une aide à l'élastique :
  // en kg / par son nom ». La feuille ne décide rien : `vue.surAjouterElastique(liste, nom, kg)`,
  // `vue.surRetirerElastique(liste, i)`, `vue.surDeplacerElastique(liste, de, vers)`, `vue.surParNom(bool)` ; les
  // phrases et la borne viennent de `THProfil`.
  function elastiquesDeLaSalle(cible, b, vue) {
    var P = racine.THProfil, M = racine.THModele;
    [['elastiques', 'Grands élastiques', P.PHRASE_GRANDS_ELASTIQUES, 'Ajouter un élastique'],
     ['mini_bandes', 'Mini-bandes', P.PHRASE_MINI_BANDES, 'Ajouter une mini-bande']].forEach(function (t) {
      var liste = t[0], avecKg = liste === 'elastiques';
      var carte = el('div', 'el-carte');
      carte.dataset.liste = liste;
      carte.appendChild(el('div', 'choix-groupe salle-titre', t[1]));
      carte.appendChild(el('p', 'feuille-aide', t[2]));
      var rangs = el('div', 'el-rangs');
      var elements = (b[liste] || []);
      elements.forEach(function (e, i) {
        var r = el('div', 'el-rang');
        r.dataset.i = String(i);
        var poignee = el('span', 'el-poignee', '\u22ee\u22ee');
        poignee.setAttribute('aria-label', 'Glisser pour ranger ' + e.nom);
        poignee.setAttribute('role', 'button');
        r.appendChild(poignee);
        r.appendChild(pastille(e.nom));
        r.appendChild(el('span', 'el-nom', e.nom));
        r.appendChild(el('span', 'el-kg num', avecKg ? (e.kg !== undefined && e.kg !== null ? M.nombreSigne(e.kg) + '\u00a0kg' : '\u2014') : ''));
        var x = el('button', 'el-retirer', '\u00d7');
        x.type = 'button';
        x.setAttribute('aria-label', 'Retirer ' + e.nom);
        x.addEventListener('click', function () { vue.surRetirerElastique(liste, i); });
        r.appendChild(x);
        glisserPourRanger(poignee, r, rangs, i, function (vers) { vue.surDeplacerElastique(liste, i, vers); });
        rangs.appendChild(r);
      });
      carte.appendChild(rangs);
      if (elements.length > 1) {
        var ordre = el('div', 'el-ordre');
        ordre.appendChild(el('span', '', 'le plus fort'));
        ordre.appendChild(el('span', '', 'le plus léger'));
        carte.appendChild(ordre);
      }
      if (P.peutAjouterElastique(b, liste)) {
        var ajout = el('button', 'discret el-ajout', '\uff0b ' + t[3]);
        ajout.type = 'button';
        carte.appendChild(ajout);
        // « ＋ » : le nom (et le kg d'un grand élastique, facultatif), puis « Ajouter ». Rien ne s'ajoute avant.
        ajout.addEventListener('click', function () {
          if (carte.querySelector('.el-saisie')) return;
          var saisie = el('div', 'salle-ajout el-saisie');
          var nom = doc.createElement('input');
          nom.type = 'text';
          nom.maxLength = 30;
          nom.placeholder = 'Nom';
          nom.setAttribute('aria-label', 'Nom de l’élastique');
          nom.className = 'el-champ-nom';
          saisie.appendChild(nom);
          var kg = null;
          if (avecKg) {
            kg = doc.createElement('input');
            kg.type = 'number';
            kg.inputMode = 'decimal';
            kg.step = '0.5';
            kg.placeholder = 'kg';
            kg.setAttribute('aria-label', 'Son aide en kg, facultative');
            kg.className = 'el-champ-kg';
            saisie.appendChild(kg);
          }
          var ok = el('button', 'discret', 'Ajouter');
          ok.type = 'button';
          ok.addEventListener('click', function () { vue.surAjouterElastique(liste, nom.value, kg ? kg.value : null); });
          saisie.appendChild(ok);
          carte.insertBefore(saisie, ajout);
          nom.focus();
        });
      }
      cible.appendChild(carte);
    });
    var parNom = b.elastiques_par_nom === true;
    var carteChoix = el('div', 'el-carte el-choix-carte');
    carteChoix.appendChild(el('div', 'choix-groupe salle-titre', 'J’ai noté une aide à l’élastique'));
    var choix = el('div', 'el-choix');
    [[false, 'en kg'], [true, 'par son nom']].forEach(function (c) {
      var on = parNom === c[0];
      var bt = el('button', 'q-puce' + (on ? ' on' : ''), c[1]);
      bt.type = 'button';
      bt.dataset.choix = c[0] ? 'nom' : 'kg';
      bt.setAttribute('aria-pressed', on ? 'true' : 'false');
      bt.addEventListener('click', function () { vue.surParNom(c[0]); });
      choix.appendChild(bt);
    });
    carteChoix.appendChild(choix);
    carteChoix.appendChild(el('p', 'feuille-aide', P.PHRASE_PAR_NOM));
    cible.appendChild(carteChoix);
  }

  // 132 (ECRAN-SAISIE §3 ter.6, maquette `maquette-elastiques-v2.html`, écran 3) — LA FEUILLE DE CHOIX DE L'ÉLASTIQUE :
  // la liste qui va avec l'exercice, dans son ordre (du plus fort au plus léger), avec la pastille, « le plus fort » sur
  // le premier, la coche sur le choisi. `vue` : `{ exercice, numero, liste: [noms], mini, choisi, surChoix(nom),
  // surAnnuler }`. Elle ne décide rien.
  function rendreFeuilleElastique(cible, vue) {
    vider(cible);
    teteFeuille(cible, vue.exercice, 'Série ' + vue.numero, null);
    var l = el('div', 'el-feuille');
    (vue.liste || []).forEach(function (nom, i) {
      var sel = nom === vue.choisi;
      var b = el('button', 'el-rang el-choisir' + (sel ? ' sel' : ''));
      b.type = 'button';
      b.dataset.nom = nom;
      b.setAttribute('aria-pressed', sel ? 'true' : 'false');
      b.appendChild(el('span', '', ''));
      b.appendChild(pastille(nom));
      b.appendChild(el('span', 'el-nom', nom));
      b.appendChild(el('span', 'el-kg', sel ? '\u2713' : (i === 0 && vue.liste.length > 1 ? (vue.mini ? 'la plus forte' : 'le plus fort') : '')));
      b.addEventListener('click', function () { vue.surChoix(nom); });
      l.appendChild(b);
    });
    cible.appendChild(l);
    piedFeuille(cible, [{ classe: 'sec', texte: 'Annuler', surClic: vue.surAnnuler }]);
    return cible;
  }

  // 163 (MOTEUR §10 ter, ECRAN-SAISIE §3 ter.6) — « AJOUTE TES ÉLASTIQUES » : au premier usage, la feuille où l'on
  // choisit PAR SON NOM (Noir, Rouge… du plus fort au plus léger) ou PAR SON POIDS (kg). `vue` : `{ exercice, mini,
  // noms: [...], erreur, surValider({ noms, kgs }), surAnnuler }`. Elle ne décide rien : la liste rangée et le réglage
  // « par son nom » sont ceux de `THProfil.elastiquesAjoutes`.
  function rendreFeuilleAjoutElastiques(cible, vue) {
    vider(cible);
    teteFeuille(cible, 'Ajoute tes élastiques', vue.exercice, null);
    cible.appendChild(el('p', 'feuille-aide', vue.mini
      ? 'Tes mini-bandes, par leur nom, rangées du plus fort au plus léger.'
      : 'Choisis tes élastiques par leur nom, ou par leur poids. Tu pourras les ranger dans le Profil, Ma salle.'));
    var choisis = {};
    var mode = 'nom';
    var corps = el('div', 'el-ajout-corps');
    var segment = el('div', 'el-choix');
    var champKg = null;
    var dessiner = function () {
      vider(corps);
      if (mode === 'nom') {
        var puces = el('div', 'q-puces salle-puces el-noms');
        (vue.noms || []).forEach(function (nom) {
          var on = choisis[nom] === true;
          var b = el('button', 'q-puce' + (on ? ' on' : ''), '');
          b.type = 'button';
          b.dataset.nom = nom;
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
          b.appendChild(pastille(nom));
          b.appendChild(el('span', 'el-nom', nom));
          b.addEventListener('click', function () { choisis[nom] = !choisis[nom]; dessiner(); });
          puces.appendChild(b);
        });
        corps.appendChild(puces);
        corps.appendChild(el('div', 'el-ordre')).appendChild(el('span', '', 'le plus fort'));
      } else {
        var lab = el('label', 'champ-texte');
        lab.appendChild(el('span', '', 'Le poids de ton aide, en kg (plusieurs : 10, 20, 35)'));
        champKg = doc.createElement('input');
        champKg.type = 'text';
        champKg.inputMode = 'decimal';
        champKg.placeholder = 'kg';
        champKg.className = 'el-champ-kg';
        champKg.setAttribute('aria-label', 'Poids des élastiques, en kg');
        lab.appendChild(champKg);
        corps.appendChild(lab);
      }
    };
    if (!vue.mini) {
      [['nom', 'par son nom'], ['kg', 'par son poids']].forEach(function (c) {
        var bt = el('button', 'q-puce' + (c[0] === mode ? ' on' : ''), c[1]);
        bt.type = 'button';
        bt.dataset.choix = c[0];
        bt.addEventListener('click', function () {
          mode = c[0];
          Array.prototype.forEach.call(segment.children, function (x) {
            x.className = 'q-puce' + (x.dataset.choix === mode ? ' on' : '');
            x.setAttribute('aria-pressed', x.dataset.choix === mode ? 'true' : 'false');
          });
          dessiner();
        });
        bt.setAttribute('aria-pressed', c[0] === mode ? 'true' : 'false');
        segment.appendChild(bt);
      });
      cible.appendChild(segment);
    }
    cible.appendChild(corps);
    dessiner();
    cible.appendChild(el('p', 'feuille-err', vue.erreur || ''));
    piedFeuille(cible, [
      { classe: 'sec', texte: 'Annuler', surClic: vue.surAnnuler },
      { classe: 'pri', texte: 'Valider', surClic: function () {
        var noms = Object.keys(choisis).filter(function (n) { return choisis[n]; });
        var kgs = [];
        if (mode === 'kg' && champKg) {
          String(champKg.value || '').split(/;\s*|,\s+|\s+/).forEach(function (t) {
            var v = t.trim() === '' ? null : M().lireNombre(t);
            if (v !== null) kgs.push(v);
          });
          if (String(champKg.value || '').trim() !== '' && !kgs.length) kgs.push(NaN);
        }
        vue.surValider({ noms: noms, kgs: kgs });
      } }
    ]);
    return cible;
  }

  // Glisser une rangée par sa poignée : la rangée suit le doigt, et au lâcher la place se lit sur la hauteur des autres
  // rangées (le milieu de chacune). Rien ne change sans déplacement réel.
  function glisserPourRanger(poignee, rang, conteneur, i, surLacher) {
    var depart = null;
    poignee.addEventListener('pointerdown', function (e) {
      depart = e.clientY;
      if (poignee.setPointerCapture && e.pointerId !== undefined) {
        try { poignee.setPointerCapture(e.pointerId); } catch (x) { /* rien */ }
      }
      rang.classList.add('glisse');
      e.preventDefault();
    });
    poignee.addEventListener('pointermove', function (e) {
      if (depart === null) return;
      rang.style.transform = 'translateY(' + (e.clientY - depart) + 'px)';
    });
    var lacher = function (e) {
      if (depart === null) return;
      var y = e.clientY;
      depart = null;
      rang.style.transform = '';
      rang.classList.remove('glisse');
      var autres = Array.prototype.slice.call(conteneur.children);
      var vers = 0;
      autres.forEach(function (a, k) {
        if (k === i) return;
        var bx = a.getBoundingClientRect();
        if (y > bx.top + bx.height / 2) vers = k < i ? k + 1 : k;
      });
      // Au-dessus de tout : la première place ; sinon, la dernière rangée dépassée (décalée de la rangée qui part).
      if (vers !== i) surLacher(Math.max(0, Math.min(autres.length - 1, vers)));
    };
    poignee.addEventListener('pointerup', lacher);
    poignee.addEventListener('pointercancel', function () {
      depart = null; rang.style.transform = ''; rang.classList.remove('glisse');
    });
  }

  // 60-4 (ECRAN-PROFIL §4 bis, G10) — « Exercices écartés » : la liste, « Reprendre » sur chacun.  // 60-4 (ECRAN-PROFIL §4 bis, G10) — « Exercices écartés » : la liste, « Reprendre » sur chacun. Rien n'est caché
  // ni perdu : un exercice repris revient dans les programmes et en tête du catalogue. `vue` : `{ titre, aide,
  // exercices: [{ nom, surReprendre }], surFermer }`.
  function rendreFeuilleEcartes(cible, vue) {
    vider(cible);
    teteFeuille(cible, vue.titre, null, vue.aide);
    var liste = el('div', 'ecartes-liste');
    (vue.exercices || []).forEach(function (x) {
      var ligne = el('div', 'ecarte-ligne');
      ligne.appendChild(el('span', 'ecarte-nom', x.nom));
      var b = el('button', 'discret ecarte-reprendre', 'Reprendre');
      b.type = 'button';
      b.addEventListener('click', x.surReprendre);
      ligne.appendChild(b);
      liste.appendChild(ligne);
    });
    cible.appendChild(liste);
    piedFeuille(cible, [{ classe: 'sec', texte: 'Fermer', surClic: vue.surFermer }]);
    return cible;
  }

  // Une saisie libre : taille, date de naissance, bio, pseudo, mot de passe.
  // `type` est celui de l'input — `date` et `number` ouvrent le bon clavier sur
  // Android, ce qu'aucun `text` ne fait.
  function rendreFeuilleSaisie(cible, vue) {
    vider(cible);
    teteFeuille(cible, vue.titre, null, vue.aide);
    var env = el('label', 'champ-texte');
    env.appendChild(el('span', '', vue.etiquette || vue.titre));
    var n = doc.createElement(vue.lignes ? 'textarea' : 'input');
    if (vue.lignes) n.rows = vue.lignes;
    else n.type = vue.type || 'text';
    if (vue.max) n.maxLength = vue.max;
    if (vue.inputMode) n.inputMode = vue.inputMode;
    if (vue.placeholder) n.placeholder = vue.placeholder;
    if (vue.autocomplete) n.autocomplete = vue.autocomplete;
    n.value = (vue.valeur === null || vue.valeur === undefined) ? '' : String(vue.valeur);
    env.appendChild(n);
    cible.appendChild(env);
    var err = el('p', 'feuille-err', '');
    cible.appendChild(err);
    piedFeuille(cible, [
      vue.surEffacer ? { classe: 'des', texte: 'Effacer', surClic: vue.surEffacer } : null,
      { classe: 'sec', texte: 'Annuler', surClic: vue.surAnnuler },
      { classe: 'pri', texte: 'Valider', surClic: function (ev) {
        // ⚠️ LE REFUS RESTE DANS LA FEUILLE. Fermer sur une valeur invalide
        // perdrait la saisie sans rien dire — et la borne qu'on double ici est
        // un CHECK de la base, dont le refus part en 23514, code DÉFINITIF dans
        // la file. Mieux vaut une phrase tout de suite qu'une ligne morte.
        var verdict = vue.surValider(n.value);
        // 60-5 — une validation peut ATTENDRE une réponse (le pseudo est vérifié avant la fermeture) : le
        // bouton se grise le temps de la question, pour qu'un second tap n'en pose pas une deuxième. Le refus
        // qui arrive se lit comme les autres ; la feuille fermée entre-temps n'a plus rien à dire.
        if (verdict && typeof verdict.then === 'function') {
          var bouton = ev && ev.currentTarget;
          if (bouton) bouton.disabled = true;
          // Le refus de l'essai d'AVANT ne parle plus de ce qu'on vérifie ; et le champ ne bouge pas pendant
          // l'attente (le pseudo écrit est celui qui est demandé, pas un autre).
          err.textContent = '';
          n.readOnly = true;
          var fin = function (refus) {
            if (bouton) bouton.disabled = false;
            n.readOnly = false;
            if (refus) { err.textContent = refus; n.focus(); }
          };
          verdict.then(fin, function () { fin(null); });
          return;
        }
        if (verdict) { err.textContent = verdict; n.focus(); }
      } }
    ]);
    return cible;
  }

  // 92 — LA PESÉE DEPUIS LE PROFIL : deux champs (le poids, le jour). Le rendu ne décide rien : `surValider`
  // rend la phrase de refus, qui reste dans la feuille (le CHECK de la base est doublé avant la file).
  function rendreFeuillePesee(cible, vue) {
    vider(cible);
    teteFeuille(cible, 'Poids', null, vue.aide || null);
    var champ = function (etiquette, type, valeur, cle) {
      var env = el('label', 'champ-texte');
      env.appendChild(el('span', '', etiquette));
      var n = doc.createElement('input');
      n.type = type;
      n.setAttribute('data-cle', cle);
      if (type === 'text') { n.inputMode = 'decimal'; n.placeholder = 'kg'; }
      if (type === 'date' && vue.max) n.max = vue.max;
      n.value = valeur === null || valeur === undefined ? '' : String(valeur);
      env.appendChild(n);
      cible.appendChild(env);
      return n;
    };
    var poids = champ('Poids (kg)', 'text', vue.poids, 'poids');
    var jour = champ('Date', 'date', vue.jour, 'jour');
    var err = el('p', 'feuille-err', '');
    cible.appendChild(err);
    piedFeuille(cible, [
      { classe: 'sec', texte: 'Annuler', surClic: vue.surAnnuler },
      { classe: 'pri', texte: 'Valider', surClic: function () {
        var refus = vue.surValider(poids.value, jour.value);
        if (refus) { err.textContent = refus; poids.focus(); }
      } }
    ]);
    return cible;
  }

  // ── Importer depuis Hevy (69, ECRAN-PROFIL §2.4 quater) ─────────────────
  //
  // Quatre états, un écran : les deux choix (coller, ou le fichier), l'aperçu
  // (rien n'est écrit avant « Importer »), la progression par paquets, la fin.
  // Les phrases viennent de `THImportHevy` (au mot près, K1 et la maquette) ;
  // ce rendu ne décide rien, il pose ce que `vue` dit.
  function rendreImport(cible, vue) {
    if (!cible) return;
    vider(cible);
    var bouton = function (libelle, classe, surClic, actif) {
      var b = el('button', classe, libelle);
      b.type = 'button';
      if (actif === false) b.disabled = true;
      b.addEventListener('click', function () { if (!b.disabled) surClic(); });
      return b;
    };
    if (vue.etape === 'en_cours') {
      cible.appendChild(el('h2', 'titre-vue', 'Import en cours'));
      var barre = el('div', 'imp-barre');
      var plein = el('i');
      plein.style.width = (vue.progression.total ? Math.round(100 * vue.progression.fait / vue.progression.total) : 0) + '%';
      barre.appendChild(plein);
      cible.appendChild(barre);
      cible.appendChild(el('p', 'imp-aide imp-progression', vue.progression.texte));
      return cible;
    }
    if (vue.etape === 'fini') {
      cible.appendChild(el('h2', 'titre-vue', vue.fin.titre));
      if (vue.fin.connexion) cible.appendChild(el('p', 'imp-ok imp-erreur', vue.fin.connexion));
      var phrase = [vue.fin.detail, vue.fin.suite].filter(Boolean).join(' ');
      if (phrase) cible.appendChild(el('p', 'imp-ok', phrase));
      cible.appendChild(bouton(vue.libelleFin || 'Voir l\u2019historique', 'discret imp-bouton', vue.surHistorique));
      return cible;
    }
    if (vue.etape === 'apercu') {
      cible.appendChild(el('h2', 'titre-vue', vue.titre));
      if (vue.periode) cible.appendChild(el('p', 'imp-aide imp-periode', vue.periode));
      var liste = el('div', 'imp-seances');
      vue.lignes.forEach(function (l, i) {
        var b = el('button', 'imp-seance' + (l.grise ? ' grise' : ''));
        b.type = 'button';
        b.setAttribute('role', 'checkbox');
        b.setAttribute('aria-checked', l.coche ? 'true' : 'false');
        if (l.grise) b.disabled = true;
        b.addEventListener('click', function () { if (!b.disabled) vue.surCocher(i); });
        b.appendChild(el('span', 'imp-case' + (l.grise ? ' off' : l.coche ? ' on' : '')));
        var g = el('span', 'imp-g');
        g.appendChild(el('span', 'imp-t', l.titre));
        g.appendChild(el('span', 'imp-d', l.quand));
        g.appendChild(el('span', 'imp-e', l.sous));
        b.appendChild(g);
        liste.appendChild(b);
        // 147 — une séance de plus de 5 h : « Dure 9 h 42 », et deux choix (« Sans heure de fin » par défaut).
        if (l.duree && !l.grise) {
          var d = el('div', 'imp-duree');
          d.setAttribute('role', 'radiogroup');
          d.appendChild(el('span', 'imp-duree-t', 'Dure ' + l.duree));
          [[true, 'Sans heure de fin'], [false, 'Garder ' + l.duree]].forEach(function (c) {
            var bc = el('button', 'imp-duree-c' + (!!l.sansFin === c[0] ? ' sel' : ''), c[1]);
            bc.type = 'button';
            bc.setAttribute('role', 'radio');
            bc.setAttribute('data-choix', c[0] ? 'sans-fin' : 'garder');
            bc.setAttribute('aria-checked', !!l.sansFin === c[0] ? 'true' : 'false');
            bc.addEventListener('click', function () { vue.surChoisirFin(i, c[0]); });
            d.appendChild(bc);
          });
          liste.appendChild(d);
        }
      });
      cible.appendChild(liste);
      if (vue.noms.length) {
        cible.appendChild(el('div', 'imp-groupe', vue.titreNoms));
        var r = el('div', 'imp-rattacher');
        vue.noms.forEach(function (x) {
          var ligne = el('div', 'imp-nom');
          var g2 = el('div', 'imp-g');
          g2.appendChild(el('div', 'imp-nom-t', x.nom));
          g2.appendChild(el('div', 'imp-aide', x.aide));
          ligne.appendChild(g2);
          ligne.appendChild(bouton('Choisir', 'imp-lien', function () { vue.surChoisirNom(x.nom); }));
          r.appendChild(ligne);
        });
        cible.appendChild(r);
      }
      cible.appendChild(bouton(vue.bouton.libelle, 'principal imp-bouton imp-importer', vue.surImporter, vue.bouton.actif));
      if (vue.attend) cible.appendChild(el('p', 'imp-aide imp-attend', vue.attend));
      return cible;
    }
    // Les deux choix.
    cible.appendChild(el('h2', 'titre-vue', 'Importer depuis Hevy'));
    if (vue.erreur) cible.appendChild(el('p', 'imp-ok imp-erreur', vue.erreur));
    var c1 = el('div', 'imp-choix');
    c1.appendChild(el('b', '', 'Coller des séances'));
    c1.appendChild(el('div', 'imp-aide', 'Dans Hevy : une séance \u2192 Partager \u2192 Copier. Tu peux en coller plusieurs à la suite.'));
    var zone = el('textarea', 'imp-zone');
    zone.id = 'champ-texte-hevy';
    zone.setAttribute('aria-label', 'Le texte de Hevy');
    zone.value = vue.texte || '';
    zone.addEventListener('input', function () { vue.surSaisie(zone.value); });
    c1.appendChild(zone);
    c1.appendChild(bouton('Lire le texte', 'principal imp-bouton imp-lire', function () { vue.surLireTexte(zone.value); }, !vue.occupe));
    cible.appendChild(c1);
    var c2 = el('div', 'imp-choix');
    c2.appendChild(el('b', '', 'Choisir le fichier de Hevy'));
    c2.appendChild(el('div', 'imp-aide', 'L\u2019export des séances (.csv), dans les paramètres de Hevy. Tout ton historique d\u2019un coup.'));
    c2.appendChild(bouton('Choisir le fichier', 'discret imp-bouton imp-fichier', vue.surChoisirFichier, !vue.occupe));
    cible.appendChild(c2);
    // 187 (A2) — depuis le questionnaire : on peut y revenir sans rien importer.
    if (vue.surReprendre) cible.appendChild(bouton(vue.libelleFin, 'discret imp-bouton imp-reprendre', vue.surReprendre));
    return cible;
  }

  // ── Tous mes exercices (§2.4 bis) ────────────────────────────────────────
  //
  // Tri par dernière utilisation, recherche par nom, et un tap ouvre la page de
  // l'exercice. Ce que Hevy met dans son profil, et qui nous manquait : chez
  // nous la page d'exercice ne s'atteignait que depuis une séance EN COURS et
  // depuis Progression — donc pour voir l'historique de son couché, il fallait
  // démarrer une séance.
  function rendreMesExercices(cible, vue) {
    if (!cible) return;
    vider(cible);
    var liste = vue.exercices || [];
    if (!liste.length) {
      return message(cible, vue.recherche ? 'Aucun exercice à ce nom.' : 'Aucun exercice.', 'rien');
    }
    liste.forEach(function (x) {
      var b = el('button', 'exo-ligne' + (x.jamais ? ' jamais' : ''));
      b.type = 'button';
      b.addEventListener('click', function () { vue.surChoix(x.slug); });
      var g = el('span', 'exo-g');
      g.appendChild(el('span', 'exo-nom', x.nom));
      if (x.detail) g.appendChild(el('small', '', x.detail));
      b.appendChild(g);
      b.appendChild(el('span', 'exo-quand', x.quand || ''));
      b.appendChild(el('span', 'p-fl', '›'));
      cible.appendChild(b);
    });
    return cible;
  }

  // ── L'écran d'entrée : connexion ET inscription ──────────────────────────
  //
  // ⚠️ UN SEUL ÉCRAN, DEUX MODES. Le formulaire, les champs et le code sont les
  // mêmes ; ce qui change est la phrase d'accueil, la présence du pseudo, le
  // libellé du bouton et ce que fait la soumission. Deux sections auraient été
  // deux formulaires à tenir d'accord — et l'inscription, c'est la connexion
  // plus un champ.
  function rendreEntree(vue) {
    var inscription = vue.mode === 'inscription';
    if (vue.phrase) {
      vue.phrase.textContent = inscription
        ? 'Ton profil se remplit après, à ton rythme.'
        : 'Le carnet qui ne raconte pas d’histoires.';
    }
    if (vue.pseudo) vue.pseudo.hidden = !inscription;
    // 70 — « Mot de passe oublié ? » sous la phrase de l'inscription (`oubliSous`) : c'est la seule issue d'une
    // adresse déjà inscrite. Sinon, à sa place sous le mot de passe, et caché à l'inscription.
    if (vue.oubli) {
      vue.oubli.hidden = inscription && !vue.oubliSous;
      if (vue.oubliSous && vue.message && vue.message.parentNode) {
        vue.message.parentNode.insertBefore(vue.oubli, vue.message.nextSibling);
      } else if (vue.bouton && vue.bouton.parentNode && vue.oubli.nextSibling !== vue.bouton) {
        vue.bouton.parentNode.insertBefore(vue.oubli, vue.bouton);
      }
    }
    if (vue.aideMdp) vue.aideMdp.hidden = !inscription;
    if (vue.bouton) vue.bouton.textContent = inscription ? 'Créer mon compte' : 'Se connecter';
    if (vue.bascule) vue.bascule.textContent = inscription ? 'Se connecter' : 'Créer un compte';
    if (vue.basculeAvant) {
      vue.basculeAvant.textContent = inscription ? 'Déjà un compte ? ' : 'Pas encore de compte ? ';
    }
    // Les attributs d'auto-remplissage changent AVEC le mode : en connexion
    // l'identifiant est l'e-mail, à l'inscription c'est le pseudo, et un
    // gestionnaire de mots de passe qui reçoit `current-password` sur une
    // création propose le mauvais mot de passe.
    if (vue.champEmail) vue.champEmail.autocomplete = inscription ? 'email' : 'username';
    if (vue.champMdp) vue.champMdp.autocomplete = inscription ? 'new-password' : 'current-password';
  }


  // ══ LE JEU (64B, JEU-V1 §9, maquette `maquette-jeu-v6.html`) ═════════════
  //
  // ⚠️ LE RENDU NE CALCULE RIEN DU JEU. Il reçoit l'état (`THJeu.etatDuJeu`) et
  // les lectures que `app.js` lui a déjà faites (`lesPlusProches`, `jauges`,
  // `parCategorie`, `titresEtCadresDetailles`, `vitrine`, `apport`) ; il ne
  // nomme pas le module du jeu. Ici vivent les TEXTES — libellés, singulier,
  // arrondis à l'entier supérieur — et la forme.
  //
  // ⚠️ AUCUN AMBRE (§9.6) : l'ambre est la voix du coach, qui ne parle jamais du
  // jeu. Les raretés : `--rarete-1` à `--rarete-4` (majeur = l'or des records).
  // Pas de rouge, pas de « dernier », pas de « bravo », rien sur l'assiduité.
  var JEU_TITRES = { equilibre: 'Équilibré', polyvalent: 'Polyvalent', athlete: 'Athlète', accompli: 'Accompli',
                     complet: 'Complet', collectionneur: 'Collectionneur' };
  var JEU_CADRES = { vitrine: 'Cadre de vitrine', niveau: 'Cadre de niveau', or: 'Cadre d’or', grave: 'Cadre gravé' };
  var JEU_CATEGORIES = { seances: 'Séances', serie: 'Série de semaines', records: 'Records', rando: 'Randonnée',
                         decouverte: 'Découverte', muscle: 'Muscles', tous: 'Tous les muscles', distance: 'Distances', cap: 'Caps ronds' };
  var JEU_RANG = { commun: 1, rare: 2, exceptionnel: 3, majeur: 4 };
  var NBSP = ' ', FINE = ' ';

  function motJeu(n, un, plusieurs) { return n === 1 ? un : plusieurs; }
  function groupe(n) { return M().nombreGroupe(n); }
  // « R arrondi à l'entier supérieur » (§9.2). Les restes arrivent à 6 décimales : la marge écarte le bruit flottant.
  function plafondJeu(x) { return Math.max(0, Math.ceil(x - 1e-9)); }
  function libelleMuscleJeu(cle) {
    if (cle === 'cardio') return 'Cardio';
    var z = (racine.THSemaine.ZONES || []).filter(function (x) { return x.cle === cle; })[0];
    return z ? z.libelle : cle;
  }
  // La couleur d'un niveau : global gris < 25, bleu 25–49, violet 50–74, or ≥ 75 ; muscle gris < 10, bleu 10–29,
  // violet 30–49, or à 50 (§9.2).
  function rangGlobal(n) { return n >= 75 ? 4 : n >= 50 ? 3 : n >= 25 ? 2 : 1; }
  function rangMuscle(n) { return n >= 50 ? 4 : n >= 30 ? 3 : n >= 10 ? 2 : 1; }

  function hexJeu(texte, rang, taille) {
    var h = el('span', 'j-hex r-' + rang + (taille ? ' ' + taille : ''), texte);
    h.setAttribute('aria-hidden', 'true');
    return h;
  }
  function jaugeJeu(part) {
    var j = el('div', 'j-jauge');
    var i = el('i');
    i.style.width = Math.round(Math.max(0, Math.min(1, part || 0)) * 100) + '%';
    j.appendChild(i);
    return j;
  }
  function blocJeu(titre, classe) {
    var b = el('div', 'j-bloc' + (classe ? ' ' + classe : ''));
    if (titre) b.appendChild(el('h3', null, titre));
    return b;
  }
  function ligneJeu(gauche, droite, classe) {
    var l = el('div', 'j-ligne' + (classe ? ' ' + classe : ''));
    l.appendChild(typeof gauche === 'string' ? el('span', null, gauche) : gauche);
    if (droite !== null && droite !== undefined) {
      l.appendChild(typeof droite === 'string' ? el('span', 'j-d', droite) : droite);
    }
    return l;
  }
  function porteJeu(libelle, droite, surChoix, id) {
    var b = el('button', 'j-ligne j-porte');
    b.type = 'button';
    if (id) b.id = id;
    b.appendChild(el('span', null, libelle));
    b.appendChild(el('span', 'j-d', droite));
    b.appendChild(el('span', 'j-fl', '›'));
    b.addEventListener('click', surChoix);
    return b;
  }

  // Le nom d'un succès (§9.2, « Libellés ») : sa catégorie et son palier ; un cap rond, le nom court de l'exercice,
  // comme la médaille. `d` : `descriptionDuSucces(id)`, et `d.nom` pour un cap (posé par l'appelant).
  function libelleSucces(d) {
    var p = d.palier;
    switch (d.categorie) {
      case 'seances': return groupe(p) + ' ' + motJeu(p, 'séance', 'séances');
      case 'serie': return p + ' ' + motJeu(p, 'semaine', 'semaines');
      case 'records': return groupe(p) + ' ' + motJeu(p, 'record', 'records');
      case 'rando': return 'Randonnée : ' + groupe(p) + NBSP + 'km';
      case 'decouverte': return p + ' ' + motJeu(p, 'exercice', 'exercices');
      case 'sortie': return 'Grande sortie : ' + p + NBSP + 'km';
      case 'distance': return d.libelle || String(p);
      case 'muscle': return libelleMuscleJeu(d.cle) + ' niveau ' + p;
      case 'tous': return 'Tous les muscles à ' + p;
      case 'cap': return 'Cap rond : ' + (d.nom || d.cle) + ' ' + nombreFr(p) + NBSP + 'kg';
      default: return String(p);
    }
  }

  // Une entrée de « le plus proche » : `[gauche, droite]`.
  function texteProche(x) {
    var r = plafondJeu(x.reste);
    if (x.type === 'muscle') {
      return [libelleMuscleJeu(x.cle) + ', niveau ' + x.cible,
              'dans ' + r + ' ' + (x.cle === 'cardio' ? 'min' : motJeu(r, 'point', 'points'))];
    }
    var c = x.cible;
    switch (x.cle) {
      case 'seances': return ['Séances : ' + groupe(c), 'dans ' + groupe(r) + ' ' + motJeu(r, 'séance', 'séances')];
      case 'serie': return ['Série : ' + c + ' semaines', 'dans ' + r + ' ' + motJeu(r, 'semaine', 'semaines')];
      case 'records': return ['Records : ' + groupe(c), 'dans ' + groupe(r) + ' ' + motJeu(r, 'record', 'records')];
      case 'rando': return ['Randonnée : ' + groupe(c) + NBSP + 'km', 'dans ' + groupe(r) + NBSP + 'km'];
      case 'decouverte': return ['Découverte : ' + c + ' exercices', 'dans ' + r + ' ' + motJeu(r, 'exercice', 'exercices')];
      default: return [String(c), 'dans ' + r];
    }
  }

  // L'accueil : le niveau, la série, le plus proche, puis trois portes (§9.2).
  //   vue = { etat, jauge, proches, surMuscles, surSucces, surDeblocages }
  function rendreJeuAccueil(cible, vue) {
    if (!cible) return;
    vider(cible);
    var e = vue.etat, n = e.niveau.niveau, cent = n >= 100;

    var bn = blocJeu(null, 'j-niveau');
    var rang = el('div', 'j-rangee');
    rang.appendChild(hexJeu(String(n), rangGlobal(n), 'grand'));
    var txt = el('div', 'j-txt');
    var tete = el('div', 'j-tete');
    tete.appendChild(el('b', null, 'Niveau ' + n));
    if (e.titre) tete.appendChild(el('span', 'j-gris', ' · ' + JEU_TITRES[e.titre]));
    txt.appendChild(tete);
    txt.appendChild(jaugeJeu(cent ? 1 : vue.jauge));
    // À 100 : ni « prochain » ni Ω — l'Ω ne se montre qu'au Profil (§4).
    if (!cent) {
      var r = plafondJeu(e.niveau.prochain);
      txt.appendChild(el('div', 'j-gris j-num', 'niveau ' + (n + 1) + ' dans ' + groupe(r) + FINE + motJeu(r, 'point', 'points')));
    }
    rang.appendChild(txt);
    bn.appendChild(rang);
    cible.appendChild(bn);

    // La série : absente sans semaine active ; à 0, seule la meilleure se dit (jamais « 0 semaine »).
    var s = e.semaines;
    if (s.actives > 0) {
      var bs = blocJeu(null, 'j-serie');
      if (s.serie > 0) {
        var gauche = el('span');
        gauche.appendChild(el('b', 'j-num j-fort', String(s.serie)));
        gauche.appendChild(doc.createTextNode(' ' + motJeu(s.serie, 'semaine d’affilée', 'semaines d’affilée')));
        bs.appendChild(ligneJeu(gauche, 'gels : ' + s.reserve + ' sur ' + vue.gelsMax));
      }
      bs.appendChild(ligneJeu(el('span', 'j-gris', 'Meilleure série'),
        s.meilleure + ' ' + motJeu(s.meilleure, 'semaine', 'semaines')));
      cible.appendChild(bs);
    }

    if (vue.proches.length) {
      var bp = blocJeu('Le plus proche', 'j-proches');
      vue.proches.forEach(function (x) {
        var t = texteProche(x);
        bp.appendChild(ligneJeu(t[0], t[1]));
      });
      cible.appendChild(bp);
    }

    var portes = blocJeu(null, 'j-portes');
    portes.appendChild(porteJeu('Muscles', '7', vue.surMuscles, 'jeu-porte-muscles'));
    portes.appendChild(porteJeu('Succès', groupe(e.succes.nombre) + ' · ' + groupe(e.succes.points) + FINE +
      motJeu(e.succes.points, 'point', 'points'), vue.surSucces, 'jeu-porte-succes'));
    portes.appendChild(porteJeu('Déblocages', 'cadres, gels', vue.surDeblocages, 'jeu-porte-deblocages'));
    cible.appendChild(portes);
  }

  // Les sept muscles, dans l'ordre du jeu (jamais trié).   vue = { etat, ordre, jauges }
  function rendreJeuMuscles(cible, vue) {
    if (!cible) return;
    vider(cible);
    var tete = el('div', 'j-entete');
    tete.appendChild(el('h2', 'titre-vue', 'Muscles'));
    tete.appendChild(el('span', 'j-gris j-num', String(vue.ordre.length)));
    cible.appendChild(tete);
    var b = blocJeu(null, 'j-muscles');
    vue.ordre.forEach(function (cle) {
      var m = vue.etat.muscles[cle];
      var ligne = el('div', 'j-metier');
      ligne.dataset.muscle = cle;
      ligne.appendChild(hexJeu(String(m.niveau), rangMuscle(m.niveau)));
      var droite = el('div', 'j-txt');
      var nom = el('div', 'j-nom');
      nom.appendChild(el('span', null, libelleMuscleJeu(cle)));
      var r = m.prochain === null ? null : plafondJeu(m.prochain);
      nom.appendChild(el('span', 'j-gris j-num', r === null ? 'niveau maximal'
        : 'niveau ' + (m.niveau + 1) + ' dans ' + groupe(r) + ' ' +
          (cle === 'cardio' ? 'min' : motJeu(r, 'point', 'points'))));
      droite.appendChild(nom);
      droite.appendChild(jaugeJeu(vue.jauges.muscles[cle]));
      ligne.appendChild(droite);
      b.appendChild(ligne);
    });
    b.appendChild(el('p', 'j-note', 'Une série de travail donne 1 point au muscle qu’elle travaille, ½ à celui qui ' +
      'aide, ¼ à celui qui stabilise. Cardio : 1 point par minute.'));
    cible.appendChild(b);
  }

  // Les succès par catégorie, la légende des raretés, les titres.   vue = { etat, categories, raretes, titres }
  function rendreJeuSucces(cible, vue) {
    if (!cible) return;
    vider(cible);
    var e = vue.etat;
    var tete = el('div', 'j-entete');
    tete.appendChild(el('h2', 'titre-vue', 'Succès'));
    tete.appendChild(el('span', 'j-gris j-num', groupe(e.succes.nombre) + ' · ' + groupe(e.succes.points) + FINE +
      motJeu(e.succes.points, 'point', 'points')));
    cible.appendChild(tete);

    var bc = blocJeu('Par catégorie', 'j-categories');
    vue.categories.forEach(function (c) {
      var droite = c.total === null ? String(c.obtenus) : c.obtenus + ' / ' + c.total;
      if (c.prochain !== null) {
        droite += ' · prochain : ' + groupe(c.prochain) + (c.cle === 'rando' ? NBSP + 'km' : '');
      }
      bc.appendChild(ligneJeu(JEU_CATEGORIES[c.cle], droite, 'j-cat'));
    });
    var leg = el('div', 'j-raretes');
    vue.raretes.forEach(function (r) {
      var p = el('span', 'j-rarete r-' + JEU_RANG[r.rarete], r.rarete + ' · ' + r.points);
      leg.appendChild(p);
    });
    bc.appendChild(leg);
    cible.appendChild(bc);

    var bt = blocJeu('Titres', 'j-titres');
    vue.titres.forEach(function (t) {
      var gauche = el('span', t.obtenu ? null : 'j-gris');
      gauche.appendChild(el(t.affiche ? 'b' : 'span', null, JEU_TITRES[t.cle]));
      if (t.affiche) gauche.appendChild(doc.createTextNode(' · affiché'));
      var cond = t.cle === 'collectionneur' ? t.succes + ' succès' : 'tous les muscles à ' + t.niveau;
      if (t.obtenu) cond += ' · ✓';
      else if (t.manque) cond += ' · ' + libelleMuscleJeu(t.manque.cle) + ' à ' + t.manque.niveau;
      bt.appendChild(ligneJeu(gauche, cond));
    });
    cible.appendChild(bt);
  }

  // Les cadres et les gels.   vue = { cadres, semaines, conditions: { vitrine, grave }, gels: { premier, pas, max } }
  function rendreJeuDeblocages(cible, vue) {
    if (!cible) return;
    vider(cible);
    cible.appendChild(el('h2', 'titre-vue', 'Déblocages'));
    var cond = { vitrine: vue.conditions.vitrine + ' succès', niveau: 'un succès rare', or: 'un succès exceptionnel',
                 grave: 'le titre ' + JEU_TITRES[vue.conditions.grave] };
    var bc = blocJeu('Cadres du profil', 'j-cadres');
    vue.cadres.forEach(function (c) {
      var gauche = el('span', c.obtenu ? null : 'j-gris');
      gauche.appendChild(el('b', null, JEU_CADRES[c.cle]));
      if (c.affiche) gauche.appendChild(doc.createTextNode(' · affiché'));
      bc.appendChild(ligneJeu(gauche, cond[c.cle] + (c.obtenu ? ' · ✓' : '')));
    });
    bc.appendChild(el('p', 'j-note', 'Chaque cadre se gagne par un succès et ne se perd pas. Le plus haut s’affiche.'));
    cible.appendChild(bc);

    var s = vue.semaines;
    var bg = blocJeu('Gels de série', 'j-gels');
    bg.appendChild(ligneJeu('En réserve', s.reserve + ' sur ' + vue.gels.max));
    bg.appendChild(ligneJeu('Prochain gel', s.prochainGel === null ? 'réserve pleine'
      : 'dans ' + s.prochainGel + ' ' + motJeu(s.prochainGel, 'semaine', 'semaines')));
    if (s.gelsUtilises.length) {
      s.gelsUtilises.forEach(function (j, i) {
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(j);
        var d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
        bg.appendChild(ligneJeu(i === 0 ? 'Utilisés' : '', 'semaine du ' + (d ? M().jourMois(d, -1) : j)));
      });
    } else {
      bg.appendChild(ligneJeu('Utilisés', 'aucun'));
    }
    bg.appendChild(el('p', 'j-note', 'Un premier gel à ' + vue.gels.premier + ' semaines d’affilée, puis tous les ' +
      vue.gels.pas + ' semaines. Deux au plus. Il protège tout seul une semaine sans séance.'));
    cible.appendChild(bg);
  }

  // ── Le Profil (§9.3) ─────────────────────────────────────────────────────
  // Le bandeau : jeu allumé (`etat`), l'hexagone du niveau dans son cadre affiché (vitrine : liseré acier ; niveau :
  // liseré acier épais ; or : liseré or ; gravé : double liseré or) et, sous le nom, « Polyvalent · niveau 87 »
  // (après 100 : « niveau 100 · Ωk » — le seul endroit où l'Ω se montre) ; éteint (`null`), l'initiale, et rien.
  function rendreBandeauJeu(rond, ligne, etat, initiale) {
    if (!rond) return;
    vider(rond);
    if (!etat) {
      rond.className = 'p-rond';
      rond.textContent = initiale;
      if (ligne) { ligne.hidden = true; ligne.textContent = ''; }
      return;
    }
    var n = etat.niveau.niveau;
    rond.className = 'p-rond-jeu' + (etat.cadre ? ' cadre-' + etat.cadre : '');
    var hex = hexJeu(String(n), rangGlobal(n), 'grand');
    var interieur = hex;
    if (etat.cadre) {
      // Le cadre se dessine en hexagones emboîtés : un liseré autour d'une forme découpée ne se voit pas.
      var cadre = el('span', 'j-cadre'), contenu = cadre;
      if (etat.cadre === 'grave') {
        var vide = el('span', 'j-cadre-vide'), second = el('span', 'j-cadre-second');
        cadre.appendChild(vide); vide.appendChild(second); contenu = second;
      }
      contenu.appendChild(hex);
      interieur = cadre;
    }
    rond.appendChild(interieur);
    rond.setAttribute('aria-label', 'Niveau ' + n);
    if (ligne) {
      var mots = [];
      if (etat.titre) mots.push(JEU_TITRES[etat.titre]);
      mots.push('niveau ' + n + (etat.niveau.omega !== null && etat.niveau.omega !== undefined ? ' · Ω' + etat.niveau.omega : ''));
      ligne.textContent = mots.join(' · ');
      ligne.hidden = false;
    }
  }

  // La vitrine : au plus trois cases, l'hexagone à la couleur de la rareté, le libellé, un bord neutre.
  function blocVitrine(vitrine) {
    var g = el('div', 'p-groupe j-vitrine-g');
    var cases = el('div', 'j-vitrine');
    vitrine.forEach(function (d) {
      var c = el('div', 'j-case');
      c.appendChild(hexJeu(groupe(d.palier), JEU_RANG[d.rarete], 'moyen'));
      c.appendChild(el('span', null, libelleSucces(d)));
      cases.appendChild(c);
    });
    g.appendChild(cases);
    g.appendChild(el('div', 'j-pied', 'Tes trois succès les plus rares.'));
    return g;
  }

  // L'interrupteur, en bas du Profil : un vrai `switch`, et sa phrase.
  function blocInterrupteurJeu(jeu) {
    var g = el('div', 'p-groupe j-interrupteur-g');
    var b = el('button', 'p-ligne j-interrupteur' + (jeu.actif ? ' on' : ''));
    b.type = 'button';
    b.id = 'interrupteur-jeu';
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', jeu.actif ? 'true' : 'false');
    b.appendChild(el('span', 'p-lib', 'Activer le jeu'));
    var curseur = el('span', 'j-curseur');
    curseur.setAttribute('aria-hidden', 'true');
    curseur.appendChild(el('i'));
    b.appendChild(curseur);
    b.addEventListener('click', jeu.surBascule);
    g.appendChild(b);
    g.appendChild(el('div', 'j-pied', 'Éteint, le jeu disparaît : plus d\u2019onglet, plus de bloc en fin de séance, ' +
      'plus de niveau ici. Rien n\u2019est perdu : tout se recalcule en le rallumant.'));
    return g;
  }

  // ── La fin de séance (§9.4) ──────────────────────────────────────────────
  // Ce que la séance ajoute, une ligne seulement si elle a quelque chose à dire ; aucune → « Muscles · +N points » ;
  // rien du tout → `null`, pas de bloc (jamais un bloc vide). L'Ω ne se montre pas ici.
  //   jeu = { apport, succes: [descriptions, dans l'ordre de `apport.succes`] }
  function blocJeuFin(jeu) {
    var a = jeu.apport, lignes = [];
    if (a.xp > 0) lignes.push(ligneJeu('XP', '+' + FINE + groupe(a.xp)));
    if (a.niveau) lignes.push(ligneJeu('Niveau ' + a.niveau.a, '+' + (a.niveau.a - a.niveau.de)));
    a.muscles.forEach(function (m) {
      var g = el('span', 'j-avec-hex');
      g.appendChild(hexJeu(String(m.a), rangMuscle(m.a), 'mini'));
      g.appendChild(doc.createTextNode(libelleMuscleJeu(m.cle) + ', niveau ' + m.a));
      lignes.push(ligneJeu(g, '+' + (m.a - m.de)));
    });
    jeu.succes.forEach(function (d) {
      if (!d) return;
      var g = el('span', 'j-avec-hex');
      g.appendChild(hexJeu(groupe(d.palier), JEU_RANG[d.rarete], 'mini'));
      g.appendChild(doc.createTextNode('Succès : ' + libelleSucces(d)));
      lignes.push(ligneJeu(g, d.rarete));
    });
    if (!lignes.length) {
      var pts = plafondJeu(a.points);
      if (pts <= 0) return null;
      lignes.push(ligneJeu('Muscles', '+' + groupe(pts) + ' ' + motJeu(pts, 'point', 'points')));
    }
    var b = blocJeu('Le jeu', 'j-fin');
    b.id = 'jeu-fin';
    lignes.forEach(function (l) { b.appendChild(l); });
    return b;
  }

  // ══ LE SOCIAL, ÉTAGE 1 (87, SOCIAL-V1, maquette `maquette-social-etage1-v2.html`) ══════════════
  //
  // Le rendu DESSINE ce que l'app lui passe : il ne lit ni la base ni le jeu, ne décide d'aucun cercle (c'est
  // `social.js`) et ne compte aucune médaille (c'est `faits.js`). Les pseudos et les titres sont du texte
  // utilisateur : `textContent` seulement, jamais du HTML. Aucun ambre : l'ambre est la voix du coach.
  //
  // Le blason : le gabarit de la maquette (le jeu v2 n'en a pas), d'une couleur tirée du pseudo.
  function blasonSocial(couleur, taille) {
    var h = Math.round(taille * 46 / 40);
    var b = svg('svg', 's-blason', { width: taille, height: h, viewBox: '0 0 40 46', 'aria-hidden': 'true' });
    b.style.color = couleur;
    b.appendChild(svg('path', null, { d: 'M20 2 37 8v14c0 11-7 19-17 22C10 41 3 33 3 22V8z', fill: 'currentColor' }));
    b.appendChild(svg('path', 's-blason-creux', { d: 'M11 22h18l-3 4h-3v5h4v3H13v-3h4v-5h-3z' }));
    return b;
  }
  function boutonSocial(texte, classe, sur, id) {
    var b = el('button', 's-btn ' + (classe || 's-b2'), texte);
    b.type = 'button';
    if (id) b.id = id;
    if (sur) b.addEventListener('click', sur); else b.disabled = true;
    return b;
  }
  function etatSocial(cible, vue) {
    if (vue.etat === 'charge') { cible.appendChild(el('p', 's-gris s-note', 'Chargement…')); return true; }
    if (vue.etat === 'erreur') {
      cible.appendChild(el('p', 's-gris s-note s-erreur', vue.message || 'Il faut le réseau pour voir le social.'));
      return true;
    }
    return false;
  }

  // Les sous-onglets « Jeu » · « Fil » et le titre de l'onglet : « Jeu & amis », ou « Amis » jeu éteint
  // (le sous-onglet Jeu disparaît alors).
  function rendreEnteteSocial(racineVue, jeuAllume) {
    if (!racineVue) return;
    var t = racineVue.querySelector('.s-titre');
    if (t) t.textContent = jeuAllume ? 'Jeu & amis' : 'Amis';
    var j = racineVue.querySelector('.s-onglet[data-social="jeu"]');
    if (j) j.hidden = !jeuAllume;
  }

  // 107 — un geste qui attend le réseau : une ligne discrète.
  function ligneEnAttente(cible, texte) { if (texte) cible.appendChild(el('p', 's-gris s-note s-attente', texte)); }

  // Le fil.   vue = { etat, demandes: [{ pseudo, couleur, sur, surAccepter, surRefuser }], cartes: [...], fin,
  //                   refus (107 : la phrase d'un geste refusé au retour du réseau), attente }
  function rendreFil(cible, vue) {
    if (!cible) return;
    vider(cible);
    if (vue.refus) cible.appendChild(el('p', 's-gris s-note s-erreur s-refus', vue.refus));
    ligneEnAttente(cible, vue.attente);
    (vue.demandes || []).forEach(function (d) {
      var r = el('div', 's-demande');
      r.setAttribute('data-pseudo', d.pseudo);
      r.appendChild(blasonSocial(d.couleur, 34));
      var t = el('div', 's-t');
      var nom = el('b', 's-lien', d.pseudo);
      nom.addEventListener('click', d.sur);
      t.appendChild(nom);
      t.appendChild(el('small', null, 'veut s’abonner à toi'));
      r.appendChild(t);
      r.appendChild(boutonSocial('Accepter', 's-b1 s-accepter', d.surAccepter));
      r.appendChild(boutonSocial('Refuser', 's-b3 s-refuser', d.surRefuser));
      cible.appendChild(r);
    });
    if (etatSocial(cible, vue)) return;
    var cartes = vue.cartes || [];
    cartes.forEach(function (c) {
      var carte = el('div', 's-carte');
      carte.setAttribute('data-session', c.session_id);
      var tete = el('div', 's-tete');
      tete.appendChild(blasonSocial(c.couleur, 34));
      var id = el('div');
      var nom = el('b', 's-lien', c.pseudo);
      nom.addEventListener('click', c.surProfil);
      id.appendChild(nom);
      id.appendChild(el('small', null, c.quand + (c.titre ? ' · ' + c.titre : '')));
      tete.appendChild(id);
      carte.appendChild(tete);
      var chiffres = el('div', 's-chiffres');
      var a = el('div'); a.appendChild(el('strong', 's-tonnes', c.tonnes)); a.appendChild(el('span', null, 'soulevées'));
      chiffres.appendChild(a);
      if (c.medailles && c.medailles.length) {
        var b = el('div'); b.appendChild(el('strong', 's-nb-records', String(c.medailles.length)));
        b.appendChild(el('span', null, c.medailles.length > 1 ? 'records' : 'record'));
        chiffres.appendChild(b);
      }
      carte.appendChild(chiffres);
      if (c.medailles && c.medailles.length) {
        var meds = el('div', 's-meds');
        c.medailles.forEach(function (m) {
          var l = el('div', 's-med');
          l.appendChild(el('i'));
          l.appendChild(doc.createTextNode(m.nom + (m.mesure ? ' · ' + m.mesure : '')));
          meds.appendChild(l);
        });
        carte.appendChild(meds);
      }
      var pied = el('div', 's-pied');
      pied.appendChild(boutonSocial(c.jaiReagi ? '🔥 Tu as réagi' : '🔥 Réagir', 's-reag' + (c.jaiReagi ? ' s-fait' : ''), c.surReagir));
      // 121 (D5, 05 #11) — sans `surVoir` (une séance que je ne peux pas ouvrir), pas de bouton.
      if (c.surVoir) pied.appendChild(boutonSocial('Voir la séance', 's-b3 s-voir', c.surVoir));
      carte.appendChild(pied);
      cible.appendChild(carte);
    });
    // 90 — le fil de la guilde dit sa propre fin (`vue.fin`).
    cible.appendChild(el('div', 's-fin', vue.fin || (cartes.length ? 'Tu es à jour · les 30 derniers jours'
      : 'Aucune séance des personnes que tu suis ces 30 derniers jours.')));
  }

  // Le profil d'une personne.   vue = { etat, profil: {...}, calendrier, resume, cache }
  function rendreAmi(cible, vue) {
    if (!cible) return;
    vider(cible);
    if (etatSocial(cible, vue)) return;
    var p = vue.profil;
    if (!p) {
      // 107 — un geste refusé au retour du réseau (bloqué entre-temps) : la phrase, puis l'état réel.
      if (vue.message) cible.appendChild(el('p', 's-gris s-note s-erreur', vue.message));
      cible.appendChild(el('p', 's-gris s-note s-introuvable', 'Ce profil n’existe pas, ou n’est pas visible.'));
      return;
    }
    var tete = el('div', 's-prof');
    tete.appendChild(blasonSocial(p.couleur, 64));
    tete.appendChild(el('b', 's-pseudo', p.pseudo));
    if (p.ligneJeu) tete.appendChild(el('small', 's-niveau', p.ligneJeu));
    if (p.etatTexte) tete.appendChild(el('span', 's-etat', p.etatTexte));
    // 137 (SOCIAL §1, la bio) — sous l'état, avant les boutons, en entier : la base décide qui la voit (`social_profil`
    // la rend nulle hors des cercles) ; ici on montre `bio` si elle est non vide, rien sinon. Ni trou, ni texte de remplacement.
    if (typeof p.bio === 'string' && p.bio.trim()) tete.appendChild(el('p', 's-bio', p.bio));
    cible.appendChild(tete);
    var actions = el('div', 's-actions');
    if (p.bouton) actions.appendChild(boutonSocial(p.bouton.texte, 's-b1 s-principal', p.bouton.sur, 'social-principal'));
    var menu = el('div', 's-menu');
    menu.hidden = true;
    (p.menu || []).forEach(function (m) {
      var b = boutonSocial(m.texte, 's-b2 s-menu-item', null);
      b.disabled = false;
      b.setAttribute('data-geste', m.geste);
      b.addEventListener('click', function () {
        if (m.confirmer && b.getAttribute('data-arme') !== '1') {
          b.setAttribute('data-arme', '1'); b.textContent = m.confirmer; return;
        }
        m.sur();
      });
      menu.appendChild(b);
    });
    if (p.menu && p.menu.length) {
      actions.appendChild(boutonSocial('···', 's-b2 s-plus-menu', function () { menu.hidden = !menu.hidden; }, 'social-menu'));
    }
    cible.appendChild(actions);
    cible.appendChild(menu);
    if (vue.message) cible.appendChild(el('p', 's-gris s-note s-erreur', vue.message));
    if (vue.cache) { cible.appendChild(el('p', 's-gris s-note s-cache', vue.cache)); return; }
    // 89 — son mois en deux chiffres (mutuels).
    if (vue.mois) {
      var cm = el('div', 's-carte s-son-mois'), ch = el('div', 's-chiffres');
      var c1 = el('div'); c1.appendChild(el('strong', 's-mois-seances', String(vue.mois.seances)));
      c1.appendChild(el('span', null, (vue.mois.seances > 1 ? 'séances' : 'séance') + ' en ' + vue.mois.libelle));
      var c2 = el('div'); c2.appendChild(el('strong', 's-mois-tonnes', vue.mois.tonnes)); c2.appendChild(el('span', null, 'soulevées'));
      ch.appendChild(c1); ch.appendChild(c2); cm.appendChild(ch);
      cible.appendChild(cm);
      cible.appendChild(el('p', 's-titre-s', 'Son calendrier'));
    }
    var g = vue.calendrier;
    if (!g) return;
    var mois = el('div', 's-mois');
    var av = boutonSocial('‹', 's-b3 s-mois-av', function () { vue.surMois(-1); });
    av.setAttribute('aria-label', 'Mois précédent');
    var ap = boutonSocial('›', 's-b3 s-mois-ap', function () { vue.surMois(1); });
    ap.setAttribute('aria-label', 'Mois suivant');
    mois.appendChild(av); mois.appendChild(el('span', 's-mois-nom', g.libelle)); mois.appendChild(ap);
    cible.appendChild(mois);
    var cal = el('div', 's-cal');
    M().INITIALES_JOURS.forEach(function (j) { cal.appendChild(el('span', 's-j', j)); });
    g.lignes.forEach(function (l) {
      l.jours.forEach(function (j) {
        if (j.horsMois) { cal.appendChild(el('span', 's-hors')); return; }
        var c = el(j.seances.length ? 'button' : 'span', 's-jour' + (j.teinte ? ' s-n' + j.teinte : '') +
          (vue.choisi === j.cle ? ' s-sel' : ''), String(j.jour));
        c.setAttribute('data-jour', j.cle);
        if (j.seances.length) { c.type = 'button'; c.addEventListener('click', function () { vue.surJour(j); }); }
        cal.appendChild(c);
      });
    });
    cible.appendChild(cal);
    var lg = el('div', 's-lg', 'tonnage ');
    [1, 2, 3].forEach(function (n) { lg.appendChild(el('i', 's-n' + n)); });
    cible.appendChild(lg);
    var r = vue.resume;
    if (r) cible.appendChild(detailDuJour(r));
    // 89 — « Ses exercices » (6 mois), chacun ouvrant sa page ; en bas, « Se comparer sur la période ».
    if (vue.exercices && vue.exercices.length) {
      cible.appendChild(el('p', 's-titre-s', 'Ses exercices'));
      var liste = el('div', 's-ses-exercices');
      vue.exercices.forEach(function (x) {
        var l = el('button', 's-ligne s-exo-ami');
        l.type = 'button';
        l.setAttribute('data-slug', x.slug);
        var t = el('div', 's-t'); t.appendChild(el('b', null, x.nom)); t.appendChild(el('small', null, x.sous));
        l.appendChild(t); l.appendChild(el('span', 's-gris', '›'));
        l.addEventListener('click', x.sur);
        liste.appendChild(l);
      });
      cible.appendChild(liste);
    }
    if (vue.surComparer) {
      var pc = el('p', 's-centre');
      pc.appendChild(boutonSocial('Se comparer sur la période', 's-b3 s-comparer-periode', vue.surComparer, 'social-comparer'));
      cible.appendChild(pc);
    }
  }
  function detailDuJour(r) {
    var d = el('div', 's-detail');
    d.appendChild(el('h3', null, (r.titre ? r.titre + ' · ' : '') + r.quand + ' · ' + r.tonnes));
    if (r.medailles && r.medailles.length) {
      var meds = el('div', 's-meds');
      r.medailles.forEach(function (m) {
        var l = el('div', 's-med'); l.appendChild(el('i'));
        l.appendChild(doc.createTextNode(m.nom + (m.mesure ? ' · ' + m.mesure : '')));
        meds.appendChild(l);
      });
      d.appendChild(meds);
    }
    (r.detail || []).forEach(function (x) {
      var ex = el('div', 's-ex');
      ex.appendChild(el('span', 's-ex-nom', x.nom));
      ex.appendChild(el('small', null, x.fait));
      // 144-6 — « Comment faire » chez un ami, en lecture seule : la même fiche que la page d'exercice.
      if (x.surOuvrir) {
        ex.classList.add('s-ex-ouvrable');
        ex.setAttribute('role', 'button');
        ex.tabIndex = 0;
        ex.addEventListener('click', x.surOuvrir);
        ex.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); x.surOuvrir(); } });
      }
      d.appendChild(ex);
    });
    if (r.detailCache) d.appendChild(el('p', 's-gris s-cache s-detail-cache', r.detailCache));
    return d;
  }

  // ══ ÉTAGE 2 (89, maquette `maquette-social-etage2-guilde-v2.html`, écrans 1 à 3) ═══════════════════════
  // Jamais de vainqueur, de couronne ni de rouge : des chiffres côte à côte, et un rang à poids de corps égal.
  function etatSousPage(cible, vue) {
    if (etatSocial(cible, vue)) return true;
    if (!vue.profil) { cible.appendChild(el('p', 's-gris s-note s-introuvable', 'Ce profil n’existe pas, ou n’est pas visible.')); return true; }
    if (vue.message) cible.appendChild(el('p', 's-gris s-note s-erreur', vue.message));
    if (vue.cache) { cible.appendChild(el('p', 's-gris s-note s-cache', vue.cache)); return true; }
    if (vue.chargement) { cible.appendChild(el('p', 's-gris s-note', 'Chargement…')); return true; }
    return false;
  }
  // La courbe de la meilleure charge par mois (6 mois) : la sienne en trait plein, la mienne en pointillés or.
  function courbeSociale(lui, moi, pseudo) {
    var vals = [];
    [lui, moi].forEach(function (m) { (m || []).forEach(function (x) { if (x.charge) vals.push(x.charge); }); });
    var s = svg('svg', 's-courbe', { viewBox: '0 0 300 110', width: '100%', role: 'img',
      'aria-label': 'Meilleure charge de chaque mois, sur 6 mois' });
    if (!vals.length) return s;
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals), ecart = max - min || 1;
    function ligne(m, classe, nom) {
      var pts = [];
      (m || []).forEach(function (x, i) {
        if (x.charge) pts.push((i * 60) + ',' + Math.round(100 - (x.charge - min) / ecart * 80));
      });
      if (!pts.length) return;
      s.appendChild(svg('polyline', classe, { points: pts.join(' '), fill: 'none' }));
      var dernier = pts[pts.length - 1].split(',');
      var t = svg('text', classe + '-nom', { x: 300, y: Math.max(10, Number(dernier[1]) - 6), 'text-anchor': 'end' });
      t.textContent = nom;
      s.appendChild(t);
    }
    ligne(lui, 's-courbe-lui', pseudo);
    ligne(moi, 's-courbe-moi', 'toi');
    return s;
  }
  // Son exercice, puis « Se comparer ».
  function rendreExerciceAmi(cible, vue) {
    if (!cible) return;
    vider(cible);
    if (vue.etat === 'ok' && vue.profil) cible.appendChild(el('p', 's-gris s-sous-exo', vue.pseudo + ' · ' + vue.nom));
    if (etatSousPage(cible, vue)) return;
    var lui = vue.lui;
    if (!lui) { cible.appendChild(el('p', 's-gris s-note s-vide', 'Aucune série de cet exercice ces 6 derniers mois.')); return; }
    var carte = el('div', 's-carte s-exo-carte');
    var ch = el('div', 's-chiffres');
    var a = el('div'); a.appendChild(el('strong', 's-exo-charge', lui.charge)); a.appendChild(el('span', null, 'meilleure charge'));
    var b = el('div'); b.appendChild(el('strong', 's-exo-serie', lui.serie)); b.appendChild(el('span', null, 'meilleure série'));
    ch.appendChild(a); ch.appendChild(b); carte.appendChild(ch);
    carte.appendChild(courbeSociale(lui.mois, vue.moi ? vue.moi.mois : null, vue.pseudo));
    carte.appendChild(el('p', 's-gris s-cache', 'Meilleure charge de chaque mois, sur 6 mois.'));
    cible.appendChild(carte);
    if (vue.moi) {
      var duo = el('div', 's-carte s-duo');
      ['', 'toi', vue.pseudo].forEach(function (h) { duo.appendChild(el('span', 's-duo-h', h)); });
      [['Meilleure charge', 'charge'], ['Meilleure série', 'serie'], ['Séances (6 mois)', 'seances']].forEach(function (r) {
        duo.appendChild(el('span', null, r[0]));
        duo.appendChild(el('span', 's-duo-v s-duo-moi', vue.moi[r[1]]));
        duo.appendChild(el('span', 's-duo-v s-duo-lui', lui[r[1]]));
      });
      cible.appendChild(duo);
    }
    if (vue.surComparer) {
      var bt = boutonSocial('Se comparer', 's-b1 s-large', vue.surComparer, 'social-comparer-exo');
      cible.appendChild(bt);
    }
  }
  // Se comparer sur la période.
  function rendreComparaison(cible, vue) {
    if (!cible) return;
    vider(cible);
    if (vue.etat === 'ok' && vue.profil) {
      cible.appendChild(el('p', 's-gris s-sous-exo', 'toi et ' + vue.pseudo));
      var choix = el('div', 's-choix');
      (vue.periodes || []).forEach(function (p) {
        var b = boutonSocial(p.libelle, 's-periode' + (p.actif ? ' s-on' : ''), p.sur);
        b.setAttribute('data-periode', p.cle);
        b.setAttribute('aria-pressed', p.actif ? 'true' : 'false');
        choix.appendChild(b);
      });
      cible.appendChild(choix);
    }
    if (etatSousPage(cible, vue)) return;
    var duo = el('div', 's-carte s-duo s-totaux');
    ['', 'toi', vue.pseudo].forEach(function (h) { duo.appendChild(el('span', 's-duo-h', h)); });
    vue.totaux.forEach(function (r) {
      duo.appendChild(el('span', null, r.libelle));
      duo.appendChild(el('span', 's-duo-v s-duo-moi', r.moi));
      duo.appendChild(el('span', 's-duo-v s-duo-lui', r.lui));
    });
    cible.appendChild(duo);
    cible.appendChild(el('p', 's-titre-s', 'Exercices en commun · meilleure charge'));
    if (!vue.communs.length) { cible.appendChild(el('p', 's-gris s-note s-vide', 'Aucun exercice en commun sur la période.')); return; }
    vue.communs.forEach(function (x) {
      var l = el('div', 's-commun');
      l.setAttribute('data-slug', x.slug);
      l.appendChild(el('b', null, x.nom));
      var ps = el('div', 's-commun-p');
      x.personnes.forEach(function (p) {
        ps.appendChild(el('span', 's-commun-qui' + (p.moi ? ' s-moi' : ''), p.qui + ' · ' + p.kg));
      });
      l.appendChild(ps);
      if (x.barre) l.appendChild(el('small', 's-gris', 'à poids de corps égal'));
      cible.appendChild(l);
    });
  }
  // « Entre amis », en bas de ma page d'exercice.   vue = null (rien) | { info, lignes: [{ rang, pseudo, moi, couleur, kg }] }
  function rendreEntreAmis(cible, vue) {
    if (!cible) return;
    vider(cible);
    if (!vue) return;
    var carte = el('div', 's-carte s-entre-amis');
    carte.appendChild(el('b', null, 'Entre amis'));
    var tete = el('p', 's-gris s-cache s-entre-sous', 'Classés à poids de corps égal ');
    var info = el('p', 's-gris s-cache s-entre-info', vue.info);
    info.hidden = true;
    var i = boutonSocial('i', 's-b2 s-info', function () { info.hidden = !info.hidden; }, 'entre-amis-info');
    i.setAttribute('aria-label', 'Comment on compare');
    tete.appendChild(i);
    carte.appendChild(tete);
    carte.appendChild(info);
    vue.lignes.forEach(function (x) {
      var r = el('div', 's-rang' + (x.moi ? ' s-moi' : ''));
      r.appendChild(el('span', 's-n', String(x.rang)));
      r.appendChild(blasonSocial(x.couleur, 28));
      r.appendChild(el('span', 's-t', x.pseudo));
      r.appendChild(el('span', 's-sc', x.kg));
      carte.appendChild(r);
    });
    cible.appendChild(carte);
  }

  // ══ LA GUILDE (90, SOCIAL-V1 « Guilde », maquette écran 4) ══════════════════════════════════════════════════
  //
  // Pas de chef affiché, pas de vainqueur, pas de rouge, pas de messagerie. Les noms et pseudos sont du texte
  // utilisateur : `textContent` seulement.
  function puceSocial(texte, actif, sur, attrs) {
    var b = boutonSocial(texte, 's-periode' + (actif ? ' s-on' : ''), sur);
    Object.keys(attrs || {}).forEach(function (k) { b.setAttribute(k, attrs[k]); });
    if (actif) b.setAttribute('aria-pressed', 'true');
    return b;
  }
  function palette(couleurs, choisie, sur, id) {
    var p = el('div', 's-choix s-palette');
    if (id) p.id = id;
    couleurs.forEach(function (c) {
      var b = boutonSocial('', 's-couleur' + (c === choisie ? ' s-on' : ''), function () { sur(c); });
      b.style.background = c;
      b.setAttribute('data-couleur', c);
      b.setAttribute('aria-label', 'Couleur du blason ' + c);
      if (c === choisie) b.setAttribute('aria-pressed', 'true');
      p.appendChild(b);
    });
    return p;
  }
  function rangsProgression(parent, lignes) {
    lignes.forEach(function (x) {
      var r = el('div', 's-rang' + (x.moi ? ' s-moi' : ''));
      r.setAttribute('data-pseudo', x.pseudo);
      r.appendChild(el('span', 's-n', String(x.rang)));
      r.appendChild(el('span', 's-t', x.pseudo));
      r.appendChild(el('span', 's-sc', x.texte));
      parent.appendChild(r);
    });
  }
  // ⚠️ 121 (audit du 16/10/2026, 05 #19) — UN NOM EN COURS DE SAISIE SURVIT À UN NOUVEAU RENDU. L'écran se redessine quand
  // une lecture revient (après un refus, « Ce nom est déjà pris. », il se relit) : le champ était recréé vide, et ce
  // qu'on venait de taper partait — au banc `guilde`, sous charge, « Créer » partait sans nom (« Le nom fait de 3 à 24
  // caractères. »). Le texte tapé et le curseur passent au nouveau champ.
  var CHAMPS_GUILDE = ['guilde-nom', 'guilde-nom-edition'];
  function saisieDeGuilde(cible) {
    var s = {};
    CHAMPS_GUILDE.forEach(function (id) {
      var n = doc.getElementById(id);
      if (n && cible.contains(n)) s[id] = { valeur: n.value, focus: doc.activeElement === n };
    });
    return s;
  }
  function rendreSaisieDeGuilde(s) {
    CHAMPS_GUILDE.forEach(function (id) {
      var n = s[id] ? doc.getElementById(id) : null;
      if (!n) return;
      n.value = s[id].valeur;
      if (s[id].focus) n.focus();
    });
  }
  function rendreGuilde(cible, vue) {
    if (!cible) return;
    var saisie = saisieDeGuilde(cible);
    rendreGuildeSansSaisie(cible, vue);
    rendreSaisieDeGuilde(saisie);
  }
  function rendreGuildeSansSaisie(cible, vue) {
    vider(cible);
    if (etatSocial(cible, vue)) return;
    if (vue.message) cible.appendChild(el('p', 's-gris s-note s-erreur s-guilde-message', vue.message));
    ligneEnAttente(cible, vue.attente);
    if (!vue.guilde) {
      (vue.invitations || []).forEach(function (i) {
        var r = el('div', 's-demande s-invitation-guilde');
        r.appendChild(blasonSocial(i.couleur, 34));
        var t = el('div', 's-t');
        t.appendChild(el('b', null, i.nom));
        t.appendChild(el('small', null, i.invitant + ' t’invite · ' + i.membres + ' membre' + (i.membres > 1 ? 's' : '')));
        r.appendChild(t);
        r.appendChild(boutonSocial('Rejoindre', 's-b1 s-rejoindre', i.surRejoindre));
        r.appendChild(boutonSocial('Refuser', 's-b3 s-refuser', i.surRefuser));
        cible.appendChild(r);
      });
      var c = el('div', 's-carte s-creer-guilde');
      c.appendChild(el('b', null, 'Créer une guilde'));
      c.appendChild(el('p', 's-gris s-cache', 'Une guilde permanente, jusqu’à 30 membres. Tu y invites tes abonnés mutuels.'));
      c.appendChild(blasonSocial(vue.creer.couleur, 48));
      var champ = el('input', 's-champ');
      champ.id = 'guilde-nom';
      champ.maxLength = 24;
      champ.placeholder = 'Nom de la guilde (3 à 24 caractères)';
      champ.setAttribute('aria-label', 'Nom de la guilde');
      c.appendChild(champ);
      c.appendChild(palette(vue.couleurs, vue.creer.couleur, function (x) {
        var v = champ.value;
        vue.creer.surCouleur(x);
        var nouveau = doc.getElementById('guilde-nom');
        if (nouveau) nouveau.value = v;
      }, 'guilde-couleurs'));
      c.appendChild(boutonSocial('Créer', 's-b1 s-large', function () { vue.creer.surCreer(champ.value); }, 'guilde-creer'));
      cible.appendChild(c);
      return;
    }
    var g = vue.guilde;
    var tete = el('div', 's-prof s-guilde-tete');
    tete.appendChild(blasonSocial(g.couleur, 64));
    tete.appendChild(el('b', 's-pseudo s-guilde-nom', g.nom));
    tete.appendChild(el('small', 's-guilde-membres', g.membres));
    cible.appendChild(tete);
    var onglets = el('div', 's-choix s-onglets-guilde');
    vue.onglets.forEach(function (o) { onglets.appendChild(puceSocial(o.libelle, o.actif, o.sur, { 'data-onglet': o.cle })); });
    cible.appendChild(onglets);

    if (vue.defi !== undefined || vue.cetteSemaine !== undefined) {
      if (vue.defi) {
        var d = el('div', 's-carte s-defi');
        d.appendChild(el('b', null, 'Défi de la semaine'));
        d.appendChild(el('p', 's-gris s-cache s-defi-titre', vue.defi.titre + ' · ' + vue.defi.quand));
        var jauge = el('div', 's-jauge');
        var plein = el('div', 's-jauge-plein');
        plein.style.width = Math.round(vue.defi.part * 100) + '%';
        jauge.appendChild(plein);
        jauge.setAttribute('role', 'progressbar');
        jauge.setAttribute('aria-valuemin', '0'); jauge.setAttribute('aria-valuemax', '100');
        jauge.setAttribute('aria-valuenow', String(Math.round(vue.defi.part * 100)));
        d.appendChild(jauge);
        d.appendChild(el('p', 's-gris s-cache s-defi-phrase', vue.defi.phrase));
        if (vue.choixDefi) {
          var ch = el('div', 's-choix-defi');
          ch.appendChild(el('small', 's-gris', 'Choisir le défi de la semaine'));
          vue.choixDefi.forEach(function (x) {
            var l = el('div', 's-defi-option');
            l.setAttribute('data-defi', x.cle);
            l.appendChild(el('span', 's-defi-libelle', x.libelle));
            var p = el('div', 's-choix');
            if (x.sur) p.appendChild(puceSocial(x.actif ? 'Choisi' : 'Choisir', x.actif, x.sur, { 'data-defi': x.cle }));
            x.choix.forEach(function (c) { p.appendChild(puceSocial(String(c.n), c.actif, c.sur, { 'data-defi': x.cle, 'data-n': String(c.n) })); });
            l.appendChild(p);
            ch.appendChild(l);
          });
          d.appendChild(ch);
        }
        if (vue.defiFige) d.appendChild(el('p', 's-gris s-defi-fige', vue.defiFige));
        cible.appendChild(d);
      }
      if (vue.cetteSemaine) {
        var s = el('div', 's-carte s-guilde-semaine');
        s.appendChild(el('b', null, 'La guilde cette semaine'));
        var chiffres = el('div', 's-chiffres');
        [['s-g-seances', vue.cetteSemaine.seances, 'séances'], ['s-g-records', vue.cetteSemaine.records, 'records'],
          ['s-g-tonnes', vue.cetteSemaine.tonnes, 'ensemble']].forEach(function (x) {
          var b = el('div'); b.appendChild(el('strong', x[0], x[1])); b.appendChild(el('span', null, x[2])); chiffres.appendChild(b);
        });
        s.appendChild(chiffres);
        cible.appendChild(s);
      }
    }
    if (vue.progression) {
      var pr = el('div', 's-progression-guilde');
      pr.appendChild(el('p', 's-titre-s', vue.titreProgression));
      if (vue.explicationProgression) pr.appendChild(el('p', 's-gris s-cache', vue.explicationProgression));
      rangsProgression(pr, vue.progression);
      if (!vue.progression.length) pr.appendChild(el('p', 's-gris s-cache', 'Rien de publié ce mois-ci pour l’instant.'));
      cible.appendChild(pr);
    }
    if (vue.chargementFil) cible.appendChild(el('p', 's-gris s-note', 'Chargement…'));
    if (vue.fil) {
      var f = el('div', 's-fil-guilde');
      rendreFil(f, vue.fil);
      cible.appendChild(f);
    }
    if (vue.membres) {
      var m = el('div', 's-membres-guilde');
      vue.membres.forEach(function (x) {
        var l = el('div', 's-ligne s-membre');
        l.setAttribute('data-pseudo', x.pseudo || '');
        l.appendChild(blasonSocial(x.couleur, 30));
        var t = el('div', 's-t');
        var nom = el('span', 's-membre-ligne' + (x.surProfil ? ' s-lien' : ''), x.moi ? x.ligne.replace(/^[^·]+/, 'toi ') : x.ligne);
        if (x.surProfil) nom.addEventListener('click', x.surProfil);
        t.appendChild(nom);
        l.appendChild(t);
        if (x.surTransmettre) {
          var bt = boutonSocial('Transmettre', 's-b3 s-transmettre', null);
          bt.disabled = false;
          bt.addEventListener('click', function () {
            if (bt.getAttribute('data-arme') !== '1') { bt.setAttribute('data-arme', '1'); bt.textContent = 'Lui transmettre ?'; return; }
            x.surTransmettre();
          });
          l.appendChild(bt);
        }
        if (x.surRetirer) {
          var br = boutonSocial('Retirer', 's-b3 s-retirer', null);
          br.disabled = false;
          br.addEventListener('click', function () {
            if (br.getAttribute('data-arme') !== '1') { br.setAttribute('data-arme', '1'); br.textContent = 'Le retirer ?'; return; }
            x.surRetirer();
          });
          l.appendChild(br);
        }
        m.appendChild(l);
      });
      cible.appendChild(m);
      var rg = el('div', 's-carte s-rangs');
      rg.appendChild(el('b', null, 'Ton rang'));
      rg.appendChild(el('p', 's-gris s-cache', 'Un nom que tu choisis. Il ne donne aucun pouvoir, et tu le changes quand tu veux.'));
      var pr2 = el('div', 's-choix');
      vue.rangs.forEach(function (r) { pr2.appendChild(puceSocial(r.rang, r.actif, r.sur, { 'data-rang': r.rang })); });
      rg.appendChild(pr2);
      cible.appendChild(rg);
      if (vue.invitables) {
        var inv = el('div', 's-carte s-inviter-guilde');
        inv.appendChild(el('b', null, 'Inviter'));
        inv.appendChild(el('p', 's-gris s-cache', 'Tes abonnés mutuels (vous vous suivez l’un l’autre).'));
        vue.invitables.forEach(function (x) {
          inv.appendChild(lignePersonne({ pseudo: x.pseudo, couleur: x.couleur, sous: x.invite ? 'invitation envoyée' : null,
            bouton: x.invite ? null : { texte: 'Inviter', classe: 's-b2 s-inviter-membre', sur: x.sur } }));
        });
        if (!vue.invitables.length) inv.appendChild(el('p', 's-gris s-cache', 'Aucun abonné mutuel à inviter.'));
        cible.appendChild(inv);
      }
      if (vue.edition) {
        var ed = el('div', 's-carte s-edition-guilde');
        if (vue.edition.surOuvrir) {
          ed.appendChild(boutonSocial('Modifier le nom et le blason', 's-b2 s-large', vue.edition.surOuvrir, 'guilde-modifier'));
        } else {
          var champ2 = el('input', 's-champ');
          champ2.id = 'guilde-nom-edition';
          champ2.maxLength = 24;
          champ2.value = vue.edition.nom;
          champ2.setAttribute('aria-label', 'Nom de la guilde');
          ed.appendChild(champ2);
          ed.appendChild(palette(vue.couleurs, vue.edition.couleur, function (x) {
            var v = champ2.value;
            vue.edition.surCouleur(x);
            var nouveau = doc.getElementById('guilde-nom-edition');
            if (nouveau) nouveau.value = v;
          }));
          var a = el('div', 's-actions');
          a.appendChild(boutonSocial('Enregistrer', 's-b1', function () { vue.edition.surEnregistrer(champ2.value); }, 'guilde-enregistrer'));
          a.appendChild(boutonSocial('Annuler', 's-b3', vue.edition.surAnnuler));
          ed.appendChild(a);
        }
        cible.appendChild(ed);
      }
      var q = el('div', 's-actions s-quitter-guilde');
      if (vue.quitter.surOuvrir) q.appendChild(boutonSocial('Quitter la guilde', 's-b3', vue.quitter.surOuvrir, 'guilde-quitter'));
      else {
        q.appendChild(boutonSocial('Oui, quitter', 's-b2', vue.quitter.surConfirmer, 'guilde-quitter-oui'));
        q.appendChild(boutonSocial('Rester', 's-b3', vue.quitter.surAnnuler));
      }
      cible.appendChild(q);
    }
  }

  // Trouver des amis, le lien d'invitation, la confidentialité.
  function lignePersonne(x) {
    var l = el('div', 's-ligne');
    l.setAttribute('data-pseudo', x.pseudo);
    l.appendChild(blasonSocial(x.couleur, 30));
    var t = el('div', 's-t');
    var nom = el('b', 's-lien', x.pseudo);
    if (x.surProfil) nom.addEventListener('click', x.surProfil);
    t.appendChild(nom);
    if (x.sous) t.appendChild(el('small', null, x.sous));
    l.appendChild(t);
    if (x.bouton) l.appendChild(boutonSocial(x.bouton.texte, x.bouton.classe || 's-b1', x.bouton.sur));
    return l;
  }
  function rendreResultatsAmis(cible, vue) {
    if (!cible) return;
    vider(cible);
    if (vue.etat === 'erreur') { cible.appendChild(el('p', 's-gris s-note s-erreur', vue.message)); return; }
    (vue.resultats || []).forEach(function (x) { cible.appendChild(lignePersonne(x)); });
    if (vue.vide) cible.appendChild(el('p', 's-gris s-note', vue.vide));
  }
  function rendreAmis(cible, vue) {
    if (!cible) return;
    vider(cible);
    var champ = el('input', 's-champ');
    champ.id = 'social-recherche';
    champ.type = 'search';
    champ.placeholder = 'Rechercher un pseudo';
    champ.setAttribute('aria-label', 'Rechercher un pseudo');
    champ.setAttribute('autocomplete', 'off');
    champ.value = vue.recherche || '';
    champ.addEventListener('input', function () { vue.surRecherche(champ.value); });
    cible.appendChild(champ);
    var res = el('div', 's-resultats');
    res.id = 'social-resultats';
    cible.appendChild(res);
    if (vue.message) cible.appendChild(el('p', 's-gris s-note s-erreur', vue.message));
    ligneEnAttente(cible, vue.attente);
    (vue.aSuivre || []).forEach(function (x) { cible.appendChild(lignePersonne(x)); });
    var lien = el('div', 's-lien-invit');
    lien.appendChild(el('b', null, 'Ton lien d’invitation'));
    lien.appendChild(el('code', null, vue.lien || '—'));
    if (vue.lien) lien.appendChild(boutonSocial('Partager le lien', 's-b2', vue.surPartager, 'social-partager'));
    cible.appendChild(lien);
    cible.appendChild(el('p', 's-titre-s', 'Confidentialité'));
    var reg = el('div', 's-reglage');
    var txt = el('div');
    txt.appendChild(el('b', null, 'Compte privé'));
    // 184 (V-reglage-incomplet) — le texte dit ce que la base fait (`social_profil`, `social_rechercher`, SOCIAL-V1 §1) :
    // le seul réglage lu est `compte_prive` (les colonnes `visibility_*` du v1 ne sont lues nulle part).
    txt.appendChild(el('small', 's-gris', vue.prive
      ? 'Chaque abonnement attend ton accord. Un inconnu voit ton pseudo et ton niveau, un abonné ton fil, un mutuel tes séries ' +
        'et tes charges ; ta guilde ne voit tes séances qu’une fois son abonnement accepté.'
      : 'Coupé : n’importe qui peut te suivre, sans demande, et voit ton fil ; ta guilde voit tes séances. Un mutuel voit aussi ' +
        'tes séries et tes charges.'));
    reg.appendChild(txt);
    var inter = el('button', 's-inter' + (vue.prive ? ' s-on' : ''));
    inter.type = 'button';
    inter.id = 'social-compte-prive';
    inter.setAttribute('role', 'switch');
    inter.setAttribute('aria-checked', vue.prive ? 'true' : 'false');
    inter.setAttribute('aria-label', 'Compte privé');
    inter.addEventListener('click', vue.surPrive);
    reg.appendChild(inter);
    cible.appendChild(reg);
    var bl = el('div', 's-bloques');
    if (!(vue.bloques || []).length) bl.appendChild(el('p', 's-gris s-cache', 'Bloqués : aucun'));
    else {
      bl.appendChild(el('p', 's-titre-s', 'Bloqués'));
      vue.bloques.forEach(function (x) { bl.appendChild(lignePersonne(x)); });
    }
    cible.appendChild(bl);
  }

  // La séance d'Aurélien (la sienne) : le nombre de réactions, vu par l'auteur seulement.
  function rendreReactionsAuteur(cible, n) {
    if (!cible) return;
    vider(cible);
    cible.hidden = !(n > 0);
    if (n > 0) cible.textContent = '🔥 ' + n + ' ' + (n > 1 ? 'réactions' : 'réaction');
  }


  // ══ LE GROUPE DE SÉANCE (91, SOCIAL-V1 « Groupe », maquettes `maquette-social-groupe-v1.html` et
  // `maquette-groupe-direct-interactive.html`) ══════════════════════════════════════════════════════════════════
  //
  // ⚠️ JAMAIS UN OVERLAY : la carte du groupe est une ligne en haut de la séance, d'une HAUTEUR FIXE quel que soit le
  // nombre de membres (une pastille chacun, les 2 dernières séries, « Tout voir » pour le reste). Rien ici ne touche
  // à la séance : la vue reçoit ses gestes, l'app les fait.
  function rendreGroupeSeance(cible, vue) {
    if (!cible) return;
    vider(cible);
    cible.hidden = !vue;
    if (!vue) return;
    if (vue.message) cible.appendChild(el('p', 's-gris s-note s-erreur g-message', vue.message));
    (vue.invitations || []).forEach(function (i) { cible.appendChild(carteInvitationGroupe(i)); });
    if (!vue.groupe) {
      if (vue.surLancer) cible.appendChild(boutonSocial('S’entraîner ensemble', 's-b2 g-lancer', vue.surLancer, 'groupe-lancer'));
      return;
    }
    var g = vue.groupe;
    var c = el('div', 's-carte g-direct' + (g.ouvert ? ' g-ouvert' : ''));
    c.id = 'groupe-direct';
    var tete = el('div', 'g-tete');
    tete.appendChild(el('b', 'g-titre', g.titre));
    var droite = el('div', 'g-tete-actions');
    if (g.surInviter) droite.appendChild(boutonSocial('Inviter', 's-b3 g-inviter', g.surInviter, 'groupe-inviter'));
    droite.appendChild(boutonSocial(g.muet ? 'Son' : 'Muet', 's-b2 g-muet', g.surMuet, 'groupe-muet'));
    // 177 — quitter le groupe en pleine séance : la séance continue, seule.
    if (g.surQuitter) droite.appendChild(boutonSocial('Quitter', 's-b3 g-quitter', g.surQuitter, 'groupe-quitter'));
    tete.appendChild(droite);
    c.appendChild(tete);
    if (g.confirmerQuitter) c.appendChild(confirmationQuitterGroupe(g.confirmerQuitter));
    var past = el('div', 'g-pastilles');
    g.pastilles.forEach(function (p) {
      var d = el('div', 'g-p' + (p.actif ? ' g-actif' : '') + (p.moi ? ' g-moi' : ''), p.initiale);
      d.style.background = p.couleur;
      d.title = p.pseudo;
      d.setAttribute('data-pseudo', p.pseudo);
      d.setAttribute('aria-label', p.pseudo + (p.actif ? ', série validée il y a moins de 3 min' : ''));
      past.appendChild(d);
    });
    c.appendChild(past);
    var lignes = el('div', 'g-lignes');
    g.lignes.forEach(function (l) {
      var d = el('div', 'g-l');
      d.appendChild(doc.createTextNode(l.texte + ' '));
      if (l.etiquette) {
        d.appendChild(el('span', 'g-etiq', l.etiquette));
        d.appendChild(doc.createTextNode(' '));
      }
      d.appendChild(el('small', null, '· ' + l.quand));
      lignes.appendChild(d);
    });
    if (!g.lignes.length) lignes.appendChild(el('div', 'g-l s-gris', 'Aucune série validée pour l’instant.'));
    c.appendChild(lignes);
    if (g.toutVoir) c.appendChild(boutonSocial(g.toutVoir.texte, 's-b3 g-tout', g.toutVoir.sur, 'groupe-tout-voir'));
    // La ligne des messages est TOUJOURS là (vide, ou cachée par « Muet ») : la carte ne change pas de hauteur.
    var ligneMsg = el('p', 'g-msg' + (g.muet ? ' g-muette' : ''), g.enAttente || (!g.muet && g.messages) || '\u00a0');
    if (g.enAttente) ligneMsg.className += ' g-attente';
    c.appendChild(ligneMsg);
    if (g.proposition) {
      var p = el('div', 'g-proposition');
      p.appendChild(el('span', null, g.proposition.texte));
      p.appendChild(boutonSocial('Ajouter', 's-b1 g-ajouter', g.proposition.surAjouter, 'groupe-ajouter'));
      p.appendChild(boutonSocial('Non', 's-b3 g-non', g.proposition.surNon, 'groupe-non'));
      c.appendChild(p);
    }
    var choix = el('div', 'g-choix');
    g.rapides.forEach(function (r) {
      var b = boutonSocial(r.texte, 's-periode g-rapide', r.sur);
      b.setAttribute('data-texte', r.texte);
      choix.appendChild(b);
    });
    if (!g.ecrire) choix.appendChild(boutonSocial('Écrire…', 's-periode g-ecrire', g.surEcrire, 'groupe-ecrire'));
    c.appendChild(choix);
    if (g.ecrire) {
      var f = el('div', 'g-ecrire-ligne');
      var champ = el('input', 's-champ g-champ');
      champ.id = 'groupe-texte';
      champ.maxLength = g.max;
      champ.placeholder = 'Ton message (' + g.max + ' caractères au plus)';
      champ.setAttribute('aria-label', 'Message au groupe');
      f.appendChild(champ);
      f.appendChild(boutonSocial('Envoyer', 's-b1 g-envoyer', function () { g.ecrire.surEnvoyer(champ.value); }, 'groupe-envoyer'));
      f.appendChild(boutonSocial('Annuler', 's-b3', g.ecrire.surAnnuler));
      c.appendChild(f);
    }
    cible.appendChild(c);
  }
  // 177 — la confirmation de « Quitter le groupe », dans la page (jamais confirm()).
  function confirmationQuitterGroupe(q) {
    var d = el('div', 'g-confirmer');
    d.appendChild(el('p', 's-gris s-note', q.texte));
    var b = el('div', 'g-invitation-gestes');
    b.appendChild(boutonSocial('Oui, quitter le groupe', 's-b1 g-quitter-oui', q.surOui, 'groupe-quitter-oui'));
    b.appendChild(boutonSocial('Non', 's-b3 g-quitter-non', q.surNon, 'groupe-quitter-non'));
    d.appendChild(b);
    return d;
  }
  function carteInvitationGroupe(i) {
    var r = el('div', 's-demande g-invitation');
    r.setAttribute('data-invitant', i.invitant);
    var t = el('div', 's-t');
    t.appendChild(el('b', null, i.invitant));
    t.appendChild(el('small', null, 't’invite à t’entraîner ensemble'));
    r.appendChild(t);
    // 177 — « Rejoindre » / « Non merci » (la classe `g-voir-invitation` reste : les bancs et la vue la visent).
    var b = el('div', 'g-invitation-gestes');
    b.appendChild(boutonSocial('Rejoindre', 's-b1 g-voir-invitation g-rejoindre', i.surRejoindre));
    if (i.surRefuser) b.appendChild(boutonSocial('Non merci', 's-b3 g-refuser', i.surRefuser));
    r.appendChild(b);
    return r;
  }
  // L'accueil (Séances, Saisie) : les invitations reçues, et le groupe qui finit (« s'entraîne encore », puis « Le récap
  // du groupe est prêt »).
  function rendreGroupeAccueil(cible, vue) {
    if (!cible) return;
    vider(cible);
    cible.hidden = !vue;
    if (!vue) return;
    (vue.invitations || []).forEach(function (i) { cible.appendChild(carteInvitationGroupe(i)); });
    if (vue.fin) {
      var r = el('div', 's-demande g-fin');
      var t = el('div', 's-t');
      t.appendChild(el('b', null, vue.fin.titre));
      if (vue.fin.sous) t.appendChild(el('small', null, vue.fin.sous));
      r.appendChild(t);
      if (vue.fin.surVoir) r.appendChild(boutonSocial('Voir', 's-b1 g-voir-recap', vue.fin.surVoir, 'groupe-voir-recap'));
      if (vue.fin.surQuitter) r.appendChild(boutonSocial('Quitter', 's-b3 g-quitter', vue.fin.surQuitter, 'groupe-quitter'));
      cible.appendChild(r);
      if (vue.fin.confirmerQuitter) cible.appendChild(confirmationQuitterGroupe(vue.fin.confirmerQuitter));
    }
  }
  // La vue du groupe, plein écran : lancer (inviter), rejoindre, le récap du « combat ».
  function rendreGroupeVue(cible, vue) {
    if (!cible) return;
    vider(cible);
    if (vue.message) cible.appendChild(el('p', 's-gris s-note s-erreur g-message', vue.message));
    if (vue.mode === 'charge') { cible.appendChild(el('p', 's-gris s-note', 'Chargement…')); return; }
    // 121 (05 #4, #12) — hors ligne : la phrase seule (« Il faut le réseau pour … »), ni zéros, ni « Chargement… ».
    if (vue.mode === 'erreur') return;
    if (vue.mode === 'inviter') {
      if (vue.sous) cible.appendChild(el('p', 's-gris s-cache', vue.sous));
      (vue.invitations || []).forEach(function (i) { cible.appendChild(carteInvitationGroupe(i)); });
      var c = el('div', 's-carte g-inviter-carte');
      c.appendChild(el('b', null, 'S’entraîner ensemble'));
      c.appendChild(el('p', 's-gris s-cache', 'Invite tes amis : chacun garde sa séance, vous voyez ce que font les autres.'));
      (vue.amis || []).forEach(function (a) {
        var l = el('div', 's-ligne g-ami');
        l.setAttribute('data-pseudo', a.pseudo);
        var t = el('div', 's-t');
        t.appendChild(el('b', null, a.pseudo));
        if (a.sous) t.appendChild(el('small', null, a.sous));
        l.appendChild(t);
        l.appendChild(boutonSocial(a.libelle, a.invite ? 's-b3' : 's-b1', a.sur));
        c.appendChild(l);
      });
      if (vue.amis && !vue.amis.length) c.appendChild(el('p', 's-gris s-cache', 'Aucun abonné mutuel à inviter.'));
      cible.appendChild(c);
      cible.appendChild(el('p', 's-gris s-cache', 'Seuls tes abonnés mutuels apparaissent.'));
      return;
    }
    if (vue.mode === 'rejoindre') {
      var d = el('div', 's-demande');
      var dt = el('div', 's-t');
      dt.appendChild(el('b', null, vue.invitant));
      dt.appendChild(el('small', null, 't’invite à t’entraîner ensemble'));
      d.appendChild(dt);
      cible.appendChild(d);
      cible.appendChild(el('p', 's-gris g-titre-s', 'Ta séance'));
      vue.choix.forEach(function (x) {
        var b = el('button', 's-carte g-option');
        b.type = 'button';
        b.setAttribute('data-choix', x.cle);
        b.appendChild(el('b', null, x.titre));
        if (x.sous) b.appendChild(el('p', 's-gris s-cache', x.sous));
        b.addEventListener('click', x.sur);
        cible.appendChild(b);
        if (x.routines) {
          var liste = el('div', 'g-routines');
          x.routines.forEach(function (r) {
            var rb = boutonSocial(r.nom, 's-b2 g-routine', r.sur);
            rb.setAttribute('data-routine', r.nom);
            liste.appendChild(rb);
          });
          cible.appendChild(liste);
        }
      });
      cible.appendChild(boutonSocial('Pas maintenant', 's-b3 s-large', vue.surPasMaintenant, 'groupe-pas-maintenant'));
      return;
    }
    // 182 — le récap qui raconte la séance (chacun porte son `detail`) ; sans lui (ancien récap figé), l'affichage d'avant.
    if (vue.detaille) return rendreRecapDeGroupe(cible, vue);
    // Le récap du « combat » : la part de chacun en faits, sans classement ni vainqueur.
    var r0 = vue.recap;
    var tete = el('div', 's-prof g-ensemble');
    tete.appendChild(el('b', null, r0.titre));
    tete.appendChild(el('small', null, r0.qui));
    cible.appendChild(tete);
    var carte = el('div', 's-carte');
    var ch = el('div', 's-chiffres g-chiffres');
    [[r0.tonnes, 'soulevées', 'g-tonnes'], [String(r0.series), 'séries', 'g-series'], [String(r0.records), 'records', 'g-records']]
      .forEach(function (x) {
        var b = el('div', x[2]);
        b.appendChild(el('strong', null, x[0]));
        b.appendChild(el('span', null, x[1]));
        ch.appendChild(b);
      });
    carte.appendChild(ch);
    if (r0.xp) carte.appendChild(el('p', 's-gris s-cache g-xp', r0.xp));
    cible.appendChild(carte);
    r0.membres.forEach(function (m) {
      var l = el('div', 's-ligne g-part');
      var t = el('div', 's-t');
      t.appendChild(el('b', null, m.pseudo));
      t.appendChild(el('small', null, m.part));
      l.appendChild(t);
      cible.appendChild(l);
    });
    if (vue.surFermer) cible.appendChild(boutonSocial('Fermer', 's-b1 s-large g-fermer', vue.surFermer, 'groupe-fermer'));
    if (r0.note) cible.appendChild(el('p', 's-gris s-cache', r0.note));
  }
  // 182 — LE RÉCAP DE GROUPE QUI RACONTE LA SÉANCE. Ce rendu ne calcule rien : `vue.detaille` vient de
  // `Social.recapDetaille`. AUCUN CLASSEMENT : sur chaque exercice, « toi » puis les autres dans l'ordre d'arrivée, tous
  // du même poids (ni gras, ni couleur pour « le plus fort »).
  function rendreRecapDeGroupe(cible, vue) {
    var d = vue.detaille;
    var tete = el('div', 's-prof g-ensemble');
    tete.appendChild(el('b', null, d.titre));
    tete.appendChild(el('small', null, d.qui));
    cible.appendChild(tete);
    var tuiles = el('div', 'recap-tuiles g-tuiles g-tuiles-' + d.tuiles.length);
    d.tuiles.forEach(function (t) {
      var x = el('div', 'recap-tuile g-tuile-' + t.cle);
      x.appendChild(el('b', null, t.valeur));
      x.appendChild(el('span', null, t.libelle));
      tuiles.appendChild(x);
    });
    cible.appendChild(tuiles);
    if (d.phrase) cible.appendChild(el('p', 'recap-voix g-phrase', d.phrase));
    cible.appendChild(el('p', 's-gris g-titre-s', 'Exercice par exercice'));
    d.exercices.forEach(function (e) {
      var c = el('div', 's-carte g-exo');
      c.setAttribute('data-slug', e.slug);
      c.appendChild(el('div', 'g-exo-nom', e.nom));
      e.lignes.forEach(function (l) {
        var ligne = el('div', 'g-exo-ligne');
        ligne.appendChild(el('span', 'g-exo-qui', l.pseudo));
        ligne.appendChild(el('span', 'g-exo-val', l.texte));
        c.appendChild(ligne);
      });
      cible.appendChild(c);
    });
    cible.appendChild(el('p', 's-gris g-titre-s', 'Records du jour'));
    if (d.records.length) {
      d.records.forEach(function (x) {
        var l = el('div', 'recap-rec g-record');
        l.appendChild(el('div', 'l1', x.texte));
        l.appendChild(el('div', 'l2', x.pseudo));
        cible.appendChild(l);
      });
    } else {
      cible.appendChild(el('p', 's-gris s-cache g-aucun-record', 'Pas de record aujourd’hui.'));
    }
    cible.appendChild(el('p', 's-gris g-titre-s', 'Chacun'));
    var carte = el('div', 's-carte g-chacun');
    d.chacun.forEach(function (m) {
      var l = el('div', 'g-chacun-ligne g-part');
      l.appendChild(el('span', 'g-exo-qui', m.pseudo));
      l.appendChild(el('span', 'g-exo-val', m.texte));
      if (m.xp) l.appendChild(el('span', 'g-xp-part', m.xp));
      carte.appendChild(l);
    });
    cible.appendChild(carte);
    if (vue.surFermer) cible.appendChild(boutonSocial('Fermer', 's-b1 s-large g-fermer', vue.surFermer, 'groupe-fermer'));
    if (vue.recap && vue.recap.note) cible.appendChild(el('p', 's-gris s-cache', vue.recap.note));
  }
  // Le détail d'une séance faite en groupe : « Faite en groupe avec jordan, lea », qui rouvre le récap figé.
  function rendreGroupeDuDetail(cible, vue) {
    if (!cible) return;
    vider(cible);
    cible.hidden = !vue;
    if (!vue) return;
    cible.appendChild(boutonSocial(vue.texte, 's-b2 g-trace', vue.surVoir, 'detail-groupe-voir'));
  }

  var api = {
    rendreEtat: rendreEtat,
    rendreOnglets: rendreOnglets,
    rendreApercu: rendreApercu,
    rendreBarreSemaine: rendreBarreSemaine,
    rendreRappel: rendreRappel,
    rendreReleveZones: rendreReleveZones,
    rendreFenetreMuscle: rendreFenetreMuscle,
    rendreCalendrier: rendreCalendrier,
    libelleSemaine: libelleSemaine,
    rendreSommaire: rendreSommaire,
    rendrePeriodes: rendrePeriodes,
    rendreRadar: rendreRadar,
    rendreCartesPeriode: rendreCartesPeriode,
    rendreCourbePoids: rendreCourbePoids,
    rendreListePesees: rendreListePesees,
    jour: jour,
    signe: signe,
    rendreJours: rendreJours,
    resumeSortie: resumeSortie,
    rendreListeSeances: rendreListeSeances,
    rendreBloc: rendreBloc,
    rendreDetail: rendreDetail,
    rendrePageExercice: rendrePageExercice,
    rendreToastAnnuler: rendreToastAnnuler,
    message: message
  };

  racine.THRendu = {
    rendreBandeauSeance: rendreBandeauSeance,
    majDureeBandeau: majDureeBandeau,
    libelleDuree: libelleDuree,
    rendreBlocsSeance: rendreBlocsSeance, carteDeMobilite: carteDeMobilite,
    majConstat: majConstat,
    demanderReps: demanderReps,
    demanderCases: demanderCases,
    montrerQuestion: montrerQuestion,
    retirerQuestion: retirerQuestion,
    focusChamp: focusChamp,
    rendreRepos: rendreRepos,
    rendreFeuilleSerie: rendreFeuilleSerie,
    rendreFeuilleNote: rendreFeuilleNote,
    rendreFeuilleRepos: rendreFeuilleRepos,
    rendreFeuilleZoneRoutine: rendreFeuilleZoneRoutine,
    rendreFeuilleZonePlan: rendreFeuilleZonePlan,
    VALEURS_REPOS: VALEURS_REPOS,
    rendreFeuilleConfirmer: rendreFeuilleConfirmer,
    rendreFeuilleSortie: rendreFeuilleSortie,
    rendreFeuilleTemps: rendreFeuilleTemps,
    rendreCarteRaccourci: rendreCarteRaccourci,
    rendreFeuilleSeance: rendreFeuilleSeance,
    rendreFeuilleEnFaireUneRoutine: rendreFeuilleEnFaireUneRoutine,
    rendreApercuRoutine: rendreApercuRoutine,
    rendreFeuilleChoixRoutine: rendreFeuilleChoixRoutine,
    rendreFeuilleSemaineDeTest: rendreFeuilleSemaineDeTest,
    rendreFeuilleMajRoutine: rendreFeuilleMajRoutine,
    rendreFeuilleDossier: rendreFeuilleDossier,
    rendreFeuilleProgramme: rendreFeuilleProgramme,
    rendreFeuilleSeancesQuiReviennent: rendreFeuilleSeancesQuiReviennent,
    rendreApercuProgramme: rendreApercuProgramme,
    rendreFeuilleEcartes: rendreFeuilleEcartes,
    rendreFeuilleSalle: rendreFeuilleSalle,
    rendreFeuilleElastique: rendreFeuilleElastique,
    rendreFeuilleAjoutElastiques: rendreFeuilleAjoutElastiques,
    rendreFeuilleBlocEnCours: rendreFeuilleBlocEnCours,
    rendreFeuilleDupliquer: rendreFeuilleDupliquer,
    rendreFeuilleMenuDossier: rendreFeuilleMenuDossier,
    rendreFeuilleRenommerDossier: rendreFeuilleRenommerDossier,
    champDossier: champDossier,
    resumeStructure: resumeStructure,
    texteChangementSeries: texteChangementSeries,
    texteChargeProgramme: texteChargeProgramme,
    rendreFeuillePourquoi: rendreFeuillePourquoi,
    rendreFeuilleAccord: rendreFeuilleAccord,
    rendreFeuilleAssistant: rendreFeuilleAssistant,
    rendreFeuilleZone: rendreFeuilleZone,
    rendreFeuilleBloc: rendreFeuilleBloc,
    rendreFeuilleExercice: rendreFeuilleExercice,
    rendreFeuilleMachinePrise: rendreFeuilleMachinePrise,
    rendreFeuilleDouleur: rendreFeuilleDouleur,
    propositionDeReprise: propositionDeReprise,
    texteFaitFrere: texteFaitFrere,
    rendreFeuilleSupprimer: rendreFeuilleSupprimer,
    phraseEffacement: phraseEffacement,
    rendreFeuilleFin: rendreFeuilleFin,
    rendreFeuilleDuree: rendreFeuilleDuree,
    rendreRecap: rendreRecap,
    // 64B — le jeu (JEU-V1 §9).
    rendreJeuAccueil: rendreJeuAccueil,
    // 87 — le social, étage 1.
    rendreEnteteSocial: rendreEnteteSocial, rendreFil: rendreFil, rendreAmi: rendreAmi, rendreAmis: rendreAmis,
    rendreGuilde: rendreGuilde,
    // 91 — le groupe de séance.
    rendreGroupeSeance: rendreGroupeSeance, rendreGroupeAccueil: rendreGroupeAccueil, rendreGroupeVue: rendreGroupeVue,
    rendreGroupeDuDetail: rendreGroupeDuDetail,
    rendreExerciceAmi: rendreExerciceAmi, rendreComparaison: rendreComparaison, rendreEntreAmis: rendreEntreAmis,
    rendreResultatsAmis: rendreResultatsAmis, rendreReactionsAuteur: rendreReactionsAuteur,
    JEU_TITRES: JEU_TITRES,
    rendreJeuMuscles: rendreJeuMuscles,
    rendreJeuSucces: rendreJeuSucces,
    rendreJeuDeblocages: rendreJeuDeblocages,
    libelleSucces: libelleSucces,
    rendreBandeauJeu: rendreBandeauJeu,
    mmss: mmss,
    etiquetteSerie: etiquetteSerie,
    texteEffort: texteEffort,
    rendreBandeauReprise: rendreBandeauReprise,
    rendreFeuilleInstaller: rendreFeuilleInstaller,
    rendreCarteSemaine: rendreCarteSemaine,
    rendreLigneEquilibre: rendreLigneEquilibre,
    rendreEquilibres: rendreEquilibres,
    rendreCarteEchelles: rendreCarteEchelles,
    rendreCarteManque: rendreCarteManque,
    rendreFinsDeCycleSaisie: rendreFinsDeCycleSaisie,
    rendreEscalier: rendreEscalier,
    brancherReorganisation: brancherReorganisation,
    rendrePiedReorganisation: rendrePiedReorganisation,
    rendreListeRoutines: rendreListeRoutines,
    rendreProchaineSeance: rendreProchaineSeance,
    rendreRelecture: rendreRelecture,
    rendreFeuilleExoRoutine: rendreFeuilleExoRoutine,
    champChrono: champChrono,
    rendreResultatsExo: rendreResultatsExo,
    rendreSuggestionsExo: rendreSuggestionsExo,
    rendreFiltresExo: rendreFiltresExo,
    el: el,
    vider: vider,
    dateCourte: dateCourte,
    dateLongue: dateLongue,
    rendreEtat: rendreEtat,
    rendreOnglets: rendreOnglets,
    rendreApercu: rendreApercu,
    libelleSemaine: libelleSemaine,
    rendreBarreSemaine: rendreBarreSemaine,
    rendreRappel: rendreRappel,
    rendreReleveZones: rendreReleveZones,
    rendreFenetreMuscle: rendreFenetreMuscle,
    rendreCalendrier: rendreCalendrier,
    rendreSommaire: rendreSommaire,
    rendreParcours: rendreParcours,
    rendreRecordsDuMois: rendreRecordsDuMois,
    rendrePeriodes: rendrePeriodes,
    rendreRadar: rendreRadar,
    rendreCartesPeriode: rendreCartesPeriode,
    rendreCourbePoids: rendreCourbePoids,
    rendreListePesees: rendreListePesees,
    jour: jour,
    signe: signe,
    rendreJours: rendreJours,
    resumeSortie: resumeSortie,
    rendreListeSeances: rendreListeSeances,
    rendreBloc: rendreBloc,
    rendreDetail: rendreDetail,
    rendrePageExercice: rendrePageExercice,
    rendreToastAnnuler: rendreToastAnnuler,
    rendreProfil: rendreProfil,
    rendreQuestionnaire: rendreQuestionnaire,
    rendreFeuilleChoix: rendreFeuilleChoix,
    rendreFeuilleCommentFaire: rendreFeuilleCommentFaire,
    rendreFeuilleChoixMultiple: rendreFeuilleChoixMultiple,
    rendreFeuilleSaisie: rendreFeuilleSaisie,
    rendreFeuillePesee: rendreFeuillePesee,
    rendreFeuilleObjectif: rendreFeuilleObjectif,
    rendreMesExercices: rendreMesExercices,
    rendreImport: rendreImport,
    rendreEntree: rendreEntree,
    message: message
  };
})(typeof self !== 'undefined' ? self : globalThis);
