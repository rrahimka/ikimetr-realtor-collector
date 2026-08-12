import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:3099';

export default defineConfig({
  testDir: './smoke',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL,
    browserName: 'chromium',
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'next dev -H 127.0.0.1 -p 3099',
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      LOCAL_AUTH_PASSWORD: process.env.LOCAL_AUTH_PASSWORD ?? '',
      SESSION_SECRET: process.env.SESSION_SECRET ?? '',
    },
  },
});
