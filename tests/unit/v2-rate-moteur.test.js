/** @jest-environment node */
//
// 236 (MOTEUR §9.39) — LE COACH EN TEMPS RÉEL APRÈS UN RATÉ : la fonction pure `Moteur.reactionAuRate`.
//   1  le TABLEAU : cas × réglage × objectif × contexte (niveau 1) ;
//   2  les niveaux 2 (l'exercice), 3 (la forme du jour) et « paris ratés à la suite » ;
//   3  les mots : un fait, une phrase, jamais un bravo ; chaque chiffre cité ;
//   4  la pureté : la même entrée, la même sortie, l'entrée intacte.

process.env.TZ = 'Europe/Paris';
require('../../v2/js/modele.js');
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');

// Une série du jour : couché, zone 8-12, visé 10, 80 kg, cran 2,5.
const base = (o) => Object.assign({ niveau: 'serie', role: 'travail', charge: 80, reps: 9, vise: 10, bas: 8, haut: 12, rang: 1, derniere: false,
  reglage: 'normal', objectif: 'les_deux', barre: true, materiel: 'barre', pas: 2.5, chauffeValidee: true, reposReel: 120, reposCible: 120 }, o || {});
const r = (o) => M.reactionAuRate(base(o));

describe('niveau 1 — la grille A à O', () => {
  const cas = [
    // [nom, contexte, cas attendu, charge, garde, fourchette]
    ['A raté d’1 rep, repos court', { reps: 9, reposReel: 60 }, 'A', 'garde', 1, [8, 10], ['repos']],
    ['B raté d’1 rep, repos normal', { reps: 9, reposReel: 120 }, 'B', 'garde', 1, [8, 10], []],
    ['C raté de 2, dans la zone', { reps: 8, vise: 10, bas: 8 }, 'C', 'garde', 1, [7, 9], ['repos']],
    ['D sous la zone, barre', { reps: 6, vise: 10, bas: 8 }, 'D', 'baisse', 1, [8, 10], ['prendre']],
    ['L échec franc avant la cible', { reps: 9, reserve: 0 }, 'L', 'baisse', 1, [8, 10], ['prendre']],
    ['M pile sur la cible, réserve 0', { reps: 10, reserve: 0 }, 'M', 'garde', 1, [9, 10], []]
  ];
  test.each(cas)('%s', (nom, ctx, lettre, action, garde, fourchette, leviers) => {
    const d = r(ctx);
    expect(d.silence).toBe(false);
    expect(d.cas).toBe(lettre);
    expect(d.charge.action).toBe(action);
    expect(d.garde).toBe(garde);
    expect(d.fourchette).toEqual(fourchette);
    expect(d.leviers).toEqual(leviers);
  });

  test('D : la baisse tient au max du jour, au cran du matériel, strictement sous la charge faite', () => {
    const d = r({ reps: 6, vise: 10, bas: 8, charge: 100 });
    expect(d.charge.action).toBe('baisse');
    expect(d.charge.kg).toBeLessThan(100);
    expect(d.charge.kg % 2.5).toBe(0);
    // le max du jour de 100 × 6 sans réserve ≈ 100 / 0,811 ; 10 reps en gardant 1 → ≈ 78 % de ce max
    const max = M.maxDuJour(100, 6, 0);
    expect(d.charge.kg).toBeLessThanOrEqual(max * M.pctDuMax(10, 1) / 100 + 1e-9);
    expect(d.charge.kg).toBeGreaterThan(max * M.pctDuMax(10, 1) / 100 - 2.5 - 1e-9);
  });

  test('E : au poids du corps, rien à baisser — la marche d’en dessous ou l’élastique, garde 1', () => {
    const d = r({ corps: true, charge: 0, reps: 5, vise: 8, bas: 8, materiel: 'corps', barre: false });
    expect(d.cas).toBe('E');
    expect(d.charge.action).toBe('garde');
    expect(d.fourchette).toEqual([4, 5]);
    expect(d.leviers).toEqual(['elastique']);
    expect(r({ corps: true, charge: 0, reps: 5, vise: 8, bas: 8, marcheDessous: true, negatives: true }).leviers).toEqual(['marche_dessous', 'negatives']);
  });

  test('F : la 1re série ratée recale toutes les suivantes ; sans chauffe validée, une série d’approche d’abord', () => {
    const f = r({ rang: 0, reps: 9, chauffeValidee: true });
    expect(f.recale).toBe(true);
    expect(f.approche).toBe(false);
    const g = r({ rang: 0, reps: 9, chauffeValidee: false });
    expect(g.approche).toBe(true);
    expect(g.leviers).toContain('approche');
    expect(r({ rang: 1, reps: 9 }).recale).toBe(false);
  });

  test('G : la grosse série ratée — les reculs se recalent sur le max du jour, la charge ne change pas', () => {
    const d = r({ role: 'grosse', charge: 120, reps: 3, vise: 5, bas: 3 });
    expect(d.cas).toBe('G');
    expect(d.recalculeReculs).toBe(true);
    expect(d.charge).toEqual({ action: 'garde', kg: 120 });
    expect(d.maxDuJour).toBe(Math.round(M.maxDuJour(120, 3, 0)));
  });

  test('H : un recul raté suit B à D sur SA charge', () => {
    const d = r({ role: 'recul', charge: 100, reps: 9, vise: 10 });
    expect(d.cas).toBe('H');
    expect(d.base).toBe('B');
    expect(d.charge.kg).toBe(100);
    const e = r({ role: 'recul', charge: 100, reps: 5, vise: 10, bas: 8 });
    expect(e.cas).toBe('H');
    expect(e.base).toBe('D');
    expect(e.charge.kg).toBeLessThan(100);
  });

  test('I J K N O : le silence, avec sa raison', () => {
    expect(r({ role: 'haut' })).toMatchObject({ silence: true, cas: 'I' });
    expect(r({ role: 'test' })).toMatchObject({ silence: true, cas: 'I' });
    expect(r({ derniere: true })).toMatchObject({ silence: true, cas: 'J' });
    expect(r({ role: 'au_max' })).toMatchObject({ silence: true, cas: 'K' });
    expect(r({ reps: 13, vise: 10 })).toMatchObject({ silence: true, cas: 'N' });
    expect(r({ reps: 11, vise: 10 })).toMatchObject({ silence: true, cas: 'O' });
    expect(r({ reps: 10, vise: 10 })).toMatchObject({ silence: true });
    expect(r({ role: 'echauffement' }).silence).toBe(true);
  });

  test('R : une réussite après proposition est un fait', () => {
    const d = r({ reps: 10, vise: 10, apres: true });
    expect(d).toMatchObject({ silence: false, cas: 'R', fait: true });
    expect(M.phraseDeRate(d)).toBe('10 cette fois.');
  });
});

describe('niveau 1 — réglage × objectif', () => {
  const sous = { reps: 6, vise: 10, bas: 8, charge: 100 };
  test('Me pousser : le repos et le rest-pause d’abord ; la baisse à la 2e série sous la zone', () => {
    const premiere = r(Object.assign({ reglage: 'franc', peutRestPause: true, sousZoneAvant: 0 }, sous));
    expect(premiere.charge.action).toBe('garde');
    expect(premiere.leviers).toEqual(['repos', 'rest_pause']);
    const seconde = r(Object.assign({ reglage: 'franc', peutRestPause: true, sousZoneAvant: 1 }, sous));
    expect(seconde.charge.action).toBe('baisse');
  });
  test('Me pousser sur une isolation : la dégressive', () => {
    const d = r(Object.assign({ reglage: 'franc', isolation: true, peutDegressive: true, peutRestPause: true, sousZoneAvant: 0 }, sous));
    expect(d.leviers).toEqual(['repos', 'degressive']);
  });
  test('Normal : le repos, la même charge et la fourchette ; la baisse dès sous la zone', () => {
    expect(r({ reps: 9, reposReel: 40 }).leviers).toEqual(['repos']);
    expect(r(sous).charge.action).toBe('baisse');
    expect(r(sous).leviers).toEqual(['prendre']);
  });
  test('Prudent : la baisse dès sous la zone, garde 2, jamais de rest-pause', () => {
    const d = r(Object.assign({ reglage: 'prudent', peutRestPause: true }, sous));
    expect(d.charge.action).toBe('baisse');
    expect(d.garde).toBe(2);
    expect(d.leviers).not.toContain('rest_pause');
    const e = r({ reglage: 'prudent', reps: 9, peutRestPause: true });
    expect(e.garde).toBe(2);
    expect(e.leviers).not.toContain('rest_pause');
  });
  test('Force protège la charge : la grosse série (rang 0) ne baisse pas, le rest-pause passe avant', () => {
    const d = r(Object.assign({ objectif: 'force', rang: 0, peutRestPause: true }, sous));
    expect(d.charge.action).toBe('garde');
    expect(d.leviers).toContain('rest_pause');
    expect(r(Object.assign({ objectif: 'force', rang: 2 }, sous)).charge.action).toBe('baisse');
    expect(r(Object.assign({ objectif: 'force', rang: 0, reglage: 'prudent' }, sous)).charge.action).toBe('baisse');
  });
  test('Muscle protège le volume : la baisse vient plus tôt, à la borne basse de la zone', () => {
    expect(r({ objectif: 'muscle', reps: 8, vise: 10, bas: 8 }).charge.action).toBe('baisse');
    expect(r({ objectif: 'force', reps: 8, vise: 10, bas: 8 }).charge.action).toBe('garde');
  });
  test('Les deux : la charge sur les barres, les reps sur les accessoires', () => {
    expect(r({ objectif: 'les_deux', barre: true, reps: 8, vise: 10, bas: 8 }).charge.action).toBe('garde');
    expect(r({ objectif: 'les_deux', barre: false, reps: 8, vise: 10, bas: 8 }).charge.action).toBe('baisse');
  });
  test('Forme : Prudent toujours, et le rappel « J’ai mal » dit tôt', () => {
    const d = r({ objectif: 'forme', reps: 9 });
    expect(d.garde).toBe(2);
    expect(d.rappelMal).toBe(true);
    expect(r(Object.assign({ objectif: 'forme' }, sous)).charge.action).toBe('baisse');
  });
});

describe('niveau 1 — les contextes', () => {
  test.each([['entretien'], ['decharge'], ['semaineDeTest'], ['calage'], ['debutant'], ['douleur'], ['premiereFois'], ['figure']])(
    '%s : le coach se tait', (cle) => {
      const d = r({ reps: 6, [cle]: true });
      expect(d.silence).toBe(true);
      expect(d.raison).toBeTruthy();
    });
  test('sèche : « en sèche, c’est attendu »', () => {
    const d = r({ reps: 9, seche: true });
    expect(d.seche).toBe(true);
    expect(M.phraseDeRate(d)).toMatch(/En sèche, c’est attendu\./);
  });
  test('zone à ménager ou douleur la veille : le rappel, jamais pousser', () => {
    ['zoneAMenager', 'douleurHier'].forEach((cle) => {
      const d = r({ reglage: 'franc', reps: 6, vise: 10, bas: 8, sousZoneAvant: 0, peutRestPause: true, [cle]: true });
      expect(d.rappelMal).toBe(true);
      expect(d.leviers).not.toContain('rest_pause');
      expect(d.leviers).not.toContain('degressive');
    });
  });
  test('« J’ai peu de temps » : pas de levier repos', () => {
    expect(r({ reps: 9, reposReel: 40, peuDeTemps: true }).leviers).not.toContain('repos');
  });
  test('autre salle : on le dit', () => {
    expect(M.phraseDeRate(r({ reps: 9, autreSalle: true }))).toMatch(/Autre salle que d’habitude\./);
  });
  test('deux propositions ignorées : silence jusqu’à la fin de l’exercice', () => {
    expect(r({ reps: 9, ignorees: 1 }).silence).toBe(false);
    expect(r({ reps: 9, ignorees: 2 })).toMatchObject({ silence: true, raison: 'ignorees' });
  });
  test('L : jamais d’« Au max » après un échec franc', () => {
    const d = r({ reps: 9, reserve: 0 });
    expect(d.pasDAuMax).toBe(true);
    expect(M.phraseDeRate(d)).toMatch(/Pas d’« Au max »/);
    expect(r({ reps: 9 }).pasDAuMax).toBe(false);
  });
  test('rien de plus léger au pas du matériel : on garde, on ne baisse pas', () => {
    const d = r({ charge: 2.5, reps: 3, vise: 10, bas: 8, pas: 2.5 });
    expect(d.charge.action).toBe('garde');
  });
});

describe('niveau 2 — l’exercice', () => {
  const e = (o) => M.reactionAuRate(Object.assign({ niveau: 'exercice', charge: 80, restantes: 2, reglage: 'normal',
    faites: [{ reps: 7, vise: 8 }, { reps: 7, vise: 8 }] }, o || {}));
  test('après 2 séries sous la cible, la suivante vise ce qui vient d’être fait, la charge inchangée', () => {
    const d = e();
    expect(d).toMatchObject({ silence: false, vise: 7, garde: 1 });
    expect(d.fourchette).toEqual([6, 8]);
    expect(d.charge).toEqual({ action: 'garde', kg: 80 });
    expect(M.phraseDeRate(d)).toBe('7 puis 7, sous la cible. La suite vise 7, garde 1, entre 6 et 8.');
  });
  test('une seule série sous la cible, ou la dernière tenue : rien', () => {
    expect(e({ faites: [{ reps: 8, vise: 8 }, { reps: 7, vise: 8 }] }).silence).toBe(true);
    expect(e({ faites: [{ reps: 7, vise: 8 }] }).silence).toBe(true);
  });
  test('plus de série à venir : rien ; les contextes qui se taisent aussi', () => {
    expect(e({ restantes: 0 }).silence).toBe(true);
    expect(e({ entretien: true }).silence).toBe(true);
    expect(e({ ignorees: 2 }).silence).toBe(true);
  });
  test('Prudent : garde 2', () => { expect(e({ reglage: 'prudent' }).garde).toBe(2); });
});

describe('niveau 3 — la forme du jour', () => {
  const ex = (slug, flanche, plus) => Object.assign({ slug: slug, nom: slug, flanche: flanche }, plus || {});
  const f = (o) => M.reactionAuRate(Object.assign({ niveau: 'seance', restants: 2,
    exercices: [ex('tractions', true), ex('incline', false), ex('rowing', true, { chargeBaissee: true })] }, o || {}));
  test('2 exercices sur les 3 derniers flanchent : la carte, des faits, deux gestes', () => {
    const d = f();
    expect(d).toMatchObject({ silence: false, n: 2, sur: 3, boutons: ['ajuste', 'garde'] });
    expect(d.baisses).toEqual(['rowing']);
    expect(d.effet).toEqual({ seriesEnMoins: 1, pasDAuMax: true });
    expect(M.phraseDeRate(d)).toBe('Tes séries sont sous la cible sur 2 des 3 derniers exercices, et tu as baissé la charge sur rowing. Pour la fin de séance ?');
  });
  test('un seul exercice qui flanche : rien', () => {
    expect(f({ exercices: [ex('a', true), ex('b', false), ex('c', false)] }).silence).toBe(true);
  });
  test('seulement les 3 derniers comptent', () => {
    expect(f({ exercices: [ex('a', true), ex('b', true), ex('c', false), ex('d', false), ex('e', false)] }).silence).toBe(true);
  });
  test('un exercice fait pour la 1re fois, ou en calage, ne compte pas', () => {
    expect(f({ exercices: [ex('a', true, { premiere: true }), ex('b', true, { calage: true }), ex('c', true)] }).silence).toBe(true);
  });
  test('UNE fois par séance : répondue ou déjà posée, jamais reposée', () => {
    expect(f({ reponse: 'garde' }).silence).toBe(true);
    expect(f({ reponse: 'ajuste' }).silence).toBe(true);
    expect(f({ dejaPosee: true }).silence).toBe(true);
  });
  test('plus d’exercice à venir : rien ; les contextes qui se taisent aussi', () => {
    expect(f({ restants: 0 }).silence).toBe(true);
    expect(f({ decharge: true }).silence).toBe(true);
  });
});

describe('paris ratés à la suite', () => {
  const p = (o) => M.reactionAuRate(Object.assign({ niveau: 'paris', n: 2, charge: 100, reps: 5, pas: 2.5 }, o || {}));
  test('après 2 séances de suite : un cran dessous (même nombre de reps) ou je retente', () => {
    const d = p();
    expect(d).toMatchObject({ silence: false, palier: { charge: 100, reps: 5 }, cran: { charge: 97.5, reps: 5 }, boutons: ['cran', 'retente'] });
    expect(d.cran.charge).toBeLessThan(d.palier.charge);
    expect(M.phraseDeRate(d)).toBe('Ton pari n’a pas tenu 2 séances de suite. Un cran dessous : 97,5 kg × 5, ou tu retentes ?');
  });
  test('un seul raté : rien ; déjà proposé ou répondu : rien', () => {
    expect(p({ n: 1 }).silence).toBe(true);
    expect(p({ dejaPropose: true }).silence).toBe(true);
    expect(p({ reponse: 'retente' }).silence).toBe(true);
  });
  test('rien de plus léger : rien', () => { expect(p({ charge: 2.5 }).silence).toBe(true); });
  test('Entretenir, décharge : rien', () => { expect(p({ entretien: true }).silence).toBe(true); expect(p({ decharge: true }).silence).toBe(true); });
});

describe('les mots, la pureté', () => {
  test('une phrase de réaction : un fait, jamais un bravo, aucun point d’exclamation', () => {
    const textes = [r({ reps: 9 }), r({ reps: 6 }), r({ reps: 9, reserve: 0 }), r({ reps: 10, reserve: 0 }), r({ reps: 9, seche: true })]
      .map((d) => M.phraseDeRate(d));
    textes.forEach((t) => {
      expect(t).toMatch(/^\S/);
      expect(t).not.toMatch(/bravo|super|génial|!|null|undefined|NaN/i);
    });
    expect(textes[0]).toBe('9 au lieu de 10. Même charge, garde 1, entre 8 et 10.');
    expect(textes[1]).toMatch(/^6 au lieu de 10\. On passe à \d+(,\d+)? kg, garde 1, entre 8 et 10\.$/);
  });
  test('les boutons : « +1 min », « Prendre X kg », « Rest-pause »', () => {
    const d = r({ reps: 6, vise: 10, bas: 8, charge: 100 });
    expect(M.boutonDeRate('repos')).toBe('+1 min');
    expect(M.boutonDeRate('prendre', d)).toBe('Prendre ' + Modele.charge(d.charge.kg));
    expect(M.boutonDeRate('rest_pause')).toBe('Rest-pause');
    expect(M.boutonDeRate('degressive')).toBe('Dégressive');
  });
  test('pure : l’entrée n’est pas modifiée, la même entrée donne la même sortie', () => {
    const c = base({ reps: 6 });
    const copie = JSON.parse(JSON.stringify(c));
    const a = M.reactionAuRate(c), b = M.reactionAuRate(c);
    expect(c).toEqual(copie);
    expect(a).toEqual(b);
  });
  test('le niveau par défaut est la série', () => {
    const c = base({ reps: 9 }); delete c.niveau;
    expect(M.reactionAuRate(c).niveau).toBe('serie');
    expect(M.reactionAuRate(null)).toMatchObject({ silence: true });
  });
});
