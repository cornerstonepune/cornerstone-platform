/**
 * U96 — "What needs doing: merge into Today (coordinator); it is the waiting-on-you list" (page charter Part C). One test per line: the old
 * address answers 308 to Today and leaves the menu; Today carries the old page's filters and its count; a row opens its tasks on the right,
 * each with its own action, ten to a page; a topic is marked taught from Today's panel, for the class chosen; an educator's Today carries her
 * own waiting list; and what the system now knows is folded under the list. The class is the spec's own (U96T), its children from
 * tests/fake-names.ts; the educator is mapped to it alone. The walk of every row and task is u65's (tests/u65-what-needs-doing-walk.spec.ts).
 */
import { createHmac } from "node:crypto";
import { expect, test, type Browser } from "@playwright/test";
import postgres from "postgres";
import { FAKE_CHILDREN } from "./fake-names";
import { menu } from "./menu";
import { aClass, aPerson, forgetPerson } from "./rows";
import { panel, workAt, workRow } from "./today-work";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "U96T";
const EDUCATOR = { email: "u96-educator@cornerstone.test", name: "Una Ninety", role: "educator", classes: [SECTION], subjects: ["NUM"] };
let topic: { code: string; name: string };

async function asEducator(browser: Browser) {
  const body = `${Buffer.from(EDUCATOR.email).toString("base64url")}.${Date.now() + 3_600_000}`;
  const mac = createHmac("sha256", process.env.E2E_AUTH_SECRET!).update(body).digest("hex");
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "cs_staff", value: `${body}.${mac}`, domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return { context, page: await context.newPage() };
}

test.beforeAll(async () => {
  await aClass(sql, SECTION, "G2", FAKE_CHILDREN.slice(8, 10) as string[]);
  await sql`update school_class set taught = '{}' where label = ${SECTION}`;
  [topic] = await sql<{ code: string; name: string }[]>`select code, name from topic where subject_code = 'NUM' order by ord, code limit 1`;
  await aPerson(sql, EDUCATOR);
});
test.afterAll(async () => {
  await sql`update school_class set taught = '{}' where label = ${SECTION}`;
  await forgetPerson(sql, EDUCATOR.email);
  await sql.end();
});

test("merge into Today: the old address answers 308 to Today, its filters carried, and the menu has no line of its own for it", async ({ page }) => {
  const res = await page.request.get(`/setup/needs-doing?kind=taught&class=${SECTION}`, { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers().location).toBe(`/today?kind=taught&class=${SECTION}`);
  await page.goto(`/setup/needs-doing?class=${SECTION}`);
  await expect(page).toHaveURL(new RegExp(`/today\\?class=${SECTION}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today, the school");
  const nav = await menu(page);
  await expect(nav.getByRole("link", { name: "What needs doing" })).toHaveCount(0);
  await expect(nav.locator("a[href='/setup/needs-doing']")).toHaveCount(0);
});

test("it is the waiting-on-you list: one filter row (Subject, Class, What) narrows the rows, and the count of what waits stays the whole", async ({ page }) => {
  await page.goto("/today");
  const count = await page.locator("[data-todo]").getAttribute("data-todo");
  await expect(page.locator("[data-filterbar]")).toBeVisible();
  for (const name of ["Class", "What"]) await expect(page.locator("[data-filterbar]").getByLabel(name)).toBeVisible();
  await page.goto("/today?group=taught");
  await expect(page.locator("[data-active-filters]")).toContainText("What: Topics to mark as taught");
  await expect(page.locator("[data-waiting] [data-row]")).toHaveCount(1);
  await expect(workRow(page, "taught")).toHaveCount(1);
  // the count is what waits on her, never the filters' narrowing of it
  await expect(page.locator("[data-todo]")).toHaveAttribute("data-todo", count!);
  // skills to approve are never a choice here (specs/UI-7 #3): they are Skills to approve's
  expect(await page.locator("[data-filterbar] select[name=group] option").allInnerTexts()).not.toContain("Skills to approve");
});

test("a row opens its tasks on the right, ten to a page, each with its own action, and the page that does that work full page", async ({ page }) => {
  await page.goto("/today");
  await workRow(page, "taught").locator("a[data-wait-open]").click();
  await expect(page).toHaveURL(/open=wait:group-taught/);
  const rows = panel(page).locator("tr[data-kind=taught]");
  expect(await rows.count()).toBeGreaterThan(0);
  expect(await rows.count()).toBeLessThanOrEqual(10);
  for (const row of await rows.all()) await expect(row.getByRole("button", { name: "Mark as taught" })).toHaveCount(1);
  await expect(panel(page).locator("[data-panel-full]")).toHaveAttribute("href", "/");
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/open=/);
});

test("a topic is marked taught from Today's panel, for the class chosen in the filter, and Today says so", async ({ page }) => {
  await page.goto(workAt("taught", `&subject=NUM&class=${SECTION}`));
  const row = panel(page).locator(`tr[data-kind=taught][data-shows="${topic.name}"]`);
  await expect(row).toContainText(SECTION);
  // with a class chosen there is no class to choose in the row
  await expect(row.getByLabel(`Class taught ${topic.name}`)).toHaveCount(0);
  await row.getByRole("button", { name: "Mark as taught" }).click();
  await expect(page).toHaveURL(/\/today\?/);
  await expect(page.getByRole("main")).toContainText(`${topic.name} is taught in ${SECTION} now`);
  const [said] = await sql<{ n: number }[]>`select count(*)::int as n from school_class sc cross join jsonb_each(sc.taught) w where sc.label = ${SECTION} and (w.value ->> 'taught')::boolean`;
  expect(said.n).toBeGreaterThan(0);
});

test("an educator's Today carries her own waiting list under her day, opened on the right as the coordinator's is", async ({ browser }) => {
  const { context, page } = await asEducator(browser);
  try {
    await page.goto("/today");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today");
    await expect(page.locator("#waiting-h")).toHaveText("Waiting on you");
    const taught = workRow(page, "taught");
    await expect(taught).toHaveCount(1);
    await taught.locator("a[data-wait-open]").click();
    const where = await panel(page).locator("td[data-label=Where]").allInnerTexts();
    expect(where.length).toBeGreaterThan(0);
    for (const w of where) expect(w, "her own class only").toContain(SECTION);
  } finally {
    await context.close();
  }
});

test("what the system now knows this week is folded under the list, for the class chosen", async ({ page }) => {
  await page.goto(`/today?class=${SECTION}`);
  const note = page.locator("details[data-know]");
  await expect(note).not.toHaveAttribute("open", "");
  await note.locator("summary").click();
  await expect(note.getByRole("listitem")).toHaveCount(5);
});
