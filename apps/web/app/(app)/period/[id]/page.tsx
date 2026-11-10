import { notFound } from "next/navigation";
import Link from "@/components/link";
import { Cards } from "@/components/cards";
import { Details } from "@/components/details";
import { EmptyState } from "@/components/empty-state";
import { PeekChip, PeekHost } from "@/components/peek-names";
import { Rail, Screen, type Edge } from "@/components/app-frame";
import { StackBar } from "@/components/stack-bar";
import { type State } from "@/components/status-chip";
import { requireStaff } from "@/lib/auth";
import { sql } from "@/lib/db";
import { pageOf } from "@/lib/educator/data";
import { childrenByIds } from "@/lib/notes-loop";
import { lastTime, sessionOf } from "@/lib/period";
import { screenHref } from "@/lib/built";
import { herVoice } from "@/lib/voice-page";
import { classWords } from "@/lib/voice-types";

// One period (UI-3a): the session's name, what the activity is for in a line, three actions (record a note, type the marks, open
// the activity), how the class did the last time it ran, and the steps, what to lay out and what to watch for. A fixed part of
// the day has no activity, so no capture controls: it says "Nothing to record here".
const UUID = /^[0-9a-f-]{36}$/;
const OUTCOMES: [string, State][] = [["above", "outcomeAbove"], ["as_expected", "outcomeAsExpected"], ["below", "outcomeBelow"], ["not_willing", "outcomeNotWilling"], ["absent", "outcomeAbsent"]];

export default async function Period({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const me = await requireStaff();
  const my = await herVoice(me);
  const s = await sessionOf(id);
  const c = s ? my.classes.find((x) => x.id === s.class_id) : undefined;
  if (!s || !c) notFound();
  const klass = classWords(c);
  const a = s.activity;
  const page = a ? await pageOf(me, a.code).catch(() => null) : null;
  const words = Object.fromEntries((await sql<{ code: string; words: string }[]>`select code, words from observation_outcome`).map((r) => [r.code, r.words]));
  const last = a ? await lastTime(s.class_id, a.code, s.day) : null;
  const named = last ? await childrenByIds(me, last.named.flatMap((n) => n.children)) : {};
  const objective = page?.parts.find((p) => p.part === "objective");
  const steps = page?.parts.find((p) => p.part === "steps");
  const thinking = page?.parts.find((p) => p.part === "thinking");
  const record = `/record?session=${id}`;
  const open = a ? (screenHref("activity", { code: a.code }) ?? `/educator/activity/${encodeURIComponent(a.code)}`) : null;
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
        stage={`Period · ${s.starts_at} · ${klass}${s.subject ? ` · ${s.subject}` : ""}`}
        title={a?.name ?? (s.text || "A fixed part of the day")}
        purpose={objective?.text ? objective.text.slice(0, 140) : a ? "What this activity is for is not written yet." : "A fixed part of the day."}
        action={
          a ? (
            <Link href={record} className="btn">
              Record a note
            </Link>
          ) : (
            <Link href="/today" className="btn secondary">
              Back to Today
            </Link>
          )
        }
        next={{ href: "/today", label: "Today" }}
        rail={<Rail edges={edges} />}
      >
        {a ? (
          <>
            <Cards
              cards={[
                { kind: "note", title: "Type the marks", line: "No voice: mark the children by hand.", href: `${record}&typed=1`, link: "Type the marks instead" },
                { kind: "activity", title: "The activity", line: `${s.subject ?? ""} ${klass}`.trim(), href: open!, link: "Open the activity" },
              ]}
            />
            <section className="mt-4 grid gap-2" aria-label="Last time this ran">
              <h2 className="text-[16px]">{last ? `Last time this ran, ${last.day}` : "Last time this ran"}</h2>
              {last ? (
                <>
                  <StackBar parts={OUTCOMES.map(([k, state]) => ({ state, n: last.counts[k] ?? 0, words: words[k] ?? k }))} />
                  {last.named.map((n) =>
                    n.children.length ? (
                      <div key={n.outcome} className="grid gap-1" data-named={n.outcome}>
                        <span className="text-[13px] text-[var(--ink-muted)]">{words[n.outcome] ?? n.outcome}</span>
                        <ul className="b-nchips">
                          {n.children.flatMap((cid) => (named[cid] ? [<li key={cid}><PeekChip kid={{ ...named[cid], href: `/children/${named[cid].classId}/${Number(named[cid].no)}` }} /></li>] : []))}
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
            </div>
          </>
        ) : (
          <EmptyState next={{ href: "/today", label: "Today" }}>Nothing to record here.</EmptyState>
        )}
      </Screen>
    </PeekHost>
  );
}
