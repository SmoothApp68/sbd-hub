// 212 — Mentions légales, Confidentialité, Santé : trois pages, contact caché tant qu'il vaut le marqueur,
// case « 15 ans » obligatoire à l'inscription, pages câblées depuis Profil › À propos et le pied de l'inscription.
const fs = require('fs');
const path = require('path');
const M = require('../../v2/js/mentions.js');
const Profil = require('../../v2/js/profil.js');
const lire = (f) => fs.readFileSync(path.join(__dirname, '../../v2', f), 'utf8');

describe('212 — pages légales', () => {
  test('quatre pages : mentions, confidentialité, santé, crédits (218)', () => {
    expect(M.pages().map((p) => p.cle)).toEqual(['mentions', 'confidentialite', 'sante', 'credits']);
  });
  test('la ligne contact est cachée tant qu’elle vaut le marqueur (qui reste dans le code)', () => {
    expect(M.CONTACT).toBe('À COMPLÉTER');
    expect(M.contactAffichable()).toBe(false);
    const txt = JSON.stringify(M.pages());
    expect(txt).not.toMatch(/À COMPLÉTER/);
    expect(M.page('mentions').blocs.some((b) => b.titre === 'Contact')).toBe(false);
  });
  test('les mentions disent l’éditeur, Cloudflare et Supabase UE', () => {
    const t = JSON.stringify(M.page('mentions'));
    expect(t).toMatch(/Aurélien, à titre personnel/);
    expect(t).toMatch(/Cloudflare/);
    expect(t).toMatch(/Irlande, eu-west-1/);
  });
  test('la confidentialité cite droits, CNIL, aucune revente', () => {
    const t = JSON.stringify(M.page('confidentialite'));
    ['CNIL', 'Aucune revente', 'Exporter mes données', 'supprimer ton compte', 'J’ai mal'].forEach((m) => expect(t).toContain(m));
  });
  test('la santé : avis médical, 15 ans', () => {
    const t = M.page('sante').blocs[0].texte;
    expect(t).toMatch(/pas un avis médical/);
    expect(t).toMatch(/15 ans et plus/);
  });
});

describe('250 — « Lire mes notes » n’est décrite qu’une fois ouverte', () => {
  const config = require('../../v2/js/config.js');
  const avant = config.NOTES_IA_OUVERTE;
  afterEach(() => { config.NOTES_IA_OUVERTE = avant; });
  test('interrupteur éteint : ni le bloc de l’IA, ni « Lire mes notes », ni son chemin de retrait ; la ligne « Où » reste exacte (Demander au coach)', () => {
    config.NOTES_IA_OUVERTE = false;
    const t = JSON.stringify(M.page('confidentialite'));
    expect(t).not.toMatch(/Lire mes notes|L’IA :|Profil › Mon coach/);
    expect(t).toMatch(/Dans l’Union européenne \(Irlande\), sauf la question que tu poses à « Demander au coach »/);
  });
  test('interrupteur allumé : le bloc de l’IA (ce qui part, à qui, combien de temps, jamais pour entraîner, base) et le retrait', () => {
    config.NOTES_IA_OUVERTE = true;
    const blocs = M.page('confidentialite').blocs;
    const titres = blocs.map((b) => b.titre);
    expect(titres.slice(titres.indexOf('Où'), titres.indexOf('Où') + 6)).toEqual(['Où', 'L’IA : ce qui part', 'L’IA : à qui', 'L’IA : combien de temps', 'L’IA : jamais pour entraîner', 'L’IA : sur quelle base']);
    const t = JSON.stringify(blocs);
    expect(t).toMatch(/Profil › Mon coach › Lire mes notes/);
    expect(t).toMatch(/sous 30 jours, et jusqu’à 2 ans/);
  });
});

describe('212 — inscription', () => {
  const OK = { pseudo: 'jordan_c', email: 'j@x.fr', mdp: 'motdepasse123', pseudoPris: false, age15: true };
  test('la case bloque l’inscription', () => {
    expect(Profil.inscriptionPrete(OK)).toBe(true);
    expect(Profil.inscriptionPrete(Object.assign({}, OK, { age15: false }))).toBe(false);
    expect(Profil.inscriptionPrete(Object.assign({}, OK, { age15: undefined }))).toBe(false);
  });
  test('câblage : deux entrées, une case, la ligne sous le bouton', () => {
    const html = lire('index.html'), app = lire('js/app.js'), sw = lire('service-worker.js');
    expect(html).toContain('id="champ-age15"');
    expect(html).toContain('/js/mentions.js');
    expect(sw).toContain('./js/mentions.js');
    expect(app).toMatch(/titre: 'MENTIONS'/);
    expect(app).toMatch(/surMentions: ouvrirMentions/);
    expect(lire('js/rendu.js')).toContain('En créant ton compte, tu acceptes les conditions décrites dans ');
  });
});

describe('271 — les crédits du mouvement en 3D (Profil › À propos › Crédits)', () => {
  const t = JSON.stringify(M.page('credits'));
  test('Z-Anatomy : attribution, lien, licence CC BY-SA 4.0 et son lien, modifications, partage à l’identique', () => {
    ['Z-Anatomy', 'Gauthier Kervyn', 'https://www.z-anatomy.com', 'BodyParts3D', 'CC BY-SA 4.0',
      'https://creativecommons.org/licenses/by-sa/4.0/', 'Modifications faites pour TrainHub', 'sous la même licence'].forEach((m) => expect([m, t.indexOf(m) >= 0]).toEqual([m, true]));
  });
  test('three.js : MIT, son avis de copyright et le texte de la licence (le même que vendor/LICENSE-three.txt)', () => {
    expect(t).toMatch(/three\.js r128/);
    expect(t).toMatch(/© 2010-2021 three\.js authors/);
    const blocs = M.page('credits').blocs;
    expect(blocs.some((b) => b.texte === M.LICENCE_THREE)).toBe(true);
    const norm = (x) => x.replace(/\s+/g, ' ').trim();
    expect(norm(M.LICENCE_THREE)).toBe(norm(fs.readFileSync(path.join(__dirname, '../../v2/vendor/LICENSE-three.txt'), 'utf8')));
  });
  test('les crédits du bonhomme restent en tête', () => {
    expect(M.page('credits').blocs[0].titre).toBe('Silhouettes du bonhomme des muscles');
  });
});
