/** @jest-environment node */
//
// L'outillage du banc d'écran rapide (30/09/2026) : le découpeur de sections
// et le lanceur parallèle, sur un banc FACTICE de trois sections (pas de
// navigateur : ce test tourne en une seconde).
//
// Ce qu'il garantit : les résultats des groupes fusionnent ; l'échec d'un
// groupe se voit et le code de sortie n'est pas nul ; et un groupe qui
// « oublie » une section fait échouer la garantie d'équivalence — même si
// tous les contrôles qu'il a joués sont verts.

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const S = require('../banc/seance-sections.js');
const R = require('../banc/seance-rapide.js');

const FACTICE = path.join(__dirname, '../banc/fixtures/banc-factice.js');
const SANS_CHAINE = [];

jest.setTimeout(30000);

describe('le découpeur', () => {
  test('lit les sections du banc factice, dans l’ordre', () => {
    const b = S.lireBanc(FACTICE);
    expect(b.sections.map((s) => s.id)).toEqual(['A', 'B', 'C', 'D']);
  });

  test('une section non jouée garde ses déclarations sans effet, pas ses gestes', () => {
    const b = S.lireBanc(FACTICE);
    const prog = S.programme(b, S.choisir(b, ['C']));
    expect(prog).toMatch(/const doubler = \(x\) => x \* 2;/);
    expect(prog).not.toMatch(/const deja = await pause/);
    expect(prog).not.toMatch(/A — un/);
    expect(prog).toMatch(/C — se sert du helper de A/);
  });

  test('une section inconnue est une erreur, pas un banc vide', () => {
    const b = S.lireBanc(FACTICE);
    expect(() => S.choisir(b, ['Z'])).toThrow(/sections inconnues : Z/);
  });

  test('le vrai banc se découpe : identifiants uniques, `clore` trouvé, programme valide', () => {
    const b = S.lireBanc();
    const ids = b.sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(['0', '7-G-sexies', '7-G-bis', '8']));
    const f = S.ecrireProgramme(b, S.choisir(b, ['7-G-sexies']));
    execFileSync(process.execPath, ['--check', f]);
    const complet = S.programme(b, b.sections);
    // Le programme complet rejoue TOUTES les sections.
    b.sections.forEach((s) => expect(complet).toContain(s.nom));
  });

  test('chaque section du vrai banc est dans un groupe, exactement', () => {
    const b = S.lireBanc();
    const g = R.repartir(b, 4, R.CHAINES, [R.SECTION_FUSIONNEE]);
    const vues = [].concat.apply([], g.map((x) => x.membres));
    const attendues = b.sections.map((s) => s.id).filter((id) => id !== R.SECTION_FUSIONNEE);
    expect(vues.slice().sort()).toEqual(attendues.slice().sort());
    // Une chaîne n'est jamais coupée entre deux groupes.
    R.CHAINES.chaines.forEach((c) => {
      const ou = new Set(c.map((id) => g.findIndex((x) => x.membres.indexOf(id) >= 0)));
      expect(ou.size).toBe(1);
    });
    // Chaque section a ses préalables dans son groupe : possédés ou rejoués.
    g.forEach((x) => x.membres.forEach((id) => ((R.CHAINES.prealables || {})[id] || []).forEach((p) => {
      expect(x.membres.concat(x.prealables)).toContain(p);
    })));
  });
});

describe('le lanceur parallèle, sur le banc factice', () => {
  test('⚠️ DISCRIMINANT — les groupes fusionnent en un seul résultat, vert', async () => {
    const r = await R.parallele({ banc: FACTICE, groupes: 2, chaines: SANS_CHAINE, durees: { A: 3, B: 2, C: 1, D: 1 } });
    expect(r.groupes.length).toBe(2);
    expect(r.couverture).toEqual([]);
    const noms = r.fusion.controles.map((c) => c.nom);
    // Le préambule est rejoué par chaque groupe ; les sections, une fois.
    expect(noms.filter((n) => /^[ABCD] —/.test(n))).toEqual(['A — un', 'A — deux', 'B — un', 'C — se sert du helper de A', 'C — deux', 'D — après C', 'D — la séance de C est refermée (état propre)', 'D — le réseau coupé par C est rendu (état propre)']);
    // Le contrôle du préambule, rejoué par les deux groupes, compte une fois :
    // le même nombre de contrôles qu'en séquentiel.
    expect(noms.filter((n) => /préambule/.test(n)).length).toBe(1);
    const seq = await R.sequentiel({ banc: FACTICE });
    expect(R.comparer(seq, r).differences).toEqual([]);
    expect(r.fusion.controles.length).toBe(seq.fusion.controles.length);
    expect(R.resumer(r).vert).toBe(true);
  });

  test('⚠️ DISCRIMINANT — l’échec d’un groupe se voit, et le banc n’est pas vert', async () => {
    const r = await R.parallele({ banc: FACTICE, groupes: 3, chaines: SANS_CHAINE, durees: {},
      env: { BANC_FACTICE_ECHEC: 'B' } });
    expect(r.fusion.echecs).toBeGreaterThan(0);
    const s = R.resumer(r);
    expect(s.vert).toBe(false);
    expect(s.texte).toMatch(/❌ B — un/);
  });

  test('un groupe qui plante (pas de rapport) : la couverture le dit', async () => {
    const r = await R.parallele({ banc: FACTICE, groupes: 3, chaines: SANS_CHAINE, durees: {},
      env: { BANC_FACTICE_PLANTE: 'C' } });
    expect(r.couverture.join(' ')).toMatch(/aucun rapport/);
    expect(R.resumer(r).vert).toBe(false);
  });

  test('⚠️ DISCRIMINANT (mutation de l’outil) — un groupe qui « oublie » une section fait échouer l’équivalence', async () => {
    const b = S.lireBanc(FACTICE);
    const groupes = [{ membres: ['A'] }, { membres: ['B', 'C', 'D'] }];
    // Le programme du groupe 2 ne joue que B : il « oublie » C, sans erreur.
    const oublieux = (g) => S.ecrireProgramme(b, S.choisir(b, g.membres.filter((id) => id !== 'C')));
    const r = await R.parallele({ banc: FACTICE, groupesFixes: groupes, construire: oublieux, chaines: SANS_CHAINE });
    // Tous les contrôles joués sont verts…
    expect(r.fusion.echecs).toBe(0);
    // …mais il en manque, et la couverture l'a vu.
    expect(r.fusion.controles.filter((c) => /^C —/.test(c.nom)).length).toBe(0);
    expect(r.couverture.join(' ')).toMatch(/manquent : C/);
    expect(R.resumer(r).vert).toBe(false);
  });

  test('en ligne de commande : code de sortie non nul sur un échec', () => {
    // Le lanceur ne sait lire que le vrai banc en ligne de commande ; on vérifie
    // ici le code de sortie du banc factice lui-même, qu'il relaie.
    let code = 0;
    try {
      execFileSync(process.execPath, [FACTICE], { env: Object.assign({}, process.env, { BANC_FACTICE_ECHEC: 'A', BANC_PORT: '1' }), stdio: 'ignore' });
    } catch (e) { code = e.status; }
    expect(code).not.toBe(0);
  });
});

describe('un banc réduit', () => {
  test('⚠️ il le dit en toutes lettres, et ajoute ce qui précède dans une chaîne', async () => {
    const r = await R.reduit(['C'], { banc: FACTICE, chaines: [['A', 'C']] });
    expect(r.jouees).toBe(2);
    expect(r.ajoutees).toEqual(['A']);
    const s = R.resumer(r);
    expect(s.texte).toMatch(/BANC RÉDUIT : 2 section\(s\) sur 4/);
    expect(s.vert).toBe(true);
  });
});

describe('les préalables', () => {
  test('⚠️ DISCRIMINANT — un préalable est rejoué, mais ses contrôles ne comptent qu’une fois', async () => {
    // Deux groupes : A seul ; C, avec A rejoué en préalable.
    const b = S.lireBanc(FACTICE);
    const r = await R.parallele({ banc: FACTICE, groupesFixes: [{ membres: ['A', 'B'] }, { membres: ['C', 'D'], prealables: ['A'] }] });
    expect(r.couverture).toEqual([]);
    expect(r.fusion.controles.filter((c) => /^A —/.test(c.nom)).length).toBe(2);
    const seq = await R.sequentiel({ banc: FACTICE });
    expect(R.comparer(seq, r).differences).toEqual([]);
    expect(b.sections.length).toBe(4);
  });

  test('⚠️ un préalable en échec fait échouer le banc, sans compter ses contrôles deux fois', async () => {
    const r = await R.parallele({ banc: FACTICE, groupesFixes: [{ membres: ['A', 'B'] }, { membres: ['C', 'D'], prealables: ['A'] }],
      env: { BANC_FACTICE_ECHEC: 'A' } });
    expect(r.fusion.prealablesEnEchec.join(' ')).toMatch(/préalable « A »/);
    expect(R.resumer(r).vert).toBe(false);
    expect(r.fusion.controles.filter((c) => /^A — deux/.test(c.nom)).length).toBe(1);
  });

  test('un groupe qui n’a pas rejoué son préalable : la couverture le dit', async () => {
    const b = S.lireBanc(FACTICE);
    const sansPrealable = (g) => S.ecrireProgramme(b, S.choisir(b, g.membres));
    const r = await R.parallele({ banc: FACTICE, groupesFixes: [{ membres: ['A', 'B'] }, { membres: ['C', 'D'], prealables: ['A'] }],
      construire: sansPrealable });
    expect(r.couverture.join(' ')).toMatch(/manquent : A/);
  });

  test('un banc réduit rejoue les préalables et compte les chaînes', () => {
    const p = R.planReduit(['C'], { chaines: [['B', 'C']], prealables: { B: ['A'] } });
    expect(p.membres.sort()).toEqual(['B', 'C']);
    expect(p.prealables).toEqual(['A']);
  });
});

test('le fichier des chaînes est lisible et ne nomme que des sections du banc', () => {
  const b = S.lireBanc();
  const ids = b.sections.map((s) => s.id);
  const nommees = [].concat.apply([], R.CHAINES.chaines)
    .concat(Object.keys(R.CHAINES.prealables || {}))
    .concat([].concat.apply([], Object.keys(R.CHAINES.prealables || {}).map((k) => R.CHAINES.prealables[k])));
  const inconnues = nommees.filter((id) => ids.indexOf(id) < 0);
  expect(inconnues).toEqual([]);
  expect(fs.existsSync(path.join(__dirname, '../banc/seance-chaines.json'))).toBe(true);
});

// ── 07/10/2026 — UNE SECTION QUI PLANTE N'ARRÊTE PLUS LE SÉQUENTIEL ─────────
// Au séquentiel de 58-1, une exception au contrôle [57-1] (un `page.click` qui
// attendait 30 s) a tué le banc : `forge` et `8` n'ont jamais joué, et le
// résumé ne disait que le premier échec.
describe('le séquentiel résistant', () => {
  test('⚠️ DISCRIMINANT — C plante : le banc continue, D joue, et l’exception est un échec compté', async () => {
    const seq = await R.sequentiel({ banc: FACTICE, env: { BANC_FACTICE_PLANTE: 'C' } });
    expect(seq.couverture).toEqual([]);
    const noms = seq.fusion.controles.map((c) => (c.ok ? '✅ ' : '❌ ') + c.nom);
    expect(noms).toContain('✅ D — après C');
    // 161 — la section qui plante laisse une séance ouverte : le découpeur la remet à propre, D part d'un état propre.
    expect(noms).toContain('✅ D — la séance de C est refermée (état propre)');
    expect(noms).toContain('✅ D — le réseau coupé par C est rendu (état propre)');
    expect(noms.filter((n) => /^❌ \[exception\] C\. LA TROISIÈME/.test(n)).length).toBe(1);
    // Le reste de C, après l'exception, ne joue pas (la section s'arrête là).
    expect(noms.filter((n) => /C — se sert/.test(n))).toEqual([]);
    const s = R.resumer(seq);
    expect(s.vert).toBe(false);
    expect(s.texte).toMatch(/❌ \[exception\] C\. LA TROISIÈME — la section s’arrête là, le banc continue/);
  });

  test('⚠️ tous les échecs sont rapportés à la fin, pas seulement le premier', async () => {
    const seq = await R.sequentiel({ banc: FACTICE, env: { BANC_FACTICE_ECHEC: 'B', BANC_FACTICE_PLANTE: 'C' } });
    const s = R.resumer(seq);
    expect(s.texte).toMatch(/❌ B — un/);
    expect(s.texte).toMatch(/❌ \[exception\] C\./);
    expect(seq.fusion.echecs).toBeGreaterThanOrEqual(2);
  });

  test('(mutation de l’outil) — le banc joué tel quel, sans protection, s’arrête à C et D manque', async () => {
    const r = await R.jouer(FACTICE, { env: { BANC_FACTICE_PLANTE: 'C' } });
    expect(r.rapport).toBeNull();
    expect(fs.readFileSync(r.journal, 'utf8')).not.toMatch(/D — après C/);
  });

  test('sans exception, le séquentiel résistant rend les mêmes contrôles que le banc joué tel quel', async () => {
    const seq = await R.sequentiel({ banc: FACTICE });
    const brut = await R.jouer(FACTICE, {});
    expect(seq.fusion.controles.map((c) => c.nom)).toEqual(brut.rapport.controles.map((c) => c.nom));
    expect(R.resumer(seq).vert).toBe(true);
  });

  test('les déclarations d’une section restent visibles des suivantes ; une classe est refusée', () => {
    const b = S.lireBanc(FACTICE);
    const prog = S.programme(b, b.sections, { resistant: true });
    // `const doubler` de A devient `let doubler;` avant le try, puis une affectation.
    expect(prog).toMatch(/let doubler, deja;\n\s+try \{/);
    expect(prog).toMatch(/\(doubler = \(x\) => x \* 2\);/);
    expect(prog.match(/catch \(exceptionDuBanc\)/g).length).toBe(4);
    const faux = Object.assign({}, b, { sections: b.sections.map((s, i) => i ? s : Object.assign({}, s,
      { instructions: s.instructions.concat([{ type: 'ClassDeclaration', start: 0, end: 0 }]) })) });
    expect(() => S.programme(faux, faux.sections, { resistant: true })).toThrow(/une classe au premier niveau/);
  });

  test('le vrai banc, rendu résistant : un programme valide, chaque section protégée', () => {
    const b = S.lireBanc();
    const f = S.ecrireProgramme(b, b.sections, null, { resistant: true });
    execFileSync(process.execPath, ['--check', f]);
    const prog = fs.readFileSync(f, 'utf8');
    expect(prog.match(/catch \(exceptionDuBanc\)/g).length).toBe(b.sections.length);
  });
});
