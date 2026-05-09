const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8080',
    viewport: { width: 390, height: 844 },
    actionTimeout: 10000,
    screenshot: 'only-on-failure',
    channel: undefined,
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    launchOptions: {
      executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    },
  },
  reporter: [['html', { open: 'never' }], ['list']],
  webServer: {
    command: 'http-server . -p 8080 -s',
    port: 8080,
    reuseExistingServer: true,
  },
});

