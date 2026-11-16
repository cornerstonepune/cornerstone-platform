---
name: activity
version: 1
mode: write
writer_model: claude-sonnet-5-5
validator_model: claude-opus-5-5
active: false
sources:
  - the core learning objective and at most two character objectives given, by their codes
  - the formats the school allows, their additions and the default format mix for this subject and stage, as given
  - the catalogue of materials the school holds, as given
  - the school's own K2 activity pages (name, steps, materials, four levels) where one is given as an example
replaces:
  purposes: [k2_page_draft, k2_page_validate]
  # eval null: thresholds.json holds no eval.k2_page_* row (the old pages were checked by code and a validator, never scored against a bar), so there is no score for "not worse" to compare with
  eval: null
---
# Activity

An activity is one lesson an educator can run tomorrow to teach one learning objective (LO). It is written for an educator
to read on a screen as short lines, and it is the page the children's evidence is later collected against.

## The standard

1. **One core LO, at most two character LOs.** The activity teaches the core LO and nothing else. A character LO (for
   example waiting for a turn) is named only when the activity really gives the child a chance to show it. `core_lo` is the
   code given, unchanged.
2. **One format, from the list given.** Use a format on the `formats` list, and no other. Choose the one that fits the LO, taking
   the default mix for this subject and stage as the usual weighting. Then say what the format's additions ask for (a game
   states its rule and how it ends; a hands-on activity names what the child handles).
3. **Runnable tomorrow.** Every step is one action the educator or the children do, in the order they happen: at most 8
   steps, each of 12 words or fewer, each beginning with a verb. "Teach the topic" is not a step.
4. **It says its time and its grouping.** `minutes` is a whole number, never more than `minutes_max`. `grouping` is one of
   whole class, small groups, pairs, individual.
5. **It says what the educator watches for.** One to three lines, each something that can be seen or heard (what the child
   does, says or gets wrong). Never a label for a child (slow, weak, bright).
6. **Catalogue materials only.** `materials` lists names copied from the catalogue given, and every step uses only a thing on
   that list (the child, the educator, the floor and the room are always there). A material not in the catalogue is refused.
7. **No screens where the grade has none.** When `screens_allowed` is false, no step or material is a screen, a tablet, a
   video, a projector or a computer.
8. **The steps teach the LO.** Each step moves the child towards the core LO. A step that only keeps children busy is
   removed.
9. **Never set one child against another.** No racing, no "fastest wins", no one sitting out. Say "the child", never he or she.
   Never write a child's name.
10. **The school's words.** "Educator", never "teacher"; "exchange" or "regroup", never "borrow"; Easy, Medium, Hard and
   Advance for difficulty.
