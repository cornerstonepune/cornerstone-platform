"""The school's words (goals/ux9b-regroup.yaml): "regroup", never "carry" or "borrow" for a column that passes ten.

Nimish, 2026-10-22, chose "regroup". The rule was a test's (tests/test_school_words.py), which reads every string a person
can be shown; it is here so the engine holds what an educator saves to it too (an English sample, goals/
edt_edit_samples_and_kinds.yaml), and the test reads it from here. The rule's own patterns name the words, so the test
leaves this file out.
"""

import re

SAID = re.compile(r"\b(carr(?:y|ies|ied|ying)|borrow\w*)\b", re.IGNORECASE)
# "carry" that is not a column passing ten: a person or a van carrying things, a skill carrying a code, a run carrying a
# name. Each is the whole phrase as it stands, so a new arithmetic "carry" beside one of them is still caught.
NOT_SUMS = re.compile(
    r"carr(?:y|ies|ied|ying) (?:out|on Tuesday|their sitting mat|a tray|water|Water|a sharp|a Sharp|pointed|many things|"
    r"her in|the bag|bag and|conjuncts|विसर्ग|informally|none\.|the range|this symbol|it\b|a child|a skill|no version|"
    r"\{a\} passengers|\{b\} more|\{a\} boxes|\d+ (?:boxes|girls|children)|the count|their own wrong)"
    r"|Carrying (?:their|a tray|a Tray|Water|water|a Sharp|pointed)|Carring a sharp|carries and folds|carries water|"
    r"carries a sharp|carrying and placing|van carry\?|evidence carries|run carries it|carries the|Carries a tray|"
    r"carried into the rows|carried by"
    # the school's own non-sum phrases in the curriculum seed (CP-54, data/g1..g4): an experiment carried out, a heading or
    # an action a list carries, a boat that carries two, a project named for borrowing a pencil, and notes quoting a sheet
    r"|[Cc]arr(?:y|ies) out|shares or carries|carries two|Borrowing pencil|LOs carry the actions?|also carries a second"
    r"|the cell (?:says|said) (?:carry|'borrowing')|Cell says 'borrowing'"
    r"|carry correct plurals|carries drawings|carry no speaker|carries only a (?:picture|label)|carries a picture"
    r"|carries a word|carries no named place|carry an s|carry no jumps|what to carry for|carries one subject"
    r"|says 'with carry'|objectives carry the observable acts"
    r"|nor its arrows carry labels|paintings carry no explanation|Shoelace carries at least|object found carries its"
    r"|flashcards carry an opposite|word is borrowed from the neighbour"
    r"|traders carried goods|assumes carrying-by-hand|child carries a small ball"
    # the rule itself, the forbidden word quoted: never "borrow"
    r"|[\"'](?:carry|borrow)[\"']"
)


def found(text: str) -> list[str]:
    """Each forbidden word a text says, as it says it; a CSS class is not words (the printed paper's `.g.carry`)."""
    text = re.sub(r'class(?:Name)?="[^"]*"|\.[\w.-]*carry\b', "", NOT_SUMS.sub("", text))
    return [m.group(0) for m in SAID.finditer(text)]
