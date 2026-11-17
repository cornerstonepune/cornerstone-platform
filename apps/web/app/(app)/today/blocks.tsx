import type { ReactNode } from "react";
import Link from "@/components/link";
import { Icon } from "@/lib/icons";
import { EmptyState } from "@/components/empty-state";
import type { Session } from "@/lib/auth";
import { sigsFor } from "@/lib/assessment-steps";
import { paperHref, waitsFor } from "@/lib/assessment-ui";
import { deadline } from "@/lib/deadline";
import { classWords } from "@/lib/needs-you";
import { grades } from "@/lib/queries";
import { assessmentList, paperList } from "@/lib/queries-papers";
import { topicNamesOf } from "@/lib/queries-by-topic";
import { chosenNames } from "@/lib/queries-assessment-extras";
import { dateWords, weekWords } from "@/lib/week";
import { assessmentKey } from "../children/assessments/assessment-key";
import { namedRows } from "../children/assessments/named";
import { countsOf } from "../children/assessments/step-counts";

// Today in blocks (CP-63, Nimish 16 Nov 2026: "Today is a line-item list; it should be different sections"). Each block is one section with its
// own heading, in the order a day goes: what to teach, what papers to check, what notes to confirm, then what else waits. Each says so in
// words when it is empty. Educators read their own classes' work and a coordinator the school's: the same reads as the Assessments board.
export function TodayBlock({ id, title, count, more, children }: { id: "teach" | "papers" | "notes" | "else"; title: string; count?: number; more?: { href: string; label: string }; children: ReactNode }) {
  return (
    <details open className="b-today-block" aria-labelledby={`today-${id}`} data-today-block={id}>
      <summary className="b-today-sum">
        <h2 id={`today-${id}`}>{title}</h2>
        {count ? <span className="b-today-n b-num" data-today-count={id}>{count}</span> : null}
        <Icon name="chevron-down" size={20} className="b-today-chev" />
      </summary>
      <div className="b-today-body">
        {more ? <Link href={more.href} className="inline-flex min-h-[44px] items-center underline" data-block-more="">{more.label}</Link> : null}
        {children}
      </div>
    </details>
  );
}

const SHOWN = 6;

/** Papers to check: one small card for each assessment with answers waiting for a person, its one button opening the check page of its first
 *  paper to judge (CP-62's flow). Not a second board: the Assessments board is one link away. */
export async function PapersBlock({ me }: { me: Session }) {
  const [list, g, topics] = await deadline(Promise.all([assessmentList({}, me, { limit: 100, offset: 0, sigs: sigsFor("check") }), grades(), topicNamesOf()])).catch(() => [null, null, null] as const);
  if (!list || !g || !topics) {
    return (
      <TodayBlock id="papers" title="Papers to assess" more={{ href: "/children/assessments", label: "See all assessments" }}>
        <p className="b-muted" data-unread="papers">Your papers could not be read just now.</p>
      </TodayBlock>
    );
  }
  const names = new Map(topics.map((t) => [t.code, t.name]));
  const chosen = await chosenNames(list.rows.map(assessmentKey));
  const rows = namedRows(list.rows, { g, topicName: (c) => names.get(c) ?? c, chosen, files: new Map() })
    .map((a) => ({ a, key: assessmentKey(a), w: waitsFor(countsOf(a), a.waiting) }))
    .filter((r) => r.w.action.kind === "check" && r.a.waiting > 0);
  const cards = await Promise.all(
    rows.slice(0, SHOWN).map(async (r) => {
      const copies = await deadline(paperList({ kind: r.a.kind, class: r.a.section || undefined, week: r.a.week || undefined, set: r.a.set || undefined }, me.email, me, "roll"));
      const first = copies.rows.find((c) => c.waiting > 0 && c.roll_no);
      const title = r.a.topics.map((c) => names.get(c) ?? c).join(" · ") || r.a.title;
      const klass = r.a.band && r.a.section ? classWords(g, r.a.band, r.a.section) : (r.a.section ?? "");
      return {
        key: r.key,
        title,
        line: [klass, r.a.day ? dateWords(r.a.day) : weekWords(r.a.week)].filter(Boolean).join(" · "),
        waiting: r.a.waiting,
        href: first?.roll_no ? paperHref(r.key, first.roll_no) : `/children/assessments?status=check`,
      };
    }),
  );
  return (
    <TodayBlock id="papers" title="Papers to assess" count={rows.length} more={{ href: "/children/assessments", label: "See all assessments" }}>
      {cards.length ? (
        <ul className="grid gap-[var(--space-2)] sm:grid-cols-2 xl:grid-cols-3" aria-label="Papers to assess">
          {cards.map((c) => (
            <li key={c.key} className="b-card grid content-between gap-[var(--space-2)]" data-paper-card="">
              <div>
                <b className="b-ktitle" title={c.title}>{c.title}</b>
                {c.line ? <span className="b-sub block">{c.line}</span> : null}
                <span className="block font-semibold" data-waiting={c.waiting}>{c.waiting} {c.waiting === 1 ? "answer" : "answers"} to judge</span>
              </div>
              <Link href={c.href} className="btn w-fit" data-paper-check="">Check the papers</Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>No paper waits for you to check.</EmptyState>
      )}
      {rows.length > SHOWN ? <p className="b-muted">{rows.length - SHOWN} more {rows.length - SHOWN === 1 ? "assessment waits" : "assessments wait"}: see all assessments.</p> : null}
    </TodayBlock>
  );
}

/** Notes to confirm: how many wait, and the one button to the notes. `late`: past the time they may wait. */
export function NotesBlock({ late, soon, href }: { late: number; soon: number; href: string | null }) {
  const n = late + soon;
  return (
    <TodayBlock id="notes" title="Notes to confirm" count={n}>
      {n ? (
        <div className="b-card flex flex-wrap items-center gap-x-4 gap-y-2" data-notes-card="">
          <span className="font-semibold"><span className="b-num">{n}</span> {n === 1 ? "note" : "notes"} to confirm{late ? ` · ${late} left too long` : ""}</span>
          {href ? <Link href={href} className="btn secondary" data-notes-open="">Confirm the notes</Link> : null}
        </div>
      ) : (
        <EmptyState>No note waits for you to confirm.</EmptyState>
      )}
    </TodayBlock>
  );
}
