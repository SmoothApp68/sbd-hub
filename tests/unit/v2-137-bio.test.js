//
// 137 (SOCIAL §1, la bio ; maquette `maquette-bio-profil-social-v1.html`, cas 1 à 6) — LA BIO SUR LE PROFIL SOCIAL.
// La base décide qui la voit (`social_profil.bio`, v2_105) ; l'app l'affiche si elle est non vide, sous l'état, en
// entier. Environnement jsdom : `modele.js` et `rendu.js` se terminent par `this`.

require('../../v2/js/routeur.js');
require('../../v2/js/semaine.js');
require('../../v2/js/modele.js');
require('../../v2/js/routines.js');
require('../../v2/js/rendu.js');
const FauxSocial = require('../banc/faux-social.js');
const fs = require('fs');
const path = require('path');
const Rendu = () => window.THRendu;

const profilRendu = (profil) => {
  const cible = document.createElement('div');
  Rendu().rendreAmi(cible, { etat: 'ok', profil: Object.assign({ pseudo: 'lea', couleur: '#c0392b', ligneJeu: null,
    etatTexte: 'Abonné', bouton: null, menu: [] }, profil), cache: 'Abonne-toi pour voir ses séances.' });
  return cible;
};

describe('137 — la bio dans le profil social (rendu)', () => {
  test('présente : sous l’état, avant les boutons, ses retours à la ligne dans le texte', () => {
    const c = profilRendu({ bio: 'Powerbuilding, 3 ans\nSquat d’abord' });
    const bio = c.querySelector('.s-prof .s-bio');
    expect(bio.textContent).toBe('Powerbuilding, 3 ans\nSquat d’abord');
    expect(bio.previousElementSibling.className).toBe('s-etat');
    expect(c.querySelector('.s-prof').nextElementSibling.className).toBe('s-actions');
  });
  test('absente (null, indéfinie), vide ou blanche : rien — ni paragraphe ni texte de remplacement', () => {
    [null, undefined, '', '   \n '].forEach((b) => {
      const c = profilRendu({ bio: b });
      expect(c.querySelector('.s-bio')).toBeNull();
      expect(c.querySelector('.s-prof').children).toHaveLength(3);      // blason, pseudo, état
    });
  });
  test('longue (280 caractères, un mot sans espace) : en entier, jamais tronquée ni « voir plus »', () => {
    const longue = 'x'.repeat(100) + '\n' + 'Lorem ipsum '.repeat(15).trim() + ' ' + 'y'.repeat(30);
    const c = profilRendu({ bio: longue });
    expect(c.querySelector('.s-bio').textContent).toBe(longue);
    expect(c.textContent).not.toMatch(/voir plus|…$/i);
  });
  test('rendue en texte, jamais en HTML', () => {
    const c = profilRendu({ bio: '<b>gras</b><img src=x onerror=alert(1)>' });
    expect(c.querySelector('.s-bio b, .s-bio img')).toBeNull();
    expect(c.querySelector('.s-bio').textContent).toContain('<b>gras</b>');
  });
  test('le style : texte normal (--texte), 14 px, pre-line, anywhere, 32ch, centré', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../v2/styles.css'), 'utf8');
    const regle = css.match(/\.s-bio\{[^}]*\}/)[0];
    ['font-size:14px', 'color:var(--texte)', 'max-width:32ch', 'white-space:pre-line', 'overflow-wrap:anywhere', 'text-align:center']
      .forEach((d) => expect(regle).toContain(d));
  });
  test('le câblage : la vue passe `bio`, jamais `visibility_bio`', () => {
    const app = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
    expect(app).toMatch(/bio: p\.bio,/);
    expect(app).not.toMatch(/visibility_bio/);
    expect(fs.readFileSync(path.join(__dirname, '../../v2/js/rendu.js'), 'utf8')).not.toMatch(/visibility_bio/);
    expect(app).toMatch(/Tes abonnés et les membres de ta guilde la voient sur ton profil\./);
  });
});

describe('137 — le faux serveur rend `bio` selon les cercles (v2_105), en dernier', () => {
  const decor = () => {
    const base = { profiles: [{ id: 'u-moi', username: 'moi', compte_prive: true, bio: '  Ma bio  ' }],
      sessions: [], sets: [], records: [] };
    const f = FauxSocial.creer(base, { moi: 'u-moi' });
    f.etat.profils.push(
      { id: 'u-abo', username: 'abo', compte_prive: true, bio: ' Powerbuilding\nSquat ' },
      { id: 'u-inconnu', username: 'inconnu', compte_prive: false, bio: 'Visible des seuls cercles' },
      { id: 'u-attente', username: 'attente', compte_prive: true, bio: 'En attente' },
      { id: 'u-guilde', username: 'guilde', compte_prive: true, bio: 'Même guilde' },
      { id: 'u-vide', username: 'vide', compte_prive: true, bio: '   ' });
    f.etat.abonnements.push({ suiveur: 'u-moi', suivi: 'u-abo', statut: 'accepte' },
      { suiveur: 'u-moi', suivi: 'u-attente', statut: 'demande' }, { suiveur: 'u-moi', suivi: 'u-vide', statut: 'accepte' });
    f.etat.guildes.push({ id: 'g1', nom: 'G', couleur: '#fff', blason: null });
    f.etat.membres.push({ guilde_id: 'g1', user_id: 'u-moi', entre_le: 1 }, { guilde_id: 'g1', user_id: 'u-guilde', entre_le: 2 });
    return f;
  };
  const bioDe = (f, pseudo) => f.rpc('u-moi', 'social_profil', { p_pseudo: pseudo })[0].bio;
  test('soi, abonné accepté, même guilde : le texte sans espaces de bord', () => {
    const f = decor();
    expect(bioDe(f, 'moi')).toBe('Ma bio');
    expect(bioDe(f, 'abo')).toBe('Powerbuilding\nSquat');
    expect(bioDe(f, 'guilde')).toBe('Même guilde');
  });
  test('inconnu (même public), demande en attente : null', () => {
    const f = decor();
    expect(bioDe(f, 'inconnu')).toBeNull();
    expect(bioDe(f, 'attente')).toBeNull();
  });
  test('bio vide dans les cercles : null', () => {
    expect(bioDe(decor(), 'vide')).toBeNull();
  });
  test('`bio` est la dernière colonne', () => {
    const cles = Object.keys(decor().rpc('u-moi', 'social_profil', { p_pseudo: 'abo' })[0]);
    expect(cles[cles.length - 1]).toBe('bio');
  });
});
