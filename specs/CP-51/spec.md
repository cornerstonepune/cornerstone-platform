# CP-51: the machine's work sits in the curriculum as "To approve"; only a person's approval makes it rubric evidence

Issue #762. Approved by Nimish in chat on 14 Nov, relayed by the orchestrator session (`session_01KEBF26UCbqPYZyu2nM8xL3`),
not written by him in the issue.

## What

1. Safety rule: what the machine linked never feeds rubric evidence by itself (handoff 2026-11-14, Backend).
2. Objective → skill: a model chooses one skill from a code shortlist, or none; code refuses anything off the list; the
   ledger writes the machine's link, which can be reverted.
3. To approve / Approved: an Approve action on an activity or objective, a Yes to an offer counting as approval, and an
   Approval filter on Curriculum and the Question bank (the Skills list already has one).
4. Lessons to confirm: a Curriculum view of the lessons whose activity a person still has to settle.

## Done when (each with its test)

1. Note, form and correction evidence only on chosen skills: `test_voice_confirm.py::test_a_skill_the_machine_linked_gets_no_evidence_from_a_note_a_form_or_a_correction`
2. Lesson mark only on chosen skills: `test_voice_confirm.py::test_a_lesson_mark_reaches_only_the_skills_a_person_or_the_school_linked`
3. A model-matched lesson keeps its marks and writes no evidence: `test_voice_confirm.py::test_a_lesson_whose_activity_only_the_machine_matched_keeps_the_mark_and_writes_no_evidence`
4. Only machine skills reads "no skill yet": `test_voice_confirm.py::test_an_activity_whose_only_skills_the_machine_linked_says_it_reaches_no_skill`
5. The shortlist: `test_lo_match.py::test_only_objectives_with_no_skill_are_asked_and_the_shortlist_is_their_unit_and_subject_words_first`, `…::test_an_objective_with_nothing_near_it_waits_for_a_person_with_no_call`
6. Ledger, refusal, none, never asked twice: `test_lo_match.py::test_a_chosen_skill_is_a_proposal_the_ledger_applies_as_the_machines_and_can_revert`, `…::test_a_skill_off_the_shortlist_is_refused_and_none_waits_for_a_person_and_neither_is_asked_twice`
7. Gold score: `test_lo_match.py::test_the_gold_is_the_schools_single_links_and_the_score_counts_shortlist_and_choice`, `…::test_the_prompt_is_a_row_with_a_closed_schema`
8. Approve: `test_link_approve.py` (activity, drafted parts, objective, evidence after, route)
9. A Yes to an offer is the person's link: `test_skill_offers.py::test_saying_yes_adds_that_one_skill_as_the_machines_link_naming_the_offer_and_nothing_else`
10–12. Curriculum filter, bank filter, lessons to confirm: `apps/web/tests/u95-to-approve.spec.ts` 1–4

## Out of scope

No schema change. The 205 planner lines the model already answered "none" and the 168 lessons with no planner line are
not put to a model again; they go on the list for a person. Attendance.
