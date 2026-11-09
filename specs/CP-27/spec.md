# CP-27: Trim the backend to its target tables

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/534 (with the amendment comment of 9 Nov 2026).

Scope approved by Nimish ("start CP-27", 9 Nov 2026). Evidence: the backend review of 9 Nov 2026 (170 tables today; 75 needed).
Decided by Nimish, 9 Nov 2026: materials keeps its four core tables; English is kept and folded into the shared tables; the proofs of the eleven affected scopes may be rewritten (the harness and its locks were removed, #536); features are frozen until this merges.

## What

The backend has 170 tables. It needs 75. This scope does four things:
1. **Removes the extra tables.** Their real rows move into the tables that stay.
2. **Rewires every engine file, website file, database function and test** to use the tables that stay.
3. **Leaves one home for each shared job:**
   - one history log;
   - one approval list;
   - one settings table;
   - one staff list;
   - one place for a child's class;
   - one timetable (the dated lessons).
4. **Stops the growth coming back:**
   - a written data map;
   - a CI gauge on the table count;
   - tests that check behaviour, not table names.

Every child's assessment results and every person and class must be the same afterwards as before.

The work is done by **one builder on one branch**. No other scope that changes the database or adds a feature runs until
this one merges.

**The method:**
1. **Census and private copy of live.** A read-only census of live (counts only). A full private copy of the live
   database, kept off git.
2. **Cut.** Remove the extra tables group by group. The failing tests and type checks list every place to rewire.
3. **Fold.** One rehearsed switch moves the real rows. Done in a window the school knows about.

## Done when

**Safety, before anything changes on live**
1. LIVE: a read-only census of every table is saved as `docs/notes/CP-27-census.md`. For each table it gives:
   - the row count;
   - the date of the last insert;
   - whether it was read since the last statistics reset.

   It also gives whether the nightly picture rebuild and the voice clean-up ran in the last 7 days, and the
   papers printed and scanned per week for 8 weeks. Counts and dates only, no names.
2. A full private copy of the live database exists before the switch. It is recorded in the note by date, size and
   checksum only. It is never in git, a log or a pull request. (Recorded; LIVE.)
3. The switch was rehearsed on a copy of live. It passed every check below there first. (CI rehearsal run.)

**The target**

4. The tables in `public` and `pii` are exactly the 77 named in `specs/CP-27/target-tables.md`, plus four kept until
   sign-in moves to the platform's own login: `password_ask`, `password_link`, `sign_in_failure` and `web_error`. (Test:
   the database catalogue is compared with the list; LIVE: the same comparison, names of tables only.)
5. No table is specific to one subject. English questions, passages and rubrics live in the same tables as maths.
   (Test: no table name contains `english` or `maths`.)

**No data lost**

6. Every removed table either:
   - was empty in the census; or
   - has each of its rows in its destination, tagged with where it came from, with equal counts.

   The note lists each table with both counts. (LIVE: counts.)
7. Children's results are unchanged. The past-results fingerprints (`engine past`) are equal before and after, on the
   rehearsal and on live:
   - evidence;
   - child states;
   - scored answers;
   - questions;
   - levels.
8. People and K2 are unchanged. These counts are equal before and after (LIVE: counts only):
   - children per class (open enrolments);
   - staff;
   - role grants;
   - observations;
   - notes;
   - sessions per date for the current and next fortnight;
   - plan lines;
   - materials lines.

**One home for each shared job**

9. Every change made through the engine or the website writes exactly one `change_log` row (table, row, before, after,
   who, when, why), written by one trigger. No other history table exists. (Test: one change per kind of record that
   was logged before.)
10. Every yes or no a person gives is a row in `approval`. The coordinator's "waiting for me" list is one query on it.
    A parent note is still sent only after two different people approve it. (Tests, including the existing
    parent-report test unchanged.)
11. Every setting and threshold is a row in `config`, read only through `core/settings.py`. A new school gets its
    defaults from one function. (Test: a code search finds no other reader of `config`; a new school gets every
    default.)
12. A child's class and roll number exist only in `enrolment`. The child row has no class, section or roll number.
    Moving a child still closes one enrolment and opens another in one step, and writes one change-log row. (Tests;
    the existing child-move test passes.)
13. The staff list exists only in `pii.staff`, and the settings key `app.staff` is gone. Every staff member can still
    sign in. Adding and removing a member of staff work. (Website journey tests; LIVE: sign-in works for every staff
    member, counted, not named.)
14. Every "done by" column links to a staff member. A free-text value that cannot be matched is kept read-only in a
    `legacy_by` column and counted in the note. (Test: the catalogue has no other free-text "by", "who" or "actor"
    column.)
15. The timetable of a date is its `session` rows. Timetable rules live in one table. No table keeps a second copy of a
    fortnight's periods. No table has a text `week` column: each holds a date. (Tests; LIVE: sessions per date equal,
    as in item 8.)
16. Exactly six tables refuse edits and deletes (amendment 2):
    - `evidence_event`;
    - `activity_observation`;
    - `approval`;
    - `change_log`;
    - `curriculum_proposal`;
    - `timetable_run`.

    (Test: a count of such triggers.)

**Behaviour kept**

17. Every Done-when line of CP-1, CP-3, CP-4, CP-6, CP-7, CP-9, CP-10, CP-11, CP-12, CP-13 and CP-22 is still proven
    by a test that passes in CI, through engine functions or views, not table names; the wording of each spec's
    Done-when lines is unchanged. `bin/specs` keeps CP-1, CP-5, CP-9 and CP-10 and gains each other spec once its
    proofs pass.
18. These tests pass unchanged, except where a test named a removed table directly:
    - the engine suite;
    - the website tests;
    - the website's speed tests;
    - the access-rule tests with the restricted login.

    Each such test is rewritten to check the same behaviour, and is listed in the note with its old and new name.
    (Full suite.)

**Growth does not come back**

19. `docs/data-model.md` lists the school's nouns and the one home of each shared job. The repository's `CLAUDE.md`
    tells every session to read it before designing. (Test: the file exists and is linked.)
20. CI fails if the number of tables rises above 81 or the number of database functions rises above the count after
    this scope, unless an allow-list file names the scope and a one-line reason. (Test: adding a table in a test
    database fails CI.)
21. The Scope issue form asks every future scope why a new table cannot be a column, a row in a shared table, a rule on
    a column, or a view. (Test: the question is in the template.)
22. Engine code is at most 46,000 lines (49,827 today). Code that served only the retired goal loop (ATH-14) is
    removed, after a search shows no CI job or command still calls it. (Test: a line count; the search result is in
    the note.)

**Freeze recorded**

23. `docs/backend-plan.md` says CP-27 is the only scope in flight until it merges, and why. This change goes through a
    pull request Nimish approves (rule 5 of that file). (Recorded.)

## Out of scope

- Any new feature or screen.
- Moving sign-in to the platform's own login. The four sign-in and error tables stay until a later scope.
- Switching the access rules on (Nimish's step).
- Squashing the 144 migrations into one baseline. This is a follow-up once this scope is merged and stable.
- Rooms, the same-adult check for grades 1–4, and incidents.

## Amendment 2 (Nimish, 9 Nov 2026, issue #534)

77 target tables (`read_correction`, `item_exposure` stay); budget ceiling 81; six tables refuse edits; role grants unchanged (the role, classes and subjects the website shows become columns on `staff`); `child.band` stays; the week A/B frame becomes `timetable_rule` rows; removing staff deactivates.
