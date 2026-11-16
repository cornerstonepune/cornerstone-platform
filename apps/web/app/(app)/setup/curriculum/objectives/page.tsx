import Link from "@/components/link";
import { Screen } from "@/components/app-frame";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { MachineMark, originFilter } from "@/components/origin";
import { requireStaff } from "@/lib/auth";
import { objectives, options, PAGE, type ObjRow } from "@/lib/curriculum-objectives";
import { ORIGIN_WORDS, pickOrigin } from "@/lib/origin";
import type { Column } from "@/lib/ux-rules";

type Q = Record<string, string | undefined>;
const HERE = "/setup/curriculum/objectives";

// Objectives (CP-64, Nimish 16 Nov 2026): the curriculum as the chain it is, Grade, Subject, Topic, Objective, in one table, with the capability
// each objective counts toward, that capability's words, how many activities build toward it, and where its links came from; the machine's carry
// the machine mark. Narrow it by grade, subject, topic, origin or a word of the title; ten rows a page. One read for the page.
export default async function ObjectivesPage({ searchParams }: { searchParams: Promise<Q> }) {
  await requireStaff();
  const q = await searchParams;
  const opt = await options();
  const grade = opt.grades.includes(q.grade ?? "") ? q.grade : undefined;
  const subject = opt.subjects.some((s) => s.code === q.subject) ? q.subject : undefined;
  const topic = opt.topics.some((t) => t.code === q.topic && (!subject || t.subject === subject)) ? q.topic : undefined;
  const origin = pickOrigin(q.origin);
  const page = Math.max(1, Number(q.page) || 1);
  const { rows, total } = await objectives({ grade, subject, topic, origin, q: q.q, page });
  const href = (n: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ grade, subject, topic, origin, q: q.q, page: String(n) })) if (v) p.set(k, v);
    return `${HERE}?${p}`;
  };
  const columns: Column<ObjRow>[] = [
    { key: "grade", label: "Grade", width: "4.5rem", value: (r) => r.band },
    { key: "subject", label: "Subject", width: "8rem", value: (r) => r.subject },
    { key: "topic", label: "Topic", width: "11rem", value: (r) => r.topic },
    { key: "title", label: "Objective", value: (r) => r.title, cell: (r) => <Link href={`/setup/objectives/${encodeURIComponent(r.code)}`} data-objective-row>{r.title}</Link> },
    { key: "capability", label: "Capability", width: "11rem", value: (r) => r.capability },
    { key: "words", label: "Words", width: "9rem", value: (r) => r.words.join(", ") },
    { key: "activities", label: "Activities", width: "5.5rem", num: true, value: (r) => r.activities },
    {
      key: "origin",
      label: "Origin",
      width: "9rem",
      value: (r) => r.origins.map((o) => ORIGIN_WORDS[o]).join(", "),
      cell: (r) => (
        <span className="inline-flex items-center gap-2">
          {r.origins.includes("machine") ? <MachineMark /> : null}
          {r.origins.includes("machine") ? "Machine-made, to check" : r.origins.map((o) => ORIGIN_WORDS[o]).join(", ")}
        </span>
      ),
    },
  ].filter((c) => rows.length === 0 || rows.some((r) => String(c.value(r)) !== "" && c.value(r) !== 0) || c.key === "title") as Column<ObjRow>[];
  return (
    <Screen
      stage="Curriculum"
      title="Objectives"
      purpose="Every learning objective by grade, subject and topic, with its capability, its words and where its links came from."
      action={<Link className="btn" href="/setup/curriculum/check" data-check-link>Check this week</Link>}
      next={{ href: "/setup/curriculum", label: "Curriculum" }}
    >
      <FilterBar
        action={HERE}
        search={{ name: "q", value: q.q, placeholder: "Search objectives" }}
        filters={[
          { name: "grade", label: "Grade", value: grade, all: "Every grade", options: opt.grades.map((g) => [g, g] as const) },
          { name: "subject", label: "Subject", value: subject, all: "Every subject", options: opt.subjects.map((s) => [s.code, s.name] as const) },
          { name: "topic", label: "Topic", value: topic, all: "Every topic", options: opt.topics.filter((t) => !subject || t.subject === subject).map((t) => [t.code, t.name] as const) },
          originFilter(origin),
        ]}
      />
      {rows.length ? (
        <DataTable label="Objectives" columns={columns} rows={rows} rowKey={(r) => r.code} limit={PAGE} more={{ page, of: total, href }} extras={{ attrs: (r) => ({ "data-objective": r.code }) }} />
      ) : (
        <EmptyState>No objective matches these filters.</EmptyState>
      )}
      <p className="b-caption" data-total={total}>{total} objective{total === 1 ? "" : "s"}</p>
    </Screen>
  );
}
