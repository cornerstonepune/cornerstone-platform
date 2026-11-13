import Link from "@/components/link";
import type { Opened } from "@/components/detail-panel";
import { KeyValue } from "@/components/key-value";
import { StackBar } from "@/components/stack-bar";
import { Answers, kindWords, mistakeOf } from "@/components/question";
import { StatusChip } from "@/components/status-chip";
import type { Session } from "@/lib/auth";
import { screenHref } from "@/lib/built";
import { mayDecide } from "@/lib/decides";
import { deadline } from "@/lib/deadline";
import { questionKinds } from "@/lib/question-types";
import { mistakeBook, questionPage } from "@/lib/queries-bank";
import { outcomesOf, reviewOf } from "@/lib/question-review";
import { correctItem, flagItem } from "../../library/actions";

export const BANK = "/setup/question-bank";
export const QUESTION_KEY = /^[A-Za-z0-9._-]+$/;
const short = (s: string, n = 110) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// One question in the detail panel (page charter Part C: "Question bank / a question: keep, Workspace"): tabs Question (as it prints, its
// answer, the wrong answers it catches, how it has done on papers) · Change (the coordinator corrects the wording or removes it) · About
// (where it came from and where it is used). The bank opens it on the right (`?open=question:<key>`); the question's own address is the
// same panel opened full page. A correction is a new question that points back at the old one, which stays (retired) and readable; Remove
// retires a question with its reason and never deletes it. Queries and the two writes are the old question page's.
export async function questionOpened(me: Session, key: string, o: { tab?: string; closeHref?: string; full?: string; back: string }) {
  if (!QUESTION_KEY.test(key)) return null;
  const [it, book, qk, review, done] = await deadline(Promise.all([questionPage(key), mistakeBook(), questionKinds(), reviewOf(key), outcomesOf(key)]));
  if (!it) return null;
  const may = await deadline(mayDecide(me, "questions").then((ok) => ok && me.role === "coordinator"));
  const live = it.status === "active";
  const canCorrect = may && live && qk.ownWords[it.fmt] !== false;
  const caught = it.responses.flatMap((r) =>
    Object.entries(r.misconceptions ?? {}).map(([code, wrong]) => ({
      code,
      wrong,
      mistake: mistakeOf(book, code, it.spec.op),
    })),
  );
  const papers = done.right + done.wrong + done.wrongWithWorking + done.blank;
  const skill = it.skill_set_code ? screenHref("skill", { code: it.skill_set_code }) : null;
  const title = it.stem.trim() ? short(it.stem) : `Question ${it.item_key}`; // a drawn question has no words: its key is its name

  const question = (
    <div className="grid gap-[var(--space-3)]">
      <div className="flex flex-wrap items-center gap-2" data-question-state={live ? "ready" : "removed"}>
        <StatusChip state={live ? "done" : "stopped"} words={live ? "ready" : "removed"} />
        <span className="b-caption">{kindWords(qk.words, it.fmt)}</span>
        {review ? (
          <StatusChip state={/^(ok|agree|pass|approve)/i.test(review.verdict) ? "done" : "toCheck"} words={`Reviewer: ${review.note || review.verdict} · ${review.day}`} />
        ) : null}
        {it.generator === "correction" ? <span className="b-caption">corrected</span> : null}
      </div>
      {live ? null : (
        <p role="status" className="b-caption" data-removed>
          Removed{it.removed_by ? ` by ${it.removed_by}` : ""}
          {it.removed_note ? ` — ${it.removed_note}` : ""}. It will not print again.
          {it.replaced_by_key ? (
            <>
              {" "}
              <Link href={`${BANK}/${it.replaced_by_key}`} data-corrected-link="">
                Open the corrected question →
              </Link>
            </>
          ) : null}
        </p>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/question/${it.item_key}`} alt="The question as it prints on a paper" className="w-full max-w-[560px] border border-[var(--line)] bg-[var(--panel)]" />
      <section aria-label="Answer">
        <h3 className="mb-[var(--space-1)] text-[length:var(--text-label)]">Answer</h3>
        <Answers it={it} rubric />
      </section>
      <section aria-label="Wrong answers it catches">
        <h3 className="mb-[var(--space-1)] text-[length:var(--text-label)]">Wrong answers it catches</h3>
        {caught.length ? (
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
        )}
      </section>
      {it.corrected_from_key ? (
        <p className="text-[length:var(--text-label)]">
          This wording replaced an earlier one.{" "}
          <Link href={`${BANK}/${it.corrected_from_key}`} data-original-link="">
            See the original wording
          </Link>
        </p>
      ) : null}
      {papers ? (
        <section aria-label="How it has done on papers" className="grid gap-2">
          <h3 className="text-[length:var(--text-label)]">How it has done on papers · {papers}</h3>
          <StackBar
            parts={[
              { state: "right", n: done.right },
              { state: "wrong", n: done.wrong },
              {
                state: "wrong",
                n: done.wrongWithWorking,
                words: "wrong with working",
              },
              { state: "blank", n: done.blank },
            ]}
          />
          {done.topCode ? (
            <span className="b-caption">
              The most caught mistake: {mistakeOf(book, done.topCode, it.spec.op)?.name ?? done.topCode}, {done.topTimes} {done.topTimes === 1 ? "time" : "times"}.
            </span>
          ) : null}
        </section>
      ) : null}
    </div>
  );

  const change = (
    <div className="grid gap-[var(--space-4)]">
      {canCorrect ? (
        <form action={correctItem} className="grid max-w-[640px] gap-3" data-block="Form">
          <h3 className="text-[length:var(--text-body)]">Correct the wording</h3>
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
          <button className="btn" type="submit" data-correct>
            Correct the wording
          </button>
          <p className="b-caption">A new version is made; the old wording stays readable.</p>
        </form>
      ) : null}
      <form action={flagItem} className="grid max-w-[640px] gap-3" data-block="Form">
        <h3 className="text-[length:var(--text-body)]">Remove it</h3>
        <input type="hidden" name="item_key" value={it.item_key} />
        <input type="hidden" name="base" value={BANK} />
        <input type="hidden" name="back" value={o.back} />
        <label className="field">
          <span className="label">Reason for removal (required)</span>
          <input className="input" name="note" maxLength={300} required placeholder="For example: two answers are right" />
        </label>
        <button className="btn secondary" type="submit" data-remove>
          Remove
        </button>
        <p className="b-caption">A removed question is kept with the reason and never printed again.</p>
      </form>
    </div>
  );

  const about = (
    <div className="grid gap-[var(--space-2)]">
      <KeyValue
        rows={[
          { label: "Skill set", value: it.skill_set_name ?? "" },
          {
            label: "Level",
            value: `${it.difficulty ?? ""}${it.level_words ? ` · ${it.level_words}` : ""}`,
          },
          {
            label: "Made by",
            value: it.generator === "correction" ? "Reworded by a person" : `The engine, from this level's rule${it.skill_set_version ? ` (version ${it.skill_set_version})` : ""}`,
          },
          { label: "Key", value: it.item_key, num: true },
          {
            label: "On papers",
            value: it.children ? `${it.children} children have had it` : "Not on a paper yet",
          },
        ]}
      />
      <KeyValue
        rows={[
          {
            label: "On worksheets",
            value: it.worksheets.length ? it.worksheets.join(", ") : "None: a question that has left the bank is on no worksheet in use",
            num: true,
          },
        ]}
      />
    </div>
  );

  const opened: Opened = {
    key: `question:${it.item_key}`,
    kind: "assessment",
    title,
    line: [it.skill_set_name, it.difficulty, live ? "ready" : "removed"].filter(Boolean).join(" · "),
    full: o.full,
    closeHref: o.closeHref,
    actions: skill ? (
      <Link href={skill} className="btn secondary" data-the-skill>
        The skill
      </Link>
    ) : undefined,
    tabs: [
      { key: "question", label: "Question", body: question },
      ...(may && live ? [{ key: "change", label: "Change", body: change }] : []),
      { key: "about", label: "About", body: about },
    ],
    tab: o.tab,
  };
  return { it, opened, live, may };
}
