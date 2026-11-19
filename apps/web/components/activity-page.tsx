import Link from "@/components/link";
import { Changes, GradesEdit, NameEdit } from "./activity-edit";
import { For, HEAD, Lay, Mark, Run, Watch, LEVELS, part } from "./activity/blocks";
import { AddLink, MarkForm, MaterialsForm, RemoveLink } from "./activity/forms";
import { Taught } from "./curriculum-panel";
import { PartForm } from "./educator/page-answers";
import { KeyValue } from "./key-value";
import { MachineIf, MachineMark } from "./origin";
import type { ActivityEdit } from "@/lib/activity-edit";
import type { ActivityFacts, ActivityPage, Linked } from "@/lib/teaching";

// The activity on one page (Nimish, 19 Nov 2026; before it, one long page of seven Edit buttons and the levels twice): the title, the trail and
// the status bar are the page's (app/(app)/setup/activities/[code]/page.tsx); here are the sections, each reading clean with one Edit that
// turns only that section into its form: Run it beside Lay out, Watch for beside How to mark, Connects to, Taught, and a Details fold at the
// foot (code, what it is for, name, grades, changes). Edit is the address's `?edit=<section>`, so a form is a page like any other.
// A part the machine drafted carries a dot until a person approves it (CP-53: never hidden).
const MUTED = "text-[var(--ink-muted)]";
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** `at`: this page's address with the given query on it (the page's own `back` kept); `editing`: the section whose form is open. */
export type ActivityView = {
  page: ActivityPage;
  facts: ActivityFacts;
  edits: boolean;
  at: (q?: Record<string, string | undefined>) => string;
  editing?: string;
  find?: string;
  kind?: string;
  details?: boolean;
  objectiveHref: (code: string) => string;
  skillHref: (code: string) => string;
  edit?: ActivityEdit;
  said?: string;
  grades?: string[];
};

function Section({ id, title, drafted, v, form, wide, children }: { id: string; title: string; drafted?: boolean; v: ActivityView; form?: React.ReactNode; wide?: boolean; children: React.ReactNode }) {
  const open = v.edits && v.editing === id && form;
  return (
    <section className={`card grid content-start gap-[var(--space-2)] ${wide ? "md:col-span-2" : ""}`} data-card aria-labelledby={`h-${id}`} data-section={id} id={id}>
      <div className="flex min-h-[var(--tap)] items-center gap-[var(--space-2)]">
        <h2 id={`h-${id}`} className="flex flex-1 items-center gap-[var(--space-1)] text-[length:var(--text-body)] font-semibold">
          {title}
          {drafted ? <MachineMark /> : null}
        </h2>
        {v.edits && !open ? (
          <Link href={`${v.at({ edit: id })}#${id}`} className="btn secondary" scroll={false} data-edit={id} aria-label={`Edit ${title.toLowerCase()}`}>
            Edit
          </Link>
        ) : null}
      </div>
      {open ? form : children}
    </section>
  );
}

/** The objectives and skills it connects to, each a link to its page; a reviewer's Edit shows Remove link on each and a box to find more. */
function Connects({ v }: { v: ActivityView }) {
  const e = v.editing === "connects" && v.edits ? v.edit : undefined;
  const back = v.at({ edit: e ? "connects" : undefined });
  const w = { code: v.page.code, back };
  const list = (rows: Linked[], kind: "objective" | "skill", none: string) =>
    rows.length ? (
      <ul className="grid gap-[var(--space-1)]">
        {rows.map((l) => (
          <li key={l.code} className="flex min-h-[var(--tap)] items-center gap-[var(--space-2)]" {...{ [kind === "skill" ? "data-skill-link" : "data-objective-row"]: "" }} data-origin={l.origin ?? undefined}>
            <Link href={kind === "skill" ? v.skillHref(l.code) : v.objectiveHref(l.code)} className="min-w-0 flex-1 [overflow-wrap:anywhere]" {...(kind === "objective" ? { "data-objective-link": "" } : {})}>
              {l.name}
            </Link>
            <MachineIf origin={[l.origin, l.own ?? null]} />
            {e ? <RemoveLink w={w} kind={kind} other={l.code} name={l.name} /> : null}
          </li>
        ))}
      </ul>
    ) : (
      <p className={MUTED}>{none}</p>
    );
  return (
    <div className="grid gap-[var(--space-3)] md:grid-cols-2" data-ties>
      <div className="grid content-start gap-[var(--space-1)]" data-ties="objectives">
        <h3 className="font-semibold">Objectives</h3>
        {list(v.facts.objectives, "objective", "No objective linked yet.")}
        {e && (!v.kind || v.kind === "objective") ? <AddLink w={w} kind="objective" choices={e.objectives} find={v.kind === "objective" ? (v.find ?? "") : ""} action={v.at()} /> : null}
      </div>
      <div className="grid content-start gap-[var(--space-1)]" data-ties="skills">
        <h3 className="font-semibold">Skills</h3>
        {list(v.facts.skills, "skill", "No skill linked yet.")}
        {e && (!v.kind || v.kind === "skill") ? <AddLink w={w} kind="skill" choices={e.skills} find={v.kind === "skill" ? (v.find ?? "") : ""} action={v.at()} /> : null}
      </div>
    </div>
  );
}

export function ActivitySections(v: ActivityView) {
  const { page, facts, edit: e } = v;
  const drafted = (...ks: string[]) => ks.some((k) => part(page, k)?.source === "drafted");
  const cancel = (id: string) => `${v.at()}#${id}`;
  const w = { code: page.code, back: v.at({ open: "details" }) };
  const tag = `Taught${facts.taught.times ? ` · ${facts.taught.times} ${facts.taught.times === 1 ? "time" : "times"}` : ""}${facts.taught.last ? ` · last ${day(facts.taught.last)}` : " · not taught yet"}`;
  const purpose = part(page, "objective");
  return (
    <div className="grid items-start gap-[var(--space-3)] md:grid-cols-2" data-activity-page>
      {v.said ? (
        <p role="status" className="b-note md:col-span-2" data-said>
          {v.said}
        </p>
      ) : null}
      <Section id="run" title={HEAD.run} drafted={drafted("steps")} v={v} form={part(page, "steps") ? <PartForm code={page.code} p={part(page, "steps")!} back={cancel("run")} cancel={<Link href={cancel("run")} className="btn secondary w-fit" scroll={false}>Cancel</Link>} /> : null}>
        <Run page={page} />
      </Section>
      <Section id="lay" title={HEAD.lay} v={v} form={<MaterialsForm page={page} back={cancel("lay")} cancel={cancel("lay")} />}>
        <Lay page={page} />
      </Section>
      <Section id="watch" title={HEAD.watch} drafted={drafted("thinking")} v={v} form={part(page, "thinking") ? <PartForm code={page.code} p={part(page, "thinking")!} back={cancel("watch")} cancel={<Link href={cancel("watch")} className="btn secondary w-fit" scroll={false}>Cancel</Link>} /> : null}>
        <Watch page={page} />
      </Section>
      <Section id="mark" title={HEAD.mark} drafted={drafted(...LEVELS)} v={v} form={<MarkForm page={page} back={cancel("mark")} cancel={cancel("mark")} />}>
        <Mark page={page} />
        <p className={`text-[length:var(--text-label)] ${MUTED}`}>A child not marked on a lesson counts as Level 2.</p>
      </Section>
      <Section id="connects" title={HEAD.connects} drafted={[...facts.objectives, ...facts.skills].some((l) => l.origin === "machine" || l.own === "machine")} v={v} wide form={<><Connects v={v} /><Link href={cancel("connects")} className="btn secondary w-fit" scroll={false}>Done</Link></>}>
        <Connects v={v} />
      </Section>
      <section className="card md:col-span-2" data-card id="taught" data-section="taught">
        <details>
          <summary className="flex min-h-[var(--tap)] cursor-pointer items-center font-semibold">{tag}</summary>
          <div className="mt-[var(--space-2)]">
            <Taught facts={facts} />
          </div>
        </details>
      </section>
      <section className="card md:col-span-2" data-card id="details" data-section="details">
        <details open={v.details || v.editing === "for"} data-details>
          <summary className="flex min-h-[var(--tap)] cursor-pointer items-center font-semibold">Details{e ? ` · ${e.changes.length + e.earlier} changes` : ""}</summary>
          <div className="mt-[var(--space-2)] grid gap-[var(--space-3)] md:grid-cols-2">
            <div className="grid content-start gap-[var(--space-3)]">
              <KeyValue rows={[{ label: "Code", value: page.code }, ...(e ? [] : v.grades?.length ? [{ label: "Grades", value: v.grades.join(", ") }] : [])]} />
              <div className="grid gap-[var(--space-1)]" data-part="for">
                <h3 className="font-semibold">{HEAD.for}</h3>
                {purpose && v.edits ? <PartForm code={page.code} p={purpose} back={v.at({ open: "details" })} /> : <For page={page} />}
              </div>
              {e ? <NameEdit w={w} name={page.name} /> : null}
              {e ? <GradesEdit w={w} edit={e} /> : null}
            </div>
            {e ? (
              <div className="grid content-start gap-[var(--space-1)]">
                <h3 className="font-semibold">Changes</h3>
                <Changes w={w} edit={e} />
              </div>
            ) : null}
          </div>
        </details>
      </section>
    </div>
  );
}
