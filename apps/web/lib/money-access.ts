import type { Session } from "@/lib/auth";
import { engineSend, type PostPath } from "@/lib/engine";
import type { MoneyAccess } from "@/lib/money-format";

// What the person may do on the Money screens, as the engine says it (`POST /money/access`): which tabs are drawn and what each counts.
// `null` when the engine cannot say: the tab row then shows only what everyone may use. The route is the approvals builder's; its path is
// cast until `bin/engine contract` lists it in lib/engine-routes.ts.
export async function moneyAccess(me: Session): Promise<MoneyAccess | null> {
  try {
    const res = await engineSend("/money/access" as PostPath, { actor: me.email } as never);
    return res.ok ? ((await res.json()) as MoneyAccess) : null;
  } catch {
    return null;
  }
}

// The row of tabs: My claims, To approve (n), To pay (n), Rules. A tab a person has no use for is not drawn; every member of staff files
// claims and may read the rules (read-only unless they may change them).
export type Tab = { href: string; label: string; count?: number };

export function tabsFor(access: MoneyAccess | null): Tab[] {
  return [
    { href: "/money", label: "My claims" },
    ...(access?.can.approve ? [{ href: "/money/approve", label: "To approve", count: access.counts.approve }] : []),
    ...(access?.can.pay ? [{ href: "/money/pay", label: "To pay", count: access.counts.pay }] : []),
    { href: "/money/rules", label: "Rules" },
  ];
}
