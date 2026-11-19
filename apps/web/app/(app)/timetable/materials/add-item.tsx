"use client";

import { useState } from "react";
import { ItemPicker } from "@/components/item-picker";
import { BTN } from "@/components/educator/materials-table";
import type { Picked } from "@/lib/catalogue-words";
import { E } from "@/lib/educator/words";
import { addLine } from "@/app/(app)/educator/materials/actions";

// Add an item to the class list (CP-84b): the item is chosen with the one picker, so what reaches a list is always an item of the catalogue (never free text),
// and one the catalogue lacks is added there first ("Not in the list? Add it"). The line itself is the same server action as before (the engine's
// /materials/line/add), with the item's code; the items already on the list are not offered again.
const W = E.materials;

export function AddItem({ list, day, on }: { list: string; day: string; on: readonly string[] }) {
  const [item, setItem] = useState<Picked | null>(null);
  // the line is added by the server action, and the picker is free for the next item (the page is drawn again with the line on it)
  const submit = async (f: FormData) => {
    await addLine(f);
    setItem(null);
  };
  return (
    <form action={submit} className="b-form" data-add>
      <input type="hidden" name="list" value={list} />
      <input type="hidden" name="day" value={day} />
      <ItemPicker label={W.add} name="code" value={item} onPick={setItem} exclude={on} />
      <div>
        <button type="submit" className={BTN} disabled={!item}>
          {W.addButton}
        </button>
      </div>
    </form>
  );
}
