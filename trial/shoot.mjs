// TRIAL ONLY (ATH-25): screenshots + axe for the three builds, from a dev server on :3100 with AUTH_DEV_BYPASS=1.
// Usage (from apps/web): node ../../trial/shoot.mjs   Writes trial/options/option-<n>-<w>.png and trial/axe.json
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
const require = createRequire(import.meta.url.replace("trial/shoot.mjs", "apps/web/x.js"));
const { chromium } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");
const key = JSON.parse(readFileSync(new URL("./KEY.json", import.meta.url)));
const route = { stack: "a", "taste-skill": "b", "ui-ux-pro-max": "c" };
const sizes = [[390, 844], [820, 1180], [1440, 900]];
const out = {};
const browser = await chromium.launch();
for (const [n, variant] of Object.entries(key)) {
  const rules = new Set(); let nodes = 0;
  for (const [w, h] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: "light" });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:3100/trial/${route[variant]}`, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    r.violations.forEach((v) => { rules.add(v.id); nodes += v.nodes.length; });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    await page.screenshot({ path: new URL(`./options/option-${n}-${w}.png`, import.meta.url).pathname, fullPage: true });
    if (overflow) rules.add("(sideways-scroll@" + w + ")");
    await ctx.close();
  }
  out[n] = { axeRules: [...rules], axeNodes: nodes };
}
await browser.close();
writeFileSync(new URL("./axe.json", import.meta.url), JSON.stringify(out, null, 2));
console.log("done", Object.fromEntries(Object.entries(out).map(([n, o]) => [n, o.axeRules.length])));
