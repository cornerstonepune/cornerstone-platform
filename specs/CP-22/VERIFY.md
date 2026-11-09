VERDICT: PASS

# CP-22 verification (final), PR #513, head fc312da against origin/main b1d3f0d

Independent athena-verifier, reading through git refs. A first pass at 2109377 found every Done-when MET except criterion 8, which failed only because the locked helper ins() left CP-11's solve_seconds at 0 (CP-11 requires > 0). The product code was correct. Nimish then typed UNLOCK CP-22.

## Since the first pass
- The only change to a locked file is one line in proofs/test_8_trial_and_loader.py: `ins(..., draft="[]")` became `draft="[]", solve_seconds=1`. spec.md, checks.sh and every other proof are byte-identical. All assertions of proof 8 are unchanged, so it is not weakened.
- The LOCK digest recomputed from the git tree equals LOCK (98aad84f…c9d1).
- Rule 10 is fixed: the copied staff lookup is deleted, and cli_timetable.py reuses w1_bank/cli_map.staff_of through a hand-over declared in workflows.json.
- specs/CP-1/RUN.json and specs/CP-6/RUN.json equal main's bytes. Main's specs/CP-21 is untouched. The diff against main touches only specs/CP-22 under specs/.

## Done-when
1–7: MET (unchanged product code, apart from the Rule 10 reuse). 8: MET off the box. RUN.json shows 8 of 8 passing at 07:45:58, after the merge of main. The LIVE part of 8 is a box-only trial run, after deploy.

## Migration
20270125160000_a_draft_goes_live.sql sorts after main's 141000 and CP-7's 150000. The merged tree has no duplicate prefix. It is safe to run twice, and its SECURITY DEFINER functions set search_path.

## Risks
The go-live group is the setting timetable.go_live_group, defaulting to "everything" (seven roles). No secrets or personal data.

Not run by the verifier: `athena done CP-22`, the pytest proofs, the box proof.

VERDICT: PASS
