# CP-17 EGM stage 7: critic review (design, structure, style)

Reviewers: egm-design (design_critic persona), egm-structural, egm-style; fresh context. Verdict: changes required; applied.

| # | Sev | Lens | Finding | Resolution |
|---|---|---|---|---|
| 1 | 🔴 | design | Gate on draft-to-sent misses email sends (state never changes) and re-sends (`materials_send.py:60-72`, confirmed) | D8: `before insert` on `materials_send`; state trigger as backstop |
| 2 | 🔴 | design | Line writes do not lock the list; a send can race an edit | D7: line trigger takes the list row `for share`; send and approval take it `for update` |
| 3 | 🔴 | design | Approval digest taken at insert may cover lines the educator never saw | D6: caller passes `seen_digest`; refused unless equal |
| 4 | 🔴 | design | "Lone transfer row refused" had no mechanism; could create stock | Transfer is one row with a fixed direction per kind; no pairs |
| 5 | 🟡 | design | Digest drops null-quantity lines, ignores unit, null for empty list | jsonb digest with unit, coalesce to `'[]'` |
| 6 | 🟡 | design | `who`/`approved_by` are caller-asserted | Risks table: named; binds to CP-2/CP-3 identity if on main |
| 7 | 🟡 | design | Tenant mismatch not refused | D5; composite foreign key to `material_item`; tenant from list |
| 8 | 🟡 | design | Freeze read from `from_on` only; list may span two fortnights | D6: dates must equal one teaching fortnight |
| 9 | 🟡 | design | C5 `approval` would still accept send-back for the kind | `approval_checked` refuses kind `materials_list` |
| 10 | 🟢 | design | `counted_on_hand >= 0`; truncate needs its own trigger | Added |
| 11 | 🟢 | design | Name the lock key; every kind takes it | D2 |
| 12 | 🟡 | structure | Proofs not mapped to Done-when | Proof table |
| 13 | 🟡 | structure | No Non-goals; gaps not risks | Non-goals; Risks and mitigations |
| 14 | 🟡 | structure | Decisions 2, 3 "already settled by spec" | **Contested**: spec is an unlocked draft that follows the recommendation; Nimish decides |
| 15 | 🟡 | structure | "Rule 1" ambiguous | H1/R10 for outside rules; D1-D9 for the design's |
| 16 | 🟡 | structure | `cli.py` command not asked for | Removed; listed as a non-goal |
| 17 | 🟢 | structure | No problem statement; repeated reviews link | Problem section; one link |
| 18 | 🔴 | style | spec.md jargon in header and items 2, 7, 8 | Rewritten in plain words; builder notes moved to the end |
| 19 | 🟡 | style | spec.md items 4-6 unexplained terms; long first sentence; CP-18 unexplained | Rewritten |
| 20 | 🟡 | style | "Two issues at once cannot both pass" wrong | "cannot together take stock below zero" |
| 21 | 🟡 | style | Digest order stated twice, differently | One formula |
| 22 | 🟢 | style | "Rejected by author" x7; date format | Once in the heading; DD-MMM-YYYY |
