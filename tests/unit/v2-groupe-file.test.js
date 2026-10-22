/** @jest-environment node */
//
// 136 (audit du 16/10/2026, 06 #14) — LE GROUPE RÉESSAIE.
//
// L'XP de fin de séance pour le groupe (`publierFinPourLeGroupe`) et « quitter le groupe » à l'abandon
// (`quitterLeGroupeSiMembre`) partaient une fois, sans retour : hors ligne, ils étaient perdus. Ils passent par la file
// EXISTANTE du groupe (`grp.file`, celle des messages écrits hors ligne) : gardés sur l'appareil avant le premier essai,
// renvoyés par la boucle du groupe et au retour du réseau, comptés par « Quitter » (`autres`). Aucun chemin d'écriture
// de plus : `groupePublier` et `groupeQuitter` ne sont appelés que par `envoyerGesteDuGroupe` (et la publication de ma
// liste d'exercices), registre de `v2-architecture.test.js`.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.self = global;
const Social = require('../../v2/js/social.js');
const Quitter = require('../../v2/js/quitter.js');
require('../../v2/js/attente.js');
const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
function extraire(nom) {
  const m = APP.match(new RegExp('^  (?:async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable dans v2/js/app.js : ' + nom);
  return m[0];
}

function bac(o) {
  const j = { publies: [], quittes: [], messages: [], gardes: [], moiLus: 0 };
  const etat = { reseau: o.reseau !== false, groupeServeur: o.groupeServeur === undefined ? 'g-1' : o.groupeServeur };
  const panne = () => { const e = new Error('Failed to fetch'); throw e; };
  const ctx = {
    Social, console: { warn: () => {} }, texteErreur: (e) => String(e && e.message),
    generation: 1, generationValide: () => true,
    grp: { moi: { id: 'g-1' }, etat: [{ moi: true, session_id: 's1' }], direct: [], messages: [], file: [], envoi: null,
           message: null, publie: 'x', recapAuto: false },
    seance: null, uuid: (() => { let n = 0; return () => 'id-' + (++n); })(),
    jeuAllume: () => true,
    Cache: { ecrireBrouillon: (cle, v) => { j.gardes.push([cle, v ? v.map((m) => m.geste || 'message') : null]); return Promise.resolve(); } },
    CLE_FILE_GROUPE: 'groupe-messages',
    Donnees: {
      groupeMoi: async () => { j.moiLus++; if (!etat.reseau) panne(); return etat.groupeServeur ? { id: etat.groupeServeur } : null; },
      groupePublier: async (ex, xp) => { if (!etat.reseau) panne(); j.publies.push([ex, xp]); },
      groupeQuitter: async () => { if (!etat.reseau) panne(); j.quittes.push(true); },
      groupeEnvoyer: async (t) => { if (!etat.reseau) panne(); j.messages.push(t); }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(['messageGroupe', 'maPlace', 'groupeDeLaSeance', 'exercicesDe', 'garderFileGroupe', 'envoyerFileGroupe',
    'refusDuGroupe', 'envoyerGesteDuGroupe', 'poserGesteDuGroupe', 'publierFinPourLeGroupe', 'quitterLeGroupeSiMembre']
    .map(extraire).join('\n') + '\nthis.f = { envoyerFileGroupe, publierFinPourLeGroupe, quitterLeGroupeSiMembre };', ctx);
  return { ctx, j, etat };
}
const fin = { id: 's1', exercices: [{ exercise_slug: 'squat' }, { exercise_slug: 'dc' }] };
const attendre = () => new Promise((r) => setTimeout(r, 0));

describe('136 — 06 #14 : l’XP de fin et le départ passent par la file du groupe', () => {
  test('DISCRIMINANT — hors ligne : l’XP attend dans `grp.file` (gardée sur l’appareil) ; au retour du réseau, elle part', async () => {
    const { ctx, j, etat } = bac({ reseau: false });
    ctx.f.publierFinPourLeGroupe(fin, { apport: { xp: 312.4 } });
    await attendre(); await attendre();
    expect(j.publies).toEqual([]);
    expect(ctx.grp.file.map((m) => [m.geste, m.groupe_id, m.exercices, m.xp])).toEqual([['publier', 'g-1', ['squat', 'dc'], 312]]);
    expect(j.gardes[0]).toEqual(['groupe-messages', ['publier']]);   // gardée AVANT le premier essai
    // Relue du cache au démarrage, elle reste une entrée valide.
    expect(Social.fileDeMessages(JSON.parse(JSON.stringify(ctx.grp.file)))).toHaveLength(1);
    etat.reseau = true;
    await ctx.f.envoyerFileGroupe();
    expect(j.publies).toEqual([[['squat', 'dc'], 312]]);
    expect(ctx.grp.file).toEqual([]);
  });

  test('DISCRIMINANT — hors ligne : le départ à l’abandon attend, puis part ; le groupe est oublié sur l’appareil', async () => {
    const { ctx, j, etat } = bac({ reseau: false });
    ctx.f.quitterLeGroupeSiMembre({ id: 's1' });
    await attendre(); await attendre();
    expect(ctx.grp.file.map((m) => m.geste)).toEqual(['quitter']);
    etat.reseau = true;
    await ctx.f.envoyerFileGroupe();
    expect(j.quittes).toEqual([true]);
    expect(ctx.grp.moi).toBeNull();
    expect(ctx.grp.file).toEqual([]);
  });

  test('« Quitter » les compte : la fenêtre dit qu’il reste des changements', () => {
    const { ctx } = bac({ reseau: false });
    ctx.grp.file = [{ id: 'a', groupe_id: 'g-1', geste: 'publier', exercices: [], xp: 10 }, { id: 'b', groupe_id: 'g-1', geste: 'quitter' }];
    const n = Quitter.enAttente([], false, ctx.grp.file.length);
    expect(n).toEqual({ seances: 0, autres: 2 });
    expect(Quitter.fenetreDeSortie([], false, ctx.grp.file.length).titre).toBe('Des changements pas encore envoyés.');
    expect(APP).toMatch(/autres: function \(\) \{ return grp\.file\.length \+ autresGardes; \}/);
  });

  test('parti en retard, un geste ne touche jamais un AUTRE groupe : il sort sans rien écrire', async () => {
    const { ctx, j, etat } = bac({ reseau: false });
    ctx.f.publierFinPourLeGroupe(fin, { apport: { xp: 50 } });
    ctx.f.quitterLeGroupeSiMembre({ id: 's1' });
    await attendre(); await attendre();
    etat.reseau = true; etat.groupeServeur = 'g-2';
    await ctx.f.envoyerFileGroupe();
    expect(j.publies).toEqual([]);
    expect(j.quittes).toEqual([]);
    expect(ctx.grp.file).toEqual([]);
  });

  test('réseau présent : un seul envoi, dans l’ordre de la file (après un message en attente)', async () => {
    const { ctx, j } = bac({});
    ctx.grp.file = [{ id: 'm1', groupe_id: 'g-1', texte: 'Dernière série !' }];
    ctx.f.publierFinPourLeGroupe(fin, null);
    await ctx.grp.envoi; await attendre();
    await ctx.f.envoyerFileGroupe();
    expect(j.messages).toEqual(['Dernière série !']);
    expect(j.publies).toEqual([[['squat', 'dc'], null]]);   // jeu éteint ou sans apport : XP nulle
    expect(ctx.grp.file).toEqual([]);
  });

  test('un geste du groupe n’est pas un message : « N messages partiront » ne le compte pas ; un geste abîmé ne se relit pas', () => {
    const file = [{ id: 'a', groupe_id: 'g-1', geste: 'publier', exercices: ['x'], xp: 3 }, { id: 'b', groupe_id: 'g-1', texte: 'ok' }];
    expect(Social.texteEnAttente(file, 'g-1')).toBe('1 message partira au retour du réseau.');
    expect(Social.fileDeMessages([{ id: 'c', groupe_id: 'g', geste: 'detruire' }, { id: 'd', groupe_id: 'g', geste: 'publier', xp: -1, exercices: [] },
      { id: 'e', groupe_id: 'g', geste: 'publier', xp: null, exercices: null }, { id: 'f', groupe_id: 'g', geste: 'quitter' }]).map((m) => m.id))
      .toEqual(['e', 'f']);
  });

  test('aucun envoi direct ne reste : `groupePublier` hors de la file seulement pour ma liste d’exercices, `groupeQuitter` jamais', () => {
    expect(extraire('publierFinPourLeGroupe')).not.toMatch(/Donnees\./);
    expect(extraire('quitterLeGroupeSiMembre')).not.toMatch(/Donnees\./);
    expect(extraire('envoyerFileGroupe')).toMatch(/if \(m\.geste\) await envoyerGesteDuGroupe\(m\)/);
    expect(extraire('fermerRecapGroupe')).toMatch(/await envoyerFileGroupe\(\);\s*await Donnees\.groupeFermer\(\)/);
  });
});
