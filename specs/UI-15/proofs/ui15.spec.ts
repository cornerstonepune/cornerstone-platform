/**
 * UI-15 proofs 1-3: the three staff actions (add a person, set classes, set subjects), run the way the site runs them.
 * The page is opened as the suite's coordinator (global-setup.ts), the form filled, and then the browser's session is
 * swapped for the person under test before the form is sent, so each action is asked by that person. Fake people only
 * (@cornerstone.test); invented educators get their staff row and grants from tests/access-fixture.sql.
 * Staff actions check the coordinator group.
 */
import { expect, test, type Page } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import postgres from "postgres";
import { mailFor } from "../../../apps/web/tests/mail-server";
import { aClass } from "../../../apps/web/tests/rows";

const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const CLASS = "UI15-CLASS";
const TARGET = { email: "ui15-target@cornerstone.test", name: "Ui Fifteen Target", role: "educator", classes: [] as string[], subjects: [] as string[] };
// an educator of one class: the own-classes group
const EDUCATOR = { email: "ui15-educator@cornerstone.test", name: "Ui Fifteen Educator", role: "educator", classes: [CLASS] };
// the role string says coordinator, but no current grant in the coordinator group (ended before each send)
const ROLE_ONLY = { email: "ui15-role-only@cornerstone.test", name: "Ui Fifteen Role Only", role: "coordinator", classes: [] as string[] };
// the role string says educator, but a current deputy_coordinator grant puts them in the coordinator group
const GRANTED = { email: "ui15-granted@cornerstone.test", name: "Ui Fifteen Granted", role: "educator", classes: [] as string[] };

type Action = "addPerson" | "setClasses" | "setSubjects";
type Who = "educator" | "signed out" | "role only" | "granted" | "coordinator";

const staffList = async () => (await sql<{ v: unknown }[]>`select value as v from config where key = 'app.staff'`)[0].v;
const staffIdOf = async (email: string) =>
  (await sql<{ id: string }[]>`select staff_id as id from pii.staff where email = ${email}`)[0]?.id;

function cookieFor(email: string): string {
  const body = `${Buffer.from(email).toString("base64url")}.${Date.now() + 3_600_000}`;
  return `${body}.${createHmac("sha256", process.env.E2E_AUTH_SECRET!).update(body).digest("hex")}`;
}

async function endGroupGrants(email: string) {
  const id = await staffIdOf(email);
  expect(id, `${email} has a staff row`).toBeTruthy();
  await sql`update staff_role_grant set valid_to = valid_from where staff_id = ${id} and valid_to is null`;
}

test.use({ viewport: { width: 1440, height: 900 } });

test.beforeAll(async () => {
  await aClass(sql, CLASS, "G3", ["Ana", "Ben"]);
  for (const p of [TARGET, EDUCATOR, ROLE_ONLY, GRANTED]) {
    await sql`update config set value = value || ${sql.json([p])} where key = 'app.staff' and not value @> ${sql.json([{ email: p.email }])}`;
  }
  const id = await staffIdOf(GRANTED.email);
  await sql`
    insert into staff_role_grant (tenant_id, staff_id, role_code, valid_from, granted_by)
    select tenant_id, id, 'deputy_coordinator', current_date - 1, 'ui15 proof' from staff s
    where s.id = ${id} and not exists (
      select 1 from staff_role_grant where staff_id = ${id} and role_code = 'deputy_coordinator' and valid_to is null)`;
});
test.afterAll(async () => {
  await sql.end();
});

// each test starts with the target teaching nothing
test.beforeEach(async () => {
  await sql`update config set value = (select jsonb_agg(case when p ->> 'email' = ${TARGET.email}
    then p || ${sql.json({ classes: [], subjects: [] })} else p end) from jsonb_array_elements(value) p) where key = 'app.staff'`;
});

/** Opens the form as the coordinator, fills it, swaps the session for `who`, sends it; returns the new person's email. */
async function send(page: Page, action: Action, who: Who): Promise<string> {
  const added = `ui15-new-${randomUUID().slice(0, 8)}@cornerstone.test`;
  let submit;
  if (action === "addPerson") {
    await page.goto("/staff");
    await page.locator("summary", { hasText: "Add a member of staff" }).click();
    await page.getByLabel("Name").fill("Ui Fifteen Added");
    await page.getByLabel("School email").fill(added);
    submit = page.getByRole("button", { name: "Add and send a link" });
  } else {
    await page.goto(`/staff?q=${encodeURIComponent(TARGET.name)}`);
    const row = page.getByRole("table", { name: "Staff" }).locator(`tr[data-person="${TARGET.email}"]`);
    if (action === "setClasses") {
      await row.locator("summary").first().click();
      await row.getByLabel(CLASS).check();
      submit = row.getByRole("button", { name: "Save the classes" });
    } else {
      await row.locator("summary").nth(1).click();
      await row.locator('input[name="subject"]').first().check();
      submit = row.getByRole("button", { name: "Save the subjects" });
    }
  }
  const ctx = page.context();
  if (who !== "coordinator") {
    await ctx.clearCookies();
    const email = { educator: EDUCATOR.email, "role only": ROLE_ONLY.email, granted: GRANTED.email }[who as string];
    if (email) await ctx.addCookies([{ name: "cs_staff", value: cookieFor(email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
    if (who === "role only") await endGroupGrants(ROLE_ONLY.email);
  }
  // the action itself was asked: a POST carrying the action's id
  const asked = page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"]);
  await submit.click();
  await asked;
  return added;
}

const ACTIONS: Action[] = ["addPerson", "setClasses", "setSubjects"];

for (const who of ["educator", "signed out"] as Who[]) {
  for (const action of ACTIONS) {
    test(`1 ${action} refuses a person not in the coordinator group (${who}): no row changes, no email`, async ({ page }) => {
      const before = await staffList();
      const added = await send(page, action, who);
      await page.waitForTimeout(1_000);
      expect(await staffList(), "the staff list is unchanged").toEqual(before);
      expect(mailFor(added), "no email was sent").toHaveLength(0);
    });
  }
}

for (const action of ACTIONS) {
  test(`2 a coordinator can still ${action}`, async ({ page }) => {
    const added = await send(page, action, "coordinator");
    await expect.poll(async () => {
      const list = (await staffList()) as { email: string; classes?: string[]; subjects?: string[] }[];
      if (action === "addPerson") return list.some((p) => p.email === added);
      const t = list.find((p) => p.email === TARGET.email)!;
      return action === "setClasses" ? (t.classes ?? []).includes(CLASS) : (t.subjects ?? []).length > 0;
    }).toBe(true);
    if (action === "addPerson") await expect.poll(() => mailFor(added).length).toBe(1);
  });
}

for (const action of ACTIONS) {
  test(`3 ${action}: role 'coordinator' with no coordinator-group grant is refused`, async ({ page }) => {
    const before = await staffList();
    const added = await send(page, action, "role only");
    await page.waitForTimeout(1_000);
    expect(await staffList(), "the staff list is unchanged").toEqual(before);
    expect(mailFor(added), "no email was sent").toHaveLength(0);
  });
}

test("3 setSubjects: role 'educator' with a coordinator-group grant is allowed", async ({ page }) => {
  await send(page, "setSubjects", "granted");
  await expect.poll(async () => {
    const list = (await staffList()) as { email: string; subjects?: string[] }[];
    return (list.find((p) => p.email === TARGET.email)!.subjects ?? []).length;
  }).toBeGreaterThan(0);
});
