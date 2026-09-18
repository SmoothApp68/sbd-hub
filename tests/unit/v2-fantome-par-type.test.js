//
// Chantier 46 §1 — `derniereSaisie` ne tenait pas compte du type.
//
// ══ LE DÉFAUT, CONSTATÉ SUR DEVICE LE 17/09 ════════════════════════════════
//
//   valider une CHAUFFE à 20 kg
//      → 20 kg se propage en fantôme sur TOUTES les séries suivantes,
//        séries de travail comprises, qui étaient déjà pré-remplies
//
// ⚠️ TROISIÈME OCCURRENCE DE LA MÊME RÈGLE MANQUANTE. Le chantier 38 l'a posée
// sur le niveau 2 de la cascade (`correspondant`), le chantier 39 sur la
// colonne « précédent » de `rendu.js`. Le niveau 1 ne l'avait jamais reçue.
//
// ══ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) ═════════════════════
//
// Une séance précédente à CHARGES VARIABLES (`122,5 · 122,5 · 125`) **avec**
// des chauffes. C'est la quatrième fois que ce piège revient :
//
//   · à charge CONSTANTE, « propage par type » et « propage tout » rendent
//     exactement le même écran ;
//   · sans chauffe, la moitié « par type » du défaut ne se voit pas ;
//   · sans variation entre les séries, la règle du §1 bis ne se mesure pas —
//     tout est égal à tout.
//
// Environnement jsdom (PAS de docblock `node`) : `v2/js/modele.js` se termine
// par `this`, que Babel remplace par `undefined` sous l'environnement node.

const Seance = require('../../v2/js/seance.js');

let n = 0;
const uuid = () => 'id-' + (++n);
beforeEach(() => { n = 0; });

const p = (charge, reps, type) => ({
  charge_kg: charge, reps: reps, duree_s: null, distance_m: null,
  type_serie: type || 'travail'
});
const prec = (series) => ({ seance: { id: 'p1' }, series: series });

// ⚠️ LA FIXTURE DU CHANTIER : deux chauffes, puis une rampe qui MONTE.
// `122,5 · 122,5 · 125` est la forme mesurée en base — 54 % des
// séance-exercices d'aurel_br portent une charge qui varie entre les séries
// (2 021 sur 3 730).
const RAMPE = () => prec([
  p(20, 12, 'echauffement'), p(60, 8, 'echauffement'),
  p(122.5, 5), p(122.5, 5), p(125, 4)
]);

// Une séance d'aujourd'hui, de la même forme que la précédente.
const seanceDe = (types) => {
  let s = Seance.creer({ id: 's1', userId: 'u1', idSerie: uuid });
  s = Seance.ajouterExercice(s, 'squat-barre', uuid);
  for (let k = 1; k < types.length; k++) s = Seance.ajouterSerie(s, 0, uuid);
  types.forEach((t, i) => { s = Seance.changerType(s, 0, i, t); });
  return s;
};
const MEME_FORME = () => seanceDe(['echauffement', 'echauffement',
                                   'travail', 'travail', 'travail']);
const taper = (s, i, charge) => Seance.modifierSerie(s, 0, i, { charge_kg: charge });
const charges = (s, pr) => s.exercices[0].series
  .map((_, i) => Seance.fantome(s, 0, i, pr).charge_kg);

// ════════════════════════════════════════════════════════════════════════════
// 1 — CE QUI EST TAPÉ SUR UNE CHAUFFE NE PROPAGE QU'AUX CHAUFFES
// ════════════════════════════════════════════════════════════════════════════
//
// ⚠️ LES DEUX RÈGLES SE MASQUENT L'UNE L'AUTRE — mesuré en rejouant chaque
// défaut séparément. Une chauffe tapée À LA VALEUR PROPOSÉE (20 = la chauffe
// de la fois d'avant) ne propage rien, même SANS le filtre par type : la règle
// de déviation l'arrête déjà. Le premier jet de ce fichier s'est fait piquer
// dessus — son test vedette passait avec le défaut remis.
//
// Chaque règle se teste donc là où l'autre est NEUTRE :
//   · le filtre par type → sur une chauffe qui DÉVIE (25 au lieu de 20) ;
//   · la règle de déviation → sur une série de travail conforme au rang.
describe('⚠️ une chauffe ne déteint pas sur les séries de travail', () => {
  // LE DÉFAUT DU DEVICE, dans la configuration qui l'isole. Sans le filtre par
  // type, les trois séries de travail affichent 25 au lieu de 122,5 · 122,5 · 125.
  test('une chauffe qui DÉVIE ne touche pas à la rampe de travail', () => {
    let s = MEME_FORME();
    s = taper(s, 0, 25);                 // 25 ≠ 20 : déviation réelle
    expect(charges(s, RAMPE())).toEqual([20, 25, 122.5, 122.5, 125]);
  });

  // L'autre moitié : elle propage bien à SA famille. Sans cette assertion,
  // « ne propage jamais » passerait pour « propage par type ».
  test('…mais elle propage à la chauffe suivante', () => {
    let s = MEME_FORME();
    s = taper(s, 0, 25);
    expect(Seance.fantome(s, 0, 1, RAMPE()).charge_kg).toBe(25);
  });

  test('deux chauffes tapées : le travail reste intact', () => {
    let s = MEME_FORME();
    s = taper(s, 0, 25);
    s = taper(s, 1, 65);
    expect(charges(s, RAMPE())).toEqual([20, 25, 122.5, 122.5, 125]);
  });

  // Et le cas littéral du rapport device — gardé parce que c'est CE qu'on a vu,
  // même s'il ne discrimine pas à lui seul (les deux règles l'attrapent).
  test('le cas littéral : valider la chauffe telle que proposée', () => {
    let s = MEME_FORME();
    s = taper(s, 0, 20);
    expect(charges(s, RAMPE())).toEqual([20, 60, 122.5, 122.5, 125]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2 — CE QUI EST TAPÉ SUR UNE SÉRIE DE TRAVAIL NE PROPAGE QU'AU TRAVAIL
// ════════════════════════════════════════════════════════════════════════════
describe('⚠️ une série de travail ne déteint pas sur les chauffes', () => {
  test('le travail tapé ne descend pas sur une chauffe placée après', () => {
    // Une chauffe APRÈS du travail : rare, mais c'est le seul ordre qui
    // distingue « remonte par type » de « remonte tout court ».
    let s = seanceDe(['travail', 'travail', 'echauffement']);
    s = taper(s, 0, 130);                // 130 ≠ 122,5 : déviation
    const f = charges(s, RAMPE());
    expect(f[1]).toBe(130);              // propage au travail
    expect(f[2]).toBe(20);               // la chauffe garde SA rampe
  });

  test('les quatre types sont étanches entre eux', () => {
    const quatre = prec([p(20, 12, 'echauffement'), p(100, 5),
                         p(80, 8, 'degressive'), p(110, 1, 'echec')]);
    let s = seanceDe(['echauffement', 'travail', 'degressive', 'echec',
                      'echauffement', 'travail', 'degressive', 'echec']);
    [30, 105, 85, 115].forEach((v, i) => { s = taper(s, i, v); });
    // Chaque type retrouve CE QU'IL a tapé, et rien d'un autre.
    expect(charges(s, quatre).slice(4)).toEqual([30, 105, 85, 115]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3 et 4 — LA DÉVIATION : RETAPER CE QUI ÉTAIT PROPOSÉ N'EN EST PAS UNE
// ════════════════════════════════════════════════════════════════════════════
describe('⚠️ la mémoire par rang survit à une validation conforme', () => {
  // ⚠️ LE CŒUR DU §1 bis. Valider la 1ʳᵉ série à 122,5 — ce que l'app
  // proposait — écrasait la mémoire par rang : la 3ᵉ ligne tombait à 122,5 au
  // lieu de 125, et la montée disparaissait. Plus d'une fois sur deux, mesuré.
  test('valider 122,5 sur la 1ʳᵉ ne casse pas le 125 de la 3ᵉ', () => {
    let s = MEME_FORME();
    s = taper(s, 2, 122.5);              // exactement ce qui était proposé
    expect(charges(s, RAMPE())).toEqual([20, 60, 122.5, 122.5, 125]);
  });

  test('les deux premières validées conformes : la 3ᵉ monte toujours', () => {
    let s = MEME_FORME();
    s = taper(s, 2, 122.5);
    s = taper(s, 3, 122.5);
    expect(Seance.fantome(s, 0, 4, RAMPE()).charge_kg).toBe(125);
  });

  // L'autre moitié : une VRAIE déviation, elle, se propage — à plat.
  test('130 au lieu de 122,5 se propage, sans décaler la rampe', () => {
    let s = MEME_FORME();
    s = taper(s, 2, 130);
    // ⚠️ 130 · 130, PAS 130 · 132,5. Décaler la rampe de l'écart constaté est
    // une PRESCRIPTION — écarté explicitement, c'est le territoire du moteur.
    expect(charges(s, RAMPE())).toEqual([20, 60, 122.5, 130, 130]);
  });

  test('revenir à la valeur prévue rend la main à la rampe', () => {
    let s = MEME_FORME();
    s = taper(s, 2, 130);                // dévie
    s = taper(s, 3, 122.5);              // retour au prévu pour CE rang
    // La dernière saisie ne dévie plus : le rang reprend la main, donc 125.
    expect(Seance.fantome(s, 0, 4, RAMPE()).charge_kg).toBe(125);
  });

  // Sans séance précédente, il n'y a rien à quoi être égal : tout dévie.
  test('premier jour sur l’exercice : la propagation est pleine', () => {
    let s = MEME_FORME();
    s = taper(s, 2, 100);
    expect(charges(s, null)).toEqual([null, null, null, 100, 100]);
  });

  // Un rang sans correspondant ne peut pas servir de référence.
  test('plus de séries qu’avant : la 4ᵉ tapée propage quand même', () => {
    let s = seanceDe(['travail', 'travail', 'travail', 'travail']);
    const troisSeries = prec([p(100, 5), p(100, 5), p(100, 5)]);
    s = taper(s, 3, 140);                // la 4ᵉ n'a aucun correspondant
    expect(Seance.fantome(s, 0, 3, troisSeries).charge_kg).toBe(null);
    // …et elle n'a aucune suivante à nourrir : on mesure la règle en amont.
    expect(Seance.derniereSaisie(s.exercices[0], 4, 'charge_kg', troisSeries)).toBe(140);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA DURÉE ET LA DISTANCE SUIVENT LA MÊME RÈGLE
// ════════════════════════════════════════════════════════════════════════════
describe('la règle vaut pour les trois champs, pas seulement la charge', () => {
  const d = (duree, dist, type) => ({
    charge_kg: null, reps: null, duree_s: duree, distance_m: dist,
    type_serie: type || 'travail'
  });

  test('la durée tapée sur une chauffe ne déteint pas sur le travail', () => {
    const pr = prec([d(60, null, 'echauffement'), d(120, null), d(150, null)]);
    let s = seanceDe(['echauffement', 'travail', 'travail']);
    s = Seance.modifierSerie(s, 0, 0, { duree_s: 45 });
    expect(s.exercices[0].series.map((_, i) => Seance.fantome(s, 0, i, pr).duree_s))
      .toEqual([60, 120, 150]);
  });

  test('la distance conforme au rang laisse la mémoire par rang', () => {
    const pr = prec([d(null, 5000), d(null, 8000)]);
    let s = seanceDe(['travail', 'travail']);
    s = Seance.modifierSerie(s, 0, 0, { distance_m: 5000 });
    expect(Seance.fantome(s, 0, 1, pr).distance_m).toBe(8000);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5 — NON-RÉGRESSION DES CHANTIERS 38 ET 39
// ════════════════════════════════════════════════════════════════════════════
describe('non-régression : les chantiers 38 et 39 tiennent', () => {
  // Chantier 38 : sur une séance VIERGE, `derniereSaisie` ne dit rien et c'est
  // le niveau 2 qui parle — aligné par type, jamais par indice.
  test('[38] moins de chauffes aujourd’hui : le travail prend le travail', () => {
    const s = seanceDe(['travail', 'travail', 'travail']);
    expect(charges(s, RAMPE())).toEqual([122.5, 122.5, 125]);
  });

  test('[38] sans correspondant du même type, pas de fantôme', () => {
    const rienQueDuTravail = prec([p(100, 5), p(100, 5)]);
    const s = seanceDe(['echauffement', 'travail']);
    expect(charges(s, rienQueDuTravail)).toEqual([null, 100]);
  });

  // Chantier 39 : `correspondant` est la règle PARTAGÉE. Le niveau 1 l'utilise
  // désormais lui aussi — c'est ce qui garantit qu'ils ne divergeront pas.
  test('[39] `correspondant` reste la seule règle d’alignement', () => {
    const liste = MEME_FORME().exercices[0].series;
    expect(Seance.correspondant(liste, 4, RAMPE()).charge_kg).toBe(125);
    expect(Seance.correspondant(liste, 0, RAMPE()).charge_kg).toBe(20);
  });
});
