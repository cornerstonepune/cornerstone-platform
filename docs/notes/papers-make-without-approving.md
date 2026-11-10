# Make a paper without approving it (frontend gap 2, Assessments screen)

`POST /papers/make` gains `approve` (default `true`, today's behaviour). With `approve: false` the papers are made in
`by`'s name and wait: `print_status = 'new'`, no approver, nothing recorded as given to the child. The existing
approval step (`edit_paper.approve`, the approve route) approves them; only then do they print. The response now
carries `approved`. No schema change; reuses `focus_paper.print_paper(waiting=True)`, which edits already used.

Verified: `tests/api/test_maker_routes.py` (2 new: waits then prints after approval; default unchanged), `test_maker.py`,
`test_edit_paper.py`, `bin/check`, all on a fresh Postgres 16. Not verified: CI's full suite; the browser side.
