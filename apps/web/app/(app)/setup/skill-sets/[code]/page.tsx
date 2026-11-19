import { Card } from "@/components/cards";
import { notFound } from "next/navigation";
import Link from "@/components/link";
import { Answers, mistakeOf, Question } from "@/components/question";
import { questionKinds } from "@/lib/question-types";
import { Notice, Panel, Pill } from "@/components/parts";
import { Screen } from "@/components/app-frame";
import { Crumbs } from "@/components/crumbs";
import { screenHref } from "@/lib/built";
import { treeAt } from "../../curriculum/tree-path";
import { sql } from "@/lib/db";
import { deadline } from "@/lib/deadline";
import { levels } from "@/lib/levels";
import {
  grades,
  levelsOf,
  skillSet,
  type Difficulty,
} from "@/lib/queries";
import { mistakeBook } from "@/lib/queries-bank";
import { levelExamples, openedAt, skillKinds, skillMistakes, skillSamples, skillWatches, skillWays } from "@/lib/queries-skills";
import { worksheets } from "@/lib/queries-worksheets";
import { approveSkills } from "../../../skill-sets/[code]/actions";
import { requireStaff } from "@/lib/auth";
import { scopeOf } from "@/lib/scope";
import { mayDecide } from "@/lib/decides";
import { KindsPanel, MistakesList, WorksheetsPanel, type Mistaken } from "./below";
import { LevelApproval } from "./level-approval";
import { GradesPanel } from "../../../skill-sets/[code]/grades-panel";
import { Watched, WaysPanel } from "../../../skill-sets/[code]/ways";
import { KindStops } from "../../../skill-sets/[code]/kind-stops";
import { MathsMore } from "../../../skill-sets/[code]/more-like-this";
import { Changed, editingOf, EnglishLevel, MadeByCode, SentenceLink } from "../../../skill-sets/[code]/editing";
import { dateWords } from "@/lib/week";

type Props = {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};


// One skill as a teacher reads it: what the child can do, what that looks like at each level with a
// real question from the bank, the kinds of question that test it, the mistakes it watches for, and
// its worksheets. Codes are provenance at the foot of the page, never the lead. An English skill's samples and the kinds
// each level asks are changed here by whoever may change the skill (goals/edt_edit_samples_and_kinds.yaml).
export default async function SkillPage({ params, searchParams }: Props) {
  const me = await requireStaff();
  const [mayApprove, mayChange] = await deadline(Promise.all([mayDecide(me, "skills"), mayDecide(me, "skill_drafts")]));
  const [{ code }, q] = await Promise.all([params, searchParams]);
  const level = (await levels()).order.find((d) => d === q.level);
  const everyLevel = q.level === "all";
  const full = q.all === "1";
  const [s, examples, kinds, caught, book, sheets, g, { words }, ways, watched, samples, opened] = await deadline(
    Promise.all([
      skillSet(code, scopeOf(me)), // this skill alone carries its bank counts (CP-55)
      levelExamples(code),
      skillKinds(code),
      skillMistakes(code),
      mistakeBook(),
      worksheets({ set: code, level }, 200, 0),
      grades(),
      questionKinds(),
      skillWays(code),
      skillWatches(code),
      skillSamples(code), openedAt(),
    ]),
  );
  // a skill whose topic is not taught yet opens too, to be read and approved before it is switched on (goals/ny1-needs-you.yaml)
  if (!s) notFound();
  // a skill whose questions are not drawn from the bank (English, E0) is read from the rows that say how it is asked
  const bankless = !Object.keys(s.counts).length && ways.length > 0;
  const example = (d: Difficulty) => examples.find((e) => e.difficulty === d);
  const ops = new Set(levelsOf(s).map((d) => s.difficulty[d]?.check?.op).filter(Boolean));
  const op = ops.size === 1 ? String([...ops][0]) : undefined;
  // the worksheets of one level at a time (goals/ui3-curriculum.yaml): the one asked for, every one when asked, else the
  // first that has any — a skill's 73 worksheets listed at once were a page of codes
  const shownLevel = level ?? (everyLevel ? undefined : levelsOf(s).find((d) => sheets.some((w) => w.difficulty === d)));
  const shown = shownLevel ? sheets.filter((w) => w.difficulty === shownLevel) : sheets;
  const editing = bankless && mayChange ? await deadline(editingOf(s.code, q)) : null;
  const mistakes = caught
    .map((m) => ({ ...m, said: mistakeOf(book, m.code, op) }))
    .filter((m): m is Mistaken => !!m.said);

  // approve or change the words: at the top, or for a skill read from its samples (English), under them, so the
  // approver reads first (goals/smp_skill_shows_its_samples.yaml)
  const decide = (
    <>
      {s.status === "ratified" ? (
        <Pill tone="neem">Approved · {s.ratified_by?.split(" (")[0]}</Pill>
      ) : !mayApprove ? (
        // approving a skill is the coordinator's (people.decides); an educator is not offered it (goals/ux1-who-sees-what.yaml)
        <Pill tone="bamboo">Waiting for the coordinator&rsquo;s approval</Pill>
      ) : (
        <form action={approveSkills} className="flex flex-wrap items-center gap-3">
          <Pill tone="bamboo">Waiting for approval</Pill>
          <input type="hidden" name="code" value={s.code} />
          <input type="hidden" name="version" value={s.version} /><input type="hidden" name="opened" value={opened} />
          <input type="hidden" name="back" value={`/setup/skill-sets/${s.code}`} />
          <button className="btn" type="submit">
            Approve, as {me.name}
          </button>
        </form>
      )}
      {/* what it changes, said (Nimish, 2026-10-24: "What does 'change the words first' do?") */}
      <Link href={`/skill-sets/${s.code}/edit`} className="chip">
        Change the description and each level&rsquo;s sentence
      </Link>
    </>
  );

  // the registry skills this set points at: each opens the skill screen (where a class stands on it); none says so
  const covers = s.skill_codes.length
    ? await sql<{ code: string; name: string }[]>`select code, name from registry_skill where code = any(${s.skill_codes}::text[]) order by name`
    : [];
  return (
    <Screen
      stage={`Skill group · ${g.name(s.band)}${s.taught ? "" : " · not taught yet"}`}
      trail={<Crumbs parts={[{ label: "Curriculum", href: "/setup/curriculum" }, { label: g.name(s.band), href: treeAt({ grade: s.band }) }]} here={s.name} />}
      title={s.learning_objective}
      purpose="Its levels, the questions and mistakes, and the skills it covers."
      next={{ href: "/setup/curriculum", label: "Curriculum" }}
    >
      <div className="grid gap-[var(--space-3)]">
        <Changed q={q} />
        {q.saved ? (
          <Notice tone="neem">Saved. The new words wait for approval before they are the skill&rsquo;s words.</Notice>
        ) : null}
        {q.approved === "0" ? (
          <Notice tone="terracotta">Nothing was approved: it changed since this page was opened. Read it again, then approve.</Notice>
        ) : q.approved ? (
          <Notice tone="neem">Approved as written, in your name.</Notice>
        ) : null}
        {q.way_approved ? (
          <Notice tone="neem">
            Approved &ldquo;{ways.find((w) => w.code === q.way_approved)?.words ?? "this way of asking"}&rdquo;, in your name.
          </Notice>
        ) : null}
        {s.taught ? null : (
          <Notice tone="terracotta">
            Not taught yet: no class you see has been taught {s.topic_name ?? "its topic"}, so this skill is on none of
            their pages or papers. Read and approve it now; <Link href="/my-day?open=wait:group-taught">say a class has been taught it</Link>{" "}
            when one has.
          </Notice>
        )}

        <div id="means" className="mb-5 flex scroll-mt-6 flex-wrap items-center gap-3">
          {bankless && s.status !== "ratified" ? (
            <Link href="#decide" className="chip">Read the sample questions, then approve ↓</Link>
          ) : (
            decide
          )}
        </div>

        {/* the skill in five parts, each one click from here (goals/ui3-curriculum.yaml) */}
        <nav aria-label="Parts of this skill" className="mb-5 flex flex-wrap gap-2">
          {(bankless
            ? [["What it means", "#means"], ["Levels", "#levels"], ["How it is asked", "#ways"], ["Mistakes", "#mistakes"]]
            : [["What it means", "#means"], ["Levels", "#levels"], ["Mistakes", "#mistakes"], ["Questions", `/library?set=${s.code}#questions`], ["Worksheets", "#worksheets"]]
          ).map(([words, href]) => (
            <Link key={words} href={href} className="chip">{words}</Link>
          ))}
        </nav>

        <section aria-label="Skills it covers" id="covers" className="card grid gap-[var(--space-1)]" data-card>
          <h2 className="min-h-[var(--tap)] text-[length:var(--text-body)] font-semibold">Skills it covers</h2>
          {covers.length ? (
            <ul className="grid gap-[var(--space-1)]">
              {covers.map((k) => (
                <li key={k.code} className="flex min-h-[var(--tap)] items-center">
                  <Link href={screenHref("skill", { code: k.code }) ?? `/setup/skills/${encodeURIComponent(k.code)}`}>{k.name}</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[var(--ink-muted)]">No skill is linked to this group yet.</p>
          )}
          <Link href="/setup/question-bank" className="w-fit">Question bank</Link>
        </section>

        <div className="grid gap-5">
          <GradesPanel s={s} grades={g} saved={Boolean(q.grades)} />
          <Panel
            id="levels"
            title="At each level"
            aside={bankless ? "what the child does at each level, its sample questions, and how it is asked" : "the level in words, and a real question from the bank"}
          >
            <div className={`grid gap-3 ${bankless ? "" : "md:grid-cols-2 xl:grid-cols-4"}`}>
              {levelsOf(s).map((d) => {
                const it = example(d);
                return (
                  <Card
                    as="section"
                    tone="quiet"
                    key={d} id={`level-${d}`}
                    aria-label={d}
                    className="scroll-mt-6"
                  >
                    <h3 className="text-[length:var(--text-body)]">{d}</h3>
                    {bankless ? null : <LevelApproval s={s} d={d} mayApprove={mayApprove} />}
                    <p className="text-label leading-snug">
                      {s.difficulty[d]?.words}
                    </p>
                    {mayChange ? <SentenceLink code={s.code} level={d} /> : null}
                    {bankless ? (
                      <EnglishLevel s={s} level={d} ways={ways} samples={samples} editing={editing} mayApprove={mayApprove} opened={opened} />
                    ) : it ? (
                      <div className="grid gap-1 bg-chalk p-2 text-label">
                        <span className="label">For example</span>
                        <Link
                          href={`/setup/question-bank/${it.item_key}`}
                          className="text-basalt no-underline"
                        >
                          <Question it={it} />
                        </Link>
                        <span className="text-label text-basalt/62">
                          Answer: <Answers it={it} />
                        </span>
                      </div>
                    ) : (
                      <p className="note">
                        No question in the bank at this level yet.
                      </p>
                    )}
                    {bankless ? null : <p className="note">
                      <Link
                        href={`/library?set=${s.code}&difficulty=${d}#questions`}
                      >
                        {s.counts[d] ?? 0} questions
                      </Link>
                      {" · "}
                      {s.worksheets[d] ? (
                        <Link
                          href={`/setup/skill-sets/${s.code}?level=${d}#worksheets`}
                        >
                          {s.worksheets[d]} worksheets
                        </Link>
                      ) : (
                        "no worksheets yet"
                      )}
                    </p>}
                    {!bankless && mayChange ? <MathsMore code={s.code} level={d} /> : null}
                  </Card>
                );
              })}
            </div>
            {!bankless && mayChange ? <MadeByCode /> : null}
            {bankless ? (
              <div id="decide" className="mt-3 flex scroll-mt-6 flex-wrap items-center gap-3">
                {decide}
              </div>
            ) : null}
          </Panel>

          {bankless ? (
            <WaysPanel ways={ways} code={s.code} mayApprove={mayApprove} />
          ) : (
            <KindsPanel kinds={full ? kinds : kinds.slice(0, 3)} words={words} />
          )}
          {mayChange ? <details className="card" data-card><summary className="flex min-h-[var(--tap)] cursor-pointer items-center font-semibold">Stop using a kind of question</summary><KindStops code={s.code} ways={ways} levels={levelsOf(s)} q={q} mayChange={mayChange} /></details> : <KindStops code={s.code} ways={ways} levels={levelsOf(s)} q={q} mayChange={mayChange} />}
          <Panel
            id="mistakes"
            title="Mistakes it watches for"
            aside="the wrong answers its questions are built to recognise"
          >
            {bankless ? (
              <Watched watched={watched} />
            ) : (
              <MistakesList mistakes={mistakes} />
            )}
          </Panel>

          {bankless ? null : <WorksheetsPanel s={s} shown={full ? shown : shown.slice(0, 5)} shownLevel={shownLevel} words={words} />}
        </div>

        {!full && (kinds.length > 3 || shown.length > 5) ? <Link href={`/setup/skill-sets/${s.code}?all=1`} className="btn secondary w-fit">Show all</Link> : null}

        <p className="fact mt-5 text-[length:var(--text-caption)] text-basalt/50">
          {s.code} · {s.rung_code} · version {s.version} · last changed{" "}
          {dateWords(s.updated_at)}
        </p>
      </div>
    </Screen>
  );
}

