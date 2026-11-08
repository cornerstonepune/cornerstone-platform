# CP-17 EGM stage 8: intermediate zoom out

Reviewer: egm-zoom-out (fresh context). Verdict: passes with minor changes; applied. The reviewer checked lock order
(`materials_list.py:56-58` locks the list before lines; the send locks the list and only reads lines): D7 adds no
deadlock. Nothing in the design is outside `spec.md`; no contradiction with CP-6.

| Sev | Finding | Resolution |
|---|---|---|
| 🟡 | D6 vs D8: a fortnight list with off-calendar dates could never be sent | "Fortnight list" defined once in Data; refusal says why; proof added for the case |
| 🟡 | Refusing the kind by replacing C5's `approval_checked` copies another slice's function | Separate `before insert` trigger on `approval`; C5 untouched |
| 🟡 | Earlier stage reports describe reversed choices (`transfer_id`, `sum(change)`, CLI) | Marked superseded in `zoom_out_report.md` and `comprehension_report.md` |
| 🟢 | State backstop in D8 | Kept, with its reason (a hand-written update) |
| 🟢 | `counted` stored the fact three ways | `quantity` null for counts |
| 🟢 | Lock expression is code | D2 says "one transaction lock per tenant and item" |
| 🟢 | A count could add stock to an untracked item | D1 refuses it |
