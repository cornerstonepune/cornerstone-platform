# Fix: u68 goes red on some pull requests; u65's wrong paper (17 Nov 2026)

Branch `fix-u68-signoff-form-redraw`. No spec: a fix session for the orchestrator. The browser core stays at 120 tests; no tag added or removed.

## Verified

**u68 ("an educator of another class sees none of the paper"), cause.** On the paper screen, "Sign this paper off" was a form inside the
empty-state's paragraph. A paragraph cannot hold a form, so the browser moved the form out as it read the page. When the page's scripts
arrived, React found the page did not match what it had drawn (error 418) and drew the whole page again. The test had by then put Achal's
paper into the form; the redraw threw that form away, so the button sent Neha's own paper, which was signed off, and no refusal was read.
The access rule itself never failed: the server was never asked about Achal's paper. A person was affected too: anything pressed in the
moment before the redraw was lost, on every paper with nothing left to judge.

- CI, #870 run 44122221621: failed on the first attempt and the retry at `expect(getByText("This paper belongs to another class"))`.
- Old page, old test, scripts 1.5 s late: 2 failed of 40, same error; each time `CSU67N01` (her own paper) had confirmed answers, `CSU67A01` none.
- Old page, new test: 3 failed of 3 (the page reports error 418 every time).
- New page, new test: 30 passed of 30.
- The browser core in CI's order (`npx playwright test --grep @core`), each run on a freshly restored clean database: 10 of 10 runs green,
  120 passed each, u68's two core tests passed first time in all ten.

**What changed.** `EmptyState` takes its one non-link action as `action`, drawn beside the line and not inside the paragraph; the paper
screen passes the sign-off form that way. u68 now fails if that page is drawn again, sends the forged paper as the form is sent (React
resets a hidden field to its drawn value when it takes a page over), and checks her own paper was not signed.

**u65 ("every row's page and every task opens a page that shows that item"), cause.** A child with two copies of one earlier assessment
(u44 keeps `CS44A001` and `CS44A002` for one child) has both at one address (assessment and Sr. No.). "Check this paper" for the second
opened the first, which said nothing was left to judge. The paper screen now opens the copy that holds the answer its link names.
`u44` then `u65`: that test failed before and passes after.

## Handoff

- **Not fixed, needs a decision:** u65 "what waits is a board of cards ... the one next action" fails whenever a timetable clash waits
  school-wide (12 after a core run). The card "Two lessons at once, not accepted" has no button because its page (`moves`, and `draft`
  likewise) is not built (`lib/today-doors.ts`: `live: null`, "a door whose target is not there is not drawn"). Either those cards get a
  page to open (the Build page's problems list, CP-71, is the likely one) or the test stops asking a button of them. Not a flake.
- **Still open:** a link to a twin copy with no answer in it (a "Sign it off" task) still opens the first copy. Twins need an address of
  their own; that is a change to how a paper is addressed, so it needs a spec.
- #874's failed run was not read: its run was cancelled before the browser core ran, and the next was still running.
- Local set-up used: Postgres 17 as `bin/ci-postgres` starts it, `bin/testdb fresh`, CI's two role passwords, `CI=1`.
