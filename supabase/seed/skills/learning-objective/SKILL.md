---
name: learning-objective
version: 4
mode: write
writer_model: claude-sonnet-5-5
validator_model: claude-opus-5-5
active: false
sources:
  - the framework statements given (NCF-SE, NCERT learning outcomes, Cambridge), by their codes
  - the sibling objectives of the same topic and grade, as "sibling:<code>"
  - the school's own syllabus line, as "school-syllabus"
replaces:
  purposes: [crosswalk_draft, k2_page_draft]
  eval: null
---
# Learning objective

A learning objective (LO) says one thing a child does that an educator can see or hear. It is the atom of the curriculum:
every question answered, rubric mark and note lands on exactly one LO. This standard writes one LO, or rewrites an LO that
is not yet one (a heading, a list of texts, a topic name, or a purpose such as "Encourages creativity").

## The standard

1. **It begins "The child" and then one verb** of what can be seen or heard, such as: counts, reads, writes, says, compares, orders,
   estimates, adds, subtracts, multiplies, divides, recalls, finds, uses, represents, shows, sorts, explains, checks, solves,
   creates, describes, identifies, extends, records, measures, chooses, predicts, places, plans, names, sings, draws, builds, asks, shares, tries.
   These are examples, not a closed list: any other verb of something a child does that an educator can see or hear is just as good
   (forms, makes, punctuates, sorts out). Never a verb of being or having, and never one of the words banned below.
2. **One action, no list.** Two actions are two objectives. No list of topics, no "and" joining two verbs.
3. **It states the condition**: the range, the materials or the way of working ("numbers to 1000", "using hundreds, tens
   and ones", "with a picture"). Take it from a source where a source gives one. Where none does, nothing is left empty:
   write the likeliest condition for the grade. Materials or a way of working chosen this way (picture cards, a word chart,
   in their own words) are not a fault. A range (its numbers) that no source gives passes only with `confidence` low and
   the assumption written in `assumption`; with `confidence` high or no assumption it is refused. Code checks the numbers
   against the sources before any reader sees the objective.
4. **Never these words**: understands, knows, learns, appreciates, is aware of, is exposed to, develops, gets familiar
   with, will help, encourages, borrow (say "exchange" or "regroup"), teacher (say "educator").
5. **It fits the grade** it was given. The grade is the one the school teaches it in, so an objective drawn from the
   school's own syllabus line or from a sibling of that grade fits it, however simple it looks. It is refused only when a
   source given for that age shows the objective is plainly beyond the grade. "Easier than this grade could manage" is not
   a fault.
6. **It is distinct from its siblings**: it does not repeat a sibling that is itself an objective (the same action on the
   same content with the same condition). A sibling that is a heading, a list of texts, a topic name or a purpose is not
   yet an objective: an objective written from it, or covering one part of it, is not a repeat. Two objectives on the same
   content that ask different actions (reads, writes) are distinct.
7. **It names its source**: one of the framework statement codes given, `sibling:<code>`, or `school-syllabus`.
   An objective with no source is refused.
8. **It has one signal**, one of the five words: Foundational (a basic fact or recognition), Conceptual (why or how it
   works), Procedural (a method followed), Application (used in a new or real situation) or Stretch (beyond the grade).
   Code checks that there is exactly one and that it is one of the five, and sets it where the verb decides it. Which of
   the five was chosen is a first sorting that a coordinator changes; it is never a fault.
9. **A rewrite keeps the original.** When the input says `rewrite`, the original wording is copied unchanged into
   `source_text`, so a person can see what was there.
10. **Short**: at most 25 words.
