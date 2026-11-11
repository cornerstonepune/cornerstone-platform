import { permanentRedirect } from "next/navigation";
import { sql } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { reachOf, workScope } from "@/lib/reach";
import { classesOf } from "@/lib/taught";
import { deadline } from "@/lib/deadline";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

// Class results moved (UI-3h): the old child list is the Children screen, and a class's results by topic are the "By topic" tab of its
// class picture. An old address goes there, with the topic, skill and page it had open; a class the person may not see is refused by
// the class picture, as for any class. With no class named it opens on the educator's own, as it did.
const CHILDREN_VIEW = ["sort", "status", "grade", "page", "cpage"];

export default async function ClassResults({ searchParams }: Props) {
  const me = await requireStaff();
  const q = await searchParams;
  if (q.view === "children" || CHILDREN_VIEW.some((k) => q[k])) {
    const [cls] = q.class ? await sql<{ id: string }[]>`select id from school_class where label = ${q.class} limit 1` : [];
    permanentRedirect(cls ? `/children?cls=${cls.id}` : "/children");
  }
  let section = q.class;
  if (!section) {
    const [reach, own] = await deadline(Promise.all([reachOf(me), workScope(me)]));
    const [classes, mine] = await deadline(Promise.all([classesOf(reach), classesOf(own)]));
    classes.sort();
    section = classes.find((c) => mine.includes(c)) ?? classes[0];
  }
  const [cls] = section ? await sql<{ id: string }[]>`select id from school_class where label = ${section} limit 1` : [];
  if (!cls) permanentRedirect("/children");
  const to = new URLSearchParams({ view: "topic" });
  for (const k of ["subject", "topic", "skill", "kp"]) if (q[k]) to.set(k, q[k]!);
  permanentRedirect(`/children/${cls.id}?${to}`);
}
