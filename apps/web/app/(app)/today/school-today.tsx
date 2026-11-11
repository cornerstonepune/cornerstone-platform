import Link from "@/components/link";
import { Cards } from "@/components/cards";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { HeatGrid } from "@/components/heat-grid";
import { Rail, Screen } from "@/components/app-frame";
import { AttentionStrip, type Attention } from "@/components/attention-strip";
import type { Session } from "@/lib/auth";
import { schoolToday } from "@/lib/school-clock";
import { StatusChip } from "@/components/status-chip";
import { dayWords, many } from "@/lib/today";
import { DOORS, open, type Door } from "@/lib/today-doors";
import { classIds, nextWeekEvents, schoolCounts, schoolNotes } from "@/lib/today-data";
import { heat, readiness, tiles as counts, waiting, type School, type Wait } from "@/lib/today-school";
import type { Column } from "@/lib/ux-rules";

// Today, the school's (docs/frontend/SPEC.md, Today, the school): what waits on the coordinator, each row with its own button, then last
// week's grid and the week ahead. The counts are CP-28's /k2/today-school; until the engine serves it, the notes left unconfirmed
// (/k2/coordinator) are all that is read and the other rows do not appear. Whole counts only: no person and no class is ranked.
const DOOR: Record<Wait["key"], () => Door> = { clash: DOORS.moves, draft: DOORS.draft, late: DOORS.notes, undone: DOORS.staff, materials: DOORS.materials };

const COLUMNS: Column<Wait>[] = [
  { key: "state", label: "Priority", status: true, width: "9rem", value: (r) => r.state, cell: (r) => <StatusChip state={r.state} round /> },
  { key: "what", label: "What", value: (r) => r.what },
  { key: "many", label: "How many", width: "9rem", value: (r) => r.many },
  { key: "go", label: "", width: "12rem", value: (r) => r.key, cell: (r) => { const to = open(DOOR[r.key]()); return to ? <Link href={to} className="btn secondary whitespace-nowrap" data-row={r.key}>{r.go}</Link> : null; } },
];

export async function SchoolToday({ me }: { me: Session }) {
  const [today, full] = await Promise.all([schoolToday(), schoolCounts(me)]);
  const notes = full ? null : await schoolNotes(me);
  const s: School | null = full;
  const left = notes ? notes.rows.filter((r) => r.state === "left_unconfirmed").length : 0;
  const rows: Wait[] = s ? waiting(s) : left ? [{ key: "late", go: "Open the notes", state: "late", what: "Notes left unconfirmed", n: left, many: many(left, "note") }] : [];
  const t = s ? counts(s) : null;
  const strip: Attention[] = t
    ? [
        { state: "doNow", n: t.doNow, sentence: "Clashes not accepted and notes left unconfirmed", href: t.doNow ? open(s!.clashes ? DOORS.moves() : DOORS.notes()) : null },
        { state: "doSoon", n: t.soon, sentence: "Drafts to approve and materials lines with no quantity", href: t.soon ? open(s!.drafts.count ? DOORS.fortnight(s!.drafts.rows[0].fortnight) : DOORS.materials()) : null },
        { state: "done", n: t.done, sentence: `Lessons done of ${t.planned} planned last week`, href: open(DOORS.staff()) },
      ]
    : [{ state: "doNow", n: left, sentence: "Notes left unconfirmed across the classes", href: left ? open(DOORS.notes()) : null }];
  const base = open(DOORS.timetable());
  const ids = s ? await classIds() : {};
  const happening = s ? await nextWeekEvents(s.next_week.from) : [];
  // a cell opens that class's day on the timetable, where the timetable screen is the one that answers (not the old week page)
  const grid = s ? heat(s.last_week.cells, (c) => (base?.startsWith("/timetable") && ids[`${c.grade}|${c.section ?? ""}`] ? `${base}?${new URLSearchParams({ class: ids[`${c.grade}|${c.section ?? ""}`], view: "day", day: c.day })}` : null)) : null;
  const cards = s
    ? [
        { kind: "period" as const, title: "Next week", body: happening.length ? (
          <ul className="grid gap-1">
            {happening.map((h) => <li key={h.day + h.what}><b>{dayWords(h.day)}</b> · {h.what}</li>)}
          </ul>
        ) : <span className="b-muted">No holiday, changed timing or new fortnight next week.</span> },
        ...(s.next_week.new_activities.length
          ? [{ kind: "activity" as const, title: "New activities next week", body: (
              <ul className="grid gap-1">
                {s.next_week.new_activities.slice(0, 6).map((a) => {
                  const to = open(DOORS.activity(a.code));
                  return <li key={a.code}>{to ? <Link href={to}>{a.name}</Link> : a.name} <span className="b-muted">· {a.classes.join(", ")}</span></li>;
                })}
              </ul>
            ) }]
          : []),
        { kind: "skill" as const, title: "Does the system have what it needs", body: (
          <ul className="grid gap-1">
            {readiness(s.ready).map((r) => <li key={r.label}><b className="tabular-nums">{r.have}</b> of <span className="tabular-nums">{r.of}</span> {r.label}</li>)}
          </ul>
        ) },
      ]
    : [];
  const edges = [
    { screen: "fortnight", params: { n: String(s?.drafts.rows[0]?.fortnight ?? 0) }, label: "Fortnight", icon: "fortnight" as const },
    { screen: "staff", label: "Staff and classes", icon: "class" as const, fallback: "/setup/staff" },
    { screen: "timetable", label: "Timetable", icon: "week" as const, fallback: "/timetable" },
  ].filter((e) => e.screen !== "fortnight" || s?.drafts.rows[0]);
  return (
    <Screen stage={`${dayWords(today)} · every class`} title="Today, the school" purpose="What waits on you, each with its own button. Then the week ahead." action={<p className="font-medium">{rows.length ? `${rows.length === 1 ? "One kind of work waits" : `${rows.length} kinds of work wait`} on you.` : "Nothing waits on you."}</p>} next={{ href: open(DOORS.timetable()) ?? "/timetable", label: "Timetable" }} rail={<div className="[&_[data-rail]_ul]:gap-2"><Rail edges={edges} /></div>}>
      <AttentionStrip tiles={strip} />
      <div className="my-4">
        {rows.length ? <DataTable label="What waits on you" columns={COLUMNS} rows={rows} rowKey={(r) => r.key} more={{ page: 1, href: () => "/today" }} /> : <EmptyState>Nothing waits on you.</EmptyState>}
      </div>
      {grid ? (
        <section className="my-4" aria-label="Last week">
          <h2 className="mb-2 text-[length:var(--text-title-small)] font-semibold">Last week</h2>
          <div className="overflow-x-auto"><HeatGrid days={grid.days} rows={grid.rows} empty="No lessons were planned last week." /></div>
        </section>
      ) : null}
      {cards.length ? <Cards cards={cards} /> : null}
    </Screen>
  );
}
