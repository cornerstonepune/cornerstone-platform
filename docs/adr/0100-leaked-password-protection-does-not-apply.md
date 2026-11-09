# 0100 — Leaked-password protection does not apply: sign-in is the site's own, not Supabase Auth's

Goal: none — proved by the Athena scope CP-5 (specs/CP-5, item 3), not by a goal file

Nimish, decided 2026-11-08 (CP-5). The Supabase security advisor reports "leaked password protection" as off. That is a
Supabase Auth setting: it checks a password against a list of known-leaked ones when someone signs up or changes their
password through Supabase Auth.

## Decided

- **Leaked-password protection does not apply to this project, and the advisor finding is accepted as not applicable.**
- **Why:** sign-in is the site's own. Passwords are set, asked for and checked by the application's tables
  (`password_link`, `password_ask`, `sign_in_failure`), never by Supabase Auth. Nothing in the repository reads Supabase
  Auth's user table, or calls its user or admin endpoints; a test (`specs/CP-5/proofs/auth_unused.py`) lists the
  tracked files and fails if one does. With no Supabase Auth user, the setting protects nobody.
- **Not decided here:** checking our own passwords against leaked lists. That is a separate, larger piece of work and
  stays out of CP-5.

## If this changes

If a later scope signs people in through Supabase Auth, switch the dashboard setting on in the same change and replace
this record.
