import { notFound } from "next/navigation";
import { Cards } from "@/components/cards";
import { ClassGrid, type GridCell, type Look as CellLook } from "@/components/class-grid";
import { Details } from "@/components/details";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { Rail, Screen, type Edge } from "@/components/app-frame";
import { Spark } from "@/components/spark";
import { StackBar } from "@/components/stack-bar";
import { EMERGING, PRACTISING, SECURE, STATES, type State } from "@/components/status-chip";
import type { IconName } from "@/lib/icons";
import { requireStaff } from "@/lib/auth";
import { openTo } from "@/lib/educator/data";
import { screenHref } from "@/lib/built";
import { skillOf, type Kid } from "@/lib/teaching";

// One skill (UI-3c): where a class stands on it, from confirmed notes and papers. A child not seen on it is not seen, nothing
// more. The grid is the class picture's, one skill at a time; a prerequisite or a next skill is drawn only when a person
// confirmed the link (skill_link_confirmed); the spark draws only fortnights that were recorded.
// A seen state looks as its colour says; its words and icon are the status chip's own. The icons and the keys of the stack bar
// are the status chip's own growth constants, so no state is named here.
const LOOK: Record<Kid["look"], { cell: CellLook; icon: IconName; state: State }> = {
  green: { cell: "ok", icon: STATES[SECURE].icon, state: SECURE },
  amber: { cell: "wait", icon: STATES[PRACTISING].icon, state: PRACTISING },
  other: { cell: "quiet", icon: STATES[EMERGING].icon, state: EMERGING },
  unseen: { cell: "unseen", icon: STATES.notSeenYet.icon, state: "notSeenYet" },
};
const ORDER: Kid["look"][] = ["green", "amber", "other", "unseen"];
const initials = (n: string) => n.split(/\s+/).map((w) => w.charAt(0)).join("").slice(0, 2).toUpperCase();

export default async function SkillScreen({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireStaff();
  const [{ code }, q] = await Promise.all([params, searchParams]);
  await openTo(me);
  const s = await skillOf(me, decodeURIComponent(code), q.class);
  if (!s) notFound();
  const href = (c: string) => screenHref("skill", { code: c }) ?? `/setup/skills/${encodeURIComponent(c)}`;
  const counts = ORDER.map((k) => ({ look: k, n: s.kids.filter((x) => x.look === k).length }));
  const cell = (k: Kid): GridCell => ({ key: k.id, no: k.roll.padStart(2, "0"), initials: initials(k.name), name: k.name, look: LOOK[k.look].cell, icon: LOOK[k.look].icon, words: STATES[LOOK[k.look].state].words, label: `${k.roll} ${k.name}, ${STATES[LOOK[k.look].state].words}` });
  const by = q.by === "class" && me.role === "coordinator" ? "class" : "state";
  const edges: Edge[] = [
    ...(s.cls ? [{ screen: "picture", params: { class: s.cls.id }, label: "The class picture", icon: "class" } as Edge] : []),
    ...s.objectives.map((o): Edge => ({ screen: "objective", params: { code: o.code }, label: o.title, icon: "objective" })),
    ...[...s.after, ...s.next].map((k): Edge => ({ screen: "skill", params: { code: k.code }, label: k.name, icon: "skill" })),
  ];
  const links = (list: { code: string; name: string }[], none: string) =>
    list.length ? list.map((k) => ({ kind: "skill" as const, title: k.name, line: none, href: href(k.code), link: "Open the skill" })) : [];
  return (
    <Screen
      stage={`Skill · ${s.domain || "Skill"}`}
      title={s.name}
      purpose="Where the class stands on this skill, from confirmed notes and papers. A child not seen on it is not seen, nothing more."
      action={<span className="text-[length:var(--text-label)] text-[var(--ink-muted)]">{s.cls ? `${s.cls.section} · ${s.code}` : s.code}</span>}
      next={{ href: "/today", label: "Today" }}
      rail={<Rail edges={edges} />}
    >
      <div className="grid gap-[var(--space-3)]">
        {s.rebuilt ? <p className="b-caption">Rebuilt {s.rebuilt.slice(0, 16).replace("T", " ")}, from confirmed notes and papers</p> : null}
        <FilterBar
          action={`/setup/skills/${encodeURIComponent(s.code)}`}
          filters={[
            ...(s.classes.length > 1 ? [{ name: "class", label: "Class", value: s.cls?.id, all: "Choose a class", options: s.classes.map((c) => [c.id, c.section] as const), required: !!s.cls }] : []),
            { name: "by", label: "Group by", value: by, all: "State on this skill", required: true, options: [["state", "State on this skill"], ...(me.role === "coordinator" ? [["class", "Class"] as const] : [])] },
          ]}
        />
        {!s.cls ? (
          <EmptyState>Choose a class to see where it stands on this skill.</EmptyState>
        ) : s.kids.length === 0 ? (
          <EmptyState>Nobody is enrolled in this class.</EmptyState>
        ) : (
          <>
            <StackBar parts={counts.map((c) => ({ state: LOOK[c.look].state, n: c.n }))} />
            <section aria-label="Secure, fortnight by fortnight">
              <h2 className="text-[length:var(--text-title-small)]">Secure, fortnight by fortnight</h2>
              <Spark values={[]} label="Secure" empty="No fortnights recorded yet" />
            </section>
            {(by === "class" ? [{ key: s.cls.section, title: s.cls.section, kids: s.kids }] : counts.map((c) => ({ key: c.look, title: STATES[LOOK[c.look].state].words, kids: s.kids.filter((k) => k.look === c.look) }))).map((g) =>
              g.kids.length ? (
                <section key={g.key} aria-label={`${g.title}, ${g.kids.length} children`} data-group={g.key}>
                  <h3 className="mb-[var(--space-1)]">
                    {g.title} <span className="b-num" data-count>{g.kids.length}</span>
                  </h3>
                  <ClassGrid cells={g.kids.map(cell)} label={`${g.title} on ${s.name}, by Sr. No.`} />
                </section>
              ) : null,
            )}
          </>
        )}
        {s.after.length || s.next.length ? (
          <>
            <Cards cards={links(s.after, "Comes before this skill (confirmed).").slice(0, 3)} />
            <Cards cards={links(s.next, "Ready next (confirmed).").slice(0, 3)} />
          </>
        ) : (
          <p className="b-caption">Only links a person confirmed are read. None is confirmed for this skill yet.</p>
        )}
        {s.levels.length ? (
          <Details summary="Each level in a sentence" name="levels">
            <ul>
              {s.levels.map((l) => (
                <li key={l.difficulty}>
                  <b>{l.difficulty}</b> · {l.looks_like}
                </li>
              ))}
            </ul>
          </Details>
        ) : null}
      </div>
    </Screen>
  );
}
