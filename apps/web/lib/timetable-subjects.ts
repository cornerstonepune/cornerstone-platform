import { sql } from "./db";
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// "This fortnight, lessons by subject" (docs/frontend/SPEC.md, Timetable): how many lessons of each subject a class has in a
// fortnight, set against the limits its rules give (timetable_rule, kind limit: fewest and most, per week or per fortnight).
// Nothing is decided here beyond the count: the limits are the school's rows, the words below only say them.

export type SubjectRow = { code: string; name: string; placed: number; rule: string; against: { state: "done" | "waiting" | "fixThis"; note: string } | null };

const ruleWords = (fewest: number | null, most: number | null, span: string): string =>
  fewest !== null && most !== null ? `${fewest} to ${most} a ${span}` : fewest !== null ? `at least ${fewest} a ${span}` : most !== null ? `at most ${most} a ${span}` : "no rule";

/** Each subject with a lesson in the fortnight or a limit on it, its count, its rule in words and how the count stands against it. */
export async function subjectsAgainstRule(klass: string, startsOn: string, endsOn: string): Promise<SubjectRow[]> {
  const [lessons, limits, names] = await Promise.all([
    sql<{ code: string; on_date: string }[]>`
      select s.subject_code as code, d.on_date::text as on_date from session s join school_day d on d.id = s.school_day_id
      where s.school_class_id = ${klass} and d.on_date between ${startsOn}::date and ${endsOn}::date and s.kind <> 'fixed' and s.subject_code is not null`,
    sql<{ code: string; span: string; fewest: number | null; most: number | null }[]>`
      select subject_code as code, span, fewest, most from timetable_rule
      where kind = 'limit' and school_class_id = ${klass} and subject_code is not null and valid_from <= ${endsOn}::date and (valid_to is null or valid_to >= ${startsOn}::date)`,
    sql<{ code: string; name: string }[]>`select code, coalesce(label, name) as name from subject`,
  ]);
  const name = new Map(names.map((n) => [n.code, n.name]));
  const secondWeek = addDays(startsOn, 7);
  const codes = [...new Set([...lessons.map((l) => l.code), ...limits.map((l) => l.code)])];
  return codes
    .map((code) => {
      const mine = lessons.filter((l) => l.code === code);
      const limit = limits.find((l) => l.code === code);
      let against: SubjectRow["against"] = null;
      if (limit) {
        const counts = limit.span === "week" ? [mine.filter((l) => l.on_date < secondWeek).length, mine.filter((l) => l.on_date >= secondWeek).length] : [mine.length];
        const short = Math.max(0, ...counts.map((c) => (limit.fewest !== null && c < limit.fewest ? limit.fewest - c : 0)));
        const over = Math.max(0, ...counts.map((c) => (limit.most !== null && c > limit.most ? c - limit.most : 0)));
        against = over ? { state: "fixThis", note: `${over} over` } : short ? { state: "waiting", note: `${short} short` } : { state: "done", note: "Within" };
      }
      return { code, name: name.get(code) ?? code, placed: mine.length, rule: limit ? ruleWords(limit.fewest, limit.most, limit.span) : "no rule", against };
    })
    .sort((a, b) => b.placed - a.placed || a.name.localeCompare(b.name));
}
