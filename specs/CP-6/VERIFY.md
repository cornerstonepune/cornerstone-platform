VERDICT: PASS

# CP-6 verification (PR #504), head 6ed1221 against origin/main

Independent athena-verifier, read-only through git refs. Two passes: a full one at fe8d4fd, and a delta check at 6ed1221.

## Criteria
- Done-when 1, 3, 4, 5, 6: MET. Traced at fe8d4fd; their code and proofs did not change after it. RUN.json at 6ed1221 records proofs 1–6 passed (2026-11-09T05:17:22Z).
- Done-when 2: MET. Step dates are fortnight.* settings per school: freeze 19, align 16, approve 13 and list_sent 10 days before the fortnight starts. These are D-072 (teacher-os blueprint/decisions.md:85) converted faithfully: frozen 12th, aligned 15th, approved 18th, list 21st, with a 30-day previous month. A holiday or weekend moves the date to the working day before (proof 2).
- Done-when 7: LIVE, box only. It runs on the production box after deploy.

## Findings closed since the first pass (349fb1c)
- A: rules.json regenerated, +13 entries matching the migration exactly.
- B: the loader writes a fortnight_cycle row with each fortnight it creates, and new schools get the four settings by an AFTER INSERT trigger on tenant.
- C: the loader's freeze gate checks only fortnights that received a new plan line.
- workflows.json names fortnight_cycle and fortnight_edit, so CP-1 proof 6 has no unowned table.

## Lock
LOCK digest 65d235a8…c9eb recomputed from the 6ed1221 blobs: it matches. No locked file changed after the scope commit 2c3b862.

## Unasked work
None of substance. The frozen_reason route field, the --reason CLI flag, the fortnights_touched helper and the map entry are the wiring the design asked for.

## Open, not gating (lean design)
- The engine role keeps default DELETE on the new tables. Append-only is not claimed.
- A website fixed-slot change in a frozen fortnight gets a 409 and has no field to send a reason. This stays dormant until CP-7 or CP-12 moves a fortnight.
- k2_day.week reads frozen for the Monday only. The website text in words.ts still says "month". Screens are out of scope.
- 19-day lead times per fortnight mean a fortnight freezes while the one two before it runs. These are settings and can be changed.

## Risks
The migration sorts after main's newest. It only adds things and can run twice. The SECURITY DEFINER functions set search_path and live in internal. No names, secrets or child data.

The verifier did not run the tests itself. The builder's local numbers: athena done CP-6 PASS, athena done CP-1 PASS, bin/check 34, 96 + 294 targeted tests passed. CI must be green before merge.

VERDICT: PASS
