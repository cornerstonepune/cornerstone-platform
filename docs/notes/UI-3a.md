# UI-3a: the notes loop (period, record, confirm, notes)

Branch `ui-3a-notes-loop`, "Part of #518" (UI-3 split: 3a notes loop, 3b children, 3c teaching pages). Backend: issue #565, PR #569
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
