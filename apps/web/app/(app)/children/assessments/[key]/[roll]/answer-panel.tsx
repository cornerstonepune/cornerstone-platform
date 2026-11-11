import Link from "@/components/link";
import { KindTile } from "@/components/kind-tile";
import { qLabel } from "./question-label";
import { Notice } from "@/components/parts";
import { mistakeName } from "@/lib/mistake-name";
import { held, type CaptureAnswer } from "@/lib/queries-read";
import { reading } from "@/lib/reading-words";
import type { Key, Proof, Unnamed } from "./answer-data";
import { changeThisKey, chooseThisPage, judgeThisOne, nameThisMistake, sayWhatWasWritten } from "./actions";

// The panel for ONE answer, under the table: what the engine read and why, the right answer it holds (and the way to change it for every child),
// the mistake it matches or the way to name one, whose page the photograph is, and the one thing a person is asked — what the child wrote.
// (The old Marking card, moved: every tool it had, for the answer picked in the table.)
const JUDGED = "a person judges this one";

export function AnswerPanel({
  a, paperId, assessment, roll, names, unnamed, keyOf, proof, said, nextJudge, at,
}: {
  a: CaptureAnswer; paperId: string; assessment: string; roll: string; names: Record<string, string>;
  unnamed?: Unnamed; keyOf?: Key; proof?: Proof; said?: { key?: string; error?: string }; nextJudge?: { href: string; left: number }; at?: number;
}) {
  const hidden = (
    <>
      <input type="hidden" name="key" value={assessment} />
      <input type="hidden" name="roll" value={roll} />
      <input type="hidden" name="result_id" value={a.id} />
      <input type="hidden" name="paper_id" value={paperId} />
    </>
  );
  const right = keyOf?.right ?? a.answer ?? JUDGED;
  const changeable = right !== JUDGED && !right.startsWith("any answer that makes");
  const signedOff = a.state === "confirmed";
  // a page the engine doubts is this child's (the same photograph on two copies) is not written on until a person says whose it is
  const locked = proof ? !proof.may_confirm : false;
  const judged = a.status === "needs_teacher" && !held(a);
  const n = qLabel(a, at);
  const value = a.human_read ?? (a.read || a.guess) ?? "";
  const [slot, now, changed, kept] = (said?.key ?? "").split("|");
  const listed = new Set((unnamed?.shortlist ?? []).map(([c]) => c));
  const label = (c: string) => (c === "NONE" ? "None of these" : mistakeName(names, c, a.op, a.mistake_skills?.[c] ?? a.skill_code));
  const write = (
    <form action={sayWhatWasWritten} className="grid gap-2">
      {hidden}
      <label className="field">
        <span className="label">What the child wrote for question {n}</span>
        <input className="input" name="human_read" inputMode="numeric" defaultValue={signedOff ? value : undefined} placeholder="Type the number you see" maxLength={40} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn" type="submit" disabled={locked} data-ux={signedOff ? undefined : "action"}>{signedOff ? "Save the correction" : "Say what the child wrote"}</button>
        <button className="btn secondary" type="submit" name="blank" value="1" disabled={locked}>Blank (the child wrote nothing)</button>
      </div>
      {locked ? <span className="b-caption">Say whose page this is first.</span> : null}
      <span className="b-caption">You say what was written; the engine marks it. Your answer is a new line beside the engine&rsquo;s read, never over it.</span>
    </form>
  );
  return (
    <section className="b-card my-4" data-kind="assessment" aria-label="Say what the child wrote" id={`a-${a.id}`}>
      <h2 className="b-card-h"><KindTile kind="assessment" /> Question {n}: {a.question}</h2>
      {said?.error ? <Notice tone="terracotta">{said.error === "engine" ? "The engine is not answering; nothing was changed." : `Nothing was changed: ${said.error}`}</Notice> : null}
      {slot ? (
        <Notice tone="neem">
          The right answer to question {slot} is now {now}, for every child. {changed === "1" ? "1 answer was" : `${changed} answers were`} marked again with it; a signed-off answer got new evidence in your name, the old kept.
          {kept !== "0" && kept
            ? ` ${kept === "1" ? "1 answer keeps" : `${kept} answers keep`} the mark it had, which the new right answer disagrees with — a person judged it by the old one, or its new mark needs a person: check ${kept === "1" ? "it" : "them"} on ${kept === "1" ? "its paper" : "their papers"}.`
            : ""}
        </Notice>
      ) : null}
      <p>{reading(a)}</p>
      <p className="mt-1"><span className="label">Right answer</span> <b>{right}</b>{keyOf?.by ? <span className="b-muted"> · changed from {keyOf.was ?? "none"} by {keyOf.by}</span> : null}</p>
      {a.misconception_codes.length ? (
        <p className="mt-1 text-terracotta">
          The mistake this matches: {a.misconception_codes.map((c) => mistakeName(names, c, a.op, a.mistake_skills?.[c] ?? a.skill_code)).join("; ")}
        </p>
      ) : null}
      {proof ? (
        <div className="mt-2 text-[13px]" aria-label="Whose paper this page is">
          <p><span className="label">Paper</span> <b>{proof.printed_with}</b> · <span className="label">Code on this page</span> {proof.code ? <b>{proof.code}</b> : "none could be read"}</p>
          <p>{proof.copy ? `Copy ${proof.copy}${proof.copies ? ` of ${proof.copies}` : ""} in this file · ` : ""}page {proof.page} of {proof.pages}</p>
          {proof.problem ? (
            <Notice tone="terracotta">
              <p>{proof.problem.text}</p>
              {proof.choice ? <p className="mt-1">{proof.chosen_by} said this page is {proof.choice === "theirs" ? "this child\u2019s" : "not this child\u2019s. A person has to place it"}.</p> : null}
              <form action={chooseThisPage} className="mt-2 flex flex-wrap gap-2">
                {hidden}
                <input type="hidden" name="capture_id" value={a.capture_id} />
                <input type="hidden" name="file_page" value={proof.page} />
                <button className="btn secondary" name="choice" value="theirs" type="submit" data-choose-page="">This page is this child&rsquo;s</button>
                <button className="btn secondary" name="choice" value="not_theirs" type="submit" data-choose-page="">Not this child&rsquo;s</button>
              </form>
            </Notice>
          ) : null}
        </div>
      ) : null}
      {unnamed && !signedOff ? (
        <div className="mt-3 border-l-2 border-terracotta/40 pl-3" aria-label={`Name the mistake for question ${n}`}>
          <p>No named mistake makes {unnamed.answer}. {unnamed.shortlist.length ? "The likeliest, from Jev — you decide:" : unnamed.why || "Which is it?"}</p>
          <form action={nameThisMistake} className="mt-2 flex flex-wrap items-center gap-2">
            {hidden}
            <input type="hidden" name="proposed" value={JSON.stringify(unnamed.shortlist)} />
            {unnamed.shortlist.map(([c, p]) => (
              <button key={c} className="btn secondary" name="code" value={c} type="submit" data-name-mistake="">{label(c)} <span className="b-muted">{Math.round(p * 100)}%</span></button>
            ))}
            {listed.has("NONE") ? null : <button className="btn secondary" name="code" value="NONE" type="submit" data-name-mistake="">None of these</button>}
          </form>
          <form action={nameThisMistake} className="mt-2 flex flex-wrap items-center gap-2">
            {hidden}
            <input type="hidden" name="proposed" value={JSON.stringify(unnamed.shortlist)} />
            <select className="select" name="code" aria-label={`Another mistake for question ${n}`} defaultValue="">
              <option value="" disabled>Another named mistake…</option>
              {unnamed.options.filter((c) => !listed.has(c) && c !== "NONE").map((c) => <option key={c} value={c}>{label(c)}</option>)}
            </select>
            <button className="btn secondary" type="submit" data-name-mistake="">Name it</button>
          </form>
        </div>
      ) : null}
      <div className="mt-3">
        {signedOff ? (
          <div>
            <p className="label">Signed off wrongly? Correct what the child wrote</p>
            <div className="mt-2">{write}</div>
          </div>
        ) : (
          write
        )}
      </div>
      {judged && !signedOff ? (
        <form action={judgeThisOne} className="mt-2 flex flex-wrap items-center gap-2">
          {hidden}
          <span className="b-caption">The engine cannot mark this one — only you can say:</span>
          <button className="btn secondary" name="status" value="correct" type="submit" data-judge="">Right</button>
          <button className="btn secondary" name="status" value="wrong" type="submit" data-judge="">Wrong</button>
          <button className="btn secondary" name="status" value="blank" type="submit" data-judge="">Blank</button>
        </form>
      ) : null}
      {changeable ? (
        // An educator who finds the stored right answer wrong changes it here, for every child (ADR 0045). Code checks it first, and says why when it refuses.
        <div className="mt-3" aria-label="Is the right answer wrong?">
          <p className="label">Is the right answer wrong? Change it for every child</p>
          <form action={changeThisKey} className="mt-2 flex flex-wrap items-end gap-2">
            {hidden}
            <input type="hidden" name="slot" value={a.slot} />
            <label className="field">
              <span className="label">The right answer is</span>
              <input className="input" name="answer" defaultValue={right} required data-change-key-field="" />
            </label>
            <button className="btn secondary" type="submit" data-change-key="">Change it for every child</button>
          </form>
          <p className="b-caption mt-1">Every child&rsquo;s answer to question {n} is marked again with it, signed off or not; a signed-off answer gets new evidence and keeps the old.</p>
        </div>
      ) : null}
      {nextJudge ? (
        <p className="mt-3">
          <Link href={nextJudge.href} className="btn secondary" data-ux="next" data-next-answer="">Next answer to judge</Link>
          <span className="b-muted"> · {nextJudge.left} left on this paper after this one</span>
        </p>
      ) : null}
    </section>
  );
}
