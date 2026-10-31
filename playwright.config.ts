import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const bundled = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
export default defineConfig({
  testDir: 'e2e',
  timeout: 120000,
  use: {
    baseURL: 'http://127.0.0.1:4317/',
    viewport: { width: 1440, height: 900 },
    launchOptions: existsSync(bundled) ? { executablePath: bundled } : {},
  },
  webServer: {
    command: 'node server/serve.mjs --port=4317',
    url: 'http://127.0.0.1:4317/',
    reuseExistingServer: false,
  },
});
