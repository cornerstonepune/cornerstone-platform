# CP-77: Money MM-1 — the rules the co-founders set (D-078), engine first

Issue #893. Go-ahead from Nimish in chat, 2026-11-19 ("Go ahead and start building the rest"); the three co-founders hold the power to set the
rules (Nimish, same day). Depends on CP-76.

## What

The money rules as one piece of data, a check that refuses a rule set that cannot work, and a record of every change. Roles are one ladder:
each role holds everything the roles below it hold (Nimish, same day: "educator has a capability, coordinator has educator plus, founder is all
of them"). Engine first; the Rules screen is its own small PR.

No new table: the rules are one setting (`money.rules`), a change is a `change_log` row, and a claim pins a version number from that history.

## Done when

1. The starting rules are one setting: the ladder (educator, ops, coordinator, founder), the lowest role that holds each capability (submit,
   approve, pay, close a float, set a budget, set the rules), per kind of claim the lowest role that approves and who pays by amount, and the
   limits and deadlines the public brief states.
2. A role holds a capability when it is as high on the ladder as the lowest role the rules give it.
3. The rules are changed only by someone who holds the capability to set them (by their role or a grant of one today); anyone else is refused and
   nothing changes. The co-founders hold the role `founder`, which is added besides the role they have.
4. A rule set that cannot work is refused in words and nothing changes: a kind of claim approved or paid by a role that does not hold that
   capability, an amount no one pays, a role off the ladder, or a claimant allowed to approve their own claim.
5. Each accepted change is one `change_log` row (who, when, before, after, why); `version` is the number a claim pins when submitted and
   `at_version(n)` gives the rules that version had, whatever is changed after.

## Out of scope

The Rules screen (own PR, design skills); telling the other co-founders of a change (needs a notify adapter); claims and payments (MM-2, MM-3);
giving the three co-founders the role in the live database (a live change through the engine once their staff rows are named); the starting values
D-077 holds beyond the public brief.

## Assumed

- The operations lead (`ops`) sits between educator and coordinator on the ladder: one line in the setting to move.
- Both pay tiers name `founder` until each tier names the person (up to the pay limit one co-founder, above it the finance co-founder).
- The role `founder` is added to the one school; a school made later would not get it (no second school exists).
