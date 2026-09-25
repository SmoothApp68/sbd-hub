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

  // ── LA SEMAINE ISOLÉE (sections 40 à 49), étendue le 25/09/2026 ─────────
  //
  // Même famille, une semaine plus loin : la séance de la section 47 était
  // posée à « ancre + 6 jours », et l'ancre n'est pas un lundi. Elle ne tombait
  // dans la semaine ouverte (`/semaine/<date de l'ancre>`) QUE le lundi — la
  // carte était « absente » six jours sur sept, sur `main` comme ailleurs.
  //
  // `isoL` du banc : la date LOCALE de l'ancre, dont le routeur ouvre la
  // semaine. On la rejoue ici pour savoir quelle semaine est affichée.
  const semaineOuverte = (ancre) => lundiDe(ancre.getTime());

  test('DISCRIMINANT — la séance de la section 47 est DANS la semaine ouverte, aucun jour', () => {
    INSTANTS.forEach(({ nom, t }) => {
      const ancre = Decor.ancreSemaineIsolee(Decor.datesDuDecor(t)[0]);
      const d = Decor.seanceSansSeries(ancre);
      expect([nom, lundiDe(d.getTime())]).toEqual([nom, semaineOuverte(ancre)]);
    });
  });

  test('DISCRIMINANT — et elle est dans le passé, aucun jour', () => {
    INSTANTS.forEach(({ nom, t }) => {
      const ancre = Decor.ancreSemaineIsolee(Decor.datesDuDecor(t)[0]);
      expect([nom, Decor.seanceSansSeries(ancre).getTime() < t]).toEqual([nom, true]);
    });
  });

  test('le banc pose la section 47 par CETTE fonction, et l’ancre aussi', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../banc/seance-ecran.js'), 'utf8');
    expect(source).toMatch(/const L_EXO = ancreSemaineIsolee\(JOURS\[0\]\);/);
    expect(source).toMatch(/poserSeance\(ID_VIDE, 'Séries pas arrivées', seanceSansSeries\(L_EXO\)/);
  });

  // ── TOUT LE DÉCOR (famille #304, #311, #316, fermée le 25/09/2026) ──────
  //
  // Chaque date que le banc calcule depuis maintenant passe par
  // `decor-dates.js`, et chacune est vérifiée ici : dans le passé, et dans la
  // semaine que la section qui la lit ouvre.

  test('DISCRIMINANT — les séances de la semaine isolée y restent, tous les jours', () => {
    // « Quads tous terrains » (2) sortait de la semaine ouverte le samedi et le
    // dimanche ; « Pecs – Dos » (4) du jeudi, « Gainage » (5) du mercredi.
    INSTANTS.forEach(({ nom, t }) => {
      const ancre = Decor.ancreSemaineIsolee(Decor.datesDuDecor(t)[0]);
      for (let n = 1; n <= 6; n++) {
        const d = Decor.jourIsole(ancre, n);
        expect([nom, n, lundiDe(d.getTime()), d.getTime() < t])
          .toEqual([nom, n, semaineOuverte(ancre), true]);
      }
    });
  });

  test('DISCRIMINANT — jamais le jour de la section 47, et dans l’ordre', () => {
    // La carte sans séries de la section 47 cherche le « ⋯ » dans le bloc de
    // SON JOUR : une autre séance ce jour-là y mettrait le sien.
    const jourLocal = (d) => new Date(d).toDateString();
    INSTANTS.forEach(({ nom, t }) => {
      const ancre = Decor.ancreSemaineIsolee(Decor.datesDuDecor(t)[0]);
      const vide = jourLocal(Decor.seanceSansSeries(ancre));
      const l = [1, 2, 3, 4, 5, 6].map((n) => Decor.jourIsole(ancre, n));
      l.forEach((d, i) => {
        expect([nom, i + 1, jourLocal(d) === vide]).toEqual([nom, i + 1, false]);
        if (i) expect([nom, i + 1, d.getTime() > l[i - 1].getTime()]).toEqual([nom, i + 1, true]);
      });
    });
  });

  test('DISCRIMINANT — une fin de séance n’est jamais dans l’avenir, ni hors de la semaine', () => {
    // « Début + 1 h » tombait à venir à 00 h 01, chaque jour.
    INSTANTS.forEach(({ nom, t }) => {
      Decor.datesDuDecor(t).forEach((d, n) => {
        const f = Decor.finDe(d, t).getTime();
        expect([nom, 'rang ' + n, f < t, f >= d.getTime(), lundiDe(f)])
          .toEqual([nom, 'rang ' + n, true, true, lundiDe(t)]);
      });
    });
  });

  test('« il y a une seconde » : passé, dans la semaine en cours, et sa fin aussi', () => {
    INSTANTS.forEach(({ nom, t }) => {
      const d = Decor.ilYa(1000, t);
      const f = Decor.finDe(d, t).getTime();
      expect([nom, d.getTime() < t, lundiDe(d.getTime()), f < t, f >= d.getTime()])
        .toEqual([nom, true, lundiDe(t), true, true]);
      [7, 14, 21].forEach((j) => {
        expect([nom, j, Decor.ilYa(j * Decor.JOUR, t).getTime() < t]).toEqual([nom, j, true]);
      });
    });
  });

  test('le banc ne calcule plus aucune date du décor lui-même', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../banc/seance-ecran.js'), 'utf8');
    const code = source.split('\n').filter((l) => !/^\s*\/\//.test(l));
    // Les motifs des quatre défauts : un décalage en millisecondes posé sur
    // une date, et « maintenant moins » écrit à la main.
    expect(code.filter((l) => /\+\s*(3600000|7200000|\d+\s*\*\s*86400000)/.test(l))).toEqual([]);
    expect(code.filter((l) => /new Date\(\s*Date\.now\(\)\s*-/.test(l))).toEqual([]);
    expect(source).toMatch(/const jourExo = \(rang\) => jourIsole\(L_EXO, rang\)/);
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
