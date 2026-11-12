import { Cards } from "@/components/cards";
import { Rail, RailFacts, Screen } from "@/components/app-frame";
import { AttentionStrip, type Attention } from "@/components/attention-strip";
import { EmptyState } from "@/components/empty-state";
import { KanbanBoard, ViewToggle, type KCard, type Lane } from "@/components/kanban-board";
import { PeriodRow } from "@/components/period-row";
import type { Session } from "@/lib/auth";
import { pageOf } from "@/lib/educator/data";
import { blankWords, isBlank, isLesson, timeOf } from "@/lib/educator/period";
import type { Day, Period } from "@/lib/educator/types";
import { nowAtSchool, schoolToday } from "@/lib/school-clock";
import { sql } from "@/lib/db";
import { DOORS, open } from "@/lib/today-doors";
import { myDay, myNotes, nextFortnight, noteFigures, sessionsOf, type Read, type TodoRow } from "@/lib/today-data";
import { E } from "@/lib/educator/words";
import { dayWords, fortnightWords, litPeriod, many, periodRow, periodsDone } from "@/lib/today";
import { classWords } from "@/lib/voice-types";

// Today, the educator's (docs/frontend/SPEC.md, Today): her periods in order, what waits on her, her class. The tiles and the
// board's lanes count the same rows, so a tile's number is the number of rows it opens. No score, no ranking, whole counts only.
const addr = (o: Record<string, string>) => {
  const q = new URLSearchParams(o).toString();
  return q ? `/today?${q}` : "/today";
};
const ageWords = (h: number) => (h >= 48 ? `${Math.floor(h / 24)} days` : `${h} h`);
const NOTE_STATE: Record<string, KCard["state"]> = { left_unconfirmed: "late", to_confirm: "toConfirm", fix_this: "fixThis", being_read: "reading" };

const noteCard = (r: TodoRow, cls: string): KCard => {
  const href = open(DOORS.confirm(r.note_id));
  return { key: r.note_id, kind: "note", title: r.activity_name ?? "A note to confirm", sub: `${cls} · ${ageWords(r.age_hours)} old`, href: href ?? "#", state: NOTE_STATE[r.state] ?? "toConfirm" };
};

export async function EducatorToday({ me, view, day: asked }: { me: Session; view: "list" | "board"; day?: string }) {
  const [today, now, got, notes] = await Promise.all([schoolToday(), nowAtSchool(), myDay(me, asked), myNotes(me)]);
  const day = got.ok ? got.value : null;
  const todo = notes.ok ? notes.value : null;
  // null when the engine could not be read: the two note tiles and lanes are left out and a sentence says why, never a 0 that is not known
  const figures = noteFigures(notes);
  const cls = day ? classWords(day.class) : "";
  const stage = [dayWords(day?.day ?? today), cls, day ? fortnightWords(day.fortnight, day.week) : ""].filter(Boolean).join(" · ");
  const late = todo?.groups.left_unconfirmed.rows ?? [];
  const soon = ["fix_this", "to_confirm", "being_read"].flatMap((g) => todo?.groups[g as "to_confirm"].rows ?? []).sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at));
  const periods = day && !isBlank(day) ? day.periods : [];
  const lit = day?.day === today ? litPeriod(periods, now) : null;
  const { done, planned } = periodsDone(periods);
  const classId = day?.class.id ?? "";
  const sessions = day && classId ? await sessionsOf(classId, day.day) : {};
  // a day with no lesson says when lessons start again: the class's next fortnight
  const coming = day && isBlank(day) && classId ? await nextFortnight(classId, day.day) : null;
  const href = (p: Period) => open(DOORS.period(p.period_id, classId, day!.day, sessions[p.period_id])) ?? "#";
  const tiles: Attention[] = [
    ...(figures
      ? [
          { state: "doNow" as const, n: late.length, sentence: "Notes left unconfirmed past the time they may wait", href: late[0] ? open(DOORS.confirm(late[0].note_id)) : null },
          { state: "doSoon" as const, n: soon.length, sentence: "Notes waiting for you to confirm", href: soon.length ? open(DOORS.notes()) : null },
        ]
      : []),
    ...(got.ok || !got.down ? [{ state: "done" as const, n: done, sentence: `Periods taught of ${planned} planned today`, href: classId ? open(DOORS.picture(classId)) : null }] : []),
  ];
  const next = periods.find((p) => p.period_id === lit) ?? periods.find((p) => isLesson(p) && p.starts_at > now && day?.day === today);
  // the main action is the period itself: the lit row (or the next) is the one to open, and says so in words here
  const action = <p className="font-medium">{next ? `${lit === next.period_id ? "Now" : "Next"}: ${next.name}, ${timeOf(next)}` : day && !isBlank(day) ? "No lesson is left today." : "No lesson to open today."}</p>;
  const noteLanes: Lane[] = [
    { key: "doNow", label: "Do now", state: "doNow", count: late.length, empty: "No note is waiting past its time.", cards: late.map((r) => noteCard(r, cls)) },
    { key: "doSoon", label: "This week", state: "doSoon", count: soon.length, empty: "No note is waiting for you.", cards: soon.map((r) => noteCard(r, cls)) },
  ];
  const lanes: Lane[] = [
    ...(figures ? noteLanes : []),
    { key: "done", label: "Done", state: "done", count: done, empty: "No period is taught and confirmed yet today.", cards: periods.filter((p) => isLesson(p) && p.state === "done").map((p) => ({ key: p.period_id, kind: "period" as const, title: p.name, sub: timeOf(p), href: href(p), state: "done" as const })) },
  ];
  const cards = await cardsFor(cls, classId, [...late, ...soon]);
  const edges = [
    { screen: "timetable", label: "This fortnight", icon: "fortnight" as const, fallback: "/timetable", line: day?.fortnight ? fortnightWords(day.fortnight, day.week).toLowerCase() : undefined },
    { screen: "materials", label: "Materials", icon: "checklist" as const, fallback: "/timetable/materials" },
  ];
  // "Lay out for <the period lit, or next>": what the educator sets out, from the activity's own page (the engine's /curriculum/page/read)
  const layOut = next?.activity ? ((await pageOf(me, next.activity.code))?.materials.items ?? []) : [];
  const facts = layOut.length ? <RailFacts title={`Lay out for ${next!.activity!.name}`} rows={layOut.map((m) => ({ label: m.name, value: [m.quantity, m.unit].filter((x) => x !== null && x !== "").join(" ") }))} /> : undefined;
  return (
    <Screen stage={stage} title="Today" purpose="Your periods in order. Tap one for what to teach, how, and what to lay out. After it, record a note." action={action} next={{ href: open(DOORS.timetable()) ?? "/timetable", label: "Timetable" }} rail={<Rail edges={edges} facts={facts} />}>
      {tiles.length ? <AttentionStrip tiles={tiles} /> : null}
      {notes.ok || !notes.down ? null : <p className="b-muted" data-unread="notes">Your notes could not be read just now. {notes.words}</p>}
      <div className="my-4">
        <div className="[&_.b-seg]:gap-2 [&_.b-seg_[role=tab]]:min-h-[44px] [&_.b-seg_[role=tab]]:min-w-[44px]">
        <ViewToggle current={view} views={[{ key: "list", label: "List", icon: "table", href: addr(asked ? { day: asked } : {}) }, { key: "board", label: "Board", icon: "board", href: addr({ view: "board", ...(asked ? { day: asked } : {}) }) }]} />
        </div>
      </div>
      {view === "board" ? <KanbanBoard lanes={lanes} /> : <PeriodsOrNothing got={got} periods={periods} lit={lit} href={href} today={today} coming={coming} />}
      {view === "list" && cards.length ? <Cards cards={cards} /> : null}
    </Screen>
  );
}

/** Her periods, or in words why there are none: a holiday or a day with no school, the engine's own reason for not giving her a day
 *  (switched off, no class held), or that it could not be read just now. Never a blank. */
function PeriodsOrNothing({ got, periods, lit, href, today, coming }: { got: Read<Day>; periods: Period[]; lit: string | null; href: (p: Period) => string; today: string; coming: { number: number; starts_on: string } | null }) {
  if (!got.ok) return <EmptyState>{got.down ? `Your day could not be read just now. ${got.words}` : got.words}</EmptyState>;
  const day = got.value;
  if (isBlank(day)) {
    const next = coming ? ` ${E.dayKind.nextFortnight.replace("{n}", String(coming.number)).replace("{day}", dayWords(coming.starts_on))}` : "";
    return <EmptyState>{`${day.day === today ? "No sessions today." : "No sessions on this day."} ${blankWords(day)}${next}`}</EmptyState>;
  }
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
