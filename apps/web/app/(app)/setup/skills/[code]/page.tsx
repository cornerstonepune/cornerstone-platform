import { notFound } from "next/navigation";
import Link from "@/components/link";
import { Crumbs } from "@/components/crumbs";
import { MachineMark } from "@/components/origin";
import { PeekPanel, PeekProvider } from "@/components/children/peek";
import { Clusters, PictureGrid, type Square } from "@/components/children/picture-grid";
import { LevelWords, type Earlier } from "@/components/teaching/level-words";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { Screen } from "@/components/app-frame";
import { StackBar } from "@/components/stack-bar";
import { STATES } from "@/components/status-chip";
import { requireStaff } from "@/lib/auth";
import { enginePost } from "@/lib/engine";
import { staffNames } from "@/lib/timetable-ui";
import { openTo } from "@/lib/educator/data";
import { screenHref } from "@/lib/built";
import { LOOK_ORDER, groupByLook, peekParam } from "@/lib/children-view";
import { stateOf } from "@/lib/looks";
import { skillUse } from "@/lib/detail-trail";
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
  const chips = Object.fromEntries(s.kids.map((k, i) => [k.id, squares[i]]));
  const open = squares.find((x) => peekParam(x) === q.peek);
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
  const use = await skillUse(s.code);
  const keep: Record<string, string> = q.class ? { class: q.class } : {};
  const here = `/setup/skills/${encodeURIComponent(s.code)}`;
  const all = q.all === "1";
  const link = (list: { code: string; name: string }[], kind: "objective" | "skill") => (
    <ul className="grid gap-[var(--space-1)]">
      {list.map((k) => (
        <li key={k.code} className="flex min-h-[var(--tap)] items-center">
          <Link href={kind === "skill" ? href(k.code) : `/setup/${kind}s/${encodeURIComponent(k.code)}`} className="[overflow-wrap:anywhere]">{k.name}</Link>
        </li>
      ))}
    </ul>
  );
  const card = "card grid content-start gap-[var(--space-2)]";
  const h2 = "min-h-[var(--tap)] text-[length:var(--text-body)] font-semibold";
  const rows = (list: { code: string; name: string; origin: "sheet" | "machine" | "person" | null }[], kind: "objective" | "activity") => {
    const shown = all ? list : list.slice(0, 5);
    return (
      <>
        <ul className="grid gap-[var(--space-1)]">
          {shown.map((k) => (
            <li key={k.code} className="flex min-h-[var(--tap)] items-center gap-[var(--space-1)]" data-use={kind}>
              <Link href={`/setup/${kind === "objective" ? "objectives" : "activities"}/${encodeURIComponent(k.code)}`} className="[overflow-wrap:anywhere]">{k.name}</Link>
              {k.origin === "machine" ? <MachineMark /> : null}
            </li>
          ))}
        </ul>
        {list.length > shown.length ? <Link href={`${here}?${new URLSearchParams({ ...keep, all: "1" })}`} className="btn secondary w-fit" scroll={false}>Show all {list.length}</Link> : null}
      </>
    );
  };
  return (
    <PeekProvider initial={open ?? null}>
      <Screen
        stage={`Skill${s.domain ? ` · ${s.domain}` : ""}`}
        trail={<Crumbs parts={[{ label: "Curriculum", href: "/setup/curriculum" }, { label: "Skills", href: "/setup/curriculum/skills" }]} here={s.name} />}
        title={s.name}
        purpose="What it is, where it is used and how classes are doing."
        next={{ href: "/setup/curriculum", label: "Curriculum" }}
      >
        <div className="grid gap-[var(--space-3)]">
          <section className={card} data-card aria-labelledby="h-what" id="what">
            <h2 id="h-what" className={h2}>What it is</h2>
            {s.levels.length ? (
              <ul className="grid gap-[var(--space-2)]">
                {s.levels.map((l) => (
                  <LevelWords key={`${l.set}/${l.difficulty}`} code={s.code} set={l.set} level={l.difficulty} words={l.looks_like} earlier={earlier.get(`${l.set}/${l.difficulty}`) ?? []} canChange={reviews} />
                ))}
              </ul>
            ) : (
              <p className="text-[var(--ink-muted)]">No level is written for this skill yet.</p>
            )}
            {s.after.length || s.next.length ? (
              <div className="grid gap-[var(--space-2)] md:grid-cols-2">
                {s.after.length ? <div><h3 className="font-semibold">Comes before</h3>{link(s.after, "skill")}</div> : null}
                {s.next.length ? <div><h3 className="font-semibold">Ready next</h3>{link(s.next, "skill")}</div> : null}
              </div>
            ) : null}
          </section>
          <section className={card} data-card aria-labelledby="h-used" id="used">
            <h2 id="h-used" className={h2}>{use.length > 1 ? "Used in these grades" : "Used in this grade"}</h2>
            {use.length ? (
              use.map((g) => (
                <div key={g.grade} className="grid gap-[var(--space-2)] md:grid-cols-2" data-grade={g.grade}>
                  <div className="grid content-start gap-[var(--space-1)]">
                    <h3 className="font-semibold">Objectives{use.length > 1 ? ` in ${g.name}` : ""}</h3>
                    {g.objectives.length ? rows(g.objectives, "objective") : <p className="text-[var(--ink-muted)]">None linked yet.</p>}
                  </div>
                  <div className="grid content-start gap-[var(--space-1)]">
                    <h3 className="font-semibold">Activities{use.length > 1 ? ` in ${g.name}` : ""}</h3>
                    {g.activities.length ? rows(g.activities, "activity") : <p className="text-[var(--ink-muted)]">None linked yet.</p>}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[var(--ink-muted)]">No objective or activity uses it yet.</p>
            )}
          </section>
          <section className="card" data-card id="classes">
            <details open={Boolean(q.class || q.peek)}>
              <summary className="flex min-h-[var(--tap)] cursor-pointer items-center font-semibold">How classes are doing{s.cls ? ` · ${section}` : ""}</summary>
              <div className="mt-[var(--space-2)] grid gap-[var(--space-3)]">
                {s.rebuilt ? <p className="b-caption">Rebuilt {s.rebuilt.slice(0, 16).replace("T", " ")}, from confirmed notes and papers</p> : null}
                {s.classes.length > 1 ? (
                  <FilterBar action={here} filters={[{ name: "class", label: "Class", value: s.cls?.id, all: "Choose a class", options: s.classes.map((c) => [c.id, c.section] as const), required: !!s.cls }]} />
                ) : null}
                {!s.cls ? (
                  <EmptyState>Choose a class to see where it stands on this skill.</EmptyState>
                ) : s.kids.length === 0 ? (
                  <EmptyState>Nobody is enrolled in this class.</EmptyState>
                ) : (
                  <>
                    <StackBar parts={LOOK_ORDER.map((look) => ({ state: stateOf(look), n: s.kids.filter((k) => k.look === look).length }))} />
                    <PictureGrid blocks={blocks} grouped label={`${s.name}`} />
                    <PeekPanel />
                    <details>
                      <summary className="flex min-h-[var(--tap)] cursor-pointer items-center font-semibold">Who shares a place</summary>
                      <Clusters clusters={s.clusters} kids={chips} />
                    </details>
                  </>
                )}
              </div>
            </details>
          </section>
        </div>
      </Screen>
    </PeekProvider>
  );
}
