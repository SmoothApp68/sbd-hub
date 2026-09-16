/** @jest-environment node */
//
// v2/js/seance.js et v2/js/attente.js — la séance en cours (chantier 22).
//
// ══ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) ═════════════════════
//
// **L'APP TUÉE EN PLEINE SÉANCE, SANS RÉSEAU.** Une séance terminée proprement
// avec du réseau ne distingue rien : tout marchait déjà avant ce chantier. Ce
// qui sépare « ça tient » de « on perd la séance », c'est la coupure au milieu.
//
// Le banc applique donc les contraintes RÉELLES, relevées au schéma, et pas une
// version indulgente :
//
//   sets_validee_si_saisie   source <> 'app' OR validee_a IS NOT NULL
//   sets_rang_positif        rang >= 1
//   sets_rang_unique         UNIQUE (session_id, rang) DEFERRABLE INITIALLY DEFERRED
//   sets_type_serie_ok · sets_ressenti_ok · sets_rpe_ok · sets_repos_borne
//   sessions_statut_ok       en_cours | terminee
//
// Sans elles, « écrire n'importe quoi » et « écrire juste » donneraient le même
// résultat, et aucun de ces tests ne prouverait quoi que ce soit.

const Seance = require('../../v2/js/seance.js');
const Attente = require('../../v2/js/attente.js');
const Sync = require('../../v2/js/sync.js');
const { progTravail } = require('./aide-routine-programmee.js');

const USER = 'u-1';
let graine = 0;
const uuid = () => 'id-' + (++graine);

function erreurPG(code, message) {
  const e = new Error(message); e.code = code; e.details = message; return e;
}

// ── La base de papier ──────────────────────────────────────────────────────

function creerBase(options) {
  const o = options || {};
  const base = { sessions: [], sets: [], journal: [], reseau: o.reseau !== false };

  const exigerReseau = () => {
    if (!base.reseau) throw new TypeError('Failed to fetch');
  };

  function verifierSession(l) {
    if (['en_cours', 'terminee'].indexOf(l.statut) < 0) {
      throw erreurPG('23514', 'violates check constraint "sessions_statut_ok"');
    }
    if (!l.user_id) throw erreurPG('23502', 'null value in column "user_id"');
    if (!l.debut) throw erreurPG('23502', 'null value in column "debut"');
  }

  function verifierSet(l) {
    if (l.source === 'app' && !l.validee_a) {
      throw erreurPG('23514', 'violates check constraint "sets_validee_si_saisie"');
    }
    if (!(l.rang >= 1)) {
      throw erreurPG('23514', 'violates check constraint "sets_rang_positif"');
    }
    if (['echauffement', 'travail', 'degressive', 'echec'].indexOf(l.type_serie) < 0) {
      throw erreurPG('23514', 'violates check constraint "sets_type_serie_ok"');
    }
    if (l.ressenti !== null && l.ressenti !== undefined &&
        ['reste_3_plus', 'reste_2', 'reste_1', 'reste_0'].indexOf(l.ressenti) < 0) {
      throw erreurPG('23514', 'violates check constraint "sets_ressenti_ok"');
    }
    if (l.rpe !== null && l.rpe !== undefined && !(l.rpe > 0 && l.rpe <= 10)) {
      throw erreurPG('23514', 'violates check constraint "sets_rpe_ok"');
    }
    if (l.repos_s !== null && l.repos_s !== undefined &&
        !(l.repos_s >= 0 && l.repos_s <= 3600)) {
      throw erreurPG('23514', 'violates check constraint "sets_repos_borne"');
    }
    if (!base.sessions.some((s) => s.id === l.session_id)) {
      throw erreurPG('23503', 'violates foreign key constraint "sets_session_id_fkey"');
    }
  }

  // La contrainte est DIFFÉRÉE : elle n'est vérifiée qu'à la FIN de la
  // transaction. Un lot peut donc permuter des rangs ; des écritures séparées,
  // chacune sa transaction, ne le peuvent pas.
  function verifierRangsDifferee() {
    const vus = new Set();
    for (const l of base.sets) {
      const c = l.session_id + '#' + l.rang;
      if (vus.has(c)) throw erreurPG('23505', 'violates unique constraint "sets_rang_unique"');
      vus.add(c);
    }
  }

  const ecrivain = {
    async enregistrerSeance(ligne) {
      base.journal.push({ op: 'session', id: ligne.id, statut: ligne.statut });
      exigerReseau();
      verifierSession(ligne);
      const i = base.sessions.findIndex((s) => s.id === ligne.id);
      // `upsert` sur l'id : la même ligne envoyée deux fois écrase la même ligne.
      if (i >= 0) base.sessions[i] = Object.assign({}, base.sessions[i], ligne);
      else base.sessions.push(Object.assign({}, ligne));
    },
    async supprimerSeance(id) {
      base.journal.push({ op: 'suppression', id: id });
      exigerReseau();
      base.sessions = base.sessions.filter((s) => s.id !== id);
      base.sets = base.sets.filter((s) => s.session_id !== id);   // ON DELETE CASCADE
    },
    async remplacerSeries(sessionId, lignes) {
      base.journal.push({ op: 'series', id: sessionId, n: lignes.length });
      exigerReseau();
      const avant = base.sets.slice();
      // Une seule transaction : on écrit tout, puis on vérifie la contrainte
      // différée. C'est exactement ce que fait l'upsert en lot.
      lignes.forEach((l) => {
        verifierSet(l);
        const i = base.sets.findIndex((s) => s.id === l.id);
        if (i >= 0) base.sets[i] = Object.assign({}, l);
        else base.sets.push(Object.assign({}, l));
      });
      const gardes = new Set(lignes.map((l) => l.id));
      base.sets = base.sets.filter((s) => s.session_id !== sessionId || gardes.has(s.id));
      try { verifierRangsDifferee(); }
      catch (e) { base.sets = avant; throw e; }
    }
  };

  base.ecrivain = ecrivain;
  base.setsDe = (id) => base.sets.filter((s) => s.session_id === id)
    .sort((a, b) => a.rang - b.rang);
  return base;
}

// ── L'appareil de papier ───────────────────────────────────────────────────
//
// Le disque local, la file, et la boucle de vidange — c'est-à-dire tout ce que
// `app.js` orchestre, en une trentaine de lignes qu'on peut couper n'importe où.

function creerAppareil(base) {
  const disque = { seance: null, attente: [] };   // survit à `tuer()`
  let memoire = null;

  const appareil = {
    disque: disque,
    get seance() { return memoire; },

    // Écrit la séance ENTIÈRE dans une transaction. C'est ce qui garantit
    // qu'une coupure ne laisse jamais un état à moitié écrit.
    sauver() { disque.seance = memoire ? JSON.parse(JSON.stringify(memoire)) : null; },

    poser(op) {
      disque.attente = Attente.poser(disque.attente, op);
    },

    // L'app est tuée : la mémoire part, le disque reste.
    tuer() { memoire = null; },

    // Réouverture : on relit le disque, rien d'autre.
    rouvrir() {
      memoire = disque.seance ? JSON.parse(JSON.stringify(disque.seance)) : null;
      return memoire;
    },

    demarrer(routine) {
      memoire = Seance.creer({ id: uuid(), userId: USER, idSerie: uuid, routine: routine,
                               titre: routine ? routine.nom : null });
      appareil.sauver();
      appareil.poser({ table: Attente.SESSIONS, op: Attente.UPSERT, id: memoire.id,
                       donnees: Seance.ligneSession(memoire), creation: true });
      return memoire;
    },

    geste(fn) {
      memoire = fn(memoire);
      appareil.sauver();
      appareil.poser({ table: Attente.SETS, op: Attente.REMPLACER, id: memoire.id,
                       donnees: Seance.lignes(memoire) });
      return memoire;
    },

    terminer() {
      memoire = Seance.terminer(memoire, new Date());
      appareil.sauver();
      appareil.poser({ table: Attente.SETS, op: Attente.REMPLACER, id: memoire.id,
                       donnees: Seance.lignes(memoire) });
      appareil.poser({ table: Attente.SESSIONS, op: Attente.UPSERT, id: memoire.id,
                       donnees: Seance.ligneSession(memoire) });
      const finie = memoire;
      memoire = null; disque.seance = null;
      return finie;
    },

    abandonner() {
      const id = memoire.id;
      disque.attente = Attente.retirer(disque.attente, Attente.cleDe(Attente.SETS, id));
      memoire = null; disque.seance = null;
      appareil.poser({ table: Attente.SESSIONS, op: Attente.SUPPRIMER, id: id });
    },

    // La vidange. Une entrée ne quitte la file que sur CONFIRMATION du serveur.
    async vidanger() {
      let garde = 50;
      while (garde-- > 0) {
        const op = Attente.prochaine(disque.attente);
        if (!op) break;
        try {
          if (op.table === Attente.SESSIONS && op.op === Attente.SUPPRIMER) {
            await base.ecrivain.supprimerSeance(op.id);
          } else if (op.table === Attente.SESSIONS) {
            await base.ecrivain.enregistrerSeance(op.donnees);
          } else {
            await base.ecrivain.remplacerSeries(op.id, op.donnees || []);
          }
        } catch (e) {
          disque.attente = Attente.marquerEchec(disque.attente, op.cle, e);
          return { ok: false, erreur: e };
        }
        disque.attente = Attente.retirer(disque.attente, op.cle);
      }
      return { ok: true };
    }
  };
  return appareil;
}

const ROUTINE = {
  id: 'r-1', nom: 'Push',
  exercices: [
    { exercise_slug: 'squat', series: progTravail(3, 5), repos_cible_s: 180 },
    { exercise_slug: 'banc', series: progTravail(2, 8), repos_cible_s: null }
  ]
};

const saisir = (s, i, j, charge, reps, t) =>
  Seance.valider(Seance.modifierSerie(s, i, j, { charge_kg: charge, reps: reps }), i, j, t);

// ── 1 et 2. Démarrer ───────────────────────────────────────────────────────

describe('1-2. démarrer', () => {
  test('depuis une routine : la structure est reprise, AUCUNE série n’est créée', async () => {
    const base = creerBase();
    const app = creerAppareil(base);
    const s = app.demarrer(ROUTINE);

    expect(s.exercices.map((e) => e.exercise_slug)).toEqual(['squat', 'banc']);
    expect(s.exercices.map((e) => e.series.length)).toEqual([3, 2]);
    expect(s.routine_id).toBe('r-1');
    // La structure est locale ; rien ne peut partir en base tant que rien n'est
    // validé — `sets_validee_si_saisie` l'interdit, et c'est tant mieux.
    expect(Seance.lignes(s)).toEqual([]);

    await app.vidanger();
    expect(base.sets.length).toBe(0);
    expect(base.sessions.length).toBe(1);
  });

  test('la routine ne transmet AUCUNE charge — elle n’en porte pas', () => {
    // La ROUTINE n'a aucun champ de charge : c'est la règle du chantier 21.
    ROUTINE.exercices.forEach((e) => {
      Object.keys(e).forEach((k) => expect(k).not.toMatch(/charge|poids|kg|weight/i));
    });
    // Et les séries créées naissent VIDES de charge. Le champ existe — une série
    // en porte une — mais rien ne le pré-remplit : le moteur n'a pas parlé, et
    // inventer un chiffre serait pire que de n'en montrer aucun.
    const app = creerAppareil(creerBase());
    const s = app.demarrer(ROUTINE);
    s.exercices.forEach((e) => e.series.forEach((x) => {
      expect(x.charge_kg).toBeNull();
      expect(x.reps).toBeNull();
    }));
    // Les reps VISÉES, elles, viennent de la routine : c'est une intention
    // déclarée, pas un calcul. ⚠️ Et elle est sur la LIGNE depuis le chantier
    // 43 — une rampe 15-10-5-1 a quatre intentions, pas une.
    expect(s.exercices[0].series[0].reps_visees).toBe(5);
    expect(s.exercices[0].reps_visees).toBeUndefined();
  });

  test('à vide : une séance sans exercice, on ajoute', async () => {
    const base = creerBase();
    const app = creerAppareil(base);
    const s = app.demarrer(null);
    expect(s.exercices).toEqual([]);
    expect(s.routine_id).toBeNull();

    app.geste((x) => Seance.ajouterExercice(x, 'souleve', uuid()));
    expect(app.seance.exercices.length).toBe(1);
    expect(app.seance.exercices[0].series.length).toBe(1);
  });
});

// ── 3. Le statut ───────────────────────────────────────────────────────────

describe('3. statut', () => {
  test('`en_cours` à la création, `terminee` à la fin — jamais le défaut', async () => {
    const base = creerBase();
    const app = creerAppareil(base);
    const s = app.demarrer(ROUTINE);

    // ⚠️ Le défaut de la colonne est 'terminee'. Une séance créée sans statut
    // explicite serait immédiatement réputée finie et polluerait l'historique.
    expect(Seance.ligneSession(s).statut).toBe('en_cours');
    await app.vidanger();
    expect(base.sessions[0].statut).toBe('en_cours');

    app.geste((x) => saisir(x, 0, 0, 100, 5, new Date()));
    app.terminer();
    await app.vidanger();
    expect(base.sessions[0].statut).toBe('terminee');
    expect(base.sessions[0].fin).toBeTruthy();
  });
});

// ── 4. Une seule séance en cours ───────────────────────────────────────────

describe('4. une seule séance en cours', () => {
  test('relancer avec une séance ouverte la REPREND, n’en crée pas une seconde', () => {
    const base = creerBase();
    const app = creerAppareil(base);
    const s = app.demarrer(ROUTINE);
    app.geste((x) => saisir(x, 0, 0, 100, 5, new Date()));

    app.tuer();
    const reprise = app.rouvrir();

    expect(reprise).not.toBeNull();
    expect(reprise.id).toBe(s.id);
    expect(reprise.statut).toBe('en_cours');
    expect(Seance.lignes(reprise).length).toBe(1);
  });

  test('après la fin, plus rien à reprendre', () => {
    const app = creerAppareil(creerBase());
    app.demarrer(ROUTINE);
    app.geste((x) => saisir(x, 0, 0, 100, 5, new Date()));
    app.terminer();
    app.tuer();
    expect(app.rouvrir()).toBeNull();
  });
});

// ── 5. Valider ─────────────────────────────────────────────────────────────

describe('5. valider et dévalider', () => {
  test('`validee_a` est renseigné, `rang` vaut au moins 1', async () => {
    const base = creerBase();
    const app = creerAppareil(base);
    app.demarrer(ROUTINE);
    app.geste((x) => saisir(x, 0, 0, 100, 5, new Date('2026-09-12T10:00:00Z')));
    app.geste((x) => saisir(x, 0, 1, 100, 5, new Date('2026-09-12T10:03:00Z')));
    await app.vidanger();

    const lignes = base.setsDe(app.seance.id);
    expect(lignes.length).toBe(2);
    expect(lignes.every((l) => !!l.validee_a)).toBe(true);
    expect(lignes.map((l) => l.rang)).toEqual([1, 2]);   // ≥ 1, jamais 0
    expect(lignes.every((l) => l.source === 'app')).toBe(true);
    expect(lignes.every((l) => l.user_id === USER)).toBe(true);
  });

  test('dévalider RETIRE la ligne de la base', async () => {
    const base = creerBase();
    const app = creerAppareil(base);
    app.demarrer(ROUTINE);
    app.geste((x) => saisir(x, 0, 0, 100, 5, new Date()));
    app.geste((x) => saisir(x, 0, 1, 100, 5, new Date()));
    await app.vidanger();
    expect(base.setsDe(app.seance.id).length).toBe(2);

    app.geste((x) => Seance.devalider(x, 0, 0));
    await app.vidanger();

    const restantes = base.setsDe(app.seance.id);
    expect(restantes.length).toBe(1);
    // ⚠️ Le rang reste 2, et c'est JUSTE : `rang` est l'ordre d'AFFICHAGE, et la
    // série dévalidée occupe toujours sa ligne à l'écran. Un trou dans les rangs
    // n'est pas une anomalie — la base n'exige que l'unicité et ≥ 1, pas la
    // densité. Resserrer ferait bouger le rang d'une série que personne n'a
    // touchée.
    expect(restantes[0].rang).toBe(2);
  });

  test('revalider RÉÉCRIT `validee_a` : la série a été refaite plus tard (§7.5)', () => {
    const app = creerAppareil(creerBase());
    app.demarrer(ROUTINE);
    app.geste((x) => saisir(x, 0, 0, 100, 5, new Date('2026-09-12T10:00:00Z')));
    const premier = Seance.lignes(app.seance)[0].validee_a;
    app.geste((x) => Seance.devalider(x, 0, 0));
    app.geste((x) => Seance.valider(x, 0, 0, new Date('2026-09-12T10:20:00Z')));
    expect(Seance.lignes(app.seance)[0].validee_a).not.toBe(premier);
  });

  test('permuter des rangs passe en UN LOT — la contrainte est différée', async () => {
    const base = creerBase();
    const app = creerAppareil(base);
    app.demarrer(ROUTINE);
    app.geste((x) => saisir(x, 0, 0, 100, 5, new Date()));
    app.geste((x) => saisir(x, 0, 1, 110, 5, new Date()));
    app.geste((x) => saisir(x, 0, 2, 120, 5, new Date()));
    await app.vidanger();

    // On retire celle du milieu : les suivantes se décalent vers le bas et
    // heurteraient la contrainte si elles partaient une par une.
    app.geste((x) => Seance.retirerSerie(x, 0, 1));
    const r = await app.vidanger();
    expect(r.ok).toBe(true);
    expect(base.setsDe(app.seance.id).map((l) => [l.charge_kg, l.rang]))
      .toEqual([[100, 1], [120, 2]]);
  });
});

// ── 6. Le chronomètre ──────────────────────────────────────────────────────

describe('6. le chronomètre de repos', () => {
  test('il part à la VALIDATION et la valeur va dans `repos_s`', () => {
    const app = creerAppareil(creerBase());
    app.demarrer(ROUTINE);
    app.geste((x) => saisir(x, 0, 0, 100, 5, new Date('2026-09-12T10:00:00Z')));
    app.geste((x) => saisir(x, 0, 1, 100, 5, new Date('2026-09-12T10:02:30Z')));

    const lignes = Seance.lignes(app.seance);
    // La première n'a pas de repos AVANT elle : rien ne s'invente.
    expect(lignes[0].repos_s).toBeNull();
    expect(lignes[1].repos_s).toBe(150);
  });

  test('au-delà d’une heure, ce n’est plus un repos : NULL, pas 3600', () => {
    const app = creerAppareil(creerBase());
    app.demarrer(ROUTINE);
    app.geste((x) => saisir(x, 0, 0, 100, 5, new Date('2026-09-12T10:00:00Z')));
    app.geste((x) => saisir(x, 0, 1, 100, 5, new Date('2026-09-12T12:00:00Z')));
    // Plafonner à 3600 écrirait un chiffre FAUX, qui se propagerait. Une absence
    // se voit ; un mensonge, non.
    expect(Seance.lignes(app.seance)[1].repos_s).toBeNull();
  });

  test('la valeur est corrigeable à la main, et reste dans les bornes', async () => {
    const base = creerBase();
    const app = creerAppareil(base);
    app.demarrer(ROUTINE);
    app.geste((x) => saisir(x, 0, 0, 100, 5, new Date('2026-09-12T10:00:00Z')));
    app.geste((x) => saisir(x, 0, 1, 100, 5, new Date('2026-09-12T10:02:30Z')));

    let s = app.seance;
    s.exercices[0].series[1].repos_s = 200;   // correction manuelle
    app.geste(() => s);
    await app.vidanger();
    expect(base.setsDe(s.id)[1].repos_s).toBe(200);
  });
});

// ── 7. Le type de série ────────────────────────────────────────────────────

describe('7. le type de série', () => {
  test('les quatre valeurs de `type_serie` passent, et se changent après coup', async () => {
    const base = creerBase();
    const app = creerAppareil(base);
    app.demarrer(ROUTINE);
    app.geste((x) => saisir(x, 0, 0, 100, 5, new Date()));
    await app.vidanger();
    expect(base.setsDe(app.seance.id)[0].type_serie).toBe('travail');

    for (const t of ['echauffement', 'degressive', 'echec', 'travail']) {
      app.geste((x) => Seance.changerType(x, 0, 0, t));
      const r = await app.vidanger();
      expect([t, r.ok]).toEqual([t, true]);
      expect(base.setsDe(app.seance.id)[0].type_serie).toBe(t);
    }
  });

  test('un type inconnu est refusé AVANT la base', () => {
    const app = creerAppareil(creerBase());
    app.demarrer(ROUTINE);
    const avant = app.seance;
    const apres = Seance.changerType(avant, 0, 0, 'rest_pause');
    expect(apres).toBe(avant);   // rien n'a bougé
  });
});

// ── 8. L'effort ────────────────────────────────────────────────────────────

describe('8. l’effort — RPE et ressenti sont EXCLUSIFS', () => {
  // Tranché : les deux mesurent la même chose dans deux langues. Les autoriser
  // ensemble ouvrirait « lequel fait foi » le jour où ils se contredisent, et
  // la colonne n'en affiche qu'un de toute façon.
  test('choisir l’un EFFACE l’autre, dans les deux sens', () => {
    const app = creerAppareil(creerBase());
    app.demarrer(ROUTINE);
    let s = Seance.valider(app.seance, 0, 0, new Date());

    s = Seance.definirEffort(s, 0, 0, { rpe: 9 });
    expect(Seance.lignes(s)[0]).toMatchObject({ rpe: 9, ressenti: null });

    s = Seance.definirEffort(s, 0, 0, { ressenti: 'reste_1' });
    expect(Seance.lignes(s)[0]).toMatchObject({ rpe: null, ressenti: 'reste_1' });

    s = Seance.definirEffort(s, 0, 0, { rpe: 8.5 });
    expect(Seance.lignes(s)[0]).toMatchObject({ rpe: 8.5, ressenti: null });

    s = Seance.definirEffort(s, 0, 0, {});
    expect(Seance.lignes(s)[0]).toMatchObject({ rpe: null, ressenti: null });
  });

  test('les valeurs hors bornes sont refusées avant la base', () => {
    const app = creerAppareil(creerBase());
    app.demarrer(ROUTINE);
    const s = Seance.valider(app.seance, 0, 0, new Date());
    expect(Seance.definirEffort(s, 0, 0, { rpe: 0 })).toBe(s);
    expect(Seance.definirEffort(s, 0, 0, { rpe: 11 })).toBe(s);
    expect(Seance.definirEffort(s, 0, 0, { ressenti: 'reste_9' })).toBe(s);
  });

  test('le couple accepté par la base l’est aussi par le banc', async () => {
    const base = creerBase();
    const app = creerAppareil(base);
    app.demarrer(ROUTINE);
    app.geste((x) => Seance.definirEffort(saisir(x, 0, 0, 100, 5, new Date()), 0, 0, { ressenti: 'reste_0' }));
    const r = await app.vidanger();
    expect(r.ok).toBe(true);
    expect(base.setsDe(app.seance.id)[0].ressenti).toBe('reste_0');
  });
});

// ── 9. Hors ligne — LA configuration discriminante ─────────────────────────

describe('9. hors ligne, app tuée en pleine séance', () => {
  test('saisir une séance entière SANS réseau, tuer l’app, rouvrir → tout est là', async () => {
    const base = creerBase({ reseau: false });   // ← coupé DÈS LE DÉPART
    const app = creerAppareil(base);

    app.demarrer(ROUTINE);
    app.geste((x) => saisir(x, 0, 0, 100, 5, new Date('2026-09-12T10:00:00Z')));
    app.geste((x) => saisir(x, 0, 1, 105, 5, new Date('2026-09-12T10:03:00Z')));
    app.geste((x) => Seance.definirEffort(x, 0, 1, { ressenti: 'reste_1' }));
    app.geste((x) => saisir(x, 1, 0, 60, 8, new Date('2026-09-12T10:07:00Z')));

    // Aucun envoi n'a abouti, et c'est normal.
    const r = await app.vidanger();
    expect(r.ok).toBe(false);
    expect(base.sessions.length).toBe(0);

    // ⚠️ L'APP EST TUÉE EN PLEINE SÉANCE. C'est le cas qui discrimine.
    app.tuer();
    expect(app.seance).toBeNull();

    const reprise = app.rouvrir();
    expect(reprise).not.toBeNull();
    const lignes = Seance.lignes(reprise);
    expect(lignes.length).toBe(3);
    expect(lignes.map((l) => l.charge_kg)).toEqual([100, 105, 60]);
    expect(lignes.map((l) => l.rang)).toEqual([1, 2, 4]);
    expect(lignes[1].ressenti).toBe('reste_1');
    expect(lignes[1].repos_s).toBe(180);

    // Et la file a survécu elle aussi : sans elle, la séance ne monterait jamais.
    expect(app.disque.attente.length).toBeGreaterThan(0);
  });

  test('la file survit au redémarrage et monte au retour du réseau', async () => {
    const base = creerBase({ reseau: false });
    const app = creerAppareil(base);
    app.demarrer(ROUTINE);
    app.geste((x) => saisir(x, 0, 0, 100, 5, new Date()));
    app.terminer();
    await app.vidanger();
    expect(base.sessions.length).toBe(0);

    app.tuer(); app.rouvrir();          // redémarrage complet
    base.reseau = true;                  // le réseau revient
    const r = await app.vidanger();

    expect(r.ok).toBe(true);
    expect(base.sessions.length).toBe(1);
    expect(base.sessions[0].statut).toBe('terminee');
    expect(base.setsDe(base.sessions[0].id).length).toBe(1);
    expect(app.disque.attente.length).toBe(0);
  });

  test('la séance monte DANS L’ORDRE : la séance avant ses séries', async () => {
    const base = creerBase({ reseau: false });
    const app = creerAppareil(base);
    app.demarrer(ROUTINE);
    app.geste((x) => saisir(x, 0, 0, 100, 5, new Date()));
    await app.vidanger();

    base.reseau = true;
    await app.vidanger();
    // Sans l'ordre, `sets_session_id_fkey` ferait échouer les séries.
    const ops = base.journal.filter((j) => j.op !== 'suppression').map((j) => j.op);
    expect(ops.indexOf('session')).toBeLessThan(ops.lastIndexOf('series'));
  });

  test('une synchronisation de LECTURE n’efface pas la séance en attente', () => {
    // ⚠️ La perte la plus grave du projet : `Sync.remplacer` remplace la liste
    // par celle du serveur, où une séance hors ligne ne figure pas.
    const base = creerBase({ reseau: false });
    const app = creerAppareil(base);
    app.demarrer(ROUTINE);
    app.geste((x) => saisir(x, 0, 0, 100, 5, new Date()));
    const finie = app.terminer();

    const cacheLocal = [{ id: 'ancienne' }, { id: finie.id }];
    const duServeur = [{ id: 'ancienne' }];   // le serveur ne la connaît pas

    const sans = Sync.remplacer(duServeur);
    expect(sans.map((s) => s.id)).not.toContain(finie.id);   // elle disparaîtrait

    const avec = Sync.remplacer(duServeur, {
      conserver: Attente.seancesEnAttente(app.disque.attente),
      existants: cacheLocal
    });
    expect(avec.map((s) => s.id)).toContain(finie.id);
  });
});

// ── 10. Synchronisation et idempotence ─────────────────────────────────────

describe('10. synchronisation', () => {
  test('renvoyer deux fois ne crée pas deux séances ni deux séries', async () => {
    const base = creerBase();
    const app = creerAppareil(base);
    app.demarrer(ROUTINE);
    app.geste((x) => saisir(x, 0, 0, 100, 5, new Date()));
    app.geste((x) => saisir(x, 0, 1, 100, 5, new Date()));
    await app.vidanger();

    const id = base.sessions[0].id;
    expect(base.sessions.length).toBe(1);
    expect(base.setsDe(id).length).toBe(2);

    // On rejoue tout : c'est ce qui arrive quand une confirmation se perd.
    await base.ecrivain.enregistrerSeance(Seance.ligneSession(app.seance));
    await base.ecrivain.remplacerSeries(id, Seance.lignes(app.seance));
    await base.ecrivain.remplacerSeries(id, Seance.lignes(app.seance));

    expect(base.sessions.length).toBe(1);
    expect(base.setsDe(id).length).toBe(2);
  });

  test('une entrée ne quitte la file que sur CONFIRMATION — le compte autorise', async () => {
    const base = creerBase({ reseau: false });
    const app = creerAppareil(base);
    app.demarrer(ROUTINE);
    const avant = app.disque.attente.length;
    await app.vidanger();
    // Le serveur n'a rien confirmé : rien n'est retiré.
    expect(app.disque.attente.length).toBe(avant);
  });

  test('un refus DÉFINITIF bloque la file et se voit — jamais de perte silencieuse', async () => {
    const base = creerBase();
    const app = creerAppareil(base);
    app.demarrer(ROUTINE);
    // Une séance sans user_id : le WITH CHECK du RLS la refuserait pareil.
    app.disque.attente[0].donnees.user_id = null;
    const r = await app.vidanger();

    expect(r.ok).toBe(false);
    const resume = Attente.resume(app.disque.attente);
    expect(resume.bloquees).toBe(1);
    expect(resume.libelle).toMatch(/refusé/);
    expect(resume.libelle).toMatch(/rien n’est perdu/);
    // La file n'avance pas : sauter l'entrée casserait la clé étrangère.
    expect(Attente.prochaine(app.disque.attente)).toBeNull();
  });

  test('l’état le dit sans alarme, et « à jour » n’est jamais affiché à tort', () => {
    const aJour = { code: 'a-jour', libelle: 'À jour', local: false };
    expect(Attente.deciderEtat(aJour, [])).toBe(aJour);
    const avec = Attente.deciderEtat(aJour, [{ cle: 'sessions:a', seq: 1 }]);
    expect(avec.code).toBe('a-envoyer');
    expect(avec.libelle).toBe('1 à envoyer');
  });
});

// ── 11. Abandonner ─────────────────────────────────────────────────────────

describe('11. abandonner', () => {
  test('la séance est supprimée, et aucune fantôme ne se rouvre', async () => {
    const base = creerBase();
    const app = creerAppareil(base);
    app.demarrer(ROUTINE);
    app.geste((x) => saisir(x, 0, 0, 100, 5, new Date()));
    await app.vidanger();
    expect(base.sessions.length).toBe(1);

    app.abandonner();
    await app.vidanger();

    expect(base.sessions.length).toBe(0);
    expect(base.sets.length).toBe(0);       // ON DELETE CASCADE
    app.tuer();
    expect(app.rouvrir()).toBeNull();        // rien à reprendre au lancement
  });

  test('abandonner une séance JAMAIS montée n’envoie rien du tout', async () => {
    const base = creerBase({ reseau: false });
    const app = creerAppareil(base);
    app.demarrer(ROUTINE);
    app.geste((x) => saisir(x, 0, 0, 100, 5, new Date()));
    await app.vidanger();          // rien ne monte, réseau coupé

    app.abandonner();
    // L'intention de création n'a jamais voyagé : la supprimer suffit, et
    // envoyer un DELETE pour une ligne qui n'existe pas serait du bruit.
    expect(app.disque.attente.length).toBe(0);

    base.reseau = true;
    await app.vidanger();
    expect(base.sessions.length).toBe(0);
    expect(base.journal.filter((j) => j.op === 'suppression').length).toBe(0);
  });
});

// ── La file, en propre ─────────────────────────────────────────────────────

describe('la file d’attente', () => {
  test('elle COMPRESSE : dix modifications de la même séance font une entrée', () => {
    let f = [];
    for (let i = 0; i < 10; i++) {
      f = Attente.poser(f, { table: 'sets', op: 'remplacer', id: 'S', donnees: [{ n: i }] });
    }
    expect(f.length).toBe(1);
    expect(f[0].donnees).toEqual([{ n: 9 }]);   // la dernière gagne
  });

  test('elle garde l’ORDRE de première pose — la séance avant ses séries', () => {
    let f = Attente.poser([], { table: 'sessions', op: 'upsert', id: 'S', donnees: { a: 1 } });
    f = Attente.poser(f, { table: 'sets', op: 'remplacer', id: 'S', donnees: [] });
    // On remodifie la séance APRÈS : elle ne doit pas passer derrière ses séries.
    f = Attente.poser(f, { table: 'sessions', op: 'upsert', id: 'S', donnees: { a: 2 } });
    expect(Attente.ordonnee(f).map((e) => e.table)).toEqual(['sessions', 'sets']);
    expect(Attente.prochaine(f).donnees).toEqual({ a: 2 });
  });

  test('supprimer ce qui est déjà monté envoie bien un DELETE', () => {
    // Pas de `creation` : l'entité a été montée, puis modifiée.
    let f = Attente.poser([], { table: 'sessions', op: 'upsert', id: 'S', donnees: {} });
    f = Attente.poser(f, { table: 'sessions', op: 'supprimer', id: 'S' });
    expect(f.length).toBe(1);
    expect(f[0].op).toBe('supprimer');
  });

  // ══ LA PERTE SILENCIEUSE DE LA FILE (trouvée au chantier 25) ═════════════
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE : un geste posé PENDANT qu'un envoi est en
  // vol, sur la MÊME clé. Si l'on pose avant l'envoi ou après le retrait, la
  // file se comporte pareil qu'elle garde ou non la version — seule la
  // superposition les sépare.
  //
  // C'est pour ça que le banc ne l'a jamais vue : il saisissait par `fill()`,
  // qui pose une valeur d'un bloc et n'émet qu'UN événement. Personne ne tape
  // comme ça — un humain émet un événement par caractère, donc une intention
  // par caractère, donc il ouvre la fenêtre à chaque frappe.
  test('une intention posée PENDANT l’envoi n’est pas emportée par le succès', () => {
    // 1. trois séries en file
    let f = Attente.poser([], { table: 'sets', op: 'remplacer', id: 'S', donnees: ['a', 'b', 'c'] });
    // 2. la vidange en prend une copie et part sur le réseau
    const envoyee = Attente.prochaine(f);
    expect(envoyee.donnees).toEqual(['a', 'b', 'c']);
    // 3. pendant l'aller-retour, un geste pose une quatrième série
    f = Attente.poser(f, { table: 'sets', op: 'remplacer', id: 'S', donnees: ['a', 'b', 'c', 'd'] });
    // 4. la requête revient, réussie : on retire CE QU'ON A ENVOYÉ
    f = Attente.retirer(f, envoyee.cle, envoyee.version);

    // L'entrée reste, avec l'intention récente — et le tour suivant l'enverra.
    expect(f.length).toBe(1);
    expect(f[0].donnees).toEqual(['a', 'b', 'c', 'd']);
    expect(Attente.prochaine(f).donnees).toEqual(['a', 'b', 'c', 'd']);
  });

  test('et sans geste concurrent, elle part bien de la file', () => {
    let f = Attente.poser([], { table: 'sets', op: 'remplacer', id: 'S', donnees: ['a'] });
    const envoyee = Attente.prochaine(f);
    f = Attente.retirer(f, envoyee.cle, envoyee.version);
    expect(f).toEqual([]);
  });

  // La preuve d'ASYMÉTRIE : sans la version, le succès emporte l'intention
  // récente — c'est exactement le défaut, reproduit ici pour qu'on voie qu'il
  // n'est pas théorique.
  test('c’est bien la VERSION qui discrimine, pas autre chose', () => {
    let f = Attente.poser([], { table: 'sets', op: 'remplacer', id: 'S', donnees: ['a', 'b', 'c'] });
    const envoyee = Attente.prochaine(f);
    f = Attente.poser(f, { table: 'sets', op: 'remplacer', id: 'S', donnees: ['a', 'b', 'c', 'd'] });
    expect(envoyee.version).toBe(1);
    expect(f[0].version).toBe(2);
    // Retirer en citant la version ENVOYÉE : l'entrée reste.
    expect(Attente.retirer(f, envoyee.cle, 1).length).toBe(1);
    // Retirer en citant la version COURANTE : elle part.
    expect(Attente.retirer(f, envoyee.cle, 2)).toEqual([]);
  });

  // ⚠️ Sans version citée du tout, on retire SANS CONDITION — et c'est voulu :
  // c'est l'appel de l'abandon de séance, qui purge les écritures de séries
  // d'une séance qui n'existera plus. `vidanger`, lui, cite toujours une
  // version (`op.version || 1`), y compris pour une entrée écrite par un build
  // antérieur qui n'en portait pas.
  test('sans version citée, le retrait est inconditionnel — c’est la purge', () => {
    let f = Attente.poser([], { table: 'sets', op: 'remplacer', id: 'S', donnees: ['a'] });
    f = Attente.poser(f, { table: 'sets', op: 'remplacer', id: 'S', donnees: ['a', 'b'] });
    expect(Attente.retirer(f, 'sets:S')).toEqual([]);
  });

  test('une entrée d’un build antérieur, sans `version`, se comporte comme avant', () => {
    // Écrite par le build précédent : aucun champ `version`.
    const ancienne = { cle: 'sets:S', seq: 1, table: 'sets', op: 'remplacer',
                       id: 'S', donnees: ['a'], creation: false, essais: 0, bloquee: null };
    // `vidanger` cite `op.version || 1` : elle part, comme avant le chantier.
    expect(Attente.retirer([ancienne], 'sets:S', 1)).toEqual([]);
    // Et si un geste l'a remplacée entre-temps, elle reste : la garde vaut
    // aussi pour ce qui traînait dans la file au moment de la mise à jour.
    const remplacee = Attente.poser([ancienne],
      { table: 'sets', op: 'remplacer', id: 'S', donnees: ['a', 'b'] });
    expect(remplacee[0].version).toBe(2);
    expect(Attente.retirer(remplacee, 'sets:S', 1).length).toBe(1);
  });

  // ⚠️ LA GARDE VAUT POUR LES DEUX BRANCHES DE `poser`, pas seulement pour la
  // compression d'un upsert. Trouvé en revue : les premiers tests n'exerçaient
  // que `remplacer`, et la branche `supprimer` ne montait pas la version — donc
  // une suppression posée pendant un envoi en vol était emportée par son
  // succès, et la séance restait en base POUR TOUJOURS.
  test('une SUPPRESSION posée pendant l’envoi n’est pas emportée non plus', () => {
    let f = Attente.poser([], { table: 'sessions', op: 'upsert', id: 'S', donnees: { a: 1 } });
    const envoyee = Attente.prochaine(f);
    // L'upsert part ; pendant l'aller-retour, l'utilisateur abandonne.
    f = Attente.poser(f, { table: 'sessions', op: 'supprimer', id: 'S' });
    expect(f[0].op).toBe('supprimer');
    expect(f[0].version).toBe(2);
    f = Attente.retirer(f, envoyee.cle, envoyee.version);
    // L'intention de suppression survit au succès de l'upsert.
    expect(f.length).toBe(1);
    expect(Attente.prochaine(f).op).toBe('supprimer');
  });

  test('les erreurs temporaires ne bloquent pas, les définitives si', () => {
    expect(Attente.estDefinitive(new TypeError('Failed to fetch'))).toBe(false);
    expect(Attente.estDefinitive({ code: '503' })).toBe(false);
    expect(Attente.estDefinitive({ code: '23514' })).toBe(true);
    expect(Attente.estDefinitive({ code: '42501' })).toBe(true);
    expect(Attente.estDefinitive({ message: 'new row violates row-level security policy' })).toBe(true);
  });
});
