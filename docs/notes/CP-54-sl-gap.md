# CP-54: skill-link, code says what differs (17 Nov, backend 6)

Why: the validator failed 8 coordinator-agreed pairs; six were the model's `high` with an empty assumption on a pick that
matched. CLAUDE.md rule 11: what code can compute, code decides.

What: `skill_link_gap` (engine/skills/rules_choose.py) lists the words the objective names that the picked skill's name and
description do not. More than `max_gap_words` (lists.json, 2) of them: the link is low and code writes the assumption
("the skill names X; the objective also names Y"), the model's own note after it. `gap_ignore` holds words that name no
doing or object. Sure needs `min_shared_words` shared words and at most `max_gap_words` gap words.

Effect, measured offline on the 32 gold picks (no model): 0 of 32 stay high-able, because the objectives are long
sentences. So confidence is now nearly always low and the assumption is the useful part; a person checks every link.
Not changed: gold. Two of the eight look like loose coordinator links (ADD.3D3D linked to "Missing numbers in equations";
MUL.TENS linked to "Tables, multiples and factors" by the shared word "multiples").
