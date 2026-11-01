#!/usr/bin/env node
// tests/banc/feuilles-215.js — 215 : une feuille n'a qu'un « Fermer », et la barre des disques tient dans la feuille.
//
// Vrai navigateur, vraie feuille commune (la structure de `#feuille-seance`), les vrais rendus de `rendu.js` et le vrai
// `styles.css` — sans l'app ni la base (aucun réseau). Deux contrôles :
//   1. chaque rendu de feuille qui passe par `#feuille-contenu` laisse UN SEUL bouton « Fermer » dans la feuille (celui
//      de la feuille commune) ;
//   2. la feuille « Disques », à 360 et 380 px, avec le pire cas réaliste (25+25+20+15+10+5+2,5+1,25 par côté) : les
//      rectangles des chiffres sont disjoints, dans la feuille, et la barre ne déborde pas.
//   node tests/banc/feuilles-215.js

'use strict';
const path = require('path');
const R = path.join(__dirname, '../..');
const { chromium } = require(path.join(R, 'node_modules/playwright-core'));
const Garde = require(path.join(R, 'tests/banc/garde-reseau.js'));
const Verrou = require(path.join(R, 'tests/banc/verrou.js'));
const { creer } = require(path.join(R, 'v2-atelier/banc/serveur-pages.js'));
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let echecs = 0;
const ok = (nom, bon, detail) => { if (!bon) echecs++; console.log((bon ? '✅ ' : '❌ ') + nom + (bon || !detail ? '' : ' — ' + detail)); };

const PAGE = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<link rel="stylesheet" href="/styles.css"></head><body>' +
  '<div id="feuille-seance" class="voile"><div class="fen feuille" role="dialog"><div id="feuille-contenu"></div>' +
  '<button id="btn-fermer-feuille" type="button" class="fermer">Fermer</button></div></div>' +
  '<script src="/js/modele.js"></script><script src="/js/semaine.js"></script><script src="/js/moteur.js"></script>' +
  '<script src="/js/bilan.js"></script><script src="/js/rendu.js"></script></body></html>';

(async () => {
  const rendreVerrou = await Verrou.prendre();
  const serveur = creer({});
  const port = await Verrou.ecouter(serveur, 0);
  const BASE = 'http://127.0.0.1:' + port;
  const nav = await Garde.lancer(chromium, { executablePath: CHROME, args: ['--no-sandbox'] });
  try {
    for (const largeur of [360, 380]) {
      const page = await nav.newPage({ viewport: { width: largeur, height: 780 } });
      await page.route('**/_banc215.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
      await page.goto(BASE + '/_banc215.html');
      await page.waitForFunction(() => window.THRendu && window.THMoteur);

      // 1. un seul « Fermer » par feuille
      const fermers = await page.evaluate(() => {
        const R = window.THRendu, c = document.getElementById('feuille-contenu'), rien = () => {};
        const nb = () => [...document.querySelectorAll('.feuille button')].filter((b) => b.textContent.trim() === 'Fermer').length;
        const sorties = {};
        const essai = (nom, f) => { try { f(); sorties[nom] = nb(); } catch (e) { sorties[nom] = 'exception ' + e.message; } };
        essai('mentions', () => R.rendreFeuilleMentions(c, { titre: 'Santé', blocs: [{ texte: 'x' }], surFermer: rien }));
        essai('semaine de test', () => R.rendreFeuilleSemaineDeTest(c, { actif: false, phrase: 'p', peutLancer: true, barres: [], surFermer: rien, surMode: rien, surLancer: rien, surAnnuler: rien }));
        essai('mots', () => R.rendreFeuilleMots(c, { mots: window.THMoteur.lexique(), surFermer: rien }));
        essai('export', () => R.rendreFeuilleExport(c, { aide: 'a', libelleJson: 'j', libelleCsv: 'c', surJson: rien, surCsv: rien, surFermer: rien, etat: '' }));
        essai('écartés', () => R.rendreFeuilleEcartes(c, { titre: 't', aide: 'a', exercices: [{ nom: 'n', surReprendre: rien }], surFermer: rien }));
        essai('comment faire', () => R.rendreFeuilleCommentFaire(c, { nom: 'n', comment: {}, surFermer: rien }));
        essai('bloc en cours', () => R.rendreFeuilleBlocEnCours(c, { dossier: 'd', badge: 'b', exercices: ['a'], surArreter: rien, surFermer: rien }));
        return sorties;
      });
      for (const [nom, n] of Object.entries(fermers)) ok(largeur + ' px — « ' + nom + ' » : un seul « Fermer »', n === 1, String(n));

      // 2. les disques
      const mesure = await page.evaluate(() => {
        const R = window.THRendu, M = window.THMoteur, c = document.getElementById('feuille-contenu');
        const present = [25, 20, 15, 10, 5, 2.5, 1.25, 1, 0.5, 0.25];
        const charge = 20 + 2 * (25 + 25 + 20 + 15 + 10 + 5 + 2.5 + 1.25);
        const dec = { ok: true, parCote: [25, 25, 20, 15, 10, 5, 2.5, 1.25] };   // le pire cas réaliste, posé tel quel
        R.rendreFeuilleDisques(c, { nom: 'Squat (Barre)', charge, barre: 20, decomposition: dec, charges: [], phraseIntrouvable: '', choixBarre: false, barresProposees: [], resumeDisques: '25 · 20', choixDisques: true, surChoixDisques() {}, surDisque() {}, ligneDisques: { cle: 'disques', multiple: true, absence: true, valeurs: [20], options: [{ cle: 25, libelle: '25 kg' }, { cle: 20, libelle: '20 kg' }] }, surChoixBarre() {}, surBarre() {}, surCharge() {} });
        const f = document.querySelector('.fen.feuille').getBoundingClientRect();
        const rects = (n) => { const r = n.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, d: r.right, b: r.bottom }; };
        const disques = [...document.querySelectorAll('.dq-disque')].map((d) => {
          const txt = d.textContent, r = rects(d);
          let chiffre = null;
          if (txt) { const g = document.createRange(); g.selectNodeContents(d); const t = g.getBoundingClientRect(); chiffre = { x: t.left, d: t.right, y: t.top, b: t.bottom }; }
          return { txt, titre: d.title, r, chiffre, sw: d.scrollWidth, cw: d.clientWidth };
        });
        const barre = document.querySelector('.dq-barre'), bout = document.querySelector('.dq-bout');
        const puces = [...document.querySelectorAll('.dq-disques-puces .q-puce')].map((p) => [p.textContent, p.classList.contains('absent'), getComputedStyle(p).textDecorationLine]);
        return { puces, feuille: { x: f.left, d: f.right }, disques, boutD: bout.getBoundingClientRect().right, barreD: barre.getBoundingClientRect().right,
                 parCote: dec.parCote, sw: document.documentElement.scrollWidth, iw: window.innerWidth };
      });
      ok(largeur + ' px — le pire cas est décomposé : ' + mesure.parCote.join('+'), mesure.parCote.length === 8);
      const ch = mesure.disques.filter((d) => d.chiffre);
      let disjoints = true;
      for (let i = 0; i < ch.length; i++) {
        if (ch[i].chiffre.x < mesure.feuille.x - 0.5 || ch[i].chiffre.d > mesure.feuille.d + 0.5) disjoints = false;
        if (ch[i].chiffre.x < ch[i].r.x - 0.5 || ch[i].chiffre.d > ch[i].r.d + 0.5 || ch[i].sw > ch[i].cw) disjoints = false;   // dans SON disque
        if (i && ch[i].chiffre.x < ch[i - 1].chiffre.d - 0.5) disjoints = false;
      }
      ok(largeur + ' px — les chiffres sont dans leur disque, disjoints et dans la feuille', disjoints && ch.length >= 5, JSON.stringify(ch.map((d) => [d.txt, d.chiffre, d.r.w])));
      ok(largeur + ' px — la barre tient dans la feuille (bout ≤ bord)', mesure.boutD <= mesure.feuille.d + 0.5, mesure.boutD + ' / ' + mesure.feuille.d);
      ok(largeur + ' px — aucun défilement horizontal de la page', mesure.sw <= mesure.iw, mesure.sw + ' / ' + mesure.iw);
      ok(largeur + ' px — une puce de disque absente se lit « absent », barrée', mesure.puces.length === 2 && mesure.puces[0][0].includes('absent') && mesure.puces[0][2].includes('line-through') && !mesure.puces[1][0].includes('absent'), JSON.stringify(mesure.puces));
      ok(largeur + ' px — un petit disque garde son chiffre (title), sans le dessiner dedans', mesure.disques.filter((d) => !d.txt).every((d) => d.titre));
      await page.close();
    }
  } finally {
    await nav.close();
    serveur.close();
    rendreVerrou();
  }
  if (echecs) { console.log('\n' + echecs + ' contrôle(s) en échec'); process.exit(1); }
  console.log('\nBanc 215 vert');
})().catch((e) => { console.error(e); process.exit(1); });
