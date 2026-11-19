"use client";

import { usePathname } from "next/navigation";
import Link from "@/components/link";
import type { Tab } from "@/lib/money-access";

// The row of Money tabs at the top of every Money page (the tabs themselves are `tabsFor`, lib/money-access.ts); the number is what waits on
// the person, shown only when something does.
export function MoneyTabs({ tabs }: { tabs: readonly Tab[] }) {
  const here = usePathname();
  const on = (href: string) => (href === "/money" ? here === href || here.startsWith("/money/new") || here.startsWith("/money/bill") : here.startsWith(href));
  return (
    <nav aria-label="Money" data-money-tabs className="b-tabs">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className="b-tab" aria-current={on(t.href) ? "page" : undefined} data-tab={t.href.split("/")[2] ?? "mine"}>
          {t.label}
          {t.count ? <span className="b-num" data-count={t.count}>({t.count.toLocaleString("en-IN")})</span> : null}
        </Link>
      ))}
    </nav>
  );
}
