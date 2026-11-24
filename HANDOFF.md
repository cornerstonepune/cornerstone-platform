# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-24 · **By:** Coordinator · **Model:** claude-opus-5-5
**Milestone:** M6 K1 pilot (ADR 0108/0109) · **Branch:** plan/handoff · #929 (#925) and #933 (#926) merged · seed for #934 pushed

## State
- #925 merged as PR #929: `k1_week.py` reader + `engine timetable load-k1` (dry run, `--sql`, `--apply`). Review PASS.
- #926 merged as PR #933: `Session.planned`; empty / period-name-only cell = not planned yet, writer writes `v.pl::boolean`. Review PASS.
- #934 (ticket 3, enrol `--grade`) seeded by `loop plan` (base main; 21 red on skeleton, green on an uncommitted oracle, ~30/40 lines). Planner renamed the command to `engine enrol class --grade <code>` (no default; recorded in issue #934 only, no ADR because ADR files are protected → next plan job should add one). Visible test not in `core` (core list full 230/230).
- Rubric draft for F.N 10 still waits on Radhika's sign-off (`docs/loop/notes/fn10-rubric-draft.md`); nothing seeded.

## Next step
1. `loop prep 934` → `loop build 934` → `loop finish 934` → reviewer → merge. Check the brief has the shell note (see Don't repeat) before building.
2. One `loop plan` job: ADR for the `engine enrol class` rename (+ update stale `engine enrol k2` mentions in `goals/*.yaml`, `people.py` log line).
3. One `loop plan` job for ticket 4 (K1 form mark → activity_observation + evidence_event).
4. Follow-up tickets from reviews (one plan job, small): k1_week checks every day's date == Monday + i and week number ∈ {1,2} (+ test with a wrong Friday date); reload of a week must update `planned`/text (today `on conflict do nothing` keeps the old row) or document "clear the week first"; share the time-row pattern and `_cut`/`_unplanned` rules instead of copies.

## Blocked / open questions (Nimish; block going live, not tickets)
- K1 campus: Gurukul (sheet) or Neev (`school.campus_grades`)? Radhika sign-off on F.N 10 words? Two-part cells reading B — confirm. Radhika's Children List CSV.
- **New:** holiday cells (e.g. Tue 24 Nov "Academic 1 / General Awareness", "Block Room") currently make NO plan lines — the #925 handoff wrongly said they do. ADR 0108 says "nothing lost". Keep plan lines for holidays or drop them? Then pin it with a test.

## Don't repeat
- `loop build` runs `dontAsk` + `Bash(<word> *)` allowlist: compound commands, pipes, `export`, heredoc commits, `bin/check` get refused and the builder stops uncommitted. Append a shell note to `.git/loop/tickets/<N>-brief.md` after `loop prep` (one simple command per call; `uv run --directory packages/engine pytest …`; `git commit -m "<one line>"`; handoff via Write tool, no Blocked section). Rebuild doesn't cost an attempt. LESSONS.md has it.
- A seed based on another seed branch conflicts once that ticket squash-merges: cherry-pick the seed's own commit onto main (done for plan/t926).
- Required checks need the branch up to date: after any merge to main, `gh pr update-branch` + `loop ci` again before `gh pr merge`.
- `loop plan` runs in the main checkout (cwd=repo): don't switch branches there while it runs. Hooks refuse writes while the main checkout is on `main`.
- Local test DB dirty → `drop database postgres with (force)` + recreate via template1, then `bin/testdb fresh`. One deliverable per `loop plan` job. No grade code literal in Python.
