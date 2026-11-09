VERDICT: PASS

# CP-7 verification (PR #511), head 9085931 against origin/main e7398d4

Independent athena-verifier, reading through git refs only. There were two passes. The first, at b01827b, was a FAIL on four points. All four are fixed at 9085931:
1. Who is asking: internal.fortnight_is_approver reads internal.resolve_staff(), exactly as CP-3's my_reach does (20270120100000:223-227). The who stamps use resolve_staff() too.
2. Which day counts: "today" is internal.school_day(tenant, now()), and valid_to is exclusive, matching CP-3's lines 224-226.
3. internal.fortnight_plan_no_delete() sets its search_path.
4. Days the campus marks holiday get no lines (decided by the orchestrator, matching k2_day.py:64 and CP-6's step_date). The draft and both "unchanged" checks read the same lines.

The new tests use distinct ids. A sign-in id that differs from staff.id is accepted for the coordinator and refused for the raw staff id and for the teacher; the old join would fail this. A grant ending today does not approve. A holiday removes its lines.

## Done-when
1–8: MET. RUN.json at 9085931 shows 8 passed and 0 failed. Items 2–5, 7 and 8 are unchanged from the first pass's findings.
9: box-only LIVE proof, run after deploy.

Since b01827b, 4 files changed: the migration fixes, the new test file, docs/notes/CP-7.md and RUN.json. Nothing else.
The LOCK digest, recomputed, equals specs/CP-7/LOCK (ba2ade06…692e).

Unasked work: none of substance. The trigger together with the function is required by locked proof 6. Adding fortnight_approve to test_roles is required by the locked proofs, and the exact-equality check stays.
Missing: nothing.

Risks: every function involved is SECURITY DEFINER with a fixed search_path. Approval is limited to active, signed-in staff in the right group. No secrets or real data. A fortnight that is entirely holiday is refused as "no timetable". The engine test imports the proofs' fixture, so retiring CP-7 later would need that test moved.

VERDICT: PASS
