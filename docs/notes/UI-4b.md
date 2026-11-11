# UI-4b plan (issue #599): carry across, move specs, retire

Starts after #583 merges. One PR at a time, full CI, nothing loosened. A spec is moved to the new address with the same assertions; it is deleted only when its page is gone and the assertion lives on a new screen.

## What the old pages do that the three new screens do not (the carry-across list)

| Old page | Control (server action) | Goes to |
|---|---|---|
| /papers list | Rename an assessment (`renameAssessment`, a change_log row) | Assessments list row + assessment screen title |
| /papers list | By topic view (+ paging by topic) | Assessments list: a third view "By topic" next to Board and Table |
| /papers list | Row expands to its copies | already on the assessment screen |
| /papers list | Files read lately and what each lacks; Read again; Give a page to a child (`readAgain`, `givePage`); a file that matches no assessment | Assessments list, under the Read box |
| /papers/approve | Children with no paper and why; spares; Change level WITH a reason; approve the pack incl. spares | Assessment screen (copies table: no-paper rows; spares row; level change asks for a reason) |
| /papers/card | Given on (a day) and A child was away (`givenOn`, `away`) | Assessment screen |
| /papers/review/[qr] | Remove / add a question on a paper before print; approve one paper (`changePaper`, `approvePaper`) | Assessment screen copy row: "Edit this paper" |
| /capture, /capture/check | Reading status, reader accuracy (`readerReport`), scans table, filters by child / class / worksheet | Reader accuracy is a school-level view: data-gap / which screen? (orchestrator) |
| /capture/check | The queue: one answer at a time, Yes / No-type / Nothing written / Right-Wrong-Blank, spot-checks, "Start checking" | Paper screen: "Next answer to check" walk, spot-check rows |
| /capture/[id] | Change the right answer for every child (`changeKey`); Name the mistake (`nameMistake`); Choose the page (`choosePage`); lanes per skill; previous / next paper of the same child | Paper screen |

## Order (each one PR)

1. **UI-4b-1 Assessments list**: rename, By topic, files read lately + read again + give page. Specs moved: u16, u22, u37, u45, u63, u64, u51-read-again, u41, u48, asm2-by-topic, u24, u33 (numbers), u44-upload.
2. **UI-4b-2 Assessment screen**: no-paper rows and spares, level with a reason, Given on, away, edit paper (add/remove a question), approve one paper. Specs moved: s42, p4, p5, s11, s7, m2, m4, u29, u30, u38, u39, u52, u27 (who decides).
3. **UI-4b-3 Paper screen**: the queue walk, change key, name the mistake, choose page, per-skill lanes, previous / next. Specs moved: s4, s26, p6, u3, u14, s44, u50, u68, asm2-checking, u61.
4. **UI-4b-4 Retire**: 308s (config for static routes; route handlers for /capture/[id], /papers/card, /papers/review/[qr], /papers/approve), menu and guide pages repointed (Assessments / Check answers etc.), delete the old pages, components, queries and styles, `ux.approveAll` and `ux.frozen` lose their entries, `workflows.json` map follows; the remaining specs that only walk the old addresses (u13-frame, u53, u49, u60, u65, e2e, gate, screens) get the new addresses with the same assertions.
5. `UI-4` into `merged_slices` when `capture: Photo` exists (backend photo route) and the inventory passes; the journey `e2e/a-paper-comes-back.spec.ts`.

## Rules I keep
- Every moved spec lists its old test name and new address in `docs/notes/UI-4b.md`.
- A control the backend must supply is a data-gap line to the orchestrator, not a workaround.
- Names stay fake; three signals never collapsed; "educator", "exchange/regroup".

## Open points for the orchestrator
- Where do Reading status / reader accuracy live (not an assessment's page)?
- Photo on the assessment screens waits for the backend photo route; the old /capture upload page cannot retire before it.

## Approved 10 Nov by the orchestrator, with two changes
- Reading status and reader accuracy become a **"Reading" view** of the Assessments list, next to Board / Table / By topic: files read lately, read again, accuracy as whole counts per paper, never a person. Its controls are added to `screens.json` as elements of the `assessments` screen (PR 1).
- **Focus paper** (old `growth/[id]/focus-panel.tsx`): the engine proposes the week's plan for one child (`GET /child/{id}/focus`); "Different questions" redraws and makes nothing; "Approve" (`approveNextPaper`) prints the questions shown, one per child per week, the newest replaces the older, and says who approved. New home: a "next paper for this child" action on the assessment and paper screens (the child page, UI-3b, links to it). Old specs carried at equal assertions. Goes into PR 2 or a PR of its own.
- Photo: the backend photo route is queued; the old `/capture` upload page stays until it lands, then retires in PR 4 or a fifth PR.

## UI-4b PR 1 (branch `ui-4b-1`, draft): the Assessments list takes over rename, By topic and Reading

Built: a rename field and "Save the name" on every table row and on the assessment screen (`renameThisAssessment`, the engine's
`/assessment/name`, one more row of the history log; an empty name changes nothing); two more views next to Board and Table, **By
topic** (`?view=topic`, a topic opens by `&t=<code>`, ten assessments a page) and **Reading** (`?view=reading`: how the reader is doing
by day, kind or confidence, and the files read lately with Read again and Give a page, both from the old Upload page's own components).

Old spec to new place (the old specs stay until PR 4 deletes the old pages; each assertion below lives on the new screen first):

| Old spec | Assertion | New place |
|---|---|---|
| `asm2-by-topic` 1 to 3 | topics collapsed with counts; a topic opens to ten rows and no other topic's rows are read; stage and class narrow it | `u75-assessments-list.spec.ts` (By topic tests) |
| `asm2-by-topic` 4 (seven step chips in order) | each assessment shows its seven steps | the assessment screen's stepper, `u73-assessments.spec.ts` (3) |
| `u63` rename test, `asm2-by-topic` name test | the educator's name wins; each name a history-log row | `u75-assessments-list.spec.ts` (rename tests, table and assessment screen) |

Observations, for whoever owns them:

- The educator's view of `/papers` and the new list both fail the 8-second database wait on this machine's test copy (about 2,000
  sheets, most of them put away by earlier runs); the coordinator's view of the same pages takes about 1.4 s. It is the educator
  scope (`staff_sees_sheet` over every sheet) that grows. The old page fails the same way, so it is not new; on a live copy with
  more sheets it deserves a look by whoever owns the queries.
- The engine marks every held answer again each time a person types a reading (`again.trusted`); a copy settled for sign-off turns
  back into an answer to judge. The inventory fixture puts it back first; worth a product decision.

## UI-4b PR 2, part 1 (branch `ui-4b-2`, draft): level with a reason, Given on, away, where the papers are

Built on the assessment screen: a child's level is changed with a **required reason** (kept as an override with who, so the prescriber leaves
that child alone next time; it used to be saved with a fixed phrase and no reason), the day the papers were **given out**, a child who was
**away** (held for later, not missing; and back again), and the line "N of M in · missing: roll …, away: roll …", and the "To photograph
again" alert from the old card.

| Old spec | Assertion | New place |
|---|---|---|
| `s7-paper-from-library` "changing one child's level writes the reason…" | the reason, the override and who are kept | `u76-assessment-controls.spec.ts` |
| `s7-paper-from-library` "a level change with no reason is refused" | nothing moves | `u76` |
| `s42-the-assessment-card` Given on, in/missing, away and back | the day said and by whom; who is missing; away is carried | `u76` ("the card's words") |
| `s42-the-assessment-card` "a page to photograph again is flagged" | the retake alert | `u76` |

Left for the rest of PR 2: the children with no paper and why, spares as a row, remove or add a question and approve one paper
(`/papers/review/[qr]`), and the focus paper. The old pages stay until PR 4.

One change of words: the new screen names a copy by its Sr. No. only, so a test that found a row by a child's name (the old card showed
names) finds it by Sr. No. here.
