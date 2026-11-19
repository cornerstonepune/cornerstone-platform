# CP-87: Event budgets: Sports Day first

MM-7 of the Money & Materials brief (the one row with a hard date: the Sports Day budget confirmed by 1 December 2026; Sports Day is
5 and 12 December). Budgets by category and month come later (MM-7 in full); this is the per-event part.

## What

An event has a budget before money is spent on it. A founder sets it; everyone who sees Money reads it with what has been spent and what
is left; a claim tagged to an event shows what is left; spending past it needs a founder.

An event here is an occurrence: an event of the school's list (`money.events`) and a year, "Sports Day 2026". The budgets are a setting,
`money.event_budgets` (a row of settings keeps its history in words, as the Rules do); no new table. Nothing is seeded: the amounts are the
founders' to enter.

## Done when

1. A founder sets the budget of an event occurrence on a new Money tab **Budgets** (event from the school's list, a year, an amount); the
   change is kept in the history and read in words. Everyone else who sees Money reads the budgets, each with spent and left; a person
   who may not change them sees no form.
2. A claim can be tagged to an event that has a budget (optional, on the claim form); the claim reads the event's budget left after it.
   Spent counts submitted, approved and paid claims tagged to the event; never withdrawn or voided ones.
3. A claim in the category "Events & celebrations" tagged to an event with no budget is refused in words that name who sets it.
4. A claim that takes an event over its budget can be approved only by a founder; the approver's panel says by how much it is over.
5. 1440 px and 400 px (no sideways scroll, controls of at least 44 px); the design-system guard covers the new page; the guide has it.

## Out of scope

Budgets by category and month, a draft from the last twelve months, the monthly report and exceptions (MM-5), a screen to edit the events
list, splitting a budget between campuses.
