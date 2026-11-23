# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-23 · **By:** Plan · **Model:** claude-opus-5-5
**Milestone:** loop setup (before M0) · **Branch:** plan/loop-init · **PR:** see the plan/loop-init pull request

## State
- Tests: 229 passed, 1 skipped (engine `core`, `.loop.json` test_command, local Postgres 17 on port 54329); typecheck 3 passed; lint clean.
- Last thing done: put the repo on the loop (`/loop:init`), removed earlier agent setups, set the four commands.

## Next step
Run `loop-adopt`: fill PROJECT.md from ARCHITECTURE.md, SPEC.md and docs/sources/assessment-workflow-v1.md, without changing product code.

## Blocked / open questions
- Web typecheck and lint (`apps/web`: `npx next typegen && npx tsc --noEmit`, `npx eslint --max-warnings 0`) are not in `.loop.json`:
  the loop's frontend hook blocks any shell command naming `apps/web` until a wireframe is approved. `ci.yml`'s `web` job still runs them on every PR.

## Don't repeat
- The Supabase container on port 54322 is an old assessment-engine database (stale schema; its `postgres` user is not a superuser). Tests fail there; use port 54329.

## Files touched this session
- CLAUDE.md, .loop.json, .github/workflows/loop.yml, .claude/settings.json (loop plugin + graphify hooks; the repo's own Stop hook kept), .gitignore — loop setup
- docs/adr/0103-the-loop-runs-this-repository.md — why
- removed: .claude/skills/* (all but impeccable), .claude/references/, .canny.json, .ignore, AGENTS.md
