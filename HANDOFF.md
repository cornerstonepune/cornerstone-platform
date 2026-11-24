# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-24 · **By:** Planner (F.N 10 rubric words, finish) · **Model:** claude-opus-5-5
**Milestone:** M6 K1 pilot · **Branch:** plan/fn10-rubric-words · PR #942 open, not merged

## State
- Nimish, 24 Nov: F.N 10 rubric words signed off as drafted; ACT-K2-M0018 + ACT-K2-0449 shared with K1; six unmatched lessons are new K1 activities (ADR 0111).
- On the branch: ADR 0111 (Goal line: none — proved by G6.6 and its test, the form bin/check accepts); `supabase/seed/curriculum/activities/K1.json` (ACT-K1-F001..F006); migration `20270217090000_fn10_rubric_words.sql` (15 rows' words, fills empty fields only; also_bands += K1); `docs/loop/notes/fn10-new-activity-words.md` (24 drafted words, awaiting Nimish's OK); PROJECT.md G6.6 (unticked until live).
- Test `packages/engine/tests/test_fn10_words.py`, in core.txt: red with the migration emptied and K1.json removed (`['', '', '', ''] == [...]` on ACT-K1-0973), green restored. Engine core budget 230 → 231 (`test_core_budget.py`, ADR 0111 notes it); budget test passes.
- apply-seed dry run on the fresh local DB: K1 rows 0 rejected, 0 warnings. (1192 K2 rule-0 rejections are local-only: no K2 upload objectives locally; pre-existing.)
- Release path checked in code: merge → CI on main → `migrate live` (bin/push-migrations; 20270217 is the newest migration) + `deploy-engine` (redeploys when `supabase/seed` changes; `engine load --settings` runs apply-seed for both halves per `curriculum.seed_parts`).

## Next step
1. Coordinator: `loop ci 942`, merge when green.
2. After merge: watch `migrate live` + `deploy-engine`; read back the 15 rows' words, also_bands on M0018/0449 and F001..F006 on live, then tick G6.6.
3. Nimish: OK or change the 24 words in `docs/loop/notes/fn10-new-activity-words.md`.
4. Earlier queue: `loop run-ticket 939`; ticket 4 (G6.4); G6.5 load F.N 10 on live; people.py:243 label ticket; close #931.

## Unverified
- Live state not read this session (rows assumed empty per the draft's 24 Nov read); the migration prints how many it filled.

## Don't repeat
- Don't hand-edit `supabase/seed/registry.json` (generated). Don't use `set_config(..., true)` outside a DO block in a migration.
- Don't put `export`/`VAR=` prefixes in .loop.json commands, or `2>&1` beside test paths in builder briefs. Don't re-ask K1's campus.
