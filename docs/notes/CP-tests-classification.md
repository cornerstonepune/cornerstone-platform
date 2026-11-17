# CP-tests: every test file, core, nightly or delete

Nimish, 17 Nov 2026: no pull request runs the whole suite again. **core** runs on every pull request (engine: `packages/engine/tests/core.txt`, `pytest -m core`; browser: `@core` in a title, `--grep @core`); **nightly** runs once a night on main (`.github/workflows/nightly.yml`); **delete** freezes an old page look (standing order of 17 Nov) and is removed.

Totals (tests, counted by `pytest --collect-only` and `playwright test --list`, parameters expanded): core **245**, nightly **5492**, deleted **98**.

Proofs (`bin/specs`): 22 spec folders have a `checks.sh`; `bin/specs` runs CP-1, CP-5, CP-9 and CP-10. They move from every change (specs.yml, deleted) to the nightly run. No proof was deleted: whether one duplicates a newer test was not checked one by one, and is left open in the handover.

| suite | file | tests | core | class | reason |
|---|---|---:|---:|---|---|
| engine | `tests/api/test_bank_routes.py` | 14 | 0 | nightly | an engine route's detail: nightly |
| engine | `tests/api/test_capture_routes.py` | 17 | 0 | nightly | an engine route's detail: nightly |
| engine | `tests/api/test_children_routes.py` | 4 | 0 | nightly | an engine route's detail: nightly |
| engine | `tests/api/test_curriculum_gate.py` | 8 | 0 | nightly | an engine route's detail: nightly |
| engine | `tests/api/test_deps.py` | 7 | 0 | nightly | an engine route's detail: nightly |
| engine | `tests/api/test_gold_sheet_route.py` | 6 | 0 | nightly | an engine route's detail: nightly |
| engine | `tests/api/test_graph_routes.py` | 5 | 0 | nightly | an engine route's detail: nightly |
| engine | `tests/api/test_idempotency.py` | 10 | 0 | nightly | an engine route's detail: nightly |
| engine | `tests/api/test_k2_classes.py` | 5 | 0 | nightly | an engine route's detail: nightly |
| engine | `tests/api/test_k2_page_routes.py` | 8 | 0 | nightly | an engine route's detail: nightly |
| engine | `tests/api/test_k2_routes.py` | 10 | 0 | nightly | an engine route's detail: nightly |
| engine | `tests/api/test_level_words_routes.py` | 8 | 0 | nightly | an engine route's detail: nightly |
| engine | `tests/api/test_library_routes.py` | 5 | 0 | nightly | an engine route's detail: nightly |
| engine | `tests/api/test_maker_routes.py` | 5 | 0 | nightly | an engine route's detail: nightly |
| engine | `tests/api/test_materials_routes.py` | 9 | 0 | nightly | an engine route's detail: nightly |
| engine | `tests/api/test_materials_school_routes.py` | 14 | 0 | nightly | an engine route's detail: nightly |
| engine | `tests/api/test_offers_routes.py` | 4 | 0 | nightly | an engine route's detail: nightly |
| engine | `tests/api/test_paper_routes.py` | 3 | 0 | nightly | an engine route's detail: nightly |
| engine | `tests/api/test_plan_routes.py` | 5 | 0 | nightly | an engine route's detail: nightly |
| engine | `tests/api/test_runs_routes.py` | 5 | 0 | nightly | an engine route's detail: nightly |
| engine | `tests/api/test_timetable_go_live_route.py` | 8 | 0 | nightly | an engine route's detail: nightly |
| engine | `tests/api/test_timetable_hand_routes.py` | 4 | 0 | nightly | an engine route's detail: nightly |
| engine | `tests/api/test_voice_routes.py` | 8 | 0 | nightly | an engine route's detail: nightly |
| engine | `tests/api/test_week_routes.py` | 11 | 0 | nightly | an engine route's detail: nightly |
| engine | `tests/test_a_scan_read_whole.py` | 5 | 1 | core (part) | guards a core harm; the other 4 nightly |
| engine | `tests/test_a_skill_set_is_read_as_itself.py` | 3 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_access_every_table.py` | 8 | 8 | core | guards a core harm |
| engine | `tests/test_access_keys.py` | 5 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_access_rules.py` | 3 | 3 | core | guards a core harm |
| engine | `tests/test_answer_standing.py` | 3 | 1 | core (part) | guards a core harm; the other 2 nightly |
| engine | `tests/test_apply_seed.py` | 44 | 2 | core (part) | guards a core harm; the other 42 nightly |
| engine | `tests/test_approval.py` | 2 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_approval_list.py` | 7 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_aseem_1518.py` | 1 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_ask_a4_date.py` | 2 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_asks.py` | 5 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_asks_school_words.py` | 7 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_attendance.py` | 9 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_audit.py` | 3 | 0 | nightly | CI, deploy and live tooling: nightly |
| engine | `tests/test_bank.py` | 31 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_bank_fills.py` | 7 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_bars.py` | 4 | 0 | nightly | CI, deploy and live tooling: nightly |
| engine | `tests/test_boxes.py` | 23 | 0 | nightly | paper reading detail (one happy path is core): nightly |
| engine | `tests/test_calibration.py` | 12 | 1 | core (part) | guards a core harm; the other 11 nightly |
| engine | `tests/test_cambridge_words.py` | 5 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_card_bank.py` | 4 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_cards.py` | 30 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_chain.py` | 3 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_chain_choose.py` | 8 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_chain_draft.py` | 24 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_chain_picture.py` | 9 | 1 | core (part) | guards a core harm; the other 8 nightly |
| engine | `tests/test_check_db_url.py` | 20 | 20 | core | guards a core harm |
| engine | `tests/test_child_move.py` | 20 | 1 | core (part) | guards a core harm; the other 19 nightly |
| engine | `tests/test_ci_browser_check.py` | 5 | 0 | nightly | CI, deploy and live tooling: nightly |
| engine | `tests/test_ci_plan.py` | 77 | 77 | core | guards a core harm |
| engine | `tests/test_ci_plan_seed.py` | 23 | 0 | nightly | CI, deploy and live tooling: nightly |
| engine | `tests/test_ci_postgres.py` | 3 | 0 | nightly | CI, deploy and live tooling: nightly |
| engine | `tests/test_ci_shard.py` | 18 | 0 | nightly | CI, deploy and live tooling: nightly |
| engine | `tests/test_class_card.py` | 4 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_cli.py` | 27 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_cli_materials.py` | 6 | 0 | nightly | materials lists: nightly |
| engine | `tests/test_cli_timetable.py` | 5 | 0 | nightly | timetable detail beyond the core rules: nightly |
| engine | `tests/test_cli_voice.py` | 4 | 0 | nightly | voice notes: nightly |
| engine | `tests/test_contract.py` | 3 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_copies.py` | 15 | 0 | nightly | paper reading detail (one happy path is core): nightly |
| engine | `tests/test_core_budget.py` | 3 | 3 | core | guards a core harm |
| engine | `tests/test_counting.py` | 53 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_counts.py` | 1 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_cp50_start_time.py` | 3 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_crops.py` | 3 | 0 | nightly | paper reading detail (one happy path is core): nightly |
| engine | `tests/test_crosswalk.py` | 10 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_curriculum_confirm.py` | 4 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_curriculum_run_command.py` | 58 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_curriculum_versions.py` | 6 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_data_register.py` | 5 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_db.py` | 3 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_db_plans.py` | 6 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_db_privileges.py` | 4 | 4 | core | guards a core harm |
| engine | `tests/test_deploy.py` | 37 | 0 | nightly | CI, deploy and live tooling: nightly |
| engine | `tests/test_digits.py` | 6 | 0 | nightly | paper reading detail (one happy path is core): nightly |
| engine | `tests/test_div_levels.py` | 23 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_div_methods.py` | 19 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_div_mistakes.py` | 6 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_div_models.py` | 13 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_divide_advance.py` | 19 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_divide_found.py` | 12 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_divide_stories.py` | 6 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_division_is_an_operation.py` | 24 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_e0_english.py` | 7 | 0 | nightly | English bank: nightly |
| engine | `tests/test_each_answer.py` | 8 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_edit_paper.py` | 8 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_educator_gate.py` | 15 | 15 | core | guards a core harm |
| engine | `tests/test_english_check.py` | 26 | 0 | nightly | English bank: nightly |
| engine | `tests/test_english_edit.py` | 11 | 0 | nightly | English bank: nightly |
| engine | `tests/test_english_foundation.py` | 14 | 0 | nightly | English bank: nightly |
| engine | `tests/test_english_kinds_and_samples.py` | 7 | 0 | nightly | English bank: nightly |
| engine | `tests/test_english_samples.py` | 4 | 0 | nightly | English bank: nightly |
| engine | `tests/test_equation.py` | 6 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_estimates.py` | 17 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_eval_command.py` | 8 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_evaluate.py` | 9 | 1 | core (part) | guards a core harm; the other 8 nightly |
| engine | `tests/test_every_answer.py` | 9 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_every_listed_case.py` | 61 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_every_report.py` | 2 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_every_skill.py` | 25 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_evidence_every_kind.py` | 7 | 3 | core (part) | guards a core harm; the other 4 nightly |
| engine | `tests/test_external.py` | 6 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_facts_advance.py` | 20 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_feedback_rules.py` | 4 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_feedback_shot.py` | 6 | 1 | core (part) | guards a core harm; the other 5 nightly |
| engine | `tests/test_fet.py` | 2 | 0 | nightly | timetable detail beyond the core rules: nightly |
| engine | `tests/test_focus.py` | 10 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_focus_paper.py` | 22 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_fortnight_cycle.py` | 7 | 0 | nightly | timetable detail beyond the core rules: nightly |
| engine | `tests/test_fortnight_plan.py` | 3 | 0 | nightly | timetable detail beyond the core rules: nightly |
| engine | `tests/test_frameworks.py` | 7 | 1 | core (part) | guards a core harm; the other 6 nightly |
| engine | `tests/test_gates.py` | 8 | 0 | nightly | CI, deploy and live tooling: nightly |
| engine | `tests/test_generate.py` | 9 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_given.py` | 3 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_goal.py` | 4 | 0 | nightly | CI, deploy and live tooling: nightly |
| engine | `tests/test_gold.py` | 3 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_grades.py` | 5 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_grants_one_source.py` | 8 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_graph.py` | 1 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_graph_rule.py` | 14 | 2 | core (part) | guards a core harm; the other 12 nightly |
| engine | `tests/test_guide.py` | 19 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_handout.py` | 3 | 1 | core (part) | guards a core harm; the other 2 nightly |
| engine | `tests/test_image.py` | 1 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_inbox.py` | 13 | 0 | nightly | paper reading detail (one happy path is core): nightly |
| engine | `tests/test_ink_line.py` | 5 | 0 | nightly | paper reading detail (one happy path is core): nightly |
| engine | `tests/test_items.py` | 40 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_jev.py` | 8 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_k2_advisory.py` | 11 | 0 | nightly | K2 pages, drafting and checking: nightly |
| engine | `tests/test_k2_batch.py` | 17 | 0 | nightly | K2 pages, drafting and checking: nightly |
| engine | `tests/test_k2_check.py` | 12 | 0 | nightly | K2 pages, drafting and checking: nightly |
| engine | `tests/test_k2_checkers.py` | 5 | 0 | nightly | K2 pages, drafting and checking: nightly |
| engine | `tests/test_k2_child_growth.py` | 9 | 0 | nightly | K2 pages, drafting and checking: nightly |
| engine | `tests/test_k2_day.py` | 19 | 0 | nightly | K2 pages, drafting and checking: nightly |
| engine | `tests/test_k2_draft.py` | 37 | 0 | nightly | K2 pages, drafting and checking: nightly |
| engine | `tests/test_k2_forecast.py` | 5 | 0 | nightly | K2 pages, drafting and checking: nightly |
| engine | `tests/test_k2_format.py` | 22 | 0 | nightly | K2 pages, drafting and checking: nightly |
| engine | `tests/test_k2_gaps.py` | 17 | 0 | nightly | K2 pages, drafting and checking: nightly |
| engine | `tests/test_k2_gold.py` | 8 | 0 | nightly | K2 pages, drafting and checking: nightly |
| engine | `tests/test_k2_growth.py` | 15 | 0 | nightly | K2 pages, drafting and checking: nightly |
| engine | `tests/test_k2_page.py` | 15 | 0 | nightly | K2 pages, drafting and checking: nightly |
| engine | `tests/test_k2_picture.py` | 15 | 0 | nightly | K2 pages, drafting and checking: nightly |
| engine | `tests/test_k2_picture_reads.py` | 19 | 0 | nightly | K2 pages, drafting and checking: nightly |
| engine | `tests/test_k2_reads.py` | 8 | 1 | core (part) | guards a core harm; the other 7 nightly |
| engine | `tests/test_k2_record.py` | 7 | 0 | nightly | K2 pages, drafting and checking: nightly |
| engine | `tests/test_k2_replay.py` | 17 | 0 | nightly | K2 pages, drafting and checking: nightly |
| engine | `tests/test_k2_review.py` | 13 | 0 | nightly | K2 pages, drafting and checking: nightly |
| engine | `tests/test_k2_rules.py` | 26 | 0 | nightly | K2 pages, drafting and checking: nightly |
| engine | `tests/test_k2_timetable.py` | 15 | 0 | nightly | K2 pages, drafting and checking: nightly |
| engine | `tests/test_k2_timetable_load.py` | 23 | 0 | nightly | K2 pages, drafting and checking: nightly |
| engine | `tests/test_k2_upload.py` | 18 | 0 | nightly | K2 pages, drafting and checking: nightly |
| engine | `tests/test_keys.py` | 6 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_layout.py` | 9 | 9 | core | guards a core harm |
| engine | `tests/test_learn.py` | 4 | 1 | core (part) | guards a core harm; the other 3 nightly |
| engine | `tests/test_learned_mistakes.py` | 4 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_learned_rules.py` | 5 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_legacy.py` | 67 | 1 | core (part) | guards a core harm; the other 66 nightly |
| engine | `tests/test_lesson_level.py` | 23 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_level_approval.py` | 4 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_levels.py` | 15 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_levels_closing.py` | 2 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_library.py` | 30 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_lineup.py` | 13 | 0 | nightly | paper reading detail (one happy path is core): nightly |
| engine | `tests/test_link_approve.py` | 6 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_links_source.py` | 4 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_live.py` | 4 | 0 | nightly | CI, deploy and live tooling: nightly |
| engine | `tests/test_live_copy.py` | 4 | 0 | nightly | CI, deploy and live tooling: nightly |
| engine | `tests/test_live_data.py` | 7 | 0 | nightly | CI, deploy and live tooling: nightly |
| engine | `tests/test_llm.py` | 32 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_llm_budget.py` | 26 | 4 | core (part) | guards a core harm; the other 22 nightly |
| engine | `tests/test_llm_budget_monthly.py` | 4 | 1 | core (part) | guards a core harm; the other 3 nightly |
| engine | `tests/test_lo_match.py` | 7 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_loaders.py` | 14 | 2 | core (part) | guards a core harm; the other 12 nightly |
| engine | `tests/test_maker.py` | 13 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_map_check.py` | 10 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_map_eval.py` | 5 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_map_kind.py` | 9 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_map_ledger.py` | 14 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_map_offers.py` | 13 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_map_probe.py` | 10 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_map_replay.py` | 19 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_map_schema.py` | 14 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_map_stage.py` | 6 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_map_why.py` | 8 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_materials_consolidate.py` | 9 | 0 | nightly | materials lists: nightly |
| engine | `tests/test_materials_cost.py` | 6 | 0 | nightly | materials lists: nightly |
| engine | `tests/test_materials_intake.py` | 19 | 1 | core (part) | guards a core harm; the other 18 nightly |
| engine | `tests/test_materials_inventory.py` | 3 | 0 | nightly | materials lists: nightly |
| engine | `tests/test_materials_list.py` | 19 | 0 | nightly | materials lists: nightly |
| engine | `tests/test_materials_month.py` | 10 | 0 | nightly | materials lists: nightly |
| engine | `tests/test_materials_read_eval.py` | 2 | 0 | nightly | materials lists: nightly |
| engine | `tests/test_materials_reminders.py` | 6 | 0 | nightly | materials lists: nightly |
| engine | `tests/test_materials_review.py` | 19 | 0 | nightly | materials lists: nightly |
| engine | `tests/test_materials_send.py` | 17 | 0 | nightly | materials lists: nightly |
| engine | `tests/test_materials_text.py` | 6 | 0 | nightly | materials lists: nightly |
| engine | `tests/test_md_cases.py` | 119 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_md_charges.py` | 9 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_md_equality.py` | 19 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_md_multiples.py` | 17 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_md_word.py` | 12 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_mental.py` | 19 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_migration_order.py` | 4 | 4 | core | guards a core harm |
| engine | `tests/test_misconceptions.py` | 14 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_mistake_guess.py` | 7 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_mistake_names.py` | 3 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_mistake_rows.py` | 3 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_mul_advance.py` | 34 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_mul_levels.py` | 31 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_mul_methods.py` | 16 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_mul_mistakes.py` | 47 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_mul_models.py` | 12 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_n8n_lint.py` | 13 | 0 | nightly | CI, deploy and live tooling: nightly |
| engine | `tests/test_new_kinds.py` | 72 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_nightly.py` | 3 | 0 | nightly | CI, deploy and live tooling: nightly |
| engine | `tests/test_no_guessed_pages.py` | 5 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_notes_history_and_coordinator.py` | 10 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_ocr.py` | 56 | 1 | core (part) | guards a core harm; the other 55 nightly |
| engine | `tests/test_one_clock.py` | 5 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_one_read_per_file.py` | 6 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_pack.py` | 3 | 1 | core (part) | guards a core harm; the other 2 nightly |
| engine | `tests/test_paper_from_library.py` | 8 | 1 | core (part) | guards a core harm; the other 7 nightly |
| engine | `tests/test_parent_report.py` | 31 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_parent_review.py` | 10 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_password_rules.py` | 5 | 2 | core (part) | guards a core harm; the other 3 nightly |
| engine | `tests/test_past.py` | 5 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_people.py` | 14 | 2 | core (part) | guards a core harm; the other 12 nightly |
| engine | `tests/test_people_signer.py` | 11 | 1 | core (part) | guards a core harm; the other 10 nightly |
| engine | `tests/test_photograph_page.py` | 21 | 0 | nightly | paper reading detail (one happy path is core): nightly |
| engine | `tests/test_photos_and_session_note.py` | 4 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_plan_author.py` | 8 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_plan_match.py` | 8 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_profile.py` | 5 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_profiles.py` | 18 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_promises.py` | 9 | 0 | nightly | CI, deploy and live tooling: nightly |
| engine | `tests/test_provenance.py` | 5 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_python_pin.py` | 2 | 0 | nightly | CI, deploy and live tooling: nightly |
| engine | `tests/test_question.py` | 12 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_question_registry_skills.py` | 3 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_question_types.py` | 11 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_ratchet.py` | 6 | 0 | nightly | CI, deploy and live tooling: nightly |
| engine | `tests/test_read_again.py` | 4 | 0 | nightly | paper reading detail (one happy path is core): nightly |
| engine | `tests/test_read_back.py` | 6 | 0 | nightly | paper reading detail (one happy path is core): nightly |
| engine | `tests/test_read_eval.py` | 8 | 0 | nightly | paper reading detail (one happy path is core): nightly |
| engine | `tests/test_reasoning.py` | 2 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_refill_fair.py` | 5 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_registry_text.py` | 2 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_rehome.py` | 41 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_render.py` | 25 | 0 | nightly | paper reading detail (one happy path is core): nightly |
| engine | `tests/test_render_pdf.py` | 3 | 0 | nightly | paper reading detail (one happy path is core): nightly |
| engine | `tests/test_report.py` | 4 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_report_lines.py` | 10 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_retire_kind.py` | 8 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_review.py` | 6 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_roles.py` | 5 | 5 | core | guards a core harm |
| engine | `tests/test_roll_order.py` | 2 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_roster.py` | 5 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_rounding.py` | 8 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_rules.py` | 3 | 3 | core | guards a core harm |
| engine | `tests/test_rung_folded.py` | 7 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_same_page.py` | 8 | 0 | nightly | paper reading detail (one happy path is core): nightly |
| engine | `tests/test_school_words.py` | 5 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_second_reader.py` | 11 | 0 | nightly | paper reading detail (one happy path is core): nightly |
| engine | `tests/test_seen.py` | 4 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_settings.py` | 4 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_skill_is_called_skill.py` | 4 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_skill_level.py` | 6 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_skill_links.py` | 9 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_skill_links_confirmed.py` | 11 | 1 | core (part) | guards a core harm; the other 10 nightly |
| engine | `tests/test_skill_links_loader.py` | 12 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_skill_offers.py` | 10 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_skills.py` | 49 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_skills_pool.py` | 6 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_skills_spend.py` | 3 | 3 | core | guards a core harm |
| engine | `tests/test_slices.py` | 3 | 0 | nightly | CI, deploy and live tooling: nightly |
| engine | `tests/test_sorting.py` | 9 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_spec.py` | 13 | 0 | nightly | CI, deploy and live tooling: nightly |
| engine | `tests/test_speech.py` | 6 | 0 | nightly | voice notes: nightly |
| engine | `tests/test_spine_page.py` | 8 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_spine_provenance.py` | 5 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_staff.py` | 6 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_staff_grants.py` | 9 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_staff_load.py` | 10 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_staff_remove.py` | 7 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_staff_sees_sheet_same_answers.py` | 2 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_states_and_subject.py` | 6 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_stencil.py` | 5 | 0 | nightly | paper reading detail (one happy path is core): nightly |
| engine | `tests/test_story_cases.py` | 3 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_story_keys.py` | 8 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_story_ranges.py` | 48 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_story_shape.py` | 13 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_story_shape_times.py` | 15 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_subject_looks_migration.py` | 3 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_subject_map.py` | 12 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_table_budget.py` | 2 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_taught_per_class.py` | 6 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_taxonomy.py` | 585 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_taxonomy_predictors.py` | 11 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| engine | `tests/test_test_database.py` | 2 | 2 | core | guards a core harm |
| engine | `tests/test_test_ids.py` | 1 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_the_loop.py` | 156 | 1 | core (part) | guards a core harm; the other 155 nightly |
| engine | `tests/test_timetable_dates.py` | 14 | 0 | nightly | timetable detail beyond the core rules: nightly |
| engine | `tests/test_timetable_go_live.py` | 9 | 0 | nightly | timetable detail beyond the core rules: nightly |
| engine | `tests/test_timetable_run_command.py` | 16 | 0 | nightly | timetable detail beyond the core rules: nightly |
| engine | `tests/test_today_school.py` | 9 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_topics.py` | 9 | 0 | nightly | curriculum mapping and skills: nightly |
| engine | `tests/test_tt_clash.py` | 8 | 2 | core (part) | guards a core harm; the other 6 nightly |
| engine | `tests/test_tt_delayed.py` | 7 | 0 | nightly | timetable detail beyond the core rules: nightly |
| engine | `tests/test_tt_edit.py` | 13 | 0 | nightly | timetable detail beyond the core rules: nightly |
| engine | `tests/test_tt_heads.py` | 16 | 0 | nightly | timetable detail beyond the core rules: nightly |
| engine | `tests/test_tt_move.py` | 17 | 1 | core (part) | guards a core harm; the other 16 nightly |
| engine | `tests/test_tt_need.py` | 6 | 0 | nightly | timetable detail beyond the core rules: nightly |
| engine | `tests/test_tt_rules.py` | 22 | 1 | core (part) | guards a core harm; the other 21 nightly |
| engine | `tests/test_tt_time.py` | 14 | 0 | nightly | timetable detail beyond the core rules: nightly |
| engine | `tests/test_types.py` | 3 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_unclassified.py` | 3 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_update_live.py` | 2 | 0 | nightly | CI, deploy and live tooling: nightly |
| engine | `tests/test_upload.py` | 6 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_ux_rules.py` | 7 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_verify.py` | 40 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_vocabulary.py` | 4 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_voice_check.py` | 7 | 0 | nightly | voice notes: nightly |
| engine | `tests/test_voice_class_notes.py` | 8 | 0 | nightly | voice notes: nightly |
| engine | `tests/test_voice_confirm.py` | 18 | 0 | nightly | voice notes: nightly |
| engine | `tests/test_voice_day.py` | 3 | 0 | nightly | voice notes: nightly |
| engine | `tests/test_voice_form_from_lesson.py` | 4 | 0 | nightly | voice notes: nightly |
| engine | `tests/test_voice_intake.py` | 7 | 0 | nightly | voice notes: nightly |
| engine | `tests/test_voice_note.py` | 67 | 0 | nightly | voice notes: nightly |
| engine | `tests/test_voice_switch.py` | 5 | 0 | nightly | voice notes: nightly |
| engine | `tests/test_voice_tables.py` | 10 | 1 | core (part) | guards a core harm; the other 9 nightly |
| engine | `tests/test_watch.py` | 8 | 0 | nightly | CI, deploy and live tooling: nightly |
| engine | `tests/test_web_gate.py` | 6 | 6 | core | guards a core harm |
| engine | `tests/test_web_identity.py` | 3 | 3 | core | guards a core harm |
| engine | `tests/test_week.py` | 13 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_week_note.py` | 6 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_who.py` | 3 | 0 | nightly | behaviour test, not a core harm: nightly |
| engine | `tests/test_who_sees.py` | 5 | 2 | core (part) | guards a core harm; the other 3 nightly |
| engine | `tests/test_whose_paper.py` | 11 | 0 | nightly | paper reading detail (one happy path is core): nightly |
| browser | `../e2e/sign-in-and-open.spec.ts` | 1 | 0 | nightly | behaviour test, not a core harm: nightly |
| browser | `e0-english.spec.ts` | 2 | 0 | nightly | English bank: nightly |
| browser | `e2e.spec.ts` | 12 | 2 | core (part) | guards a core harm; the other 10 nightly |
| browser | `gate-password.spec.ts` | 10 | 4 | core (part) | guards a core harm; the other 6 nightly |
| browser | `gate.spec.ts` | 12 | 11 | core (part) | guards a core harm; the other 1 nightly |
| browser | `m1-04-k2-voice-notes.spec.ts` | 10 | 0 | nightly | K2 pages, drafting and checking: nightly |
| browser | `m1-09-activity.spec.ts` | 4 | 0 | nightly | behaviour test, not a core harm: nightly |
| browser | `m1-09-calendar.spec.ts` | 7 | 0 | nightly | behaviour test, not a core harm: nightly |
| browser | `m1-09-materials.spec.ts` | 5 | 0 | nightly | materials lists: nightly |
| browser | `m1-09-tokens.spec.ts` | 7 | 0 | nightly | behaviour test, not a core harm: nightly |
| browser | `m1-13-curriculum-fill.spec.ts` | 8 | 0 | nightly | K2 pages, drafting and checking: nightly |
| browser | `m1-13c-page-part.spec.ts` | 4 | 0 | nightly | K2 pages, drafting and checking: nightly |
| browser | `m1-14a-timetable-rules.spec.ts` | 6 | 0 | nightly | timetable detail beyond the core rules: nightly |
| browser | `m2-make-papers.spec.ts` | 5 | 1 | core (part) | guards a core harm; the other 4 nightly |
| browser | `m4-the-maker.spec.ts` | 5 | 0 | nightly | behaviour test, not a core harm: nightly |
| browser | `m5-every-kind-draws.spec.ts` | 1 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| browser | `p2-website-errors.spec.ts` | 1 | 1 | core | guards a core harm |
| browser | `p3-the-engine-restarting.spec.ts` | 3 | 0 | nightly | behaviour test, not a core harm: nightly |
| browser | `p4-preview-before-print.spec.ts` | 3 | 1 | core (part) | guards a core harm; the other 2 nightly |
| browser | `p5-ci-retries-once.spec.ts` | 2 | 0 | nightly | behaviour test, not a core harm: nightly |
| browser | `p55-forgot-tells-the-truth.spec.ts` | 3 | 0 | nightly | behaviour test, not a core harm: nightly |
| browser | `p55-reads-the-bank-once.spec.ts` | 4 | 0 | nightly | behaviour test, not a core harm: nightly |
| browser | `p6-check-is-quick.spec.ts` | 3 | 0 | nightly | behaviour test, not a core harm: nightly |
| browser | `p61-board-cards.spec.ts` | 6 | 0 | nightly | behaviour test, not a core harm: nightly |
| browser | `p62-check-one-flow.spec.ts` | 6 | 0 | nightly | behaviour test, not a core harm: nightly |
| browser | `p63-today-in-blocks.spec.ts` | 6 | 0 | nightly | behaviour test, not a core harm: nightly |
| browser | `s1-site-answers.spec.ts` | 4 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| browser | `s11-focus-paper.spec.ts` | 2 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| browser | `s12-worksheets-by-taxonomy.spec.ts` | 3 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| browser | `s2-skill-map.spec.ts` | 6 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| browser | `s28-grade-1-as-taught.spec.ts` | 1 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| browser | `s29-multiplication-models.spec.ts` | 1 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| browser | `s3-worksheets.spec.ts` | 6 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| browser | `s30-multiplication-methods.spec.ts` | 1 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| browser | `s31-straight-division.spec.ts` | 1 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| browser | `s32-facts-advance.spec.ts` | 1 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| browser | `s33-divide-advance.spec.ts` | 2 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| browser | `s34-division-models.spec.ts` | 1 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| browser | `s35-division-methods.spec.ts` | 1 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| browser | `s36-mental-methods.spec.ts` | 1 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| browser | `s37-estimates.spec.ts` | 1 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| browser | `s38-equality.spec.ts` | 1 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| browser | `s39-multiples.spec.ts` | 1 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| browser | `s4-validation-queue.spec.ts` | 15 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| browser | `s40-stories.spec.ts` | 1 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| browser | `s41-subject-class-and-today.spec.ts` | 4 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| browser | `s42-the-assessment-card.spec.ts` | 6 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| browser | `s43-across-classes.spec.ts` | 4 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| browser | `s5-question-bank.spec.ts` | 3 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| browser | `s7-paper-from-library.spec.ts` | 9 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| browser | `s8-taxonomy.spec.ts` | 4 | 0 | nightly | many-variant maths cases (levels, methods, stories): nightly |
| browser | `screens.spec.ts` | 16 | 1 | core (part) | guards a core harm; the other 15 nightly |
| browser | `u1-today.spec.ts` | 4 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u10-tables-read-straight.spec.ts` | 3 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u100-activity-page.spec.ts` | 8 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u101-timetable-one-place.spec.ts` | 9 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u102-delayed-lessons.spec.ts` | 5 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u103-voice-note-from-the-lesson.spec.ts` | 4 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u104-curriculum-objectives.spec.ts` | 7 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u11-colours-said.spec.ts` | 4 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u12-curriculum-table.spec.ts` | 3 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u12-outside-the-bar.spec.ts` | 13 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u13-frame.spec.ts` | 10 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u13-needs-you.spec.ts` | 4 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u13-route-walk.spec.ts` | 2 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u14-the-queue-shrinks.spec.ts` | 2 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u14-ui-tokens.spec.ts` | 2 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u15-menu-and-today.spec.ts` | 4 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u16-assessments.spec.ts` | 4 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u17-curriculum.spec.ts` | 5 | 1 | core (part) | guards a core harm; the other 4 nightly |
| browser | `u18-staff-and-search.spec.ts` | 2 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u19-whole-curriculum.spec.ts` | 2 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u2-children.spec.ts` | 8 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u20-child-by-topic.spec.ts` | 3 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u21-class-by-topic.spec.ts` | 2 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u22-assessments-readable.spec.ts` | 1 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u23-approve-filtered.spec.ts` | 2 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u24-no-long-lists.spec.ts` | 4 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u25-each-educator-has-classes.spec.ts` | 2 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u26-my-classes-first.spec.ts` | 3 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u27-who-decides-what.spec.ts` | 3 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u28-approved-per-level.spec.ts` | 2 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u29-a-grade-uses-its-levels.spec.ts` | 1 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u3-marking.spec.ts` | 3 | 1 | core (part) | guards a core harm; the other 2 nightly |
| browser | `u30-taught-per-class.spec.ts` | 3 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u31-topics-are-operations.spec.ts` | 2 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u32-who-sees-what.spec.ts` | 4 | 1 | core (part) | guards a core harm; the other 3 nightly |
| browser | `u33-one-count.spec.ts` | 2 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u34-grades-from-the-table.spec.ts` | 2 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u35-children-grouped.spec.ts` | 3 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u36-class-and-child.spec.ts` | 4 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u37-papers-grouped.spec.ts` | 4 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u38-make-and-marking.spec.ts` | 5 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u39-maker-line.spec.ts` | 2 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u40-taught-said-on-its-row.spec.ts` | 2 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u41-what-a-scan-lacks.spec.ts` | 2 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u42-curriculum-for-the-educator.spec.ts` | 4 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u43-phone-and-words.spec.ts` | 6 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u44-numbers-true.spec.ts` | 6 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u44-upload-on-marking.spec.ts` | 1 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u45-papers-named.spec.ts` | 5 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u46-one-word.spec.ts` | 4 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u47-phone-and-one-action.spec.ts` | 4 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u48-no-guessed-pages.spec.ts` | 2 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u49-one-role.spec.ts` | 20 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u5-curriculum.spec.ts` | 4 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u50-declutter.spec.ts` | 4 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u50-the-picture-is-the-question.spec.ts` | 6 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u51-read-an-uploaded-file-again.spec.ts` | 1 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u51-ux-rules.spec.ts` | 8 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u52-curriculum-table.spec.ts` | 3 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u52-one-copy-one-answer.spec.ts` | 4 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u52-taught-this-week.spec.ts` | 2 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u53-skill-name-opens-the-skill.spec.ts` | 3 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u53-staff-and-school.spec.ts` | 1 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u53-the-menu.spec.ts` | 3 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u54-skill-shows-its-samples.spec.ts` | 3 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u55-edit-samples-and-kinds.spec.ts` | 5 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u6-report-card.spec.ts` | 5 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u60-ui-wave-1-flow.spec.ts` | 10 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u61-page-two-is-not-page-one.spec.ts` | 3 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u62-assessment-steps.spec.ts` | 13 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u62-scope-and-todo-logic.spec.ts` | 12 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u64-a-file-read-again-is-one-line.spec.ts` | 2 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u64-stop-a-kind.spec.ts` | 1 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u64-what-needs-doing-groups.spec.ts` | 7 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u65-more-like-this.spec.ts` | 1 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u65-what-needs-doing-walk.spec.ts` | 6 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u66-levels-to-review.spec.ts` | 4 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u68-who-sees-answers.spec.ts` | 4 | 2 | core (part) | guards a core harm; the other 2 nightly |
| browser | `u7-parent-report.spec.ts` | 5 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u70-feedback-rules.spec.ts` | 5 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u70-move-a-child.spec.ts` | 6 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u70-report-a-problem.spec.ts` | 6 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u71-results-by-topic.spec.ts` | 7 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u71-results-numbers.spec.ts` | 4 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u72-children.spec.ts` | 17 | 2 | core (part) | guards a core harm; the other 15 nightly |
| browser | `u72-the-week-is-the-schools.spec.ts` | 2 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u73-assessments.spec.ts` | 8 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u73-child-answers.spec.ts` | 1 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u73-coordinator-pages.spec.ts` | 10 | 2 | core (part) | guards a core harm; the other 8 nightly |
| browser | `u73-level-words.spec.ts` | 3 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u73-skill-set.spec.ts` | 2 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u73-teaching-pages.spec.ts` | 18 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u74-class-views.spec.ts` | 3 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u74-materials.spec.ts` | 8 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u74-reports.spec.ts` | 9 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u74-setup-content.spec.ts` | 17 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u74-staff-grants.spec.ts` | 8 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u74-timetable.spec.ts` | 19 | 4 | core (part) | guards a core harm; the other 15 nightly |
| browser | `u75-assessments-list.spec.ts` | 6 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u75-children-rulings.spec.ts` | 3 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u75-setup-nav.spec.ts` | 2 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u75-timetable-b.spec.ts` | 7 | 0 | nightly | timetable detail beyond the core rules: nightly |
| browser | `u75-today.spec.ts` | 9 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u76-assessment-controls.spec.ts` | 4 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u76-edit-a-paper.spec.ts` | 2 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u76-no-paper-and-spares.spec.ts` | 5 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u76-notes-loop.spec.ts` | 9 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u76-period.spec.ts` | 6 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u76-timetable-steps.spec.ts` | 5 | 0 | nightly | timetable detail beyond the core rules: nightly |
| browser | `u76-today-school.spec.ts` | 6 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u77-go-live.spec.ts` | 3 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u77-paper-tools.spec.ts` | 3 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u77-staff-classes-setup.spec.ts` | 3 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u78-timetable-fit.spec.ts` | 3 | 0 | nightly | timetable detail beyond the core rules: nightly |
| browser | `u78-whose-paper.spec.ts` | 6 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u79-checking-by-assessment.spec.ts` | 3 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u8-children-table.spec.ts` | 1 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u80-timetable-all-fortnights.spec.ts` | 6 | 0 | nightly | timetable detail beyond the core rules: nightly |
| browser | `u81-assessments-list.spec.ts` | 7 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u81-full-width.spec.ts` | 6 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u82-timetable-as-live-is.spec.ts` | 2 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u82-today-loads.spec.ts` | 11 | 2 | core (part) | guards a core harm; the other 9 nightly |
| browser | `u84-charter-a.spec.ts` | 11 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u85-lesson-page.spec.ts` | 5 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u86-lesson-page.spec.ts` | 10 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u87-assessments-board.spec.ts` | 9 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u87-class-picture.spec.ts` | 6 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u87-timetable-page.spec.ts` | 7 | 0 | nightly | timetable detail beyond the core rules: nightly |
| browser | `u9-papers.spec.ts` | 1 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u90-today-charter.spec.ts` | 12 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u93-time-by-subject.spec.ts` | 9 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u94-curriculum-workspace.spec.ts` | 4 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u94-machine-origin.spec.ts` | 4 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u94-question-bank-workspace.spec.ts` | 4 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u94-skills-to-approve-workspace.spec.ts` | 4 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u94-staff-classes-workspace.spec.ts` | 5 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u95-notes-workspace.spec.ts` | 7 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u95-record-on-the-lesson.spec.ts` | 8 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u95-to-approve.spec.ts` | 6 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u96-across-dashboard.spec.ts` | 4 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u96-assessment-full-page.spec.ts` | 3 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u96-parent-reports-workspace.spec.ts` | 4 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u96-today-needs-doing.spec.ts` | 6 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u98-fortnight-panel.spec.ts` | 5 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `u99-materials-workspace.spec.ts` | 6 | 0 | nightly | page behaviour beyond its smoke test: nightly |
| browser | `workflows.spec.ts` | 3 | 0 | nightly | behaviour test, not a core harm: nightly |
| browser | `u14-ui-primitives.spec.ts` | 2 | 0 | delete | old screenshot baseline |
| browser | `u70-inventory-curriculum.spec.ts` | 6 | 0 | delete | freezes an old page look (screen inventory) |
| browser | `u70-inventory-outside.spec.ts` | 12 | 0 | delete | freezes an old page look (screen inventory) |
| browser | `u70-inventory-proof.spec.ts` | 19 | 0 | delete | freezes an old page look (screen inventory) |
| browser | `u70-inventory-question-bank.spec.ts` | 8 | 0 | delete | freezes an old page look (screen inventory) |
| browser | `u70-inventory-school.spec.ts` | 14 | 0 | delete | freezes an old page look (screen inventory) |
| browser | `u70-inventory-today.spec.ts` | 4 | 0 | delete | freezes an old page look (screen inventory) |
| browser | `u70-inventory.spec.ts` | 2 | 0 | delete | freezes an old page look (screen inventory) |
| browser | `u71-blocks.spec.ts` | 19 | 0 | delete | old screenshot baseline |
| browser | `u76-children-wireframe.spec.ts` | 5 | 0 | delete | wireframe-structure check |
| browser | `u77-picture-child-wireframe.spec.ts` | 1 | 0 | delete | wireframe-structure check |
| browser | `u79-timetable-wireframes.spec.ts` | 6 | 0 | delete | wireframe-structure check |
| browser | `u70-inventory-children.spec.ts` | 0 | 0 | delete | freezes an old page look (screen inventory) |
| browser | `u70-inventory-timetable.spec.ts` | 0 | 0 | delete | freezes an old page look (screen inventory) |
