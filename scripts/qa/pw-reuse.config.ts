// Same as playwright.config.ts but reuses servers already running on 8788/3001 (for re-running single specs).
import base from "../../playwright.config";

const config = { ...base, testDir: "../../tests/e2e", globalSetup: "../../tests/e2e/global-setup.ts", webServer: undefined };
export default config;
