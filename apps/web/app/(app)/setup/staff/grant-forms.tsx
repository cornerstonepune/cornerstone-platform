"use client";

import { startTransition, useActionState, useId, useState } from "react";
import type { Givable, Said } from "@/lib/grants";
import { endGrant, giveGrant } from "./actions";

/** Add a grant: a button that opens a short form in place under a person's grants (role, class, and a subject only for a role that is held for
 *  a subject). It starts from today; there is no date to type. The grant table's own words come back under the form; when the table asks for a
 *  reason (a second class educator, a clash) the reason box appears and the same Save sends it. */
export function AddGrant({
  staffId,
  options,
}: {
  staffId: string;
  options: Givable;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const [role, setRole] = useState(options.roles[0]?.code ?? "");
  const [place, setPlace] = useState("");
  const [subject, setSubject] = useState("");
  // the fields keep what was chosen while the table answers (a form `action` resets the form after it runs, which would drop the class chosen when a reason is asked for); they clear once the grant is given
  const [said, act, busy] = useActionState(
    async (before: Said, form: FormData) => {
      const got = await giveGrant(before, form);
      if (got?.ok) {
        setPlace("");
        setSubject("");
      }
      return got;
    },
    null,
  );
  const wantsSubject =
    options.roles.find((r) => r.code === role)?.scope === "class_subject";
  return (
    <div className="mt-4">
      <button
        type="button"
        className="b-btn"
        data-grant-add
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Add a grant
      </button>
      {open ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            startTransition(() => act(data));
          }}
          aria-label="Add a grant"
          className="mt-3 grid max-w-[640px] gap-3 md:grid-cols-2"
        >
          <input type="hidden" name="staff_id" value={staffId} />
          <div className="grid gap-1 text-[14px]">
            <label htmlFor={`${id}-role`}>Role</label>
            <select
              id={`${id}-role`}
              className="input"
              name="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {options.roles.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1 text-[14px]">
            <label htmlFor={`${id}-class`}>Class</label>
            <select
              id={`${id}-class`}
              className="input"
              name="class"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              required
            >
              <option value="" disabled>
                Choose a class
              </option>
              {options.classes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {wantsSubject ? (
            <div className="grid gap-1 text-[14px]">
              <label htmlFor={`${id}-subject`}>Subject</label>
              <select
                id={`${id}-subject`}
                className="input"
                name="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              >
                <option value="" disabled>
                  Choose a subject
                </option>
                {options.subjects.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {said?.reason ? (
            <div className="grid gap-1 text-[14px] md:col-span-2">
              <label htmlFor={`${id}-reason`}>Why it should stand anyway</label>
              <input
                id={`${id}-reason`}
                className="input"
                type="text"
                name="reason"
                required
              />
            </div>
          ) : null}
          <p className="note m-0 md:col-span-2">
            It starts today and stays on the list when it ends.
          </p>
          <button
            className="b-btn b-btn-main md:col-span-2 md:w-fit"
            type="submit"
            disabled={busy}
          >
            Save the grant
          </button>
          {said ? (
            <p
              role="status"
              className={`m-0 text-[14px] md:col-span-2 ${said.ok ? "" : "text-terracotta"}`}
            >
              {said.said}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

/** End a grant: valid to today. One press; the row stays. */
export function EndGrant({ grantId, what }: { grantId: string; what: string }) {
  const [said, act, busy] = useActionState(endGrant, null);
  return (
    <form action={act} className="inline">
      <input type="hidden" name="grant_id" value={grantId} />
      <button
        type="submit"
        className="b-btn"
        data-grant-end
        disabled={busy}
        aria-label={`End a grant: ${what}`}
      >
        End a grant
      </button>
      {said && !said.ok ? (
        <span role="status" className="ml-2 text-[14px] text-terracotta">
          {said.said}
        </span>
      ) : null}
    </form>
  );
}
