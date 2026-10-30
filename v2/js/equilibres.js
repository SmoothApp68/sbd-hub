// v2/js/equilibres.js — « Ta semaine et tes équilibres » : le socle des cartes de la semaine et les cartes d'équilibre
// (chantier 188-1, MOTEUR §9.27).
//
// Le coach voit chaque séance, jamais la semaine ni le programme. Ce module lit le PROGRAMME ET L'HISTORIQUE ensemble et
// rend des cartes : un fait (« 1 série de tirage pour 1,8 de poussée »), le repère d'une pratique de coach, les causes en
// faits (« D'où ça vient ») et, pour chacune, une proposition. Rien ne s'applique sans un geste, rien ne s'écrit ici.
//
// ⚠️ DOCTRINE (non négociable)
//   · Un FAIT, jamais un reproche : pas de « tu as manqué », pas de total de séances, pas de série de semaines, pas de durée
//     d'absence. Une séance de la routine non faite n'est nommée QUE si elle explique l'écart (elle porte le muscle).
//   · Il ne réagit qu'à UNE HABITUDE, jamais à un accident : l'écart doit être tenu sur N des 8 dernières semaines non nulles.
//     Les semaines à zéro séance sont exclues de tout calcul.
//   · Le repère est une pratique de coach, jamais un risque de blessure.
//   · AUCUN NOMBRE FIXE de séries ni d'exercices : la structure vient de la routine (de la personne ou du coach) et de la
//     séance en cours, et elle peut bouger en plus ou en moins. Rien ici ne suppose « 3 séries » ou « 5 exercices ».
//   · Les FAITS ne changent jamais selon le réglage ; le réglage décide QUAND le coach parle (habitude, nombre de cartes,
//     silence). La sécurité (fatigue, douleur, saisie aberrante) n'en dépend pas.
//   · Aucune cause devinée : une séance sans geste (`sessions.gestes = []`) ne donne ni « J'ai peu de temps » ni « Machine
//     prise » ; seul ce qui se lit (un exercice qui n'a pas eu lieu, un remplaçant du même mouvement) se déduit.
//
// ⚠️ PUR : aucune lecture du DOM, du réseau, du stockage, de l'horloge (`entree.jour`), aucune écriture. Les modules qu'il
// lit (`THModele`, `THSemaine`, `THGenerateur`, `THMoteur`) sont pris À L'APPEL.
//
// L'entrée : `{ jour: 'AAAA-MM-JJ', reglage: 'prudent'|'normal'|'franc', intention, catalogue: {slug: fiche},
//   seances: [{ id, debut, routine_id, gestes }], series: [{ session_id, exercise_slug, type_serie, douleur, … }],
//   routines: [{ id, nom, exercices: [{ exercise_slug, series: [{ type_serie }] }] }], programmeDuCoach: bool,
//   priorites: [clé], volume: { muscle: placeDeVolume }, ecartes: [slug], cartes: { cle: { r, le, refus } } }`.

(function (racine) {
  'use strict';

  function Modele() { return racine.THModele; }
  function Semaine() { return racine.THSemaine; }
  function Generateur() { return racine.THGenerateur; }
  function Moteur() { return racine.THMoteur; }
  function Routines() { return racine.THRoutines; }

  // ── LES RÉGLAGES : ce qui décide QUAND le coach parle (jamais ce qu'il constate) ─────────────────────────────
  //   habitude : sur 8 semaines non nulles, combien l'écart doit être tenu ;
  //   cartes   : combien de cartes à la fois ;
  //   silence  : semaines de silence après « Pas maintenant » (doublées après deux refus de suite).
  var REGLAGES = {
    prudent: { habitude: 6, cartes: 1, silence: 12 },
    normal:  { habitude: 5, cartes: 2, silence: 8 },
    franc:   { habitude: 4, cartes: 3, silence: 4 }
  };
  var REGLAGE_PAR_DEFAUT = 'normal';
  var SEMAINES_HABITUDE = 8;

  // ── LES SEUILS (Gemini S1-S8 du 29/10/2026) ───────────────────────────────────────────────────────────────────
  var SEUIL_TIRAGE = 0.60;          // tirage / poussée, à l'horizontale et à la verticale
  var SEUIL_CHAINE = 0.40;          // chaîne postérieure / quadriceps
  var SEMAINES_FENETRE = 12;        // les 12 dernières semaines non nulles
  var SEMAINES_MIN = 4;             // au moins 4 semaines…
  var SEANCES_MIN = 12;             // … et 12 séances, sinon rien
  var SEMAINES_ZERO = 4;            // un muscle principal à 0 série sur 4 semaines
  var PART_PRIORITE = 0.5;          // une priorité à moins de la moitié du mouvement le plus travaillé
  var FOIS_MIN = 2;                 // une cause est une habitude : au moins 2 fois…
  var PART_MIN = 0.25;              // … et au quart des occasions

  // L'ordre des familles de cartes : les jours > le temps > les équilibres et la fréquence > l'ordre. Les jours et le
  // temps arrivent en 188-2 : l'ordre est prévu ici.
  var ORDRE_DES_FAMILLES = ['jours', 'temps', 'equilibre', 'frequence', 'ordre'];

  // Les muscles principaux (l'épaule arrière et le côté compris) : un à 0 série sur 4 semaines fait une carte.
  var MUSCLES_PRINCIPAUX = ['pectoraux', 'grand_dorsal', 'deltoide_lateral', 'deltoide_posterieur', 'biceps', 'triceps',
                            'quadriceps', 'ischio_jambiers', 'fessiers'];
  var SOUS_CHAINE = ['ischio_jambiers', 'fessiers', 'bas_du_dos'];

  // Les mesures de rapport : la clé, le titre, les deux côtés (celui qui manque d'abord) et leurs noms.
  var RAPPORTS = [
    { cle: 'tp-horizontal', titre: 'Tirage et poussée, à l’horizontale', a: 'tirH', b: 'pousH', seuil: SEUIL_TIRAGE,
      nomA: 'tirage', nomB: 'poussée', majA: 'Tirage', majB: 'Poussée', repere: 'tp' },
    { cle: 'tp-vertical', titre: 'Tirage et poussée, à la verticale', a: 'tirV', b: 'pousV', seuil: SEUIL_TIRAGE,
      nomA: 'tirage', nomB: 'poussée', majA: 'Tirage', majB: 'Poussée', repere: 'tp' },
    { cle: 'chaine', titre: 'Chaîne postérieure et quadriceps', a: 'post', b: 'quad', seuil: SEUIL_CHAINE,
      nomA: 'chaîne postérieure', nomB: 'quadriceps', majA: 'Postérieure', majB: 'Quadriceps', repere: 'chaine' }
  ];

  // ── Les petits outils ───────────────────────────────────────────────────────────────────────────────────────────
  function liste(x) { return Array.isArray(x) ? x : []; }
  function contient(l, x) { return liste(l).indexOf(x) >= 0; }
  function deux(n) { return (n < 10 ? '0' : '') + n; }
  function cleDeJour(d) { return d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate()); }
  function dateDe(v) {
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      var p = v.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]);
    }
    var d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  function lundiDe(v) {
    var d = dateDe(v);
    return d ? cleDeJour(Semaine().bornesSemaine(d).lundi) : null;
  }
  // Le nombre de semaines entières entre deux jours (`a` avant `b`), par le calendrier : ni l'heure ni l'horloge.
  function semainesEntre(a, b) {
    var da = dateDe(a), db = dateDe(b);
    if (!da || !db) return null;
    var ms = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) - Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
    return Math.floor(ms / (7 * 864e5));
  }
  function nb(v, d) { return Modele().nombreTexte(v, d === undefined ? 1 : d); }
  function pluriel(n, s, p) { return n >= 2 ? (p || s + 's') : s; }
  function minuscule(t) { return t ? t.charAt(0).toLowerCase() + t.slice(1) : t; }
  function de(nom) { return /^[aeiouyéèêàâîôûh]/i.test(nom) ? 'd’' + nom : 'de ' + nom; }
  function libelleDuMuscle(m) { return minuscule(Semaine().libelleMuscle(m)); }
  function nomDe(e, slug) { return Modele().nommer(e.catalogue || {}, slug); }
  function reglageDe(e) {
    return Object.prototype.hasOwnProperty.call(REGLAGES, e && e.reglage) ? e.reglage : REGLAGE_PAR_DEFAUT;
  }

  // ── Le classement d'un exercice : tirage / poussée (horizontal, vertical), chaîne postérieure, quadriceps ─────────
  // Tirage et poussée : les définitions du générateur (`estTirage`, `estPoussee`), lues ici, pas recopiées. Le sens vient
  // du `schema_mouvement` (`Modele.sensDuMouvement`). La chaîne postérieure (soulevés, RDL, hip thrust, leg curl) : un
  // principal ischio-jambiers, ou fessiers / bas du dos sans quadriceps ; les quadriceps : un principal quadriceps sans
  // ischio-jambiers (le squat, la presse, l'extension).
  function classesDe(slug, cat) {
    var f = (cat || {})[slug];
    if (!f) return {};
    var G = Generateur(), prim = liste(f.muscles_primaires), sens = Modele().sensDuMouvement(f), c = {};
    if (G.estTirage(f)) {
      if (sens === 'horizontal') c.tirH = true;
      if (sens === 'vertical') c.tirV = true;
    } else if (G.estPoussee(slug, cat)) {
      if (sens === 'horizontal') c.pousH = true;
      if (sens === 'vertical') c.pousV = true;
    }
    var ischio = contient(prim, 'ischio_jambiers'), quad = contient(prim, 'quadriceps');
    if (ischio || (!quad && prim.some(function (m) { return contient(SOUS_CHAINE, m); }))) c.post = true;
    else if (quad) c.quad = true;
    return c;
  }

  // ── La préparation : les semaines non nulles et ce que chacune contient ─────────────────────────────────────────
  // Une séance compte si elle a au moins une série de musculation (`Semaine.estSeanceDeMusculation`) : une marche seule
  // ne fait pas une semaine d'entraînement. Les séries comptées sont les séries de travail qui portent du volume.
  function preparer(e) {
    var cat = e.catalogue || {}, S = Semaine(), M = Modele();
    var parSeance = {};
    liste(e.series).forEach(function (s) {
      if (s && s.session_id) (parSeance[s.session_id] || (parSeance[s.session_id] = [])).push(s);
    });
    var jourMax = e.jour || null;
    var lundiMax = jourMax ? lundiDe(jourMax) : null;
    var semaines = {}, seancesParId = {};
    liste(e.seances).forEach(function (s) {
      if (!s || !s.id || !s.debut) return;
      var series = parSeance[s.id] || [];
      if (!S.estSeanceDeMusculation(series, cat)) return;
      var lundi = lundiDe(s.debut);
      if (!lundi || (lundiMax && lundi > lundiMax)) return;
      var w = semaines[lundi] || (semaines[lundi] = { lundi: lundi, seances: [], comptes: { tirH: 0, pousH: 0, tirV: 0, pousV: 0, post: 0, quad: 0 },
                                                      series: [], parSlug: {} });
      var travail = series.filter(function (x) { return S.estSerieDeMusculation(x, cat[x.exercise_slug]); });
      var slugs = {};
      travail.forEach(function (x) {
        var c = classesDe(x.exercise_slug, cat);
        Object.keys(c).forEach(function (k) { w.comptes[k] += 1; });
        w.parSlug[x.exercise_slug] = (w.parSlug[x.exercise_slug] || 0) + 1;
        slugs[x.exercise_slug] = true;
      });
      w.series = w.series.concat(travail);
      var seance = { id: s.id, debut: s.debut, routine_id: s.routine_id || null, lundi: lundi, slugs: slugs,
                     gestes: liste(s.gestes), series: series };
      w.seances.push(seance);
      seancesParId[s.id] = seance;
    });
    // `volumeParMuscle` lit le catalogue en LISTE de fiches portant leur `slug` : dressée une fois.
    var fiches = Object.keys(cat).map(function (k2) { return Object.assign({ slug: k2 }, cat[k2]); });
    var nz = Object.keys(semaines).sort().reverse().map(function (k) {
      var w = semaines[k];
      w.volume = {};
      S.volumeParMuscle(w.series, fiches).forEach(function (v) { w.volume[v.muscle] = v.series; });
      return w;
    });
    return { e: e, cat: cat, semaines: nz, seancesParId: seancesParId, M: M };
  }

  // La fenêtre qui commence à la k-ième semaine non nulle (0 = la plus récente) : jusqu'à 12 semaines, valide à partir de
  // 4 semaines et 12 séances. `apres` (un lundi) : les semaines antérieures ou égales sont écartées — une carte acceptée
  // repart de zéro (voir `habitudeDe`).
  function fenetreA(prep, k) {
    var ws = prep.semaines.slice(k, k + SEMAINES_FENETRE);
    var n = ws.reduce(function (t, w) { return t + w.seances.length; }, 0);
    var c = { tirH: 0, pousH: 0, tirV: 0, pousV: 0, post: 0, quad: 0 };
    ws.forEach(function (w) { Object.keys(c).forEach(function (x) { c[x] += w.comptes[x]; }); });
    return { semaines: ws, nbSeances: n, comptes: c, valide: ws.length >= SEMAINES_MIN && n >= SEANCES_MIN };
  }

  // L'écart d'un rapport dans la fenêtre k : sous le seuil, avec de quoi comparer (un côté opposé non nul).
  function ecartDeRapport(prep, r, k) {
    var f = fenetreA(prep, k);
    if (!f.valide) return null;
    var a = f.comptes[r.a], b = f.comptes[r.b];
    if (!(b > 0)) return null;
    return { a: a, b: b, ratio: a / b, ecart: a / b < r.seuil, fenetre: f };
  }

  // Un muscle principal à 0 série sur les 4 dernières semaines non nulles de la fenêtre k.
  function ecartDeZero(prep, muscle, k) {
    var f = fenetreA(prep, k);
    if (!f.valide) return null;
    var ws = prep.semaines.slice(k, k + SEMAINES_ZERO);
    if (ws.length < SEMAINES_ZERO) return null;
    var zero = ws.every(function (w) { return !(w.volume[muscle] > 0); });
    return { ecart: zero, fenetre: f };
  }

  // ── Les priorités : séries par semaine de chaque priorité, et le couché pour comparer ───────────────────────────
  function barreDe(slug, cat) {
    var G = Generateur();
    return G.familleDeBarre ? G.familleDeBarre(slug, cat) : null;
  }
  function mouvementsSuivis(prep) {
    var M = Modele(), barres = M.BARRES.slice();
    return { barres: barres, tractions: ['tractions'].concat(M.freresDe(prep.cat, 'tractions')) };
  }
  // Séries (de la fenêtre k) par mouvement suivi : les quatre barres (la barre et ses variantes à la barre) et les tractions.
  function seriesParMouvement(prep, k) {
    var f = fenetreA(prep, k), suivis = mouvementsSuivis(prep), sortie = {}, cat = prep.cat;
    suivis.barres.forEach(function (b) { sortie[b] = 0; });
    sortie.tractions = 0;
    f.semaines.forEach(function (w) {
      Object.keys(w.parSlug).forEach(function (slug) {
        var b = barreDe(slug, cat);
        if (b) sortie[b] += w.parSlug[slug];
        if (suivis.tractions.indexOf(slug) >= 0) sortie.tractions += w.parSlug[slug];
      });
    });
    return { f: f, parMouvement: sortie, semaines: f.semaines.length };
  }
  function seriesParZone(prep, k, zone) {
    var f = fenetreA(prep, k), t = 0, z = Semaine().ZONES.filter(function (x) { return x.cle === zone; })[0];
    if (!z) return null;
    f.semaines.forEach(function (w) { z.muscles.forEach(function (m) { t += w.volume[m] || 0; }); });
    return t;
  }
  // Les priorités à la traîne dans la fenêtre k : un exercice prioritaire (barre ou tractions) à moins de la moitié des
  // séries du mouvement le plus travaillé. Rend `null` sans fenêtre valide ni priorité d'exercice.
  function prioritesATraine(prep, k) {
    var prio = liste(prep.e.priorites);
    var sm = seriesParMouvement(prep, k);
    if (!sm.f.valide || !sm.semaines) return null;
    var exercices = prio.filter(function (c) { return c === 'tractions' || contient(Modele().BARRES, c); });
    if (!exercices.length) return null;
    var plus = Object.keys(sm.parMouvement).reduce(function (m, c) { return sm.parMouvement[c] > sm.parMouvement[m] ? c : m; }, Object.keys(sm.parMouvement)[0]);
    var traine = exercices.filter(function (c) {
      return c !== plus && sm.parMouvement[plus] > 0 && sm.parMouvement[c] < PART_PRIORITE * sm.parMouvement[plus];
    });
    return { sm: sm, exercices: exercices, plus: plus, traine: traine };
  }

  // ── L'habitude : l'écart tenu sur N des 8 dernières semaines non nulles ────────────────────────────────────────
  // Pour chacune des 8 dernières semaines non nulles (k = 0 à 7), la carte est évaluée avec SA fenêtre (les 12 semaines non
  // nulles qui finissent là). `apres` : le lundi de la dernière réponse « oui » (carte acceptée, ou périmée par une autre) —
  // les semaines qui ne sont pas strictement après sont écartées : la carte repart de zéro.
  function habitudeDe(prep, evaluer, apres) {
    var tenu = 0;
    for (var k = 0; k < SEMAINES_HABITUDE; k++) {
      var w = prep.semaines[k];
      if (!w) break;
      if (apres && w.lundi <= apres) continue;
      if (evaluer(k)) tenu++;
    }
    return { tenu: tenu, sur: SEMAINES_HABITUDE };
  }

  // ── Le silence : « Pas maintenant » ────────────────────────────────────────────────────────────────────────────
  function reponseDe(e, cle) {
    var r = e.cartes && typeof e.cartes === 'object' ? e.cartes[cle] : null;
    return r && typeof r === 'object' ? r : null;
  }
  // Le silence d'une carte, en semaines : celui du réglage, DOUBLÉ après deux « Pas maintenant » de suite (`refus` ≥ 2).
  function silenceDe(reglage, rep) {
    var base = REGLAGES[reglage].silence;
    return rep && rep.refus >= 2 ? base * 2 : base;
  }
  function enSilence(e, reglage, cle) {
    var rep = reponseDe(e, cle);
    if (!rep || rep.r !== 'non') return false;
    var s = semainesEntre(rep.le, e.jour);
    return s !== null && s < silenceDe(reglage, rep);
  }
  // La valeur à écrire dans `profiles.cartes_semaine[cle]` pour une réponse. « Pas maintenant » de suite : `refus` monte ;
  // un « oui » le remet à zéro. Pur : rend la nouvelle réponse, l'appelant écrit (par la file, comme `marche_reponses`).
  function reponse(cartes, cle, r, jour) {
    var avant = cartes && typeof cartes === 'object' ? cartes[cle] : null;
    var refus = 0;
    if (r === 'non') refus = avant && avant.r === 'non' ? Math.max(1, Number(avant.refus) || 1) + 1 : 1;
    return { r: r === 'oui' ? 'oui' : 'non', le: jour, refus: refus };
  }
  // Une carte acceptée qui refait le programme PÉRIME les autres : chacune repart de zéro à partir de ce jour (`r: 'oui'`,
  // sa fenêtre d'habitude recommence). Rend `{ cle: réponse }` pour toutes les cartes données SAUF celle acceptée.
  function perimer(cles, sauf, jour) {
    var sortie = {};
    liste(cles).forEach(function (c) { if (c !== sauf) sortie[c] = { r: 'oui', le: jour, refus: 0 }; });
    return sortie;
  }

  // ── Le programme : ce que les routines prévoient ──────────────────────────────────────────────────────────────
  function seriesDeTravailDe(exo) {
    return liste(exo && exo.series).filter(function (s) { return Modele().estTravail(s); }).length;
  }
  // Séries de travail PAR SEMAINE que les routines prévoient pour une classe (`tirH`…) ou un muscle (poids 1, ½, ¼).
  function prevuPourClasse(prep, cle) {
    var t = 0;
    liste(prep.e.routines).forEach(function (r) {
      liste(r.exercices).forEach(function (x) {
        if (classesDe(x.exercise_slug, prep.cat)[cle]) t += seriesDeTravailDe(x);
      });
    });
    return t;
  }
  function prevuPourMuscle(prep, muscle) {
    var t = 0;
    liste(prep.e.routines).forEach(function (r) {
      liste(r.exercices).forEach(function (x) {
        var f = prep.cat[x.exercise_slug];
        if (!f) return;
        Semaine().musclesPonderes(f).forEach(function (p) { if (p.muscle === muscle) t += p.poids * seriesDeTravailDe(x); });
      });
    });
    return Math.round(t * 100) / 100;
  }

  // ── L'exercice candidat d'un côté : le plus fait de l'historique, jamais un écarté ni un exercice qui fait mal ─────
  function candidat(prep, predicat) {
    var e = prep.e, compte = {}, dernier = {}, mal = {};
    liste(e.series).forEach(function (s) {
      if (!s || !s.exercise_slug) return;
      if (s.douleur === true) mal[s.exercise_slug] = true;
      if (!Modele().estTravail(s) || !predicat(s.exercise_slug)) return;
      compte[s.exercise_slug] = (compte[s.exercise_slug] || 0) + 1;
      var seance = liste(e.seances).filter(function (x) { return x && x.id === s.session_id; })[0];
      var d = seance && seance.debut ? String(seance.debut) : '';
      if (!dernier[s.exercise_slug] || d > dernier[s.exercise_slug]) dernier[s.exercise_slug] = d;
    });
    var ecartes = liste(e.ecartes);
    var slugs = Object.keys(compte).filter(function (x) { return ecartes.indexOf(x) < 0 && !mal[x]; });
    slugs.sort(function (a, b) { return compte[b] - compte[a] || (dernier[a] < dernier[b] ? 1 : dernier[a] > dernier[b] ? -1 : 0) || (a < b ? -1 : 1); });
    return slugs[0] || null;
  }
  // Le nombre de séries d'un nouvel exercice : la médiane de ce que la personne en fait d'habitude (aucun nombre fixe).
  function seriesHabituelles(prep, slug) {
    var parSeance = {};
    liste(prep.e.series).forEach(function (s) {
      if (s && s.exercise_slug === slug && Modele().estTravail(s)) parSeance[s.session_id] = (parSeance[s.session_id] || 0) + 1;
    });
    var v = Object.keys(parSeance).map(function (k) { return parSeance[k]; }).sort(function (a, b) { return a - b; });
    if (!v.length) return null;
    var m = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
    return Math.max(1, Math.round(m));
  }

  // ── LES CAUSES, EN FAITS (« D'où ça vient ») ───────────────────────────────────────────────────────────────────
  // `cote` : `{ predicat(slug), nomA, nomB, classeB }` — le côté qui manque, son nom, et l'autre côté.
  function causesDe(prep, cote, c, ctx) {
    var e = prep.e, causes = [], props = [];
    var f = ctx.fenetre, ids = {};
    f.semaines.forEach(function (w) { w.seances.forEach(function (s) { ids[s.id] = s; }); });
    var seances = Object.keys(ids).map(function (k) { return ids[k]; });
    var routines = liste(e.routines);
    var nom = function (slug) { return nomDe(e, slug); };
    var exoManque = function (slug) { return cote.predicat(slug); };

    // Les séances d'une routine dans la fenêtre.
    var seancesDe = function (routineId) { return seances.filter(function (s) { return s.routine_id === routineId; }); };
    var routineDe = function (id) { return routines.filter(function (r) { return r.id === id; })[0] || null; };
    // Ce qu'un geste explique pour une séance et un exercice de la routine.
    var geste = function (s, slug, type) {
      return s.gestes.some(function (g) {
        if (!g || g.geste !== type) return false;
        return type === 'raccourci' ? contient(g.retires, slug) : g.slug === slug;
      });
    };
    var expliquee = function (s, slug) {
      return geste(s, slug, 'raccourci') || geste(s, slug, 'machine_prise') || geste(s, slug, 'remplacement') || geste(s, slug, 'retrait');
    };
    // Un remplaçant déduit : un exercice du même mouvement, présent dans la séance et absent de la routine.
    var remplacantDeduit = function (s, r, slug) {
      var freres = Modele().freresDe(prep.cat, slug);
      var horsRoutine = Object.keys(s.slugs).filter(function (x) { return !liste(r.exercices).some(function (y) { return y.exercise_slug === x; }); });
      var trouves = horsRoutine.filter(function (x) { return contient(freres, x); });
      return trouves.length === 1 ? trouves[0] : null;
    };

    // (a) Ce que les routines prévoient.
    if (!e.programmeDuCoach && routines.length && c.prevu) {
      var pa = c.prevu.a, pb = c.prevu.b;
      if (c.kind === 'rapport' && (pa > 0 || pb > 0)) {
        var cible = cibleAjout(prep, cote, seances, routines);
        causes.push({ texte: 'Tes routines prévoient ' + nb(pa) + ' ' + pluriel(pa, 'série') + ' de ' + cote.nomA + ' pour ' + nb(pb) + ' de ' +
          cote.nomB + ' par semaine.', proposition: pa < pb * ctx.seuil || pa === 0 ? cible : null });
      } else if (c.kind === 'zero') {
        if (pa === 0) {
          causes.push({ texte: 'Aucune de tes routines ne prévoit de série ' + de(cote.nomA) + '.', proposition: cibleAjout(prep, cote, seances, routines) });
        } else {
          causes.push({ texte: 'Tes routines prévoient ' + nb(pa) + ' ' + pluriel(pa, 'série') + ' ' + de(cote.nomA) + ' par semaine.', proposition: null });
        }
      }
    }

    // (b) Les exercices sautés et leur place dans la séance ; (c) les gestes ; (g) les remplacements.
    var saute = [], raccourcis = [], machines = [], remplaces = [], retraits = [];
    routines.forEach(function (r) {
      var sr = seancesDe(r.id);
      if (!sr.length) return;
      var exos = liste(r.exercices);
      exos.forEach(function (x, i) {
        var slug = x.exercise_slug;
        if (!exoManque(slug)) return;
        var n = sr.length, ncsautes = 0, nRacc = 0, nMach = 0, nMachRemp = 0, nRetrait = 0;
        var remp = {};
        sr.forEach(function (s) {
          if (s.slugs[slug]) return;
          if (geste(s, slug, 'raccourci')) { nRacc++; return; }
          if (geste(s, slug, 'machine_prise')) {
            var gm = s.gestes.filter(function (g) { return g.geste === 'machine_prise' && g.slug === slug; })[0];
            if (gm && gm.vers) nMachRemp++; else nMach++;
            return;
          }
          if (geste(s, slug, 'remplacement')) {
            var gr = s.gestes.filter(function (g) { return g.geste === 'remplacement' && g.slug === slug; })[0];
            remp[gr.vers] = (remp[gr.vers] || 0) + 1;
            return;
          }
          if (geste(s, slug, 'retrait')) { nRetrait++; return; }
          var d = s.gestes.length ? null : remplacantDeduit(s, r, slug);
          if (d) { remp[d] = (remp[d] || 0) + 1; return; }
          ncsautes++;
        });
        if (ncsautes >= FOIS_MIN && ncsautes >= PART_MIN * n) saute.push({ r: r, slug: slug, i: i, k: ncsautes, n: n, total: exos.length });
        if (nRacc >= FOIS_MIN && nRacc >= PART_MIN * n) raccourcis.push({ r: r, slug: slug, i: i, k: nRacc, n: n });
        if (nMach >= FOIS_MIN) machines.push({ r: r, slug: slug, k: nMach });
        Object.keys(remp).forEach(function (v) {
          if (remp[v] >= FOIS_MIN && !exoManque(v)) remplaces.push({ r: r, slug: slug, vers: v, k: remp[v] });
        });
        if (nRetrait >= FOIS_MIN) retraits.push({ r: r, slug: slug, k: nRetrait });
      });
    });
    var avantDe = function (r, i) { return i >= 2 && liste(r.exercices)[1] ? r.exercices[1].exercise_slug : null; };
    saute.forEach(function (s) {
      var place = s.i === s.total - 1 ? 'en dernier' : 'en ' + (s.i + 1) + 'ᵉ position';
      var avant = avantDe(s.r, s.i);
      causes.push({ texte: nom(s.slug) + ' est ' + place + ' dans « ' + s.r.nom + ' » : il a eu lieu ' + (s.n - s.k) + ' fois sur ' + s.n + '.',
        proposition: avant ? { type: 'deplacer', libelle: 'Le placer plus tôt dans « ' + s.r.nom + ' »', routine_id: s.r.id, slug: s.slug, avant: avant } : null });
    });
    raccourcis.forEach(function (s) {
      var avant = avantDe(s.r, s.i);
      causes.push({ texte: '« J’ai peu de temps » a retiré ' + nom(s.slug) + ' ' + s.k + ' fois sur ' + s.n + '.',
        proposition: avant ? { type: 'deplacer', libelle: 'Le placer plus tôt dans « ' + s.r.nom + ' »', routine_id: s.r.id, slug: s.slug, avant: avant } : null });
    });
    machines.forEach(function (s) {
      causes.push({ texte: '« Machine prise » : ' + s.k + ' fois sur ' + nom(s.slug) + ', sans remplaçant.',
        proposition: { type: 'remplacer', libelle: 'Un remplaçant pour ' + nom(s.slug), routine_id: s.r.id, slug: s.slug } });
    });
    remplaces.forEach(function (s) {
      causes.push({ texte: nom(s.slug) + ' a été remplacé par ' + nom(s.vers) + ' ' + s.k + ' fois.',
        proposition: { type: 'remplacer', libelle: 'Remplacer ' + nom(s.slug) + ' dans « ' + s.r.nom + ' »', routine_id: s.r.id, slug: s.slug } });
    });
    retraits.forEach(function (s) {
      causes.push({ texte: nom(s.slug) + ' a été retiré à la main ' + s.k + ' fois.', proposition: null });
    });

    // (d) Une séance de la routine non faite — SEULEMENT si elle porte l'exercice en écart.
    var semainesF = f.semaines.map(function (w) { return w.lundi; });
    routines.forEach(function (r) {
      var porte = liste(r.exercices).filter(function (x) { return exoManque(x.exercise_slug); });
      if (!porte.length) return;
      var faites = {};
      seancesDe(r.id).forEach(function (s) { faites[s.lundi] = true; });
      var nonFaites = semainesF.filter(function (l) { return !faites[l]; }).length;
      if (nonFaites < FOIS_MIN || nonFaites < PART_MIN * semainesF.length) return;
      var noms = porte.slice(0, 2).map(function (x) { return nom(x.exercise_slug); });
      var propose = [];
      var rf = routines.filter(function (x) { return x.id !== r.id; });
      var plusFaite = rf.slice().sort(function (a, b) { return semainesFaites(seancesDe(b.id)) - semainesFaites(seancesDe(a.id)); })[0];
      if (plusFaite) {
        var ex = porte.filter(function (x) { return !liste(plusFaite.exercices).some(function (y) { return y.exercise_slug === x.exercise_slug; }); })[0];
        if (ex) propose.push({ type: 'ajouter', libelle: 'Ajouter ' + nom(ex.exercise_slug) + ' à « ' + plusFaite.nom + ' »', routine_id: plusFaite.id,
                               slug: ex.exercise_slug, series: seriesDeTravailDe(ex) || null });
        propose.push({ type: 'fusionner', libelle: 'Fusionner ' + plusFaite.nom + ' et ' + r.nom, routine_id: plusFaite.id, autre_id: r.id });
      }
      causes.push({ texte: '« ' + r.nom + ' » n’a pas été faite ' + nonFaites + ' ' + pluriel(nonFaites, 'semaine') + ' sur ' + semainesF.length +
        ' : c’est elle qui porte ' + noms.map(function (n) { return n; }).join(' et ') + '.', proposition: propose[0] || null, autres: propose.slice(1) });
    });

    // (e) Un exercice écarté par « J'ai mal » : une variante appuyée, jamais plus de séries sur ce qui fait mal.
    var mal = {};
    seances.forEach(function (s) {
      var vus = {};
      s.series.forEach(function (x) {
        if (x && x.douleur === true && exoManque(x.exercise_slug) && !vus[x.exercise_slug]) {
          vus[x.exercise_slug] = true; mal[x.exercise_slug] = (mal[x.exercise_slug] || 0) + 1;
        }
      });
    });
    Object.keys(mal).forEach(function (slug) {
      if (mal[slug] < FOIS_MIN) return;
      var r = routines.filter(function (x) { return liste(x.exercices).some(function (y) { return y.exercise_slug === slug; }); })[0];
      causes.push({ texte: nom(slug) + ' : « J’ai mal » marqué sur ' + mal[slug] + ' séances.',
        proposition: r ? { type: 'remplacer', libelle: 'Une variante appuyée pour ' + nom(slug), routine_id: r.id, slug: slug } : null });
    });

    // (f) Des séries ajoutées en séance d'un côté plus que de l'autre.
    var ajA = 0, ajB = 0;
    seances.forEach(function (s) {
      s.gestes.forEach(function (g) {
        if (!g || g.geste !== 'ajout_serie') return;
        if (cote.predicat(g.slug)) ajA += g.n || 1;
        else if (cote.predicatB && cote.predicatB(g.slug)) ajB += g.n || 1;
      });
    });
    if (cote.predicatB && ajB >= FOIS_MIN && ajB > ajA) {
      causes.push({ texte: 'En séance, tu as ajouté ' + ajB + ' ' + pluriel(ajB, 'série') + ' de ' + cote.nomB + ' et ' + ajA + ' de ' + cote.nomA + '.', proposition: null });
    }
    return causes;
  }

  function semainesFaites(ss) {
    var v = {};
    ss.forEach(function (s) { v[s.lundi] = true; });
    return Object.keys(v).length;
  }

  // La proposition « ajouter » du côté qui manque : l'exercice le plus fait de ce côté, dans la routine la plus fréquentée
  // qui ne l'a pas encore. `null` sans candidat ni routine.
  function cibleAjout(prep, cote, seances, routines) {
    var slug = candidat(prep, cote.predicat);
    if (!slug) return null;
    var libres = routines.filter(function (r) { return !liste(r.exercices).some(function (y) { return y.exercise_slug === slug; }); });
    if (!libres.length) return null;
    var f = function (r) { return semainesFaites(seances.filter(function (s) { return s.routine_id === r.id; })); };
    var cible = libres.slice().sort(function (a, b) { return f(b) - f(a); })[0];
    return { type: 'ajouter', libelle: 'Ajouter ' + nomDe(prep.e, slug) + ' à « ' + cible.nom + ' »', routine_id: cible.id, slug: slug,
             series: seriesHabituelles(prep, slug) };
  }

  // ── Les constats et les cartes ─────────────────────────────────────────────────────────────────────────────────
  function phraseDuRapport(r, a, b) {
    if (a > 0) return '1 série de ' + r.nomA + ' pour ' + nb(b / a) + ' de ' + r.nomB + '.';
    return 'Aucune série de ' + r.nomA + ' pour ' + b + ' de ' + r.nomB + '.';
  }
  function repereDe(r) {
    return 'En musculation, beaucoup de coachs visent ' + (r.repere === 'tp'
      ? 'un volume de tirage proche de celui de poussée.'
      : 'une chaîne postérieure qui ne reste pas très loin du volume des quadriceps.');
  }
  // La tendance sur l'année, quand elle existe : le rapport il y a six mois et il y a un an, sur une fenêtre valide.
  function tendanceDe(prep, r, ratioMaintenant) {
    var M = Modele();
    var lundiRef = prep.semaines[0] ? prep.semaines[0].lundi : null;
    if (!lundiRef) return null;
    var essais = [['il y a un an', 52], ['il y a six mois', 26]];
    for (var i = 0; i < essais.length; i++) {
      var cible = null;
      for (var j = 0; j < prep.semaines.length; j++) {
        if (semainesEntre(prep.semaines[j].lundi, lundiRef) >= essais[i][1]) { cible = j; break; }
      }
      if (cible === null) continue;
      var ec = ecartDeRapport(prep, r, cible);
      if (ec) return 'Sur l’année : ' + M.nombreFixe(ec.ratio, 2) + ' ' + essais[i][0] + ', ' + M.nombreFixe(ratioMaintenant, 2) + ' aujourd’hui.';
    }
    return null;
  }

  function constatDeRapport(prep, r) {
    var e = prep.e, ec = ecartDeRapport(prep, r, 0);
    if (!ec) return null;
    var c = { cle: r.cle, famille: 'equilibre', kind: 'rapport', titre: r.titre, ecart: ec.ecart, a: ec.a, b: ec.b, ratio: ec.ratio,
              seuil: r.seuil, nomA: r.nomA, nomB: r.nomB, fenetre: ec.fenetre };
    c.fait = phraseDuRapport(r, ec.a, ec.b);
    c.barre = { a: Math.round(100 * ec.a / (ec.a + ec.b)), b: 100 - Math.round(100 * ec.a / (ec.a + ec.b)) };
    c.etiquettes = { a: r.majA + ' · ' + ec.a + ' ' + pluriel(ec.a, 'série'), b: r.majB + ' · ' + ec.b + ' ' + pluriel(ec.b, 'série') };
    c.repere = repereDe(r);
    c.tendance = ec.ecart ? tendanceDe(prep, r, ec.ratio) : null;
    // Le programme du coach : le prévu et le fait. Le prévu, par semaine, sur les semaines de la fenêtre.
    var pa = prevuPourClasse(prep, r.a), pb = prevuPourClasse(prep, r.b);
    c.prevu = { a: pa, b: pb };
    if (e.programmeDuCoach && (pa + pb) > 0 && pb > 0) {
      var nsem = ec.fenetre.semaines.length;
      var prevuTotalA = pa * nsem, prevuTotalB = pb * nsem;
      c.coach = { prevuRatio: pa / pb, malConstruit: pa / pb < r.seuil };
      c.fait = pa > 0
        ? 'Ton programme prévoit 1 série de ' + r.nomA + ' pour ' + nb(pb / pa) + ' de ' + r.nomB + '.'
        : 'Ton programme ne prévoit aucune série de ' + r.nomA + '.';
      if (!c.coach.malConstruit && ec.a > 0) c.fait += ' Tu en as fait 1 pour ' + nb(ec.b / ec.a) + '.';
      c.etiquettes = {
        a: r.majA + ' · ' + ec.a + ' ' + pluriel(ec.a, 'série') + ' ' + pluriel(ec.a, 'faite') + ' sur ' + prevuTotalA + ' ' + pluriel(prevuTotalA, 'prévue'),
        b: r.majB + ' · ' + ec.b + ' sur ' + prevuTotalB
      };
    }
    return c;
  }

  function constatDeZero(prep, muscle) {
    var ec = ecartDeZero(prep, muscle, 0);
    if (!ec) return null;
    var nom = libelleDuMuscle(muscle);
    return { cle: 'zero:' + muscle, famille: 'equilibre', kind: 'zero', titre: 'Un muscle sans série', ecart: ec.ecart, muscle: muscle,
             nomA: nom, fenetre: ec.fenetre,
             fait: '0 série ' + de(nom) + ' sur tes ' + SEMAINES_ZERO + ' dernières semaines.',
             repere: 'En musculation, beaucoup de coachs gardent des séries chaque semaine sur chaque muscle principal.',
             prevu: { a: prevuPourMuscle(prep, muscle), b: 0 } };
  }

  function constatDesPriorites(prep) {
    var t = prioritesATraine(prep, 0);
    if (!t) return null;
    var e = prep.e, cat = prep.cat, M = Modele();
    var nsem = t.sm.semaines;
    // Le nom d'une priorité : le catalogue pour la ligne ; le nom court des barres (squat, couché, soulevé, militaire) pour
    // la phrase et la comparaison.
    var nomLigne = function (c) { return c === 'tractions' ? 'Tractions' : nomDe(e, c); };
    var nomCourt = function (c) { return c === 'tractions' ? 'tractions' : M.NOM_DE_BARRE[c]; };
    var duMouvement = function (c) { return c === 'tractions' ? 'des tractions' : 'du ' + nomCourt(c); };
    var lignes = [];
    liste(e.priorites).forEach(function (c) {
      if (c === 'tractions' || contient(M.BARRES, c)) {
        lignes.push({ libelle: nomLigne(c), par: t.sm.parMouvement[c] / nsem, cle: c });
      } else {
        var z = Semaine().ZONES.filter(function (x) { return x.cle === c; })[0];
        var v = z ? seriesParZone(prep, 0, c) : null;
        if (z && v !== null) lignes.push({ libelle: z.libelle + ' (toutes)', par: v / nsem, cle: c });
      }
    });
    var couche = M.BARRES[1];
    var refPar = t.sm.parMouvement[t.plus] / nsem;
    var pourComparer = !contient(liste(e.priorites), couche) && t.sm.parMouvement[couche] > 0
      ? { libelle: 'Pour comparer\u00a0: ' + nomCourt(couche), par: t.sm.parMouvement[couche] / nsem } : null;
    var traine = t.traine;
    var noms = traine.map(nomCourt);
    var c = { cle: 'priorites', famille: 'equilibre', kind: 'priorites', titre: 'Tes priorités, faites ou non', ecart: traine.length > 0,
              lignes: lignes.map(function (l) { return { libelle: l.libelle, texte: nb(l.par) + ' ' + pluriel(l.par, 'série') + ' / sem.' }; }),
              fenetre: t.sm.f, traine: traine };
    if (pourComparer) c.lignes.push({ libelle: pourComparer.libelle, texte: nb(pourComparer.par) + ' ' + pluriel(pourComparer.par, 'série') + ' / sem.', gris: true });
    c.fait = traine.length
      ? 'Tu as choisi ' + noms.join(' et ') + ' comme ' + pluriel(traine.length, 'priorité') + ' : ' +
        (traine.length > 1 ? 'chacune compte' : 'elle compte') + ' moins de la moitié des séries ' + duMouvement(t.plus) + ' (' +
        nb(refPar) + ' par semaine).'
      : '';
    c.repere = '';
    return c;
  }

  // Les causes et les propositions d'un constat en écart.
  function garnir(prep, c) {
    var e = prep.e, M = Modele(), cat = prep.cat;
    var ctx = { fenetre: c.fenetre, seuil: c.seuil || 1 };
    var cote = null;
    if (c.kind === 'rapport') {
      var r = RAPPORTS.filter(function (x) { return x.cle === c.cle; })[0];
      cote = { predicat: function (slug) { return !!classesDe(slug, cat)[r.a]; }, predicatB: function (slug) { return !!classesDe(slug, cat)[r.b]; },
               nomA: r.nomA, nomB: r.nomB };
    } else if (c.kind === 'zero') {
      cote = { predicat: function (slug) {
        var f = cat[slug];
        return !!f && liste(f.muscles_primaires).indexOf(c.muscle) >= 0;
      }, nomA: c.nomA, nomB: '' };
    }
    var causes = [];
    var props = [];
    if (c.kind === 'priorites') {
      c.traine.forEach(function (cle) {
        var slug = cle === 'tractions' ? 'tractions' : cle;
        var routine = liste(e.routines).filter(function (r) {
          return liste(r.exercices).some(function (y) { return barreDe(y.exercise_slug, cat) === cle || (cle === 'tractions' && y.exercise_slug === 'tractions'); });
        })[0];
        var exo = routine ? liste(routine.exercices).filter(function (y) { return barreDe(y.exercise_slug, cat) === cle || (cle === 'tractions' && y.exercise_slug === 'tractions'); })[0] : null;
        if (!exo) return;
        var fiche = cat[exo.exercise_slug];
        var zones = Semaine();
        var prioM = liste(fiche && fiche.muscles_primaires).filter(function (m) {
          var z = zones.zoneDuMuscle(m);
          return (z && contient(e.priorites, z.cle)) || contient(e.priorites, cle);
        });
        // MOTEUR §14.6 : la place pour une série de plus, la règle existante (`Moteur.placePourExercice`), lue telle quelle.
        var volume = typeof e.volume === 'function' ? e.volume() : e.volume;
        var place = volume ? Moteur().placePourExercice(volume, fiche ? fiche.muscles_primaires : null, prioM) : false;
        if (!place) return;
        props.push({ type: 'serie', cle: 'serie|' + routine.id + '|' + exo.exercise_slug, libelle: 'Ajouter une série de ' + minuscule(nomDe(e, exo.exercise_slug)) + ' à ta routine ?',
                     routine_id: routine.id, slug: exo.exercise_slug, question: true });
      });
      c.causes = [];
      c.propositions = props;
      return c;
    }
    causes = causesDe(prep, cote, c, ctx);
    // Le programme du coach, sous le seuil de lui-même : « Je l'ai mal construit ».
    if (e.programmeDuCoach && c.coach && c.coach.malConstruit) {
      props.push({ type: 'corriger', cle: 'corriger', libelle: 'Je l’ai mal construit : je corrige ton programme ?', question: true, refait: true });
    }
    causes.forEach(function (x) {
      [x.proposition].concat(x.autres || []).forEach(function (p) {
        if (!p) return;
        var cle = p.type + '|' + (p.routine_id || '') + '|' + (p.slug || '') + '|' + (p.autre_id || '');
        p.cle = cle;
        if (props.some(function (q) { return q.cle === cle; })) return;
        props.push(p);
      });
    });
    c.causes = causes.map(function (x) { return { texte: x.texte, proposition: x.proposition ? x.proposition.cle || null : null }; });
    c.propositions = props.slice(0, 3);
    return c;
  }

  // ── LA LIGNE de l'écran Séances (une seule, sous la barre de la semaine) ───────────────────────────────────────
  function ligneDe(carte) {
    if (!carte) return null;
    var texte = carte.kind === 'zero' ? carte.fait
      : carte.kind === 'priorites' ? carte.fait
      : carte.fait;
    return { cle: carte.cle, texte: texte, libelle: 'Voir mes équilibres' };
  }

  // ── L'ANALYSE ───────────────────────────────────────────────────────────────────────────────────────────────────
  // Rend `{ etat, reglage, quand, constats, cartes, calmes, ligne }` :
  //   · `etat` : 'ok', 'peu' (moins de 4 semaines ou 12 séances : rien à dire), 'carnet' (Juste un carnet : aucune carte, les
  //     constats restent lisibles dans le Parcours) ;
  //   · `constats` : TOUTES les mesures en écart (le fait et son repère), qu'une carte parle ou non — les faits ne changent
  //     pas selon le réglage ;
  //   · `cartes` : celles qui PARLENT — l'écart tenu sur N des 8 semaines, pas en silence, dans l'ordre, au plus `cartes`
  //     du réglage —, avec leurs causes et leurs propositions ;
  //   · `calmes` : les mesures au-dessus des seuils (« Équilibré · rien à signaler »).
  function analyser(entree) {
    var e = entree || {};
    var reglage = reglageDe(e);
    var prep = preparer(e);
    var f0 = fenetreA(prep, 0);
    var carnet = e.intention === 'entretien';
    var sortie = { etat: carnet ? 'carnet' : 'ok', reglage: reglage, constats: [], cartes: [], calmes: [], ligne: null, quand: null };
    if (!f0.valide) { sortie.etat = 'peu'; return sortie; }
    sortie.quand = 'Tes ' + f0.semaines.length + ' dernières semaines · ' + f0.nbSeances + ' ' + pluriel(f0.nbSeances, 'séance');

    var mesures = [];
    var evaluateurs = {};
    RAPPORTS.forEach(function (r) {
      var c = constatDeRapport(prep, r);
      if (!c) return;
      mesures.push(c);
      evaluateurs[r.cle] = function (k) { var ec = ecartDeRapport(prep, r, k); return !!ec && ec.ecart; };
    });
    MUSCLES_PRINCIPAUX.forEach(function (m) {
      var c = constatDeZero(prep, m);
      if (!c) return;
      mesures.push(c);
      evaluateurs[c.cle] = function (k) { var ec = ecartDeZero(prep, m, k); return !!ec && ec.ecart; };
    });
    var cp = constatDesPriorites(prep);
    if (cp) {
      mesures.push(cp);
      evaluateurs.priorites = function (k) { var t = prioritesATraine(prep, k); return !!t && t.traine.length > 0; };
    }

    var rangs = {};
    ['zero', 'rapport', 'priorites'].forEach(function (x, i) { rangs[x] = i; });
    var parlent = [];
    mesures.forEach(function (c) {
      if (!c.ecart) {
        sortie.calmes.push({ cle: c.cle, kind: c.kind, titre: c.titre, texte: 'Équilibré · rien à signaler' });
        return;
      }
      var rep = reponseDe(e, c.cle);
      // Une carte acceptée repart de zéro ; un programme REFAIT (`programmeRefaitLe`) fait repartir toutes les cartes : les
      // autres, périmées, ne reviennent qu'avec une habitude neuve.
      var apres = rep && rep.r === 'oui' ? lundiDe(rep.le) : null;
      var refait = e.programmeRefaitLe ? lundiDe(e.programmeRefaitLe) : null;
      if (refait && (!apres || refait > apres)) apres = refait;
      c.habitude = habitudeDe(prep, evaluateurs[c.cle], apres);
      c.silence = enSilence(e, reglage, c.cle);
      c.parle = !carnet && c.habitude.tenu >= REGLAGES[reglage].habitude && !c.silence;
      sortie.constats.push(c);
      if (c.parle) parlent.push(c);
    });
    // Un muscle sans série : une seule ligne calme quand aucun n'est en écart.
    if (!mesures.some(function (c) { return c.kind === 'zero' && c.ecart; }) && mesures.some(function (c) { return c.kind === 'zero'; })) {
      sortie.calmes.push({ cle: 'zero', kind: 'zero', titre: 'Un muscle sans série', texte: 'Aucun sur les ' + SEMAINES_ZERO + ' dernières semaines.' });
    }
    // Les calmes de zéro par muscle ne se listent pas un par un.
    sortie.calmes = sortie.calmes.filter(function (x) { return !(x.kind === 'zero' && x.cle !== 'zero'); });

    parlent.sort(function (a, b) {
      return ORDRE_DES_FAMILLES.indexOf(a.famille) - ORDRE_DES_FAMILLES.indexOf(b.famille) ||
        rangs[a.kind] - rangs[b.kind] || (a.cle < b.cle ? -1 : 1);
    });
    sortie.cartes = parlent.slice(0, REGLAGES[reglage].cartes).map(function (c) { return garnir(prep, c); });
    sortie.ligne = ligneDe(sortie.cartes[0]);
    return sortie;
  }

  // Les cartes à périmer quand une proposition « refait le programme » est acceptée : toutes les autres cartes qui parlaient.
  function clesAPerimer(analyse, cleAcceptee) {
    var cles = [];
    liste(analyse && analyse.constats).forEach(function (c) { if (c.cle !== cleAcceptee) cles.push(c.cle); });
    return cles;
  }

  var api = {
    REGLAGES: REGLAGES,
    ORDRE_DES_FAMILLES: ORDRE_DES_FAMILLES,
    SEUIL_TIRAGE: SEUIL_TIRAGE,
    SEUIL_CHAINE: SEUIL_CHAINE,
    SEMAINES_FENETRE: SEMAINES_FENETRE,
    SEMAINES_MIN: SEMAINES_MIN,
    SEANCES_MIN: SEANCES_MIN,
    SEMAINES_ZERO: SEMAINES_ZERO,
    SEMAINES_HABITUDE: SEMAINES_HABITUDE,
    MUSCLES_PRINCIPAUX: MUSCLES_PRINCIPAUX,
    classesDe: classesDe,
    analyser: analyser,
    reponse: reponse,
    perimer: perimer,
    clesAPerimer: clesAPerimer,
    silenceDe: silenceDe
  };

  racine.THEquilibres = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
