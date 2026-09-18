/** @jest-environment node */
//
// v2/js/donnees.js — la sonde de disponibilité d'un pseudo (chantier 46 §2).
//
// ══ POURQUOI CE FICHIER EXISTE ═════════════════════════════════════════════
//
// « Libre » et « on ne sait pas » se TAISENT tous les deux à l'écran, et c'est
// voulu : « libre » est l'état normal, et une pastille verte sur la normale
// banaliserait le rouge du refus. Aucune vérification d'écran ne peut donc les
// distinguer — une mutation qui rend `false` au lieu de `null` sur un échec y
// survit sans rien casser de visible.
//
// La différence est RÉELLE quand même : `false` affirme que la base a répondu
// « ce pseudo est libre », `null` dit qu'on n'a pas pu poser la question. C'est
// à la couche qui pose la question de le tenir, donc c'est ici qu'on le mesure.
//
// ══ CONFIGURATION DISCRIMINANTE ════════════════════════════════════════════
//
// Vérifié en base le 18/09 : `profiles_select_own` est `auth.uid() = id`,
// `public_profiles` est en `security_invoker=on`, `anon` n'a aucun GRANT. La
// fonction `pseudo_libre` n'existe PAS — PostgREST répond donc PGRST202. Le
// banc reproduit ce 404 ; ce fichier distingue en plus le 404 DÉFINITIF (qui
// arme le disjoncteur) de la panne PASSAGÈRE (qui ne l'arme pas), ce qu'un
// banc à réponse unique ne peut pas faire.

function charger(reponses) {
  // Module neuf à chaque test : le disjoncteur est un état de module, et un
  // test qui hériterait de l'état du précédent ne prouverait rien.
  jest.resetModules();
  const appels = [];
  global.THClient = {
    obtenir: () => ({
      rpc: (nom, args) => {
        appels.push({ nom, args });
        const r = reponses.shift();
        if (!r) throw new Error('réponse non prévue par le test');
        return Promise.resolve(r);
      }
    })
  };
  const D = require('../../v2/js/donnees.js');
  return { D, appels };
}

afterEach(() => { delete global.THClient; });

describe('« ce pseudo est-il pris ? » — trois réponses, pas deux', () => {
  test('la base dit libre → « pas pris »', async () => {
    const { D, appels } = charger([{ data: true, error: null }]);
    await expect(D.pseudoPris('melodie')).resolves.toBe(false);
    expect(appels[0]).toEqual({ nom: 'pseudo_libre', args: { nom: 'melodie' } });
  });

  test('la base dit occupé → « pris »', async () => {
    const { D } = charger([{ data: false, error: null }]);
    await expect(D.pseudoPris('melodie')).resolves.toBe(true);
  });

  // ⚠️ LE CŒUR DE CE FICHIER. Aujourd'hui `pseudo_libre` n'existe pas en base :
  // c'est CE chemin qui court en vrai, pour tout le monde. Rendre `false`
  // affirmerait « la base dit que c'est libre » — le contraire de la vérité.
  test('la fonction n’existe pas (PGRST202) → « on ne sait pas », jamais « libre »', async () => {
    const { D } = charger([{ data: null, error: { code: 'PGRST202', message: 'not found' } }]);
    const r = await D.pseudoPris('melodie');
    expect(r).toBe(null);
    expect(r).not.toBe(false);
  });

  test('un refus de droit aussi → « on ne sait pas »', async () => {
    const { D } = charger([{ data: null, error: { code: '42501', message: 'permission denied' } }]);
    await expect(D.pseudoPris('melodie')).resolves.toBe(null);
  });

  // ⚠️ LE DISJONCTEUR, ET SA LIMITE. Une réponse « cette fonction n'existe pas »
  // ne changera pas de la session : on cesse de la redemander à chaque frappe.
  test('une absence DÉFINITIVE n’est demandée qu’une fois', async () => {
    const { D, appels } = charger([{ data: null, error: { code: 'PGRST202', message: 'x' } }]);
    await D.pseudoPris('melodie');
    await D.pseudoPris('melodie_2');
    await D.pseudoPris('melodie_3');
    expect(appels).toHaveLength(1);
  });

  // …mais une panne PASSAGÈRE, elle, se repose. Armer le disjoncteur sur un
  // réseau qui tousse condamnerait la vérification pour toute la session, alors
  // que la frappe suivante aurait sa réponse.
  test('une panne passagère, elle, sera reposée à la frappe suivante', async () => {
    const { D, appels } = charger([
      { data: null, error: { message: 'TypeError: Failed to fetch' } },
      { data: true, error: null }
    ]);
    await expect(D.pseudoPris('melodie')).resolves.toBe(null);
    await expect(D.pseudoPris('melodie')).resolves.toBe(false);
    expect(appels).toHaveLength(2);
  });

  test('une réponse qui n’est pas un booléen ne se lit pas comme un booléen', async () => {
    const { D } = charger([{ data: 'oui', error: null }]);
    await expect(D.pseudoPris('melodie')).resolves.toBe(null);
  });

  test('un nom vide ne coûte pas une requête', async () => {
    const { D, appels } = charger([]);
    await expect(D.pseudoPris('')).resolves.toBe(null);
    expect(appels).toHaveLength(0);
  });
});

describe('supprimer son compte', () => {
  // ⚠️ LA FONCTION DE BASE, PAS UNE SUITE DE DELETE. Elle sait ce qui part ;
  // réécrire la suppression côté client, c'est ainsi qu'on en oublie un — et
  // c'est le défaut RGPD que la v1 a payé (CLAUDE.md §11, P0).
  test('elle passe par `delete_user_complete_data`, avec l’identifiant', async () => {
    const { D, appels } = charger([{ data: null, error: null }]);
    await D.supprimerCompte('6e2936e7-de11-4f19-89b1-d1eb5968ba35');
    expect(appels).toEqual([{ nom: 'delete_user_complete_data',
      args: { target_user_id: '6e2936e7-de11-4f19-89b1-d1eb5968ba35' } }]);
  });

  // Un échec de suppression ne doit PAS être avalé : l'écran promet que tout
  // part, et il ne doit pas le promettre à tort.
  test('un échec remonte, il n’est jamais avalé', async () => {
    const { D } = charger([{ data: null, error: { message: 'boom' } }]);
    await expect(D.supprimerCompte('u1')).rejects.toBeTruthy();
  });
});
