import { KanbanBoard, ViewToggle, type Lane } from "@/components/kanban-board";
import { PERIODS, type Period } from "@/lib/my-day";
import type { WorkFilters } from "@/lib/today-waiting";
import { todayAt, WorkFilterBar } from "./waiting-work";

// My day, part two (CP-69): what waits on the person as a board. The lanes are urgency (Do now, This week, When ready) and Done; the time
// filter narrows Done only, because work that waits is as of now. Its words say so once, quietly.
type Q = Record<string, string | undefined>;

export function MyBoard({ lanes, q, day, period, f, classes, subjects }: { lanes: readonly Lane[]; q: Q; day: string; period: Period; f: WorkFilters; classes: readonly string[]; subjects: readonly { code: string; label: string }[] }) {
  return (
    <section className="grid min-w-0 gap-[var(--space-3)]" data-my-tasks data-day={day} aria-label="My tasks">
      <div className="flex flex-wrap items-center justify-between gap-[var(--space-2)]">
        <h2 className="text-[length:var(--text-body)] font-semibold">My tasks</h2>
        <div data-time-filter>
          <ViewToggle current={period} views={PERIODS.map((p) => ({ key: p.key, label: p.label, icon: "period" as const, href: todayAt(q, { period: p.key }) }))} />
        </div>
      </div>
      <WorkFilterBar q={q} f={f} classes={classes} subjects={subjects} />
      <p className="b-muted">The time choice narrows Done only. What waits is always as of now.</p>
      <KanbanBoard lanes={lanes} />
    </section>
  );
}
