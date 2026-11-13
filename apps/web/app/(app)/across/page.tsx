import Link from "@/components/link";
import { DataTable } from "@/components/data-table";
import { DetailPanel, parseOpen } from "@/components/detail-panel";
import { EmptyState } from "@/components/empty-state";
import { Screen } from "@/components/app-frame";
import { StatTiles, type Stat } from "@/components/stat-tile";
import { byClass, classKey, type ClassAcross } from "@/lib/across-classes";
import { requireStaff } from "@/lib/auth";
import { deadline } from "@/lib/deadline";
import { sql } from "@/lib/db";
import { classWords } from "@/lib/needs-you";
import { grades } from "@/lib/queries";
import { across } from "@/lib/queries-across";
import { classPanel, StageChips } from "./class-panel";

// Across every class (page charter Part C: "keep its job (Nimish locked it 22 Oct), reshape to Dashboard": stat tiles per class + one
// table). Its job is the scope Nimish locked on 2026-10-22: "each class and subject's stage, overdue checks, papers missing over 3 days,
// children struggling in two or more subjects". A tile per class (what waits on it), then one table, a class to a row; a class opens on
// the right (`?open=class:<id>&tab=…`) with the rows behind each number; with nothing chosen the right side is the school's four totals.
// Every member of staff opens it (goals/ux9c-one-role.yaml); every class is on it, whatever is chosen elsewhere.
export default async function AcrossPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireStaff();
  const { open, tab } = await searchParams;
  const [a, g, classes] = await deadline(Promise.all([across(me.email, me), grades(), sql<{ id: string; label: string }[]>`select distinct on (label) id::text, label from school_class order by label, created_at`]));
  const ids: Record<string, string> = Object.fromEntries(classes.map((c) => [c.label, c.id]));
  const rows = byClass(a);
  const name = (c: ClassAcross) => classWords(g, c.band, c.section);
  const key = (c: ClassAcross) => classKey(c.section, ids);
  const href = (c: ClassAcross, t?: string) => `/across?open=class:${key(c)}${t ? `&tab=${t}` : ""}`;
  const chosen = parseOpen(open);
  const row = chosen?.kind === "class" ? rows.find((c) => key(c) === chosen.id) : undefined;
  const panel = row
    ? classPanel(row, { key: `class:${key(row)}`, name: name(row), full: ids[row.section] ? `/children/${ids[row.section]}` : null, hours: a.hours, days: a.days, subjects: a.subjects, tab })
    : null;
  const tiles: Stat[] = rows.map((c) => ({ id: `class-${c.section}`, n: c.follow, line: `${name(c)}: to follow up`, tone: c.tone, href: href(c) }));
  const overduePapers = a.overdue.reduce((n, o) => n + o.papers, 0);
  const summary = {
    title: "Every class",
    stats: [
      { id: "overdue", n: overduePapers, line: `papers with answers waiting over ${a.hours} hours`, tone: overduePapers ? ("act" as const) : undefined },
      { id: "missing", n: a.missing.length, line: `papers not back over ${a.days} days`, tone: a.missing.length ? ("wait" as const) : undefined },
      { id: "struggling", n: a.struggling.length, line: "children needing help in two or more subjects", tone: a.struggling.length ? ("act" as const) : undefined },
    ],
    after: (
      <p className="b-label b-muted">
        Choose a class to see the rows behind its numbers.
        {a.subjects < 2 ? ` Only ${a.subjects === 1 ? "one subject has" : "no subject has"} children's results so far, so no child can need help in two.` : ""}
      </p>
    ),
  };
  return (
    <Screen
      stage="School · across every class"
      title="Across every class"
      purpose="Where each class's assessments stand: answers waiting too long, papers not back, children needing help in two subjects."
      action={
        <Link href="/children/assessments?status=check" className="btn">
          Check answers
        </Link>
      }
      next={{ href: "/children", label: "Children" }}
      panel={<DetailPanel open={panel} summary={summary} />}
    >
      {rows.length ? <div data-part="class-tiles"><StatTiles label="Each class" stats={tiles} /></div> : null}
      <section className="mt-[var(--space-4)] grid min-w-0 gap-[var(--space-2)]" aria-labelledby="classes-h">
        <h2 id="classes-h" className="text-[length:var(--text-title-small)] font-semibold">Each class</h2>
        {rows.length ? (
          <DataTable
            label="Each class"
            rows={rows}
            rowKey={(c) => c.section}
            more={{ page: 1, href: () => "/across" }}
            limit={Math.max(rows.length, 1)}
            extras={{ attrs: (c) => ({ "data-class": c.section, "data-open-key": `class:${key(c)}` }) }}
            columns={[
              {
                key: "class",
                label: "Class",
                keep: true,
                value: (c) => name(c),
                cell: (c) => (
                  <Link href={href(c)} scroll={false} data-class-open aria-expanded={row?.section === c.section} className={row?.section === c.section ? "font-semibold" : undefined}>
                    {name(c)}
                  </Link>
                ),
              },
              {
                key: "stage",
                label: "Stage",
                keep: true,
                value: (c) => c.stages.length,
                cell: (c) =>
                  c.stages.length ? (
                    <ul className="grid gap-1">
                      {c.stages.map((s) => (
                        <li key={s.subject} data-stage={s.subject}>
                          <span className="b-label">{s.subject}</span> <StageChips s={s} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="b-muted">No assessment yet</span>
                  ),
              },
              { key: "overdue", label: "Overdue checks", num: true, keep: true, width: "8rem", value: (c) => c.overdue?.papers ?? 0, cell: (c) => <Link href={href(c, "overdue")} data-cell="overdue">{c.overdue?.papers ?? 0}</Link> },
              { key: "missing", label: `Papers not back > ${a.days} days`, num: true, keep: true, width: "9rem", value: (c) => c.missing.length, cell: (c) => <Link href={href(c, "missing")} data-cell="missing">{c.missing.length}</Link> },
              { key: "help", label: "Needing help in ≥ 2 subjects", num: true, keep: true, width: "9rem", value: (c) => c.struggling.length, cell: (c) => <Link href={href(c, "help")} data-cell="help">{c.struggling.length}</Link> },
            ]}
          />
        ) : (
          <EmptyState>No class has an assessment, a paper out or a child&apos;s result yet.</EmptyState>
        )}
      </section>
    </Screen>
  );
}
