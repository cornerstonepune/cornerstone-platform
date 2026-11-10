import { sql, TENANT_SLUG } from "./db";
import { enginePost } from "./engine";
import { staffList } from "./queries";

// What the coordinator's pages read (UI-5: Staff and classes, Classes and children). Names are read here and only here, and
// only for a viewer in the 'everything' group (`namesMayShow`): the staff list's names are `pii.staff`, a child's are
// `pii.child`, read through the accessor that logs who asked (rule 6). Nothing here writes; the writes are `actions.ts` beside
// each page, and every one of them is a function of the database or an insert of a new row, never a delete.

const school = () => sql`(select id from tenant where slug = ${TENANT_SLUG})`;
// the school's day today, in the school's own zone (the same line `lib/move-child.ts` uses), never the server's
const today = () => sql`(now() at time zone (select value #>> '{}' from config where key = 'school.time_zone'))::date`;

/** Whether the signed-in person is in the group that reads every staff row (the database's own rule, `public.my_reach`). */
export async function namesMayShow(): Promise<boolean> {
  const [r] = await sql<{ all: boolean }[]>`select public.my_reach('staff') = 'all' as all`;
  return Boolean(r?.all);
}

export type Grant = {
  id: string;
  roleLabel: string;
  className: string | null;
  subject: string | null;
  from: string;
  to: string | null;
  by: string;
  /** Held today: it started and has not ended. */
  open: boolean;
};

export type StaffLine = {
  id: string;
  name: string;
  email: string;
  roleLabel: string;
  roleOrd: number;
  /** The classes they hold today, or null for a role held for the whole campus. */
  classes: string[] | null;
  done: number;
  planned: number;
  /** Whole counts the engine gives for the person's notes (`POST /reports/counts`); null when it gave none (the person has no note, or the
   *  engine did not answer), so the table hides a column nobody has a value in. Never a percentage, a score or a rank. */
  notesConfirmed: number | null;
  notesLate: number | null;
  lines: { accepted: number; changed: number; removed: number } | null;
};

type EducatorCounts = { staff: string; notes_confirmed: number; notes_late: number; lines_accepted: number; lines_changed: number; lines_removed: number };

/** What the engine counts per educator, by staff id: whole numbers, never a score or a rank (CP-19). Empty when the engine does not answer:
 *  the counts are extra to the page, so a page without them is still the page. */
export async function educatorCounts(actor: string): Promise<{ counts: Map<string, EducatorCounts>; answered: boolean }> {
  try {
    const got = (await enginePost("/reports/counts", { actor })) as { educators?: EducatorCounts[] };
    return { counts: new Map((got.educators ?? []).map((e) => [e.staff, e])), answered: true };
  } catch {
    return { counts: new Map(), answered: false };
  }
}

/** Every member of staff with their role, the classes they hold today and the count of this fortnight's lessons they hold
 *  (`done` of `planned`): the lessons of a class they hold a grant for, in the grant's subject when it names one. Ordered by
 *  the role's own order then name, never by a number. */
export async function staffLines(actor: string): Promise<{ lines: StaffLine[]; answered: boolean }> {
  const [people, held, counts, notes] = await Promise.all([
    staffList(),
    sql<{ staff_id: string; role_label: string; role_ord: number; scope: string; class: string | null; subject: string | null }[]>`
      select g.staff_id::text, r.label as role_label, r.ord as role_ord, r.scope, sc.label as class, coalesce(sj.label, sj.name) as subject
      from staff_role_grant g
      join role r on r.tenant_id = g.tenant_id and r.code = g.role_code
      left join school_class sc on sc.id = g.school_class_id
      left join subject sj on sj.tenant_id = g.tenant_id and sj.code = g.subject_code
      where g.tenant_id = ${school()} and g.valid_from <= ${today()} and (g.valid_to is null or g.valid_to > ${today()})`,
    sql<{ staff_id: string; done: number; planned: number }[]>`
      with f as (select starts_on, ends_on from fortnight where tenant_id = ${school()} and ${today()} between starts_on and ends_on limit 1),
      mine as (
        select distinct g.staff_id, s.id as session_id, s.state
        from staff_role_grant g
        join session s on s.school_class_id = g.school_class_id and (g.subject_code is null or s.subject_code = g.subject_code)
        join school_day d on d.id = s.school_day_id
        join f on d.on_date between f.starts_on and f.ends_on
        where g.tenant_id = ${school()} and g.valid_from <= ${today()} and (g.valid_to is null or g.valid_to > ${today()})
          and s.state <> 'moved')
      select staff_id::text, count(*) filter (where state = 'done')::int as done, count(*)::int as planned from mine group by staff_id`,
    educatorCounts(actor),
  ]);
  const by = new Map<string, { staff_id: string; role_label: string; role_ord: number; scope: string; class: string | null; subject: string | null }[]>();
  for (const h of held) by.set(h.staff_id, [...(by.get(h.staff_id) ?? []), h]);
  const n = new Map(counts.map((c) => [c.staff_id, c]));
  const lines = people
    .map((p) => {
      const mine = by.get(p.id ?? "") ?? [];
      const first = mine.slice().sort((a, b) => a.role_ord - b.role_ord)[0];
      const subjects = [...new Set(mine.map((m) => m.subject).filter((x): x is string => Boolean(x)))];
      const campus = mine.some((m) => m.scope === "campus");
      return {
        id: p.id ?? p.email,
        name: p.name,
        email: p.email,
        roleLabel: first ? `${first.role_label}${subjects.length ? ` (${subjects.join(", ")})` : ""}` : p.role,
        roleOrd: first?.role_ord ?? 999,
        classes: campus || !mine.length ? null : [...new Set(mine.map((m) => m.class).filter((x): x is string => Boolean(x)))].sort(),
        done: n.get(p.id ?? "")?.done ?? 0,
        planned: n.get(p.id ?? "")?.planned ?? 0,
        notesConfirmed: notes.counts.get(p.id ?? "")?.notes_confirmed ?? null,
        notesLate: notes.counts.get(p.id ?? "")?.notes_late ?? null,
        lines: notes.counts.has(p.id ?? "")
          ? { accepted: notes.counts.get(p.id ?? "")!.lines_accepted, changed: notes.counts.get(p.id ?? "")!.lines_changed, removed: notes.counts.get(p.id ?? "")!.lines_removed }
          : null,
      };
    })
    .sort((a, b) => a.roleOrd - b.roleOrd || a.name.localeCompare(b.name));
  return { lines, answered: notes.answered };
}

/** One person's grants, the newest first: what they hold, from when to when, and who gave it. A grant is read, never edited. */
export async function grantsOf(staffId: string): Promise<Grant[]> {
  const rows = await sql<{ id: string; role_label: string; class: string | null; subject: string | null; from: string; to: string | null; by: string; open: boolean }[]>`
    select g.id::text, r.label as role_label, sc.label as class, coalesce(sj.label, sj.name) as subject,
           to_char(g.valid_from, 'YYYY-MM-DD') as "from", to_char(g.valid_to, 'YYYY-MM-DD') as "to", g.granted_by as by,
           (g.valid_from <= ${today()} and (g.valid_to is null or g.valid_to > ${today()})) as open
    from staff_role_grant g
    join role r on r.tenant_id = g.tenant_id and r.code = g.role_code
    left join school_class sc on sc.id = g.school_class_id
    left join subject sj on sj.tenant_id = g.tenant_id and sj.code = g.subject_code
    where g.tenant_id = ${school()} and g.staff_id = ${staffId}::uuid
    order by g.valid_from desc, g.created_at desc`;
  return rows.map((r) => ({ id: r.id, roleLabel: r.role_label, className: r.class, subject: r.subject, from: r.from, to: r.to, by: r.by, open: r.open }));
}

export type ClassLine = { id: string; label: string; grade: string; gradeCode: string; children: number; educators: string[] };

/** The classes of this academic year with their grade, how many children are in each now and who holds them today. */
export async function classLines(): Promise<ClassLine[]> {
  const [rows, held, people] = await Promise.all([
    sql<{ id: string; label: string; grade_code: string; grade: string; children: number }[]>`
      select sc.id::text, sc.label, sc.grade_code, coalesce(gr.name, sc.grade_code) as grade,
             (select count(*)::int from enrolment e join child c on c.id = e.child_id where e.class_id = sc.id and e.to_date is null and c.active) as children
      from school_class sc
      join academic_year y on y.id = sc.academic_year_id and ${today()} between y.starts_on and y.ends_on
      join grade gr on gr.tenant_id = sc.tenant_id and gr.code = sc.grade_code
      where sc.tenant_id = ${school()}
      order by gr.ord, sc.label`,
    sql<{ class_id: string; staff_id: string }[]>`
      select distinct g.school_class_id::text as class_id, g.staff_id::text from staff_role_grant g
      where g.tenant_id = ${school()} and g.school_class_id is not null and g.valid_from <= ${today()} and (g.valid_to is null or g.valid_to > ${today()})`,
    staffList(),
  ]);
  // names come from the staff list (`public.staff_list`), the one function the website may read them through
  const name = new Map(people.map((p) => [p.id, p.name]));
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    grade: r.grade,
    gradeCode: r.grade_code,
    children: r.children,
    educators: held.filter((h) => h.class_id === r.id).map((h) => name.get(h.staff_id) ?? "").filter(Boolean).sort(),
  }));
}

export type ChildLine = { id: string; roll: string; name: string; since: string; movedFrom: string | null };

/** The children now in one class by Sr. No., each with the name read from `pii` by child_id (logged), when they came and, if
 *  they came from another class this year, which one. Only called for a viewer who may see names. */
export async function classChildren(classId: string, actor: string): Promise<ChildLine[]> {
  const rows = await sql<{ id: string; roll_no: string; first_name: string; last_name: string; since: string; from_class: string | null }[]>`
    select c.id::text, e.roll_no, p.first_name, p.last_name, to_char(e.from_date, 'YYYY-MM-DD') as since,
           (select pc.label from enrolment pe join school_class pc on pc.id = pe.class_id
             where pe.child_id = c.id and pe.to_date is not null and pe.class_id <> e.class_id
             order by pe.to_date desc, pe.created_at desc limit 1) as from_class
    from enrolment e
    join child c on c.id = e.child_id and c.active
    cross join lateral pii.read_child(c.id, ${actor}) p
    where e.class_id = ${classId}::uuid and e.to_date is null
    order by roll_order(e.roll_no), e.roll_no`;
  return rows.map((r) => ({
    id: r.id,
    roll: r.roll_no,
    name: `${r.first_name}${r.last_name ? ` ${r.last_name}` : ""}`,
    since: r.since,
    movedFrom: r.from_class,
  }));
}

export type LogLine = { id: string; roll: string; from: string; to: string; by: string; at: string; since: string };

/** The latest moves of children in or out of this class, newest first: Sr. No., from and to, who made it and when. The log
 *  holds the class and roll as text and no name (the log's `before`/`after` are band, section and roll only). */
export async function moveLog(classLabel: string, limit = 10): Promise<LogLine[]> {
  const rows = await sql<{ id: string; roll: string | null; from: string | null; to: string | null; staff_id: string | null; origin: string | null; at: string; since: string }[]>`
    select l.id::text, coalesce(l.after ->> 'roll_no', l.before ->> 'roll_no') as roll, l.before ->> 'section' as "from", l.after ->> 'section' as "to",
           l.staff_id::text, l.origin,
           to_char(l.at at time zone (select value #>> '{}' from config where key = 'school.time_zone'), 'YYYY-MM-DD') as at,
           to_char(l.at at time zone (select value #>> '{}' from config where key = 'school.time_zone'), 'YYYY-MM-DD') as since
    from change_log l
    where l.tenant_id = ${school()} and l.table_name = 'child' and l.op = 'move'
      and (l.before ->> 'section' = ${classLabel} or l.after ->> 'section' = ${classLabel})
    order by l.at desc, l.id limit ${limit}`;
  const names = new Map((await staffList()).map((p) => [p.id, p.name]));
  return rows.map((r) => ({ id: r.id, roll: r.roll ?? "", from: r.from ?? "", to: r.to ?? "", by: (r.staff_id && names.get(r.staff_id)) || r.origin || "", at: r.at, since: r.since }));
}

/** The classes a child can move to, this year's, with the label people use. */
export async function moveTargets(): Promise<{ label: string; grade: string; gradeCode: string }[]> {
  const rows = await sql<{ label: string; grade: string; grade_code: string }[]>`
    select sc.label, coalesce(gr.name, sc.grade_code) as grade, sc.grade_code
    from school_class sc
    join academic_year y on y.id = sc.academic_year_id and ${today()} between y.starts_on and y.ends_on
    join grade gr on gr.tenant_id = sc.tenant_id and gr.code = sc.grade_code
    where sc.tenant_id = ${school()} order by gr.ord, sc.label`;
  return rows.map((r) => ({ label: r.label, grade: r.grade, gradeCode: r.grade_code }));
}

export type SetupCounts = { staff: number; grantsOpen: number; classes: number; children: number };

/** The numbers on the Setup cards: counts, computed once here. */
export async function setupCounts(): Promise<SetupCounts> {
  const [r] = await sql<SetupCounts[]>`
    select (select count(*)::int from staff where tenant_id = ${school()} and active) as staff,
           (select count(*)::int from staff_role_grant where tenant_id = ${school()} and valid_from <= ${today()} and (valid_to is null or valid_to > ${today()})) as "grantsOpen",
           (select count(*)::int from school_class sc join academic_year y on y.id = sc.academic_year_id and ${today()} between y.starts_on and y.ends_on where sc.tenant_id = ${school()}) as classes,
           (select count(*)::int from child where tenant_id = ${school()} and active) as children`;
  return r;
}
