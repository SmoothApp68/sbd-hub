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

  // Séparateur décimal français, jamais de point à l'écran — et le vrai signe
  // moins (U+2212), jamais le trait d'union du clavier. Les charges NÉGATIVES
  // existent au catalogue : une assistance se note « −50 kg » (muscle up
  // assisté, tirage assisté). Sur un chiffre, un trait d'union se lit comme une
  // césure ; la colonne de palier du chantier 17 est le premier écran à en
  // afficher.
  function nombreFr(n) {
    return String(n).replace('.', ',').replace(/^-/, '\u2212');
  }

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

  function dateCourte(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // « Jeudi 11 septembre » — l'historique d'un exercice se lit par JOUR, et le
  // jour de la semaine en fait partie : « jeudi » situe la séance dans le
  // rythme, ce que « 11/09 » ne fait pas. L'année n'apparaît que si ce n'est
  // pas l'année courante — sinon elle allonge chaque en-tête pour rien.
  function dateLongue(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var opts = { weekday: 'long', day: 'numeric', month: 'long' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    var t = d.toLocaleDateString('fr-FR', opts);
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // « 30 août », ou « 30 août 2024 » quand l'année n'est pas celle de la
  // référence. Une variation « depuis le 18 mars » qui remonterait en fait à
  // l'an dernier serait fausse sans le dire.
  function jour(d, anneeRef) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return '';
    var txt = d.getDate() + ' ' + MOIS[d.getMonth()];
    var ref = typeof anneeRef === 'number' ? anneeRef : new Date().getFullYear();
    return d.getFullYear() === ref ? txt : txt + ' ' + d.getFullYear();
  }

  // Le signe est le vrai signe moins (U+2212), pas le tiret du clavier : sur un
  // chiffre, un trait d'union se lit comme une césure.
  function signe(v) {
    var n = Number(v) || 0;
    if (n > 0) return '+' + nombreFr(n);
    if (n < 0) return '\u2212' + nombreFr(Math.abs(n));
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
      cible.appendChild(el('p', 'vide', 'Aucune série sur cette séance.'));
    } else {
      blocs.forEach(function (b) {
        cible.appendChild(rendreBloc(b, vue && vue.surExercice));
      });
    }

    // §7 octies — les gestes sur une séance. Aucun n'existait : deux séances
    // ont dû être supprimées directement en base le 13/09 faute de bouton.
    // « Partager » n'est pas là : c'est du social, et il vient en dernier.
    if (vue && vue.surSupprimer) {
      var gestes = el('div', 'detail-gestes');
      var refaire = el('button', 'discret', 'Refaire cette séance');
      refaire.type = 'button';
      refaire.addEventListener('click', vue.surRefaire);
      gestes.appendChild(refaire);

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
  var PHRASE_SANS_PALIER = {
    reps: 'Cet exercice se compte en répétitions : il n’a pas de charge, donc pas de palier en kilos.',
    temps: 'Cet exercice se mesure en durée : il n’a pas de charge, donc pas de palier en kilos.',
    distance_temps: 'Cet exercice se mesure en distance et en durée : il est hors du moteur.'
  };

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
    cible.appendChild(el('div', 'section-t', 'PAR NOMBRE DE RÉPÉTITIONS'));
    if (!vue.table || !vue.table.length) {
      // Deux absences distinctes, et on ne les confond pas : l'exercice n'a pas
      // de table par nature, ou il n'a rien encore à y mettre.
      cible.appendChild(el('p', 'vide', PHRASE_SANS_PALIER[vue.mesure]
        ? 'Pas de table par répétitions pour cet exercice.'
        : 'Aucune série de travail enregistrée.'));
      return;
    }
    var avecCharge = vue.mesure === 'charge_reps';
    var table = el('div', 'table-reps' + (avecCharge ? '' : ' sans-charge'));
    var plafond = 0, deduites = 0;
    vue.table.forEach(function (l) {
      var kg = l.deduit && l.chargeDeduite !== undefined ? l.chargeDeduite : l.charge;
      if (kg > plafond) plafond = kg;
    });

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
        barre.style.width = (plafond > 0 ? Math.round((kg / plafond) * 100) : 0) + '%';
        jauge.appendChild(barre);
        ligne.appendChild(jauge);
        ligne.appendChild(el('span', 'tr-charge num', nombreFr(kg)));
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

  function rendreResumeExo(cible, vue) {
    cible.appendChild(el('div', 'section-t', 'RECORDS'));
    var fiche = el('div', 'exo-fiche');

    // La dernière séance porte le PALIER — la grandeur du moteur — et non la
    // meilleure série du jour : ce sont deux choses, et `palier.js` les sépare
    // exprès (`palier`/`reps` d'un côté, `meilleure` de l'autre).
    var d = vue.derniere;
    ligneFiche(fiche, 'Dernière séance', d ? dateCourte(d.date) : null,
      d ? texteMeilleure(d) : '');
    var r = vue.record;
    ligneFiche(fiche, vue.mesure === 'charge_reps' ? 'Record de charge' : 'Record',
      r && r.date ? dateCourte(r.date) : null, r ? texteMeilleure(r) : '');
    var v = vue.volume || {};
    ligneFiche(fiche, 'Séries de travail',
      v.nbSeances ? 'sur ' + v.nbSeances + ' séance' + (v.nbSeances > 1 ? 's' : '') : null,
      v.nbSeries ? String(v.nbSeries) : '');
    cible.appendChild(fiche);

    // ⚠️ L'AFFICHAGE LIT LA MESURE, PAS LE CODE D'ERREUR DU MOTEUR.
    var sansPalier = PHRASE_SANS_PALIER[vue.mesure];
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

  var MOIS = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];

  // « 7 – 13 sept. 2026 », ou « 31 août – 6 sept. 2026 » à cheval sur deux mois.
  function libelleSemaine(lundi, dimanche) {
    if (!lundi || !dimanche) return '';
    var memeMois = lundi.getMonth() === dimanche.getMonth() && lundi.getFullYear() === dimanche.getFullYear();
    var g = lundi.getDate() + (memeMois ? '' : ' ' + MOIS[lundi.getMonth()]);
    return g + ' – ' + dimanche.getDate() + ' ' + MOIS[dimanche.getMonth()] + ' ' + dimanche.getFullYear();
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
      tete.appendChild(el('span', 'jour-date', j.date.getDate() + ' ' + MOIS[j.date.getMonth()]));
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

  function rendreSommaire(cible, vue) {
    if (!cible) return;
    vider(cible);
    cible.appendChild(blocVolume(vue.volume));
    cible.appendChild(blocPoids(vue.poids));
    cible.appendChild(blocExercices(vue.exercices));
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

  function mmss(secondes) {
    var s = Math.max(0, Math.round(secondes || 0));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
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
  function champChrono(classe, secondes, fantomeVal, surSaisie) {
    var vide = secondes === null || secondes === undefined;
    var enveloppe = el('div', classe + ' chrono' + (vide && fantomeVal !== null &&
      fantomeVal !== undefined ? ' fantome' : ''));
    var input = doc.createElement('input');
    input.type = 'text';
    // `numeric` et non `decimal` : il n'y a ni virgule ni point à taper ici, et
    // un clavier qui les propose invite à une saisie que le champ refusera.
    input.inputMode = 'numeric';
    input.setAttribute('aria-label', 'Durée, en heures, minutes et secondes');
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
        var apres = M().poserChiffreDuree(suite, texte[i]);
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

  function champSerie(classe, valeur, fantomeVal, suffixe, surSaisie) {
    var vide = valeur === null || valeur === undefined;
    var enveloppe = el('div', classe + (vide && fantomeVal !== null ? ' fantome' : ''));
    var input = doc.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.value = vide ? '' : nombreFr(valeur);
    if (vide && fantomeVal !== null && fantomeVal !== undefined) {
      input.placeholder = nombreFr(fantomeVal);
    }
    input.addEventListener('input', function () { surSaisie(input.value); });
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

  // ══ L'UNITÉ DE L'ÉCRAN EST LE BLOC, PAS L'EXERCICE (§2.1) ════════════════
  //
  // Un exercice normal est un bloc d'un seul ; un superset est un bloc de 2 à 6.
  // Même carte, même code, pas de « mode superset » — c'est ce qui évite d'avoir
  // deux rendus à tenir d'accord.
  //
  // Les blocs arrivent déjà construits (`THModele.blocsDeSeance`), donc par la
  // MÊME fonction que le détail de séance. Ici on ne fait que poser dans le DOM.
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
    var haut = el('div', 'replie-haut');

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
    var faites = bloc.series.filter(function (s) { return s.estTravail && s.faite; }).length;
    noeud.appendChild(el('div', 'replie-avancement num',
      faites + ' / ' + bloc.nbTravail + ' série' + (bloc.nbTravail > 1 ? 's' : '')));
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
    var memeGabarit = gabarits.every(function (g) { return g.mesure === gabarits[0].mesure; });
    if (memeGabarit) noeud.appendChild(enTetesColonnes(gabarits[0]));

    // §2.6 — l'éclairage porte sur le TOUR entier, pas sur une ligne isolée.
    // Dans un bloc d'un seul exercice, le tour n'a qu'une série : la règle
    // dégénère exactement en l'ancien comportement, sans cas particulier.
    var complets = M().toursComplets(bloc);

    bloc.series.forEach(function (s) {
      noeud.appendChild(rangeeDeSerie(bloc, s, complets, vue));
    });

    noeud.appendChild(boutonsAjoutSerie(bloc, vue));
    return noeud;
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
    var n = bloc.superset ? Math.min(vue.tourAtteint(bloc.groupe), bloc.nbTours) : 0;
    haut.appendChild(el('div', 'superset-t', bloc.superset
      ? 'Superset' + (bloc.nbTours ? ' · tour ' + n + '/' + bloc.nbTours : '') : ''));
    // ⚠️ LE MENU DE BLOC EST ACCESSIBLE EN PLEINE SÉANCE (§5 bis). Remplacer un
    // exercice arrive quand la machine est prise : basculer en mode Modifier
    // pour ça, puis revenir, c'est trois gestes pour un.
    //
    // Sauf PENDANT la sélection (§5.7) : là, la carte entière est la cible du
    // tap, et un bouton au milieu d'elle qui ferait autre chose est un piège.
    // « L'écran ne sert qu'à ça » vaut aussi pour ses boutons.
    if (!enCoursDeSelection(vue)) {
      haut.appendChild(menuTroisPoints('Actions du bloc',
        function () { vue.surMenuBloc(iBloc); }));
    }
    tete.appendChild(haut);

    bloc.exercices.forEach(function (x, i) {
      var g = gabarits[i];
      var entree = el('div', 'legende-exo');

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

  function enTetesColonnes(g) {
    var champs = g.champs.map(function (n) { return M().champDeMesure(n); });
    var entetes = el('div', 'cols-seance grille g-' + g.mesure);
    entetes.appendChild(el('span', '', ''));
    entetes.appendChild(el('span', 'droite', 'PRÉC.'));
    champs.forEach(function (c) { entetes.appendChild(el('span', 'centre', c.entete)); });
    if (g.effort) entetes.appendChild(el('span', 'centre', 'EFFORT'));
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

  function rangeeDeSerie(bloc, s, complets, vue) {
    var iExo = s._iExo, iSerie = s._iSerie;
    var g = gabaritDe(vue, s.exercise_slug);
    var champs = g.champs.map(function (n) { return M().champDeMesure(n); });
    var classeGrille = ' grille g-' + g.mesure;

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
    var allumee = s.tour ? complets[s.tour] === true : !!s.faite;

    // §7 undecies.2 — un espace et un filet plus clair entre les tours. Aucun
    // texte : `A1`, `B1`, `C1` disent déjà « tour 1 », et un libellé coûtait
    // cinq rangs sur un bloc à deux tours de chauffe et trois de travail.
    //
    // ⚠️ LA MARQUE VA SUR LA LIGNE, PAS SUR LA RANGÉE. C'est la ligne qui porte
    // le fond de glissement ; une marge posée sur la rangée laisserait le fond
    // rouge dépasser dans l'espace, au-dessus du vide.
    var ligne = el('div', 'ligne-serie' + (s.debutTour ? ' debut-tour' : ''));
    var fond = el('div', 'glisse-fond', 'Supprimer');
    var rangee = el('div', 'serie' + classeGrille + (allumee ? ' faite' : ''));

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
    var prec = vue.precedent(s.exercise_slug);
    var ligneP = S().correspondant(seriesDeSonExercice(bloc, s), iSerie, prec);
    rangee.appendChild(el('div', 'prec num', M().formatPrecedent(ligneP, g.mesure)));

    var f = vue.fantome(iExo, iSerie);
    // Une seule boucle pour les quatre gabarits : le champ porte sa colonne, son
    // unité et son facteur de conversion. La vue ne sait rien de la différence
    // entre une seconde et un kilomètre.
    champs.forEach(function (c, iChamp) {
      var classe = (iChamp === 0 ? 'ch-serie' : 'rp-serie') + ' num';
      var nom = g.champs[iChamp];
      if (c.saisie === 'chrono') {
        rangee.appendChild(champChrono(classe, s[c.cle], f[c.cle],
          function (v) { vue.surChamp(iExo, iSerie, nom, v); }));
        return;
      }
      rangee.appendChild(champSerie(classe,
        enUniteDeSaisie(s[c.cle], c.facteur),
        enUniteDeSaisie(f[c.cle], c.facteur),
        c.unite,
        function (v) { vue.surChamp(iExo, iSerie, nom, v); }));
    });

    if (g.effort) {
      var eff = el('button', 'eff-serie num' + (texteEffort(s) ? ' plein' : ''), texteEffort(s));
      eff.type = 'button';
      eff.addEventListener('click', function () { vue.surEffort(iExo, iSerie); });
      rangee.appendChild(eff);
    }

    var ok = el('button', 'ok-serie' + (s.faite ? ' cochee' : ''));
    ok.type = 'button';
    ok.setAttribute('aria-label', s.faite ? 'Dévalider' : 'Valider');
    var v = svg('svg', null, { viewBox: '0 0 24 24' });
    v.appendChild(svg('path', null, { d: 'M5 13l4 4L19 7' }));
    ok.appendChild(v);
    ok.addEventListener('click', function () { vue.surValider(iExo, iSerie); });
    rangee.appendChild(ok);

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
  // pas de blocage, aucun décompte qui presse. La piste se remplit et continue.
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
    h.appendChild(el('span', 'repos-g num' + (vue.fige ? ' fige' : ''), mmss(vue.secondes)));

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
    barre.style.width = vue.cible
      ? Math.min(100, Math.round((vue.secondes / vue.cible) * 100)) + '%' : '0%';
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
        var b = el('button', (vue.serie.type_serie || 'travail') === t[0] ? 'sel' : '', t[1]);
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
      cible.appendChild(champTexte('Note de cette série', vue.serie.note,
        { lignes: 2, placeholder: vue.noteExercice || 'Ce qui ne vaut que pour celle-ci' },
        function (v) { vue.surNoteSerie(v); }));

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
      entreeMenu(menu, 'Remplacer l’exercice', { surClic: vue.surRemplacer });
    }
    entreeMenu(menu, 'Grouper en superset…', {
      surClic: vue.surGrouper, desactive: !vue.peutGrouper });
    entreeMenu(menu, 'Ajouter un exercice après', { surClic: vue.surAjouterApres });
    entreeMenu(menu, 'Monter le bloc', { surClic: vue.surMonter, desactive: !vue.peutMonter });
    entreeMenu(menu, 'Descendre le bloc', { surClic: vue.surDescendre, desactive: !vue.peutDescendre });
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

  // Le repos cible, EN SÉANCE (§7 septies.2). Une grille de valeurs, jamais un
  // champ à taper : même raison que le RPE (§3 bis.6) — viser un chiffre au
  // clavier avec les mains moites, entre deux séries, est perdu d'avance. Les
  // valeurs couvrent ce qui se pratique ; l'éditeur de routine garde le champ
  // libre pour les cas particuliers.
  var REPOS_CIBLES = [null, 45, 60, 90, 120, 150, 180, 240];

  function rendreFeuilleRepos(cible, vue) {
    vider(cible);
    var t = el('div', 'feuille-t', 'Repos cible');
    t.appendChild(el('em', '', vue.exercice));
    cible.appendChild(t);
    cible.appendChild(el('p', 'feuille-aide',
      'Pour cette séance. La routine n’est pas touchée : la question se pose à la fin.'));
    var g = el('div', 'grille-rpe');
    var courant = vue.repos === undefined ? null : vue.repos;
    REPOS_CIBLES.forEach(function (v) {
      var b = el('button', courant === v ? 'sel num' : 'num', v === null ? '—' : mmss(v));
      b.type = 'button';
      b.setAttribute('aria-label', v === null ? 'Aucun repos cible' : 'Repos de ' + mmss(v));
      b.addEventListener('click', function () { vue.surRepos(v); });
      g.appendChild(b);
    });
    cible.appendChild(g);
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

  function rendreFeuilleFin(cible, vue) {
    vider(cible);
    var t = el('div', 'feuille-t', 'Terminer la séance');
    // `travail`, pas `validees` — même règle que le bandeau (chantier 39, C1).
    var nF = vue.compte.travail;
    t.appendChild(el('em', '', nF + ' série' + (nF > 1 ? 's' : '') +
      ' de travail enregistrée' + (nF > 1 ? 's' : '')));
    cible.appendChild(t);

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

    if (!liste.length) {
      var vide = el('div', 'vide-routines');
      vide.appendChild(el('p', 'vide', 'Aucune routine pour l\u2019instant.'));
      vide.appendChild(el('p', 'vide-aide',
        'Une routine, ce sont des exercices dans un ordre : ce que tu fais, pas ce que tu soulèves. Les charges, c\u2019est le moteur qui les décide.'));
      var b = el('button', 'principal', 'Créer une routine');
      b.type = 'button';
      b.addEventListener('click', function () { if (v.surNouvelle) v.surNouvelle(); });
      vide.appendChild(b);
      if (v.surSeanceVide) {
        var sv = el('button', 'discret bloc-large', 'Ou commencer une séance vide');
        sv.type = 'button';
        sv.addEventListener('click', v.surSeanceVide);
        vide.appendChild(sv);
      }
      cible.appendChild(vide);
      return;
    }

    liste.forEach(function (r) {
      var carte = el('button', 'routine');
      carte.type = 'button';
      carte.appendChild(el('div', 'routine-nom', r.nom));
      var a = R().apercu(r.exercices);
      carte.appendChild(el('div', 'routine-meta',
        a.nbExercices + ' exercice' + (a.nbExercices > 1 ? 's' : '') +
        ' \u00b7 ' + a.nbSeries + ' série' + (a.nbSeries > 1 ? 's' : '')));
      carte.addEventListener('click', function () { if (v.surChoix) v.surChoix(r.id); });

      var rangee = el('div', 'routine-rangee');
      rangee.appendChild(carte);
      // Démarrer est l'action principale d'une routine ; la modifier est
      // secondaire. Deux cibles distinctes plutôt qu'un menu : on part
      // s'entraîner plus souvent qu'on ne remanie.
      var go = el('button', 'demarrer', 'Démarrer');
      go.type = 'button';
      go.addEventListener('click', function () { if (v.surDemarrer) v.surDemarrer(r.id); });
      rangee.appendChild(go);
      cible.appendChild(rangee);
    });

    // On entre par où on veut (ECRAN-SAISIE §1) : une séance vide se note
    // exercice par exercice.
    if (v.surSeanceVide) {
      var vide2 = el('button', 'discret bloc-large', 'Séance vide');
      vide2.type = 'button';
      vide2.addEventListener('click', v.surSeanceVide);
      cible.appendChild(vide2);
    }
  }

  // Un champ numérique de l'éditeur. `surSaisie` MUTE le brouillon et ne
  // redessine rien : re-rendre à chaque frappe arracherait le focus, et le
  // clavier d'Android avec lui. Seuls les gestes de structure — monter,
  // descendre, retirer — redessinent.
  function champNombre(etiquette, valeur, attributs, surSaisie) {
    var enveloppe = el('label', 'champ-num');
    enveloppe.appendChild(el('span', 'champ-lib', etiquette));
    var input = doc.createElement('input');
    input.type = 'number';
    input.inputMode = 'numeric';
    input.value = (valeur === null || valeur === undefined) ? '' : String(valeur);
    Object.keys(attributs || {}).forEach(function (k) { input.setAttribute(k, String(attributs[k])); });
    input.addEventListener('input', function () { surSaisie(input.value); });
    enveloppe.appendChild(input);
    return enveloppe;
  }

  // La liste des exercices de l'éditeur.
  //
  // ⚠️ AUCUN CHAMP DE CHARGE. Trois réglages, et trois seulement : séries, reps
  // visées, repos cible. La routine porte la structure, le moteur décide du
  // poids (ECRAN-SAISIE-V1 §1.1).
  //
  // ⚠️ LES GESTES VIVENT DERRIÈRE LE MENU À TROIS POINTS (§7 duodecies.2).
  // La carte portait quatre boutons permanents — monter, descendre, retirer, et
  // « grouper avec le suivant » entre chaque paire — pour des gestes
  // occasionnels. C'est la MÊME grammaire que la séance : deux écrans qui font
  // la même chose doivent se piloter pareil, sinon il faut l'apprendre deux
  // fois.
  //
  // La place ainsi libérée sert à ce qui compte : ce que la routine PRESCRIT.
  // Les trois réglages se lisent sur la carte et se modifient dans une feuille
  // — un champ numérique sous le pouce, pas trois sur une carte à 360 px.
  function rendreExosRoutine(cible, exercices, nommer, vue) {
    vider(cible);
    var v = vue || {};
    var liste = exercices || [];

    if (!liste.length) {
      cible.appendChild(el('p', 'vide', 'Aucun exercice. Ajoute le premier ci-dessous.'));
      return;
    }

    // ⚠️ LE GROUPEMENT SE LIT SUR LES LIENS ENTRE VOISINS (chantier 28).
    //
    // Un superset est une suite CONTIGUË : dans une liste, la seule chose qui le
    // définit est « untel est collé au suivant ». Les lettres A/B/C et le liseré
    // le disent, exactement comme au détail de séance — et c'est le menu qui
    // pose et défait le lien.
    var lies = R().liens(liste);
    var lettres = lettresDeLiens(lies);

    liste.forEach(function (e, i) {
      var carte = el('div', 'exo-routine' + (lettres[i] ? ' groupe' : ''));

      var haut = el('div', 'exo-routine-haut');
      var nom = el('span', 'exo-routine-nom');
      if (lettres[i]) nom.appendChild(el('span', 'lettre-exo', lettres[i]));
      nom.appendChild(el('span', '', nommer(e.exercise_slug)));
      haut.appendChild(nom);
      haut.appendChild(menuTroisPoints('Actions sur ' + nommer(e.exercise_slug),
        function () { v.surMenu(i); }));
      carte.appendChild(haut);

      // Ce que la routine prescrit, en clair. Ce qui n'est pas renseigné
      // s'écrit en tiret cadratin, comme en séance : ce n'est pas un zéro.
      carte.appendChild(el('div', 'exo-routine-dit', texteReglages(e)));
      cible.appendChild(carte);
    });
  }

  // « 3 séries × 8 reps · repos 1:30 ». Les reps visées et le repos sont
  // facultatifs : ce qui n'est pas renseigné ne s'invente pas.
  function texteReglages(e) {
    // ⚠️ LE MÊME ENTONNOIR QUE L'ÉCRITURE, PAS UNE LECTURE À CÔTÉ. `serieBornee`
    // est ce qui PART en base (chantier 36) : une routine qui porte `series: 0`
    // — le report de fin de séance savait en produire — s'enverra à 1. Lire
    // `series` brut ici afficherait « 0 série » pour une ligne qui en écrira 1,
    // c'est-à-dire deux voix pour un seul nombre.
    var n = R().serieBornee(e && e.series);
    return n + ' série' + (n > 1 ? 's' : '') +
      ' × ' + (e && e.reps_visees ? e.reps_visees + ' reps' : '—') +
      ' · repos ' + (e && e.repos_cible_s ? mmss(e.repos_cible_s) : '—');
  }

  // ⚠️ LE MENU D'UN EXERCICE DE ROUTINE — les six gestes du §7 duodecies.2, et
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
    entreeMenu(menu, 'Monter', { surClic: vue.surMonter, desactive: !vue.peutMonter });
    entreeMenu(menu, 'Descendre', { surClic: vue.surDescendre, desactive: !vue.peutDescendre });
    entreeMenu(menu, 'Modifier les paramètres', { surClic: vue.surParametres });
    cible.appendChild(menu);

    var sup = el('div', 'feuille-menu');
    entreeMenu(sup, 'Supprimer l’exercice',
      { classe: 'danger', surClic: vue.surSupprimer });
    cible.appendChild(sup);
    return cible;
  }

  // Les trois réglages, dans une feuille. `champNombre` MUTE le brouillon sans
  // redessiner — re-rendre à chaque frappe arracherait le focus, et le clavier
  // d'Android avec lui. C'est « Terminé » qui referme et redessine la carte.
  function rendreFeuilleParametresExo(cible, vue) {
    vider(cible);
    var t = el('div', 'feuille-t', 'Paramètres');
    t.appendChild(el('em', '', vue.nom));
    cible.appendChild(t);

    var champs = el('div', 'feuille-champs');
    champs.appendChild(champNombre('Séries', vue.exercice.series,
      { min: R().SERIES_MIN, max: R().SERIES_MAX },
      function (val) { vue.surChamp('series', val); }));
    champs.appendChild(champNombre('Reps visées', vue.exercice.reps_visees,
      { min: R().REPS_MIN, max: R().REPS_MAX, placeholder: '—' },
      function (val) { vue.surChamp('reps_visees', val); }));
    champs.appendChild(champNombre('Repos (s)', vue.exercice.repos_cible_s,
      { min: R().REPOS_MIN, max: R().REPOS_MAX, placeholder: '—' },
      function (val) { vue.surChamp('repos_cible_s', val); }));
    cible.appendChild(champs);

    var b = el('button', 'principal', 'Terminé');
    b.type = 'button';
    b.addEventListener('click', vue.surFermer);
    cible.appendChild(b);
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
    rendreRepos: rendreRepos,
    rendreFeuilleSerie: rendreFeuilleSerie,
    rendreFeuilleNote: rendreFeuilleNote,
    rendreFeuilleRepos: rendreFeuilleRepos,
    rendreFeuilleConfirmer: rendreFeuilleConfirmer,
    rendreFeuilleSeance: rendreFeuilleSeance,
    rendreFeuilleBloc: rendreFeuilleBloc,
    rendreFeuilleExercice: rendreFeuilleExercice,
    rendreFeuilleSupprimer: rendreFeuilleSupprimer,
    phraseEffacement: phraseEffacement,
    rendreFeuilleFin: rendreFeuilleFin,
    mmss: mmss,
    etiquetteSerie: etiquetteSerie,
    texteEffort: texteEffort,
    rendreListeRoutines: rendreListeRoutines,
    rendreExosRoutine: rendreExosRoutine,
    rendreFeuilleExoRoutine: rendreFeuilleExoRoutine,
    rendreFeuilleParametresExo: rendreFeuilleParametresExo,
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
})(typeof self !== 'undefined' ? self : this);
