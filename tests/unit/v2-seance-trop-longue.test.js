/** @jest-environment node */
//
// 147 (23/10/2026) — UNE SÉANCE TROP LONGUE : l'app le dit et demande.
//   · `Seance.alerteDeDuree` (pure) : 5 h strictes, dernière série à 1 h strictes, l'exception des sorties, la séance
//     vide ;
//   · l'aperçu de l'import : « Dure 9 h 42 », « Sans heure de fin » par défaut, sorties seules sans signal ;
//   · `seanceAEcrire` avec `fin` vide.
process.env.TZ = 'Europe/Paris';
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/routines.js');
const Modele = require('../../v2/js/modele.js');
const Seance = require('../../v2/js/seance.js');
const I = require('../../v2/js/importhevy.js');

const CATALOGUE = [
  { slug: 'dc', nom: 'Développé couché', nature: 'muscu' },
  { slug: 'rando', nom: 'Randonnée', nature: 'cardio', charge: 'aucune', mesure: 'distance_temps' },
  { slug: 'velo', nom: 'Vélo', nature: 'cardio', charge: 'aucune', mesure: 'distance_temps' }
];
const INDEX = Modele.indexerExercices(CATALOGUE);
const H = 3600000, MIN = 60000;
const DEBUT = Date.parse('2026-10-23T06:00:00Z');
const iso = (t) => new Date(t).toISOString();

// Une séance : `exos` = [[slug, [validee_a en ms depuis DEBUT | null]]].
function seance(exos) {
  return { id: 's', debut: iso(DEBUT), statut: 'en_cours', exercices: exos.map(([slug, vs]) => ({
    exercise_slug: slug, series: vs.map((v) => ({ validee_a: v === null ? null : iso(DEBUT + v), source: v === null ? null : 'app' }))
  })) };
}
const alerte = (s, finMs, mode) => Seance.alerteDeDuree(s, INDEX, new Date(DEBUT + finMs), mode);

describe('147 — l’alerte de fin de séance (fonction pure)', () => {
  test('5 h 01 : alerte ; 5 h 00 pile et 4 h 59 : aucune (dernière série récente)', () => {
    const s = seance([['dc', [5 * H]]]);
    expect(alerte(s, 5 * H + MIN)).toMatchObject({ longue: true, duree: '5 h 01' });
    expect(alerte(s, 5 * H)).toBeNull();
    expect(alerte(s, 5 * H - MIN)).toBeNull();
  });

  test('dernière série à 1 h 01 : alerte et « Terminer à » ; à 59 min et à 1 h pile : aucune', () => {
    const s = seance([['dc', [0, 30 * MIN]]]);
    const a = alerte(s, 30 * MIN + H + MIN);
    expect(a.longue).toBe(false);
    expect(a.derniere).toBe(iso(DEBUT + 30 * MIN));
    expect(alerte(s, 30 * MIN + H)).toBeNull();
    expect(alerte(s, 30 * MIN + 59 * MIN)).toBeNull();
  });

  test('séance longue dont la dernière série est récente : « Garder » seul, pas de « Terminer à »', () => {
    const s = seance([['dc', [6 * H]]]);
    const a = alerte(s, 6 * H + 10 * MIN);
    expect(a).toMatchObject({ longue: true, duree: '6 h 10', derniere: null });
  });

  test('l’exemple du prompt : 6 h 12 de durée, dernière série à 12 h 40 (après le début)', () => {
    const s = seance([['dc', [40 * MIN]]]);
    const a = alerte(s, 6 * H + 12 * MIN);
    expect(a.duree).toBe('6 h 12');
    expect(a.derniere).toBe(iso(DEBUT + 40 * MIN));
  });

  test('⚠️ des sorties seules : JAMAIS d’alerte, même à 9 h et dernière série vieille de 8 h', () => {
    const s = seance([['rando', [0]], ['velo', [H]]]);
    expect(alerte(s, 9 * H)).toBeNull();
  });

  test('⚠️ muscu + rando : l’alerte demeure (au moins un exercice qui n’est pas une sortie)', () => {
    const s = seance([['rando', [0]], ['dc', [10 * MIN]]]);
    expect(alerte(s, 9 * H)).not.toBeNull();
  });

  test('un exercice de musculation sans série faite ne suffit pas (seule la rando a été faite)', () => {
    const s = seance([['rando', [0]], ['dc', [null]]]);
    expect(alerte(s, 9 * H)).toBeNull();
  });

  test('la séance vide (aucune série validée) : aucune alerte de durée', () => {
    expect(alerte(seance([['dc', [null]]]), 9 * H)).toBeNull();
    expect(alerte(seance([]), 9 * H)).toBeNull();
  });

  test('Édition : la fin choisie au-delà de 5 h alerte (sans « Terminer à »), sinon rien', () => {
    const s = Object.assign(seance([['dc', [10 * MIN]]]), { statut: 'terminee' });
    expect(alerte(s, 6 * H, 'edition')).toMatchObject({ longue: true, derniere: null });
    expect(alerte(s, 3 * H, 'edition')).toBeNull();     // dernière série ancienne, mais l'Édition n'a pas ce critère
    expect(alerte(seance([['rando', [0]]]), 9 * H, 'edition')).toBeNull();
  });

  test('Édition : une séance importée (séries sans validee_a) se lit par `partEnBase`', () => {
    const s = { id: 's', debut: iso(DEBUT), statut: 'terminee', exercices: [{ exercise_slug: 'dc', series: [{ validee_a: null, source: 'hevy' }] }] };
    expect(alerte(s, 6 * H, 'edition')).not.toBeNull();
  });

  test('dureeDite', () => {
    expect(Seance.dureeDite(9 * H + 42 * MIN)).toBe('9 h 42');
    expect(Seance.dureeDite(6 * H + 5 * MIN)).toBe('6 h 05');
  });
});

describe('147 — l’aperçu de l’import signale une séance de plus de 5 h', () => {
  const lue = (nom, finH, finM) => ({ ref: 'hevy:x', titre: 'T', note: null, debut_local: '2026-10-01T08:00', fin_local:
    '2026-10-01T' + String(8 + finH).padStart(2, '0') + ':' + String(finM).padStart(2, '0'),
    exercices: [{ nom, note: null, groupe_superset: null, series: [{ type_serie: 'normale', charge_kg: 100, reps: 5 }] }] });
  const sources = { catalogue: CATALOGUE, communs: [{ alias: 'Bench', slug: 'dc' }, { alias: 'Randonnée', slug: 'rando' }] };
  const ctx = { sources, base: [], fuseau: 'Europe/Paris' };

  test('9 h 42 de muscu : « Dure 9 h 42 », « Sans heure de fin » par défaut', () => {
    const [l] = I.apercu([lue('Bench', 9, 42)], ctx);
    expect(l.duree_longue).toBe('9 h 42');
    expect(l.sans_fin).toBe(true);
  });

  test('5 h pile et 4 h 59 : aucun signal', () => {
    expect(I.apercu([lue('Bench', 5, 0)], ctx)[0]).toMatchObject({ duree_longue: null, sans_fin: false });
    expect(I.apercu([lue('Bench', 4, 59)], ctx)[0].duree_longue).toBeNull();
    expect(I.apercu([lue('Bench', 5, 1)], ctx)[0].duree_longue).toBe('5 h 01');
  });

  test('⚠️ une rando de 7 h seule : aucun signal', () => {
    expect(I.apercu([lue('Randonnée', 7, 0)], ctx)[0]).toMatchObject({ duree_longue: null, sans_fin: false });
  });

  test('un nom pas encore rattaché compte comme muscu ; rattaché à une sortie, le signal disparaît (recalculer)', () => {
    const [l] = I.apercu([lue('Marche', 7, 0)], ctx);
    expect(l.duree_longue).toBe('7 h 00');
    const sources2 = Object.assign({}, sources, { miens: [{ alias: 'Marche', exercise_slug: 'rando' }] });
    const [m] = I.recalculer([l], { sources: sources2, base: [] });
    expect(m.duree_longue).toBeNull();
  });

  test('recalculer garde le choix « Garder » déjà fait', () => {
    const [l] = I.apercu([lue('Bench', 9, 42)], ctx);
    const choisie = Object.assign({}, l, { sans_fin: false });
    expect(I.recalculer([choisie], { sources, base: [] })[0].sans_fin).toBe(false);
  });

  const ids = { seance: 'id', serie: (r) => 'serie' + r };
  const index = I.indexDesNoms(sources);

  test('seanceAEcrire : « Sans heure de fin » → fin vide ; « Garder » → la fin du fichier', () => {
    const [l] = I.apercu([lue('Bench', 9, 42)], ctx);
    const sans = I.seanceAEcrire(Object.assign({}, l.seance, { sans_fin: true }), ids, index, 'u');
    expect(sans.fin).toBeNull();
    expect(sans.statut).toBe('terminee');
    expect(sans.exercices[0].series).toHaveLength(1);
    const garde = I.seanceAEcrire(Object.assign({}, l.seance, { sans_fin: false }), ids, index, 'u');
    expect(garde.fin).toBe(l.seance.fin);
    expect(garde.fin).not.toBeNull();
  });
});
