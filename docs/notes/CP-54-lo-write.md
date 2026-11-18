# CP-54 lo-write: the real objective write (18 Nov 2026)

Branch `cp-54-lo-write`, parent issue #775. Built on #869 (learning-objective v5). Nothing spent by the build.

## What it is
`engine curriculum lo-write [--grade G] [--estimate] [--apply --by EMAIL] [--limit N]` (`w1_bank/lo_write.py`,
`cli_lo_write.py`; curriculum-run entries `lo_write_forecast` and `lo_write`).
- Jobs: every live row of a grade whose title does not begin "The child", not retired, not a person's (source) and never
  edited by a person (change history). A list-type line is one job a part (`lo_source.part_inputs`). Without `--grade`, every
  grade that has such rows (live today: K2 only, 62 rows; the brief said 404, which the 17 Nov seed applies already reduced).
- Order: one job at a time; each objective written joins its grade's pool before the next job, so the checks are shown it.
  A job refused twice naming a repeat ends as "a repeat of <code>", with no row.
- Forecast by code before any call: writer and validator calls at `spend.price`, the `nearest` lists' extra validator
  tokens, one job in five retried. The run's ceiling is 1.3 times that forecast (`spend.capped`).
- Apply: the first part rewrites the row in place (the school's line kept in `source_text`, source machine, confidence and
  signal from the writer); each further part is a new machine objective in the same unit (`LO-<grade>-N###`). One
  `curriculum.apply-seed` run row; `engine curriculum revert-seed <run>` undoes it whole (revert now restores confidence).
- The log prints codes and counts only, never a line's words.

## Left for the run itself
tune and held scoring of v5 (bars unchanged), switching the skill active only after its score is in DECISIONS-LOG.md.
Side finding for the orchestrator: `curriculum.apply-seed` ran 32 times on 17 Nov, each rewriting the same 12 titles.
