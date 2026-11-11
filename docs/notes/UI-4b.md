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

## UI-4b PR 2, part 2 (branch `ui-4b-3`): a home assessment's paper before it prints, on the paper screen

A not-yet-printed copy of a home assessment (`focus` kind) now has its questions on its paper screen: each drawn as it prints, Remove on each
(asks once when it costs something: the approval, or the last question of a skill), the bank's dropdowns (topic, skill, level, kind, question,
with the choice seen before Add), Add at a place, and "Approve this home assessment" for this copy only. The assessment screen's made rows say
"Edit this paper". A copy is addressed by its Sr. No., so an edit (which makes the paper again with a new code) does not move the address. A
printed one is shown read-only with the engine's own words.

| Old spec | Assertion | New place |
|---|---|---|
| `p5-review-a-paper` 1 | remove asks once and withdraws the approval; add through the dropdowns; each edit a history row; approve this one | `u76-edit-a-paper.spec.ts` |
| `p5-review-a-paper` 2 | a stopped kind is not offered; a printed paper is read-only and says how to change it | `u76-edit-a-paper.spec.ts` |

Not in the inventory: the three paper-screen controls are `pending` there, because the shared fixture's copies are library worksheets, which the
engine will not edit; the two specs above use papers the engine made. The bank's dropdowns write their choice under `e…` names (`etopic`, `eskill`,
`elevel`, `ekind`, `eq`), so they never meet the paper's own address parts.

Still to do in step 2: the children with no paper and why, the spares as a row, and the focus paper ("next paper for this child"), which today lands
on the old review page (`approveNextPaper`).

### PR 2, part 3: children with no paper, and spare copies

The assessment screen now lists every child of a home or class assessment week who has no paper, by Sr. No., with the reason the plan kept
("has sat every worksheet at Hard (4)") or "joined the class after this week was planned" / "not on this week's plan". A child who holds a copy
is never listed. Spare copies (no child on them) are listed apart with their state, and are not counted among the children's papers.

| Old spec | Assertion | New place |
|---|---|---|
| `u37-papers-grouped` 1 | children with no paper and why; spares listed with no name | `u76-no-paper-and-spares.spec.ts` |

The focus paper ("next paper for this child") is made from the child's own page, which is not an assessments page and stays. After approval it
lands on the old review address until PR 4, when that address becomes a 308 to the paper screen; the specs that read the code from that
address (`s11-focus-paper`, `p4-preview-before-print`, `u2-children`, `p5-review-a-paper`) move with it.

### PR 3 (and the wireframe gaps): the paper screen takes the old Marking tools

On the assessment screen: the approval ledger (rail card: each pack, who approved it and when, and the pack still waiting), the second pack's heading
and "Made on … for Sr. No. …", and "What it asks" saying the topic and how many children sit each level. On the paper screen: "This scan" (rail:
sheet, whether the code read is the copy's own, when scanned, pages), the question outlined on the page picture, previous and next paper of the
child, the answer walk ("Next answer to judge"), per-skill lanes, and for the answer picked in the table the old card's tools: the right answer
(change it for every child), the mistake to name (shortlist, another, none), whose page it is (the same photograph on two copies holds the save back
until a person says), judge Right/Wrong/Blank, and the correction of a signed-off answer. A question goes by its slot ("4a"), as before.

| Old spec | Assertion | New place |
|---|---|---|
| `s26-right-answer` 1, 2 | the right answer is shown as stored; change it for every child, code refuses a key the sum contradicts | `u77-paper-tools.spec.ts` |
| (no browser spec; engine-proved) | name the mistake: one press, kept on the answer, a row of the history log | `u77-paper-tools.spec.ts` |
| `s44-whose-paper` 2 | the page's own proof: crop outlined, printed code, copy and page | `u78-whose-paper.spec.ts` |
| `s44-whose-paper` 3 | a paper walked answer by answer | `u78-whose-paper.spec.ts` (the old queue's "next answer of this paper") |
| `s44-whose-paper` 4 | the same photograph on two copies: notice, save waits, the choice is a history row | `u78-whose-paper.spec.ts` |
| `asm2-checking`, `s4-validation-queue` (previous / next paper, lanes) | the child's papers in order; what the paper says by skill | `u78-whose-paper.spec.ts` (last test) |

Gaps, said plainly: "Capture here: Photo" waits for the engine's photo route (nothing in apps/web can honestly take a photo until it exists);
"Connected to" second lines and icons are the shared frame's (UI-7 frame plan), not these screens'; the scan's "By" (who put the file in) has no
column on `capture`, so it is not drawn; the level's one-line description in "What it asks" has no row to read it from here. After sign-off the
old queue (`/capture/check`) and the old Marking page (`/capture/[id]`) still stand until PR 4, which turns them into 308s to these screens; the
focus paper keeps landing on the old review address until then.

### PR 4: the old pages are gone; every old address answers 308 to its screen

`/papers` (and `/papers/make`), `/papers/review/[qr]`, `/papers/card`, `/papers/approve`, `/capture/[id]` and `/capture/check` are route handlers that answer 308 to the
list, the assessment screen or the paper screen (the paper screen with that answer in view); a page cannot give a real 308 once it has begun to stream. Their pages,
components and actions are deleted; the maker lives under Assessments (`make/`). `/capture` (Upload papers) stays: photograph upload waits for the engine's photo route.

What the old specs said, and where each is now. Where an old assertion was about the old DOM rather than behaviour, the behaviour moved to a spec of the new screen.

| Old spec | Assertion | New place |
|---|---|---|
| `s44-whose-paper`, `asm2-by-topic` | whose paper a page is; By topic; names; seven steps | `u78-whose-paper`, `u81-assessments-list`, `u62-assessment-steps` |
| `u61-page-two-is-not-page-one` | a page not found is said, never drawn as another | same spec, now on the paper screen; the screen says it (it did not before: it would have drawn page 1 for a page 2 answer) |
| `u60-ui-wave-1-flow` | the week walked page by page | same spec; the approve page and the Check answers page are gone, the assessment screen takes their place |
| `u68-who-sees-answers` | another class's paper, its link, its sign-off | same spec: an old link to another class's paper lands on the list, which names nothing of it; the sign-off is still refused in words |
| `u51-ux-rules` | every page keeps the rules | same spec over the three new screens; each now ends on a next step and always has one main action; two tests of the old Check answers page retired (the paper screen is covered by `u77`, `u78`, `u79`) |
| `u52-one-copy-one-answer` | one row per child; extra copies said in words; blank / none right warns | same spec on the assessment screen, which now carries the score, its "is this the right page?" question and the extra-copies line (they were not carried before) |
| `s4-validation-queue` | the queue of answers to check | same spec on the paper screen; an explanation the engine cannot mark now stays in view and asks Right, Wrong or Blank (it jumped on before); the walk between a child's papers skips a twin copy at one address |
| `u1`, `u10`, `u15`, `u79`, `p6` | addresses, tables, timings | addresses changed to the new ones; no assertion loosened |

Dropped as unreachable: the old Check answers page's "N answers left to check" figure and its table of assessments (the list's "Waits for" column says it, row by row; `u68` checks it person by person).

### Unfinished in this slice (stopped for the week's budget)

- Photo upload (`capture: Photo`) waits for the engine's photo route; the old Upload papers page stays until then, and UI-4 moves to `merged_slices` only after it.
- CI on PR 4 had not been seen when work stopped: local failures not yet explained are u12, u13, m1-09, u38, u41, s41 (possibly local database leftovers) and the p6 timing (4.4 s here against 2.5 s).
- Shared Rail second lines and icons are the UI-7 frame plan; the scan's "By" has no column; the level's one-line description has no row; "Its answer key" link on the paper screen is not carried.
