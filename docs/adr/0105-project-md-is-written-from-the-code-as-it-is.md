# 0105: PROJECT.md is written from the code as it is, and the repo's own design system stays

Date: 2026-11-23. Status: proposed (waits for Nimish's read of PROJECT.md).
Goal: none — part of adopting the loop.

## Decision
- PROJECT.md §1–6 and GLOSSARY.md describe the product as built on 23 Nov 2026 (56 pages, 87 tables), from the two
  surveys in `docs/loop/`. Where `ARCHITECTURE.md` / `SPEC.md` disagree with the code (six screens, 32 tables,
  "engine not deployed"), PROJECT.md wins; `docs/sources/assessment-workflow-v1.md` still wins over both.
- M0 (data model) is marked done: `db/schema.sql` (ADR 0104) and the engine core suite.
- Next milestones are proof-first: M1 nightly green, M2 live skill picture nightly (#557), M3 marking path proven,
  then M4 money and M5 materials on live. The order against the money dates (1 Dec, 31 Dec) is Nimish's call (§6).
- `.loop.json`: `token_files` adds `docs/frontend/tokens.json` and `apps/web/components/educator/school-tokens.css`;
  `protected` adds the repo's design docs and token files. The global kit is not copied over the repo's own.

## Rejected
- Rewriting ARCHITECTURE.md / SPEC.md now: large churn for no build gain; PROJECT.md names the gaps instead.
- Starting with money because it is dated: six red nights mean a money regression would go unseen.
