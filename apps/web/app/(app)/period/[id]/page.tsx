import { notFound, redirect } from "next/navigation";
import Link from "@/components/link";
import { Cards } from "@/components/cards";
import { Details } from "@/components/details";
import { EmptyState } from "@/components/empty-state";
import { PeekChip, PeekHost } from "@/components/peek-names";
import { Rail, Screen, type Edge } from "@/components/app-frame";
import { StackBar } from "@/components/stack-bar";
import { Summary } from "@/components/educator/summary";
import { OUTCOME_ORDER, outcomeWords } from "@/components/outcome-states";
import { requireStaff } from "@/lib/auth";
import { openTo, pageOf, periodOf } from "@/lib/educator/data";
import { isDay } from "@/lib/educator/period";
import { E } from "@/lib/educator/words";
import { childrenByIds } from "@/lib/notes-loop";
import { lastTime, mayRead, sessionAt, sessionOf, slotOf } from "@/lib/period";
import { schoolToday } from "@/lib/school-clock";
import { screenHref } from "@/lib/built";
import { myVoice, voiceOn } from "@/lib/voice";
import { classWords } from "@/lib/voice-types";

// One period (UI-3a): the session's name, what the activity is for in a line, three actions (record a note, type the marks, open
// the activity), how the class did the last time it ran, and the steps, what to lay out and what to watch for. A fixed part of
// the day has no activity, so no capture controls: it says "Nothing to record here". It opens exactly when the timetable is open to
// the person (as the page it replaced did); recording needs voice notes on and the class to be hers.
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
  if (!(await mayRead(me, s.section))) notFound();
  const klass = classWords(s);
  const voice = await voiceOn();
  const mine = voice ? !!(await myVoice(me))?.classes.some((x) => x.id === s.class_id) : false;
  const a = s.activity;
  const page = a ? await pageOf(me, a.code).catch(() => null) : null;
  const last = a ? await lastTime(s.class_id, a.code, s.day) : null;
  // the planner's lines for this subject this fortnight (what the page it replaced showed); none if the engine has none for it
  const period = await periodOf(me, { class_id: s.class_id, day: s.day, period_id: s.period_id }).catch(() => null);
  const planner = period?.plan_lines ?? [];
  const named = last ? await childrenByIds(me, last.named.flatMap((n) => n.children)) : {};
  const objective = page?.parts.find((p) => p.part === "objective");
  const steps = page?.parts.find((p) => p.part === "steps");
  const thinking = page?.parts.find((p) => p.part === "thinking");
  const record = `/record?session=${id}`;
  const day = `/timetable?view=day&class=${s.class_id}&day=${s.day}`;
  // the activity's own page returns to this day when it is left (its `back`)
  const open = a ? `${screenHref("activity", { code: a.code }) ?? `/setup/activities/${encodeURIComponent(a.code)}`}?back=${encodeURIComponent(day)}` : null;
  const edges: Edge[] = a
    ? [
        { screen: "activity", params: { code: a.code }, label: "The activity", icon: "activity" },
        { screen: "materials", label: "Materials", icon: "materials" },
        { screen: "timetable", label: "Its place in the fortnight", icon: "fortnight" },
        { screen: "picture", params: { class: s.class_id }, label: "The class", icon: "class" },
      ]
    : [{ screen: "picture", params: { class: s.class_id }, label: "The class", icon: "class" }];
  return (
    <PeekHost>
      <Screen
        stage={`Period · ${s.starts_at}–${s.ends_at} · ${klass}${period?.name || s.subject ? ` · ${period?.name || s.subject}` : ""}`}
        title={a?.name ?? (s.text || "A fixed part of the day")}
        purpose={objective?.text ? objective.text.slice(0, 140) : a ? "What this activity is for is not written yet." : "A fixed part of the day."}
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
        rail={<Rail edges={edges} />}
      >
        <Summary
          items={[
            { label: E.counts.lines, n: planner.length, href: "#planner" },
            { label: E.counts.activities, n: a ? 1 : 0 },
          ]}
        />
        <p className="mb-4" data-part="school-words">
          {s.text}
        </p>
        {a ? (
          <>
            <Cards
              cards={[
                ...(mine ? [{ kind: "note" as const, title: "Type the marks", line: "No voice: mark the children by hand.", href: `${record}&typed=1`, link: "Type the marks instead" }] : []),
                {
                  kind: "activity",
                  title: "The activity",
                  line: `${s.subject ?? ""} ${klass}`.trim(),
                  body: (
                    <div className="grid gap-1" data-part="activity">
                      <span className="font-medium">{a.name}</span>
                      <a href={open!} data-open-activity>
                        Open the activity
                      </a>
                    </div>
                  ),
                },
              ]}
            />
            <section className="mt-4 grid gap-2" aria-label="Last time this ran">
              <h2 className="text-[16px]">{last ? `Last time this ran, ${last.day}` : "Last time this ran"}</h2>
              {last ? (
                <>
                  <StackBar parts={OUTCOME_ORDER.map(([k, state]) => ({ state, n: last.counts[k] ?? 0, words: outcomeWords(k) }))} />
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
              ) : (
                <p className="text-[var(--ink-muted)]">Not run with this class yet.</p>
              )}
            </section>
            <div className="mt-4 grid gap-2">
              <Details summary="The steps, short" open>
                {steps?.items.length ? <ol>{steps.items.map((i) => <li key={i}>{i}</li>)}</ol> : <p>{steps?.text || "No steps written yet."}</p>}
              </Details>
              <Details summary="Lay out">
                {page?.materials.items.length ? (
                  <ul>
                    {page.materials.items.map((m) => (
                      <li key={m.name}>
                        {m.name}
                        {m.quantity ? ` · ${m.quantity}${m.unit ? ` ${m.unit}` : ""}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{page?.materials.text || "Nothing listed."}</p>
                )}
              </Details>
              <Details summary="Watch for">
                <p>{thinking?.text || "Nothing written yet."}</p>
              </Details>
              <Details summary="The planner's lines" id="planner" open>
                {planner.length ? (
                  <ul data-part="planner">
                    {planner.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                ) : (
                  <p>The planner has no line for this period.</p>
                )}
              </Details>
            </div>
          </>
        ) : (
          <EmptyState next={{ href: "/today", label: "Today" }}>Nothing to record here.</EmptyState>
        )}
      </Screen>
    </PeekHost>
  );
}
