# CP-19: Reports line by line, consent before any send, and the coordinator's counts

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/467
DRAFT for Nimish. Not locked.

Waits for CP-4 and CP-9. Plan: docs/backend-plan.md. Roadmap tasks M1-07, M1-08. Tier 3 (migration, parent communication,
consent, child data). Design: specs/CP-19/design.md (reviewed).

## What

Today a parent report is approved as a whole, the approvers are typed names, nothing checks consent before a report
goes out, and the coordinator's numbers are worked out separately on each page. This makes every line of a report stand
on its own: it shows the dated evidence it rests on, says when that evidence is thin, and needs two different people to
approve it. A report can be marked as sent only when consent is on record and every line is approved, and every refused
send is recorded. The coordinator's counts, per fortnight, come from one place in the database. Per-educator figures are
counts of notes, never a score. No real message goes to a parent in this scope.

Every new table is listed in CP-4's table list as child data.

## Done when

1. Each line of a parent report is stored on its own and lists the confirmed, dated evidence it rests on; a line that
   cites another child's evidence, unconfirmed evidence, or evidence dated after the report's period is refused. (Test.)
2. A line that rests on fewer pieces of evidence than the school's "seen enough" setting shows as thin; changing the
   setting changes which lines are thin, with no code change. (Test.)
3. Each line needs two approvals: the first by an educator of the child's class, the second by the coordinator. The same
   person approving twice, a third approval, an approval with no signed-in person, and an approval from the engine
   instead of the website are all refused. (Test.)
4. A line sent back, or reworded, needs two fresh approvals; no approval carries over. (Test.)
5. A report can be marked sent only through one database function. It refuses, and records the refusal with its reason,
   when: consent is not on record for the child or the school's data register changed since consent was given; any
   line is not approved twice; the report has no lines, is out of date, is not the newest, or is already sent. Any other
   attempt to mark a report sent is refused by the database. (Test.)
6. The coordinator's counts for a fortnight (per class: notes confirmed, notes late, children without notes, class days
   without notes, unplanned sessions, lines waiting at each approval step, reports out of date, reports sent, sends
   refused) each equal a direct count on the database for the same fortnight. (Test.)
7. Per-educator figures are only the number of notes confirmed and notes late, whole numbers with no score, rate, rank or
   ordering; the coordinator sees every educator's, an educator sees only their own. (Test.)
8. The engine's coordinator list and the website's reports and Today pages show the counts and "out of date" from that
   one database source; their own counting is gone, and the existing pages and speed tests pass. (Test.)
9. The new report-writing prompt (one sentence per line) is active only after its eval score is recorded at or above its
   bar. (Test: the prompt row and the decisions log.)
10. LIVE: the coordinator's counts for the current fortnight agree with an independent read-only query. (Counts only, no
    names.)

## Out of scope

Any screen (the line-approval view and the coordinator's page come with the frontend revamp). Delivering a message to a
parent by WhatsApp or email. Recording consent through a screen. Changing how the child picture is built (CP-9) or who
may read which table (CP-3, CP-4).

## Decisions for Nimish (before locking)

1. Who gives the two approvals: recommended, the class educator then the coordinator (the agreed workflow's "coordinator
   approves"). Written into item 3.
2. What a parent sees for a thin area: recommended, the line stays and says the educator has not yet seen enough to say.
3. Who sees per-educator counts: recommended, the coordinator sees all; each educator sees only their own. Written into
   item 7.
