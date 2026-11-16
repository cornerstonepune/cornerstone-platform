# CP-54 track B — notes

## B1 — Cambridge's words into the private database (16 Nov)

- One reader, `engine/core/cambridge.py` (moved from `research/crosswalk_cambridge.py`, which now imports it; the
  tracked index in `docs/crosswalk/statements` is byte-identical). Words are never written to git, a log or the screen.
- `engine frameworks cambridge-words [--apply]` fills a statement's words only where `sha256(words)` equals the stored
  fingerprint; non-matching codes are listed, never filled. Local run against the real PDFs: 1,190 of 1,190.
- Root-cause fix found on the way: `frameworks.load` would have blanked the words on the next `engine load` (the files
  carry text NULL). A load now keeps held words while the fingerprint is unchanged (`tests/test_cambridge_words.py`).
- Server path: the engine container does not hold `docs/`; `deploy/compose.server.yml` now mounts `docs/crosswalk` and
  `docs/spine` read-only, and the `curriculum run` workflow has a fixed run `frameworks` (= `engine frameworks load`,
  then `cambridge-words --apply`; spends nothing). The PDFs are downloaded once into the server's `data/` folder.
- Live state on 16 Nov: `framework_statement` does not exist on production yet (migration 20270129090000 not deployed),
  so the run waits for that deploy.

## B3 — the capability profile in the chosen shape, in Cornerstone's words (16 Nov)

- `supabase/seed/profile.json`, loaded by `core/frameworks.py` into rows of framework CS-PROFILE (no schema change):
  2 levels (Foundational K2–G2, Preparatory G3–G4), 8 capabilities each with a one-line definition, 24 groups each with
  one "I can…" sentence and that sentence at each stage, and the words each group is evidence of (`items`).
- The first eight capabilities stay as rows; each is named by exactly one new capability's `supersedes`.
- Kept from the school's own profile: Learning & agency (where "unafraid" lives: "Trying, asking and keeping going") and
  checking AI before trusting it ("Checking before I trust").
- Words: capable 16 groups, unafraid 9, kind 7 (every group at least one; every word at least three).
- Not found in the repo: the other school's document. Their shape is taken from the brief only; none of their names
  or wording is used. Nimish and the coordinators should read the 24 groups and the 48 stage sentences.
