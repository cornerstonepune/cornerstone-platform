import { unstable_cache, updateTag } from "next/cache";
import { objectiveCounts } from "./curriculum-objectives";
import { branches, leavesOfGrade, type Branch, type Leaf } from "./curriculum-tree";
import { grades } from "./queries";

// CP-72 (issue #842): the curriculum reads that change rarely are kept, so a click on Curriculum never waits on the database for them.
// `unstable_cache` is Next 16.4's cache for a function that is not a component: the version's own docs (node_modules/next/dist/docs/01-app,
// `unstable_cache`) point to `use cache`, which needs the whole app on Cache Components; that is a change of its own, not this page's.
// A kept read is refreshed `CURRICULUM_SECONDS` after it was read (what the engine writes behind the website's back shows by then), and
// at once by `curriculumChanged()` from any edit the website makes. Nothing here reads who is asking: the school's curriculum is one. Who may
// use the pages is not kept: a grant taken away must stop at once (`gateFor`, asked per request).
export const CURRICULUM_TAG = "curriculum";
export const CURRICULUM_SECONDS = 60;
const kept = { revalidate: CURRICULUM_SECONDS, tags: [CURRICULUM_TAG] };

export type GradeTree = { code: string; name: string; subjects: Branch[]; leaves: Leaf[] };

/** Each grade that has an objective, with its subjects, units and objectives: the whole tree, read once per grade and kept. */
export const curriculumTree = unstable_cache(
  async (): Promise<GradeTree[]> => {
    const list = (await grades()).list;
    const all = await Promise.all(list.map(async (g) => ({ code: g.code, name: g.name, subjects: await branches(g.code), leaves: await leavesOfGrade(g.code) })));
    return all.filter((g) => g.subjects.length);
  },
  ["curriculum-tree"],
  kept,
);

/** The three counts on the summary band. */
export const curriculumCounts = unstable_cache(objectiveCounts, ["curriculum-counts"], kept);

/** Called by every edit the website makes to the curriculum: the kept reads are stale from this moment, and the next open reads afresh. */
export function curriculumChanged(): void {
  updateTag(CURRICULUM_TAG);
}
