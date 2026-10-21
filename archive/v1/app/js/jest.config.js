// jest.config.js
module.exports = {
  testEnvironment: "jsdom",
  testMatch: ["**/tests/**/*.test.js"],
  transform: {
    "^.+\\.js$": "babel-jest" // Utilise Babel pour transformer les fichiers JS
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/js/$1"
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"]
};