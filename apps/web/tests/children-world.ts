// The world the Children specs share (U72 and U76): two classes of the test's own (fake names only), an educator who teaches the first,
// observations on the first class's children and school days with a confirmed lesson on all but one. Rows are made once and a second run
// finds them; observations are append-only, so a child keeps what a run gave them.
import type { Browser, BrowserContext, Page } from "@playwright/test";
import postgres from "postgres";
import { FAKE_CHILDREN } from "./fake-names";
import { sessionFor } from "./inventory-fixtures";
import { aClass, aPerson, personAsStored } from "./rows";
import { voiceSwitch } from "./k2-rows";

export const A = "U72A";
export const B = "U72B";
export const EDUCATOR = { email: "u72-educator@cornerstone.test", name: "Asha Almond", role: "educator", classes: [A], subjects: ["NUM"] };
export const NAMES_A = FAKE_CHILDREN.slice(0, 12) as readonly string[];
export const NAMES_B = FAKE_CHILDREN.slice(12, 16) as readonly string[];
export type World = Awaited<ReturnType<typeof childrenWorld>>;

export async function childrenWorld(sql: postgres.Sql) {
  await voiceSwitch(sql, true); // the educator screens are on (the K2 switch); a test that turns them off turns them on again
  const [{ id: tenant }] = await sql<{ id: string }[]>`select id from tenant order by created_at limit 1`;
  const kids = { ...(await aClass(sql, A, "K2", [...NAMES_A])), ...(await aClass(sql, B, "K2", [...NAMES_B])) };
  const [{ id: classA }] = await sql<{ id: string }[]>`select id from school_class where label = ${A} order by created_at limit 1`;
  const [{ id: classB }] = await sql<{ id: string }[]>`select id from school_class where label = ${B} order by created_at limit 1`;
  if (!(await personAsStored(sql, EDUCATOR.email))) await aPerson(sql, EDUCATOR);
  const [{ id: staff }] = await sql<{ id: string }[]>`select staff_id::text as id from pii.staff where email = ${EDUCATOR.email}`;
  // she teaches the class: the engine counts a class's waiting notes only for someone who holds it as a teacher
  await sql`insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)
            select ${tenant}, ${staff}, 'class_teacher', ${classA}, current_date - 1, 'u72 test'
            where not exists (select 1 from staff_role_grant where staff_id = ${staff} and school_class_id = ${classA} and role_code = 'class_teacher')`;
  const skills = await sql<{ code: string; name: string }[]>`select code, name from registry_skill where tenant_id = ${tenant} order by code limit 2`;
  await sql`insert into activity (tenant_id, code, band, strand, name, sheet_no) values (${tenant}, 'ACT-U72-1', 'K2', 'Maths', 'Sorting by size', '') on conflict (tenant_id, code) do nothing`;
  for (const s of skills) await sql`insert into activity_skill (tenant_id, activity_code, skill_code) values (${tenant}, 'ACT-U72-1', ${s.code}) on conflict do nothing`;

  async function observe(roll: string, level: number | null, daysAgo: number, outcome = "as_expected", mode = "individual") {
    const child = kids[NAMES_A[Number(roll) - 1]];
    const at = new Date(Date.now() - daysAgo * 86_400_000);
    const [o] = await sql<{ id: string }[]>`
      insert into activity_observation (tenant_id, confirmation_id, activity_code, child_id, class_id, outcome, entry_mode, route, expected_level, reached_level, observed_at, observed_by, confirmed_by)
      values (${tenant}, gen_random_uuid(), 'ACT-U72-1', ${child}, ${classA}, ${outcome}, ${mode}, 'form', ${level ?? 2}, ${level}, ${at}, ${staff}, ${staff}) returning id`;
    if (outcome !== "absent" && (level !== null || mode !== "individual")) {
      const mark = level === 3 ? "yes" : level === 2 ? "sometimes" : "not_yet";
      for (const s of skills) {
        await sql`insert into evidence_event (tenant_id, child_id, skill_code, channel, observed_at, confirmed_by, kind, mark, seen_by, place, source, observation_id)
          values (${tenant}, ${child}, ${s.code}, 'educator', ${at}, ${staff}, 'observed', ${mark}, ${staff}, 'class', 'u72 test', ${o.id})`;
      }
    }
    await sql`select rebuild_child_observed_state(${child})`;
  }
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from activity_observation where class_id = ${classA}`;
  if (n === 0) {
    await observe("1", 3, 40);
    await observe("1", 3, 20);
    await observe("2", 2, 10);
    await observe("3", 1, 5);
    await observe("4", null, 5, "as_expected", "group_as_expected");
    await observe("5", null, 2, "absent");
  }
  // school days for the class's campus, and a confirmed lesson on all but one of them
  await sql`insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label) values (${tenant}, 'K2', 91, '23:10', '23:50', 'U72 period') on conflict do nothing`;
  const [{ campus, period }] = await sql<{ campus: string; period: string }[]>`
    select (select campus_id from school_class where id = ${classA}) as campus,
           (select id from period where grade_code = 'K2' and label = 'U72 period' limit 1) as period`;
  for (let d = 1; d <= 8; d++) {
    await sql`insert into school_day (tenant_id, campus_id, on_date, kind) select ${tenant}, ${campus}, current_date - ${d}::int, 'teaching'
              where not exists (select 1 from school_day where campus_id = ${campus} and on_date = current_date - ${d}::int)`;
    if (d === 3) continue;
    await sql`insert into session (tenant_id, school_class_id, school_day_id, period_id, state)
              select ${tenant}, ${classA}, id, ${period}, 'done' from school_day where campus_id = ${campus} and on_date = current_date - ${d}::int
              on conflict do nothing`;
  }
  return { tenant, kids, classA, classB, staff, skills, observe };
}

export async function asEducator(browser: Browser, width = 1440): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width, height: 900 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(EDUCATOR.email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context;
}
// the children's table; a child may also be named in the "Needing attention" card, so a name is looked for in the table
export const tableOf = (page: Page) => page.locator('table[aria-label^="Children"]');
export const rowsOf = (page: Page) => page.locator('table[aria-label^="Children"] tbody tr');
