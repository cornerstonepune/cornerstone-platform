import Link from "@/components/link";
import { StatusChip } from "@/components/status-chip";
import { GROUPS, type Group } from "@/lib/copy-groups";
import type { PaperListRow } from "@/lib/queries-papers";
import { paperHref } from "@/lib/assessment-ui";
import type { Column } from "@/lib/ux-rules";
import { Score } from "./score";
import { awayThis, signOffPaper } from "./actions";
import { LevelSelect } from "./level-select";

/** What a copy's row needs to know of its assessment: its key and kind, the copies held away, each copy's reason, the school's levels in
 *  order, and which copy carries the page's one main action. */
export type CopyContext = { key: string; kind: string; away: ReadonlySet<string>; reasons: ReadonlyMap<string, string>; order: readonly string[]; mainId: string | undefined };

/** The columns of a group of copies on the assessment's full page (its Copies tab): each copy its own row with its own action; there is no
 *  button over all of them. */
export const copyColumns = (grp: Group, c: CopyContext): Column<PaperListRow>[] => [
  // each copy opens its own paper from its Sr. No., whatever its group: no row is a dead end (a copy being read, or replaced, has no other way in)
  { key: "roll", label: "Sr. No.", num: true, width: "6rem", value: (p) => p.roll_no, cell: (p) => (p.roll_no ? <Link href={paperHref(c.key, p.roll_no)}>{p.roll_no}</Link> : null) },
  { key: "score", label: "Score", num: true, width: "8rem", value: (p) => (p.scored ? `${p.right} of ${p.scored}` : null), cell: (p) => <Score p={p} /> },
  {
    key: "level",
    label: "Level",
    width: "18rem",
    value: (p) => p.level,
    cell: (p) => (
      <>
        {grp === "made" && p.level ? <LevelSelect assessment={c.key} sheet={p.id} roll={p.roll_no ?? ""} level={p.level} order={[...c.order]} /> : <span>{p.level}</span>}
        <br />
        <span className="b-muted">{c.reasons.get(p.id) ?? ""}</span>
      </>
    ),
  },
  { key: "settled", label: "Answers settled", num: true, width: "9rem", value: (p) => (p.answers > 0 ? `${p.answers - p.waiting} of ${p.answers}` : grp === "replaced" ? "none" : "none yet") },
  { key: "state", label: "State", status: true, width: "13rem", value: () => grp, cell: (p) => <StatusChip state={GROUPS.find((x) => x.key === grp)!.state} words={grp === "judge" ? "Answers to judge" : grp === "children" && c.away.has(p.id) ? "Away, held for later" : undefined} /> },
  {
    key: "action",
    label: "Action",
    status: true,
    width: "13rem",
    value: (p) => p.id,
    cell: (p) => {
      const main = c.mainId === p.id ? "action" : undefined;
      if (grp === "judge" || grp === "check")
        return <Link href={paperHref(c.key, p.roll_no ?? "")} className={`btn ${main ? "" : "secondary"}`} data-check-paper="" data-ux={main}>Check this paper</Link>;
      if (grp === "signoff")
        return (
          <form action={signOffPaper}>
            <input type="hidden" name="key" value={c.key} />
            <input type="hidden" name="paper_id" value={p.id} />
            <button type="submit" data-signoff="" className={`btn ${main ? "" : "secondary"}`} data-ux={main}>Sign it off</button>
          </form>
        );
      if (grp === "results") return <Link href={p.child_id ? `/growth/${p.child_id}` : "/children"} className="btn secondary" data-child-link="">The child</Link>;
      if (grp === "made")
        return c.kind === "focus" && p.roll_no ? (
          <Link href={paperHref(c.key, p.roll_no)} className="btn secondary" data-edit-paper="">Edit this paper</Link>
        ) : (
          <span className="b-muted">Change the level before print</span>
        );
      if (grp === "replaced") return <span className="b-muted">Replaced by a newer one</span>;
      if (grp === "children")
        return (
          <form action={awayThis}>
            <input type="hidden" name="key" value={c.key} />
            <input type="hidden" name="qr" value={p.qr} />
            <input type="hidden" name="away" value={c.away.has(p.id) ? "no" : "yes"} />
            <button type="submit" data-away="" className="btn secondary">{c.away.has(p.id) ? "Back: count as missing" : "Away: hold it for later"}</button>
          </form>
        );
      return <span className="b-muted">{grp === "read" ? "The engine is reading it" : "With the children"}</span>;
    },
  },
];
