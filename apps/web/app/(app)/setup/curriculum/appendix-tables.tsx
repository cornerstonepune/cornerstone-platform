import Link from "@/components/link";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { MachineIf } from "@/components/origin";
import type { Origin } from "@/lib/origin";
import { objectives, options, PAGE, type ObjRow } from "@/lib/curriculum-objectives";
import type { Column } from "@/lib/ux-rules";

const HERE = "/setup/curriculum";

// The appendix's two lists the activity-and-skill table does not hold (CP-65): every objective, with the capability it counts toward and
// its words, ten a page; and every topic under its subject. Read-only; the flow is how they are chosen.
type Narrow = { grade?: string; subject?: string; topic?: string; origin?: Origin; q?: string };

export async function ObjectivesList({ page, narrow }: { page: number; narrow: Narrow }) {
  const { rows, total } = await objectives({ page, ...narrow });
  const columns: Column<ObjRow>[] = [
    { key: "grade", label: "Grade", width: "5rem", value: (r) => r.band },
    { key: "subject", label: "Subject", width: "8rem", value: (r) => r.subject },
    { key: "topic", label: "Topic", width: "10rem", value: (r) => r.topic },
    {
      key: "title",
      label: "Objective",
      width: "18rem",
      value: (r) => r.title,
      cell: (r) => (
        <span className="flex items-center gap-2">
          <Link href={`/setup/objectives/${encodeURIComponent(r.code)}`} data-objective-row>{r.title}</Link>
          <MachineIf origin={r.origins} />
        </span>
      ),
    },
    { key: "capability", label: "Capability", width: "11rem", value: (r) => r.capability },
    { key: "words", label: "Words", width: "11rem", value: (r) => r.words.join(", ") },
    { key: "activities", label: "Activities", width: "6rem", num: true, value: (r) => r.activities },
  ];
  const href = (n: number) => `${HERE}?${new URLSearchParams({ view: "appendix", part: "objectives", ...Object.fromEntries(Object.entries(narrow).filter(([, v]) => v)), ...(n > 1 ? { page: String(n) } : {}) })}`;
  return rows.length ? (
    <>
      <DataTable label="Objectives" columns={columns} rows={rows} rowKey={(r) => r.code} limit={PAGE} more={{ page, of: total, href }} extras={{ attrs: (r) => ({ "data-objective": r.code }) }} />
      <p className="b-muted b-num" data-total={total}>{total.toLocaleString("en-IN")}</p>
    </>
  ) : (
    <EmptyState>No objective matches.</EmptyState>
  );
}

export async function TopicsList() {
  const { topics, subjects } = await options();
  const name = new Map(subjects.map((s) => [s.code, s.name]));
  const columns: Column<(typeof topics)[number]>[] = [
    { key: "topic", label: "Topic", width: "16rem", value: (t) => t.name },
    { key: "subject", label: "Subject", width: "12rem", value: (t) => name.get(t.subject) ?? t.subject },
  ];
  return topics.length ? <DataTable label="Topics" columns={columns} rows={topics} rowKey={(t) => t.code} more={{ page: 1, href: () => `${HERE}?view=appendix&part=topics` }} /> : <EmptyState>No topic yet.</EmptyState>;
}
