// v2/js/mouvement.js — L'ANIMATION 3D DU MOUVEMENT (271), en tête de l'onglet « Comment faire » d'un exercice.
//
// C'est l'atelier v8 (lot 2) adapté à l'app : three.js r128 + GLTFLoader, fichiers locaux, aucun WASM, aucun innerHTML, aucun
// attribut style (les styles vivent dans styles.css, classes `thm-*`). UN SEUL rendu WebGL : il naît au premier montage et
// meurt au dernier arrêt (`renderer.dispose()` + `forceContextLoss()`), si bien qu'aller et venir entre la fiche et la séance
// ne laisse jamais deux contextes vivants.
//
// API :  THMouvement.existe(slug)            — l'exercice a-t-il une animation ? (une clé du CATALOGUE, rien d'autre)
//        THMouvement.url(slug)               — '/mouvements/<fichier>.json', ou null
//        var h = THMouvement.monter(conteneur, url, { muscles: { primaires, secondaires, stabilisateurs }, libelles })
//        h.pret (promesse : h, ou null si la vue n'a pas pu se charger — jamais rejetée) ; h.arreter() (idempotent).
//
// ⚠️ LES MUSCLES COLORÉS VIENNENT DU CATALOGUE DE L'APP (`exercises.muscles_primaires` / `_secondaires` / `_stabilisateurs`,
// les clés du bonhomme, `Semaine.LIBELLES_MUSCLE`), passés par app.js à `monter`. Le JSON d'un exercice n'en porte aucun
// (garde : v2-mouvement.test.js). Une clé inconnue n'est jamais devinée : elle n'est pas colorée.
//
// ⚠️ CHARGÉ À LA DEMANDE : index.html ne charge que ce fichier. three.min.js et GLTFLoader.js (vendor/) s'injectent au premier
// `monter`, le corps (mouvements/corps-glb.json, 1,8 Mo) et l'exercice se lisent par fetch ; aucun n'est dans la coquille du
// service worker (il les garde à l'usage). Hors ligne et jamais vus : la vue se retire sans un mot, la page reste celle d'avant.
//
// ═══ AJOUTER UN EXERCICE ═══ (deux gestes, rien d'autre) :
//   1. copier `<slug>.json` (fabrique de l'atelier, format « trainhub-mouvement/8 ») dans v2/mouvements/ ;
//   2. l'inscrire au CATALOGUE ci-dessous : `<slug>: '<slug>.json'`.
//   Le slug est celui du catalogue de l'app (`exercises.id`). `npx jest tests/unit/v2-mouvement.test.js` vérifie qu'à chaque
//   slug inscrit répond un fichier, qu'aucun fichier n'est orphelin, et que le JSON ne porte aucun muscle.
(function (racine) {
  'use strict';

  var CATALOGUE = {
    squat_barre: 'squat_barre.json',
    souleve_de_terre_barre: 'souleve_de_terre_barre.json',
    developpe_couche_barre: 'developpe_couche_barre.json',
    tractions: 'tractions.json',
    squat_avec_pause_barre: 'squat_avec_pause_barre.json',
    presse_a_cuisses: 'presse_a_cuisses.json',
    extension_jambes: 'extension_jambes.json',
    leg_curl_assis: 'leg_curl_assis.json',
    leg_curl_allonge_machine: 'leg_curl_allonge_machine.json',
    hip_thrust_machine: 'hip_thrust_machine.json',
    extension_mollets_debout_machine: 'extension_mollets_debout_machine.json',
    abduction_hanche: 'abduction_hanche.json',
    adduction_hanche: 'adduction_hanche.json',
    developpe_couche_haltere: 'developpe_couche_haltere.json',
    developpe_couche_incline_haltere: 'developpe_couche_incline_haltere.json',
    curl_marteau_haltere: 'curl_marteau_haltere.json',
    pull_over: 'pull_over.json',
    releve_de_genoux_suspendu: 'releve_de_genoux_suspendu.json',
    planche: 'planche.json',
    tapis_roulant: 'tapis_roulant.json'
  };
  var DOSSIER = '/mouvements/', CORPS = '/mouvements/corps-glb.json', VENDOR = '/vendor/';
  function existe(slug) { return typeof slug === 'string' && Object.prototype.hasOwnProperty.call(CATALOGUE, slug); }
  function url(slug) { return existe(slug) ? DOSSIER + CATALOGUE[slug] : null; }

  // ════════════════════════ partie commune (sans three ni DOM) — l'atelier v8, à l'identique ════════════════════════
  var Commun = (function () {
    var add = function (a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; };
    var sub = function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; };
    var mul = function (a, k) { return [a[0] * k, a[1] * k, a[2] * k]; };
    var dot = function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
    var cross = function (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; };
    var len = function (a) { return Math.sqrt(dot(a, a)); };
    var norm = function (a) { var l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    var Q1 = [0, 0, 0, 1];
    function qMul(a, b) { return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]]; }
    function qRot(q, v) { var u = [q[0], q[1], q[2]], t = mul(cross(u, v), 2); return add(add(v, mul(t, q[3])), cross(u, t)); }
    function qInv(q) { return [-q[0], -q[1], -q[2], q[3]]; }
    function qAxe(ax, deg) { var n = norm(ax), s = Math.sin(deg * Math.PI / 360); return [n[0] * s, n[1] * s, n[2] * s, Math.cos(deg * Math.PI / 360)]; }
    // Euler en degrés, ordre XYZ (celui de three.js) : q = qx · qy · qz
    function qEuler(r) { if (!r) return Q1; return qMul(qMul(qAxe([1, 0, 0], r[0] || 0), qAxe([0, 1, 0], r[1] || 0)), qAxe([0, 0, 1], r[2] || 0)); }
    // repère orthonormé (colonnes x, y, z) → quaternion
    function qBase(x, y, z) {
      var m00 = x[0], m01 = y[0], m02 = z[0], m10 = x[1], m11 = y[1], m12 = z[1], m20 = x[2], m21 = y[2], m22 = z[2], tr = m00 + m11 + m22, s;
      if (tr > 0) { s = 0.5 / Math.sqrt(tr + 1); return [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s]; }
      if (m00 > m11 && m00 > m22) { s = 2 * Math.sqrt(1 + m00 - m11 - m22); return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
      if (m11 > m22) { s = 2 * Math.sqrt(1 + m11 - m00 - m22); return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]; }
      s = 2 * Math.sqrt(1 + m22 - m00 - m11); return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
    }
    // une transformation T = { q, t } : p' = q·p + t
    function compose(A, B) { return { q: qMul(A.q, B.q), t: add(qRot(A.q, B.t), A.t) }; }
    function appliquer(T, p) { return add(qRot(T.q, p), T.t); }
    function inverser(T, p) { return qRot(qInv(T.q), sub(p, T.t)); }
    function locale(o) { return { q: o.quaternion || qEuler(o.rotation), t: o.position || [0, 0, 0] }; }
    var ID = { q: Q1, t: [0, 0, 0] };

    // ── les clés de muscles de l'app (catalogue, `Semaine.LIBELLES_MUSCLE`) → groupes du corps (Z-Anatomy) ──
    // UNE table, la seule. Une clé de l'app absente d'ici fait échouer `fabrique/test-muscles.js`.
    var MUSCLES_APP = {
      abdominaux: ['abdominaux'], abducteurs: ['abducteurs'], adducteurs: ['adducteurs'], avant_bras: ['avant_bras'],
      bas_du_dos: ['bas_du_dos'], biceps: ['biceps'], deltoide_anterieur: ['deltoide_anterieur'], deltoide_lateral: ['deltoide_lateral'],
      deltoide_posterieur: ['deltoide_posterieur'], fessiers: ['fessiers'], grand_dorsal: ['grand_dorsal'], haut_du_dos: ['haut_du_dos'],
      ischio_jambiers: ['ischio_jambiers'], mollets: ['mollets'], pectoraux: ['pectoraux'], quadriceps: ['quadriceps'],
      trapezes: ['trapezes'], triceps: ['triceps']
    };
    // libellés par défaut (ceux de `Semaine.LIBELLES_MUSCLE`) ; l'app peut passer les siens (options.libelles)
    var LIBELLES = { abdominaux: 'Abdominaux', abducteurs: 'Abducteurs', adducteurs: 'Adducteurs', avant_bras: 'Avant-bras', bas_du_dos: 'Bas du dos',
      biceps: 'Biceps', deltoide_anterieur: 'Deltoïde antérieur', deltoide_lateral: 'Deltoïde latéral', deltoide_posterieur: 'Deltoïde postérieur',
      fessiers: 'Fessiers', grand_dorsal: 'Grand dorsal', haut_du_dos: 'Haut du dos', ischio_jambiers: 'Ischio-jambiers', mollets: 'Mollets',
      pectoraux: 'Pectoraux', quadriceps: 'Quadriceps', trapezes: 'Trapèzes', triceps: 'Triceps' };
    // des clés de l'app → rôles par groupe du corps ; une clé inconnue n'est jamais devinée : elle est rendue dans `inconnues`
    function rolesDuCatalogue(m) {
      var r = { prim: [], sec: [], stab: [] }, inconnues = [];
      [['prim', 'primaires'], ['sec', 'secondaires'], ['stab', 'stabilisateurs']].forEach(function (p) {
        ((m && m[p[1]]) || []).forEach(function (k) { if (!MUSCLES_APP[k]) { inconnues.push(k); return; } MUSCLES_APP[k].forEach(function (g) { if (r[p[0]].indexOf(g) < 0) r[p[0]].push(g); }); }); });
      return { roles: r, inconnues: inconnues };
    }

    // ── le matériel : chaque primitive se développe en PARTIES (un repère qui suit quelque chose, des solides dedans) et en
    //    LIENS (câbles tendus entre deux points). La page dessine les solides ; la fabrique les mesure. ──
    // solide : { forme: boite|cylindre|sphere|tore|anneau|cercle|ligne, taille|rayon|longueur|axe|tube|interieur, position, rotation,
    //            style, opacite, ordre, ouvert, segments, cadre, collision, prise, mou, fondu }
    function cyl(r, l, axe, pos, o) { return Object.assign({ forme: 'cylindre', rayon: r, longueur: l, axe: axe || 'y', position: pos || [0, 0, 0] }, o || {}); }
    function boite(t, pos, o) { return Object.assign({ forme: 'boite', taille: t, position: pos || [0, 0, 0] }, o || {}); }
    var CADRE_DEFAUT = { sol: false, repere: false };
    function developper(materiel) {
      var parties = [], liens = [];
      function partie(p, base) { p.cadreDefaut = base; parties.push(p); return p; }
      (materiel || []).forEach(function (m, im) {
        var id = m.id || (m.type + im), suit = m.suit || null, pos = m.position || [0, 0, 0], rot = m.rotation, qt = m.quaternion;
        var P = function (solides, o) { return partie(Object.assign({ id: id, type: m.type, suit: suit, position: pos, rotation: rot, quaternion: qt, solides: solides }, o || {})); };
        switch (m.type) {
          case 'sol': P([{ forme: 'cercle', rayon: m.rayon || 90, segments: 48, position: [0, -0.3, 0], rotation: [-90, 0, 0], style: 'sol', cadre: false, collision: false }]); break;
          case 'repere': P([{ forme: 'ligne', de: [m.x, 0, 0], a: [m.x, m.hauteur || 178, 0], style: 'repere', cadre: false, collision: false }], { position: [0, 0, 0] }); break;
          case 'barre': {   // barre chargée : le milieu (entre les mains) plein ; les bouts et les disques s'effacent dans l'axe (v6)
            var mid = m.milieu || 50, bout = m.longueur / 2 - mid, s = [cyl(1.4, 2 * mid, 'z', [0, 0, 0], { segments: 14, style: 'metal', prise: true })];
            [-1, 1].forEach(function (sg) { s.push(cyl(1.4, bout, 'z', [0, 0, sg * (mid + bout / 2)], { segments: 14, style: 'metalFondu', opacite: 1, ordre: 2, fondu: { bout: true }, cadre: false })); });
            if (m.disques) [-m.disques.z, m.disques.z].forEach(function (z) {
              var R = m.disques.rayon;
              s.push(cyl(R, m.disques.epaisseur || 3, 'z', [0, 0, z], { segments: 48, ouvert: true, style: 'disque', opacite: 0.12, ordre: 3, fondu: {}, cadre: false }));
              s.push({ forme: 'anneau', interieur: 3, rayon: R, segments: 48, position: [0, 0, z], style: 'disqueFace', opacite: 0.07, ordre: 3, fondu: {}, cadre: false, collision: false });
              s.push({ forme: 'tore', rayon: R, tube: 0.45, segments: [6, 64], axe: 'z', position: [0, 0, z], style: 'disqueBord', opacite: 0.75, ordre: 4, fondu: {}, cadre: false, collision: false });
              s.push(cyl(2.6, 4, 'z', [0, 0, z + (z > 0 ? -3 : 3)], { segments: 14, style: 'metalFondu', opacite: 1, fondu: {}, cadre: false }));
            });
            P(s, { fondu: true }); break; }
          case 'barreFixe': {   // la barre de traction et deux courtes potences vers le haut (des montants cacheraient le corps de profil)
            var L = m.longueur || 120, h = m.potences === undefined ? 10 : m.potences;
            var sb = [cyl(1.4, L, 'z', [0, 0, 0], { segments: 14, style: 'metal', prise: true })];
            if (h) [-L / 2, L / 2].forEach(function (z) { sb.push(cyl(1.8, h, 'y', [0, h / 2, z], { segments: 10, style: 'potence' })); });
            if (!m.suit && !m.position) pos = [m.x || 0, m.hauteur, 0];
            P(sb); break; }
          case 'banc': {
            var H = m.haut, lg = m.largeur || 28, sbn = [];
            if (!m.forme || m.forme === 'plat') {   // le banc plat de la v6
              var l = m.x1 - m.x0; sbn.push(boite([l, 6, lg], [(m.x0 + m.x1) / 2, H - 3, 0], { style: 'banc', mou: true }));
              [m.x0 + 12, m.x1 - 12].forEach(function (x) { sbn.push(boite([5, H - 6, 5], [x, (H - 6) / 2, 0], { style: 'banc' })); sbn.push(boite([6, 3, 34], [x, 1.5, 0], { style: 'banc' })); });
            } else {   // incliné à `angle` degrés (vertical : 90) — assise de x0 à x1, dossier qui part de x0 vers l'arrière (−x) et le haut
              var a = m.forme === 'vertical' ? 90 : m.angle, Ld = m.dossier || 80, ax = m.x0, ar = a * Math.PI / 180;
              sbn.push(boite([m.x1 - m.x0, 6, lg], [(m.x0 + m.x1) / 2, H - 3, 0], { style: 'banc', mou: true }));
              sbn.push(boite([Ld, 6, lg], [ax - Math.cos(ar) * Ld / 2 + Math.sin(ar) * 3, H + Math.sin(ar) * Ld / 2 - Math.cos(ar) * 3 + (a > 0 ? 3 : 0), 0], { rotation: [0, 0, -a], style: 'banc', mou: true }));
              sbn.push(boite([5, H - 6, 5], [(m.x0 + m.x1) / 2, (H - 6) / 2, 0], { style: 'banc' }));
              sbn.push(boite([Math.max(40, m.x1 - m.x0 + Math.cos(ar) * Ld), 3, 34], [(m.x1 + ax - Math.cos(ar) * Ld) / 2, 1.5, 0], { style: 'banc' }));
              sbn.push(boite([5, Math.sin(ar) * Ld * 0.6 + H - 6, 5], [ax - Math.cos(ar) * Ld * 0.6, (Math.sin(ar) * Ld * 0.6 + H - 6) / 2, 0], { style: 'banc' }));
            }
            P(sbn); break; }
          case 'haltere': {   // un haltère tenu : `suit: {os: 'main_d'}`, position/quaternion = la prise au repos (la fabrique les résout)
            var lp = m.poignee || 14, rd = m.rayon || 9, ep = m.epaisseur || 5;
            P([cyl(1.6, lp, 'z', [0, 0, 0], { segments: 14, style: 'metal', prise: true }),
               cyl(rd, ep, 'z', [0, 0, lp / 2 + ep / 2], { segments: 28, style: 'fonte' }), cyl(rd, ep, 'z', [0, 0, -lp / 2 - ep / 2], { segments: 28, style: 'fonte' })]); break; }
          case 'kettlebell': {   // poignée dans la main (axe z local), boule sous la poignée (−y local)
            var rk = m.rayon || 10;
            P([cyl(1.5, 12, 'z', [0, 0, 0], { segments: 12, style: 'metal', prise: true }),
               cyl(1.5, 7, 'y', [0, -3.5, 6], { segments: 10, style: 'fonte' }), cyl(1.5, 7, 'y', [0, -3.5, -6], { segments: 10, style: 'fonte' }),
               { forme: 'sphere', rayon: rk, position: [0, -6 - rk * 0.85, 0], style: 'fonte' }]); break; }
          case 'poulie': {   // ancre (la poulie), colonne jusqu'au sol, câble tendu jusqu'à la poignée attachée aux mains
            var A = m.ancre, ps = [];
            if (m.colonne !== false) { var cH = A[1] + 10, cx = m.colonne && m.colonne.position ? m.colonne.position : [A[0], A[2]];
              ps.push(boite([8, cH, 8], [cx[0], cH / 2, cx[1]], { style: 'machine', cadre: false })); }
            ps.push({ forme: 'tore', rayon: 4, tube: 1.2, axe: m.axeRoue || 'z', position: A, style: 'metal', segments: [8, 24], collision: false });
            partie({ id: id + ':poulie', type: 'poulie', solides: ps });
            var pg = m.poignee || {}, mains = pg.mains || {}, forme = pg.forme || 'simple', attache;
            var suitP = { mains: mains, axe: pg.axe, vers: A };
            var sp = [];
            if (forme === 'simple') { sp.push(cyl(1.5, 12, 'z', [0, 0, 0], { style: 'metal', prise: true }));
              sp.push({ forme: 'segment', de: [0, 0, 6], a: [0, 8, 0], rayon: 0.6, style: 'metal' }, { forme: 'segment', de: [0, 0, -6], a: [0, 8, 0], rayon: 0.6, style: 'metal' }); attache = [0, 8, 0]; }
            else if (forme === 'barre') { sp.push(cyl(1.4, pg.longueur || 50, 'z', [0, 0, 0], { style: 'metal', prise: true }), cyl(1.2, 5, 'y', [0, 2.5, 0], { style: 'metal' })); attache = [0, 5, 0]; }
            else if (forme === 'v') { var e2 = (pg.ecart || 14) / 2;
              sp.push(cyl(1.5, 11, 'x', [0, 0, e2], { style: 'metal', prise: true }), cyl(1.5, 11, 'x', [0, 0, -e2], { style: 'metal', prise: true }),
                { forme: 'segment', de: [0, 0, e2], a: [0, 10, 0], rayon: 1.2, style: 'metal' }, { forme: 'segment', de: [0, 0, -e2], a: [0, 10, 0], rayon: 1.2, style: 'metal' }); attache = [0, 10, 0]; }
            else if (forme === 'corde') { sp.push({ forme: 'sphere', rayon: 2.2, position: [0, 7, 0], style: 'corde' }); attache = [0, 7, 0];
              ['d', 'g'].forEach(function (c) { if (mains[c]) { liens.push({ de: { partie: id + ':poignee', point: [0, 7, 0] }, a: { os: 'main_' + c, point: mains[c] }, rayon: 1.0, style: 'corde' });
                partie({ id: id + ':bout_' + c, type: 'poulie', suit: { os: 'main_' + c }, position: mains[c], solides: [{ forme: 'sphere', rayon: 2.0, style: 'corde', collision: false }] }); } }); }
            partie({ id: id + ':poignee', type: 'poulie', suit: suitP, solides: sp });
            liens.push({ de: { monde: A }, a: { partie: id + ':poignee', point: attache }, rayon: 0.35, style: 'cable' });
            break; }
          case 'machine': {   // des boîtes et des cylindres arrondis ; une pièce peut suivre un os, une piste (translation) ou un angle animé
            var base = { q: qt || qEuler(rot), t: pos };
            (m.pieces || []).forEach(function (pc, k) {
              var so = Object.assign({}, pc, { position: [0, 0, 0], rotation: null, quaternion: null, style: pc.style || 'machine' });
              if (pc.forme === 'boite') so.taille = pc.taille;
              if (pc.style === 'coussin' && pc.mou === undefined) so.mou = true;
              var lp = locale(pc), sw = pc.suit || null;
              // une pièce fixe ou à angle est dans le repère de la machine ; une pièce attachée à un os est au repos de cet os
              var Tl = sw && (sw.os || sw.mains) ? lp : compose(base, lp);
              var piv = sw && sw.angle ? { piste: sw.angle.piste, pivot: appliquer(base, sw.angle.pivot), axe: qRot(base.q, sw.angle.axe || [0, 0, 1]), zero: sw.angle.zero || 0 } : null;
              partie({ id: id + ':' + (pc.nom || k), type: 'machine', suit: piv ? { angle: piv } : sw, quaternion: Tl.q, position: Tl.t, solides: [so] });
            }); break; }
          case 'tapis': {   // bande + montants (avant = +x)
            var Lt = m.longueur || 150, lt = m.largeur || 50, ht = m.hauteur || 8, xt = m.x || 0, st = [];
            st.push(boite([Lt, ht - 1, lt + 12], [xt, (ht - 1) / 2, 0], { style: 'machine' }));
            st.push(boite([Lt - 6, 1, lt], [xt, ht - 0.5, 0], { style: 'bande' }));
            if (m.montants !== false) { [-1, 1].forEach(function (sg) { st.push(cyl(2, 105, 'y', [xt + Lt / 2 - 6, ht + 52, sg * (lt / 2 + 5)], { style: 'machine', cadre: false })); });
              st.push(boite([10, 6, lt + 14], [xt + Lt / 2 - 6, ht + 106, 0], { style: 'machine', cadre: false })); }
            P(st); break; }
          default: throw new Error('matériel inconnu : ' + m.type);
        }
      });
      parties.forEach(function (p) { p.solides.forEach(function (s) {
        if (s.cadre === undefined) s.cadre = CADRE_DEFAUT[p.type] === undefined ? true : CADRE_DEFAUT[p.type];
        if (s.collision === undefined) s.collision = true; }); });
      return { parties: parties, liens: liens };
    }
    // où est une partie à un instant : etat = { os: { nom: {q, t} }, pistes: { nom: valeur } }
    function placer(p, etat) {
      var L = locale(p), s = p.suit;
      if (!s) return L;
      if (s.piste) { var v = etat.pistes[s.piste]; return compose({ q: Q1, t: [v[0], v[1], v[2] || 0] }, L); }
      if (s.os) return compose(etat.os[s.os], L);
      if (s.angle) { var a = (etat.pistes[s.angle.piste] || 0) - s.angle.zero, q = qAxe(s.angle.axe, a);
        return compose({ q: q, t: sub(s.angle.pivot, qRot(q, s.angle.pivot)) }, L); }
      if (s.mains) {   // une poignée tenue : au milieu des prises, z de la main gauche vers la droite, y vers le câble
        var pd = s.mains.d && appliquer(etat.os.main_d, s.mains.d), pg = s.mains.g && appliquer(etat.os.main_g, s.mains.g), c, z;
        if (pd && pg) { c = mul(add(pd, pg), 0.5); z = norm(sub(pd, pg)); }
        else { var cote = pd ? 'd' : 'g'; c = pd || pg; z = norm(qRot(etat.os['main_' + cote].q, s.axe || [0, 0, 1])); }
        var y0 = s.vers ? norm(sub(s.vers, c)) : [0, 1, 0], y = sub(y0, mul(z, dot(y0, z)));
        if (len(y) < 1e-3) y = Math.abs(z[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        y = norm(sub(y, mul(z, dot(y, z)))); var x = cross(y, z);
        return { q: qBase(x, y, z), t: c };
      }
      return L;
    }
    function pointDe(ref, etat, places) {
      if (ref.monde) return ref.monde;
      if (ref.os) return appliquer(etat.os[ref.os], ref.point);
      return appliquer(places[ref.partie], ref.point);
    }
    // le repère d'un solide dans sa partie (l'axe d'un cylindre ou d'un tore : y par défaut)
    var AXE = { x: [0, 0, -90], y: null, z: [90, 0, 0] };
    function repereSolide(s) {
      var q = s.quaternion || qEuler(s.rotation);
      if (s.forme === 'cylindre' && AXE[s.axe || 'y']) q = qMul(q, qEuler(AXE[s.axe]));
      if (s.forme === 'tore' && (s.axe || 'z') !== 'z') q = qMul(q, qEuler(s.axe === 'x' ? [0, 90, 0] : [90, 0, 0]));
      return { q: q, t: s.position || [0, 0, 0] };
    }
    // les points qui comptent pour le cadrage (dans le repère du solide : cylindre d'axe y, tore dans le plan xy)
    function pointsSolide(s) {
      var r = s.rayon, o = [];
      if (s.forme === 'boite') { var t = s.taille; [-1, 1].forEach(function (a) { [-1, 1].forEach(function (b) { [-1, 1].forEach(function (c) { o.push([a * t[0] / 2, b * t[1] / 2, c * t[2] / 2]); }); }); }); }
      else if (s.forme === 'cylindre') [-1, 1].forEach(function (e) { [[r, 0], [-r, 0], [0, r], [0, -r]].forEach(function (d) { o.push([d[0], e * s.longueur / 2, d[1]]); }); });
      else if (s.forme === 'sphere') [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]].forEach(function (p) { o.push(p); });
      else if (s.forme === 'tore') { var R = r + s.tube; [[R, 0, 0], [-R, 0, 0], [0, R, 0], [0, -R, 0]].forEach(function (p) { o.push(p); }); }
      else if (s.forme === 'segment') { o.push(s.de, s.a); }
      return o;
    }
    // tous les points de cadrage du matériel à un instant (liens : leurs deux bouts sont déjà portés par les parties)
    function pointsCadre(dev, etat) {
      var out = [];
      dev.parties.forEach(function (p) { var T = placer(p, etat);
        p.solides.forEach(function (s) { if (!s.cadre) return; var Ts = compose(T, s.forme === 'segment' ? ID : repereSolide(s));
          pointsSolide(s).forEach(function (q) { out.push(appliquer(Ts, q)); }); }); });
      return out;
    }

    // ── les poses : une image = par os [qx, qy, qz, qw, tx, ty, tz] ──
    function slerp(a, b, t) {
      var c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; if (c < 0) { b = b.map(function (x) { return -x; }); c = -c; }
      if (c > 0.9995) { var r = a.map(function (x, i) { return x + (b[i] - x) * t; }), l = Math.hypot(r[0], r[1], r[2], r[3]); return r.map(function (x) { return x / l; }); }
      var th = Math.acos(c), s = Math.sin(th); return a.map(function (x, i) { return (x * Math.sin((1 - t) * th) + b[i] * Math.sin(t * th)) / s; });
    }
    function lerpV(a, b, k) { if (typeof a === 'number') return a + (b - a) * k; return a.map(function (x, i) { return x + (b[i] - x) * k; }); }
    // l'état complet d'un exercice : quand = 'depart' | 'fin' | temps en secondes dans la boucle
    function poseA(A, quand) {
      var os = {}, pistes = {}, bo = A.boucle, i, j, k;
      if (quand === 'depart' || quand === 'fin') {
        A.os.forEach(function (n, x) { var v = A[quand][x]; os[n] = { q: v.slice(0, 4), t: v.slice(4, 7) }; });
        Object.keys(A.pistes || {}).forEach(function (n) { pistes[n] = A.pistes[n][quand]; });
        return { os: os, pistes: pistes };
      }
      var f = ((quand / bo.dur * bo.N) % bo.N + bo.N) % bo.N; i = Math.floor(f); j = (i + 1) % bo.N; k = f - i;
      A.os.forEach(function (n, x) { var a = A.images[i][x], b = A.images[j][x]; os[n] = { q: slerp(a.slice(0, 4), b.slice(0, 4), k), t: lerpV(a.slice(4, 7), b.slice(4, 7), k) }; });
      Object.keys(A.pistes || {}).forEach(function (n) { var P = A.pistes[n].images; pistes[n] = lerpV(P[i], P[j], k); });
      return { os: os, pistes: pistes };
    }

    // ── le cadrage : même caméra que la page (perspective 18°, regard sur la cible) ──
    var FOV = 18, LARGEUR = 356, MARGE = { haut: 0.06, bas: 0.01, cote: 0.01 }, AZ = [0, 45, 90, 135, 180, 225, 270, 315];
    var VUES = { profil: [0, 6], face: [90, 6], dos: [-90, 6], troisQuarts: [45, 6] };
    function vuesDe(A) { return Object.assign({}, VUES, A.vues || {}); }
    function angles(A) { var v = vuesDe(A); return AZ.map(function (a) { return ['az' + a, a, 6]; }).concat(Object.keys(v).map(function (n) { return [n, v[n][0], v[n][1]]; })); }
    function hauteurDe(A) { return A.hauteurVue || 320; }
    // PTS : une liste de nuages de points (un par instant) ; rend la pire marge de chaque bord, et où
    function marges(PTS, A, cible, dist, H, marge) {
      marge = marge || MARGE; var asp = LARGEUR / H, t = Math.tan(FOV * Math.PI / 360), pire = { haut: 1, bas: 1, gauche: 1, droite: 1 }, ou = {}, AN = angles(A);
      PTS.forEach(function (pts, k) { AN.forEach(function (an) {
        var a = an[1] * Math.PI / 180, e = an[2] * Math.PI / 180;
        var cam = [cible[0] + dist * Math.cos(e) * Math.sin(a), cible[1] + dist * Math.sin(e), cible[2] + dist * Math.cos(e) * Math.cos(a)];
        var f = norm(sub(cible, cam)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f), x0 = 1, x1 = -1, y0 = 1, y1 = -1;
        for (var n = 0; n < pts.length; n++) { var d = sub(pts[n], cam), z = dot(d, f), x = dot(d, r) / (z * t * asp), y = dot(d, u) / (z * t);
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        var m = { haut: (1 - y1) / 2, bas: (y0 + 1) / 2, gauche: (x0 + 1) / 2, droite: (1 - x1) / 2 };
        for (var c in m) if (m[c] < pire[c]) { pire[c] = m[c]; ou[c] = an[0] + ' · instant ' + k; } }); });
      return { ok: pire.haut >= marge.haut && pire.bas >= marge.bas && pire.gauche >= marge.cote && pire.droite >= marge.cote, pire: pire, ou: ou };
    }
    // la caméra la plus proche qui tient les marges (avec une réserve), cible au centre de la boîte en x et z
    function chercherCamera(PTS, A, H, reserve) {
      reserve = reserve || 0.003; var mg = { haut: MARGE.haut + reserve, bas: MARGE.bas + reserve, cote: MARGE.cote + reserve };
      var mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      PTS.forEach(function (pts) { pts.forEach(function (p) { for (var d = 0; d < 3; d++) { if (p[d] < mn[d]) mn[d] = p[d]; if (p[d] > mx[d]) mx[d] = p[d]; } }); });
      var cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2, cyM = (mn[1] + mx[1]) / 2, best = null;
      for (var cy = Math.round(cyM - 30); cy <= cyM + 30; cy += 1) {
        var lo = 150, hi = 3000; if (!marges(PTS, A, [cx, cy, cz], hi, H, mg).ok) continue;
        for (var i = 0; i < 16; i++) { var m = (lo + hi) / 2; if (marges(PTS, A, [cx, cy, cz], m, H, mg).ok) hi = m; else lo = m; }
        if (!best || hi < best.dist) best = { cible: [+cx.toFixed(1), cy, +cz.toFixed(1)], dist: Math.ceil(hi), auto: true };
      }
      return best;
    }
    // les instants d'échantillonnage (12 par boucle)
    function instants12(A) { var o = []; for (var k = 0; k < 12; k++) o.push(A.boucle.dur * k / 12); return o; }

    return { add: add, sub: sub, mul: mul, dot: dot, cross: cross, len: len, norm: norm, qMul: qMul, qRot: qRot, qInv: qInv, qAxe: qAxe, qEuler: qEuler, qBase: qBase,
      compose: compose, appliquer: appliquer, inverser: inverser, locale: locale, developper: developper, placer: placer, pointDe: pointDe, repereSolide: repereSolide,
      pointsSolide: pointsSolide, pointsCadre: pointsCadre, poseA: poseA, slerp: slerp, marges: marges, chercherCamera: chercherCamera, angles: angles, vuesDe: vuesDe,
      hauteurDe: hauteurDe, instants12: instants12, MARGE: MARGE, LARGEUR: LARGEUR, FOV: FOV, VUES: VUES, MUSCLES_APP: MUSCLES_APP, LIBELLES: LIBELLES,
      rolesDuCatalogue: rolesDuCatalogue };
  })();

  // ════════════════════════ navigateur (rien ne s'exécute au chargement : tout attend le premier `monter`) ════════════════════════
  // les couleurs du bonhomme des muscles (styles.css : --bh-fond, --bh-corps, --trait, --teinte = 0x5cb8ff) — pour WebGL, en nombres
  var COUL = { fond: 0x10151c, noyau: 0x1b222c, noyauBras: 0x26303d, muscle: 0x2b3442, muscleBras: 0x354152, prim: 0x5cb8ff, sec: 0x4f95ce, stab: 0x43739d,
    lisere: 0x7f93b2, contour: 0x56657d, sol: 0x161b23, barre: 0xc9ced6, disque: 0x8c97a6, repere: 0xffb938, banc: 0x2f3846, potence: 0x3a4556,
    machine: 0x343d4b, coussin: 0x3b4555, fonte: 0x59636f, cable: 0x9aa3af, corde: 0xa89c80, bande: 0x1d232c };
  function reduire() { return !!(racine.matchMedia && racine.matchMedia('(prefers-reduced-motion: reduce)').matches); }

  // ── chargement à la demande : vendor (une fois), corps (une fois), exercice (une fois par URL). Un échec n'est jamais gardé :
  //    hors ligne aujourd'hui, la fiche suivante réessaie. ──
  var promesses = {};
  function memo(cle, f) {
    if (promesses[cle]) return promesses[cle];
    var p = promesses[cle] = f();
    p.catch(function () { if (promesses[cle] === p) delete promesses[cle]; });
    return p;
  }
  function script(src) {
    return memo('s:' + src, function () {
      return new Promise(function (ok, ko) {
        var s = document.createElement('script'); s.src = src; s.async = false;
        s.onload = ok;
        s.onerror = function () { if (s.parentNode) s.parentNode.removeChild(s); ko(new Error('script ' + src)); };
        document.head.appendChild(s);
      });
    });
  }
  function vendor() {
    if (racine.THREE && racine.THREE.GLTFLoader) return Promise.resolve();
    return (racine.THREE ? Promise.resolve() : script(VENDOR + 'three.min.js'))
      .then(function () { return racine.THREE.GLTFLoader ? null : script(VENDOR + 'GLTFLoader.js'); });
  }
  function json(u) {
    return memo('j:' + u, function () {
      return fetch(u).then(function (r) { if (!r.ok) throw new Error(u + ' : ' + r.status); return r.json(); });
    });
  }
  function chargerCorps() {
    return memo('c:' + CORPS, function () {
      return json(CORPS).then(function (j) {
        var s = atob(j.b64), u = new Uint8Array(s.length); for (var k = 0; k < s.length; k++) u[k] = s.charCodeAt(k);
        return new Promise(function (ok, ko) { new racine.THREE.GLTFLoader().parse(u.buffer, '', ok, ko); });
      });
    });
  }

  // `masque` — 24 flottants partagés : un muscle dont l'entrée vaut 1 n'est pas dessiné (attribut `_muscle`)
  function avecLisere(T3, mat, coul, force, l0, l1, masque) {
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uLis = { value: new T3.Color(coul) }; sh.uniforms.uLisF = { value: force };
      if (masque) { sh.uniforms.uMasque = { value: masque };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 _muscle; uniform float uMasque[24]; varying float vMasque;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n vMasque = uMasque[int(_muscle.x + 0.5)];');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vMasque;')
          .replace('void main() {', 'void main() {\n if (vMasque > 0.5) discard;'); }
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uLis; uniform float uLisF;')
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n float bordL = 1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition)));\n' +
          ' gl_FragColor.rgb = mix(gl_FragColor.rgb, uLis, smoothstep(' + l0.toFixed(2) + ', ' + l1.toFixed(2) + ', bordL) * uLisF);');
    };
    return mat;
  }

  // ── l'atelier : UN rendu, UN corps, des cartes ──
  function Atelier(corps) {
    var T3 = racine.THREE, REDUIRE = reduire();
    // un canevas à nous : three.js r128 pose `style.display` sur celui qu'il crée ; la classe suffit
    var ren = new T3.WebGLRenderer({ canvas: document.createElement('canvas'), antialias: true, preserveDrawingBuffer: true });
    ren.setPixelRatio(Math.min(racine.devicePixelRatio || 1, 1.5));
    ren.domElement.className = 'thm-canevas';   // largeur 100 %, hauteur auto, glisser horizontal (styles.css)
    ren.domElement.setAttribute('role', 'img');
    var scene = new T3.Scene(); scene.background = new T3.Color(COUL.fond);
    scene.add(new T3.AmbientLight(0xffffff, 0.5));
    scene.add(new T3.HemisphereLight(0xf2f6ff, 0x2a3240, 0.45));
    var l1 = new T3.DirectionalLight(0xffffff, 0.42); l1.position.set(90, 160, 140); scene.add(l1);
    var l2 = new T3.DirectionalLight(0xb8d4ff, 0.18); l2.position.set(-120, 80, -100); scene.add(l2);
    var cam = new T3.PerspectiveCamera(Commun.FOV, 1, 10, 5000);

    var noms = corps.parser.json.extras.muscles, os = {}, muscles = null, mains = {}, masque = new Array(24).fill(0), peaux = [];
    var estBras = (corps.parser.json.extras.os || []).map(function (n) { return /^(bras|avbp|avbd|main|coude_mi)_/.test(n); });
    corps.scene.traverse(function (o) {
      if (o.isBone) os[o.name] = o;
      if (o.isSkinnedMesh) {
        o.frustumCulled = false; peaux.push(o);
        if (o.material && o.material.dispose) o.material.dispose();   // le corps est partagé entre deux rendus successifs
        if (o.geometry.attributes._muscle) { muscles = o;
          o.geometry.setAttribute('color', new T3.BufferAttribute(new Float32Array(o.geometry.attributes.position.count * 3), 3));
          o.material = avecLisere(T3, new T3.MeshPhongMaterial({ vertexColors: true, shininess: 10, specular: 0x10161f, skinning: true }), COUL.lisere, 0.8, 0.58, 0.9, masque);
        } else {
          teinterBras(o);   // les bras un ton plus clair que le tronc
          o.material = avecLisere(T3, new T3.MeshPhongMaterial({ vertexColors: true, shininess: 6, specular: 0x0d1117, skinning: true,
            polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 6 }), COUL.contour, 0.7, 0.66, 0.97);
          if (/mains_B/.test(o.name)) mains.B = o; if (/mains_D/.test(o.name)) mains.D = o;
        }
      }
    });
    function poidsBras(geo, i) { var si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, w = 0, t = 0;
      var j4 = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)], w4 = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
      for (var k = 0; k < 4; k++) { t += w4[k]; if (estBras[j4[k]]) w += w4[k]; } return t ? w / t : 0; }
    function teinterBras(o) { var g = o.geometry, n = g.attributes.position.count, col = new Float32Array(n * 3), a = new T3.Color(COUL.noyau), b = new T3.Color(COUL.noyauBras), c = new T3.Color();
      for (var i = 0; i < n; i++) { c.copy(a).lerp(b, Math.min(1, poidsBras(g, i))); col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; }
      g.setAttribute('color', new T3.BufferAttribute(col, 3)); }
    if (!mains.B || !mains.D) { var s0 = []; corps.scene.traverse(function (o) { if (o.isSkinnedMesh && o !== muscles) s0.push(o); }); mains.B = s0[1]; mains.D = s0[2]; }
    scene.add(corps.scene);
    var BRAS_M = ['biceps', 'triceps', 'avant_bras'];
    function masquer(liste) { for (var i = 0; i < 24; i++) masque[i] = (liste || []).indexOf(noms[i]) >= 0 ? 1 : 0; }
    function colorer(roles) {
      var id = muscles.geometry.attributes._muscle, col = muscles.geometry.attributes.color, c = new T3.Color(), o = ['prim', 'sec', 'stab'];
      for (var i = 0; i < id.count; i++) { var m = noms[id.getX(i)], r = null;
        for (var k = 0; k < 3; k++) if ((roles[o[k]] || []).indexOf(m) >= 0) { r = o[k]; break; }
        c.setHex(r ? COUL[r] : (BRAS_M.indexOf(m) >= 0 ? COUL.muscleBras : COUL.muscle)); col.setXYZ(i, c.r, c.g, c.b); }
      col.needsUpdate = true;
    }

    // ── le matériel, construit depuis les solides de la partie commune ──
    var mm = new T3.MeshLambertMaterial({ color: COUL.barre });
    var partages = {};
    function matiere(s) {
      var st = s.style || 'machine', coul = s.couleur ? parseInt(String(s.couleur).replace('#', ''), 16) : COUL[st];
      switch (st) {
        case 'metal': return s.couleur ? new T3.MeshLambertMaterial({ color: coul }) : mm;
        case 'metalFondu': return new T3.MeshLambertMaterial({ color: COUL.barre, transparent: true, opacity: s.opacite });
        case 'disque': return new T3.MeshBasicMaterial({ color: COUL.disque, transparent: true, opacity: s.opacite, depthWrite: false, side: T3.DoubleSide });
        case 'disqueFace': return new T3.MeshBasicMaterial({ color: COUL.disque, transparent: true, opacity: s.opacite, depthWrite: false, side: T3.DoubleSide });
        case 'disqueBord': return new T3.MeshBasicMaterial({ color: 0xaab4c2, transparent: true, opacity: s.opacite, depthWrite: false });
        case 'sol': return new T3.MeshBasicMaterial({ color: COUL.sol });
        default: if (s.couleur) return new T3.MeshLambertMaterial({ color: coul });
          return partages[st] || (partages[st] = new T3.MeshLambertMaterial({ color: coul === undefined ? COUL.machine : coul }));
      }
    }
    function boiteArrondie(t, r) {
      r = Math.min(r, t[0] / 2 - 0.01, t[1] / 2 - 0.01, t[2] / 2 - 0.01); var w = t[0] / 2 - r, h = t[1] / 2 - r, sh = new T3.Shape();
      sh.moveTo(-w, -h - r); sh.lineTo(w, -h - r); sh.absarc(w, -h, r, -Math.PI / 2, 0); sh.lineTo(w + r, h); sh.absarc(w, h, r, 0, Math.PI / 2);
      sh.lineTo(-w, h + r); sh.absarc(-w, h, r, Math.PI / 2, Math.PI); sh.lineTo(-w - r, -h); sh.absarc(-w, -h, r, Math.PI, 1.5 * Math.PI);
      var g = new T3.ExtrudeGeometry(sh, { depth: Math.max(0.01, t[2] - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: 0, bevelSegments: 3, curveSegments: 4 });
      g.translate(0, 0, -(t[2] - 2 * r) / 2); return g;
    }
    function maillage(s) {
      var g, m = matiere(s), seg = s.segments;
      if (s.forme === 'ligne') {
        var lg = new T3.BufferGeometry().setFromPoints([new T3.Vector3(s.de[0], s.de[1], s.de[2]), new T3.Vector3(s.a[0], s.a[1], s.a[2])]);
        var li = new T3.Line(lg, new T3.LineDashedMaterial({ color: COUL.repere, dashSize: 3, gapSize: 2.6, transparent: true, opacity: 0.8 })); li.computeLineDistances(); return li;
      }
      if (s.forme === 'segment') { var o = segmentMaillage(s.rayon, m); poserSegment(o, s.de, s.a); return o; }
      if (s.forme === 'boite') g = s.arrondi ? boiteArrondie(s.taille, s.arrondi) : new T3.BoxGeometry(s.taille[0], s.taille[1], s.taille[2]);
      else if (s.forme === 'cylindre') g = new T3.CylinderGeometry(s.rayon, s.rayon, s.longueur, seg || 20, 1, !!s.ouvert);
      else if (s.forme === 'sphere') g = new T3.SphereGeometry(s.rayon, 20, 14);
      else if (s.forme === 'tore') g = new T3.TorusGeometry(s.rayon, s.tube, seg ? seg[0] : 8, seg ? seg[1] : 32);
      else if (s.forme === 'anneau') g = new T3.RingGeometry(s.interieur, s.rayon, seg || 48);
      else if (s.forme === 'cercle') g = new T3.CircleGeometry(s.rayon, seg || 48);
      var me = new T3.Mesh(g, m), R = Commun.repereSolide(s);
      me.position.set(R.t[0], R.t[1], R.t[2]); me.quaternion.set(R.q[0], R.q[1], R.q[2], R.q[3]);
      if (s.ordre) me.renderOrder = s.ordre;
      return me;
    }
    var unitY = new T3.Vector3(0, 1, 0), vS = new T3.Vector3();
    function segmentMaillage(r, m) { return new T3.Mesh(new T3.CylinderGeometry(r, r, 1, 8), m); }
    function poserSegment(me, a, b) { var d = Commun.sub(b, a), l = Commun.len(d) || 0.001; me.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      vS.set(d[0] / l, d[1] / l, d[2] / l); me.quaternion.setFromUnitVectors(unitY, vS); me.scale.set(1, l, 1); }
    function materiel(A) {
      var dev = Commun.developper(A.materiel), g = new T3.Group(), groupes = {}, fondus = [];
      dev.parties.forEach(function (p) {
        var gp = new T3.Group(); gp.matrixAutoUpdate = false; groupes[p.id] = gp;
        p.solides.forEach(function (s) { var me = maillage(s); gp.add(me);
          if (s.fondu) fondus.push({ partie: p.id, mat: me.material, base: s.opacite, bout: !!s.fondu.bout }); });
        g.add(gp);
      });
      var liens = dev.liens.map(function (l) { var me = segmentMaillage(l.rayon, matiere({ style: l.style })); g.add(me); return { l: l, me: me }; });
      return { groupe: g, dev: dev, groupes: groupes, fondus: fondus, liens: liens };
    }
    function isPartage(m) { for (var k in partages) if (partages[k] === m) return true; return false; }
    function liberer(mt) { mt.groupe.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== mm && !isPartage(o.material)) o.material.dispose(); }); }

    var ex = null, mat = null, ordre = null, etat = { os: {}, pistes: {} };
    var qa = new T3.Quaternion(), qb = new T3.Quaternion(), va = new T3.Vector3(), vb = new T3.Vector3(), un = new T3.Vector3(1, 1, 1);
    function poserOs(im1, im2, k) {
      for (var i = 0; i < ordre.length; i++) { var a = im1[i], b = im2 ? im2[i] : a;
        qa.set(a[0], a[1], a[2], a[3]); qb.set(b[0], b[1], b[2], b[3]); qa.slerp(qb, k);
        va.set(a[4], a[5], a[6]); vb.set(b[4], b[5], b[6]); va.lerp(vb, k); ordre[i].matrix.compose(va, qa, un);
        var e = etat.os[ex.os[i]] || (etat.os[ex.os[i]] = { q: [0, 0, 0, 1], t: [0, 0, 0] });
        e.q[0] = qa.x; e.q[1] = qa.y; e.q[2] = qa.z; e.q[3] = qa.w; e.t[0] = va.x; e.t[1] = va.y; e.t[2] = va.z; }
    }
    function poserMateriel() {
      var places = {};
      mat.dev.parties.forEach(function (p) { var T = Commun.placer(p, etat); places[p.id] = T;
        qa.set(T.q[0], T.q[1], T.q[2], T.q[3]); va.set(T.t[0], T.t[1], T.t[2]); mat.groupes[p.id].matrix.compose(va, qa, un); });
      mat.liens.forEach(function (x) { poserSegment(x.me, Commun.pointDe(x.l.de, etat, places), Commun.pointDe(x.l.a, etat, places)); });
      mat.places = places;
    }
    function instant(e) {
      var P = ex.pistes || {}, n;
      if (e.mode === 'fin' || e.mode === 'depart') { poserOs(ex[e.mode], null, 0); for (n in P) etat.pistes[n] = P[n][e.mode]; }
      else { var bo = ex.boucle, f = (e.t / bo.dur * bo.N) % bo.N, i = Math.floor(f), j = (i + 1) % bo.N, k = f - i;
        poserOs(ex.images[i], ex.images[j], k);
        for (n in P) { var a = P[n].images[i], b = P[n].images[j]; etat.pistes[n] = typeof a === 'number' ? a + (b - a) * k : a.map(function (x, q) { return x + (b[q] - x) * k; }); } }
      poserMateriel(); annoncer(e);
    }
    function annoncer(e) {
      if (!e.annonce) return; var txt = '', an = ex.boucle.annonces || [];
      for (var i = 0; i < an.length; i++) { var a = an[i];
        if (e.mode === 'joue' || e.mode === 'fige') { var t = ((e.t % ex.boucle.dur) + ex.boucle.dur) % ex.boucle.dur; if (t >= a.de && t <= a.a) txt = a.texte; }
        else if (a.instant && ex.boucle[e.mode] === a.instant) txt = a.texte; }
      if (e.annonce.textContent !== txt) { e.annonce.textContent = txt; e.annonce.hidden = !txt; }
    }
    var cible = new T3.Vector3(), vC = new T3.Vector3(), vG = new T3.Vector3();
    function placer(e) {
      var a = e.az * Math.PI / 180, el = e.el * Math.PI / 180;
      cam.position.set(cible.x + e.dist * Math.cos(el) * Math.sin(a), cible.y + e.dist * Math.sin(el), cible.z + e.dist * Math.cos(el) * Math.cos(a));
      cam.lookAt(cible);
      // les disques s'effacent quand l'œil est dans l'axe de la barre : de profil, ils ne cachent jamais le corps
      mat.fondus.forEach(function (d) { var T = mat.places[d.partie]; vG.set(T.t[0], T.t[1], T.t[2]); vC.copy(cam.position).sub(vG).normalize();
        var f = Math.min(1, Math.max(0, (Math.abs(vC.z) - 0.8) / 0.15)); d.mat.opacity = d.base * (1 - f * (d.bout ? 0.9 : 1)); d.mat.depthWrite = d.mat.opacity > 0.99; });
    }
    function charger(e) {
      if (ex === e.donnees) return; ex = e.donnees;
      if (mat) scene.remove(mat.groupe); mat = e.materiel || (e.materiel = materiel(ex)); scene.add(mat.groupe);
      ordre = ex.os.map(function (n) { var b = os[n]; b.matrixAutoUpdate = false; return b; });
      colorer(e.roles); masquer(ex.effacer); mains.B.visible = ex.main === 'B'; mains.D.visible = ex.main === 'D';
      if (!e.camera) e.camera = ex.camera || cadrageAuto(e);
      cible.set(e.camera.cible[0], e.camera.cible[1], e.camera.cible[2]);
    }
    // cadrage automatique à l'exécution (un JSON sans caméra) : peau posée (un sommet sur 6) + matériel, 12 instants,
    // mêmes marges que la fabrique, avec une réserve de 1 % pour l'échantillonnage
    function cadrageAuto(e) {
      var PTS = [], v = new T3.Vector3(), s = new T3.Vector3(), m4 = new T3.Matrix4(), sv = { mode: e.mode, t: e.t };
      Commun.instants12(ex).forEach(function (t) {
        e.mode = 'fige'; e.t = t; instant(e); corps.scene.updateMatrixWorld(true); var pts = [];
        peaux.forEach(function (o) { if (!o.visible) return; var g = o.geometry, P = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
          var dq = P.normalized ? 1 / ({ 1: 127, 2: 32767 }[P.array.BYTES_PER_ELEMENT] || 1) : 1;   // r128 : getX ne dénormalise pas
          for (var i = 0; i < P.count; i += 6) { v.fromBufferAttribute(P, i).multiplyScalar(dq); var acc = [0, 0, 0], wt = 0;
            for (var k = 0; k < 4; k++) { var w = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)][k]; if (!w) continue; var j = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)][k];
              m4.multiplyMatrices(o.skeleton.bones[j].matrixWorld, o.skeleton.boneInverses[j]); s.copy(v).applyMatrix4(o.bindMatrix).applyMatrix4(m4); acc[0] += s.x * w; acc[1] += s.y * w; acc[2] += s.z * w; wt += w; }
            if (wt) pts.push([acc[0] / wt, acc[1] / wt, acc[2] / wt]); } });
        PTS.push(pts.concat(Commun.pointsCadre(mat.dev, etat)));
      });
      e.mode = sv.mode; e.t = sv.t;
      return Commun.chercherCamera(PTS, ex, Commun.hauteurDe(ex), 0.013);
    }
    function rendre(e, w, h) {
      charger(e); if (w) { ren.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
      instant(e); placer(e); ren.render(scene, cam);
    }

    var cartes = [], active = null, enCours = false, rafId = 0, dernier = null, visible = true, mort = false;
    function demander() { if (!enCours && !mort) { enCours = true; rafId = racine.requestAnimationFrame(boucle); } }
    function boucle(now) {
      enCours = false; if (!active || mort) return; var e = active;
      if (e.tween) { var k = Math.min(1, (now - e.tween.t0) / e.tween.dur), s = 0.5 - 0.5 * Math.cos(Math.PI * k);
        e.az = e.tween.az0 + e.tween.daz * s; e.el = e.tween.el0 + e.tween.del * s; if (k >= 1) e.tween = null; }
      if (e.mode === 'joue') { if (dernier !== null) e.t += (now - dernier) / 1000; dernier = now; } else dernier = null;
      rendre(e);
      if ((e.mode === 'joue' || e.tween) && visible) demander(); else dernier = null;
      if (e.surRendu) e.surRendu();
    }
    var io = racine.IntersectionObserver ? new racine.IntersectionObserver(function (l) { visible = l[0].isIntersecting; if (visible) demander(); }) : null;
    function figer(e) { rendre(e, e.w, e.h); e.img.src = ren.domElement.toDataURL('image/png'); e.img.hidden = false; }
    function activer(e) {
      if (active === e || mort) return;
      if (active) { figer(active); active.hote.classList.remove('active'); }
      active = e; e.img.hidden = true; e.hote.insertBefore(ren.domElement, e.img); e.hote.classList.add('active');
      ren.domElement.setAttribute('aria-label', e.donnees.nom + ' en 3D. Glisse pour tourner autour.');
      if (io) { io.disconnect(); io.observe(e.hote); }
      rendre(e, e.w, e.h); dernier = null; demander();
      cartes.forEach(function (c) { if (c.surEtat) c.surEtat(); });
    }
    var glisse = null;
    ren.domElement.addEventListener('pointerdown', function (ev) { if (!active) return; glisse = { x: ev.clientX, y: ev.clientY }; active.tween = null;
      try { ren.domElement.setPointerCapture(ev.pointerId); } catch (x) { /* un pointeur déjà relâché */ } });
    ren.domElement.addEventListener('pointermove', function (ev) { if (!glisse || !active) return;
      active.az -= (ev.clientX - glisse.x) * 0.5; active.el = Math.max(-8, Math.min(80, active.el + (ev.clientY - glisse.y) * 0.35));
      glisse = { x: ev.clientX, y: ev.clientY }; demander(); });
    ['pointerup', 'pointercancel'].forEach(function (t) { ren.domElement.addEventListener(t, function () { glisse = null; }); });

    return {
      carte: function (hote, donnees, roles, w, h, annonce) {
        var img = document.createElement('img'); img.className = 'thm-fige'; img.alt = donnees.nom + ', image figée. Touche pour l’animer.'; img.width = w; img.height = h;
        hote.appendChild(img);
        var vues = Commun.vuesDe(donnees), v0 = vues[donnees.vueInitiale || 'profil'];
        var e = { hote: hote, img: img, donnees: donnees, roles: roles, w: w, h: h, az: v0[0], el: v0[1], t: 0, mode: REDUIRE ? 'fin' : 'joue', vues: vues, tween: null, annonce: annonce };
        rendre(e, w, h); e.dist = e.camera.dist;   // la caméra (donnée ou calculée) est connue au premier rendu
        img.addEventListener('click', function () { activer(e); });
        cartes.push(e); figer(e); return e;
      },
      retirer: function (e) {
        var i = cartes.indexOf(e); if (i < 0) return; cartes.splice(i, 1);
        if (active === e) { active = null; if (ren.domElement.parentNode) ren.domElement.parentNode.removeChild(ren.domElement); if (io) io.disconnect(); }
        if (ex === e.donnees) { if (mat) scene.remove(mat.groupe); ex = null; mat = null; }
        if (e.materiel) liberer(e.materiel); e.materiel = null;
      },
      // le dernier arrêt : plus de boucle, plus d'observateur, le contexte WebGL rendu au navigateur
      detruire: function () {
        mort = true; active = null; if (rafId && racine.cancelAnimationFrame) racine.cancelAnimationFrame(rafId); enCours = false;
        if (io) io.disconnect();
        cartes.slice().forEach(function (c) { if (c.materiel) liberer(c.materiel); }); cartes = [];
        if (ren.domElement.parentNode) ren.domElement.parentNode.removeChild(ren.domElement);
        scene.remove(corps.scene); mm.dispose(); Object.keys(partages).forEach(function (k) { partages[k].dispose(); });
        ren.dispose(); if (ren.forceContextLoss) ren.forceContextLoss();
      },
      activer: activer,
      vue: function (e, nom) { activer(e); var v = e.vues[nom]; if (!v) return;
        if (REDUIRE) { e.az = v[0]; e.el = v[1]; e.tween = null; } else { var d = ((v[0] - e.az) % 360 + 540) % 360 - 180; e.tween = { t0: racine.performance.now(), az0: e.az, el0: e.el, daz: d, del: v[1] - e.el, dur: 600 }; }
        demander(); },
      pose: function (e, m) { activer(e); e.mode = m; dernier = null; demander(); },
      active: function () { return active; },
      canevas: ren.domElement,
      reduire: REDUIRE
    };
  }

  // ── l'API de l'app : un atelier tant qu'au moins une vue est montée ──
  var atelier = null, atelierP = null, montees = 0;
  function el(tag, cls, txt) { var x = document.createElement(tag); if (cls) x.className = cls; if (txt !== undefined) x.textContent = txt; return x; }
  function bouton(txt, attr, val) { var b = el('button', 'thm-btn', txt); b.type = 'button'; b.setAttribute(attr, val); return b; }
  function rangee(label) { var r = el('div', 'thm-cmd'); r.setAttribute('role', 'group'); r.setAttribute('aria-label', label); return r; }
  function libererSiPersonne() {
    if (montees > 0 || !atelier) return;
    atelier.detruire(); atelier = null; atelierP = null;
  }

  function monter(conteneur, u, options) {
    options = options || {};
    var fini = false, carte = null;
    montees++;
    var racineVue = el('div', 'thm'); conteneur.appendChild(racineVue);
    var hote = el('div', 'thm-vue');
    var attente = el('p', 'thm-attente', 'Chargement du mouvement…');
    hote.appendChild(attente); racineVue.appendChild(hote);
    var annonce = el('span', 'thm-annonce'); annonce.setAttribute('aria-live', 'polite'); annonce.hidden = true;
    var h = { racine: racineVue, donnees: null, arreter: arreter, monte: false };
    // ⚠️ UN ÉCHEC NE SE VOIT PAS : hors ligne et jamais vue, la vue se retire, la page reste celle d'avant. Jamais une erreur.
    function echec(err) {
      if (!fini) { arreter(); if (options.surErreur) options.surErreur(err); }
      return null;
    }
    h.pret = vendor().then(function () {
      if (fini) return null;
      if (!atelierP) {
        var p = atelierP = chargerCorps().then(function (c) { var A = Atelier(c); if (atelierP === p) atelier = A; else A.detruire(); return A; });
        p.catch(function () { if (atelierP === p) atelierP = null; });
      }
      return Promise.all([atelierP, json(u)]);
    }).then(function (r) {
      if (fini || !r) { libererSiPersonne(); return null; }
      var A = r[0], D = r[1]; h.donnees = D;
      if (A !== atelier) return echec(new Error('atelier remplacé'));
      var cat = Commun.rolesDuCatalogue(options.muscles);
      if (attente.parentNode) attente.parentNode.removeChild(attente);
      var w = hote.clientWidth || Commun.LARGEUR, hh = Math.round(w * Commun.hauteurDe(D) / Commun.LARGEUR);
      carte = A.carte(hote, D, cat.roles, w, hh, annonce); hote.appendChild(annonce);
      var lab = el('span', 'thm-lab', 'GLISSE POUR TOURNER'); hote.appendChild(lab);
      var bt = [];
      if (options.commandes !== false) {
        var r1 = rangee('Vue'); [['Face', 'face'], ['Dos', 'dos']].forEach(function (x) { r1.appendChild(bouton(x[0], 'data-vue', x[1])); });
        var r2 = rangee('Lecture'); [['Départ', 'depart'], ['Fin', 'fin'], ['▶ Lecture', 'joue']].forEach(function (x) { var b = bouton(x[0], 'data-pose', x[1]); bt.push(b); r2.appendChild(b); });
        racineVue.appendChild(r1); racineVue.appendChild(r2);
        racineVue.addEventListener('click', function (ev) { var b = ev.target.closest && ev.target.closest('button'); if (!b || !carte || fini) return;
          if (b.hasAttribute('data-vue')) A.vue(carte, b.getAttribute('data-vue'));
          if (b.hasAttribute('data-pose')) A.pose(carte, b.getAttribute('data-pose')); marquer(); });
      }
      function marquer() {
        lab.textContent = A.active() === carte ? 'GLISSE POUR TOURNER' : 'GLISSE POUR TOURNER · TOUCHE POUR ANIMER';
        bt.forEach(function (b) { b.setAttribute('aria-pressed', String(A.active() === carte && carte.mode === b.getAttribute('data-pose'))); });
      }
      carte.surEtat = marquer; marquer();
      if (options.legende !== false) {
        var lib = options.libelles || Commun.LIBELLES, ul = el('ul', 'thm-leg');
        [['prim', 'primaires', 'Travaille'], ['sec', 'secondaires', 'Aide'], ['stab', 'stabilisateurs', 'Stabilise']].forEach(function (x) {
          var cles = ((options.muscles || {})[x[1]] || []).filter(function (k) { return Commun.MUSCLES_APP[k]; }); if (!cles.length) return;
          var li = el('li'); li.appendChild(el('i', 'thm-' + x[0])); li.appendChild(el('b', null, x[2]));
          li.appendChild(el('span', null, cles.map(function (k) { return lib[k] || k; }).join(', '))); ul.appendChild(li); });
        if (ul.childNodes.length) racineVue.appendChild(ul);
      }
      h.carte = carte; h.atelier = A; h.monte = true;
      h.vue = function (n) { if (!fini) A.vue(carte, n); }; h.pose = function (m) { if (!fini) { A.pose(carte, m); marquer(); } };
      if (options.actif !== false) A.activer(carte);
      return h;
    }).catch(echec);
    function arreter() {
      if (fini) return; fini = true; montees--;
      if (carte && atelier) atelier.retirer(carte);
      carte = null;
      if (racineVue.parentNode) racineVue.parentNode.removeChild(racineVue);
      libererSiPersonne();
    }
    return h;
  }

  // l'état, pour les bancs : combien de vues montées, un rendu WebGL vivant ou non
  function etat() { return { montees: montees, atelier: !!atelier }; }

  var api = { CATALOGUE: CATALOGUE, existe: existe, url: url, monter: monter, etat: etat, commun: Commun,
              MUSCLES_APP: Commun.MUSCLES_APP, rolesDuCatalogue: Commun.rolesDuCatalogue, version: 8 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  racine.THMouvement = api;
})(typeof self !== 'undefined' ? self : globalThis);
