import { EmptyState } from "@/components/empty-state";
import { SUBJECT } from "@/components/fortnight-grid";
import { Part, RubricRows } from "@/components/lesson-panel";
import { PeriodRow, type Period } from "@/components/period-row";
import type { Session } from "@/lib/auth";
import { lessonView, type LessonView } from "@/lib/lesson-view";
import { subjectLook, type Looks } from "@/lib/subject-looks";
import type { MyLesson } from "@/lib/today-data";
import { classWords } from "@/lib/voice-types";
import { todayAt as dayAt } from "./waiting-work";

// My day, part one (CP-69): the day's lessons as a strip of cards in their subject colours, in period order. A lesson opens in place to its
// preparation: what it is for, the activity's steps, the materials to get ready and, where the activity has one, the rubric. A part is drawn only
// where the data has it, and never as a placeholder: a lesson with an objective and nothing else shows the objective alone.
const has = (s: string | null | undefined) => !!s && s.trim() !== "";

/** The parts of the lesson's preparation that have words, each as it is read on the lesson's own panel (components/lesson-panel.tsx). */
function Prep({ v }: { v: LessonView }) {
  const objective = v.objective?.text || v.full?.outcome;
  const steps = v.steps?.items.length || has(v.steps?.text) || has(v.full?.steps);
  const materials = v.page?.materials.items.length || has(v.page?.materials.text) || has(v.full?.materials_text);
  const levels = v.full?.levels ?? [];
  const rubric = levels.some(Boolean);
  if (!has(objective) && !steps && !materials && !rubric) return null;
  return (
    <div className="b-card grid gap-[var(--space-3)]" data-lesson-prep>
      {has(objective) ? (
        <div data-prep="objective">
          <Part title="What it is for" machine={v.objective?.source === "drafted"}>
            <p data-part="outcome">{objective}</p>
          </Part>
        </div>
      ) : null}
      {steps ? (
        <div data-prep="steps">
          <Part title="The steps" machine={v.steps?.source === "drafted"}>
            {v.steps?.items.length ? (
              <ol className="list-decimal pl-[var(--space-4)]" data-part="steps">
                {v.steps.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ol>
            ) : (
              <p className="whitespace-pre-line">{v.steps?.text || v.full?.steps}</p>
            )}
          </Part>
        </div>
      ) : null}
      {materials ? (
        <div data-prep="materials">
          <Part title="Get ready">
            {v.page?.materials.items.length ? (
              <ul className="list-disc pl-[var(--space-4)]" data-part="materials">
                {v.page.materials.items.map((m) => (
                  <li key={m.name}>
                    {m.name}
                    {m.quantity ? ` · ${m.quantity}${m.unit ? ` ${m.unit}` : ""}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="whitespace-pre-line">{v.page?.materials.text || v.full?.materials_text}</p>
            )}
          </Part>
        </div>
      ) : null}
      {rubric ? (
        <div data-prep="rubric">
          <Part title="The rubric">
            <RubricRows levels={levels} hideEmpty />
          </Part>
        </div>
      ) : null}
    </div>
  );
}

/** The strip. `open`: the lesson (session id) whose preparation is drawn under its card. `q`: the address's own words, kept in every link. */
export async function MyLessons({ me, lessons, scope, open, q, looks, gradeName }: { me: Session; lessons: readonly MyLesson[]; scope: "mine" | "school"; open: string | null; q: Record<string, string | undefined>; looks: Looks; gradeName: (g: string) => string }) {
  if (!lessons.length) return <EmptyState>No lesson is planned for this day.</EmptyState>;
  const view = open && lessons.some((l) => l.session_id === open) ? await lessonView(me, open) : null;
  const periods: Period[] = lessons.map((l) => {
    const look = subjectLook(looks, l.subject);
    const klass = classWords({ grade: l.class.grade, section: l.class.section, gradeName: gradeName(l.class.grade) });
    const isOpen = l.session_id === open;
    return {
      time: `${l.starts_at}${l.ends_at ? `–${l.ends_at}` : ""}`,
      subject: look,
      name: l.activity?.name ?? l.name,
      fact: [SUBJECT[look], scope === "school" || lessons.some((x) => x.class.id !== l.class.id) ? klass : null].filter(Boolean).join(" · "),
      href: dayAt(q, { open: isOpen ? undefined : `lesson:${l.session_id}` }),
      openKey: `lesson:${l.session_id}`,
      selected: isOpen,
      attrs: { "data-lesson": l.session_id, "data-subject": look },
      linkAttrs: { "data-lesson-open": "" },
      after: isOpen && view ? <Prep v={view} /> : undefined,
    };
  });
  return (
    <div data-my-lessons>
      <PeriodRow strip tinted label="Lessons" periods={periods} />
    </div>
  );
}
