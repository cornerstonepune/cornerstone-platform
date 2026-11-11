import Link from "@/components/link";
import { DataTable } from "@/components/data-table";
import { StatusChip, type State } from "@/components/status-chip";
import type { TopicGroup } from "@/lib/queries-by-topic";
import type { Column } from "@/lib/ux-rules";
import { assessmentHref } from "@/lib/assessment-ui";

export type TopicRow = { key: string; name: string; klass: string; back: string; state: State; words: string; next: string };

// The assessments by topic: every topic a row with its count, closed until it is opened; the open one holds its assessments, one page
// of them. A topic is opened by its address, so the view can be sent to a colleague, and no other topic's rows are read.
export function TopicView({
  groups, subjects, open, rows, of, page, topicPage, topicHref, assessmentsPageHref, topicsPageHref,
}: {
  groups: TopicGroup[];
  subjects: Map<string, string>;
  open?: string;
  rows: TopicRow[];
  of: number;
  page: number;
  topicPage: number;
  topicHref: (code: string, isOpen: boolean) => string;
  assessmentsPageHref: (n: number) => string;
  topicsPageHref: (n: number) => string;
}) {
  const columns: Column<TopicGroup>[] = [
    {
      key: "topic",
      label: "Topic",
      width: "40%",
      keep: true,
      value: (g) => g.name,
      cell: (g) => (
        <Link href={topicHref(g.code, g.code === open)} aria-expanded={g.code === open} data-topic-open="" className={`font-medium before:mr-1 before:inline-block before:w-3 ${g.code === open ? "before:content-['▾']" : "before:content-['▸']"}`}>
          {g.name}
        </Link>
      ),
    },
    { key: "subject", label: "Subject", width: "20%", value: (g) => (g.subject ? (subjects.get(g.subject) ?? g.subject) : null) },
    { key: "total", label: "Assessments", width: "18%", num: true, keep: true, value: (g) => g.total },
    { key: "needYou", label: "Waiting on you", width: "22%", num: true, value: (g) => g.needYou },
  ];
  const inside: Column<TopicRow>[] = [
    { key: "name", label: "Assessment", value: (r) => r.name, cell: (r) => <Link href={assessmentHref(r.key)} data-assessment-row="">{r.name}</Link> },
    { key: "class", label: "Class", width: "7rem", value: (r) => r.klass },
    { key: "waits", label: "Waits for", status: true, width: "13rem", value: (r) => r.words, cell: (r) => <StatusChip state={r.state} words={r.words} /> },
    { key: "next", label: "Next", status: true, width: "11rem", value: (r) => r.next, cell: (r) => <Link href={assessmentHref(r.key)} className="btn secondary" data-assessment-next="">{r.next}</Link> },
  ];
  return (
    <DataTable
      label="Assessments by topic"
      columns={columns}
      rows={groups}
      rowKey={(g) => g.code}
      more={{ page: topicPage, href: topicsPageHref }}
      extras={{
        attrs: (g) => ({ "data-topic": g.code, "data-open": String(g.code === open) }),
        expand: (g) =>
          g.code === open ? (
            <div data-topic-rows={g.code}>
              <DataTable label={`Assessments on ${g.name}`} columns={inside} rows={rows} rowKey={(r) => r.key} more={{ page, of, href: assessmentsPageHref }} extras={{ attrs: (r) => ({ "data-assessment": r.key }) }} />
              {rows.length === 0 ? <p className="note mt-2">Nothing in {g.name} matches these filters.</p> : null}
            </div>
          ) : null,
      }}
    />
  );
}
