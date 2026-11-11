import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { reachOf, workScope } from "@/lib/reach";
import { classesOf } from "@/lib/taught";
import { deadline } from "@/lib/deadline";

// Class results moved (UI-3i): the old child list is the Children screen, and a class's results by topic are the "By topic" tab of its
// class picture. An old address answers 308 and goes there, with the topic, skill and page it had open; a class the person may not see is
// refused by the class picture, as for any class. With no class named it opens on the educator's own, as it did.
const CHILDREN_VIEW = ["sort", "status", "grade", "page", "cpage"];

export async function GET(req: Request) {
  const me = await requireStaff();
  const url = new URL(req.url);
  const q = url.searchParams;
  const go = (path: string) => NextResponse.redirect(new URL(path, url), 308);
  const idOf = async (label: string | null | undefined) => (label ? (await sql<{ id: string }[]>`select id from school_class where label = ${label} limit 1`)[0]?.id : undefined);
  if (q.get("view") === "children" || CHILDREN_VIEW.some((k) => q.get(k))) {
    const id = await idOf(q.get("class"));
    return go(id ? `/children?cls=${id}` : "/children");
  }
  let section = q.get("class");
  if (!section) {
    const [reach, own] = await deadline(Promise.all([reachOf(me), workScope(me)]));
    const [classes, mine] = await deadline(Promise.all([classesOf(reach), classesOf(own)]));
    classes.sort();
    section = classes.find((c) => mine.includes(c)) ?? classes[0] ?? null;
  }
  const id = await idOf(section);
  if (!id) return go("/children");
  const to = new URLSearchParams({ view: "topic" });
  for (const k of ["subject", "topic", "skill", "kp"]) if (q.get(k)) to.set(k, q.get(k)!);
  return go(`/children/${id}?${to}`);
}
