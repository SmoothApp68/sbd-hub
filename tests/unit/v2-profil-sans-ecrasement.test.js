/** @jest-environment node */
//
// 116 (audit du 16/10/2026, 03 #1) — UN RÉGLAGE DU PROFIL N'EN EFFACE JAMAIS UN AUTRE.
//
// LE DÉFAUT : chaque geste du Profil renvoyait TOUTE la ligne en cache (`champsEcrits(profil)`), et le profil ne se
// relit qu'au démarrage. Un réglage fait sur un autre appareil — ou une autre origine : la prévisualisation d'une PR
// et l'app installée — était réécrit à son ancienne valeur par le geste suivant de l'appareil resté ouvert, et la
// réponse de l'envoi rendait la perte définitive en local aussi : Ma salle, la phase, les priorités, « questionnaire
// rempli ».
//
// LE CORRECTIF : un geste n'envoie que SES colonnes (l'`upsert` de PostgREST ne touche que les colonnes reçues), et
// les gestes qui attendent (hors réseau, ou derrière un envoi en vol) fusionnent leurs colonnes au lieu de garder la
// dernière ligne entière.
//
// Les fonctions d'`app.js` se REJOUENT dans un bac `vm` par appareil, avec le vrai `Profil`, sur UNE base fausse
// partagée qui fait comme la vraie : l'`upsert` n'écrit que les colonnes reçues et rend la ligne entière.

process.env.TZ = 'Europe/Paris';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
const Profil = require('../../v2/js/profil.js');

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const extraire = (nom) => {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable : ' + nom);
  return m[0];
};
const CLE_PSEUDO_PRIS = /var CLE_PSEUDO_PRIS = '([^']+)'/.exec(APP)[1];

const SALLE = { barres_ez: [10, 15, 20, 25, 30], barres_droites: [], halteres: { max: 40, pas: 2 } };

// La base : une ligne, partagée par tous les appareils.
function creerBase(ligne) {
  return { ligne: Object.assign({ id: 'u1', username: 'aurel', phase: 'maintien', ma_salle: null, priorites: ['squat_barre'],
    questionnaire_fait_le: '2026-10-01T10:00:00.000Z', jeu_actif: true }, ligne || {}), posts: [], reseau: true };
}

// Un appareil : son cache (la ligne telle qu'il l'a lue), son attente, et les fonctions d'`app.js`.
function appareil(base, o) {
  const opt = o || {};
  const stock = {};
  const ctx = {
    console: { warn: () => {} },
    Promise, Date, Object, Array, Math, String, JSON,
    Profil,
    racine: { localStorage: { getItem: (k) => (k in stock ? stock[k] : null), setItem: (k, v) => { stock[k] = String(v); }, removeItem: (k) => { delete stock[k]; } } },
    CLE_PSEUDO_PRIS,
    texteErreur: (e) => String(e && e.message || e),
    profil: JSON.parse(JSON.stringify(base.ligne)),          // lu au démarrage
    profilAEnvoyer: opt.attente === undefined ? false : opt.attente,
    envoiProfil: null, versionProfil: 0, ligneACreer: false,
    generation: 1, generationValide: (g) => g === ctx.generation,
    ecranCourant: 'saisie', rendreProfilEcran: () => {}, dessinerAmis: () => {},
    userId: () => 'u1',
    identifiantDuProfil: async () => 'u1',
    sauverProfilLocal: async () => {},
    pseudoAInscrire: null, metadonneesDuCompte: async () => null,
    rendreBandeauQuestionnaire: () => {}, rendreBandeauPhase: () => {}, rendreCarteCycles: () => {},
    jeuSuitLeProfil: () => {}, parcoursSuitLeProfil: () => {},
    ouvrirQuestionnaireSiDu: () => {},
    Donnees: {
      monProfil: async () => JSON.parse(JSON.stringify(base.ligne)),
      enregistrerProfil: async (id, champs) => {
        base.posts.push(JSON.parse(JSON.stringify(champs)));
        if (!base.reseau) throw new Error('réseau');
        // `upsert` : seules les colonnes REÇUES changent ; la réponse est la ligne entière.
        Object.keys(champs).forEach((c) => { base.ligne[c] = JSON.parse(JSON.stringify(champs[c])); });
        return JSON.parse(JSON.stringify(base.ligne));
      }
    }
  };
  vm.createContext(ctx);
  ['retenirPseudoPris', 'effacerPseudoPris', 'envoyerProfil', 'envoyerProfilMaintenant', 'poserProfil', 'chargerProfil']
    .forEach((n) => vm.runInContext(extraire(n), ctx));
  return {
    ctx,
    poser: (champs) => { ctx.__c = champs; return vm.runInContext('poserProfil(__c)', ctx); },
    envoyer: () => vm.runInContext('envoyerProfil()', ctx),
    charger: () => vm.runInContext('chargerProfil()', ctx)
  };
}

// ═══ 1. DEUX APPAREILS ═══════════════════════════════════════════════════════
describe('116 — deux appareils : aucun des deux n’efface l’autre en base', () => {
  test('⚠️ DISCRIMINANT — A change la phase, B (ouvert avant) change Ma salle : les deux tiennent en base', async () => {
    const base = creerBase();
    const A = appareil(base);                        // l'app installée
    const B = appareil(base);                        // la prévisualisation de la PR, ouverte en même temps
    await A.poser(Profil.preparerChamps(A.ctx.profil, { phase: 'seche' }, new Date('2026-10-16T12:00:00Z')));
    expect(base.ligne.phase).toBe('seche');
    await B.poser({ ma_salle: SALLE });              // B n'a jamais relu la ligne : son cache dit encore « maintien »
    expect(base.ligne.ma_salle).toEqual(SALLE);
    expect(base.ligne.phase).toBe('seche');          // avant 116 : « maintien », réécrit par la ligne entière de B
    // Et dans l'autre sens : A, qui n'a jamais vu la salle, touche ses priorités.
    await A.poser({ priorites: ['dos'] });
    expect(base.ligne.ma_salle).toEqual(SALLE);      // avant 116 : `null`, la salle disparaissait
    expect(base.ligne).toMatchObject({ phase: 'seche', priorites: ['dos'], questionnaire_fait_le: '2026-10-01T10:00:00.000Z' });
  });

  test('chaque envoi ne porte QUE les colonnes de son geste', async () => {
    const base = creerBase();
    const B = appareil(base);
    await B.poser({ ma_salle: SALLE });
    expect(base.posts).toEqual([{ ma_salle: SALLE }]);
  });

  test('la réponse de l’envoi apporte en local ce qui a changé ailleurs (la ligne entière de la base)', async () => {
    const base = creerBase();
    const A = appareil(base);
    const B = appareil(base);
    await A.poser({ priorites: ['dos'] });
    await B.poser({ ma_salle: SALLE });
    expect(B.ctx.profil.priorites).toEqual(['dos']);   // B l'apprend de la réponse, sans relecture
    expect(B.ctx.profilAEnvoyer).toBe(false);
  });

  test('« questionnaire rempli » posé ailleurs ne revient pas à vide', async () => {
    const base = creerBase({ questionnaire_fait_le: null });
    const B = appareil(base);                          // ouvert quand le questionnaire n'était pas rempli
    base.ligne.questionnaire_fait_le = '2026-10-16T09:00:00.000Z';   // rempli sur l'autre appareil
    await B.poser({ temps_reponse: 'max' });
    expect(base.ligne.questionnaire_fait_le).toBe('2026-10-16T09:00:00.000Z');
  });
});

// ═══ 2. L'ATTENTE FUSIONNE LES GESTES ═══════════════════════════════════════
describe('116 — les gestes qui attendent fusionnent leurs colonnes', () => {
  test('⚠️ deux gestes hors réseau : un seul envoi au retour, avec les deux colonnes et rien d’autre', async () => {
    const base = creerBase();
    base.reseau = false;
    const B = appareil(base);
    await B.poser({ ma_salle: SALLE });
    await B.poser({ temps_reponse: 'max' });
    expect(B.ctx.profilAEnvoyer).toEqual({ ma_salle: SALLE, temps_reponse: 'max' });
    base.ligne.phase = 'seche';                        // posée ailleurs pendant ce temps
    base.reseau = true;
    base.posts.length = 0;
    await B.envoyer();
    expect(base.posts).toEqual([{ ma_salle: SALLE, temps_reponse: 'max' }]);
    expect(base.ligne.phase).toBe('seche');
    expect(B.ctx.profilAEnvoyer).toBe(false);
  });

  test('la même colonne touchée deux fois : la dernière valeur part', async () => {
    const base = creerBase();
    base.reseau = false;
    const B = appareil(base);
    await B.poser({ temps_reponse: 'max' });
    await B.poser({ temps_reponse: 'varie' });
    base.reseau = true;
    base.posts.length = 0;
    await B.envoyer();
    expect(base.posts).toEqual([{ temps_reponse: 'varie' }]);
  });

  test('au démarrage, une attente part SANS la ligne en cache (`chargerProfil`)', async () => {
    const base = creerBase({ phase: 'seche' });
    const B = appareil(base, { attente: { temps_reponse: 'max' } });
    B.ctx.profil.phase = 'maintien';                   // le cache de B est plus vieux que la base
    await B.charger();
    expect(base.posts).toEqual([{ temps_reponse: 'max' }]);
    expect(base.ligne.phase).toBe('seche');
    expect(B.ctx.profil.phase).toBe('seche');          // et le cache prend la vérité de la base
  });

  test('la forme d’avant 116 (`true`, gardée sur l’appareil) : la ligne entière part UNE fois, puis plus rien', async () => {
    const base = creerBase();
    const B = appareil(base, { attente: true });
    B.ctx.profil.temps_reponse = 'max';
    await B.envoyer();
    expect(base.posts).toHaveLength(1);
    expect(base.posts[0]).toMatchObject({ temps_reponse: 'max', phase: 'maintien' });
    expect(B.ctx.profilAEnvoyer).toBe(false);
    await B.poser({ bio: 'x' });
    expect(base.posts[1]).toEqual({ bio: 'x' });
  });

  test('un geste sans colonne écrite (un booléen non nul à `null`) n’envoie rien', async () => {
    const base = creerBase();
    const B = appareil(base);
    await B.poser({ jeu_actif: null });
    expect(base.posts).toEqual([]);
    expect(B.ctx.profilAEnvoyer).toBe(false);
    await B.poser({ jeu_actif: false });
    expect(base.posts).toEqual([{ jeu_actif: false }]);
  });
});

// ═══ 3. LES FONCTIONS PURES ═════════════════════════════════════════════════
describe('Profil.fusionnerEnAttente / champsEnAttente / retirerEnvoyes / lireEnAttente', () => {
  test('fusion : les colonnes s’ajoutent, la plus récente l’emporte, la liste blanche filtre', () => {
    expect(Profil.fusionnerEnAttente(false, { phase: 'seche' })).toEqual({ phase: 'seche' });
    expect(Profil.fusionnerEnAttente({ phase: 'seche' }, { phase: 'maintien', bio: 'x' })).toEqual({ phase: 'maintien', bio: 'x' });
    expect(Profil.fusionnerEnAttente({ phase: 'seche' }, { is_admin: true })).toEqual({ phase: 'seche' });
    expect(Profil.fusionnerEnAttente(false, { is_admin: true })).toBe(false);
    expect(Profil.fusionnerEnAttente(true, { bio: 'x' })).toBe(true);
  });

  test('ce qui part : l’attente filtrée, ou la ligne entière pour `true`', () => {
    const profil = { id: 'u1', phase: 'seche', bio: 'x', is_admin: true };
    expect(Profil.champsEnAttente({ bio: 'y' }, profil)).toEqual({ bio: 'y' });
    expect(Profil.champsEnAttente(true, profil)).toEqual({ phase: 'seche', bio: 'x' });
    expect(Profil.champsEnAttente(false, profil)).toEqual({});
  });

  test('retrait : seulement ce qui vaut encore ce qui est parti', () => {
    expect(Profil.retirerEnvoyes({ bio: 'x' }, { bio: 'x' })).toBe(false);
    expect(Profil.retirerEnvoyes({ bio: 'y', phase: 'seche' }, { bio: 'x' })).toEqual({ bio: 'y', phase: 'seche' });
    expect(Profil.retirerEnvoyes({ ma_salle: SALLE }, { ma_salle: JSON.parse(JSON.stringify(SALLE)) })).toBe(false);
    expect(Profil.retirerEnvoyes(true, { bio: 'x' })).toBe(true);
    expect(Profil.retirerEnvoyes(false, { bio: 'x' })).toBe(false);
  });

  test('relue sur l’appareil : un objet non vide ou `true`, sinon rien', () => {
    expect(Profil.lireEnAttente(true)).toBe(true);
    expect(Profil.lireEnAttente({ bio: 'x' })).toEqual({ bio: 'x' });
    [false, null, undefined, {}, [], 'x', 1].forEach((v) => expect(Profil.lireEnAttente(v)).toBe(false));
  });
});

// ═══ 4. LES COLONNES FACULTATIVES (donnees.js) ══════════════════════════════
// Une attente qui ne porte QUE `ma_salle`, sur une base sans la colonne (migration pas lancée) : l'envoi repart sans
// elle — une ligne réduite à `id` et `updated_at`, qui ne touche rien — et ne boucle pas.
describe('116 — un envoi réduit à une colonne facultative absente', () => {
  test('repart sans elle, n’écrit rien d’autre, et rend la ligne', async () => {
    const etat = { ligne: { id: 'u1', phase: 'seche' }, ecritures: [] };
    const client = {
      from() {
        const q = {};
        const c = {
          select(cols) { q.cols = cols; return c; }, eq() { return c; }, single() { return c; }, maybeSingle() { return c; },
          upsert(l) { q.upsert = l; return c; },
          then(res, rej) {
            let r;
            if (q.upsert && Object.prototype.hasOwnProperty.call(q.upsert, 'ma_salle')) {
              r = { data: null, error: { code: 'PGRST204', message: "Could not find the 'ma_salle' column of 'profiles' in the schema cache" } };
            } else if (/ma_salle/.test(q.cols || '')) {
              r = { data: null, error: { code: '42703', message: 'column profiles.ma_salle does not exist' } };
            } else {
              if (q.upsert) { etat.ecritures.push(Object.assign({}, q.upsert)); }
              r = { data: Object.assign({}, etat.ligne), error: null };
            }
            return Promise.resolve(r).then(res, rej);
          }
        };
        return c;
      }
    };
    global.THClient = { obtenir: () => client };
    let D;
    jest.isolateModules(() => { D = require('../../v2/js/donnees.js'); });
    const r = await D.enregistrerProfil('u1', Profil.champsEnAttente({ ma_salle: SALLE }, {}));
    expect(r).toEqual({ id: 'u1', phase: 'seche' });
    expect(etat.ecritures).toHaveLength(1);
    expect(Object.keys(etat.ecritures[0]).sort()).toEqual(['id', 'updated_at']);
  });
});
