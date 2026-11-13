import { notFound } from "next/navigation";
import Link from "@/components/link";
import { Screen } from "@/components/app-frame";
import { DetailPanel } from "@/components/detail-panel";
import { requireStaff } from "@/lib/auth";
import { BANK, QUESTION_KEY, questionOpened } from "../question-panel";

type Props = { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | undefined>> };

// One question's own address (page charter Part C, "Question bank / a question: keep, Workspace"): the bank's question panel opened full
// page, so it can be linked, with the same tabs, Question · Change · About. Correcting or removing it here comes back here.
export default async function QuestionScreen({ params, searchParams }: Props) {
  const me = await requireStaff();
  const [{ key }, q] = await Promise.all([params, searchParams]);
  if (!QUESTION_KEY.test(key)) notFound();
  // a refused correction comes back here with the engine's words: the Change tab is open again, so the form is in front of the person
  const got = await questionOpened(me, key, { tab: q.tab ?? (q.error ? "change" : undefined), back: `${BANK}/${key}` });
  if (!got) notFound();
  const { it, opened } = got;
  return (
    <Screen
      stage={`${it.skill_set_name ?? "Question"} · ${it.difficulty ?? ""}`}
      title={opened.title}
      purpose="The question, its answer, the wrong answers it catches, and where it came from. Correct the wording or remove it."
      next={{ href: BANK, label: "Question bank" }}
      action={
        <Link href={`${BANK}?${new URLSearchParams({ grade: "all", open: `question:${it.item_key}` })}`} className="btn secondary" data-back-to-bank>
          Back to the question bank
        </Link>
      }
    >
      {q.corrected ? <p role="status" className="mb-3 text-[13px] text-[var(--ink-muted)]">Saved. This is the corrected question; the old wording will not print again.</p> : null}
      {q.error ? <p role="alert" className="mb-3 text-[13px] text-[var(--ink-muted)]">{q.error}</p> : null}
      <DetailPanel inline open={opened} summary={{ title: "", stats: [] }} />
    </Screen>
  );
}
