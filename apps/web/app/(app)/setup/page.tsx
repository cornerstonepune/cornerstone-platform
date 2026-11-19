import { Cards } from "@/components/cards";
import { Rail, Screen } from "@/components/app-frame";
import { KeyValue } from "@/components/key-value";
import { Timeline } from "@/components/timeline";
import { mayUse } from "@/lib/access";
import { requireStaff } from "@/lib/auth";
import { screenHref } from "@/lib/built";
import { maySetMoneyRules } from "@/lib/money-rules";
import { namesMayShow, setupCounts } from "@/lib/queries-coordinator";
import { changedLately, setupOverview } from "@/lib/setup-overview";

const n = (x: number) => x.toLocaleString("en-IN");

// Setup (docs/frontend/screens.json `setup`, UI-5, UI-11c): the home of the pages that change rarely, drawn as the wireframe
// draws it: cards (Curriculum with its one big button, Skills to approve, Question bank, Staff, Classes and children, the Catalogue of materials, and
// the School's year, which only shows), what waits in set-up beside them, and the last set-up changes below. A card whose
// screen is not built opens the page that exists today (lib/built.ts), so no card is a dead link. Each count is computed once,
// in lib/queries-coordinator.ts and lib/setup-overview.ts. Statistics and old scans stay behind details.
export default async function SetupPage() {
  const me = await requireStaff();
  const coordinator = await namesMayShow();
  const [counts, o, changes, money] = await Promise.all([coordinator ? setupCounts() : null, setupOverview(me.email), coordinator ? changedLately() : [], maySetMoneyRules(me.email)]);
  const cards = [
    { kind: "child" as const, title: "Staff", line: counts ? `${counts.staff} staff · ${counts.grantsOpen} grants open` : "", href: screenHref("staff") ?? "/setup/staff", link: "Open Staff", show: coordinator && counts !== null },
    { kind: "child" as const, title: "Classes", line: counts ? `${counts.classes} classes · ${n(counts.children)} children` : "", href: screenHref("classes") ?? "/setup/classes", link: "Open Classes", show: coordinator && counts !== null },
    { kind: "period" as const, title: "Timetable rules", line: "The rules the timetable keeps when a lesson is placed", href: "/timetable/rules", link: "Open Timetable rules", show: true },
    { kind: "period" as const, title: "Money rules", line: "The limits, approvals and categories the school's money follows", href: "/money/rules", link: "Open Money rules", show: money },
    { kind: "activity" as const, title: "Catalogue", line: "Every material the school uses, and the category each files under", href: "/setup/catalogue", link: "Open Catalogue", show: true },
    { kind: "note" as const, title: "How it works", line: "What the site does for you, and what it leaves to you", href: "/setup/how-it-works", link: "Open How it works", show: true },
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
  ].filter((c) => c.show).map((c, i) => ({ ...c, primary: i === 0 })); // the page's one main action is its first card's link
  const rows = [cards.slice(0, 3), cards.slice(3, 6), cards.slice(6, 9)].filter((r) => r.length);
  return (
    <Screen
      stage="Changed rarely"
      title="Setup"
      purpose="Pages you change rarely."
      next={{ href: "/setup/staff", label: "Staff" }}
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
            <h2 className="text-[length:var(--text-title-page)] font-semibold">Changed lately</h2>
            <Timeline entries={changes.map((c) => ({ kind: c.kind, title: c.title, line: `By ${c.by}`, when: c.at }))} />
          </section>
        ) : null}
      </div>
    </Screen>
  );
}
