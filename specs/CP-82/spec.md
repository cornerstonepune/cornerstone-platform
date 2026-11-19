# CP-82: Stock and the buy list — what each campus holds, what its classes need, what to buy

(MM-9 of the Money & Materials brief. Nimish, 2026-11-19: the materials side is the main thing; money was the rail.)

## What

One menu line, **Stock**, with tabs *On hand · Buy list · Count*. Each campus has one store. A campus's operations lead
(or a coordinator or founder) keeps it:

- **On hand:** every catalogue item the campus has or needs, its quantity in the catalogue's unit, its minimum, and a
  plain word (*enough*, *low*, *none*, *count it*). Below the minimum comes first. Record **stock in** (what arrived,
  how many, the claim it was bought on, if any) and **hand out** (which class, what, how many).
- **Buy list:** for a campus and a month: what its classes' lists need, less what is on hand, plus the top-up to the
  minimum. A need with no quantity from a class says *to confirm*, never a smaller number. Each line shows the classes
  and activities it comes from. It opens as the same WhatsApp checklist the inventory person already gets.
- **Count:** the termly count on a phone: one line per item, type what you see; a difference above the tolerance needs
  a reason; a write-off needs a reason.

The catalogue (`material_item`) is the item list. One store per campus, so the campus is the store: no store table.

## Done when

1. A keeper records stock in for a catalogue item (quantity, optional claim) and the campus's on-hand rises by it.
2. A keeper hands out an item to a class and the on-hand falls; going below zero is allowed, shown as *count it*.
3. A count sets the on-hand to what was counted and keeps the difference; a difference above the tolerance (a setting)
   or a write-off is refused without a reason, in words.
4. A minimum is set per item per campus; items below it are marked *low* and listed first.
5. The buy list for a campus and a month is need minus on hand plus top-up to minimum, never below zero; an unknown
   need says *to confirm*; each line names its classes and activities; it opens as a checklist to send.
6. Every stock move is append-only: nothing edits or deletes one, a correction is a new move; the history reads in words.
7. A person who keeps no store sees no Stock line and is refused at its addresses; a keeper sees and changes only
   the campuses they act for (`campuses_of`); a coordinator or founder, every campus.
8. At 1440 px and 400 px (no sideways scroll, controls of at least 44 px); stock in and count are phone-gate screens;
   the design-system guard (u90) covers the new pages.

## Out of scope

Grouping the buy list by vendor and rates (MM-6); the annual buy draft (MM-10); an educator ticking "collected" on their
own class list (a later change to `/timetable/materials`); filling the catalogue itself (CP-83); a stock photo or a
barcode; reading a bill.

## Data (one new table, reasoned)

`stock_move(id, tenant_id, campus_id, material_code, kind in ('in','out','count','writeoff','minimum'), quantity,
class_id?, expense_id?, reason?, by, at)`, append-only, RLS on. *Why not a column or a shared row:* a quantity per
campus per item over time is history, not a setting; a *minimum* is one more entry kind of the same ledger, newest
wins. The on-hand is a **view** `stock_level` (last count plus the moves after it), never a table. The tolerance and
the stock roles are settings (`stock.count_tolerance`, `stock.reasons`), not code. `supabase/table-budget.json`
`raised_by` names this spec.

## Engine contract (routes the screens call)

- `GET  /stock/on-hand?campus=` → `{campus, items:[{code,name,unit,on_hand,minimum,word}]}` (low first)
- `POST /stock/in` `{campus, material_code, quantity, expense_id?}` · `POST /stock/out` `{campus, material_code, quantity, class_label}`
- `POST /stock/count` `{campus, lines:[{material_code, counted, reason?}]}` · `POST /stock/writeoff` `{campus, material_code, quantity, reason}`
- `POST /stock/minimum` `{campus, material_code, minimum}`
- `GET  /stock/history?campus=&material_code=` → moves in words
- `GET  /stock/buy-list?campus=&month=YYYY-MM` → `{lines:[{code,name,unit,need|null,on_hand,minimum,to_buy|null,sources:[{class,activity}]}], checklist_url}`
- `GET  /stock/access` → `{campuses:[...]}` (empty = no Stock line)
