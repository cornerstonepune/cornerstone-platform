---
name: engine-config-not-literals
category: architecture
description: Use when engine code hardcodes a grade, band or threshold.
---

# Engine values come from rows, never from Python literals

A grade code, band, rung, threshold or school wording in a `.py` file is a defect (CLAUDE.md rule 1). That includes a CLI option default such as `typer.Option("K2", "--band")`. Fix the cause; never exempt the file.

- Look for a seeded row first. Read config with `settings.config(conn, key)` and thresholds with `settings.threshold`. Add the row to `supabase/seed/config.json`, then update the seed-count checks (`engine load --check` and its tests).
- An option that must name a grade is required: `typer.Option(..., "--band")`. Copy the form of an existing command that already takes a grade. Do not keep a Python default.
- Before making an option required, grep the locked proofs (`specs/<ID>/proofs/`) for every call to that command. If a locked proof omits the option, the default must come from a config row read inside the command, and the option stays as an override with no Python default.
- Never edit locked spec or proof files to make a default work. If neither a required option nor a config row fits, block with `athena block <ID> "<reason>"` and say which proof forces the choice.
- Run `pytest -q` on `tests/test_grades.py` after the change; it is the check that names this defect.

Worked cases are in `references/grade-literal-cases.md`.
