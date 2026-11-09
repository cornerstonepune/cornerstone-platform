# CP-22 plan: a draft goes live

Lean build of `specs/CP-22/design.md` (CP-21's design, renumbered). Each task names the Done-when numbers it serves.
Nothing outside these tasks is built.

## 1. Migration `20270125160000_a_draft_goes_live.sql` (DW 1, 2, 3, 5, 6)
- `timetable_slot.fortnight_id uuid references fortnight` (null on frame rows; set on a live fortnight's dated rows).
- The slot key becomes `unique nulls not distinct (class, period, week, weekday, valid_from, fortnight_id)`: a layer row
  on the frame's own first day no longer collides with the frame row; frame rows stay unique among themselves and the
  loader's `on conflict do nothing` still infers the key. Plus the design's partial unique index on
  (class, period, valid_from) where `fortnight_id is not null`.
- The session key (class, day, period) re-made `deferrable initially immediate`, so sessions trade places in one step.
- `timetable_live` (append-only through `internal.forbid_change`): class, fortnight, run, `state_hash`, `discarded`,
  `reason`, `who` (staff id), `at`.
- Setting `timetable.go_live_group` = `"everything"` per school (function + trigger on `tenant`, CP-11's pattern).
- `access_table` row (school-wide), `select internal.apply_conventions();`.

## 2. `w2_print/tt_live.py` (DW 1–8), new file under the 400-line ceiling
`go_live(conn, grade, section, year, number, *, run_id, who, reason, discard, dry) -> Report`. In order, before any write:
lock (tenant, class); the person's current grant is in the go-live group; the run is placed and for this class and
fortnight; the rules are unchanged (the FET input built now equals `timetable_run.input_text`, using the run's own FET
version so no FET binary is needed); the fortnight has not started (school's clock); every teaching date has a
`school_day` row; frozen fortnight needs a reason; the fortnight was not changed by hand since it went live (hash) unless
discarded. Then the session plan (DW 3): sessions on subject cells, per subject and week, matched by plan order to the
draft's lessons; stop-and-list cases; materials dates follow. `dry` returns the report and writes nothing. Otherwise:
`fc.ensure_editable`, delete and re-insert the fortnight's layer rows, move/delete sessions and their materials dates,
insert `timetable_live` with the hash of the state just written.

## 3. `tt_generate.input_text(i, fet_version)` (DW 4)
The input-file half of `generate`, factored out so the stale-rules check builds the same bytes.

## 4. `cli_timetable.py`: `engine timetable go-live` (DW 1–8)
Flags as the design: `--grade --section --year --fortnight --run --by [--reason] [--discard-changes] [--dry]`. `--by`
through `cli_map.staff_of` (a hand-over W2 → W1 added to the map). `--dry` sets the transaction read-only. Prints one
line per date and the plan lines left with no lesson; a refusal prints its reason and list, exit 1, nothing written.

## 5. Readers and the loader (DW 1, 8)
- `k2_day.py`: the dated row (`fortnight_id` set) wins over the frame row for a date and period.
- `k2_timetable_sql.py`: the session insert is `where not exists` (a deferrable key is no `on conflict` arbiter);
  `apply` refuses a load that reaches a fortnight with a `timetable_live` row, naming it, before any write.

## 6. Map, seed, rules (DW 5, 8; CP-1 proof 6)
`workflows.json` N4: `timetable_live` in `gives`, `tt_live.py` in `files`, `engine timetable go-live` in `commands`, the
hand-over. `supabase/seed/config.json`: `timetable.go_live_group`. `engine/checks/rules.json` regenerated from a database
built from the migrations.

## 7. Tests and note
`tests/test_timetable_go_live.py` (module API, rolled back): the layer and the day view, each refusal, changed-since with
and without discard, frozen with and without reason, the loader's refusal and re-run. `docs/notes/CP-22.md`.
