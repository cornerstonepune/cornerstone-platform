import type { Opened } from "@/components/detail-panel";
import { KeyValue } from "@/components/key-value";
import { levelsOf, type SkillSet } from "@/lib/queries";
import { skillSetHref } from "@/lib/skill-set-href";
import { approveSkills } from "../../../skill-sets/[code]/actions";

// One skill waiting for approval, in the detail panel of Skills to approve (page charter Part C: "keep, Workspace; one skill at a time on
// the right"). Its levels are read here, then approved here, this skill alone (Nimish: no bulk button; every approval separate): the form
// names the one skill and the version it showed, and goes back to the list under the same choices with the next skill open. The skill's own
// page is the panel opened full page, where its levels are edited. The panel's tabs are `read` and `about`: `tab=levels` is the page's own
// second list (Levels to review), so no panel tab may be called that.
export function skillOpened(
  x: SkillSet,
  o: { grade: string; mayApprove: boolean; opened: string; back: string; tab?: string; closeHref: string },
): Opened {
  const levels = (
    // each level a box of its own, named, in the order Easy, Medium, Hard, Advance
    <dl className="grid gap-[var(--space-2)] text-[13px]" data-levels="">
      {levelsOf(x).map((d) => (
        <div key={d} className="rounded-[var(--radius-card)] bg-[var(--panel)] p-[var(--space-2)]">
          <dt className="label pb-[2px]">{d}</dt>
          <dd>{x.difficulty[d]?.words}</dd>
        </div>
      ))}
    </dl>
  );
  const about = (
    <KeyValue
      rows={[
        { label: "Grade", value: o.grade },
        { label: "Subject", value: x.subject_name ?? "none" },
        { label: "Topic", value: x.topic_name ?? "none" },
        { label: "Taught", value: x.taught ? "taught in a class" : "not taught yet" },
        { label: "Code and version", value: `${x.code} · version ${x.version}`, num: true },
      ]}
    />
  );
  return {
    key: `skill:${x.code}`,
    kind: "skill",
    title: x.name,
    line: [o.grade, x.subject_name, x.topic_name].filter(Boolean).join(" · "),
    full: skillSetHref(x.code),
    closeHref: o.closeHref,
    actions: o.mayApprove ? (
      // this skill alone: the form names the one skill, and the action approves only it
      <form action={approveSkills}>
        <input type="hidden" name="back" value={o.back} />
        <input type="hidden" name="opened" value={o.opened} />
        <input type="hidden" name="code" value={x.code} />
        <input type="hidden" name="version" value={x.version} />
        <button type="submit" name="only" value={x.code} className="btn" data-approve="" data-ux="action">
          Approve<span className="sr-only"> {x.name}</span>
        </button>
      </form>
    ) : undefined,
    tabs: [
      { key: "read", label: "Levels", body: levels },
      { key: "about", label: "About", body: about },
    ],
    tab: o.tab,
  };
}
