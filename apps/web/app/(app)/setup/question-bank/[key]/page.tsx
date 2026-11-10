import { notFound } from "next/navigation";
import { Cards } from "@/components/cards";
import { DataTable } from "@/components/data-table";
import { Details } from "@/components/details";
import { KeyValue } from "@/components/key-value";
import { Rail, Screen, type Edge } from "@/components/app-frame";
import { Answers, kindWords, mistakeOf } from "@/components/question";
import { StatusChip } from "@/components/status-chip";
import { requireStaff } from "@/lib/auth";
import { mayDecide } from "@/lib/decides";
import { deadline } from "@/lib/deadline";
import { questionKinds } from "@/lib/question-types";
import { mistakeBook, questionPage, bankTotals } from "@/lib/queries-bank";
import { correctItem, flagItem } from "../../../library/actions";
import type { Column } from "@/lib/ux-rules";

type Props = { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | undefined>> };
const BANK = "/setup/question-bank";
const short = (s: string, n = 110) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// One question as it prints: the question, its answer, the wrong answers it catches, where it came from; correct the
// wording or remove it. A correction is a new question that points back at the old one, which stays (retired) and readable;
// Remove retires a question with its reason and never deletes it. Queries and the two writes are the old page's.
export default async function QuestionScreen({ params, searchParams }: Props) {
  const me = await requireStaff();
  const [{ key }, q] = await Promise.all([params, searchParams]);
  if (!/^[A-Za-z0-9._-]+$/.test(key)) notFound();
  const [it, book, qk] = await deadline(Promise.all([questionPage(key), mistakeBook(), questionKinds()]));
  if (!it) notFound();
  const [totals, may] = await deadline(Promise.all([bankTotals(), mayDecide(me, "questions")]));
  const live = it.status === "active";
  const canCorrect = may && live && qk.ownWords[it.fmt] !== false;
  const caught = it.responses.flatMap((r) =>
    Object.entries(r.misconceptions ?? {}).map(([code, wrong]) => ({ code, wrong, mistake: mistakeOf(book, code, it.spec.op) })),
  );
  const caughtColumns: Column<(typeof caught)[number]>[] = [
    { key: "wrong", label: "If the child writes", value: (c) => c.wrong, num: true, width: "9rem" },
    { key: "mistake", label: "The mistake", value: (c) => c.mistake?.name ?? c.code },
    { key: "looks", label: "What it looks like", value: (c) => c.mistake?.description ?? "" },
  ];
  const edges: Edge[] = [
    { screen: "skill", params: { code: it.skill_set_code ?? "" }, label: "The skill", icon: "skill" },
    { screen: "bank", label: "Question bank", icon: "assessment" },
  ];

  return (
    <Screen
      stage={`${it.skill_set_name ?? "Question"} · ${it.difficulty ?? ""}`}
      title={short(it.stem)}
      purpose="The question, its answer, the wrong answers it catches, and where it came from. Correct the wording or remove it."
      next={{ href: BANK, label: "Question bank" }}
      action={may && live ? undefined : <p className="text-[14px]">{live ? "Read the question; the coordinator corrects or removes it." : "This question is removed."}</p>}
      rail={<Rail edges={edges} />}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2" data-question-state={live ? "ready" : "removed"}>
        <StatusChip state={live ? "done" : "stopped"} words={live ? "ready" : "removed"} />
        <span className="text-[13px] text-[var(--ink-muted)]">{kindWords(qk.words, it.fmt)}</span>
        {it.generator === "correction" ? <span className="text-[13px] text-[var(--ink-muted)]">corrected</span> : null}
      </div>
      {q.corrected ? <p role="status" className="mb-3 text-[13px] text-[var(--ink-muted)]">Saved. This is the corrected question; the old wording will not print again.</p> : null}
      {q.error ? <p role="alert" className="mb-3 text-[13px] text-[var(--ink-muted)]">{q.error}</p> : null}
      {live ? null : (
        <p role="status" className="mb-3 text-[13px] text-[var(--ink-muted)]" data-removed>
          Removed{it.removed_by ? ` by ${it.removed_by}` : ""}
          {it.removed_note ? ` — ${it.removed_note}` : ""}. It will not print again.
          {it.replaced_by_key ? ` The corrected question is ${it.replaced_by_key}.` : ""}
        </p>
      )}
      <Cards
        cards={[
          {
            kind: "assessment",
            title: "As it prints",
            body: (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/question/${it.item_key}`} alt="The question as it prints on a paper" className="w-full max-w-[560px] border border-[var(--line)] bg-[var(--panel)]" />
            ),
          },
          { kind: "assessment", title: "Answer", body: <Answers it={it} rubric /> },
          {
            kind: "assessment",
            title: "Wrong answers it catches",
            body: caught.length ? (
              <DataTable label="Wrong answers it catches" columns={caughtColumns} rows={caught} rowKey={(c) => `${c.code}-${c.wrong}`} more={{ page: 1, href: () => "" }} />
            ) : (
              <span className="b-muted">This question is judged by a person, so there is no list of wrong answers.</span>
            ),
          },
        ]}
      />
      <div className="my-4">
        <Details summary="About it (source, versions)" name="about">
          <KeyValue
            rows={[
              { label: "Skill set", value: it.skill_set_name ?? "" },
              { label: "Level", value: `${it.difficulty ?? ""}${it.level_words ? ` · ${it.level_words}` : ""}` },
              { label: "Made by", value: it.generator === "correction" ? "Reworded by a person" : `The engine, from this level's rule${it.skill_set_version ? ` (version ${it.skill_set_version})` : ""}` },
              { label: "Key", value: it.item_key, num: true },
              { label: "Earlier wording", value: it.corrected_from_key ? `${it.corrected_from_key}, kept and readable` : `On ${it.worksheets.length} worksheets; ${it.children} children have had it` },
            ]}
          />
        </Details>
      </div>
      {canCorrect ? (
        <form action={correctItem} className="mb-4 grid max-w-[640px] gap-3" data-block="Form">
          <h2 className="text-[16px]">Correct the wording</h2>
          <input type="hidden" name="item_key" value={it.item_key} />
          <label className="field">
            <span className="label">The wording (required)</span>
            <textarea className="textarea min-h-[90px]" name="stem" defaultValue={it.stem} maxLength={600} required />
          </label>
          <label className="field">
            <span className="label">What was wrong (required)</span>
            <input className="input" name="reason" maxLength={300} required />
          </label>
          <button className="btn" type="submit" data-correct data-ux="action">Correct the wording</button>
          <p className="text-[13px] text-[var(--ink-muted)]">A new version is made; the old wording stays readable.</p>
        </form>
      ) : null}
      {may && live ? (
        <form action={flagItem} className="mb-4 grid max-w-[640px] gap-3" data-block="Form">
          <h2 className="text-[16px]">Remove it</h2>
          <input type="hidden" name="item_key" value={it.item_key} />
          <input type="hidden" name="back" value={`${BANK}/${it.item_key}`} />
          <label className="field">
            <span className="label">Reason for removal (required)</span>
            <input className="input" name="note" maxLength={300} required placeholder="For example: two answers are right" />
          </label>
          <button className="btn secondary" type="submit" data-remove {...(canCorrect ? {} : { "data-ux": "action" })}>Remove</button>
          <p className="text-[13px] text-[var(--ink-muted)]">A removed question is kept with the reason and never printed again. {totals.active} remain ready.</p>
        </form>
      ) : null}
    </Screen>
  );
}
