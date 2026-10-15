// v2/js/deraille.js — la semaine qui déraille (chantier 99, MOTEUR §9.24).
//
// Un programme à jours prévus (`routines.jours`, v2_084) ; une routine prévue un jour passé de la semaine n'a pas eu
// lieu. À l'ouverture de l'app, une carte, sans reproche, qui parle du plan (« Jambes n'a pas eu lieu mardi. ») et
// propose : décaler la suite, répartir ses séries dans la semaine, ou garder la séance du jour. En fin de semaine :
// ajouter un exercice à la séance du jour, ou non.
//
// ⚠️ LA RÉFÉRENCE EST TOUJOURS LE PROGRAMME (décision du 15/10/2026, « un fil ») : les séries que prévoient ses
// routines, jamais l'historique. Le coach ne dit jamais « moins que d'habitude » et ne propose jamais plus que ce que
// prévoit la routine manquée. La « semaine » = les routines qui ont un jour.
//
// ⚠️ IL LIT CE QUI EXISTE : la structure d'une routine et ses muscles (`Moteur.structureDeRoutine`), la durée
// (`Moteur.dureeEstimee`), le volume pondéré (`Semaine.volumeParMuscle`) ; ce qui a été fait cette semaine vient de
// `faits.js` (`semaineDuProgramme`).
//
// L'entrée : `{ jour: 'AAAA-MM-JJ', debutant, dureeMax_s, routines: [{ id, nom, jours, exercices }], catalogue: {slug:
// exo}, seances: [{ jour, routine_id, slugs }], volume: { muscle: séries faites cette semaine }, etat }`, `etat` étant
// ce que la personne a décidé cette semaine (`{ lundi, questions: { cle: choix }, planning, ajouts }`) ou null.
// Pur : aucun DOM, aucun réseau, aucun stockage, aucune horloge.

(function (racine) {
  'use strict';

  function Moteur() { return racine.THMoteur; }
  function Semaine() { return racine.THSemaine; }
  function Modele() { return racine.THModele; }

  var NOMS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  // Récupération (décision 3) : en jours du calendrier, sans l'heure. J+2 ; débutant (questionnaire) : J+3.
  var ECART = 2, ECART_DEBUTANT = 3;
  // Répartir dans une séance qui travaille déjà le muscle : il reste SOUS 10 séries dans la séance (15/10/2026).
  var SOUS_SERIES = 10;
  var PREFIXE = /^(Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche) — /;

  // ── Les jours ────────────────────────────────────────────────────────────
  function numero(j) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(j || ''));
    return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5) : null;
  }
  function jourDeSemaine(n) { return ((new Date(n * 864e5).getUTCDay() + 6) % 7) + 1; }   // 1 = lundi
  function civil(n) { return new Date(n * 864e5).toISOString().slice(0, 10); }
  function lundiDe(j) { var n = numero(j); return n === null ? null : civil(n - jourDeSemaine(n) + 1); }

  // Le jour d'une routine écrite par le générateur : le préfixe exact « <Jour> — » (la règle de v2_084).
  function jourDuNom(nom) {
    var m = PREFIXE.exec(String(nom || ''));
    return m ? [NOMS.indexOf(m[1].toLowerCase()) + 1] : null;
  }
  // Le nom montré : sans le préfixe du jour (« Lundi — Jambes » → « Jambes »).
  function nomCourt(nom) { return String(nom || '').replace(PREFIXE, '') || String(nom || ''); }
  function joursValides(j) {
    if (!Array.isArray(j) || !j.length) return null;
    var ok = j.map(Number).filter(function (x) { return x >= 1 && x <= 7 && Math.floor(x) === x; });
    return ok.length === j.length ? ok.sort() : null;
  }

  // ── Le programme ─────────────────────────────────────────────────────────
  function structure(r, cat) { return Moteur().structureDeRoutine(r.exercices || [], cat || {}); }
  function primaires(st) {
    var m = {};
    st.forEach(function (e) { if (e.tr > 0) e.prim.forEach(function (x) { m[x] = true; }); });
    return Object.keys(m);
  }
  function fatigues(st) {
    var m = {};
    st.forEach(function (e) { if (e.tr > 0) e.prim.concat(e.stab).forEach(function (x) { m[x] = true; }); });
    return m;
  }
  function seriesDe(st) { return st.reduce(function (t, e) { return t + (e.tr || 0); }, 0); }
  // Le volume prévu, par la règle du volume (1, ½, ¼) : une série de travail par ligne prévue.
  function volumePrevu(placements, parId, cat) {
    var series = [];
    placements.forEach(function (p) {
      (parId[p.routine].exercices || []).forEach(function (e) {
        (e.series || []).forEach(function (s) {
          if (Modele().estTravail(s)) series.push({ exercise_slug: e.exercise_slug, type_serie: 'travail' });
        });
      });
    });
    var liste = Object.keys(cat || {}).map(function (k) { return Object.assign({ slug: k }, cat[k]); });
    var v = {};
    Semaine().volumeParMuscle(series, liste).forEach(function (x) { v[x.muscle] = x.series; });
    return v;
  }

  // Le volume d'une structure de séance, par la règle du volume (1, ½, ¼ par série de travail).
  function volumeDeStructure(stc, cat) {
    var series = [];
    stc.forEach(function (e) { for (var t = 0; t < (e.tr || 0); t++) series.push({ exercise_slug: e.slug, type_serie: 'travail' }); });
    var liste = Object.keys(cat || {}).map(function (k) { return Object.assign({ slug: k }, cat[k]); });
    var v = {};
    Semaine().volumeParMuscle(series, liste).forEach(function (y) { v[y.muscle] = y.series; });
    return v;
  }

  // Les placements de la semaine : la routine et son jour, ou le planning décidé (« la suite se décale »).
  function placementsDe(routines, etat) {
    var base = [];
    routines.forEach(function (r) { (r.jours || []).forEach(function (j) { base.push({ routine: r.id, jour: j }); }); });
    var ids = {};
    routines.forEach(function (r) { ids[r.id] = true; });
    var p = etat && Array.isArray(etat.planning) ? etat.planning.filter(function (x) { return ids[x.routine]; }) : base;
    return p.slice().sort(function (a, b) { return a.jour - b.jour; })
      .map(function (x, i) { return { id: i, routine: x.routine, jour: x.jour }; });
  }

  function seriesTexte(n) { return Modele().nombre(n) + ' série' + (n >= 2 ? 's' : ''); }

  // ── La règle de récupération ─────────────────────────────────────────────
  // `a`, `b` : `{ n, prim }`. Un conflit : un muscle principal en commun à moins de `ecart` jours.
  function conflit(a, b, ecart) {
    if (Math.abs(a.n - b.n) >= ecart) return false;
    return a.prim.some(function (m) { return b.prim.indexOf(m) >= 0; });
  }

  // ── La carte ─────────────────────────────────────────────────────────────
  function semaineQuiDeraille(e) {
    var x = e || {};
    var auj = numero(x.jour);
    if (auj === null) return null;
    var cat = x.catalogue || {};
    var routines = (x.routines || []).filter(function (r) { return r && r.id && joursValides(r.jours); })
      .map(function (r) { return Object.assign({}, r, { jours: joursValides(r.jours) }); });
    // Décision 1 : seulement avec un programme à jours prévus.
    if (!routines.length) return null;
    var lundi = auj - jourDeSemaine(auj) + 1;
    var etat = x.etat && x.etat.lundi === civil(lundi) ? x.etat : null;
    var questions = (etat && etat.questions) || {};
    var parId = {}, st = {};
    routines.forEach(function (r) { parId[r.id] = r; st[r.id] = structure(r, cat); });
    var ecart = x.debutant ? ECART_DEBUTANT : ECART;
    var jAuj = jourDeSemaine(auj);
    var placements = placementsDe(routines, etat);

    // Les séances faites : de la semaine (pour « a eu lieu ») et des jours d'avant (pour la récupération).
    var faites = (x.seances || []).map(function (s) {
      var n = numero(s.jour);
      var prim = {};
      (s.slugs || []).forEach(function (sl) { ((cat[sl] || {}).muscles_primaires || []).forEach(function (m) { prim[m] = true; }); });
      return { n: n, routine: s.routine_id || null, prim: Object.keys(prim) };
    }).filter(function (s) { return s.n !== null && s.n <= auj; });
    var semaine = faites.filter(function (s) { return s.n >= lundi; });

    // Les séances manquées : un placement d'un jour passé de la semaine, sans séance de sa routine cette semaine.
    var faitesParRoutine = {};
    semaine.forEach(function (s) { if (s.routine) faitesParRoutine[s.routine] = (faitesParRoutine[s.routine] || 0) + 1; });
    var manquees = [];
    placements.forEach(function (p) {
      if (p.jour >= jAuj) return;
      if (faitesParRoutine[p.routine] > 0) { faitesParRoutine[p.routine]--; return; }
      manquees.push(p);
    });
    var cle = function (p) { return p.routine + '@' + p.jour; };
    // Décision 7 : une seule fois par séance manquée.
    var ouvertes = manquees.filter(function (p) { return !questions[cle(p)]; });
    if (!ouvertes.length) return null;

    // Le retard par muscle : ce que prévoit le programme cette semaine, moins ce qui est fait.
    var prevu = volumePrevu(placementsDe(routines, null), parId, cat);
    var fait = x.volume || {};
    var retard = function (m) { return (prevu[m] || 0) - (fait[m] || 0); };
    var retardDe = function (prims) { return prims.reduce(function (r, m) { return Math.max(r, retard(m)); }, -Infinity); };
    // Deux séances manquées : une seule question, sur le muscle le plus en retard.
    var M = ouvertes.slice().sort(function (a, b) {
      return retardDe(primaires(st[b.routine])) - retardDe(primaires(st[a.routine])) || b.jour - a.jour;
    })[0];
    var rM = parId[M.routine];
    var stM = st[M.routine];
    var total = seriesDe(stM);
    var duJour = placements.filter(function (p) { return p.jour === jAuj; })[0] || null;
    var apres = placements.filter(function (p) { return p.jour > jAuj; });
    var evenement = function (p, n) { return { n: n, prim: primaires(st[p.routine]) }; };
    var base = {
      cles: ouvertes.map(cle), manquee: { routine: rM.id, nom: nomCourt(rM.nom), jour: M.jour, jourNom: NOMS[M.jour - 1] },
      titre: nomCourt(rM.nom) + ' n\'a pas eu lieu ' + NOMS[M.jour - 1] + '.'
    };

    // Décision 4 : un exercice de la routine manquée pour une séance — il ne recharge pas ce que la séance fatigue
    // déjà (principaux et stabilisateurs), respecte la récupération et tient dans la durée habituelle.
    var autresEvenements = function (sauf) {
      var ev = faites.map(function (f) { return { n: f.n, prim: f.prim }; });
      placements.forEach(function (p) {
        if (p.jour < jAuj || p === sauf) return;
        ev.push(evenement(p, lundi + p.jour - 1));
      });
      return ev;
    };
    // Règle corrigée du 15/10/2026 : dans une séance qui travaille DÉJÀ le muscle (un muscle principal en commun),
    // des séries de la routine manquée tant que ce muscle reste sous 10 séries dans la séance (séries pondérées comme
    // le relevé), sans dupliquer un mouvement déjà présent (même exercice, ou même `mouvement` au catalogue) ; dans
    // une séance d'un autre groupe, aucun exercice dont les principaux ou stabilisateurs chargent ce que la séance
    // fatigue déjà. Toujours : la récupération en jours, la durée habituelle. Plusieurs exercices par séance ; un
    // exercice peut n'y mettre qu'une partie de ses séries. Rend la liste des ajouts de la séance `p`.
    var choisirPour = function (p, pris, ajouts) {
      var stP = st[p.routine];
      var charge = fatigues(stP);
      var primP = {};
      primaires(stP).forEach(function (m) { primP[m] = true; });
      var n = lundi + p.jour - 1;
      var ev = autresEvenements(p).concat(ajouts.map(function (a) { return { n: lundi + a.jour - 1, prim: a.prim }; }));
      var dans = stP.slice();                       // la séance, avec ce qui y est déjà ajouté
      // Un mouvement déjà présent : le même exercice, ou un de ses frères (`Modele.freresDe`, même `mouvement`).
      var presents = function (slug) {
        var freres = Modele().freresDe(cat, slug);
        return dans.some(function (e) { return e.tr > 0 && (e.slug === slug || freres.indexOf(e.slug) >= 0); });
      };
      var sortie = [];
      for (;;) {
        var cands = [];
        stM.forEach(function (ex, i) {
          if (!(ex.tr > 0) || pris[i] || !ex.prim.length || presents(ex.slug)) return;
          var memeGroupe = ex.prim.some(function (m) { return primP[m]; });
          if (!memeGroupe && ex.prim.concat(ex.stab).some(function (m) { return charge[m]; })) return;
          if (ev.some(function (o) { return conflit({ n: n, prim: ex.prim }, o, ecart); })) return;
          // Le plus de séries qui tiennent (jamais plus que la routine manquée n'en prévoit).
          for (var k = ex.tr; k >= 1; k--) {
            var essai = dans.concat([Object.assign({}, ex, { tr: k, ch: 0, deg: 0 })]);
            if (x.dureeMax_s > 0 && Moteur().dureeEstimee(essai) > x.dureeMax_s) continue;
            if (memeGroupe) {
              var v = volumeDeStructure(essai, cat);
              if (ex.prim.some(function (m) { return primP[m] && (v[m] || 0) >= SOUS_SERIES; })) continue;
            }
            cands.push({ ex: ex, i: i, k: k });
            return;
          }
        });
        if (!cands.length) break;
        cands.sort(function (a, b) { return retardDe(b.ex.prim) - retardDe(a.ex.prim) || a.i - b.i; });
        var c = cands[0];
        pris[c.i] = true;
        dans.push(Object.assign({}, c.ex, { tr: c.k, ch: 0, deg: 0 }));
        var ligne = (rM.exercices || [])[c.i];
        sortie.push({ routine: p.routine, nomRoutine: nomCourt(parId[p.routine].nom), jour: p.jour, jourNom: NOMS[p.jour - 1],
                      slug: c.ex.slug, i: c.i, series: c.k, prim: c.ex.prim,
                      nom: (cat[c.ex.slug] || {}).nom || c.ex.slug, depuis: NOMS[M.jour - 1],
                      exercice: travailSeulement(ligne, c.k) });
      }
      return sortie;
    };

    // Décision 5 : fin de semaine, plus la place de décaler — la séance du jour seulement.
    if (!apres.length) {
      if (!duJour) return null;
      var a1 = choisirPour(duJour, {}, [])[0];   // décision 5 : un exercice
      if (!a1) return null;
      var mF = a1.prim.slice().sort(function (p, q) { return retard(q) - retard(p); })[0];
      var phrase = Semaine().libelleMuscle(mF) + ' : ' + seriesTexte(fait[mF] || 0) +
        ' cette semaine ; ton programme en prévoit ' + Modele().nombre(prevu[mF] || 0) + '. Ajouter ' +
        a1.series + ' série' + (a1.series > 1 ? 's' : '') + ' de ' + a1.nom + ' à la fin de ' + a1.nomRoutine + ' ?';
      return Object.assign(base, { sorte: 'fin', phrase: phrase, ajout: a1,
        choix: [{ cle: 'ajouter', libelle: 'Ajouter' }, { cle: 'non', libelle: 'Non merci' }] });
    }

    var choix = [];
    // Décision 2-3 : « {M} aujourd'hui · la suite se décale ». Chaque séance glisse au jour libre suivant ; rien ne
    // passe la fin de la semaine ; aucun déplacement ne remet les mêmes muscles principaux trop tôt.
    var suite = [{ routine: M.routine, jour: jAuj, de: null }].concat(
      placements.filter(function (p) { return p.jour >= jAuj; })
        .map(function (p) { return { routine: p.routine, jour: p.jour, de: p.jour }; }));
    var libre = jAuj, nouveau = [], deborde = false;
    suite.forEach(function (s) {
      var j = Math.max(s.de === null ? jAuj : s.de, libre);
      if (j > 7) deborde = true;
      libre = j + 1;
      nouveau.push({ routine: s.routine, jour: j, bouge: s.de !== j });
    });
    var decalageOk = !deborde && nouveau.every(function (s) {
      if (!s.bouge) return true;
      var moi = { n: lundi + s.jour - 1, prim: primaires(st[s.routine]) };
      var autres = faites.concat(nouveau.filter(function (o) { return o !== s; }).map(function (o) {
        return { n: lundi + o.jour - 1, prim: primaires(st[o.routine]) };
      }));
      return !autres.some(function (o) { return conflit(moi, o, ecart); });
    });
    if (decalageOk) {
      // La séance manquée quitte son jour (« — » dans la bande) ; les autres jours passés restent.
      var avant = placements.filter(function (p) { return p.jour < jAuj && p.id !== M.id; })
        .map(function (p) { return { routine: p.routine, jour: p.jour }; });
      choix.push({ cle: 'decaler', libelle: nomCourt(rM.nom) + ' aujourd\'hui · la suite se décale', garde: total,
        planning: avant.concat(nouveau.map(function (s) { return { routine: s.routine, jour: s.jour }; }))
          .sort(function (a, b) { return a.jour - b.jour; }) });
    }
    // Décision 4 : « Répartir ses séries dans la semaine ».
    var pris = {}, ajouts = [];
    placements.filter(function (p) { return p.jour >= jAuj; }).forEach(function (p) {
      ajouts = ajouts.concat(choisirPour(p, pris, ajouts));
    });
    if (ajouts.length) {
      choix.push({ cle: 'repartir', libelle: 'Répartir ses séries dans la semaine', ajouts: ajouts,
        garde: ajouts.reduce(function (t, a) { return t + a.series; }, 0) });
    }
    if (!choix.length) {
      // Ni décalage ni répartition : la séance du jour seulement, comme en fin de semaine.
      if (!duJour) return null;
      var a2 = choisirPour(duJour, {}, [])[0];
      if (!a2) return null;
      return Object.assign(base, { sorte: 'fin', ajout: a2,
        phrase: 'Ajouter ' + a2.series + ' série' + (a2.series > 1 ? 's' : '') + ' de ' + a2.nom + ' à la fin de ' +
          a2.nomRoutine + ' ?',
        choix: [{ cle: 'ajouter', libelle: 'Ajouter' }, { cle: 'non', libelle: 'Non merci' }] });
    }
    choix.push({ cle: 'garder', garde: 0,
      libelle: duJour ? 'Garder ' + nomCourt(parId[duJour.routine].nom) + ', comme prévu' : 'Garder la semaine, comme prévue' });
    // Le coach met en avant celui qui garde le plus de séries de la routine manquée (à égalité, le décalage).
    var avantChoix = choix.filter(function (c) { return c.cle !== 'garder'; })
      .sort(function (a, b) { return b.garde - a.garde; })[0];
    avantChoix.avant = true;
    var pourquoi = avantChoix.garde >= total
      ? 'Mis en avant : il garde les ' + total + ' séries de ' + nomCourt(rM.nom) + '.'
      : 'Mis en avant : il garde ' + avantChoix.garde + ' des ' + total + ' séries de ' + nomCourt(rM.nom) + '.';
    return Object.assign(base, { sorte: 'choix', choix: choix, pourquoi: pourquoi });
  }

  // Une ligne de routine, réduite à ses séries de travail : la répartition reprend les séries que la routine prévoit,
  // jamais plus.
  function travailSeulement(ligne, k) {
    if (!ligne) return null;
    return { exercise_slug: ligne.exercise_slug, repos_cible_s: ligne.repos_cible_s === undefined ? null : ligne.repos_cible_s,
             groupe_superset: null, note: null,
             series: (ligne.series || []).filter(function (s) { return Modele().estTravail(s); })
               .slice(0, k === undefined ? undefined : k).map(function (s) { return Object.assign({}, s); }) };
  }

  // ── Le geste : ce que la personne décide, pour cette semaine seulement ──────
  // Rend le nouvel état de la semaine. Toutes les séances manquées ouvertes sont marquées : la question n'est posée
  // qu'une fois (décision 7).
  function decider(etat, carte, cleChoix, jour) {
    var lundi = lundiDe(jour);
    var e = etat && etat.lundi === lundi ? etat : { lundi: lundi, questions: {}, planning: null, ajouts: [] };
    var n = { lundi: lundi, questions: Object.assign({}, e.questions), planning: e.planning || null,
              ajouts: (e.ajouts || []).slice() };
    (carte.cles || []).forEach(function (c) { n.questions[c] = cleChoix; });
    var c = (carte.choix || []).filter(function (x) { return x.cle === cleChoix; })[0];
    if (cleChoix === 'decaler' && c) n.planning = c.planning;
    if (cleChoix === 'repartir' && c) n.ajouts = n.ajouts.concat(c.ajouts.map(ajoutGarde));
    if (cleChoix === 'ajouter' && carte.ajout) n.ajouts.push(ajoutGarde(carte.ajout));
    return n;
  }
  function ajoutGarde(a) {
    return { routine: a.routine, jour: a.jour, slug: a.slug, series: a.series, depuis: a.depuis, exercice: a.exercice };
  }

  // ── Le choix en base (`semaine_choix`, v2_085) ────────────────────────────
  // Une ligne par séance manquée de la carte : `{ user_id, semaine (lundi), routine_id, choix, detail, cree_le }`.
  // La séance de la question porte le détail (le planning décalé, les exercices ajoutés) ; les autres, seulement leur
  // jour (la question n'est posée qu'une fois). `maintenant` : l'instant ISO, passé.
  function lignesDuChoix(carte, cleChoix, jour, userId, maintenant) {
    var lundi = lundiDe(jour);
    var c = (carte.choix || []).filter(function (x) { return x.cle === cleChoix; })[0];
    return (carte.cles || []).map(function (k) {
      var i = k.lastIndexOf('@'), rid = k.slice(0, i), j = Number(k.slice(i + 1));
      var d = { jour: j };
      if (rid === carte.manquee.routine && j === carte.manquee.jour) {
        if (cleChoix === 'decaler' && c) d.planning = c.planning;
        if (cleChoix === 'repartir' && c) d.ajouts = c.ajouts.map(ajoutGarde);
        if (cleChoix === 'ajouter' && carte.ajout) d.ajouts = [ajoutGarde(carte.ajout)];
      }
      return { user_id: userId, semaine: lundi, routine_id: rid, choix: cleChoix, detail: d, cree_le: maintenant };
    });
  }
  // L'état de la semaine de `jour`, relu de ces lignes (dans l'ordre où elles ont été faites), ou null.
  function etatDepuisLignes(lignes, jour) {
    var lundi = lundiDe(jour);
    var ls = (lignes || []).filter(function (l) { return l && String(l.semaine || '').slice(0, 10) === lundi; })
      .sort(function (a, b) { return String(a.cree_le || '').localeCompare(String(b.cree_le || '')); });
    if (!ls.length) return null;
    var e = { lundi: lundi, questions: {}, planning: null, ajouts: [] };
    ls.forEach(function (l) {
      var d = l.detail || {};
      e.questions[l.routine_id + '@' + d.jour] = l.choix;
      if (Array.isArray(d.planning)) e.planning = d.planning;
      if (Array.isArray(d.ajouts)) e.ajouts = e.ajouts.concat(d.ajouts);
    });
    return e;
  }

  // Les exercices ajoutés à une routine pour aujourd'hui (la séance qui démarre), avec leur mention.
  function ajoutsDuJour(etat, routineId, jour) {
    if (!etat || etat.lundi !== lundiDe(jour)) return [];
    var j = jourDeSemaine(numero(jour));
    return (etat.ajouts || []).filter(function (a) { return a.routine === routineId && a.jour === j && a.exercice; })
      .map(function (a) { return { exercice: a.exercice, mention: 'séance manquée de ' + a.depuis }; });
  }

  // La semaine telle qu'elle se montre (la bande de la carte) : un jour, sa routine.
  function bandeDeLaSemaine(routines, etat, jour) {
    var lundi = lundiDe(jour);
    var rs = (routines || []).filter(function (r) { return r && joursValides(r.jours); })
      .map(function (r) { return Object.assign({}, r, { jours: joursValides(r.jours) }); });
    var p = placementsDe(rs, etat && etat.lundi === lundi ? etat : null);
    var nom = {};
    rs.forEach(function (r) { nom[r.id] = nomCourt(r.nom); });
    return NOMS.map(function (n, i) {
      var ici = p.filter(function (x) { return x.jour === i + 1; }).map(function (x) { return nom[x.routine]; });
      return { jour: n.slice(0, 3), routine: ici.join(' · ') || null };
    });
  }

  var api = {
    ECART: ECART, ECART_DEBUTANT: ECART_DEBUTANT,
    jourDuNom: jourDuNom, nomCourt: nomCourt, lundiDe: lundiDe,
    semaineQuiDeraille: semaineQuiDeraille, decider: decider, ajoutsDuJour: ajoutsDuJour,
    lignesDuChoix: lignesDuChoix, etatDepuisLignes: etatDepuisLignes,
    bandeDeLaSemaine: bandeDeLaSemaine
  };
  racine.THDeraille = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
