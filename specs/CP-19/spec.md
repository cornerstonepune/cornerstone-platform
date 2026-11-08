# CP-19: Reports line by line, consent before any send, and the coordinator's counts

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/467
DRAFT for Nimish. Not locked.

Waits for CP-4 and CP-9. Plan: docs/backend-plan.md. Roadmap tasks M1-07, M1-08. Tier 3 (migration, parent communication,
consent, child data). Design: specs/CP-19/design.md (reviewed, then simplified).

## What

Each line of a parent report stands on its own: it shows the dated evidence it rests on, says when that evidence is
thin, and needs two different people to approve it, first the child's class educator, then the coordinator. A report
can be marked as sent only when consent is on record and every line is approved. The coordinator's counts, per
fortnight, come from one place in the database. Per-educator figures are counts of notes, never a score. No real
message goes to a parent in this scope. The one new table is listed in CP-4's table list as child data.

## Done when

1. Each line of a parent report is stored on its own and lists the confirmed, dated evidence it rests on; a line citing
   another child's evidence, unconfirmed evidence, or evidence dated after the report's period is refused. (Test.)
2. A line resting on fewer pieces of evidence than the school's "seen enough" setting shows as thin; changing the
   setting changes which lines are thin, with no code change. (Test.)
3. Each line needs two approvals: first an educator of the child's class, then the coordinator. The same person twice,
   a third approval, an approval with no signed-in person, and an approval from the engine instead of the website are
   all refused. (Test.)
4. A report can be marked sent only through one database function, which refuses when consent is not on record for the
   child (or the school's data register changed since it was given), when any line is not approved twice, or when the
   report has no lines or is already sent. Any other attempt to mark a report sent is refused by the database. (Test.)
5. The coordinator's counts for a fortnight (per class: notes confirmed, notes late, children without notes, class days
   without notes, unplanned sessions, lines waiting at each approval step, lines approved, reports sent) each equal a
   direct count on the database for the same fortnight. (Test.)
6. Per-educator figures are only notes confirmed and notes late, whole numbers with no score, rate, rank or ordering;
   the coordinator sees every educator's, an educator only their own. (Test.)
7. The engine's coordinator list and the website's reports page read their counts from that one function; their own
   counting is gone, and the existing pages and speed tests pass. (Test.)
8. LIVE: the coordinator's counts for the current fortnight agree with an independent read-only query. (Counts only, no
   names.)

## Out of scope

Any screen. Delivering a message by WhatsApp or email. Recording consent on a screen. A record of refused sends. An
"out of date" rule in the database. Rewording one line without rebuilding the report. Changing the child picture (CP-9)
or who may read which table (CP-3, CP-4).
