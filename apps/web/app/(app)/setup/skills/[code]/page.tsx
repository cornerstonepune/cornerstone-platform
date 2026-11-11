import { notFound } from "next/navigation";
import { Cards } from "@/components/cards";
import { PeekPanel, PeekProvider } from "@/components/children/peek";
import { Clusters, PictureGrid, type Square } from "@/components/children/picture-grid";
import { Details } from "@/components/details";
import { LevelWords, type Earlier } from "@/components/teaching/level-words";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { Screen } from "@/components/app-frame";
import { kindWords, mistakeOf } from "@/components/question";
import { RailAside, TeachingRail, type RailLink } from "@/components/teaching/rail";
import { Spark } from "@/components/spark";
import { StackBar } from "@/components/stack-bar";
import { STATES } from "@/components/status-chip";
import { requireStaff } from "@/lib/auth";
import { enginePost } from "@/lib/engine";
import { staffNames } from "@/lib/timetable-ui";
import { openTo } from "@/lib/educator/data";
import { screenHref } from "@/lib/built";
import { LOOK_ORDER, groupByLook, peekParam } from "@/lib/children-view";
import { stateOf } from "@/lib/looks";
import { skillOf } from "@/lib/teaching";
import { whatItAsks } from "@/lib/teaching-skill";
import { questionKinds } from "@/lib/question-types";
import { mistakeBook } from "@/lib/queries-bank";

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
  const chips = Object.fromEntries(s.kids.map((k, i) => [k.id, squares[i]]));
  const open = squares.find((x) => peekParam(x) === q.peek);
  const links: RailLink[] = [
    ...(s.cls ? [{ kind: "child", screen: "picture", params: { class: s.cls.id }, fallback: `/children/${s.cls.id}?skill=${encodeURIComponent(s.code)}`, label: s.cls.section, note: "the class picture on this skill" } satisfies RailLink] : []),
    ...[...new Map(s.objectives.map((o) => [o.code, o])).values()].slice(0, 6).map((o): RailLink => ({ kind: "objective", screen: "objective", href: screenHref("objective", { code: o.code }) ?? `/setup/objectives/${encodeURIComponent(o.code)}`, label: o.title || o.code, note: "its objective" })),
    ...s.after.map((k): RailLink => ({ kind: "skill", screen: "skill", href: href(k.code), label: k.name, note: "comes after" })),
    ...s.next.map((k): RailLink => ({ kind: "skill", screen: "skill", href: href(k.code), label: k.name, note: "ready next" })),
    { kind: "assessment", screen: "bank", label: "Question bank", note: "for this skill" },
  ];
  const [asks, { words: kindWordsOf }, book] = await Promise.all([whatItAsks(s.code), questionKinds(), mistakeBook()]);
  const mistakes = asks.mistakes.map((c) => ({ code: c, said: mistakeOf(book, c) })).filter((m): m is { code: string; said: NonNullable<typeof m.said> } => !!m.said);
  // a coordinator may change a level's sentence and reads its earlier ones; the engine decides who may (a refusal leaves it unchanged)
  const reviews = me.role === "coordinator";
  const names = reviews && s.levels.length ? await staffNames() : new Map<string, string>();
  const earlier = new Map<string, Earlier[]>();
  if (reviews)
    await Promise.all(
      s.levels.map(async (l) => {
        try {
          const got = (await enginePost("/curriculum/level-words/history", { actor: me.email, skill: l.set, level: l.difficulty })) as { history: { at: string; staff: string | null; was: string | null; now: string | null; reason: string | null }[] };
          earlier.set(`${l.set}/${l.difficulty}`, got.history.map((h) => ({ at: h.at.slice(0, 16).replace("T", " "), who: (h.staff && names.get(h.staff)) || "a member of staff", was: h.was, now: h.now, reason: h.reason })));
        } catch {
          earlier.set(`${l.set}/${l.difficulty}`, []);
        }
      }),
    );
  const list = (items: { code: string; name: string }[]) => (
    <ul className="m-0 grid list-none gap-[var(--space-1)] p-0">
      {items.map((k) => (
        <li key={k.code}>
          <a href={href(k.code)}>{k.name}</a>
        </li>
      ))}
    </ul>
  );
  return (
    <PeekProvider initial={open ?? null}>
      <Screen
        stage={`Skill · ${s.domain || "Skill"}`}
        title={s.name}
        purpose="Where the class stands on this skill, from confirmed notes and papers. A child not seen on it is not seen, nothing more."
        action={<span className="text-[length:var(--text-label)] text-[var(--ink-muted)]">{s.cls ? `${section} · ${s.code}` : s.code}</span>}
        next={{ href: "/today", label: "Today" }}
        rail={
          <RailAside>
            <PeekPanel />
            <TeachingRail links={links} />
          </RailAside>
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
              <Cards
                cards={[
                  { kind: "skill", title: "The class now", body: <StackBar parts={LOOK_ORDER.map((look) => ({ state: stateOf(look), n: s.kids.filter((k) => k.look === look).length }))} /> },
                  { kind: "skill", title: "Secure, fortnight by fortnight", body: <Spark values={[]} label="Secure" empty="No fortnights recorded yet" /> },
                ]}
              />
              <section aria-label="Clusters">
                <h2 className="text-[length:var(--text-title-small)]">Clusters</h2>
                <Clusters clusters={s.clusters} kids={chips} />
              </section>
              <PictureGrid blocks={blocks} grouped label={`${s.name}`} />
            </>
          )}
          {s.after.length || s.next.length ? (
            <>
              <Cards
                cards={[
                  ...(s.after.length ? [{ kind: "skill" as const, title: "Comes after", line: "This skill builds on these.", body: list(s.after) }] : []),
                  ...(s.next.length ? [{ kind: "skill" as const, title: "Ready next", line: "A child secure here can try these.", body: list(s.next) }] : []),
                ]}
              />
              <p className="b-caption">Only links a person confirmed are read.</p>
            </>
          ) : (
            <p className="b-caption">Only links a person confirmed are read. None is confirmed for this skill yet.</p>
          )}
          {s.levels.length ? (
            <Details summary="Each level in a sentence" name="levels">
              <ul className="grid gap-[var(--space-2)]">
                {s.levels.map((l) => (
                  <LevelWords key={`${l.set}/${l.difficulty}`} code={s.code} set={l.set} level={l.difficulty} words={l.looks_like} earlier={earlier.get(`${l.set}/${l.difficulty}`) ?? []} canChange={reviews} />
                ))}
              </ul>
            </Details>
          ) : null}
          {asks.kinds.length ? (
            <Details summary="Kinds of question" name="kinds">
              <ul className="m-0 grid list-none gap-[var(--space-1)] p-0">
                {asks.kinds.map((k) => (
                  <li key={k.fmt}>
                    {kindWords(kindWordsOf, k.fmt)} <span className="b-muted">· {k.n} questions</span>
                  </li>
                ))}
              </ul>
            </Details>
          ) : null}
          {mistakes.length ? (
            <Details summary="Mistakes it watches for" name="mistakes">
              <ul className="m-0 grid list-none gap-[var(--space-2)] p-0">
                {mistakes.slice(0, 8).map((m) => (
                  <li key={m.code}>
                    {m.said.name}
                    {m.said.description ? <span className="b-muted"> · {m.said.description}</span> : null}
                  </li>
                ))}
              </ul>
              {mistakes.length > 8 ? <p className="b-caption">{mistakes.length - 8} more mistakes.</p> : null}
            </Details>
          ) : null}
        </div>
      </Screen>
    </PeekProvider>
  );
}
