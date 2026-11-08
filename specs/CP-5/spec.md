# CP-5: Database hygiene

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/453 (locked by Nimish, 8 Nov 2026; items 3 and 4 settled by him the same day)

### What

Fixes the three security findings from the reconciliation: 35 database functions can be misled by a changed search path, leaked-password protection is reported off, and an old plan document (and two other files) still hold the live project's address.

### Done when

1. Every database function in the application schemas has a fixed search path. (LIVE: Supabase advisor reports 0 `function_search_path_mutable` warnings.)
2. A test fails if a function is added without a fixed search path. (Test.)
3. A recorded decision says leaked-password protection does not apply, because Supabase Auth is not used for sign-in, and nothing in the repository reads Supabase Auth's user table. (Test.)
4. The live project reference appears in no tracked file, `STATE.md` included (the one-line scrub is allowed). (Test over the list of tracked files.)
5. The engine's full test suite and the web speed tests pass unchanged, and each changed function is called once in a rolled-back transaction with no error.

### Out of scope

Unused indexes and missing foreign-key indexes (not urgent at today's size). Access rules (CP-3, CP-4). Checking our own passwords against leaked lists.
