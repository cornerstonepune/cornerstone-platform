# 0118 — Staff emails, personal details and "Set new password" are for co-founders only

Date: 2026-11-28. Status: accepted (Nimish, 28 Nov: "All co-founders"). Not built.
Goal: none — proved by the owner-only tests to be written with the staff table ticket (`/setup/staff`).

## Why
Nimish asked for sign-in emails, more details and a password action on the staff table, for "the owner" only. The system
has no owner. Offered: Nimish alone, or all co-founders. He chose all co-founders.

## Decision
- "Owner" means a signed-in person who holds the co-founder role (`founder`) today. The server checks it for the columns,
  the search by email and the password action. Hiding them on screen is not the check.
- Co-founder-only columns (Nimish, 28 Nov): Email, Password status (set / not set / temporary), Last sign-in (needs a new
  stored value, so it starts from release), Phone (shown only if filled). Inactive people, date added and campus: not shown.
- The rest of the staff page keeps its present readers (access group `everything`).
- The temporary password is shown once, only its scrypt hash is stored, and it must be changed at the next sign-in.

## Needed for this to hold (Plan's condition, verify first)
Add a person and the grant forms appear to let a coordinator create a co-founder (read in code, not tested). So only a
co-founder may add one, give or end the co-founder role, or put a removed co-founder back on the list.

## Consequences
- A co-founder can set another co-founder's password and so sign in as them. The action is recorded (who, whom, when;
  never the password).
- Whether Nimish's own account holds the co-founder role on live is unchecked: check before release.
