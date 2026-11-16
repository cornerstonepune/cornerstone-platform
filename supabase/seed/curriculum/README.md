# Curriculum data files (CP-54)

JSON the engine applies as the machine's work: `engine curriculum apply-seed` (a dry run unless `--apply`), and every
deploy runs it as part of `engine load --settings`. Each row is checked by code first (`engine/w1_bank/seed_rows.py`: the
learning-objective skill's rules for wording, the activity fields, the profile's groups); a row that breaks a rule is
listed in `data/curriculum/rejected.json` with why and never applied. **A low `confidence` is never a reason to refuse a row**:
it tells the coordinators to look at it first. Nothing is ever left empty; where the sources are thin, write the best
judgment, set `confidence` to `low` and say the assumption in `note`.

Everything applied is origin `machine`: live at once, marked, and checked as the week comes. A person's edit is never
overwritten, a second apply changes nothing, and `engine curriculum revert-seed <run>` puts a run back.

Words: "educator" never "teacher"; "regroup" or "exchange" never "carry" or "borrow". No child's name anywhere.

## `lo_rewrites/<BAND>.json`
`{"band": "G2", "rows": [{"lo_code": "LO-G2-0581", "action": "keep|rewrite|fold_into_unit", "new_title": "The child …", "signal": "Foundational|Conceptual|Procedural|Application|Stretch", "sources": ["lo:LO-G2-0581", "NCERT-LO-2017:ncert.math.3.10"], "confidence": "high|medium|low", "note": ""}]}`
- Every LO of the band once. `keep` changes nothing. `fold_into_unit` marks the LO retired (hidden, never deleted).
- `rewrite`: "The child" + one verb that can be seen or heard, the condition, ≤ 25 words, one action, none of: understands,
  knows, learns, appreciates, is aware of, is exposed to, develops, gets familiar with, will help, encourages. The original
  wording is kept as `source_text`. `sources` always includes `lo:<this code>`; any other `lo:<code>` or `<framework>:<statement>`
  must exist (the check refuses one that does not).

## Checks every row meets (a refusal says which, as `rule <letter>:`)
- **a** no activity level starts "The child". **b** no level opening (first six words) is shared by more than three activities of a band: from the fourth on they are refused. **c** an activity has at least three steps. **d** a `keep` is only for an LO that already starts "The child". **e** (a warning, not a refusal) two seen verbs joined by "and": split it into two objectives, the second a `new_los` entry. **f** an activity cites the sheet or document and tab, and the cell, `section` or `bullet` that names it.
- A row that names a subject the school does not have is refused and listed (`rule 0`); unknown codes are counted in `rejected.json`.
- **`engine curriculum apply-seed`** writes `data/curriculum/rejected.json` (counts per band and rule, every refusal with why, every warning). A copy run over the workers' branches on 16 Nov, 15:06 UTC is `docs/notes/CP-54-rejected-seed-16nov.json`.

## `activities/<GRADE>.json`
`{"grade": "G1", "new_los": [{"ref": "n1", "title": "The child …", "subject_code": "NUM", "unit": "Money", "signal": "Procedural", "sources": [], "confidence": "low"}], "rows": [{"ref": "G1-001", "name": "", "subject_code": "NUM", "unit": "", "format": "game", "steps": ["…"], "materials": "", "lo_codes": ["LO-G1-0014", "new:n1"], "levels": {"0": "…", "1": "…", "2": "…", "3": "…"}, "source": {"sheet": "<id>", "tab": "Monthly Detailed Plan", "cell": "C14"}, "confidence": "medium", "note": ""}]}`
- An activity has EITHER `levels` (four, 0–3, each a different sentence about the work, none starting "The child") OR `levels: null` and `look_fors`: exactly three short sentences of what an educator sees or hears (no feeling word, no "told me", no child's name) for a character or wellbeing activity: no scores for kind and unafraid (ADR 0037). Look-fors are kept in `activity.thinking_doc` as `{"look_fors": [...], "basis": ...}`; the levels of such an activity are empty. `basis` (optional): `educator_plan`, `syllabus` or `inferred`: what the activity was made from, kept beside its source.
- An activity is code `ACT-<GRADE>-<nnn>` from `ref`. One to three `lo_codes` (an existing LO of the grade, or the `ref` of a `new_los` entry, written `<ref>` or `new:<ref>`; it becomes `LO-<GRADE>-N001`, `N002`… in file order, `lo_rewrites/<BAND>.json`'s `new_los` first, then the activities'; a ref in both is one objective: only ever append). `format` is a row of the
  setting `curriculum.formats`. Four levels, four different sentences; level 2 is the LO as written. The cell is cited.
- An activity the database already has is never overwritten.

## Choices the engine's CHOOSE runs make (and a person may make too)
- `capability_choices.json`: `{"rows": [{"lo_code", "group": "v2-<capability>.<group>", "confidence", "reason"}]}`: exactly one group a
  LO counts toward; replaces the machine's earlier row, never a person's.
- `engine_skill_lo.json`: `{"rows": [{"skill_code", "lo_code", "confidence", "reason"}]}`: the one LO of the skill's grade it tests;
  set only where the skill has none.
- `unit_topics.json`: `{"rows": [{"subject_code", "unit", "topic_code" | "new_topic": {"code", "name"}, "confidence"}]}`: every LO of that
  subject and unit with no topic gets it.
- `reviews/<BAND>.json`: `{"band", "rows": [{"lo_code", "verdict": "ok|fix", "better_title", "note"}]}` from `engine curriculum review-sample`.
- `k2_label_placement.json`: read by a person; the placement skill's gold.
