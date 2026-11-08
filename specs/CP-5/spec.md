# CP-5: Database hygiene

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/453 (DRAFT, not locked)

### What

Fixes the three security warnings found by the reconciliation: 35 database functions can be misled by a changed search path, leaked-password protection is off, and an old plan document still holds the live project's address.

### Done when

1. Every database function in the application schemas has a fixed search path. (LIVE: Supabase advisor reports 0 `function_search_path_mutable` warnings.)
2. A migration test fails if a new function is added without a fixed search path. (Test.)
3. Leaked-password protection is on. (LIVE, read from the project's auth settings; if the plan does not allow it, the reason is recorded as a decision and this line is replaced by Nimish before locking.)
4. The live project address appears nowhere in the repository's tracked files. (Test: search.)
5. Every existing function still returns the same result for a fixed set of sample inputs. (Test: before-and-after on the test database.)
6. The engine's full test suite and the web speed tests pass unchanged.

### Out of scope

Unused indexes and missing foreign-key indexes (not urgent at today's size). Access rules (CP-3, CP-4).
