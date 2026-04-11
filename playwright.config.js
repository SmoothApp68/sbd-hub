const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8080',
    viewport: { width: 390, height: 844 },
    actionTimeout: 10000,
    screenshot: 'only-on-failure',
  },
  reporter: [['html', { open: 'never' }], ['list']],
  webServer: {
    command: 'http-server . -p 8080 -s',
    port: 8080,
    reuseExistingServer: true,
  },
});
