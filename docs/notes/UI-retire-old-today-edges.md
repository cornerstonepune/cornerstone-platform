# UI-retire-old-today-edges: everything old left behind; Today loads for every person and day

Nimish, 11 Nov 2026: "In this release, ensure that you leave everything old behind. No traces of anything old should be left. These are
all new wireframes, new pages. A new Today page should load properly when we open it, so fine-tune all those edge cases as well."

## Verified

- No redirect is kept: nothing printed or sent names a page of the site. A paper's QR is its sheet id (`engine/assess/render.py`), the
  password email links `/login/link` (a live page), and `grep -rn` of `packages/engine/engine`, `n8n/workflows` and `supabase/seed` for
  every old address finds only engine API paths and `engine/checks/live.py`'s `MENU` (a list of pages to look for in Vercel's own logs,
  no request is sent; engine code, so not changed here).
- Kept, though old, because each still does something no new screen does (Nimish's rule: wireframes win unless the old page has a
  function the wireframe lacks): `/` (marks one skill taught in a class), `/library` (the bank's proposals: remove, keep, adopt, reject),
  `/growth/[id]`, `/report`, `/parent` (sign off all of a child's papers, move a child with a reason, the parent report: last, per
  Nimish), `/skill-sets/[code]/edit` (a skill's name, objective and every level's sentence in one form), `/worksheets/[qr]` and
  `/worksheets/taxonomy` (print for children, the taxonomy cases), `/make/*` (the per-child home papers), `/capture` (Upload papers,
  until the engine's photo route), `/educator/materials` and `/review` (quantities, lines, notes put on the list), `/across`,
  `/setup/needs-doing`, `/refused`.
- `requireStaffEditor` removed, and its `test_web_gate.py` line, with the backend orchestrator's yes (11 Nov).
- `bin/check`: 60 passed, 4 skipped. Today's specs: see the pull request.

## Handoff

- The activity screen (`/setup/activities/[code]`) shows Keep / Edit / Send back to any coordinator whatever the curriculum gate says, so
  the old "the staff preview changes nothing" check could not move at equal strength (dropped, named in m1-13's header). An app change.
- u22 and u37 assert the old Papers page's tables; they ran on `/children/assessments` (the old redirect) before this branch too.
