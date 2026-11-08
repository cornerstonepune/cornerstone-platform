# CP-17 EGM stage 6: comprehension test

Reviewer: egm-comprehension (document only, no other context).

## What this proposes (reviewer's paraphrase)
A per-school rupee threshold; only items at or above it are tracked, decided by one function. An append-only stock
ledger (received, issued/returned as paired rows, counted, written off); on hand per place is a summing view; triggers
forbid going below zero, check reasons and who records. An append-only approval of each class's fortnight list by an
educator of that class after the freeze, holding a digest of the lines; any change makes it stale; a fortnight list
cannot be sent without a current approval.

## How the existing system works, per this document (reviewer's paraphrase)
Items have an optional rupee value; any priced item is "tracked" today in two engine places. Lists (day/week/fortnight)
are draft or sent, with no approval, rebuilt by code without edit rows. A shared approval list (C5) shows approvals by
kind. Settings live in `config`. CP-6 and CP-4 are pending.

## Findings and resolutions
| Sev | Finding | Resolution |
|---|---|---|
| 🔴 | `transfer_id` missing from `stock_move`; kind of each transfer row unclear | Column added. *Superseded by stage 7 #4: a move is one row; no `transfer_id`.* |
| 🔴 | "class-keyed" is not a `data_class` value | Now `child_data` with `key_column = class_id`. |
| 🟡 | `firsts` "first" vs "latest" | Defined; the row shows the earliest still-current approval. |
| 🟡 | Send-back path unclear | Removed: no send-back added; named as a gap. |
| 🟡 | "Open grant" undefined | Defined in Terms (`staff_role_grant`). |
| 🟡 | Unresolvable references (rule 1/10, athena block, LIVE/box, cli path) | Terms section; full paths. |
| 🟢 | "shows as draft" clashes with list state | "waiting for approval". |
| 🟢 | Project labels undefined | Terms section. |
| 🟢 | `fortnight_is_frozen` meaning | Stated: true for every state after planning. |
| 🟢 | Digest sort has no tie-break | Sorted by every field. |
