/**
 * UI-14 — one source of the site's look. No browser, no database: the two scripts, run in their checking mode.
 * tokens.mjs --check fails if tokens.json, tokens.css, the logo copies or the tab icon differ from what it would write;
 * contrast.mjs --check fails if a pair tokens.json names is short or docs/design-tokens-contrast.md is stale.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test } from "@playwright/test";

const run = (script: string) => {
  try {
    execFileSync(process.execPath, [path.resolve(__dirname, "../scripts", script), "--check"], { encoding: "utf8", stdio: "pipe" });
    return "";
  } catch (e) {
    return (e as { stderr?: string }).stderr || String(e);
  }
};

test("tokens.css, tokens.json, the logo files and the tab icon are what scripts/tokens.mjs makes from docs/frontend/tokens.json", () => {
  expect(run("tokens.mjs")).toBe("");
});

test("every pair tokens.json names reaches its contrast in both themes, and the committed table is the script's", () => {
  expect(run("contrast.mjs")).toBe("");
});
