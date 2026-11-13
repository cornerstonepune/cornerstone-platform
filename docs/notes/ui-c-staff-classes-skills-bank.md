# ui-c-staff-classes-skills-bank — page charter Part C: Staff · Classes, Skills to approve, Question bank / a question

Spec: `docs/frontend/page-charter.md` Part C rows "Staff · Classes: keep, Workspace", "Skills to approve: keep, Workspace; one skill at a
time on the right" and "Question bank / a question: keep, Workspace", with Part A (Workspace, detail panel, stat tiles). Pattern: B5's
class picture and B6's board (`components/detail-panel.tsx`, `?open=<kind>:<id>&tab=…`).

## Done

- `/setup/staff`: the staff table on the left; a person opens on the right (`open=person:<id>`), tabs Grants (End a grant, Add a grant) and
  Roles (what they hold today, their three whole counts); nothing open: stat tiles. Add a person is the one primary action. `?person=<id>`
  still opens the panel.
- `/setup/classes`: the classes on the left; a class opens on the right (`open=class:<id>`), tabs Children (Sr. No. and name from
  `pii.read_child`, Move on each) and Moves (the change log), with its Class picture; `?class=<id>` still opens it.
- `/setup/skills/approve`: the skills waiting on the left (no Approve on a row); one skill on the right (`open=skill:<code>`), tabs Levels
  and About, its own Approve; an approval returns under the same choices with the next skill open (`APPROVE_PAGE` in
  `skill-sets/[code]/actions.ts` now allows `open`). The panel's tabs are `read`/`about`, since `tab=levels` is the page's second list.
  What a wrong answer counts against and its approval moved to the summary on the right.
- `/setup/question-bank`: the questions on the left; a question on the right (`open=question:<key>`), tabs Question · Change (the
  coordinator's Correct and Remove) · About; `/setup/question-bank/[key]` is that panel opened full page (`question-panel.tsx` shared).
  Remove from the panel returns to the bank with the question open; Correct still lands on the corrected question's own page (the
  action is unchanged); a refused correction reopens the Change tab.
- `KindTile`/`Opened` take an optional `icon` (a class, a member of staff are not one of the seven kinds).
- screens.json, the five wireframes, the guide pages for staff, classes and the bank, SPEC.md, scopes.md and help.json regenerated.

## Tests

- New: `u94-staff-classes-workspace`, `u94-skills-to-approve-workspace`, `u94-question-bank-workspace` (one spec per charter line).
- Moved to the panel: e2e (correct, remove), s2, s3, u17, u23, u53, u54, u73, u74, u77; inventory fixtures `@grants`, `@class-open`,
  `@skill-open`, `@bank-question`.
