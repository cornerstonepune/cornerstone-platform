import { Cards } from "@/components/cards";
import { Rail, Screen } from "@/components/app-frame";
import { AttentionStrip, type Attention } from "@/components/attention-strip";
import { EmptyState } from "@/components/empty-state";
import { KanbanBoard, ViewToggle, type KCard, type Lane } from "@/components/kanban-board";
import { PeriodRow } from "@/components/period-row";
import type { Session } from "@/lib/auth";
import { blankWords, isBlank, isLesson, timeOf } from "@/lib/educator/period";
import type { Day, Period } from "@/lib/educator/types";
import { nowAtSchool, schoolToday } from "@/lib/school-clock";
import { sql } from "@/lib/db";
import { DOORS, open } from "@/lib/today-doors";
import { myDay, myNotes, sessionsOf, type TodoRow } from "@/lib/today-data";
import { dayWords, fortnightWords, litPeriod, many, periodRow, periodsDone } from "@/lib/today";
import { classWords } from "@/lib/voice-types";

// Today, the educator's (docs/frontend/SPEC.md, Today): her periods in order, what waits on her, her class. The tiles and the
// board's lanes count the same rows, so a tile's number is the number of rows it opens. No score, no ranking, whole counts only.
const addr = (o: Record<string, string>) => {
  const q = new URLSearchParams(o).toString();
  return q ? `/today/new?${q}` : "/today/new";
};
const ageWords = (h: number) => (h >= 48 ? `${Math.floor(h / 24)} days` : `${h} h`);
const NOTE_STATE: Record<string, KCard["state"]> = { left_unconfirmed: "late", to_confirm: "toConfirm", fix_this: "fixThis", being_read: "reading" };

const noteCard = (r: TodoRow, cls: string): KCard => {
  const href = open(DOORS.confirm(r.note_id));
  return { key: r.note_id, kind: "note", title: r.activity_name ?? "A note to confirm", sub: `${cls} · ${ageWords(r.age_hours)} old`, href: href ?? "#", state: NOTE_STATE[r.state] ?? "toConfirm" };
};

export async function EducatorToday({ me, view, day: asked }: { me: Session; view: "list" | "board"; day?: string }) {
  const [today, now, day, todo] = await Promise.all([schoolToday(), nowAtSchool(), myDay(me, asked), myNotes(me)]);
  const cls = day ? classWords(day.class) : "";
  const stage = [dayWords(day?.day ?? today), cls, day ? fortnightWords(day.fortnight, day.week) : ""].filter(Boolean).join(" · ");
  const late = todo?.groups.left_unconfirmed.rows ?? [];
  const soon = ["fix_this", "to_confirm", "being_read"].flatMap((g) => todo?.groups[g as "to_confirm"].rows ?? []).sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at));
  const periods = day && !isBlank(day) ? day.periods : [];
  const lit = day?.day === today ? litPeriod(periods, now) : null;
  const { done, planned } = periodsDone(periods);
  const classId = day?.class.id ?? "";
  const sessions = day && classId ? await sessionsOf(classId, day.day) : {};
  const href = (p: Period) => open(DOORS.period(p.period_id, classId, day!.day, sessions[p.period_id])) ?? "#";
  const tiles: Attention[] = [
    { state: "doNow", n: late.length, sentence: "Notes left unconfirmed past the time they may wait", href: late[0] ? open(DOORS.confirm(late[0].note_id)) : null },
    { state: "doSoon", n: soon.length, sentence: "Notes waiting for you to confirm", href: soon.length ? open(DOORS.notes()) : null },
    { state: "done", n: done, sentence: `Periods taught of ${planned} planned today`, href: classId ? open(DOORS.picture(classId)) : null },
  ];
  const next = periods.find((p) => p.period_id === lit) ?? periods.find((p) => isLesson(p) && p.starts_at > now && day?.day === today);
  // the main action is the period itself: the lit row (or the next) is the one to open, and says so in words here
  const action = <p className="font-medium">{next ? `${lit === next.period_id ? "Now" : "Next"}: ${next.name}, ${timeOf(next)}` : day && !isBlank(day) ? "No lesson is left today." : "No lesson to open today."}</p>;
  const lanes: Lane[] = [
    { key: "doNow", label: "Do now", state: "doNow", count: late.length, empty: "No note is waiting past its time.", cards: late.map((r) => noteCard(r, cls)) },
    { key: "doSoon", label: "This week", state: "doSoon", count: soon.length, empty: "No note is waiting for you.", cards: soon.map((r) => noteCard(r, cls)) },
    { key: "done", label: "Done", state: "done", count: done, empty: "No period is taught and confirmed yet today.", cards: periods.filter((p) => isLesson(p) && p.state === "done").map((p) => ({ key: p.period_id, kind: "period" as const, title: p.name, sub: timeOf(p), href: href(p), state: "done" as const })) },
  ];
  const cards = await cardsFor(cls, classId, [...late, ...soon]);
  const edges = [
    { screen: "timetable", label: "This fortnight", icon: "fortnight" as const, fallback: "/timetable" },
    { screen: "materials", label: "Materials", icon: "checklist" as const, fallback: "/timetable/materials" },
  ];
  return (
    <Screen stage={stage} title="Today" purpose="Your periods in order. Tap one for what to teach, how, and what to lay out. After it, record a note." action={action} next={{ href: open(DOORS.timetable()) ?? "/educator/week", label: "Timetable" }} rail={<div className="[&_[data-rail]_ul]:gap-2"><Rail edges={edges} /></div>}>
      <AttentionStrip tiles={tiles} />
      <div className="my-4">
        <div className="[&_.b-seg]:gap-2 [&_.b-seg_[role=tab]]:min-h-[44px] [&_.b-seg_[role=tab]]:min-w-[44px]">
        <ViewToggle current={view} views={[{ key: "list", label: "List", icon: "table", href: addr(asked ? { day: asked } : {}) }, { key: "board", label: "Board", icon: "board", href: addr({ view: "board", ...(asked ? { day: asked } : {}) }) }]} />
        </div>
      </div>
      {view === "board" ? <KanbanBoard lanes={lanes} /> : <PeriodsOrNothing day={day} periods={periods} lit={lit} href={href} />}
      {view === "list" && cards.length ? <Cards cards={cards} /> : null}
    </Screen>
  );
}

function PeriodsOrNothing({ day, periods, lit, href }: { day: Day | null; periods: Period[]; lit: string | null; href: (p: Period) => string }) {
  if (!day) return <EmptyState>No timetable is live for your class yet, so there are no sessions to show.</EmptyState>;
  if (isBlank(day)) return <EmptyState>No sessions today: {blankWords(day).toLowerCase()}</EmptyState>;
  return <PeriodRow periods={periods.map((p) => periodRow(p, lit, href(p)))} />;
}

/** Notes to confirm (how many, how old the oldest) and her class (how many children, to the class picture). */
async function cardsFor(cls: string, classId: string, notes: TodoRow[]) {
  const out: React.ComponentProps<typeof Cards>["cards"][number][] = [];
  const oldest = notes[0];
  const go = oldest ? open(DOORS.confirm(oldest.note_id)) : null;
  if (oldest && go) out.push({ kind: "note", title: "Notes to confirm", line: `${many(notes.length, "note")} · the oldest is ${ageWords(Math.max(...notes.map((n) => n.age_hours)))} old`, href: go, link: "Confirm the first" });
  // her class is her own by construction (`classId` is the class on her staff entry), so the children are counted as the Children screen does
  const [{ n }] = classId ? await sql<{ n: number }[]>`select count(*)::int as n from child_now where class_id = ${classId}::uuid and active` : [{ n: -1 }];
  const to = classId ? open(DOORS.picture(classId)) : null;
  if (n >= 0 && to) out.push({ kind: "child", title: `Your class · ${cls}`, line: many(n, "child", "children"), href: to, link: "Class picture" });
  return out;
}
