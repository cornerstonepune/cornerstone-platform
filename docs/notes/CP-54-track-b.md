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
