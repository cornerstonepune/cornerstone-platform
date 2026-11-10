"use client";

import { usePathname } from "next/navigation";
import Link from "@/components/link";

const LINK = "inline-flex min-h-[var(--tap)] items-center text-[var(--link)] underline";

/** "Report a problem or suggest something", on every signed-in page (goals/feed_report_from_the_tool.yaml). It carries the page it was
 *  pressed on, and the form keeps only its path with the ids taken out. */
export function ReportLink() {
  const path = usePathname();
  const from = path.startsWith("/feedback") ? "/" : path;
  return (
    <Link href={`/feedback?from=${encodeURIComponent(from)}`} aria-label="Report a problem or suggest something" className={LINK}>
      Report a problem or suggest something
    </Link>
  );
}
