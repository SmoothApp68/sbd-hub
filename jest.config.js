// jest.config.js
module.exports = {
  testEnvironment: "jsdom",
  testMatch: ["**/tests/**/*.test.js"],
  transform: {
    "^.+\\.js$": "babel-jest"
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/js/$1"
  },
  globalSetup: "<rootDir>/jest.globalSetup.js",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testPathIgnorePatterns: ["<rootDir>/archive/"]
};
