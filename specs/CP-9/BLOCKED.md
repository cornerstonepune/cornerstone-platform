# CP-9 is blocked

When: 2026-11-08T12:59:18+00:00

## Why, in plain words

Proof 1's access_table check reads a table CP-4 creates; CP-4 is not on main. The rest of CP-9 is built and passing. Needs CP-4 merged first (then the migration inserts graph_run and hand_check into access_table), or Nimish's decision to unlock and amend that one check.

## What Nimish needs to decide

Read the reason above. Then either clarify the scope in the GitHub issue, or type `UNLOCK CP-9` in a Claude session to change the proofs, or close the issue.

## Last proof run

```
CP-9: NOT DONE
  pass  2 a correction through the engine is a new row superseding the old; the old row never changes; refused twice
  pass  3 unplanned counts done sessions with no plan line, is a number, and is not empty when such sessions exist
  pass  4 the picture reads only confirmed evidence; a drafted voice note's evidence is refused
  pass  5 blank, wrong and wrong-with-working stay three distinct signals through the nightly run
  pass  6 two nightly runs leave every evidence record and child state unchanged (throwaway database)
  FAIL  1 a note confirmed on day D is in the picture after the next morning's nightly run, logged once, scheduled in n8n
  box   1b LIVE: an ok nightly run is logged within graph.nightly_stale_hours (read-only)  (runs only on the production box; not run here)
  box   6b LIVE: every logged run left evidence and states unchanged; first run counts equal before and after  (runs only on the production box; not run here)
  box   7 LIVE manual gate: 20 real K2 notes confirmed and 5 children's hand calculations all match (counts only)  (runs only on the production box; not run here)
  last output:
    FAIL 1 a note confirmed on day D is in the picture after the next morning's nightly run, logged once, scheduled in n8n
                                "'execute()' with string template query doesn't support parameters"
                            )
                        return cur.execute(query, prepare=prepare)
                    else:
                        return cur.execute(query, params, prepare=prepare)
                except e._NO_TRACEBACK as ex:
        >           raise ex.with_traceback(None)
        E           psycopg.errors.UndefinedTable: relation "public.access_table" does not exist
        E           LINE 1: select table_name, data_class from public.access_table where...
        E                                                      ^
        
        packages/engine/.venv/lib/python3.12/site-packages/psycopg/connection.py:300: UndefinedTable
        =========================== short test summary info ============================
        FAILED specs/CP-9/proofs/test_nightly.py::test_1_graph_run_and_hand_check_are_listed_in_access_table
        1 failed, 4 passed in 12.62s
    BOXONLY 1b LIVE: an ok nightly run is logged within graph.nightly_stale_hours (read-only)
    PASS 2 a correction through the engine is a new row superseding the old; the old row never changes; refused twice
    PASS 3 unplanned counts done sessions with no plan line, is a number, and is not empty when such sessions exist
    PASS 4 the picture reads only confirmed evidence; a drafted voice note's evidence is refused
    PASS 5 blank, wrong and wrong-with-working stay three distinct signals through the nightly run
    PASS 6 two nightly runs leave every evidence record and child state unchanged (throwaway database)
    BOXONLY 6b LIVE: every logged run left evidence and states unchanged; first run counts equal before and after
    BOXONLY 7 LIVE manual gate: 20 real K2 notes confirmed and 5 children's hand calculations all match (counts only)
    ATHENA_SUMMARY pass=5 fail=1 box=3
```
