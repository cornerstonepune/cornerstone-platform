import { changeLevel } from "./actions";

/** A copy's level, changed before print with the reason, which is kept: the prescriber reads the override and leaves that child alone next
 *  time. One copy, its own button; nothing changes on choosing a level alone. */
export function LevelSelect({ assessment, sheet, roll, level, order }: { assessment: string; sheet: string; roll: string; level: string; order: readonly string[] }) {
  return (
    <form action={changeLevel} className="grid gap-1">
      <input type="hidden" name="key" value={assessment} />
      <input type="hidden" name="sheet" value={sheet} />
      <select data-level="" name="difficulty" defaultValue={level} aria-label={`Level for Sr. No. ${roll}`} className="select">
        {order.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <input data-level-reason="" name="reason" required maxLength={300} aria-label={`Why Sr. No. ${roll} changes level`} placeholder="Why" className="input !py-1 !text-[length:var(--text-label)]" />
      <button type="submit" data-level-save="" className="btn secondary !px-2 !py-1 !text-[length:var(--text-caption)]">
        Change this child
      </button>
    </form>
  );
}
