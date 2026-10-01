/** @jest-environment node */
//
// L'outil de rejeu (développement seulement, diagnostic du 01/10/2026) — le
// module pur `v2/js/rejeu.js`. Le rejeu lui-même passe par l'app (`app.js`,
// `rejouerSeance`) ; il se vérifie au banc d'écran (section 7 G
// quaterdecies), sur une séance JOUÉE puis rejouée : aucune écriture, la même
// sortie deux fois, inactif garde éteinte, et chaque pari en base égal à la
// ligne que le rejeu affichait juste avant.
//
// Ici : l'outil est inactif en production, il n'a aucun moyen d'écrire, et il
// rend la même sortie deux fois de suite sans toucher à ses entrées.

const fs = require('fs');
const path = require('path');

require('../../v2/js/modele.js');
const J = require('../../v2/js/rejeu.js');

const ID = '8e50dbae-11d6-429c-9c1e-459dcf28398d';

describe('rejeu — jamais en production', () => {
  test('la garde active et un identifiant de séance : l’outil s’ouvre', () => {
    expect(J.demande({ search: '?rejouer=' + ID }, true)).toBe(ID);
    expect(J.demande({ search: '?x=1&rejouer=' + ID.toUpperCase() + '&y=2' }, true)).toBe(ID);
  });

  test('garde éteinte (la production) : rien, même avec le paramètre', () => {
    expect(J.demande({ search: '?rejouer=' + ID, hostname: 'trainhub.app' }, false)).toBeNull();
    expect(J.demande({ search: '?rejouer=' + ID }, undefined)).toBeNull();
  });

  test('sans paramètre, ou un identifiant qui n’en est pas un : rien', () => {
    expect(J.demande({ search: '' }, true)).toBeNull();
    expect(J.demande({ search: '?rejouer=' }, true)).toBeNull();
    expect(J.demande({ search: '?rejouer=abc' }, true)).toBeNull();
    expect(J.demande({ search: '?rejouer=' + ID + 'x' }, true)).toBeNull();
    expect(J.demande(null, true)).toBeNull();
  });
});

describe('rejeu — le module n’a aucun moyen d’écrire', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../v2/js/rejeu.js'), 'utf8')
    .replace(/\/\/[^\n]*/g, '');   // les commentaires peuvent parler de ce qu'il ne fait pas

  test('ni stockage, ni réseau, ni cache, ni base, ni DOM', () => {
    ['localStorage', 'sessionStorage', 'indexedDB', 'fetch(', 'XMLHttpRequest', 'THCache', 'THDonnees',
     'THClient', 'THAttente', 'document', 'navigator', 'setItem', 'insert(', 'upsert(', 'update(']
      .forEach((m) => expect(source.indexOf(m)).toBe(-1));
  });

  test('il ne calcule aucune décision du coach : il ne lit ni le moteur ni le plan', () => {
    ['THMoteur', 'THPlan', 'THSeance', 'THPalier'].forEach((m) => expect(source.indexOf(m)).toBe(-1));
  });
});

describe('rejeu — la séance de l’ouverture (`structure`)', () => {
  const routine = {
    exercices: [
      { exercise_slug: 'militaire', series: [
        { type_serie: 'echauffement', reps: 10 }, { type_serie: 'echauffement', reps: 2 },
        { type_serie: 'travail', reps: 8 }, { type_serie: 'travail', reps: 8 }] },
      { exercise_slug: 'curl', series: [{ type_serie: 'travail' }] },
      { exercise_slug: 'couche', series: [{ type_serie: 'travail', charge_kg: 90 }, { type_serie: 'travail' }] }
    ]
  };
  // En base : une seule chauffe validée (la seconde ne l'a jamais été), une
  // série en plus (« + Série »), et le curl jamais fait.
  const enBase = [
    { exercise_slug: 'militaire', series: [
      { id: 'm1', type_serie: 'echauffement' }, { id: 'm2', type_serie: 'travail' },
      { id: 'm3', type_serie: 'travail' }, { id: 'm4', type_serie: 'travail' }] },
    { exercise_slug: 'couche', series: [{ id: 'c1' }, { id: 'c2' }] }
  ];

  test('la routine donne l’ouverture ; une ligne jamais validée est reconstruite, vide', () => {
    const x = J.structure(enBase, routine);
    const m = x[0];
    expect(m.iExo).toBe(0);
    expect(m.lignes.map((l) => [l.id.indexOf('rejeu-') === 0 ? 'R' : l.id, l.type_serie, l.ouverture, l.reconstruite]))
      .toEqual([['m1', 'echauffement', true, false], ['R', 'echauffement', true, true],
                ['m2', 'travail', true, false], ['m3', 'travail', true, false], ['m4', 'travail', false, false]]);
    // L'intention de SA ligne de routine (`reps_visees`, `charge_cible_kg`).
    expect(m.lignes.map((l) => l.reps_visees)).toEqual([10, 2, 8, 8, null]);
    expect(x[2].lignes.map((l) => l.charge_cible_kg)).toEqual([90, null]);
  });

  test('un exercice de la routine absent de la base est reconstruit à sa place', () => {
    const x = J.structure(enBase, routine);
    expect(x.map((e) => [e.exercise_slug, e.iExo])).toEqual([['militaire', 0], ['curl', null], ['couche', 1]]);
    expect(x[1].lignes.every((l) => l.reconstruite && l.ouverture)).toBe(true);
  });

  test('sans routine : toutes les séries en base dès l’ouverture, rien de reconstruit', () => {
    const x = J.structure(enBase, null);
    expect(x.length).toBe(2);
    x.forEach((e) => e.lignes.forEach((l) => {
      expect(l.ouverture).toBe(true);
      expect(l.reconstruite).toBe(false);
    }));
  });
});

describe('rejeu — l’ordre réel des validations (`etapes`)', () => {
  test('par `validee_a`, puis par position à instant égal ; les lignes non validées n’y sont pas', () => {
    const e = J.etapes([
      { series: [{ id: 'a', validee_a: '2026-10-01T17:10:00Z' }, { id: 'b', validee_a: null }] },
      { series: [{ id: 'c', validee_a: '2026-10-01T17:08:00Z' }, { id: 'd', validee_a: '2026-10-01T17:10:00Z' }] }
    ]);
    expect(e.map((x) => x.id)).toEqual(['c', 'a', 'd']);
  });
});

describe('rejeu — la même sortie, deux fois de suite', () => {
  const plan = () => ({
    allegee: null, carte: null,
    exercices: [{
      iExo: 0, slug: 'militaire',
      consigne: { etat: 'reprise_courte', zone: 'mix', palier: 52.5, niveau: 10, n: 4, ligne: { charge: 52.5, vise: 10 }, haut: null },
      entete: { jaune: ['52,5 kg × 10'], gris: 'Reprise après une pause.', compteur: null, plus: null },
      compteur: { compteur: 0, meilleur: null },
      chauffes: { phrase: 'Chauffes calées sur 52,5 kg : 20 · 45 kg.', situation: 'barre_legere', reference: 52.5 },
      proposition: { phrase: 'Chauffe : 56 kg × 8', lignes: [[56, 8]] },
      lignes: [
        { iSerie: 0, type: 'echauffement', role: 'hors', validee: true, chauffe: { charge: 20 } },
        { iSerie: 1, type: 'travail', role: 'ligne', rang: 1, charge: 52.5, vise: 10, validee: false }
      ],
      message: null, degressive: null, donc: 'Donc 52,5 kg × 10.',
      constat: { verdict: 'Reprise faite.', suite: 'Prochaine séance : 52,5 kg × 8.' }
    }]
  });
  const entree = () => ({
    seance: { id: 'S', titre: 'Jeudi — Haut B', debut: '2026-10-01T17:07:00.000Z', fin: '2026-10-01T18:18:00.000Z' },
    entete: ['4 exercice(s)'], notes: ['une ligne jamais validée n’est pas en base'],
    etapes: [0, 1].map((k) => {
      const p = plan();
      const blocs = p.exercices.map((x) => ({ cle: x.slug + '#1', nom: 'Militaire',
        texte: J.texteExercice(x, { nom: 'Militaire', series: [{ charge_kg: 40, reps: 6 }, {}],
          fantomes: { 1: { charge_kg: 52.5, reps: 10 } }, controles: ['contrôle ✓'] }) }));
      return { titre: 'Étape ' + k, plan: p, blocs: blocs, verification: { erreurs: k ? ['I7 — x'] : [] } };
    })
  });

  test('mêmes entrées, même texte, à l’octet ; les entrées ne bougent pas', () => {
    const e = entree();
    const avant = JSON.stringify(e);
    const t1 = J.texte(e);
    const t2 = J.texte(e);
    expect(t2).toBe(t1);
    expect(J.texte(entree())).toBe(t1);
    expect(JSON.stringify(e)).toBe(avant);
  });

  test('ce que la sortie dit : la consigne, l’en-tête, les chauffes, la proposition, les lignes, le constat, les invariants', () => {
    const t = J.texte(entree());
    expect(t.indexOf('═══ Rejeu de la séance S ═══')).toBe(0);
    expect(t).toContain('Ce qui n’est pas reconstruit exactement :');
    expect(t).toContain('consigne reprise_courte · zone mix · palier 52,5 · niveau 10 · n 4 · ligne 52,5 × 10');
    expect(t).toContain('en-tête (jaune) : « 52,5 kg × 10 »');
    expect(t).toContain('chauffes : « Chauffes calées sur 52,5 kg : 20 · 45 kg. »');
    expect(t).toContain('proposition de chauffes : « Chauffe : 56 kg × 8 » → 56 × 8');
    expect(t).toContain('#1 · echauffement · hors plan · chauffe 20 · faite 40 × 6');
    expect(t).toContain('#2 · travail · ligne · rang 1 · plan 52,5 × 10 · à faire · pré-rempli 52,5 × 10');
    expect(t).toContain('constat verdict : « Reprise faite. »');
    expect(t).toContain('invariants : aucune violation');
    expect(t).toContain('  ✗ I7 — x');
    // Un bloc inchangé d'une étape à l'autre se nomme seulement.
    expect(t).toContain('(inchangés : Militaire)');
  });

  test('l’heure se lit à Paris, quelle que soit la machine', () => {
    expect(J.heure('2026-10-01T17:07:05.000Z')).toBe('19:07:05');
  });
});
