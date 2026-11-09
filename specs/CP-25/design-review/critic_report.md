# Stage 7: Critic Review

## egm-structural (structure and style, lines 1-202)
Verdict: not ready (one blocker).
1. 🔴 The Problem section is written in engine internals; its reader is the founder. Open with plain sentences of what
   breaks for the school; move the root-cause detail and the four-copies table into the Technical Plan.
2. 🟡 Goal 7, Non-Goals and Open Question 1 disagree (parent reports dropped in Goal 7 though the founder still decides).
3. 🟡 "48-hour clean-up" (scope) vs "late after 3 hours" (design): explain that 48 hours is how long copies are kept and
   the job runs hourly.
4. 🟡 Alternatives: "lean first" is a slogan, not a reason; item 4 entry malformed; entries out of order.
5. 🟡 No Risks & Mitigations section of its own (risks sit under the implementation plan, without mitigations).
6. 🟡 Goals use engineer terms (keyed route, live watch, runbook, brand pack).
7. 🟡 Open Questions name file paths and process words; OQ2 is a dependency, not a question.
8. 🟡 A table follows a bold line with no blank line.
9-20. 🟢 Blank line after the status line; "Items 1 and 2"; define "the day page" before use; list the rejected
   in-library check under Alternatives; split the seed_value rule into bullets; "alignment marks the scanner uses";
   define rule 3; "idempotent"; link the out-of-scope list.

## egm-design (lines 1-202)
Verdict: needs revision. Item 1's root cause confirmed correct.
1. 🔴 A partial layer (CP-12's copy skips dates with no calendar row; a holiday removed later) would silently drop a day
   from a drafted and approved plan under "layer for the whole fortnight". Fix: layer-or-frame per date, or refuse.
2. 🟡 Plans drafted under the old date rule (fortnights not Monday-start or not 14 days) stop matching after the
   migration: list and redraft open fortnights, or prove there are none on live.
3. 🟡 The old unique key's generated name is over 63 characters: find it in `pg_constraint` by columns, do not guess.
4. 🟡 The door check fails open on a missing setting and mis-reads a list: fail closed, match the database's shapes.
5. 🟡 `app.staff_id` must be transaction-local; `app.changed_by` set to the staff id or not at all; check that
   `resolve_staff()` returns the staff id the door checked.
6. 🟡 "People reach these actions only through the doors" overstates: route identity is as strong as the engine key;
   record the boundary as a risk.
7. 🟡 `engine timetable draft --by` changes from a staff id to an email: name the interface change and its callers.
8. 🟡 The seed_value rule's cases: compare as jsonb; print the keys kept; engine rollback case; CUJ 3 "after one deploy".
9. 🟡 No Risks & Mitigations section.
10-14. 🟢 Link decisions; "nothing written" except the lookup's access-log row; 48 hours is retention, the job is
   hourly; match layer rows by (date, period), not by stored week/weekday; say whether new keys go into config.json.
