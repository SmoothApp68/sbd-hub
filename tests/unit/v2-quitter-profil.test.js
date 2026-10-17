/** @jest-environment node */
//
// 60-2c — « QUITTER » COMPTE LES RÉPONSES DE PROFIL PAS ENCORE ENVOYÉES.
//
// LE DÉFAUT (relevé en 60-2a, 60-2b) : les écritures du profil ne passent pas par la file d'envoi
// (`attente`) ; leur seul témoin est le drapeau `profilAEnvoyer`, levé dès le geste et baissé par un
// envoi confirmé. `Quitter.quitter` ne regardait que la file : une réponse de profil donnée hors ligne
// était perdue en silence, alors que la fenêtre de sortie existe précisément pour ça.
//
// LE CORRECTIF : `enAttente` compte aussi « profil pas encore envoyé » (dans `autres`, même phrase) et
// la vidange de « Quitter » envoie le profil avec le reste, dans la même course de 15 s.
//
// Ici, les fonctions d'`app.js` se REJOUENT dans un bac `vm` avec le VRAI module `Quitter`, le vrai
// `Profil`, et une base fausse : c'est le branchement — `quitterSansRienPerdre`,
// `envoyerAvantDeQuitter`, `poserProfil`, `envoyerProfil` — qui est testé, pas les stubs.

process.env.TZ = 'Europe/Paris';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
const Profil = require('../../v2/js/profil.js');
const Quitter = require('../../v2/js/quitter.js');

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const extraire = (nom) => {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable : ' + nom);
  return m[0];
};

const TITRE = 'Des changements pas encore envoyés.';

// La course de 15 s laisse son minuteur courir après le verdict : on les range et on les arrête, sinon
// jest attend la fin du plus long.
const minuteries = [];
afterEach(() => { minuteries.splice(0).forEach((h) => clearTimeout(h)); });

function bac(o) {
  const opt = o || {};
  const etat = { reseau: opt.reseau !== false, posts: [], fenetres: [], deconnexions: 0, choix: opt.choix || 'rester' };
  const ctx = {
    console: { warn: () => {} },
    Promise, Date, Object, Array, Math,
    setTimeout: (f, ms) => { const h = setTimeout(f, ms); minuteries.push(h); return h; },
    Quitter, Profil,
    racine: { navigator: { get onLine() { return etat.reseau; } } },
    attente: opt.attente || [],
    vidangeEnCours: false,
    // 118 — les messages du groupe écrits hors ligne (leur propre file) : vide ici.
    grp: { file: [] }, envoyerFileGroupe: async () => {},
    profil: { id: 'u1', temps_reponse: 'marge' }, profilAEnvoyer: false, envoiProfil: null, versionProfil: 0, ligneACreer: false,
    rendreBandeauQuestionnaire: () => {}, ouvrirQuestionnaireSiDu: () => false,
    generation: 1, generationValide: (g) => g === ctx.generation,
    ecranCourant: 'saisie', rendreProfilEcran: () => {}, objectifsSuiventLeProfil: () => {},
    userId: () => 'u1',
    identifiantDuProfil: async () => 'u1',
    sauverProfilLocal: async () => {},
    vidanger: async () => { etat.vidanges = (etat.vidanges || 0) + 1; },
    Donnees: {
      enregistrerProfil: async (id, champs) => {
        if (!etat.reseau) throw new Error('réseau');
        if (opt.ne_repond_pas) return new Promise(() => {});
        etat.posts.push(champs);
        return Object.assign({ id }, champs);
      }
    },
    montrerFenetreDeSortie: async (vue) => { etat.fenetres.push(vue); return etat.choix; },
    deconnecter: async () => { etat.deconnexions++; ctx.profil = null; ctx.profilAEnvoyer = false; }
  };
  vm.createContext(ctx);
  ['quitterSansRienPerdre', 'envoyerAvantDeQuitter', 'envoyerProfil', 'envoyerProfilMaintenant', 'poserProfil']
    .forEach((n) => vm.runInContext(extraire(n), ctx));
  return {
    ctx, etat,
    repondre: (champs) => { ctx.__c = champs; return vm.runInContext('poserProfil(__c)', ctx); },
    quitter: () => vm.runInContext('quitterSansRienPerdre()', ctx),
    envoyerAvant: () => vm.runInContext('envoyerAvantDeQuitter()', ctx)
  };
}

describe('« Quitter » et une réponse de profil donnée HORS LIGNE', () => {
  test('prémisse — hors ligne, la réponse reste locale et le drapeau levé (rien n’est parti)', async () => {
    const b = bac({ reseau: false });
    await b.repondre({ temps_reponse: 'max' });
    expect(b.ctx.profilAEnvoyer).toEqual({ temps_reponse: 'max' });   // 116 : les colonnes du geste attendent
    expect(b.ctx.profil.temps_reponse).toBe('max');
    expect(b.etat.posts).toEqual([]);
  });

  test('⚠️ DISCRIMINANT — « Quitter » montre la fenêtre « Des changements pas encore envoyés. » ; la file est pourtant vide', async () => {
    const b = bac({ reseau: false, choix: 'rester' });
    await b.repondre({ temps_reponse: 'max' });
    expect(b.ctx.attente).toEqual([]);
    expect(await b.quitter()).toBe('reste');
    expect(b.etat.fenetres).toEqual([{ titre: TITRE, aide: 'Si tu quittes maintenant, ils sont perdus.',
      rester: 'Rester', quitter: 'Quitter quand même' }]);
    expect(b.etat.deconnexions).toBe(0);
  });

  test('⚠️ DISCRIMINANT — « Rester » ne perd RIEN : la réponse, le drapeau, le profil local sont intacts', async () => {
    const b = bac({ reseau: false, choix: 'rester' });
    await b.repondre({ temps_reponse: 'max' });
    await b.quitter();
    expect(b.ctx.profilAEnvoyer).toEqual({ temps_reponse: 'max' });   // 116 : les colonnes du geste attendent
    expect(b.ctx.profil).toMatchObject({ id: 'u1', temps_reponse: 'max' });
    expect(b.etat.deconnexions).toBe(0);
    // Le réseau revient : la réponse part (le gestionnaire `online` fait `envoyerProfil()`).
    b.etat.reseau = true;
    await vm.runInContext('envoyerProfil()', b.ctx);
    expect(b.etat.posts.map((p) => p.temps_reponse)).toEqual(['max']);
    expect(b.ctx.profilAEnvoyer).toBe(false);
  });

  test('« Quitter quand même » : alors seulement l’appareil est vidé (la réponse part avec lui — voulu)', async () => {
    const b = bac({ reseau: false, choix: 'quitter' });
    await b.repondre({ temps_reponse: 'max' });
    expect(await b.quitter()).toBe('quitte');
    expect([b.etat.fenetres.length, b.etat.deconnexions, b.ctx.profilAEnvoyer]).toEqual([1, 1, false]);
  });
});

describe('« Quitter » et le réseau qui REVIENT (sans l’évènement `online`)', () => {
  test('⚠️ DISCRIMINANT — la vidange de « Quitter » ENVOIE la réponse de profil, puis on quitte sans fenêtre', async () => {
    const b = bac({ reseau: false });
    await b.repondre({ temps_reponse: 'max' });          // hors ligne : le drapeau reste levé
    b.etat.reseau = true;                                // le réseau est revenu ; personne n'a appelé `online`
    expect(b.ctx.profilAEnvoyer).toEqual({ temps_reponse: 'max' });   // 116 : les colonnes du geste attendent
    expect(await b.quitter()).toBe('quitte');
    expect(b.etat.posts.map((p) => p.temps_reponse)).toEqual(['max']);   // la réponse est PARTIE
    expect(b.etat.fenetres).toEqual([]);                                 // sans fenêtre
    expect(b.etat.deconnexions).toBe(1);
  });

  test('en ligne mais le serveur refuse : la fenêtre, et rien n’est perdu en la fermant sur « Rester »', async () => {
    const b = bac({ reseau: false, choix: 'rester' });
    await b.repondre({ temps_reponse: 'max' });
    // Le réseau « est là » pour `navigator.onLine`, pas pour le serveur : l'envoi du profil échoue (et avale l'échec).
    b.ctx.racine.navigator = { onLine: true };
    expect(await b.quitter()).toBe('reste');
    expect(b.etat.fenetres.map((v) => v.titre)).toEqual([TITRE]);
    expect(b.ctx.profilAEnvoyer).toEqual({ temps_reponse: 'max' });   // 116 : les colonnes du geste attendent
    expect(b.etat.deconnexions).toBe(0);
  });

  test('rien en attente (ni file ni profil) : « Quitter » sort sans envoi ni fenêtre, comme avant', async () => {
    const b = bac({});
    expect(await b.quitter()).toBe('quitte');
    expect([b.etat.vidanges || 0, b.etat.posts.length, b.etat.fenetres.length, b.etat.deconnexions]).toEqual([0, 0, 0, 1]);
  });
});

describe('`envoyerAvantDeQuitter` : le profil part avec la vidange, dans la même course de 15 s', () => {
  test('le profil n’est envoyé que si une réponse attend', async () => {
    const b = bac({});
    await b.envoyerAvant();
    expect(b.etat.posts).toEqual([]);                    // rien à envoyer : pas d'écriture inutile
    expect(b.etat.vidanges).toBe(1);
    b.ctx.profilAEnvoyer = true;
    await b.envoyerAvant();
    expect(b.etat.posts).toHaveLength(1);
    expect(b.ctx.profilAEnvoyer).toBe(false);
  });

  test('⚠️ DISCRIMINANT — un serveur qui ne répond JAMAIS ne fige pas « Quitter » : la course rend la main à 15 s', async () => {
    jest.useFakeTimers();
    try {
      const b = bac({ ne_repond_pas: true });
      b.ctx.profilAEnvoyer = true;
      let fini = false;
      const p = b.envoyerAvant().then(() => { fini = true; });
      await jest.advanceTimersByTimeAsync(14000);
      expect(fini).toBe(false);                          // encore dans la course
      await jest.advanceTimersByTimeAsync(1500);
      await p;
      expect(fini).toBe(true);
      expect(b.ctx.profilAEnvoyer).toBe(true);           // jamais confirmé : la fenêtre le dira
    } finally { jest.useRealTimers(); }
  });
});

describe('`envoyerAvantDeQuitter` : le profil ne dépend pas de la vidange (relecture adverse de 60-2c)', () => {
  test('⚠️ DISCRIMINANT — une vidange LENTE (déjà en cours) ne mange pas le budget du profil : il part tout de suite', async () => {
    jest.useFakeTimers();
    try {
      const b = bac({});
      b.ctx.vidangeEnCours = true;                       // une vidange tient le verrou, longtemps
      b.ctx.profilAEnvoyer = true;
      let fini = false;
      const p = b.envoyerAvant().then(() => { fini = true; });
      await jest.advanceTimersByTimeAsync(300);          // 0,3 s : bien avant la fin du budget de 15 s
      expect(b.etat.posts).toHaveLength(1);              // le profil est PARTI, pendant qu'on attend la vidange
      expect(b.ctx.profilAEnvoyer).toBe(false);
      expect(fini).toBe(false);                          // et « Quitter » attend toujours la vidange
      b.ctx.vidangeEnCours = false;
      await jest.advanceTimersByTimeAsync(200);
      await p;
      expect(fini).toBe(true);
    } finally { jest.useRealTimers(); }
  });

  test('un envoi de profil qui échoue n’empêche pas la vidange, et ne laisse aucun rejet non géré', async () => {
    const b = bac({ reseau: false });
    b.ctx.profilAEnvoyer = true;
    await b.envoyerAvant();
    expect(b.etat.vidanges).toBe(1);
    expect(b.ctx.profilAEnvoyer).toBe(true);             // jamais confirmé : la fenêtre le dira
  });
});

describe('GARDES — le branchement', () => {
  test('`quitterSansRienPerdre` donne le drapeau du profil à « Quitter »', () => {
    expect(extraire('quitterSansRienPerdre')).toMatch(/profil:\s*function\s*\(\)\s*\{\s*return profilAEnvoyer;\s*\}/);
  });

  test('l’envoi du profil est DANS la course bornée (`Promise.race`), jamais un `await` nu', () => {
    const f = extraire('envoyerAvantDeQuitter');
    expect(f).toMatch(/envoyerProfil\(\)/);
    expect(f).toMatch(/Promise\.race\(\[Promise\.all\(envois\)/);
    // … et il part AVANT l'attente de la vidange en cours.
    expect(f.indexOf('envoyerProfil()')).toBeLessThan(f.indexOf('while (vidangeEnCours'));
    expect(f).not.toMatch(/await envoyerProfil\(\)/);
  });

  test('« Quitter quand même » remet toujours le profil à zéro (`deconnecter`, inchangée)', () => {
    const f = extraire('deconnecter');
    expect(f).toMatch(/profilAEnvoyer = false/);
    expect(f).toMatch(/fermerQuestionnaire\(\); envoiProfil = null/);
  });
});
