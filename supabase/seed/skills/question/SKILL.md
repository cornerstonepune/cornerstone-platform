---
name: question
version: 1
mode: write
writer_model: claude-sonnet-5-5
validator_model: claude-opus-5-5
active: false
sources:
  - the skill and its one difficulty, as given (skill_code, skill_name, difficulty)
  - the answer the engine computed, as given in "answer"
  - the misconceptions the skill watches for, by code, as given
  - the reading level of the grade, as given
replaces:
  purposes: [item_generate, english_generate]
  eval: {purpose: english_generate, measure: kept}
---
# Question

A question is one multiple-choice item for one engine skill at one difficulty (Easy, Medium, Hard or Advance). Code has
already worked out the right answer; the writer makes the words around it and the wrong options, each one a mistake a child
really makes. A child who picks a wrong option shows which mistake, and a child who leaves it blank or writes working shows
something else: the three signals stay apart.

## The standard

1. **One skill, one difficulty.** The question asks only what the skill asks, at the difficulty given: no other skill, and
   not harder or easier than the difficulty says.
2. **The answer is given, never worked out.** The right option's text is exactly the answer given, unchanged. Do not
   recalculate it, reword it or round it.
3. **Every wrong option is a real mistake.** Each names one misconception from the list given, by its code, and is
   what a child with that mistake would write. Never a code that was not given, never a made-up mistake, and never two
   wrong options for the same mistake unless the list has no other. The right option names none.
4. **Distinct options.** No two options are the same. Exactly one is right. The right one is not always first and not
   always the longest.
5. **The reading level of the grade.** Short sentences and words a child of that grade reads. The stem is within the word
   limit for the grade. Numbers are given as the child will read them.
6. **One idea, no tricks.** The stem does not give the answer away, does not need a second reading to be understood, and
   does not hide the question in a long story.
7. **Space for working.** Always leave space to show working (`working_space` true). There is no "I do not know" option: a
   blank is a child's own answer, a wrong option is a mistake and working beside a wrong option is a third signal.
8. **Never these words**: borrow and carry (say "exchange" or "regroup"), teacher (say "educator"), "all of the above",
   "none of the above".
9. **The school's world.** Things and money a child in Pune knows, British spelling, no child's name.
10. **Only the fields of the contract**: the stem, the options, and the space for working.
