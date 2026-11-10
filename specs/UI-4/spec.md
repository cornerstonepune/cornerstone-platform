# UI-4: Node pages: assessments

Issue #519. Tier 2. Waits for: UI-2. Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: docs/frontend/wireframes/{assessments,assessment,paper}.html.

### In plain English

The grades 1 to 4 assessment work on the same parts: the list of assessments, one assessment with its steps, and one child's paper with each answer marked right, wrong, blank or for you to judge. The old pages fold into these.

### What

Assessments, one assessment and one child's paper as node pages on the blocks; the seven old assessment pages and Class results fold in; the queries and the seven steps are unchanged.

### Done when

1. Every screen of this slice passes the ten generic checks and every element in its list behaves as its kind says.
2. Every old route listed under `folds` answers 308 to the new address.
3. `lib/assessment-steps.ts` STEPS and STEP_WORDS and `lib/queries-papers.ts` exported names are unchanged (a test imports them and compares to the committed list).
4. The journey `e2e/a-paper-comes-back.spec.ts` passes: make a class assessment, approve the pack (per pack; no all-packs button exists on any screen), upload a fixture scan, the paper shows right / wrong / blank / for you to judge with the fixture's counts, say what the child wrote for the one to judge, sign off, the child's timeline shows the paper result beside a voice note; axe at each step.
5. No approve-all control exists on any screen (the `ux.approveAll` list in workflows.json is empty at the end of this slice).
6. Every one of the 42 controls listed for these screens in docs/frontend/screens.json behaves as its kind says (docs/frontend/SPEC.md section 7), proved by the inventory test and the slice's own tests; the inventory test's completeness check finds no control outside the list and no listed control missing.
7. Assessments: the four old pages answer 308 to this one or to the Assessment node.
8. Assessments: every row's name is built topic, skill, level, kind, class, day (regex).
9. Assessments: no approve-all control anywhere.
10. Assessments: each tile's number equals the rows behind it.
11. The built name: Approve acts on this pack only; no control acts on more than one pack or more than one row.
12. The built name: the stepper's amber step equals the status word in the list.
13. The built name: a replaced copy shows 'replaced by a newer one' and no action.
14. The built name: the papers bar's three counts sum to the number of copies.
15. Check the answers: right, wrong and blank are three different chips and three counts; a wrong-with-working reason is shown with its wrong chip.
16. Check the answers: a person's answer writes a read_correction row and never overwrites the engine's read.
17. Check the answers: Sign off is absent while any answer is 'for you to judge', and acts on one paper.

### Out of scope

The question bank's content; making questions; reports. No database change: the name an educator chose is already a `change_log` row (table `assessment`, op `name`), keyed by the assessment's key (#551).
