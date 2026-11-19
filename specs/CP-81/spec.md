# CP-81: Money history — the school's expense sheet filled in, with its categories and sub-categories

Nimish, in chat, 2026-11-19: "real raw data - fill this into the database, create proper categories and sub categories from this data if required."
The data is two files from the school's cleaned expense sheet (1,301 lines from Nov 2021 to Nov 2026, and the bill-file check of each line). They stay out of the
repository: the command reads them by path.

## What the data showed (read 2026-11-19)

- 1,301 lines over six academic years, ₹11,69,920 in all. 15 categories, already the school's own words.
- A second column, the cost stream (17 values, blank on 916 lines), is **not nested inside the categories**: Porter appears under Events, Transport and Equipment.
  So a **sub-category** is stored on the line as it is in the sheet, and the sheet's pairs give the lists the form offers: a stream is listed under a category
  where it occurs at least three times. Twelve events are a third tag. Equipment (capex), advance, late and urgent are flags.
- Campus is Gurukul or Neev on 512 lines; 789 say Both, Event or nothing.
- 41 lines have a month and no date; one date is in 2027; 18 spellings of about 15 payers, of whom one is on the staff list today.

## Done when

1. `engine money import EXPENSES BILLS` (a dry run) writes nothing and says what it would do: lines, total, the people it would add, the names it takes for the
   same person, dates it would replace, lines it would skip and why.
2. With `--apply` every line becomes one claim of status `historic` with its date, amount, vendor (the sheet's description), category, sub-category, event, flags,
   bill kind and the bill's file title, and the sheet's own notes; the total of the claims equals the total of the lines taken.
3. Running it again changes nothing (each line keeps its sheet id).
4. A payer who is not on the staff list becomes an inactive member of staff (no sign-in), so every claim has a real claimant; a payer on the list is that person;
   near-identical spellings are one person. A line with no date or one after today takes the first of its month, and says so in its note.
5. A historic claim is in no queue and in nobody's "Waiting"; it reads "Earlier record" for anyone who sees it.
6. The categories, sub-categories and events are the school's settings, from this data; a claim may now carry a sub-category the category lists.

## Out of scope

The Money screens showing history (a dashboard, MM-11), splitting "Both" between campuses, matching bill files in the Drive to claims (their titles are kept), a
screen to edit sub-categories (the Rules screen lists categories only for now).

## Schema

No new table. `expense` gains `subcategory`, `event`, `tags`, `bill_quality`, `bill_ref` and `source_ref`; its status gains `historic`; its campus may be empty
for a historic line. Settings: `money.categories` (the 15), `money.subcategories`, `money.events`; the money settings are seeded once, so a deploy never resets
what the founders change.
