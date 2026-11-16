---
name: learning-objective
version: 1
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

1. **It begins "The child" and then one verb** of what can be seen or heard: counts, reads, writes, says, compares, orders,
   estimates, adds, subtracts, multiplies, divides, recalls, finds, uses, represents, shows, sorts, explains, checks, solves,
   creates, describes, identifies, extends, records, measures, chooses, predicts, places, plans, names, sings, draws, builds, asks, shares, tries.
2. **One action, no list.** Two actions are two objectives. No list of topics, no "and" joining two verbs.
3. **It states the condition**: the range, the materials or the way of working, taken from a source ("numbers to 1000",
   "using hundreds, tens and ones", "with a picture"). A range is never invented.
4. **Never these words**: understands, knows, learns, appreciates, is aware of, is exposed to, develops, gets familiar
   with, will help, encourages, borrow (say "exchange" or "regroup"), teacher (say "educator").
5. **It fits the grade** it was given: not harder than the sources for that age, not easier.
6. **It is distinct from its siblings**: it does not say what a sibling already says.
7. **It names its source**: one of the framework statement codes given, `sibling:<code>`, or `school-syllabus`.
   An objective with no source is refused.
8. **It has one signal**: Foundational (a basic fact or recognition), Conceptual (why or how it works), Procedural
   (a method followed), Application (used in a new or real situation) or Stretch (beyond the grade).
9. **A rewrite keeps the original.** When the input says `rewrite`, the original wording is copied unchanged into
   `source_text`, so a person can see what was there.
10. **Short**: at most 25 words.
