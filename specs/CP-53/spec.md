# CP-53: The activity page on one screen, every part editable; machine links shown everywhere with their tag; a white site

Issue #773, approved by Nimish 14 Nov 2026. The issue is the source; this is its copy.

## What

- **The activity page** (`/setup/activities/[code]`) becomes one screen built from the site's existing blocks at their usual sizes. The four tabs go.
  - Header: the activity's name, subject and strand, its objective line, and one action, **Approve all of this activity** (CP-51's approve).
  - Main column: What the child learns (the objective, then the skills it builds); How to mark (levels 0–3 as the lesson page's `RubricRows`); Steps and How to think about it.
  - Right column: Materials (items with a count, the lesson page's list); Where it sits; Taught.
- **Every part is editable in place by the curriculum's reviewers:** objective, steps, thinking, levels 0–3 and materials, the school's sheet included. An edit becomes the person's words, and the part's source changes to "person".
- **Materials** are edited as items (name and count) in `activity_material`; each can be added, changed or removed.
- **Machine links are shown everywhere with their tag:** a link the machine made (activity → skill, activity → objective, objective → skill) is shown wherever its rows appear, marked "to approve" until a person approves it. It is never hidden.
- **A white site:** the page ground goes back to white and the menu to a neutral grey.

No new table and no schema change.

## Done when

1. The activity page shows the objective, its skills, the rubric levels 0–3, the steps, how to think about it, the materials, where it sits and taught, all on one screen with no tabs. The rubric is drawn by `RubricRows`, the same block as the lesson page.
2. A reviewer can edit each of these parts in place, whether its source is the sheet, the machine or a person. After saving, the page shows the new words, and the part's source is "person".
3. A reviewer can add, change and remove a material item (name and count). The lesson page and the Materials page show the same items afterwards.
4. "Approve all of this activity" approves the activity's machine links and drafted parts. After it, no part or link on the page carries the "to approve" tag.
5. Every machine link appears, with its "to approve" tag, wherever it is listed: on the activity page, the objective page, the skill page and the Curriculum list.
6. The skill page lists the objectives and the activities linked to the skill, each with its source tag.
7. The page ground is white and the menu a neutral grey, from `tokens.json`. No page draws the old warm ground. The block screenshots are redrawn from CI's own run.
8. The educator who is not a reviewer sees the same page with no Edit and no Approve.

## Out of scope

An order among objectives; rubric wording on the skill (grades 1–4); parent reports; class-level voice notes; choosing a skill for the 6 objectives the model answered "none".
