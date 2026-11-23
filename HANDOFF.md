# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-23 · **By:** Plan · **Model:** claude-opus-5-5
**Milestone:** loop adoption → M1 (nightly green) next · **Branch:** plan/adopt · **PR:** #921 (adopt), CI running with Auto-fix on, waits for Nimish's read + approval

## State
- loop-adopt done on plan/adopt: PROJECT.md §1–6 (ADR 0105), GLOSSARY.md, db/schema.sql (ADR 0104), `.loop.json` token_files + protected point at the repo's own design system.
- `design/wireframes/`: 56 pages, one per built screen. 30 embed the repo's drawn wireframe (`docs/frontend/wireframes/`), 26 are placeholders. View with the `wireframes` launch config (http://localhost:8765/design/wireframes/).
- Tests: `bin/check` 72 passed / 4 skipped (23 Nov). Engine core 229 passed / 1 skipped (earlier today). Nightly suite red six nights running.
- A local-only `.env` (gitignored) now points the launch configs at the test DB on 54329 with no real keys.

## Next step
1. Nimish reads PROJECT.md (esp. §5 order and §6), corrects it, then runs `loop approve --all` in his own terminal. Merge the adopt PR.
2. Then M1 nightly green: `to-spec` → `loop-ticket` from the failing list in PROJECT.md §5 Gaps (run 45093926102).

## Blocked / open questions
- Live snapshots of screens: the site has no `node_modules` here, and the frontend hook blocks `npm ci` in apps/web until a wireframe is approved. After approval, install and replace the 26 placeholders with real snapshots. The test DB has no children, so child pages will be empty: browser fixtures (api/test-hooks) are needed for real data.
- Milestone order vs money dates (Sports Day 1 Dec, 31 Dec): Nimish's call (PROJECT.md §6).

## Don't repeat
- The Supabase container on 54322 is a stale DB; tests fail there. Use `cornerstone-loop-pg` on 54329.
- Removing the `bin/check --claude` Stop hook breaks `tests/test_promises.py`.
- Any Bash command containing the words "loop approve" is blocked by the hook, even in commit text or docs edits; use Edit/Write.
- The browser pane shows local files as stripped snapshots; serve over http (`wireframes` launch config) to see them properly.

## Files touched this session
PROJECT.md, GLOSSARY.md, .loop.json, docs/adr/0105-*, design/wireframes/S*.html, .claude/launch.json, HANDOFF.md.
