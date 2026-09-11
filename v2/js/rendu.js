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
  // La colonne de droite est REVENUE (chantier 17) : « nom | palier × reps ».
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
      if (e.palier !== null && e.palier !== undefined) {
        var val = el('span', 'apercu-val', nombreFr(e.palier));
        if (e.reps !== null && e.reps !== undefined) {
          val.appendChild(el('em', null, '\u00d7 ' + e.reps));
        }
        ligne.appendChild(val);
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

  function message(cible, texte, genre) {
    vider(cible);
    cible.appendChild(el('p', genre === 'erreur' ? 'erreur' : 'vide', texte));
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
