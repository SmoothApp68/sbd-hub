/** @jest-environment node */
//
// « Les mots disent vrai » PR 1 — LES MOTS DE LA DÉCHARGE (MOTEUR §9.43, I165). Chiffres inchangés : seuls les textes affichés changent.
// Un nom (« Décharge »), ce qui change et rien d'autre, jamais « N … au lieu de N », jamais « mêmes charges » ni « 2 reps de moins ».

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const G = require('../../v2/js/generateur.js');

const esp = (s) => String(s).replace(/[  ]/g, ' ');
const BLOC = { id: 'b1', dossier: 'Force', zone: 'lourd', debut: '2026-10-12', semaines: 4, decharge: true,
  statut: 'en_cours', exercices: ['couche'], precedent: null };
const kDe = (vise, n) => ({ etat: 'progression', zone: 'lourd', palier: 125, niveau: vise, n: n, ligne: { charge: 125, vise: vise }, haut: null,
  fondement: { date: '2026-10-26T17:00:00.000Z', reps: [vise, vise, vise, vise] } });
// `routine` : les séries de la routine passées au plan (`undefined` : aucune, hors routine) ; `series` : les séries de la séance.
function decor(opts) {
  const o = Object.assign({ debut: '2026-11-03T10:00:00+00:00', vise: 5, series: 4, routine: 4 }, opts || {});
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'couche', id, { series: o.series });
  const K = kDe(o.vise, o.series);
  const e = { seance: { id: 'S1', debut: o.debut, edition: false, exercices: se.exercices },
    consignes: { couche: { consigne: K, libelles: M.libellesConsigne(K), compteur: { compteur: 0, meilleur: null, blocages: [] }, repli: null } },
    reglage: 'franc', paris: [], suites: {}, phase: 'maintien', catalogue: null,
    escalier: { cartes: [], compteurs: [], noms: { couche: 'Développé Couché (Barre)' },
      seriesRoutine: o.routine === undefined ? {} : { couche: o.routine }, marches: [] },
    programme: { blocs: [BLOC], lignes: [] } };
  return { e, p: T.planDeSeance(e) };
}
const i165 = (p, e) => T.verifierPlan(p, e).erreurs.filter((m) => /^I165/.test(m));

describe('I165 — la décharge du programme, trois formes du gris', () => {
  test('séries réduites : « Décharge, semaine 4 sur 4 : 2 séries au lieu de 4. »', () => {
    const { e, p } = decor();
    const x = p.exercices[0];
    expect(x.consigne.allegee).toMatchObject({ series: 2, routine: 4, decharge: true, semaine: 4, semaines: 4 });
    expect(esp(x.entete.gris)).toBe('Décharge, semaine 4 sur 4 : 2 séries au lieu de 4.');
    expect(esp(x.pourquoi.etat)).toBe('Décharge, semaine 4 sur 4 : moins de séries, avec de la marge. 2 séries au lieu de 4. 125 kg × 3 au lieu de 125 kg × 5.');
    expect(esp(p.allegee.bandeau)).toBe('Décharge, semaine 4 sur 4 : prévue par ton programme. Moins de séries, avec de la marge.');
    expect(i165(p, e)).toEqual([]);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('même nombre de séries (routine à 1 série), reps plus basses : « Décharge, semaine 4 sur 4. », jamais « 1 série au lieu de 1 »', () => {
    const { e, p } = decor({ series: 1, routine: 1 });
    const x = p.exercices[0];
    expect(x.consigne.allegee.series).toBe(1);
    expect(esp(x.entete.gris)).toBe('Décharge, semaine 4 sur 4.');
    expect(esp(x.pourquoi.etat)).toBe('Décharge, semaine 4 sur 4 : des cibles plus basses, avec de la marge. 125 kg × 3 au lieu de 125 kg × 5.');
    expect(esp(x.pourquoi.etat)).not.toMatch(/séries? au lieu/);
    expect(i165(p, e)).toEqual([]);
  });

  test('rien ne change (routine à 1 série, cible × 1) : « cet exercice ne change pas », gris et Pourquoi', () => {
    const { e, p } = decor({ series: 1, routine: 1, vise: 1 });
    const x = p.exercices[0];
    expect(esp(x.entete.gris)).toBe('Décharge, semaine 4 sur 4 : cet exercice ne change pas.');
    expect(esp(x.pourquoi.etat)).toBe('Décharge, semaine 4 sur 4 : cet exercice ne change pas.');
    expect(i165(p, e)).toEqual([]);
  });

  test('HORS ROUTINE : `routine: null`, aucune clause de séries ni « comme ta routine », les chiffres inchangés', () => {
    const { e, p } = decor({ routine: undefined });
    const x = p.exercices[0];
    expect(x.consigne.allegee.routine).toBeNull();
    expect(x.consigne.allegee.series).toBe(2);   // PR 3 (D3) : 60 % des séries de la consigne normale (4), plus l'ancien défaut inventé « 1 »
    expect(esp(x.entete.gris)).toBe('Décharge, semaine 4 sur 4 : 2 séries.');
    expect(esp(x.entete.gris) + esp(x.pourquoi.etat)).not.toMatch(/au lieu de \d+ ?(?:\.|$)|routine|séries? au lieu/);
    expect(esp(x.pourquoi.etat)).toBe('Décharge, semaine 4 sur 4 : moins de séries, avec de la marge. 2 séries. 125 kg × 3 au lieu de 125 kg × 5.');
    expect(i165(p, e)).toEqual([]);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('hors routine : « ne change pas » seulement si la consigne normale le prouve (PR 3 : sa base est ses propres séries, c.n)', () => {
    const { e, p } = decor({ routine: undefined, vise: 1, series: 1 });
    expect(esp(p.exercices[0].entete.gris)).toBe('Décharge, semaine 4 sur 4 : cet exercice ne change pas.');
    expect(i165(p, e)).toEqual([]);
  });
});

describe('I165 — la décharge acceptée (la carte), « 7 jours » pour elle seule', () => {
  const K = kDe(5, 4);
  test('le gris, le Pourquoi, le bandeau, la carte et son bouton', () => {
    const a = M.consigneAllegee(K, 4);
    expect(esp(M.grisAllegee(a))).toBe('Décharge : 2 séries au lieu de 4.');
    expect(esp(M.pourquoiConsigne(a, 'normal', '2026-11-03T10:00:00+00:00').etat))
      .toBe('Décharge : moins de séries, avec de la marge. 2 séries au lieu de 4. 125 kg × 3 au lieu de 125 kg × 5.');
    expect(esp(M.bandeauAllegee('2026-11-24'))).toBe('Décharge jusqu’au 24 nov. : moins de séries, avec de la marge.');
    expect(esp(M.DETAIL_CARTE))
      .toContain('Je te propose une décharge : mêmes exercices, 60 % des séries, des cibles plus basses, pendant 7 jours.');
    expect(M.libelleAlleger()).toBe('Décharge 7 jours');
    expect(esp(M.texteDureeAllegee(2400))).toBe('Décharge : environ 40 min (estimation)');
  });

  test('« 7 jours » n’est dit que pour la carte acceptée : ni le bandeau ni le gris du programme', () => {
    expect(esp(M.bandeauDecharge(4, 4))).not.toMatch(/7 jours/);
    expect(esp(decor().p.exercices[0].entete.gris)).not.toMatch(/7 jours/);
  });

  test('le glossaire et la phase', () => {
    const textes = M.textesFixesDeLaDecharge().map(esp);
    expect(textes).toContain('Décharge');
    expect(textes).toContain('Moins de séries et des cibles plus basses, pour récupérer.');
    expect(textes).toContain('5 semaines : 4 de travail, 1 de décharge.');
  });

  test('le programme construit : « Une décharge toutes les 5 semaines : moins de séries. »', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../v2/js/generateur.js'), 'utf8');
    expect(src).toContain('Une décharge toutes les 5 semaines\\u00a0: moins de séries.');
  });
});

describe('I165 — l’invariant tient (forgeries)', () => {
  const grisForge = (txt) => { const { e, p } = decor(); p.exercices[0].entete.gris = txt; return i165(p, e); };
  test('« N séries au lieu de N »', () => {
    expect(grisForge('Décharge, semaine 4 sur 4 : 4 séries au lieu de 4.').join('|')).toMatch(/deux nombres égaux/);
  });
  test('« semaine allégée », « mêmes charges », « 2 reps de moins », « loin de l’échec », « Rien ne monte », « cette semaine »', () => {
    ['semaine allégée', 'mêmes charges', '2 reps de moins', 'loin de l’échec', 'Rien ne monte', 'cette semaine'].forEach((m) => {
      expect(grisForge('Décharge : 2 séries au lieu de 4, ' + m + '.').join('|')).toMatch(/I165/);
    });
  });
  test('« ne change pas » à tort, et la clause de séries absente ou en trop', () => {
    expect(grisForge('Décharge, semaine 4 sur 4 : cet exercice ne change pas.').join('|')).toMatch(/ne change pas/);
    expect(grisForge('Décharge, semaine 4 sur 4.').join('|')).toMatch(/clause des séries manque/);
    const { e, p } = decor({ routine: undefined });
    p.exercices[0].entete.gris = 'Décharge, semaine 4 sur 4 : 1 série au lieu de 4.';
    expect(i165(p, e).join('|')).toMatch(/sans routine connue/);
  });
  test('« ne change pas » manquant quand rien ne change', () => {
    const { e, p } = decor({ series: 1, routine: 1, vise: 1 });
    p.exercices[0].entete.gris = 'Décharge, semaine 4 sur 4.';
    expect(i165(p, e).join('|')).toMatch(/manque alors que rien ne change/);
  });
  test('la clause des cibles du Pourquoi : jamais deux cibles égales', () => {
    const { e, p } = decor();
    p.exercices[0].pourquoi.etat = 'Décharge, semaine 4 sur 4 : moins de séries, avec de la marge. 2 séries au lieu de 4. 125 kg × 5 au lieu de 125 kg × 5.';
    expect(i165(p, e).join('|')).toMatch(/deux nombres égaux/);
  });
  test('le bandeau et la carte sont balayés', () => {
    const { e, p } = decor();
    p.allegee.bandeau = 'Semaine allégée jusqu’au 7 oct. : mêmes charges.';
    expect(i165(p, e).length).toBeGreaterThan(0);
  });
});

describe('I165 — aucun nom ancien dans le code affiché', () => {
  test('« semaine allégée » n’est dans aucun texte fixe du moteur', () => {
    M.textesFixesDeLaDecharge().forEach((t) => expect(t).not.toMatch(/allégée|mêmes charges|reps de moins|loin de l[’']échec|Rien ne monte|cette semaine/i));
  });
  test('ni dans une chaîne de v2/js (les commentaires et les messages des invariants mis à part)', () => {
    const fs = require('fs'), path = require('path');
    const dir = path.join(__dirname, '../../v2/js');
    const motif = /(['"`])(?:(?!\1)[^\\\n])*(?:[Ss]emaines? allégées?|[Ss]emaine de décharge)(?:(?!\1)[^\\\n])*\1/g;
    const trouves = [];
    fs.readdirSync(dir).filter((f) => f.endsWith('.js')).forEach((f) => {
      fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((l, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
        // les messages d'erreur des invariants (plan.js) sont écrits pour le développeur, pas affichés
        if (f === 'plan.js' && /erreurs\.push|\be\(|\berr\(|\be4[89]\(|\be67\(|pose\(|ajouter\(/.test(l)) return;
        if (motif.test(l)) trouves.push(f + ':' + (i + 1));
        motif.lastIndex = 0;
      });
    });
    expect(trouves).toEqual([]);
  });
});

describe('I165 — la clause des cibles au poids du corps ne répète pas le nom', () => {
  const kCorps = (vise, n) => ({ etat: 'progression', zone: 'lourd', palier: 0, niveau: vise, n: n, ligne: { charge: 0, vise: vise }, haut: null,
    fondement: { date: '2026-10-26T17:00:00.000Z', reps: [vise, vise, vise, vise] } });
  test('« Poids du corps × 3 au lieu de × 5 » (jamais « Poids du corps × 3 au lieu de Poids du corps × 5 »)', () => {
    const a = M.consigneAllegee(kCorps(5, 4), 4);
    const t = esp(M.pourquoiConsigne(a, 'normal', '2026-11-03T10:00:00+00:00').etat);
    expect(t).toContain('Poids du corps × 3 au lieu de × 5.');
    expect(t).not.toMatch(/Poids du corps.*Poids du corps/i);
  });
  test('à la barre, les deux charges restent dites (125 kg × 3 au lieu de 125 kg × 5)', () => {
    const a = M.consigneAllegee(kDe(5, 4), 4);
    expect(esp(M.pourquoiConsigne(a, 'normal', '2026-11-03T10:00:00+00:00').etat)).toContain('125 kg × 3 au lieu de 125 kg × 5.');
  });
});
