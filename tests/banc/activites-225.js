#!/usr/bin/env node
// tests/banc/activites-225.js — 225 : les trois surfaces neuves, dans un vrai navigateur, à 360 et 380 px.
//   1. « Ajouter une activité » (la feuille) : le sport, la durée, l'intensité ; la distance seulement pour un sport en distance ;
//      l'enregistrement fabrique une séance courte (`Seance.activite`), sans muscle ;
//   2. « Objectifs en entretien » (la feuille à cocher du Profil) : le principal n'y est pas proposé, trois au plus ;
//   3. la carte de la veille (« … plus léger aujourd'hui » / « Garder le plan ») : deux gestes ≥ 44 px, rien ne déborde.
// Vrai `rendu.js`, vrai `styles.css`, sans l'app ni la base. Captures : tests/banc/captures-225/ (à regarder).
//   node tests/banc/activites-225.js
'use strict';
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '../..');
const { chromium } = require(path.join(R, 'node_modules/playwright-core'));
const Garde = require(path.join(R, 'tests/banc/garde-reseau.js'));
const Verrou = require(path.join(R, 'tests/banc/verrou.js'));
const { creer } = require(path.join(R, 'v2-atelier/banc/serveur-pages.js'));
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SORTIE = process.env.CAPTURES_225 || path.join(R, 'tests/banc/captures-225');

let echecs = 0;
const ok = (nom, bon, detail) => { if (!bon) echecs++; console.log((bon ? '✅ ' : '❌ ') + nom + (bon || !detail ? '' : ' — ' + detail)); };

const PAGE = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<link rel="stylesheet" href="/styles.css"></head><body>' +
  '<div id="feuille-seance" class="voile"><div class="fen feuille" role="dialog"><div id="feuille-contenu"></div>' +
  '<button id="btn-fermer-feuille" type="button" class="fermer">Fermer</button></div></div><div id="corps"></div>' +
  '<script src="/js/modele.js"></script><script src="/js/semaine.js"></script><script src="/js/moteur.js"></script>' +
  '<script src="/js/bilan.js"></script><script src="/js/seance.js"></script><script src="/js/rendu.js"></script><script src="/js/profil.js"></script></body></html>';

(async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  const rendreVerrou = await Verrou.prendre();
  const serveur = creer({});
  const port = await Verrou.ecouter(serveur, 0);
  const BASE = 'http://127.0.0.1:' + port;
  const nav = await Garde.lancer(chromium, { executablePath: CHROME, args: ['--no-sandbox'] });
  try {
    for (const largeur of [360, 380]) {
      const page = await nav.newPage({ viewport: { width: largeur, height: 780 } });
      await page.route('**/_banc225.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
      await page.goto(BASE + '/_banc225.html');
      await page.waitForFunction(() => window.THRendu && window.THMoteur && window.THProfil && window.THSeance);
      await page.evaluate(() => { document.getElementById('feuille-seance').hidden = false; });
      const sans = (nom) => path.join(SORTIE, nom + '-' + largeur + '.png');
      const bornes = () => page.evaluate(() => {
        const f = document.querySelector('.fen.feuille').getBoundingClientRect();
        const debordants = [...document.querySelectorAll('#feuille-contenu *')].filter((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && (r.right > f.right + 0.5 || r.left < f.left - 0.5); }).length;
        const petits = [...document.querySelectorAll('#feuille-contenu button')].filter((b) => b.getBoundingClientRect().height < 40).map((b) => b.textContent);
        return { debordants, petits, sw: document.documentElement.scrollWidth, iw: window.innerWidth };
      });

      // 1. LA FEUILLE « AJOUTER UNE ACTIVITÉ »
      await page.evaluate(() => {
        const sports = [{ cle: 'football', libelle: 'Football', distance: false }, { cle: 'course_a_pieds', libelle: 'Course à pied', distance: true }];
        const etat = { sport: null, minutes: '', km: '', intensite: 'moyenne', enregistre: null };
        window.__etat = etat;
        const dessiner = () => window.THRendu.rendreFeuilleActivite(document.getElementById('feuille-contenu'), {
          aide: 'Un sport, une durée, une intensité.', sports, sport: etat.sport, minutes: etat.minutes, km: etat.km, intensite: etat.intensite,
          intensites: window.THMoteur.ACTIVITE_INTENSITES, erreur: etat.erreur || '',
          surSport(c) { etat.sport = c; dessiner(); }, surSaisie(c, t) { etat[c] = t; return null; }, surIntensite(c) { etat.intensite = c; dessiner(); },
          surAnnuler() {}, surEnregistrer() {
            etat.enregistre = window.THSeance.activite({ id: 'A', slug: etat.sport, titre: etat.sport, minutes: Number(etat.minutes), km: etat.km ? Number(etat.km.replace(',', '.')) : null,
              intensite: etat.intensite, idSerie: () => 'x' + Math.random() });
          } });
        dessiner();
      });
      ok(largeur + ' px — la feuille d’activité : trois intensités, pas de distance sans sport', await page.locator('.q-puce').count() === 3 && await page.locator('[id="q-champ-km"]').count() === 0);
      await page.selectOption('.activite-select', 'course_a_pieds');
      ok(largeur + ' px — un sport en distance montre le champ « Distance (facultatif) »', await page.locator('[id="q-champ-km"]').count() === 1);
      await page.fill('[id="q-champ-minutes"]', '45');
      await page.fill('[id="q-champ-km"]', '8,2');
      await page.click('.q-puce[data-cle="intense"]');
      await page.screenshot({ path: sans('activite') });
      await page.click('text=Enregistrer');
      const a = await page.evaluate(() => window.__etat.enregistre);
      ok(largeur + ' px — l’enregistrement : une séance terminée, 2 700 s, 8 200 m, RPE 9',
        a && a.statut === 'terminee' && a.exercices[0].series[0].duree_s === 2700 && a.exercices[0].series[0].distance_m === 8200 && a.exercices[0].series[0].rpe === 9, JSON.stringify(a && a.exercices[0].series[0]));
      let b = await bornes();
      ok(largeur + ' px — la feuille d’activité ne déborde pas, ses boutons font ≥ 40 px', b.debordants === 0 && b.petits.length === 0 && b.sw <= b.iw, JSON.stringify(b));

      // 2. LES OBJECTIFS EN ENTRETIEN
      await page.evaluate(() => {
        const P = window.THProfil, profil = { objectif: 'les_deux', objectifs_entretien: ['forme'] };
        let liste = P.objectifsDe(profil);
        const dessiner = () => window.THRendu.rendreFeuilleChoixMultiple(document.getElementById('feuille-contenu'), {
          titre: 'Objectifs en entretien', aide: P.AIDE_ENTRETIEN, groupes: [{ titre: 'Je garde aussi', options: P.optionsEntretien(profil) }], valeurs: liste, max: P.ENTRETIEN_MAX,
          aucune: { libelle: 'Aucun', actif: liste.length === 0 }, surBasculer(c) { liste = P.basculerEntretien(liste, c, profil.objectif); dessiner(); },
          surAucune() { liste = []; dessiner(); }, surValider() {}, surAnnuler() {} });
        dessiner();
      });
      const libs = await page.locator('#feuille-contenu .feuille-menu.choix button .choix-t').allTextContents();
      ok(largeur + ' px — sous « Force et muscle », ni Force ni Muscle ne sont proposés (' + libs.join(' · ') + ')', libs.includes('Forme et santé') && libs.includes('Calisthénie') && !libs.includes('Force') && !libs.includes('Muscle') && libs.includes('Aucun'));
      await page.screenshot({ path: sans('entretien') });
      b = await bornes();
      ok(largeur + ' px — la feuille d’entretien ne déborde pas', b.debordants === 0 && b.sw <= b.iw, JSON.stringify(b));

      // 3. LA CARTE DE LA VEILLE
      await page.evaluate(() => {
        document.getElementById('feuille-seance').hidden = true;
        const v = window.THMoteur.veilleActivite({ activite: { slug: 'football', nom: 'Football', intense: true }, jambes: [{ slug: 'squat_barre', nom: 'Squat', legere: window.THMoteur.veilleLegere({ charge: 152.5, reps: 5, reserve: 0, pas: 2.5, equipement: 'barre' }) }] });
        window.__gestes = [];
        window.THRendu.carteDeVeille ? 0 : 0;
        const n = window.THRendu.carteDeVeille(v, { surVeille(c) { window.__gestes.push(c); } });
        document.getElementById('corps').appendChild(n);
      });
      ok(largeur + ' px — la carte de la veille dit la phrase et les deux gestes du moteur',
        (await page.locator('.proposition-veille .pc-texte').textContent()) === 'Tu as noté football hier. Squat plus léger aujourd\u2019hui\u00a0?' &&
        (await page.locator('.proposition-veille .pc-ajouter').textContent()) === 'Squat plus léger aujourd’hui' && (await page.locator('.proposition-veille .pc-refuser').textContent()) === 'Garder le plan');
      await page.click('.proposition-veille .pc-refuser');
      await page.click('.proposition-veille .pc-ajouter');
      ok(largeur + ' px — les deux gestes remontent à l’app', JSON.stringify(await page.evaluate(() => window.__gestes)) === '["garder","leger"]');
      await page.locator('.carte-veille details summary').click();
      await page.screenshot({ path: sans('veille') });
      const carte = await page.evaluate(() => {
        const c = document.querySelector('.carte-veille').getBoundingClientRect();
        return { w: c.width, d: c.right, iw: window.innerWidth, sw: document.documentElement.scrollWidth,
                 hb: [...document.querySelectorAll('.carte-veille button')].map((x) => Math.round(x.getBoundingClientRect().height)) };
      });
      ok(largeur + ' px — la carte de la veille tient dans l’écran, boutons ≥ 40 px', carte.d <= carte.iw && carte.sw <= carte.iw && carte.hb.every((h) => h >= 40), JSON.stringify(carte));
      // 253 (X3) — LA RÉPONSE DU MATIN REPRISE : une ligne et « Changer » (≥ 44 px), rien ne déborde, le geste remonte à l'app.
      await page.evaluate(() => {
        document.getElementById('corps').innerHTML = '';
        window.__gestes = [];
        const r = { choix: 'leger', slug: 'squat_barre', nom: 'Squat', lien: 'Changer', repris: false, phrase: window.THMoteur.phraseDeLaVeilleReprise({ choix: 'leger', nom: 'Squat' }) };
        document.getElementById('corps').appendChild(window.THRendu.ligneDeVeilleReprise(r, { surChangerVeille() { window.__gestes.push('changer'); } }));
      });
      ok(largeur + ' px — la ligne dit « Squat plus léger aujourd’hui. » et offre « Changer »',
        (await page.locator('.veille-reprise-texte').textContent()) === 'Squat plus léger aujourd’hui.' && (await page.locator('.proposition-veille').count()) === 0);
      await page.click('.veille-changer');
      ok(largeur + ' px — « Changer » remonte à l’app', JSON.stringify(await page.evaluate(() => window.__gestes)) === '["changer"]');
      await page.screenshot({ path: sans('veille-reprise') });
      const lr = await page.evaluate(() => {
        const c = document.querySelector('.carte-veille-reprise').getBoundingClientRect();
        return { d: c.right, iw: window.innerWidth, sw: document.documentElement.scrollWidth, h: Math.round(document.querySelector('.veille-changer').getBoundingClientRect().height) };
      });
      ok(largeur + ' px — la ligne reprise tient dans l’écran, « Changer » ≥ 44 px', lr.d <= lr.iw && lr.sw <= lr.iw && lr.h >= 44, JSON.stringify(lr));
      await page.close();
    }
  } finally {
    await nav.close();
    serveur.close();
    rendreVerrou();
  }
  if (echecs) { console.log('\n' + echecs + ' contrôle(s) en échec'); process.exit(1); }
  console.log('\nBanc 225 vert (captures : ' + SORTIE + ')');
})().catch((e) => { console.error(e); process.exit(1); });
