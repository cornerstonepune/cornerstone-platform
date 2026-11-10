# UI-3b: Children, the class picture, where a child is

Branch `ui-3b-children`, part of #518 (closes #544). Scope: `specs/UI-3b/spec.md`. Tests: `apps/web/tests/u72-children.spec.ts`
(one per Done when line), and the inventory run `SCREEN=children,picture,child` of `u70-inventory.spec.ts`.

## State (10 Nov 2026)

Three screens on the UI-2 blocks: `/children` (table, filters, group by, ChildPeek in the rail), `/children/[class]` (squares, stack
bar, clusters), `/children/[class]/[roll]` (graph, table, trend, timeline). `/k2`, `/k2/[class]`, `/k2/[class]/[roll]` answer 308.
Reads are direct SQL (`lib/children-reads.ts`, `children-picture.ts`, `children-peek.ts`); the rules that are not SQL are pure and
in `lib/children-view.ts`. A class is the person's by `staff_sees` (`seesClass`); names through `pii.read_child`. The peek is a POST
(`/api/children/peek`, class id and Sr. No., never a name in an address); a class that is not the person's answers 404.

## Choices

| Choice | Reason |
|---|---|
| The bar's segments come from the **colour** of a child's state (`child_state.colour`): green secure, any other seen state practising, no row not seen. The skill count is the skills anyone in the child's class was seen on. | No state code in the website's code (`test_states_and_subject`); never a red segment. |
| The picture's squares read secure / practising / emerging from the same colours (green, amber, anything else). | Same rule; the squares and the stack bar use one mapping. |
| A class is read on its `observed` rows if any child has them, else its `written` rows. | K2 and grades 1 to 4 share `child_skill_state` (CP-27). |
| Absences noted: the last 7 teaching `school_day`s up to today for the class's campus; a day is **absent** when the child has a not-superseded `absent` observation that day, **none** when the class had a `session` in state `done` that day, otherwise **no lesson** (blank). | Done when 5; no register, no table (#551). |
| Needs attention = never seen on any skill, or last seen `children.attention_days` (a setting, 14) or more days ago. With the row absent only a child never seen needs attention; no number is assumed in the code. | Rule 1. The setting came with #569. |
| Notes waiting per child = the engine's `waiting_by_child` (`POST /voice/class-notes`), asked once per class the person teaches. A class the engine will not answer for (the coordinator holds none, switch off, engine down) shows a dashed "not available yet", never a guess. | #569 / #565. |
| The educator switch (`voice.screens_enabled`) gates the three screens and the peek as it gated the K2 pages; the migrated m1-17 assertion is in `u72`. | Never drop behaviour a test locks. |
| ChildPeek's history merges `activity_observation` (a voice note when `note_id` is set, else an observation; a correction names the outcome it replaces), a confirmed paper (`item_result` per capture, three signals right / wrong / wrong with working / blank), and the graph's state per skill (`child_skill_state.last_seen`). A note's words are never read. | The five sources of the data gap; `change_log` is not written yet, so a correction is read from `supersedes`. |
| Outcome words ("as expected") come from the outcome code with underscores removed. | The word list is not a config row on main yet. |
| The fold under a timeline entry says whether it counts toward secure from config `observed.weights`, by grade and entry mode. | Rule 1. |
| `ChildGraph` takes `label` (role=img, counts by state) and `table={false}`; the child page draws the full `DataTable` beside it, which is the list on a phone. Rings: the child's distinct registry domains, sorted, take the three slots in turn. | Done when 15 and 16. The block has three rings; the registry has more domains than that. |
| `FilterBar`'s search takes a `label`; `STATES` has an `absent` row (grey, icon `absent`). | The inventory finds the search by its label; the strip needs a chip. |
| The ten-row page is cut over the **whole grouped list**: a group's heading shows its total, its rows are the page's. | "Later →" is the next ten rows. |

## Gaps (backend)

- **Spark** (secure per fortnight): the nightly run records no class counts in `flow_run.result`; the Spark shows its empty words.
- **Outcome words** as a config list (the peek derives them from the code).
- **Child history from the engine** (#575, `POST /k2/child-history`) was not on main when this was written; the peek reads the database itself and keeps working. Switching to the engine's call would drop the paper and correction entries it does not carry.

## Not done here

Saved groups, a real register, a name chosen for a group: all out of scope.
