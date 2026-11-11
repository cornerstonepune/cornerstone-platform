/**
 * U9 — Papers (goals/u9-papers.yaml).
 *
 * Nimish, 2026-09-30: "I really don't think marking and marking papers as two different types are essential. We can
 * merge them into one" and "one list of papers with the right filtration and all, and a good view". One menu item,
 * every paper a copy under its assessment, week by week (goals/ux5-papers-grouped.yaml): what it is, whose, where it
 * stands, what waits for a person, filtered by class, child, kind, week and stage; a copy opens the paper where its work
 * is. It is Assessments (/children/assessments): on an assessment, a copy with answers waiting opens its paper screen to
 * check them.
 *
 * The class is the test's own, two Grade 2 children, with four papers made once and kept:
 * - a class practice proposed and not yet approved (made);
 * - a home assessment approved for print (printed);
 * - an earlier paper read, one answer still waiting for a person (scanned);
 * - a class assessment read and signed off, one of two right (signed off).
 */
import { aChildIn } from "./rows";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { paperScreenOf } from "../lib/queries-assessment-extras";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "U9-TEST";
const WEEK = "2091-W30"; // a week of its own; a week is a date since CP-27

type Paper = { id: string; qr: string };
const papers: Record<"made" | "printed" | "scanned" | "signed", Paper> = {} as never;
let kids: Record<string, string> = {};

async function child(tenant: string, roll: string, name: string) {
  const [had] = await sql<{ id: string }[]>`select id from child_now where section = ${SECTION} and roll_no = ${roll}`;
  if (had) return had.id;
  const [{ id }] = [{ id: await aChildIn(sql, SECTION, "G2", roll) }];
  await sql`insert into pii.child (tenant_id, child_id, first_name) values (${tenant}, ${id}, ${name})`;
  return id;
}

async function paper(
  tenant: string,
  qr: string,
  kid: string,
  t: { source: string; set?: string; level?: string; key?: object; drawn?: string[] },
  i: { kind: string | null; status: string; approved?: boolean },
): Promise<Paper> {
  const [had] = await sql<Paper[]>`select id, qr_code as qr from sheet_instance where qr_code = ${qr}`;
  if (had) return had;
  const [{ id: tpl }] = await sql<{ id: string }[]>`
    insert into sheet_template (tenant_id, band, week, source, skill_set_code, difficulty, child_id, key, item_ids)
    values (${tenant}, 'G2', to_date(${WEEK}, 'IYYY-"W"IW'), ${t.source}, ${t.set ?? null}, ${t.level ?? null}, ${kid}, ${sql.json((t.key ?? {}) as never)},
            ${t.drawn ?? []}::uuid[])
    returning id`;
  const [p] = await sql<Paper[]>`
    insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, print_status, kind, week, section,
                                approved_by, approved_at)
    values (${tenant}, ${qr}, ${tpl}, ${kid}, ${i.status}, ${i.kind}, to_date(${WEEK}, 'IYYY-"W"IW'), ${SECTION},
            ${i.approved ? "e2e" : null}, ${i.approved ? sql`now()` : null})
    returning id, qr_code as qr`;
  return p;
}

async function read(tenant: string, p: Paper, answers: [status: string, state: string][]) {
  const [had] = await sql`select 1 from capture where sheet_instance_id = ${p.id}`;
  if (had) return;
  const [{ id: cap }] = await sql<{ id: string }[]>`
    insert into capture (tenant_id, path, pages, sheet_instance_id, status) values (${tenant}, 'u9', 1, ${p.id}, 'processed')
    returning id`;
  for (const [n, [status, state]] of answers.entries()) {
    // a test's own question, entered as an earlier paper's (`legacy`): the bank's checks are for the questions it
    // generates, and four tests' "generated" rows broke `engine audit` on the copy (2026-10-01)
    const [{ id: item }] = await sql<{ id: string }[]>`
      insert into item (tenant_id, item_key, template, rung_code, skill_codes, signal, fmt, spec, responses, source)
      values (${tenant}, ${`u9/${p.qr}/${n}`}, 'u9', 'R24', '{NUM.OPS.02}', 'Procedural', 'column',
              ${sql.json({ op: "-", a: 62, b: 27 })}, ${sql.json([{ rid: "a", answer: 35 }])}, 'legacy')
      returning id`;
    await sql`insert into item_result (tenant_id, capture_id, item_id, rid, raw_read, status, state)
              values (${tenant}, ${cap}, ${item}, 'a', '{"child_answer": "35"}', ${status}, ${state})`;
  }
}

test.beforeAll(async () => {
  const [{ id: tenant }] = await sql<{ id: string }[]>`select id from tenant limit 1`;
  kids = { Asha: await child(tenant, "1", "Asha"), Bina: await child(tenant, "2", "Bina") };
  papers.made = await paper(tenant, "U9-MADE", kids.Bina, { source: "generated", set: "ADD.2D2D", level: "Easy" }, { kind: "practice", status: "new" });
  // a home paper as the engine makes it (focus_paper.make): its questions, and no skill set of its own
  const drawn = await sql<{ id: string }[]>`
    select id from item where status = 'active' and skill_set_code = 'SUB.2D2D' and difficulty = 'Medium' order by item_key limit 3`;
  papers.printed = await paper(tenant, "CSE9A001", kids.Asha, { source: "focus", drawn: drawn.map((d) => d.id) }, { kind: "focus", status: "printed", approved: true });
  papers.scanned = await paper(tenant, "U9-OLD-A", kids.Asha, { source: "legacy", key: { title: "U9 September paper", date: "2026-09-21" } }, { kind: null, status: "returned" });
  papers.signed = await paper(tenant, "U9-ASSESS", kids.Bina, { source: "generated", set: "SUB.2D2D", level: "Hard" }, { kind: "assessment", status: "returned" });
  await read(tenant, papers.scanned, [["needs_teacher", "candidate"], ["correct", "candidate"]]);
  await read(tenant, papers.signed, [["correct", "confirmed"], ["wrong", "confirmed"]]);
});
test.afterAll(async () => sql.end());

test("one Assessments in the menu for marking and making, and a row opens the paper where its work is", async ({ page }) => {
  await page.goto("/children/assessments");
  // Assessments is one page of the Children door: the door is lit, the page is marked in its row, and there is no Marking or Make papers
  const menu = page.locator("[data-bar]").first().getByRole("navigation", { name: "Sections" });
  const pagesRow = page.getByRole("navigation", { name: "Pages in this section" });
  await expect(menu.getByRole("link", { name: "Children" })).toHaveAttribute("aria-current", "page");
  await expect(pagesRow.getByRole("link", { name: "Assessments", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(pagesRow.getByRole("link", { name: "Marking" })).toHaveCount(0);
  await expect(pagesRow.getByRole("link", { name: "Make papers" })).toHaveCount(0);
  // making, reading a scan and the queue of answers to check are all here
  await expect(page.getByRole("region", { name: "Read an assessment" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Rail" }).getByRole("link", { name: "Answers to check" })).toHaveAttribute("href", /^\/children\/assessments\/[^/?]+\/[^/?]+$/);
  await page.getByRole("region", { name: "Make an assessment" }).getByRole("button", { name: /For a class/ }).click();
  await expect(page).toHaveURL(/\/children\/assessments\?make=class$/);
  // the pages it merged are still Assessments
  for (const path of ["/make"]) {
    await page.goto(path);
    await expect(menu.getByRole("link", { name: "Children" })).toHaveAttribute("aria-current", "page");
    await expect(pagesRow.getByRole("link", { name: "Assessments", exact: true })).toHaveAttribute("aria-current", "page");
  }

  // a scanned paper, an answer waiting: on its assessment, the copy opens to check its answers
  const { href: screen } = (await paperScreenOf({ sheet: papers.scanned.id }, { role: "coordinator", classes: [], subjects: [], id: undefined }))!;
  await page.goto(screen.replace(/\/[^/]+$/, ""));
  await page.locator("[data-check-paper]").first().click();
  await expect(page).toHaveURL(screen);
  await expect(page.getByRole("heading", { name: "Check the answers" })).toBeVisible();
});
