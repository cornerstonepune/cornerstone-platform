import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { isDay } from "@/lib/educator/period";
import { schoolVersion } from "@/lib/today-data";
import { EducatorToday } from "./educator-today";
import { SchoolToday } from "./school-today";

// Today (UI-7): the first screen each person sees. One address, two versions: the group that reaches everything gets the school's, the
// group that reaches its own classes gets the educator's (lib/today-data.ts `schoolVersion`: what the person's group reaches, never a
// role named). It stands beside the old "What needs doing" page at /today, which holds controls no Today element lists; UI-7b swaps
// the address and carries those controls across (docs/notes/UI-7.md).
export default async function Today({ searchParams }: { searchParams: Promise<{ view?: string; day?: string }> }) {
  const me = await requireStaff();
  const { view, day } = await searchParams;
  if (day !== undefined && !isDay(day)) notFound();
  return (await schoolVersion(me)) ? <SchoolToday me={me} /> : <EducatorToday me={me} day={day} view={view === "board" ? "board" : "list"} />;
}
