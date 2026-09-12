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

  function rendreBloc(bloc) {
    var section = el('section', 'bloc' + (bloc.superset ? ' superset' : ''));

    // Légende A/B/C en tête de bloc : le nom de l'exercice n'apparaît qu'une
    // fois (§2.3), ce qui règle le problème de largeur à 380 px.
    var exos = el('div', 'exos');
    bloc.exercices.forEach(function (x) {
      var ligne = el('div', 'exo');
      if (x.lettre) ligne.appendChild(el('span', 'lettre', x.lettre));
      ligne.appendChild(el('span', 'nom', x.nom));
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
      var ligne = el('div', 'serie' + (s.estTravail ? '' : ' hors-travail'));
      ligne.appendChild(el('span', 'tag', s.etiquette));
      ligne.appendChild(el('span', 'mesure', M().formatMesure(s)));
      section.appendChild(ligne);
    });

    return section;
  }

  function rendreDetail(cible, seance, blocs) {
    vider(cible);
    var tete = el('div', 'detail-tete');
    tete.appendChild(el('h2', null, (seance && seance.titre) || 'Séance'));
    var sousTitre = [dateCourte(seance && seance.debut),
                     (seance && (seance.salle_norme || seance.salle)) || '']
      .filter(Boolean).join(' · ');
    if (sousTitre) tete.appendChild(el('span', 'detail-meta', sousTitre));
    cible.appendChild(tete);

    if (!blocs.length) {
      cible.appendChild(el('p', 'vide', 'Aucune série sur cette séance.'));
      return;
    }
    blocs.forEach(function (b) { cible.appendChild(rendreBloc(b)); });
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

  function rendreJours(cible, jours, resumeDe, surChoix) {
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
          : r.nbExercices + ' exercice' + (r.nbExercices > 1 ? 's' : '') +
            ' · ' + r.nbSeriesTravail + ' série' + (r.nbSeriesTravail > 1 ? 's' : '');
        if (meta) carte.appendChild(el('div', 'seance-meta', meta));
        // Une sortie garde sa carte évidée : durée et distance, pas d'aperçu.
        if (!r.estSortie) rendreApercu(carte, r.apercu);
        carte.addEventListener('click', function () { surChoix(r.id); });
        bloc.appendChild(carte);
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
  function blocExercices(v) {
    var bloc = coquilleBloc('Par exercice', v.quand, true);
    (v.lignes || []).forEach(function (l) {
      var ligne = el('div', 'bloc-exo');
      ligne.appendChild(el('span', 'bloc-exo-nom', l.nom));
      ligne.appendChild(el('span', 'bloc-exo-val', l.mesure));
      ligne.appendChild(el('span', 'bloc-exo-jour', jour(l.jour)));
      bloc.appendChild(ligne);
    });
    bloc.appendChild(el('div', 'bloc-avenir', 'La vue par exercice arrive.'));
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
    var t = el('div', 'bandeau-t');
    t.appendChild(el('div', 'bandeau-nom', vue.titre));
    var debut = vue.debut ? new Date(vue.debut) : null;
    var minutes = debut && !isNaN(debut.getTime())
      ? Math.max(0, Math.round((Date.now() - debut.getTime()) / 60000)) : 0;
    t.appendChild(el('div', 'bandeau-ch num',
      minutes + ' min · ' + vue.compte.validees + ' série' + (vue.compte.validees > 1 ? 's' : '')));
    cible.appendChild(t);
    var b = el('button', 'discret', 'Terminer');
    b.type = 'button';
    b.addEventListener('click', vue.surTerminer);
    cible.appendChild(b);
  }

  // Le numéro porte le TYPE de la série (§3 bis.1) : les quatre valeurs de
  // `sets.type_serie` sont couvertes sans un champ de plus. Le compte de travail
  // n'avance que sur les séries de travail — une chauffe ne prend pas un numéro.
  var ETIQUETTE_TYPE = {
    echauffement: { texte: 'C', classe: 'c' },
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

  function rendreBlocsSeance(cible, seance, vue) {
    vider(cible);
    if (!seance.exercices.length) {
      cible.appendChild(el('p', 'vide', 'Aucun exercice. Ajoute le premier ci-dessous.'));
      return;
    }

    seance.exercices.forEach(function (exo, iExo) {
      // ⚠️ LA GRILLE SUIT LA MESURE DE L'EXERCICE (§3 ter).
      //
      // Quatre gabarits, pas un : `charge_reps` (six colonnes), `reps` (cinq),
      // `temps` (quatre, sans effort), `distance_temps` (cinq, sans effort).
      // Chacun est plus confortable que le précédent — une colonne de moins à
      // chaque fois. La table des gabarits vit dans `THModele`, module pur ;
      // ici on la lit, on ne la redécide pas.
      var g = M().gabaritDe(vue.exercice(exo.exercise_slug));
      var champs = g.champs.map(function (n) { return M().champDeMesure(n); });

      var bloc = el('div', 'bloc-seance');
      var tete = el('div', 'tete-seance');
      tete.appendChild(el('div', 'exo-seance', vue.nommer(exo.exercise_slug)));
      // Le type de mesure est rappelé sous le nom : sans lui, une ligne à deux
      // colonnes au milieu de lignes à trois désoriente. Tu par prudence quand
      // la mesure est inconnue — on ne nomme pas ce qu'on ne sait pas.
      if (g.libelle) tete.appendChild(el('div', 'type-mesure', g.libelle));
      // Pas de suggestion : le moteur ne parle pas encore, et inventer un chiffre
      // serait pire que de n'en montrer aucun (§3.3).
      if (exo.repos_cible_s) {
        tete.appendChild(el('div', 'repos-cible num', 'repos ' + mmss(exo.repos_cible_s)));
      }
      bloc.appendChild(tete);

      var classeGrille = ' grille g-' + g.mesure;
      var entetes = el('div', 'cols-seance' + classeGrille);
      entetes.appendChild(el('span', '', ''));
      entetes.appendChild(el('span', 'droite', 'PRÉC.'));
      champs.forEach(function (c) { entetes.appendChild(el('span', 'centre', c.entete)); });
      if (g.effort) entetes.appendChild(el('span', 'centre', 'EFFORT'));
      entetes.appendChild(el('span', 'centre', ''));
      bloc.appendChild(entetes);

      var prec = vue.precedent(exo.exercise_slug);
      var nTravail = 0;

      exo.series.forEach(function (serie, iSerie) {
        if ((serie.type_serie || 'travail') === 'travail') nTravail++;
        var eti = etiquetteSerie(serie.type_serie, nTravail);
        var f = vue.fantome(iExo, iSerie);

        var ligne = el('div', 'ligne-serie');
        var fond = el('div', 'glisse-fond', 'Supprimer');
        var rangee = el('div', 'serie' + classeGrille + (serie.validee_a ? ' faite' : ''));

        var no = el('button', 'no-serie ' + eti.classe, eti.texte);
        no.type = 'button';
        no.addEventListener('click', function () { vue.surNumero(iExo, iSerie); });
        rangee.appendChild(no);

        var ligneP = prec && prec.series ? prec.series[iSerie] : null;
        rangee.appendChild(el('div', 'prec num', M().formatPrecedent(ligneP, g.mesure)));

        // Une seule boucle pour les quatre gabarits : le champ porte sa colonne,
        // son unité et son facteur de conversion. La vue ne sait rien de la
        // différence entre une seconde et un kilomètre.
        champs.forEach(function (c, iChamp) {
          rangee.appendChild(champSerie(
            (iChamp === 0 ? 'ch-serie' : 'rp-serie') + ' num',
            enUniteDeSaisie(serie[c.cle], c.facteur),
            enUniteDeSaisie(f[c.cle], c.facteur),
            c.unite,
            function (v) { vue.surChamp(iExo, iSerie, g.champs[iChamp], v); }));
        });

        if (g.effort) {
          var eff = el('button', 'eff-serie num' + (texteEffort(serie) ? ' plein' : ''), texteEffort(serie));
          eff.type = 'button';
          eff.addEventListener('click', function () { vue.surEffort(iExo, iSerie); });
          rangee.appendChild(eff);
        }

        var ok = el('button', 'ok-serie');
        ok.type = 'button';
        ok.setAttribute('aria-label', serie.validee_a ? 'Dévalider' : 'Valider');
        var v = svg('svg', null, { viewBox: '0 0 24 24' });
        v.appendChild(svg('path', null, { d: 'M5 13l4 4L19 7' }));
        ok.appendChild(v);
        ok.addEventListener('click', function () { vue.surValider(iExo, iSerie); });
        rangee.appendChild(ok);

        ligne.appendChild(rangee);
        ligne.appendChild(fond);
        brancherGlissement(ligne, function () { vue.surSupprimerSerie(iExo, iSerie); });
        bloc.appendChild(ligne);
      });

      var ajout = el('div', 'ajout-serie');
      var b = el('button', '', '+ Série');
      b.type = 'button';
      b.addEventListener('click', function () { vue.surAjoutSerie(iExo); });
      ajout.appendChild(b);
      bloc.appendChild(ajout);

      cible.appendChild(bloc);
    });
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
    h.appendChild(el('span', 'repos-g num', mmss(vue.secondes)));

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
      var sup = el('button', 'danger', 'Supprimer la série');
      sup.type = 'button';
      sup.addEventListener('click', vue.surSupprimer);
      menu.appendChild(sup);
      cible.appendChild(menu);
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

  function rendreFeuilleFin(cible, vue) {
    vider(cible);
    var t = el('div', 'feuille-t', 'Terminer la séance');
    t.appendChild(el('em', '', vue.compte.validees + ' série' +
      (vue.compte.validees > 1 ? 's' : '') + ' enregistrée' +
      (vue.compte.validees > 1 ? 's' : '')));
    cible.appendChild(t);

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

  function geste(texte, titre, desactive, surClic) {
    var b = el('button', 'geste', texte);
    b.type = 'button';
    b.setAttribute('aria-label', titre);
    b.title = titre;
    b.disabled = !!desactive;
    if (!desactive) b.addEventListener('click', surClic);
    return b;
  }

  // La liste des exercices de l'éditeur. Boutons monter/descendre, PAS de
  // glissement tactile : le geste le plus fragile du projet appartient au
  // commit « déviation », et il a déjà coûté trois chantiers sur le retour.
  //
  // ⚠️ AUCUN CHAMP DE CHARGE. Trois champs, et trois seulement : séries, reps
  // visées, repos cible. La routine porte la structure, le moteur décide du
  // poids (ECRAN-SAISIE-V1 §1.1).
  function rendreExosRoutine(cible, exercices, nommer, vue) {
    vider(cible);
    var v = vue || {};
    var liste = exercices || [];

    if (!liste.length) {
      cible.appendChild(el('p', 'vide', 'Aucun exercice. Ajoute le premier ci-dessous.'));
      return;
    }

    liste.forEach(function (e, i) {
      var carte = el('div', 'exo-routine');

      var haut = el('div', 'exo-routine-haut');
      haut.appendChild(el('span', 'exo-routine-nom', nommer(e.exercise_slug)));
      var gestes = el('div', 'exo-routine-gestes');
      gestes.appendChild(geste('\u2191', 'Monter', i === 0, function () { v.surMonter(i); }));
      gestes.appendChild(geste('\u2193', 'Descendre', i === liste.length - 1, function () { v.surDescendre(i); }));
      gestes.appendChild(geste('\u2715', 'Retirer', false, function () { v.surRetirer(i); }));
      haut.appendChild(gestes);
      carte.appendChild(haut);

      var champs = el('div', 'exo-routine-champs');
      champs.appendChild(champNombre('Séries', e.series,
        { min: R().SERIES_MIN, max: R().SERIES_MAX },
        function (val) { v.surChamp(i, 'series', val); }));
      champs.appendChild(champNombre('Reps visées', e.reps_visees,
        { min: R().REPS_MIN, max: R().REPS_MAX, placeholder: '\u2014' },
        function (val) { v.surChamp(i, 'reps_visees', val); }));
      champs.appendChild(champNombre('Repos (s)', e.repos_cible_s,
        { min: R().REPOS_MIN, max: R().REPOS_MAX, placeholder: '\u2014' },
        function (val) { v.surChamp(i, 'repos_cible_s', val); }));
      carte.appendChild(champs);

      cible.appendChild(carte);
    });
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
    message: message
  };

  racine.THRendu = {
    rendreBandeauSeance: rendreBandeauSeance,
    rendreBlocsSeance: rendreBlocsSeance,
    rendreRepos: rendreRepos,
    rendreFeuilleSerie: rendreFeuilleSerie,
    rendreFeuilleFin: rendreFeuilleFin,
    mmss: mmss,
    etiquetteSerie: etiquetteSerie,
    texteEffort: texteEffort,
    rendreListeRoutines: rendreListeRoutines,
    rendreExosRoutine: rendreExosRoutine,
    rendreResultatsExo: rendreResultatsExo,
    el: el,
    vider: vider,
    dateCourte: dateCourte,
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
    message: message
  };
})(typeof self !== 'undefined' ? self : this);
