---
name: topic
version: 1
mode: write
writer_model: claude-sonnet-5-5
validator_model: claude-opus-5-5
active: false
sources:
  - the learning-objective texts given for the group, as "lo-texts"
  - the topics that already exist for this subject, as "existing:<code>"
replaces:
  purposes: []
  eval: null
---
# Topic

A topic is the name of one subject that a group of learning objectives (LOs) belongs to, such as "Fractions" or "Forces and
magnets". It is how a parent, an educator and the engine find the same thing across the years. This standard names the topic
for a group of LOs, or says which existing topic they already belong to.

## The standard

1. **A noun phrase.** It names a subject, so it does not begin with a verb ("Learn about fractions") or a question word
   ("How do we tell the time?").
2. **One subject.** "Fractions" and "Time" are two topics, never "Fractions and time". A name with "and" is fine only when
   the school already treats the two nouns as one subject ("Forces and magnets", "Addition & subtraction").
3. **The same name in every grade.** No grade, no "Introduction to", "Extended", "Part 1", and no number of any kind
   (no unit number, no book number).
4. **Never a book, a unit, a chapter or an activity.** Not "Unit 3", not the title of a story or an author, not "Project",
   "Worksheet" or "Lesson". Read through them to the subject that they teach.
5. **The right size.** A grade has about 5 to 25 LOs under a topic. "Maths" is too wide and one LO is too narrow.
6. **Reuse beats adding.** If an existing topic of the subject already covers the LOs, give its code in `reuse` and write
   its name exactly as it is given. Only when none fits, make a new name, set `reuse` to null, and do not copy the name of an
   existing topic.
7. **Plain and short**: at most 6 words, the school's own words, a capital only on the first word and on proper names.
8. **It comes from the LOs.** Use what they say; never bring in a subject they do not mention.
9. **It names its source**: `existing:<code>` when it reuses a topic, otherwise `lo-texts`.
