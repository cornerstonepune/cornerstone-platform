import { Screen, Rail } from "@/components/app-frame";
import { DataTable } from "@/components/data-table";
import { Details } from "@/components/details";
import { FilterBar } from "@/components/filter-bar";
import Link from "@/components/link";
import { NotYours } from "@/components/not-yours";
import { Notice } from "@/components/parts";
import { requireStaff } from "@/lib/auth";
import { screenHref } from "@/lib/built";
import { refusedWords } from "@/lib/move-child";
import { type ChildLine, type ClassLine, classChildren, classLines, moveLog, moveTargets, namesMayShow } from "@/lib/queries-coordinator";
import { schoolToday } from "@/lib/school-clock";
import type { Column } from "@/lib/ux-rules";
import { MoveButton } from "./move-button";

// A class is read whole, like the class grid (docs/ux-rules.md rule 3): the coordinator finds the child to move by Sr. No. without paging.
const CLASS_ROWS = 40;

type Props = { searchParams: Promise<Record<string, string | undefined>> };

// Classes and children (docs/frontend/screens.json `classes`, UI-5). Each class of this year with its grade, its children and
// its educators; one class open below (?class=<id>) with its children by Sr. No. and the name beside each, read from pii by
// child_id; Move is the coordinator's own action on its own child. The change log is a fold. Nothing is ever deleted.
export default async function ClassesPage({ searchParams }: Props) {
  const me = await requireStaff();
  if (!(await namesMayShow())) return <NotYours what="Classes and children" />;
  const q = await searchParams;
  const [all, targets] = await Promise.all([classLines(), moveTargets()]);
  const text = q.q?.trim().toLowerCase();
  const shown = all.filter((c) => (!q.grade || c.gradeCode === q.grade) && (!text || `${c.label} ${c.educators.join(" ")}`.toLowerCase().includes(text)));
  const open = shown.find((c) => c.id === q.class) ?? shown[0];
  const [children, log] = open ? await Promise.all([classChildren(open.id, me.email), moveLog(open.label)]) : [[], []];
  const grades = [...new Map(all.map((c) => [c.gradeCode, c.grade])).entries()];
  const here = `/setup/classes${open ? `?class=${open.id}` : ""}`;
  const today = await schoolToday();
  const columns: Column<ClassLine>[] = [
    { key: "class", label: "Class", width: "9rem", keep: true, value: (c) => c.label, cell: (c) => <Link href={`/setup/classes?class=${c.id}`} data-class-row aria-current={open?.id === c.id ? "true" : undefined}>{c.label}</Link> },
    { key: "grade", label: "Grade", width: "9rem", keep: true, value: (c) => c.grade },
    { key: "children", label: "Children", width: "7rem", num: true, keep: true, value: (c) => c.children },
    { key: "educators", label: "Educators", keep: true, value: (c) => c.educators.join(", ") },
  ];
  const kid: Column<ChildLine>[] = [
    { key: "roll", label: "Sr. No. and name", keep: true, value: (c) => `${c.roll} ${c.name}`, cell: (c) => <><strong>{c.roll}</strong> {c.name}</> },
    { key: "since", label: "Since", width: "9rem", keep: true, value: (c) => c.since },
    { key: "from", label: "Moved from", width: "9rem", value: (c) => c.movedFrom },
    {
      key: "move",
      label: "Move",
      width: "8rem",
      keep: true,
      value: () => "Move",
      cell: (c) => <MoveButton childId={c.id} name={`${c.roll} ${c.name}`} roll={c.roll} targets={targets.filter((t) => t.label !== open?.label)} today={today} back={here} />,
    },
  ];
  return (
    <Screen
      stage={`The school · ${all.reduce((n, c) => n + c.children, 0)} children`}
      title="Classes and children"
      purpose="Each class, its grade, its children by Sr. No., and who teaches it. Move a child to another class; every change is kept with who made it."
      action={<p className="m-0 text-[14px]">Move a child: press Move on the child&rsquo;s row below.</p>}
      next={{ href: screenHref("staff") ?? "/staff", label: "Staff" }}
      rail={<Rail edges={[{ screen: "staff", label: "Staff", icon: "coordinator" }, { screen: "picture", params: open ? { class: open.id } : {}, label: "Class picture", icon: "class" }, { screen: "fortnight", label: "The fortnight", icon: "week" }]} />}
    >
      {q.moved ? <Notice tone="neem">The child is moved. Their answers and results stay with them; the change is kept in the change log.</Notice> : null}
      {q.refused ? <Notice tone="terracotta">{refusedWords(q.refused, { section: q.section ?? "", roll: q.roll ?? "" })}</Notice> : null}
      <FilterBar
        action="/setup/classes"
        filters={[{ name: "grade", label: "Grade", value: q.grade, all: "Every grade", options: grades }]}
        search={{ name: "q", value: q.q, placeholder: "Find a class or an educator" }}
      />
      <DataTable label="Classes" columns={columns} rows={shown} rowKey={(c) => c.id} more={{ page: 1, href: () => "/setup/classes" }} />
      {open ? (
        <section aria-label={`${open.label}: its children`} className="mt-6">
          <h2 className="mb-2 text-[16px]">
            {open.label}: {open.children} children
          </h2>
          <DataTable label={`${open.label} children`} columns={kid} rows={children} rowKey={(c) => c.id} limit={CLASS_ROWS} more={{ page: Number(q.page) || 1, href: (n: number) => `/setup/classes?class=${open.id}&page=${n}` }} />
        </section>
      ) : (
        <p className="note mt-2">No class matches these filters.</p>
      )}
      {open ? (
        <div className="mt-6">
          <Details summary="Change log" name="change-log">
            {log.length ? (
              <ul className="grid gap-1">
                {log.map((l) => (
                  <li key={l.id}>
                    Sr. No. {l.roll} moved from {l.from} to {l.to}. By {l.by || "the school"} on {l.at}.
                  </li>
                ))}
              </ul>
            ) : (
              <p className="note">No child has moved in or out of {open.label} yet.</p>
            )}
          </Details>
        </div>
      ) : null}
    </Screen>
  );
}
