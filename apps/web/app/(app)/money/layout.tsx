import type { ReactNode } from "react";
import { MoneyTabs } from "@/components/money-tabs";
import { requireStaff } from "@/lib/auth";
import { moneyAccess, tabsFor } from "@/lib/money-access";

// Money: one menu line, and these tabs on every page under it. Each page checks who is asking again on its own.
export default async function MoneyLayout({ children }: { children: ReactNode }) {
  const me = await requireStaff();
  const tabs = tabsFor(await moneyAccess(me));
  return (
    <>
      <div className="px-[var(--space-3)] pt-[var(--space-2)] md:px-[var(--space-4)]">
        <MoneyTabs tabs={tabs} />
      </div>
      {children}
    </>
  );
}
