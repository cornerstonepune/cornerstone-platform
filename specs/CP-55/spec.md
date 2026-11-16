# CP-55: pages that list skills stop re-reading the question bank once per skill; "Forgot your password" tells the truth

Issue #777. Scoped by the orchestrator session on 16 Nov 2026 (no schema change: CP-54, issue #775, holds the database). Not yet
approved by Nimish in the issue.

## What

1. **"This page could not load" (DatabaseSlow), 32 times in 7 days, 7 people** — on Skills approval, Curriculum, the
   Question bank, the class paper maker and `/`. Cause, measured on live (database project in Mumbai, website in
   Mumbai, so not distance): the list of skills counted each skill's questions and worksheets *inside* its own query,
   once per skill. With 155 skills that read the 137 MB question table 155 times and the worksheet table 155 times on
   every one of those pages — including pages that never show a count. The live database's own log has that one
   query at 10.5 s, 30.1 s, 11.3 s and 15.9 s on the morning of 16 Nov; EXPLAIN ANALYZE: 10,087 ms, 102,938 pages read.
   The question bank's list did the same with worksheets, once per question shown.
   - A list of skills reads no question and no worksheet (`skillSets`).
   - A page that shows counts asks for them (`countedSkillSets`): one grouped pass per table, for the skills asked.
   - One skill is read as itself (`skillSet(code)`), not found by reading the whole list.
   - The question bank's list reads the worksheets once for the page; its two whole-bank reads run side by side.
2. **"Forgot your password" tells the truth.** Live has none of the five `SMTP_*` settings, so all 9 reset links since
   28 Oct are `password_link.mail = 'not configured'` and none was sent, while the page said one was. When the site
   cannot send email, the page says email is not set up and to ask the coordinator. The words depend only on whether
   the site can send (a deployment fact), never on the email typed, so a staff email still cannot be told from anyone
   else's. `engine live watch` already counts `not configured` and `failed` links; now a test holds it.

## Done when (each with its test)

1. A list of skills reads neither `item` nor `sheet_template`: `apps/web/tests/p55-reads-the-bank-once.spec.ts` 1
2. Counted skills read each table once, never under a per-row subquery, and match counts made by hand; one skill is
   read alone with the same numbers: `p55-reads-the-bank-once.spec.ts` 2
3. The curriculum's counts read the bank once, never per skill: `p55-reads-the-bank-once.spec.ts` 3
4. The question bank's grid, totals, count and list never read the bank per skill or per question, and a question's
   worksheets are the ones that hold it: `p55-reads-the-bank-once.spec.ts` 4
5. With any of the five settings missing the site knows it cannot send email: `p55-forgot-tells-the-truth.spec.ts` 5
6. With no sender the answer says email is not set up and to ask the coordinator, never that a link was sent:
   `p55-forgot-tells-the-truth.spec.ts` 6
7. The answer takes no email, so a staff email and anyone else's read the same; with a sender the old words stand:
   `p55-forgot-tells-the-truth.spec.ts` 7 (and `gate-password.spec.ts`, unchanged, on the real page)
8. The live watch counts reset links never sent, by why, with no address: `packages/engine/tests/test_watch.py::test_set_password_links_that_never_left_are_counted_by_why`

## Out of scope

- **Any schema change** (CP-54 holds the database). That leaves one known cost: a page that shows counts for every
  skill (Question bank, class maker, custom paper, Curriculum › Skills) still reads the whole question table once.
  Measured live: 5.8 s the first time, 65 ms after, because the 1 GB database does not keep the 137 MB table in memory.
  Removing it needs a database change, to be scoped as its own spec once CP-54 merges: a narrow index for the bank's
  counts, or a CHECK that only engine-made questions carry a skill, so the existing 0.9 MB index can answer them.
- The database's size (memory) is a cost decision for Nimish, not code.
- The 8 s page deadline stays as it is.
- No SMTP value is written anywhere; Nimish adds the five settings in Vercel.
