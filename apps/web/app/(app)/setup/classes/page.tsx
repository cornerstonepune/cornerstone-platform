import { Screen } from "@/components/app-frame";
import { DataTable } from "@/components/data-table";
import { DetailPanel, parseOpen } from "@/components/detail-panel";
import { FilterBar } from "@/components/filter-bar";
import Link from "@/components/link";
import { NotYours } from "@/components/not-yours";
import { Notice } from "@/components/parts";
import { requireStaff } from "@/lib/auth";
import { screenHref } from "@/lib/built";
import { refusedWords } from "@/lib/move-child";
import { type ClassLine, classChildren, classLines, moveLog, moveTargets, namesMayShow } from "@/lib/queries-coordinator";
import { schoolToday } from "@/lib/school-clock";
import type { Column } from "@/lib/ux-rules";
import { classOpened } from "./class-panel";

const HERE = "/setup/classes";
type Props = { searchParams: Promise<Record<string, string | undefined>> };

// Classes and children (docs/frontend/screens.json `classes`, UI-5; page charter Part C "Staff · Classes: keep, Workspace"). On the left
// each class of this year with its grade, its children and its educators, read whole (docs/ux-rules.md rule 3): a cap here once drew a
// "Later →" that led back to the same first page. A class opens on the right (`?open=class:<id>`; the old `?class=<id>` still opens it)
// with its Children by Sr. No., the name beside each read from pii by child_id, and its Moves; Move is the coordinator's own action on a
// child. Nothing is ever deleted.
export default async function ClassesPage({ searchParams }: Props) {
  const me = await requireStaff();
  if (!(await namesMayShow())) return <NotYours what="Classes and children" />;
  const q = await searchParams;
  const [all, targets] = await Promise.all([classLines(), moveTargets()]);
  const text = q.q?.trim().toLowerCase();
  const shown = all.filter((c) => (!q.grade || c.gradeCode === q.grade) && (!text || `${c.label} ${c.educators.join(" ")}`.toLowerCase().includes(text)));
  const want = parseOpen(q.open) ?? (q.class ? { kind: "class", id: q.class } : null);
  const open = want?.kind === "class" ? all.find((c) => c.id === want.id) : undefined;
  const [children, log] = open ? await Promise.all([classChildren(open.id, me.email), moveLog(open.label)]) : [[], []];
  const grades = [...new Map(all.map((c) => [c.gradeCode, c.grade])).entries()];
  const here = (over: { open?: string } = {}) => {
    const u = new URLSearchParams(Object.entries({ grade: q.grade, q: q.q, ...over }).filter((e): e is [string, string] => !!e[1]));
    return u.size ? `${HERE}?${u}` : HERE;
  };
  const today = await schoolToday();
  const columns: Column<ClassLine>[] = [
    {
      key: "class",
      label: "Class",
      width: "9rem",
      keep: true,
      value: (c) => c.label,
      cell: (c) => (
        <Link href={here({ open: `class:${c.id}` })} scroll={false} data-class-row data-open-key={`class:${c.id}`} aria-current={open?.id === c.id ? "true" : undefined}>
          {c.label}
        </Link>
      ),
    },
    { key: "grade", label: "Grade", width: "9rem", keep: true, value: (c) => c.grade },
    { key: "children", label: "Children", width: "7rem", num: true, keep: true, value: (c) => c.children },
    { key: "educators", label: "Educators", keep: true, value: (c) => c.educators.join(", ") },
  ];
  const total = all.reduce((n, c) => n + c.children, 0);
  const stats = [
    { id: "classes", n: all.length, line: all.length === 1 ? "class this year" : "classes this year" },
    { id: "children", n: total, line: "children in them" },
    { id: "grades", n: grades.length, line: grades.length === 1 ? "grade" : "grades" },
  ];
  return (
    <Screen
      stage={`The school · ${total} children`}
      title="Classes and children"
      purpose="Each class, its grade, its children by Sr. No., and who teaches it. Move a child to another class; every change is kept with who made it."
      action={<p className="m-0 text-[length:var(--text-label)]">Move a child: open the class, then press Move on the child&rsquo;s row.</p>}
      panel={
        <DetailPanel
          open={
            open
              ? classOpened(open, { children, log, targets, today, back: here({ open: `class:${open.id}` }), picture: screenHref("picture", { class: open.id }), tab: q.tab, closeHref: here() })
              : null
          }
          summary={{ title: "The school's classes", stats }}
        />
      }
    >
      {q.moved ? <Notice tone="neem">The child is moved. Their answers and results stay with them; the change is kept in the change log.</Notice> : null}
      {q.refused ? <Notice tone="terracotta">{refusedWords(q.refused, { section: q.section ?? "", roll: q.roll ?? "" })}</Notice> : null}
      <FilterBar
        action={HERE}
        filters={[{ name: "grade", label: "Grade", value: q.grade, all: "Every grade", options: grades }]}
        search={{ name: "q", value: q.q, placeholder: "Find a class or an educator" }}
        keep={{ open: q.open }}
      />
      {shown.length ? (
        <DataTable label="Classes" columns={columns} rows={shown} rowKey={(c) => c.id} limit={Math.max(1, shown.length)} more={{ page: 1, href: () => HERE }} />
      ) : (
        <p className="text-[length:var(--text-label)] text-[var(--ink-muted)] mt-2">No class matches these filters.</p>
      )}
    </Screen>
  );
}
