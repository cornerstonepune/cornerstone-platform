# UI-11: Setup content pages: curriculum, skills to approve, question bank, a question

Issue #522. Tier 2. Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: docs/frontend/wireframes/{curriculum,skills-approve,bank,question}.html.

### What
The four Setup pages that carry content rather than people, rebuilt on the frame and the shared blocks: Curriculum, Skills to approve, the Question bank and one question as it prints. Queries and one-row-at-a-time approvals unchanged; the old routes fold in (308).

### Done when
The fourteen lines of issue #522 (the issue is the master copy). Tests: `apps/web/tests/u74-setup-content.spec.ts`, one per line, the first one the screens' goals.

### Out of scope
Making questions; changing what a level asks; the curriculum upload.
