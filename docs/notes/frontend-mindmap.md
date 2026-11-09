# Frontend vision, second pass: the mind map, other systems, and how we show it

9 Nov 2026, for Nimish's reaction. Companion to `frontend-vision.md` (the menu, the screens, slices F1–F11); this
note does not repeat those. Readable page: https://claude.ai/code/artifact/2aac950f-9100-4075-ba3b-40ce9c48276d (private to Nimish).

## The map

```
                         ┌ Today        my periods · Record a note · type it · Notes to confirm · work waiting (one count)
                         │              coordinator: what waits on them                                  [to build]
                         ├ Timetable    Day · Week · Fortnight [to build] · Materials [later]
ONE SITE ────────────────┤              coordinator: Rules · Draft [to build] · Go live [to build] · Moves by hand [to build]
a person sees their own  ├ Children     Class picture · A child · every note, correct one [to build] · Assessments (1–4)
the fortnight is the unit│              Ready next [next] · Reports, two approvals [next]
voice records a lesson   ├ Setup        Curriculum · Skills to approve · Question bank · Staff · Classes and children [to build] · School
a number is computed     └ Outside      parent receives a report [next] · phone: record and confirm · printed packs with a QR
```

## What other school systems put at the centre

| Family | Examples | Teacher lands on | Built around | Cornerstone |
|---|---|---|---|---|
| Early-years apps | Brightwheel, Famly, Illumine | the room's roster; a button to post a photo or note | a parent feed: every observation is a post the same day; daily report is a form; AI writes the text | same quick capture, by voice; no feed: a note becomes evidence code checks; a parent gets a report after two approvals |
| Montessori record-keepers | Transparent Classroom | the planning view, by day, child or lesson | the record: a lesson presented updates progress; gaps by area; conference reports | closest to us; we add the timetable itself and let the engine decide what a note proves |
| Big school systems | PowerSchool, Veracross | a list of current classes; one toolbar on every page; a child profile with tabs | administration, portals per group, configurable | we keep the one toolbar and one profile per child, nothing else |

Nothing found does both of: a fortnight timetable the system drafts and a person puts live; three signals kept apart
(blank, wrong, wrong with working). Those are the parts worth showing.

Sources: Brightwheel's observation-tools page, the Brightwheel vs Famly comparison (aitoolsbakery), Illumine's
teacher–parent communication page and its Transparent Classroom comparison, transparentclassroom.com, the PowerTeacher
portal user guide (fcpsva.org), Veracross community article "Student Profile". Read from documentation and reviews, not
used hands-on.

## The look (already decided; listed so this pass does not reopen it)

Lime wash ground, chalk cards, basalt ink, square corners, one serif. A state is an icon, a word and a colour; red is
rare; terracotta is never on a child. One slim bar, no sidebar, four groups, tabs under. A list is a table with its
filter row, ten rows at most. A class is a grid of squares by Sr. No., never a table. Desktop first at 1440 px; only
recording and confirming a note are designed for the phone.

## How we show it: three stories, about twelve minutes

1. **An educator's Tuesday (4 min).** Today → tap the lit period → the activity → Record a note on the phone →
   Notes to confirm, fix one child, Confirm → Class picture: the square changed. Shows voice in, evidence out.
2. **The coordinator's fortnight (5 min).** Today: "fortnight to approve" → Draft from the rules, one unmet rule in
   words → move a period by hand, a clash, accept with a reason → Approve, Go live → every Week changes → the row is
   gone from Today. Shows the spreadsheet replaced and every move kept with who made it.
3. **What a parent receives (3 min).** A child's page → a report line drafted, approved twice → consent on file → the
   report as the parent reads it: "educator", Easy/Medium/Hard/Advance, no rung, no code. Next phase; a mock until then.

## Where the second pass changed my mind

- "Outside the site" joins the map: the phone, the printed pack and the parent's report are half of what people touch.
- Materials sits under Timetable, not Setup: it is built from the fortnight's activities.
- The class grid of nameless squares is the signature (privacy and speed); the demo should say so.
- Do not copy the parent feed. It is what every early-years app sells and what the agreed workflow rules out.

## Two questions for Nimish

1. Who watches the demo besides the staff? If another school or a funder, Reports moves from Next to Core.
2. Parents receive and never log in. Are we sure, or do we keep room for a read-only parent page (one child, one
   report, no feed)?
