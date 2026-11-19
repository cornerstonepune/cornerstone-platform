"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "@/components/link";
import { STOCK_TABS } from "@/lib/stock-words";

// The row of Stock tabs at the top of every Stock page; the campus a person chose goes with them from tab to tab.
export function StockTabs() {
  const here = usePathname();
  const campus = useSearchParams().get("campus");
  return (
    <nav aria-label="Stock" data-stock-tabs className="b-tabs">
      {STOCK_TABS.map((t) => (
        <Link key={t.href} href={campus ? `${t.href}?campus=${encodeURIComponent(campus)}` : t.href} className="b-tab" aria-current={here === t.href ? "page" : undefined} data-tab={t.href.split("/")[2] ?? "on-hand"}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
