# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-23 · **By:** Plan · **Model:** claude-opus-5-5
**Milestone:** loop adoption (before M0) · **Branch:** plan/adopt (cut from plan/loop-init) · **PR:** #920 (loop setup) open; adopt PR not yet opened

## State
- #920 (plan/loop-init): pushed, waiting on CI. Merge it only when every check, not just loop-guard/loop-tests, is green.
- Tests: engine core 229 passed / 1 skipped against local Postgres 17 (`cornerstone-loop-pg`, port 54329); `bin/check` 72 passed.
- plan/adopt has: `db/schema.sql` (87 tables, ADR 0104). Only `access_reach` is referenced by a single code file; no unused tables found.
- Last thing done: started `loop-adopt`. The state, gaps and risks survey is saved in `docs/loop/adopt-survey-state.md`; use it. The product, architecture, 56-screen and glossary survey is in `docs/loop/adopt-survey-product.md`. Write PROJECT.md and GLOSSARY.md from these two files; don't re-survey. For wireframes, try the existing `docs/frontend/wireframes/` (43 HTML files) before running the app.

## Next step
Once #920 is green, merge it and rebase plan/adopt on main. Then finish loop-adopt: survey (README, ARCHITECTURE.md, SPEC.md,
docs/sources/assessment-workflow-v1.md, workflows.json, open issues, last 30 merged PRs, nightly runs), fill PROJECT.md §1–5,
GLOSSARY.md, a risk list (max 5 lines), point `.loop.json` token_files at the repo's own tokens
(apps/web/components/educator/school-tokens.css) and protect its design doc, then wireframe snapshots of the built screens and open the PR.

## Blocked / open questions
- Wireframe snapshots need the app running: `.claude/launch.json` reads `../../.env`, which this checkout lacks. Check for an
  existing Playwright one-screenshot-per-screen gallery first, or ask Nimish where `.env` lives.
- The loop's frontend hook blocks any Bash command naming `apps/web`, even read-only ones. Use Read/Glob, or approve wireframes first.

## Don't repeat
- The Supabase container on port 54322 is a stale assessment-engine DB (its postgres user isn't a superuser). Tests fail there.
- Removing the `bin/check --claude` Stop hook breaks `tests/test_promises.py`: it's the repo's own guard, not a harness leftover.

## Files touched this session
- db/schema.sql: real schema. docs/adr/0104-…: why. HANDOFF.md.
