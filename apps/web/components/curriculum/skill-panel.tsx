import type { Opened } from "@/components/detail-panel";
import { SubjectTag } from "@/components/subject-tag";
import { StatusChip } from "@/components/status-chip";
import { Icon, ICON_SIZE } from "@/lib/icons";
import type { SkillSet } from "@/lib/queries";
import { subjectLook, type Looks } from "@/lib/subject-looks";
import { Say } from "@/app/(app)/setup/curriculum/skills/curriculum-skills";

// A skill of grades 1 to 4 on Curriculum's right (`open=skill:<code>`): its subject, topic and grade as tags; its levels in the school's
// order as a locked rubric, one row each with the level's own sentence (`skill_level`, read-only here: a level is changed on the skill's
// own page and approved there); and, where the person may say it, "Say it is taught" for each class of theirs not taught it yet — the
// button the old skill list carried on its row. Activities are not shown: no read links a skill of grades 1 to 4 to an activity.
export function skillOpened(
  s: SkillSet,
  o: { key: string; closeHref: string; full: string; tab?: string; grade: string; order: readonly string[]; looks: Looks; untaught: string[]; say: boolean },
): Opened {
  const levels = o.order.filter((d) => s.levels.includes(d));
  const body = (
    <div className="grid gap-[var(--space-3)]">
      <p className="flex flex-wrap items-center gap-[var(--space-2)]" data-skill-tags>
        {s.subject_name ? <SubjectTag look={subjectLook(o.looks, s.subject_code)} words={s.subject_name} /> : null}
        {s.topic_name ? <span className="b-label b-muted" data-tag="topic">{s.topic_name}</span> : null}
        <span className="b-label b-muted" data-tag="grade">{o.grade}</span>
        <StatusChip state={s.status === "ratified" ? "approved" : "toApprove"} />
      </p>
      <section aria-label="The levels" className="grid gap-[var(--space-2)]" data-rubric>
        <h3 className="flex items-center gap-[var(--space-1)] font-semibold">
          <Icon name="frozen" size={ICON_SIZE.table} /> The levels, read only
        </h3>
        <ol className="grid gap-[var(--space-2)]">
          {levels.map((d) => (
            <li key={d} data-level={d} className="grid grid-cols-[6rem_1fr] gap-[var(--space-2)] border-t border-[var(--line,currentColor)] pt-[var(--space-2)]">
              <span className="flex items-center gap-[var(--space-1)] font-semibold">
                <Icon name="skill" size={ICON_SIZE.table} />
                {d}
              </span>
              <span>{s.difficulty[d]?.words || "Not written yet."}</span>
            </li>
          ))}
        </ol>
      </section>
      {o.say && o.untaught.length && s.topic_code ? (
        <section aria-label="Taught" className="grid gap-[var(--space-1)]" data-skill-say>
          <h3 className="font-semibold">Not taught yet in {o.untaught.join(", ")}</h3>
          <Say line={{ untaught: o.untaught, topicOf: s.topic_code, skillCode: s.code }} />
        </section>
      ) : null}
    </div>
  );
  return {
    key: o.key,
    kind: "skill",
    title: s.name,
    line: [s.code, o.grade, s.subject_name, s.topic_name].filter(Boolean).join(" · "),
    full: o.full,
    closeHref: o.closeHref,
    tab: o.tab,
    tabs: [{ key: "levels", label: "Levels", body }],
  };
}
