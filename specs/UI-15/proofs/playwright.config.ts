// The site's own Playwright config (apps/web/playwright.config.ts: production build, engine, mail server, signed-in
// coordinator), pointed at this folder's ui15.spec.ts instead of apps/web/tests.
import path from "node:path";
import base, { SIGNED_IN } from "../../../apps/web/playwright.config";

const web = path.resolve(__dirname, "../../../apps/web");

export default {
  ...base,
  testDir: __dirname,
  testMatch: /ui15\.spec\.ts/,
  outputDir: path.join(web, "test-results", "ui15"),
  globalSetup: path.join(web, "tests/global-setup.ts"),
  projects: [{ name: "ui15", use: { storageState: SIGNED_IN } }],
  // the site's servers start from apps/web, as they do for its own suite
  webServer: (base.webServer as { cwd?: string }[]).map((s) => ({ ...s, cwd: s.cwd ?? web })),
};
