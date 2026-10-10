//
// 64B — LE BLOC « LE JEU » DE LA FEUILLE « TERMINER » (JEU-V1 §9.4), sur le VRAI code d'`app.js` : `jeuDeLaFeuille`
// et ses voisines (`jeuAllume`, `etatDuJeuCourant`, `succesDecrit`) sont extraites du source et exécutées avec les
// vrais modules (faits, jeu, séance, profil) sur un corpus de papier. Puis le rendu de la feuille (jsdom).
//
// Ce qui doit tenir :
//   · jeu éteint → aucun bloc ;
//   · une série record dans la séance → de l'XP, le cap rond gagné, sans rien écrire ;
//   · ⚠️ une exception (`Seance.lignes` LÈVE sur une série sans identifiant) → `null`, jamais une exception qui
//     emporterait « Terminer » et « Abandonner » ;
//   · la mémoire : une frappe du titre (un objet séance neuf, mêmes séries) ne recalcule pas ; une série validée
//     de plus, si.

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
const Seance = require('../../v2/js/seance.js');
const Faits = require('../../v2/js/faits.js');
const Jeu = require('../../v2/js/jeu.js');
const Routeur = require('../../v2/js/routeur.js');
require('../../v2/js/rendu.js');
const Rendu = window.THRendu;

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
function extraire(nom) {
  const une = new RegExp('^  function ' + nom + '\\b[^\\n]*\\}\\s*$', 'm');
  const m1 = APP.match(une);
  if (m1) return m1[0];
  const bloc = new RegExp('^  function ' + nom + '\\b[\\s\\S]*?^  }', 'm');
  const m = APP.match(bloc);
  if (!m) throw new Error('introuvable dans v2/js/app.js : ' + nom);
  return m[0];
}

const CATALOGUE = [
  { slug: 'squat_barre', nom: 'Squat (Barre)', mesure: 'charge_reps', charge: 'externe', equipement: 'barre',
    muscles_primaires: ['quadriceps'], muscles_secondaires: ['fessiers'] },
  { slug: 'developpe_couche_barre', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', charge: 'externe',
    equipement: 'barre', muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'] }
];
const jour = (ilYa, h) => new Date(Date.now() - ilYa * 86400000 - (h || 0) * 3600000);

// Un historique de papier : deux séances passées, un squat à 140.
function corpusDePapier() {
  const seances = [], series = [], par = {};
  [[9, 140], [16, 130]].forEach(([il, kg], i) => {
    const id = 'p' + i;
    seances.push({ id, debut: jour(il).toISOString(), fin: null });
    par[id] = [{ id: id + '-0', session_id: id, exercise_slug: 'squat_barre', type_serie: 'travail', charge_kg: kg, reps: 3, rang: 1 }];
    series.push(...par[id]);
  });
  const index = Modele.indexerExercices(CATALOGUE);
  return { seances, series, exercices: CATALOGUE, seriesDe: (id) => par[id] || [], catalogue: () => index, journal: [] };
}
function brouillon(series) {
  const v = jour(0, 1).toISOString();
  return { id: 'cur', user_id: 'u', debut: jour(0, 2).toISOString(), fin: null, titre: null, note: null, salle: null,
    routine_id: null, statut: 'en_cours',
    exercices: [{ exercise_slug: 'squat_barre', note: null, series: series.map((x, k) => Object.assign({
      id: 'cur-' + k, type_serie: 'travail', charge_kg: null, reps: null, duree_s: null, distance_m: null,
      rpe: null, ressenti: null, note: null, validee_a: v }, x)) }] };
}

function bac(o) {
  const C = corpusDePapier();
  const avertis = [];
  const ctx = {
    Seance, Jeu, Profil, Modele, Routeur, Date, faits: Faits.creer(),
    profil: o.profil === undefined ? { jeu_actif: true } : o.profil,
    seance: o.seance,
    console: { warn: (...a) => avertis.push(a.join(' ')) },
    texteErreur: (e) => (e && e.message) || String(e),
    corpus: () => C,
    memoJeu: { cle: null, catalogue: null, etat: null },
    memoFeuilleJeu: { cle: null, jeu: null }
  };
  vm.createContext(ctx);
  ['jeuAllume', 'etatDuJeuCourant', 'succesDecrit', 'jeuDeLaFeuille'].forEach((n) => vm.runInContext(extraire(n), ctx));
  return { ctx, avertis, C };
}

describe('64B — le bloc du jeu dans la feuille « Terminer » (le vrai code d’app.js)', () => {
  test('jeu éteint : pas de bloc', () => {
    const b = bac({ profil: { jeu_actif: false }, seance: brouillon([{ charge_kg: 160, reps: 1 }]) });
    expect(b.ctx.jeuDeLaFeuille()).toBeNull();
  });

  test('sans profil lu (absent = allumé), une série record : de l’XP et le cap rond gagné ; rien n’est écrit', () => {
    const b = bac({ profil: null, seance: brouillon([{ charge_kg: 160, reps: 1 }]) });
    const avant = JSON.stringify(b.C);
    const j = b.ctx.jeuDeLaFeuille();
    expect(j).not.toBeNull();
    expect(j.apport.xp).toBeGreaterThan(0);
    expect(j.apport.succes).toEqual(expect.arrayContaining(['cap-squat_barre-160']));
    const cap = j.succes.filter((d) => d.categorie === 'cap' && d.palier === 160)[0];
    expect(cap.nom).toBe(Modele.nomCourt('Squat (Barre)'));
    expect(JSON.stringify(b.C)).toBe(avant);
  });

  test('⚠️ une exception (une série validée SANS identifiant : `Seance.lignes` lève) → null, jamais une exception', () => {
    const s = brouillon([{ charge_kg: 160, reps: 1 }]);
    s.exercices[0].series[0].id = null;
    expect(() => Seance.lignes(s)).toThrow();                     // la fixture déclenche bien le chemin
    const b = bac({ seance: s });
    let j;
    expect(() => { j = b.ctx.jeuDeLaFeuille(); }).not.toThrow();
    expect(j).toBeNull();
    expect(b.avertis.length).toBe(1);
  });

  test('la mémoire : une frappe du titre ne recalcule pas ; une série validée de plus, si', () => {
    const b = bac({ seance: brouillon([{ charge_kg: 100, reps: 5 }]) });
    const j1 = b.ctx.jeuDeLaFeuille();
    b.ctx.seance = Seance.decrire(b.ctx.seance, { titre: 'Jambes' });   // un objet neuf, comme `surTitre`
    expect(b.ctx.jeuDeLaFeuille()).toBe(j1);
    const s = JSON.parse(JSON.stringify(b.ctx.seance));
    s.exercices[0].series.push(Object.assign({}, s.exercices[0].series[0], { id: 'cur-9', charge_kg: 160, reps: 1 }));
    b.ctx.seance = s;
    const j2 = b.ctx.jeuDeLaFeuille();
    expect(j2).not.toBe(j1);
    expect(j2.apport.succes).toEqual(expect.arrayContaining(['cap-squat_barre-160']));
  });
});

describe('64B — le rendu du bloc (jsdom)', () => {
  const vueFeuille = (jeu) => ({ compte: { travail: 3 }, records: [], titre: null, note: null, salle: null, salleMax: 60,
    routine: '', ecarts: [], majRoutine: false, jeu,
    surMajRoutine() {}, surTitre() {}, surSalle() {}, surNoteSeance() {}, surTerminer() {}, surAbandonner() {} });
  const rendre = (jeu) => { const c = document.createElement('div'); Rendu.rendreFeuilleFin(c, vueFeuille(jeu)); return c; };
  const lignes = (c) => Array.from(c.querySelectorAll('#jeu-fin .j-ligne')).map((l) => l.textContent);
  const apport = (o) => Object.assign({ xp: 0, niveau: null, muscles: [], succes: [], points: 0 }, o);

  test('XP, niveau, muscles qui montent, succès — dans cet ordre ; l’Ω ne se montre pas', () => {
    const c = rendre({ apport: apport({ xp: 60, niveau: { de: 87, a: 88 }, muscles: [{ cle: 'epaules', de: 42, a: 43 }],
      succes: ['muscle-epaules-40'] }), succes: [Jeu.descriptionDuSucces('muscle-epaules-40')] });
    expect(lignes(c)).toEqual(['XP+ 60', 'Niveau 88+1', '43Épaules, niveau 43+1', '40Succès : Épaules niveau 40exceptionnel']);
    expect(c.textContent).not.toContain('Ω');
  });

  test('aucune de ces lignes : « Muscles · +N points » (à l’entier supérieur) ; rien du tout : pas de bloc', () => {
    expect(lignes(rendre({ apport: apport({ points: 2.5 }), succes: [] }))).toEqual(['Muscles+3 points']);
    expect(lignes(rendre({ apport: apport({ points: 0.5 }), succes: [] }))).toEqual(['Muscles+1 point']);
    expect(rendre({ apport: apport({}), succes: [] }).querySelector('#jeu-fin')).toBeNull();
    expect(rendre(null).querySelector('#jeu-fin')).toBeNull();
  });

  test('⚠️ un bloc qui ne se rend pas ne coûte que lui : « Terminer » et « Abandonner » restent', () => {
    const c = rendre({ apport: null, succes: [] });
    expect(c.querySelector('#jeu-fin')).toBeNull();
    const boutons = Array.from(c.querySelectorAll('button')).map((b) => b.textContent);
    expect(boutons).toEqual(expect.arrayContaining(['Terminer', 'Abandonner et tout effacer']));
  });
});
