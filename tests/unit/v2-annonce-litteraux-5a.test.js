/** @jest-environment node */
//
// « Les mots disent vrai » PR 5a (MOTEUR §9.48, I164 sens 1) — UN SEUL ENDROIT POUR LES ANNONCES. Les littéraux « la prochaine fois », « Prochaine séance » et
// « il te manque » (un état FUTUR de l'exercice) ne s'écrivent que dans la région « L'ANNONCE » de `moteur.js` (`Moteur.annonceDe`) et dans la région de
// l'invariant qui les relit (`verifierAnnonce`). Une annonce ne s'écrit jamais dans un écran, un module de partage ou un second producteur. Les exceptions
// sont listées avec leur raison ; une de plus est un geste conscient (jamais un contournement silencieux).

const fs = require('fs');
const path = require('path');

const DOSSIER = path.join(__dirname, '../../v2/js');
const MOTIF = /la prochaine fois|prochaine séance|prochaine fois|il te manque/i;
const EXCEPTIONS = [
  { re: /la prochaine fois, on retente au-dessus/, raison: 'la règle de bord (famille 3, MOTEUR §9.1.2) : une promesse du gris dont le texte reste inchangé en 5a (A8) ; la date-ou-silence de la PR 5b la reprendra' },
  { re: /la prochaine séance dira si c/, raison: 'la phrase « une seule séance ne fait pas une habitude » du Pourquoi (3i) : simulée, la 2e séance rend bien l’état bord ; notée, inchangée (MOTEUR §9.48)' },
  { re: /Le coach en tiendra compte la prochaine fois/, raison: 'notes-ia.js : le texte de consentement de la lecture des notes, une promesse d’interface, pas une annonce de l’exercice (hors périmètre, listée au rapport)' },
  { re: /la prochaine séance propose/, raison: 'plan.js, I10 : le message d’une erreur d’invariant (jamais affiché à la personne)' },
  { re: /PROCHAINE SÉANCE/, raison: 'rendu.js : le libellé de la carte d’accueil (« Prochaine séance » = la routine qui suit), pas une annonce du coach (173)' }
];

function lignesDeCode(fichier) {
  const brut = fs.readFileSync(path.join(DOSSIER, fichier), 'utf8').split('\n');
  let dedans = false, invariant = false;
  return brut.map((l, i) => {
    if (l.indexOf('// ══ PR 5a (chantier « Les mots disent vrai », MOTEUR §9.48)') >= 0) dedans = true;
    if (l.indexOf('// ══ FIN DE L\'ANNONCE') >= 0) dedans = false;
    if (/^\s*function verifierAnnonce\b/.test(l)) invariant = true;
    if (/^\s*function causesTues\b/.test(l)) invariant = false;
    const code = l.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/ .*$/, '');
    return { n: i + 1, code, dedans: dedans || invariant };
  });
}

describe('un seul endroit pour les annonces', () => {
  const fichiers = fs.readdirSync(DOSSIER).filter((f) => /\.js$/.test(f));
  test('aucun littéral d’annonce hors de la région « L’ANNONCE » (hors exceptions listées)', () => {
    const hors = [];
    fichiers.forEach((f) => lignesDeCode(f).forEach((l) => {
      if (l.dedans || !MOTIF.test(l.code)) return;
      if (EXCEPTIONS.some((e) => e.re.test(l.code))) return;
      hors.push(f + ':' + l.n + ' ' + l.code.trim().slice(0, 120));
    }));
    expect(hors).toEqual([]);
  });
  test('la région existe, dans moteur.js, une fois, et porte les trois littéraux', () => {
    const l = lignesDeCode('moteur.js').filter((x) => x.dedans);
    expect(l.filter((x) => /'La prochaine fois'/.test(x.code)).length).toBe(1);
    expect(l.filter((x) => /'Prochaine séance'/.test(x.code)).length).toBe(1);
    expect(l.filter((x) => /'Il te manque '/.test(x.code)).length).toBe(1);
    expect(fs.readFileSync(path.join(DOSSIER, 'moteur.js'), 'utf8').split('// ══ PR 5a (chantier « Les mots disent vrai », MOTEUR §9.48)').length).toBe(2);
  });
  test('chaque exception est utilisée (la liste dit ce qui est)', () => {
    const toutes = [];
    fichiers.forEach((f) => lignesDeCode(f).forEach((l) => { if (!l.dedans && MOTIF.test(l.code)) toutes.push(l.code); }));
    EXCEPTIONS.forEach((e) => expect([e.raison, toutes.some((c) => e.re.test(c))]).toEqual([e.raison, true]));
  });
  test('un littéral écrit hors région est attrapé (discriminant)', () => {
    ["return 'Prochaine séance : ' + x;", "return 'Il te manque ' + n;", "texte = 'La prochaine fois : ' + x;"].forEach((faux) => {
      expect(MOTIF.test(faux) && !EXCEPTIONS.some((e) => e.re.test(faux))).toBe(true);
    });
  });
});
