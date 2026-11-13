// Across every class as a Dashboard (page charter Part C: "keep its job, reshape to Dashboard: stat tiles per class + one table: stage,
// overdue checks, papers missing > 3 days, children struggling in ≥2 subjects"). Pure: the rows are `across()`'s (lib/queries-across.ts),
// read as they were; this only gathers them class by class, so a tile, a table row and the class's panel are one reading of them.
import type { Tone } from "@/components/status-chip";
import type { Across, ClassStage, Missing, Overdue, Struggling } from "./queries-across";

/** One class: its newest assessment in each subject, its answers waiting too long, its papers not back, its children needing help. */
export type ClassAcross = {
  section: string;
  band: string;
  stages: ClassStage[];
  overdue: Overdue | null;
  missing: Missing[];
  struggling: Struggling[];
  /** What waits on the class, as a whole count: papers whose checks are overdue, papers not back, children needing help in two subjects. */
  follow: number;
  tone: Tone;
};

/** The address's id for a class (`?open=class:<id>`): its own id where it has one, else its label with anything an id cannot hold as `~`. */
export const classKey = (section: string, ids: Record<string, string>) => ids[section] ?? section.replace(/[^\w.-]/g, "~");

/** Every class that has something on the page, in the order the rows came (grade, then class): red when an answer waits too long or a
 *  child needs help in two subjects, amber when a paper is only late back, green when nothing waits. */
export function byClass(a: Across): ClassAcross[] {
  const order: { section: string; band: string }[] = [];
  const seen = new Set<string>();
  for (const r of [...a.stages, ...a.overdue, ...a.missing, ...a.struggling])
    if (!seen.has(r.section)) {
      seen.add(r.section);
      order.push({ section: r.section, band: r.band });
    }
  return order.map(({ section, band }) => {
    const overdue = a.overdue.find((o) => o.section === section) ?? null;
    const missing = a.missing.filter((m) => m.section === section);
    const struggling = a.struggling.filter((c) => c.section === section);
    const follow = (overdue?.papers ?? 0) + missing.length + struggling.length;
    const tone: Tone = overdue || struggling.length ? "act" : missing.length ? "wait" : "ok";
    return { section, band, stages: a.stages.filter((s) => s.section === section), overdue, missing, struggling, follow, tone };
  });
}
