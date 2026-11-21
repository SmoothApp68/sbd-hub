/** @jest-environment node */
//
// 21/11/2026 (MOTEUR §9.22, I267) — UN PROGRAMME ARRÊTÉ PENDANT SA SEMAINE DE DÉCHARGE. Avant : `periodesDecharge` ignorait un bloc `arrete`,
// et les séances de décharge déjà faites redevenaient normales (compteur, référence de consigne, stagnation, `periodesAllegees`). Après : la
// décharge d'un bloc arrêté a valu jusqu'à l'arrêt — de son début au jour de l'arrêt (`Moteur.arretDuBloc` : `blocs.arrete_a`, à défaut
// `modifie_a`), sans dépasser le 7ᵉ jour ; rien si l'arrêt précède la décharge ou si elle a sauté. `modifie_a` reste l'horloge de fusion :
// un renommage du dossier après l'arrêt ne déplace ni la période ni les lignes de zone inertes (CONTRA-MARQUES §2).

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/periode.js');
const M = require('../../v2/js/moteur.js');
const Routines = require('../../v2/js/routines.js');

// Le bloc : début lundi 5 oct., 4 semaines, décharge du lundi 26 oct. au dimanche 1er nov.
const BLOC = { id: 'b1', user_id: 'u', dossier: 'Force', zone: 'mix', debut: '2026-10-05', semaines: 4, decharge: true,
  exercices: ['squat', 'couche'], statut: 'en_cours', precedent: null, modifie_a: '2026-10-05T08:00:00.000Z' };
const arrete = (quand, plus) => Object.assign({}, BLOC, { statut: 'arrete', modifie_a: quand, arrete_a: quand }, plus || {});

describe('I267 — `Moteur.arretDuBloc` : `arrete_a`, à défaut `modifie_a`', () => {
  test('un bloc arrêté : `arrete_a` ; sans la colonne (base d’avant la migration) : `modifie_a` ; pas arrêté : rien', () => {
    expect(M.arretDuBloc(arrete('2026-10-29T18:00:00.000Z'))).toBe(Date.parse('2026-10-29T18:00:00.000Z'));
    const sansColonne = Object.assign({}, BLOC, { statut: 'arrete', modifie_a: '2026-10-29T18:00:00.000Z' });
    expect(M.arretDuBloc(sansColonne)).toBe(Date.parse('2026-10-29T18:00:00.000Z'));
    expect(M.arretDuBloc(BLOC)).toBeNull();
    expect(M.arretDuBloc(Object.assign({}, BLOC, { statut: 'termine', arrete_a: '2026-10-29T18:00:00.000Z' }))).toBeNull();
    expect(M.arretDuBloc(null)).toBeNull();
  });
  test('DISCRIMINANT — la colonne existe : l’horloge de fusion poussée par un renommage n’est JAMAIS lue', () => {
    const renomme = arrete('2026-10-29T18:00:00.000Z', { modifie_a: '2026-11-20T10:00:00.000Z' });
    expect(M.arretDuBloc(renomme)).toBe(Date.parse('2026-10-29T18:00:00.000Z'));
  });
});

describe('I267 — la période de décharge d’un bloc arrêté', () => {
  test('DISCRIMINANT — arrêté le jeudi de la décharge : la période va du lundi au jeudi', () => {
    expect(M.periodesDecharge([arrete('2026-10-29T18:00:00.000Z')], [])).toEqual([{ debut: '2026-10-26', fin: '2026-10-29' }]);
  });
  test('arrêté le premier jour de la décharge : ce jour seul ; le dernier jour : la semaine entière', () => {
    expect(M.periodesDecharge([arrete('2026-10-26T07:00:00.000Z')], [])).toEqual([{ debut: '2026-10-26', fin: '2026-10-26' }]);
    expect(M.periodesDecharge([arrete('2026-11-01T20:00:00.000Z')], [])).toEqual([{ debut: '2026-10-26', fin: '2026-11-01' }]);
  });
  test('arrêté APRÈS la fin de la décharge (une donnée d’avant : le geste aurait terminé le bloc) : bornée au 7ᵉ jour', () => {
    expect(M.periodesDecharge([arrete('2026-11-04T20:00:00.000Z')], [])).toEqual([{ debut: '2026-10-26', fin: '2026-11-01' }]);
  });
  test('arrêté AVANT la décharge : aucune période', () => {
    expect(M.periodesDecharge([arrete('2026-10-25T20:00:00.000Z')], [])).toEqual([]);
    expect(M.periodesDecharge([arrete('2026-10-08T20:00:00.000Z')], [])).toEqual([]);
  });
  test('une décharge qui a sauté (une semaine allégée trop proche) ou qui n’est pas prévue : aucune période', () => {
    expect(M.periodesDecharge([arrete('2026-10-29T18:00:00.000Z')], ['2026-10-20'])).toEqual([]);
    expect(M.periodesDecharge([arrete('2026-10-29T18:00:00.000Z', { decharge: false })], [])).toEqual([]);
  });
  test('sans date d’arrêt connue : aucune période (v2-cycles : `[arrete]` sans `modifie_a` → `[]`)', () => {
    expect(M.periodesDecharge([Object.assign({}, BLOC, { statut: 'arrete', modifie_a: undefined })], [])).toEqual([]);
  });
  test('en cours et terminé : inchangés (la semaine entière)', () => {
    expect(M.periodesDecharge([BLOC], [])).toEqual([{ debut: '2026-10-26', fin: '2026-11-01' }]);
    expect(M.periodesDecharge([Object.assign({}, BLOC, { statut: 'termine' })], [])).toEqual([{ debut: '2026-10-26', fin: '2026-11-01' }]);
  });
});

describe('I267 — la séance de décharge faite avant l’arrêt reste hors de la référence de consigne', () => {
  const jour = (m, d) => new Date(Date.UTC(2026, m - 1, d, 17)).toISOString();
  const groupe = (id, debut, reps) => ({
    seance: { id: id, debut: debut },
    series: reps.map((r, j) => ({ id: id + '-' + j, charge_kg: 80, reps: r, rpe: null, ressenti: null, type_serie: 'travail', validee_a: debut }))
  });
  const NORMALES = [groupe('A', jour(10, 5), [8, 8, 8, 8]), groupe('B', jour(10, 12), [8, 8, 8, 8]), groupe('C', jour(10, 19), [8, 8, 8, 8])];
  const DECHARGE = groupe('D', jour(10, 26), [6, 6]);           // le lundi de la décharge, faite AVANT l'arrêt du jeudi
  const BASE = { mesure: 'charge_reps', reglage: 'normal', equipement: 'barre', intention: 'progresser' };
  const consigne = (groupes, periodes) => M.consigneDExercice(groupes, null, jour(11, 2), Object.assign({}, BASE, periodes ? { periodesAllegees: periodes } : {})).consigne;

  test('DISCRIMINANT — arrêté le jeudi : la séance allégée du lundi ne devient pas la référence (80 × 8 sur 4 séries, comme sans elle)', () => {
    const periodes = M.periodesDecharge([arrete('2026-10-29T18:00:00.000Z')], []);
    const avec = consigne(NORMALES.concat([DECHARGE]), periodes);
    expect(avec).toEqual(consigne(NORMALES));
    expect(avec.n).toBe(4);
    // témoin : sans la période (le défaut d'avant), la décharge servait de référence
    expect(consigne(NORMALES.concat([DECHARGE]), []).n).toBe(2);
  });
});

describe('I267 — renommer le dossier après l’arrêt ne déplace ni la décharge ni les lignes inertes', () => {
  const minuit = (j) => { const [y, m, d] = j.split('-').map(Number); return new Date(y, m - 1, d).toISOString(); };
  const LIGNES = [
    { id: 'l1', exercise_slug: 'squat', zone: 'mix', corrigee_a: minuit('2026-10-05'), origine: 'bloc', bloc_id: 'b1' },
    { id: 'l2', exercise_slug: 'couche', zone: 'mix', corrigee_a: minuit('2026-10-05'), origine: 'bloc', bloc_id: 'b1' }];

  test('DISCRIMINANT — arrêté pendant la décharge, puis renommé trois semaines plus tard : la même période', () => {
    const b = arrete('2026-10-29T18:00:00.000Z');
    const plan = Routines.planRenommageDossier([], [b], 'Force', 'Force 2', '2026-11-20T10:00:00.000Z');
    expect(plan.ok).toBe(true);
    const renomme = plan.blocs[0];
    expect(renomme.modifie_a).toBe('2026-11-20T10:00:00.000Z');       // l'horloge de fusion avance (la copie renommée gagne la fusion)
    expect(renomme.arrete_a).toBe('2026-10-29T18:00:00.000Z');        // la date d'arrêt, non
    expect(M.periodesDecharge([renomme], [])).toEqual(M.periodesDecharge([b], []));
    expect(M.periodesDecharge([renomme], [])).toEqual([{ debut: '2026-10-26', fin: '2026-10-29' }]);
  });

  test('DISCRIMINANT — arrêté AVANT son début, puis renommé APRÈS : ses lignes de zone restent inertes (le défaut que `modifie_a` laissait passer)', () => {
    const avant = Object.assign({}, BLOC, { statut: 'arrete', modifie_a: '2026-10-01T18:00:00.000Z', arrete_a: '2026-10-01T18:00:00.000Z' });
    expect(M.lignesDeZoneValides(LIGNES, [avant])).toEqual([]);
    const plan = Routines.planRenommageDossier([], [avant], 'Force', 'Force 2', '2026-10-20T10:00:00.000Z');
    const renomme = plan.blocs[0];
    expect(M.lignesDeZoneValides(LIGNES, [renomme])).toEqual([]);
    // témoin : la même donnée sans la colonne (base d'avant la migration) relit `modifie_a` — le défaut connu, que la colonne ferme
    const sansColonne = Object.assign({}, renomme); delete sansColonne.arrete_a;
    expect(M.lignesDeZoneValides(LIGNES, [sansColonne]).map((l) => l.id)).toEqual(['l1', 'l2']);
  });
});

describe('I267 — `terminerBloc` date l’arrêt une fois, au geste', () => {
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
  const extraire = (nom) => {
    const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
    if (!m) throw new Error('introuvable : ' + nom);
    return m[0];
  };
  function bac(o) {
    const releve = { blocs: [] };
    const ctx = {
      Moteur: M, Date, Object,
      local: { blocs: (o.blocs || []).slice(), zones: [] },
      instantDuJour: () => o.instant,
      poserBloc: async (b) => { releve.blocs.push(b); ctx.local.blocs = ctx.local.blocs.filter((x) => x.id !== b.id).concat([b]); },
      observerPariDeProgramme: async () => {}
    };
    vm.createContext(ctx);
    vm.runInContext(extraire('terminerBloc'), ctx);
    return { ctx, releve, run: (code) => vm.runInContext(code, ctx) };
  }
  test('arrêté : `arrete_a` = `modifie_a` = l’instant du geste ; terminé : aucune date d’arrêt', async () => {
    const b = bac({ blocs: [BLOC], instant: '2026-10-29T18:00:00.000Z' });
    await b.run('terminerBloc(local.blocs[0], "arrete", false)');
    expect(b.releve.blocs[0]).toMatchObject({ statut: 'arrete', arrete_a: '2026-10-29T18:00:00.000Z', modifie_a: '2026-10-29T18:00:00.000Z' });
    const c = bac({ blocs: [BLOC], instant: '2026-11-03T18:00:00.000Z' });
    await c.run('terminerBloc(local.blocs[0], "termine", true)');
    expect(c.releve.blocs[0].statut).toBe('termine');
    expect('arrete_a' in c.releve.blocs[0]).toBe(false);
  });
});

// ── La colonne `blocs.arrete_a` absente en base : la lecture et l'écriture des blocs repartent sans elle (donnees.js) ──
describe('I267 — `blocs.arrete_a` absente en base : l’app fonctionne avant la migration', () => {
  function fauxBlocs(avecColonne) {
    const etat = { lectures: [], ecritures: [] };
    const client = { from() {
      const q = {};
      const c = {
        select(cols) { q.cols = cols; return c; },
        eq() { return c; }, gt() { return c; }, order() { return c; }, limit() { return c; }, single() { return c; },
        upsert(l) { q.up = l; return c; },
        then(res, rej) {
          let r;
          if (q.up) {
            etat.ecritures.push(q.up);
            r = !avecColonne && ('arrete_a' in q.up || String(q.cols).indexOf('arrete_a') >= 0)
              ? { data: null, error: { code: 'PGRST204', message: "Could not find the 'arrete_a' column of 'blocs' in the schema cache" } } : { data: q.up, error: null };
          } else {
            etat.lectures.push(q.cols);
            r = !avecColonne && String(q.cols).indexOf('arrete_a') >= 0
              ? { data: null, error: { code: '42703', message: 'column blocs.arrete_a does not exist' } } : { data: [], error: null };
          }
          return Promise.resolve(r).then(res, rej);
        }
      };
      return c;
    } };
    return { etat, client };
  }
  function donnees(f) {
    global.self = global;
    global.THClient = { obtenir: () => f.client };
    let D;
    jest.isolateModules(() => { D = require('../../v2/js/donnees.js'); });
    return D;
  }
  test('DISCRIMINANT — la lecture rejoue sans elle, une fois', async () => {
    const f = fauxBlocs(false);
    const D = donnees(f);
    await expect(D.mesBlocs()).resolves.toEqual([]);
    expect(f.etat.lectures[0]).toContain('arrete_a');
    expect(f.etat.lectures[1]).not.toContain('arrete_a');
  });
  test('DISCRIMINANT — l’écriture d’un bloc arrêté repart sans elle (la file ne reste pas bloquée)', async () => {
    const f = fauxBlocs(false);
    const D = donnees(f);
    const b = arrete('2026-10-29T18:00:00.000Z');
    await expect(D.enregistrerBloc(b)).resolves.toBeTruthy();
    expect(f.etat.ecritures[0]).toHaveProperty('arrete_a');
    expect(f.etat.ecritures[f.etat.ecritures.length - 1]).not.toHaveProperty('arrete_a');
    expect(b.arrete_a).toBe('2026-10-29T18:00:00.000Z');
  });
  test('colonne présente : lue et écrite telle quelle', async () => {
    const f = fauxBlocs(true);
    const D = donnees(f);
    await D.mesBlocs();
    await D.enregistrerBloc(arrete('2026-10-29T18:00:00.000Z'));
    expect(f.etat.lectures[0]).toContain('arrete_a');
    expect(f.etat.ecritures).toHaveLength(1);
    expect(f.etat.ecritures[0].arrete_a).toBe('2026-10-29T18:00:00.000Z');
  });
});
