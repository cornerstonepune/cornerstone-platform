import Link from "@/components/link";
import { Screen } from "@/components/app-frame";
import { DataTable } from "@/components/data-table";
import { DetailPanel, parseOpen, type Opened } from "@/components/detail-panel";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { ClassPick } from "@/components/educator/day-head";
import { BTN, FIELD, type DayLine } from "@/components/educator/materials-table";
import { ToConfirm } from "@/components/educator/to-confirm";
import type { Stat } from "@/components/stat-tile";
import { addLine } from "@/app/(app)/educator/materials/actions";
import { requireStaff } from "@/lib/auth";
import { catalogueOf, dayOrNull, materialsOf, openTo, schoolListOf, waitingNotes, weekOrNull, type Span } from "@/lib/educator/data";
import { isDay } from "@/lib/educator/period";
import type { SchoolList, WaitingNote } from "@/lib/educator/types";
import { E } from "@/lib/educator/words";
import type { Column } from "@/lib/ux-rules";
import { schoolToday } from "@/lib/voice-page";
import { notFound } from "next/navigation";
import { linePanel, qty } from "./line-panel";
import "../timetable.css";

// Materials (page charter C: a Workspace). On the left the class's lines built from the activities in the plan, grouped by the day each
// is needed; choosing a line opens it on the right (`?open=line:<id>`): how many (none is "to confirm", never guessed), the activity that
// needs it, and the changes she makes (set the quantity, remove the line). Adding from the catalogue sits under the list. The coordinator's
// school list is a tab, and the notes the system could not read a filter. With nothing chosen the right side counts the days shown.
const W = E.materials;
const SPANS: Span[] = ["day", "week", "fortnight"];
const HERE = "/timetable/materials";
// why there is no day to show: a holiday or a day with no class on record, said in words, never "not found" (issue #691)
const NO_DAY = "No class is on the timetable this day (a holiday, or a day off the school's calendar). The fortnight's materials are below.";
const NO_CLASS = "No class is on the timetable this day (a holiday, or a day off the school's calendar), so there is no class list to show. Open the timetable to choose a day.";

type Q = { class?: string; day?: string; span?: string; tab?: string; show?: string; page?: string; open?: string };

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

const tile = (n: number, one: string, many: string, tone?: Stat["tone"]): Stat => ({ id: many, n, line: n === 1 ? one : many, tone: n ? tone : undefined });

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<Q> }) {
  const me = await requireStaff();
  const q = await searchParams;
  if (q.day !== undefined && !isDay(q.day)) notFound();
  const coordinator = me.role === "coordinator";
  const school = q.tab === "school";
  const day = q.day ?? (await schoolToday());
  const span: Span = SPANS.includes(q.span as Span) ? (q.span as Span) : "fortnight";
  const { previewing } = await openTo(me); // not found only when her screens are closed to her
  // A door of the menu never leads to "not found" (issue #691): on a holiday the engine has no day, so the class comes from the week
  // around it, or from the address; with none known the page says why in words.
  const d = await dayOrNull(me, { class_id: q.class, day });
  const w = d ? null : await weekOrNull(me, { class_id: q.class, week_of: day });
  const classes = d?.classes ?? w?.classes ?? [];
  const classId: string | undefined = d?.class.id ?? w?.class.id ?? q.class;
  const why = d === null ? (classId ? NO_DAY : NO_CLASS) : null;
  // this address with some parameters changed (undefined removes one): the line's open and close links keep the filters
  const at = (extra: Partial<Q>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ class: classId, day, span, show: q.show, tab: q.tab, ...extra })) if (v) p.set(k, v);
    return `${HERE}?${p}`;
  };
  const tabs = coordinator ? (
    <nav aria-label="View" className="mb-[var(--space-3)] flex gap-[var(--space-2)]">
      {[
        ["", "My class"],
        ["school", W.schoolList],
      ].map(([t, label]) => (
        <Link key={t} href={at({ tab: t || undefined, show: undefined })} aria-current={(t === "school") === school ? "page" : undefined} className="chip">
          {label}
        </Link>
      ))}
    </nav>
  ) : null;

  let body;
  let stats: Stat[] = [];
  let open: Opened | null = null;
  let action;
  if (school) {
    // the school's list is the coordinator's: for anyone else the engine refuses and the page says whose it is
    const list = await schoolListOf(me, day.slice(0, 7) + "-01", new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0)).toISOString().slice(0, 10));
    const lines = list?.lines ?? [];
    stats = [tile(lines.length, "item on the school's list", "items on the school's list"), tile(lines.filter((l) => l.to_confirm).length, "to confirm", "to confirm", "wait"), tile(new Set(lines.flatMap((l) => l.from.map((c) => c.class))).size, "class", "classes")];
    body = !coordinator || list === null ? <EmptyState>{W.notCoordinator}</EmptyState> : lines.length === 0 ? <EmptyState>{W.schoolNone}</EmptyState> : <DataTable label={W.schoolTitle} columns={SCHOOL} rows={lines} rowKey={(l) => l.material_code} more={{ page: Number(q.page) || 1, href: (n: number) => `${HERE}?tab=school&day=${day}&page=${n}` }} />;
  } else if (q.show === "notes") {
    const notes = await waitingNotes(me);
    stats = [tile(notes?.length ?? 0, "note waiting", "notes waiting", "wait")];
    body = notes === null || notes.length === 0 ? <EmptyState>{W.reviewNone}</EmptyState> : <DataTable label={W.reviewTitle} columns={NOTES} rows={notes} rowKey={(n) => n.id} more={{ page: Number(q.page) || 1, href: (n: number) => at({ page: String(n) }) }} />;
  } else if (!classId) {
    body = <EmptyState next={{ href: "/timetable", label: "The timetable" }}>{why}</EmptyState>;
  } else {
    const [list, catalogue] = await Promise.all([materialsOf(me, classId, day, span), previewing ? Promise.resolve([]) : catalogueOf(me)]);
    const lines: DayLine[] = list?.groups.flatMap((g) => g.lines.map((l) => ({ ...l, day: g.label }))) ?? [];
    const unconfirmed = lines.filter((l) => l.quantity === null);
    stats = [tile(lines.length, "line", "lines"), tile(unconfirmed.length, "to confirm", "to confirm", "wait"), tile(list?.groups.length ?? 0, "day", "days")];
    const opened = parseOpen(q.open);
    const chosen = opened?.kind === "line" ? lines.find((l) => l.line_id === opened.id) : undefined;
    open = chosen ? linePanel(chosen, lines, { closeHref: at({ open: undefined, tab: undefined }), tab: q.tab, look: previewing }) : null;
    // the page's one main action: the first line still to confirm, opened on the right
    action = unconfirmed[0] && !previewing ? (
      <Link className="btn" href={at({ open: `line:${unconfirmed[0].line_id}` })} scroll={false} data-fill>
        Fill the quantities
      </Link>
    ) : undefined;
    const on = new Set(lines.map((l) => l.material_code));
    body =
      list === null ? (
        <EmptyState>{W.notHers}</EmptyState>
      ) : (
        <div className="grid gap-[var(--space-4)]" id="lines">
          {why ? <EmptyState>{why}</EmptyState> : null}
          {list.groups.length === 0 ? <EmptyState>{W.none}</EmptyState> : null}
          {list.groups.map((g) => (
            <section key={g.label} aria-label={g.label} data-day={g.label} className="grid gap-[var(--space-1)]">
              <h3 className="b-label b-muted">{g.label}</h3>
              <ul className="tt-list">
                {g.lines.map((l) => {
                  const selected = chosen?.line_id === l.line_id;
                  return (
                    <li key={l.line_id} data-line={l.line_id}>
                      <Link
                        href={at({ open: `line:${l.line_id}` })}
                        scroll={false}
                        data-open-key={`line:${l.line_id}`}
                        aria-expanded={selected}
                        aria-controls={selected ? "detail-panel" : undefined}
                        className={`grow inline-flex min-h-[var(--tap)] items-center font-medium text-[var(--ink)]${selected ? " b-selected" : ""}`}
                      >
                        {l.item}
                      </Link>
                      <span className="tabular-nums">{qty(l)}</span>
                      {l.quantity === null ? <ToConfirm /> : null}
                      {l.activity ? <span className="tt-note">{l.activity.name}</span> : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {previewing ? null : (
            <form action={addLine} className="flex flex-wrap items-center gap-[var(--space-2)]" data-add>
              <input type="hidden" name="list" value={list.list_id} />
              <input type="hidden" name="day" value={day} />
              <select name="code" aria-label={W.add} defaultValue="" className={FIELD}>
                <option value="">{W.add}</option>
                {catalogue
                  .filter((c) => !on.has(c.code))
                  .map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
              </select>
              <button type="submit" className={BTN}>
                {W.addButton}
              </button>
            </form>
          )}
        </div>
      );
  }
  return (
    <Screen
      stage={E.area}
      title="Materials, this fortnight"
      purpose="Built from the activities in the plan, day by day. Choose a line to see how many, which activity needs it, and to change it."
      action={action}
      next={{ href: `/timetable?view=day${classId ? `&class=${classId}` : ""}&day=${day}`, label: "The day" }}
      panel={
        <DetailPanel
          open={open}
          summary={{
            title: school ? W.schoolList : q.show === "notes" ? W.review : W.span[span],
            stats,
            // the notes are put on a list or set aside one by one, on their own page
            after: school ? null : q.show === "notes" ? (
              <Link href="/educator/materials/review" data-notes-review className="inline-flex min-h-[var(--tap)] items-center">
                {W.putOn}, or set aside
              </Link>
            ) : null,
          }}
        />
      }
    >
      {tabs}
      {school ? null : (
        <>
          {classId ? <ClassPick classes={classes} on={classId} href={(id) => at({ class: id, open: undefined })} /> : null}
          <FilterBar
            action={HERE}
            keep={{ class: classId, day }}
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
