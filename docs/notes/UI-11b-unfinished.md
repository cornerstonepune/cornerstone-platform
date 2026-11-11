# UI-11b and UI-11c: what is unfinished (11 Nov 2026)

Written when the week's budget ran out. Nothing here is started in code unless it says so.

## In flight
- **#671** (Setup, Curriculum, Skills to approve, Bank, Question to their wireframes): merging on a green full run. Its CI hit the runners' apt/DNS failure on "playwright install"; failed jobs re-run once.
- **#645** (Questions to answer on Curriculum) and **#661** (Curriculum's first column, skill-set links, the spec guard): both are already inside #671, so they close as duplicates once it merges.
- **CI hardening** (ci.yml: the browser install tries three times): branch `ci-install-retry`, written, to be opened after #671 merges.

## Not started
- **UI-11b step B:** the Worksheets screen (library, one worksheet, taxonomy as a tab: screens.json and wireframe first); the bank proposals table on Question bank (code is on branch `ui-11b-proposals`, needs a rebase on main, bank.html elements 10 to 16 drawn, and a local re-test); the row-level "taught" switch on Curriculum rows (coordinator only); the walk-queue element.
- **UI-11b step C:** retire the old setup-content pages one at a time: 308 in next.config.ts, delete the page, components, queries and styles, move the old specs with equal assertions, keep workflows.json, test_layout and the guide pages in step.
- **#586's remainder:** the coordinator journey spec and the inventory drives that UI-6 left.
- **FINDINGS.md gaps still open** after #671: Curriculum's "Offers waiting" is a table rather than the wireframe's list; the bank list's readable question stems (data, not page); Setup's "Changed lately" has no grants (they are in neither log).
- To confirm: the Question screen's reviewer chip reads a verdict as green when it begins ok, agree, pass or approve; check against the reviewer's real verdict values.

## Known local-only noise
- `u71-blocks` screenshots differ on the builder's machine for blocks nobody touched (fonts). CI is the judge.
- `m1-13` "walk the drafted parts" expects "1 of 3" and fails on a reused local database; it passes on a fresh one.
