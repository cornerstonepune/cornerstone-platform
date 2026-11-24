# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-24 · **By:** Coordinator (loop:run) · **Model:** claude-opus-5-5
**Milestone:** M6 K1 pilot · **Branch:** plan/coord-handoff · #937 merged (builders can run tests)

## State
- Builder Bash refusals on #934/#923 confirmed from the wt-923 log, two causes (both in LESSONS.md via #937): (1) test_command began `export …`, not on `loop build`'s allow-list → fixed by #937 (conftest defaults to the local test DB; .loop.json no export). (2) loop plugin `guard.py` reads any `>` (incl. `2>&1`) as a write and blocks commands naming an existing test file. Not fixed (plugin, not this repo).
- #923: attempt 3 passed locally (229 core); PR #938 MERGED (reviewer PASS). #941 merged (ADR 0110). Next ticket: `loop run-ticket 939` (enrol class --campus).
- `.loop/wt/923` predates #937 (old conftest): `loop build/finish 923` there needed `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/postgres` in the coordinator's env. Builders don't commit (denied); `loop finish` commits the ticket's files.
- A `loop plan` job was running at session end: campus_grades lists K1 at Gurukul (ADR 0109), drop the stale "Gurukul or Neev?" open question, tick G6.1–G6.3. Check `gh pr list` for its PR.
- Nimish (24 Nov): Gurukul is decided (ADR 0109; stop asking). He will sign off the rubric words: `docs/loop/notes/fn10-rubric-draft.md` sent to him. He will send the Children List CSV himself. He wants the K1 pilot live.

- **Nimish, 24 Nov, in chat: F.N 10 rubric words SIGNED OFF as drafted** (`docs/loop/notes/fn10-rubric-draft.md`), and **yes: share ACT-K2-M0018 (clay) and ACT-K2-0449 (Khari Kamai) with K1** (`also_bands` += K1). Next: `loop plan` to record this as an ADR and seed the level words + also_bands. Six F.N 10 lessons still have no activity (list at the end of the draft).

## Next step
1. Merge #938 after reviewer PASS; merge the campus plan PR.
2. When Nimish signs off the rubric: `loop plan` to seed the level words (and his yes/no on sharing ACT-K2-M0018 / ACT-K2-0449 with K1).
3. ADR 0108 ticket 4 (form mark → activity_observation + evidence_event, G6.4) via `loop plan`, then build.
4. Small ticket: `people.py:243` dry-run label "engine enrol k2"; stale "enrol k2" docstrings (people.py:1, signer.py:3, roster.py:130, tests/rows.py:427/449).
5. G6.5: load F.N 10 W1+W2 on live for Gurukul K1 (after the CSV enrol). Not done; F.N 10 runs 23 Nov – 4 Dec.
6. Close #931 (plan/handoff) in favour of this branch, or merge it.

## Don't repeat
- Don't put `export`/`VAR=` prefixes in .loop.json commands, or `2>&1` beside test paths in builder briefs.
- Don't re-ask Nimish K1's campus. Read a failing `loop finish` fully before retrying; flaky #936 exists.
