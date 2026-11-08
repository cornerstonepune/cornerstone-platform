# CP-17 EGM stage 5: initial zoom out (zoom-out, inventive catalyst)

Reviewers: egm-zoom-out, egm-inventive-catalyst (fresh context, read-only). Verdict: needs changes. All applied.

| # | Sev | Finding | Raised by | Resolution |
|---|---|---|---|---|
| 1 | 🔴 | Approval voided by edit count misses rebuilds: `w2_print/materials_list.py:82-106, 257-264` change lines with no `materials_line_edit` row | both | Confirmed in code. Approval stores a digest of the lines; send compares digests. Spec item 6 names rebuilds. |
| 2 | 🔴/🟡 | `counted` effect not stored, so the view must replay rows; `quantity > 0` contradicts "0 allowed for counted" | both | Trigger writes signed `change` under the lock; view is `sum(change)`. *Superseded by stage 7 #4 and stage 8: one row per move, `counted_change` only for counts.* |
| 3 | 🟡 | Existing C5 one-approval-list ignored | zoom-out | Confirmed (`20261208090000_one_approval_list.sql`). `approval_kind` row and `approval_list` `firsts` branch added; spec item 5. |
| 4 | 🟡 | Per-class list approval and CP-6's `approved` step not related | zoom-out | Section "How this meets CP-6's cycle": separate approvals; `list_sent` is CP-18's, which should require every class list approved. |
| 5 | 🟡 | Tracked check strands stock when threshold or price changes | catalyst | Tracked check only on new stock (received, first count); other kinds bounded by on hand. |
| 6 | 🟢/🟡 | Nullable class key on `access_table` may block on CP-4 | both | `stock_move` is `school_wide` (no child data); approval class-keyed; block only if CP-4 forbids. |
| 7 | 🟢 | Settings shape differs from existing (`{"roles":..}` vs bare arrays, no `seed_once`) | zoom-out | Bare values, `seed_once`, "open grant on a class" wording. |
| 8 | 🟢 | CLI names below design altitude | zoom-out | *Superseded by stage 7 #16: removed.* |

Added while fixing: an issue or return as two rows sharing a `transfer_id`. *Superseded by stage 7 #4: one row.*
