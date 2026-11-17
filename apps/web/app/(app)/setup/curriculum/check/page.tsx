import Link from "@/components/link";
import { Screen } from "@/components/app-frame";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { MachineMark } from "@/components/origin";
import { requireStaff } from "@/lib/auth";
import { toCheck, type Check } from "@/lib/curriculum-objectives";
import { isCoordinator } from "@/lib/timetable-ui";
import { confirmBatch } from "./actions";
import type { Column } from "@/lib/ux-rules";

// Check this week (CP-64, Nimish 16 Nov 2026: the coordinators check the machine-made rows weekly): by grade and subject, what the machine made
// and a person has not yet looked at, counted from the tables themselves. A group opens the objectives behind it. One action per group, for a coordinator, confirms the batch: the rows' source goes
// machine to person and one approval row keeps the yes (the engine's `/curriculum/confirm`).
export default async function CheckPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaff();
  const q = await searchParams;
  const [rows, coordinator] = await Promise.all([toCheck(), isCoordinator()]);
  const some = (f: (r: Check) => number) => rows.some((r) => f(r) > 0);
  const columns: Column<Check>[] = [
    { key: "grade", label: "Grade", width: "5rem", value: (r) => r.grade },
    { key: "subject", label: "Subject", value: (r) => r.subject },
    ...(some((r) => r.links) ? [{ key: "links", label: "Activity links", width: "8rem", num: true, value: (r: Check) => r.links }] : []),
    ...(some((r) => r.skills) ? [{ key: "skills", label: "Skill links", width: "7rem", num: true, value: (r: Check) => r.skills }] : []),
    ...(some((r) => r.statements) ? [{ key: "statements", label: "Framework and capability links", width: "11rem", num: true, value: (r: Check) => r.statements }] : []),
    { key: "total", label: "To check", width: "6rem", num: true, value: (r) => r.total },
    ...(coordinator
      ? [
          {
            key: "confirm",
            label: "Confirm the batch",
            width: "10rem",
            value: () => "Confirm",
            cell: (r: Check) => (
              <form action={confirmBatch} aria-label={`Confirm ${r.grade} ${r.subject}`}>
                <input type="hidden" name="grade" value={r.grade} />
                <input type="hidden" name="subject" value={r.subjectCode} />
                <button className="btn secondary" data-confirm={`${r.grade}~${r.subjectCode}`}>Confirm {r.total}</button>
              </form>
            ),
          },
        ]
      : []),
    {
      key: "open",
      label: "Look at them",
      width: "9rem",
      value: () => "Objectives",
      cell: (r) => (
        <span className="inline-flex items-center gap-2">
          <MachineMark />
          <Link href={`/setup/curriculum?${new URLSearchParams({ view: "appendix", part: "objectives", grade: r.grade, ...(r.subjectCode ? { subject: r.subjectCode } : {}), origin: "machine" })}`} data-check-open={`${r.grade}~${r.subjectCode}`}>
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
      action={<Link className="btn" href="/setup/curriculum?view=appendix&part=objectives&origin=machine">See every machine-made objective</Link>}
      next={{ href: "/setup/curriculum", label: "Curriculum" }}
    >
      {q.error ? <p role="alert" className="tt-error">{q.error}</p> : null}
      {q.confirmed !== undefined ? (
        <p role="status" className="tt-note" data-confirmed={q.confirmed}>
          {q.confirmed === "0" ? "Nothing was left to confirm in that batch." : `Confirmed: ${q.confirmed} row${q.confirmed === "1" ? "" : "s"} are a person's now.`}
        </p>
      ) : null}
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
