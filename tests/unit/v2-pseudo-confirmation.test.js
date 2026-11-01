/** @jest-environment node */
//
// 60-3b — LE PSEUDO TRAVERSE LA CONFIRMATION D'E-MAIL (ECRAN-PROFIL §3.1, précisé le 08/10/2026).
//
// Le lien de confirmation s'ouvre souvent dans une autre page : la mémoire de l'inscription
// (`pseudoAInscrire`) n'y existe plus. Le pseudo voyage avec le compte (`options.data.pseudo`), et la
// création de la ligne de profil le reprend — UN SEUL ENDROIT choisit (`Profil.pseudoDeLInscription`).
// Pris entre-temps : la ligne se crée sans lui, et la ligne « Pseudo » du Profil le dit.
//
// Ici : la règle pure, la ligne de l'écran, l'état retenu en local par compte. La création de la ligne
// elle-même (`chargerProfil`) est rejouée dans `v2-profil-identifiant.test.js` ; le parcours complet,
// deux pages, dans le banc de création du profil.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { profilEcran, extraire } = require('./aide-profil-ecran');

let Profil;
beforeAll(() => {
  require('../../v2/js/modele.js');
  Profil = require('../../v2/js/profil.js');
});

describe('60-3b — Profil.pseudoDeLInscription : celui de la page, sinon celui du compte', () => {
  test('la mémoire de la page d’abord', () => {
    expect(Profil.pseudoDeLInscription('melodie', { pseudo: 'autre' })).toBe('melodie');
  });

  test('⚠️ la mémoire a disparu (le lien s’ouvre dans une autre page) : celui du compte', () => {
    expect(Profil.pseudoDeLInscription(null, { pseudo: 'melodie' })).toBe('melodie');
    expect(Profil.pseudoDeLInscription(undefined, { pseudo: 'melodie' })).toBe('melodie');
    expect(Profil.pseudoDeLInscription('', { pseudo: 'melodie' })).toBe('melodie');
  });

  test('⚠️ celui du compte est normalisé de nouveau, par la même fonction', () => {
    expect(Profil.pseudoDeLInscription(null, { pseudo: '  Mélodie Dupont ' })).toBe('melodie_dupont');
    expect(Profil.pseudoDeLInscription(null, { pseudo: 'MÉLO-DIE' })).toBe(Profil.normaliserPseudo('MÉLO-DIE'));
    expect(Profil.pseudoDeLInscription(null, { pseudo: 'x'.repeat(40) })).toBe('x'.repeat(20));
  });

  test('⚠️ les données d’un compte ne sont pas une valeur de confiance : un pseudo qui n’en est pas un est ignoré', () => {
    ['ab', '1abc', '___', '', '  ', 'é', 42, true, {}, [], ['melodie'], null].forEach((v) => {
      expect([v, Profil.pseudoDeLInscription(null, { pseudo: v })]).toEqual([v, null]);
    });
  });

  test('une mémoire inutilisable laisse la main au compte, pas l’inverse', () => {
    expect(Profil.pseudoDeLInscription('ab', { pseudo: 'melodie' })).toBe('melodie');
    expect(Profil.pseudoDeLInscription('melodie', { pseudo: 'ab' })).toBe('melodie');
  });

  test('aucune donnée, aucune mémoire, des données qui ne sont pas un objet : null', () => {
    expect(Profil.pseudoDeLInscription(null, null)).toBeNull();
    expect(Profil.pseudoDeLInscription(null, undefined)).toBeNull();
    expect(Profil.pseudoDeLInscription(null, {})).toBeNull();
    expect(Profil.pseudoDeLInscription(null, 'melodie')).toBeNull();
    expect(Profil.pseudoDeLInscription()).toBeNull();
  });
});

describe('60-3b — Profil.lignePseudo : « pris entre-temps »', () => {
  const surChoix = () => {};

  test('⚠️ pris entre-temps ET aucun pseudo posé : la phrase du delta', () => {
    const l = Profil.lignePseudo({ username: null }, true, surChoix);
    expect(l.libelle).toBe('Pseudo');
    expect(l.valeur).toBeNull();
    expect(l.sous).toBe('Ce pseudo vient d’être pris : choisis-en un autre.');
    expect(l.surChoix).toBe(surChoix);
  });

  // 60-5 : `lignePseudo` ne décide plus SI l'état parle encore de cette ligne — c'est `app.js` (`pseudoPrisSignale`, qui
  // compare au pseudo que la ligne portait au refus). Quand on lui dit que l'état se tient, elle le dit, avec ou sans
  // pseudo posé : un ancien pseudo qui est revenu sans un mot était le défaut relevé à la relecture.
  test('(60-5) l’état se tient ET un pseudo est posé (l’ancien est revenu) : la ligne montre ce pseudo ET la phrase', () => {
    const l = Profil.lignePseudo({ username: 'melodie' }, true, surChoix);
    expect(l.valeur).toBe('melodie');
    expect(l.sous).toBe(Profil.PHRASE_PSEUDO_PRIS);
  });

  test('un pseudo posé, l’état ne se tient pas : plus de phrase', () => {
    const l = Profil.lignePseudo({ username: 'melodie' }, false, surChoix);
    expect(l.valeur).toBe('melodie');
    expect(l.sous).toBeNull();
  });

  test('pas pris entre-temps : « à renseigner » sans phrase', () => {
    expect(Profil.lignePseudo({ username: null }, false, surChoix).sous).toBeNull();
    expect(Profil.lignePseudo({}, false, surChoix).valeur).toBeNull();
    expect(Profil.lignePseudo(null, false, surChoix).sous).toBeNull();
  });

  test('un profil absent, l’état retenu : la phrase se dit (aucun pseudo n’est posé)', () => {
    expect(Profil.lignePseudo(null, true, surChoix).sous).toBe(Profil.PHRASE_PSEUDO_PRIS);
  });
});

describe('60-3b — la ligne « Pseudo » de l’écran Profil', () => {
  const ligne = (e) => e.section('MON PROFIL').lignes.filter((l) => l && l.libelle === 'Pseudo')[0];

  test('⚠️ pris entre-temps et sans pseudo : l’écran porte la phrase, et un tap ouvre la saisie du pseudo', () => {
    const e = profilEcran({ id: 'B', username: null }, { pseudoPris: true });
    expect(ligne(e).sous).toBe('Ce pseudo vient d’être pris : choisis-en un autre.');
    expect(ligne(e).valeur).toBeNull();
    expect(typeof ligne(e).surChoix).toBe('function');
  });

  test('un pseudo posé et l’état qui se tient (l’ancien est revenu) : l’écran montre le pseudo ET la phrase ; sinon, le pseudo seul', () => {
    const e = profilEcran({ id: 'B', username: 'melodie' }, { pseudoPris: true });
    expect(ligne(e).valeur).toBe('melodie');
    expect(ligne(e).sous).toBe('Ce pseudo vient d’être pris : choisis-en un autre.');
    const sans = profilEcran({ id: 'B', username: 'melodie' }, { pseudoPris: false });
    expect(ligne(sans).valeur).toBe('melodie');
    expect(ligne(sans).sous).toBeNull();
  });

  test('sans l’état retenu : « à renseigner », sans la phrase', () => {
    const e = profilEcran({ id: 'B', username: null }, { pseudoPris: false });
    expect(ligne(e).valeur).toBeNull();
    expect(ligne(e).sous).toBeNull();
  });
});

// ── L'ÉTAT RETENU EN LOCAL, PAR COMPTE ─────────────────────────────────────────
function stockage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => Array.from(m.keys())[i] || null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _m: m
  };
}

function retention(stock, idCourant, profilCourant) {
  const ctx = { racine: { localStorage: stock }, userId: () => idCourant, profil: profilCourant || null };
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
  const cle = src.match(/^ {2}var CLE_PSEUDO_PRIS = [^\n]+/m);
  if (!cle) throw new Error('introuvable : CLE_PSEUDO_PRIS');
  vm.runInContext(cle[0] + '\n' + extraire('retenirPseudoPris') + '\n' + extraire('effacerPseudoPris') + '\n' + extraire('pseudoPrisSignale'), ctx);
  return ctx;
}

// 60-5 — L'ÉTAT SE RETIENT AVEC LE PSEUDO QUE LA LIGNE PORTAIT AU REFUS : aucun (`'1'`, la forme de 60-3b) ou l'ancien
// (`'p:' + pseudo`). La phrase ne parle que de CETTE ligne-là.
describe('60-5 — « pris entre-temps » parle de la ligne qui a été refusée, pas d’une autre', () => {
  test('aucun pseudo au refus : la phrase se dit tant qu’aucun pseudo n’est posé, et s’en va dès qu’il y en a un (60-3b, inchangé)', () => {
    const st = stockage();
    retention(st, 'A').retenirPseudoPris('A');                                  // aucun pseudo tenu
    expect(retention(st, 'A', { username: null }).pseudoPrisSignale()).toBe(true);
    expect(retention(st, 'A', { username: '' }).pseudoPrisSignale()).toBe(true);
    expect(retention(st, 'A', { username: 'bob' }).pseudoPrisSignale()).toBe(false);   // posé depuis (ici ou ailleurs)
    expect(st._m.get('th-v2-pseudo-pris-A')).toBe('1');
  });

  test('⚠️ DISCRIMINANT — l’ancien pseudo est revenu : la phrase se dit tant que la ligne porte CE pseudo-là', () => {
    const st = stockage();
    retention(st, 'A').retenirPseudoPris('A', 'alice');
    expect(st._m.get('th-v2-pseudo-pris-A')).toBe('p:alice');
    expect(retention(st, 'A', { username: 'alice' }).pseudoPrisSignale()).toBe(true);
    expect(retention(st, 'A', { username: 'carol' }).pseudoPrisSignale()).toBe(false);  // un autre pseudo, accepté depuis
    expect(retention(st, 'A', { username: null }).pseudoPrisSignale()).toBe(false);
  });

  test('l’état de 60-3b (`1`) ne parle pas d’un pseudo posé : même clé, même comportement qu’avant', () => {
    const st = stockage();
    st.setItem('th-v2-pseudo-pris-A', '1');
    expect(retention(st, 'A', { username: 'alice' }).pseudoPrisSignale()).toBe(false);
    expect(retention(st, 'A', { username: null }).pseudoPrisSignale()).toBe(true);
  });

  test('`effacerPseudoPris` : l’état est retiré (choisir un pseudo remet à zéro) ; sans compte ou stockage refusé, rien ne casse', () => {
    const st = stockage();
    const r = retention(st, 'A');
    r.retenirPseudoPris('A', 'alice');
    r.effacerPseudoPris('A');
    expect(st._m.size).toBe(0);
    expect(() => r.effacerPseudoPris(null)).not.toThrow();
    const casse = { getItem: () => { throw new Error('bloqué'); }, removeItem: () => { throw new Error('bloqué'); } };
    expect(() => retention(casse, 'A').effacerPseudoPris('A')).not.toThrow();
  });
});

describe('60-3b — « pris entre-temps » se retient en local, par compte', () => {
  test('⚠️ retenu pour UN compte : l’autre compte du même appareil ne le voit pas', () => {
    const st = stockage();
    retention(st, 'A').retenirPseudoPris('A');
    expect(retention(st, 'A').pseudoPrisSignale()).toBe(true);
    expect(retention(st, 'B').pseudoPrisSignale()).toBe(false);
    expect(Array.from(st._m.keys())).toEqual(['th-v2-pseudo-pris-A']);
  });

  test('se relit à l’ouverture suivante (le stockage survit à la page)', () => {
    const st = stockage();
    retention(st, 'A').retenirPseudoPris('A');
    expect(retention(st, 'A').pseudoPrisSignale()).toBe(true);
    expect(retention(st, 'A').pseudoPrisSignale()).toBe(true);
  });

  test('sans compte, rien n’est retenu ni lu', () => {
    const st = stockage();
    const r = retention(st, null);
    r.retenirPseudoPris(null);
    r.retenirPseudoPris('');
    expect(st._m.size).toBe(0);
    expect(r.pseudoPrisSignale()).toBe(false);
  });

  test('un stockage qui refuse (mode privé, bloqué) ne casse rien', () => {
    const casse = { getItem: () => { throw new Error('bloqué'); }, setItem: () => { throw new Error('bloqué'); } };
    const r = retention(casse, 'A');
    expect(() => r.retenirPseudoPris('A')).not.toThrow();
    expect(r.pseudoPrisSignale()).toBe(false);
  });

  test('⚠️ « Quitter » l’efface avec les autres clés de l’appareil (préfixe `th-v2`)', () => {
    const st = stockage();
    retention(st, 'A').retenirPseudoPris('A');
    st.setItem('autre-site', 'x');
    const Quitter = require('../../v2/js/quitter.js');
    const retirees = Quitter.effacerStockages([st]);
    expect(retirees).toEqual(['th-v2-pseudo-pris-A']);
    expect(retention(st, 'A').pseudoPrisSignale()).toBe(false);
    expect(st.getItem('autre-site')).toBe('x');
  });
});
