import { FortnightGrid, type FCell, type FRow } from "@/components/fortnight-grid";
import { Details } from "@/components/details";
import Link from "@/components/link";
import { subjectLook, type Looks } from "@/lib/subject-looks";
import { dayWords, type Pattern, type PatternCell } from "@/lib/timetable-build";

// The class's pattern as the week grid reads it: periods down, Monday to Friday across, one week at a time (A or B). Fixed rows are the
// full-width bands. Read-only here; painting is the next step of the page.
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export function PatternRead({ pattern, week, looks, labels, base }: { pattern: Pattern; week: "A" | "B"; looks: Looks; labels: Map<string, string>; base: string }) {
  const at = new Map<string, PatternCell>(pattern.cells.filter((c) => c.week === week).map((c) => [`${c.period_id}:${c.weekday}`, c]));
  const rows: FRow[] = pattern.periods.map((p): FRow => {
    const first = at.get(`${p.id}:1`);
    if (p.fixed) return { band: first?.text || p.label, at: p.starts_at };
    return {
      time: `${p.starts_at}–${p.ends_at ?? ""} ${p.label}`,
      cells: [1, 2, 3, 4, 5].map((d): FCell | null => {
        const c = at.get(`${p.id}:${d}`);
        if (!c || c.cell === "empty") return null;
        const word = c.subject_code ? (labels.get(c.subject_code) ?? c.subject_code) : c.text;
        return { subject: subjectLook(looks, c.subject_code) as FCell["subject"], activity: word, machine: c.source === "machine" };
      }),
    };
  });
  return (
    <section className="bd-pattern" aria-label={`${pattern.class.grade} ${pattern.class.section}, week ${week}`} data-pattern-class={pattern.class.id} data-version={pattern.version}>
      <nav className="bd-week" aria-label="Week">
        {(["A", "B"] as const).map((w) => (
          <Link key={w} href={`${base}&week=${w}`} className={w === week ? "chip on" : "chip"} aria-current={w === week ? "true" : undefined}>
            Week {w}
          </Link>
        ))}
      </nav>
      <FortnightGrid days={DAYS} rows={rows} />
      <Details summary={`The day: ${pattern.periods.length} periods, ${dayWords(pattern.periods)}`}>
        <ul className="bd-day">
          {pattern.periods.map((p) => (
            <li key={p.id}>
              <span className="num">{p.starts_at}</span>
              <span>{p.label}</span>
            </li>
          ))}
        </ul>
      </Details>
    </section>
  );
}
