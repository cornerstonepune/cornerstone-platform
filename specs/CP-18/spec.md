# CP-18: Materials: reading prompt scored and on, sends recorded, reminders delivered

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/466
Scope locked by: Nimish (the label scope-locked on pull request #490, 8 Nov 2026; issue #466 carries the same text)

Waits for CP-17 (the educator's approval of a list), CP-6 (the fortnight's "list sent" step) and CP-4 (the table list, which a new table must join). Plan: docs/backend-plan.md. Roadmap tasks M1-10, M1-16. Tier 3: a model prompt switched on, messages that leave the system, a data change. Design: specs/CP-18/design.md. Assumption until CP-17 is scoped: CP-17 gives one check, "is this list approved as it reads now", and works per fortnight.

## What

Three pieces of the materials work are unfinished. The prompt that reads an educator's typed or photographed materials note is off, with no test notes and no score. A list can be "sent" to nobody, and the record never says to whom. Reminders, two weeks and one week before materials are needed, are counted but reach nobody. This scores the prompt on real notes and switches it on only if it meets its bars. It makes every send say who sent what, to whom and when, and delivers each reminder to each person or records why not. Counts are given per fortnight (weeks A and B inside it).

## Done when

1. The note-reading prompt is scored on real marked notes: at least the number of lines its settings row asks for (60 by default), at least one note photographed. Its result against each bar is written in the decisions log, and the version switched on is the one that met every bar. (Test. LIVE, box only: the active version on the live database is the scored one.)
2. A list cannot be sent until its educator has approved it as it reads at that moment (CP-17). A combined list cannot be sent while any class list in it is unapproved, and the refusal names those classes. (Tests.)
3. Every send records who sent it, the text, when, and which staff member it went to. The recipient is named as a staff member in a setting, never as a phone number in a setting or a send record. With nobody named, or no number on file, nothing is sent: the list stays unsent, its reminders stay on, and the record says "not configured". (Tests.)
4. Sending a combined list that covers exactly one fortnight marks that fortnight "list sent" (CP-6), with the same who and when. (Test.)
5. Each reminder that falls due is delivered by email once to each of its people (the educators who hold the class, or the named materials-team member), or a record says why not: failed, not configured, or no contact on file. Nobody gets the same reminder twice, even when two runs start together. A list sent before its reminder goes out gets no reminder. A reminder past the first day the material is needed is not sent. (Tests.)
6. No phone number, email address or name appears in any log, send record or delivery record. (Test: log and table scan.)
7. No test or proof sends a real message. With no sending account set up, delivery records "not configured" and contacts nothing. (Test.)
8. LIVE, box only, read-only counts per fortnight: at least one real send with a recipient; at least one reminder delivered; no due reminder left with no record at all. (Read-only count.)

## Out of scope

Stock and issue records, the rupee threshold and the approval itself (CP-17). Any screen, including the send button, photo entry and the review page. Messages to parents (CP-19). Sending a class list by email. Writing reminders with a model. Switching on any other prompt. A WhatsApp sender: reminders go by email (Nimish, 8 Nov); WhatsApp is added later as a second sender, with each person's recorded yes.
