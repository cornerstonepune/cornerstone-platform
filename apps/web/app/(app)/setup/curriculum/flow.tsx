import Link from "@/components/link";
import { EmptyState } from "@/components/empty-state";
import { MachineIf } from "@/components/origin";
import { Icon } from "@/lib/icons";
import { activitiesOf, objectives, options } from "@/lib/curriculum-objectives";

const HERE = "/setup/curriculum";
type Pick = { grade?: string; subject?: string; topic?: string; objective?: string };

// Curriculum as one flow (CP-65, Nimish 17 Nov 2026): choose a grade, then a subject, then a topic, then an objective, then see its
// activities. Each step is a row of chips with a count; each choice is the address, so every state can be linked. An objective shows
// the capability it counts toward and that capability's words, and the machine's carry the machine mark. Nothing is typed.
export async function Flow({ pick, grades }: { pick: Pick; grades: { code: string; name: string }[] }) {
  const opt = await options();
  const grade = opt.grades.includes(pick.grade ?? "") ? pick.grade : undefined;
  const subjects = opt.subjects;
  const subject = subjects.some((s) => s.code === pick.subject) ? pick.subject : undefined;
  const topics = opt.topics.filter((t) => t.subject === subject);
  const topic = topics.some((t) => t.code === pick.topic) ? pick.topic : undefined;
  const { rows, total } = topic ? await objectives({ grade, subject, topic, page: 1, size: 200 }) : { rows: [], total: 0 };
  const objective = rows.find((r) => r.code === pick.objective);
  const acts = objective ? await activitiesOf(objective.code) : [];
  const at = (over: Pick) => {
    const s = new URLSearchParams(Object.entries(over).flatMap(([k, v]) => (v ? [[k, v]] : [])));
    return s.size ? `${HERE}?${s}` : HERE;
  };
  const chip = (href: string, on: boolean, words: string, key: string, n?: number) => (
    <Link key={key} href={href} scroll={false} data-flow-chip={key} aria-current={on || undefined} className={`btn ${on ? "" : "secondary"}`}>
      {words}
      {n === undefined ? null : <span className="b-num"> {n.toLocaleString("en-IN")}</span>}
    </Link>
  );
  return (
    <div className="grid gap-[var(--space-3)]" data-curriculum-flow>
      <nav aria-label="Grade" className="flex flex-wrap items-center gap-[var(--space-2)]">
        {grades.filter((g) => opt.grades.includes(g.code)).map((g) => chip(at({ grade: g.code }), grade === g.code, g.name, g.code))}
      </nav>
      {grade ? (
        <nav aria-label="Subject" className="flex flex-wrap items-center gap-[var(--space-2)]">
          {subjects.map((s) => chip(at({ grade, subject: s.code }), subject === s.code, s.name, s.code))}
        </nav>
      ) : null}
      {subject ? (
        <nav aria-label="Topic" className="flex flex-wrap items-center gap-[var(--space-2)]">
          {topics.map((t) => chip(at({ grade, subject, topic: t.code }), topic === t.code, t.name, t.code))}
        </nav>
      ) : null}
      {topic ? (
        rows.length ? (
          <ul aria-label="Objectives" className="grid gap-[var(--space-2)]">
            {rows.map((r) => {
              const on = objective?.code === r.code;
              return (
                <li key={r.code} data-objective={r.code} className="b-card grid gap-[var(--space-1)] p-[var(--space-3)]">
                  <Link href={at({ grade, subject, topic, objective: on ? undefined : r.code })} scroll={false} aria-current={on || undefined} data-objective-row className="flex flex-wrap items-center gap-[var(--space-2)]">
                    <span className="font-semibold">{r.title}</span>
                    <MachineIf origin={r.origins} />
                    <span className="b-muted b-num">{r.activities}</span>
                    <Icon name="activity" size={16} />
                  </Link>
                  {r.capability ? (
                    <p className="b-muted" data-capability>
                      {r.capability}
                      {r.words.length ? <span> · {r.words.join(" · ")}</span> : null}
                    </p>
                  ) : null}
                  {on ? (
                    acts.length ? (
                      <ul aria-label="Activities" className="mt-[var(--space-2)] grid gap-[var(--space-1)]">
                        {acts.map((a) => (
                          <li key={a.code} className="flex items-center gap-[var(--space-2)]">
                            <Link href={`${at({ grade, subject, topic, objective: r.code })}&open=activity:${encodeURIComponent(a.code)}`} data-activity-row={a.code}>
                              {a.name}
                            </Link>
                            <MachineIf origin={a.origins} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="b-muted">No activity yet.</p>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState>No objective here yet.</EmptyState>
        )
      ) : (
        <p className="b-muted" data-total={total}>{!grade ? "Choose a grade." : !subject ? "Choose a subject." : "Choose a topic."}</p>
      )}
    </div>
  );
}
