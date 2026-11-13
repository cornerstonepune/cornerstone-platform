"use client";

import { useState } from "react";
import { addPersonHere } from "./actions";

/** Add a person: a button that opens a short form in place (name, school email, role). No password is asked for: the person is emailed a
 *  link to set their own. Nothing of the form is drawn until the button is pressed. */
export function AddPerson({ roles }: { roles: readonly string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button type="button" className="b-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        Add a person
      </button>
      {open ? (
        <form action={addPersonHere} aria-label="Add a person" className="mt-3 grid max-w-[640px] gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="grid gap-1 text-[length:var(--text-label)]">
            Name
            <input className="input" type="text" name="name" required />
          </label>
          <label className="grid gap-1 text-[length:var(--text-label)]">
            School email
            <input className="input" type="email" name="email" required />
          </label>
          <label className="grid gap-1 text-[length:var(--text-label)]">
            Role
            <select className="input" name="role" defaultValue="educator">
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <button className="b-btn b-btn-main md:col-start-3" type="submit">
            Add and send a link
          </button>
        </form>
      ) : null}
    </div>
  );
}
