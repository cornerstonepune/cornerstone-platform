# Frontend vision, third pass: the walk, the links, and the graph question

9 Nov 2026. Nimish: "How are we seeing the activities, the materials, the curriculum design, and assessments? How are all
these things getting linked? I'm not clear what the frontend feels like. White, not ivory. Icons. A tree to the last node."
Answer: a clickable sketch, https://claude.ai/code/artifact/43bfce16-b41c-42fe-8b20-1ec11960ea74 (private to Nimish).
Companion to `frontend-vision.md` and `frontend-mindmap.md`.

## The edges that exist in the database today (read from `supabase/migrations`)

```
fortnight ──> plan_entry ──> activity ──> activity_objective ──> learning_objective ──> learning_objective_skill ──> skill
                                 ├──> activity_skill ──> skill                      skill ──> skill_link (confirmed) ──> skill
                                 ├──> activity_material ──> material_item ──> materials_list (per class, per fortnight)
                                 └──> steps · thinking · level_0..3 · activity_part_source (school | drafted | person)
timetable_slot (week A/B frame) ──> session (class, day, period, led_by, planned/done/not_done/moved, plan_entry_id)
session ──> activity_observation (child, activity, outcome above/below/as_expected/not_willing/absent, voice|form,
            expected_level, observed_by, confirmed_by, supersedes)  <── pii.educator_note (audio key, transcript, 48 h)
activity_observation ──(engine graph, nightly)──> child_observed_state (child, skill, state, named_days, adults)
evidence_event (written, grades 1-4) ──(engine graph)──> child_skill_state
child state ──> report_item · consent ──> parent report
```

`activity_observation.session_id` is still free (the migration says the next slice points it at `session`). Until then a
note links to its activity and class, not to the period it was taught in. Orchestrator 4 holds it for the backend audit;
no new Core scope without Nimish.

## What the sketch adds

One top bar (Today, Timetable, Children, Setup), a trail that goes back one step or to any earlier one, and on every
screen a "Connected to" rail listing the edges out of that node, plus "Capture here" (voice, photo) only on screens about
one lesson or one child. The walk: period -> activity (objective, steps, thinking, levels 0-3, materials, photo) ->
learning objective -> skill (the class grid on it; after / ready next) -> a child (skills drawn as a graph, sized by how
often seen; every observation with the educator's words beside the mark) -> back to any skill. The coordinator's Today is
what waits on them, next week's events and new activities, and "does the system have what it needs".

## Decisions this raised, and where they stand

1. **White ground.** Decided: `docs/decisions/2026-11-09-white-ground-for-the-site.md`. It supersedes the lime wash of
   `design-system/PRINCIPLES.md` and D-073's paper-warm for the page ground only; D-073's contrast table must be re-run
   on white. The font conflict in `docs/design-tokens.md` stays open.
2. **No educator score.** Agreed with orchestrator 4. Nothing in the database ranks staff; the agreed workflow puts
   effectiveness in a later phase. The sketch shows three fair numbers per class: sessions done of planned, notes
   confirmed late, reader accuracy (how much of the reader's draft she kept). A ranking is a decision with the school.
3. **Graph technology.** Agreed with orchestrator 4. The data is already a graph and the nightly rebuild is `engine
   graph`. What was missing is the walk on screen, which needs no new store. A graph database would be a second copy of
   the truth beside the one Postgres (ARCHITECTURE: one Postgres, four rings). Apache AGE (graph queries inside Postgres;
   not verified hands-on) only after a measured slow query.
4. **No visible sidebar tree.** Trail plus rail gives "go anywhere" with the full width; a tree is one component if
   Nimish still wants it after using the sketch.

## Questions still open for Nimish

1. Does the walk feel right; anything expected but unreachable?
2. Are the coordinator's three numbers enough?
