// One child as the class picture's panel and the child's own page show them (page charter B5): the reads behind the tabs Skills · Notes ·
// Papers · Report. Server only. Every read is one the site already has; nothing is read here that the person may not see: the child is found
// through `childOf` (their class, the person's reach, the name through pii.read_child) and the papers through `childSheets` (seesSheet).
import { childOf, historyOf, summaryOf, type Entry, type Summary } from "./children-peek";
import { skillsOfChild, type ChildSkill } from "./children-picture";
import { childSheets, type ChildSheet } from "./queries-children";
import { paperScreensOf } from "./queries-assessment-extras";
import { reportOf, type ReportState } from "./queries-reports";
import type { Me } from "./children-reads";

export type ChildPanel = {
  id: string;
  classId: string;
  roll: string;
  section: string;
  name: string;
  skills: ChildSkill[];
  /** What was seen, newest first: notes, observations, papers and the graph's states (lib/children-peek.ts `historyOf`). */
  history: Entry[];
  summary: Summary;
  report: ReportState;
  sheets: ChildSheet[];
  /** sheet id → the paper's own screen */
  paperHref: Map<string, string>;
};

/** The panel's child, or null when the class is not the person's or there is no such child (one answer for both). `history` entries are
 *  the newest `entries` of them. */
export async function childPanelOf(me: Me, classId: string, roll: string, entries = 6): Promise<ChildPanel | null> {
  const child = await childOf(me, classId, roll);
  if (!child) return null;
  const [skills, history, summary, report, sheets] = await Promise.all([skillsOfChild(child.id), historyOf(child.id, entries), summaryOf(child.id, classId), reportOf(child.id), childSheets(child.id, me)]);
  const paperHref = await paperScreensOf(sheets.map((s) => s.id), me);
  return {
    id: child.id,
    classId,
    roll: child.roll_no,
    section: child.section,
    name: [child.first_name, child.last_name].filter(Boolean).join(" "),
    skills,
    history,
    summary,
    report,
    sheets,
    paperHref,
  };
}
