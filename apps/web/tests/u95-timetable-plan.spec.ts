/**
 * U95 (CP-65 D) — the Timetable's planner: mark a day a holiday or an event day, and that day's lessons are listed as needing a new
 * slot; each is placed by hand into a free place (the engine's move checks run; a refusal moves none). The class is the spec's own
 * (section T95, grade G9, year 2086-87); its second week holds a Wednesday with a Maths and an English lesson, and a free place after it.
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { timetableSwitch } from "./educator-screens";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const GRADE = "G9";
let klass = "";
let thisMonday = "";
let today = "";
let wasTimetable = false;

const plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);


let number = 0;
let wed = "";
const plan = (page: Page) => page.locator("[data-plan]");

test.beforeAll(async () => {
  const [{ tenant, campus, on }] = await sql<{ tenant: string; campus: string; on: string }[]>`
    select t.id as tenant, (select id from campus where tenant_id = t.id limit 1) as campus, (now() at time zone 'Asia/Kolkata')::date::text as on
    from tenant t order by t.created_at limit 1`;
  today = on;
  const wd = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  thisMonday = plus(today, -wd);
  wed = plus(thisMonday, 9);
  const [{ id: year }] = await sql<{ id: string }[]>`
    insert into academic_year (tenant_id, label, starts_on, ends_on) values (${tenant}, '2086-87', '2026-01-01', '2087-03-31')
    on conflict (tenant_id, label) do update set label = excluded.label returning id`;
  klass = (await sql<{ id: string }[]>`
    insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section, label) values (${tenant}, ${campus}, ${year}, ${GRADE}, 'T95', 'T95')
    on conflict (tenant_id, campus_id, academic_year_id, grade_code, section) do update set section = excluded.section returning id`)[0].id;
  const period: Record<string, string> = {};
  for (const [name, starts, ord] of [["p1", "20:13", 9501], ["p2", "20:43", 9502], ["p3", "21:13", 9503]] as const) {
    const [p] = await sql<{ id: string }[]>`
      insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label, fixed) values (${tenant}, ${GRADE}, ${ord}, ${starts}::time, ${starts}::time + interval '25 minutes', ${`T95 ${name}`}, false)
      on conflict (tenant_id, grade_code, starts_at, valid_from) do update set ends_at = excluded.ends_at, label = excluded.label returning id`;
    period[name] = p.id;
  }
  number = Math.round(Date.parse(`${thisMonday}T00:00:00Z`) / 86_400_000) + 1;
  await sql`
    insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on) values (${tenant}, ${year}, ${number}, 'teaching', ${thisMonday}::date, ${plus(thisMonday, 13)}::date)
    on conflict (tenant_id, academic_year_id, starts_on) do update set kind = 'teaching' returning number`;
  [{ number }] = await sql<{ number: number }[]>`select number from fortnight where academic_year_id = ${year} and starts_on = ${thisMonday}::date`;
  await sql`delete from timetable_rule where school_class_id = ${klass} and kind = 'frame'`;
  await sql`delete from session where school_class_id = ${klass}`;
  for (const wk of ["A", "B"])
    for (let day = 1; day <= 5; day++)
      for (const [p, subject] of [["p1", "math"], ["p2", "english"]] as const)
        await sql`
          insert into timetable_rule (tenant_id, school_class_id, kind, period_id, week_code, weekday, cell, subject_code, text, valid_from)
          values (${tenant}, ${klass}, 'frame', ${period[p]}, ${wk}, ${day}, 'subject', ${subject}, ${`T95 ${subject}`}, '2026-01-01')`;
  for (let n = 0; n < 12; n++) {
    if (new Date(`${plus(thisMonday, n)}T00:00:00Z`).getUTCDay() % 6 === 0) continue;
    const [day] = await sql<{ id: string }[]>`
      insert into school_day (tenant_id, campus_id, on_date, kind) values (${tenant}, ${campus}, ${plus(thisMonday, n)}::date, 'teaching')
      on conflict (tenant_id, campus_id, on_date) do update set kind = 'teaching', note = null returning id`;
    for (const [p, subject] of [["p1", "math"], ["p2", "english"]] as const)
      await sql`
        insert into session (tenant_id, school_class_id, school_day_id, period_id, subject_code, kind, state, planned, text)
        values (${tenant}, ${klass}, ${day.id}, ${period[p]}, ${subject}, 'subject', 'planned', true, ${`T95 ${subject} ${n}`})`;
  }
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled'), false) as on`;
  wasTimetable = r.on;
});
test.afterAll(async () => {
  if (klass) await sql`delete from session where school_class_id = ${klass}`;
  await timetableSwitch(sql, wasTimetable);
  await sql.end();
});

test("marking a day an event day lists its lessons as needing a new slot, and placing them by hand clears the list", async ({ page }) => {
  await page.goto(`/timetable?class=${klass}&fn=${number}&view=fortnight`);
  await expect(plan(page)).toHaveCount(1);
  await expect(page.locator("[data-needs-none]")).toHaveCount(1);
  await page.locator("details#plan > summary").click();
  await page.locator("[data-mark-day] select[name=date]").selectOption(wed);
  await page.locator("[data-mark-day] select[name=kind]").selectOption("event");
  await page.locator("[data-mark-day] input[name=note]").fill("Sports day");
  await page.locator("[data-mark-day] button").click();
  await expect(page.locator("[data-needs-slot-lesson]")).toHaveCount(2);
  await expect(plan(page)).toContainText("Sports day");
  const [d] = await sql<{ kind: string; note: string }[]>`select kind, note from school_day where on_date = ${wed}::date and campus_id = (select campus_id from school_class where id = ${klass})`;
  expect([d.kind, d.note]).toEqual(["holiday", "Event: Sports day"]);
  await page.locator("[data-needs-slot] [data-place]").click();
  await expect(page.locator("[data-needs-none]")).toHaveCount(1);
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from session s join school_day d on d.id = s.school_day_id where s.school_class_id = ${klass} and d.on_date = ${wed}::date`;
  expect(n).toBe(0);
});

test("the solver action is offered while lessons need a slot, and a refused placing says why and moves none", async ({ page }) => {
  await page.goto(`/timetable?class=${klass}&fn=${number}&view=fortnight`);
  await page.locator("details#plan > summary").click();
  await page.locator("[data-mark-day] select[name=date]").selectOption(plus(thisMonday, 10));
  await page.locator("[data-mark-day] select[name=kind]").selectOption("holiday");
  await page.locator("[data-mark-day] button").click();
  await expect(page.locator("[data-solver] button")).toHaveText("Let the solver place them");
  const before = await sql`select id from session where school_class_id = ${klass} order by id`;
  await page.locator("[data-needs-slot] select").first().evaluate((s: HTMLSelectElement) => { s.innerHTML = ""; const o = document.createElement("option"); o.value = `${new Date().toISOString().slice(0, 10)}~1`; o.textContent = "taken"; s.appendChild(o); });
  await page.locator("[data-needs-slot] [data-place]").click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect((await sql`select id from session where school_class_id = ${klass} order by id`).length).toBe(before.length);
});
