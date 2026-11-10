import { Screen, Rail } from "@/components/app-frame";
import { DataTable } from "@/components/data-table";
import { Details } from "@/components/details";
import { FilterBar } from "@/components/filter-bar";
import Link from "@/components/link";
import { NotYours } from "@/components/not-yours";
import { requireStaff } from "@/lib/auth";
import { screenHref } from "@/lib/built";
import { grantsOf, namesMayShow, staffLines, type StaffLine } from "@/lib/queries-coordinator";
import type { Column } from "@/lib/ux-rules";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

// Staff and classes (docs/frontend/screens.json `staff`, UI-5). Who holds which role for which class, and three numbers per
// person that the database can stand behind. The rows are in the role's own order then name and cannot be sorted by the
// numbers (no sort link, no rank, no ordinal, no colour on a number): the school decides what they mean. A person's grants
// open below the table (?person=<id>); a grant is read here, never edited. Names are `pii`: only the 'everything' group sees them.
export default async function StaffPage({ searchParams }: Props) {
  const me = await requireStaff();
  if (!(await namesMayShow())) return <NotYours what="Staff" />;
  const q = await searchParams;
  const { lines: all, answered } = await staffLines(me.email);
  const text = q.q?.trim().toLowerCase();
  const shown = all.filter((p) => (!q.role || p.roleLabel === q.role) && (!text || `${p.name} ${p.email}`.toLowerCase().includes(text)));
  const open = shown.find((p) => p.id === q.person) ?? shown[0];
  const grants = open ? await grantsOf(open.id) : [];
  const roles = [...new Set(all.map((p) => p.roleLabel))];
  const columns: Column<StaffLine>[] = [
    { key: "name", label: "Name", width: "14rem", keep: true, value: (p) => p.name, cell: (p) => <Link href={`/setup/staff?person=${p.id}#grants`} data-staff-row aria-current={open?.id === p.id ? "true" : undefined}>{p.name}</Link> },
    { key: "role", label: "Role", width: "12rem", keep: true, value: (p) => p.roleLabel },
    { key: "class", label: "Class", keep: true, value: (p) => (p.classes ? p.classes.join(", ") : "Every class") },
    { key: "sessions", label: "Sessions done of planned", width: "11rem", num: true, value: (p) => (p.planned ? `${p.done} of ${p.planned}` : null) },
    { key: "confirmed", label: "Notes confirmed", width: "8rem", num: true, value: (p) => p.notesConfirmed },
    { key: "late", label: "Notes late", width: "7rem", num: true, value: (p) => p.notesLate },
    { key: "lines", label: "Lines accepted / changed / removed", width: "12rem", num: true, value: (p) => (p.lines ? `${p.lines.accepted} / ${p.lines.changed} / ${p.lines.removed}` : null) },
  ];
  return (
    <Screen
      stage="This fortnight"
      title="Staff and classes"
      purpose="Who teaches which class, and whole counts the database can stand behind. No score, no ranking: the school decides what they mean."
      action={<p className="m-0 text-[14px]">Open a person to see what they hold.</p>}
      next={{ href: screenHref("classes") ?? "/school", label: "Classes and children" }}
      rail={<Rail edges={[{ screen: "fortnight", label: "Fortnight", icon: "week" }, { screen: "timetable", label: "Timetable", icon: "week" }, { screen: "classes", label: "Classes and children", icon: "class" }]} />}
    >
      {answered ? null : <p className="note mb-2">The note counts are not available right now.</p>}
      <FilterBar
        action="/setup/staff"
        filters={[{ name: "role", label: "Role", value: q.role, all: "Every role", options: roles.map((r) => [r, r] as const) }]}
        search={{ name: "q", value: q.q, placeholder: "Find a person" }}
      />
      <DataTable label="Staff" columns={columns} rows={shown} rowKey={(p) => p.id} more={{ by: (p) => p.roleLabel.replace(/ \(.*\)$/, "") }} />
      {open ? (
        <div className="mt-6" id="grants">
          <Details summary={`${open.name}'s grants`} name="grants" open={Boolean(q.person)}>
            <ul className="grid gap-2">
              {grants.map((g) => (
                <li key={g.id}>
                  {g.roleLabel} · {g.className ?? "every class"} · {g.subject ?? "every subject"} · from {g.from} to {g.to ?? "open"} · granted by {g.by}
                  {g.open ? null : " · Ended"}
                </li>
              ))}
            </ul>
          </Details>
        </div>
      ) : (
        <p className="note mt-2">Nobody matches these filters.</p>
      )}
    </Screen>
  );
}
