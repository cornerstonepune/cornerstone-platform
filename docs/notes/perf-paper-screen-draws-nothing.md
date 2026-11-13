# The paper screen draws no photograph on a GET (p6, 13 Nov 2026)

## Verified

**Symptom.** `apps/web/tests/p6-check-is-quick.spec.ts:92` (budget 2500 ms) took 3.7–4.0 s on CI: the frame at 14 ms,
the body streamed until 3.6 s. The same code measured 0.38 s on a Xeon 6975P runner, 1.2 s on an EPYC 9V74 and 4.0 s on
an EPYC 7763 the same morning (ci runs 43366979944, 43367850104, 43365325778): CPU-bound work, not a query.

**Evidence.** CI's slow-statement log in the failing run (43365325778, shard 1) shows, inside the measured request,
`update capture set page_prints … where id = <copy01> and not page_prints ? '1'` taking 1.9 s and 2.4 s (one per
attempt): a lock wait behind another request telling the same page. Every engine read was otherwise quick when warm
(`/mistakes` 20 ms, `/keys` 20–35 ms, `/proof` 18 ms once told, `/pages` 0.68 s cold and 28 ms warm).

**Cause.** Two GETs drew page photographs (0.4–0.5 s a page, decoding a 12-megapixel photo):
- `GET /capture/{id}/proof` (`whose_paper.proof`): a page not yet in `capture.page_prints` was told on its first card,
  by drawing it and every page of every sibling copy in the scan file (24 photos on p6's file), in the request.
- `GET /capture/{id}/pages` (`same_page.pages_of`): fingerprinted every page photo again, cached only per engine process
  (CP-38), so the first open after each start drew them all.
Only `copies._read_copy` told a capture's pages as it read it; `legacy.import_scan` (every read, `/capture/ingest` and
`legacy import` included) did not, so the first card did. The 7763 runners are about 3x slower at that decoding.

**Fix.** A page is told once, where its capture is written (`legacy.import_scan` → `whose_paper.record`), and every
screen reads the kept rows (`same_page.told`): `proof` and `pages_of` draw nothing. Files read before that are told by
`engine read tell-pages`, which each engine deploy runs (`deploy-engine.yml`), and which finds nothing after. No
migration: `capture.page_prints` already holds a page's telling (`20270125270000_cp27_last_tables.sql`).

Proofs:
- `tests/test_whose_paper.py::test_a_card_never_draws_a_photograph_even_of_a_page_not_yet_told` (red before: "a card drew a photograph")
- `tests/test_whose_paper.py::test_the_pages_not_yet_told_are_told_once_by_the_engine_as_its_own_role` (`set role app_engine`)
- `tests/test_legacy.py::test_a_read_tells_its_pages_as_it_writes_the_capture` (red before: no page told)
- `tests/test_same_page.py::test_the_page_list_reads_the_fingerprints_its_read_kept_and_never_draws`
- p6 and u78 tell their own fixture papers' pages as a read would (`rows.ts` `pagesTold`).

## Handoff

- The deploy step `engine read tell-pages` tells live's untold pages once, on the deploy that carries this.
- A page whose file is not on the engine's disk stays untold (shown with no code, no notice, as before); the deploy
  step looks at it again each time, which costs a file-exists check.
