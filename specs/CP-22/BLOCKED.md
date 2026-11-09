# CP-22 is blocked

When: 2026-11-09T07:20:15+00:00

## Why, in plain words

Proof 8 (test_8_trial_and_loader.py, the loader-refusal test) cannot pass: its helper ins() fills every required column of CP-11's timetable_run with a placeholder, so solve_seconds is 0, and CP-11's own check (solve_seconds > 0) refuses the row. The product code is not involved: with a temporary column default of 1 on a scratch database that test passes (2 of 2). The other seven proofs pass, CP-1 and CP-6 pass. Fix needs Nimish to UNLOCK CP-22 so the helper names solve_seconds.

## What Nimish needs to decide

Read the reason above. Then either clarify the scope in the GitHub issue, or type `UNLOCK CP-22` in a Claude session to change the proofs, or close the issue.

## Last proof run

```
CP-22: NOT DONE
  pass  1 a placed draft live: every date shows exactly the draft; fortnights before and after unchanged
  pass  2 a 15-day fortnight is live on every date, the repeated Monday too; a holiday has no lessons
  pass  3 planned lessons keep plan and materials lines, dates follow; pinned lessons stay; stop cases list and write nothing
  pass  4 stale rules, unplaced draft, started fortnight, date with no school day refused with reason; other drafts stay current
  pass  5 only the go-live group (a setting) goes live; the record keeps who, when, which draft and cannot change
  pass  6 a fortnight changed by hand since going live is refused unless discarded; the record shows discarded, who and when
  pass  7 a frozen fortnight goes live only with a reason, and the reason is kept
  FAIL  8 trial run shows each date and writes nothing; the loader refuses a live fortnight; existing tests unchanged
  box   8 LIVE: trial run for K2's next teaching fortnight prints counts and changes nothing (read-only)  (runs only on the production box; not run here)
  last output:
    PASS 1 a placed draft live: every date shows exactly the draft; fortnights before and after unchanged
    PASS 2 a 15-day fortnight is live on every date, the repeated Monday too; a holiday has no lessons
    PASS 3 planned lessons keep plan and materials lines, dates follow; pinned lessons stay; stop cases list and write nothing
    PASS 4 stale rules, unplaced draft, started fortnight, date with no school day refused with reason; other drafts stay current
    PASS 5 only the go-live group (a setting) goes live; the record keeps who, when, which draft and cannot change
    PASS 6 a fortnight changed by hand since going live is refused unless discarded; the record shows discarded, who and when
    PASS 7 a frozen fortnight goes live only with a reason, and the reason is kept
    FAIL 8 trial run shows each date and writes nothing; the loader refuses a live fortnight; existing tests unchanged
                            raise TypeError(
                                "'execute()' with string template query doesn't support parameters"
                            )
                        return cur.execute(query, prepare=prepare)
                    else:
                        return cur.execute(query, params, prepare=prepare)
                except e._NO_TRACEBACK as ex:
        >           raise ex.with_traceback(None)
        E           psycopg.errors.CheckViolation: new row for relation "timetable_run" violates check constraint "timetable_run_solve_seconds_check"
        E           DETAIL:  Failing row contains (51944141-f79f-450e-b42d-a73583239746, e4b220c2-a4cb-42b3-871f-5e24fa531c99, 86714b4b-aa45-4851-9415-d1371bcebb10, 908008d1-73a7-4151-8775-77a7ffe23809, placed, 0, 0, proof, null, null, 0, 0, {}, [], staff:f2bb0973-ceb7-4632-9826-1b1d15e1bc79, 2026-11-09 07:20:14.765539+00).
        
        packages/engine/.venv/lib/python3.12/site-packages/psycopg/connection.py:300: CheckViolation
        =========================== short test summary info ============================
        FAILED specs/CP-22/proofs/test_8_trial_and_loader.py::test_loading_the_schools_sheet_again_refuses_a_live_fortnight
        1 failed, 1 passed in 2.73s
    BOXONLY 8 LIVE: trial run for K2's next teaching fortnight prints counts and changes nothing (read-only)
    ATHENA_SUMMARY pass=7 fail=1 box=1
```
