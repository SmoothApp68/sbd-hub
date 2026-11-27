/** @jest-environment node */
//
// CI sans gaspillage (27/11/2026) — ce que les workflows des bancs promettent, vérifié.
//
// Règle : on change la façon de lancer, jamais ce qui est vérifié. Ce test tient les promesses :
//   · le passage à « prête » ne relance plus les bancs ;
//   · `npm test` n'est écarté du banc complet QUE par bancs.yml (le job `unit` le joue, lui, sans condition) ;
//   · les « trois verts » ont leur bouton ;
//   · les bancs de PR jouent sur une horloge fixe ET la nuit joue l'heure réelle et chaque frontière de date
//     (sans l'un, l'autre relâcherait une vérification) ;
//   · un banc qui date ses séances par `Date.now()` passe par `horloge.js`.
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const R = path.join(__dirname, '../..');
const lire = (p) => fs.readFileSync(path.join(R, p), 'utf8');
const charger = (p) => yaml.load(lire(p));

describe('bancs.yml', () => {
  const y = charger('.github/workflows/bancs.yml');
  test('un passage à « prête » ne relance rien', () => {
    expect(y.on.pull_request.types).toEqual(['opened', 'synchronize', 'reopened']);
  });
  test('le bouton des trois verts : workflow_dispatch avec le nombre de passages', () => {
    const entree = y.on.workflow_dispatch.inputs.passages;
    expect(entree.default).toBe('3');
    expect(entree.options).toEqual(['1', '2', '3', '4', '5']);
    for (const j of ['banc-complet', 'banc-sequentiel']) {
      expect(y.jobs[j].strategy.matrix.essai).toMatch(/fromJSON\(needs\.passages\.outputs\.liste\)/);
      expect(y.jobs[j].strategy['fail-fast']).toBe(false);
    }
  });
  test('l\'horloge des bancs de PR est fixe : un mercredi, au milieu du mois', () => {
    const h = y.env.BANC_HORLOGE;
    expect(h).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    const d = new Date(h + 'Z');
    expect(d.getUTCDay()).toBe(3);
    expect(d.getUTCDate()).toBeGreaterThanOrEqual(10);
    expect(d.getUTCDate()).toBeLessThanOrEqual(20);
  });
  test('le banc complet ne rejoue pas npm test (le job unit le joue), le séquentiel reste séquentiel', () => {
    const t = JSON.stringify(y.jobs['banc-complet'].steps);
    expect(t).toContain('tout.js --sans-npm-test');
    expect(JSON.stringify(y.jobs['banc-sequentiel'].steps)).toContain('seance-rapide.js --sequentiel');
  });
});

describe('test.yml : le job unit joue toujours npm test, sans condition', () => {
  const y = charger('.github/workflows/test.yml');
  test('npm test, sur chaque PR et sur main', () => {
    expect(y.jobs.unit.steps.some((s) => s.run === 'npm test' && !s.if)).toBe(true);
    expect(y.jobs.unit.if).toBeUndefined();
    expect(Object.keys(y.on)).toEqual(expect.arrayContaining(['push', 'pull_request']));
  });
});

describe('bancs-nuit.yml : ce que l\'horloge fixe retire des PR, la nuit le rejoue', () => {
  const y = charger('.github/workflows/bancs-nuit.yml');
  const m = y.jobs.nuit.strategy.matrix.include;
  test('planifié chaque nuit, et lançable à la main', () => {
    expect(y.on.schedule.length).toBe(1);
    expect(y.on.schedule[0].cron).toMatch(/^\d+ \d+ \* \* \*$/);
    expect('workflow_dispatch' in y.on).toBe(true);
  });
  test('l\'heure réelle : le séquentiel ET le complet', () => {
    const reelles = m.filter((e) => e.horloge === 'reelle');
    expect(reelles.map((e) => e.commande).sort()).toEqual([
      'node tests/banc/seance-rapide.js --sequentiel --rapport seq.json', 'node tests/banc/tout.js --sans-npm-test']);
  });
  // Instant local (Paris) → { jour de semaine, minutes avant la frontière }
  const frontieres = m.filter((e) => e.horloge !== 'reelle');
  const heure = (e) => e.horloge;
  const cherche = (re) => frontieres.filter((e) => re.test(e.nom));
  test('minuit à Paris : un jour ordinaire, 23 h 50', () => {
    const [e] = cherche(/minuit à Paris/); expect(heure(e)).toMatch(/T23:5\d:00$/);
  });
  test('minuit UTC : 00 h 50 à Paris, en hiver (23 h 50 UTC)', () => {
    const [e] = cherche(/minuit UTC/); expect(heure(e)).toMatch(/-(11|12|01|02)-\d\dT00:5\d:00$/);
  });
  test('le 1er du mois : la veille, 23 h 50 ; dimanche → lundi : un dimanche, 23 h 50', () => {
    const [a] = cherche(/1er du mois/); const da = new Date(heure(a) + 'Z');
    expect(da.getUTCDate()).toBe(new Date(Date.UTC(da.getUTCFullYear(), da.getUTCMonth() + 1, 0)).getUTCDate());
    expect(heure(a)).toMatch(/T23:5\d:00$/);
    const [b] = cherche(/dimanche/); expect(new Date(heure(b) + 'Z').getUTCDay()).toBe(0); expect(heure(b)).toMatch(/T23:5\d:00$/);
  });
  test('les deux changements d\'heure : le dernier dimanche de mars (01 h 50) et d\'octobre (02 h 50)', () => {
    const [mars] = cherche(/mars/); const [oct] = cherche(/octobre/);
    const dm = new Date(heure(mars) + 'Z'), dO = new Date(heure(oct) + 'Z');
    expect([dm.getUTCDay(), dO.getUTCDay()]).toEqual([0, 0]);
    expect(dm.getUTCMonth()).toBe(2); expect(dm.getUTCDate() + 7).toBeGreaterThan(31);
    expect(dO.getUTCMonth()).toBe(9); expect(dO.getUTCDate() + 7).toBeGreaterThan(31);
    expect(heure(mars)).toMatch(/T01:5\d:00$/); expect(heure(oct)).toMatch(/T02:5\d:00$/);
  });
  test('chaque frontière joue le banc complet, et la nuit lit l\'heure réelle sans décalage de décor', () => {
    frontieres.forEach((e) => expect(e.commande).toBe('node tests/banc/tout.js --sans-npm-test'));
    expect(JSON.stringify(y.jobs.nuit.steps)).toContain("date +'%Y-%m-%dT%H:%M:%S'");
  });
});

describe('un banc qui date ses séances passe par horloge.js', () => {
  test.each(['tete-3plus1.js'])('%s', (f) => {
    const s = lire('tests/banc/' + f);
    expect(s).toMatch(/tests\/banc\/horloge\.js/);
    expect(s).toMatch(/Horloge\.scriptNavigateur\(Horloge\.DECALAGE\)/);
  });
});
