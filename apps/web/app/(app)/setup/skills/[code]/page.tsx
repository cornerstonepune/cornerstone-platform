import { notFound } from "next/navigation";
import { Cards } from "@/components/cards";
import { PeekPanel, PeekProvider } from "@/components/children/peek";
import { PictureGrid, type Square } from "@/components/children/picture-grid";
import { Details } from "@/components/details";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { Rail, Screen, type Edge } from "@/components/app-frame";
import { Spark } from "@/components/spark";
import { StackBar } from "@/components/stack-bar";
import { STATES } from "@/components/status-chip";
import { requireStaff } from "@/lib/auth";
import { openTo } from "@/lib/educator/data";
import { screenHref } from "@/lib/built";
import { LOOK_ORDER, groupByLook, peekParam } from "@/lib/children-view";
import { stateOf } from "@/lib/looks";
import { skillOf } from "@/lib/teaching";

// One skill (UI-3c): where a class stands on it, from confirmed notes and papers. A child not seen on it is not seen, nothing
// more. The grid and the peek are the class picture's (UI-3b), one skill at a time: a tap on a square opens that child's recent
// history in the rail. A prerequisite or a next skill is drawn only when a person confirmed the link (skill_link_confirmed); the
// spark draws only fortnights that were recorded. No state is named here: the keys, icons and words are the status chip's.
export default async function SkillScreen({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireStaff();
  await openTo(me);
  const [{ code }, q] = await Promise.all([params, searchParams]);
  const s = await skillOf(me, decodeURIComponent(code), q.class);
  if (!s) notFound();
  const href = (c: string) => screenHref("skill", { code: c }) ?? `/setup/skills/${encodeURIComponent(c)}`;
  const section = s.cls?.section ?? "";
  const squares: Square[] = s.kids.map((k) => ({ classId: s.cls!.id, roll: k.roll, name: k.name, section, counts: k.counts, look: k.look, skill: s.name }));
  const words = (look: Square["look"]) => STATES[stateOf(look)].words;
  const blocks = groupByLook(squares).map((g) => ({ look: g.look, words: words(g.look), squares: g.cells }));
  const open = squares.find((x) => peekParam(x) === q.peek);
  const edges: Edge[] = [
    ...(s.cls ? [{ screen: "picture", params: { class: s.cls.id }, label: "The class picture", icon: "class" } as Edge] : []),
    ...s.objectives.map((o): Edge => ({ screen: "objective", params: { code: o.code }, label: o.title, icon: "objective" })),
    ...[...s.after, ...s.next].map((k): Edge => ({ screen: "skill", params: { code: k.code }, label: k.name, icon: "skill" })),
  ];
  const links = (list: { code: string; name: string }[], line: string) => list.map((k) => ({ kind: "skill" as const, title: k.name, line, href: href(k.code), link: "Open the skill" }));
  return (
    <PeekProvider initial={open ?? null}>
      <Screen
        stage={`Skill · ${s.domain || "Skill"}`}
        title={s.name}
        purpose="Where the class stands on this skill, from confirmed notes and papers. A child not seen on it is not seen, nothing more."
        action={<span className="text-[length:var(--text-label)] text-[var(--ink-muted)]">{s.cls ? `${section} · ${s.code}` : s.code}</span>}
        next={{ href: "/today", label: "Today" }}
        rail={
          <aside aria-label="Rail" data-rail className="grid content-start gap-[var(--space-3)]">
            <PeekPanel />
            <Rail edges={edges} />
          </aside>
        }
      >
        <div className="grid gap-[var(--space-3)]">
          {s.rebuilt ? <p className="b-caption">Rebuilt {s.rebuilt.slice(0, 16).replace("T", " ")}, from confirmed notes and papers</p> : null}
          {s.classes.length > 1 ? (
            <FilterBar action={`/setup/skills/${encodeURIComponent(s.code)}`} filters={[{ name: "class", label: "Class", value: s.cls?.id, all: "Choose a class", options: s.classes.map((c) => [c.id, c.section] as const), required: !!s.cls }]} />
          ) : null}
          {!s.cls ? (
            <EmptyState>Choose a class to see where it stands on this skill.</EmptyState>
          ) : s.kids.length === 0 ? (
            <EmptyState>Nobody is enrolled in this class.</EmptyState>
          ) : (
            <>
              <StackBar parts={LOOK_ORDER.map((look) => ({ state: stateOf(look), n: s.kids.filter((k) => k.look === look).length }))} />
              <section aria-label="Secure, fortnight by fortnight">
                <h2 className="text-[length:var(--text-title-small)]">Secure, fortnight by fortnight</h2>
                <Spark values={[]} label="Secure" empty="No fortnights recorded yet" />
              </section>
              <PictureGrid blocks={blocks} grouped label={`${s.name}`} />
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
    </PeekProvider>
  );
}
