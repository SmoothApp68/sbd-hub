// 250 (L9) — « Lire mes notes » : le pré-filtre, le corps, la liste retenue. Le jeu de cas est celui de la conception (annexe A), réécrit :
// `tests/unit/fixtures/notes-ia-cas.json`, aucun texte réel.
const cas = require('./fixtures/notes-ia-cas.json').cas;

['modele', 'sync', 'semaine', 'bilan', 'palier', 'moteur', 'seance', 'periode', 'parcours', 'reserve', 'assistant'].forEach((m) => {
  try { require('../../v2/js/' + m + '.js'); } catch (e) { /* un module optionnel */ }
});
const Faits = require('../../v2/js/faits.js').creer();
const N = require('../../v2/js/notes-ia.js');
const Seance = require('../../v2/js/seance.js');

const slug = (nom) => nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function finieDe(c) {
  return {
    id: 'sess-' + c.id, statut: 'terminee', gestes: [],
    note: c.niveau === 'S' ? c.note : null,
    exercices: c.exercices.map((e, i) => ({
      exercise_slug: slug(e.nom),
      note: c.niveau === 'E' && i === c.exo ? c.note : null,
      series: e.series.map((s, j) => ({ id: 's' + i + '-' + j, type_serie: s[0], charge_kg: s[1], reps: s[2], validee_a: '2026-11-05T10:00:00Z',
        rpe: null, ressenti: null, note: null, source: null }))
    }))
  };
}
function contexteDe(c) {
  const noms = {};
  c.exercices.forEach((e) => { noms[slug(e.nom)] = e.nom; });
  return {
    nom: (s) => noms[s] || s,
    consignes: () => (c.consigne ? [c.consigne] : []),
    noteEcrite: (t, cs) => Faits.estUneNote(t, cs),
    pseudos: []
  };
}
function etatDe(c) {
  const ctx = contexteDe(c);
  return Object.assign({}, ctx, { noteExistante: () => c.noteActuelle || null });
}

describe('250 · le pré-filtre sur le jeu de cas (ce qui part, ce qui reste)', () => {
  cas.forEach((c) => {
    test('cas ' + c.id + ' · ' + JSON.stringify(c.note).slice(0, 50), () => {
      const r = N.candidates(finieDe(c), contexteDe(c));
      expect([c.id, r.envoyer.length > 0]).toEqual([c.id, c.attendu.part]);
      if (c.attendu.douleur) {
        expect(r.douleurs.length).toBe(1);
        if (c.attendu.douleur !== '*') expect(r.douleurs[0].partie).toBe(c.attendu.douleur);
        else expect(r.douleurs[0].partie).toBeNull();
        if (c.attendu.douleurExo !== undefined) expect(r.douleurs[0].iExo).toBe(c.attendu.douleurExo);
      } else {
        expect(r.douleurs).toEqual([]);
      }
      // une douleur ne part JAMAIS : si elle est proposée, aucune note n'est envoyée
      if (r.douleurs.length) expect(r.envoyer).toEqual([]);
    });
  });
});

describe('250 · la liste retenue sur la sortie idéale du modèle', () => {
  cas.forEach((c) => {
    test('cas ' + c.id, () => {
      const f = finieDe(c);
      const r = N.candidates(f, contexteDe(c));
      const vues = N.retenir({ propositions: c.attendu.sortie }, f, r.envoyer, r.douleurs, etatDe(c));
      const sansDouleur = vues.filter((v) => v.genre !== 'douleur');
      expect(sansDouleur.map((v) => ({ genre: v.genre, exercice: v.iExo, rangs: v.rangs || [], valeur: v.valeur })))
        .toEqual(c.attendu.vues.map((v) => ({ genre: v.genre, exercice: v.exercice, rangs: v.rangs, valeur: v.valeur })));
      expect(vues.filter((v) => v.genre === 'douleur').length).toBe(c.attendu.douleur ? 1 : 0);
      // N7 — l'extrait affiché est une sous-chaîne de la note LOCALE (fautes comprises)
      vues.forEach((v) => expect(c.note.indexOf(v.extrait.replace(/…$/, ''))).toBeGreaterThanOrEqual(0));
    });
  });
  test('29 · la citation garde ses mots exacts, fautes comprises', () => {
    const c = cas.filter((x) => x.id === 29)[0];
    const f = finieDe(c);
    const r = N.candidates(f, contexteDe(c));
    const v = N.retenir({ propositions: [{ note: 'n1', genre: 'effort', extrait: 'DERNIERE seri  RPE 9', series: 'derniere', rpe: 9, reserve: null, type: null, exercice: null }] }, f, r.envoyer, r.douleurs, etatDe(c));
    expect(v[0].extrait).toBe('derniere seri rpe 9');
    expect(N.ligne(v[0], { faites: [0, 1, 2] }).cite).toBe('Ta note dit « derniere seri rpe 9 »');
  });
  test('un extrait que la note locale ne contient pas : jetée (C1 côté téléphone)', () => {
    const c = cas[0];
    const f = finieDe(c);
    const r = N.candidates(f, contexteDe(c));
    const v = N.retenir({ propositions: [{ note: 'n1', genre: 'effort', extrait: 'RPE 9 et un bras', series: 'derniere', rpe: 9, reserve: null, type: null, exercice: null }] }, f, r.envoyer, r.douleurs, etatDe(c));
    expect(v).toEqual([]);
  });
});

describe('250 · le corps envoyé (N3)', () => {
  test('DISCRIMINANT · ni @pseudo, ni date, ni lien, ni slug, ni identifiant', () => {
    const c = cas[0];
    const f = finieDe(c);
    f.exercices[0].series.forEach((s) => { s.id = 'uuid-secret-' + s.id; });
    const forge = [{ iExo: 0, brute: 'x', texte: 'rpe 9 avec @lea le 3 octobre voir https://exemple.org/x et mardi' }];
    const j = JSON.stringify(N.corps(f, forge, contexteDe(c)));
    expect(j).not.toMatch(/@lea|lea\b/i);
    expect(j).not.toMatch(/octobre|mardi/);
    expect(j).not.toMatch(/https?:|exemple\.org/);
    expect(j).not.toMatch(/uuid-secret|sess-1|squat"/);
    expect(j).toContain("[quelqu'un]");
  });
  test('la forme : exercices {i, nom, series {type, kg, reps}} et notes {id, i, texte}, rien d’autre', () => {
    const c = cas.filter((x) => x.id === 1)[0];
    const f = finieDe(c);
    const r = N.candidates(f, contexteDe(c));
    const corps = N.corps(f, r.envoyer, contexteDe(c));
    expect(corps).toEqual({
      exercices: [{ i: 0, nom: 'Squat', series: [{ type: 'travail', kg: 140, reps: 5 }, { type: 'travail', kg: 140, reps: 5 }, { type: 'travail', kg: 140, reps: 4 }] }],
      notes: [{ id: 'n1', i: 0, texte: 'RPE 9 sur la dernière' }]
    });
  });
  test('une note de séance : le rang est null, les exercices nommés partent', () => {
    const c = cas.filter((x) => x.id === 14)[0];
    const f = finieDe(c);
    const r = N.candidates(f, contexteDe(c));
    const corps = N.corps(f, r.envoyer, contexteDe(c));
    expect(corps.notes[0].i).toBeNull();
    expect(corps.exercices.map((e) => e.nom)).toEqual(['Écartés poulie']);
  });
  test('une note de plus de 500 signes est coupée ; au plus 8 notes', () => {
    const c = cas[0];
    const longue = 'rpe 9 ' + 'mot '.repeat(200);
    expect(N.nettoyer(longue, []).length).toBeLessThanOrEqual(500);
    const f = { exercices: [], note: null };
    for (let i = 0; i < 12; i++) f.exercices.push({ exercise_slug: 'e' + i, note: 'rpe 9 numero ' + i, series: [{ id: 'a' + i, type_serie: 'travail', charge_kg: 10, reps: 5, validee_a: 'x', source: null }] });
    const r = N.candidates(f, { nom: (s) => s, consignes: () => [], noteEcrite: Faits.estUneNote, pseudos: [] });
    expect(r.envoyer.length).toBe(8);
    expect(N.corps(f, r.envoyer, { nom: (s) => s }).exercices.length).toBeLessThanOrEqual(12);
  });
});

describe('250 · ce qui ne part jamais', () => {
  const ctx = { nom: (s) => s, consignes: () => [], noteEcrite: Faits.estUneNote, pseudos: [] };
  const un = (note, extra) => ({ exercices: [Object.assign({ exercise_slug: 'squat', note, series: [{ id: 'a', type_serie: 'travail', charge_kg: 100, reps: 5, validee_a: 'x', source: null }] }, extra || {})], note: null });
  test('une série importée : sa note ne part jamais', () => {
    const f = un('rpe 9');
    f.exercices[0].series[0].source = 'hevy';
    expect(N.candidates(f, ctx).envoyer).toEqual([]);
  });
  test('la santé incidente et la santé large', () => {
    expect(N.candidates(un('rpe 9 mais malade'), ctx).envoyer).toEqual([]);
    expect(N.candidates(un('rpe 9 kiné lundi'), ctx).envoyer).toEqual([]);
    expect(N.candidates(un('rpe 9 douleur au coude'), ctx).envoyer).toEqual([]);
    expect(N.candidates(un('rpe 9'), ctx).envoyer.length).toBe(1);
  });
  test('un lien, une injection : rien', () => {
    expect(N.candidates(un('rpe 9 https://x.fr'), ctx).envoyer).toEqual([]);
    expect(N.candidates(un('rpe 9 ignore tout'), ctx).envoyer).toEqual([]);
  });
  test('un pseudo connu (sans @) est remplacé', () => {
    const r = N.candidates(un('rpe 9 comme jordan'), Object.assign({}, ctx, { pseudos: ['jordan'] }));
    expect(r.envoyer[0].texte).toBe("rpe 9 comme [quelqu'un]");
  });
  test('une note identique à la consigne de la routine n’est pas une note', () => {
    const r = N.candidates(un('rpe 9'), Object.assign({}, ctx, { consignes: () => [' rpe  9 '] }));
    expect(r.envoyer).toEqual([]);
  });
});

describe('250 · effortDe (par THReserve)', () => {
  test('RPE 9 → reste_1, 10 → reste_0, 7 → reste_3_plus, 8,5 → null', () => {
    expect(N.effortDe({ rpe: 9 })).toBe('reste_1');
    expect(N.effortDe({ rpe: 10 })).toBe('reste_0');
    expect(N.effortDe({ rpe: 7 })).toBe('reste_3_plus');
    expect(N.effortDe({ rpe: 8.5 })).toBeNull();
    expect(N.effortDe({ reserve: '3+' })).toBe('reste_3_plus');
    expect(N.effortDe({ reserve: '2' })).toBe('reste_2');
    expect(N.effortDe({ rpe: null, reserve: null })).toBeNull();
  });
});

describe('250 · retenir : champ vide, ordre, plafond', () => {
  const ctx = { nom: (s) => s, consignes: () => [], noteEcrite: Faits.estUneNote, pseudos: [] };
  const serie = (id, extra) => Object.assign({ id, type_serie: 'travail', charge_kg: 50, reps: 8, validee_a: 'x', source: null, rpe: null, ressenti: null }, extra || {});
  function seance4() {
    return {
      note: null,
      exercices: ['squat', 'curl', 'rowing', 'dips'].map((s, i) => ({
        exercise_slug: s, note: ['rpe 9 der', 'drop set der', 'cran 4 secu 12', 'mal au coude'][i],
        series: [serie('a' + i), serie('b' + i), serie('c' + i)]
      }))
    };
  }
  const prop = (note, genre, o) => Object.assign({ note, genre, extrait: null, series: null, rpe: null, reserve: null, type: null, exercice: null }, o);
  test('N8 · 3 de l’IA + 1 douleur → 2 + 1, la douleur en dernier (DISCRIMINANT du plafond)', () => {
    const f = seance4();
    const r = N.candidates(f, ctx);
    expect(r.douleurs.length).toBe(1);
    const rep = { propositions: [
      prop('n1', 'effort', { extrait: 'rpe 9 der', series: 'derniere', rpe: 9 }),
      prop('n2', 'type_serie', { extrait: 'drop set der', series: 'derniere', type: 'degressive' }),
      prop('n3', 'reglage', { extrait: 'cran 4 secu 12' })
    ] };
    const v = N.retenir(rep, f, r.envoyer, r.douleurs, ctx);
    expect(v.map((x) => x.genre)).toEqual(['effort', 'type_serie', 'douleur']);
  });
  test('l’ordre est fixe : effort, type, réglage, douleur, quel que soit celui du modèle', () => {
    const f = seance4();
    f.exercices[3].note = null;
    const r = N.candidates(f, ctx);
    const rep = { propositions: [
      prop('n3', 'reglage', { extrait: 'cran 4 secu 12' }),
      prop('n2', 'type_serie', { extrait: 'drop set der', series: 'derniere', type: 'degressive' }),
      prop('n1', 'effort', { extrait: 'rpe 9 der', series: 'derniere', rpe: 9 })
    ] };
    expect(N.retenir(rep, f, r.envoyer, r.douleurs, ctx).map((x) => x.genre)).toEqual(['effort', 'type_serie', 'reglage']);
  });
  test('N5 · un effort déjà répondu en séance n’est jamais écrasé (C5 bis)', () => {
    const f = seance4();
    f.exercices[0].series[2].ressenti = 'reste_2';
    const r = N.candidates(f, ctx);
    const rep = { propositions: [prop('n1', 'effort', { extrait: 'rpe 9 der', series: 'derniere', rpe: 9 })] };
    expect(N.retenir(rep, f, r.envoyer, r.douleurs, ctx).filter((x) => x.genre === 'effort')).toEqual([]);
  });
  test('N5 · « toutes » ne remplit que les séries sans effort', () => {
    const f = seance4();
    f.exercices[0].series[0].rpe = 8;
    const r = N.candidates(f, ctx);
    const rep = { propositions: [prop('n1', 'effort', { extrait: 'rpe 9 der', series: 'toutes', rpe: 9 })] };
    expect(N.retenir(rep, f, r.envoyer, r.douleurs, ctx)[0].rangs).toEqual([1, 2]);
  });
  test('une série déjà dégressive : pas reproposée ; une série qui n’existe pas : jetée', () => {
    const f = seance4();
    f.exercices[1].series[2].type_serie = 'degressive';
    const r = N.candidates(f, ctx);
    const rep = { propositions: [
      prop('n2', 'type_serie', { extrait: 'drop set der', series: 'derniere', type: 'degressive' }),
      prop('n1', 'effort', { extrait: 'rpe 9 der', series: 's9', rpe: 9 })] };
    expect(N.retenir(rep, f, r.envoyer, r.douleurs, ctx).filter((x) => x.genre !== 'douleur')).toEqual([]);
  });
  test('une douleur déjà posée n’est jamais reproposée', () => {
    const f = seance4();
    f.exercices[3].douleur = true;
    const r = N.candidates(f, ctx);
    expect(N.retenir({ propositions: [] }, f, r.envoyer, r.douleurs, ctx)).toEqual([]);
  });
  test('un réglage identique à la note de l’exercice n’est pas reproposé ; l’ancienne est montrée sinon', () => {
    const f = seance4();
    f.exercices[3].note = null;
    const r = N.candidates(f, ctx);
    const rep = { propositions: [prop('n3', 'reglage', { extrait: 'cran 4 secu 12' })] };
    expect(N.retenir(rep, f, r.envoyer, r.douleurs, Object.assign({ noteExistante: () => 'Cran 4  secu 12' }, ctx))).toEqual([]);
    const v = N.retenir(rep, f, r.envoyer, r.douleurs, Object.assign({ noteExistante: () => 'cran 3' }, ctx));
    expect(N.phrase(v[0], { faites: [] })).toBe('ta note du rowing, à la place de « cran 3 ».');
    expect(N.phrase({ genre: 'reglage', nom: 'Machine xyz' }, { faites: [] })).toBe('ta note pour machine xyz.');
  });
  test('jamais deux fois (exercice, genre)', () => {
    const f = seance4();
    f.exercices[3].note = null;
    const r = N.candidates(f, ctx);
    const rep = { propositions: [
      prop('n1', 'effort', { extrait: 'rpe 9 der', series: 'derniere', rpe: 9 }),
      prop('n1', 'effort', { extrait: 'rpe 9 der', series: 's1', rpe: 9 })] };
    expect(N.retenir(rep, f, r.envoyer, r.douleurs, ctx).length).toBe(1);
  });
  test('la variante n’existe pas : un genre « variante » est jeté', () => {
    const f = seance4();
    const r = N.candidates(f, ctx);
    const rep = { propositions: [prop('n1', 'variante', { extrait: 'rpe 9 der', series: 'derniere' })] };
    expect(N.retenir(rep, f, r.envoyer, [], ctx)).toEqual([]);
  });
});

describe('250 · les phrases (fixes)', () => {
  const P = (o) => Object.assign({ nom: 'Squat', extrait: 'x', rangs: [2] }, o);
  const F = { faites: [0, 1, 2] };
  test('effort', () => {
    expect(N.phrase(P({ genre: 'effort', valeur: 'reste_1' }), F)).toBe('Squat, dernière série, 1 en réserve.');
    expect(N.phrase(P({ genre: 'effort', valeur: 'reste_2', rangs: [1, 2] }), { faites: [0, 1, 2, 3] })).toBe('Squat, séries 2 et 3, 2 en réserve.');
    expect(N.phrase(P({ genre: 'effort', valeur: 'reste_3_plus', rangs: [0, 1, 2] }), F)).toBe('Squat, toutes les séries, 3 en réserve ou plus.');
    expect(N.phrase(P({ genre: 'effort', valeur: 'reste_0' }), F)).toBe('Squat, dernière série, sans marge.');
    expect(N.apres(P({ genre: 'effort', valeur: 'reste_1' }))).toBe('1 en réserve noté.');
    expect(N.apres(P({ genre: 'effort', valeur: 'reste_0' }))).toBe('Sans marge noté.');
    expect(N.libelle(P({ genre: 'effort', valeur: 'reste_1' }), F)).toBe('1 en réserve');
  });
  test('type de série', () => {
    expect(N.phrase(P({ genre: 'type_serie', nom: 'Extension triceps', valeur: 'degressive', rangs: [2, 3] }), { faites: [0, 1, 2, 3] })).toBe('Extension triceps, séries 3 et 4 en dégressive.');
    expect(N.phrase(P({ genre: 'type_serie', valeur: 'echec' }), F)).toBe('Squat, dernière série en échec.');
    expect(N.apres(P({ genre: 'type_serie', valeur: 'echec' }))).toBe('Noté.');
  });
  test('réglage et douleur', () => {
    expect(N.phrase(P({ genre: 'reglage', nom: 'Presse' }), F)).toBe('ta note de la presse.');
    expect(N.phrase(P({ genre: 'reglage', nom: 'Presse', ancienne: 'dossier cran 4' }), F)).toBe('ta note de la presse, à la place de « dossier cran 4 ».');
    expect(N.phrase(P({ genre: 'douleur', nom: 'Curl marteau', partie: 'coude' }), F)).toBe('douleur au coude, sur Curl marteau.');
    expect(N.phrase(P({ genre: 'douleur', nom: 'Squat', partie: 'épaule' }), F)).toBe("douleur à l'épaule, sur Squat.");
    expect(N.apres(P({ genre: 'douleur', partie: 'coude' }))).toBe('Douleur notée : coude.');
    expect(N.ligne(P({ cle: 'k', genre: 'douleur', nom: 'Curl marteau', partie: 'coude', extrait: 'mal au coude gauche' }), F).propose)
      .toBe('→ je propose : douleur au coude, sur Curl marteau.');
  });
  test('250 · la voix : les phrases passent les motifs de fixtures/voix-regles-181.json (compliment, jargon, assiduité, ordre, « vous », point décimal, comparaison, science)', () => {
    const REGLES = require('./fixtures/voix-regles-181.json').interdits;
    const lettre = '[\\wÀ-ÿ]';
    const re = (i) => new RegExp(REGLES[i].motif.replace(/^\\b/, '(?<!' + lettre + ')').replace(/\\b$/, '(?!' + lettre + ')').replace(/\\w\*/g, lettre + '*'), REGLES[i].drapeaux);
    const motifs = [2, 3, 5, 6, 7, 8, 13, 14].map(re).concat([/palier/i, /le moteur/i]);
    const ctx = { faites: [0, 1, 2] };
    const P2 = (o) => Object.assign({ cle: 'k', iExo: 0, nom: 'Squat', extrait: 'rpe 9', rangs: [2], valeur: 'reste_1' }, o);
    const props = [P2({ genre: 'effort' }), P2({ genre: 'effort', valeur: 'reste_0' }), P2({ genre: 'effort', rangs: [1, 2], valeur: 'reste_2' }),
      P2({ genre: 'effort', rangs: [0, 1, 2], valeur: 'reste_3_plus' }), P2({ genre: 'type_serie', valeur: 'degressive', rangs: [1, 2] }),
      P2({ genre: 'type_serie', valeur: 'echec' }), P2({ genre: 'reglage', nom: 'Presse', ancienne: 'dossier cran 4' }),
      P2({ genre: 'douleur', nom: 'Curl marteau', partie: 'coude' }), P2({ genre: 'douleur', partie: null })];
    const phrases = [];
    props.forEach((p) => { const l = N.ligne(p, ctx); phrases.push(l.propose, l.accepter, l.refuser, l.fait, N.phrase(p, ctx)); });
    phrases.push(N.TEXTES.titre, N.TEXTES.accordTitre, N.TEXTES.oui, N.TEXTES.non, N.TEXTES.annuler, N.TEXTES.reglage, N.TEXTES.reglageAide, N.TEXTES.plusTexte);
    N.TEXTES.accord.forEach((l) => phrases.push(l.join('')));
    phrases.forEach((t) => motifs.forEach((m) => { if (m.test(t)) throw new Error('voix : « ' + t + ' » déclenche ' + m); }));
  });
  test('jamais un mot interdit', () => {
    const textes = [N.TEXTES.accordTitre].concat(N.TEXTES.accord.map((l) => l.join('')), [N.TEXTES.plusTexte, N.TEXTES.reglageAide]);
    textes.forEach((t) => expect(t).not.toMatch(/bravo|J.ai corrigé|Tu as mal/));
  });
});

describe('250 · lire (panne, délai, JSON invalide : rien, sans bruit)', () => {
  const o = (fetch) => ({ url: 'https://x.test', jeton: 'j', cle: 'k', corps: { exercices: [], notes: [] }, fetch });
  test('une réponse valide', async () => {
    const r = await N.lire(o(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ propositions: [{ a: 1 }] }) })));
    expect(r.propositions).toEqual([{ a: 1 }]);
  });
  test.each([
    ['503', () => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) })],
    ['403', () => Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({ erreur: 'accord' }) })],
    ['json invalide', () => Promise.resolve({ ok: true, json: () => Promise.reject(new Error('x')) })],
    ['réseau', () => Promise.reject(new Error('offline'))],
    ['pas un tableau', () => Promise.resolve({ ok: true, json: () => Promise.resolve({ propositions: 'x' }) })]
  ])('%s → []', async (_n, f) => {
    expect((await N.lire(o(f))).propositions).toEqual([]);
  });
  test('N9 · le délai : abandonné', async () => {
    jest.useFakeTimers();
    const p = N.lire(o((u, init) => new Promise((res, rej) => { if (init.signal.aborted) return rej(new Error('abort')); init.signal.addEventListener('abort', () => rej(new Error('abort'))); })));
    jest.advanceTimersByTime(15001);
    jest.useRealTimers();
    expect((await p).propositions).toEqual([]);
  });
  test('l’URL est celle de la fonction à part', async () => {
    let vu = null;
    await N.lire(o((u) => { vu = u; return Promise.resolve({ ok: true, json: () => Promise.resolve({ propositions: [] }) }); }));
    expect(vu).toBe('https://x.test/functions/v1/lire-notes');
  });
});

describe('250 · Seance.retirerDouleur et les gestes de note (N12)', () => {
  const base = () => ({ id: 'x', gestes: [], exercices: [
    { exercise_slug: 'curl', series: [{ id: 'a', douleur: false, validee_a: 'x' }, { id: 'b', douleur: false }] },
    { exercise_slug: 'squat', series: [{ id: 'c' }] }] });
  test('retirerDouleur ∘ marquerDouleur = identité (sur une occurrence non marquée)', () => {
    const s = base();
    const marquee = Seance.marquerDouleur(s, 0);
    expect(Seance.occurrenceDouloureuse(marquee.exercices[0])).toBe(true);
    const r = Seance.retirerDouleur(marquee, 0);
    expect(Seance.occurrenceDouloureuse(r.exercices[0])).toBe(false);
    expect(r.exercices[0].series.map((x) => x.douleur)).toEqual([false, false]);
    expect(r.exercices[1].series).toEqual(s.exercices[1].series);
  });
  test('sans marque : la séance revient inchangée', () => {
    const s = base();
    expect(Seance.retirerDouleur(s, 0)).toBe(s);
  });
  test('trois gestes de note, { geste, slug, genre }, jamais un texte', () => {
    let s = base();
    ['note_prise', 'note_refusee', 'note_annulee'].forEach((g) => {
      s = Seance.noterGeste(s, { geste: g, slug: 'curl', genre: 'effort', texte: 'rpe 9 secret', extrait: 'rpe 9' });
    });
    expect(s.gestes).toEqual([
      { geste: 'note_prise', slug: 'curl', genre: 'effort' },
      { geste: 'note_refusee', slug: 'curl', genre: 'effort' },
      { geste: 'note_annulee', slug: 'curl', genre: 'effort' }]);
    expect(JSON.stringify(s.gestes)).not.toMatch(/secret|rpe 9/);
  });
  test('un genre hors liste (variante comprise), ou sans slug : le geste ne s’écrit pas', () => {
    const s = base();
    expect(Seance.noterGeste(s, { geste: 'note_prise', slug: 'curl', genre: 'variante' }).gestes).toEqual([]);
    expect(Seance.noterGeste(s, { geste: 'note_prise', slug: 'curl' }).gestes).toEqual([]);
    expect(Seance.noterGeste(s, { geste: 'note_prise', genre: 'effort' }).gestes).toEqual([]);
  });
  test('equilibres.js ne lit pas ces gestes', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../v2/js/equilibres.js'), 'utf8');
    expect(src).not.toMatch(/note_prise|note_refusee|note_annulee/);
  });
});
