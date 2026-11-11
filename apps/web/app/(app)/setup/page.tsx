import { Cards } from "@/components/cards";
import { Screen } from "@/components/app-frame";
import Link from "@/components/link";
import { KeyValue } from "@/components/key-value";
import { mayUse } from "@/lib/access";
import { requireStaff } from "@/lib/auth";
import { screenHref } from "@/lib/built";
import { changedLately, namesMayShow, schoolFacts, setupCounts, shortDate } from "@/lib/queries-coordinator";

// Setup (docs/frontend/screens.json `setup`, UI-5): the home of the pages that change rarely. A card for each page the
// person's group may open; a page whose screen is not built yet opens the page that exists today (lib/built.ts), so no card
// is a dead link. Counts are computed once, in lib/queries-coordinator.ts. Statistics and old scans stay behind details.
export default async function SetupPage() {
  const me = await requireStaff();
  const coordinator = await namesMayShow();
  const [n, facts, lately] = coordinator ? await Promise.all([setupCounts(), schoolFacts(), changedLately()]) : [null, null, []];
  const cards = [
    { kind: "skill" as const, title: "Skills to approve", line: "Read each skill's levels; approve one at a time.", href: screenHref("skills-approve") ?? "/skill-sets/approve", link: "Skills to approve", show: coordinator },
    { kind: "assessment" as const, title: "Question bank", line: "The questions papers are made from.", href: screenHref("bank") ?? "/library", link: "Question bank", show: true },
    { kind: "child" as const, title: "Staff", line: n ? `${n.staff} staff · ${n.grantsOpen} grants open` : "", href: screenHref("staff") ?? "/setup/staff", link: "Staff", show: coordinator && n !== null },
    { kind: "child" as const, title: "Classes and children", line: n ? `${n.classes} classes · ${n.children} children` : "", href: screenHref("classes") ?? "/setup/classes", link: "Classes and children", show: coordinator && n !== null },
    {
      kind: "period" as const,
      title: "School",
      body: facts ? (
        <ul className="m-0 grid list-none gap-1 p-0 text-[14px]">
          {facts.campus ? <li>Campus {facts.campus}</li> : null}
          {facts.year ? <li>Year {facts.year.label}, {shortDate(facts.year.from)} to {shortDate(facts.year.to)}</li> : null}
          {facts.fortnights.length ? <li>Fortnights {facts.fortnights.map((f) => `${f.n} ${f.kind}`).join(", ")}</li> : null}
        </ul>
      ) : null,
      show: coordinator && facts !== null,
    },
  ].filter((c) => c.show);
  return (
    <Screen
      stage="Changed rarely"
      title="Setup"
      purpose="The curriculum, the skills, the question bank, staff, classes and the school. Statistics and old scans sit behind details links."
      action={
        <Link href={screenHref("curriculum") ?? "/"} className="btn">
          Curriculum
        </Link>
      }
      next={{ href: screenHref("curriculum") ?? "/", label: "Curriculum" }}
      details={mayUse(me, "blocks") ? { href: "/setup/blocks", label: "The blocks gallery" } : undefined}
    >
      <div className="grid gap-4">
        <Cards cards={cards.slice(0, 3)} />
        {cards.length > 3 ? <Cards cards={cards.slice(3)} /> : null}
        {lately.length ? (
          <section aria-label="Changed lately">
            <h2 className="mb-2 text-[16px]">Changed lately</h2>
            <ul className="grid gap-2">
              {lately.map((c) => (
                <li key={c.id}>
                  {c.line}
                  <div className="text-[13px] text-[var(--ink-muted)]">
                    {c.note} {shortDate(c.at)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {n ? <KeyValue rows={[{ label: "Classes", value: n.classes, num: true }, { label: "Children", value: n.children, num: true }]} /> : null}
      </div>
    </Screen>
  );
}
