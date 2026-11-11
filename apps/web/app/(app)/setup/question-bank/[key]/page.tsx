import { notFound } from "next/navigation";
import Link from "@/components/link";
import { Cards } from "@/components/cards";
import { outcomesOf, reviewOf } from "@/lib/question-review";
import { StackBar } from "@/components/stack-bar";
import { Details } from "@/components/details";
import { KeyValue } from "@/components/key-value";
import { Rail, Screen, type Edge } from "@/components/app-frame";
import { Answers, kindWords, mistakeOf } from "@/components/question";
import { StatusChip } from "@/components/status-chip";
import { requireStaff } from "@/lib/auth";
import { mayDecide } from "@/lib/decides";
import { deadline } from "@/lib/deadline";
import { questionKinds } from "@/lib/question-types";
import { mistakeBook, questionPage } from "@/lib/queries-bank";
import { correctItem, flagItem } from "../../../library/actions";

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
  const [it, book, qk, review, done] = await deadline(Promise.all([questionPage(key), mistakeBook(), questionKinds(), reviewOf(key), outcomesOf(key)]));
  if (!it) notFound();
  const may = await deadline(mayDecide(me, "questions").then((ok) => ok && me.role === "coordinator"));
  const live = it.status === "active";
  const canCorrect = may && live && qk.ownWords[it.fmt] !== false;
  const caught = it.responses.flatMap((r) =>
    Object.entries(r.misconceptions ?? {}).map(([code, wrong]) => ({ code, wrong, mistake: mistakeOf(book, code, it.spec.op) })),
  );
  const edges: Edge[] = [
    { screen: "skill", params: { code: it.skill_set_code ?? "" }, label: "The skill", icon: "skill" },
    { screen: "bank", label: "Question bank", icon: "assessment" },
  ];

  return (
    <Screen
      stage={`${it.skill_set_name ?? "Question"} · ${it.difficulty ?? ""}`}
      title={it.stem.trim() ? short(it.stem) : `Question ${it.item_key}`} // a drawn question has no words: its key is its name
      purpose="The question, its answer, the wrong answers it catches, and where it came from. Correct the wording or remove it."
      next={{ href: BANK, label: "Question bank" }}
      action={may && live ? undefined : <p className="text-[14px]">{live ? "Read the question; the coordinator corrects or removes it." : "This question is removed."}</p>}
      rail={<Rail edges={edges} />}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2" data-question-state={live ? "ready" : "removed"}>
        <StatusChip state={live ? "done" : "stopped"} words={live ? "ready" : "removed"} />
        <span className="text-[13px] text-[var(--ink-muted)]">{kindWords(qk.words, it.fmt)}</span>
        {review ? <StatusChip state={/^(ok|agree|pass|approve)/i.test(review.verdict) ? "done" : "toCheck"} words={`Reviewer: ${review.note || review.verdict} · ${review.day}`} /> : null}
        {it.generator === "correction" ? <span className="text-[13px] text-[var(--ink-muted)]">corrected</span> : null}
      </div>
      {q.corrected ? <p role="status" className="mb-3 text-[13px] text-[var(--ink-muted)]">Saved. This is the corrected question; the old wording will not print again.</p> : null}
      {q.error ? <p role="alert" className="mb-3 text-[13px] text-[var(--ink-muted)]">{q.error}</p> : null}
      {live ? null : (
        <p role="status" className="mb-3 text-[13px] text-[var(--ink-muted)]" data-removed>
          Removed{it.removed_by ? ` by ${it.removed_by}` : ""}
          {it.removed_note ? ` — ${it.removed_note}` : ""}. It will not print again.
          {it.replaced_by_key ? (
            <>
              {" "}
              <Link href={`${BANK}/${it.replaced_by_key}`} data-corrected-link="">Open the corrected question →</Link>
            </>
          ) : null}
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
              <ul className="grid gap-2 text-[13.5px]" data-caught="">
                {caught.map((c) => (
                  <li key={`${c.code}-${c.wrong}`} className="grid grid-cols-[3rem_1fr] gap-2">
                    <span className="b-num text-[var(--ink-muted)]">{c.wrong}</span>
                    <span>
                      {c.mistake?.name ?? c.code}
                      {c.mistake?.description ? <span className="block text-[var(--ink-muted)]">{c.mistake.description}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="b-muted">This question is judged by a person, so there is no list of wrong answers.</span>
            ),
          },
        ]}
      />
      {it.corrected_from_key ? (
        <p className="my-3 text-[14px]">
          This wording replaced an earlier one. <Link href={`${BANK}/${it.corrected_from_key}`} data-original-link="">See the original wording</Link>
        </p>
      ) : null}
      <div className="my-4">
        <Details summary="About it (source, versions)" name="about">
          <KeyValue
            rows={[
              { label: "Skill set", value: it.skill_set_name ?? "" },
              { label: "Level", value: `${it.difficulty ?? ""}${it.level_words ? ` · ${it.level_words}` : ""}` },
              { label: "Made by", value: it.generator === "correction" ? "Reworded by a person" : `The engine, from this level's rule${it.skill_set_version ? ` (version ${it.skill_set_version})` : ""}` },
              { label: "Key", value: it.item_key, num: true },
              { label: "On papers", value: it.children ? `${it.children} children have had it` : "Not on a paper yet" },
            ]}
          />
          <KeyValue
            rows={[
              { label: "On worksheets", value: it.worksheets.length ? it.worksheets.join(", ") : "None: a question that has left the bank is on no worksheet in use", num: true },
            ]}
          />
        </Details>
      </div>
      {canCorrect ? (
        <form action={correctItem} className="mb-4 grid max-w-[640px] gap-3" data-block="Form">
          <h2 className="text-[16px]">Correct the wording</h2>
          <input type="hidden" name="item_key" value={it.item_key} />
          <input type="hidden" name="base" value={BANK} />
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
          <input type="hidden" name="base" value={BANK} />
          <input type="hidden" name="back" value={`${BANK}/${it.item_key}`} />
          <label className="field">
            <span className="label">Reason for removal (required)</span>
            <input className="input" name="note" maxLength={300} required placeholder="For example: two answers are right" />
          </label>
          <button className="btn secondary" type="submit" data-remove {...(canCorrect ? {} : { "data-ux": "action" })}>Remove</button>
          <p className="text-[13px] text-[var(--ink-muted)]">A removed question is kept with the reason and never printed again.</p>
        </form>
      ) : null}
      {done.right + done.wrong + done.wrongWithWorking + done.blank ? (
        <div className="mt-4">
          <Cards
            cards={[
              {
                kind: "assessment",
                title: `How it has done on papers · ${done.right + done.wrong + done.wrongWithWorking + done.blank}`,
                body: (
                  <div className="grid gap-2">
                    <StackBar
                      parts={[
                        { state: "right", n: done.right },
                        { state: "wrong", n: done.wrong },
                        { state: "wrong", n: done.wrongWithWorking, words: "wrong with working" },
                        { state: "blank", n: done.blank },
                      ]}
                    />
                    {done.topCode ? (
                      <span className="b-caption">
                        The most caught mistake: {mistakeOf(book, done.topCode, it.spec.op)?.name ?? done.topCode}, {done.topTimes} {done.topTimes === 1 ? "time" : "times"}.
                      </span>
                    ) : null}
                  </div>
                ),
              },
            ]}
          />
        </div>
      ) : null}
    </Screen>
  );
}
