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
Could not read the CP-24 branch (no shell); everything else checked on main.
- 🔴 B1: more copies of the date rule: `k2_day.py:65`, `k2_timetable._weeks` (Monday rule), `k2_timetable_load._parts`.
- 🔴 B2: the key swap breaks `checks/rules.json` (test_rules, live watch drift): regenerate it.
- 🔴 B3: CUJ 3's example key is `seed_once`: a proof on it passes today. Use `timetable.link_band`.
- 🟡 M1: refusal class and status per door (rules route catches another class → 500; hand route maps to 409).
- 🟡 M2: rule change has no command; go-live has no route on main.
- 🟡 M3: exact file list with C/M; config.json; tests; checks.sh; measure scripts; consistent paths.
- 🟡 M4: no test plan with named cases.
- 🟡 M5: item 7 vs print layouts (ADR 0040: a layout change is a new row); SVG path; how render.py loads it.
- 🟡 M6: item 6 steps one by one, measure scripts, the `lines` input.
- 🟡 M7: approving a class needs the coordinator on the sign-in list (`app.staff` → `signin_id`); the journey fixture
  must add it.
- 🟢 N1-N5: helper defaults; `--to` takes states; reuse `voice_switch` query and link `n8n/README.md`; name the existing
  email helpers; CP-7 copy also drops holidays, `graph.nightly_stale_hours` is CP-9's, `pack.py` only merges PDFs.

# Consolidated resolution (author, 9 Nov 2026)

Every 🔴 and 🟡 above was applied to `design.md` except where contested:
- Partial layer (critic 1): resolved by choosing layer or frame **per date** (`fortnight_cells`).
- One owner for layer-or-frame (catalyst 1): `fortnight_cells`. One membership rule (catalyst 2): `internal.in_groups`.
- Doors (catalyst 3): `core/who_may.as_actor` + one `ACTIONS` dict. Clash rule inside `fortnight_cycle.move` (catalyst
  4): **contested**, import cycle (`tt_clash` → `tt_live` → `fortnight_cycle`); one `tt_clash.check_approval` called by
  every door that steps to approved.
- Thresholds as settings (catalyst 5): **contested**, only `config` has writers other than the loader; stated in
  Non-Goals. The clean-up limit is a `watch.*` threshold (zoom-out 6), so no migration lines.
- Parent reports (zoom-out 1, readiness R2): left as Open Question 1 for Nimish, with option A recommended; the lock
  waits for his edit of Done-when 7 or his choice of B.
- Item 7 layout (codebase M5): the logo takes the name text's box at the same height; geometry unchanged; no new layout.
- All seven copies of the date rule listed and moved (codebase B1, zoom-out 2); `rules.json` regenerated (B2);
  `timetable.link_band` for item 4 (B3); exact door, refusal class and status (M1, Y1); file table, test list and a
  Done-when → proof table (R1, M3, M4); key swap by `pg_constraint` (critic 3, Y6); `app.staff_id` local and checked
  (critic 5); fail closed (critic 4); engine-key boundary as a risk (critic 6); `--by` interface change named (critic 7);
  seed_value cases (critic 8); Risks & Mitigations section (critic 9, structural 5); plain-English Problem (structural 1).
