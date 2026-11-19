# CP-78: Money MM-2a — a member of staff files a claim and tracks it (typed in; the bill reader follows)

Issue #895. Go-ahead from Nimish in chat, 2026-11-19. Depends on CP-76 and CP-77.

## What

Any member of staff files a claim: the amount, the date, the vendor, what it was for, which campus, and a photo of the bill kept privately.
"My claims" lists their own with where each stands. Engine first; the screens (File a claim, My claims) are their own small PR.

MM-2 is split so the first part does not wait on data this session cannot reach: **MM-2a** (this) is typed in, checked by code, kept and tracked;
**MM-2b** has the model read the bill for the person to confirm and needs 20 real bills with their ledger amounts to be scored against first
(CLAUDE.md Rule 7), which are in the school's Drive; **MM-2c** is the screens.

## Done when

1. `submit_claim` keeps a claim: amount in rupees (two decimals, more than nothing), a date not in the future, the vendor, a category from the
   setting `money.categories`, a campus the person acts for, a note. It pins `money_rules.version`. Each bad input is refused in words and
   nothing is kept.
2. The bill's photo is kept on the engine box (private, as lesson photos are), never in git or a log; the claim holds only its key. A type that is
   not a photo or a PDF, or a file over 10 MB, is refused.
3. `my_claims` gives a person only their own claims, newest first, each with its status and, once it has one, the reason. In this slice the
   statuses are submitted, withdrawn and voided; sent back, approved and paid arrive with MM-3, which writes them as `approval` rows.
4. A claim is never deleted. Its claimant withdraws it while it is submitted; a person who holds the capability to approve voids a submitted claim
   with a reason. Each is one `change_log` row (the table's own trigger).

## Out of scope

The bill reader (MM-2b); the screens (MM-2c); approving and paying (MM-3: the `approval` kind `expense` and its trigger checks are added there);
floats, budgets, recurring bills.

## The one new table

`expense`: one row per claim, many per person, money with a life of its own; not a column, not a row of a shared table (none holds money), not a
rule on a column or a view. `supabase/table-budget.json` goes from 85 to 86 with this reason. Approvals will be `approval` rows, history
`change_log`, categories and limits `config`. Its access class is `school_wide` with the reason that each person sees their own through the engine.

## Assumed

- The starting categories (setting `money.categories`) are the streams the public brief names plus the financial model's heads, with Materials and
  Other so a claim is never blocked. The school's own list is in its expense sheet, which this session could not open.
- A claim's `delete` is refused by the generic "never deleted" trigger, whose message mentions `valid_to` (written for grants): wording to tidy.
