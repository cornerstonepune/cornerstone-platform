/**
 * U77 (UI-4b, PR 3) — the old Marking page's tools for one answer, on the paper screen, with the same assertions (old spec: s26-right-answer):
 * every answer shows the right answer as the engine stores it, and an educator changes it for every child while code refuses one the sum contradicts.
 * The paper is entered by the engine as a real paper is; one child's copy is read: 4a "48 + 35 =" left blank, 4b the number line's first box read 78
 * against a key typed 80 in the file.
 */
import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { openAnswer, openPaper } from "./paper-screen";
import { aChildIn } from "./rows";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
// Each run gets its own paper and class: a changed right answer is a row nobody deletes (append-only).
const CODE = `U77-${Date.now().toString(36).toUpperCase()}`;

test.beforeAll(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "u77-"));
  const file = path.join(dir, `${CODE}.json`);
  writeFileSync(
    file,
    JSON.stringify({
      code: CODE, title: "U77 paper", band: "G4", week: CODE, date: "2026-09-03", pages: [{ n: 1, mask: 0 }],
      items: [
        { n: 4, part: "a", page: 1, expr: "48 + 35", question: "48 + 35 =" },
        { n: 4, part: "b", page: 1, kind: "missing", rung: "R7", answer: 80, question: "the number line, first box" },
        { n: 5, page: 1, expr: "52 - 17", question: "52 - 17 =" },
      ],
    }),
  );
  execFileSync(path.resolve(__dirname, "../../../bin/engine"), ["legacy", "paper", file], { env: { ...process.env } });
  rmSync(dir, { recursive: true });
  const [{ tenant_id }] = await sql<{ tenant_id: string }[]>`select id as tenant_id from tenant limit 1`;
  const child = await aChildIn(sql, CODE, "G4", "1");
  await sql`insert into pii.child (tenant_id, child_id, first_name) values (${tenant_id}, ${child}, 'Rudra')`;
  const [t] = await sql<{ id: string; item_ids: string[] }[]>`select id, item_ids from sheet_template where source = 'legacy' and batch_id = ${CODE}`;
  const [{ id: sheet }] = await sql<{ id: string }[]>`
    insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, print_status)
    values (${tenant_id}, ${CODE}, ${t.id}, ${child}, 'returned') returning id`;
  const [{ id: cap }] = await sql<{ id: string }[]>`
    insert into capture (tenant_id, path, pages, status, sheet_instance_id) values (${tenant_id}, ${CODE + ".pdf"}, 1, 'processed', ${sheet}) returning id`;
  // 4a: blank, waiting for a person. 4b: 78, as a person typed it, wrong against the file's 80.
  for (const a of [{ i: 0, status: "needs_teacher", read: "", typed: false }, { i: 1, status: "wrong", read: "78", typed: true }, { i: 2, status: "wrong", read: "12", typed: true }]) {
    const raw = JSON.stringify({ child_answer: a.read, answer_state: a.read ? "written" : "blank", why: a.read ? "" : "no number" });
    const [{ id }] = await sql<{ id: string }[]>`
      insert into item_result (tenant_id, capture_id, item_id, rid, raw_read, status) values (${tenant_id}, ${cap}, ${t.item_ids[a.i]}, 'a', ${raw}, ${a.status}) returning id`;
    if (a.typed)
      await sql`insert into read_correction (tenant_id, child_id, capture_id, item_result_id, model_read, human_read, by) values (${tenant_id}, ${child}, ${cap}, ${id}, ${a.read}, ${a.read}, 'e2e')`;
  }
});
test.afterAll(async () => sql.end());

test("every answer shows its right answer as the engine stores it", async ({ page }) => {
  await openPaper(page, CODE, "1");
  await expect(await openAnswer(page, /48 \+ 35/)).toContainText("Right answer 83");
  await expect(await openAnswer(page, /number line/)).toContainText("Right answer 80");
});

test("an educator changes a right answer for every child, and code refuses one the sum contradicts", async ({ page }) => {
  await openPaper(page, CODE, "1");
  const a = await openAnswer(page, /48 \+ 35/);
  await a.getByLabel("The right answer is").fill("78");
  await a.getByRole("button", { name: "Change it for every child" }).click();
  await expect(page.getByText("Nothing was changed: 48 + 35 is 83, so 78 cannot be its right answer")).toBeVisible();

  const b = await openAnswer(page, /number line/);
  await b.getByLabel("The right answer is").fill("78");
  await b.getByRole("button", { name: "Change it for every child" }).click();
  await expect(page.getByText(/The right answer to question 4b is now 78, for every child\. 1 answer was marked again/)).toBeVisible();
  await expect(await openAnswer(page, /number line/)).toContainText("Right answer 78 · changed from 80 by e2e@cornerstone.test");
  const [{ status }] = await sql<{ status: string }[]>`select r.status from item_result r join item i on i.id = r.item_id where i.item_key = ${`legacy/${CODE}/4b`}`;
  expect(status).toBe("correct");
});

test("a wrong answer no named mistake explains is named by a person: one press, and the engine keeps it", async ({ page }) => {
  await openPaper(page, CODE, "1");
  const b = await openAnswer(page, /52 - 17/);
  const naming = b.getByLabel("Name the mistake for question 5");
  await expect(naming).toContainText("No named mistake makes");
  await naming.getByRole("button", { name: "None of these" }).first().click();
  await expect(page.getByRole("status")).toHaveCount(0); // a refusal would say why, in the engine's words
  // kept on the answer against the reading it was named on (12), and the change a row of the one history log
  const kept = () => sql<{ code: string | null; logged: number }[]>`
    select r.named_mistakes -> '12' ->> 'code' as code,
           (select count(*)::int from change_log where table_name = 'item_result' and op = 'name_mistake' and row_id = r.id::text) as logged
    from item_result r join item i on i.id = r.item_id where i.item_key = ${`legacy/${CODE}/5`}`;
  await expect.poll(async () => (await kept())[0]?.code).toBe("NONE");
  expect((await kept())[0].logged).toBe(1);
});
