import { notFound } from "next/navigation";
import Link from "@/components/link";
import { Rail, Screen } from "@/components/app-frame";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { KindTile } from "@/components/kind-tile";
import { PageImage } from "@/components/page-image";
import { StatusChip, type State } from "@/components/status-chip";
import { requireStaff } from "@/lib/auth";
import { deadline } from "@/lib/deadline";
import { sees } from "@/lib/reach";
import { grades } from "@/lib/queries";
import { paperList } from "@/lib/queries-papers";
import { scanFacts } from "@/lib/queries-assessment-extras";
import { paperAnswers, paperHeader, type CaptureAnswer } from "@/lib/queries-read";
import { assessmentHref, paperHref } from "@/lib/assessment-ui";
import { dateWords } from "@/lib/week";
import type { Column } from "@/lib/ux-rules";
import { signOffPaper } from "../actions";
import { EditPaper } from "./edit-paper";
import { sayWhatWasWritten } from "./actions";

const safeDecode = (v: string) => {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
};

type Props = { params: Promise<{ key: string; roll: string }>; searchParams: Promise<Record<string, string | undefined>> };

/** One answer's mark: three signals that stay three (rule 5), and an answer nobody has settled, which is the person's to judge. */
type Mark = "right" | "wrong" | "working" | "blank" | "judge";
const markOf = (a: CaptureAnswer): Mark =>
  a.status === "correct" ? "right"
  : a.status === "blank" ? "blank"
  : a.status === "wrong" ? (a.working_shown && a.working_shown !== "none" ? "working" : "wrong")
  : "judge";
const CHIP: Record<Mark, { state: State; words: string }> = {
  right: { state: "right", words: "Right" },
  wrong: { state: "wrong", words: "Wrong" },
  working: { state: "wrong", words: "Wrong, with working" },
  blank: { state: "blank", words: "Blank" },
  judge: { state: "judge", words: "For you to judge" },
};

// One child's paper: the page as photographed beside each answer as the engine read it. Say what the child wrote where it
// was unsure; the engine marks it. Sign the paper off only when nothing is left to judge.
export default async function PaperPage({ params, searchParams }: Props) {
  const me = await requireStaff();
  const raw = await params;
  // the address arrives percent-encoded where the key or the Sr. No. holds a character an address cannot
  const key = safeDecode(raw.key);
  const roll = safeDecode(raw.roll);
  const q = await searchParams;
  // the set can hold a "~" of its own (a paper made from chosen areas), so it is the rest of the key
  const [kind, section, week, ...rest] = key.split("~");
  const set = rest.join("~");
  const all = await deadline(paperList({ kind, class: section || undefined, week: week || undefined, set: set || undefined }, me.email, me, "roll"));
  const mine = all.rows.filter((p) => p.roll_no === roll && !p.spare && !p.extra);
  const sheet = mine.find((p) => p.stage !== "replaced") ?? mine[0];
  if (!sheet || !(await sees(me, [{ sheet: sheet.id }]))) notFound();
  const [header, answers, g] = await deadline(Promise.all([paperHeader(sheet.id, me.email), paperAnswers(sheet.id), grades()]));
  // a home assessment's copy before it prints has no answers yet, and its questions are the page
  const editing = kind === "focus" && (sheet.stage === "made" || sheet.stage === "printed") && answers.length === 0;
  if (answers.length === 0 && !header && !editing) notFound();
  const scan = await deadline(scanFacts(sheet.id));
  const marks = answers.map((a) => ({ a, m: markOf(a) }));
  const count = (m: Mark) => marks.filter((x) => x.m === m).length;
  const judging = marks.filter((x) => x.m === "judge");
  const focus = marks.find((x) => x.a.id === q.answer && x.m === "judge") ?? judging[0];
  const level = sheet.level ?? "";
  const next = all.rows.find((p) => p.waiting > 0 && p.id !== sheet.id && p.roll_no);

  const columns: Column<(typeof marks)[number]>[] = [
    {
      key: "q",
      label: "Question",
      num: true,
      width: "14rem",
      value: (x) => x.a.question,
      cell: (x) => (x.m === "judge" ? <Link href={`${paperHref(key, roll)}?answer=${x.a.id}`} data-answer="">{`${x.a.n ?? x.a.slot}. ${x.a.question}`}</Link> : <span>{`${x.a.n ?? x.a.slot}. ${x.a.question}`}</span>),
    },
    { key: "read", label: "Read as", num: true, width: "11rem", value: (x) => x.a.human_read ?? x.a.read ?? "nothing" },
    { key: "mark", label: "Mark", status: true, width: "13rem", value: (x) => x.m, cell: (x) => <StatusChip state={CHIP[x.m].state} words={CHIP[x.m].words} /> },
    {
      key: "why",
      label: "Why",
      value: (x) => x.a.why,
      cell: (x) => (
        <span>
          {x.m === "blank" ? "Nothing written. Blank is never marked wrong." : x.m === "working" ? "Wrong, and the working shows how." : (x.a.why ?? "")}
          {x.m === "judge" && x.a.confidence != null ? ` The engine was ${Math.round(x.a.confidence * 100)}% sure.` : ""}
        </span>
      ),
    },
  ];
  const src = focus ? `/api/scan/${focus.a.capture_id}/${focus.a.file_page}` : answers[0] ? `/api/scan/${answers[0].capture_id}/${answers[0].file_page}` : undefined;
  const nothingLeft = judging.length === 0 && answers.length > 0;

  return (
    <Screen
      stage={`${sheet.band ? g.name(sheet.band) : "Assessment"} · Sr. No. ${roll}${level ? ` · ${level}` : ""}`}
      title="Check the answers"
      purpose="The page as photographed, and each answer as the engine read it. Say what the child wrote where it was unsure; the engine marks it."
      rail={
        <Rail
          cards={
            scan ? (
              <section aria-label="This scan" data-rail-part="scan">
                <h2 className="mb-[var(--space-1)] text-[length:var(--text-eyebrow)] text-[var(--ink-muted)] uppercase">This scan</h2>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[14px]">
                  <dt className="b-muted">Sheet</dt><dd>{sheet.qr}</dd>
                  <dt className="b-muted">QR</dt><dd>{scan.own ? "read, and it belongs to this assessment" : "read, but it is another copy's"}</dd>
                  <dt className="b-muted">Scanned</dt><dd>{dateWords(scan.on.slice(0, 10))}, {scan.on.slice(11)}</dd>
                  <dt className="b-muted">Pages</dt><dd>{scan.pages}</dd>
                </dl>
              </section>
            ) : null
          }
          edges={[
            { screen: "child", params: { id: sheet.child_id ?? "" }, label: "This child", icon: "child" },
            { screen: "skill", params: { code: set ?? "" }, label: "The skill", icon: "skill" },
            { screen: "assessment", href: assessmentHref(key), label: "The assessment", icon: "assessment" },
            ...(next ? [{ screen: "paper", href: paperHref(key, next.roll_no ?? ""), label: "The next paper to check", icon: "correct" as const }] : []),
          ]}
        />
      }
    >
      {q.said ? <p role="status" className="mb-3 p-3">{q.said}</p> : null}
      <div className="b-keyrow mb-4" aria-label={`${answers.length} answers: ${count("right")} right, ${count("wrong")} wrong, ${count("working")} wrong with working, ${count("blank")} blank, ${count("judge")} for you to judge`}>
        {(["right", "wrong", "working", "blank", "judge"] as const).map((m) => (
          <StatusChip key={m} state={CHIP[m].state} words={`${count(m)} ${CHIP[m].words.toLowerCase()}`} round />
        ))}
      </div>
      {editing ? <EditPaper qr={sheet.qr} assessment={key} roll={roll} sp={q} /> : null}
      {answers.length === 0 && editing ? null : answers.length === 0 ? (
        <EmptyState>Nothing has been read from this paper yet. When the scan is read, each answer appears here.</EmptyState>
      ) : (
        <div className="b-split">
          <PageImage src={src} box={focus?.a.answer_state !== "not_found" ? focus?.a.box : null} caption={focus ? `The child's page as photographed. Question ${focus.a.n ?? focus.a.slot} is outlined.` : "The child's page as photographed"} />
          <DataTable label="The answers" columns={columns} rows={marks} rowKey={(x) => x.a.id} more={{ page: 1, href: () => paperHref(key, roll) }} />
        </div>
      )}
      {focus ? (
        <section className="b-card my-4" data-kind="assessment" aria-label="Say what the child wrote">
          <h2 className="b-card-h"><KindTile kind="assessment" /> Question {focus.a.n ?? focus.a.slot}: {focus.a.question}</h2>
          <p>The engine read <b>{focus.a.guess ?? focus.a.read ?? "nothing"}</b>{focus.a.confidence != null ? ` and was ${Math.round(focus.a.confidence * 100)}% sure` : ""}.</p>
          <form action={sayWhatWasWritten} className="grid gap-2">
            <input type="hidden" name="key" value={key} />
            <input type="hidden" name="roll" value={roll} />
            <input type="hidden" name="result_id" value={focus.a.id} />
            <input type="hidden" name="paper_id" value={sheet.id} />
            <label className="field">
              <span className="label">What the child wrote for question {focus.a.n ?? focus.a.slot}</span>
              <input className="input" name="human_read" inputMode="numeric" placeholder="Type the number you see" maxLength={40} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button className="btn" type="submit" data-ux="action">Say what the child wrote</button>
              <button className="btn secondary" type="submit" name="blank" value="1">Blank (the child wrote nothing)</button>
            </div>
            <span className="b-caption">You say what was written; the engine marks it. Your answer is a new line beside the engine&rsquo;s read, never over it.</span>
          </form>
        </section>
      ) : nothingLeft ? (
        <EmptyState>
          Nothing left to judge on this paper.
          {sheet.stage === "checked" || sheet.stage === "scanned" ? (
            <form action={signOffPaper} className="mt-2">
              <input type="hidden" name="key" value={key} />
              <input type="hidden" name="paper_id" value={sheet.id} />
              <button type="submit" className="btn" data-ux="action">Sign this paper off</button>
            </form>
          ) : (
            <Link href={assessmentHref(key)} className="underline">Back to the assessment</Link>
          )}
        </EmptyState>
      ) : null}
    </Screen>
  );
}
