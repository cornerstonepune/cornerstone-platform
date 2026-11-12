# CP-34: staff_sees_sheet cheaper, same answers (#605)

## Verified
- Probe, local copy, 2,000 sheets tied to children and scans, rolled back: coordinator 60 ms; educator old body 440-520 ms; new body 35 ms; 0 sheets answered differently. The issue's "8 s" was measured on CI's copy and is not reproduced here (unverified there).
- `pytest tests/test_staff_sees_sheet_same_answers.py tests/test_rules.py tests/test_table_budget.py tests/test_data_register.py tests/test_layout.py tests/test_types.py`: 24 passed. Existing `test_who_sees`, `test_roles`, `test_grants_one_source`, `test_db_privileges`: 22 passed.
- The comparison test fails when the new function is broken three ways (enrolment choice, uploader check, subject check).

## Handoff
- Migration `20270126130000` must follow #659's `20270126120000`; it is live-affecting (function body only). Needs Nimish's own word in the merging session, then the normal pipeline.
- After live: read-only check that the function exists with `security definer` and 81 tables.
