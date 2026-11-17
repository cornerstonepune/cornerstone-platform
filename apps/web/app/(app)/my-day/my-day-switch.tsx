"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/link";
import { ICON_SIZE, Icon } from "@/lib/icons";

// My day's one day control (CP-69): previous day, the date in words (day before month), next day, a Today shortcut and a calendar that applies
// the moment a date is chosen. The addresses come from the page, so every link keeps the filters; the calendar's own text is never shown (a
// browser draws it month-first), only the date in words is.
export function DaySwitch({ words, prev, next, today, isToday, at, day }: { words: string; prev: string; next: string; today: string; isToday: boolean; at: string; day: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const ring = "inline-flex min-h-[var(--tap)] min-w-[var(--tap)] items-center justify-center rounded-[var(--radius-control)] text-[var(--ink)] hover:bg-[var(--surface)]";
  return (
    <nav className="flex items-center gap-[var(--space-1)]" data-day-switch aria-label="Day">
      <Link href={prev} className={ring} aria-label="Previous day" data-day-prev>
        <Icon name="previous" size={ICON_SIZE.row} />
      </Link>
      <b className="px-[var(--space-2)] text-center whitespace-nowrap tabular-nums" data-day-words aria-live="polite">{words}</b>
      <Link href={next} className={ring} aria-label="Next day" data-day-next>
        <Icon name="following" size={ICON_SIZE.row} />
      </Link>
      {isToday ? null : (
        <Link href={today} className="btn secondary" data-day-today>
          Today
        </Link>
      )}
      <span className="relative inline-flex">
        <button type="button" className={ring} aria-label="Pick a day" onClick={() => input.current?.showPicker?.()}>
          <Icon name="period" size={ICON_SIZE.row} />
        </button>
        <input
          ref={input}
          type="date"
          aria-label="Day"
          defaultValue={day}
          tabIndex={-1}
          className="pointer-events-none absolute inset-0 opacity-0"
          onChange={(e) => {
            if (e.target.value) router.push(`${at}${at.includes("?") ? "&" : "?"}day=${e.target.value}`);
          }}
        />
      </span>
    </nav>
  );
}
