# CP-79: Money MM-3 — the campus operations lead approves a claim and a founder pays it

Issue #896. Go-ahead from Nimish in chat, 2026-11-19. Depends on CP-78.

## What

A claim is approved or sent back by the campus's operations lead and paid by a founder, each judged by the rules the claim was filed under, so a later
change to the rules never reaches a claim already filed. Engine first; the queue screens are their own small PR.

## Done when

1. A person whose role is as high as the claim's approving role, on a campus they act for, and not the claimant, approves it: one `approval` row of kind
   `expense`. The claimant's "My claims" shows it approved.
2. A claim by someone who approves claims is approved only by someone who also holds the capability to pay (a founder). Whoever may not, the claimant, or a
   person on another campus is refused in words and nothing changes.
3. The same people send a claim back, saying why; the reason shows in "My claims". A claim already decided is not decided again.
4. A person who holds the capability to pay, and is as high as the claim's pay tier names for its amount, pays an approved claim with the date, the mode and
   the reference; "My claims" shows it paid with the date and reference. A claim not approved, already paid, or paid by someone who may not, is refused.
5. `queue` lists the claims a person may approve now, and only those.
6. A claim is judged by the version of the rules it pinned when filed: both the approving role and the pay tier are read from it.

## Out of scope

The queue and pay screens; floats, budgets, exceptions and the report (MM-4 onward); a sent-back claim corrected and filed again (a new claim for now); capex,
float top-up and event-budget claims, which take the same route with their own kinds.

## Schema

No new table. The approval log accepts the kind `expense` (its kind check, and the check that wants a first approval, each get one line; the second is a
replaced function, so the function count is unchanged), and a claim gains four columns for its payment: when, mode, reference and who.

## Assumed

- Where an operations lead sits on the ladder (between educator and coordinator, CP-77), so a coordinator may also approve a claim, on any campus.
- "Pays up to a limit" names the founders for both tiers until each tier names a person (CP-77); the tier check reads the role, not a person.
