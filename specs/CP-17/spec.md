# CP-17: Inventory: stock and issue records, rupee threshold, educator approval of the fortnight's list

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/491 (draft, not yet locked)
Scope locked by: not locked. Nimish adds the label scope-locked when he agrees.

Needs CP-6 (the fortnight schedule) and CP-4 (data access rules) finished first.

## What

The school sets one number: from how many rupees an item is worth tracking (₹500 to start; the school can change it).
For those items it keeps a record of every unit that comes in, goes to a class, comes back, is counted or is written
off. How many are on hand, and where, is worked out from those records, and can never go below zero.

Each class's materials list for a fortnight must be approved by an educator of that class before it can be sent. If
the list changes after that, by an educator or because the system regenerates it, it must be approved again.

Records and approvals are never changed or deleted; a correction is a new record. No money moves: the rupee value only
labels an item. The fortnight is the unit (the backend plan document says "month"; the school plans by fortnight).

## Done when

1. Each school has a rupee threshold setting (₹500 to start). An item counts as tracked when its rupee value has been
   entered and is at or above the threshold; an item with no value entered is never tracked. Changing the setting
   changes which items are tracked, with no code change. (Test.)
2. The system and the website both use this one rule; the old rule (any item with a price is tracked) is gone. (Test.)
3. For a tracked item, a record can be made of stock received, issued to a class, returned to the store, counted or
   written off. Each record keeps the item, the number, the place (the store or a class), who and when. Stock on hand
   in each place is worked out from the records. Records cannot be changed or deleted; a correction is a new record.
   (Test.)
4. The system refuses: new stock of an item that is not tracked; issuing, returning or writing off more than is on hand,
   even when two people do it at the same moment; a write-off, or a count that changes the number, without a reason;
   a record by someone whose role the school has not allowed to record stock. (Test.)
5. A class's fortnight list can be approved only by an educator of that class whose role the school allows to approve,
   only once the fortnight's plan is frozen, and only for the lines that educator was shown. The approval keeps who and
   when, cannot be changed or deleted, and appears on the school's approvals list with every other approval. (Test.)
6. If a list's lines change after approval, whether an educator edits them or the system regenerates the list, it is no
   longer approved. A fortnight list cannot be sent, by any route and including a second send, without a current
   approval. Daily and weekly lists work as today. (Test.)
7. Every new table has its access rule, and the existing materials tests still pass, changed only to add an approval
   where they send a fortnight list. (Test.)
8. After release, a check on the live system confirms every school has the three new settings and no item shows below
   zero in any place. (Read-only count, no names.)

## Out of scope

Any screen. Sending lists and reminders, and marking the fortnight's list as sent (next scope, CP-18). The monthly
school-wide list. Purchases, orders, suppliers, invoices or payments. Entering rupee values for items (a person does
that; never guessed). Automatic reordering. A second sign-off for write-offs. Sending a list back with a reason.

For the builder: plan docs/backend-plan.md; roadmap task M1-13; tier 3 (a database change, rupee values, approvals);
design specs/CP-17/design.md; every new table needs its access_table row (CP-4) or CI fails.
