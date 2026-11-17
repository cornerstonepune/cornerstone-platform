import Link from "@/components/link";
import { EmptyState } from "@/components/empty-state";
import { Icon, ICON_SIZE } from "@/lib/icons";
import { branches, gradesWithObjectives, leaves } from "@/lib/curriculum-tree";

const HERE = "/setup/curriculum";
export type Path = { grade?: string; subject?: string; unit?: string; open?: string };

/** The address of a path through the tree: grade, subject, unit and the objective open in the panel; nothing chosen is nothing written. */
export const treeAt = (p: Path) => {
  const s = new URLSearchParams(Object.entries(p).flatMap(([k, v]) => (v ? [[k, v]] : [])));
  return s.size ? `${HERE}?${s}` : HERE;
};

const n = (x: number) => x.toLocaleString("en-IN");

function Counts({ objectives, activities }: { objectives: number; activities: number }) {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-[var(--space-2)]">
      <span className="b-count" data-count="objectives" data-n={objectives} title="Objectives">{n(objectives)} {objectives === 1 ? "objective" : "objectives"}</span>
      <span className="b-count b-muted max-sm:hidden" data-count="activities" title="Activities">{n(activities)} {activities === 1 ? "activity" : "activities"}</span>
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span aria-hidden className={`inline-flex shrink-0 transition-transform duration-150 ease-out motion-reduce:transition-none ${open ? "" : "-rotate-90"}`}>
      <Icon name="chevron-down" size={ICON_SIZE.row} />
    </span>
  );
}

// Curriculum as one tree (CP-67, issue #827; Nimish 17 Nov 2026: "It can simply be thought of as an expand-collapse"): the grades as a
// segmented control, then the grade's subjects, each opening to its units, each opening to its objectives. The open path is the address,
// so a refresh or a shared link keeps it; one subject and one unit are open at a time. Choosing an objective opens the page's own panel
// (`open=objective:<code>`), a side panel on a wide screen and a sheet on a phone.
export async function Tree({ path, grades }: { path: Path; grades: { code: string; name: string }[] }) {
  const have = new Set(await gradesWithObjectives());
  const shown = grades.filter((g) => have.has(g.code));
  const grade = shown.find((g) => g.code === path.grade)?.code ?? shown[0]?.code;
  if (!grade) return <EmptyState>No objective yet.</EmptyState>;
  const subjects = await branches(grade);
  const subject = subjects.find((s) => s.key === path.subject);
  const unit = subject?.units.find((u) => u.key === path.unit);
  const objectives = subject && unit ? await leaves(grade, subject.key, unit.key) : [];

  return (
    <div className="grid gap-[var(--space-3)]" data-curriculum-tree data-grade={grade}>
      <nav className="b-seg" role="tablist" aria-label="Grade">
        {shown.map((g) => (
          <Link key={g.code} role="tab" aria-selected={g.code === grade} href={treeAt({ grade: g.code })} scroll={false} data-grade-tab={g.code}>
            {g.name}
          </Link>
        ))}
      </nav>
      {subjects.length ? (
        <ul aria-label="Subjects" className="divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--panel)]">
          {subjects.map((s) => {
            const on = s.key === subject?.key;
            return (
              <li key={s.key} data-subject-row={s.key}>
                <Link
                  href={treeAt({ grade, subject: on ? undefined : s.key })}
                  scroll={false}
                  aria-expanded={on}
                  className="flex min-h-[var(--tap)] items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] font-semibold no-underline"
                >
                  <Chevron open={on} />
                  <span className="min-w-0 flex-1">{s.name}</span>
                  <Counts objectives={s.objectives} activities={s.activities} />
                </Link>
                {on ? (
                  <ul aria-label={`Units of ${s.name}`} className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
                    {s.units.map((u) => {
                      const uon = u.key === unit?.key;
                      return (
                        <li key={u.key} data-unit-row={u.key}>
                          <Link
                            href={treeAt({ grade, subject: s.key, unit: uon ? undefined : u.key })}
                            scroll={false}
                            aria-expanded={uon}
                            className="flex min-h-[var(--tap)] items-center gap-[var(--space-2)] py-[var(--space-2)] pr-[var(--space-3)] pl-[var(--space-4)] no-underline"
                          >
                            <Chevron open={uon} />
                            <span className="min-w-0 flex-1">{u.name}</span>
                            <Counts objectives={u.objectives} activities={u.activities} />
                          </Link>
                          {uon ? (
                            <ul aria-label={`Objectives of ${u.name}`} className="grid gap-[var(--space-1)] pt-0 pr-[var(--space-3)] pb-[var(--space-2)] pl-[var(--space-5)]">
                              {objectives.map((o) => {
                                const key = `objective:${o.code}`;
                                return (
                                  <li key={o.code}>
                                    <Link
                                      href={treeAt({ grade, subject: s.key, unit: u.key, open: key })}
                                      scroll={false}
                                      aria-current={path.open === key || undefined}
                                      data-objective-leaf={o.code}
                                      className="flex min-h-[var(--tap)] items-center gap-[var(--space-2)] rounded-[var(--radius-control)] px-[var(--space-2)] py-[var(--space-1)] no-underline hover:bg-[var(--surface)] aria-[current]:bg-[var(--surface)] aria-[current]:font-semibold"
                                    >
                                      <span className="min-w-0 flex-1">{o.title}</span>
                                      <span className="b-muted b-num b-label inline-flex shrink-0 items-center gap-1" title="Activities">
                                        <Icon name="activity" size={ICON_SIZE.table} />
                                        {o.activities}
                                      </span>
                                    </Link>
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
