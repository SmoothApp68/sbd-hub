/** @jest-environment node */
//
// « Une séance `en_cours` n'est pas une séance » (chantier 23).
//
// ══ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) ═════════════════════
//
// **UNE SÉANCE `en_cours` DANS LA SEMAINE AFFICHÉE, AVEC DES SÉRIES DÉJÀ
// VALIDÉES.**
//
// Sans séance en cours, ou avec une séance en cours vide, « filtre » et « ne
// filtre pas » rendent exactement le même écran : même liste, mêmes totaux,
// même relevé par muscle. C'est précisément pourquoi le défaut a traversé le
// chantier 22 avec des tests verts — et pourquoi il a fallu un device pour le
// voir.
//
// Chaque test de cette famille pose donc le corpus DEUX fois : avec la séance
// en cours et sans elle. L'assertion n'est pas « le total vaut 4 », c'est « le
// total est le MÊME » — une mutation qui retire le filtre déplace l'un sans
// l'autre, et tombe.
process.env.TZ = 'Europe/Paris';

const Sync = require('../../v2/js/sync.js');
const Semaine = require('../../v2/js/semaine.js');
const Periode = require('../../v2/js/periode.js');
const Calendrier = require('../../v2/js/calendrier.js');
const Seance = require('../../v2/js/seance.js');

// ── Le corpus ──────────────────────────────────────────────────────────────
//
// Semaine du lundi 7 au dimanche 13 septembre 2026. La séance en cours est le
// MERCREDI 9 — dans la semaine affichée, pas à côté.

const CATALOGUE = [
  { slug: 'dc', nom: 'Développé couché', muscles_primaires: ['pectoraux'],
    muscles_secondaires: ['triceps'] },
  { slug: 'squat', nom: 'Squat', muscles_primaires: ['quadriceps'],
    muscles_secondaires: ['fessiers'] }
];

const LUNDI = new Date(2026, 8, 7);

const TERMINEES = [
  { id: 'A', titre: 'Haut du corps', debut: '2026-09-07T18:00:00Z', statut: 'terminee' },
  { id: 'B', titre: 'Bas du corps', debut: '2026-09-11T18:00:00Z', statut: 'terminee' }
];

// Mercredi 9, en cours, AVEC DES SÉRIES VALIDÉES — c'est là que tout se joue.
const EN_COURS = { id: 'C', titre: 'Séance en cours', debut: '2026-09-09T18:00:00Z',
                   statut: 'en_cours' };

const serie = (id, session, slug) => ({
  id, session_id: session, exercise_slug: slug, type_serie: 'travail',
  charge_kg: 100, reps: 5, validee_a: '2026-09-09T18:05:00Z'
});

const SERIES = [
  serie('a1', 'A', 'dc'), serie('a2', 'A', 'dc'),
  serie('b1', 'B', 'squat'),
  // Trois séries validées sur la séance en cours : sans elles, les totaux ne
  // bougeraient pas de toute façon et le test ne prouverait rien.
  serie('c1', 'C', 'dc'), serie('c2', 'C', 'dc'), serie('c3', 'C', 'squat')
];

const AVEC = TERMINEES.concat([EN_COURS]);
const SANS = TERMINEES.slice();

// ── 1. La séance en cours sort du corpus de lecture ────────────────────────
describe('1 — une séance en cours est absente de toutes les lectures', () => {
  test('elle ne survit pas au rangement', () => {
    expect(Sync.ranger(AVEC).map((s) => s.id)).toEqual(['B', 'A']);
  });

  test('liste de la semaine — elle n’apparaît à aucun jour', () => {
    const jours = Semaine.repartirParJour(Sync.ranger(AVEC), LUNDI);
    const ids = jours.reduce((acc, j) => acc.concat(j.seances.map((s) => s.id)), []);
    expect(ids).not.toContain('C');
    expect(ids.sort()).toEqual(['A', 'B']);
  });

  test('carte de séance — son résumé de séries n’est pas construit', () => {
    // `bilanSemaine` ne compte que les séries dont la séance est dans la liste :
    // la séance absente, ses séries ne sont rattachées à rien.
    const b = Semaine.bilanSemaine(Sync.ranger(AVEC), SERIES);
    expect(b.nbSeances).toBe(2);
    expect(b.nbSeriesTravail).toBe(3);
  });

  // ⚠️ `apportsParMuscle` filtre sur les SÉRIES qu'on lui donne, pas sur les
  // séances : la liste de séances ne lui sert qu'à dater. On reproduit donc
  // ici la dérivation réelle de l'app (`semaineCourante`, app.js) — les séries
  // de la semaine sont CELLES DES SÉANCES retenues. C'est ce qui fait du filtre
  // sur `local.seances` un goulot et pas une demi-mesure.
  test('relevé par muscle — ses séries n’y entrent pas', () => {
    const rangees = Sync.ranger(AVEC);
    const ids = new Set(rangees.map((s) => s.id));
    const series = SERIES.filter((s) => ids.has(s.session_id));
    expect(series.map((s) => s.id)).toEqual(['a1', 'a2', 'b1']);

    const apports = Semaine.apportsParMuscle('pectoraux', series, CATALOGUE, rangees);
    // Deux séries de développé couché, celles de la séance A. Celles de la
    // séance en cours (c1, c2) auraient porté le total à quatre.
    expect(apports.length).toBe(1);
    expect(apports[0].seriesReelles).toBe(2);
  });

  test('calendrier — le mercredi 9 ne porte aucun point', () => {
    const point = (corpus) => {
      const g = Calendrier.grilleMois(2026, 8, Sync.ranger(corpus));
      const cases = g.lignes.reduce((acc, l) => acc.concat(l.jours), []);
      return cases.filter((c) => c.jour === 9 && !c.horsMois)[0].points;
    };
    expect(point(AVEC)).toBe(0);
    // Terminée, le même jour porte son point : le test ne passe pas parce que
    // le calendrier serait vide partout.
    const finie = TERMINEES.concat([Object.assign({}, EN_COURS, { statut: 'terminee' })]);
    expect(point(finie)).toBe(1);
  });
});

// ── 2. La même, terminée, revient partout ──────────────────────────────────
describe('2 — la même séance, terminée, est présente partout', () => {
  const FINIE = Object.assign({}, EN_COURS, { statut: 'terminee' });
  const CORPUS = TERMINEES.concat([FINIE]);

  test('elle survit au rangement, et à sa place chronologique', () => {
    expect(Sync.ranger(CORPUS).map((s) => s.id)).toEqual(['B', 'C', 'A']);
  });

  test('elle est dans la semaine, dans les totaux et dans le relevé', () => {
    const rangees = Sync.ranger(CORPUS);
    const jours = Semaine.repartirParJour(rangees, LUNDI);
    const ids = jours.reduce((acc, j) => acc.concat(j.seances.map((s) => s.id)), []);
    expect(ids).toContain('C');

    const b = Semaine.bilanSemaine(rangees, SERIES);
    expect(b.nbSeances).toBe(3);
    expect(b.nbSeriesTravail).toBe(6);

    const apports = Semaine.apportsParMuscle('pectoraux', SERIES, CATALOGUE, rangees);
    expect(apports.length).toBeGreaterThan(0);
  });

  // Une séance sans `statut` vient de l'import : les 1 221 séances importées
  // portent toutes 'terminee', mais un cache d'avant la colonne pourrait ne
  // rien porter. La traiter comme en cours effacerait tout l'historique.
  test('une séance sans statut est terminée par défaut, pas jetée', () => {
    const importee = { id: 'Z', debut: '2024-01-01T10:00:00Z' };
    expect(Sync.ranger([importee]).map((s) => s.id)).toEqual(['Z']);
  });
});

// ── 3. La reprise de séance est la seule lecture qui veut l'inverse ────────
describe('3 — la reprise lit `en_cours`, et elle seule', () => {
  let requetes;

  function clientFactice(reponse) {
    return {
      from(table) {
        const q = { table, filtres: [], colonnes: null, tete: false };
        requetes.push(q);
        const chainable = {
          select(colonnes, options) {
            q.colonnes = colonnes;
            if (options && options.head) q.tete = true;
            return chainable;
          },
          eq(colonne, valeur) { q.filtres.push([colonne, valeur]); return chainable; },
          update(champs) { q.op = 'update'; q.champs = champs; return chainable; },
          gt() { return chainable; },
          order() { return chainable; },
          limit() { return chainable; },
          then(res, rej) { return Promise.resolve(reponse).then(res, rej); }
        };
        return chainable;
      }
    };
  }

  beforeEach(() => { requetes = []; });
  afterEach(() => { delete globalThis.THClient; });

  function charger(reponse) {
    globalThis.THClient = { obtenir: () => clientFactice(reponse) };
    delete require.cache[require.resolve('../../v2/js/donnees.js')];
    return require('../../v2/js/donnees.js');
  }

  test('`seancesEnCours` demande bien `en_cours` au serveur', async () => {
    const Donnees = charger({ data: [EN_COURS], error: null });
    const r = await Donnees.seancesEnCours();
    expect(r.map((s) => s.id)).toEqual(['C']);
    expect(requetes[0].filtres).toEqual([['statut', 'en_cours']]);
  });

  // ── `refermerSeance` (chantier 36, D7) ──────────────────────────────────
  //
  // ⚠️ UN UPDATE CIBLÉ, JAMAIS UN UPSERT DE LA LIGNE ENTIÈRE. `sessions` porte
  // `salle_norme`, qui est GÉNÉRÉE : Postgres refuse toute écriture dessus, même
  // NULL. Réécrire la ligne entière échouerait donc — et échouerait en `428C9`,
  // c'est-à-dire sur le chemin même qu'on répare.
  test('`refermerSeance` n’écrit QUE `statut`, sur la seule séance visée', async () => {
    const Donnees = charger({ data: null, error: null });
    await Donnees.refermerSeance('C');
    const q = requetes[0];
    expect(q.table).toBe('sessions');
    expect(q.op).toBe('update');
    expect(Object.keys(q.champs)).toEqual(['statut']);
    expect(q.champs.statut).toBe('terminee');
    expect(q.filtres).toEqual([['id', 'C']]);
  });

  // ⚠️ `fin` N'EST PAS RENSEIGNÉE, et c'est délibéré : on sait que la séance est
  // terminée, on ne sait pas QUAND. Inventer une fin écrirait un fait faux dans
  // la colonne qui dit précisément combien de temps elle a duré.
  test('et elle n’invente pas de `fin`', async () => {
    const Donnees = charger({ data: null, error: null });
    await Donnees.refermerSeance('C');
    expect('fin' in requetes[0].champs).toBe(false);
  });

  test('une erreur du serveur remonte — la réparation ne se croit pas faite', async () => {
    const Donnees = charger({ data: null, error: { code: '42501', message: 'rls' } });
    await expect(Donnees.refermerSeance('C')).rejects.toBeTruthy();
  });

  // ⚠️ ET LE TRANSPORT, LUI, NE FILTRE PAS — c'est le piège de ce chantier.
  //
  // `toutesLesSeances` ne sert pas qu'à l'affichage : c'est elle qui dit quelles
  // séances EXISTENT, et `purgerSeriesOrphelines` s'en sert pour effacer les
  // séries d'une séance supprimée. Filtrée sur `terminee`, elle répond à une
  // autre question, et les séries de la séance en cours — montées, comptées par
  // `compterSeries` — sont purgées du cache : le curseur n'avance plus,
  // « N séries manquantes » s'affiche, et 15 Mo redescendent à chaque
  // synchronisation, pendant toute la séance.
  test('`toutesLesSeances` ne filtre PAS : elle dit ce qui existe', async () => {
    const Donnees = charger({ data: [], error: null });
    await Donnees.toutesLesSeances();
    expect(requetes[0].filtres.map((f) => f[0])).not.toContain('statut');
  });

  test('le compte de contrôle porte sur le MÊME ensemble que la liste', async () => {
    const Donnees = charger({ count: 3, error: null });
    const n = await Donnees.compterSeances();
    expect(n).toBe(3);
    expect(requetes[0].tete).toBe(true);
    expect(requetes[0].filtres).toEqual([]);
  });
});

// ── Le goulot : purger AVANT de ranger ─────────────────────────────────────
//
// L'ordre des deux opérations est la seule chose qui sépare « la séance en
// cours est invisible » de « la séance en cours casse la synchronisation ».
describe('le goulot — la purge voit ce qui existe, le rangement ce qui est fini', () => {
  const CORPUS = TERMINEES.concat([EN_COURS]);

  test('purger d’abord garde les séries de la séance en cours', () => {
    const gardees = Sync.purgerSeriesOrphelines(SERIES, CORPUS, true);
    expect(gardees.map((s) => s.id)).toEqual(['a1', 'a2', 'b1', 'c1', 'c2', 'c3']);
    // Puis le rangement fait sortir la séance de la lecture — sans toucher aux
    // séries, qui restent comptées comme le serveur les compte.
    expect(Sync.ranger(CORPUS).map((s) => s.id)).toEqual(['B', 'A']);
  });

  // La mutation à attraper : inverser les deux lignes de `synchroniser`.
  test('ranger d’abord effacerait les séries montées de la séance en cours', () => {
    const perdues = Sync.purgerSeriesOrphelines(SERIES, Sync.ranger(CORPUS), true);
    expect(perdues.map((s) => s.id)).toEqual(['a1', 'a2', 'b1']);
    // Trois séries de moins en local que côté serveur : c'est exactement
    // l'écart que `decisionDeCommit` refuse.
    expect(Sync.decisionDeCommit(perdues.length, SERIES.length).autorise).toBe(false);
    expect(Sync.decisionDeCommit(perdues.length, SERIES.length).manquantes).toBe(3);
    // Alors que dans le bon ordre, il autorise.
    const gardees = Sync.purgerSeriesOrphelines(SERIES, CORPUS, true);
    expect(Sync.decisionDeCommit(gardees.length, SERIES.length).autorise).toBe(true);
  });

  // L'AUTRE façon dont le filtre au serveur casse, plus sournoise : la liste
  // filtrée est plus courte que le compte, `verifierCompletude` la déclare
  // incomplète, et `purgerSeriesOrphelines` — qui ne purge que sur preuve de
  // complétude — s'ÉTEINT. Les séries d'une séance réellement supprimée
  // resteraient alors en cache pour toujours, sans que rien ne le signale.
  test('filtrer la liste au serveur éteindrait la purge au lieu de la fausser', () => {
    const filtree = TERMINEES.length;          // ce que rendrait `.eq('statut','terminee')`
    const compte = CORPUS.length;              // ce que compte `compterSeances`, non filtré
    expect(Sync.verifierCompletude(filtree, compte).complet).toBe(false);
    const gardees = Sync.purgerSeriesOrphelines(SERIES, TERMINEES, false);
    expect(gardees.map((s) => s.id)).toEqual(SERIES.map((s) => s.id));
  });

  // Une séance vraiment supprimée côté serveur, elle, doit toujours emporter
  // ses séries : la purge n'a pas été neutralisée au passage.
  test('une séance supprimée emporte toujours ses séries', () => {
    const sansB = CORPUS.filter((s) => s.id !== 'B');
    const gardees = Sync.purgerSeriesOrphelines(SERIES, sansB, true);
    expect(gardees.map((s) => s.id)).toEqual(['a1', 'a2', 'c1', 'c2', 'c3']);
  });
});

// ── 4 et 5. Les totaux ne bougent pas pendant qu'on s'entraîne ────────────
//
// C'est le cœur du chantier, et le seul angle qui prouve la correction : on
// compare l'écran AVEC une séance en cours ouverte et SANS elle. Les deux
// doivent être indiscernables.
describe('4 et 5 — ouvrir une séance ne change rien aux chiffres affichés', () => {
  test('totaux hebdomadaires identiques avec et sans séance en cours', () => {
    const avec = Semaine.bilanSemaine(Sync.ranger(AVEC), SERIES);
    const sans = Semaine.bilanSemaine(Sync.ranger(SANS), SERIES);
    expect(avec).toEqual(sans);
  });

  test('volume par muscle identique avec et sans séance en cours', () => {
    const volume = (corpus) => {
      const rangees = Sync.ranger(corpus);
      const ids = new Set(rangees.map((s) => s.id));
      const series = SERIES.filter((s) => ids.has(s.session_id));
      return Semaine.volumeParMuscle(series, CATALOGUE);
    };
    expect(volume(AVEC)).toEqual(volume(SANS));
  });

  test('relevé par muscle identique avec et sans séance en cours', () => {
    const releve = (corpus) => {
      const rangees = Sync.ranger(corpus);
      const ids = new Set(rangees.map((s) => s.id));
      const series = SERIES.filter((s) => ids.has(s.session_id));
      return Semaine.apportsParMuscle('pectoraux', series, CATALOGUE, rangees);
    };
    expect(releve(AVEC)).toEqual(releve(SANS));
  });

  test('radar de période identique avec et sans séance en cours', () => {
    const f = Periode.fenetres(30, new Date(2026, 8, 13));
    const coupe = (corpus) => {
      const c = Periode.decouper(Sync.ranger(corpus), SERIES, f.courante);
      return { seances: c.seances.map((s) => s.id), series: c.series.map((s) => s.id) };
    };
    expect(coupe(AVEC)).toEqual(coupe(SANS));
  });

  // La preuve d'ASYMÉTRIE : sans le filtre, ces mêmes comparaisons diffèrent.
  // Si elles ne différaient pas, les tests ci-dessus passeraient aussi sur du
  // code qui ne filtre rien — et ne vaudraient rien.
  test('sans filtre, la configuration discriminante SÉPARE bien les deux', () => {
    const brut = (corpus) => Semaine.bilanSemaine(corpus, SERIES);
    expect(brut(AVEC)).not.toEqual(brut(SANS));
    expect(brut(AVEC).nbSeriesTravail).toBe(6);
    expect(brut(SANS).nbSeriesTravail).toBe(3);
  });
});

// ── 7. Le chronomètre sonne UNE fois ───────────────────────────────────────
describe('7 — l’échéance sonne une seule fois, et rien au dépassement', () => {
  test('elle ne sonne pas avant la cible', () => {
    expect(Seance.echeanceAtteinte(90, 89, false)).toBe(false);
  });

  test('elle sonne à la cible', () => {
    expect(Seance.echeanceAtteinte(90, 90, false)).toBe(true);
  });

  test('elle ne re-sonne JAMAIS au dépassement', () => {
    // La simulation d'un minuteur qui bat chaque seconde, de 85 à 200.
    let sonne = false, coups = 0;
    for (let s = 85; s <= 200; s++) {
      if (Seance.echeanceAtteinte(90, s, sonne)) { sonne = true; coups++; }
    }
    expect(coups).toBe(1);
  });

  test('une cible absente ou nulle ne sonne jamais — zéro veut dire « pas de cible »', () => {
    expect(Seance.echeanceAtteinte(0, 500, false)).toBe(false);
    expect(Seance.echeanceAtteinte(null, 500, false)).toBe(false);
    expect(Seance.echeanceAtteinte(undefined, 500, false)).toBe(false);
  });

  // Repousser la cible à la main REARME l'échéance : c'est une échéance
  // nouvelle, pas une répétition de la précédente.
  test('repousser la cible au-delà du temps écoulé permet un second coup', () => {
    let cible = 90, sonne = false, coups = 0;
    const battre = (s) => { if (Seance.echeanceAtteinte(cible, s, sonne)) { sonne = true; coups++; } };
    battre(90);                                        // premier coup
    battre(95);                                        // rien
    cible = Seance.ajusterCible(cible, Seance.PAS_REPOS);   // +15 → 105 > 95
    sonne = false;
    battre(100);                                       // rien : pas encore 105
    expect(coups).toBe(1);
    battre(105);
    expect(coups).toBe(2);
  });
});

// ── 8. −15 / +15 respectent les bornes ─────────────────────────────────────
describe('8 — le réglage de la cible ne sort jamais des bornes', () => {
  test('le pas vaut 15 secondes', () => {
    expect(Seance.PAS_REPOS).toBe(15);
    expect(Seance.ajusterCible(90, 15)).toBe(105);
    expect(Seance.ajusterCible(90, -15)).toBe(75);
  });

  // ⚠️ TEST INVERSÉ AU CHANTIER 47, et l'ancienne attente était le défaut.
  //
  // Elle exigeait `c === 0` — c'est-à-dire précisément l'état que le §7
  // novodecies interdit : une cible ni armée ni désactivée, sur laquelle
  // `reposFige` rend faux pour toute seconde, donc un chronomètre qui compte
  // sans jamais se figer. Le test verrouillait le bug.
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE : la BOUCLE, pas un seul appui. Depuis 20 s,
  // le premier −15 donne 5 et ne prouve rien ; c'est le SECOND qui franchit la
  // borne. Un test à un seul appui passe avec le défaut en place.
  test('sous la borne, le −15 REFUSE de descendre — il ne désactive pas', () => {
    let c = 20;
    for (let i = 0; i < 10; i++) c = Seance.ajusterCible(c, -15);
    expect(c).toBe(5);                                  // 20 → 5, puis refusé
    expect(Seance.cibleArmable(c)).not.toBe(null);      // et toujours armable
    // Le cas d'un seul appui qui franchit : 15 − 15 = 0, refusé net.
    expect(Seance.ajusterCible(15, -15)).toBe(15);
    expect(Seance.ajusterCible(5, -15)).toBe(5);
  });

  // Désactiver reste un geste EXPLICITE (§7 sexdecies.3) : c'est la molette qui
  // écrit `null`, jamais un pas de réglage. Une cible déjà absente le reste.
  test('un ajustement ne désactive jamais un repos', () => {
    expect(Seance.ajusterCible(0, -15)).toBe(0);
    expect(Seance.ajusterCible(null, -15)).toBe(0);
    [20, 15, 5, 60, 1800].forEach((c) => {
      expect(Seance.cibleArmable(Seance.ajusterCible(c, -15))).not.toBe(null);
    });
  });

  test('jamais au-delà de la borne haute de `sets_repos_borne`', () => {
    expect(Seance.ajusterCible(Seance.REPOS_MAX, 15)).toBe(Seance.REPOS_MAX);
    expect(Seance.ajusterCible(3599, 15)).toBe(3600);
  });

  // Une routine sans repos prescrit laisse `repos_cible_s` à NULL : +15 doit
  // poser une cible plutôt que produire NaN.
  test('une cible absente se règle quand même — +15 la pose à 15', () => {
    expect(Seance.ajusterCible(null, 15)).toBe(15);
    expect(Seance.ajusterCible(undefined, 15)).toBe(15);
    expect(Seance.ajusterCible(null, -15)).toBe(0);
  });
});
