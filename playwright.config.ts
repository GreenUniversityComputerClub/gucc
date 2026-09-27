import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the real architecture, fully isolated from the
 * development setup (its own database, ports and build folder):
 *
 *   API Worker  wrangler dev --persist-to .e2e/state   http://localhost:8788
 *   Website     production build in .next-e2e          http://localhost:3001
 *
 *   bun run test:e2e      (prepares a fresh database, then runs Playwright)
 *
 * The Worker prints development emails (verification, invitations) to its
 * log; tests read links from there. See docs/platform/TESTING.md.
 */
const API = "http://localhost:8788";
const WEB = "http://localhost:3001";
const MAIL_LOG = ".e2e/api-worker.log";
process.env.E2E_MAIL_LOG = MAIL_LOG;
process.env.GUCC_LOCAL_STATE = ".e2e/state";
process.env.E2E_API_URL = API;

const webEnv = `NEXT_DIST_DIR=.next-e2e API_BASE_URL=${API} NEXT_PUBLIC_API_BASE_URL=${API} NEXT_PUBLIC_MEDIA_BASE_URL=${API} NEXT_PUBLIC_BASE_URL=${WEB}`;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: WEB,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: `mkdir -p .e2e && bunx wrangler dev --port 8788 --persist-to .e2e/state --var PUBLIC_BASE_URL:${WEB} --var FRONTEND_ORIGIN:${WEB} --var MEDIA_BASE_URL:${API} > ${MAIL_LOG} 2>&1`,
      url: `${API}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // The build reads the API, so wait for it first.
      command: `until curl -sf ${API}/health > /dev/null; do sleep 1; done; ${webEnv} bunx next build && ${webEnv} bunx next start -p 3001`,
      url: `${WEB}/robots.txt`,
      reuseExistingServer: false,
      timeout: 900_000,
    },
  ],
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" }, testMatch: /mobile\.spec\.ts/ },
  ],
});
