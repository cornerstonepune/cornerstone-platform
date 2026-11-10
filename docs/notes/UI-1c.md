# UI-1c: a control that changes something is driven as its element declares

Branch `ui-1c-drivers`. Asked for by the frontend orchestrator (10 Nov 2026) for UI-4b, and for UI-3a/3c (Keep, Edit, Send back).

`tests/inventory/checks.ts` had drivers for three effects (close ChildPeek, remove a filter, clear filters); any other button with a stated `effect` failed as "not yet drivable", so no screen with an Approve, Print or Save could pass. Now an element in `screens.json` may carry `drive`, and the checker does it, whatever the screen:

| Field | Meaning |
|---|---|
| `fixture` | name of a function in `tests/inventory-fixtures.ts` `FIXTURES` that puts the rows the control needs in place; the page is reloaded after |
| `fill` | `{ "field label": "value" }`, typed into the fields by label |
| `click` | the control's name (default: the element's own words); a button, else a link; a new tab it opens is closed |
| `expect.url` | pattern the address matches afterwards |
| `expect.text` / `expect.gone` | words that are on the page / no longer on it |
| `expect.check` | name of a function in `CHECKS` that reads the rows and returns the problems ([] when it holds) |

Nothing declared is skipped: an unknown fixture, field, control or check is a problem named. An effect with no `drive` and no old driver still fails, so nothing passes unexercised. Additive: the three old drivers are unchanged.

Proved in `u70-inventory-proof.spec.ts` on the mini inventory: a drive that holds passes; one held to words the page never says, or words that stay, fails naming the control; a missing fixture or field is named.

Not done here: any screen's `drive` declarations (UI-3a/3c and UI-4b add theirs, with their fixtures and checks).
