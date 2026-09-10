// tests/unit/v2-sync.test.js — synchronisation incrémentale et cache local.
//
// Ce que ces tests verrouillent :
//   · une fusion incrémentale n'introduit ni doublon ni perte ;
//   · une ligne retouchée remplace la précédente au lieu de s'ajouter ;
//   · le cache d'un compte ne survit jamais à l'arrivée d'un autre ;
//   · un cache vide se comporte comme l'app d'avant, sans erreur ;
//   · sans réseau mais avec des données, on affiche et on le dit.

const Sync = require('../../v2/js/sync.js');

const serie = (o) => Object.assign({
  id: 's1', session_id: 'sess-1', exercise_slug: 'dc', charge_kg: 100, reps: 5,
  created_at: '2026-01-01T10:00:00Z', modifie_a: null
}, o);
const seance = (o) => Object.assign({
  id: 'sess-1', titre: 'Haut du corps', debut: '2026-01-01T18:00:00Z',
  created_at: '2026-01-01T18:00:00Z'
}, o);

// ── 1. Fusion incrémentale ──────────────────────────────────────────────────
describe('fusionner — sans doublon, sans perte', () => {
  test('un lot de nouveautés s’ajoute sans toucher à l’existant', () => {
    const cache = [serie({ id: 'a' }), serie({ id: 'b' })];
    const neuf = [serie({ id: 'c' }), serie({ id: 'd' })];
    const r = Sync.fusionner(cache, neuf);
    expect(r.map(x => x.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(r).toHaveLength(4);
  });

  test('un lot qui recoupe l’existant ne crée pas de doublon', () => {
    const cache = [serie({ id: 'a' }), serie({ id: 'b' })];
    const neuf = [serie({ id: 'b' }), serie({ id: 'c' })];
    const r = Sync.fusionner(cache, neuf);
    expect(r).toHaveLength(3);
    expect(r.filter(x => x.id === 'b')).toHaveLength(1);
  });

  test('rien n’est perdu quand le lot est vide', () => {
    const cache = [serie({ id: 'a' }), serie({ id: 'b' })];
    expect(Sync.fusionner(cache, [])).toHaveLength(2);
    expect(Sync.fusionner(cache, null)).toHaveLength(2);
  });

  test('une entrée sans identifiant est ignorée plutôt que d’écraser', () => {
    const r = Sync.fusionner([serie({ id: 'a' })], [{ charge_kg: 999 }]);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('a');
  });
});

// ── 2. Ligne modifiée après coup ────────────────────────────────────────────
describe('une série retouchée remplace, elle ne duplique pas', () => {
  test('même id, charge corrigée → une seule ligne, la nouvelle', () => {
    const cache = [serie({ id: 'a', charge_kg: 100 })];
    const neuf = [serie({ id: 'a', charge_kg: 105, modifie_a: '2026-02-01T10:00:00Z' })];
    const r = Sync.fusionner(cache, neuf);
    expect(r).toHaveLength(1);
    expect(r[0].charge_kg).toBe(105);
    expect(r[0].modifie_a).toBe('2026-02-01T10:00:00Z');
  });

  test('le curseur suit modifie_a, pas seulement created_at', () => {
    // Une ligne ancienne retouchée récemment doit faire avancer le curseur,
    // sinon la synchronisation suivante la re-tirerait indéfiniment.
    const lot = [
      serie({ id: 'a', created_at: '2026-01-01T10:00:00Z', modifie_a: null }),
      serie({ id: 'b', created_at: '2026-01-02T10:00:00Z', modifie_a: '2026-03-01T10:00:00Z' })
    ];
    expect(Sync.curseurDe(lot)).toBe('2026-03-01T10:00:00Z');
  });

  test('un lot vide ne fait pas avancer le curseur', () => {
    expect(Sync.curseurDe([])).toBeNull();
    expect(Sync.curseurDe(null)).toBeNull();
  });
});

// ── 3. Changement de compte ─────────────────────────────────────────────────
describe('cloisonnement par compte', () => {
  test('le cache d’un autre compte n’est jamais réutilisé', () => {
    expect(Sync.cacheAppartientA({ userId: 'aurel' }, 'aurel')).toBe(true);
    expect(Sync.cacheAppartientA({ userId: 'aurel' }, 'lea')).toBe(false);
  });

  test('un cache sans propriétaire n’appartient à personne', () => {
    expect(Sync.cacheAppartientA(null, 'aurel')).toBe(false);
    expect(Sync.cacheAppartientA({}, 'aurel')).toBe(false);
  });

  test('aucun utilisateur connecté → le cache n’est jamais réputé valide', () => {
    expect(Sync.cacheAppartientA({ userId: 'aurel' }, null)).toBe(false);
    expect(Sync.cacheAppartientA({ userId: undefined }, undefined)).toBe(false);
  });
});

// ── 4. Cache vide ───────────────────────────────────────────────────────────
describe('cache vide — aucune erreur, comportement d’avant', () => {
  test('la fusion depuis rien donne le lot serveur', () => {
    const neuf = [serie({ id: 'a' }), serie({ id: 'b' })];
    expect(Sync.fusionner([], neuf)).toHaveLength(2);
    expect(Sync.fusionner(null, neuf)).toHaveLength(2);
  });

  test('tout vide ne lève pas et ne produit rien', () => {
    expect(Sync.fusionner(null, null)).toEqual([]);
    expect(Sync.remplacer(null)).toEqual([]);
    expect(Sync.purgerSeriesOrphelines(null, null)).toEqual([]);
    expect(Sync.deciderEtat(null).code).toBe('vide');
  });
});

// ── 5. Réseau indisponible ──────────────────────────────────────────────────
describe('deciderEtat — informer sans bloquer', () => {
  test('synchronisation réussie → à jour', () => {
    const e = Sync.deciderEtat({ syncOk: true, aDesDonnees: true });
    expect(e.code).toBe('a-jour');
    expect(e.local).toBe(false);
  });

  test('réseau indisponible AVEC cache → on affiche, et on dit que c’est local', () => {
    const e = Sync.deciderEtat({ syncOk: false, aDesDonnees: true });
    expect(e.code).toBe('local');
    expect(e.local).toBe(true);
    expect(e.libelle).toMatch(/locale/i);
  });

  test('réseau indisponible SANS cache → état vide, toujours pas d’erreur bloquante', () => {
    const e = Sync.deciderEtat({ syncOk: false, aDesDonnees: false });
    expect(e.code).toBe('vide');
  });
});

// ── Remplacement complet et suppressions ────────────────────────────────────
describe('remplacer — ce que l’incrémental ne voit pas', () => {
  test('une séance disparue du serveur disparaît du cache', () => {
    const avant = [seance({ id: 'a' }), seance({ id: 'b' })];
    const serveur = [seance({ id: 'a' })];
    const apres = Sync.remplacer(serveur);
    expect(apres.map(s => s.id)).toEqual(['a']);
    expect(avant).toHaveLength(2);          // l'entrée n'est pas mutée
  });

  test('les séries d’une séance supprimée partent avec elle', () => {
    const series = [
      serie({ id: 's1', session_id: 'a' }),
      serie({ id: 's2', session_id: 'b' }),
      serie({ id: 's3', session_id: 'a' })
    ];
    const restantes = Sync.purgerSeriesOrphelines(series, [seance({ id: 'a' })]);
    expect(restantes.map(s => s.id)).toEqual(['s1', 's3']);
  });

  test('aucune séance en cache → aucune série ne survit', () => {
    expect(Sync.purgerSeriesOrphelines([serie({ session_id: 'a' })], [])).toEqual([]);
  });
});
