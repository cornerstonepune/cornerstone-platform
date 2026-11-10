import Maker_ from "../../papers/make/page";
import type { Session } from "@/lib/auth";

/** The maker, as a mode of the Assessments screen (`?make=class|each|one|sheet`): the same choose-then-see-the-papers steps. */
export async function Maker({ way, q }: { way: string; q: Record<string, string | undefined>; me: Session }) {
  const kind = way === "sheet" ? "custom" : "assessment";
  const own = way === "each" ? "own" : "same";
  const merged = { kind: q.kind ?? kind, way: q.way ?? own, ...(way === "one" ? { one: "1" } : {}), ...q };
  return Maker_({ searchParams: Promise.resolve(merged) });
}
