/** @jest-environment node */
// « Garde 0 » (19/11/2026) — à garde AFFICHÉE 0, « à fond » est la cible : la réaction en série ne la traite plus comme un doute et ne fait
// pas reculer. Cas réel : développé militaire haltères, zone Hypertrophie 8-10, réglage Franc, ligne 64 kg × 8, série 1 à 72 kg × 8.
require('../../v2/js/palier.js');
require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');

const consigne = { etat: 'nouvelle_zone', zone: 'hypertrophie', palier: 64, n: 4,
  ligne: { charge: 64, vise: 8 }, haut: null };
const serieUne = (ressenti) => [{ charge_kg: 72, reps: 8, rpe: null, ressenti: ressenti === undefined ? null : ressenti }];
const sp = (t) => String(t).replace(/[  ]/g, ' ');

describe('à garde affichée 0', () => {
  test('sans note : la question garde la charge au lieu de promettre un retour', () => {
    const r = M.reactionPour(consigne, serieUne(), { gardeAffichee: 0 });
    expect(r.message.type).toBe('effort_suggere');
    expect(r.message.garde0).toBe(true);
    const t = sp(M.phraseReaction(r.message, M.zoneParCle('hypertrophie')));
    expect(t).toMatch(/Note ce qu'il t'en restait/);
    expect(t).toMatch(/je garde 72 kg/);
    expect(t).not.toMatch(/je reviens/);
  });
  test('« reste 0 » : sur la cible, les séries 2 à 4 restent à 72 kg (avant : retour à 64)', () => {
    const r = M.reactionPour(consigne, [{ charge_kg: 72, reps: 8, rpe: 10, ressenti: null }], { gardeAffichee: 0 });
    expect(r.plan.slice(1).map((l) => l.charge)).toEqual([72, 72, 72]);
    expect(r.message === null || r.message.type !== 'pas_encore').toBe(true);
  });
  test('sous le bas de la zone, « à fond » garde son sens (retour à la ligne)', () => {
    const r = M.reactionPour(consigne, [{ charge_kg: 72, reps: 6, rpe: 10, ressenti: null }], { gardeAffichee: 0 });
    expect(r.plan.slice(1).map((l) => l.charge)).toEqual([64, 64, 64]);
  });
});

describe('à garde affichée ≥ 1 ou inconnue : rien ne change', () => {
  test.each([[undefined], [{}], [{ gardeAffichee: 1 }], [{ gardeAffichee: 2 }]])('contexte %j', (ctx) => {
    const r = M.reactionPour(consigne, serieUne(), ctx);
    expect(r.message.type).toBe('effort_suggere');
    expect(r.message.garde0).toBe(false);
    expect(sp(M.phraseReaction(r.message, M.zoneParCle('hypertrophie')))).toMatch(/Si c'était à fond, note-le : je reviens à 64 kg/);
    const f = M.reactionPour(consigne, [{ charge_kg: 72, reps: 8, rpe: 10, ressenti: null }], ctx);
    expect(f.plan.slice(1).map((l) => l.charge)).toEqual([64, 64, 64]);
  });
});
