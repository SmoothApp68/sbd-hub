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

  // « 6 h 35 · 22,7 km » — ce qui résume une sortie, au lieu d'un compte de séries.
  function resumeSortie(r) {
    return [M().formatDuree(r.dureeTotale), M().formatDistance(r.distanceTotale)]
      .filter(Boolean).join(' · ');
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

      if (r.estSortie) {
        var res = resumeSortie(r);
        if (res) carte.appendChild(el('div', 'seance-meta', res));
      } else {
        carte.appendChild(el('div', 'seance-meta',
          r.nbExercices + ' exercice' + (r.nbExercices > 1 ? 's' : '') +
          ' · ' + r.nbSeriesTravail + ' série' + (r.nbSeriesTravail > 1 ? 's' : '') + ' de travail'));
        if (r.salle) carte.appendChild(el('div', 'seance-salle', r.salle));
      }

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
  function rendreBloc(bloc, surExercice) {
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
    entetes.appendChild(el('span', null, 'Charge'));
    section.appendChild(entetes);

    bloc.series.forEach(function (s) {
      // §2.5 : les séries qui ne sont pas du travail ne sont jamais surlignées.
      // Elles portent la lettre de leur exercice, jamais un libellé de type :
      // la distinction se fait par le style.
      var ligne = el('div', 'serie' + (s.estTravail ? '' : ' hors-travail') +
        (s.debutTour ? ' debut-tour' : ''));
      var t = ETIQUETTE_TYPE[s.type_serie];
      // Hors superset, `etiquette` est vide sur une série qui n'est pas du
      // travail : elle n'a pas de lettre à porter. On retombe alors sur le
      // libellé de type — `W` pour une chauffe — plutôt que sur un badge nu.
      ligne.appendChild(el('span', 'tag' + (t ? ' ' + t.classe : ''),
        s.etiquette || (t ? t.texte : '')));
      ligne.appendChild(el('span', 'mesure', M().formatMesure(s)));
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
        cible.appendChild(rendreBloc(b, vue && vue.surExercice));
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
  var SOUS_ONGLETS = [['resume', 'Résumé'], ['historique', 'Historique']];

  // ⚠️ CE QU'ON DIT D'UN EXERCICE SANS PALIER SE LIT SUR SA MESURE, JAMAIS SUR
  // UN CODE D'ERREUR (nuance posée au chantier 24, moteur au chantier 31). Une
  // planche n'a pas « échoué » à produire un palier : elle n'en aura jamais, et
  // `sans-charge` est un mot de moteur, pas une phrase pour quelqu'un.
  //
  // 50-1 bis (§9.17) — LE POIDS DU CORPS EST COACHÉ : la page d'un exercice en
  // reps ne dit plus « pas de palier en kilos » (le coach suit ses reps, la
  // charge vaut 0) ; sa phrase vient du formateur (`THModele`), la seule voix.
  var PHRASE_SANS_PALIER = {
    reps: null,   // la phrase du formateur — voir `phraseSansPalier`
    temps: 'Cet exercice se mesure en durée : il n’a pas de charge, donc pas de palier en kilos.',
    distance_temps: 'Cet exercice se mesure en distance et en durée : il est hors du moteur.'
  };

  // `undefined` pour une mesure qui n'en a pas (charge × reps). Le choix entre
  // « a une phrase » et « n'en a pas » se lit ICI, jamais sur la table.
  function phraseSansPalier(mesure) {
    if (mesure === 'reps') return M().PHRASE_POIDS_DU_CORPS;
    return PHRASE_SANS_PALIER[mesure];
  }

  // La barre d'une aide la plus forte : visible, jamais à zéro.
  var JAUGE_MIN = 8;

  function texteMeilleure(m) {
    if (!m) return '';
    // Les mêmes clés que la carte de séance, dans le même ordre : `charge` et
    // `reps` d'abord, les autres grandeurs ensuite.
    if (m.charge !== null && m.charge !== undefined) {
      return M().formatMesure({ charge_kg: m.charge, reps: m.reps });
    }
    if (!m.valeur) return '';
    return m.valeur + (m.complement ? ' ' + m.complement : '');
  }

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
      // Deux absences distinctes, et on ne les confond pas : l'exercice n'a pas
      // de table par nature, ou il n'a rien encore à y mettre.
      cible.appendChild(el('p', 'vide', phraseSansPalier(vue.mesure)
        ? 'Pas de table par répétitions pour cet exercice.'
        : 'Aucune série de travail enregistrée.'));
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
        ligne.appendChild(el('span', 'tr-charge num', kg < 0 ? M().formatMesure({ charge_kg: kg }) : nombreFr(kg)));
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
  // (maquette « Un exercice ») : la charge la plus lourde, le 1RM estimé
  // (« ≈ »), le tableau à reps égales avec son recul (6 mois, 1 an — l'écart
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
    if (t.unRM) {
      ligneFiche(fiche, '1RM estimé', t.unRM.date ? dateCourte(t.unRM.date) : null,
        '\u2248\u00a0' + nombreFr(Math.round(t.unRM.valeur)) + '\u00a0kg');
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
        tr.appendChild(el('td', null, l.reps === 1 ? '1 rep' : l.reps + ' reps'));
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
  }

  function rendreResumeExo(cible, vue) {
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
    ligneFiche(fiche, vue.mesure === 'charge_reps' ? 'Record de charge' : 'Record',
      sousDouzeMois(r && r.date ? dateCourte(r.date) : null, vue.recordSurDouzeMois), r ? texteMeilleure(r) : '');
    var v = vue.volume || {};
    ligneFiche(fiche, 'Séries de travail',
      v.nbSeances ? 'sur ' + v.nbSeances + ' séance' + (v.nbSeances > 1 ? 's' : '') : null,
      v.nbSeries ? String(v.nbSeries) : '');
    cible.appendChild(fiche);

    // ⚠️ L'AFFICHAGE LIT LA MESURE, PAS LE CODE D'ERREUR DU MOTEUR.
    var sansPalier = phraseSansPalier(vue.mesure);
    if (sansPalier) cible.appendChild(el('p', 'exo-note', sansPalier));

    rendreTableReps(cible, vue);
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
        sous.appendChild(el('b', null, ' · record à ' + s.record +
          ' rep' + (s.record > 1 ? 's' : '')));
      }
      sous.addEventListener('click', function () { vue.surSeance(s.id); });
      tete.appendChild(sous);
      carte.appendChild(tete);

      (s.blocs || []).forEach(function (b) { carte.appendChild(rendreBloc(b)); });

      // `repos_s` est NULL sur les 28 103 séries importées : quand il n'y a rien
      // à dire, on ne dit rien — un « repos moyen 0 » serait un mensonge.
      var pied = [s.reposMoyen ? 'Repos moyen ' + mmss(s.reposMoyen) : '', s.note]
        .filter(Boolean);
      pied.forEach(function (t) { carte.appendChild(el('div', 'exo-jour-note', t)); });
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
    cible.appendChild(tete);

    cible.appendChild(sousOngletsExo(vue));

    if (vue.onglet === 'historique') rendreHistoriqueExo(cible, vue);
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
    entreeMenu(menu, 'Annuler', { surClic: vue.surAnnuler });
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

  var JOURS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

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
  // 5 séries et 2,5 points. La note l'explique UNE fois, en bas.
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

    var secondaire = false;
    apports.forEach(function (a) {
      if (a.secondaire) secondaire = true;
      var ligne = el('div', 'fen-exo');
      var nom = el('span', 'fen-nom', a.nom);
      var ou = a.jour ? JOURS_COURTS[(a.jour.getDay() + 6) % 7] + ' ' + a.jour.getDate() + ' \u00b7 ' : '';
      nom.appendChild(el('em', null, ou + a.seriesReelles + ' série' +
        (a.seriesReelles > 1 ? 's' : '') + (a.secondaire ? ', muscle secondaire' : '')));
      ligne.appendChild(nom);
      ligne.appendChild(el('span', 'fen-valeur', nombreFr(a.apport)));
      cible.appendChild(ligne);
    });

    if (secondaire) {
      cible.appendChild(el('p', 'fen-note',
        'Un muscle secondaire compte pour un demi-point par série.'));
    }
  }

  // ── Le calendrier ───────────────────────────────────────────────────────
  //
  // Ce sont les LIGNES qui se sélectionnent. Chaque jour d'une ligne, y compris
  // ceux du mois voisin, choisit la même semaine — et garde ses points.
  function rendreCalendrier(cible, grille, lundiChoisi, surSemaine) {
    if (!cible) return;
    vider(cible);
    ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach(function (d) {
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
        var meta = r.incomplet ? 'séries pas encore reçues'
          : r.estSortie ? resumeSortie(r)
          // `de travail` — le qualificatif que le jumeau `rendreListeSeances`
          // porte encore et que celui-ci avait perdu (audit, C1).
          : r.nbExercices + ' exercice' + (r.nbExercices > 1 ? 's' : '') +
            ' · ' + r.nbSeriesTravail + ' série' + (r.nbSeriesTravail > 1 ? 's' : '') +
            ' de travail';
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
      var grille = el('div', 'bloc-zones');
      v.zones.forEach(function (z) {
        var item = el('span', 'bloc-zone');
        item.appendChild(doc.createTextNode(z.libelle + ' '));
        item.appendChild(el('b', null, nombreFr(z.series)));
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
      var droite = el('span', 'pesee-var', r.variation ? signe(r.variation.valeur) + ' kg' : '');
      var an = r.date.getFullYear();
      droite.appendChild(el('em', null,
        (r.variation ? 'depuis le ' + jour(r.variation.depuis, an) + ' \u00b7 ' : '') +
        r.nb + ' pesée' + (r.nb > 1 ? 's' : '')));
      ligne.appendChild(droite);
      bloc.appendChild(ligne);
    } else {
      bloc.appendChild(el('div', 'bloc-rien', 'Aucune pesée enregistrée.'));
    }
    bloc.addEventListener('click', v.surChoix);
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
    bouts.push(v.seances ? pluriel(v.seances, 'séance') : 'Aucune séance');
    if (v.records) bouts.push(pluriel(v.records, 'record'));
    if (v.paris && v.paris.verifies) bouts.push(v.paris.tenus + ' pari' + (v.paris.tenus > 1 ? 's' : '') +
      ' tenu' + (v.paris.tenus > 1 ? 's' : '') + ' sur ' + v.paris.verifies);
    bloc.appendChild(el('div', 'bloc-ligne', bouts.join(' \u00b7 ')));
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
    bloc.appendChild(el('div', 'bloc-ligne', v.dernier
      ? 'Le dernier : ' + v.dernier.texte + ', le ' + v.dernier.date + (/\.$/.test(v.dernier.date) ? '' : '.')
      : 'Aucun record pour l\u2019instant.'));
    if (v.surChoix) bloc.addEventListener('click', v.surChoix);
    return bloc;
  }

  function rendreSommaire(cible, vue) {
    if (!cible) return;
    vider(cible);
    if (vue.mois) cible.appendChild(blocMois(vue.mois));
    if (vue.records) cible.appendChild(blocRecords(vue.records));
    cible.appendChild(blocVolume(vue.volume));
    cible.appendChild(blocPoids(vue.poids));
    cible.appendChild(blocExercices(vue.exercices));
  }

  // ── MOTEUR §9.23 (55-1) — LE BILAN D'UN MOIS (maquette « Le mois ») ─────
  //
  // Les chiffres du mois, les séries mois par mois (gris, le mois affiché en
  // couleur du coach — quelle que soit sa hauteur), le calendrier des jours
  // faits, les records, les séries par muscle à côté du mois d'avant, les
  // exercices les plus faits, les paris du coach. Aucune couleur de jugement.
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
    return nombreFr(Math.round(t * (t < 10 ? 10 : 1)) / (t < 10 ? 10 : 1)) + '\u00a0t';
  }
  function rendreBilanMois(cible, vue) {
    if (!cible) return;
    vider(cible);
    var b = vue.bilan;
    cible.appendChild(navMois(vue, vue.titre));

    var tuiles = el('div', 'tuiles-mois');
    var tuile = function (valeur, libelle) {
      var t = el('div', 'tuile-mois');
      t.appendChild(el('b', null, valeur));
      t.appendChild(el('span', null, libelle));
      tuiles.appendChild(t);
    };
    tuile(String(b.seances), b.seances > 1 ? 'séances' : 'séance');
    tuile(String(b.series), 'séries de travail');
    tuile(tonnes(vue.volume), 'volume soulevé');
    tuile(String(vue.records.length), vue.records.length > 1 ? 'records' : 'record');
    // Le temps n'apparaît que si toutes les séances ont une heure de fin.
    if (vue.temps) tuile(vue.temps, 'd\u2019entraînement');
    cible.appendChild(tuiles);

    // Les séries, mois par mois : gris, le mois affiché en couleur du coach.
    var g = carteMois('Séries, mois par mois');
    var max = 0;
    vue.barres.forEach(function (x) { if (x.series > max) max = x.series; });
    var barres = el('div', 'barres-mois');
    var etiq = el('div', 'etiq-mois');
    vue.barres.forEach(function (x) {
      var col = el('div', 'barre-mois' + (x.courant ? ' courant' : ''));
      col.style.height = (max ? Math.max(2, Math.round(x.series / max * 100)) : 2) + '%';
      col.appendChild(el('i', null, String(x.series)));
      barres.appendChild(col);
      etiq.appendChild(el('span', null, x.libelle));
    });
    g.appendChild(barres);
    g.appendChild(etiq);
    cible.appendChild(g);

    // Les jours faits : rien d'autre — ni « jour manqué », ni série.
    var c = carteMois('Tes jours');
    var cal = el('div', 'cal-mois');
    ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach(function (j) { cal.appendChild(el('span', 'j', j)); });
    var premier = vue.premierJour;
    var decalage = (premier.getDay() + 6) % 7;
    for (var k = 0; k < decalage; k++) cal.appendChild(el('span'));
    var nbJours = new Date(premier.getFullYear(), premier.getMonth() + 1, 0).getDate();
    for (var d = 1; d <= nbJours; d++) {
      cal.appendChild(el('span', b.jours.indexOf(d) >= 0 ? 'fait' : null, String(d)));
    }
    c.appendChild(cal);
    cible.appendChild(c);

    // Les records du mois : les trois premiers, puis « et N autres ».
    if (vue.records.length) {
      var r = carteMois('Tes records');
      var t = r.querySelector('h3');
      t.insertBefore(pastilleMedaille(), t.firstChild);
      vue.records.slice(0, 3).forEach(function (x) {
        var l = ligneMois(x.nom, x.mesure, 'lien');
        l.addEventListener('click', function () { vue.surSeance(x.seanceId); });
        r.appendChild(l);
      });
      var reste = vue.records.length - 3;
      var tous = ligneMois(el('span', 'gris', reste > 0 ? 'et ' + reste + (reste > 1 ? ' autres' : ' autre') : 'Tous les records du mois'),
        el('span', 'fleche', '\u203a'), 'lien tous-records');
      tous.addEventListener('click', vue.surRecords);
      r.appendChild(tous);
      cible.appendChild(r);
    }

    // Les séries par muscle (principaux), à côté du mois d'avant.
    if (vue.muscles.length) {
      var m = carteMois('Séries par muscle');
      vue.muscles.forEach(function (x) {
        var droite = el('span');
        // Comme le bloc Volume : un secondaire compte pour moitié (« 1,5 »).
        droite.appendChild(doc.createTextNode(nombreFr(x.series) + ' '));
        droite.appendChild(el('span', 'gris', '\u00b7 ' + vue.moisAvant + ' ' + nombreFr(x.avant)));
        m.appendChild(ligneMois(x.libelle, droite));
      });
      cible.appendChild(m);
    }

    if (vue.exercices.length) {
      var e = carteMois('Les plus faits');
      vue.exercices.forEach(function (x) {
        // 57-1 (ECRAN §7 bis.14) — LE NOM OUVRE SA PAGE, par la même porte que
        // partout ailleurs (§7 quater) : le même bouton `nom-exo lien` que dans
        // la séance, le même `surExercice`, par l'identifiant de l'exercice.
        var nom = x.nom;
        if (vue.surExercice && x.slug) {
          nom = el('button', 'nom-exo lien', x.nom);
          nom.type = 'button';
          nom.addEventListener('click', function () { vue.surExercice(x.slug); });
        }
        e.appendChild(ligneMois(nom, x.series + (x.series > 1 ? ' séries' : ' série')));
      });
      cible.appendChild(e);
    }

    // Les paris du coach : vérifiés, tenus, et la phrase.
    if (vue.paris) {
      var p = carteMois('Le coach a fait ses paris');
      p.appendChild(ligneMois('Paris vérifiés', String(vue.paris.verifies)));
      var tenus = el('span');
      tenus.appendChild(el('b', null, String(vue.paris.tenus)));
      p.appendChild(ligneMois('Tenus', tenus));
      if (vue.paris.phrase) p.appendChild(el('p', 'voix-paris', vue.paris.phrase));
      cible.appendChild(p);
    }
  }

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
    var debut = vue.debut ? new Date(vue.debut) : null;
    var minutes = debut && !isNaN(debut.getTime())
      ? Math.max(0, Math.round((Date.now() - debut.getTime()) / 60000)) : 0;
    // §7 octies.2 — en modification, le temps écoulé n'a plus de sens : la
    // séance date d'avant-hier, et « 3 240 min » ne dirait rien à personne.
    // ⚠️ `travail`, PAS `validees` (chantier 39, C1). Le même mot portait trois
    // comptes sur cinq écrans : 4 chauffes + 2 séries de travail s'affichaient
    // « 6 » ici et sur l'écran de fin, « 2 » sur la carte et la barre. Les
    // chauffes ne sont pas des séries de travail — et `Seance.compter().travail`
    // existe depuis le chantier 22 sans que personne le lise.
    var nT = vue.compte.travail;
    t.appendChild(el('div', 'bandeau-ch num', (vue.edition
      ? 'Modification · ' : minutes + ' min · ') +
      nT + ' série' + (nT > 1 ? 's' : '') + ' de travail'));
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
    echec: { texte: '✕', classe: 'x' }
  };

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
      input.placeholder = nombreFr(fantomeVal);
    } else if (indication) {
      input.placeholder = indication;
    }
    input.addEventListener('input', function () { surSaisie(input.value); });
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
    blocs.forEach(function (bloc, iBloc) {
      // §5.3 — le mode Modifier replie TOUT sur une ligne par bloc. Deux
      // poignées à 360 px, l'une déplaçant six lignes et l'autre une seule, se
      // confondent au pouce ; repliées, elles mesurent pareil.
      cible.appendChild(vue.modifier
        ? blocReplie(bloc, iBloc, blocs.length, vue)
        : rendreBlocSaisie(bloc, iBloc, vue));
    });
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
  function gabaritDe(vue, slug) {
    return M().gabaritDe(vue.exercice(slug));
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
      return g.mesure === gabarits[0].mesure && (g.nature || null) === (gabarits[0].nature || null);
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
        var ps = typeof vue.propositionSchema === 'function' ? vue.propositionSchema(s._iExo) : null;
        if (ps) noeud.appendChild(propositionDeSchema(ps, s._iExo, vue));
        var pc = typeof vue.propositionChauffes === 'function' ? vue.propositionChauffes(s._iExo) : null;
        if (pc) noeud.appendChild(propositionDeChauffes(pc, s._iExo, vue));
      }
      // §9.14 (49-R2) — LA RÉACTION PARLE DANS LA GRILLE, au-dessus de la
      // ligne qu'elle concerne (ECRAN §3.2, maquette variante A). Une ligne de
      // plus DANS le bloc, jamais une seconde couche. Une SŒUR de la ligne, et
      // pas son enfant : le glissement déplace le premier enfant de la ligne.
      var info = !vue.programme && typeof vue.reaction === 'function'
        ? vue.reaction(s._iExo, s._iSerie) : null;
      if (info && info.message) noeud.appendChild(phraseDeReaction(info.message, s.debutTour));
      noeud.appendChild(rangeeDeSerie(bloc, s, complets, vue, info));
      // MOTEUR §9.23 (55-1) — LA MÉDAILLE, SOUS LA RANGÉE de la série qui bat
      // un record. Une sœur de la ligne, comme la réaction (qui reste
      // au-dessus de la ligne suivante : elle parle de la suite, la médaille
      // de cette série). Lue sur l'app, jamais calculée ici.
      var med = !vue.programme && typeof vue.medaille === 'function' ? vue.medaille(s._iExo, s._iSerie) : null;
      if (med) noeud.appendChild(medailleDeSerie(med));
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
      }
      // §7 quindecies.3 (52-1) — DANS L'ÉDITEUR, CE QUE DEVIENT LA CHARGE, en
      // gris : un point de départ la première fois, le coach seul ensuite.
      var cpx = vue.programme && vue.chargeProgramme ? vue.chargeProgramme(x.slug) : null;
      if (cpx) entree.appendChild(el('div', 'consigne-dit charge-programme', texteChargeProgramme(cpx)));
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
        (lib.jaune || []).forEach(function (l) {
          entree.appendChild(tapable(el('div', 'consigne', l)));
        });
        if (lib.gris) entree.appendChild(tapable(el('div', 'consigne-dit', lib.gris)));
        // §12.9 (49-U13) — le compteur de stagnation, à 4 séances ou plus : une
        // seconde ligne grise, lue sur le plan (`lib.compteur`), jamais calculée ici.
        if (lib.compteur) entree.appendChild(tapable(el('div', 'consigne-dit compteur', lib.compteur)));
        // MOTEUR §13.6 (49-U20) — « Pendant ce temps, … » : le frère qui
        // progresse, en gris, après le compteur. Lu sur le plan.
        if (lib.frere) entree.appendChild(tapable(el('div', 'consigne-dit frere', lib.frere)));
        // MOTEUR §14.7 (49-U17) — « une série de plus, jusqu'à ton prochain progrès ».
        if (lib.plus) entree.appendChild(tapable(el('div', 'consigne-dit serie-de-plus', lib.plus)));
      }
      entree.appendChild(reglagesExo(x, vue));

      tete.appendChild(entree);
    });
    return tete;
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
    var champs = g.champs.map(function (n) { return M().champDeMesure(n); });
    var cp = programme ? chargeProgramme : null;
    var sansCharge = !!cp && !cp.depart;
    var entetes = el('div', 'cols-seance grille g-' + g.mesure +
      (programme ? ' programme' : '') + (sansCharge ? ' sans-charge' : ''));
    entetes.appendChild(el('span', '', ''));
    if (!programme) entetes.appendChild(el('span', 'droite', 'PRÉC.'));
    champs.forEach(function (c, i) {
      if (sansCharge && g.champs[i] === 'charge_kg') return;
      // §9.17 — la nature de la charge nomme la colonne (« LEST (KG) », « AIDE (KG) »).
      var surcharge = g.entetes && g.entetes[g.champs[i]];
      // §7 quindecies.3 (52-1) — la charge de départ, sur un exercice jamais fait.
      if (!surcharge && cp && cp.depart && g.champs[i] === 'charge_kg') surcharge = 'DÉPART (KG)';
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

  // MOTEUR §9.23 (55-1) — la médaille : le rond, le gras, le gris (maquette
  // « La médaille »). Le texte vient de `phraseDeRecord`.
  function pastilleMedaille() {
    var m = el('span', 'medaille');
    m.setAttribute('aria-hidden', 'true');
    return m;
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
    if (v.carte) {
      var c = el('div', 'carte-escalier');
      c.appendChild(el('p', 'ce-phrase', v.carte.phrase));
      c.appendChild(el('p', 'ce-detail', v.carte.detail));
      var gestes = el('div', 'ce-gestes');
      var oui = el('button', 'ce-alleger', 'Alléger 7 jours');
      oui.type = 'button';
      oui.addEventListener('click', function () { v.surAlleger(); });
      var non = el('button', 'ce-refuser', 'Non merci');
      non.type = 'button';
      non.addEventListener('click', function () { v.surRefuser(); });
      gestes.appendChild(oui);
      gestes.appendChild(non);
      c.appendChild(gestes);
      cible.appendChild(c);
    } else if (v.allegee && v.allegee.bandeau) {
      cible.appendChild(el('div', 'bandeau-allegee', v.allegee.bandeau));
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
    return propositionDExercice({
      classe: 'proposition-lest', texte: carte.titre, detail: carte.detail,
      oui: carte.oui, non: carte.non, classeOui: 'pl-oui', classeNon: 'pl-non',
      surOui: function () { vue.surLest(iExo, 'oui'); },
      surNon: function () { vue.surLest(iExo, 'non'); }
    }, iExo);
  }

  // MOTEUR §14.5 (49-U15) — « Changer de schéma » : la phrase, le détail,
  // « Passer à 6-8 reps » / « Garder 3-5 ». Lue sur le plan (`escalier.carte`).
  function propositionDeSchema(carte, iExo, vue) {
    // MOTEUR §14.7 (49-U17) — la carte de la SÉRIE DE PLUS : « Ajouter une
    // série » / « Non merci », la même réponse (`vue.surSchema`).
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

  function rangeeDeSerie(bloc, s, complets, vue, reaction) {
    var iExo = s._iExo, iSerie = s._iSerie;
    var g = gabaritDe(vue, s.exercise_slug);
    var champs = g.champs.map(function (n) { return M().champDeMesure(n); });
    // §7 quindecies.3 (52-1) — dans l'éditeur, un exercice DÉJÀ FAIT n'a plus
    // de champ de charge : le coach décide d'après les séances, et la légende
    // le dit. Rien n'est ignoré sans être dit.
    var cp = vue.programme && vue.chargeProgramme ? vue.chargeProgramme(s.exercise_slug) : null;
    var sansCharge = !!cp && !cp.depart;
    var classeGrille = ' grille g-' + g.mesure + (vue.programme ? ' programme' : '') +
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
    // MOTEUR §14.7 (49-U17) — la ligne de la série de plus, à la couleur du coach.
    var ajoutee = !!(reaction && reaction.ajoutee);
    var ligne = el('div', 'ligne-serie' +
      (s.debutTour && !(reaction && reaction.message) ? ' debut-tour' : '') +
      (proposee ? ' proposee' : '') + (ajoutee ? ' ajoutee' : ''));
    var fond = el('div', 'glisse-fond', 'Supprimer');
    var rangee = el('div', 'serie' + classeGrille + (allumee ? ' faite' : ''));
    rangee.setAttribute('data-iexo', iExo);
    rangee.setAttribute('data-iserie', iSerie);

    var eti = etiquetteDeSerie(bloc, s);
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
      var nom = g.champs[iChamp];
      if (sansCharge && nom === 'charge_kg') return;
      if (c.saisie === 'chrono') {
        rangee.appendChild(champChrono(classe, s[c.cle], f[c.cle],
          function (v) { vue.surChamp(iExo, iSerie, nom, v); }));
        return;
      }
      // §9.14 — sur la ligne proposée, la charge est celle du coach, et les
      // reps n'ont que la fourchette pour indication.
      var fourchette = proposee && c.cle === 'reps' && reaction.fourchette
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
      rangee.appendChild(champSerie(classe + (proposee && c.cle === 'charge_kg' ? ' coach' : ''),
        versChamp(enUniteDeSaisie(s[c.cle], c.facteur)),
        versChamp(enUniteDeSaisie(f[c.cle], c.facteur)),
        c.unite,
        function (v) { vue.surChamp(iExo, iSerie, nom, aide && !vue.programme ? M().rangerAide(v) : v); },
        { indication: fourchette,
          surQuitte: typeof vue.surChampQuitte === 'function'
            ? function () { vue.surChampQuitte(iExo, iSerie); } : null }));
    });

    if (g.effort && !vue.programme) {
      var eff = el('button', 'eff-serie num' + (texteEffort(s) ? ' plein' : ''), texteEffort(s));
      eff.type = 'button';
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
    ligne.appendChild(fond);
    brancherGlissement(ligne, function () { vue.surSupprimerSerie(iExo, iSerie); });
    return ligne;
  }

  // §2.3 — dans un superset, le numéro porte la LETTRE de l'exercice et le TOUR.
  // Le type ne s'y écrit plus en toutes lettres : il reste dans la couleur,
  // exactement comme au détail de séance. Hors superset, rien ne change — `C`,
  // `D`, `✕`, ou le numéro de la série de travail.
  function etiquetteDeSerie(bloc, s) {
    if (!bloc.superset) return etiquetteSerie(s.type_serie, s.tour);
    var e = ETIQUETTE_TYPE[s.type_serie];
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
    vider(cible);
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
    cible.appendChild(h);

    var piste = el('div', 'piste');
    var barre = el('i', '');
    // Ce qui RESTE, pas ce qui est passé : la piste part pleine et se vide.
    barre.style.width = vue.cible
      ? Math.max(0, Math.min(100, Math.round((vue.restant / vue.cible) * 100))) + '%' : '0%';
    piste.appendChild(barre);
    cible.appendChild(piste);
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
    ['echec', 'Tentative manquée']
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
        b.type = 'button';
        b.addEventListener('click', function () { vue.surType(t[0]); });
        menu.appendChild(b);
      });
      cible.appendChild(menu);

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
        var n = el('div', 'pq-ligne' + (l.role && /ne compte/.test(l.role) ? ' muet' : ''));
        n.appendChild(el('span', 'pq-quoi', l.texte));
        n.appendChild(el('span', 'pq-role', l.role || ''));
        cible.appendChild(n);
      });
    }
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
          'Le coach se tait sur cet exercice : tu charges comme tu veux.'));
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
    if (cp.depart) return 'Charge de départ : le coach part d\u2019ici la première fois, puis décide d\u2019après tes séances.';
    var valeur = texteMeilleure(cp.fait);
    return 'Charge : le coach décide d\u2019après tes séances' + (valeur ? ' (dernière fois : ' + valeur + ')' : '') + '.';
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
      choixMachinePrise(freres, 'Un frère : ' + f.nom, texteFaitFrere(f.fait), f.surChoisir)
        .classList.add('frere');
    });
    if (!(vue.freres || []).length) {
      cible.appendChild(el('p', 'feuille-aide sans-frere', 'Pas de frère au catalogue pour cet exercice.'));
      entreeMenu(freres, 'Remplacer l’exercice', { surClic: vue.surCatalogue });
    }
    cible.appendChild(freres);
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

  function pluriel(n, mot) { return n + ' ' + mot + (n > 1 ? 's' : ''); }

  // L'origine d'un repos, en français : « par défaut », ou la routine d'où il
  // vient. Dans un superset, le repos est porté par le dernier exercice : les
  // autres n'en disent rien.
  function texteOrigine(o) {
    if (!o || o === R().ORIGINE_SUPERSET) return '';
    if (o === R().ORIGINE_DEFAUT) return 'par défaut';
    return 'ta routine « ' + o + ' »';
  }

  // Ce qu'annonce une ligne d'aperçu : la structure (chauffes, séries,
  // dégressives — ou la durée d'un cardio), puis le repos et son origine.
  // `series` au vocabulaire de la saisie (`reps`) ou de la cible (`reps_visees`).
  function resumeStructure(series, repos, origine) {
    var ch = 0, deg = 0, travail = [], duree = null;
    (series || []).forEach(function (x) {
      var t = (x && x.type_serie) || 'travail';
      if (t === 'echauffement') { ch++; return; }
      if (t === 'degressive') { deg++; return; }
      var r = x.reps !== undefined ? x.reps : x.reps_visees;
      travail.push(r === undefined ? null : r);
      var d = x.duree_s !== undefined ? x.duree_s : x.duree_cible_s;
      if (duree === null && d !== null && d !== undefined) duree = Number(d);
    });
    var parts = [];
    if (ch) parts.push(pluriel(ch, 'chauffe'));
    if (travail.length) {
      var memes = travail[0] !== null && travail.every(function (r) { return r === travail[0]; });
      if (duree !== null && travail.length === 1) parts.push(Math.round(duree / 60) + ' min');
      else parts.push(memes ? travail.length + ' \u00d7 ' + travail[0] : pluriel(travail.length, 'série'));
    }
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
      'Les reps sont des repères de départ ; les charges, c\u2019est le coach qui les propose à chaque séance.'));
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

  function rendreFeuilleFin(cible, vue) {
    vider(cible);
    var t = el('div', 'feuille-t', 'Terminer la séance');
    // `travail`, pas `validees` — même règle que le bandeau (chantier 39, C1).
    var nF = vue.compte.travail;
    t.appendChild(el('em', '', nF + ' série' + (nF > 1 ? 's' : '') +
      ' de travail enregistrée' + (nF > 1 ? 's' : '')));
    cible.appendChild(t);

    // MOTEUR §9.23 (55-1) — LES RECORDS DU JOUR, sous le compte. Sans record,
    // la ligne n'apparaît pas : le coach ne commente pas ce qui n'est pas
    // arrivé. Il n'y a pas d'écran de fin de séance, on n'en crée pas.
    if (vue.records && vue.records.length) {
      var rec = el('div', 'records-fin');
      var gauche = el('span', 'records-fin-t');
      gauche.appendChild(pastilleMedaille());
      gauche.appendChild(doc.createTextNode(vue.records.length + ' record' + (vue.records.length > 1 ? 's' : '')));
      rec.appendChild(gauche);
      var droite = el('span', 'records-fin-l');
      vue.records.forEach(function (r) { droite.appendChild(el('span', null, r.nom + ' ' + r.mesure)); });
      rec.appendChild(droite);
      cible.appendChild(rec);
    }

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
        'Une routine, c\u2019est une liste d\u2019exercices dans un ordre. Le coach décide des charges à chaque séance.'));
      var b = el('button', 'principal', 'Créer une routine');
      b.type = 'button';
      b.addEventListener('click', function () { if (v.surNouvelle) v.surNouvelle(); });
      vide.appendChild(b);
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
      return;
    }

    // §7 duodecies.3 (52-1) — LES DOSSIERS : la bibliothèque regroupée,
    // chaque dossier repliable, « Sans dossier » en dernier. L'ordre dans un
    // dossier est l'ordre global (`rang`). Pendant qu'on RANGE, la liste reste
    // plate : « Ranger » ne change pas, et il range l'ordre global. Sans aucun
    // dossier, rien ne change non plus — pas de « Sans dossier » seul en tête.
    var groupes = v.reorganiser ? null : R().parDossier(routines);
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
      groupes.forEach(function (g, i) {
        var cle = g.dossier === null ? '' : g.dossier;
        var replie = !!(v.replies && v.replies[cle]);
        var pr = programmes[i];
        var ligne = el('div', 'dossier-ligne');
        var tete = el('button', 'dossier-tete' + (replie ? ' replie' : ''));
        tete.type = 'button';
        tete.setAttribute('aria-expanded', replie ? 'false' : 'true');
        tete.appendChild(el('span', 'dossier-nom',
          (replie ? '\u25b8 ' : '\u25be ') + (g.dossier === null ? 'Sans dossier' : g.dossier)));
        // Le badge du bloc À LA PLACE du compte, à droite de la tête (« Bloc
        // Mix · semaine 2 sur 4 ») : il ouvre le bloc en cours (ses
        // exercices, « Arrêter le programme »). Aucune rangée de plus.
        if (!(pr && pr.badge)) tete.appendChild(el('span', 'dossier-compte num', String(g.routines.length)));
        tete.addEventListener('click', function () { if (v.surReplier) v.surReplier(cle); });
        ligne.appendChild(tete);
        if (pr && pr.badge) {
          var badge = el('button', 'dossier-badge', pr.badge);
          badge.type = 'button';
          badge.addEventListener('click', function () { if (v.surBadgeProgramme) v.surBadgeProgramme(g.dossier); });
          ligne.appendChild(badge);
        }
        cible.appendChild(ligne);
        if (!replie && pr && pr.creer) cible.appendChild(rangeeDeProgramme(g.dossier, v));
        if (!replie) g.routines.forEach(function (r) { cible.appendChild(rangeeDeRoutine(r, v)); });
      });
    } else {
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

  // MOTEUR §9.22 (53-2) — « Faire de ce dossier un programme », sous la tête
  // d'un dossier qui n'en a pas. Le bloc en cours n'a pas de rangée : son
  // badge est sur la tête ; la carte de fin est en tête de l'écran.
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
    if (k.commencer) bouton('cfb-commencer', k.commencer, v.surCommencerBloc);
    bouton('cfb-ajuster', k.ajuster, v.surAjusterBloc);
    bouton('cfb-arreter', k.arreter, v.surArreterProgramme);
    c.appendChild(gestes);
    return c;
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
  function rendreResultatsExo(cible, exercices, surChoix) {
    vider(cible);
    var liste = exercices || [];
    if (!liste.length) {
      cible.appendChild(el('p', 'vide', 'Aucun exercice ne correspond.'));
      return;
    }
    liste.forEach(function (e) {
      var b = el('button', 'resultat', e.nom || e.slug);
      b.type = 'button';
      b.addEventListener('click', function () { surChoix(e); });
      cible.appendChild(b);
    });
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

    var chiffres = el('div', 'p-chiffres');
    (vue.kpis || []).forEach(function (k) {
      var c = el('div', 'p-kpi');
      c.appendChild(el('b', '', k.valeur));
      c.appendChild(el('span', '', k.libelle));
      chiffres.appendChild(c);
    });
    cible.appendChild(chiffres);

    (vue.sections || []).forEach(function (sec) {
      // ⚠️ UNE SECTION ABSENTE VAUT `null`, ET C'EST ICI QU'ON LA SAUTE.
      // « Ton rythme » n'existe pas en Entretenir (ECRAN-PROFIL §2.3), et
      // d'autres suivront. Filtrer chez l'appelant demandait à chaque écran d'y
      // penser ; une garde ici le fait une fois pour toutes, et elle se teste.
      if (!sec) return;
      cible.appendChild(el('div', 'p-sect', sec.titre));
      var g = el('div', 'p-groupe');
      // La voix du coach sous le titre, puis le choix, puis une ligne grise
      // (« Depuis le 29 sept. ») — la phase (49-U11).
      if (sec.aide) g.appendChild(el('div', 'p-aide', sec.aide));
      if (sec.segment) g.appendChild(segmentProfil(sec.segment));
      if (sec.pied) g.appendChild(el('div', 'p-pied', sec.pied));
      (sec.lignes || []).forEach(function (l) { g.appendChild(ligneProfil(l)); });
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
      n.addEventListener('click', function () { a.surChoix(b.cle, o.cle); });
      g.appendChild(n);
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
    var barre = el('div', 'q-prog');
    barre.setAttribute('role', 'progressbar');
    barre.setAttribute('aria-valuemin', '1');
    barre.setAttribute('aria-valuemax', String(vue.progression.total));
    barre.setAttribute('aria-valuenow', String(vue.progression.rang + 1));
    var rempli = el('i');
    rempli.style.width = vue.progression.pourcent + '%';
    barre.appendChild(rempli);
    haut.appendChild(barre);
    var plus = el('button', 'q-plus-tard', 'Plus tard');
    plus.type = 'button';
    plus.addEventListener('click', a.surPlusTard);
    haut.appendChild(plus);
    page.appendChild(haut);

    var corps = el('div', 'q-corps');
    corps.dataset.ecran = vue.id;
    corps.appendChild(el('p', 'q-etape', vue.etape));
    corps.appendChild(el('h2', 'q-titre', vue.titre));
    if (vue.voix) corps.appendChild(el('p', 'q-voix', vue.voix));
    (vue.blocs || []).forEach(function (b) {
      if (b.titre) corps.appendChild(el('div', 'q-sous-titre', b.titre));
      if (b.type === 'options') corps.appendChild(blocOptions(b, a));
      else if (b.type === 'puces') corps.appendChild(blocPuces(b, a));
      else if (b.type === 'champs') corps.appendChild(blocChamps(b, a));
      else if (b.type === 'resume') corps.appendChild(blocResume(b, a));
      else if (b.type === 'faits') {
        var f = el('div', 'q-faits');
        b.lignes.forEach(function (l) {
          var r = el('div', 'q-ligne');
          r.appendChild(el('span', 'q-g', l.libelle));
          r.appendChild(el('span', 'q-c', l.valeur));
          f.appendChild(r);
        });
        corps.appendChild(f);
      } else if (b.type === 'ligne') {
        var ligne = el('button', 'q-ligne-choix');
        ligne.type = 'button';
        ligne.dataset.cle = b.cle;
        ligne.appendChild(el('span', 'q-lc-lib', b.libelle));
        ligne.appendChild(el('span', 'q-lc-val', b.valeur));
        ligne.appendChild(el('span', 'q-lc-fl', '›'));
        ligne.addEventListener('click', function () { a.surLigne(b.cle); });
        corps.appendChild(ligne);
      } else if (b.type === 'note') corps.appendChild(el('p', 'q-note', b.texte));
    });
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
    });
    cible.appendChild(menu);
    piedFeuille(cible, [
      vue.surEffacer ? { classe: 'des', texte: 'Effacer', surClic: vue.surEffacer } : null,
      { classe: 'sec', texte: 'Annuler', surClic: vue.surAnnuler }
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
      { classe: 'pri', texte: 'Valider', surClic: function () {
        // ⚠️ LE REFUS RESTE DANS LA FEUILLE. Fermer sur une valeur invalide
        // perdrait la saisie sans rien dire — et la borne qu'on double ici est
        // un CHECK de la base, dont le refus part en 23514, code DÉFINITIF dans
        // la file. Mieux vaut une phrase tout de suite qu'une ligne morte.
        var verdict = vue.surValider(n.value);
        if (verdict) { err.textContent = verdict; n.focus(); }
      } }
    ]);
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
    if (vue.oubli) vue.oubli.hidden = inscription;
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
    message: message
  };

  racine.THRendu = {
    rendreBandeauSeance: rendreBandeauSeance,
    rendreBlocsSeance: rendreBlocsSeance,
    majConstat: majConstat,
    demanderReps: demanderReps,
    rendreRepos: rendreRepos,
    rendreFeuilleSerie: rendreFeuilleSerie,
    rendreFeuilleNote: rendreFeuilleNote,
    rendreFeuilleRepos: rendreFeuilleRepos,
    VALEURS_REPOS: VALEURS_REPOS,
    rendreFeuilleConfirmer: rendreFeuilleConfirmer,
    rendreFeuilleSortie: rendreFeuilleSortie,
    rendreFeuilleTemps: rendreFeuilleTemps,
    rendreCarteRaccourci: rendreCarteRaccourci,
    rendreFeuilleSeance: rendreFeuilleSeance,
    rendreFeuilleEnFaireUneRoutine: rendreFeuilleEnFaireUneRoutine,
    rendreApercuRoutine: rendreApercuRoutine,
    rendreFeuilleChoixRoutine: rendreFeuilleChoixRoutine,
    rendreFeuilleMajRoutine: rendreFeuilleMajRoutine,
    rendreFeuilleDossier: rendreFeuilleDossier,
    rendreFeuilleProgramme: rendreFeuilleProgramme,
    rendreFeuilleBlocEnCours: rendreFeuilleBlocEnCours,
    rendreFeuilleDupliquer: rendreFeuilleDupliquer,
    champDossier: champDossier,
    resumeStructure: resumeStructure,
    texteChangementSeries: texteChangementSeries,
    texteChargeProgramme: texteChargeProgramme,
    rendreFeuillePourquoi: rendreFeuillePourquoi,
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
    mmss: mmss,
    etiquetteSerie: etiquetteSerie,
    texteEffort: texteEffort,
    rendreBandeauReprise: rendreBandeauReprise,
    rendreEscalier: rendreEscalier,
    brancherReorganisation: brancherReorganisation,
    rendrePiedReorganisation: rendrePiedReorganisation,
    rendreListeRoutines: rendreListeRoutines,
    rendreFeuilleExoRoutine: rendreFeuilleExoRoutine,
    champChrono: champChrono,
    rendreResultatsExo: rendreResultatsExo,
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
    rendreBilanMois: rendreBilanMois,
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
    rendreProfil: rendreProfil,
    rendreQuestionnaire: rendreQuestionnaire,
    rendreFeuilleChoix: rendreFeuilleChoix,
    rendreFeuilleChoixMultiple: rendreFeuilleChoixMultiple,
    rendreFeuilleSaisie: rendreFeuilleSaisie,
    rendreMesExercices: rendreMesExercices,
    rendreEntree: rendreEntree,
    message: message
  };
})(typeof self !== 'undefined' ? self : globalThis);
