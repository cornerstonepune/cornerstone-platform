import Link from "@/components/link";
import { Screen } from "@/components/app-frame";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { MachineMark } from "@/components/origin";
import { requireStaff } from "@/lib/auth";
import { toCheck, type Check } from "@/lib/curriculum-objectives";
import type { Column } from "@/lib/ux-rules";

// Check this week (CP-64, Nimish 16 Nov 2026: the coordinators check the machine-made rows weekly): by grade and subject, what the machine made
// and a person has not yet looked at, counted from the tables themselves. A group opens the objectives behind it. Confirming a batch (each
// confirmation an approval row, the rows' source machine to person) arrives with its engine route and approval kind; until then a group is
// looked at and edited where it stands.
export default async function CheckPage() {
  await requireStaff();
  const rows = await toCheck();
  const some = (f: (r: Check) => number) => rows.some((r) => f(r) > 0);
  const columns: Column<Check>[] = [
    { key: "grade", label: "Grade", width: "5rem", value: (r) => r.grade },
    { key: "subject", label: "Subject", value: (r) => r.subject },
    ...(some((r) => r.links) ? [{ key: "links", label: "Activity links", width: "8rem", num: true, value: (r: Check) => r.links }] : []),
    ...(some((r) => r.skills) ? [{ key: "skills", label: "Skill links", width: "7rem", num: true, value: (r: Check) => r.skills }] : []),
    ...(some((r) => r.statements) ? [{ key: "statements", label: "Framework and capability links", width: "11rem", num: true, value: (r: Check) => r.statements }] : []),
    { key: "total", label: "To check", width: "6rem", num: true, value: (r) => r.total },
    {
      key: "open",
      label: "Look at them",
      width: "9rem",
      value: () => "Objectives",
      cell: (r) => (
        <span className="inline-flex items-center gap-2">
          <MachineMark />
          <Link href={`/setup/curriculum/objectives?${new URLSearchParams({ grade: r.grade, ...(r.subjectCode ? { subject: r.subjectCode } : {}), origin: "machine" })}`} data-check-open={`${r.grade}~${r.subjectCode}`}>
            Objectives
          </Link>
        </span>
      ),
    },
  ];
  return (
    <Screen
      stage="Curriculum"
      title="Check this week"
      purpose="What the machine made and nobody has looked at yet, by grade and subject."
      action={<Link className="btn" href="/setup/curriculum/objectives?origin=machine">See every machine-made objective</Link>}
      next={{ href: "/setup/curriculum/objectives", label: "Objectives" }}
    >
      {rows.length ? (
        <DataTable label="To check" columns={columns} rows={rows} rowKey={(r) => `${r.grade}~${r.subjectCode}`} limit={rows.length} more={{ page: 1, href: () => "#" }} extras={{ attrs: (r) => ({ "data-check": `${r.grade}~${r.subjectCode}`, "data-to-check": String(r.total) }) }} />
      ) : (
        <EmptyState>
          <span data-nothing-to-check>Nothing the machine made is waiting for a look.</span>
        </EmptyState>
      )}
    </Screen>
  );
}
