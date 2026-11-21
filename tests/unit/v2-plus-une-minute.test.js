// « +1 min » après un raté (MOTEUR §9.39, delta 20/11/2026) : la branche `cle === 'repos'` de `repondreRate` est figée par lecture du source.
// Un minuteur qui tourne gagne `RATE_PLUS_REPOS_S` ; sans minuteur, le geste en arme un à partir du toucher. Un geste de la personne : ni le repos
// conseillé (R2, #732) ni `repos_cible_s` ne sont lus ici. Le comportement est joué par la section `plus-une-minute` du banc.
const fs = require('fs');
const path = require('path');

const SOURCE = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');

function brancheRepos() {
  const debut = SOURCE.indexOf('async function repondreRate(');
  expect(debut).toBeGreaterThan(0);
  const fin = SOURCE.indexOf("} else if (cle === 'degressive')", debut);
  const d = SOURCE.indexOf("if (cle === 'repos') {", debut);
  expect(d).toBeGreaterThan(debut);
  expect(fin).toBeGreaterThan(d);
  // Les commentaires disent la règle (ils nomment `reposConseille`) : on lit le code seul.
  return SOURCE.slice(d, fin).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
}

describe('« +1 min » : la branche de repondreRate', () => {
  const code = brancheRepos();
  test('un minuteur qui tourne : ajusterRepos(RATE_PLUS_REPOS_S)', () => {
    expect(code).toMatch(/if \(chrono\) ajusterRepos\(Moteur\.RATE_PLUS_REPOS_S\);/);
  });
  test('sans minuteur : demarrerChrono arme RATE_PLUS_REPOS_S, sans question de réserve (-1)', () => {
    expect(code).toMatch(/else demarrerChrono\(Moteur\.RATE_PLUS_REPOS_S, iExo, x\.slug, -1\);/);
  });
  test('aucune durée en dur, aucune lecture du conseil ni du repos réglé', () => {
    expect(code).not.toMatch(/\b60\b/);
    expect(code).not.toMatch(/reposConseille|repos_conseille|repos_cible_s|reposCible/);
  });
});
