const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: 'https://smoothapp68.github.io/sbd-hub',
    viewport: { width: 390, height: 844 },
    actionTimeout: 10000,
    screenshot: 'only-on-failure',
  },
  reporter: [['html', { open: 'never' }], ['list']],
});
