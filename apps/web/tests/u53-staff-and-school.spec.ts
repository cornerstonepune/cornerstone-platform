/**
 * U53 — Staff and School (goals/uxn2-staff-and-school.yaml). Nimish, 2026-10-22: "the staff table of who teaches which
 * class and subject is edited on a Staff page, not by commands", and "Ayush ... has the account". A coordinator ticks the
 * classes a member of staff teaches and saves; the School page shows each class with who teaches it.
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { aClass, aPerson, forgetPerson, personAsStored, teaches as teachesClasses } from "./rows";

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

const classesOf = async () => (await personAsStored(sql, PERSON.email))?.classes;

test("a coordinator ticks a person's classes on the Staff page and the list keeps them, and the rest of the person", async ({
  page,
}) => {
  await teaches([]);
  await page.goto("/staff");
  const table = page.getByRole("table", { name: "Staff" });
  const row = table.locator(`tr[data-person="${PERSON.email}"]`);
  await expect(row).toContainText("No class yet");
  await row.locator("summary").first().click();
  await row.getByLabel(CLASS).check();
  await row.getByRole("button", { name: "Save the classes" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Ayush Test’s classes are saved",
  );
  expect(await classesOf()).toEqual([CLASS]);
  const stored = await personAsStored(sql, PERSON.email);
  const kept = { password: stored?.password, role: stored?.role };
  expect(kept).toEqual({ password: PERSON.hash, role: "educator" });
  // no password hash is ever on the page
  expect(await page.content()).not.toContain("scrypt$");
  await expect(
    table.locator(`tr[data-person="${PERSON.email}"]`),
  ).toContainText(CLASS);
});

test("a class no child is in refuses everything, and the filter row finds a person", async ({
  page,
}) => {
  await teaches([CLASS]);
  await page.goto("/staff?role=educator&q=ayush");
  await expect(page.locator("[data-filterbar]")).toBeVisible();
  const row = page
    .getByRole("table", { name: "Staff" })
    .locator(`tr[data-person="${PERSON.email}"]`);
  await expect(row).toBeVisible();
  await row.locator("summary").first().click();
  await row.locator("form").first().evaluate((f) => {
    const box = document.createElement("input");
    box.type = "hidden";
    box.name = "class";
    box.value = "NO-SUCH-CLASS";
    f.appendChild(box);
  });
  await row.getByRole("button", { name: "Save the classes" }).click();
  await expect(page.getByRole("status")).toContainText(
    "no child is in NO-SUCH-CLASS",
  );
  expect(await classesOf(), "nothing changed").toEqual([CLASS]);
});

test("School shows each class with its grade, its children and who teaches it", async ({
  page,
}) => {
  await teaches([CLASS]);
  await page.goto(`/school?q=${CLASS}`);
  const row = page
    .getByRole("table", { name: "Classes" })
    .locator("tbody tr", { hasText: CLASS });
  await expect(row).toContainText("Grade 3");
  await expect(row).toContainText("Ayush Test");
  await expect(row.locator("td").nth(2)).toHaveText("2");
  // the way to the Staff page is a tab beside School
  await expect(page.getByRole("navigation", { name: "Pages in this section" }).getByRole("link", { name: "Staff" })).toBeVisible();
});
