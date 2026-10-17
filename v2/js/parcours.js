// v2/js/parcours.js — « Ton parcours » (chantier 75, ECRAN-SAISIE §7 bis.14 ter).
//
// Le bilan de toute la progression : pour les six derniers mois contre les six d'avant, le verdict de chaque
// exercice et de chaque groupe (les six zones du volume), ce qui a pris le relais d'un exercice moins pratiqué, trois
// rapports de force avec des repères de pratiquants selon le sexe du profil, le levier pris dans les priorités, et
// les courbes des quatre grands mouvements. La référence `tests/unit/fixtures/parcours75.py` fait foi pour chaque
// chiffre ; ce module rend la même forme, les mêmes champs, les mêmes états.
//
// ⚠️ IL APPELLE CE QUI EXISTE, IL NE LE REFAIT PAS : les zones et leurs libellés (`THSemaine.ZONES`,
// `zoneDuMuscle`), les frères et la famille d'un exercice (`Modele.freresDe`, `Modele.cousinsDe` — ce module ne lit
// ni `mouvement` ni `schema_mouvement`), le formateur (`Modele.nombreFixe`). La série de travail se filtre EN AMONT
// (`faits.js`, `Modele.estTravail`) : l'entrée ne porte que des séries de travail.
//
// ⚠️ LE CALCUL EST EXACT là où la référence prend des fractions. Une charge s'y lit en CENTIÈMES entiers (la base
// les garde au centième) : les seuils (× 1,025, × 0,975, 95 %, 105 %, ¼, 1) se comparent par produits croisés
// d'entiers ; les rapports de force, dont les produits dépassent les entiers sûrs, en fractions BigInt. Seule la
// courbe personnelle est en flottants — comme dans la référence, qui la calcule en flottants.
//
// L'entrée : `{ aujourdhui: 'AAAA-MM-JJ', sexe, priorites: [zone…], catalogue: [fiche…],
//               series: [{ debut: 'AAAA-MM-JJ…', seance, slug, reps, charge }] }`.
// La sortie : `{ exercices, zones, levier, rapports, courbes, phrase }` (les fractions de la référence y sont des
// nombres). Pur : aucun accès au DOM, au réseau, au stockage, à l'horloge.

(function (racine) {
  'use strict';

  // ── Les constantes, une fois ─────────────────────────────────────────────
  var MIN_SEANCES = 5;
  var JOURS_R = 182;   // R : du jour J−182 à J inclus
  var JOURS_A = 365;   // P : de J−365 à J−183 inclus
  // Hausse au-delà de × 1,025, baisse en deçà de × 0,975 : en millièmes.
  var HAUSSE = 1025, BAISSE = 975, MILLE = 1000;
  // Les quatre grands mouvements : ils comptent double dans un groupe, ils ont leur courbe.
  // Écrits une fois, dans `THModele` (124, audit du 16/10/2026, 06 #16).
  var GRANDS = racine.THModele.BARRES;
  var NOM_COURT = racine.THModele.NOM_DE_BARRE;
  // Squat ÷ couché, militaire ÷ couché, soulevé ÷ squat.
  var RAPPORTS = [[GRANDS[0], GRANDS[1]], [GRANDS[3], GRANDS[1]], [GRANDS[2], GRANDS[0]]];
  // Repères StrengthLog (carnets d'entraînement), en centièmes : la moyenne des niveaux intermédiaire et avancé de
  // leurs standards d'ensemble (REFERENTIEL §8, décidé le 11/10/2026). Sexe non précisé : pas de repère.
  var REPERES = { homme: [121, 57, 125], femme: [152, 63, 125] };
  // « En dessous » sous 95 % du repère, « au-dessus » au-delà de 105 %.
  var SOUS = 95, DESSUS = 105;
  var REPS_RAPPORT_MAX = 10;
  var REPS_CELLULE_MAX = 15, REPS_COURBE_MAX = 12, REPS_HISTO_MIN = 5;
  // La courbe personnelle : k de 0,005 à 0,080 par pas de 0,001 ; un k au bord ne s'apprend pas (1/30).
  var K_MIN = 5, K_MAX = 80, K_BORD = 1 / 30;
  var SCORE = { '↑': 2, '↗': 1, '▬': 0, '↘': -1, '↓': -2 };
  var MOTS = { 1: 'un', 2: 'deux', 3: 'trois', 4: 'quatre', 5: 'cinq', 6: 'six' };

  function Modele() { return racine.THModele; }
  function Semaine() { return racine.THSemaine; }

  // ── Les jours ────────────────────────────────────────────────────────────
  function jour(debut) { return String(debut).slice(0, 10); }
  function moinsJours(j, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(j);
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] - n));
    var deux = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getUTCFullYear() + '-' + deux(d.getUTCMonth() + 1) + '-' + deux(d.getUTCDate());
  }
  function periodeDe(j, J, debutR, debutP) {
    if (j > J) return null;
    if (j >= debutR) return 'R';
    if (j >= debutP) return 'P';
    return null;
  }

  // Une charge en centièmes entiers (la base la garde au centième).
  function centiemes(x) { return Math.round(Number(x) * 100); }
  function nombreOuNul(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  // ── Les verdicts ─────────────────────────────────────────────────────────
  function verdictReps(h, b, n) {
    if (h - b >= 2) return '↑';
    if (b - h >= 2) return '↓';
    if (h > b && b === 0 && 2 * h >= n) return '↑';
    if (b > h && h === 0 && 2 * b >= n) return '↓';
    if (h > b) return '↗';
    if (b > h) return '↘';
    return '▬';
  }
  function verdictEcart(d) {
    if (d > 0.05) return '↑';
    if (d > 0.025) return '↗';
    if (d < -0.05) return '↓';
    if (d < -0.025) return '↘';
    return '▬';
  }
  // Le verdict d'un groupe, sur la moyenne pondérée `num / den` (den > 0), en entiers : ↑ dès 1, ↗ dès ¼,
  // ▬ au-dessus de −¼, ↘ au-dessus de −1, ↓ sinon.
  function verdictDeGroupe(num, den) {
    if (num >= den) return '↑';
    if (4 * num >= den) return '↗';
    if (4 * num > -den) return '▬';
    if (num > -den) return '↘';
    return '↓';
  }
  // L'arrondi de la référence (`round` de Python) : la moitié au pair.
  function arrondiAuPair(x) {
    var f = Math.floor(x), r = x - f;
    if (r > 0.5) return f + 1;
    if (r < 0.5) return f;
    return f % 2 === 0 ? f : f + 1;
  }

  // ── 95 — DEUX RÈGLES LUES AUSSI PAR LES BILANS (BILANS-V1) ──────────────
  // « Moins pratiqué », « nouveau », « peu » (§7 bis.14 ter, règles 1 à 3), dans l'ordre : le premier qui s'applique,
  // `null` si aucun — l'exercice se compare alors. `nP`, `nR` : ses séances dans chaque période.
  function pratique(nP, nR) {
    if (nP >= MIN_SEANCES && 2 * nR < nP) return 'moins';
    if (nR >= MIN_SEANCES && nP < MIN_SEANCES) return 'nouveau';
    if (nP < MIN_SEANCES || nR < MIN_SEANCES) return 'peu';
    return null;
  }
  // À reps égales (règle 4) : `a`, `b` — la charge la plus lourde par nombre de reps, en centièmes, de P et de R.
  // Moins de deux nombres de reps en commun : `null`. Sinon `{ etat, h, b, communs, detail: [[reps, P, R]…] }`.
  function aRepsEgales(a, b) {
    var com = Object.keys(a).map(Number).filter(function (r) { return Object.prototype.hasOwnProperty.call(b, r); })
      .sort(function (x, y) { return x - y; });
    if (com.length < 2) return null;
    var h = 0, bb = 0;
    com.forEach(function (r) {
      if (MILLE * b[r] > HAUSSE * a[r]) h++;
      if (MILLE * b[r] < BAISSE * a[r]) bb++;
    });
    return { etat: verdictReps(h, bb, com.length), h: h, b: bb, communs: com,
             detail: com.map(function (r) { return [r, a[r] / 100, b[r] / 100]; }) };
  }

  // ── La courbe personnelle ────────────────────────────────────────────────
  // `cellules` : [[periode, reps, charge]] (reps ≤ 12), dans l'ordre de la référence. Rend `{ d, k }`.
  function niveaux(cellules, k) {
    var niv = {};
    cellules.forEach(function (c) {
      var v = Math.log(c[2]) + Math.log(1 + k * c[1]);
      niv[c[0]] = Math.max(niv[c[0]] === undefined ? -1e300 : niv[c[0]], v);
    });
    return niv;
  }
  function courbe(cellules) {
    var best = null;
    for (var km = K_MIN; km <= K_MAX; km++) {
      var k = km / 1000;
      var niv = niveaux(cellules, k), err = 0;
      cellules.forEach(function (c) {
        var e = Math.log(c[2]) + Math.log(1 + k * c[1]) - niv[c[0]];
        err += e * e;
      });
      if (best === null || err < best.err - 1e-12) best = { err: err, km: km };
    }
    var auBord = best.km === K_MIN || best.km === K_MAX;
    var n = niveaux(cellules, auBord ? K_BORD : best.km / 1000);
    return { d: Math.exp(n.R - n.P) - 1, k: auBord ? null : best.km };
  }

  // ── Les fractions exactes des rapports (BigInt) ──────────────────────────
  function pgcd(a, b) {
    a = a < 0 ? -a : a; b = b < 0 ? -b : b;
    while (b !== BigInt(0)) { var t = a % b; a = b; b = t; }
    return a;
  }
  function frac(n, d) {
    n = BigInt(n); d = BigInt(d);
    if (d < BigInt(0)) { n = -n; d = -d; }
    var g = pgcd(n, d);
    return g === BigInt(0) ? { n: n, d: d } : { n: n / g, d: d / g };
  }
  function cmp(a, b) {
    var x = a.n * b.d, y = b.n * a.d;
    return x < y ? -1 : (x > y ? 1 : 0);
  }
  function enNombre(f) { return Number(f.n) / Number(f.d); }
  // Python `int()` puis « + 1 si le reste vaut au moins ½ » : la troncature vers zéro, puis la moitié vers le haut.
  function arrondiReference(f) {
    var ent = f.n / f.d;                                    // BigInt : tronque vers zéro, comme `int`
    return ent + (BigInt(2) * (f.n - ent * f.d) >= f.d ? BigInt(1) : BigInt(0));
  }

  // ── La lecture d'un rapport contre son repère (76 : la SEULE de l'app) ──
  // `q` : le rapport en fraction exacte ; `ref` : le repère en centièmes. « En dessous » sous 95 % du repère,
  // « au-dessus » au-delà de 105 %, « proche » entre les deux.
  function lectureDe(q, ref) {
    var x = BigInt(10000) * q.n, R = BigInt(ref) * q.d;
    return x < BigInt(SOUS) * R ? 'en dessous' : (x > BigInt(DESSUS) * R ? 'au-dessus' : 'proche');
  }
  // Un nombre en fraction exacte, par son écriture décimale la plus courte (celle que JS affiche).
  function fracDuNombre(x) {
    var s = String(x);
    if (/e/i.test(s)) s = x.toFixed(12);
    var m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
    var dec = m[3] || '';
    return frac(m[1] + m[2] + dec, '1' + new Array(dec.length + 1).join('0'));
  }
  // 76 (12/10/2026) — LE REPÈRE SQUAT ÷ COUCHÉ ET SA LECTURE, pour toute l'app : la relecture de la semaine
  // (`generateur.js`) lit celui-ci, celui de « Ton parcours ». `rapport` : un nombre, ou une fraction exacte ;
  // `sexe` non précisé : `{ repere: null, lecture: null }`.
  function repereSquatCouche(rapport, sexe) {
    if (!Object.prototype.hasOwnProperty.call(REPERES, sexe)) return { repere: null, lecture: null };
    var ref = REPERES[sexe][0];
    var q = typeof rapport === 'number' ? fracDuNombre(rapport) : rapport;
    return { repere: ref / 100, lecture: lectureDe(q, ref) };
  }

  // ── Le calcul ────────────────────────────────────────────────────────────
  function parcours(entree) {
    var ZONES = Semaine().ZONES;
    var J = entree.aujourdhui;
    var debutR = moinsJours(J, JOURS_R), debutP = moinsJours(J, JOURS_A);
    var index = Modele().indexerExercices(entree.catalogue || []);
    var cles = {};
    ZONES.forEach(function (z) { cles[z.cle] = z; });
    var prios = (entree.priorites || []).filter(function (p) { return Object.prototype.hasOwnProperty.call(cles, p); });

    var seances = { P: {}, R: {} };          // slug -> { idSeance: true }
    var cell = {};                           // slug -> { P: { reps: centièmes }, R: …, ordreP: [reps], ordreR: [reps] }
    var histo = {};                          // slug -> { mois: centièmes }  (grands mouvements, tout l'historique)
    (entree.series || []).forEach(function (s) {
      var slug = s.slug, reps = nombreOuNul(s.reps), ch = nombreOuNul(s.charge);
      var j = jour(s.debut);
      if (GRANDS.indexOf(slug) >= 0 && ch !== null && ch > 0 && reps !== null &&
          reps >= REPS_HISTO_MIN && reps <= REPS_CELLULE_MAX && j <= J) {
        var mois = j.slice(0, 7), h = histo[slug] || (histo[slug] = {});
        if (centiemes(ch) > (h[mois] || 0)) h[mois] = centiemes(ch);
      }
      var p = periodeDe(j, J, debutR, debutP);
      if (p === null) return;
      (seances[p][slug] || (seances[p][slug] = {}))[s.seance] = true;
      if (ch !== null && ch > 0 && reps !== null && reps >= 1 && reps <= REPS_CELLULE_MAX) {
        var c = cell[slug] || (cell[slug] = { P: {}, R: {}, ordreP: [], ordreR: [] });
        if (!Object.prototype.hasOwnProperty.call(c[p], reps)) { c['ordre' + p].push(reps); c[p][reps] = 0; }
        if (centiemes(ch) > c[p][reps]) c[p][reps] = centiemes(ch);
      }
    });
    var nombreDe = function (p, slug) { return seances[p][slug] ? Object.keys(seances[p][slug]).length : 0; };
    var parNombre = function (a, b) { return a - b; };

    // Les exercices.
    var ex = {};
    var vus = {};
    Object.keys(seances.P).concat(Object.keys(seances.R)).forEach(function (slug) { vus[slug] = true; });
    Object.keys(vus).sort().forEach(function (slug) {
      var e = index[slug];
      if (!e || e.habilete) return;
      var mp = Array.isArray(e.muscles_primaires) ? e.muscles_primaires : [];
      var zone = mp.length ? Semaine().zoneDuMuscle(mp[0]) : null;
      if (!zone || !Object.prototype.hasOwnProperty.call(cles, zone.cle)) return;
      if (!cell[slug]) return;                                  // jamais en charge : hors parcours
      var nP = nombreDe('P', slug), nR = nombreDe('R', slug);
      var o = { slug: slug, nom: e.nom, zone: zone.cle, muscle: mp[0], nP: nP, nR: nR,
                poids: GRANDS.indexOf(slug) >= 0 ? 2 : 1, etat: null, methode: null, detail: [], ecart: null, k: null };
      var etatPratique = pratique(nP, nR);
      if (etatPratique) o.etat = etatPratique;
      else {
        var egales = aRepsEgales(cell[slug].P, cell[slug].R);
        if (egales) {
          o.etat = egales.etat;
          o.methode = 'reps';
          o.detail = egales.detail;
        } else {
          var cs = [];
          ['P', 'R'].forEach(function (p) {
            cell[slug]['ordre' + p].forEach(function (r) { if (r <= REPS_COURBE_MAX) cs.push([p, r, cell[slug][p][r] / 100]); });
          });
          var differents = {};
          cs.forEach(function (x) { differents[x[1]] = true; });
          var avecP = cs.some(function (x) { return x[0] === 'P'; }), avecR = cs.some(function (x) { return x[0] === 'R'; });
          if (Object.keys(differents).length >= 3 && avecP && avecR) {
            var cb = courbe(cs);
            o.etat = verdictEcart(cb.d);
            o.methode = 'courbe';
            o.ecart = arrondiAuPair(cb.d * 1000) / 10;
            o.k = cb.k;
          } else {
            o.etat = 'pas comparable';
          }
        }
      }
      ex[slug] = o;
    });
    var slugs = Object.keys(ex).sort();

    // Le relais d'un exercice moins pratiqué : même premier muscle principal, frère ou de la même famille, au moins
    // cinq séances récentes et plus qu'avant ; les deux premiers par séances récentes décroissantes, puis par slug.
    slugs.forEach(function (s) {
      var o = ex[s];
      if (o.etat !== 'moins') return;
      var proches = {};
      Modele().freresDe(index, s).concat(Modele().cousinsDe(index, s)).forEach(function (x) { proches[x] = true; });
      var rel = slugs.map(function (x) { return ex[x]; }).filter(function (x) {
        return x.slug !== s && x.muscle === o.muscle && x.nR > x.nP && x.nR >= MIN_SEANCES && proches[x.slug];
      });
      rel.sort(function (x, y) { return y.nR - x.nR || (x.slug < y.slug ? -1 : (x.slug > y.slug ? 1 : 0)); });
      o.relais = rel.slice(0, 2).map(function (x) { return x.slug; });
    });

    // Les groupes : les exercices qui votent, la barre compte double.
    var zones = ZONES.map(function (z) {
      var tous = slugs.filter(function (s) { return ex[s].zone === z.cle; });
      var vot = tous.filter(function (s) { return Object.prototype.hasOwnProperty.call(SCORE, ex[s].etat); });
      if (vot.length >= 2) {
        var num = 0, den = 0;
        vot.forEach(function (s) { num += SCORE[ex[s].etat] * ex[s].poids; den += ex[s].poids; });
        return { zone: z.cle, libelle: z.libelle, verdict: verdictDeGroupe(num, den), score: num / den,
                 votants: vot.length, num: num, den: den };
      }
      return { zone: z.cle, libelle: z.libelle, verdict: null, score: null, votants: vot.length,
               raison: tous.length ? 'pas assez de séances comparables' : 'pas encore suivi en charge' };
    });
    var avec = zones.filter(function (z) { return z.verdict; });

    // Le levier : parmi les priorités, dans leur ordre, le groupe à verdict de plus petite moyenne (la première à
    // égalité) ; sans priorité, tous les groupes à verdict, dans l'ordre des zones.
    var cand = [];
    if (prios.length) prios.forEach(function (p) { avec.forEach(function (z) { if (z.zone === p) cand.push(z); }); });
    else cand = avec.slice();
    var levier = null;
    cand.forEach(function (z) {
      if (levier === null || z.num * levier.den < levier.num * z.den) levier = z;
    });

    // Les équilibres : sur les douze mois, de 1 à 10 reps, la plus lourde de chaque nombre de reps.
    var meilleur = {};
    RAPPORTS.forEach(function (r) {
      r.forEach(function (slug) {
        if (meilleur[slug]) return;
        var d = {};
        ['P', 'R'].forEach(function (p) {
          var c = cell[slug];
          if (!c) return;
          Object.keys(c[p]).forEach(function (k) {
            var reps = Number(k);
            if (reps <= REPS_RAPPORT_MAX && c[p][k] > (d[reps] || 0)) d[reps] = c[p][k];
          });
        });
        meilleur[slug] = d;
      });
    });
    var reperes = Object.prototype.hasOwnProperty.call(REPERES, entree.sexe) ? REPERES[entree.sexe] : null;
    var rapports = [];
    RAPPORTS.forEach(function (paire, i) {
      var ref = reperes ? reperes[i] : null;
      var a = meilleur[paire[0]], b = meilleur[paire[1]];
      var com = Object.keys(a).map(Number).filter(function (r) { return Object.prototype.hasOwnProperty.call(b, r); })
        .sort(parNombre);
      if (com.length < 3) return;
      var rs = com.map(function (r) { return frac(a[r], b[r]); }).sort(cmp);
      var n = rs.length;
      var med = n % 2 ? rs[(n - 1) / 2]
        : frac(rs[n / 2 - 1].n * rs[n / 2].d + rs[n / 2].n * rs[n / 2 - 1].d, BigInt(2) * rs[n / 2 - 1].d * rs[n / 2].d);
      var lecture = ref === null ? null : lectureDe(med, ref);
      var cent = Number(arrondiReference(frac(BigInt(100) * med.n, med.d)));
      var o = { num: paire[0], den: paire[1], rapport: enNombre(med), repere: ref === null ? null : ref / 100,
                lecture: lecture, reps: com, affiche: Modele().nombreFixe(cent / 100, 2), q: med, ref: ref };
      if (lecture === 'en dessous') {
        var maxA = Math.max.apply(null, Object.keys(a).map(function (k) { return a[k]; }));
        var maxB = Math.max.apply(null, Object.keys(b).map(function (k) { return b[k]; }));
        // repère × la plus lourde du second − la plus lourde du premier, en dix-millièmes de kilo.
        o.ecart_kg = Number(arrondiReference(frac(ref * maxB - 100 * maxA, 10000)));
      }
      rapports.push(o);
    });

    // Les courbes des grands mouvements : tout l'historique jusqu'à J, mois par mois.
    var courbes = [];
    GRANDS.forEach(function (slug) {
      var h = histo[slug];
      if (!h) return;
      var mois = Object.keys(h).sort();
      var max = 0;
      mois.forEach(function (m) { if (h[m] > max) max = h[m]; });
      courbes.push({ slug: slug, mois: mois.map(function (m) { return [m, h[m] / 100]; }), debut: h[mois[0]] / 100,
                     meilleur: max / 100, maintenant: h[mois[mois.length - 1]] / 100,
                     etat: ex[slug] ? ex[slug].etat : null });
    });

    // La phrase.
    var phrases = [];
    if (avec.length) {
      var k = avec.filter(function (z) { return z.verdict === '↑' || z.verdict === '↗'; }).length, m = avec.length;
      if (k === m) phrases.push(m > 1 ? 'Tes six derniers mois : les ' + MOTS[m] + ' groupes que tu suis progressent.'
                                      : 'Tes six derniers mois : le groupe que tu suis progresse.');
      else if (k === 0) phrases.push('Tes six derniers mois : pas encore de groupe en hausse.');
      else phrases.push(k > 1 ? 'Tes six derniers mois : ' + MOTS[k] + ' groupes sur ' + MOTS[m] + ' progressent.'
                              : 'Tes six derniers mois : un groupe sur ' + MOTS[m] + ' progresse.');
    }
    if (levier && avec.length > 1) phrases.push(levier.libelle + ' : ce qui avance le plus lentement.');
    var plusLoin = null;
    rapports.forEach(function (r) {
      if (r.lecture !== 'en dessous') return;
      // rapport / repère le plus petit (l'ordre du tableau à égalité) : q.n / (q.d × ref), comparés en croix.
      if (plusLoin === null || r.q.n * plusLoin.q.d * BigInt(plusLoin.ref) < plusLoin.q.n * r.q.d * BigInt(r.ref)) plusLoin = r;
    });
    if (plusLoin) phrases.push('Ton ' + NOM_COURT[plusLoin.den] + ' tire devant ton ' + NOM_COURT[plusLoin.num] + '.');

    return {
      exercices: slugs.map(function (s) { return ex[s]; }),
      zones: zones.map(function (z) {
        var sortie = { zone: z.zone, libelle: z.libelle, verdict: z.verdict, score: z.score, votants: z.votants };
        if (z.raison) sortie.raison = z.raison;
        return sortie;
      }),
      levier: levier ? levier.zone : null,
      rapports: rapports.map(function (r) {
        var sortie = { num: r.num, den: r.den, rapport: r.rapport, repere: r.repere, lecture: r.lecture, reps: r.reps,
                       affiche: r.affiche };
        if (r.ecart_kg !== undefined) sortie.ecart_kg = r.ecart_kg;
        return sortie;
      }),
      courbes: courbes,
      phrase: phrases.join(' ')
    };
  }

  var api = {
    parcours: parcours,
    repereSquatCouche: repereSquatCouche,
    pratique: pratique,
    aRepsEgales: aRepsEgales,
    REPS_CELLULE_MAX: REPS_CELLULE_MAX,
    GRANDS: GRANDS,
    NOM_COURT: NOM_COURT,
    MIN_SEANCES: MIN_SEANCES
  };
  racine.THParcours = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
