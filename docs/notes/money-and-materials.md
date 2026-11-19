# Money & Materials (proposal, 2026-11-19)

A public copy of `cornerstonepune/teacher-os` → `blueprint/money-and-materials/claude-code-session-brief.md`. **That private copy wins** when the two differ. This copy leaves out Drive file ids and account addresses (standing orders, Privacy): open the private copy for them. Staff appear by role only. The plan page is `docs/brainstorms/2026-11-19-money-and-materials-plan.html`. The line-level expense review stays private.

Status: **proposal.** Nothing here is in scope until Nimish answers O-15 in `teacher-os/blueprint/decisions.md`. No spec, migration or code yet.

---


Written 2026-11-19 at Nimish's request, to start fleshing out the plan in `plan-2026-11-19.html`.
Read this whole file before you touch anything. It tells you what already exists, where it conflicts, and what to
ask Nimish before building.

## 0. The ask, in Nimish's words (2026-11-19)

> "Create a complete expense management system ... inventory is a part of it ... reimbursements ... most of this
> should run through ... the teacher OS ... even the receipts etc. should not be submitted on WhatsApp. It should
> create an entry, and all of that should have like a proper portal."

> "Very practical steps and proper flow understanding of what an educator will need to do ... effort, time and
> management of this is becoming seamless with spotless tracking, analytics and accountability built in."

Also from 18 Nov (NeoSapien `3ac7c9f6`, `6368b6fa`, `1c093e63`):

- Cost should fall because the process improves. It is not the goal in itself.
- Minimise the gap between planned and actual spend.
- Take the operations lead out of the middle as the bottleneck.
- ABC classes for stock, with stricter checks for A items.
- Each activity's materials should produce the requisition from the timetable.

## 1. Read first, in this order

**`cornerstonepune/teacher-os` (private):**

1. `CLAUDE.md`, then `blueprint/decisions.md`. Read especially D-070 to D-076: the materials cycle, WhatsApp, the
   catalogue, and "screens built in the real app".
2. `blueprint/operations.md` (B7): checklists, materials, kit inventory (QR custody), events. This is drafted but
   parked.
3. The roadmap cards: `bin/roadmap card M1-10`, `M1-12`, `M1-13`, `M1-16`.
4. `blueprint/money-and-materials/plan-2026-11-19.html` (also here: `docs/brainstorms/2026-11-19-money-and-materials-plan.html`) and `expense-review-2026-11-19.html` (private only).

**This repo (`cornerstone-platform`, public):**

1. `CLAUDE.md` and `docs/notes/standing-orders.md`. These are binding: spec-driven work, test-first, small PRs,
   Supabase SELECT only, cost caps, and no staff names in git.
2. `docs/data-model.md`. Read the reuse rules: `approval` for every yes/no, `change_log` for every change, `config`
   for every setting. A new table needs a one-line reason why it can't be any of those.
3. `docs/notes/m1-10-materials-list.md`, `m1-16-materials-consolidated.md`, `ui-charter-c-fortnight-materials.md`,
   `m1-09m-materials.md`.
4. The code: `packages/engine/engine/w2_print/materials_*.py`, `apps/web/tests/*materials*.spec.ts`.

## 2. Where everything lives

| What | Where | Rule |
|---|---|---|
| Plan, chapter, roadmap, decisions | this repo, `blueprint/` | Scope edits go chapter → `roadmap.toml` → `decisions.md` |
| Code, migrations, tests | `cornerstone-platform` | **Public.** No staff names, no rupee amount tied to a person, no receipt, no Drive ids in git |
| Live database | Supabase `ruznbyngtfjsaymuylhm` (cornerstone-cloud, ap-south-1) | The tool is SELECT only. Changes go through numbered migrations or the engine |
| Cleaned expense history | Google Sheet "Cornerstone — Expense Database (historic, cleaned) v1", owned by Nimish | Tabs: `README`, `expense_lines` (1,301 lines, ₹11,69,920), `summary_month_x_category`, `reconciliation`, `raw_reimbursements_snapshot_19Nov26`, `raw_books_to_order_25-26_snapshot`, `bill_match_by_line`, `bill_files_inventory` |
| Source ledger | Google Sheet "TLMs", owner: finance founder | 28 tabs (10 hidden). The Reimbursements tab is the live ledger until cutover |
| Bill photos | Drive folder | 16 month sub-folders (Aug 2025 – Nov 2026), 573 files (jpg, png, pdf, docx). Since Dec 2025 files are named `<Category> <dd.mm.yy> (<description>)` |
| Other budget sheets | "Sports Day Budget 2026-27" | Two tabs: summary (₹40,000 planned against a ₹25,000 cap) and a detailed line list |
| Financial model (per-child norms) | `School_Financial_Model.xlsx`, Drive | Repairs ₹1,500, events ₹3,000, utilities ₹1,500, housekeeping ₹1,200 per child per year, plus fixed monthly amounts |

**Historic import.** Load `expense_lines` into the database with an engine command that reads the Sheet through the
Drive adapter (Ring C), marked as machine-made. Never commit the CSV.

**Access note (2026-11-19).** The Google Sheets connector refused Cornerstone files until it was re-connected to
the Cornerstone Google account. Before reading, check it opens TLMs.

## 3. What exists live today (read 2026-11-19, SELECT only)

| Area | Live state | What it means for this work |
|---|---|---|
| `campus` | **1 row** ("Cornerstone School, Pune") | Split into Gurukul and Neev; money and stock belong to a campus |
| `school_class` | **4 rows** (K2, G1, G2, G3) | PG, Nursery, K1, G4 and Day care are missing, so Neev's spend can't be attributed |
| `staff` / `staff_role_grant` | 7 active; an `ops` role exists with 0 grants | Add the two operations leads (Gurukul and Neev) as `ops` |
| `activity` | 3,915 rows; **1,499 have free-text `materials`** | Feeds `activity_material` through the model-plus-code intake (M1-16 pattern) |
| `material_item`, `activity_material`, `materials_line` | **0 rows** | The catalogue is empty |
| `materials_list` | 1 draft (G1, 2026-11-18 → 12-01, `period = 'fortnight'`) | Lists are already built per fortnight |
| `session` | 1,049 rows; **3 linked to an activity** | Generating requisitions from the timetable is blocked until sessions carry activities |
| `fortnight` | FN10–FN17 (FN10 starts 2026-11-23) | The rhythm the school plans in |
| `approval` | 8,319 rows, one shared ledger | Use it for expense, float top-up, capex and event-budget approvals |
| `change_log` | 20,546 rows, never edited | The audit trail; every money and stock change goes here |
| `config` | 263 keys | Categories, limits, float sizes, deadlines, receipt rules |
| `storage.buckets` | **0** | A private `receipts` bucket is needed |

**Drift to check first.** The code repo's migration `20270104090000_materials_consolidated.sql` and roadmap
M1-16's evidence say the `materials_consolidated*` tables are "live". The live table list on 2026-11-19 does
**not** show them. Run a SELECT on `information_schema.tables`, and read `20270125190000_cp27_word_lists_and_dead_tables.sql`
(it may have dropped them), before building on them.

## 4. Conflicts to raise with Nimish (do not resolve them yourself)

| # | Conflict | Sources | Recommendation |
|---|---|---|---|
| C1 | **Finance is out of scope** in the Teacher OS README | README "Scope boundary"; Nimish 2026-11-19 asks for it | Add chapter B14 "Money" and extend B7. Proposed as **O-15** |
| C2 | **Monthly vs fortnightly materials cycle.** D-072 / M1-12 set a monthly cycle (draft 10th … list out 21st). The school plans in fortnights: the requisition is due a week before each fortnight and buying happens on Saturday (18 Nov, `3ac7c9f6`). The live list is `period = 'fortnight'` | D-072, M1-12, `3ac7c9f6`, live `materials_list` | The materials list follows the fortnight (all dates as settings, as D-072 asks). The money close stays monthly |
| C3 | **WhatsApp as the send route.** D-071, M1-10 and M1-16 send by WhatsApp. D-076 says "forget about WhatsApp". On 2026-11-19 Nimish said receipts must not go over WhatsApp | D-071, D-076, 2026-11-19 | Everything is submitted in the portal. WhatsApp is at most a notification with a link. The existing send stays built but unused (as D-076) |
| C4 | **Kit custody vs ABC classes.** B7 designs QR custody (`asset`, `custody_event`, `room_audit`). The plan has A/B/C classes with par levels | B7 §2b, plan "System" tab | A items are B7's assets with QR custody. B items are stock with a minimum level and a termly count. C items are not tracked. M1-13's rupee threshold decides A vs B |
| C5 | **Capex.** B7 `asset` has no cost or approval. The plan says capex is approved first and becomes an asset | plan "Rules" | Add cost, purchase date, warranty and the approving `approval` id to `asset`; the capex request is an `approval` of kind `capex` |
| C6 | **Events.** B7 `school_event` has no budget | B7 §3, plan "Events" | An event budget is an `approval` of kind `event_budget` whose `detail` holds the lines; spends link to `school_event` |

## 5. Proposed work, as roadmap tasks (IDs are proposals: MM-*)

Each task becomes a `CP-<n>` issue in the code repo (the next free number; `specs/` ends at CP-75). Use `to-spec`, and
`grill-with-docs` when it's fuzzy. Nimish approves in the issue. Every *Done when* line gets one test.

| ID | Task | Done when (draft, for `to-spec` to sharpen) | Depends on |
|---|---|---|---|
| MM-0 | **Set up.** Campuses, classes, ops grants, settings, receipts bucket, historic import | Gurukul and Neev are two `campus` rows and every class has one; both operations leads hold `ops` on their campus; `config` holds categories (the 15 in the Sheet), approval limits, float sizes and receipt rules; a private `receipts` bucket exists with access rules; the 1,301 historic lines are loaded machine-made and their total equals ₹11,69,920 | O-15, Nimish's decisions §7 |
| MM-1 | **Log a spend** (the operations lead's phone screen) | Photo → model reads amount, date, vendor and lines → code checks them → the person confirms the amount → category suggested → campus/class/event tagged → saved with who and when; above the custodian's limit it creates an `approval` row and waits; every change is a `change_log` row; nothing is deleted, only voided with a reason | MM-0 |
| MM-2 | **Floats** | Each custodian's float has a balance; every spend and top-up moves it; the month-end close shows the expected balance, the custodian enters the actual, any difference needs a reason, and a top-up request is an `approval` | MM-1 |
| MM-3 | **Exceptions and the monthly report** | A nightly check flags a receipt missing after 48 hours, a GPay-only receipt above ₹500, the same item bought again within 14 days, a duplicate bill, capex through the float, an over-budget spend, a purchase split under a limit; a report on the 3rd shows budget vs actual and lists every flag | MM-1, MM-5 |
| MM-4 | **Vendors and recurring bills** | Tanker, garbage, tea, pest control, RO and the print vendor each have a rate and a schedule; each month a draft bill is made, the custodian confirms the quantity, and it posts as an expense | MM-1 |
| MM-5 | **Budgets** | Budget by category × campus × month and per event; a spend shows its budget left; an event spend before its budget is approved is refused | MM-1, B7 `school_event` |
| MM-6 | **Capex to asset** | A capex request (`approval` kind `capex`) → purchase → an `asset` row with cost, date, location and QR (B7) | MM-1, B7 assets |
| MM-7 | **Stock and the buy list** | Stores and bins per campus; a minimum level per B item; Saturday stock-in; "collected" on a class list reduces stock; the buy list = consolidated requirements (M1-16) minus stock plus items below minimum, grouped by vendor | M1-10, M1-13, M1-16, catalogue |
| MM-8 | **Termly count and the annual buy draft** | A phone checklist per bin (B7 checklist engine); differences above tolerance need an explanation; in March a draft AY buy list is built from stock, plan and last year's use | MM-7 |
| MM-9 | **Dashboards** | Budget vs actual, cost per child against the financial model's norms, recurring streams, events, floats, stock, assets; every number links to its lines | MM-3 |

**Order:** MM-0 → MM-1 → MM-2 → MM-3, then MM-4 and MM-5, then MM-6, then MM-7 → MM-8. MM-9 grows alongside.
Money comes first because the spend happens every day and needs nothing else to exist. Materials come last because
sessions don't yet carry activities and the catalogue is empty.

## 6. Data model sketch (check every table against `docs/data-model.md` before proposing it)

Reuse first: `approval` (kinds `expense`, `float_topup`, `capex`, `event_budget`, `stock_writeoff`), `change_log`,
`config`, `campus`, `school_class`, `pii.staff`, `school_event` (B7), `asset` (B7), `material_item`.

New, each needing its one-line reason in the spec:

- `expense(id, campus_id, spent_on, amount, vendor_id, category_code, cost_stream, class_id?, school_event_id?,
  activity_code?, asset_id?, paid_from: float|bank|personal, float_id?, payment_mode, bill_quality:
  vendor_bill|payment_proof|none, receipt_path?, status: draft|submitted|approved|voided, void_reason?,
  source: portal|recurring|import, created_by_staff_id)`
- `expense_line(expense_id, label, quantity?, unit?, amount?, material_code?)`: read from the bill. Optional, but
  it is what makes repeat-buy and price history possible.
- `float(id, campus_id, custodian_staff_id, size)` and `float_move(id, float_id, kind: spend|topup|adjust, amount,
  expense_id?, approval_id?, at)`: append-only.
- `vendor(id, name, kind, rate jsonb, schedule jsonb)`: rates are settings-like; check whether a `config` row is enough.
- `budget(id, scope: category|event, campus_id?, category_code?, school_event_id?, month?, amount)`
- `stock_location(id, campus_id, name)`, `stock_level(location_id, material_code, quantity, minimum)`,
  `stock_move(id, location_id, material_code, quantity, kind: in|out|count|writeoff, class_id?, list_id?, by, at)`:
  append-only; the level is a view or rebuilt (Ring B).

Rupees are numeric with two decimals. Amounts belong to the school's tenant, never to a person in any public file.

## 7. Decisions Nimish must give before MM-0 (from the plan's last tab)

1. Approval limits: custodian up to ₹2,000 within budget; the founder (academics) ₹2,000–10,000; the finance founder
   above ₹10,000, all capex and anything over budget.
2. Floats: Gurukul ₹15,000, Neev ₹10,000. Who funds them, and is a school UPI account possible?
3. The finance founder's direct vendor payments go into the same system from January (recommended: yes).
4. Set up Teacher OS properly: two campuses, the missing classes, two `ops` staff.
5. Parallel run through December; Teacher OS is the only record from 2027-01-01.
6. Catalogue owner: the curriculum lead approves the catalogue drafted from activity notes.
7. Staff hospitality policy (daily tea at Neev, celebrations).
8. Sports Day 2026: is the ₹25,000 cap or the ₹40,000 budget approved? This is the first event run against a budget.

Plus C1–C6 above.

## 8. Real-data scenarios (D-028: never dummy)

| Scenario | Source | Expected output fixed by |
|---|---|---|
| Receipt reader | 20 bills from the "November 2026" and "October 2026" folders | The ledger amount on the matching line (`bill_match_by_line`); a person confirms the 20 |
| Category suggester | `expense_lines` (1,301 labelled lines): train on half, test on half | The Sheet's `category` column, reviewed by Nimish |
| Recurring bills | The water tanker lines Jul–Nov 2026 (7–9 loads a month) | The ledger totals per month |
| Month-end close | December 2026 parallel run | The TLMs Reimbursements December total equals the portal's total |
| Event budget | Sports Day, 5 and 12 Dec 2026 | The approved budget (decision 8) vs actual spend |
| Materials intake | 1,499 activity `materials` notes | The curriculum lead checks a sample of 50 |

Model costs: forecast before any priced run and stay under a cap Nimish sets (standing orders). Code checks every
number a model reads; a person confirms every amount.

## 9. What to do in the first session

1. Run `bin/roadmap check` here. In the code repo, read the files in §1.
2. Check the drift in §3 with one batched SELECT, and write down what is actually live.
3. Write `blueprint/money.md` (B14) as a chapter in the house style (plain English, sources, "unverified" where
   unsure), and add the C4–C6 changes to `operations.md` as proposals.
4. Bring Nimish the decisions in §7 and C1–C6 in one message. After he answers: record the D- entries, add the MM-
   tasks to `roadmap.toml` (bump `version`, add a changelog line), and run `bin/roadmap check` and `bin/roadmap render`.
5. In the code repo, open `CP-<n>: Money MM-0 set-up` with `to-spec`, and wait for the approval comment on the issue.
6. Build MM-0 test-first in a small PR. Then MM-1, showing Nimish the live screen behind his staff login (D-076).
7. Rewrite `blueprint/HANDOFF.md` at the end, in under 50 lines.

## 10. Guardrails

- **Privacy:** staff by role in git. Receipts in a private bucket. No person-level amounts in the public repo. No
  child data anywhere in this module.
- **Never write to live through the Supabase tool.** Only migrations and engine commands.
- **One database change at a time.** Never push to `main`. Merge only when CI is green (code repo) or
  `bin/roadmap check` passes (this repo).
- **Don't decide an O- item yourself.** Propose it, with a recommendation.
- **Status is live counts.** Say what is live with numbers read from the database.

## 11. Numbers to keep in mind (from the review; source: the expense Sheet)

- Last 12 months (Dec 2025 – Nov 2026): ₹5,67,782 across 439 lines. Jun–Nov 2026 is +118% on Jun–Nov 2025.
- Capex through petty cash: ₹1,18,367 in 12 months. Events: ₹97,384. Utilities: ₹91,274, of which the water tanker
  is ₹45,750.
- 54% of lines are under ₹500 but they are 8% of the money. 72% of the money is in 85 lines of ₹2,000 or more.
- Receipts: 78% are uploaded the same day; about 90% of the money since Dec 2025 has a matching file. But 22% of
  lines rely on a GPay screenshot only, and 4% have nothing.
- Late "pending" settlements: 36 (₹65,315). Advances: 12 (₹63,200).
- Cost per child is below the financial model's norms (repairs about ₹670 against ₹1,500; events about ₹840
  against ₹3,000; about 116 children, unverified). The problem is control and planning, not overspending.
