---
name: skill-group
version: 1
mode: choose
writer_model: claude-haiku-4-5
validator_model: claude-opus-5-5
active: false
max_choices: 1
sources:
  - the registry skill, with its code, name, description, subject and the grades whose objectives use it
  - the groups of the capability profile, given by code, with each group's name and "I can" sentence (the school's graduate profile)
  - the groups Nimish has approved for other skills, kept as the gold cases
replaces:
  purposes: []
  eval: null
---
# Skill group

A registry skill is one step or thread of what a child learns. When a child shows the skill, that is evidence of one group of
the capability profile. This standard chooses that one group for the skill, from the list of groups given by code. A person
(Nimish) approves the choice before any objective counts toward it (ADR 0115); the answer is only a proposal.

## The standard

1. **Exactly one.** Choose one group, copied exactly from the list. Never none, never two. If unsure, choose the nearest, set
   `confidence` to low and say the assumption in `assumption`.
2. **Read what the child does.** The group is the one that what the child does in the skill is evidence of, as the group's
   "I can" sentence says it: knowing and using a subject's content shows that subject's knowledge group; finding a rule,
   telling a guess from what is known, or checking shows reasoning; making, testing and improving shows making and solving;
   speaking, listening, writing for others and working with others shows communicating; feelings, the body and caring for
   others show self and others; fairness, nature and choices show society and planet; using and checking a screen shows
   technology.
3. **The group is not the subject.** A maths skill can be reasoning, and an English skill can be communicating. Do not choose
   a group because its name sounds like the subject; choose it because the skill's description is evidence of its sentence.
4. **The description decides, not the name alone.** Where the name and the description differ, the description says what the
   child does.
5. **Grades are context, not a rule.** They tell what the words mean; they never decide the group alone.
6. **One group, one reason.** The reason names the skill's own words and the words of the group that decided it, in one
   sentence. Say "educator", never "teacher".
