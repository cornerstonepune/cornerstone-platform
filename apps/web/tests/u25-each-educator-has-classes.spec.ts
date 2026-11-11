/**
 * U25 — each educator has classes (goals/f1a-each-educator-has-classes.yaml, ADR 0073 D1). Nimish, 2026-10-14: "Then the
 * teachers only see, when Achal logs in, things that are relevant to his grades." An educator on the staff list with the
 * classes they teach, as `engine staff add --class` puts them, signs in and the menu says those classes beside their
 * name: what the site is narrowed to is never a guess. The coordinator's are every class.
 *
 * The class is the test's own (tests/rows.ts), made once and kept; the educator is taken off the list after.
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { aClass, aPerson, forgetPerson, teaches } from "./rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "U25-TEST";
const EDUCATOR = { email: "u25-educator@cornerstone.test", name: "U25 Educator", role: "educator" };
const PASSWORD = "u25-a-long-test-password";

test.beforeAll(async () => {
  await aClass(sql, SECTION, "G2", ["Ishaan", "Tara"]);
});
test.afterAll(async () => {
  await forgetPerson(sql, EDUCATOR.email);
  await sql.end();
});

test("an educator signs in and the menu says the classes they teach", async ({ browser }) => {
  await aPerson(sql, { ...EDUCATOR, password: PASSWORD, classes: [SECTION] });

  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  try {
    await page.goto("/login");
    await page.getByLabel("School email").fill(EDUCATOR.email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/today$/);
    // who is signed in is in the bar, and whose classes are said on the name (its title)
    await expect(page.locator("[data-bar]").first()).toContainText(EDUCATOR.name);
    const who = page.locator("[data-bar]").first().getByTestId("who");
    await expect(who).toHaveAttribute("title", new RegExp(`Teaches ${SECTION}`));

    // a person with no class yet is told so, never shown an empty site in silence
    await teaches(sql, EDUCATOR.email, []);
    await page.reload();
    await expect(who).toHaveAttribute("title", /No class yet/);
  } finally {
    await context.close();
  }
});

test("the coordinator's classes are every class", async ({ page }) => {
  await page.goto("/setup/needs-doing");
  await expect(page.locator("[data-bar]").first().getByTestId("who")).toHaveAttribute("title", /Every class/);
});
