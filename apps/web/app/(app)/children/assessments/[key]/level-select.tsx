"use client";

import { changeLevel } from "./actions";

/** A copy's level, changed before print: choosing sends it (one copy), no other button. */
export function LevelSelect({ assessment, sheet, roll, level, order }: { assessment: string; sheet: string; roll: string; level: string; order: readonly string[] }) {
  return (
    <form action={changeLevel}>
      <input type="hidden" name="key" value={assessment} />
      <input type="hidden" name="sheet" value={sheet} />
      <select name="difficulty" defaultValue={level} aria-label={`Level for Sr. No. ${roll}`} className="select" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {order.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </form>
  );
}
