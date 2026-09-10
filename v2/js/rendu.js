// v2/js/rendu.js — rendu DOM.
//
// Tout est construit par createElement / textContent : aucune interpolation de
// chaîne dans du HTML. Les titres de séance, noms de salle et notes viennent de
// la base et sont donc du texte utilisateur — ils ne doivent jamais être
// interprétés comme du balisage.

(function (racine) {
  'use strict';

  var doc = racine.document;

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

  // 122.5 -> « 122,5 » · 60 -> « 60 » (virgule décimale française)
  function nombre(v) {
    if (v === null || v === undefined || v === '') return '';
    var n = Number(v);
    if (!isFinite(n)) return '';
    return String(Math.round(n * 100) / 100).replace('.', ',');
  }

  function dateCourte(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // « 122,5 kg × 5 » · « 30 s » · « 400 m » selon ce qui est renseigné.
  function mesure(serie) {
    var bouts = [];
    if (serie.charge_kg !== null && serie.charge_kg !== undefined) bouts.push(nombre(serie.charge_kg) + ' kg');
    if (serie.reps !== null && serie.reps !== undefined) bouts.push(bouts.length ? '× ' + serie.reps : serie.reps + ' reps');
    if (serie.duree_s) bouts.push(serie.duree_s + ' s');
    if (serie.distance_m) bouts.push(nombre(serie.distance_m) + ' m');
    return bouts.length ? bouts.join(' ') : '—';
  }

  function rendreListeSeances(cible, resumes, surChoix) {
    vider(cible);
    if (!resumes.length) {
      cible.appendChild(el('p', 'vide', 'Aucune séance sur ce compte.'));
      return;
    }
    resumes.forEach(function (r) {
      var carte = el('button', 'seance');
      carte.type = 'button';
      var haut = el('div', 'seance-haut');
      haut.appendChild(el('span', 'seance-titre', r.titre));
      haut.appendChild(el('span', 'seance-date', dateCourte(r.debut)));
      carte.appendChild(haut);
      var meta = r.nbExercices + ' exercice' + (r.nbExercices > 1 ? 's' : '') +
                 ' · ' + r.nbSeriesTravail + ' série' + (r.nbSeriesTravail > 1 ? 's' : '') + ' de travail';
      carte.appendChild(el('div', 'seance-meta', meta));
      if (r.salle) carte.appendChild(el('div', 'seance-salle', r.salle));
      carte.addEventListener('click', function () { surChoix(r.id); });
      cible.appendChild(carte);
    });
  }

  function rendreBloc(bloc) {
    var section = el('section', 'bloc' + (bloc.superset ? ' superset' : ''));

    var exos = el('div', 'exos');
    bloc.exercices.forEach(function (x) {
      var ligne = el('div', 'exo');
      ligne.appendChild(el('span', 'lettre', x.lettre));
      ligne.appendChild(el('span', 'nom', x.nom));
      exos.appendChild(ligne);
    });
    section.appendChild(exos);
    section.appendChild(el('div', 'resume', bloc.resume));

    var entetes = el('div', 'entetes');
    entetes.appendChild(el('span', null, ''));
    entetes.appendChild(el('span', null, 'Série'));
    entetes.appendChild(el('span', null, 'Charge'));
    section.appendChild(entetes);

    bloc.series.forEach(function (s) {
      var ligne = el('div', 'serie' + (s.estTravail ? '' : ' hors-travail'));
      ligne.appendChild(el('span', 'rang', s.rang));
      ligne.appendChild(el('span', 'tag' + (s.estTravail ? '' : ' chauffe'), s.etiquette));
      ligne.appendChild(el('span', 'mesure', mesure(s)));
      section.appendChild(ligne);
    });

    return section;
  }

  function rendreDetail(cible, seance, blocs) {
    vider(cible);
    var tete = el('div', 'detail-tete');
    tete.appendChild(el('h2', null, (seance && seance.titre) || 'Séance'));
    var sousTitre = [dateCourte(seance && seance.debut), (seance && (seance.salle_norme || seance.salle)) || '']
      .filter(Boolean).join(' · ');
    if (sousTitre) tete.appendChild(el('span', 'detail-meta', sousTitre));
    cible.appendChild(tete);

    if (!blocs.length) {
      cible.appendChild(el('p', 'vide', 'Aucune série sur cette séance.'));
      return;
    }
    blocs.forEach(function (b) { cible.appendChild(rendreBloc(b)); });
  }

  function message(cible, texte, genre) {
    vider(cible);
    cible.appendChild(el('p', genre === 'erreur' ? 'erreur' : 'vide', texte));
  }

  racine.THRendu = {
    el: el,
    vider: vider,
    nombre: nombre,
    dateCourte: dateCourte,
    mesure: mesure,
    rendreListeSeances: rendreListeSeances,
    rendreBloc: rendreBloc,
    rendreDetail: rendreDetail,
    message: message
  };
})(typeof self !== 'undefined' ? self : this);
