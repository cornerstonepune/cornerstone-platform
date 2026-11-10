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
