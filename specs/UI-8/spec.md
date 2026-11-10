# UI-8: Reports

Issue #594. Tier 2. Specification: docs/frontend/SPEC.md (Reports); wireframe: docs/frontend/wireframes/reports.html; inventory: docs/frontend/screens.json (`reports`).

### In plain English

One screen listing each child's parent report: where it stands, whether an educator approved it, whether consent is on file, and the report's words in a fold. Report lines, the coordinator's approval, Send and the parent's-copy PDF wait for CP-19 and are not drawn.

### Done when

1. `/children/reports` opens for an educator and a coordinator; an educator sees only their own classes' children.
2. Each row shows the child with Sr. No., the class, the report's state, whether an educator approved it, and the consent on file (on file / withdrawn / not recorded).
3. The class and state filters narrow the rows; no rows shows "No report lines drafted yet".
4. A child's fold shows the report's words read-only; a child with no report shows "Not written yet" and no words.
5. The screen never says 'teacher', a rung code, a skill code or 'borrow', and orders rows by class and Sr. No. only.
6. Nothing on the screen sends a report; the controls that wait on CP-19 are on the pending list in docs/notes/UI-8.md.

### Out of scope

Report lines, the coordinator's approval, Send, the PDF and its lockup test (CP-19); delivery channel; folding the old pages (UI-8b).
