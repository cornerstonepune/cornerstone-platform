# Adoption survey: state, gaps, risks (2026-11-23)

Read-only survey made for `loop-adopt`. Live counts are Postgres row estimates (`pg_stat_user_tables`) read on 23 Nov. This is input for PROJECT.md §5, not a verdict: check anything before relying on it.

**Bad news first:** the full nightly suite has failed six nights in a row (18–23 Nov). On live, the nightly rebuild of the children's skill graph has never succeeded (#557). No paper has been captured since 30 Oct.

## Works today (M-done)
The map has four workflows: W1 = N1–N2, W2 = N4–N7, W3 = N3 and N8–N10, W4 = N11–N12 (class card and home sheet, then reports and planning).
- **W1 N1, skills:** 155 live. Verified by `test_graph_rule.py` (core).
- **W1 N2, question bank:** ~51,600 items live. Verified by `test_bank_fills.py` and `test_card_bank.py` (nightly, not core).
- **W2 N4, timetable** (CP-74 and CP-75, #874–#880): engine verified by `test_tt_fill.py`. Browser tests `u112` and `u113` fail nightly.
- **W2 N6, worksheets and packs:** unverified. `s3-worksheets` fails nightly.
- **W3 N3 and N8, capture:** 1,066 captures live, the newest on 30 Oct. Verified by `test_read_eval.py` and `test_whose_paper.py`.
- **W3 N9, checking and sign-off** (#886, #887): unverified. `s4-validation-queue`, `u73-assessments` and `u77-paper-tools` fail nightly.
- **W3 N10, evidence and graph:** 1,862 evidence rows live, the newest on 18 Nov. Rules verified in core (`test_evidence_every_kind.py`). The graph is not rebuilt on live (#557).
- **W4 N11 and N12, class card and parent report:** `test_class_card.py`, `test_parent_report.py` and `test_parent_review.py` pass nightly. Live use is unverified.
- **K2 voice notes and marking by tap** (CP-10, CP-88 #914): verified by `test_voice_*` and `u128`.
- **Curriculum:** ~3,915 activities and ~3,427 objectives live. Detail pages (#915) verified by `u129`. `m1-13-curriculum-fill` fails nightly.
- **Money: claims, approve, pay, rules** (CP-76 to CP-80): verified by `test_money_*` (not core). `expense` has 0 live rows, so the CP-81 import has not been run on live.
- **Materials** (CP-82 to CP-86, #905–#912): verified by `test_stock*`, `test_catalogue*` and `test_materials_alt`. `stock_move` has 0 live rows.
- **Sign-in, roles, PII, spend caps:** core (`test_roles`, `test_people`, `test_password_rules`, `test_llm_budget*`).
- **Deploys:** migrate, deploy-engine and CI on main were all green on 19 Nov (#915). watch-live is green, but it reports problems in an issue rather than by failing (#557).

## In flight
No open PRs except #920. Nothing has merged since #915 (19 Nov). Paid generation has been paused since 18 Nov (`docs/notes/CP-54-handover-backend7.md`). `docs/notes/money-and-materials-status.md` is stale: CP-85 and CP-86 merged in #910.

## Gaps
- **Nightly red** (#885, #888, #916–#919; run 45093926102).
  - Engine: 7 failing — `test_bars`, `test_gates` (browser skip), `test_settings`, `test_states_and_subject`, `test_materials_list` (a dirty test database), and 2 in `test_k2_upload`.
  - Browser: 35 failing across 29 specs, including `u49-one-role`, `u12-outside-the-bar`, `s1-site-answers`, `u73-level-words`, `m1-09-calendar` and `screens.spec`. Not diagnosed: they may be stale tests or real breaks.
  - Proofs since 20 Nov: `expense` and `stock_move` have no owner in `data_register.json` or `workflows.json`.
- **Half-built:**
  - Money slices G–L are not started (floats MM-4, event budget MM-7 / CP-87 #909). MM-0 to MM-4 and MM-7 are wanted live by 31 Dec, and the Sports Day budget by 1 Dec.
  - CP-54 objective matcher: recall 0.351 against a bar of 0.80, paused.
  - Detail pages have no "Approve & next".
- **Issues:** #605 (sheet list slow), #603, #584 (known reds merged past), #811 (CP-65, one design system and navigation), #568 (retire the old assessment pages), #515 (CP-26 Cloudflare), #530, #522, #521, #518. Stale ones that could be closed: #592, #638, #688, #591, #442.
- **Missing tests on risky parts:** money approve and pay are not in core; the browser role test u49 is red; the data-register proof is red.

## Risks (for the founder)
1. The children's skill picture on live may be stale: the nightly graph rebuild has never run on live (#557), and class cards and reports read it.
2. Regressions are invisible: six red nights in a row hide any new break.
3. The marking screens aren't proven: the right / wrong / blank chips and the checking queue fail nightly, and that's the path to parents.
4. Role boundaries aren't proven in the browser (u49, u73-level-words). The engine roles tests pass.
5. Money is dated but not loaded: 0 live rows, no data owner for the two tables, and the 31 Dec and 1 Dec dates are not yet built.

## Proposed milestones (from issues and notes)
- **M1 Nightly green:** nightly suite and proofs both succeed; `expense` and `stock_move` have owners; `test_materials_list` passes on a used test database.
- **M2 Live graph nightly (#557):** a `graph_nightly` run on live in the last 26 h; watch-live fails when it's missing.
- **M3 Money live for December:** 1,301 earlier claims on live; a float balance and month close (MM-4); a Sports Day budget checked before spend (CP-87).
- **M4 Materials on live:** catalogue > 0 items; "collected" lowers stock; the buy list is right against real rows.
- **M5 Marking path proven:** `u73-assessments`, `s4-validation-queue` and `u77` pass; a paper captured on live after 30 Oct is read end to end.
