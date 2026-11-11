import Link from "@/components/link";
import { notFound } from "next/navigation";
import { Cards } from "@/components/cards";
import { Details } from "@/components/details";
import { KeyValue } from "@/components/key-value";
import { LevelBars } from "@/components/level-bars";
import { Screen } from "@/components/app-frame";
import { StatusChip } from "@/components/status-chip";
import { outcomeState } from "@/components/outcome-states";
import { InfoCard, Tiles } from "@/components/teaching/info-card";
import { RailAside, TeachingRail, type RailLink } from "@/components/teaching/rail";
import { Answers } from "@/components/educator/page-answers";
import { Words } from "@/components/page-part/part";
import { Origin } from "@/components/page-part/part";
import { requireStaff } from "@/lib/auth";
import { openTo } from "@/lib/educator/data";
import { screenHref } from "@/lib/built";
import { PART_WORDS, type PagePart } from "@/lib/page-part";
import { activityFacts, activityPage } from "@/lib/teaching";
import { fortnightsOf, nextTaught } from "@/lib/teaching-plan";

// One activity (UI-3c): what the objective is, the four levels in the school's words, how the class sat last time, and the
// steps, how to think about it and what to lay out, each part marked with whose words it is. A part the system drafted carries
// the "drafted" badge until a coordinator keeps, edits or sends it back; an educator sees the badge and none of the buttons.
// A part with no words is shown empty and marked, never filled in.
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const outcomeWords = (c: string) => (c.charAt(0).toUpperCase() + c.slice(1)).replaceAll("_", " ");

export default async function ActivityScreen({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ back?: string }> }) {
  const me = await requireStaff();
  const code = decodeURIComponent((await params).code);
  // a period or the materials list opens the activity with its own address as `back`: the next step returns to it
  const back = (await searchParams).back;
  await openTo(me);
  const page = await activityPage(code);
  if (!page) notFound();
  const [facts, plan, next] = await Promise.all([activityFacts(me, page.code), fortnightsOf(me, [page.code]), nextTaught(me, page.code)]);
  const fortnights = plan.get(page.code) ?? [];
  const part = (k: string): PagePart | undefined => page.parts.find((p) => p.part === k);
  const reviews = me.role === "coordinator";
  const levels = [0, 1, 2, 3].map((n) => part(`level_${n}`)).filter((p): p is PagePart => !!p);
  const steps = part("steps");
  const thinking = part("thinking");
  const materials = screenHref("materials");
  const objective = part("objective");
  const links: RailLink[] = [
    ...facts.objectives.map((o): RailLink => ({ kind: "objective", screen: "objective", href: screenHref("objective", { code: o.code }) ?? `/setup/objectives/${encodeURIComponent(o.code)}`, label: o.title, note: "the objective" })),
    ...page.materials.items.map((m): RailLink => ({ kind: "note", screen: "materials", label: m.name, note: "to lay out" })),
    ...(next ? [{ kind: "period", screen: "period", params: { id: next.id }, label: "Next taught", note: `${day(next.day)}, ${next.starts_at} · ${next.section}` } satisfies RailLink] : []),
    ...(fortnights.length ? [{ kind: "period", screen: "fortnight", params: { n: String(fortnights[0].number) }, label: "The fortnights it is in", note: `fortnights ${fortnights.map((f) => f.number).join(" and ")}` } satisfies RailLink] : []),
  ];
  return (
    <Screen
      stage={`Activity ${page.code} · ${page.section}`}
      title={page.name}
      purpose={(objective?.text || "What this activity is for is not written yet.").slice(0, 140)}
      action={<span className="text-[length:var(--text-label)] text-[var(--ink-muted)]">{[page.section, page.code].filter(Boolean).join(" · ")}</span>}
      next={back?.startsWith("/educator") ? { href: back, label: "Back to the day" } : { href: "/today", label: "Today" }}
      rail={
        <RailAside>
          <TeachingRail links={links} capture={<Link href="/record" className="b-btn b-btn-capture">Voice note</Link>}>
            {fortnights.length ? (
              <section aria-label="Fortnights it is in" data-fortnights>
                <h2 className="mb-[var(--space-1)] text-[length:var(--text-eyebrow)] text-[var(--ink-muted)] uppercase">Fortnights it is in</h2>
                <KeyValue rows={fortnights.map((f) => ({ label: `Fortnight ${f.number}`, value: f.taught ? <StatusChip state="done" words="Taught" /> : <StatusChip state="waiting" words="Coming up" /> }))} />
              </section>
            ) : null}
          </TeachingRail>
        </RailAside>
      }
    >
      <div className="grid gap-[var(--space-3)]">
        <dl aria-label="The four levels" data-levels className="m-0 grid grid-cols-2 gap-[var(--space-2)] min-[1000px]:grid-cols-4">
          {levels.map((p) => (
            <div key={p.part} className="rounded-[var(--radius-card)] bg-[var(--surface)] p-[var(--space-3)]">
              <dt className="text-[length:var(--text-label)] text-[var(--ink-muted)]">{PART_WORDS[p.part]}</dt>
              <dd className="m-0">{p.text || "Nothing written yet."}</dd>
            </div>
          ))}
        </dl>
        <InfoCard icon="class" title={facts.last ? `Where ${facts.last.section} sat last time, ${day(facts.last.day)}` : "Where the class sat last time"} label="Where the class sat last time">
          <LevelBars levels={facts.last?.levels ?? []} empty="Not taught to your classes yet." />
        </InfoCard>
        <InfoCard icon="history" title="Taught so far" label="Taught so far">
          <Tiles
            label="When it was taught"
            tiles={[
              { label: "Last taught", value: facts.taught.last ? day(facts.taught.last) : "Not taught yet" },
              { label: "Children seen on it", value: facts.taught.children },
              { label: "Times taught", value: facts.taught.times },
            ]}
          />
          {facts.taught.outcomes.length ? (
            <>
              <p className="b-caption">What the educator saw, by outcome, across every time it was taught</p>
              <p data-outcomes className="b-keyrow">
                {facts.taught.outcomes.map((o) => {
                  const state = outcomeState(o.outcome);
                  return state ? <StatusChip key={o.outcome} state={state} note={String(o.n)} /> : <span key={o.outcome}>{`${outcomeWords(o.outcome)} ${o.n}`}</span>;
                })}
              </p>
            </>
          ) : null}
        </InfoCard>
        <div className="grid gap-[var(--space-2)]">
          <Details summary="Steps" open name="steps">
            {steps?.text ? <Words part={steps} /> : <p data-empty>Nothing written yet.</p>}
          </Details>
          <Details summary="How to think about it" name="thinking">
            {thinking?.text ? <Words part={thinking} /> : <p data-empty>Nothing written yet.</p>}
          </Details>
          <Details summary="Materials" name="materials">
            {page.materials.items.length ? (
              <ul>
                {page.materials.items.map((m, i) => (
                  <li key={i}>
                    {materials ? <a href={materials}>{m.name}</a> : m.name}
                    {m.quantity !== null ? ` · ${m.quantity} ${m.unit}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p data-empty>{page.materials.text || "Nothing written yet."}</p>
            )}
          </Details>
        </div>
        <Cards
          cards={[
            ...(facts.objectives.length
              ? [
                  {
                    kind: "objective" as const,
                    title: "Builds toward",
                    body: (
                      <ul className="m-0 grid list-none gap-[var(--space-1)] p-0">
                        {facts.objectives.map((o) => (
                          <li key={o.code}>
                            <a href={screenHref("objective", { code: o.code }) ?? `/setup/objectives/${encodeURIComponent(o.code)}`}>{o.title}</a>
                          </li>
                        ))}
                      </ul>
                    ),
                  },
                ]
              : []),
            {
              kind: "activity" as const,
              title: "Where each part came from",
              body: (
                <ul className="m-0 grid list-none gap-[var(--space-2)] p-0" data-sources>
                  {page.parts.filter((p) => p.part !== "materials").map((p) => (
                    <li key={p.part} id={`part-${p.part}`} data-part={p.part} data-drafted={p.source === "drafted" || undefined} className="grid gap-[var(--space-1)]">
                      <span className="font-semibold">{PART_WORDS[p.part]}</span>
                      {p.text ? <Origin part={p} /> : <span data-empty>Empty: nothing written yet</span>}
                      {reviews && p.source === "drafted" ? <Answers code={page.code} p={p} /> : null}
                    </li>
                  ))}
                </ul>
              ),
            },
          ]}
        />
      </div>
    </Screen>
  );
}
