import { Details } from "@/components/details";
import { sql } from "@/lib/db";
import { freePlaces, type Place } from "@/lib/delayed";
import { shortDate, mondayOf } from "@/lib/educator/clock";
import type { Fn } from "@/lib/timetable-ui";

export type Displaced = { id: string; day: string; label: string; what: string; note: string | null };

/** The class's planned lessons that sit on a holiday or an event day: they need a new slot (engine `/timetable/day/needs-slot`, the same rows). */
export async function displaced(classId: string): Promise<Displaced[]> {
  return sql<Displaced[]>`
    select s.id::text as id, d.on_date::text as day, p.label, coalesce(nullif(s.text, ''), s.subject_code, p.label) as what, d.note
    from session s join school_day d on d.id = s.school_day_id join period p on p.id = s.period_id
    where s.school_class_id = ${classId} and d.kind = 'holiday' and s.state = 'planned' and s.kind <> 'fixed'
    order by d.on_date, p.ord`;
}

const plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The planner of the Timetable page (CP-65): mark a day a holiday or an event day, see the lessons that then need a new slot, place each by
 *  hand (the engine checks the free place, fixed periods, materials and clashes: one refusal moves none) or let the solver make a draft. */
export async function PlanPanel(p: { classId: string; fn: Fn; year: string; today: string; coordinator: boolean; back: string; days: string[]; lost: Displaced[] }) {
  const weeks = [mondayOf(p.fn.starts_on), plus(mondayOf(p.fn.starts_on), 7), plus(mondayOf(p.fn.starts_on), 14)];
  const free: Place[] = p.lost.length ? (await Promise.all(weeks.map((w) => freePlaces(p.classId, w, p.today)))).flat().filter((x, i, all) => all.findIndex((y) => y.day === x.day && y.ord === x.ord) === i) : [];
  const back = <input type="hidden" name="back" value={p.back} />;
  return (
    <Details summary={`Plan${p.lost.length ? ` · ${p.lost.length} need a new slot` : ""}`} id="plan" open={p.lost.length > 0}>
      <div className="tt-plan" data-plan>
        {p.coordinator ? (
          <form method="post" action="/api/timetable/day" className="tt-plan-row" data-mark-day>
            {back}
            <input type="hidden" name="class" value={p.classId} />
            <label>Day<select name="date" required>{p.days.filter((d) => d >= p.today).map((d) => <option key={d} value={d}>{shortDate(d)}</option>)}</select></label>
            <label>Is<select name="kind"><option value="holiday">Holiday</option><option value="event">Event day</option><option value="teaching">Teaching day</option></select></label>
            <label>Name<input name="note" maxLength={60} placeholder="Name (optional)" /></label>
            <button className="btn">Mark</button>
          </form>
        ) : null}
        {p.lost.length ? (
          <form method="post" action="/api/timetable/delayed" className="tt-plan-slots" data-needs-slot>
            {back}
            <input type="hidden" name="class" value={p.classId} />
            <ul className="tt-plan-list">
              {p.lost.map((l, i) => (
                <li key={l.id} data-needs-slot-lesson={l.id}>
                  <input type="checkbox" name="lesson" value={l.id} defaultChecked aria-label={`Place ${l.what}`} />
                  <span className="grow"><strong>{l.what}</strong> · {shortDate(l.day)}{l.note ? ` · ${l.note.replace(/^Event: /, "")}` : ""}</span>
                  <select name={`to_${l.id}`} aria-label={`New slot for ${l.what}`} defaultValue={free[i] ? `${free[i].day}~${free[i].ord}` : ""}>
                    {free.map((f) => <option key={`${f.day}~${f.ord}`} value={`${f.day}~${f.ord}`}>{shortDate(f.day)} {f.starts_at}</option>)}
                  </select>
                </li>
              ))}
            </ul>
            <button className="btn" data-place>Place</button>
          </form>
        ) : (
          <p className="tt-note" data-needs-none>No lesson needs a new slot.</p>
        )}
        {p.coordinator && p.lost.length ? (
          <form method="post" action="/api/timetable/generate" className="tt-plan-solver" data-solver>
            {back}
            <input type="hidden" name="year" value={p.year} />
            <input type="hidden" name="fortnight" value={p.fn.number} />
            <button className="btn secondary">Let the solver place them</button>
          </form>
        ) : null}
      </div>
    </Details>
  );
}
