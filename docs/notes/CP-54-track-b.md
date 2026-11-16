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

## B2 — the skill frame and the ten skills (16 Nov)

- A skill is a folder under `supabase/seed/skills/<name>/`: SKILL.md (the standard, for people), contract.json, lists.json
  (the words the code rules read), gold.json, planted_bad_gold.json, smoke.json, and gold_coordinators.json for Maya and
  Akanksha to fill (about 30 cases each, same form). `core/skill_spec.py` turns each into two prompt rows,
  `skill.<name>` and `skill.<name>.validate`, made from the standard and `_frame/`; `engine/skills/` holds the two machines
  (WRITE, CHOOSE) and the code rules. Writers are Sonnet-class, choosers Haiku, every validator Opus-class.
- All twenty rows load inactive. A skill goes active only after `engine skill eval` meets its bars (rows
  `eval.skill.<name>.*`, set before any run: gold 0.70, clean 0.80, catch 0.75, smoke 0.80, not_worse 1), recorded in
  DECISIONS-LOG.md. `planted_bad_gold.json` is named so because the school-words check lets `*_gold.json` hold the wording
  a validator must catch.
- `engine skill list`, `engine skill map` (old purpose → skill, none retired yet), `engine skill eval <name|all> [--estimate]`.
  Server runs: `curriculum run` → `skill_forecast` (no call) and `skill_eval`. Forecast for all ten: about ₹680 (≈ $8).
  The cp-54 campaign (cap $100, stop $99) is in `llm.campaigns`.
- Not sourced from real data (the agents' own words, to be replaced): K2 has no learning objectives in the database;
  `material_item` is empty so the catalogue in activity and materials gold is written; placement's option codes
  (`subject:english`, `part:english`, `routine:circle-time`, `character:curiosity`) are invented and only 18 of the 22
  K2 labels exist in the data; capability-link gold uses the old eight capabilities until the groups of B3 are loaded;
  question has no K2 or G2 English misconceptions to draw on.
- Not yet scored: no model key in the build container, so no skill has a recorded score, and none is active.
