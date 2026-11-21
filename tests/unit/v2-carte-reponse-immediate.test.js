/** @jest-environment node */
//
// 19/11/2026 — LA RÉPONSE D'UNE CARTE DE LA SEMAINE SE VOIT AU TOUCHER (suite de la PR #704, qui l'a réglé pour les gestes de routine).
//
// LE DÉFAUT : « Pas maintenant », « Régler mes séances » et « Ajouter un 2e passage à mes priorités » attendaient le serveur (`await poserProfil`)
// avant de poser leur ligne : la carte restait là, boutons touchables. LE CORRECTIF : la ligne se pose et se peint avant toute attente
// d'écriture ; les écritures partent derrière ; un échec la remplace par « Je n'ai pas pu … » (+ « Revoir la carte ») et rend les
// réponses d'avant ; « Annuler » attend l'écriture.
//
// Le test joue les VRAIES fonctions (extraites de app.js) dans un bac à sable, avec des écritures tenues en suspens à la main.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const extraire = (nom) => {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable : ' + nom);
  return m[0];
};

function banc() {
  const journal = [];
  const attentes = { routine: [], profil: [] };
  const rt = { id: 'r1', nom: 'Haut A', exercices: [{ exercise_slug: 'a' }] };
  const ctx = {
    console: { warn: () => {} },
    JSON, Object, Array, Promise,
    routines: [rt],
    profil: { cartes_semaine: {}, duree_seance_min: 90, temps_reponse: null },
    peints: [],
    faitEquilibre: 'avant', memoEquilibres: 'memo',
    reponsesDesCartes: () => ctx.profil.cartes_semaine,
    Moteur: { jourCivil: () => '2026-11-19' },
    Modele: { enumerer: (l) => l.join(', ') },
    Profil: { rythmeDe: () => 'x', preparerChamps: (p, e) => Object.assign({}, e) },
    Equilibres: {
      reponse: (toutes, cle, r) => ({ r, cle }),
      phraseDuSilence: () => 'Noté. Je ne t’en reparle pas avant le 3 déc.',
      faitDAjout: () => 'Fait : B dans Haut A.',
    },
    Routines: { ajoutDExercice: (base) => base.exercices.concat([{ exercise_slug: 'b' }]), placeDAjout: () => ({}) },
    catalogueIndexe: () => ({}),
    texteErreur: (e) => String(e && e.message || e),
    refaireMonProgramme: () => {},
    // Comme le vrai : le profil local change AVANT le premier await, l'écriture réseau est en suspens.
    poserProfil: (champs) => {
      journal.push('profil:' + Object.keys(champs).join(','));
      ctx.profil = Object.assign({}, ctx.profil, champs);
      return new Promise((ok, ko) => attentes.profil.push({ ok, ko }));
    },
    poserRoutineVoulue: (r, v) => {
      journal.push('routine:' + v.length);
      return new Promise((ok, ko) => attentes.routine.push({ ok: () => { r.exercices = v; ok(); }, ko }));
    },
    repeindreLesEquilibres: () => { ctx.peints.push(ctx.faitEquilibre ? ctx.faitEquilibre.texte : null); },
  };
  vm.createContext(ctx);
  vm.runInContext(['repondreALaCarte', 'direLEchecDeLaCarte', 'pasMaintenantEquilibre', 'regleLaDureeEquilibre', 'repartirLesPriorites']
    .map(extraire).join('\n'), ctx);
  return { ctx, rt, journal, attentes };
}
const tick = () => new Promise((r) => setImmediate(r));
const carte = { cle: 'duree|haut' };

describe('« Pas maintenant » : la ligne se voit avant la réponse du serveur', () => {
  test('« Noté » + « Annuler » posés et peints alors qu’aucune écriture n’a abouti', async () => {
    const b = banc();
    const fin = b.ctx.pasMaintenantEquilibre(carte);
    expect(b.ctx.faitEquilibre.texte).toMatch(/^Noté\./);          // synchrone : avant même le premier tick
    expect(b.ctx.peints[0]).toMatch(/^Noté\./);
    expect(b.ctx.memoEquilibres).toBeNull();
    expect(b.ctx.profil.cartes_semaine[carte.cle]).toBeTruthy();    // la carte se tait (profil local à jour)
    expect(b.attentes.profil.length).toBe(1);
    b.attentes.profil[0].ok();
    await fin;
    expect(b.ctx.faitEquilibre.texte).toMatch(/^Noté\./);
  });

  test('un échec : la ligne le dit, les réponses d’avant sont rendues, « Revoir la carte » ramène la carte', async () => {
    const b = banc();
    const fin = b.ctx.pasMaintenantEquilibre(carte);
    b.attentes.profil[0].ko(new Error('refusé'));
    await tick();
    b.attentes.profil[1].ok();   // le retour des réponses d'avant
    await fin;
    expect(b.ctx.faitEquilibre.texte).toBe('Je n’ai pas pu noter ta réponse.');
    expect(b.ctx.faitEquilibre.libelleBouton).toBe('Revoir la carte');
    expect(b.ctx.profil.cartes_semaine).toEqual({});
  });

  test('« Annuler » attend l’écriture avant de rendre les réponses d’avant', async () => {
    const b = banc();
    const fin = b.ctx.pasMaintenantEquilibre(carte);
    const annule = b.ctx.faitEquilibre.surAnnuler();
    await tick();
    expect(b.attentes.profil.length).toBe(1);   // pas encore de retour écrit
    b.attentes.profil[0].ok();
    await tick();
    expect(b.attentes.profil.length).toBe(2);
    b.attentes.profil[1].ok();
    await annule; await fin;
    expect(b.ctx.faitEquilibre).toBeNull();
  });
});

describe('« Régler mes séances sur N min » : la ligne se voit avant la réponse du serveur', () => {
  const p = { type: 'duree', minutes: 60 };
  test('ligne + « Annuler » avant toute réponse ; les deux écritures sont parties', async () => {
    const b = banc();
    const fin = b.ctx.regleLaDureeEquilibre(carte, p);
    expect(b.ctx.faitEquilibre.texte).toBe('Fait : tes séances sont réglées sur 60 min.');
    expect(b.ctx.peints[0]).toBe('Fait : tes séances sont réglées sur 60 min.');
    expect(b.attentes.profil.length).toBe(2);
    expect(b.ctx.profil.duree_seance_min).toBe(60);
    b.attentes.profil.forEach((a) => a.ok());
    await fin;
    expect(b.ctx.faitEquilibre.texte).toMatch(/^Fait/);
  });
  test('un échec rend la durée et les réponses d’avant et le dit', async () => {
    const b = banc();
    const fin = b.ctx.regleLaDureeEquilibre(carte, p);
    b.attentes.profil[0].ko(new Error('refusé'));
    b.attentes.profil[1].ok();
    await tick();
    b.attentes.profil.slice(2).forEach((a) => a.ok()); await tick();
    b.attentes.profil.slice(2).forEach((a) => a.ok());
    await fin;
    expect(b.ctx.faitEquilibre.texte).toBe('Je n’ai pas pu régler tes séances.');
    expect(b.ctx.profil.duree_seance_min).toBe(90);
  });
});

describe('« Ajouter un 2e passage à mes priorités » : la ligne se voit avant la réponse du serveur', () => {
  const p = { type: 'repartir', ajouts: [{ routine_id: 'r1', slug: 'b', series: 2, reps: '8' }] };
  test('ligne + « Annuler » posées avant toute réponse ; la routine et la réponse sont parties', async () => {
    const b = banc();
    const fin = b.ctx.repartirLesPriorites(carte, p);
    expect(b.ctx.faitEquilibre.texte).toMatch(/^Fait : /);
    expect(b.ctx.peints[0]).toMatch(/^Fait : /);
    expect(b.attentes.routine.length).toBe(1);
    expect(b.attentes.profil.length).toBe(1);
    b.attentes.routine[0].ok(); b.attentes.profil[0].ok();
    await fin;
    expect(b.rt.exercices.length).toBe(2);
  });
  test('un échec de la routine : « Je n’ai pas pu modifier … », les réponses d’avant rendues', async () => {
    const b = banc();
    const fin = b.ctx.repartirLesPriorites(carte, p);
    b.attentes.routine[0].ko(new Error('refusé'));
    b.attentes.profil[0].ok();
    await tick(); await tick();
    b.attentes.profil.slice(1).forEach((a) => a.ok());
    await fin;
    expect(b.ctx.faitEquilibre.texte).toBe('Je n’ai pas pu modifier « Haut A ».');
    expect(b.ctx.faitEquilibre.libelleBouton).toBe('Revoir la carte');
    expect(b.ctx.profil.cartes_semaine).toEqual({});
    expect(b.rt.exercices.length).toBe(1);
  });
});
