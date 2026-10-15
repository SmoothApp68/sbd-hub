// v2/js/annee.js — l'écran « Ton année » (chantier 95, BILANS-V1, maquette `maquette-ton-annee-v11.html`).
//
// ⚠️ L'ÉCRAN LIT LE BILAN, IL NE LE REFAIT PAS : `faits.bilanDePeriode` (le module des faits, qui assemble l'entrée de
// `THBilans`) rend les chiffres ; ce module les MET EN MOTS et en scène — défilement seul (les durées de la maquette,
// déjà × 1,4), pause au doigt, `ajuste()` qui réduit les grands chiffres à la largeur disponible moins les marges,
// « Partager » sur chaque écran (une image dessinée sur l'appareil, sans serveur), la plaque finale sans le coach.
// L'état du jeu arrive calculé (`Jeu.etatDuJeu`, par l'écran de l'app) ; rien n'est écrit.
//
// `ouvrir(hote, vue)` — `vue = { bilan, qui, jeu: { debut, fin } | null, surDetail(), surFermer() }`.
// `ecrans(vue)` (pur) : la liste des écrans, chacun `{ cle, d, ... }` — ce que montrent l'écran ET l'image.

(function (racine) {
  'use strict';

  var doc = racine.document;
  function M() { return racine.THModele; }

  // ── Les mots ──────────────────────────────────────────────────────────────
  function milliers(n) { return M().nombreGroupe(Math.round(Number(n) || 0)); }
  function kg(n) { return M().nombreTexte(n, 1) + ' kg'; }
  function tonnes(kgs) {
    var t = (Number(kgs) || 0) / 1000;
    return t >= 100 ? { v: Math.round(t), dec: false } : { v: Math.round(t * 10) / 10, dec: true };
  }
  function texteTonnes(kgs) {
    var t = tonnes(kgs);
    return (t.dec ? M().nombreTexte(t.v, 1) : milliers(t.v)) + ' t';
  }
  function moisNom(cle) { return M().MOIS_LONGS[Number(String(cle).slice(5, 7)) - 1]; }
  function jourTexte(j) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(j || ''));
    return m ? Number(m[3]) + (m[3] === '01' ? 'er' : '') + ' ' + M().MOIS_LONGS[Number(m[2]) - 1] : '';
  }
  function sansParentheses(nom) { return String(nom || '').replace(/\s*\([^)]*\)\s*/g, ' ').trim(); }
  function majuscule(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }
  var NOM_DU_PROFIL = { force: 'force', mix: 'mix', muscle: 'muscle' };
  var COURT = { squat_barre: 'Squat', developpe_couche_barre: 'Couché', souleve_de_terre_barre: 'Soulevé',
                developpe_militaire_barre: 'Militaire' };
  // Un texte : des morceaux, `[texte, gras]`.
  function g(t) { return [t, true]; }

  // ── Les écrans (pur) ─────────────────────────────────────────────────────
  // Les durées : celles de la maquette (déjà × 1,4). 0 : le dernier, qui ne défile plus.
  function ecrans(vue) {
    var b = vue.bilan, p = b.periode, out = [];
    var cmp = b.versus;
    out.push({ cle: 'ouverture', d: 4480, lab: 'TrainHub', chiffre: { v: p.libelle, craie: true },
               titre: 'Ton année sous la barre.', note: 'Ça défile seul. Garde le doigt posé pour lire.' });
    if (b.vide) {
      out.push({ cle: 'vide', d: 0, lab: 'Ton année ' + p.libelle, titre: 'Pas encore de série de travail cette année.' });
      return out;
    }
    // Les tonnes.
    var t = tonnes(b.tonnes.kg);
    out.push({ cle: 'tonnes', d: 7699, lab: 'Tu as soulevé', chiffre: { v: t.v, dec: t.dec, unite: 't' }, pile: true,
               txt: b.tonnes.elephants ? ['À peu près ', g(milliers(b.tonnes.elephants) + ' éléphant' +
                 (b.tonnes.elephants > 1 ? 's' : '') + ' d’Afrique'), '.']
                 : (b.tonnes.objet ? ['À peu près ', g(b.tonnes.objet), '.'] : null) });
    // Mois par mois.
    if (b.mois.plusLourd) {
      out.push({ cle: 'mois', d: 7699, lab: 'Mois par mois', mois: b.mois,
                 txt: ['Le plus lourd : ', g(moisNom(b.mois.plusLourd.mois) + ', ' + texteTonnes(b.mois.plusLourd.kg)), '.'],
                 note: b.mois.enCours ? majuscule(moisNom(b.mois.enCours)) + ' est en cours.' : null });
    }
    // Reps et séries.
    out.push({ cle: 'reps', d: 6300, lab: 'En', chiffre: { v: b.reps.reps },
               txt: ['reps de travail, sur ', g(milliers(b.reps.series) + ' série' + (b.reps.series > 1 ? 's' : '')), '.'] });
    // Le profil.
    if (b.profil) {
      var pr = b.profil;
      out.push({ cle: 'profil', d: 9100, lab: 'Ton profil de l’année',
                 titre: pr.premier === 'mix' ? 'Plutôt entre les deux.'
                   : 'Plutôt ' + NOM_DU_PROFIL[pr.premier] + ' que ' + NOM_DU_PROFIL[pr.second] + '.',
                 barre3: [pr.force, pr.mix, pr.muscle],
                 lignes: [{ pastille: 'rouge', v: pr.force + ' % · force, 5 reps ou moins' },
                          { pastille: 'or', v: pr.mix + ' % · mix, 6 à 8 reps' },
                          { pastille: 'bleu', v: pr.muscle + ' % · muscle, 9 reps et plus' }] });
    }
    // Le muscle de l'année.
    if (b.muscles.length) {
      var mu = b.muscles;
      out.push({ cle: 'muscle', d: 7699, lab: 'Ton muscle de l’année', titre: mu[0].libelle,
                 chiffre: { v: Math.round(mu[0].series), unite: 'séries', moyen: true, espace: true },
                 lignes: mu.slice(1).map(function (x, i) {
                   return { n: i === 0 ? 'Puis' : null, v: x.libelle + ' · ' + milliers(x.series) + ' séries' };
                 }) });
    }
    // L'exercice de l'année.
    if (b.exercices.length) {
      var ex = b.exercices;
      var seances = function (n) { return n + ' séance' + (n > 1 ? 's' : ''); };
      out.push({ cle: 'exercice', d: 8400, lab: 'Ton exercice de l’année', titre: ex[0].nom,
                 txt: [g(seances(ex[0].seances)), ' · ', g(milliers(ex[0].reps) + ' reps')],
                 lignes: ex.slice(1).map(function (x) { return { n: x.nom, v: seances(x.seances) + ' · ' + milliers(x.reps) + ' reps' }; }) });
    }
    // La séance la plus lourde.
    if (b.seance) {
      var ts = tonnes(b.seance.kg);
      out.push({ cle: 'seance', d: 7000, lab: 'Ta séance la plus lourde', chiffre: { v: ts.v, dec: ts.dec, unite: 't' },
                 txt: ['Le ', g(jourTexte(b.seance.jour)), b.seance.titre ? ', « ' + b.seance.titre + ' ».' : '.'] });
    }
    // Les barres.
    if (b.barres) {
      var br = b.barres, tete = br.tete;
      var autres = br.lignes.filter(function (l) { return l !== tete; });
      var ligneBarre = function (l) {
        if (l.avant === null || l.avant === undefined) return { n: l.nom, v: kg(l.charge) };
        if (l.charge > l.avant) return { n: l.nom, v: M().nombreTexte(l.avant, 1) + ' → ', em: kg(l.charge) };
        if (l.charge === l.avant) return { n: l.nom, v: kg(l.charge) + ', ' + cmp.comme };
        return { n: l.nom, v: kg(l.charge) + ' · ' + kg(l.avant) + ' ' + (cmp.mode === 'precedente' ? 'en ' + cmp.libelle : cmp.libelle) };
      };
      var total = null;
      if (br.total) {
        var e = br.total.ecart;
        total = ['Squat, couché et soulevé ensemble : ', g(kg(br.total.charge)),
                 e === null ? '.' : (e > 0 ? ', ' + M().nombreTexte(e, 1) + ' de plus ' + cmp.qu + '.'
                   : (e < 0 ? ', ' + M().nombreTexte(-e, 1) + ' de moins ' + cmp.qu + '.' : ', ' + cmp.comme + '.'))];
      }
      var pdc = br.lignes.filter(function (l) { return l.pdc; }).sort(function (a, c) { return c.pdc.pct - a.pdc.pct; });
      out.push({ cle: 'barres', d: 10500, lab: 'Ta barre la plus lourde', chiffre: { v: tete.charge, dec: tete.charge % 1 !== 0, unite: 'kg' },
                 txt: ['au ' + tete.nom + '.' + (tete.vie ? ' La plus lourde de ta vie.' : '')],
                 lignes: autres.map(ligneBarre), total: total,
                 pdc: pdc.length ? pdc.map(function (l) {
                   return { v: (l.pdc.approx ? '≈ ' : '') + l.pdc.pct + ' %', n: COURT[l.slug] || l.nom };
                 }) : null });
    }
    // Ce qui a le plus avancé.
    if (b.avance && b.avance.tete) {
      var av = b.avance, at = av.tete;
      var partout = at.partout === 'toutes' ? ' Plus lourd ' + av.qu + ' à toutes les reps.'
        : (at.partout === 'presque' ? ' Plus lourd ' + av.qu + ' à presque toutes les reps.' : '');
      out.push({ cle: 'avance', d: 9800, lab: 'Ce qui a le plus avancé', titre: at.nom, courbe: at.courbe,
                 txt: ['À ' + at.reps + ' rep' + (at.reps > 1 ? 's' : '') + ', tu es passé de ',
                       g(M().nombreTexte(at.de, 1) + ' à ' + kg(at.a)), '.' + partout],
                 lignes: av.suivants.map(function (x) {
                   return { n: x.nom + ', à ' + x.reps + ' rep' + (x.reps > 1 ? 's' : ''),
                            v: M().nombreTexte(x.de, 1) + ' → ', em: kg(x.a) };
                 }) });
    }
    // Le coach.
    if (b.coach) {
      out.push({ cle: 'coach', d: 8400, lab: 'Et le coach ?', chiffre: { v: b.coach.tenus, unite: '/ ' + b.coach.faits },
                 jauge: Math.round(b.coach.tenus * 100 / b.coach.faits),
                 txt: ['paris tenus' + (b.coach.depuis ? ' depuis le ' + jourTexte(b.coach.depuis) : '') +
                       '. Après chaque séance, il te dit s’il avait raison.'] });
    }
    // Le jeu (l'état calculé par le jeu, au début et à la fin de la période).
    if (vue.jeu && vue.jeu.fin) {
      var nf = vue.jeu.fin.niveau.niveau, nd = vue.jeu.debut ? vue.jeu.debut.niveau.niveau : 0;
      var gagnes = vue.jeu.fin.succes.nombre - (vue.jeu.debut ? vue.jeu.debut.succes.nombre : 0);
      out.push({ cle: 'jeu', d: 7699, lab: 'Et le jeu', chiffre: { v: nf, avant: 'Niveau ', moyen: true },
                 txt: nd !== nf ? ['Tu as commencé l’année au ', g('niveau ' + nd), '.'] : null,
                 lignes: gagnes > 0 ? [{ v: gagnes + ' succès gagné' + (gagnes > 1 ? 's' : '') + ' cette année' }] : [] });
    }
    // La plaque finale, sans le coach.
    var cases = [{ k: 'Soulevé', g: texteTonnes(b.tonnes.kg) }];
    if (b.barres) cases.push({ k: 'Barre la plus lourde', g: kg(b.barres.tete.charge), p: sansParentheses(b.barres.tete.nom) });
    if (b.avance) cases.push({ k: 'Exercices qui progressent', g: b.avance.progressent + ' / ' + b.avance.compares });
    if (b.barres && b.barres.total) {
      var ec = b.barres.total.ecart;
      cases.push({ k: 'Squat, couché, soulevé', g: kg(b.barres.total.charge),
                   p: ec === null ? null : (ec > 0 ? '+' + M().nombreTexte(ec, 1) + ' kg sur ' + (cmp.mode === 'precedente' ? cmp.libelle : 'le début')
                     : (ec < 0 ? '−' + M().nombreTexte(-ec, 1) + ' kg sur ' + (cmp.mode === 'precedente' ? cmp.libelle : 'le début') : majuscule(cmp.comme))) });
    }
    if (b.avance && b.avance.tete) {
      cases.push({ k: 'Plus gros progrès', m: sansParentheses(b.avance.tete.nom),
                   p: M().nombreTexte(b.avance.tete.de, 1) + ' → ' + kg(b.avance.tete.a) + ' à ' + b.avance.tete.reps + ' rep' + (b.avance.tete.reps > 1 ? 's' : '') });
    }
    if (b.muscles.length) cases.push({ k: 'Muscle de l’année', m: b.muscles[0].libelle, p: milliers(b.muscles[0].series) + ' séries' });
    out.push({ cle: 'plaque', d: 0, plaque: { an: p.libelle, qui: vue.qui || '', cases: cases.slice(0, 6) } });
    return out;
  }

  // ── Le DOM ───────────────────────────────────────────────────────────────
  function el(balise, classe, texte) {
    var n = doc.createElement(balise);
    if (classe) n.className = classe;
    if (texte !== undefined && texte !== null) n.textContent = String(texte);
    return n;
  }
  function morceaux(parent, liste) {
    (liste || []).forEach(function (x) {
      if (Array.isArray(x)) parent.appendChild(el('b', null, x[0]));
      else parent.appendChild(doc.createTextNode(x));
    });
    return parent;
  }
  function texteDe(liste) { return (liste || []).map(function (x) { return Array.isArray(x) ? x[0] : x; }).join(''); }
  var COULEUR = { rouge: 'var(--rouge)', or: 'var(--or)', bleu: 'var(--bleu)' };
  var NS = 'http://www.w3.org/2000/svg';

  function chiffreDe(c) {
    var p = el('p', 'a chiffre' + (c.moyen ? ' moyen' : ''));
    if (c.craie) p.style.color = 'var(--craie)';
    if (c.avant) p.appendChild(doc.createTextNode(c.avant));
    if (typeof c.v === 'number') {
      var cpt = el('span', 'cpt', '0');
      cpt.dataset.v = String(c.v);
      if (c.dec) cpt.dataset.dec = '1';
      p.appendChild(cpt);
    } else p.appendChild(doc.createTextNode(String(c.v)));
    if (c.unite) p.appendChild(el('small', null, (c.espace ? ' ' : '') + c.unite));
    return p;
  }
  function section(e) {
    var s = el('section', 's');
    s.dataset.d = String(e.d);
    s.dataset.cle = e.cle;
    if (e.plaque) {
      var pl = el('div', 'a plaque');
      var tete = el('div', 'tete');
      tete.appendChild(el('span', 'an', e.plaque.an));
      tete.appendChild(el('span', 'qui', e.plaque.qui));
      pl.appendChild(tete);
      var gr = el('div', 'grille');
      e.plaque.cases.forEach(function (c) {
        var d = el('div');
        d.appendChild(el('div', 'k', c.k));
        if (c.g) d.appendChild(el('div', 'g', c.g));
        if (c.m) d.appendChild(el('div', 'm', c.m));
        if (c.p) d.appendChild(el('div', 'p', c.p));
        gr.appendChild(d);
      });
      pl.appendChild(gr);
      var pied = el('div', 'pied');
      pied.appendChild(el('span', null, 'TrainHub'));
      pied.appendChild(el('span', null, 'Ton année ' + e.plaque.an));
      pl.appendChild(pied);
      s.appendChild(pl);
      var bp = el('button', 'a btn', 'Partager mon année');
      bp.type = 'button';
      bp.dataset.action = 'partager';
      s.appendChild(bp);
      var bd = el('button', 'a btn sec', 'Voir le détail par muscle');
      bd.type = 'button';
      bd.dataset.action = 'detail';
      s.appendChild(bd);
      return s;
    }
    if (e.lab) s.appendChild(el('p', 'a lab', e.lab));
    if (e.cle === 'ouverture' && e.chiffre) s.appendChild(chiffreDe(e.chiffre));
    if (e.titre && e.cle !== 'ouverture') s.appendChild(el('p', 'a titre', e.titre));
    if (e.chiffre && e.cle !== 'ouverture') s.appendChild(chiffreDe(e.chiffre));
    if (e.cle === 'ouverture') s.appendChild(el('p', 'a titre', e.titre));
    if (e.pile) s.appendChild(pile());
    if (e.mois) s.appendChild(barresDesMois(e.mois));
    if (e.barre3) {
      var b3 = el('div', 'a barre3');
      ['rouge', 'or', 'bleu'].forEach(function (c, i) {
        var b = el('b');
        b.dataset.w = String(e.barre3[i]);
        b.style.background = COULEUR[c];
        b3.appendChild(b);
      });
      s.appendChild(b3);
    }
    if (e.courbe && e.courbe.length > 1) s.appendChild(courbe(e.courbe));
    if (e.jauge !== undefined) {
      var j = el('div', 'a jauge'), jb = el('b');
      jb.dataset.w = String(e.jauge);
      j.appendChild(jb);
      s.appendChild(j);
    }
    if (e.txt) s.appendChild(morceaux(el('p', 'a txt'), e.txt));
    if (e.lignes && e.lignes.length) {
      var li = el('div', 'a liste');
      e.lignes.forEach(function (l) {
        var d = el('div', 'ligne');
        if (l.n) d.appendChild(el('div', 'n', l.n));
        var v = el('div', 'v');
        if (l.pastille) {
          var pa = el('span', 'pastille');
          pa.style.background = COULEUR[l.pastille];
          v.appendChild(pa);
        }
        v.appendChild(doc.createTextNode(l.v));
        if (l.em) v.appendChild(el('em', null, l.em));
        d.appendChild(v);
        li.appendChild(d);
      });
      s.appendChild(li);
    }
    if (e.total) {
      var tt = morceaux(el('p', 'a txt'), e.total);
      tt.style.fontSize = '15px';
      s.appendChild(tt);
    }
    if (e.pdc) {
      var pdc = el('div', 'a pdc');
      pdc.appendChild(el('p', 'n', 'Rapporté à ton poids de corps ce jour-là'));
      var gr2 = el('div', 'pdcg');
      e.pdc.forEach(function (x) {
        var d = el('div');
        d.appendChild(el('b', null, x.v));
        d.appendChild(el('span', null, x.n));
        gr2.appendChild(d);
      });
      pdc.appendChild(gr2);
      pdc.appendChild(el('p', 'note', 'Ton poids est estimé avec tes pesées les plus proches de chaque perf.'));
      s.appendChild(pdc);
    }
    if (e.note) s.appendChild(el('p', 'a note', e.note));
    return s;
  }
  // Les disques : 25 rouge, 20 bleu, 15 or, de part et d'autre du manchon.
  function pile() {
    var p = el('div', 'a pile');
    var D = [['var(--rouge)', 118], ['var(--rouge)', 118], ['var(--bleu)', 104], ['var(--bleu)', 104], ['var(--or)', 88]];
    D.slice().reverse().forEach(function (d, k) {
      var e = el('i'); e.style.background = d[0]; e.style.height = d[1] + 'px'; e.style.animationDelay = (1.1 - k * 0.12) + 's';
      p.appendChild(e);
    });
    p.appendChild(el('i', 'manche'));
    D.forEach(function (d, k) {
      var e = el('i'); e.style.background = d[0]; e.style.height = d[1] + 'px'; e.style.animationDelay = (0.6 + k * 0.12) + 's';
      p.appendChild(e);
    });
    return p;
  }
  function barresDesMois(m) {
    var box = el('div', 'a mois');
    var haut = m.plusLourd ? m.plusLourd.kg : 0;
    m.liste.forEach(function (x) {
      var d = el('div'), b = el('b');
      b.dataset.h = String(haut ? Math.round(x.kg / haut * 130) : 0);
      if (m.plusLourd && x.mois === m.plusLourd.mois) b.className = 'haut';
      d.appendChild(b);
      d.appendChild(doc.createTextNode(moisNom(x.mois).charAt(0).toUpperCase()));
      box.appendChild(d);
    });
    return box;
  }
  function courbe(points) {
    var svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'a courbe');
    svg.setAttribute('viewBox', '0 0 320 110');
    svg.setAttribute('aria-hidden', 'true');
    var vals = points.map(function (p) { return p[1]; });
    var bas = Math.min.apply(null, vals), haut = Math.max.apply(null, vals);
    var x = function (i) { return 8 + i * (282 / (points.length - 1)); };
    var y = function (v) { return haut === bas ? 55 : 96 - (v - bas) / (haut - bas) * 74; };
    var d = points.map(function (p, i) { return (i ? 'L' : 'M') + Math.round(x(i)) + ' ' + Math.round(y(p[1])); }).join(' ');
    var path = doc.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
    var c = doc.createElementNS(NS, 'circle');
    c.setAttribute('cx', String(Math.round(x(points.length - 1))));
    c.setAttribute('cy', String(Math.round(y(points[points.length - 1][1]))));
    c.setAttribute('r', '5');
    svg.appendChild(c);
    return svg;
  }

  // ── L'image partagée : l'écran redessiné sur un canevas, sur l'appareil ───
  var IMG_L = 1080, IMG_H = 1920;
  var PALETTE = { acier: '#161a1f', fonte: '#232931', craie: '#ece8df', cendre: '#9aa3ad', or: '#d9b45a',
                  rouge: '#b8574a', bleu: '#5f8fbf' };
  function police(poids, taille, large) {
    return (large ? 'normal ' : '') + poids + ' ' + taille + 'px Archivo, system-ui, sans-serif';
  }
  function lignesCoupees(ctx, texte, largeur) {
    var mots = String(texte).split(' '), out = [], cur = '';
    mots.forEach(function (m) {
      var essai = cur ? cur + ' ' + m : m;
      if (ctx.measureText(essai).width > largeur && cur) { out.push(cur); cur = m; } else cur = essai;
    });
    if (cur) out.push(cur);
    return out;
  }
  function valeurAffichee(c) {
    if (typeof c.v !== 'number') return (c.avant || '') + c.v;
    return (c.avant || '') + (c.dec ? M().nombreTexte(c.v, 1) : milliers(c.v));
  }
  function dessiner(ctx, e, an) {
    var X = 90, L = IMG_L - 2 * X, y = 300;
    var fond = ctx.createRadialGradient(IMG_L / 2, 0, 50, IMG_L / 2, 0, IMG_H * 0.9);
    fond.addColorStop(0, '#1d232a'); fond.addColorStop(1, PALETTE.acier);
    ctx.fillStyle = fond; ctx.fillRect(0, 0, IMG_L, IMG_H);
    ctx.textBaseline = 'alphabetic';
    var ecrire = function (t, poids, taille, couleur, interligne) {
      ctx.font = police(poids, taille); ctx.fillStyle = couleur;
      lignesCoupees(ctx, t, L).forEach(function (l) { y += taille * (interligne || 1.2); ctx.fillText(l, X, y); });
    };
    if (e.plaque) {
      var pl = e.plaque;
      ctx.fillStyle = PALETTE.fonte; ctx.fillRect(X - 30, y, L + 60, 1100);
      y += 120; ctx.font = police(900, 110); ctx.fillStyle = PALETTE.craie; ctx.fillText(pl.an, X, y);
      ctx.font = police(500, 38); ctx.fillStyle = PALETTE.cendre; ctx.textAlign = 'right'; ctx.fillText(pl.qui, X + L, y);
      ctx.textAlign = 'left';
      var col = L / 2;
      pl.cases.forEach(function (c, i) {
        var cx = X + (i % 2) * col, cy = y + 90 + Math.floor(i / 2) * 290;
        ctx.font = police(500, 34); ctx.fillStyle = PALETTE.cendre; ctx.fillText(c.k, cx, cy);
        if (c.g) { ctx.font = police(850, 80); ctx.fillStyle = PALETTE.or; ctx.fillText(c.g, cx, cy + 90); }
        if (c.m) { ctx.font = police(700, 56); ctx.fillStyle = PALETTE.craie; ctx.fillText(c.m, cx, cy + 80); }
        if (c.p) { ctx.font = police(500, 32); ctx.fillStyle = PALETTE.cendre; ctx.fillText(c.p, cx, cy + 140); }
      });
    } else {
      if (e.lab) ecrire(e.lab, 500, 44, PALETTE.cendre);
      if (e.titre && e.cle !== 'ouverture') { y += 20; ecrire(e.titre, 700, 84, PALETTE.craie, 1.1); }
      if (e.chiffre) {
        var txt = valeurAffichee(e.chiffre) + (e.chiffre.unite ? ' ' + e.chiffre.unite : '');
        var taille = e.chiffre.moyen ? 150 : 230;
        ctx.font = police(900, taille);
        while (ctx.measureText(txt).width > L && taille > 60) { taille -= 6; ctx.font = police(900, taille); }
        y += taille + 30; ctx.fillStyle = e.chiffre.craie ? PALETTE.craie : PALETTE.or; ctx.fillText(txt, X, y);
      }
      if (e.titre && e.cle === 'ouverture') { y += 20; ecrire(e.titre, 700, 84, PALETTE.craie, 1.1); }
      if (e.txt) { y += 30; ecrire(texteDe(e.txt), 500, 50, PALETTE.craie, 1.35); }
      (e.lignes || []).forEach(function (l) {
        y += 40;
        ctx.fillStyle = '#353d47'; ctx.fillRect(X, y, L, 2);
        if (l.n) { y += 10; ecrire(l.n, 500, 38, PALETTE.cendre); }
        ecrire(l.v + (l.em || ''), 650, 50, PALETTE.craie);
      });
      if (e.total) { y += 40; ecrire(texteDe(e.total), 500, 44, PALETTE.craie, 1.35); }
      if (e.pdc) {
        y += 50; ecrire('Rapporté à ton poids de corps ce jour-là', 500, 38, PALETTE.cendre);
        ecrire(e.pdc.map(function (x) { return x.n + ' ' + x.v; }).join(' · '), 800, 50, PALETTE.craie, 1.4);
      }
    }
    ctx.font = police(600, 36); ctx.fillStyle = PALETTE.cendre;
    ctx.fillText('TrainHub', X, IMG_H - 110);
    ctx.textAlign = 'right'; ctx.fillText('Ton année ' + an, X + L, IMG_H - 110); ctx.textAlign = 'left';
  }
  // Rend une promesse du `Blob` PNG de l'écran.
  function image(e, an) {
    var c = doc.createElement('canvas');
    c.width = IMG_L; c.height = IMG_H;
    var ctx = c.getContext('2d');
    var pret = doc.fonts && doc.fonts.load ? doc.fonts.load(police(900, 100)).catch(function () {}) : Promise.resolve();
    return pret.then(function () {
      dessiner(ctx, e, an);
      return new Promise(function (ok) { c.toBlob(function (b) { ok(b); }, 'image/png'); });
    });
  }
  // Partager : la feuille de partage de l'appareil si elle prend un fichier ; sinon, un téléchargement.
  function partager(e, an) {
    return image(e, an).then(function (blob) {
      if (!blob) return 'rien';
      var nom = 'trainhub-' + an + '-' + e.cle + '.png';
      var nav = racine.navigator || {};
      var File_ = racine.File;
      var fichier = File_ ? new File_([blob], nom, { type: 'image/png' }) : null;
      if (fichier && nav.share && nav.canShare && nav.canShare({ files: [fichier] })) {
        return nav.share({ files: [fichier], title: 'Ton année ' + an }).then(function () { return 'partage'; },
          function () { return 'annule'; });
      }
      var url = racine.URL.createObjectURL(blob);
      var a = el('a');
      a.href = url; a.download = nom;
      doc.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { racine.URL.revokeObjectURL(url); }, 4000);
      return 'telechargement';
    });
  }

  // ── `ajuste()` : un grand chiffre tient dans la largeur disponible moins les marges ─
  function ajuste(chiffre) {
    var c = chiffre.querySelectorAll('.cpt'), avant = [];
    c.forEach(function (x) { avant.push(x.textContent); x.textContent = valeurCpt(x, 1); });
    chiffre.style.fontSize = '';
    var t = parseFloat(racine.getComputedStyle(chiffre).fontSize);
    var cs = racine.getComputedStyle(chiffre.parentNode);
    var max = chiffre.parentNode.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    while (chiffre.scrollWidth > max && t > 30) { t -= 2; chiffre.style.fontSize = t + 'px'; }
    c.forEach(function (x, k) { x.textContent = avant[k]; });
  }
  function valeurCpt(x, r) {
    var v = Number(x.dataset.v) * r;
    return x.dataset.dec ? M().nombreTexte(Math.round(v * 10) / 10, 1) : milliers(Math.round(v));
  }

  // ── Le lecteur ───────────────────────────────────────────────────────────
  function ouvrir(hote, vue) {
    var liste = ecrans(vue), an = vue.bilan.periode.libelle;
    while (hote.firstChild) hote.removeChild(hote.firstChild);
    hote.hidden = false;
    var tel = el('div', 'tel');
    var bar = el('div', 'bar');
    tel.appendChild(bar);
    var fermer = el('button', 'fermer', '×');
    fermer.type = 'button';
    fermer.setAttribute('aria-label', 'Fermer');
    tel.appendChild(fermer);
    var bPartage = el('button', 'partage', 'Partager');
    bPartage.type = 'button';
    bPartage.setAttribute('aria-label', 'Partager cet écran');
    tel.appendChild(bPartage);
    var S = liste.map(function (e) { var s = section(e); tel.appendChild(s); return s; });
    S.forEach(function () { var x = el('i'); x.appendChild(el('b')); bar.appendChild(x); });
    hote.appendChild(tel);

    var i = 0, ecoule = 0, t0 = 0, pause = false, appui = 0, fini = false, raf = null;
    var calme = racine.matchMedia ? racine.matchMedia('(prefers-reduced-motion: reduce)').matches : false;
    var etat = { partages: [], fermer: null };
    function compte(x) {
      var d = calme ? 0 : 1300, s = racine.performance.now();
      (function f(n) {
        if (fini) return;
        var r = d ? Math.min(1, (n - s) / d) : 1, e = 1 - Math.pow(1 - r, 3);
        x.textContent = valeurCpt(x, e);
        if (r < 1) racine.requestAnimationFrame(f);
      })(s);
    }
    function voir() {
      S.forEach(function (s, k) { s.classList.toggle('on', k === i); });
      [].forEach.call(bar.children, function (x, k) { x.firstChild.style.width = k < i ? '100%' : '0'; });
      var s = S[i];
      s.querySelectorAll('.chiffre').forEach(ajuste);
      s.querySelectorAll('.cpt').forEach(compte);
      s.querySelectorAll('.mois b').forEach(function (b, k) {
        b.style.height = '0';
        setTimeout(function () { b.style.height = b.dataset.h + 'px'; }, 80 + k * 60);
      });
      s.querySelectorAll('[data-w]').forEach(function (b) {
        b.style.width = '0';
        setTimeout(function () { b.style.width = b.dataset.w + '%'; }, 40);
      });
      if (i === S.length - 1 && racine.navigator && racine.navigator.vibrate) { try { racine.navigator.vibrate(25); } catch (e) { /* refusée */ } }
      ecoule = 0; t0 = racine.performance.now();
      hote.dataset.ecran = liste[i].cle;
    }
    function tic(n) {
      if (fini) return;
      var d = Number(S[i].dataset.d);
      if (!pause && d) {
        ecoule += n - t0;
        bar.children[i].firstChild.style.width = Math.min(100, ecoule / d * 100) + '%';
        if (ecoule >= d && i < S.length - 1) { i++; voir(); }
      }
      t0 = n;
      raf = racine.requestAnimationFrame(tic);
    }
    function partagerIci(e) {
      bPartage.textContent = 'Image…';
      var p = partager(e, an).then(function (r) {
        etat.partages.push({ cle: e.cle, issue: r });
        hote.dataset.partages = String(etat.partages.length);
        bPartage.textContent = r === 'annule' ? 'Partager' : 'Image prête';
        setTimeout(function () { bPartage.textContent = 'Partager'; }, 1400);
        return r;
      }, function () { bPartage.textContent = 'Partager'; });
      return p;
    }
    function fermerTout() {
      if (fini) return;
      fini = true;
      if (raf) racine.cancelAnimationFrame(raf);
      doc.removeEventListener('keydown', clavier);
      hote.hidden = true;
      while (hote.firstChild) hote.removeChild(hote.firstChild);
      if (vue.surFermer) vue.surFermer();
    }
    function clavier(e) {
      if (e.key === 'ArrowRight') { i = Math.min(S.length - 1, i + 1); voir(); }
      if (e.key === 'ArrowLeft') { i = Math.max(0, i - 1); voir(); }
      if (e.key === ' ') { pause = !pause; hote.dataset.pause = pause ? '1' : '0'; }
      if (e.key === 'Escape') fermerTout();
    }
    tel.addEventListener('pointerdown', function (e) { pause = true; appui = e.timeStamp; hote.dataset.pause = '1'; });
    tel.addEventListener('pointercancel', function () { pause = false; hote.dataset.pause = '0'; });
    tel.addEventListener('pointerup', function (e) {
      pause = false; hote.dataset.pause = '0';
      var b = e.target.closest ? e.target.closest('button') : null;
      if (b) {
        if (b === fermer) fermerTout();
        else if (b === bPartage || b.dataset.action === 'partager') partagerIci(liste[i]);
        else if (b.dataset.action === 'detail') { fermerTout(); if (vue.surDetail) vue.surDetail(); }
        return;
      }
      if (e.timeStamp - appui > 350) return;   // appui long = lecture, pas de saut
      var x = e.clientX - tel.getBoundingClientRect().left;
      i = x < tel.offsetWidth / 3 ? Math.max(0, i - 1) : Math.min(S.length - 1, i + 1);
      voir();
    });
    doc.addEventListener('keydown', clavier);
    voir();
    raf = racine.requestAnimationFrame(tic);
    etat.fermer = fermerTout;
    return etat;
  }

  // ── L'annonce du 1er janvier : un seul message dans l'app ────────────────
  // `vue = { an, surVoir(), surFermer() }`. L'app décide QUAND (une fois par personne et par année) ; ici, le message.
  function annonce(hote, vue) {
    while (hote.firstChild) hote.removeChild(hote.firstChild);
    hote.appendChild(el('p', null, 'Ton année ' + vue.an + ' est prête.'));
    var voir = el('button', null, 'Voir');
    voir.type = 'button';
    var non = el('button', 'discret', 'Plus tard');
    non.type = 'button';
    var fermer = function () { hote.hidden = true; while (hote.firstChild) hote.removeChild(hote.firstChild); };
    voir.addEventListener('click', function () { fermer(); if (vue.surVoir) vue.surVoir(); });
    non.addEventListener('click', function () { fermer(); if (vue.surFermer) vue.surFermer(); });
    hote.appendChild(voir);
    hote.appendChild(non);
    hote.hidden = false;
  }

  var api = { ecrans: ecrans, ouvrir: ouvrir, image: image, ajuste: ajuste, annonce: annonce };
  racine.THAnnee = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
