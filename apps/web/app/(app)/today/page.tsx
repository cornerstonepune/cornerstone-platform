import { requireStaff } from "@/lib/auth";
import { isDay } from "@/lib/educator/period";
import { schoolVersion } from "@/lib/today-data";
import { EducatorToday } from "./educator-today";
import { SchoolToday } from "./school-today";

// Today (UI-7): the first screen each person sees. One address, two versions: the group that reaches everything gets the school's, the
// group that reaches its own classes gets the educator's, and so does a coordinator acting as an educator (lib/today-data.ts
// `schoolVersion`: what the person's group reaches, never a role named; the bar's count asks the same).
export default async function Today({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireStaff();
  const { view, day } = await searchParams;
  // a day in the address that is not a date is no day: Today opens on today rather than on "not found"
  return (await schoolVersion(me)) ? <SchoolToday me={me} /> : <EducatorToday me={me} day={isDay(day) ? day : undefined} view={view === "board" ? "board" : "list"} />;
}
