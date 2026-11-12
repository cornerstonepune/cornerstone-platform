import Link from "@/components/link";
import { Screen } from "@/components/app-frame";
import { TimetableRail } from "@/components/timetable-rail";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { ClassPick } from "@/components/educator/day-head";
import { Summary } from "@/components/educator/summary";
import { ToConfirm } from "@/components/educator/to-confirm";
import { requireStaff } from "@/lib/auth";
import { dayOf, materialsOf, openTo, schoolListOf, waitingNotes, type Span } from "@/lib/educator/data";
import { isDay } from "@/lib/educator/period";
import type { MaterialLine, SchoolList, WaitingNote } from "@/lib/educator/types";
import { E } from "@/lib/educator/words";
import { screenHref } from "@/lib/built";
import type { Column } from "@/lib/ux-rules";
import { schoolToday } from "@/lib/voice-page";
import { notFound } from "next/navigation";

// Materials, this fortnight (UI-9, first increment: read only). The class's lines built from the activities in the plan, a
// line with no quantity marked "to confirm", each line tied to its activity; the coordinator's school list as a tab; the notes
// the system could not read as a filter. Quantity, Remove, Add and the photo stay on the old page (/educator/materials) until
// UI-9b: this page changes nothing and sends nothing.
const W = E.materials;
const SPANS: Span[] = ["day", "week", "fortnight"];
const SOURCE = { school: "The school's plan", educator: "Added by the educator" } as const;

type Q = { class?: string; day?: string; span?: string; tab?: string; show?: string; page?: string };
type Row = MaterialLine & { day: string };

const activityHref = (code: string) => screenHref("activity", { code }) ?? `/setup/activities/${encodeURIComponent(code)}?back=/timetable/materials`;
const qty = (l: { quantity: number | null; unit: string }) => (l.quantity === null ? W.noQty : `${l.quantity} ${l.unit}`);

const LINES: Column<Row>[] = [
  { key: "item", label: W.cols.item, value: (l) => l.item },
  {
    key: "quantity",
    label: W.cols.quantity,
    value: (l) => qty(l),
    keep: true,
    cell: (l) => (
      <span className="inline-flex flex-wrap items-center gap-[var(--space-2)] tabular-nums">
        {qty(l)}
        {l.quantity === null ? <ToConfirm /> : null}
      </span>
    ),
  },
  {
    key: "activity",
    label: W.cols.activity,
    value: (l) => l.activity?.name,
    cell: (l) =>
      l.activity ? (
        <Link href={activityHref(l.activity.code)} className="inline-flex min-h-[var(--tap)] items-center text-[var(--ink)] underline underline-offset-4">
          {l.activity.name}
        </Link>
      ) : null,
  },
  { key: "source", label: "Source", value: (l) => SOURCE[l.source] },
];

const SCHOOL: Column<SchoolList["lines"][number]>[] = [
  { key: "item", label: W.cols.item, value: (l) => l.item },
  {
    key: "quantity",
    label: W.cols.quantity,
    value: (l) => qty(l),
    cell: (l) => (
      <span className="inline-flex flex-wrap items-center gap-[var(--space-2)] tabular-nums">
        {qty(l)}
        {l.to_confirm ? <ToConfirm /> : null}
      </span>
    ),
  },
  { key: "from", label: W.fromClasses, value: (l) => l.from.map((c) => `${c.class}${c.quantity !== null ? ` (${c.quantity})` : ""}`).join(", ") },
];

const NOTES: Column<WaitingNote>[] = [
  { key: "note", label: W.reviewTitle, value: (n) => n.text, cell: (n) => <span className="whitespace-pre-line">{n.text}</span> },
  { key: "why", label: W.why, value: (n) => n.reason },
];

export default async function MaterialsFortnight({ searchParams }: { searchParams: Promise<Q> }) {
  const me = await requireStaff();
  const q = await searchParams;
  if (q.day !== undefined && !isDay(q.day)) notFound();
  const coordinator = me.role === "coordinator";
  const school = q.tab === "school";
  const day = q.day ?? (await schoolToday());
  const span: Span = SPANS.includes(q.span as Span) ? (q.span as Span) : "fortnight";
  const d = await dayOf(me, { class_id: q.class, day }); // not found when her screens are closed to her
  await openTo(me);
  const here = `/timetable/materials`;
  const tabs = coordinator ? (
    <nav aria-label="View" className="mb-[var(--space-3)] flex gap-[var(--space-2)]">
      {[
        ["", "My class"],
        ["school", W.schoolList],
      ].map(([t, label]) => (
        <Link key={t} href={`${here}?class=${d.class.id}&day=${day}&span=${span}${t ? `&tab=${t}` : ""}`} aria-current={(t === "school") === school ? "page" : undefined} className="chip">
          {label}
        </Link>
      ))}
    </nav>
  ) : null;

  let body;
  if (school) {
    // the school's list is the coordinator's: for anyone else the engine refuses and the page says whose it is
    const list = await schoolListOf(me, day.slice(0, 7) + "-01", new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0)).toISOString().slice(0, 10));
    body = !coordinator || list === null ? <EmptyState>{W.notCoordinator}</EmptyState> : list.lines.length === 0 ? <EmptyState>{W.schoolNone}</EmptyState> : <DataTable label={W.schoolTitle} columns={SCHOOL} rows={list.lines} rowKey={(l) => l.material_code} more={{ page: Number(q.page) || 1, href: (n: number) => `${here}?tab=school&day=${day}&page=${n}` }} />;
  } else {
    const list = await materialsOf(me, d.class.id, day, span);
    const lines: Row[] = list?.groups.flatMap((g) => g.lines.map((l) => ({ ...l, day: g.label }))) ?? [];
    const notes = q.show === "notes" ? await waitingNotes(me) : null;
    body =
      list === null ? (
        <EmptyState>{W.notHers}</EmptyState>
      ) : q.show === "notes" ? (
        notes === null || notes.length === 0 ? <EmptyState>{W.reviewNone}</EmptyState> : <DataTable label={W.reviewTitle} columns={NOTES} rows={notes} rowKey={(n) => n.id} more={{ page: Number(q.page) || 1, href: (n: number) => `${here}?show=notes&page=${n}` }} />
      ) : (
        <>
          <Summary items={[{ label: W.counts.lines, n: lines.length }, { label: W.counts.noQty, n: lines.filter((l) => l.quantity === null).length }]} />
          {lines.length === 0 ? <EmptyState>{W.none}</EmptyState> : <DataTable label={W.title} columns={LINES} rows={lines} rowKey={(l) => l.line_id} more={{ by: (l) => l.day }} extras={{ attrs: (l) => ({ "data-line": l.line_id }) }} />}
        </>
      );
  }
  return (
    <Screen
      stage={E.area}
      title="Materials, this fortnight"
      purpose="Built from the activities in the plan. Each line knows which activity needs it."
      next={{ href: `/educator/materials?class=${d.class.id}&day=${day}&span=${span}`, label: "Change quantities on the class list" }}
      rail={<TimetableRail here="materials" coordinator={coordinator} />}
    >
      {tabs}
      {school ? null : (
        <>
          <ClassPick classes={d.classes} on={d.class.id} href={(id) => `${here}?class=${id}&day=${day}&span=${span}`} />
          <FilterBar
            action={here}
            keep={{ class: d.class.id, day }}
            filters={[
              { name: "span", label: "Show", value: span, all: "", required: true, options: SPANS.map((s) => [s, W.span[s]] as const) },
              { name: "show", label: "Lines", value: q.show, all: "All lines", options: [["notes", W.review]] },
            ]}
          />
        </>
      )}
      {body}
    </Screen>
  );
}
