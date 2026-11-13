import { DataTable } from "@/components/data-table";
import type { Opened } from "@/components/detail-panel";
import { EmptyState } from "@/components/empty-state";
import Link from "@/components/link";
import type { ChildLine, ClassLine, LogLine } from "@/lib/queries-coordinator";
import { shortDate } from "@/lib/queries-coordinator";
import type { Column } from "@/lib/ux-rules";
import { MoveButton } from "./move-button";

// One class in the detail panel of Classes (page charter Part C, "Staff · Classes: keep, Workspace"): tabs Children (by Sr. No., the name
// beside each read from pii by child_id, those who moved in this year first; Move is the coordinator's own action on a child) · Moves (the
// change log: who moved in or out, by whom, when). Nothing is ever deleted. A class's children are read whole (docs/ux-rules.md rule 3).
const WHOLE_CLASS = 200;
const MOVED_IN = "Moved in this year";
const HERE_SINCE = "Here since the year began";
const movedFirst = (rows: readonly ChildLine[]) => [...rows].sort((a, b) => Number(Boolean(b.movedFrom)) - Number(Boolean(a.movedFrom)));

export function classOpened(
  c: ClassLine,
  o: { children: readonly ChildLine[]; log: readonly LogLine[]; targets: readonly { label: string; grade: string }[]; today: string; back: string; picture: string | null; tab?: string; closeHref: string },
): Opened {
  const kid: Column<ChildLine>[] = [
    { key: "roll", label: "Sr. No. and name", keep: true, value: (k) => `${k.roll} ${k.name}`, cell: (k) => <><strong>{k.roll}</strong> {k.name}</> },
    { key: "since", label: "Since", width: "7rem", keep: true, value: (k) => k.since },
    { key: "from", label: "Moved from", width: "7rem", value: (k) => k.movedFrom },
    {
      key: "move",
      label: "Move",
      width: "6rem",
      keep: true,
      value: () => "Move",
      cell: (k) => <MoveButton childId={k.id} name={`${k.roll} ${k.name}`} roll={k.roll} targets={o.targets.filter((t) => t.label !== c.label)} today={o.today} back={o.back} />,
    },
  ];
  const children = o.children.length ? (
    <DataTable label={`${c.label} children`} columns={kid} rows={movedFirst(o.children)} rowKey={(k) => k.id} limit={WHOLE_CLASS} counted more={{ by: (k) => (k.movedFrom ? MOVED_IN : HERE_SINCE) }} />
  ) : (
    <EmptyState>No child is in {c.label} yet.</EmptyState>
  );
  const moves = o.log.length ? (
    <ul className="grid gap-[var(--space-1)] text-[14px]" data-moves aria-label={`${c.label}: moves`}>
      {o.log.map((l) => (
        <li key={l.id}>
          Sr. No. {l.roll} moved from {l.from} to {l.to}. By {l.by || "the school"} · {shortDate(l.at)}.
        </li>
      ))}
    </ul>
  ) : (
    <p className="b-caption">No child has moved in or out of {c.label} yet.</p>
  );
  return {
    key: `class:${c.id}`,
    kind: "child",
    icon: "class",
    title: c.label,
    line: `${c.grade} · ${c.children} ${c.children === 1 ? "child" : "children"} · ${c.educators.join(", ") || "no educator yet"}`,
    closeHref: o.closeHref,
    actions: o.picture ? (
      <Link href={o.picture} className="btn secondary" data-class-picture>
        Class picture
      </Link>
    ) : undefined,
    tabs: [
      { key: "children", label: "Children", body: children },
      { key: "moves", label: "Moves", body: moves },
    ],
    tab: o.tab,
  };
}
