"use client";

import { useState } from "react";
import { moveFromClass } from "./actions";

/** Move (a child row): opens a picker of the classes of this year, the Sr. No. in the new class and the date it starts; Save
 *  runs the database's move. Nothing is drawn of the form until the button is pressed. */
export function MoveButton({ childId, name, roll, targets, today, back }: { childId: string; name: string; roll: string; targets: readonly { label: string; grade: string }[]; today: string; back: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" data-move className="b-btn" aria-expanded={open} aria-label={`Move ${name}`} onClick={() => setOpen(!open)}>
        Move
      </button>
      {open ? (
        <form action={moveFromClass} className="mt-2 grid gap-2" aria-label={`Move ${name}`}>
          <input type="hidden" name="child_id" value={childId} />
          <input type="hidden" name="back" value={back} />
          <label className="grid gap-1 text-[14px]">
            To class
            <select name="section" required defaultValue="">
              <option value="" disabled>
                Choose a class
              </option>
              {targets.map((t) => (
                <option key={t.label} value={t.label}>
                  {t.label} ({t.grade})
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[14px]">
            Sr. No. there
            <input name="roll" required defaultValue={roll} pattern="[A-Za-z0-9\-]{1,8}" />
          </label>
          <label className="grid gap-1 text-[14px]">
            From
            <input name="from" type="date" required defaultValue={today} />
          </label>
          <button type="submit" className="b-btn b-btn-main">
            Save the move
          </button>
        </form>
      ) : null}
    </div>
  );
}
