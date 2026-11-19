import type { ReactNode } from "react";
import { StockTabs } from "@/components/stock-tabs";
import { requireStaff } from "@/lib/auth";
import { stockCampuses } from "@/lib/stock-access";

// Stock: these tabs on every page under it, for a person who keeps a store. Each page checks who is asking again on its own.
export default async function StockLayout({ children }: { children: ReactNode }) {
  const me = await requireStaff();
  const kept = await stockCampuses(me.email);
  return (
    <>
      {kept?.length ? (
        <div className="px-[var(--space-3)] pt-[var(--space-2)] md:px-[var(--space-4)]">
          <StockTabs />
        </div>
      ) : null}
      {children}
    </>
  );
}
