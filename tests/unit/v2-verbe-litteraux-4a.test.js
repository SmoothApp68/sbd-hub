/** @jest-environment node */
//
// « Les mots disent vrai » PR 4a (MOTEUR §9.47) — UN SEUL ENDROIT POUR LES MOTS DU VERBE. Les littéraux « une / deux / N rep(s) de plus » (positifs) et « tu restes à »
// ne s'écrivent que dans la région « LE VERBE UNIQUE » de `moteur.js` (un détecteur de motifs attrape les verbes connus, jamais un « tu conserves » : le seul
// filet qui tient dans le temps est qu'une phrase à verbe ait UN auteur). Les exceptions sont listées avec leur raison ; une de plus est un geste conscient.

const fs = require('fs');
const path = require('path');

const DOSSIER = path.join(__dirname, '../../v2/js');
const MOTIF = /\b(?:[Uu]ne|[Dd]eux|[Tt]rois|\d+) reps? de plus\b|\b[Tt]u restes à/;
// Les exceptions : une ligne qui porte le motif sans être le verbe de la consigne.
const EXCEPTIONS = [
  { re: /Pourquoi pas une rep de plus/, raison: 'assistant.js : les puces fixes de l’assistant (relues en PR 4b, avec `verbe` dans le contexte)' },
  { re: /une rep de plus à chaque séance/, raison: 'les états d’échelle `garde` (« on le garde sur la dernière série, une rep de plus à chaque séance ») : un test gardé, hors verbe de consigne' },
  { re: /Kotarsky 2018/, raison: 'une source citée (la progression au poids du corps), pas une phrase du coach' },
  { re: /si tu restes à/, raison: 'la carte « plus léger que prévu » de la réaction en séance (MOTEUR §9.39, I115 à I122)' },
  { re: /te les compte : tu restes à/, raison: 'le détail du dépassement (MOTEUR §9.x, I71) : une carte, pas la consigne' },
  { re: /sans rep de plus|pas de rep de plus|jamais une rep de plus/, raison: 'les négations de reprise et de bord (exemptées d’I162 sens 2, vérifiées par la négation : jamais devant monte_reps)' }
];

function lignesDeCode(fichier) {
  const brut = fs.readFileSync(path.join(DOSSIER, fichier), 'utf8').split('\n');
  const dedans = { verbe: false, invariant: false };
  const out = [];
  brut.forEach((l, i) => {
    if (l.indexOf('// ══ PR 4a (chantier « Les mots disent vrai », MOTEUR §9.47)') >= 0) dedans.verbe = true;
    if (l.indexOf('// ══ FIN DU VERBE UNIQUE') >= 0) dedans.verbe = false;
    if (/^\s*function verifierVerbe\b/.test(l)) dedans.invariant = true;
    if (/^\s*function causesTues\b/.test(l)) dedans.invariant = false;
    const code = l.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/ .*$/, '');
    out.push({ n: i + 1, code, dedans: dedans.verbe || dedans.invariant });
  });
  return out;
}

describe('un seul endroit pour les mots du verbe', () => {
  const fichiers = fs.readdirSync(DOSSIER).filter((f) => /\.js$/.test(f));
  test('aucun littéral « N reps de plus » ni « tu restes à » hors de la région du verbe (hors exceptions listées)', () => {
    const hors = [];
    fichiers.forEach((f) => lignesDeCode(f).forEach((l) => {
      if (l.dedans || !MOTIF.test(l.code)) return;
      if (EXCEPTIONS.some((e) => e.re.test(l.code))) return;
      hors.push(f + ':' + l.n + ' ' + l.code.trim().slice(0, 120));
    }));
    expect(hors).toEqual([]);
  });
  test('la région du verbe existe, dans moteur.js, une fois, et porte les mots', () => {
    const l = lignesDeCode('moteur.js');
    expect(l.filter((x) => x.dedans && /reps de plus|rep de plus/.test(x.code)).length).toBeGreaterThan(0);
    expect(l.filter((x) => x.dedans && /tu restes à/.test(x.code)).length).toBe(1);
  });
  test('chaque exception est utilisée (la liste dit ce qui est)', () => {
    const toutes = [];
    fichiers.forEach((f) => lignesDeCode(f).forEach((l) => { if (!l.dedans && /rep de plus|tu restes à|Tu restes à/.test(l.code)) toutes.push(l.code); }));
    EXCEPTIONS.forEach((e) => expect([e.raison, toutes.some((c) => e.re.test(c))]).toEqual([e.raison, true]));
  });
  test('un littéral écrit hors région est attrapé (discriminant)', () => {
    const faux = "return 'Une rep de plus : ' + x;";
    expect(MOTIF.test(faux) && !EXCEPTIONS.some((e) => e.re.test(faux))).toBe(true);
    const faux2 = "return 'tu restes à ' + x;";
    expect(MOTIF.test(faux2) && !EXCEPTIONS.some((e) => e.re.test(faux2))).toBe(true);
  });
});
