# UI-8: Reports

Issue #594. Tier 2. Specification: docs/frontend/SPEC.md (Reports); wireframe: docs/frontend/wireframes/reports.html; inventory: docs/frontend/screens.json (`reports`).

### In plain English

One screen listing each child's parent report: where it stands, whether an educator approved it, whether consent is on file, and the report's words in a fold. Report lines, the coordinator's approval, Send and the parent's-copy PDF wait for CP-19 and are not drawn.

### Done when

1. `/children/reports` opens for an educator and a coordinator; an educator sees only their own classes' children.
2. Each row shows the child with Sr. No., the class, the report's state, whether an educator approved it, and the consent on file (on file / withdrawn: needed / none on record: needed), and a coordinator is told in a line that consent must be on record before a report can be sent.
3. The class and state filters narrow the rows; no rows shows "No report lines drafted yet".
4. A child's fold shows the report's words read-only; a child with no report shows "Not written yet" and no words.
5. The screen never says 'teacher', a rung code, a skill code or 'borrow', and orders rows by class and Sr. No. only.
6. Nothing on the screen sends a report; the controls that wait on CP-19 are on the pending list in docs/notes/UI-8.md.

7. (UI-8f, the wireframe) A strip of what waits sits above the reports: lines waiting for the viewer's approval, consent missing (a coordinator's strip only, since consent is the coordinator's alone to see) and reports sent, each a whole count for the class chosen.
8. The reports are one table for each stage they stand at (Drafted, Educator approved, Coordinator approved ready to send, Sent, No lines yet), each headed by its words and count, with the columns Sr. No. and name, Class, Lines, Educator approved ("3 of 6"), Coordinator approved, Consent (coordinator only), Sent; a stage chosen in the filter shows only its reports.
9. The same reports are shown as a board of four lanes (Drafted, Educator approved, Coordinator approved, Sent), each card opening that child's lines.
10. An opened child's lines are cards, three to a row: the skill the line is about, the system's state of it beside the educator's words (read only), the words as a field, and Approve for the stage the line is at.
11. A coordinator's rail holds a "Consent on file" bar of how many children have consent on file and how many do not.

### Out of scope

Report lines, the coordinator's approval, Send, the PDF and its lockup test (CP-19); delivery channel; folding the old pages (UI-8b).
