# UI-3a: the notes loop (period, record, confirm, notes)

Branch `u76-notes-loop`, "Part of #518" (UI-3 split: 3a notes loop, 3b children, 3c teaching pages). Backend: issue #565, PR #569
(`POST /voice/class-notes`, `POST /voice/notes/typed`, `educator_note.session_id`). This branch sits on #569's branch and merges after it.

## What is built

| Screen | Route | Reads | Notes |
|---|---|---|---|
| Period | `/period/[id]` (id = a `session`) | `session`, `plan_entry`, `activity`, the engine's activity page, `activity_observation` | last-time bar from the class's last day on the activity; a fixed part of the day says "Nothing to record here" |
| Record | `/record?class=&session=` | `session` of today, `voice.recording_enabled` | Type the marks makes the typed note (engine) and opens it; a refused microphone shows it as the main action |
| Confirm | `/notes/[id]` | engine draft + `class-notes` | the same board as `/voice/notes/[id]` (pieces moved to `voice/notes/[id]/parts.tsx`, old page unchanged in behaviour); Confirm lands on the next waiting note or Notes; Correct this note on a confirmed one |
| Notes | `/notes` | engine `class-notes`, a day at a time over the chosen week | Board or Table, filters in the address, late first |

Gate: every page calls `herVoice` (`voice.screens_enabled`); the actions call `requireStaff`. No config row is written. The old `/voice/*`
routes stay (`m1-04` runs unchanged); the 308 redirects are the slice's last step.

## Choices

- `StackBar` takes optional words per part; five outcome rows (`outcomeAbove` …) joined the state table, their words read from `observation_outcome`.
- ChildPeek opens from every named child, with the child and the way on; **its history has no read yet** (asked of the backend).
- Rail edges and "Open the child" point at screens of later slices; a rail edge draws only when that screen is in `merged_slices`.

## Not done, and why

- **Add a photo** (Record): no store or route for a session photo.
- **Voice upload with a session id**: `POST /voice/notes` takes no `session_id`, so a *voice* note is not tied to its period (the typed note is).
- **Coordinator sees every class on Notes**: `class-notes` is her own notes of classes she holds.
- **Mark picker on a square** and the × on a claim line: Confirm keeps the paint-mode board of M1-04; the picker is not built.
- The inventory test's control matching does not fit the real element labels; see the PR.

## PR C: the old voice pages retired. Their controls, and where each one lives now

Decision (Nimish, issue #599): no old screen stays active. The pages: `/voice/record`, `/voice/form`, `/voice/notes/[id]` (and `/voice/notes/audio`'s player, which stays as the route the player uses). Before they are redirected (308) and deleted, every control they hold is on a new screen, or is dropped for a stated reason.

| Old control | On the old page | Now | Done in PR C |
|---|---|---|---|
| Record, Stop, Send, Record again, playback, "leaving asks first" | `/voice/record` | `/record` (same `Recorder`) | none |
| Which class (several classes) | `/voice/record`, `/voice/form` | `/record` (`ClassChoice`) | none |
| "Use the form instead" (after a refused microphone or a failed send) | `/voice/record` | "Type the marks" (main action on a refused microphone) | drop the link text; `Recorder`'s default form link goes with the old page |
| The form: pick a mark, tap the children, activity by number, level, day, rest switch, Save | `/voice/form` | **Type the marks** makes the empty note; it opens on `/notes/[id]`, which has the same activity, level, day and rest switch, the picker and Confirm | none: the form's Save is Confirm on a typed note. Say so in the PR |
| "Fill the form" / "Use the form" links on a note that could not be read | `/voice/notes/[id]` (`could-not`) | none | point it to "Type the marks" for the class (`startTyped`) |
| Confirm, problems pinned, activity search, level, day, rest switch | `/voice/notes/[id]` | `/notes/[id]` (same `Board`, picker on) | none |
| Paint mode (pick a mark, then tap children) | `/voice/notes/[id]`, `/voice/form` | the picker on a square | delete the paint-mode code in `Board` with the old pages (it stays for the form route only until then) |
| "Reading your note" refreshes itself | `/voice/notes/[id]` | `/notes/[id]` (`Rereads`) | none |
| Her recording plays beside the note | `/voice/notes/[id]` | `/notes/[id]` | none |
| "Late: about yesterday" chip | `/voice/notes/[id]` | `/notes/[id]` (`Late`) | none |
| Record a note / Notes to confirm groups, one count | `/today` (What needs doing) | links go to the old addresses | point every link to `/record`, `/notes`, `/notes/[id]`; Notes into the menu (it lights under "What needs doing" today) |
| `data-` hooks the m1-04 spec reads | all three | same hooks on the new screens | move `m1-04-k2-voice-notes.spec.ts` to the new addresses at equal assertions (8 tests) |

The 308s: `/voice/record` to `/record`, `/voice/form` to `/record` (the typed path), `/voice/notes/[id]` to `/notes/[id]`; the query `?class=` carries over.

### Done in PR C (issue #599)
- `/voice/record`, `/voice/form` and `/voice/notes/[id]` answer 308 (`next.config.ts`); the pages, the paint-mode board, the form's Save (`saveForm`) and the old `confirmNote` are deleted. The board is the picker board only.
- Every link on What needs doing goes to `/record`, `/notes`, `/notes/[id]`. With recording off a class's row reads "Type the marks" and opens `/record`, where only typing is offered.
- "Use the form instead" is gone; a refused microphone or a failed send offers "Type the marks". A note that could not be read links to Record for its class.
- `m1-04-k2-voice-notes.spec.ts` now opens the new addresses. The three form tests became Type the marks tests; they read the observations by the note's id, because a typed note is confirmed like any other and no longer writes route `form`.
- Notes is a page of the Today door (`apps/web/lib/menu.ts`, after "What needs doing", which keeps `/record` and `/period`), so the bar reaches it in one click and no screen of the loop is left without a door. While voice notes are off the page answers not found, as every voice address does; the menu does not hide it (it has no switch to read).
- Unproven here (no database in this sandbox): the browser specs above, and that an empty typed note opens on the board and not on the "could not read" panel.
- The test titles in `m1-04-k2-voice-notes.spec.ts` and `u64-what-needs-doing-groups.spec.ts` still say "the form" / "Fill the form": `packages/engine/tests/test_promises.py` ties the retired goal's lines to those exact titles, so the titles stay and the assertions inside moved.
