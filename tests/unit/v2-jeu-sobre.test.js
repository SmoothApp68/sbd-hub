//
// 273 — LE MODE SOBRE « FAITS SEULEMENT » : une préférence de l'appareil, éteinte par défaut, lue en UN seul endroit
// (`jeuVisible`, app.js), sur le vrai code d'`app.js`. Il masque le niveau, l'XP, les succès, les titres, les cadres et
// le plus proche ; il garde les records, les courbes, les paris, le carnet de jalons et la ligne de cap du récap.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.self = global;
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
const Profil = require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
const Jeu = require('../../v2/js/jeu.js');
require('../../v2/js/rendu.js');
const Rendu = window.THRendu;

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const bloc = (nom) => APP.match(new RegExp('^  function ' + nom + '\\b[^\\n]*\\}\\s*$', 'm')) ||
  APP.match(new RegExp('^  function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));

function garde(stockage, profil) {
  const ctx = { Profil, profil, racine: { localStorage: stockage } };
  vm.createContext(ctx);
  ['jeuAllume', 'modeSobre', 'poserModeSobre', 'jeuVisible'].forEach((n) => vm.runInContext(bloc(n)[0], ctx));
  vm.runInContext("var CLE_SOBRE = 'th-v2-faits-seulement';", ctx);
  return ctx;
}
const memoire = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };

describe('273 — le mode sobre, une garde en un seul endroit', () => {
  test('éteint par défaut : le jeu allumé se voit ; allumé, il disparaît du rendu mais pas du compte', () => {
    const st = memoire();
    const c = garde(st, { jeu_actif: true });
    expect(c.jeuVisible()).toBe(true);
    c.poserModeSobre(true);
    expect(c.modeSobre()).toBe(true);
    expect(c.jeuVisible()).toBe(false);
    expect(c.jeuAllume()).toBe(true);
    c.poserModeSobre(false);
    expect(c.jeuVisible()).toBe(true);
  });
  test('sans stockage (ou qui lève) : le mode reste éteint, rien ne casse', () => {
    const casse = { getItem() { throw new Error('bloqué'); }, setItem() { throw new Error('bloqué'); } };
    const c = garde(casse, { jeu_actif: true });
    expect(c.modeSobre()).toBe(false);
    expect(() => c.poserModeSobre(true)).not.toThrow();
    expect(c.jeuVisible()).toBe(true);
  });
  test('jeu éteint sur le compte : jamais visible', () => {
    expect(garde(memoire(), { jeu_actif: false }).jeuVisible()).toBe(false);
  });
  test('la garde ne vit qu’en un endroit : aucune lecture directe du stockage du mode ailleurs', () => {
    expect(APP.split('CLE_SOBRE').length - 1).toBe(3);   // la déclaration, la lecture, l'écriture
    expect(APP.split('modeSobre()').length - 1).toBeGreaterThanOrEqual(3);
  });
});

describe('273 — le récap en mode sobre : l’XP se masque, la ligne de cap reste', () => {
  const recap = { titre: 'Jambes', debut: '2026-10-10T12:27:00Z', fin: '2026-10-10T13:30:00Z', duree_min: 63, series: 3,
    volume_kg: 500, volume_texte: '0,5 t', exercices: 1, phraseVolume: null, muscles: { premiers: [], autres: null },
    records: [], paris: null, note: null };
  const apport = { xp: 60, niveau: { de: 87, a: 88 }, muscles: [], succes: ['cap-squat_barre-140'], points: 4 };
  const jeu = { apport, succes: [Object.assign(Jeu.descriptionDuSucces('cap-squat_barre-140'), { nom: 'Squat', plaques: 3 })],
    caps: [{ sorte: 'cap', id: 'cap-squat_barre-140', slug: 'squat_barre', kg: 140, plaques: 3, charge: 140, reps: 3, nom: 'Squat', date: '2026-10-10T12:30:00Z' }] };
  const rendre = (sobre) => { const c = document.createElement('div'); Rendu.rendreRecap(c, { recap, jeu, sobre, surFermer() {}, surVoir() {} }); return c; };

  test('mode normal : XP, niveau, puis la ligne de cap (pas répétée en « Succès »)', () => {
    const c = rendre(false);
    expect(c.querySelector('#jeu-fin').textContent).toContain('XP');
    expect(c.querySelector('#jeu-fin').textContent).not.toContain('Succès');
    expect(c.querySelector('.j-cap').textContent.replace(/[\u00a0\u202f]/g, ' ')).toBe('Squat : 3 plaques pour la première fois. 140 kg × 3.');
  });
  test('mode sobre : ni XP, ni niveau, ni succès ; la ligne de cap reste', () => {
    const c = rendre(true);
    const t = c.querySelector('#jeu-fin').textContent;
    expect(t).not.toMatch(/XP|Niveau|Succès|Muscles/);
    expect(c.querySelector('.j-cap').textContent.replace(/[\u00a0\u202f]/g, ' ')).toBe('Squat : 3 plaques pour la première fois. 140 kg × 3.');
  });
  test('mode sobre sans cap : pas de bloc du tout', () => {
    const c = document.createElement('div');
    Rendu.rendreRecap(c, { recap, jeu: { apport, succes: [], caps: [] }, sobre: true, surFermer() {}, surVoir() {} });
    expect(c.querySelector('#jeu-fin')).toBeNull();
  });
  test('hors barre : « cap des 150 kg », la série réelle', () => {
    const c = document.createElement('div');
    const l = { sorte: 'cap', id: 'cap-presse-150', slug: 'presse', kg: 150, plaques: null, charge: 155, reps: 8, nom: 'Presse à cuisses', date: 'x' };
    Rendu.rendreRecap(c, { recap, jeu: { apport, succes: [], caps: [l] }, sobre: true, surFermer() {}, surVoir() {} });
    expect(c.querySelector('.j-cap').textContent.replace(/[\u00a0\u202f]/g, ' ')).toBe('Presse à cuisses : cap des 150 kg pour la première fois. 155 kg × 8.');
  });
});

describe('273 — le carnet reste en mode sobre (la feuille ne lit pas la garde)', () => {
  test('la feuille des jalons : phrases, dates, le cap hors barre en or ; vide : « Pas encore de jalon. »', () => {
    const c = document.createElement('div');
    Rendu.rendreFeuilleJalons(c, { lignes: [
      { sorte: 'cap', plaques: null, kg: 300, charge: 300, reps: 8, nom: 'Presse à cuisses', date: '2026-10-09T10:00:00Z' },
      { sorte: 'record', nom: 'Couché', charge: 100, reps: 3, date: '2026-10-05T10:00:00Z' },
      { sorte: 'cap', plaques: 3, kg: 140, charge: 140, reps: 3, nom: 'Squat', date: '2026-09-30T10:00:00Z' }
    ] });
    const t = Array.from(c.querySelectorAll('.jalon-t')).map((n) => n.textContent.replace(/ /g, ' '));
    expect(t).toEqual(['Presse à cuisses : 300 kg × 8', 'Couché : record, 100 kg × 3', 'Squat : 3 plaques (140 kg × 3)']);
    expect(c.querySelectorAll('.j-or').length).toBe(1);
    expect(c.textContent).not.toMatch(/séance|semaine|XP/i);
    const v = document.createElement('div');
    Rendu.rendreFeuilleJalons(v, { lignes: [] });
    expect(v.textContent).toContain('Pas encore de jalon.');
  });
  test('ni la garde ni l’XP dans l’ouverture du carnet', () => {
    const o = bloc('ouvrirJalons')[0];
    expect(o).not.toMatch(/jeuVisible|modeSobre|etatDuJeu/);
  });
});
