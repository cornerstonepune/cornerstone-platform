import Link from "@/components/link";
import { Screen } from "@/components/app-frame";
import { KeyValue } from "@/components/key-value";
import { OpenSection } from "@/components/open-section";
import { Stepper } from "@/components/stepper";
import { ICON_SIZE, Icon } from "@/lib/icons";
import { requireStaff } from "@/lib/auth";
import { isBuilt, screenHref } from "@/lib/built";
import { sectionFor } from "@/lib/guide-path";
import help from "../../../design-system/help.json";

type Props = { searchParams: Promise<Record<string, string | undefined>> };
const SECTIONS = help.sections;
const STAGES = ["1 · The bank: skills and questions made and checked", "2 · Assemble and print the papers", "3 · Read, mark and update each child's picture", "4 · The daily round: periods, notes, the fortnight"];

// Start here (UI-12): what each page is for, the usual jobs and what each button does. Every section is made from docs/frontend/screens.json
// by scripts/help.mjs, so a screen added to the inventory has its help with no hand edit. The "?" of a page opens this page at that page's
// section (`/guide#<screen id>`); a job is a link to a built screen, so none is a dead link while screens are still being made.
export default async function Guide({ searchParams }: Props) {
  await requireStaff();
  const q = await searchParams;
  const from = q.from?.startsWith("/") ? q.from : "/";
  const fromId = sectionFor(from);
  const came = SECTIONS.find((s) => s.id === fromId);
  const jobs = SECTIONS.filter((s) => s.id !== "help" && s.id !== "login" && isBuilt(s.id) && screenHref(s.id))
    // two versions of one address (Today) are one job
    .filter((s, i, all) => all.findIndex((x) => screenHref(x.id) === screenHref(s.id)) === i);
  return (
    <Screen
      stage="Start here"
      title="Start here"
      purpose="What each page is for, the usual jobs, and what each button does; the school's steps in four stages. Reached from the ? on every page."
      action={
        <>
          <span>{came ? `You came from ${came.title}.` : "Each page has a section below."}</span>
          <Link href={`/guide#${came?.id ?? "help"}`} className="btn" data-press data-main>
            Go to its section
          </Link>
        </>
      }
      next={{ href: from, label: came ? `Back to ${came.title}` : "Back to the page you came from" }}
    >
      <OpenSection />
      {jobs.length ? (
        <section aria-labelledby="jobs-h" className="mb-6">
          <h2 id="jobs-h" className="mb-2 text-[length:var(--text-section,18px)]">
            I want to…
          </h2>
          <div className="b-cards" data-block="Cards">
            {jobs.map((s) => (
              <article key={s.id} className="b-card" data-kind="note">
                <div className="b-card-h">{s.title}</div>
                <div className="b-card-b">
                  <span className="b-muted">{s.purpose}</span>
                  <a href={screenHref(s.id)!} data-job>
                    {s.title}
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <section aria-labelledby="stages-h" className="mb-6">
        <h2 id="stages-h" className="mb-2 text-[length:var(--text-section,18px)]">
          The school&rsquo;s steps, in four stages
        </h2>
        <Stepper label="The school's four stages" steps={STAGES.map((words) => ({ state: "notYet" as const, words }))} />
      </section>
      <section aria-labelledby="pages-h" className="grid gap-3">
        <h2 id="pages-h" className="text-[length:var(--text-section,18px)]">
          Each page
        </h2>
        {SECTIONS.map((s) => (
          <details key={s.id} id={s.id} data-block="Details" className="b-details">
            <summary data-section>
              <Icon name="details" size={ICON_SIZE.table} />
              {s.title} <span className="b-muted">{s.group}</span>
            </summary>
            <div>
            <KeyValue
              rows={[
                { label: "What it is for", value: s.purpose },
                { label: "On this page", value: s.does.map((d) => ("says" in d ? `${d.label}: ${d.says}` : d.label)).join(" · ") },
              ]}
            />
            </div>
          </details>
        ))}
      </section>
    </Screen>
  );
}
