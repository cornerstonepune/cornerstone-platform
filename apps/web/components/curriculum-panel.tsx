import type { ReactNode } from "react";
import Link from "@/components/link";
import type { Opened } from "./detail-panel";
import { KeyValue } from "./key-value";
import { LevelBars } from "./level-bars";
import { MachineIf, MachineMark } from "./origin";
import { Origin as PartOrigin, Words } from "@/components/page-part/part";
import { Answers } from "./educator/page-answers";
import { ORIGIN_WORDS, originOf, passes, type Origin } from "@/lib/origin";
import { PART_WORDS } from "@/lib/page-part";
import type { ActivityFacts, ActivityPage, Linked, ObjectivePage } from "@/lib/teaching";

// The curriculum's things in the detail panel (page charter Part C: Curriculum is a Workspace, the list on the left and the chosen item on
// the right; A2: an item's full page is its panel opened full page). An activity has Parts · Objectives · Skills · Taught; an objective
// Skills · Activities. Every part and link says where it came from (sheet, machine or person, CP-48), the machine's with its one symbol,
// and every list honours the page's origin filter. A part the machine made is edited in place by whoever reads it: nothing waits.
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const outcomeWords = (c: string) => (c.charAt(0).toUpperCase() + c.slice(1)).replaceAll("_", " ");
const LIST = "grid gap-[var(--space-2)]";
const MUTED = "text-[var(--ink-muted)]";

/** Where a link came from, in its word, with the machine's symbol. */
export function OriginLine({ origin, of }: { origin: Origin | null | undefined; of?: string }) {
  if (!origin) return null;
  return (
    <span className={`text-[length:var(--text-label)] ${MUTED}`} data-origin={origin}>
      {origin === "machine" ? <MachineMark /> : null} {of ? `${of}: ` : ""}
      {ORIGIN_WORDS[origin]}
    </span>
  );
}

const none = (filtered: boolean, what: string) => <p className={MUTED}>{filtered ? `No ${what} of that origin.` : `No ${what} linked yet.`}</p>;

export type ActivityPanel = {
  key: string;
  closeHref?: string;
  full?: string;
  tab?: string;
  /** The page's origin filter: every list here shows only what came from it. */
  origin?: Origin;
  /** Whether this person may edit (the engine's gate says so; anyone it lets in edits directly). */
  edits: boolean;
  /** The address drawn again after an edit. */
  back: string;
  objectiveHref: (code: string) => string;
};

export function activityOpened(page: ActivityPage, facts: ActivityFacts, o: ActivityPanel): Opened {
  const parts = page.parts.filter((p) => p.part !== "materials" && passes(o.origin, originOf(p.source)));
  const machine = page.parts.some((p) => p.source === "drafted") || [...facts.objectives, ...facts.skills].some((l) => l.origin === "machine" || l.own === "machine");
  const partsTab = (
    <>
      {parts.length ? (
        <ul className={LIST} aria-label="Where each part came from" data-sources>
          {parts.map((p) => (
            <li key={p.part} id={`part-${p.part}`} data-part={p.part} data-origin={originOf(p.source) ?? "empty"} className="grid gap-[var(--space-1)]">
              <span className="font-semibold">{PART_WORDS[p.part]}</span>
              {p.text ? <PartOrigin part={p} /> : <span data-empty>Empty: nothing written yet</span>}
              {p.text ? <Words part={p} /> : null}
              {o.edits && p.source === "drafted" ? <Answers code={page.code} p={p} back={o.back} /> : null}
            </li>
          ))}
        </ul>
      ) : (
        none(!!o.origin, "part")
      )}
      {!o.origin ? (
        <section aria-label="Materials" className="mt-[var(--space-3)] grid gap-[var(--space-1)]">
          <h3 className="font-semibold">Materials</h3>
          {page.materials.items.length ? (
            <ul className="list-disc pl-[var(--space-4)]" data-materials>
              {page.materials.items.map((m, i) => (
                <li key={i}>
                  {m.name}
                  {m.quantity !== null ? ` · ${m.quantity} ${m.unit}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p data-empty>{page.materials.text || "Nothing written yet."}</p>
          )}
        </section>
      ) : null}
    </>
  );
  const objectives = facts.objectives.filter((l) => passes(o.origin, [l.origin, l.own ?? null]));
  const skills = facts.skills.filter((l) => passes(o.origin, l.origin));
  return {
    key: o.key,
    kind: "activity",
    title: page.name,
    line: [page.section, page.code].filter(Boolean).join(" · "),
    mark: machine ? <MachineMark /> : undefined,
    full: o.full,
    closeHref: o.closeHref,
    tab: o.tab,
    tabs: [
      { key: "parts", label: "Parts", body: partsTab },
      { key: "objectives", label: "Objectives", body: objectives.length ? <LinkList rows={objectives} href={o.objectiveHref} data="data-objective-row" link="data-objective-link" /> : none(!!o.origin, "objective") },
      { key: "skills", label: "Skills", body: skills.length ? <LinkList rows={skills} data="data-skill-link" /> : none(!!o.origin, "skill") },
      { key: "taught", label: "Taught", body: <Taught facts={facts} /> },
    ],
  };
}

/** Each link a row: the thing (a link where it has a page), where the link came from, and for an objective where it came from itself. */
/** `data`: the row's attribute; `link`: its link's (screens.json names the link by it). */
function LinkList({ rows, href, data, link }: { rows: readonly Linked[]; href?: (code: string) => string; data: string; link?: string }) {
  return (
    <ul className={LIST}>
      {rows.map((l) => (
        <li key={l.code} {...{ [data]: "" }} data-origin={l.origin ?? undefined} className="grid gap-[var(--space-1)]">
          <span className="flex flex-wrap items-center gap-[var(--space-1)]">
            {href ? (
              <Link href={href(l.code)} scroll={false} {...(link ? { [link]: "" } : {})}>
                {l.name}
              </Link>
            ) : (
              <span>{l.name}</span>
            )}
            <MachineIf origin={[l.origin, l.own ?? null]} />
          </span>
          <OriginLine origin={l.origin} of="Linked by" />
          {l.own !== undefined ? <OriginLine origin={l.own} of="Made by" /> : null}
        </li>
      ))}
    </ul>
  );
}

function Taught({ facts }: { facts: ActivityFacts }) {
  return (
    <div className="grid gap-[var(--space-3)]">
      <section aria-label="Where the class sat last time" className="grid gap-[var(--space-2)]">
        <h3 className="font-semibold">{facts.last ? `Where ${facts.last.section} sat last time, ${day(facts.last.day)}` : "Where the class sat last time"}</h3>
        <LevelBars levels={facts.last?.levels ?? []} empty="Not taught to your classes yet." />
      </section>
      <section aria-label="Taught so far" className="grid gap-[var(--space-2)]">
        <h3 className="font-semibold">Taught so far</h3>
        <KeyValue
          rows={[
            { label: "Last taught", value: facts.taught.last ? day(facts.taught.last) : "Not taught yet" },
            { label: "Children seen on it", value: facts.taught.children, num: true },
            { label: "Times taught", value: facts.taught.times, num: true },
          ]}
        />
        {facts.taught.outcomes.length ? <p data-outcomes>{facts.taught.outcomes.map((x) => `${outcomeWords(x.outcome)} ${x.n}`).join(" · ")}</p> : null}
      </section>
    </div>
  );
}

export type ObjectivePanel = { key: string; closeHref?: string; full?: string; tab?: string; origin?: Origin; activityHref: (code: string) => string; skills?: ReactNode; activities?: ReactNode };

/** An objective: the skills it builds and the activities that build toward it, each link with where it came from. The objective itself
 *  is never scored: no number, percentage or state is drawn for it. `skills`, `activities`: the full page's own tabs (cards with prerequisites, a table). */
export function objectiveOpened(lo: ObjectivePage, o: ObjectivePanel): Opened {
  const skills = lo.skills.filter((s) => passes(o.origin, s.origin));
  const acts = lo.activities.filter((a) => passes(o.origin, a.origin));
  return {
    key: o.key,
    kind: "objective",
    title: lo.title,
    line: [lo.band, lo.subject, lo.origin ? `from the ${ORIGIN_WORDS[lo.origin].toLowerCase()}` : ""].filter(Boolean).join(" · "),
    mark: lo.origin === "machine" || lo.skills.some((s) => s.origin === "machine") || lo.activities.some((a) => a.origin === "machine") ? <MachineMark /> : undefined,
    full: o.full,
    closeHref: o.closeHref,
    tab: o.tab,
    tabs: [
      { key: "skills", label: "Skills", body: o.skills ?? (skills.length ? <LinkList rows={skills} data="data-skill-link" /> : none(!!o.origin, "skill")) },
      { key: "activities", label: "Activities", body: o.activities ?? (acts.length ? <LinkList rows={acts} href={o.activityHref} data="data-activity-item" link="data-activity-link" /> : none(!!o.origin, "activity")) },
    ],
  };
}

/** A skill of grades 1 to 4 (a skill set) as the list reads it: its place and how many of its levels a person has approved. */
export function skillSetOpened(r: { code: string; name: string; grade: string; subject: string; topic: string; levels: number; approved: number }, o: { key: string; closeHref: string; full: string; tab?: string }): Opened {
  return {
    key: o.key,
    kind: "skill",
    title: r.name,
    line: [r.grade, r.subject, r.topic].filter(Boolean).join(" · "),
    full: o.full,
    closeHref: o.closeHref,
    tab: o.tab,
    tabs: [
      {
        key: "levels",
        label: "Levels",
        body: (
          <KeyValue
            rows={[
              { label: "Levels", value: r.levels, num: true },
              { label: "Approved by a person", value: r.approved, num: true },
              { label: "Where it came from", value: "The sheet" },
            ]}
          />
        ),
      },
    ],
  };
}
