import Link from "@/components/link";
import type { ReactNode } from "react";
import { ColourKeyLine, Swatch } from "@/components/colour-key";
import { ChecksPanel, type Check } from "@/components/children/checks";
import { TopicGrid } from "@/components/children/topic-grid";
import { checkHref, checkLevel, colourRules } from "@/lib/colours";
import { classGrid, stepKey, type GridChild, type Step } from "@/lib/queries-children";
import { grades } from "@/lib/queries";
import { childStates, type States } from "@/lib/states";
import { deadline } from "@/lib/deadline";

// A class against its topics, or one topic opened against its skills (goals/ux4-class-and-child.yaml, goals/ui4b2-class-by-topic.yaml),
// the one body both the class picture's Matrix view (UI-3e) and the old class page draw. Where each child stands, said once — against
// the topics the class has answers in or, a topic opened, against that topic's skills alone — then the checks that would place the
// children the colours cannot say yet. Counted from the class's own grid, never decided here.

export type Matrix = Awaited<ReturnType<typeof loadMatrix>>;

export async function loadMatrix(section: string, email: string) {
  const [{ steps: every, children, notYet: unanswered, band }, rules, g, states] = await deadline(
    Promise.all([classGrid(section, email), colourRules(), grades(), childStates()]),
  );
  return { every, children, unanswered, band, rules, g, states, section };
}

/** `here`: the address of this body; a topic is `here` with `topic=` added. `childHref`: where a child's name leads. */
export function ClassMatrix({ m, asked, here, childHref }: { m: Matrix; asked: string | undefined; here: string; childHref: (c: GridChild) => string }) {
  const { every, children, unanswered, band, rules, states, section } = m;
  // a topic of the class's own opens its skills alone; any other word is every topic's
  const open = every.find((s) => s.topic_code === asked) ?? null;
  const steps = open ? every.filter((s) => s.topic_code === open.topic_code) : every;
  const notYet = open ? unanswered.filter((u) => u.topic_code === open.topic_code) : unanswered;
  const topics = [...new Map(every.map((s) => [s.topic_code, s.topic_name])).entries()];
  const sep = here.includes("?") ? "&" : "?";
  const topicHref = (code: string) => `${here}${sep}topic=${code}`;
  const check = (skill: { code: string; name: string; levels: string[] }, kids: GridChild[], who: ReactNode, none = false): Check => {
    const level = checkLevel(rules, band, skill.levels);
    const href = checkHref(section, kids.map((k) => k.id), [{ skill: skill.code, level, n: rules.checkSize }]);
    return { key: skill.code, skill: skill.name, who, level, n: rules.checkSize, href, none };
  };
  const answered = [...new Map(steps.map((s) => [s.skill_set, { code: s.skill_set, name: s.descriptor, levels: s.levels }])).values()];
  const checks: Check[] = [
    ...answered.flatMap((skill) => {
      const columns = steps.filter((s) => s.skill_set === skill.code);
      const grey = (c: GridChild) => columns.some((s) => !states.of(c.states[stepKey(s)]?.state).enough);
      const answers = (c: GridChild) => Math.max(...columns.map((s) => c.states[stepKey(s)]?.n_events ?? 0));
      const kids = children.filter(grey);
      return kids.length ? [check(skill, kids, <Who kids={kids} answers={answers} />)] : [];
    }),
    ...notYet.map((u) => check(u, children, `All ${children.length}: none has answered it yet`, true)),
  ];
  return (
    <>
      {topics.length ? (
        <nav aria-label="Topic" className="mb-3 flex flex-wrap gap-2">
          <Link href={here} className={`chip ${!open ? "on" : ""}`} aria-current={!open ? "page" : undefined}>
            All topics
          </Link>
          {topics.map(([code, name]) => (
            <Link key={code} href={topicHref(code)} className={`chip ${open?.topic_code === code ? "on" : ""}`} aria-current={open?.topic_code === code ? "page" : undefined}>
              {name}
            </Link>
          ))}
        </nav>
      ) : (
        <p className="note mb-3">No checked answers in this class yet.</p>
      )}
      {open ? (
        <TopicSkills section={section} steps={steps} kids={children} states={states} childHref={childHref} />
      ) : (
        <TopicGrid section={section} steps={every} kids={children} states={states} topicHref={topicHref} childHref={childHref} />
      )}
      <div className="mt-[18px] grid gap-[18px]">
        <ChecksPanel title="Checks that would place them" unanswered="no child has answered yet" checks={checks} />
        <ColourKeyLine rules={rules} states={states} />
      </div>
    </>
  );
}

/** One topic's skills, each child against each: a cell is the child's right answers of all they answered. */
function TopicSkills({ section, steps, kids, states, childHref }: { section: string; steps: Step[]; kids: GridChild[]; states: States; childHref: (c: GridChild) => string }) {
  return (
    <>
      <div id="steps" className="panel scroll-mt-6 overflow-x-auto">
        <table className="grid" aria-label={`${section}: each child on each step`}>
          <thead>
            <tr>
              <th className="pin">Child</th>
              {steps.map((s) => (
                <th key={stepKey(s)} data-col={stepKey(s)} title={s.descriptor} className="num min-w-[96px] max-w-[120px] align-top">
                  {/* the table's headings are small capitals; a step's words are a sentence, so they are set as one */}
                  <span className="line-clamp-3 block text-[11.5px] font-normal normal-case leading-tight tracking-normal text-basalt/75">
                    {s.descriptor}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {kids.map((c) => (
              <tr key={c.id} data-child={c.id}>
                {/* the names stay put while a phone scrolls the steps */}
                <td className="pin whitespace-nowrap">
                  <span className="fact mr-2 text-basalt/55">{c.roll_no}</span>
                  <Link href={childHref(c)} className="underline decoration-basalt/30 underline-offset-4">
                    {c.first_name}
                  </Link>
                </td>
                {steps.map((s) => (
                  <Cell key={stepKey(s)} step={s} got={c.states[stepKey(s)]} states={states} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note mt-3">
        Each skill easy to hard, as the Curriculum orders them. A cell is the child&rsquo;s right answers of all they answered.
      </p>
    </>
  );
}

function Cell({ step, got, states }: { step: Step; got?: { state: string; n_events: number; n_correct: number }; states: States }) {
  const colour = states.of(got?.state).colour;
  const said = `${step.skill_name} — ${got?.n_events ? `${got.n_correct} of ${got.n_events} right, ${states.say(got.state)}` : "no answers yet"}`;
  return (
    <td data-col={stepKey(step)} data-rag={colour} title={said} className="num">
      {got?.n_events ? (
        <span className="inline-flex items-center gap-1">
          <Swatch colour={colour} label={said} />
          <span className="fact text-[12px]">
            {got.n_correct}/{got.n_events}
          </span>
        </span>
      ) : (
        <span className="text-basalt/30" aria-label={said}>
          —
        </span>
      )}
    </td>
  );
}

/** Who a check is for: how many children, their names and their answers on the skill so far folded under it. */
function Who({ kids, answers }: { kids: GridChild[]; answers: (k: GridChild) => number }) {
  return (
    <details>
      <summary className="cursor-pointer whitespace-nowrap">
        {kids.length} {kids.length === 1 ? "child" : "children"}
      </summary>
      <span className="mt-1 block">
        {kids.map((k, i) => {
          const n = answers(k);
          return (
            <span key={k.id} className="whitespace-nowrap">
              {k.first_name} <span className="text-basalt/55">({n ? `${n} answer${n === 1 ? "" : "s"}` : "none"})</span>
              {i < kids.length - 1 ? ", " : ""}
            </span>
          );
        })}
      </span>
    </details>
  );
}
