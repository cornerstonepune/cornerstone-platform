import { requireStaff } from "@/lib/auth";
import { AppFrame } from "@/components/app-frame";
import { deadline } from "@/lib/deadline";
import { todayBadge } from "@/lib/today-data";

export const dynamic = "force-dynamic";

// Every route in this group is behind the staff gate. Actions check again on their own. The menu carries, on every page, the one
// count on the site: the badge on the Today door, the strip's do-now plus this-week (lib/today-data.ts `todayBadge`).
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const me = await requireStaff();
  // started, not waited for: the page streams at once and the badge arrives when the count does (a count that fails or runs past
  // its deadline shows none, as before)
  const waiting = deadline(todayBadge(me)).catch(() => 0);
  return <AppFrame me={me} waiting={waiting}>{children}</AppFrame>;
}
