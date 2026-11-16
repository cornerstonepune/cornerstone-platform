import { setMaterials } from "@/app/(app)/setup/activities/[code]/actions";
import { LinkList, Taught } from "./curriculum-panel";
import { Answers } from "./educator/page-answers";
import { KeyValue } from "./key-value";
import { KindTile, type Kind } from "./kind-tile";
import { RubricRows } from "./lesson-panel";
import { Origin, Words } from "./page-part/part";
import { Icon, type IconName } from "@/lib/icons";
import { originOf, passes, type Origin as From } from "@/lib/origin";
import type { PagePart } from "@/lib/page-part";
import type { ActivityFacts, ActivityPage } from "@/lib/teaching";

// The activity on one screen (CP-53, Nimish 14 Nov): what the child learns, how to mark, the steps and how to think about them on the
// left; the materials, where it sits and how it was taught on the right. Every block is the site's own card with its kind's colour
// (blocks.css), the rubric the lesson page's (RubricRows). Every part is edited in place by the curriculum's reviewers, the school's
// words included; a machine's part or link keeps its one symbol until a person approves it, and is never hidden (CP-53 Done when 5).
const LEVELS = ["level_0", "level_1", "level_2", "level_3"] as const;
const MUTED = "text-[var(--ink-muted)]";
// the part editor's field (components/educator/page-answers.tsx), so the two forms look alike
const FIELD = "w-full rounded-[var(--radius-control)] border border-[var(--line-control)] bg-[var(--panel)] p-[var(--space-2)] text-[length:var(--text-body)]";

export type ActivityView = { page: ActivityPage; facts: ActivityFacts; edits: boolean; back: string; origin?: From; objectiveHref: (code: string) => string };

function Card({ kind, icon, title, id, children }: { kind: Kind; icon?: IconName; title: string; id: string; children: React.ReactNode }) {
  return (
    <section className="b-card" data-kind={kind} aria-labelledby={id} data-section={id}>
      <h2 className="b-card-h" id={id}>
        <KindTile kind={kind} icon={icon} /> {title}
      </h2>
      <div className="b-card-b">{children}</div>
    </section>
  );
}

/** Whether the page's origin filter keeps this part (a filtered page shows only the parts that came from there). */
const shown = (p: PagePart | undefined, v: ActivityView): p is PagePart => !!p && passes(v.origin, originOf(p.source));

/** One part's words, where they came from, and (for a reviewer) its editor. */
function Part({ p, v }: { p: PagePart | undefined; v: ActivityView }) {
  if (!shown(p, v)) return null;
  return (
    <div className="grid gap-[var(--space-1)]" data-part={p.part} data-source={p.source || "empty"} data-origin={originOf(p.source) ?? "empty"}>
      {p.source && p.text ? <Origin part={p} /> : null}
      {p.text ? <Words part={p} /> : <span className={MUTED} data-empty>Empty: nothing written yet</span>}
      {v.edits ? <Answers code={v.page.code} p={p} back={v.back} /> : null}
    </div>
  );
}

/** Under the rubric, a row for each level: its name, where its words came from (or that it has none), and its Edit. */
function LevelRow({ p, n, v }: { p: PagePart | undefined; n: number; v: ActivityView }) {
  if (!shown(p, v)) return null;
  return (
    <li className="flex flex-wrap items-center gap-[var(--space-2)]" data-part={p.part} data-source={p.source || "empty"} data-origin={originOf(p.source) ?? "empty"}>
      <span className="font-semibold">Level {n}</span>
      {p.source && p.text ? <Origin part={p} /> : <span className={MUTED} data-empty>Empty: nothing written yet</span>}
      {v.edits ? <Answers code={v.page.code} p={p} back={v.back} /> : null}
    </li>
  );
}

export function ActivitySections(v: ActivityView) {
  const part = (k: string) => v.page.parts.find((p) => p.part === k);
  const objectives = v.facts.objectives.filter((l) => passes(v.origin, [l.origin, l.own ?? null]));
  const skills = v.facts.skills.filter((l) => passes(v.origin, l.origin));
  const levels = LEVELS.map((k) => part(k));
  return (
    <div className="grid items-start gap-[var(--space-4)] lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" data-activity-page>
      <div className="grid gap-[var(--space-4)]">
        <Card kind="objective" title="What the child learns" id="learns">
          <Part p={part("objective")} v={v} />
          <h3 className="flex items-center gap-[var(--space-1)] font-semibold"><Icon name="objective" size={16} /> Objectives</h3>
          {objectives.length ? <LinkList rows={objectives} href={v.objectiveHref} data="data-objective-row" link="data-objective-link" /> : <p className={MUTED}>No objective linked yet.</p>}
          <h3 className="flex items-center gap-[var(--space-1)] font-semibold"><Icon name="skill" size={16} /> Skills it builds</h3>
          {skills.length ? <LinkList rows={skills} data="data-skill-link" /> : <p className={MUTED}>No skill linked yet.</p>}
        </Card>
        <Card kind="skill" icon="tree" title="How to mark" id="rubric">
          <p className={MUTED}>A child not marked on a lesson counts as Level 2.</p>
          <RubricRows levels={levels.map((p) => p?.text ?? "")} />
          <ul className="grid gap-[var(--space-2)]" data-levels>
            {levels.map((p, n) => (
              <LevelRow key={LEVELS[n]} p={p} n={n} v={v} />
            ))}
          </ul>
        </Card>
        <div className="grid items-start gap-[var(--space-4)] md:grid-cols-2">
          <Card kind="activity" icon="checklist" title="Steps" id="steps">
            <Part p={part("steps")} v={v} />
          </Card>
          <Card kind="note" title="How to think about it" id="thinking">
            <Part p={part("thinking")} v={v} />
          </Card>
        </div>
      </div>
      <div className="grid gap-[var(--space-4)]">
        <Card kind="period" icon="materials" title="Materials" id="materials">
          <Materials v={v} />
        </Card>
        <Card kind="activity" title="Where it sits" id="where">
          <KeyValue rows={[{ label: "Strand", value: v.page.section || "Not given" }, { label: "Code", value: v.page.code }]} />
        </Card>
        <Card kind="child" icon="class" title="Taught" id="taught">
          <Taught facts={v.facts} />
        </Card>
      </div>
    </div>
  );
}

/** The materials as items with a count (the lesson page's list); for a reviewer, a form of a row each and two empty rows to add. */
function Materials({ v }: { v: ActivityView }) {
  const items = v.page.materials.items;
  return (
    <>
      {items.length ? (
        <ul className="grid gap-[var(--space-1)]" data-materials>
          {items.map((m) => (
            <li key={m.name} className="flex items-center gap-[var(--space-2)]">
              <Icon name="materials" size={16} />
              <span className="flex-1">{m.name}</span>
              {m.quantity !== null ? <span className="b-num">× {m.quantity}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={MUTED} data-empty>{v.page.materials.text || "Nothing written yet."}</p>
      )}
      {v.edits ? (
        <details className="grid gap-[var(--space-2)]" data-materials-edit>
          <summary className="btn secondary w-fit cursor-pointer list-none">
            <Icon name="correct" size={16} /> Edit the materials
          </summary>
          <form action={setMaterials} className="mt-[var(--space-2)] grid gap-[var(--space-2)]">
            <input type="hidden" name="code" value={v.page.code} />
            <input type="hidden" name="back" value={v.back} />
            {[...items.map((m) => ({ name: m.name, count: m.quantity })), { name: "", count: null }, { name: "", count: null }].map((m, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_5rem] gap-[var(--space-2)]">
                <label className="grid gap-[var(--space-1)]">
                  <span className="text-[length:var(--text-label)] text-[var(--ink-muted)]">Material {i + 1}</span>
                  <input name="name" defaultValue={m.name} className={FIELD} />
                </label>
                <label className="grid gap-[var(--space-1)]">
                  <span className="text-[length:var(--text-label)] text-[var(--ink-muted)]">How many</span>
                  <input name="count" type="number" min={1} step="any" defaultValue={m.count ?? ""} className={FIELD} />
                </label>
              </div>
            ))}
            <p className={`text-[length:var(--text-label)] ${MUTED}`}>Clear a name to take that material out.</p>
            <button type="submit" className="btn w-fit">Save the materials</button>
          </form>
        </details>
      ) : null}
    </>
  );
}
