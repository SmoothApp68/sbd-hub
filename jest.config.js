// jest.config.js
//
// Ce que Jest parcourt (135, point 1). Les copies de travail des agents vivent
// dans `.claude/worktrees/` : sans garde, Jest y trouvait une seconde copie de
// chaque test (267 fichiers au lieu de 214 — chaque test lancé deux fois) et
// plantait sur le `package.json` en double (« Haste module naming collision:
// sbd-hub »). `roots` borne la recherche aux tests du dépôt ; les deux listes
// d'exclusion gardent la même règle si quelqu'un élargit `roots` un jour.
// `/node_modules/` est remis à la main : poser `testPathIgnorePatterns`
// remplace la valeur par défaut de Jest, qui l'excluait.
const HORS_DU_DEPOT = ['<rootDir>/\\.claude/', '<rootDir>/archive/', '/node_modules/'];

module.exports = {
  testEnvironment: "jsdom",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/tests/**/*.test.js"],
  transform: {
    "^.+\\.js$": "babel-jest"
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/js/$1"
  },
  globalSetup: "<rootDir>/jest.globalSetup.js",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testPathIgnorePatterns: HORS_DU_DEPOT,
  modulePathIgnorePatterns: ['<rootDir>/\\.claude/', '<rootDir>/archive/']
};
