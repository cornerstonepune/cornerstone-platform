import Link from "@/components/link";
import { DataTable } from "@/components/data-table";
import { StatusChip } from "@/components/status-chip";
import { WHY_WORDS, type LessonToConfirm } from "@/lib/lessons-to-confirm";
import type { Column } from "@/lib/ux-rules";
import { dateWords } from "@/lib/week";

// CP-51: the lessons whose activity a person still has to settle (lib/lessons-to-confirm.ts), the machine's matches first. Each opens its
// lesson, where "Choose an activity" offers that lesson's activities; choosing one, the machine's included, makes it the person's.
export function LessonsToConfirm({ rows, page, href }: { rows: LessonToConfirm[]; page: number; href: (p: number) => string }) {
  if (!rows.length) return <p className="note" data-no-lessons>Every lesson has an activity a person chose or the school&rsquo;s planner named.</p>;
  const columns: Column<LessonToConfirm>[] = [
    { key: "day", label: "Day", value: (r) => r.day, cell: (r) => dateWords(r.day), width: "8rem" },
    { key: "section", label: "Class", value: (r) => r.section, width: "6rem" },
    { key: "subject", label: "Subject", value: (r) => r.subject, width: "8rem" },
    { key: "text", label: "The planner says", value: (r) => r.text, cell: (r) => <Link href={`/period/${r.id}`} data-lesson-link>{r.text || "Nothing written"}</Link> },
    ...(rows.some((r) => r.activity) ? [{ key: "activity", label: "Machine's match", value: (r: LessonToConfirm) => r.activity ?? "", width: "12rem" }] : []),
    {
      key: "why",
      label: "Status",
      value: (r) => r.why,
      cell: (r) => <StatusChip state={r.why === "machine" ? "toApprove" : r.why === "routine" ? "done" : "toDo"} words={WHY_WORDS[r.why].toLowerCase()} />,
      status: true,
      width: "14rem",
    },
  ];
  return (
    <DataTable
      label="Lessons to confirm"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      more={{ page, href }}
      extras={{ attrs: (r) => ({ "data-lesson-row": r.id, "data-why": r.why }) }}
    />
  );
}
