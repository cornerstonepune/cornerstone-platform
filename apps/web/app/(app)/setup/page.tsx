import { Cards } from "@/components/cards";
import { Rail, Screen } from "@/components/app-frame";
import { KeyValue } from "@/components/key-value";
import { Timeline } from "@/components/timeline";
import { mayUse } from "@/lib/access";
import { requireStaff } from "@/lib/auth";
import { screenHref } from "@/lib/built";
import { namesMayShow, setupCounts } from "@/lib/queries-coordinator";
import { changedLately, setupOverview } from "@/lib/setup-overview";

const n = (x: number) => x.toLocaleString("en-IN");

// Setup (docs/frontend/screens.json `setup`, UI-5, UI-11c): the home of the pages that change rarely, drawn as the wireframe
// draws it: six cards (Curriculum with its one big button, Skills to approve, Question bank, Staff, Classes and children, and
// the School's year, which only shows), what waits in set-up beside them, and the last set-up changes below. A card whose
// screen is not built opens the page that exists today (lib/built.ts), so no card is a dead link. Each count is computed once,
// in lib/queries-coordinator.ts and lib/setup-overview.ts. Statistics and old scans stay behind details.
export default async function SetupPage() {
  const me = await requireStaff();
  const coordinator = await namesMayShow();
  const [counts, o, changes] = await Promise.all([coordinator ? setupCounts() : null, setupOverview(me.email), coordinator ? changedLately() : []]);
  const curriculum = screenHref("curriculum") ?? "/";
  const cards = [
    {
      kind: "activity" as const,
      title: "Curriculum",
      line: `${n(o.curriculum.activities)} activities (${o.curriculum.grade}) · ${n(o.curriculum.skills)} skills`,
      body: o.waiting.drafted ? <strong>{n(o.waiting.drafted)} drafted parts to check</strong> : null,
      href: curriculum,
      link: "Open the curriculum",
      primary: true,
      show: true,
    },
    { kind: "skill" as const, title: "Skills to approve", line: "Read each skill's levels; approve one at a time. How many wait is shown on that page only.", href: screenHref("skills-approve") ?? "/setup/skills/approve", link: "Open Skills to approve", show: coordinator },
    { kind: "assessment" as const, title: "Question bank", line: `${n(o.bank.ready)} ready · ${n(o.bank.removed)} removed`, href: screenHref("bank") ?? "/library", link: "Open Question bank", show: true },
    { kind: "child" as const, title: "Staff", line: counts ? `${counts.staff} staff · ${counts.grantsOpen} grants open` : "", href: screenHref("staff") ?? "/setup/staff", link: "Open Staff", show: coordinator && counts !== null },
    { kind: "child" as const, title: "Classes and children", line: counts ? `${counts.classes} classes · ${n(counts.children)} children` : "", href: screenHref("classes") ?? "/setup/classes", link: "Open Classes and children", show: coordinator && counts !== null },
    {
      kind: "period" as const,
      title: "School",
      body: (
        <KeyValue
          rows={[
            { label: "Campus", value: o.school.campus },
            { label: "Year", value: `${o.school.year}, ${o.school.span}` },
            { label: "Fortnights", value: `${o.school.teaching} teaching, ${o.school.holiday} holiday` },
          ]}
        />
      ),
      show: coordinator,
    },
  ].filter((c) => c.show);
  const rows = [cards.slice(0, 3), cards.slice(3, 6)].filter((r) => r.length);
  return (
    <Screen
      stage="Changed rarely"
      title="Setup"
      purpose="The curriculum, the skills, the question bank, staff, classes and the school. Statistics and old scans sit behind details links."
      next={{ href: curriculum, label: "Curriculum" }}
      details={mayUse(me, "blocks") ? { href: "/setup/blocks", label: "The blocks gallery" } : undefined}
      rail={
        coordinator ? (
          <Rail
            boxes={[
              {
                title: "Waiting in set-up",
                body: (
                  <KeyValue
                    rows={[
                      { label: "Drafted parts to check", value: n(o.waiting.drafted), num: true },
                      { label: "Offers of a skill to an activity", value: n(o.waiting.offers), num: true },
                      { label: "Questions removed", value: n(o.waiting.removed), num: true },
                    ]}
                  />
                ),
              },
            ]}
          />
        ) : undefined
      }
    >
      <div className="grid gap-4">
        {rows.map((r) => (
          <Cards key={r[0].title} cards={r} />
        ))}
        {changes.length ? (
          <section aria-label="Changed lately" className="grid gap-[var(--space-2)]">
            <h2 className="text-[length:var(--text-h3,1.25rem)] font-semibold">Changed lately</h2>
            <Timeline entries={changes.map((c) => ({ kind: c.kind, title: c.title, line: `By ${c.by}`, when: c.at }))} />
          </section>
        ) : null}
      </div>
    </Screen>
  );
}
