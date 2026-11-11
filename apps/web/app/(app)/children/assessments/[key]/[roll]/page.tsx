import { notFound } from "next/navigation";
import { qLabel } from "./question-label";
import Link from "@/components/link";
import { Rail, Screen } from "@/components/app-frame";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageImage } from "@/components/page-image";
import { StatusChip, type State } from "@/components/status-chip";
import { requireStaff } from "@/lib/auth";
import { deadline } from "@/lib/deadline";
import { sees } from "@/lib/reach";
import { grades } from "@/lib/queries";
import { paperList } from "@/lib/queries-papers";
import { paperScreensOf, scanFacts } from "@/lib/queries-assessment-extras";
import { paperAnswers, paperHeader, sameChildPapers, type CaptureAnswer } from "@/lib/queries-read";
import { misconceptionNames, setSkills } from "@/lib/queries";
import { assessmentHref, paperHref } from "@/lib/assessment-ui";
import { dateWords } from "@/lib/week";
import type { Column } from "@/lib/ux-rules";
import { signOffPaper } from "../actions";
import { EditPaper } from "./edit-paper";
import { AnswerPanel } from "./answer-panel";
import { Lanes } from "./lanes";
import { keysOn, proofOf, unnamedOn } from "./answer-data";

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
  const pick = answers.find((x) => x.id === q.answer) ?? answers.find((x) => markOf(x) === "judge");
  const none = Promise.resolve(undefined);
  const [names, skills, siblings, unnamed, keys, proof] = await deadline(
    Promise.all([
      misconceptionNames(),
      setSkills(),
      sameChildPapers(sheet.id),
      pick ? unnamedOn(pick.capture_id) : none,
      pick ? keysOn(pick.capture_id) : none,
      pick ? proofOf(pick.capture_id, pick.file_page) : none,
    ]),
  );
  const marks = answers.map((a) => ({ a, m: markOf(a) }));
  const count = (m: Mark) => marks.filter((x) => x.m === m).length;
  // the child's other papers, oldest first: this one's place among them, and the way to the paper before and after
  const at = siblings.findIndex((x) => x.id === sheet.id);
  const around = await deadline(paperScreensOf([siblings[at - 1]?.id, siblings[at + 1]?.id].filter((x): x is string => !!x), me));
  const [before, after] = [around.get(siblings[at - 1]?.id ?? ""), around.get(siblings[at + 1]?.id ?? "")];
  const skillName = Object.fromEntries(skills.map((x) => [x.code, x.name]));
  const judging = marks.filter((x) => x.m === "judge");
  // the answer in view: the one picked in the table, else the first for you to judge
  const focus = marks.find((x) => x.a.id === q.answer) ?? judging[0];
  const level = sheet.level ?? "";
  const next = all.rows.find((p) => p.waiting > 0 && p.id !== sheet.id && p.roll_no);

  const columns: Column<(typeof marks)[number]>[] = [
    {
      key: "q",
      label: "Question",
      num: true,
      width: "14rem",
      value: (x) => x.a.question,
      cell: (x) => <Link href={`${paperHref(key, roll)}?answer=${x.a.id}#a-${x.a.id}`} data-answer={x.m === "judge" ? "" : undefined} data-answer-open="">{`${qLabel(x.a, marks.indexOf(x))}. ${x.a.question}`}</Link>,
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
  // the answers still for you to judge, after the one in view, in the order they sit on the page: the way on, so a paper is walked answer by answer
  const others = judging.filter((x) => marks.indexOf(x) > marks.findIndex((m) => m.a.id === focus?.a.id));
  const nextJudge = others.length ? { href: `${paperHref(key, roll)}?answer=${others[0].a.id}#a-${others[0].a.id}`, left: others.length } : undefined;
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
      {siblings.length > 1 ? (
        <p className="mb-3 flex flex-wrap items-center gap-3" aria-label="This child's papers">
          {before ? <Link href={before} className="btn secondary" data-prev-paper="">← Previous paper</Link> : null}
          <span className="b-muted">Paper {at + 1} of {siblings.length} for this child</span>
          {after ? <Link href={after} className="btn secondary" data-next-paper="">Next paper →</Link> : null}
        </p>
      ) : null}
      {answers.length > 0 ? (
        <Lanes
          marks={marks.map((x, at) => ({ a: x.a, at, mark: x.m, chip: CHIP[x.m] }))}
          lane={(a) => a.set_name ?? skillName[a.skill_code] ?? a.skill_code}
          names={names}
          href={(id) => `${paperHref(key, roll)}?answer=${id}#a-${id}`}
        />
      ) : null}
      {editing ? <EditPaper qr={sheet.qr} assessment={key} roll={roll} sp={q} /> : null}
      {answers.length === 0 && editing ? null : answers.length === 0 ? (
        <EmptyState>Nothing has been read from this paper yet. When the scan is read, each answer appears here.</EmptyState>
      ) : (
        <div className="b-split">
          <PageImage src={src} box={focus?.a.answer_state !== "not_found" ? focus?.a.box : null} caption={focus ? `The child's page as photographed. Question ${qLabel(focus.a, marks.indexOf(focus))} is outlined.` : "The child's page as photographed"} />
          <DataTable label="The answers" columns={columns} rows={marks} rowKey={(x) => x.a.id} more={{ page: 1, href: () => paperHref(key, roll) }} />
        </div>
      )}
      {focus ? (
        <AnswerPanel a={focus.a} paperId={sheet.id} assessment={key} roll={roll} names={names} unnamed={unnamed?.[focus.a.id]} keyOf={keys?.[focus.a.id]} proof={proof} said={{ key: q.key, error: q.error }} nextJudge={nextJudge} at={marks.indexOf(focus)} />
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
