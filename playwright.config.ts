import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './test',
  testMatch: '*.test.ts',
  retries: 3,
  workers: process.env.CI ? 2 : undefined,
  testIgnore: [
    'test/performance.test.ts',
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
})
