import type { ReactNode } from "react";
import Link from "@/components/link";
import { EmptyState } from "@/components/empty-state";
import { StatusChip } from "@/components/status-chip";
import { Timeline } from "@/components/timeline";
import type { Opened, PanelTab } from "@/components/detail-panel";
import { colourState, scaleLook } from "@/lib/state-scale";
import { reportWords } from "@/lib/queries-reports";
import type { ChildPanel } from "@/lib/child-panel";
import { dateWords } from "@/lib/week";

// One child in the detail panel (page charter B5): tabs Skills (each skill seen, coloured on the one state scale) · Notes (what was seen) ·
// Papers (each paper made for the child or read from them) · Report (the parent report's state). The class picture opens it on the right; the
// child's own page is the same panel opened full page, where a tab may say more (`more`). Whole counts only: nothing scores or ranks a child.
export const CHILD_TABS = ["skills", "notes", "papers", "report"] as const;
export type ChildTab = (typeof CHILD_TABS)[number];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The skills as a coloured list: each skill's name, its state chip (the engine's words, the scale's colour) and how often it was seen. */
export function SkillList({ c }: { c: ChildPanel }) {
  if (!c.skills.length) return <EmptyState>Not seen yet on any skill.</EmptyState>;
  return (
    <ul className="grid gap-[var(--space-1)]" data-skill-list aria-label={`${c.name}: each skill seen`}>
      {c.skills.map((s) => (
        <li key={s.code} data-skill={s.code} data-state={scaleLook(colourState(s.colour))} className="flex flex-wrap items-center justify-between gap-[var(--space-2)] border-b border-[var(--line)] py-[var(--space-1)]">
          <span>{s.name}</span>
          <span className="flex items-center gap-[var(--space-2)]">
            <span className="b-caption">seen {s.seen}</span>
            <StatusChip state={colourState(s.colour)} words={s.words} compact />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Notes({ c }: { c: ChildPanel }) {
  const seen = c.history.filter((e) => e.kind !== "assessment");
  return (
    <div className="grid gap-[var(--space-2)]">
      <ul className="grid gap-1 text-[length:var(--text-label)]" data-notes-counts>
        <li>Notes confirmed · {c.summary.notes}</li>
        <li>Corrections · {c.summary.corrections}</li>
        <li>Newest entry · {c.summary.newest ? dateWords(c.summary.newest) : "none yet"}</li>
      </ul>
      {seen.length ? <Timeline entries={seen.map((e) => ({ kind: e.kind, title: e.title, line: e.line, when: e.when }))} /> : <EmptyState>Nothing seen yet for this child.</EmptyState>}
    </div>
  );
}

export function Papers({ c }: { c: ChildPanel }) {
  if (!c.sheets.length) return <EmptyState>No paper made for this child yet.</EmptyState>;
  return (
    <ul className="grid gap-[var(--space-1)]" data-papers aria-label="Papers">
      {c.sheets.map((s) => {
        const href = c.paperHref.get(s.id);
        const title = s.title ?? `Sheet ${s.qr_code}`;
        return (
          <li key={s.id} data-paper={s.id} className="grid border-b border-[var(--line)] py-[var(--space-1)]">
            {href ? <Link href={href} className="inline-flex min-h-[var(--tap)] items-center">{title}</Link> : <span>{title}</span>}
            <span className="b-caption">
              {s.date ? `${dateWords(s.date)} · ` : ""}
              {s.n_results === 0 ? "not read yet" : `${s.n_confirmed} of ${plural(s.n_results, "answer", "answers")} checked`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Report({ c }: { c: ChildPanel }) {
  const w = reportWords(c.report);
  return (
    <div className="grid gap-[var(--space-2)]" data-report={w.short}>
      <p>{w.words}</p>
      {c.report.note ? <p className="b-caption">Written {dateWords(c.report.note.written)}</p> : null}
      <Link href={`/children/reports?class=${encodeURIComponent(c.section)}`} className="inline-flex min-h-[var(--tap)] items-center" data-reports-link>
        Parent reports
      </Link>
    </div>
  );
}

/** The four tabs; a tab named in `more` shows that body instead (the full page's graph, timeline and answers). */
export function childTabs(c: ChildPanel, more: Partial<Record<ChildTab, ReactNode>> = {}): PanelTab[] {
  const body: Record<ChildTab, ReactNode> = { skills: <SkillList c={c} />, notes: <Notes c={c} />, papers: <Papers c={c} />, report: <Report c={c} /> };
  const label: Record<ChildTab, string> = { skills: "Skills", notes: "Notes", papers: "Papers", report: "Report" };
  return CHILD_TABS.map((key) => ({ key, label: label[key], body: more[key] ?? body[key] }));
}

/** The child as the panel opens them: their name, Sr. No. and class, the tabs, and the action on them. */
export function childOpened(c: ChildPanel, o: { tab?: string; closeHref?: string; full?: string; note: string; more?: Partial<Record<ChildTab, ReactNode>> }): Opened {
  return {
    key: `child:${c.roll}`,
    kind: "child",
    title: c.name || `Sr. No. ${c.roll}`,
    line: `Sr. No. ${c.roll} · ${c.section} · ${plural(c.skills.length, "skill", "skills")} seen`,
    full: o.full,
    closeHref: o.closeHref,
    actions: (
      <Link href={o.note} className="btn secondary" data-add-note>
        Add a note about this child
      </Link>
    ),
    tabs: childTabs(c, o.more),
    tab: o.tab,
  };
}
