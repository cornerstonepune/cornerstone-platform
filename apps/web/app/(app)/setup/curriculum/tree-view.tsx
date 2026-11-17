"use client";

import NextLink from "next/link";
import { useSearchParams } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { Icon, ICON_SIZE } from "@/lib/icons";
import type { GradeTree } from "@/lib/curriculum-cache";
import { treeAt, type Path } from "./tree-path";

const n = (x: number) => x.toLocaleString("en-IN");

function Counts({ objectives, activities }: { objectives: number; activities: number }) {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-[var(--space-2)]">
      <span className="b-count" data-count="objectives" data-n={objectives} title="Objectives">{n(objectives)} {objectives === 1 ? "objective" : "objectives"}</span>
      {activities ? <span className="b-count b-muted max-sm:hidden" data-count="activities" title="Activities">{n(activities)} {activities === 1 ? "activity" : "activities"}</span> : null}
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span aria-hidden className={`inline-flex shrink-0 transition-transform motion-reduce:transition-none ${open ? "" : "-rotate-90"}`}>
      <Icon name="chevron-down" size={ICON_SIZE.row} />
    </span>
  );
}

/** A step inside the tree: the address changes in place and the tree redraws from what it holds; no request goes to the server. A click with
 *  a modifier key, or one that opens a new tab, keeps its ordinary meaning. */
function Step({ href, children, ...rest }: { href: string; children: ReactNode; className?: string; "aria-expanded"?: boolean; role?: string; "aria-selected"?: boolean; "data-grade-tab"?: string }) {
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    window.history.pushState(null, "", href);
  };
  return (
    <a href={href} onClick={go} {...rest}>
      {children}
    </a>
  );
}

// The open path is the address, so a refresh or a shared link keeps it; one subject and one unit are open at a time. Choosing an objective
// opens the page's own panel (`open=objective:<code>`), a side panel on a wide screen and a sheet on a phone. That one goes to the server,
// which reads that objective only; its row asks for it in advance (`prefetch`) as soon as the row is on screen.
export function TreeView({ grades }: { grades: GradeTree[] }) {
  const q = useSearchParams();
  const path: Path = { grade: q.get("grade") ?? undefined, subject: q.get("subject") ?? undefined, unit: q.get("unit") ?? undefined, open: q.get("open") ?? undefined };
  const shown = grades;
  const current = shown.find((g) => g.code === path.grade) ?? shown[0];
  const grade = current.code;
  const subjects = current.subjects;
  const subject = subjects.find((s) => s.key === path.subject);
  const unit = subject?.units.find((u) => u.key === path.unit);
  const objectives = subject && unit ? current.leaves.filter((o) => o.subject === subject.key && o.unit === unit.key) : [];
  // what is open in the panel stays open while the tree is walked
  const at = (p: Path) => treeAt({ ...p, open: path.open });

  return (
    <div className="grid gap-[var(--space-3)]" data-curriculum-tree data-grade={grade}>
      <nav className="b-seg" role="tablist" aria-label="Grade">
        {shown.map((g) => (
          <Step key={g.code} role="tab" aria-selected={g.code === grade} href={at({ grade: g.code })} data-grade-tab={g.code}>
            {g.name}
          </Step>
        ))}
      </nav>
      {subjects.length ? (
        <ul aria-label="Subjects" className="divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--panel)]">
          {subjects.map((s) => {
            const on = s.key === subject?.key;
            return (
              <li key={s.key} data-subject-row={s.key} className={on ? "bg-[var(--surface)]" : undefined}>
                <Step
                  href={at({ grade, subject: on ? undefined : s.key })}
                  aria-expanded={on}
                  className="flex min-h-[var(--tap)] items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] font-semibold no-underline"
                >
                  <Chevron open={on} />
                  <span className="min-w-0 flex-1">{s.name}</span>
                  <Counts objectives={s.objectives} activities={s.activities} />
                </Step>
                {on ? (
                  <ul aria-label={`Units of ${s.name}`} className="divide-y divide-[var(--line)] border-t border-[var(--line)] pl-[var(--space-4)]">
                    {s.units.map((u) => {
                      const uon = u.key === unit?.key;
                      return (
                        <li key={u.key} data-unit-row={u.key}>
                          <Step
                            href={at({ grade, subject: s.key, unit: uon ? undefined : u.key })}
                            aria-expanded={uon}
                            className="flex min-h-[var(--tap)] items-center gap-[var(--space-2)] py-[var(--space-2)] pr-[var(--space-3)] pl-[var(--space-2)] no-underline"
                          >
                            <Chevron open={uon} />
                            <span className="min-w-0 flex-1">{u.name}</span>
                            <Counts objectives={u.objectives} activities={u.activities} />
                          </Step>
                          {uon ? (
                            <ul aria-label={`Objectives of ${u.name}`} className="grid gap-[var(--space-1)] pt-0 pr-[var(--space-3)] pb-[var(--space-2)] pl-[var(--space-5)]">
                              {objectives.map((o) => {
                                const key = `objective:${o.code}`;
                                return (
                                  <li key={o.code}>
                                    <NextLink
                                      prefetch
                                      scroll={false}
                                      href={treeAt({ grade, subject: s.key, unit: u.key, open: key })}
                                      aria-current={path.open === key || undefined}
                                      data-objective-leaf={o.code}
                                      className="flex min-h-[var(--tap)] items-center gap-[var(--space-2)] rounded-[var(--radius-control)] px-[var(--space-2)] py-[var(--space-1)] no-underline hover:bg-[var(--panel)] aria-[current]:bg-[var(--panel)] aria-[current]:font-semibold"
                                    >
                                      <span className="min-w-0 flex-1">{o.title}</span>
                                      {o.activities ? (
                                        <span className="b-muted b-num b-label inline-flex shrink-0 items-center gap-1" title="Activities">
                                          <Icon name="activity" size={ICON_SIZE.table} />
                                          {o.activities}
                                        </span>
                                      ) : null}
                                    </NextLink>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState>No objective in this grade yet.</EmptyState>
      )}
    </div>
  );
}
