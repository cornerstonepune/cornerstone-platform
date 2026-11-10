# UI-1b: the inventory checker drives real screens

Branch `ui-1b-inventory-checker`, asked for by the frontend orchestrator (10 Nov 2026) after UI-3b found that `tests/inventory/checks.ts`
could not pass any real screen. Root-cause changes, nothing weakened: every wireframe control is still found **and** exercised.

| Was | Now |
|---|---|
| A control was matched by the inventory's label, so "rail: Notes", "page: Later →", "peek: Close" never matched. | The label's place prefix (`rail:`, `page:`, `peek:`, `capture:`, `next step:`, `details:`) is not part of what a person reads; the match is on the rest, or on the element's own `text`. |
| A button with a stated effect always failed ("not yet drivable"). | Its effect is driven: closes ChildPeek (focus returns to the opener, the address loses the peek), removes one filter (the address loses a parameter), removes every filter. An effect the checker has no driver for still fails, so nothing passes unexercised. |
| A conditional control (after a tap, with a filter on, on a second page) was "missing" at rest. | An element may say `when`: `peek`, `filtered` or `paged`. The checker brings the page into that state (taps a child, searches) and asks for the control there; at rest it is allowed but not required. |
| `peek`, `filter` elements were not driven at all. | A peek is every child's open button: it opens in place, the address carries `peek` (the Sr. No., never a name), Escape closes it and focus returns. A filter writes itself into the address and a reload keeps it. |
| The frame's Next step and the per-child buttons counted as "extra control". | Next step and the details link are the frame's: never extra, but required when an element lists them. A `peek` element takes every child button. |
| A link to a screen not built was "missing", or "dead" when drawn. | Not required and not driven (it need not be drawn); drawn by its label it is accepted as the element's own. Built = a slice in `merged_slices` or a screen this run covers. |
| `roles` on a filter was ignored. | Honoured like `for`. |
| A rail whose links all go to unbuilt screens was required. | Not required. |

Proved on pages the test serves itself (`u70-inventory-proof.spec.ts`, no app code): a peek that opens, carries the Sr. No., closes on Escape
with focus back; the same peek failing when it does not give focus back; filters, × and Clear; the frame's links and an unbuilt target; an
effect with no driver still failing.
