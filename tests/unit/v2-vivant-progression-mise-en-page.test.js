/** @jest-environment node */
//
// 173 (correctif d'affichage, vraies données à ~412 px) — les cartes « mois » et « poids de corps » de Progression, mesurées dans un vrai
// navigateur à 360, 390 et 412 px avec des données longues : rien ne se chevauche, rien ne pend en fin de ligne, mêmes nombres, mêmes mots.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const Garde = require('../banc/garde-reseau.js');

const V2 = path.join(__dirname, '../../v2');
const NB = ' ';
const SCRIPTS = ['modele', 'semaine', 'palier', 'profil', 'moteur', 'rendu'].map((n) => 'file://' + V2 + '/js/' + n + '.js');

// Le même navigateur que les bancs (CHROME_BIN, sinon le chemin de la machine) ; absent, la mesure ne se joue pas ici (les bancs de GitHub l'ont).
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const AVEC = fs.existsSync(CHROME);
const decrire = AVEC ? describe.each : describe.skip.each;
let nav;
beforeAll(async () => { if (AVEC) nav = await Garde.lancer(chromium, { executablePath: CHROME, args: ['--no-sandbox'] }); }, 60000);
afterAll(async () => { if (nav) await nav.close(); });

async function monter(page, largeur, vue) {
  await page.setViewportSize({ width: largeur, height: 900 });
  const f = path.join(os.tmpdir(), 'th-173-mise-en-page.html');
  fs.writeFileSync(f, '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="file://' + V2 + '/styles.css">' +
    '<body><div class="tel"><div id="sommaire"></div></div></body>' +
    SCRIPTS.map((u) => '<script src="' + u + '"></script>').join(''));
  await page.goto('file://' + f);
  await page.evaluate((v) => {
    const f = () => {};
    v.mois.surChoix = f; v.records.surChoix = f; v.volume.surChoix = f; v.poids.surChoix = f; v.poids.surPeser = f;
    v.poids.resume.date = new Date(v.poids.resume.date);
    v.poids.resume.variation.depuis = new Date(v.poids.resume.variation.depuis);
    window.THRendu.rendreSommaire(document.getElementById('sommaire'), v);
  }, vue);
  await page.waitForTimeout(300);
}

const VUE = {
  mois: { titre: 'Septembre', kg: 1265000, series: 400, records: 153, paris: { verifies: 31, tenus: 28 } },
  records: { dernier: { texte: 'Couché 130 kg × 4', nom: 'Couché', mesure: '130 kg × 4', date: '22 sept.' } },
  volume: { quand: '19-25 oct.', zones: [{ libelle: 'Pectoraux', series: 12 }] },
  poids: { resume: { poids: 96.8, date: '2026-10-20T10:00:00', variation: { valeur: -12.4, depuis: '2026-08-30T10:00:00' }, nb: 1115 } },
  exercices: { quand: '', lignes: [] }
};

decrire([360, 390, 412])('Progression à %i px, données longues', (largeur) => {
  let page;
  beforeAll(async () => { page = await nav.newPage(); }, 60000);
  afterAll(async () => { if (page) await page.close(); });

  test('carte du mois : même texte, chaque chiffre avec son libellé, aucun « · » dessiné', async () => {
    await monter(page, largeur, VUE);
    const r = await page.evaluate(() => {
      const l = document.querySelector('.bloc-heros');
      return { texte: l.textContent.replace(/\s+/g, ' ').trim(),
        bouts: Array.from(l.querySelectorAll('.bh-bout')).map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
        seps: Array.from(l.querySelectorAll('.bh-sep')).map((s) => getComputedStyle(s).display),
        debordeX: document.documentElement.scrollWidth > window.innerWidth };
    });
    expect(r.texte).toMatch(/^1\s?265\s?t soulevées · 153 records · 28 paris tenus sur 31$/);
    expect(r.bouts.length).toBe(3);
    expect(r.seps).toEqual(['none', 'none']);
    expect(r.debordeX).toBe(false);
  });

  test('carte du poids : le poids et la variation sur une ligne de base, « depuis… » dessous, « Peser » dessous sans chevaucher', async () => {
    await monter(page, largeur, VUE);
    const r = await page.evaluate(() => {
      const box = (s) => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }; };
      return { gros: box('.pesee-gros'), vari: box('.pesee-var'), depuis: box('.pesee-depuis'), peser: box('.bloc-peser'),
        carte: box('.bloc-enveloppe'), posPeser: getComputedStyle(document.querySelector('.bloc-peser')).position,
        texteDepuis: document.querySelector('.pesee-depuis').textContent, variation: document.querySelector('.pesee-var').textContent,
        debordeX: document.documentElement.scrollWidth > window.innerWidth };
    });
    expect(r.posPeser).not.toBe('absolute');
    expect(r.texteDepuis).toMatch(/^depuis le 30 août · 1\s?115 pesées$/);
    expect(r.variation).toMatch(/12,4 kg$/);
    // La variation est à droite du poids, sur la même ligne ; « depuis » est sous les deux ; « Peser » est sous « depuis ».
    expect(r.vari.left).toBeGreaterThanOrEqual(r.gros.right);
    expect(r.depuis.top).toBeGreaterThanOrEqual(Math.max(r.gros.bottom, r.vari.bottom) - 1);
    expect(r.peser.top).toBeGreaterThanOrEqual(r.depuis.bottom);
    // Rien ne dépasse de la carte, rien ne déborde de l'écran.
    expect(r.peser.right).toBeLessThanOrEqual(r.carte.right);
    expect(r.depuis.right).toBeLessThanOrEqual(r.carte.right);
    expect(r.peser.bottom).toBeLessThanOrEqual(r.carte.bottom);
    expect(r.debordeX).toBe(false);
  });
});
