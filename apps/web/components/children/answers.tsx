import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { MarkPill } from "@/components/parts";
import { mistakeName } from "@/lib/mistake-name";
import type { Evidence } from "@/lib/queries";
import { dateWords } from "@/lib/week";
import type { Column } from "@/lib/ux-rules";

// A child's checked answers, read only (UI-3c): what the answers-by-question page of the old child screen showed, on the child's page.
// A person has signed each one off; nothing here changes a mark. The evidence is a row for every skill a question tests, so a
// question is listed once. Three signals stay apart: right, wrong, wrong with working, blank (the mark pill says which).
const JUDGED: Record<string, string> = { correct: "right", wrong: "wrong", blank: "blank" };

type Row = Pick<Evidence, "date" | "slot" | "question" | "read" | "working" | "status" | "misconception_codes" | "skill_code" | "op"> & { id?: string; typed?: string | null; judged?: string | null };

export function onceEach<T extends { id?: string }>(rows: readonly T[]): T[] {
  return rows.filter((a, i) => a.id == null || rows.findIndex((x) => x.id === a.id) === i);
}

export function Answers({ rows, names, skills, page, href }: { rows: readonly Row[]; names: Record<string, string>; skills: Record<string, string>; page: number; href: (page: number) => string }) {
  // newest sitting first, then the paper's own order
  const list = onceEach(rows).reverse();
  if (list.length === 0) return <EmptyState>No answers signed off for this child yet.</EmptyState>;
  const columns: Column<Row>[] = [
    { key: "date", label: "Date", keep: true, value: (a) => (a.date ? dateWords(a.date) : "") },
    { key: "q", label: "Question", keep: true, value: (a) => `${a.slot}. ${a.question}` },
    { key: "wrote", label: "What the child wrote", keep: true, value: (a) => (a.typed ?? a.read) || "nothing", cell: (a) => <Wrote a={a} /> },
    { key: "mark", label: "Mark", keep: true, status: true, value: (a) => (a.status === "wrong" && a.working ? "wrong, with working" : a.status), cell: (a) => <MarkPill status={a.status} working={a.working} /> },
    { key: "working", label: "Working shown", value: (a) => a.working || "none shown" },
    { key: "mistake", label: "Mistake matched", value: (a) => a.misconception_codes.map((c) => mistakeName(names, c, a.op, a.skill_code)).join("; ") || "none matched" },
    { key: "skill", label: "Skill", value: (a) => skills[a.skill_code] ?? a.skill_code },
  ];
  return <DataTable<Row> label="Answers signed off, newest first" columns={columns} rows={list} rowKey={(a) => a.id ?? `${a.date}${a.slot}`} more={{ page, href }} />;
}

function Wrote({ a }: { a: Row }) {
  return (
    <>
      {(a.typed ?? a.read) || "nothing"}
      {a.judged ? <span className="block text-[11.5px]">you marked it {JUDGED[a.judged] ?? a.judged}</span> : null}
    </>
  );
}
