/** @jest-environment jsdom */
// 256 — LE LOT DE LA RECETTE DE MAIN (défauts mineurs D4 à D14 et reliquats de la recette 585).
// Chaque bloc porte la preuve de son défaut : il échoue sur main, il passe avec le correctif.
process.env.TZ = 'Europe/Paris';
const fs = require('fs');
const path = require('path');
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/seance.js');
require('../../v2/js/rendu.js');
const Profil = require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const CSS = fs.readFileSync(path.join(__dirname, '../../v2/styles.css'), 'utf8');
const regle = (sel) => {
  let i = CSS.indexOf('}' + sel + '{');
  if (i < 0) i = CSS.indexOf('\n' + sel + '{');
  if (i < 0) i = CSS.indexOf(sel + '{');
  if (i < 0) throw new Error('règle absente : ' + sel);
  return CSS.slice(i + 1, CSS.indexOf('}', i + 1));
};

describe('256 D4 — « Pourquoi ? » ne raye pas la ligne suivante', () => {
  test('le soulignement est collé au texte (text-decoration), plus une bordure du bouton de 44 px', () => {
    const r = regle('.lien-pourquoi');
    expect(CSS).toMatch(/\.pourquoi-ligne\{margin-top:2px\}\.lien-pourquoi\{/);
    expect(r).toMatch(/text-decoration:underline dotted/);
    expect(r).not.toMatch(/border-bottom/);
    expect(r).toMatch(/padding:12px 4px;margin:-12px -4px/);   // la cible de 44 px est gardée
  });
});

describe('256 D6 — les cibles tactiles sont à 44 px', () => {
  test('les boutons d’une carte du coach, le « Pourquoi ? » de la veille et de l’escalier, « Reprendre »', () => {
    expect(regle('.proposition-exercice button')).toMatch(/min-height:44px/);
    expect(regle('.carte-mobilite .cm-pourquoi summary')).toMatch(/min-height:44px/);
    expect(regle('.carte-escalier .ce-pourquoi summary')).toMatch(/min-height:44px/);
    expect(regle('.exo-reprendre')).toMatch(/min-height:44px/);
  });
});

describe('256 D5 — « null » n’est jamais affiché sous TA PHASE', () => {
  const MAINTENANT = new Date('2026-10-05T10:00:00+02:00');
  test('une phase posée sans date de début : le pied est vide (null), pas le mot « null »', () => {
    const sec = Profil.sectionPhase({ phase: 'seche', phase_depuis: null }, () => {}, MAINTENANT);
    expect(sec.pied).toBeNull();
    const avecNote = Profil.sectionPhase({ phase: 'seche', phase_depuis: null }, () => {}, MAINTENANT, 'Tes séries reviennent à ta routine.');
    expect(avecNote.pied).toBe('Tes séries reviennent à ta routine.');
  });
  test('avec une date, le pied est inchangé', () => {
    const sec = Profil.sectionPhase({ phase: 'seche', phase_depuis: '2026-09-29T10:00:00.000Z' }, () => {}, MAINTENANT);
    expect(sec.pied).toMatch(/^Depuis /);
  });
  test('sans phase : « Maintien (par défaut) », comme avant', () => {
    expect(Profil.sectionPhase({ phase: null }, () => {}, MAINTENANT).pied).toBe(Profil.LIBELLE_PHASE_VIDE);
  });
});

describe('256 D7 — la borne de 300 km se dit', () => {
  const CAT = [{ slug: 'course', nom: 'Course à Pied', mesure: 'distance_temps', charge: 'aucune', muscles_primaires: [] }];
  test('grille : taper 350 garde 35 ET dit « 300 km au plus » sous le champ ; la frappe suivante acceptée l’efface', () => {
    const ecrits = [];
    const s = { exercices: [{ exercise_slug: 'course', series: [{ id: 's1', type_serie: 'travail', charge_kg: null, reps: null, duree_s: null, distance_m: null }] }] };
    const cible = document.createElement('div');
    window.THRendu.rendreBlocsSeance(cible, s, {
      blocs: Modele.blocsDeSeance(s, CAT), exercice: () => CAT[0], precedent: () => null, fantome: () => ({}), tourAtteint: () => 0,
      surValider: () => {}, surEffort: () => {}, surChamp: (i, j, champ, v) => ecrits.push([champ, v]),
      surNumero: () => {}, surNote: () => {}, surRepos: () => {}, surAjoutSerie: () => {}, surSupprimerSerie: () => {}, surMenuBloc: () => {}, surMenuExercice: () => {}
    });
    const envelope = cible.querySelector('[data-champ="distance_km"]');
    const input = envelope.querySelector('input');
    const dite = envelope.querySelector('.borne-dite');
    expect(dite.hidden).toBe(true);
    ['3', '35', '350'].forEach((v) => { input.value = v; input.dispatchEvent(new Event('input')); });
    expect(input.value).toBe('35');
    expect(ecrits.map((e) => e[1])).toEqual(['3', '35']);
    expect(dite.hidden).toBe(false);
    expect(dite.textContent.replace(/ /g, ' ')).toBe('300 km au plus');
    expect(envelope.classList.contains('hors-borne')).toBe(true);
    input.value = '36'; input.dispatchEvent(new Event('input'));
    expect(dite.hidden).toBe(true);
    expect(envelope.classList.contains('hors-borne')).toBe(false);
  });
  test('feuille « Ajouter une activité » : 350 km n’enregistre rien et le dit (source de app.js)', () => {
    const app = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
    const i = app.indexOf('function ouvrirActivite');
    const corps = app.slice(i, app.indexOf('async function enregistrerActivite', i));
    expect(corps).toMatch(/MAX_DISTANCE_M/);
    expect(corps.indexOf('MAX_DISTANCE_M')).toBeLessThan(corps.indexOf('Seance.activite('));
    expect(corps).toMatch(/km au plus/);
  });
  test('la borne est 300 km', () => { expect(Modele.MAX_DISTANCE_M).toBe(300000); });
});

describe('256 (a) — le calage aux haltères demande la charge des DEUX haltères', () => {
  const DEBUT = '2026-10-29T10:00:00+01:00';
  const silenceC = { etat: 'silence', raison: 'premiere_fois', fondement: {} };
  let n = 0;
  const id = () => 'h' + (++n);
  const planPour = (slug, equipement) => {
    const se = S.ajouterExercice(S.creer({ id: 'S', userId: 'u', idSerie: id }), slug, id, { series: 3, reps_visees: 10 });
    const CAT = {}; CAT[slug] = { equipement, muscles_primaires: ['biceps'] };
    const consignes = {}; consignes[slug] = { consigne: silenceC, pas: 2 };
    return T.planDeSeance({ seance: { id: 'S', debut: DEBUT, edition: false, exercices: se.exercices }, consignes, catalogue: CAT, paris: [], suites: {}, debutant: false }).exercices[0];
  };
  test('haltères : « Ta charge habituelle, les deux haltères ensemble ? »', () => {
    expect(planPour('curl', 'haltere').calage.libelles.question).toBe('Ta charge habituelle, les deux haltères ensemble ?');
  });
  test('barre : la question reste « Ta charge habituelle ? »', () => {
    expect(planPour('rowing', 'barre').calage.libelles.question).toBe('Ta charge habituelle ?');
  });
  test('le calcul ne change pas : la charge habituelle donnée est la première série, telle quelle', () => {
    const c = M.calagePremiereFois({ equipement: 'haltere', reps: 10, debutant: false, habituelle: 24, series: [] });
    expect(c.suivante.charge).toBe(24);
  });
});

describe('256 D8 — la limite de 500 signes d’une note se dit', () => {
  const CAT = [{ slug: 'squat', nom: 'Squat (Barre)', mesure: 'charge_reps', charge: 'barre', muscles_primaires: ['quadriceps'] }];
  test('le compteur « n / 500 » apparaît dès 400 signes, devient « plein » à 500, et se cache en dessous', () => {
    const s = { exercices: [{ exercise_slug: 'squat', series: [{ id: 's1', type_serie: 'travail', charge_kg: null, reps: null }] }] };
    const cible = document.createElement('div');
    document.body.appendChild(cible);
    window.THRendu.rendreBlocsSeance(cible, s, {
      blocs: Modele.blocsDeSeance(s, CAT), exercice: () => CAT[0], precedent: () => null, fantome: () => ({}), tourAtteint: () => 0,
      surValider: () => {}, surEffort: () => {}, surChamp: () => {}, surNumero: () => {}, surNote: () => {}, surRepos: () => {},
      surAjoutSerie: () => {}, surSupprimerSerie: () => {}, surMenuBloc: () => {}, surMenuExercice: () => {},
      noteSousLeNom: () => ({ mode: 'epinglee', texte: 'genou gauche tire' }), surNoteGardee: () => {}, surNoteRetiree: () => {}
    });
    cible.querySelector('.note-derniere-modifier').click();
    const champ = cible.querySelector('.note-derniere-champ');
    const compteur = cible.querySelector('.note-compteur');
    expect(champ.maxLength).toBe(500);
    const taper = (n) => { champ.value = 'a'.repeat(n); champ.dispatchEvent(new Event('input')); };
    taper(120);
    expect(compteur.hidden).toBe(true);
    taper(450);
    expect(compteur.hidden).toBe(false);
    expect(compteur.textContent.replace(/ /g, ' ')).toBe('450 / 500');
    expect(compteur.classList.contains('plein')).toBe(false);
    taper(500);
    expect(compteur.classList.contains('plein')).toBe(true);
    taper(10);
    expect(compteur.hidden).toBe(true);
  });
});
