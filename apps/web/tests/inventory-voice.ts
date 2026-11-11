// What the voice screens (period, record, confirm, notes: UI-3a) need to show something in the inventory run, built from the test's own rows.
// Kept apart from inventory-fixtures.ts, which registers them; `aside` and the fixture class are handed in so the two files do not import each other.
import type { Sql } from "postgres";

type Aside = <T>(f: (sql: Sql) => Promise<T>) => Promise<T>;

/** A note of the inventory educator's waiting to be confirmed, by id; a note of theirs already confirmed; a lesson of today. Set by "voice-rest". */
export const VOICE = { note: "", done: "", lesson: "" };

/** The two voice switches on for the run, the inventory educator and the signed-in coordinator each holding the fixture class, and the rows the
 *  four screens show: a note waiting (Sr. Nos 3 above, 5 below), a note confirmed with its two observations, a fixed lesson of today. Put
 *  away by "voice-gone", which switches voice off again: no other test finds it on. */
export const voiceRest = (aside: Aside, SECTION: string, EDUCATOR: { email: string }) =>
  aside(async (sql) => {
    const [{ tenant, klass, campus }] = await sql<{ tenant: string; klass: string; campus: string }[]>`
      select tenant_id::text as tenant, id::text as klass, campus_id::text as campus from school_class where label = ${SECTION} order by created_at limit 1`;
    await sql`update config set value = 'true'::jsonb where key = 'voice.screens_enabled'`;
    await sql`delete from config where key = 'voice.recording_enabled'`;
    await sql`insert into config (tenant_id, key, value, description) values (${tenant}, 'voice.recording_enabled', 'true'::jsonb, 'u70 voice fixture')`;
    for (const email of [EDUCATOR.email, "e2e@cornerstone.test"]) {
      const [who] = await sql<{ staff: string }[]>`select staff_id::text as staff from pii.staff where email = ${email}`;
      if (!who) continue;
      await sql`insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)
        select ${tenant}, ${who.staff}, 'class_teacher', ${klass}, current_date - 1, 'u70 voice fixture'
        where not exists (select 1 from staff_role_grant where staff_id = ${who.staff} and school_class_id = ${klass})`;
    }
    const [{ staff }] = await sql<{ staff: string }[]>`select staff_id::text as staff from pii.staff where email = ${EDUCATOR.email}`;
    await sql`insert into activity (tenant_id, code, band, strand, name, sheet_no) values (${tenant}, 'ACT-U70-904', 'K2', 'Maths', 'Inventory sorting', '904') on conflict (tenant_id, code) do nothing`;
    const note = async (status: string, words: string) =>
      (await sql<{ id: string }[]>`
        insert into pii.educator_note (tenant_id, staff_id, class_id, audio_key, transcript, status)
        values (${tenant}, ${staff}, ${klass}, ${`voice/2026/${crypto.randomUUID()}.webm`}, ${words}, ${status}) returning id::text`)[0].id;
    VOICE.note = await note("drafted", "Activity 904, level 2. Above 3. Below 5.");
    VOICE.done = await note("confirmed", "Activity 904, level 2. Above 3.");
    const [child] = await sql<{ id: string }[]>`select id::text from child_now where class_id = ${klass} and roll_no = '3'`;
    await sql`insert into activity_observation (tenant_id, confirmation_id, note_id, activity_code, child_id, class_id, outcome, entry_mode, route, expected_level, reached_level, observed_at, observed_by, confirmed_by)
      values (${tenant}, gen_random_uuid(), ${VOICE.done}, 'ACT-U70-904', ${child.id}, ${klass}, 'above', 'individual', 'voice', 2, 3, now(), ${staff}, ${staff})`;
    const [{ day }] = await sql<{ day: string }[]>`
      insert into school_day (tenant_id, campus_id, on_date, kind) select ${tenant}, ${campus}, (now() at time zone (select value #>> '{}' from config where key = 'school.time_zone'))::date, 'teaching'
      on conflict (tenant_id, campus_id, on_date) do update set kind = 'teaching' returning id::text as day`;
    const [{ period }] = await sql<{ period: string }[]>`
      insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label, fixed) values (${tenant}, 'K2', 91, '03:11', '03:41', 'Inventory settling in', true)
      on conflict (tenant_id, grade_code, starts_at) do update set label = excluded.label returning id::text as period`;
    VOICE.lesson = (await sql<{ id: string }[]>`
      insert into session (tenant_id, school_class_id, school_day_id, period_id, kind, text) values (${tenant}, ${klass}, ${day}, ${period}, 'fixed', 'Settling in')
      on conflict (school_class_id, school_day_id, period_id) do update set text = excluded.text returning id::text`)[0].id;
  });
export const voiceGone = (aside: Aside) =>
  aside(async (sql) => {
    await sql`update config set value = 'false'::jsonb where key = 'voice.screens_enabled'`;
    await sql`delete from config where key = 'voice.recording_enabled'`;
  });

/** "Type the marks" made the empty note of the fixture class: a note with no recording, drafted, waiting. */
export const typedNoteWritten = (aside: Aside, SECTION: string) =>
  aside(async (sql) => {
    const rows = await sql`select 1 from pii.educator_note n join school_class c on c.id = n.class_id
      where c.label = ${SECTION} and n.audio_key is null and n.status = 'drafted' and n.created_at > now() - interval '5 minutes'`;
    return rows.length ? [] : ["no note without a recording was made for the class"];
  });
/** A correction is a new observation that replaces the first, with the reason; the first is as it was. */
export const markCorrected = (aside: Aside) =>
  aside(async (sql) => {
    const rows = await sql`select 1 from activity_observation s join activity_observation o on o.id = s.supersedes
      where o.note_id = ${VOICE.done}::uuid and s.reason = 'I misheard the number' and o.outcome = 'above'`;
    return rows.length ? [] : ["no observation replaces the first with the reason, or the first was changed"];
  });
