---
name: skill-link
version: 1
mode: choose
writer_model: claude-haiku-4-5
validator_model: claude-opus-5-5
active: false
max_choices: 2
sources:
  - the learning objective, with its subject and unit
  - the school's registry skills nearest it, shortlisted by code (the skills of its activities, then of its unit, then of its subject), as code, name and description
  - the school's own earlier links of objectives to skills, kept as the gold cases
replaces:
  purposes: [lo_skill_match]
  eval: {purpose: lo_skill_match, measure: right}
---
# Skill link

A learning objective is taught through the school's progression: the registry skills, each a step or thread of what a child
learns in a subject. This standard links one objective to the skill or skills it is an instance of, from the shortlist code
gives. A person approves a link before it counts for a parent.

## The standard

1. **Choose the nearest skill.** Choose the skill on the list closest to what a child shows when the child meets this
   objective: the same thing done or known. When none is exactly that, choose the nearest one.
2. **One primary, a second only if it is also true.** Choose one skill. Choose a second only when the objective plainly asks for
   two different skills at once, and each would be right alone. Never more than two.
3. **Match the doing, not the topic word.** A skill that shares a word with the objective but is about something else is not a
   link. "Fractions on a number line" is about fractions, not about counting.
4. **Stay in the subject.** A skill of another subject is chosen only when the objective plainly belongs to it.
5. **Neighbouring steps are different skills.** Where the list holds consecutive steps of one thread, choose the step whose
   description names what the objective asks, not the step before or after.
6. **None only when nothing on the list is about the objective's subject matter at all.** A near but inexact skill is still a
   link; it is checked by a person.
7. **Copy the code exactly** from the list. A code that is not on the list is refused. A code is not chosen twice.
8. **Grade is context, not a rule.** The grade and subject tell what the wording means; they never decide the skill alone.
9. **The reason names the words** of the objective and of the skill that decided it, in one sentence. Say "educator", never
   "teacher".
