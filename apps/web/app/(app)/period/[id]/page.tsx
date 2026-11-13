import { notFound, redirect } from "next/navigation";
import Link from "@/components/link";
import { Details } from "@/components/details";
import { DetailPanel } from "@/components/detail-panel";
import { LastTimePart, MaterialsPart, OutcomePart, Part, RubricRows, StepsPart, WatchPart } from "@/components/lesson-panel";
import { EmptyState } from "@/components/empty-state";
import { PeekChip, PeekHost } from "@/components/peek-names";
import { Rail, Screen, type Edge } from "@/components/app-frame";
import { outcomeWords } from "@/components/outcome-states";
import { StackBar } from "@/components/stack-bar";
import { MachineMark } from "@/components/origin";
import { levelState } from "@/lib/state-scale";
import { dayWords } from "@/lib/today";
import { requireStaff } from "@/lib/auth";
import { openTo } from "@/lib/educator/data";
import { lessonView } from "@/lib/lesson-view";
import { isDay } from "@/lib/educator/period";
import { ChildLevels, type Child } from "./child-levels";
import { ChooseActivity } from "./choose-activity";
import { LessonForm } from "./lesson-form";
import { mayRead, sessionAt, sessionOf, slotOf } from "@/lib/period";
import { schoolToday } from "@/lib/school-clock";
import { screenHref } from "@/lib/built";
import { classWords } from "@/lib/voice-types";

// The lesson (page charter B4, CP-49): on the left the class as a grid of child cards, marked child by child against the activity's rubric;
// on the right the activity in tabs, Activity · Rubric · Materials · History. A lesson with no activity says so and the coordinator chooses
// one; a fixed part of the day has nothing to record. It opens exactly when the timetable is open to the person (as the page it replaced
// did); a voice note needs voice notes on and the class to be hers.
// Its address is a lesson's (a session), or a period's with `?class=&day=`, which is the lesson if there is one and a read-only "no
// lesson here" page if there is none: opening a page never makes a lesson.
const UUID = /^[0-9a-f-]{36}$/;

export default async function Period({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ class?: string; day?: string }> }) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  if (q.day !== undefined && !isDay(q.day)) notFound();
  const me = await requireStaff();
  await openTo(me);
  const s = await sessionOf(id);
  if (!s) {
    if (!q.class || !UUID.test(q.class)) notFound();
    const at = await sessionAt(q.class, q.day ?? (await schoolToday()), id);
    if (at) redirect(`/period/${at}`);
    const slot = await slotOf(q.class, id);
    if (!slot || !(await mayRead(me, slot.section))) notFound();
    const coordinates = me.role === "coordinator" || me.role === "admin";
    return (
      <Screen stage={`Period · ${slot.starts_at} · ${classWords(slot)}`} title="No lesson here" purpose="Nothing is planned in this period on this day. It may have been moved away on purpose." action={<Link href="/today" className="btn secondary">Back to Today</Link>} next={{ href: `/timetable?view=day&class=${q.class}${q.day ? `&day=${q.day}` : ""}`, label: "The day" }}>
        <EmptyState next={coordinates ? { href: "/timetable", label: "Open the Timetable" } : undefined}>No lesson here.</EmptyState>
      </Screen>
    );
  }
  const v = await lessonView(me, id, true);
  if (!v) notFound();
  const { a, klass, mine, coordinator, full, offers, rolls, roster, levels: read, last, named, period, planner, objective } = v;
  const record = `/record?session=${id}`;
  const day = `/timetable?view=day&class=${s.class_id}&day=${s.day}`;
  // the activity's curriculum page is the coordinator's (page charter B4: an educator never lands on it from a lesson); it returns to this day (its `back`)
  const open = a && coordinator ? `${screenHref("activity", { code: a.code }) ?? `/setup/activities/${encodeURIComponent(a.code)}`}?back=${encodeURIComponent(day)}` : null;
  // where this lesson leads when it has no activity to show on the right, with the addresses that exist
  const edges: Edge[] = [
    { screen: "timetable", href: day, label: "The day", icon: "fortnight" as const, line: "its place in the timetable" },
    { screen: "picture", href: `/children/${s.class_id}`, label: "The class", icon: "class" as const, line: "every child on every skill" },
  ];
  const levels = full?.levels ?? [];
  // the cards: Sr. No. and first name (only the names the person may see; a child they may not is a number alone)
  const kids: Child[] = (read?.roll ?? []).map(({ child_id, sr_no }) => {
    const roll = String(sr_no);
    return { roll, id: child_id, first: roster?.[roll]?.first ?? "", initials: roster?.[roll]?.initials ?? "" };
  });
  const panel = a ? (
    <DetailPanel
      inline
      summary={{ title: "", stats: [] }}
      open={{
        key: `lesson:${id}`,
        kind: "activity",
        title: a.name,
        mark: a.origin === "machine" ? <MachineMark /> : undefined,
        line: [full?.group, klass].filter(Boolean).join(" · "),
        tabs: [
          {
            key: "activity",
            label: "Activity",
            body: (
              <>
                <OutcomePart v={v} />
                <StepsPart v={v} />
                <Part title="Lay out">
                  <MaterialsPart v={v} />
                </Part>
                <WatchPart v={v} />
                <Part title="Objectives and skills">
                  <div className="grid gap-2" data-part="objectives">
                    <div>
                      <h3 className="text-[13px] text-[var(--ink-muted)]">Objectives</h3>
                      {full?.objectives.length ? <ul className="list-disc pl-[var(--space-4)]">{full.objectives.map((o) => <li key={o}>{o}</li>)}</ul> : <p>None written for this activity.</p>}
                    </div>
                    <div>
                      <h3 className="text-[13px] text-[var(--ink-muted)]">Skills</h3>
                      {full?.skills.length ? <ul className="list-disc pl-[var(--space-4)]">{full.skills.map((k) => <li key={k}>{k}</li>)}</ul> : <p>None linked to this activity.</p>}
                    </div>
                  </div>
                </Part>
                {planner.length ? (
                  <Part title="The planner's lines">
                    <ul className="list-disc pl-[var(--space-4)]" data-part="planner">
                      {planner.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                  </Part>
                ) : null}
              </>
            ),
          },
          { key: "rubric", label: "Rubric", body: <RubricRows levels={levels} /> },
          { key: "materials", label: "Materials", body: <MaterialsPart v={v} /> },
          {
            key: "history",
            label: "History",
            body: (
              read?.last ? (
                <Part title={`Last time this class did it, ${dayWords(read.last.day)}`}>
                  <div data-level-history>
                    <StackBar
                      parts={[
                        ...[0, 1, 2, 3].map((n) => ({ state: levelState(n, 4), n: read.last!.counts[String(n) as "0"] ?? 0, words: `Level ${n}${levels[n] ? `: ${levels[n]}` : ""}` })),
                        { state: "notSeenYet" as const, n: (read.last.counts.absent ?? 0) + (read.last.counts.not_willing ?? 0), words: "Absent or not willing" },
                      ]}
                    />
                  </div>
                </Part>
              ) : (
              <LastTimePart
                v={v}
                after={
                  last?.named.some((n) => n.children.length) ? (
                    <>
                      {last.named.map((n) =>
                        n.children.length ? (
                          <div key={n.outcome} className="grid gap-1" data-named={n.outcome}>
                            <span className="text-[13px] text-[var(--ink-muted)]">{outcomeWords(n.outcome)}</span>
                            <ul className="b-nchips">
                              {n.children.flatMap((cid) => (named[cid] ? [<li key={cid}><PeekChip kid={{ ...named[cid], href: `/children/${named[cid].classId}/${Number(named[cid].no)}`, classId: named[cid].classId, roll: String(Number(named[cid].no)) }} /></li>] : []))}
                            </ul>
                          </div>
                        ) : null,
                      )}
                      <span className="b-caption">Sr. No. only. Tap one to see that child&apos;s recent history.</span>
                    </>
                  ) : null
                }
              />
              )
            ),
          },
        ],
      }}
    />
  ) : null;
  return (
    <PeekHost>
      <Screen
        stage={`Period · ${s.starts_at}${s.ends_at ? `–${s.ends_at}` : ""} · ${klass}${period?.name || s.subject ? ` · ${period?.name || s.subject}` : ""}`}
        title={a?.name ?? (s.text || "A fixed part of the day")}
        purpose={objective?.text ? objective.text.slice(0, 140) : full?.outcome ? full.outcome.slice(0, 140) : a ? "What this activity is for is not written yet." : s.kind === "fixed" ? "A fixed part of the day." : "No activity for this lesson yet."}
        action={
          a && mine ? (
            <Link href={record} className="btn">
              Record a note
            </Link>
          ) : (
            <Link href="/today" className="btn secondary">
              Back to Today
            </Link>
          )
        }
        next={{ href: day, label: "Today" }}
        panel={panel}
        rail={panel ? undefined : <Rail edges={edges} />}
      >
        <p className="mb-4" data-part="school-words">
          {s.text}
        </p>
        {a ? (
          <>
            <nav className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="This lesson">
              {/* the site's Link, as every other: a page change, not a reload that streams the activity's page in again */}
              {open ? (
                <Link href={open} data-open-activity>
                  Open the activity
                </Link>
              ) : null}
              {mine ? <Link href={`${record}&typed=1`}>Type the marks instead</Link> : null}
              <Link href={`/children/${s.class_id}`}>The class</Link>
            </nav>
            {kids.length ? (
              <ChildLevels sessionId={id} classId={s.class_id} day={s.day} klass={klass} kids={kids} levels={levels.length ? levels : ["", "", "", ""]} saved={read?.marks ?? []} />
            ) : (
              <p className="text-[var(--ink-muted)]" data-no-roll>
                No child is on this class&apos;s roll for this day.
              </p>
            )}
            <div className="mt-4 grid gap-2">
              {mine && rolls.length ? (
                // the class form of CP-40 (as expected, above, below): kept beside the grid until the levels are saved by the engine (CP-49)
                <Details summary="Mark against the expected level">
                  <div data-part="lesson-form">
                    <LessonForm rolls={rolls} roster={roster} levels={levels.length ? levels : ["", "", "", ""]} klass={klass} sessionId={id} classId={s.class_id} day={s.day} />
                  </div>
                </Details>
              ) : null}
              {coordinator && offers ? (
                <Details summary="Choose another activity" id="choose">
                  <ChooseActivity sessionId={id} offers={offers.activities} current={offers.activity_code} kind={offers.label} />
                </Details>
              ) : null}
            </div>
          </>
        ) : s.kind === "fixed" ? (
          <EmptyState next={{ href: "/today", label: "Today" }}>Nothing to record here.</EmptyState>
        ) : (
          <section className="grid gap-3" aria-label="No activity for this lesson yet" data-no-activity>
            <p className="max-w-[62ch] rounded-[var(--radius-card)] border border-dashed border-[var(--line-control)] p-[var(--space-3)] text-[var(--ink-muted)]">
              No activity for this lesson yet.{offers?.label ? ` It is a ${offers.label} lesson.` : ""} Nothing can be marked against it until one is chosen.
            </p>
            {coordinator && offers ? <ChooseActivity sessionId={id} offers={offers.activities} current={offers.activity_code} kind={offers.label} /> : coordinator ? null : <p className="text-[length:var(--text-label)] text-[var(--ink-muted)]">The coordinator chooses a lesson&apos;s activity.</p>}
          </section>
        )}
      </Screen>
    </PeekHost>
  );
}
