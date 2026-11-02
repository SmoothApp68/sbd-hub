/** @jest-environment jsdom */
//
// 218 — LE BONHOMME DES MUSCLES (maquette-bonhomme-v2) : les tracés (données), la lecture par partie dessinée, le fait des sept
// jours (`faits.muscleDesSeptJours`, la somme unique de la 217) et le rendu (jsdom, le vrai rendu).
process.env.TZ = 'Europe/Paris';
global.self = global;
const fs = require('fs');
const path = require('path');
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
const Semaine = require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/parcours.js');
const Faits = require('../../v2/js/faits.js');
const Sil = require('../../v2/js/silhouettes.js');
require('../../v2/js/rendu.js');
const Rendu = window.THRendu;
const Mentions = require('../../v2/js/mentions.js');

const lire = (f) => fs.readFileSync(path.join(__dirname, '../../', f), 'utf8');
const MUSCLES = Object.keys(Semaine.LIBELLES_MUSCLE);

describe('218 — les tracés et leur lecture', () => {
  test('dix-huit muscles : chacun est dans UNE partie dessinée, sauf les abducteurs (aucun tracé), et rien d’autre', () => {
    const portes = [].concat.apply([], Sil.PARTIES.map((p) => p.muscles));
    expect(portes.length).toBe(new Set(portes).size);
    expect(portes.concat(Sil.SANS_TRACE).sort()).toEqual(MUSCLES.slice().sort());
    expect(Sil.SANS_TRACE).toEqual(['abducteurs']);
  });
  test('Épaules = les trois deltoïdes ; Dos = haut du dos + grand dorsal', () => {
    const p = (c) => Sil.PARTIES.find((x) => x.cle === c).muscles;
    expect(p('epaules').sort()).toEqual(['deltoide_anterieur', 'deltoide_lateral', 'deltoide_posterieur']);
    expect(p('dos').sort()).toEqual(['grand_dorsal', 'haut_du_dos']);
  });
  test('quatre vues, chaque partie est tracée de face ou de dos, aucun chemin vide', () => {
    expect(Object.keys(Sil.VUES).sort()).toEqual(['femme_arriere', 'femme_avant', 'homme_arriere', 'homme_avant']);
    Object.keys(Sil.VUES).forEach((k) => {
      const v = Sil.VUES[k];
      expect(v.vb).toMatch(/^-?\d+ -?\d+ \d+ \d+$/);
      expect(v.o.length).toBeGreaterThan(500);
      Object.keys(v.r).forEach((c) => { expect(Sil.PARTIES.some((p) => p.cle === c)).toBe(true); expect(v.r[c].length).toBeGreaterThan(20); });
    });
    Sil.PARTIES.forEach((p) => {
      ['homme', 'femme'].forEach((s) => expect(Sil.VUES[s + '_avant'].r[p.cle] || Sil.VUES[s + '_arriere'].r[p.cle]).toBeTruthy());
    });
  });
  test('le fichier de tracés reste sous 60 Ko', () => {
    expect(fs.statSync(path.join(__dirname, '../../v2/js/silhouettes.js')).size).toBeLessThan(60000);
  });
  test('la valeur d’une partie est la somme de ses muscles ; la teinte est proportionnelle au maximum, sans seuil', () => {
    const volume = { deltoide_anterieur: 8.5, deltoide_lateral: 6, deltoide_posterieur: 3.5, haut_du_dos: 9, grand_dorsal: 10, pectoraux: 12, abducteurs: 1.5, biceps: 0.25 };
    const l = Sil.lire(volume, Semaine.LIBELLES_MUSCLE);
    expect(l.valeurs.epaules).toBe(18);
    expect(l.valeurs.dos).toBe(19);
    expect(l.valeurs.biceps).toBe(0.25);
    expect(l.valeurs.fessiers).toBe(0);
    expect(l.max).toBe(19);
    expect(l.lignes.length).toBe(18);
    expect(l.lignes.find((x) => x.muscle === 'abducteurs')).toMatchObject({ series: 1.5, sansTrace: true });
    expect(Sil.teinte(0, 19)).toBe('#2b3442');
    expect(Sil.teinte(19, 19)).toBe('#5cb8ff');
    expect(Sil.teinte(5, 0)).toBe('#2b3442');
  });
  test('la teinte reste un bleu : jamais rouge ni vert dominant, jamais l’ambre', () => {
    for (let v = 0; v <= 20; v += 0.5) {
      const h = Sil.teinte(v, 20), r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
      expect(b).toBeGreaterThanOrEqual(g); expect(b).toBeGreaterThanOrEqual(r);
    }
  });
  test('les constantes de teinte sont celles de styles.css (--trait et --teinte)', () => {
    const css = lire('v2/styles.css');
    const hex = (a) => '#' + a.map((c) => ('0' + c.toString(16)).slice(-2)).join('');
    expect(css).toMatch(new RegExp('--teinte:' + hex(Sil.TEINTE), 'i'));
    expect(css).toMatch(new RegExp('--trait:' + hex(Sil.TEINTE_0), 'i'));
  });
  test('le crédit et la licence MIT se lisent dans Profil › À propos (Crédits), le fichier ne porte aucun code du paquet', () => {
    const c = Mentions.page('credits');
    expect(c.titre).toBe('Crédits');
    const t = JSON.stringify(c);
    expect(t).toMatch(/react-native-body-highlighter 3\.2\.0/);
    expect(t).toMatch(/ELABBASSI Hicham/);
    expect(t).toMatch(/Permission is hereby granted/);
    expect(Sil.CREDIT).toMatch(/MIT/);
  });
  test('le fichier est dans la page et dans la coquille du service worker', () => {
    expect(lire('v2/index.html')).toMatch(/<script src="\/js\/silhouettes\.js"><\/script>/);
    expect(lire('v2/service-worker.js')).toMatch(/'\.\/js\/silhouettes\.js'/);
  });
});

// ── Le fait des sept jours ────────────────────────────────────────────────────────────────────────────────────────────
const fiche = (prim, sec, stab) => ({ muscles_primaires: prim, muscles_secondaires: sec || [], muscles_stabilisateurs: stab || [] });
const CATALOGUE = [
  Object.assign({ slug: 'squat_barre' }, fiche(['quadriceps', 'fessiers'], ['adducteurs'], ['bas_du_dos'])),
  Object.assign({ slug: 'developpe_couche_barre' }, fiche(['pectoraux'], ['triceps', 'deltoide_anterieur'])),
  Object.assign({ slug: 'tractions' }, fiche(['grand_dorsal'], ['biceps', 'haut_du_dos']))
];
function corpus(seances, series) {
  return { seances, series: [].concat.apply([], Object.keys(series).map((k) => series[k])), seriesDe: (id) => series[id] || [], exercices: CATALOGUE,
           catalogue: () => ({}) };
}
const travail = (slug, extra) => Object.assign({ exercise_slug: slug, type_serie: 'travail' }, extra);
const n = (k, slug) => Array.from({ length: k }, () => travail(slug, { reps: 8, charge_kg: 50 }));

describe('218 — le fait des sept jours (`faits.muscleDesSeptJours`)', () => {
  const F = Faits.creer();
  const J = '2026-10-31';
  const seances = [
    { id: 'hier', debut: '2026-10-30T09:00:00Z' }, { id: 'j0', debut: '2026-10-31T07:00:00Z' },
    { id: 'limite', debut: '2026-10-25T09:00:00Z' },     // le 25 : 7e jour (25 → 31)
    { id: 'trop-vieille', debut: '2026-10-24T09:00:00Z' }, { id: 'futur', debut: '2026-11-01T09:00:00Z' }
  ];
  const series = { hier: n(3, 'squat_barre'), j0: n(2, 'developpe_couche_barre'), limite: n(4, 'tractions'),
                   'trop-vieille': n(9, 'squat_barre'), futur: n(9, 'tractions') };
  test('sept jours civils, le jour compris : ni le 24, ni demain', () => {
    const f = F.muscleDesSeptJours(corpus(seances, series), J);
    expect(f.jours).toBe(7);
    expect(f.volume.quadriceps).toBe(3);
    expect(f.volume.grand_dorsal).toBe(4);
  });
  test('la valeur est celle de la fonction unique (`Semaine.sommeDesSeries`), poids 1, ½, ¼ compris', () => {
    const f = F.muscleDesSeptJours(corpus(seances, series), J);
    const attendu = Semaine.sommeDesSeries([
      { exo: CATALOGUE[0], n: 3 }, { exo: CATALOGUE[1], n: 2 }, { exo: CATALOGUE[2], n: 4 }
    ]);
    MUSCLES.forEach((m) => expect(f.volume[m] || 0).toBeCloseTo(attendu[m] || 0, 5));
    expect(f.volume.bas_du_dos).toBe(0.75);
    expect(f.volume.deltoide_anterieur).toBe(1);
  });
  test('seules les séries de travail comptent ; une date illisible ne casse rien', () => {
    const s2 = { hier: [travail('squat_barre'), { exercise_slug: 'squat_barre', type_serie: 'echauffement' }] };
    expect(F.muscleDesSeptJours(corpus([seances[0]], s2), J).volume.quadriceps).toBe(1);
    expect(F.muscleDesSeptJours(corpus(seances, series), 'n’importe quoi').volume).toEqual({});
  });
});

// ── Le rendu ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const texte = (x) => x.textContent.replace(/[ \t\n]+/g, ' ').trim();
const VOLUME = { deltoide_anterieur: 8.5, deltoide_lateral: 6, deltoide_posterieur: 3.5, haut_du_dos: 9, grand_dorsal: 10, pectoraux: 12, fessiers: 8, abducteurs: 1.5 };
function rendre(extra) {
  const c = document.createElement('div');
  document.body.appendChild(c);
  const ecrit = [];
  const vue = Object.assign({ volume: VOLUME, libelles: Semaine.LIBELLES_MUSCLE, sexe: 'homme', surSexe: (s) => ecrit.push(s) }, extra || {});
  const carte = Rendu.rendreBonhomme(c, vue);
  return { c, carte, ecrit, vue };
}
const partie = (carte, cle, cote) => carte.querySelector((cote ? '[data-cote="' + cote + '"] ' : '') + '[data-p="' + cle + '"]');

describe('218 — le rendu du bonhomme', () => {
  test('la valeur dessinée d’une partie : sa teinte vient de la somme de ses muscles lue dans la lecture unique', () => {
    const { carte } = rendre();
    const l = Sil.lire(VOLUME, Semaine.LIBELLES_MUSCLE);
    ['epaules', 'dos', 'pectoraux', 'fessiers', 'mollets'].forEach((cle) => {
      const el = partie(carte, cle);
      expect(el).toBeTruthy();
      expect(el.getAttribute('fill')).toBe(Sil.teinte(l.valeurs[cle], l.max));
    });
    expect(l.valeurs.epaules).toBe(18);
    expect(partie(carte, 'epaules').getAttribute('fill')).not.toBe(partie(carte, 'mollets').getAttribute('fill'));
  });
  test('la liste : les dix-huit muscles, leurs chiffres, les abducteurs « pas dessiné »', () => {
    const { carte } = rendre();
    const lignes = [].slice.call(carte.querySelectorAll('.bh-liste li'));
    expect(lignes.length).toBe(18);
    const parMuscle = {};
    lignes.forEach((li) => { parMuscle[li.getAttribute('data-muscle')] = li.querySelector('b').textContent; });
    expect(parMuscle.grand_dorsal).toBe('10');
    expect(parMuscle.deltoide_lateral).toBe('6');
    expect(parMuscle.fessiers).toBe('8');
    expect(parMuscle.mollets).toBe('0');
    expect(texte(carte.querySelector('[data-muscle="abducteurs"]'))).toMatch(/pas dessiné/);
    expect(Object.keys(parMuscle).sort()).toEqual(MUSCLES.slice().sort());
  });
  test('le dessin est caché aux lecteurs d’écran (la liste dit la même chose), les cibles font 44 px', () => {
    const { carte } = rendre();
    expect(carte.querySelector('.bh-vues').getAttribute('aria-hidden')).toBe('true');
    expect(carte.querySelector('.bh-liste').closest('[aria-hidden]')).toBeNull();
    expect(lire('v2/styles.css')).toMatch(/\.bh-choix\{flex:1;min-height:44px/);
  });
  test('toucher une partie : la bulle dit le fait en toutes lettres, sans jugement', () => {
    const { carte } = rendre();
    partie(carte, 'fessiers', 'arriere').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const b = carte.querySelector('[data-cote="arriere"] .bh-bulle');
    expect(b.hidden).toBe(false);
    expect(texte(b)).toBe('Fessiers : 8 séries cette semaine');
    partie(carte, 'epaules', 'avant').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(texte(carte.querySelector('[data-cote="avant"] .bh-bulle'))).toBe('Épaules : 18 séries cette semaine');
    expect(carte.querySelector('[data-cote="arriere"] .bh-bulle').hidden).toBe(true);   // une seule bulle à la fois
    partie(carte, 'epaules', 'avant').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(carte.querySelector('[data-cote="avant"] .bh-bulle').hidden).toBe(true);      // un second toucher la ferme
    expect(texte(carte)).not.toMatch(/trop|manque|retard|bravo|!/i);
  });
  test('une série, zéro série : le singulier', () => {
    const { carte } = rendre({ volume: { pectoraux: 1 } });
    partie(carte, 'pectoraux', 'avant').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(texte(carte.querySelector('[data-cote="avant"] .bh-bulle'))).toBe('Pectoraux : 1 série cette semaine');
    partie(carte, 'mollets', 'avant').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(texte(carte.querySelector('[data-cote="avant"] .bh-bulle'))).toBe('Mollets : 0 série cette semaine');
  });
  test('Homme / Femme : le dessin change, les chiffres non ; le choix est rendu à l’app, le rendu n’écrit rien d’autre', () => {
    const { carte, ecrit } = rendre();
    const avant = carte.querySelector('.bh-liste').textContent;
    const dHomme = partie(carte, 'pectoraux', 'avant').getAttribute('d');
    expect(carte.querySelector('[data-sexe="homme"]').getAttribute('aria-checked')).toBe('true');
    carte.querySelector('[data-sexe="femme"]').click();
    expect(ecrit).toEqual(['femme']);
    expect(carte.querySelector('[data-sexe="femme"]').getAttribute('aria-checked')).toBe('true');
    expect(carte.querySelector('[data-sexe="homme"]').getAttribute('aria-checked')).toBe('false');
    expect(partie(carte, 'pectoraux', 'avant').getAttribute('d')).not.toBe(dHomme);
    expect(carte.querySelector('.bh-liste').textContent).toBe(avant);
    carte.querySelector('[data-sexe="femme"]').click();   // le même choix : rien de plus
    expect(ecrit).toEqual(['femme']);
  });
  test('un sexe inconnu retombe sur Homme ; rendre deux fois ne déclenche aucun geste', () => {
    const r = rendre({ sexe: 'autre' });
    expect(r.carte.getAttribute('data-bonhomme')).toBe('homme');
    rendre(); rendre();
    expect(r.ecrit).toEqual([]);
  });
  test('sans aucune série : tout au fond de carte, « 0 série », rien ne casse', () => {
    const { carte } = rendre({ volume: {} });
    expect(partie(carte, 'pectoraux', 'avant').getAttribute('fill')).toBe('#2b3442');
    expect(texte(carte.querySelector('.bh-legende'))).toBe('00 série');   // « 0 » puis le maximum, « 0 série »
  });
  test('la carte est en tête de « Ta semaine et tes équilibres » quand l’analyse parle', () => {
    const c = document.createElement('div');
    Rendu.rendreEquilibres(c, { analyse: { etat: 'carnet', cartes: [], constats: [], calmes: [], quand: null }, fait: null,
      bonhomme: { volume: VOLUME, libelles: Semaine.LIBELLES_MUSCLE, sexe: 'femme', surSexe: () => {} } });
    expect(c.querySelector('[data-equilibres] > .bonhomme[data-bonhomme="femme"]')).toBeTruthy();
  });
});

describe('218 — le budget de la carte, à l’échelle d’un vrai historique (627 séances)', () => {
  test('le fait des sept jours + la lecture + le rendu tiennent dans 150 ms', () => {
    const seances = [], series = {};
    const slugs = ['squat_barre', 'developpe_couche_barre', 'tractions'];
    for (let i = 0; i < 627; i++) {
      const d = new Date(Date.UTC(2026, 9, 31, 9) - i * 86400000 * 0.9);
      seances.push({ id: 's' + i, debut: d.toISOString() });
      series['s' + i] = [].concat.apply([], slugs.map((s) => n(5, s)));
    }
    const c = corpus(seances, series);
    const F = Faits.creer();
    F.muscleDesSeptJours(c, '2026-10-31');   // échauffement du moteur JS
    const t0 = Date.now();
    const f = F.muscleDesSeptJours(c, '2026-10-31');
    const conteneur = document.createElement('div');
    Rendu.rendreBonhomme(conteneur, { volume: f.volume, libelles: Semaine.LIBELLES_MUSCLE, sexe: 'homme', surSexe: () => {} });
    expect(Date.now() - t0).toBeLessThan(150);
    expect(f.volume.quadriceps).toBeGreaterThan(0);
  });
});
