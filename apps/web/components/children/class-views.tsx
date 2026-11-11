import type { ReactNode } from "react";
import { Screen } from "@/components/app-frame";
import { ClassMatrix, loadMatrix } from "@/components/children/class-matrix";
import { TopicsTable, type Open } from "@/components/children/by-topic";
import { ColourKeyLine } from "@/components/colour-key";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { NOT_ASSESSED } from "@/components/standing";
import type { Session } from "@/lib/auth";
import { colourRules } from "@/lib/colours";
import { deadline } from "@/lib/deadline";
import { classTopics } from "@/lib/queries-results";
import { childStates } from "@/lib/states";

// The class picture's two other views (UI-3e), which carry what /growth (Class results) and /growth/class/[section] showed:
// "By topic" (topics as rows, who is secure or practising; a topic opens its skills, a skill its children) and "Matrix" (each child
// against each topic, a topic opened against its skills). Same reads and rules as those pages; the address carries what is open.
type Q = Record<string, string | undefined>;

export async function ClassViews({ me, classId, section, view, q, toggle }: { me: Session; classId: string; section: string; view: "topic" | "matrix"; q: Q; toggle: ReactNode }) {
  const here = `/children/${classId}?view=${view}`;
  return (
    <Screen
      stage={`${section} · class`}
      title="Class picture"
      purpose={view === "topic" ? "Each topic of the class: who is secure, practising or needs help. Open a topic for its skills, a skill for its children." : "Each child against each topic of the class. Open a topic for its skills; a name opens the child."}
      next={{ href: "/children", label: "Children" }}
    >
      <div className="mb-3">{toggle}</div>
      {view === "topic" ? <ByTopic me={me} classId={classId} section={section} q={q} /> : <Matrix me={me} classId={classId} section={section} here={here} asked={q.topic} />}
    </Screen>
  );
}

async function Matrix({ me, classId, section, here, asked }: { me: Session; classId: string; section: string; here: string; asked: string | undefined }) {
  const m = await loadMatrix(section, me.email);
  if (!m.children.length) return <EmptyState>No child in this class yet.</EmptyState>;
  return <ClassMatrix m={m} asked={asked} here={here} childHref={(c) => `/children/${classId}/${encodeURIComponent(c.roll_no)}`} />;
}

async function ByTopic({ me, classId, section, q }: { me: Session; classId: string; section: string; q: Q }) {
  const [topics, states, rules] = await deadline(Promise.all([classTopics(section, me), childStates(), colourRules()]));
  const subjects = [...new Map(topics.map((t) => [t.subject_code, t.subject])).entries()];
  const subject = subjects.some(([c]) => c === q.subject) ? q.subject : undefined;
  const shown = topics.filter((t) => !subject || t.subject_code === subject);
  const o: Open = {
    section,
    base: { path: `/children/${classId}`, params: { view: "topic" } },
    subject,
    topic: shown.some((t) => t.code === q.topic) ? q.topic : undefined,
    skill: q.skill,
    page: Math.max(1, Math.floor(Number(q.kp)) || 1),
  };
  const words = (["green", "amber", "red", "grey"] as const).map((c) => states.colours[c].count_words);
  if (!topics.length) return <EmptyState>No topic has been assessed in this class yet.</EmptyState>;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-[18px]">
      {subjects.length > 1 ? <FilterBar action={`/children/${classId}`} keep={{ view: "topic" }} filters={[{ name: "subject", label: "Subject", value: subject, all: "Every subject", options: subjects }]} /> : null}
      <section aria-label={`Topics of ${section}`}>
        <h2 className="label mb-2">
          {section} · {shown.length} {shown.length === 1 ? "topic" : "topics"}
        </h2>
        <TopicsTable me={me} o={o} states={states} topics={shown} />
      </section>
      <details className="text-[12px] text-basalt/65">
        <summary className="cursor-pointer text-basalt/55 underline underline-offset-2">Details</summary>
        <div className="mt-3 grid gap-3">
          <p className="note">
            From checked answers only. Each child is counted once in a topic, by the skill of it they are weakest on: &ldquo;{words.join("”, “")}&rdquo;. A child with no checked answer in the topic is &ldquo;{NOT_ASSESSED}&rdquo;. A child&rsquo;s level is the level of the newest question they answered on the skill.
          </p>
          <ColourKeyLine rules={rules} states={states} />
        </div>
      </details>
    </div>
  );
}
