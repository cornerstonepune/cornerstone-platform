import Maker_ from "./make/maker-page";
import type { Session } from "@/lib/auth";

/** The maker, as a mode of the Assessments screen (`?make=class|each|one|sheet`): the same choose-then-see-the-papers steps. */
export async function Maker({ way, q }: { way: string; q: Record<string, string | undefined>; me: Session }) {
  // each child: this week's home assessments, one per child from their record (the old Home assessments page); a ready-made worksheet: a chosen paper
  const kind = way === "sheet" ? "custom" : way === "each" ? "focus" : "assessment";
  const own = way === "each" ? "own" : "same";
  const merged = { kind: q.kind ?? kind, way: q.way ?? own, ...(way === "one" ? { one: "1" } : {}), ...q };
  return Maker_({ searchParams: Promise.resolve(merged) });
}
