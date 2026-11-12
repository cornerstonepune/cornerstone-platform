import Link from "@/components/link";
import { Screen } from "@/components/app-frame";
import { TimetableRail } from "@/components/timetable-rail";
import { Cards } from "@/components/cards";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { KeyValue } from "@/components/key-value";
import { StatusChip } from "@/components/status-chip";
import { FortnightGrid } from "@/components/fortnight-grid";
import { ViewToggle } from "@/components/kanban-board";
import { NotYours } from "@/components/not-yours";
import { requireStaff } from "@/lib/auth";
import { dateWords } from "@/lib/week";
import { shortDate } from "@/lib/educator/clock";
import { draftGrid, draftReads, draftsOf, type Draft, type Unmet } from "@/lib/timetable-draft";
import { fortnightAfter, fortnightAt, fortnightNumber, fortnightsOfYear, isCoordinator } from "@/lib/timetable-ui";
import type { Column } from "@/lib/ux-rules";
import { schoolToday } from "@/lib/voice-page";
import "../timetable.css";

type Props = { searchParams: Promise<Record<string, string | undefined>> };
const HERE = "/timetable/draft";

// Draft from the rules (coordinator): one button makes a draft for every class from the period times, blocked days, fixed
// slots and limits; the rules it could not meet are listed in words. A draft is kept as a run; it never touches a live
// fortnight's sessions (that is Go live, and the engine has no route for it yet: docs/notes/UI-6.md).
const LAST: Column<Draft>[] = [
  { key: "class", label: "Class", value: (d) => d.label },
  { key: "placed", label: "Lessons placed", value: (d) => `${d.placed} of ${d.needed}`, num: true },
  { key: "outcome", label: "Outcome", value: (d) => d.outcome, status: true, cell: (d) => <StatusChip state={d.outcome === "placed" ? "done" : "waiting"} words={d.outcome === "placed" ? "All placed" : d.outcome === "unmeetable" ? "Rules not all met" : "None found in time"} compact round /> },
  { key: "when", label: "Made", value: (d) => dateWords(d.at.slice(0, 10)) },
];

export default async function DraftPage({ searchParams }: Props) {
  await requireStaff();
  if (!(await isCoordinator())) return <NotYours what="The draft from the rules" />;
  const q = await searchParams;
  const today = await schoolToday();
  const here = await fortnightAt(today);
  const upcoming = here && here.starts_on > today ? here : here ? await fortnightAfter(here) : null;
  const fn = (/^\d+$/.test(q.fn ?? "") ? await fortnightNumber(Number(q.fn)) : null) ?? upcoming;
  if (!fn) return <Screen stage="Draft from the rules" title="Draft from the rules" purpose="No teaching fortnight is set up ahead." next={{ href: "/timetable/rules", label: "Timetable rules" }} rail={<TimetableRail here="draft" coordinator />}><EmptyState next={{ href: "/timetable/rules", label: "Timetable rules" }}>No rules for this grade yet: add the period times first.</EmptyState></Screen>;
  const drafts = await draftsOf(fn.id);
  const on = drafts.find((d) => d.class_id === q.class) ?? drafts[0];
  const grid = on ? await draftGrid(on, fn, (day, p) => `${HERE}?fn=${fn.number}&class=${on.class_id}&cell=${day}~${p}`) : null;
  const [cellDay, cellPeriod] = (q.cell ?? "").split("~");
  const cellEntry = on?.entries.find((e) => e.date === cellDay && e.period_id === cellPeriod);
  const [{ year }] = await (await import("@/lib/db")).sql<{ year: string }[]>`select y.label as year from fortnight f join academic_year y on y.id = f.academic_year_id where f.id = ${fn.id}`;
  const [year_fns, reads] = await Promise.all([fortnightsOfYear(fn), on ? draftReads(on.class_id, on.grade, fn.id) : Promise.resolve([])]);
  const choices = year_fns.filter((y) => y.starts_on > today || y.id === fn.id);
  const columns: Column<Unmet>[] = [
    { key: "rule", label: "Rule", value: (r) => r.words, cell: (r) => (r.exists ? <Link href="/timetable/rules">{r.words}</Link> : r.words) },
    { key: "where", label: "Where", width: "9rem", value: (r) => (r.kind === "block" ? "A blocked day or period" : "A limit on a subject") },
    { key: "did", label: "What the draft did instead", width: "16rem", value: () => (on?.outcome === "not_found_in_time" ? `Placed ${on.placed} of ${on.needed} and left the rest empty.` : "No draft was kept for this class.") },
  ];
  return (
    <Screen
      stage={`Fortnight ${fn.number} · from the rules`}
      title="Draft from the rules"
      purpose="One command makes a draft from the period times, blocked days, fixed slots and limits. Rules it could not meet are listed in words."
      next={{ href: "/timetable/moves", label: "Moves by hand" }}
      rail={
        <div className="tt-rail">
          <TimetableRail here="draft" fn={fn.number} coordinator />
          {reads.length ? (
            <aside aria-label="What the draft reads" data-rail-part="reads" className="tt-rail-card">
              <h2 className="tt-rail-h">What the draft reads</h2>
              <KeyValue rows={reads} />
            </aside>
          ) : null}
        </div>
      }
    >
      {q.error ? <p role="alert" className="tt-error">{q.error}</p> : null}
      {q.done ? <p role="status" className="tt-note">The draft is made.</p> : null}
      <form action="/api/timetable/generate" method="post" className="tt-form" aria-label="Make a draft">
        <input type="hidden" name="year" value={year} />
        <input type="hidden" name="back" value={`${HERE}?fn=${fn.number}`} />
        <label>Which fortnight
          <select name="fortnight" defaultValue={String(fn.number)}>
            {choices.map((c) => <option key={c.id} value={c.number}>{c.number} · {dateWords(c.starts_on)} to {dateWords(c.ends_on)}{c.starts_on > today ? "" : " (running)"}</option>)}
          </select>
        </label>
        <button className="btn" data-ux="action">Make a draft</button>
      </form>
      {!on || !grid ? (
        <EmptyState>No draft made yet for fortnight {fn.number}. Press Make a draft.</EmptyState>
      ) : (
        <>
          <div className="mb-3">
            <ViewToggle current={on.class_id} views={drafts.map((d) => ({ key: d.class_id, label: d.label, icon: "class" as const, href: `${HERE}?fn=${fn.number}&class=${d.class_id}` }))} />
          </div>
          <p className="tt-note" data-draft-cells={grid.cells}>
            <StatusChip state={on.unmet.length ? "waiting" : "done"} words={on.unmet.length ? `Drafted with ${on.unmet.length} rule${on.unmet.length === 1 ? "" : "s"} not met` : "Drafted, every rule met"} round />{" "}{on.label}: {on.placed} of {on.needed} lessons placed ({on.outcome === "placed" ? "all placed" : on.outcome === "unmeetable" ? "the rules cannot all be met" : "no timetable found in time"}) · made {dateWords(on.at.slice(0, 10))}.</p>
          <FortnightGrid days={grid.labels} rows={grid.rows} />
          {cellEntry ? <p className="tt-note" data-draft-cell>{shortDate(cellEntry.date)}: {cellEntry.subject_code} (a draft: it opens read-only).</p> : null}
          {drafts.length > 1 ? <DataTable label="Last drafts by class" columns={LAST} rows={drafts} rowKey={(d) => d.class_id} limit={drafts.length} more={{ page: 1, href: () => "#" }} /> : null}
          {on.unmet.length ? <DataTable label="Rules not met" columns={columns} rows={on.unmet} rowKey={(r) => r.id} more={{ page: 1, href: (n: number) => `${HERE}?page=${n}` }} /> : <p className="tt-note">Every rule was met.</p>}
        </>
      )}
      <Cards cards={[{ kind: "period", title: "Next: hand moves", line: "Then Approve on the fortnight.", href: "/timetable/moves", link: "Moves by hand" }]} />
    </Screen>
  );
}
