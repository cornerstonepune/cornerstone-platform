# Stage 9: Implementation Readiness

## egm-implementation-readiness (lines 203-end)
Verdict: not ready.
- 🔴 R1: no test files; no map from Done-when line to file, test and assertion; `test_who_may.py`, the journey test,
  `checks.sh` and the modified tests not listed.
- 🔴 R2: item 7 hangs on Open Question 1 and on the header layout (`sheet_html`'s head in `assess/render.py`; the
  library reader lines scans up against `render.layouts`; workflows.json freezes render.py's lint counts exactly).
- 🔴 R3: request bodies and CLI options of approve-class and move not given; `--to` takes states, not steps; does
  `move --to approved` run the clash check?
- 🟡 Y1: refusal type and HTTP status (403, not today's 409). Y2: rule change is route only. Y3: the journey test cannot
  follow the phase order; say how FET is handled (reuse a placed run fixture). Y4: the new keys in `config.json`
  (seed_once). Y5: the item 4 example key is `seed_once` already; use a key without it; write the exact upsert. Y6: key
  swap by `pg_constraint` lookup; revoke/grant; `apply_conventions()`. Y7: the file list contradicts itself; list each
  door and function. Y8: item 6 per step and the proof rule. Y9: workflows.json: who_may on N4 files, new commands on N4
  commands; routes are not in the map.
- 🟢 G1: hand moves read layer rows by date. G2: exact watch line. G3: config row vs threshold. G4: 48 h is retention,
  job hourly. G5: `as_signed_in` signature and refusal. G6: confirm the migration number at branch time.

## egm-codebase-details
(pending)
