# Frontend vision: what the school operating system looks like

Draft for Nimish's reaction, 9 Nov 2026. Design only: no screen is changed by this note. Readable page:
https://claude.ai/code/artifact/a8e986da-1965-40c2-be2d-81bc20b6ceed (private to Nimish). Sample words below are invented; no child or staff name appears.

## The answer in four lines

1. The site today is **two sites under one login**: the first one (built for grades 1–4 maths papers: *What needs doing,
   Assessments, Results, Setup*) and a newer K2 area (*Today, Timetable, Materials*) with its own menu. Voice notes and
   the children's pages sit in neither menu. That split is the biggest problem, bigger than any missing screen.
2. Proposal: **one top bar, four groups, the same for everyone**: **Today · Timetable · Children · Setup**. What differs
   between people is what each page shows (their own classes; the coordinator sees every class), never the menu.
3. **Today is the front door.** An educator opens it and sees their day, period by period, a large *Record a note* button
   and a count of notes to confirm. The coordinator opens it and sees what waits on them: a fortnight to approve, a
   clash to accept, notes not confirmed.
4. About half of what the backend does already has a screen. The missing ones are almost all the coordinator's
   timetable work (draft, go live, hand moves) and the fortnight's approval. Build those, in that order, after the menu.

## Who uses it (from the role rows in the database, nothing invented)

| Group (CP-3) | Roles in it | A typical day on the site |
|---|---|---|
| Own classes | educator, class teacher, subject educator, cover educator, specialist, assistant | Opens Today; taps a period to see its activity; records a voice note after a lesson, or taps the form; confirms the note; looks at the class picture before planning |
| Everything | coordinator, deputy coordinator, mentor, head, curriculum team, ops, special educator (placed here until Nimish says otherwise) | Opens Today; approves the fortnight; makes the timetable draft and puts it live; accepts or refuses a clash; checks notes left unconfirmed; (Next) approves report lines |
| Parents | not users | Receive reports. They never log in. Anything they read says "educator", never "teacher" |

For a school of about 100 children with 7 staff loaded (CP-1), the "everything" group is one or two people. So the
coordinator gets **no dashboard of charts**: they get a list of things waiting, each with its own button.

## The menu

```
 Cornerstone   Today    Timetable    Children    Setup          [search a child]   [≡]
               ─────
 Today       : my day (periods) · Record a note · Notes to confirm · Work waiting
 Timetable   : Day · Week · Fortnight · Materials       + coordinator: Draft · Go live · Hand moves · Rules
 Children    : Class picture · A child · Notes · Assessments (grades 1–4) · Reports
 Setup       : Curriculum · Skills · Question bank · Staff · Classes and children · School
```

Rules kept from `docs/ux-rules.md`: one slim bar, no sidebar, at most four groups, a group's other pages are tabs
under it, one count only (on Today), no approve-all, a person sees their own. The K2 area's own side menu goes away.

What moves where (no page is deleted; each finds one home):

| Today it is | It becomes |
|---|---|
| What needs doing (`/today`) and the K2 "Today" (`/educator`) | one **Today**, its top half the day's periods, its bottom half the work list |
| K2 Timetable (day, this week, next week) | **Timetable** → Day, Week, Fortnight |
| K2 Materials (class list, school list, notes to read) | **Timetable** → Materials (Later in the plan; the pages exist) |
| Voice: record, form, confirm a note | **Today** (the button and the count) and **Children → Notes** (every note) |
| Children (`/k2`), class picture, a child | **Children** → Class picture, A child |
| Assessments group (4 pages), Results group (3 pages) | **Children** → Assessments, Reports; the work in them shows up on Today as rows |
| Setup group | **Setup**, plus Timetable rules moving to Timetable |

## Every backend scope and its screen

| Scope | What a person does with it | Screen | Exists? |
|---|---|---|---|
| CP-1 People | add staff, move a child to another class, see who changed what | Setup → Staff; Setup → Classes and children | Staff yes (who teaches what). Moving a child and the change log: no screen |
| CP-2, 3, 4 Who is asking, role rules | nothing to click; decides what each person sees | every page | n/a |
| CP-5 Hygiene | nothing | none | n/a |
| CP-6 Fortnight cycle | see the fortnight's state and dates; coordinator approves; frozen after | Timetable → Fortnight; a row on the coordinator's Today | **No** |
| CP-7 The week | see the week's draft; approve only what changed | Timetable → Week (view exists) | View yes; approve-what-changed **no** |
| CP-8 Period opens its activity | tap a period, see its activity and plan lines | Today → a period → activity | **Yes** (K2 area) |
| CP-9 Typed observation becomes evidence | tap marks on the class grid; correct one later | Today → form; Children → Notes | Form yes; correcting a confirmed note **no** |
| CP-10 Voice | record, then confirm what the reader heard | Today → Record; Notes to confirm | **Yes** (record, confirm one note); a list of notes waiting is only reachable through What needs doing |
| CP-11 Timetable draft | make a draft from the rules; see which rules could not be met | Timetable → Draft; Rules | Rules yes; draft **no** |
| CP-21 Draft goes live | put a fortnight live; see what changed | Timetable → Go live | **No** |
| CP-12 Hand moves | move a period by hand; accept a clash (coordinator only) | Timetable → Hand moves | **No** |
| CP-13 Child level rule | see where a child is | Children → Class picture, A child | **Yes** |
| CP-14 (Next) Ready next | see what each child is ready for next | Children → A child; the period page | Partly (the child page names it) |
| CP-19 (Next) Reports, coordinator's list | approve each line twice; consent before sending | Children → Reports; coordinator's Today | Parent reports exist for grades 1–4 papers; two approvals and consent **no** |
| CP-15, 16 (Later) Curriculum, mapping | fill and check activity pages | Setup → Curriculum | **Yes** (fill, check, browse, offers) |
| CP-17, 18 (Later) Inventory, materials | the month's list, educator approves it, reminders | Timetable → Materials | Lists yes; approval **no** |

## Build order (each one a single scoped change)

| # | Slice | Calls | Proves | Phase | Nimish's choice? |
|---|---|---|---|---|---|
| F1 | **One menu**: the four groups; the K2 area's pages moved under them; its side menu removed | nothing new | every existing page is reachable from the bar in two clicks; the menu test passes | Core | **Yes**: the four names, and where Assessments sits |
| F2 | **Today, joined**: the day's periods on top, Record a note, Notes to confirm, the work list under | CP-8, CP-10 | an educator sees only their class's periods; the count matches the list | Core | Yes: what is on top for an educator |
| F3 | **Notes**: every note of my classes, its state, correct a confirmed one | CP-9, CP-10 | a correction adds a new note and never edits the old one | Core | No |
| F4 | **Timetable draft**: make a draft, see it as a fortnight grid, see the rules it could not meet | CP-11 | the draft shown is the one the generator made; unmet rules listed in words | Core | No |
| F5 | **The fortnight**: its state and dates, approve it, put it live, what changed | CP-6, CP-21 | only the coordinator group sees Approve and Go live; a frozen fortnight shows no edit button | Core | No |
| F6 | **The week**: approve only what changed | CP-7 | an unchanged week shows nothing to approve | Core | No |
| F7 | **Hand moves**: move a period, see the clash, coordinator accepts | CP-12 | the move is kept with who made it; an educator cannot accept a clash | Core | No |
| F8 | **Classes and children**: move a child, see who changed what | CP-1 | the move shows in the class picture the same day | Core | No |
| F9 | **Reports and the coordinator's list** | CP-19 | nothing is sent without consent and both approvals | Next | Yes: what a parent's report looks like |
| F10 | **Ready next** on the child and period pages | CP-14 | only links a person confirmed are shown | Next | No |
| F11 | **Materials approval** | CP-17, CP-18 | the educator approves their own class's list only | Later | No |

F1 goes first because every later screen needs a place to live. F1 is tier 1 (no new data). F2 onward are tier 2.
F4 to F7 can only be built once their backend scope is merged; F2 and F3 can start now.

## What I would push back on

- **Do not build new screens before F1.** Two menus means every new screen picks a side and the split grows.
- **The grades 1–4 papers loop is seven pages and two of the four current groups.** The school is running K2 now.
  If the papers loop is not in weekly use this term, it belongs one level down (Children → Assessments), not on the bar.
- **No coordinator dashboard.** One or two people use that group. A list on Today, each row with its button, is enough.
- **Phone**: only recording and confirming a note need to work well on a phone (the rules already say so). Everything
  else is desktop first.

## Three questions for Nimish (only what changes what the school sees)

1. Four groups on the bar, **Today · Timetable · Children · Setup**: yes, or other names?
2. Is the grades 1–4 papers loop used every week this term? If yes it stays a tab; if no it moves under Children.
3. The special educator is in the "everything" group for now. Should their Today look like an educator's (their
   children) or the coordinator's (things waiting)?

Not checked: whether any screen beyond the titles read here hides a capability (for example, the School page may
already let someone move a child). Each slice's scope will check its own screen before building.
