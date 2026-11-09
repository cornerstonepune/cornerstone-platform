# CP-9: observations become evidence for real

Branch `cp-9-build`. Scope and design: `specs/CP-9/`. Migration `20270125090000_nightly_picture.sql`.

## What was built
- `engine/w3_read/nightly.py`: `nightly()` (advisory lock, rebuild, one `graph_run` row with before/after digests), `failed()`
  (writes the failure row; the caller commits), `hand_check()`.
- `POST /graph/nightly` (idempotency key = the date), `engine graph --nightly`, `engine graph --hand-check`.
- `n8n/workflows/f4-nightly-graph.json`: 02:30 IST, one HTTP call, no Code node.
- `public.unplanned_sessions()`; `k2_reads._counts` returns it as a number; `unplanned_why` is gone from code and model.
- Settings rows: `graph.nightly_stale_hours` (26), `cp9.real_notes_from` (empty until go-live).

## New tables (both listed in `access_table`)
- `graph_run`: school-wide, append-only.
- `hand_check`: child data, append-only.

## Not done by the build (people's steps)
- **Import `f4-nightly-graph.json` into n8n on the box and attach the engine key credential.** Until then live proof 1b is
  box-only, pending: no ledger row exists. Not known whether n8n is running on the box.
- **Set `cp9.real_notes_from`** at go-live.
- **Item 7 is a manual gate**: the K2 educator confirms 20 real notes on the typed form; the coordinator calculates 5
  children by hand and the results are entered with `engine graph --hand-check`. Live proof 7 cannot pass before then.
- Live proofs 1b, 6b, 7 are box-only and read-only; they have not been run.

## Notes
- `access_table` exists (CP-3 made it, CP-4 added `data_class` and `reason`). The migration lists `graph_run`
  (school_wide, with a reason) and `hand_check` (child_data, kind `learning`, key `child_id`) before `apply_conventions()`.
- `hand_check.checked_by` should be an email or a role, never a person's name (the table is child data and the engine
  does not check what is typed).
- A skipped night (a run already going) stores `{"skipped": true}` under that night's key, so a retry the same night does
  not re-run; the next night has a new key.
- Through the route, a failed run is recorded by the route after the idempotency wrapper rolls back; through the CLI by the
  command. `nightly()` itself never commits.
