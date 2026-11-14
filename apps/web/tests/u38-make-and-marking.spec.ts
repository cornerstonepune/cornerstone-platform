/**
 * U38 — Home assessments and Marking open on the educator's class, with a next step per child
 * (goals/ux5b-make-and-marking.yaml). Nimish, 2026-10-15: "Most of the pages just have a long list for no reason. All
 * these things should be expandable and collapsible. They should have the right set of columns which are important. It
 * should be teacher-specific."
 *
 * A Grade 2 class of the test's own, its educator signed in for what only they see:
 * - home assessments: Asha repeats a subtraction mistake, Bina is secure in addition, Chetan has too little work for
 *   the engine to go on, and Dev's is approved already;
 * - marking: Asha's paper read with two answers waiting for a person, Bina's read with nothing waiting and not signed
 *   off, Dev's signed off. Signing off makes evidence, which is append-only, so the class is made once and kept.
 */
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import postgres from "postgres";
import { paperAt } from "./paper-screen";
import { aClass, aReadPaper, aPerson, forgetPerson } from "./rows";
import { isoWeek } from "../lib/week";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "U38-CLASS";
const THIS = isoWeek();
const QR = { asha: "CS38A001", bina: "CS38B002", dev: "CS38D003", home: "CS38D0F1" };
const EDUCATOR = { email: "u38-educator@cornerstone.test", name: "U38 Educator", role: "educator", classes: [SECTION] };
const PASSWORD = "u38-a-long-test-password";
type Answer = [skill: string, rung: string, right: boolean, mistakes: string[]];
const EVIDENCE: Record<string, Answer[]> = {
  Asha: [
    ...Array<Answer>(4).fill(["NUM.OPS.02", "R24", false, ["M_SMALL_FROM_LARGE"]]),
    ...Array<Answer>(2).fill(["NUM.OPS.02", "R24", false, []]),
    ...Array<Answer>(2).fill(["NUM.OPS.02", "R24", true, []]),
  ],
  Bina: Array<Answer>(10).fill(["NUM.OPS.01", "R22", true, []]),
  Chetan: Array<Answer>(2).fill(["NUM.OPS.01", "R22", true, []]),
  Dev: Array<Answer>(10).fill(["NUM.OPS.01", "R22", true, []]),
};
let kids: Record<string, string> = {};
const sheet: Record<string, { id: string; title: string }> = {};
/** Where a read paper opens: its own screen under Assessments (as the coordinator, who sees every paper). */
const screenOf = async (id: string) => (await paperAt({ sheet: id }));

test.beforeAll(async () => {
  kids = await aClass(sql, SECTION, "G2", ["Asha", "Bina", "Chetan", "Dev"]);
  const [{ tenant }] = await sql<{ tenant: string }[]>`select tenant_id as tenant from child_now where id = ${kids.Asha}`;
  // each child's checked work, once: evidence is append-only
  for (const [who, answers] of Object.entries(EVIDENCE)) {
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from evidence_event where child_id = ${kids[who]}`;
    if (n) continue;
    for (const [skill, rung, right, mistakes] of answers) {
      await sql`
        insert into evidence_event (tenant_id, child_id, skill_code, rung_code, correct, misconception_codes, channel,
                                    observed_at, confirmed_by)
        values (${tenant}, ${kids[who]}, ${skill}, ${rung}, ${right}, ${mistakes}, 'item', now(), 'e2e')`;
    }
    await sql`select rebuild_child_skill_state(${kids[who]}::uuid)`;
  }
  // three read papers, once: Asha's with two answers waiting, Bina's with nothing waiting, Dev's signed off
  const ws = await sql<{ id: string; item_ids: string[]; title: string }[]>`
    -- a paper is named by its skill and level (goals/ux8b-papers-named.yaml)
    select id, item_ids, (select s.name || ' · ' || t.difficulty from skill s where s.code = t.skill_set_code) as title
    from sheet_template t
    where source = 'library' and retired_at is null and band = 'G2' and cardinality(item_ids) >= 3
    order by code limit 3`;
  const reads = {
    asha: [{ status: "correct", read: "1" }, { status: "needs_teacher", read: "7" }, { status: "needs_teacher", read: "8" }],
    bina: [{ status: "correct", read: "1" }, { status: "correct", read: "2" }],
    dev: [{ status: "correct", read: "1" }, { status: "correct", read: "2" }],
  } as const;
  for (const [i, who] of (["asha", "bina", "dev"] as const).entries()) {
    const name = who[0].toUpperCase() + who.slice(1);
    const [had] = await sql<{ id: string }[]>`select id from sheet_instance where qr_code = ${QR[who]}`;
    if (!had) {
      const read = await aReadPaper(sql, {
        qr: QR[who],
        child: kids[name],
        template: ws[i].id,
        items: ws[i].item_ids.slice(0, reads[who].length),
        reads: [...reads[who]],
      });
      if (who === "dev") await sql`select confirm_results(${kids.Dev}::uuid, 'e2e', ${read.capture}::uuid)`;
    }
    const [{ id }] = await sql<{ id: string }[]>`select id from sheet_instance where qr_code = ${QR[who]}`;
    sheet[who] = { id, title: ws[i].title };
  }
  // Dev's home assessment this week, approved by the educator
  await sql`delete from sheet_instance where child_id in ${sql(Object.values(kids))} and kind = 'focus' and week = to_date(${THIS}, 'IYYY-"W"IW')`;
  await sql`
    insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, week, kind, print_status, approved_by,
                                approved_at)
    values (${tenant}, ${QR.home}, ${ws[0].id}, ${kids.Dev}, to_date(${THIS}, 'IYYY-"W"IW'), 'focus', 'new', ${EDUCATOR.email}, now())
    on conflict (tenant_id, qr_code) do update set week = excluded.week`;
  await aPerson(sql, { ...EDUCATOR, password: PASSWORD });
});
test.afterAll(async () => {
  await sql`delete from sheet_instance where child_id in ${sql(Object.values(kids))} and kind = 'focus' and week = to_date(${THIS}, 'IYYY-"W"IW')`;
  await forgetPerson(sql, EDUCATOR.email);
  await sql.end();
});

async function asEducator(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("School email").fill(EDUCATOR.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/today$/);
  return page;
}

/** How many lines a cell's words take, as the browser lays them out. */
const lines = (cell: Locator) =>
  cell.evaluate((td) => {
    const r = document.createRange();
    r.selectNodeContents(td);
    return new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size;
  });
const names = (rows: Locator) => rows.evaluateAll((trs) => trs.map((t) => t.querySelectorAll("td")[1].textContent?.trim()));

test("Home assessments and Marking open on the educator's own class", async ({ browser }) => {
  const page = await asEducator(browser);
  await page.goto("/make");
  await expect(page).toHaveURL(`/make/${SECTION}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${SECTION} · home assessments`);
  // one class: nothing to go back to
  await expect(page.getByRole("link", { name: "← Every class" })).toHaveCount(0);
  // marking is the Assessments board now (page charter B6): every card on it is of their one class
  await page.goto("/children/assessments");
  // a card names its class on its one line under the title (Design PR 2)
  const lines = await page.locator("[data-kcard] .b-sub").allInnerTexts();
  expect(lines.length).toBeGreaterThan(0);
  for (const t of lines) expect(t).toContain(SECTION);
  await page.context().close();
});

test("each child waiting for a home assessment is one line with one next step, the why in two lines at most", async ({ browser }) => {
  const page = await asEducator(browser);
  // the educator's desktop (docs/ux-rules.md, "Desktop first")
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/make/${SECTION}`);
  const table = page.getByRole("table", { name: "Each child's home assessment" });
  await expect(table).toBeVisible();
  await expect(table.locator("thead th")).toHaveText(["Roll", "Child", "Works on", "Why", "Status", "Next step"]);
  // what needs the educator first: Chetan, with nothing to go on, then the two to approve, then the approved
  expect(await names(table.locator("tbody tr"))).toEqual(["Chetan", "Asha", "Bina", "Dev"]);
  const cells = (who: string) => table.locator("tbody tr").filter({ hasText: who }).locator("td");
  // what it works on opens the paper as it will print; the count every paper shares is not said on every line, and its
  // questions fold under it (goals/preview-before-print.yaml)
  await expect(cells("Asha").nth(2)).toContainText("2-digit − 2-digit");
  await expect(cells("Asha").nth(2).getByRole("link")).toHaveAttribute("href", new RegExp(`^/api/see/${kids.Asha}\\?week=`));
  await expect(cells("Asha").nth(2)).not.toContainText(/\d+ questions/);
  await expect(cells("Asha").nth(2).getByText("Its questions")).toBeVisible();
  // the why: the score, the rule and the mistake, never cut short, in two lines at most at a laptop's width
  await expect(cells("Asha").nth(3)).toContainText("the same mistake more than once: Subtracts the smaller digit");
  expect(await lines(cells("Asha").nth(3))).toBeLessThanOrEqual(2);
  // one next step a child: approve what is proposed, or choose one where the engine has nothing to go on
  await expect(cells("Asha").nth(5).getByRole("button")).toHaveText(["Approve"]);
  await expect(cells("Asha").nth(5).getByRole("link", { name: "or choose another" })).toHaveAttribute("href", `/make/custom?child=${kids.Asha}`);
  await expect(cells("Chetan").nth(2)).toHaveText("Not enough checked work yet");
  await expect(cells("Chetan").nth(5).getByRole("button")).toHaveCount(0);
  await expect(cells("Chetan").nth(5).getByRole("link")).toHaveText(["Choose one"]);
  await expect(cells("Chetan").nth(5).getByRole("link")).toHaveAttribute("href", `/make/custom?child=${kids.Chetan}`);
  // nothing runs past its panel's edge
  const over = await page.getByRole("main").getByRole("region").evaluateAll((els) =>
    els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.getAttribute("aria-label")),
  );
  expect(over).toEqual([]);
  await page.context().close();
});

test("the children already approved are rows of the table, after the ones waiting, each with who approved it", async ({ browser }) => {
  const page = await asEducator(browser);
  await page.goto(`/make/${SECTION}`);
  const table = page.getByRole("table", { name: "Each child's home assessment" });
  const dev = table.getByRole("row").filter({ hasText: "Dev" });
  await expect(dev.locator("[data-status=done]")).toContainText(`approved · by ${EDUCATOR.name}`);
  await expect(dev.getByRole("link", { name: QR.home })).toHaveAttribute("href", `/worksheets/${QR.home}`);
  await expect(table.getByRole("row").filter({ hasText: "Chetan" }).locator("[data-status=chooseOne]")).toBeVisible();
  // what waits is one tap to the first, the page's one main action; each child's is approved on the child's own row
  await expect(page.locator("[data-ux=action]").getByRole("link", { name: "Go to the first one waiting" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Approve all/ })).toHaveCount(0);
  await page.context().close();
});

// The Upload papers page's one sentence and its table of children are retired (page charter B6): each read paper is a card of the
// board, its chip saying what waits, and its panel's Check tab the next step, one press from the paper.
test("each read paper is a card with what waits on it, and its Check tab opens the paper that needs the next step", async ({ browser }) => {
  const page = await asEducator(browser);
  await page.goto("/children/assessments");
  const toJudge = page.locator('[data-lane="check"] li').filter({ hasText: "2 answers to judge" });
  await expect(toJudge).toHaveCount(1);
  await expect(toJudge.locator("[data-card-next]")).toHaveText("Check 2 answers");
  await toJudge.locator("[data-card-next]").click();
  const ashaAt = await screenOf(sheet.asha.id);
  const asha = page.locator("[data-block=DetailPanel] [data-check] [data-copy]").filter({ has: page.locator(`[data-check-paper][href="${ashaAt}"]`) });
  await expect(asha).toHaveCount(1);
  await expect(asha).toContainText("2 answers to judge");
  // every paper of the class, by the panel of the card it is on: Asha's answers to judge, Bina's to sign off (nothing waits), Dev's signed off
  await page.goto("/children/assessments");
  const groups = new Map<string, string>();
  for (const href of await page.locator("[data-kcard]").evaluateAll((as) => as.map((a) => a.getAttribute("href")!))) {
    await page.goto(href);
    for (const c of await page.locator("[data-block=DetailPanel] [data-copies] [data-copy]").all())
      groups.set((await c.locator("a").first().getAttribute("href")) ?? "", (await c.getAttribute("data-group")) ?? "");
  }
  expect(groups.get(ashaAt)).toBe("judge");
  expect(groups.get(await screenOf(sheet.bina.id))).toBe("signoff");
  expect(groups.get(await screenOf(sheet.dev.id))).toBe("results");
  await page.context().close();
});

test("the coordinator sees every class on one board, and one class when it is chosen", async ({ page }) => {
  await page.goto(`/children/assessments?class=${SECTION}`);
  await expect(page.locator("[data-active-filters]")).toContainText(`Class: ${SECTION}`);
  // the class is on a card's one line under its title (Design PR 2)
  for (const t of await page.locator("[data-kcard] .b-sub").allInnerTexts()) expect(t).toContain(SECTION);
  await page.goto("/children/assessments");
  await expect(page.locator("[data-filterbar] select[name=class]")).toHaveValue("");
});

