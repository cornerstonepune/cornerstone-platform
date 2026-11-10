import { sql, TENANT_SLUG } from "./db";
import { staffList } from "./queries";

// A coordinator changes a child's grade, or moves them to another class (goals/mov_move_a_child.yaml). The rule is the
// database's (`move_child`); this is what the child's page reads to offer it and to say what it did.

export type Place = { band: string; section: string; roll: string };

export type MoveRow = {
  id: string;
  day: string;
  moved_by: string;
  from_band: string;
  from_section: string;
  from_roll_no: string;
  to_band: string;
  to_section: string;
  to_roll_no: string;
  reason: string;
};

/** The history a child's page shows: the latest changes, and how many there are in all. */
export const HISTORY_SHOWN = 10;

export async function moveHistory(childId: string): Promise<{ rows: MoveRow[]; total: number }> {
  // each move is one row of the history log (`change_log`, CP-27 group 4), written by `move_child`; who made it is a
  // member of staff (their name, as the staff list says it) or, for a move no member of staff made, what it came from
  const [rows, people] = await Promise.all([
    sql<(Omit<MoveRow, "moved_by"> & { staff_id: string | null; origin: string | null; total: number })[]>`
    select id, to_char(at at time zone (select value #>> '{}' from config where key = 'school.time_zone'), 'YYYY-MM-DD') as day,
           staff_id::text as staff_id, origin,
           before ->> 'band' as from_band, before ->> 'section' as from_section, before ->> 'roll_no' as from_roll_no,
           after ->> 'band' as to_band, after ->> 'section' as to_section, after ->> 'roll_no' as to_roll_no,
           coalesce(reason, '') as reason, count(*) over ()::int as total
    from change_log where table_name = 'child' and op = 'move' and row_id = ${childId}
    order by at desc, id limit ${HISTORY_SHOWN}`,
    staffList(),
  ]);
  const name = new Map(people.map((p) => [p.id, p.name]));
  return {
    rows: rows.map(({ staff_id, origin, ...r }) => ({ ...r, moved_by: (staff_id && name.get(staff_id)) || origin || "" })),
    total: rows[0]?.total ?? 0,
  };
}

export type ClassChoice = { section: string; band: string | null; n: number };

/** The classes a child may be moved to: every class with a child in school, and the grade it works at. */
export async function classChoices(): Promise<ClassChoice[]> {
  return sql<ClassChoice[]>`
    select c.section, class_band(c.tenant_id, c.section) as band, count(*)::int as n
    from child_now c join tenant t on t.id = c.tenant_id and t.slug = ${TENANT_SLUG}
    where c.active group by c.tenant_id, c.section order by c.section`;
}

/** Whether another child already holds this roll number in this class (an inactive child's number is kept too). */
export async function rollIsTaken(section: string, roll: string, notChild: string): Promise<boolean> {
  const [row] = await sql<{ taken: boolean }[]>`
    select exists (select 1 from child_now c join tenant t on t.id = c.tenant_id and t.slug = ${TENANT_SLUG}
                   where c.section = ${section} and c.roll_no = ${roll} and c.id <> ${notChild}::uuid) as taken`;
  return row.taken;
}

/** A roll number as the database accepts one: letters, numbers and hyphens, up to 8. */
export const ROLL = /^[A-Za-z0-9-]{1,8}$/;

/** What the database said when it refused, in words. Nothing was changed. */
export function refusedWords(code: string, to: { section: string; roll: string }): string {
  const said: Record<string, string> = {
    roll_taken: `Roll ${to.roll} in ${to.section} is taken by another child.`,
    no_such_grade: "That is not a grade the school has.",
    no_such_class: "That is not a class with children in it.",
    bad_roll: "A roll number is letters or numbers, up to 8 of them.",
    nothing_changes: "That is where the child already is.",
    no_one: "Nobody is signed in to make the change.",
    no_such_child: "That child is not on the roll.",
    not_coordinator: "Only the coordinator changes a child's grade or class.",
  };
  return `${said[code] ?? "The change was not accepted."} Nothing was changed.`;
}

/** The sentence the coordinator confirms, said before anything is written. */
export function moveSentence(a: { name: string; from: Place; to: Place; gradeName: (code: string) => string }): string {
  const { name, from, to, gradeName } = a;
  const stays = "Their answers and results stay with them. Papers already printed stay as they are.";
  if (from.section === to.section && from.roll === to.roll)
    return `Change ${name}'s grade from ${gradeName(from.band)} to ${gradeName(to.band)}. They stay in ${to.section}, roll ${to.roll}. ${stays}`;
  const grade = from.band === to.band ? "" : ` Their grade changes from ${gradeName(from.band)} to ${gradeName(to.band)}.`;
  return `Move ${name} from ${from.section} roll ${from.roll} to ${to.section} roll ${to.roll}.${grade} ${stays}`;
}
