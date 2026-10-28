// 160 — « Demander au coach » : les contrôles de la fonction (`controle.js`, pur) et le contexte de l'app (`assistant.js`).
// L'IA explique une décision du moteur, elle n'en prend jamais : ces tests tiennent ce qu'elle n'a pas le droit de faire.
global.THModele = require('../../v2/js/modele.js');
const C = require('../../supabase/functions/demander-coach/controle.js');
const A = require('../../v2/js/assistant.js');

describe('160 — controle.js : les nombres', () => {
  test('la virgule vaut le point, 12 vaut 12.0, les milliers se regroupent', () => {
    expect(C.nombresDe('130,4 kg et 130.4 kg')).toEqual([130.4, 130.4]);
    expect(C.nombresDe('12 reps')).toEqual([12]);
    expect(C.nombresDe('1 000 kg')).toEqual([1000]);
    expect(C.nombresDe('rien')).toEqual([]);
  });
  test('DISCRIMINANT — un nombre de la réponse absent du contexte et de la question : refusée (nombre_absent)', () => {
    const r = C.controlerReponse('Je teste 142,5 kg.', 'palier 130,4 ; test 140,4', 'Pourquoi pas plus ?');
    expect(r).toMatchObject({ ok: false, raison: 'nombre_absent' });
  });
  test('un nombre du contexte (virgule ou point) ou de la question passe', () => {
    expect(C.controlerReponse('Je teste 140,4 kg.', '{"coach":"140.4 kg"}', 'q').ok).toBe(true);
    expect(C.controlerReponse('Tu parles de 135 kg : non, je teste 140,4 kg.', '140,4', 'Pourquoi 135 ?').ok).toBe(true);
    expect(C.controlerReponse('Tu fais 12 reps.', '12.0', 'q').ok).toBe(true);
  });
  test('deux séries côte à côte dans le contexte ne se fusionnent pas en un nombre', () => {
    expect(C.controlerReponse('Tu fais 20 kg.', 'x 20 130,4', 'q').ok).toBe(true);
  });
  test('vide : refusée', () => {
    expect(C.controlerReponse('   ', 'x', 'q')).toMatchObject({ ok: false, raison: 'vide' });
  });
});

describe('160 — controle.js : les phrases et les mots', () => {
  test('plus de 3 phrases : on garde les 3 premières, ce n’est pas un refus', () => {
    const r = C.controlerReponse('Une. Deux. Trois. Quatre. Cinq.', '', '');
    expect(r.ok).toBe(true);
    expect(r.texte).toBe('Une. Deux. Trois.');
  });
  test('une décimale ne coupe pas la phrase', () => {
    expect(C.phrasesDe('Je teste 140.4 kg. Tu as fait 130.4 kg.')).toEqual(['Je teste 140.4 kg.', 'Tu as fait 130.4 kg.']);
  });
  test('« bravo », « félicit », « génial » : la phrase qui les porte est retirée, pas la réponse', () => {
    const r = C.controlerReponse('Je teste 140,4 kg. Bravo pour ta série ! Je garde 130,4 kg. C’est génial.', '140,4 130,4', '');
    expect(r.ok).toBe(true);
    expect(r.texte).toBe('Je teste 140,4 kg. Je garde 130,4 kg.');
  });
  test('une réponse qui n’est QUE de la louange : vide', () => {
    expect(C.controlerReponse('Bravo !', '', '').raison).toBe('vide');
  });
});

const DOULEURS = ['J’ai mal au genou depuis hier, je continue ?', 'j\'ai mal à l\'épaule', 'une douleur à l’épaule en haut du mouvement',
  'mon genou qui craque', 'ça me fait mal au dos', 'je me suis blessé', 'tendinite au coude', 'mal de dos', 'j’ai un lumbago',
  'mon dos est bloqué', 'je me sens mal', 'j\'ai très mal', 'mal aux poignets', 'mal dans le bas du dos'];
const SANS_DOULEUR = ['Pourquoi 140,4 kg et pas 135 ?', 'je m’y prends mal', 'je m\'y prends mal avec cette barre',
  'je prends mal la barre', 'je fais mal le mouvement', 'Pourquoi pas une rep de plus ?', 'Et ensuite ?',
  'Dans combien de temps je passe à 88 ?', 'c’est pas mal comme progression ?', 'Je suis où par rapport à Léa au squat ?'];
describe('160 — estSante : une douleur ne part pas', () => {
  test.each(DOULEURS)('douleur : %s', (q) => { expect(C.estSante(q)).toBe(true); expect(A.estSante(q)).toBe(true); });
  test.each(SANS_DOULEUR)('pas une douleur : %s', (q) => { expect(C.estSante(q)).toBe(false); expect(A.estSante(q)).toBe(false); });
  test('DISCRIMINANT — la liste du téléphone et celle de la fonction sont IDENTIQUES', () => {
    expect(A.MOTIFS_SANTE).toEqual(C.MOTIFS_SANTE);
    expect(A.MOTIFS_SANTE.length).toBeGreaterThan(5);
    DOULEURS.concat(SANS_DOULEUR).forEach((q) => expect(A.estSante(q)).toBe(C.estSante(q)));
  });
});

describe('160 — le contexte revérifié par la fonction', () => {
  const bon = { exercice: 'Extension Mollets', consigne: '130,4 kg × 20', lignes: [{ texte: '130,4 kg × 20', role: 'test' }],
    crans: { genre: 'salle', charges: ['130,4', '140,4'] }, seances: [['130,4 kg × 17']], etat_cle: 'test_propose' };
  test('le contexte de l’app passe', () => { expect(C.verifierContexte(bon).ok).toBe(true); });
  test('une clé inattendue est refusée', () => {
    expect(C.verifierContexte(Object.assign({}, bon, { user_id: 'x' }))).toEqual({ ok: false, raison: 'user_id' });
    expect(C.verifierContexte(Object.assign({}, bon, { nom: 'Aurélien' })).ok).toBe(false);
  });
  test('une longueur hors borne est refusée', () => {
    expect(C.verifierContexte(Object.assign({}, bon, { exercice: 'x'.repeat(121) })).ok).toBe(false);
    expect(C.verifierContexte(Object.assign({}, bon, { seances: [[], [], [], []] })).ok).toBe(false);
  });
  test('une date est refusée', () => {
    expect(C.verifierContexte(Object.assign({}, bon, { zone: 'celle de ton test mardi' })).raison).toBe('date');
    expect(C.verifierContexte(Object.assign({}, bon, { etat: 'le 13 sept. 130 kg' })).raison).toBe('date');
    expect(C.verifierContexte(Object.assign({}, bon, { etat: '2026-10-20' })).raison).toBe('date');
  });
  test('ce qui n’est pas un objet est refusé', () => {
    expect(C.verifierContexte(null).ok).toBe(false);
    expect(C.verifierContexte([]).ok).toBe(false);
  });
});

describe('160 — CORS', () => {
  test('la production, les aperçus et localhost', () => {
    ['https://sbd-hub.pages.dev', 'https://abc123.sbd-hub.pages.dev', 'http://localhost:8080', 'http://localhost', 'http://127.0.0.1:4173']
      .forEach((o) => expect(C.origineAutorisee(o)).toBe(true));
    ['https://evil.example', 'https://sbd-hub.pages.dev.evil.com', 'http://sbd-hub.pages.dev', 'https://x.y.sbd-hub.pages.dev', null, '']
      .forEach((o) => expect(C.origineAutorisee(o)).toBe(false));
  });
});

// ── L'app : le contexte d'une ligne ─────────────────────────────────────
const PLAN = {
  slug: 'extension-mollets-debout',
  consigne: { etat: 'test_propose', palier: 130.4 },
  entete: { jaune: ['130,4 kg × 20'] },
  pourquoi: {
    seance: { date: 'mardi', lignes: [{ texte: '130,4 kg × 17', role: 'ta charge de travail' }, { texte: '130,4 kg × 20', role: 'haut de ta zone' }] },
    zone: 'Ta zone : séries longues, 15 à 20 reps, celle de ton test mardi.',
    palier: 'Ta charge de travail : 130,4 kg, validée à 20 reps.',
    etat: 'Ton test du 13 sept. est dans ta zone. Hier, tu as fait 20 reps.',
    donc: 'Donc 140,4 kg × 15.',
    lignes: [{ texte: '140,4 kg × 15', libelle: 'test', raison: null, faite: null }],
    reglage: 'Ton réglage : Franc. Il se change dans Profil.'
  }
};
const SERIES = (id, charges) => ({ seance: { id: 'sess-' + id, debut: '2026-10-' + (10 + id) + 'T10:00:00Z' },
  series: charges.map((c, i) => ({ id: 'set-' + id + '-' + i, exercise_slug: 'extension-mollets-debout', charge_kg: c[0], reps: c[1], type_serie: 'travail' })) });
const GROUPES = [SERIES(4, [[130.4, 17], [130.4, 20]]), SERIES(3, [[120, 20]]), SERIES(2, [[110, 20]]), SERIES(1, [[100, 20]])];
const SALLE = { materiel: 'machine', charges: [80, 90, 100, 110, 120, 130.4, 140.4, 150.4, 160.4, 170.4, 180.4] };

describe('160 — assistant.js : le contexte construit à partir du plan et des faits', () => {
  const ctx = A.contexteDe({ nom: 'Extension Mollets Debout (Machine)', x: PLAN, groupes: GROUPES, salle: SALLE });
  const brut = JSON.stringify(ctx);

  test('il porte la consigne, le « Donc », la zone, le palier, l’état, les lignes et le réglage', () => {
    expect(ctx.exercice).toBe('Extension Mollets Debout (Machine)');
    expect(ctx.consigne).toBe('130,4 kg × 20');
    expect(ctx.coach).toBe('Donc 140,4 kg × 15.');
    expect(ctx.lignes).toEqual([{ texte: '140,4 kg × 15', role: 'test' }]);
    expect(ctx.etat_cle).toBe('test_propose');
    expect(ctx.reglage).toMatch(/Franc/);
    expect(ctx.palier).toMatch(/130,4 kg/);
  });
  test('DISCRIMINANT — ni date, ni identifiant, ni nom : un test qui les cherche', () => {
    expect(brut).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(brut).not.toMatch(/mardi|hier|sept\.|2026|\bdu 13\b/i);
    expect(brut).not.toMatch(/sess-|set-|extension-mollets-debout/);
    expect(brut).not.toMatch(/Aur[ée]lien|u-banc|user_id|pseudo|poids du corps/i);
    expect(Object.keys(ctx).every((k) => ['exercice', 'consigne', 'coach', 'zone', 'palier', 'etat', 'compteur', 'frere', 'chauffes', 'reglage',
      'etat_cle', 'lignes', 'derniere', 'crans', 'seances'].indexOf(k) >= 0)).toBe(true);
  });
  test('les 3 dernières séances seulement, « charge × reps », sans date', () => {
    expect(ctx.seances).toEqual([['130,4 kg × 17', '130,4 kg × 20'], ['120 kg × 20'], ['110 kg × 20']]);
  });
  test('179 (B-B9) — les crans sont les charges décidées par le plan (ses lignes et son palier), jamais celles de la salle', () => {
    const avec = A.contexteDe({ nom: 'X', x: Object.assign({}, PLAN, { lignes: [{ charge: 140.4, vise: 15 }, { charge: null }] }),
      groupes: GROUPES, salle: SALLE });
    expect(avec.crans).toEqual({ genre: 'plan', charges: ['130,4', '140,4'] });
    expect(avec.crans.charges).not.toContain('150,4');
  });
  test('sans ligne chargée : le palier seul ; sans palier ni ligne : pas de crans', () => {
    expect(A.contexteDe({ nom: 'X', x: PLAN, groupes: GROUPES, salle: null }).crans).toEqual({ genre: 'plan', charges: ['130,4'] });
    const nu = Object.assign({}, PLAN, { consigne: { etat: 'test_propose' } });
    expect(A.contexteDe({ nom: 'X', x: nu, groupes: GROUPES, salle: null }).crans).toBeUndefined();
  });
  test('le contexte passe la revérification de la fonction', () => {
    expect(C.verifierContexte(ctx)).toEqual({ ok: true, raison: null });
  });
  test('sans plan pour cet exercice : rien', () => {
    expect(A.contexteDe({ nom: 'X', x: null, groupes: [], salle: null })).toBeNull();
    expect(A.contexteDe({ nom: 'X', x: { slug: 'a', consigne: { etat: 'garde' } }, groupes: [], salle: null })).toBeNull();
  });
  test('sansDate retire les jours, les « le 13 sept. », « hier » et les dates ISO', () => {
    expect(A.sansDate('celle de ton test mardi : elle ne bouge pas')).toBe('celle de ton test: elle ne bouge pas');
    expect(A.sansDate('Ton test du 13 sept. a fait 12 reps.')).toBe('Ton test a fait 12 reps.');
    expect(A.sansDate('Ton test le 13\u00a0sept. a fait 12 reps.')).toBe('Ton test a fait 12 reps.');
    expect(A.sansDate('Ton test est dans ta zone. Hier, tu as fait 20 reps.')).toBe('Ton test est dans ta zone. Tu as fait 20 reps.');
    expect(A.sansDate('fait le 2026-10-20')).not.toMatch(/2026/);
  });
});

describe('160 — assistant.js : les questions toutes prêtes, le quota, l’appel', () => {
  test('trois puces par état, adaptées à un test, une garde, une reprise, salle_max', () => {
    ['test_propose', 'garde', 'reprise_longue', 'salle_max', 'silence', 'etat_inconnu', null].forEach((e) => expect(A.puces(e)).toHaveLength(3));
    expect(A.puces('test_propose')[0]).toMatch(/test/);
    expect(A.puces('garde')[0]).toMatch(/gardes/);
    expect(A.puces('salle_max')[0]).toMatch(/monte plus/);
    expect(A.puces(null)).toEqual(['Pourquoi cette charge ?', 'Pourquoi pas plus ?', 'Et ensuite ?']);
  });
  test('le reste du jour : en mémoire, borné, oublié', () => {
    A.oublier();
    expect(A.resteDuJour()).toBeNull();
    A.noterReste(7); expect(A.resteDuJour()).toBe(7);
    A.noterReste(99); expect(A.resteDuJour()).toBe(A.MAX_PAR_JOUR);
    A.noterReste(-1); expect(A.resteDuJour()).toBe(A.MAX_PAR_JOUR);
    A.oublier(); expect(A.resteDuJour()).toBeNull();
  });
  const reponse = (statut, corps) => () => Promise.resolve({ status: statut, ok: statut < 400, json: () => Promise.resolve(corps) });
  const appel = (f) => A.demander({ url: 'https://x.supabase.co', jeton: 'jt', cle: 'k', question: 'q', slug: 'a', contexte: {}, fetch: f });
  test('l’appel va à /functions/v1/demander-coach avec le jeton de session', async () => {
    let vu = null;
    await appel((u, o) => { vu = { u, o }; return reponse(200, { reponse: 'Je garde.', reste: 9 })(); });
    expect(vu.u).toBe('https://x.supabase.co/functions/v1/demander-coach');
    expect(vu.o.headers.Authorization).toBe('Bearer jt');
    expect(Object.keys(JSON.parse(vu.o.body)).sort()).toEqual(['contexte', 'question', 'slug']);
  });
  test('les issues : réponse, bloquée, quota, accord, indisponible, réseau', async () => {
    expect(await appel(reponse(200, { reponse: 'Je garde.', reste: 9 }))).toEqual({ genre: 'reponse', texte: 'Je garde.', reste: 9 });
    expect(await appel(reponse(200, { bloquee: true, reponse: 'x', reste: 8 }))).toMatchObject({ genre: 'bloquee', reste: 8 });
    expect(await appel(reponse(429, { quota: true, reste: 0 }))).toEqual({ genre: 'quota' });
    expect(await appel(reponse(403, { erreur: 'accord' }))).toEqual({ genre: 'accord' });
    expect(await appel(reponse(503, { erreur: 'indisponible' }))).toEqual({ genre: 'indisponible' });
    expect(await appel(() => Promise.reject(new Error('hors ligne')))).toEqual({ genre: 'reseau' });
  });
});
