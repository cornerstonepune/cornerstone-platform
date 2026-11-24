# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-24 · **By:** Planner (F.N 10 rubric words) · **Model:** claude-opus-5-5
**Milestone:** M6 K1 pilot · **Branch:** plan/fn10-rubric-words (pushed, NO PR yet) · ADR 0111 written

## State
- Nimish, 24 Nov: F.N 10 rubric words SIGNED OFF as drafted; ACT-K2-M0018 + ACT-K2-0449 shared with K1; six unmatched lessons are new K1 activities (ADR 0111).
- Done on branch: ADR 0111; `supabase/seed/curriculum/activities/K1.json` (ACT-K1-F001..F006, needs_link, confidence low; applied on every deploy by apply-seed); migration `20270217090000_fn10_rubric_words.sql` (15 rows' words parsed verbatim from the draft, fills empty fields only; also_bands += K1).
- Why a migration: no seed loader writes words onto an existing activity or sets also_bands (registry load is insert-only; apply-seed refreshes only its own rows). ADR 0052 precedent. Recorded in ADR 0111.
- NOT done: (a) `docs/loop/notes/fn10-new-activity-words.md` (list the 24 words of F001..F006 from K1.json as awaiting Nimish's OK); (b) test `packages/engine/tests/test_fn10_words.py` + add to tests/core.txt; (c) PROJECT.md M6 goal line G6.6 (ADR 0111 names it); (d) apply-seed dry run on K1.json not yet run — rule checks (b crowded openings, w school words) unverified.
- Test facts: local test DB has no ACT-K2-M0018 (it came from the K2 upload on live) and no K1 objectives; fresh DB runs migrations BEFORE `engine load`, so the test must: blank the 15 rows' words, insert a stand-in M0018 row if missing, run the migration SQL, run `apply_seed.apply(conn, t, True, part="activities")`, assert four words on 15+6 rows and K1 in also_bands for M0018/0449, rollback. Prove red by stashing K1.json + the migration.
- Live read was denied by the permission classifier; ADR 0111 relies on the draft's 24 Nov live read (rows empty).

## Next step
1. `loop plan` to finish (a)–(d) on plan/fn10-rubric-words, open the PR, `loop ci <pr>`, merge when green.
2. Release (loop-release) so the migration + seed reach live; check the 15 rows have words on live.
3. Earlier queue: `loop run-ticket 939`; ticket 4 (G6.4); G6.5 load F.N 10 on live; people.py:243 label ticket; close #931.

## Don't repeat
- Don't hand-edit `supabase/seed/registry.json` (generated). Don't use `set_config(..., true)` outside a DO block in a migration.
- Don't put `export`/`VAR=` prefixes in .loop.json commands, or `2>&1` beside test paths in builder briefs. Don't re-ask K1's campus.
