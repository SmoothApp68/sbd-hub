/** @jest-environment node */
//
// Les dates du décor du banc d'écran, parcourues pour LES SEPT JOURS.
//
// ══ CE QUE CE FICHIER EMPÊCHE ══════════════════════════════════════════════
//
// Une famille de faux rouges qui a survécu à deux correctifs. Le décor se
// datait depuis « le lundi de cette semaine », si bien qu'un rang « lundi + 6
// jours » tombait DANS L'AVENIR du lundi au samedi — et le moteur, qui ne lit
// jamais l'avenir (MOTEUR §9.12), cessait de voir « la fois d'avant ».
//
//   · 48b-5b-2 (un dimanche) : quatre vérifications rouges, aucun code changé.
//   · 48b-5b-4 (un dimanche) : quatre autres. Deux séances re-datées.
//   · le lundi 21/09          : trois de plus. L'ANCRE n'avait jamais bougé.
//
// Les deux premiers correctifs ont déplacé des séances ; celui-ci enlève le
// jour de la semaine du calcul, et ce test-ci le vérifie POUR CHAQUE JOUR. Il
// tourne à chaque `npm test`, là où le banc, lui, tourne rarement.
//
// ⚠️ IL LIT LA MÊME FONCTION QUE LE BANC, pas une copie. C'est tout l'intérêt
// de `decor-dates.js` : une date de décor nouvelle y passe, donc ce contrôle
// la couvre sans que personne ait à y penser.

const Decor = require('../banc/decor-dates.js');

// Lundi 21/09/2026 → dimanche 27/09/2026 : les sept jours, et quatre heures
// par jour — dont 00 h 01, où la journée en cours n'a qu'une minute de passé.
const JOURS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const HEURES = ['00:01', '05:45', '13:00', '23:59'];
const INSTANTS = [];
for (let j = 0; j < 7; j++) {
  for (const h of HEURES) {
    const d = new Date(2026, 8, 21 + j, Number(h.slice(0, 2)), Number(h.slice(3)), 0, 0);
    INSTANTS.push({ nom: JOURS_FR[d.getDay()] + ' ' + h, t: d.getTime(), jour: d.getDay() });
  }
}

// Le lundi de la semaine d'un instant, à minuit — la frontière de « la semaine
// affichée ».
const lundiDe = (t) => {
  const d = new Date(t);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

describe('le décor du banc ne dépend plus du jour de la semaine', () => {
  test('les sept jours existent bien dans le jeu d’instants', () => {
    expect(new Set(INSTANTS.map((i) => i.jour)).size).toBe(7);
    expect(INSTANTS).toHaveLength(28);
  });

  test('DISCRIMINANT — AUCUNE date du décor ne tombe dans l’avenir, aucun jour', () => {
    // C'est LA vérification que l'ancien calcul ne passait pas : « lundi + 6 j »
    // est à venir six jours sur sept.
    INSTANTS.forEach(({ nom, t }) => {
      Decor.datesDuDecor(t).forEach((d, n) => {
        expect([nom, 'rang ' + n, d.getTime() < t]).toEqual([nom, 'rang ' + n, true]);
      });
    });
  });

  test('DISCRIMINANT — et aucune ne sort de la SEMAINE AFFICHÉE', () => {
    // L'autre moitié de la contrainte : les totaux de la semaine (chantier 23)
    // comptent les séances du décor. Hors de la semaine, elles disparaîtraient
    // des totaux — et le banc mesurerait un filtre qui n'existe pas.
    INSTANTS.forEach(({ nom, t }) => {
      const lundi = lundiDe(t);
      Decor.datesDuDecor(t).forEach((d, n) => {
        expect([nom, 'rang ' + n, d.getTime() >= lundi]).toEqual([nom, 'rang ' + n, true]);
      });
    });
  });

  test('les rangs gardent leur ORDRE, et restent distincts', () => {
    INSTANTS.forEach(({ nom, t }) => {
      const l = Decor.datesDuDecor(t).map((d) => d.getTime());
      expect([nom, l.length]).toEqual([nom, Decor.RANGS]);
      for (let i = 1; i < l.length; i++) {
        expect([nom, 'rang ' + i, l[i] > l[i - 1]]).toEqual([nom, 'rang ' + i, true]);
      }
    });
  });

  test('DISCRIMINANT — la forme ne dépend QUE de l’heure, jamais du jour', () => {
    // Le même moment de la journée, sept jours de suite : les écarts à
    // « maintenant » sont identiques. C'est la propriété que l'ancien calcul
    // n'avait pas, et c'est elle qui rend la famille impossible.
    HEURES.forEach((h) => {
      const empreintes = INSTANTS.filter((i) => i.nom.endsWith(h)).map(({ t }) =>
        JSON.stringify(Decor.datesDuDecor(t).map((d) => t - d.getTime())));
      expect([h, new Set(empreintes).size]).toEqual([h, 1]);
    });
  });

  test('le banc lit bien CETTE fonction, et aucune autre ancre', () => {
    // Un garde-fou de couplage : si le banc recalculait ses dates lui-même,
    // ce fichier ne prouverait plus rien de ce que le banc fait.
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../banc/seance-ecran.js'), 'utf8');
    expect(source).toMatch(/require\('\.\/decor-dates\.js'\)/);
    // `getDay()` dans une construction de date de décor : c'est exactement le
    // motif qui a coûté trois chantiers.
    expect(source.split('\n').filter((l) => /getDay\(\)/.test(l) && !/^\s*\/\//.test(l)))
      .toEqual([]);
  });
});
