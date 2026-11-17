---
name: capability-link
version: 3
mode: choose
writer_model: claude-haiku-4-5
validator_model: claude-opus-5-5
active: false
max_choices: 1
sources:
  - the learning objective, with its subject, unit and the verb of what the child does
  - the groups of the capability profile, given by code, with each group's name and profile sentence (the school's graduate profile)
  - the domain default: the group code would use for an academic objective of this subject, given as `domain_default`
  - the school's own links of objectives to capabilities, kept as the gold cases
replaces:
  purposes: []
  eval: null
---
# Capability link

Every learning objective names exactly one capability group of the graduate profile: the one "owner" of that moment of
learning. The list is the groups of the capability profile, given by code. This standard chooses the one group the objective's
verb is evidence of.

## The standard

1. **Exactly one.** Choose one group, copied exactly from the list. Never none, never two. An answer must always be given; if
   unsure, choose the nearest, set `confidence` to low and say the assumption in `assumption`.
2. **Read the verb.** The group is the one that what the child does is evidence of: recalling and using a subject's content
   shows mastery of the subject; finding rules, reasoning or checking shows thinking; solving a problem or making something
   shows creating and problem solving; speaking, listening, writing to others shows communication; feelings and relationships
   show self and relationships.
3. **An academic objective takes its subject default.** The input gives `domain_default`, the group of the objective's
   subject. An academic objective whose subject default is on the list is answered by code with that default, marked low
   with the assumption "the subject default", without being asked; it stays editable, and an educator changes it where
   the verb plainly shows another group. An objective with no verb (a heading such as "Title: …" or "3.2 …") is answered
   the same way.
4. **When you are asked about an objective with a default on the list** (a routine, or any objective while the school
   has set academic objectives to be asked), start from the default and leave it only for a clear reason: the verb must
   plainly be evidence of another group. A topic word is not a reason, and neither is a hard objective. When in doubt
   between the default and another group, the default. When you leave it, the reason names the objective's verb, in the
   objective's own word, and words of the group you chose; a reason that does not is no reason, and code puts the
   default back, marked low.
5. **The group is not the subject.** A maths objective can belong to thinking, and an English objective can belong to
   communication. Do not choose a group because its name sounds like the subject.
6. **A character objective** (kind `character`) has no default: choose the group its behaviour is evidence of. So does
   an objective whose default is not on the list.
7. **One group, one reason.** The reason names the verb of the objective and the words of the group that decided it, in one
   sentence. Say "educator", never "teacher".
