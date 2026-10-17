/** @jest-environment node */
//
// 117 (audit du 16/10/2026, 06 #4 et #17) — CE QUE LA BASE N'A PAS ENCORE NE RETIENT PLUS LES SÉANCES.
//
// LE CONSTAT : une colonne absente (`PGRST204`, PostgREST, et non `42703`) ou une table absente (`PGRST205`,
// `42P01`) était classée « temporaire » : l'entrée n'était jamais marquée, `prochaine` la rendait en tête à chaque
// tour, la vidange s'arrêtait — et toutes les entrées suivantes, séances comprises, restaient sur le téléphone
// jusqu'à la migration. Et une entrée d'une table que `executer` ne connaît pas « réussissait » sans rien écrire.
//
// La boucle ci-dessous est celle de `vidanger` (`app.js`) : `prochaine`, l'envoi, puis `apresEchec` /
// `apresSucces` ; `arret` seul arrête la vidange.

const fs = require('fs');
const path = require('path');
const A = require('../../v2/js/attente.js');

const COLONNE = { code: 'PGRST204', message: "Could not find the 'nouvelle' column of 'objectifs' in the schema cache" };
const TABLE = { code: 'PGRST205', message: "Could not find the table 'public.objectifs' in the schema cache" };

const objectif = (slug) => ({ table: A.OBJECTIFS, op: A.UPSERT, id: slug, donnees: { exercise_slug: slug } });
const session = (id) => ({ table: A.SESSIONS, op: A.UPSERT, id, creation: true, donnees: { id } });
const series = (id) => ({ table: A.SETS, op: A.REMPLACER, id, donnees: [{ id: id + '-s1', session_id: id }] });
const pari = (id, seance) => ({ table: A.PREDICTIONS, op: A.UPSERT, id, depend: seance, donnees: { id, fondement: { seance } } });

const poserTout = (ops) => ops.reduce((f, op) => A.poser(f, op), []);
const cles = (f) => A.ordonnee(f).map((e) => e.cle);

function vidanger(file, refuser) {
  const envoyes = [];
  let f = file;
  for (let garde = 200; garde > 0; garde--) {
    const op = A.prochaine(f);
    if (!op) break;
    envoyes.push(op.cle);
    const echec = refuser(op);
    if (echec) {
      const issue = A.apresEchec(f, op, echec);
      f = issue.file;
      if (issue.suite === 'arret') break;
      continue;
    }
    f = A.apresSucces(f, op);
  }
  return { file: f, envoyes };
}

describe('une colonne ou une table absente ne retient que ce qui dépend de l’entrée', () => {
  test.each([['PGRST204', COLONNE], ['PGRST205', TABLE], ['42P01', { code: '42P01', message: 'relation does not exist' }],
    ['PGRST202', { code: 'PGRST202', message: 'Could not find the function' }], ['TH001', { code: 'TH001' }]])(
    '%s est un refus (l’entrée se marque), pas une coupure', (code, erreur) => {
      expect(A.estDefinitive(erreur)).toBe(true);
      expect(A.CODES_SCHEMA).toContain(code);
    });

  test('⚠️ DISCRIMINANT — un objectif refusé faute de table : la séance posée APRÈS lui monte dans la même vidange', () => {
    const file = poserTout([objectif('squat'), session('S1'), series('S1'), pari('p1', 'S1')]);
    const r = vidanger(file, (op) => (op.table === A.OBJECTIFS ? TABLE : null));
    expect(r.envoyes).toEqual(['objectifs:squat', 'sessions:S1', 'sets:S1', 'predictions:p1']);
    expect(cles(r.file)).toEqual(['objectifs:squat']);
    expect(A.resume(r.file).bloquees).toBe(1);
    expect(A.resume(r.file).libelle).toBe('1 envoi refusé — rien n’est perdu');
  });

  test('une séance refusée faute de colonne retient SES séries et SES paris, pas la séance suivante', () => {
    const file = poserTout([session('S1'), series('S1'), pari('p1', 'S1'), session('S2'), series('S2')]);
    const r = vidanger(file, (op) => (op.table === A.SESSIONS && op.id === 'S1' ? COLONNE : null));
    expect(r.envoyes).toEqual(['sessions:S1', 'sessions:S2', 'sets:S2']);
    expect(cles(r.file)).toEqual(['sessions:S1', 'sets:S1', 'predictions:p1']);
  });

  test('le réseau, lui, arrête toujours la vidange (on réessaiera)', () => {
    const file = poserTout([objectif('squat'), session('S1')]);
    const r = vidanger(file, (op) => (op.table === A.OBJECTIFS ? { code: '', message: 'Failed to fetch' } : null));
    expect(r.envoyes).toEqual(['objectifs:squat']);
    expect(cles(r.file)).toEqual(['objectifs:squat', 'sessions:S1']);
  });

  test('à l’ouverture, ces refus-là sont retentés (la migration a pu être lancée) ; les autres restent', () => {
    let f = poserTout([objectif('squat'), session('S1'), session('S2')]);
    f = A.marquerEchec(f, 'objectifs:squat', TABLE);
    f = A.marquerEchec(f, 'sessions:S1', COLONNE);
    f = A.marquerEchec(f, 'sessions:S2', { code: '42501', message: 'row-level security' });
    const r = A.reparerSchema(f);
    expect(r.entrees).toBe(2);
    const parCle = {};
    r.file.forEach((e) => { parCle[e.cle] = e; });
    expect(parCle['objectifs:squat'].bloquee).toBeNull();
    expect(parCle['sessions:S1'].bloquee).toBeNull();
    expect(parCle['sessions:S2'].bloquee).not.toBeNull();
    // La version monte : une requête partie avec l'ancienne ne retire pas l'entrée rouverte.
    expect(parCle['sessions:S1'].version).toBe(2);
  });
});

describe('`executer` : une table inconnue n’est pas un succès (06 #17)', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
  const corps = (() => {
    const i = source.indexOf('  function executer(op) {');
    const j = source.indexOf('\n  }\n', i);
    return source.slice(i, j);
  })();

  test('⚠️ DISCRIMINANT — la dernière ligne d’`executer` rejette avec `TH001`, elle ne résout plus', () => {
    const derniere = corps.trim().split('\n').filter((l) => /\breturn\b/.test(l)).pop();
    expect(derniere).toMatch(/Promise\.reject\(\{\s*code:\s*'TH001'/);
    expect(corps).not.toMatch(/return Promise\.resolve\(\);\s*$/);
  });

  test('l’entrée refusée en `TH001` reste dans la file, marquée, et se voit', () => {
    const file = poserTout([{ table: 'table_de_demain', op: A.UPSERT, id: 'x', donnees: {} }, session('S1')]);
    const r = vidanger(file, (op) => (op.table === 'table_de_demain' ? { code: 'TH001', message: 'inconnue' } : null));
    expect(cles(r.file)).toEqual(['table_de_demain:x']);
    expect(A.resume(r.file).bloquees).toBe(1);
  });
});
