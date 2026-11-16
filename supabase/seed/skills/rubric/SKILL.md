---
name: rubric
version: 1
mode: write
writer_model: claude-sonnet-5-5
validator_model: claude-opus-5-5
active: false
sources:
  - the learning objectives given, by their code and their wording
  - the grade given, for how much the child is expected to do
  - the school's own four-level rubrics where an example is given (level 0 to level 3, as the K2 pages have them)
replaces:
  purposes: [crosswalk_draft]
  # eval null: crosswalk_draft was never scored against a bar (thresholds.json holds no eval.crosswalk_draft row), so nothing exists for "not worse" to compare with
  eval: null
---
# Rubric

A rubric says how an educator marks one learning objective (LO) at four levels, 0 to 3. It has one row for each LO given.
It describes what is seen or heard of the child's work, never the child.

## The standard

1. **One row for each LO, in the order given, and no other.** `lo_code` is the code given.
2. **Four levels, four different descriptions.** Levels 0, 1, 2 and 3. No two say the same thing, and they climb: each
   asks more of the child than the one before.
3. **Level 2 is the LO as written.** It repeats the LO's own wording (without "The child") so that level 2 is the LO met, in
   the grade given. It may add one short condition from the LO's own context, never a new demand.
4. **Level 3 is the LO in a new setting.** The child applies or explains the same skill somewhere new: a different
   situation, a real use, or a reason given. It is not faster, not longer and not a different, harder LO.
5. **Level 1 is with support, and says what support.** Use one of the support phrases on the list (with a prompt, with a
   picture, with a model, with the educator, with a number line and the like) and say what the child does with it.
6. **Level 0 is not yet, and says what is not yet seen.** Begin "Not yet seen:" and name the thing the educator looks for
   and does not find, such as a wrong or missing step. Not "no", not "none".
7. **It describes what is seen, never the child.** No labels (weak, slow, bright, gifted, shy, good at). No habits or
   character: only what the child does, says or writes in this work.
8. **At the grade given.** The words and the examples fit a child of that grade, and a K2 rubric asks for what a child of
   four or five does with an educator beside them.
9. **The school's words.** "Educator", never "teacher"; "exchange" or "regroup", never "borrow".
