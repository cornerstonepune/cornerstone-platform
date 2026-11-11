import { notFound, permanentRedirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { isDay } from "@/lib/educator/period";
import { schoolVersion } from "@/lib/today-data";
import { EducatorToday } from "./educator-today";
import { SchoolToday } from "./school-today";

// Today (UI-7): the first screen each person sees. One address, two versions: the group that reaches everything gets the school's, the
// group that reaches its own classes gets the educator's (lib/today-data.ts `schoolVersion`: what the person's group reaches, never a
// role named). The old "What needs doing" page that lived here is at /setup/needs-doing with its controls (docs/notes/UI-7.md).
const OLD_KEYS = ["open", "group", "kind", "subject", "class", "page", "weeks", "taught", "voice"];
export default async function Today({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  // the old What needs doing page lived here: its addresses (a group, a kind, a class, a page, an open fold) answer 308 to where it is now
  if (OLD_KEYS.some((k) => q[k] !== undefined)) permanentRedirect(`/setup/needs-doing?${new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => e[1] !== undefined))}`);
  const me = await requireStaff();
  const { view, day } = q;
  if (day !== undefined && !isDay(day)) notFound();
  return (await schoolVersion(me)) ? <SchoolToday me={me} /> : <EducatorToday me={me} day={day} view={view === "board" ? "board" : "list"} peek={q.peek} />;
}
