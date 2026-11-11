/**
 * U53 — Staff and School (goals/uxn2-staff-and-school.yaml). Nimish, 2026-10-22: "the staff table of who teaches which
 * class and subject is edited on a Staff page, not by commands", and "Ayush ... has the account". The School page shows each class
 * with who teaches it. The editing the old Staff page did (tick a person's classes and save) is now giving and ending a grant on
 * Staff and classes (UI-5, u74-staff-grants); the old page only reads.
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { aClass, aPerson, forgetPerson, teaches as teachesClasses } from "./rows";

const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const CLASS = "UXN2-CLASS";
const PERSON = {
  email: "uxn2.ayush@cornerstone.test",
  name: "Ayush Test",
  role: "educator",
  hash: "scrypt$keep$me",
  classes: [] as string[],
};

test.use({ viewport: { width: 1440, height: 900 } });

test.beforeAll(async () => {
  await aClass(sql, CLASS, "G3", ["Uma", "Vik"]);
  await aPerson(sql, PERSON);
});
test.afterAll(async () => {
  await forgetPerson(sql, PERSON.email);
  await sql.end();
});

// each test starts from the person's classes as it says, so any one runs alone
const teaches = (classes: string[]) => teachesClasses(sql, PERSON.email, classes);

test("School shows each class with its grade, its children and who teaches it", async ({
  page,
}) => {
  await teaches([CLASS]);
  await page.goto(`/setup/classes?q=${CLASS}`);
  const row = page
    .getByRole("table", { name: "Classes" })
    .locator("tbody tr", { hasText: CLASS });
  await expect(row).toContainText("Grade 3");
  await expect(row).toContainText("Ayush Test");
  await expect(row.locator("td").nth(2)).toHaveText("2");
  // the way to the Staff page is a tab beside School
  await expect(page.getByRole("navigation", { name: "Pages in this section" }).getByRole("link", { name: "Staff" })).toBeVisible();
});
