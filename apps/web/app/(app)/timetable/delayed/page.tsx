import { Screen } from "@/components/app-frame";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import Link from "@/components/link";
import { NotYours } from "@/components/not-yours";
import { requireStaff } from "@/lib/auth";
import { weekOrNull } from "@/lib/educator/data";
import { freePlaces, ledger, notTaught, weekPlaced, type Late, type Place } from "@/lib/delayed";
import { mondayOf, shortDate } from "@/lib/educator/clock";
import { classesOf, fortnightAt, isCoordinator } from "@/lib/timetable-ui";
import type { Column } from "@/lib/ux-rules";
import { schoolToday } from "@/lib/voice-page";
import { dateWords } from "@/lib/week";
import "../timetable.css";

type Props = { searchParams: Promise<Record<string, string | undefined>> };
const HERE = "/timetable/delayed";
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const week = (d: string | undefined, fallback: string) => mondayOf(d && ISO.test(d) ? d : fallback);
const plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const placeWords = (p: Place) => `${shortDate(p.day)} · ${p.starts_at} ${p.label}`;

// Delayed lessons (CP-59; Nimish, 16 Nov 2026): the lessons of a class and week that went by without being taught, each with a tick box;
// a coming week to put them in, each ticked lesson given a free place there (the first free places, in order, until she changes one);
// one Move for all that are ticked. What moved, what changed and what was not taught are the week's ledger beneath. The engine decides
// every move and says why when it refuses (`/timetable/delayed`): a place taken, a lesson taught, a holiday; one refusal moves none.
export default async function DelayedPage({ searchParams }: Props) {
  const me = await requireStaff();
  const q = await searchParams;
  const today = await schoolToday();
  // a coordinator reaches any class; an educator her own (the classes the engine gives her week), and never another's (Nimish, 16 Nov 2026)
  const coordinator = await isCoordinator();
  const mine = coordinator ? null : await weekOrNull(me, { week_of: today });
  if (!coordinator && !mine) return <NotYours what="Moving delayed lessons" />;
  const here = coordinator ? await fortnightAt(today, q.class) : null;
  const all = coordinator ? (here ? await classesOf(here) : []) : mine!.classes.map((c) => ({ id: c.id, grade: c.grade, section: c.section, lessons: 1 }));
  const classId = all.find((c) => c.id === q.class)?.id ?? (all.find((c) => c.lessons > 0) ?? all[0])?.id;
  const from = week(q.week, plus(mondayOf(today), -7)); // opens on last week: the lessons just gone by
  const to = week(q.to, plus(mondayOf(today), 7));
  const klass = all.find((c) => c.id === classId);
  const keep = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ class: classId, week: from, to, ...extra })) if (v) p.set(k, v);
    return `${HERE}?${p}`;
  };
  if (!classId || !klass) {
    return (
      <Screen stage="Timetable" title="Delayed lessons" purpose="Lessons not taught, moved to a coming week." next={{ href: "/timetable", label: "Timetable" }}>
        <EmptyState>No class has lessons in this fortnight.</EmptyState>
      </Screen>
    );
  }
  const [late, placed, free, book] = await Promise.all([notTaught(classId, from, today), weekPlaced(classId, to), freePlaces(classId, to, today), ledger(classId, from)]);
  const proposed = new Map(late.map((l, i) => [l.id, free[i]]));
  const lateColumns: Column<Late>[] = [
    { key: "tick", label: "Move", width: "4rem", value: () => "Move", cell: (l) => <input type="checkbox" name="lesson" value={l.id} form="delayed-form" aria-label={`Move ${l.what}, ${shortDate(l.day)}`} /> },
    { key: "day", label: "Day", width: "7rem", value: (l) => l.day, cell: (l) => shortDate(l.day) },
    { key: "when", label: "Period", width: "9rem", value: (l) => l.starts_at, cell: (l) => `${l.starts_at} ${l.label}` },
    { key: "what", label: "Lesson", value: (l) => l.what },
    {
      key: "to",
      label: "Goes to",
      width: "16rem",
      value: () => "Place",
      cell: (l) => (
        <select name={`to_${l.id}`} form="delayed-form" aria-label={`Place for ${l.what}`} defaultValue={proposed.get(l.id) ? `${proposed.get(l.id)!.day}~${proposed.get(l.id)!.ord}` : ""}>
          <option value="">No place chosen</option>
          {free.map((p) => (
            <option key={`${p.day}~${p.ord}`} value={`${p.day}~${p.ord}`}>
              {placeWords(p)}
            </option>
          ))}
        </select>
      ),
    },
  ];
  const stepper = (
    <p className="tt-note" data-weeks>
      Not taught in the week of {dateWords(from)} ·{" "}
      <Link href={keep({ week: plus(from, -7) })} data-step="back">Earlier week</Link> · <Link href={keep({ week: plus(from, 7) })} data-step="on">Later week</Link>
      {" "}— moving to the week of {dateWords(to)} ·{" "}
      <Link href={keep({ to: plus(to, -7) })} data-step="to-back">Earlier</Link> · <Link href={keep({ to: plus(to, 7) })} data-step="to-on">Later</Link>
    </p>
  );
  return (
    <Screen stage={`${klass.grade} ${klass.section} · week of ${dateWords(from)}`} title="Delayed lessons" purpose="Lessons not taught, moved to a coming week in one save." next={{ href: "/timetable", label: "Timetable" }} action={<button className="btn" form="delayed-form" data-ux="action" disabled={!late.length || !free.length}>Move the ticked lessons</button>}>
      {q.error ? <p role="alert" className="tt-error">{q.error}</p> : null}
      {q.done ? <p role="status" className="tt-note">Done: the ticked lessons are moved.</p> : null}
      <div className="tt-filters">
        <FilterBar action={HERE} keep={{ week: from, to }} filters={[{ name: "class", label: "Class", value: classId, required: true, all: "", options: all.map((c) => [c.id, `${c.grade} ${c.section}`] as const) }]} />
      </div>
      {stepper}
      <form id="delayed-form" action="/api/timetable/delayed" method="post" aria-label="Move the ticked lessons" className="tt-form">
        <input type="hidden" name="class" value={classId} />
        <input type="hidden" name="back" value={keep({})} />
        <label>
          Why (kept with each move)
          <input name="reason" />
        </label>
      </form>
      {late.length ? (
        <DataTable label="Not taught" columns={lateColumns} rows={late} rowKey={(l) => l.id} limit={late.length} more={{ page: 1, href: () => "#" }} extras={{ attrs: (l) => ({ "data-late": l.id }) }} />
      ) : (
        <EmptyState>
          <span data-none-late>Every lesson of this week that has gone by was taught.</span>
        </EmptyState>
      )}
      {late.length && !placed ? (
        <p className="tt-note" data-no-week>The week of {dateWords(to)} has no lessons placed for this class yet, so it has no free places: choose another week.</p>
      ) : late.length && !free.length ? (
        <p className="tt-note" data-no-free>The week of {dateWords(to)} has no free place left.</p>
      ) : null}
      <section aria-label="What moved" data-ledger>
        <h2 className="b-label b-muted">What moved in the week of {dateWords(from)}</h2>
        <h3 className="b-label b-muted">Moved ({book.moved.length})</h3>
        {book.moved.length ? (
          <ul className="tt-list" data-moved-list>
            {book.moved.map((m) => (
              <li key={m.id} data-moved>
                <strong>{m.lesson}</strong>: {m.from} to {m.to}, by {m.who} on {dateWords(m.at.slice(0, 10))}{m.why ? `, because ${m.why}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="tt-note">Nothing moved in this week.</p>
        )}
        <h3 className="b-label b-muted">Changed ({book.changed.length})</h3>
        {book.changed.length ? (
          <ul className="tt-list" data-changed-list>
            {book.changed.map((c) => (
              <li key={c.id} data-changed>
                <strong>{c.lesson}</strong>: from {c.was} to {c.now}, by {c.who} on {dateWords(c.at.slice(0, 10))}{c.why ? `, because ${c.why}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="tt-note">No lesson of this week was edited.</p>
        )}
        <h3 className="b-label b-muted">Not taught ({late.length})</h3>
        <p className="tt-note" data-not-taught-count={late.length}>
          {late.length ? `${late.length} lesson${late.length === 1 ? "" : "s"} of this week went by and ${late.length === 1 ? "was" : "were"} not taught: listed above.` : "None."}
        </p>
      </section>
    </Screen>
  );
}
