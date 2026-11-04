const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: '*.spec.js',
  outputDir: 'test-results',
  timeout: 60000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    // Le Chrome installé sur le poste : aucun navigateur à télécharger.
    channel: 'chrome',
    headless: true,
    viewport: { width: 1400, height: 900 },
    trace: 'retain-on-failure',
  },
});
