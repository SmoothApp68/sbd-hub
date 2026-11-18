/** @jest-environment node */
//
// 18/11/2026 — LA RÉPONSE À UN GESTE DE ROUTINE SE VOIT AU TOUCHER (carte « Le coach te dit », accueil et « Ton parcours »).
//
// LE DÉFAUT (constat en production) : « C'est fait » attendait `await poserProfil`, qui attend la réponse du SERVEUR (3 à 9 s) : la
// carte restait affichée, boutons touchables. LE CORRECTIF : la ligne se pose et se peint avant toute attente d'écriture ; les écritures
// (la file) partent derrière ; un échec change la ligne (« Je n'ai pas pu modifier … ») et ramène la carte ; « Annuler » attend l'écriture.
//
// Le test joue la VRAIE fonction `repondreAuGesteUneFois` (extraite de app.js) dans un bac à sable, avec des écritures qu'il tient
// en suspens à la main.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const extraire = (nom) => {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable : ' + nom);
  return m[0];
};

function banc(options) {
  const opt = options || {};
  const rt = { id: 'r1', nom: 'Bas A', exercices: [{ exercise_slug: 'a' }, { exercise_slug: 'b' }] };
  const journal = [];
  const attentes = { routine: [], profil: [] };
  const ctx = {
    console: { warn: () => {} },
    JSON, Object, Array,
    routines: [rt],
    avantRepeints: [],
    faitEquilibre: null, memoEquilibres: 'memo',
    reponsesDesCartes: () => ({}),
    Moteur: { jourCivil: () => '2026-11-18' },
    Modele: { enumerer: (l) => l.join(', ') },
    Routines: {
      retraitDExercice: (r, slug) => r.exercices.filter((x) => x.exercise_slug !== slug),
      signatureDesExercices: (ex) => ex.map((x) => x.exercise_slug).join(','),
    },
    Equilibres: { verifierRetrait: () => [], reponseAuGesteDatee: () => ({ geste: 'x' }) },
    texteErreur: (e) => String(e && e.message || e),
    mesuresDuRemplacement: () => ({}),
    poserRoutineVoulue: (r, v) => {
      journal.push('routine:' + v.length);
      return new Promise((ok, ko) => attentes.routine.push({ ok: () => { r.exercices = v; ok(); }, ko }));
    },
    poserProfil: () => {
      journal.push('profil');
      return new Promise((ok, ko) => attentes.profil.push({ ok, ko }));
    },
    repeindreLesEquilibres: () => { ctx.avantRepeints.push(ctx.faitEquilibre ? ctx.faitEquilibre.texte : null); },
  };
  vm.createContext(ctx);
  vm.runInContext(['var gesteRoutineEnCours = false;', extraire('repondreAuGesteDeLaRoutine'), extraire('repondreAuGesteUneFois')].join('\n'), ctx);
  const p = { type: 'geste_retirer', slug: 'b', routine_id: 'r1', routines: ['r1'], groupe: 'travail',
    fait: 'C’est fait : « Bas A » sans B.' };
  const carte = { cle: 'geste|b|travail' };
  return { ctx, rt, journal, attentes, p, carte, lancer: () => ctx.repondreAuGesteDeLaRoutine(carte, p) };
}
const tick = () => new Promise((r) => setImmediate(r));

describe('un geste de routine : la réponse se voit avant toute écriture', () => {
  test('« C’est fait » + « Annuler » sont posés et peints alors que le serveur n’a RIEN répondu', async () => {
    const b = banc();
    const fin = b.lancer();
    await tick();
    // Aucune écriture n'a encore abouti (la file et le profil sont en suspens) : la ligne est déjà là.
    expect(b.ctx.faitEquilibre.texte).toBe(b.p.fait);
    expect(typeof b.ctx.faitEquilibre.surAnnuler).toBe('function');
    expect(b.ctx.avantRepeints[0]).toBe(b.p.fait);
    expect(b.attentes.routine.length).toBe(1);
    expect(b.attentes.profil.length).toBe(0);
    b.attentes.routine[0].ok(); await tick();
    expect(b.attentes.profil.length).toBe(1);
    expect(b.ctx.faitEquilibre.texte).toBe(b.p.fait);
    b.attentes.profil[0].ok();
    await fin;
    expect(b.ctx.faitEquilibre.texte).toBe(b.p.fait);        // toujours « C'est fait » après l'écriture
    expect(b.rt.exercices.map((x) => x.exercise_slug)).toEqual(['a']);
    expect(b.ctx.avantRepeints.length).toBeGreaterThanOrEqual(2);   // « Prochaine séance » se redessine sur la routine écrite
  });

  test('« Garder » : la ligne aussi se voit avant la réponse du profil', async () => {
    const b = banc();
    b.p.type = 'geste_garder';
    b.p.fait = 'Noté : je garde B.';
    const fin = b.lancer();
    await tick();
    expect(b.ctx.faitEquilibre.texte).toBe('Noté : je garde B.');
    expect(b.attentes.profil.length).toBe(1);
    b.attentes.profil[0].ok();
    await fin;
  });

  test('une seule réponse par carte : un second toucher pendant l’écriture n’écrit rien de plus', async () => {
    const b = banc();
    const fin = b.lancer();
    await tick();
    await b.lancer();                          // le double toucher : rendu sans effet
    expect(b.attentes.routine.length).toBe(1);
    b.attentes.routine[0].ok(); await tick();
    expect(b.attentes.profil.length).toBe(1);
    b.attentes.profil[0].ok();
    await fin;
    expect(b.journal).toEqual(['routine:1', 'profil']);
  });

  test('un échec d’écriture : la ligne le dit (jamais « C’est fait »), la réponse d’avant est rendue, un bouton ramène la carte', async () => {
    const b = banc();
    const fin = b.lancer();
    await tick();
    expect(b.ctx.faitEquilibre.texte).toBe(b.p.fait);
    b.attentes.routine[0].ko(new Error('refusé'));
    await tick();
    // Le retour (`poserProfil` des réponses d'avant) part, on le laisse aboutir.
    b.attentes.profil[0].ok();
    await fin;
    expect(b.ctx.faitEquilibre.texte).toBe('Je n’ai pas pu modifier « Bas A ».');
    expect(b.ctx.faitEquilibre.texte).not.toMatch(/C’est fait/);
    expect(b.ctx.faitEquilibre.libelleBouton).toBe('Revoir la carte');
    b.ctx.faitEquilibre.surAnnuler();
    expect(b.ctx.faitEquilibre).toBeNull();      // plus de ligne : le rendu relit l'analyse, la carte revient
    expect(b.ctx.memoEquilibres).toBeNull();
  });

  test('« Annuler » pendant l’écriture attend qu’elle finisse, puis rend la routine d’avant', async () => {
    const b = banc();
    const fin = b.lancer();
    await tick();
    const annule = b.ctx.faitEquilibre.surAnnuler();
    await tick();
    expect(b.attentes.routine.length).toBe(1);   // rien n'a été rendu : l'écriture du geste n'est pas finie
    b.attentes.routine[0].ok(); await tick();
    b.attentes.profil[0].ok(); await tick();
    // Le geste a fini ; l'annulation rend la routine (2e écriture de routine) puis les réponses.
    await tick();
    expect(b.attentes.routine.length).toBe(2);
    b.attentes.routine[1].ok(); await tick();
    b.attentes.profil[1].ok();
    await Promise.all([fin, annule]);
    expect(b.rt.exercices.map((x) => x.exercise_slug)).toEqual(['a', 'b']);
    expect(b.ctx.faitEquilibre).toBeNull();
  });

  test('une routine qui a changé depuis la carte : rien n’est écrit, la carte se recalcule', async () => {
    const b = banc();
    b.ctx.Equilibres.verifierRetrait = () => ['changée'];
    await b.lancer();
    expect(b.journal).toEqual([]);
    expect(b.ctx.faitEquilibre.texte).toBe('Ta routine a changé depuis : je recalcule.');
  });
});

describe('la ligne est la même pour l’accueil et « Ton parcours » : un seul chemin, un seul libellé de bouton', () => {
  const RENDU = fs.readFileSync(path.join(__dirname, '../../v2/js/rendu.js'), 'utf8');
  test('les deux rendus du fait lisent `libelleBouton`', () => {
    expect((RENDU.match(/fait\.libelleBouton \|\| 'Annuler'/g) || []).length).toBe(2);
  });
  test('app.js : un seul gestionnaire de geste, appelé par la proposition de l’accueil ET du parcours', () => {
    expect((APP.match(/repondreAuGesteDeLaRoutine\(carte, p\)/g) || []).length).toBe(2)   // la définition et l’appel;
    expect((APP.match(/accepterUneProposition\(carte, p\)\.catch/g) || []).length).toBe(2);
  });
});
