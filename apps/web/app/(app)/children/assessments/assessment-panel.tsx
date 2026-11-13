import type { ReactNode } from "react";
import Link from "@/components/link";
import type { Opened } from "@/components/detail-panel";
import { StatusChip } from "@/components/status-chip";
import type { Session } from "@/lib/auth";
import { GROUPS, groupOf, groupRow } from "@/lib/copy-groups";
import { deadline } from "@/lib/deadline";
import { paperList, type PaperListRow } from "@/lib/queries-papers";
import { assessmentHref, paperHref } from "@/lib/assessment-ui";
import { ReadBox } from "./upload/read-box";

// An assessment in the board's detail panel (page charter B6): Copies (each child's copy and where it stands) · Upload (the drop zone and
// the Drive link, moved here from the retired Upload papers page, with its server actions) · Check (the answers waiting for a person) ·
// Results (the copies signed off, with their scores). The copies are the assessment page's own read (`paperList`), said by the same groups
// (lib/copy-groups.ts); "Open full page" is the assessment's own address. A child is named by Sr. No. only, as on the assessment's page.
export type PanelRow = { key: string; openKey: string; title: string; line: string; files: readonly string[]; next: { href: string; label: string } };

const H = "text-[length:var(--text-label)] font-semibold text-[var(--ink-muted)] uppercase tracking-[0.08em]";
const roll = (p: PaperListRow) => (p.roll_no ? `Sr. No. ${p.roll_no}` : p.qr);
const byRoll = (a: PaperListRow, b: PaperListRow) => Number(a.roll_no ?? 1e9) - Number(b.roll_no ?? 1e9) || a.qr.localeCompare(b.qr);

/** One copy as a line: its Sr. No. (opening the child's paper), what it says beside it, and its chip. */
function CopyLine({ k, p, children, chip = true }: { k: string; p: PaperListRow; children?: ReactNode; chip?: boolean }) {
  const g = groupRow(groupOf(p));
  return (
    <li className="flex flex-wrap items-center gap-2 py-1" data-copy={p.roll_no ?? p.qr} data-group={g.key}>
      {p.roll_no ? <Link href={paperHref(k, p.roll_no)}>{roll(p)}</Link> : <span>{roll(p)}</span>}
      {children}
      {chip ? <StatusChip state={g.state} compact round /> : null}
    </li>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="b-muted" data-tab-empty>{children}</p>;

export async function assessmentPanel(
  me: Session,
  row: PanelRow,
  a: { kind: string; section: string | null; week: string | null; set: string | null },
  at: { closeHref: string; here: string; tab?: string; read?: string; why?: string; pages?: string; reading: boolean },
): Promise<Opened> {
  const { rows } = await deadline(paperList({ kind: a.kind, class: a.section || undefined, week: a.week || undefined, set: a.set || undefined }, me.email, me, "roll"));
  const copies = rows.filter((p) => !p.spare && !p.extra).sort(byRoll);
  const live = copies.filter((p) => p.stage !== "replaced");
  const ordered = GROUPS.flatMap((g) => copies.filter((p) => groupOf(p) === g.key));
  const judge = live.filter((p) => groupOf(p) === "judge");
  const check = live.filter((p) => groupOf(p) === "check" || groupOf(p) === "signoff");
  const results = live.filter((p) => p.stage === "signed off");
  const upload = `${at.here}${at.here.includes("?") ? "&" : "?"}tab=upload`;
  const copiesTab = ordered.length ? (
    <ul aria-label="Each child's copy" data-copies>
      {ordered.map((p) => (
        <CopyLine key={p.id} k={row.key} p={p}>{p.level ? <span className="b-muted">{p.level}</span> : null}</CopyLine>
      ))}
    </ul>
  ) : (
    <Empty>No copies yet: they appear here, one each, when the pack is made.</Empty>
  );
  const uploadTab = (
    <div className="grid gap-[var(--space-2)]">
      <ReadBox read={at.read} why={at.why} pages={at.pages} reading={at.reading} from={upload} />
      <section aria-label="Files read for this assessment" className="grid gap-1" data-files>
        <h3 className={H}>Files read for it</h3>
        {row.files.length ? (
          <ul>
            {row.files.map((f) => (
              <li key={f} className="break-all">{f}</li>
            ))}
          </ul>
        ) : (
          <Empty>No file read yet holds a paper of this assessment.</Empty>
        )}
      </section>
    </div>
  );
  const checkTab = judge.length || check.length ? (
    <ul aria-label="Answers waiting" data-check>
      {[...judge, ...check].map((p) => (
        <CopyLine key={p.id} k={row.key} p={p}>
          <span>{p.waiting ? `${p.waiting} ${p.waiting === 1 ? "answer" : "answers"} to judge` : groupOf(p) === "signoff" ? "checked, to sign off" : "to check"}</span>
          {p.roll_no ? <Link href={paperHref(row.key, p.roll_no)} className="btn secondary" data-check-paper="">Check this paper</Link> : null}
        </CopyLine>
      ))}
    </ul>
  ) : (
    <Empty>No answer waits for you on this assessment.</Empty>
  );
  const right = results.reduce((n, p) => n + p.right, 0);
  const scored = results.reduce((n, p) => n + p.scored, 0);
  const resultsTab = results.length ? (
    <div className="grid gap-[var(--space-2)]">
      <p data-results-total>{results.length} of {live.length} papers signed off · {right} of {scored} answers right</p>
      <ul aria-label="Results" data-results>
        {results.map((p) => (
          <CopyLine key={p.id} k={row.key} p={p} chip={false}>
            <span className="b-num">{p.right} of {p.scored}</span>
            {p.child_id ? <Link href={`/growth/${p.child_id}`} data-child-link="">The child</Link> : null}
          </CopyLine>
        ))}
      </ul>
    </div>
  ) : (
    <Empty>No results in yet: a paper&rsquo;s result appears here once it is signed off.</Empty>
  );
  return {
    key: row.openKey,
    kind: "assessment",
    title: row.title,
    line: row.line,
    full: assessmentHref(row.key),
    closeHref: at.closeHref,
    actions: (
      <Link href={row.next.href} className="btn" data-panel-next="">
        {row.next.label}
      </Link>
    ),
    tab: at.tab,
    tabs: [
      { key: "copies", label: "Copies", body: copiesTab },
      { key: "upload", label: "Upload", body: uploadTab },
      { key: "check", label: "Check", body: checkTab },
      { key: "results", label: "Results", body: resultsTab },
    ],
  };
}
