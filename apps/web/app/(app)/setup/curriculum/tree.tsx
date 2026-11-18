import { EmptyState } from "@/components/empty-state";
import { curriculumTree } from "@/lib/curriculum-cache";
import { orderChecked } from "@/lib/curriculum-order";
import { isCoordinator } from "@/lib/timetable-ui";
import { TreeView } from "./tree-view";
import { treeAt, type Path } from "./tree-path";

export { treeAt, type Path } from "./tree-path";

// Curriculum as one tree (CP-67, issue #827; Nimish 17 Nov 2026: "It can simply be thought of as an expand-collapse"), kept in the
// browser (CP-72, issue #842): the server reads the whole tree once per grade (lib/curriculum-cache.ts, kept for a short while) and hands
// it to the view, which opens and closes subjects and units and switches grades without asking the server again. A read that is slow or
// fails is a quiet line with a way to try again, never the page error.
export async function Tree({ path }: { path: Path }) {
  let grades;
  try {
    grades = await curriculumTree();
  } catch {
    return <EmptyState next={{ href: treeAt(path), label: "Try again" }}>The curriculum is slow to answer. Nothing is lost.</EmptyState>;
  }
  if (!grades.length) return <EmptyState>No objective yet.</EmptyState>;
  // whose order is checked is read on every request, never kept: the button must show what was just pressed (CP-74)
  const [order, coordinator] = await Promise.all([orderChecked().catch(() => ({})), isCoordinator()]);
  return <TreeView grades={grades} order={order} coordinator={coordinator} />;
}
