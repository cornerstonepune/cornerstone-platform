import { notFound } from "next/navigation";
import { Cards } from "@/components/cards";
import { Details } from "@/components/details";
import { KeyValue } from "@/components/key-value";
import { LevelBars } from "@/components/level-bars";
import { Rail, Screen, type Edge } from "@/components/app-frame";
import { Answers } from "@/components/educator/page-answers";
import { Words } from "@/components/page-part/part";
import { Origin } from "@/components/page-part/part";
import { requireStaff } from "@/lib/auth";
import { openTo } from "@/lib/educator/data";
import { screenHref } from "@/lib/built";
import { PART_WORDS, type PagePart } from "@/lib/page-part";
import { activityFacts, activityPage } from "@/lib/teaching";

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
  const facts = await activityFacts(me, page.code);
  const part = (k: string): PagePart | undefined => page.parts.find((p) => p.part === k);
  const reviews = me.role === "coordinator";
  const levels = [0, 1, 2, 3].map((n) => part(`level_${n}`)).filter((p): p is PagePart => !!p);
  const steps = part("steps");
  const thinking = part("thinking");
  const edges: Edge[] = facts.objectives.map((o) => ({ screen: "objective", params: { code: o.code }, label: o.title, icon: "objective" }));
  const materials = screenHref("materials");
  const objective = part("objective");
  return (
    <Screen
      stage={`Activity ${page.code} · ${page.section}`}
      title={page.name}
      purpose={(objective?.text || "What this activity is for is not written yet.").slice(0, 140)}
      action={<span className="text-[length:var(--text-label)] text-[var(--ink-muted)]">{[page.section, page.code].filter(Boolean).join(" · ")}</span>}
      next={back?.startsWith("/educator") ? { href: back, label: "Back to the day" } : { href: "/today", label: "Today" }}
      rail={<Rail edges={edges} />}
    >
      <div className="grid gap-[var(--space-3)]">
        <section aria-label="The four levels" data-levels className="grid grid-cols-2 gap-[var(--space-2)] min-[1000px]:grid-cols-4">
          {levels.map((p) => (
            <div key={p.part} className="rounded-[var(--radius-card)] border border-[var(--line)] p-[var(--space-3)]">
              <KeyValue rows={[{ label: PART_WORDS[p.part], value: p.text || "Nothing written yet." }]} />
            </div>
          ))}
        </section>
        <section aria-label="Where the class sat last time" className="grid gap-[var(--space-2)]">
          <h2 className="text-[length:var(--text-title-small)]">{facts.last ? `Where ${facts.last.section} sat last time, ${day(facts.last.day)}` : "Where the class sat last time"}</h2>
          <LevelBars levels={facts.last?.levels ?? []} empty="Not taught to your classes yet." />
        </section>
        <section aria-label="Taught so far" className="grid gap-[var(--space-2)]">
          <h2 className="text-[length:var(--text-title-small)]">Taught so far</h2>
          <KeyValue
            rows={[
              { label: "Last taught", value: facts.taught.last ? day(facts.taught.last) : "Not taught yet" },
              { label: "Children seen on it", value: facts.taught.children, num: true },
              { label: "Times taught", value: facts.taught.times, num: true },
            ]}
          />
          {facts.taught.outcomes.length ? <p data-outcomes>{facts.taught.outcomes.map((o) => `${outcomeWords(o.outcome)} ${o.n}`).join(" · ")}</p> : null}
        </section>
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
        {facts.objectives.length ? (
          <Cards cards={[{ kind: "objective", title: "Builds toward", line: facts.objectives.map((o) => o.title).join(" · "), href: screenHref("objective", { code: facts.objectives[0].code }) ?? `/setup/objectives/${encodeURIComponent(facts.objectives[0].code)}`, link: facts.objectives.length === 1 ? "Open the objective" : "Open the first objective" }]} />
        ) : null}
        <section aria-label="Where each part came from" data-sources className="grid gap-[var(--space-2)]">
          <h2 className="text-[length:var(--text-title-small)]">Where each part came from</h2>
          <ul className="grid gap-[var(--space-2)]">
            {page.parts.filter((p) => p.part !== "materials").map((p) => (
              <li key={p.part} id={`part-${p.part}`} data-part={p.part} data-drafted={p.source === "drafted" || undefined} className="grid gap-[var(--space-1)]">
                <span className="font-semibold">{PART_WORDS[p.part]}</span>
                {p.text ? <Origin part={p} /> : <span data-empty>Empty: nothing written yet</span>}
                {reviews && p.source === "drafted" ? <Answers code={page.code} p={p} /> : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Screen>
  );
}
