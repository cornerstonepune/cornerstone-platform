import { requireStaff } from "@/lib/auth";
import { AppFrame } from "@/components/app-frame";
import { todayBadge } from "@/lib/today-data";

export const dynamic = "force-dynamic";

// Every route in this group is behind the staff gate. Actions check again on their own. The menu carries, on every page, the one
// count on the site: the badge on the Today door, the strip's do-now plus this-week (lib/today-data.ts `todayBadge`).
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const me = await requireStaff();
  return <AppFrame me={me} waiting={await todayBadge(me)}>{children}</AppFrame>;
}
