/** @jest-environment node */
//
// 104 — L'ANNONCE D'UN BILAN NE REVIENT PAS SUR UN AUTRE APPAREIL (BILANS-V1, décision du 16/10/2026).
//
// LE DÉFAUT : l'annonce de l'année, de la saison et du mois était mémorisée sur l'appareil seulement (`localStorage`) :
// un deuxième téléphone, ou le même après « effacer les données », la reposait.
//
// LE CORRECTIF : `profiles.bilans_annonces` (v2_086, `text[] NOT NULL DEFAULT '{}'`, au plus 200) — la liste des
// périodes annoncées ('2026', '2026-ete', '2026-09'). Une période est annoncée si elle n'est ni dans la colonne ni
// dans la mémoire de l'appareil ; annoncée, elle s'ajoute aux deux, au profil par son chemin d'écriture
// (`poserProfil`). L'annonce attend la lecture du profil (au plus 5 s).
//
// ⚠️ LA COLONNE PEUT NE PAS EXISTER ENCORE (migration pas lancée) : le profil doit continuer à se lire et à
// s'écrire — le défaut de #418 (une colonne nommée avant sa migration : plus de profil) ne se reproduit pas.

process.env.TZ = 'Europe/Paris';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
const Bilan = require('../../v2/js/bilan.js');
require('../../v2/js/parcours.js');
const Bilans = require('../../v2/js/bilans.js');
const Profil = require('../../v2/js/profil.js');

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const extraire = (nom) => {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable : ' + nom);
  return m[0];
};
const VARS = ['CLE_ANNONCE_BILAN', 'JOURS_D_ANNONCE', 'CLE_ANNONCE_ANNEE', 'ATTENTE_PROFIL_ANNONCE_MS', 'PREMIERE_ANNEE'].map((n) => {
  const m = new RegExp('^  var (?:[^\\n]*?\\b)?' + n + ' = [^,;]+', 'm').exec(APP);
  if (!m) throw new Error('introuvable : ' + n);
  return 'var ' + m[0].slice(m[0].indexOf(n)) + ';';
}).join('\n');
const tic = () => new Promise((r) => setImmediate(r));

// ═══ 1. LES RÈGLES PURES (profil.js) ═══════════════════════════════════════
describe('Profil — la liste des bilans annoncés', () => {
  test('`bilansAnnonces` : la liste du profil, sinon vide (profil absent, cache d’avant la colonne, valeur illisible)', () => {
    expect(Profil.bilansAnnonces({ bilans_annonces: ['2026', '2026-09'] })).toEqual(['2026', '2026-09']);
    expect(Profil.bilansAnnonces({})).toEqual([]);
    expect(Profil.bilansAnnonces(null)).toEqual([]);
    expect(Profil.bilansAnnonces({ bilans_annonces: null })).toEqual([]);
    expect(Profil.bilansAnnonces({ bilans_annonces: ['2026', null, 3, ''] })).toEqual(['2026']);
  });

  test('`ajouterBilansAnnonces` : sans doublon, dans l’ordre, sans muter l’entrée', () => {
    const l = ['2026-08', '2026-ete'];
    expect(Profil.ajouterBilansAnnonces(l, ['2026-09', '2026-ete', '2026-09'])).toEqual(['2026-08', '2026-ete', '2026-09']);
    expect(l).toEqual(['2026-08', '2026-ete']);
  });

  test('DISCRIMINANT — au plus 200 : les plus anciennes sortent, la nouvelle reste', () => {
    const l = Array.from({ length: 200 }, (_, i) => 'p' + i);
    const r = Profil.ajouterBilansAnnonces(l, ['2026-10']);
    expect(Profil.BILANS_ANNONCES_MAX).toBe(200);
    expect(r).toHaveLength(200);
    expect(r[0]).toBe('p1');
    expect(r[199]).toBe('2026-10');
  });

  test('`champsEcrits` : la liste part (ramenée à 200) ; absente ou illisible, elle ne part pas (NOT NULL)', () => {
    expect(Profil.CHAMPS_ECRITS).toContain('bilans_annonces');
    expect(Profil.champsEcrits({ bilans_annonces: ['2026'] })).toEqual({ bilans_annonces: ['2026'] });
    expect(Profil.champsEcrits({ bilans_annonces: Array.from({ length: 250 }, (_, i) => 'p' + i) }).bilans_annonces).toHaveLength(200);
    expect(Profil.champsEcrits({ bilans_annonces: null })).toEqual({});
    expect(Profil.champsEcrits({ username: 'a' })).toEqual({ username: 'a' });
  });
});

// ═══ 2. LA COLONNE ABSENTE NE CASSE PAS LE PROFIL (donnees.js) ═════════════
// Un faux PostgREST : sans la colonne, un `select` qui la nomme rend `42703`, un `upsert` qui la porte rend
// `PGRST204` — comme la vraie base avant v2_086. Rien n'est écrit d'une requête refusée.
function fauxPostgrest(o) {
  const opt = o || {};
  const etat = { colonnes: new Set(['id', 'username', 'bio', 'jeu_actif', 'onboarding_completed'].concat(opt.avecColonne ? ['bilans_annonces'] : [])),
    ligne: Object.assign({ id: 'u1', username: 'aurel', jeu_actif: true }, opt.avecColonne ? { bilans_annonces: ['2026-09'] } : {}),
    lectures: [], ecritures: [] };
  const projeter = (cols) => {
    const out = {};
    cols.split(',').map((c) => c.trim()).forEach((c) => { out[c] = etat.ligne[c] === undefined ? null : etat.ligne[c]; });
    return out;
  };
  const manque = (cols) => cols.split(',').map((c) => c.trim()).find((c) => !etat.colonnes.has(c) &&
    ['bilans_annonces', 'colonne_inconnue'].indexOf(c) >= 0);
  const client = {
    from() {
      const q = { cols: null, upsert: null };
      const c = {
        select(cols) { q.cols = cols; return c; },
        eq() { return c; },
        upsert(ligne) { q.upsert = ligne; return c; },
        maybeSingle() { return c; },
        single() { return c; },
        then(res, rej) {
          let r;
          if (q.upsert) {
            etat.ecritures.push(Object.assign({}, q.upsert));
            const inconnue = Object.keys(q.upsert).find((k) => !etat.colonnes.has(k) && k !== 'updated_at');
            if (inconnue) r = { data: null, error: { code: 'PGRST204', details: null, hint: null,
              message: "Could not find the '" + inconnue + "' column of 'profiles' in the schema cache" } };
            else {
              Object.keys(q.upsert).forEach((k) => { if (k !== 'updated_at') etat.ligne[k] = q.upsert[k]; });
              const m = manque(q.cols);
              r = m ? { data: null, error: { code: '42703', message: 'column profiles.' + m + ' does not exist' } } : { data: projeter(q.cols), error: null };
            }
          } else {
            etat.lectures.push(q.cols);
            const m = manque(q.cols);
            r = m ? { data: null, error: { code: '42703', details: null, hint: null, message: 'column profiles.' + m + ' does not exist' } }
              : { data: projeter(q.cols), error: null };
          }
          return Promise.resolve(r).then(res, rej);
        }
      };
      return c;
    }
  };
  return { etat, client };
}
function chargerDonnees(f) {
  global.THClient = { obtenir: () => f.client };
  let D;
  jest.isolateModules(() => { D = require('../../v2/js/donnees.js'); });   // un module neuf : une session neuve
  return D;
}

describe('Donnees — `bilans_annonces` est facultative : absente en base, le profil se lit et s’écrit', () => {
  test('DISCRIMINANT — colonne absente : `monProfil` rend la ligne (avant : 42703, plus de profil)', async () => {
    const f = fauxPostgrest({ avecColonne: false });
    const D = chargerDonnees(f);
    const p = await D.monProfil('u1');
    expect(p).toMatchObject({ id: 'u1', username: 'aurel' });
    expect(p).not.toHaveProperty('bilans_annonces');
    expect(f.etat.lectures[0]).toContain('bilans_annonces');        // demandée d'abord…
    expect(f.etat.lectures[1]).not.toContain('bilans_annonces');    // …puis la même lecture, sans elle
    // La session ne la redemande plus.
    await D.monProfil('u1');
    expect(f.etat.lectures).toHaveLength(3);
    expect(f.etat.lectures[2]).not.toContain('bilans_annonces');
  });

  test('DISCRIMINANT — colonne absente : `enregistrerProfil` écrit le reste de la ligne (avant : PGRST204 à chaque envoi)', async () => {
    const f = fauxPostgrest({ avecColonne: false });
    const D = chargerDonnees(f);
    const r = await D.enregistrerProfil('u1', { bio: 'salut', bilans_annonces: ['2026-09'] });
    expect(r).toMatchObject({ id: 'u1', bio: 'salut' });
    expect(f.etat.ligne.bio).toBe('salut');
    expect(f.etat.ecritures).toHaveLength(2);
    expect(f.etat.ecritures[1]).not.toHaveProperty('bilans_annonces');
    // L'envoi suivant part directement sans elle.
    await D.enregistrerProfil('u1', { bio: 'deux', bilans_annonces: ['2026-09'] });
    expect(f.etat.ecritures).toHaveLength(3);
    expect(f.etat.ligne.bio).toBe('deux');
  });

  test('colonne présente : lue et écrite', async () => {
    const f = fauxPostgrest({ avecColonne: true });
    const D = chargerDonnees(f);
    expect((await D.monProfil('u1')).bilans_annonces).toEqual(['2026-09']);
    const r = await D.enregistrerProfil('u1', { bilans_annonces: ['2026-09', '2026-10'] });
    expect(r.bilans_annonces).toEqual(['2026-09', '2026-10']);
    expect(f.etat.ecritures).toHaveLength(1);
    expect(f.etat.lectures).toHaveLength(1);
  });

  test('⚠️ une AUTRE colonne absente reste une erreur (seules les facultatives se retirent)', async () => {
    const f = fauxPostgrest({ avecColonne: true });
    const D = chargerDonnees(f);
    await expect(D.enregistrerProfil('u1', { colonne_inconnue: 1 })).rejects.toMatchObject({ code: 'PGRST204' });
    const g = fauxPostgrest({ avecColonne: true });
    g.client.from = ((orig) => () => { const c = orig(); const s = c.select; c.select = () => s.call(c, 'id, colonne_inconnue'); return c; })(g.client.from);
    const D2 = chargerDonnees(g);
    await expect(D2.monProfil('u1')).rejects.toMatchObject({ code: '42703' });
  });
});

// ═══ 3. L'ANNONCE : LE PROFIL, PUIS L'APPAREIL (app.js, rejoué) ════════════
// Deux appareils, une base. Chaque appareil a sa mémoire (`localStorage`) et son profil en mémoire ; la base garde la
// ligne. L'annonce, la lecture du profil et son envoi sont les vraies fonctions d'`app.js`.
function horlogeA(iso) {
  const t = new Date(iso).getTime();
  const V = Date;
  function D(...a) { return a.length ? new V(...a) : new V(t); }
  D.prototype = V.prototype; D.now = () => t; D.parse = V.parse; D.UTC = V.UTC;
  return D;
}
function appareil(base, o) {
  const opt = o || {};
  const stock = {};
  const etat = { annonces: [], posts: [] };
  const ctx = {
    console, Promise, Object, Array, Math, String, Number, Error,
    Date: horlogeA(opt.maintenant || '2026-11-03T09:00:00'),
    Profil, Bilans, Bilan,
    Moteur: { jourCivil: (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') },
    Annee: { annonce: (h, vue) => etat.annonces.push(vue.texte || ('Ton année ' + vue.an + ' est prête.')) },
    $: () => ({}),
    racine: {
      localStorage: opt.sansMemoire ? { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } }
        : { getItem: (k) => (k in stock ? stock[k] : null), setItem: (k, v) => { stock[k] = String(v); }, removeItem: (k) => { delete stock[k]; } },
      setTimeout: (f, ms) => setTimeout(f, Math.min(ms, 50))
    },
    bilanPeriode: () => ({ vide: false }), bilanDeLAnnee: () => ({ vide: false }),
    titreDeSaison: (cle) => 'Saison ' + cle,
    ouvrirBilan: () => {}, ouvrirAnnee: () => {}, anneeDemandee: () => null, periodeDemandee: () => null,
    generation: 1, generationValide: (g) => g === ctx.generation,
    userId: () => 'u1', identifiantDuProfil: async () => 'u1', metadonneesDuCompte: async () => null,
    profil: opt.profil === undefined ? null : opt.profil, profilAEnvoyer: false, envoiProfil: null, versionProfil: 0, ligneACreer: false,
    pseudoAInscrire: null,
    sauverProfilLocal: async () => {}, effacerPseudoPris: () => {}, retenirPseudoPris: () => {},
    texteErreur: (e) => String(e && e.message || e),
    ecranCourant: 'saisie', rendreProfilEcran: () => {}, objectifsSuiventLeProfil: () => {}, rendreBandeauQuestionnaire: () => {}, rendreBandeauPhase: () => {},
    rendreCarteCycles: () => {}, jeuSuitLeProfil: () => {}, parcoursSuitLeProfil: () => {}, ouvrirQuestionnaireSiDu: () => {},
    Donnees: {
      monProfil: async () => {
        if (opt.horsReseau) throw new Error('réseau');
        if (opt.lenteur) await new Promise((r) => setTimeout(r, opt.lenteur));
        return JSON.parse(JSON.stringify(base.ligne));
      },
      enregistrerProfil: async (id, champs) => {
        etat.posts.push(JSON.parse(JSON.stringify(champs)));
        if (opt.horsReseau) throw new Error('réseau');
        Object.keys(champs).forEach((c) => { if (c !== 'bilans_annonces' || base.avecColonne) base.ligne[c] = champs[c]; });
        return JSON.parse(JSON.stringify(base.ligne));
      }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(VARS, ctx);
  ['annoncesDuJour', 'cleAnnonce', 'annonceDejaVue', 'noterAnnonces', 'annoncerUnBilan', 'annoncerLAnnee', 'apresSynchroAnnee',
    'envoyerProfil', 'envoyerProfilMaintenant', 'poserProfil', 'chargerProfil'].forEach((n) => vm.runInContext(extraire(n), ctx));
  // Le démarrage tel que la synchronisation le fait : la lecture du profil, PAS attendue, puis l'annonce.
  etat.demarrer = async () => {
    const lu = ctx.chargerProfil();
    await ctx.apresSynchroAnnee('u1', lu);
    for (let i = 0; i < 5; i++) await tic();
  };
  etat.ctx = ctx; etat.stock = stock;
  return etat;
}
const nouvelleBase = (o) => Object.assign({ avecColonne: true, ligne: { id: 'u1', username: 'aurel', jeu_actif: true, bilans_annonces: [] } }, o || {});

describe('L’annonce d’un bilan ne revient pas sur un autre appareil', () => {
  test('le 3 novembre, le premier appareil annonce octobre, et l’écrit au profil ET sur l’appareil', async () => {
    const base = nouvelleBase();
    const a = appareil(base);
    await a.demarrer();
    expect(a.annonces).toEqual(['Ton mois d’octobre est prêt.']);
    expect(base.ligne.bilans_annonces).toEqual(['2026-10']);
    expect(a.posts.some((p) => JSON.stringify(p.bilans_annonces) === '["2026-10"]')).toBe(true);
    expect(a.stock['th-v2-annonce-bilan:u1:mois:2026-10']).toBe('1');
    // Rouvert sur le même appareil : rien.
    await a.demarrer();
    expect(a.annonces).toHaveLength(1);
  });

  test('DISCRIMINANT — un deuxième appareil (mémoire vide) ne la reprend pas (avant : annoncée de nouveau)', async () => {
    const base = nouvelleBase();
    await appareil(base).demarrer();
    const b = appareil(base);                 // appareil neuf : ni cache de profil, ni mémoire
    await b.demarrer();
    expect(b.annonces).toEqual([]);
    expect(b.posts).toHaveLength(0);           // rien à écrire : la base l'a déjà
  });

  test('DISCRIMINANT — l’annonce attend la lecture du profil (un profil lent ne la fait pas revenir)', async () => {
    const base = nouvelleBase();
    await appareil(base).demarrer();
    const b = appareil(base, { lenteur: 20 });
    await b.demarrer();
    await new Promise((r) => setTimeout(r, 40));
    expect(b.annonces).toEqual([]);
  });

  test('l’année (janvier 2027) : un seul message ; l’année ET le mois écoulé sont notés au profil', async () => {
    const base = nouvelleBase();
    const a = appareil(base, { maintenant: '2027-01-02T10:00:00' });
    await a.demarrer();
    expect(a.annonces).toEqual(['Ton année 2026 est prête.']);
    expect(base.ligne.bilans_annonces).toEqual(['2026', '2026-12']);
    const b = appareil(base, { maintenant: '2027-01-03T10:00:00' });
    await b.demarrer();
    expect(b.annonces).toEqual([]);
  });

  test('la saison (1er décembre) : la saison annoncée, le mois noté vu, les deux au profil', async () => {
    const base = nouvelleBase();
    const a = appareil(base, { maintenant: '2026-12-01T10:00:00' });
    await a.demarrer();
    expect(a.annonces).toEqual(['Ta saison Saison 2026-automne est prête.']);
    expect(base.ligne.bilans_annonces).toEqual(['2026-automne', '2026-11']);
  });

  test('les périodes déjà au profil s’ajoutent sans doublon, la liste garde ses 200 dernières', async () => {
    const vieilles = Array.from({ length: 200 }, (_, i) => 'v' + i);
    const base = nouvelleBase({ ligne: { id: 'u1', username: 'aurel', jeu_actif: true, bilans_annonces: vieilles } });
    const a = appareil(base);
    await a.demarrer();
    expect(base.ligne.bilans_annonces).toHaveLength(200);
    expect(base.ligne.bilans_annonces[199]).toBe('2026-10');
    expect(base.ligne.bilans_annonces[0]).toBe('v1');
  });

  test('colonne absente en base : l’appareil retient seul (pas d’annonce répétée sur LUI)', async () => {
    const base = nouvelleBase({ avecColonne: false, ligne: { id: 'u1', username: 'aurel', jeu_actif: true } });
    const a = appareil(base);
    await a.demarrer();
    expect(a.annonces).toHaveLength(1);
    await a.demarrer();
    expect(a.annonces).toHaveLength(1);
  });

  test('hors réseau : décidée sur le profil en cache ; l’écriture attend (`profilAEnvoyer`)', async () => {
    const base = nouvelleBase();
    const a = appareil(base, { horsReseau: true, profil: { id: 'u1', username: 'aurel', bilans_annonces: [] } });
    await a.demarrer();
    expect(a.annonces).toHaveLength(1);
    expect(a.ctx.profil.bilans_annonces).toEqual(['2026-10']);
    expect(a.ctx.profilAEnvoyer).toEqual({ bilans_annonces: ['2026-10'] });   // 116 : la seule colonne du geste attend
  });

  test('profil jamais lu (aucun cache, hors réseau) : l’appareil retient, aucune ligne n’est créée d’une annonce', async () => {
    const base = nouvelleBase();
    const a = appareil(base, { horsReseau: true });
    await a.demarrer();
    expect(a.annonces).toHaveLength(1);
    expect(a.posts).toHaveLength(0);
    expect(a.ctx.profil).toBe(null);
  });

  test('mémoire d’appareil illisible : aucune annonce (jamais répétée)', async () => {
    const base = nouvelleBase();
    const a = appareil(base, { sansMemoire: true });
    await a.demarrer();
    expect(a.annonces).toEqual([]);
  });

  test('après le 7 du mois : rien', async () => {
    const base = nouvelleBase();
    const a = appareil(base, { maintenant: '2026-11-08T09:00:00' });
    await a.demarrer();
    expect(a.annonces).toEqual([]);
    expect(base.ligne.bilans_annonces).toEqual([]);
  });
});
