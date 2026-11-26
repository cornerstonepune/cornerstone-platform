# 0116 — M7: the profile-group work as seven tickets, and the contracts between them

Date: 2026-11-26. Status: accepted (planner, unattended; builds on ADR 0115, which Nimish accepted).
Goal: M7 in PROJECT.md — proved by each ticket's tests and, on live, `engine curriculum profile-check`.

## Context
ADR 0115 decided what G1–G4 profile groups are (a skill's approved group, derived through the view
`objective_profile_group`) and merged the table, view, role, proposal kind and the `skill-group` skill (PR #953). It left
the readers, the queue and the guard to tickets. Several tickets meet at the same rows, so their shared shapes are fixed
here once, before any is built.

## Decision
1. **Milestone M7, seven tickets.** Engine first (a profile-check, b decide, d profile-propose, e eval record + activation
   guard, f chain picture), then two screens (c library card, g objective page) only after their wireframes are approved.
2. **A `skill_group` proposal's shape** (written by d, read by b, a and c): one `curriculum_proposal` row,
   `kind = 'skill_group'`, `subject_code` = the registry skill code, `proposal = {"group": <CS-PROFILE group code>,
   "confidence": "high"|"medium"|"low", "options": [<the group codes offered>]}`, `reason` = the model's reason,
   `status = 'needs_person'`, `proposer = 'skill.skill-group v<N>'`, `machine = 'proposer:skill.skill-group'`,
   `about` null. A decision is the usual second row (`about` = the proposal, `staff_id` = the decider), status `applied`
   for approve and `rejected` for reject, as `learn.decide` already does for the bank's kinds.
3. **Undecided** means: `about is null` and no row has `about` = its id. profile-propose skips a skill that has an
   approved group or an undecided proposal; a rejected skill is proposed again on the next run.
4. **Approve writes `skill_profile_group`** (upsert on tenant + skill: a later approval replaces the group, naming the new
   proposal and approver). Only a holder of a role in `people.decides.skill_groups` may decide this kind; the check is
   `money_rules.roles_of` against that setting, never an email. Any other kind keeps today's rule.
5. **profile-check's classes** partition the live objectives of the bands in `profile.skill_bands`: `on_skill` (a row of
   origin `skill` in the view), `default_needs_skill` (only default rows, no registry skill), `default_skill_unapproved`
   (only default rows, has a registry skill), `no_group` (no row in the view). Words are counted through groups (an
   objective reaches a word when one of its groups lists it); every word of the profile is printed, zero included, so the
   word `kind` is always on the screen.
6. **`scored.json`** in a skill folder, written only by `engine skill eval <name> --record` on the held split when every
   bar is met and no gold case is `marked_by: "draft"`: `{"version": N, "gold_sha256": <sha256 of gold.json's bytes>,
   "split": "held", "scores": {...}, "recorded_at": <iso>}`. A skill with `active: true` other than `placement` needs a
   `scored.json` whose version is the SKILL.md version and whose hash is the current gold's; a core test reads every
   folder (`skill_spec.activation_faults`). Changing the gold or the version without a new record goes red.
7. **Screens need new drawings.** S27's approved wireframe is a placeholder that says a drawing must replace it before any
   change; S35's drawing (`docs/frontend/wireframes/objective.html`) shows no profile group. Both are redrawn on a plan
   branch, which voids their approvals; c and g are ticketed only after Nimish approves the new drawings.

## Consequence
Every ticket can be built alone except where noted: b, d and a agree on the proposal shape above without waiting for
each other. The activation guard (e) turns red only if someone sets `active: true` without a record, so it does not block
the others. Until Nimish marks the gold and a record passes, profile-propose refuses (no active prompt) and the word
`kind` stays at 0 on live, as profile-check will show.
