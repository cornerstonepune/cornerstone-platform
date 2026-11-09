# Grade and band literals: the cases that came up

- `w2_print/cli_plan_link.py`: `BAND = typer.Option("K2", "--band")` failed `tests/test_grades.py::test_no_file_outside_the_maths_library_names_a_grade`.
- Option A: a seeded config row (for example `timetable.link_band`) in `supabase/seed/config.json`, read with `settings.config(conn, key)`, with `--band` as an override and no Python default. Needs the seed-count checks updated.
- Option B: drop the band and let the SQL take each class's grade. Needs a migration edit and changes what one run touches.
- Locked proofs under `specs/<ID>/proofs/` may call the command with no option; check them before making an option required.
