"use client";

import Link from "@/components/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/lib/icons";
import { guideFor } from "@/lib/guide-path";

/** "?": the guide at this page's section (the guide's own pages: the guide's front). */
export function HelpLink() {
  const href = guideFor(usePathname());
  return (
    <Link href={href} aria-label="Help" title="How this page works" data-ux="help" className="inline-flex min-h-[var(--tap)] min-w-[var(--tap)] items-center justify-center gap-[var(--space-1)] text-[var(--ink)] no-underline">
      <Icon name="help" size={20} />
    </Link>
  );
}
