# CP-72: Curriculum opens instantly; a click never waits on the database

Issue #842 (approved by Nimish, 17 Nov 2026).

## What

Nimish: "Is the curriculum page loading when I'm clicking? I think it's causing lag, and it's constantly coming to that memory page error. I think that page should be preloaded in the cache itself, right? Whenever I click something, it should just immediately open."

Found (live runtime log, 17 Nov): `DatabaseSlow: the database did not answer within 8 seconds` on `/setup/curriculum.rsc`. Every click in the tree changed the address, so the server re-ran the page's whole read set under an 8-second deadline, although the tree itself needs one small read per grade.

Fix: the tree's data is read once per grade and kept; expanding, collapsing and choosing a grade happen in the browser with no server round trip; an objective's panel reads only that objective (and is prefetched when its row is shown). The heavy appendix and to-review reads run only when those views are opened. Curriculum reads that change rarely are cached for a short time and refreshed after any edit.

## Done when

1. Opening Curriculum runs only the tree's own read (no `curriculumRows`, `asks`, `gap`, `lessonsToConfirm`, `readOffers`), checked by a test that counts the page's queries.
2. Choosing a grade, opening or closing a subject or unit makes no server request (test watches network).
3. Opening an objective reads that objective only; hovering or showing a row prefetches it.
4. Appendix and To review still show the same numbers as before (existing tests stay green).
5. After an edit anywhere in Curriculum the tree shows the new value on the next open (cache is refreshed by the edit).
6. With the database made slow (test hook, 3 s), the tree still opens from what it already holds, and a failed read shows a quiet retry line, never the page error.

## Out of scope

Editing in place (CP-70, #837). Look and feel.

## Proofs

`apps/web/tests/u107-curriculum-instant.spec.ts`, one test per line, numbered as above.
