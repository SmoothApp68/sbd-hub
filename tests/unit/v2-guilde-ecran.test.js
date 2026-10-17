/**
 * @jest-environment jsdom
 */
// 121 (audit du 16/10/2026, 05 #19) — LA SECTION DE BANC `guilde` ÉTAIT INSTABLE SOUS CHARGE (8 passages sur 10 en échec,
// 10 en parallèle sur 2 cœurs). Trois causes, toutes dans l'app, aucune dans une attente fixe :
//   1. un geste rejoué après un rechargement disait un faux refus (05 #3 : `Attente.marquerParti`, testé ailleurs) ;
//   2. après chaque geste confirmé, l'écran se relisait en passant par « Chargement… » — le banc lisait parfois ce
//      « Chargement… » (et l'écran clignotait sur le téléphone) : la relecture garde désormais ce qu'il montre ;
//   3. un nouveau rendu recréait le champ du nom vide : ce qu'on venait de taper partait (« Créer » sans nom).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
require('../../v2/js/modele.js');
require('../../v2/js/rendu.js');
const Social = require('../../v2/js/social.js');
const Rendu = global.THRendu || window.THRendu;

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const extraire = (nom) => {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable : ' + nom);
  return m[0];
};

describe('121 — un nom en cours de saisie survit à un nouveau rendu de la guilde', () => {
  const vueCreer = () => ({ etat: 'ok', couleurs: Social.COULEURS_GUILDE, invitations: [],
    creer: { couleur: Social.COULEURS_GUILDE[0], surCouleur: () => {}, surCreer: () => {} } });
  test('⚠️ DISCRIMINANT — « Les Fers » tapé, l’écran redessiné (une lecture revient) : le champ le garde, et le curseur', () => {
    const cible = document.createElement('div');
    document.body.appendChild(cible);
    Rendu.rendreGuilde(cible, vueCreer());
    const champ = document.getElementById('guilde-nom');
    champ.value = 'Les Fers';
    champ.focus();
    Rendu.rendreGuilde(cible, Object.assign(vueCreer(), { message: 'Ce nom est déjà pris.' }));
    const nouveau = document.getElementById('guilde-nom');
    expect(nouveau).not.toBe(champ);
    expect(nouveau.value).toBe('Les Fers');
    expect(document.activeElement).toBe(nouveau);
    // Un champ qui n'existait pas avant (premier rendu) part vide.
    const autre = document.createElement('div');
    document.body.appendChild(autre);
    cible.remove();
    Rendu.rendreGuilde(autre, vueCreer());
    expect(document.getElementById('guilde-nom').value).toBe('');
  });
});

describe('121 — relue après un geste, la guilde garde ce qu’elle montre jusqu’à la nouvelle lecture', () => {
  function bac(avant) {
    let finir;
    const dessins = [];
    const ctx = {
      Routeur: { GUILDE: 'guilde' }, Social, montrer: () => {}, ouvrirEcranSocial: () => {},
      social: { guilde: avant, horloge: 9 },
      dessinerGuilde: () => dessins.push(JSON.parse(JSON.stringify({ etat: ctx.social.guilde.etat, membres: ctx.social.guilde.membres || null,
        n: ctx.social.guilde.n }))),
      chargerGuilde: (g) => new Promise((r) => { finir = () => { g.g = { nom: 'Les Fers' }; g.membres = [{ pseudo: 'neuf' }]; r(); }; }),
      erreurSociale: () => 'Il faut le réseau pour voir la guilde.'
    };
    vm.createContext(ctx);
    vm.runInContext(extraire('rendreGuilde'), ctx);
    return { ctx, dessins, finir: () => finir() };
  }
  const lue = () => ({ etat: 'ok', onglet: 'membres', couleur: '#b39ad1', n: 4, g: { nom: 'Les Fers' }, membres: [{ pseudo: 'ancien' }],
    semaine: null, invitations: [], fil: [{ session_id: 's' }], progression: [] });
  test('⚠️ DISCRIMINANT — relecture : l’écran reste « ok » avec la lecture d’avant (jamais « Chargement… »), puis la nouvelle', async () => {
    const b = bac(lue());
    b.ctx.__p = vm.runInContext('rendreGuilde(null, true)', b.ctx);
    expect(b.dessins[0]).toEqual({ etat: 'ok', membres: [{ pseudo: 'ancien' }], n: 4 });
    b.finir();
    await b.ctx.__p;
    expect(b.dessins[1]).toEqual({ etat: 'ok', membres: [{ pseudo: 'neuf' }], n: 9 });
    // Le fil, hors de son onglet, se relira à l'ouverture de l'onglet (comme avant).
    expect(b.ctx.social.guilde.fil).toBeNull();
    expect(b.ctx.social.guilde.onglet).toBe('membres');
  });
  test('une ouverture (pas une relecture) passe par « Chargement… », comme avant', () => {
    const b = bac(lue());
    vm.runInContext('rendreGuilde()', b.ctx);
    expect(b.dessins[0].etat).toBe('charge');
  });
});
