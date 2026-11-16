/**
 * CP-55 — A page reads the question bank once, never once per skill. Live, "This page could not load" (DatabaseSlow, 32
 * times in a week) came from the Skills, Curriculum, Question bank and class-maker pages: the list of skills counted the
 * bank's questions and worksheets inside its own query, once for each of the 155 skills, so the 137 MB question table was
 * read 155 times on every one of those pages — even on the pages that never show a count — and the live database took
 * 10 to 30 seconds to answer (its own log, 16 Nov 2026). The question bank's list did the same with the worksheets, once
 * per question shown.
 *
 * Asserted on the plan Postgres makes for each statement the pages' own data functions send: no scan of `item` or
 * `sheet_template` sits under a correlated subquery (a SubPlan, run once per outer row). A timing would pass on this
 * machine either way; the plan's shape is what made live slow.
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { aTaughtClass } from "./rows";

type Said = { query: string; params: unknown[] };
type PlanNode = { "Relation Name"?: string; "Parent Relationship"?: string; "Subplan Name"?: string; Plans?: PlanNode[] };

const BANK = new Set(["item", "sheet_template"]);
const said: Said[] = [];
// Every statement the app's own pool (`lib/db.ts`) sends is seen: postgres.js asks its settings for `debug` on each query,
// with the query's parameters. The pool is the one the process already has, whichever spec opened it first (the specs
// share one worker), so the hook is set on it rather than on a pool of this file's own.
type Hooked = { options: { debug?: unknown } };
const plans = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
test.beforeAll(async () => {
  const { rawSql } = await import("../lib/db");
  (rawSql as unknown as Hooked).options.debug = (_conn: number, query: string, params: unknown[]) => said.push({ query, params });
});
test.afterAll(async () => {
  const { rawSql } = await import("../lib/db");
  delete (rawSql as unknown as Hooked).options.debug;
  await plans.end();
});

/** The bank's tables a plan scans once per outer row: under a SubPlan that is not hashed (a hashed one runs once). */
function perRow(node: PlanNode, under = false): string[] {
  const here = under && node["Relation Name"] && BANK.has(node["Relation Name"]) ? [node["Relation Name"]] : [];
  return [
    ...here,
    ...(node.Plans ?? []).flatMap((p) =>
      perRow(p, under || (p["Parent Relationship"] === "SubPlan" && !p["Subplan Name"]?.startsWith("hashed"))),
    ),
  ];
}

function scans(node: PlanNode): string[] {
  return [...(node["Relation Name"] ? [node["Relation Name"]] : []), ...(node.Plans ?? []).flatMap(scans)];
}

/** Runs `work` and returns, for each statement it sent, the bank tables it reads and those it reads once per row. */
async function readsOf(work: () => Promise<unknown>): Promise<{ query: string; reads: string[]; perRow: string[] }[]> {
  said.length = 0;
  await work();
  const out = [];
  for (const s of said.splice(0)) {
    if (!/^\s*(select|with)\b/i.test(s.query)) continue;
    const [row] = await plans.unsafe(`explain (format json) ${s.query}`, s.params as never[]);
    const plan = (row["QUERY PLAN"] as { Plan: PlanNode }[])[0].Plan;
    out.push({ query: s.query.replace(/\s+/g, " ").slice(0, 120), reads: scans(plan).filter((t) => BANK.has(t)), perRow: perRow(plan) });
  }
  return out;
}

test("1. a list of skills reads neither the questions nor the worksheets", async () => {
  const { skillSets } = await import("../lib/queries");
  const statements = await readsOf(() => skillSets({ untaught: true }));
  expect(statements.length).toBeGreaterThan(0);
  expect(statements.flatMap((s) => s.reads)).toEqual([]);
});

test("2. the skills' counts read each bank table once, never once per skill, and match a count made by hand", async () => {
  const { countedSkillSets, skillSet } = await import("../lib/queries");
  let sets: Awaited<ReturnType<typeof countedSkillSets>> = [];
  const statements = await readsOf(async () => (sets = await countedSkillSets({ untaught: true })));
  expect(statements.flatMap((s) => s.perRow), JSON.stringify(statements)).toEqual([]);
  expect(statements.flatMap((s) => s.reads).sort()).toEqual(["item", "sheet_template"]);
  // the numbers are the bank's own, counted here without the function
  const [busiest] = await plans<{ code: string }[]>`
    select skill_set_code as code from item where status = 'active' and source = 'generated' and skill_set_code is not null
    group by 1 order by count(*) desc limit 1`;
  const byLevel = await plans<{ difficulty: string; n: number }[]>`
    select difficulty, count(*)::int as n from item
    where status = 'active' and source = 'generated' and skill_set_code = ${busiest.code} group by 1`;
  const sheets = await plans<{ difficulty: string; n: number }[]>`
    select difficulty, count(*)::int as n from sheet_template
    where source = 'library' and retired_at is null and skill_set_code = ${busiest.code} group by 1`;
  const counted = sets.find((s) => s.code === busiest.code)!;
  expect(counted.counts).toEqual(Object.fromEntries(byLevel.map((r) => [r.difficulty, r.n])));
  expect(counted.worksheets).toEqual(Object.fromEntries(sheets.map((r) => [r.difficulty, r.n])));
  // one skill is read as itself, with the same numbers, not found in the whole list
  const one = await readsOf(() => skillSet(busiest.code));
  expect(one.flatMap((s) => s.perRow)).toEqual([]);
  expect((await skillSet(busiest.code))?.counts).toEqual(counted.counts);
});

test("3. the curriculum's counts read the bank once, never once per skill", async () => {
  const { curriculumRows } = await import("../lib/queries-curriculum");
  const { EVERY_CLASS } = await import("../lib/scope");
  const statements = await readsOf(() => curriculumRows(EVERY_CLASS));
  expect(statements.flatMap((s) => s.perRow), JSON.stringify(statements)).toEqual([]);
});

test("4. the question bank's page reads the bank once per statement, never once per skill or per question", async () => {
  const { bankGrid, bankTotals, itemCount, items } = await import("../lib/queries-bank");
  await aTaughtClass(plans); // a fresh copy teaches nothing, and the bank shows only taught skills' questions
  let shown: { worksheets: string[] }[] = [];
  const statements = await readsOf(async () => {
    await Promise.all([bankGrid(), bankTotals(), itemCount({})]);
    shown = await items({}, 10, 0);
  });
  expect(statements.flatMap((s) => s.perRow), JSON.stringify(statements)).toEqual([]);
  expect(shown).toHaveLength(10);
  // a question's worksheets are still the ones that hold it
  const onOne = await items({}, 200, 0).then((r) => r.find((q) => q.worksheets.length));
  if (onOne) {
    const held = await plans<{ code: string }[]>`
      select code from sheet_template where source = 'library' and retired_at is null and ${(onOne as { id: string }).id} = any(item_ids) order by code`;
    expect(onOne.worksheets).toEqual(held.map((h) => h.code));
  }
});
