import { Cards } from "@/components/cards";
import { PeekChip, PeekPanel, PeekProvider, type Chosen } from "@/components/children/peek";
import { STATES } from "@/components/status-chip";
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
import { classPicture, k2Classes } from "@/lib/k2-reads";
import { pictureOf } from "@/lib/children-picture";
import { byRoll, groupByLook, peekParam, type PictureLook } from "@/lib/children-view";
import { SECURE, UNSEEN, stateOf } from "@/lib/looks";
import { DOORS, open } from "@/lib/today-doors";
import { myDay, myNotes, sessionsOf, skillsOfActivity, type TodoRow } from "@/lib/today-data";
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

export async function EducatorToday({ me, view, day: asked, peek }: { me: Session; view: "list" | "board"; day?: string; peek?: string }) {
  const [today, now, day, todo] = await Promise.all([schoolToday(), nowAtSchool(), myDay(me, asked), myNotes(me)]);
  const cls = day ? classWords(day.class) : "";
  const stage = [dayWords(day?.day ?? today), cls, day ? fortnightWords(day.fortnight, day.week) : ""].filter(Boolean).join(" · ");
  const late = todo?.groups.left_unconfirmed.rows ?? [];
  const soon = ["fix_this", "to_confirm", "being_read"].flatMap((g) => todo?.groups[g as "to_confirm"].rows ?? []).sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at));
  const periods = day && !isBlank(day) ? day.periods : [];
  const lit = day?.day === today ? litPeriod(periods, now) : null;
  const { done, planned } = periodsDone(periods);
  // her class: the timetable's, or, with none live, the first class her grants name
  const own = day?.class.id ? "" : await k2Classes(me.email).then((r) => (r.ok ? (r.value.classes[0]?.id ?? "") : ""));
  const classId: string = day?.class.id || own;
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
  const cards = await cardsFor(me.email, cls, classId, [...late, ...soon]);
  const yours = classId ? await yourClass(me, classId, next?.activity ?? null) : null;
  const edges = [
    { screen: "timetable", label: "This fortnight", icon: "fortnight" as const, fallback: "/educator/week", line: day?.fortnight ? fortnightWords(day.fortnight, day.week).toLowerCase() : undefined },
    { screen: "materials", label: "Materials", icon: "materials" as const, fallback: "/timetable/materials" },
  ];
  // "Lay out for <the period lit, or next>": what the educator sets out, from the activity's own page (the engine's /curriculum/page/read)
  const layOut = next?.activity ? ((await pageOf(me, next.activity.code))?.materials.items ?? []) : [];
  const facts = layOut.length ? <RailFacts title={`Lay out for ${next!.activity!.name}`} rows={layOut.map((m) => ({ label: m.name, value: [m.quantity, m.unit].filter((x) => x !== null && x !== "").join(" ") }))} /> : undefined;
  return (
    <PeekProvider initial={yours?.kids.find((k) => peekParam(k) === peek) ?? null}>
    <Screen stage={stage} icon="today" title="Today" purpose="Your periods in order. Tap one for what to teach, how, and what to lay out. After it, record a note." action={action} next={{ href: open(DOORS.timetable()) ?? "/educator/week", label: "Timetable" }} rail={<Rail peek={<PeekPanel />} edges={edges} facts={facts} />}>
      <AttentionStrip tiles={tiles} />
      <div className="my-4">
        <div className="[&_.b-seg]:gap-2 [&_.b-seg_[role=tab]]:min-h-[44px] [&_.b-seg_[role=tab]]:min-w-[44px]">
        <ViewToggle current={view} views={[{ key: "list", label: "List", icon: "table", href: addr(asked ? { day: asked } : {}) }, { key: "board", label: "Board", icon: "board", href: addr({ view: "board", ...(asked ? { day: asked } : {}) }) }]} />
        </div>
      </div>
      {view === "board" ? <KanbanBoard lanes={lanes} /> : <PeriodsOrNothing day={day} periods={periods} lit={lit} href={href} />}
      {view === "list" && cards.length ? <Cards cards={cards} /> : null}
      {view === "list" && yours ? <YourClass y={yours} /> : null}
    </Screen>
    </PeekProvider>
  );
}

type Yours = { skill: string; lesson: boolean; seenNot: number; kids: Chosen[]; groups: { look: PictureLook; words: string; kids: Chosen[] }[] };

/** Where her class stands on the lesson in view: the skill the activity builds (activity_skill, the first the class picture knows),
 *  each child by Sr. No. under the state she is in on it. A child never seen on it is "not seen yet", never a state of her own. */
async function yourClass(me: Session, classId: string, activity: { code: string; name: string } | null): Promise<Yours | null> {
  const [p, built] = await Promise.all([pictureOf(me, classId), activity ? skillsOfActivity(activity.code) : Promise.resolve([] as string[])]);
  if (!p) return null;
  // the lesson's own skill; with no lesson in view (or one that builds no skill the class has been seen on) the skill seen most recently
  const lastSeen = (code: string) => [...p.cells.values()].map((r) => r.get(code)?.lastSeen ?? "").sort().pop() ?? "";
  const byLesson = p.skills.find((s) => built.includes(s.code));
  const skill = byLesson ?? [...p.skills].sort((a, b) => lastSeen(b.code).localeCompare(lastSeen(a.code)))[0];
  if (!skill) return null;
  const chosen = (k: (typeof p.kids)[number]): Chosen => {
    const c = { secure: 0, practising: 0, unseen: 0 };
    for (const cell of p.cells.get(k.id)?.values() ?? []) if (cell.look === SECURE) c.secure++; else c.practising++;
    c.unseen = Math.max(0, p.skills.length - c.secure - c.practising);
    return { classId, roll: k.roll, name: k.name, section: p.section, counts: c };
  };
  const rows = [...p.kids].sort(byRoll).map((k) => ({ ...chosen(k), look: (p.cells.get(k.id)?.get(skill.code)?.look ?? UNSEEN) as PictureLook }));
  const groups = groupByLook(rows).map((g) => ({ look: g.look, words: STATES[stateOf(g.look)].words, kids: g.cells }));
  return { skill: skill.name, lesson: !!byLesson, seenNot: rows.filter((r) => r.look === UNSEEN).length, kids: rows, groups };
}

function YourClass({ y }: { y: Yours }) {
  return (
    <section aria-label="Your class on this lesson" className="mt-4 grid gap-3 rounded-[var(--radius-card)] bg-[var(--panel)] p-[var(--space-3)] shadow-[var(--shadow-card)]">
      <h2 className="text-[length:var(--text-title-small,16px)] font-semibold">Your class</h2>
      <p className="text-[var(--ink-muted)]">{y.lesson ? `${many(y.seenNot, "child", "children")} not seen yet on ${y.skill}, by where each stands.` : `Where your class stands on ${y.skill}, the skill seen most recently.`}</p>
      {y.groups.map((g) => (
        <div key={g.look}>
          <h3 className="mb-1 text-[length:var(--text-label)] font-semibold">{g.words} <span className="text-[var(--ink-muted)]">{g.kids.length}</span></h3>
          <div className="flex flex-wrap gap-2">
            {g.kids.map((k) => (
              <PeekChip key={k.roll} child={k} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function PeriodsOrNothing({ day, periods, lit, href }: { day: Day | null; periods: Period[]; lit: string | null; href: (p: Period) => string }) {
  if (!day) return <EmptyState>No timetable is live for your class yet, so there are no sessions to show.</EmptyState>;
  if (isBlank(day)) return <EmptyState>No sessions today: {blankWords(day).toLowerCase()}</EmptyState>;
  return <PeriodRow periods={periods.map((p) => periodRow(p, lit, href(p)))} />;
}

/** Notes to confirm (how many, how old the oldest) and her class (how many children, to the class picture). */
async function cardsFor(email: string, cls: string, classId: string, notes: TodoRow[]) {
  const out: React.ComponentProps<typeof Cards>["cards"][number][] = [];
  const oldest = notes[0];
  const go = oldest ? open(DOORS.confirm(oldest.note_id)) : null;
  if (oldest && go) out.push({ kind: "note", title: "Notes to confirm", line: `${many(notes.length, "note")} · the oldest is ${ageWords(Math.max(...notes.map((n) => n.age_hours)))} old`, href: go, link: "Confirm the first" });
  const pic = classId ? await classPicture(email, classId) : null;
  const to = classId ? open(DOORS.picture(classId)) : null;
  if (pic?.ok && to) out.push({ kind: "child", title: `Your class · ${cls}`, line: many(pic.value.children.length, "child", "children"), href: to, link: "Class picture" });
  return out;
}
