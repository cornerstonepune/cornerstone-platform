# Glossary

_Domain terms, one line each. Agents use these words exactly in code, tickets and UI. Maintained by `domain-modeling` during Plan._

| Term | Means | Not to be confused with |
|---|---|---|
| educator | a member of staff who teaches a class | "teacher" (never in anything a parent sees) |
| coordinator | staff who approve skills, timetables and reports, and see all classes | |
| staff | anyone on `pii.staff`; the only people who sign in | parents (never sign in) |
| campus | Gurukul (K2–G4) or Neev (PG–K1) | |
| acting as | a coordinator viewing as another role; changes the view, never the permission | a permission grant |
| skill | one thing a child can do, with its registry id as issued (`NUM.OPS.01`) | learning objective |
| skill set | a skill described at its four levels | |
| difficulty | Easy, Medium, Hard, Advance | L−/L0/L+, Level A/B |
| rung | internal ladder step R1–R14, X1, X2 | never shown on an educator's screen |
| band | grade band G1–G4 | |
| case / taxonomy case | the kind of question a template asks, derived by code | anything typed by a person |
| learning objective | the curriculum's atom; links activities to skills | skill |
| activity | a lesson activity under an objective (strand / head) | |
| blueprint | the slots a paper asks for | sheet template |
| item / question | one question in the bank | |
| template | the unit of trust a question is generated from | |
| misconception | a known wrong method (`M_…` procedural, `M0nn` external) | |
| predictor | code that computes the wrong answer a misconception gives | |
| verifier | code that checks what a model wrote | a person's approval |
| exchange / regroup | carrying in column arithmetic | "borrow" (never) |
| three signals | blank, wrong, wrong-with-working; always kept distinct | |
| week declaration | the educator's statement of what was taught this week | |
| prescription | which skill and level a child gets next, and why | |
| sheet template | a paper's design | sheet instance |
| sheet instance | one printed copy for one child, with QR `CS` + 6 hex | sheet template |
| spare | an extra unassigned copy in a pack | |
| pack | a class's printed papers, in order, with a key | |
| home paper | a paper sent home after the class picture | |
| custom paper | a paper made for one child by hand | |
| capture / scan | a photographed page | |
| reader | PaddleOCR digit reading | vision models (rejected, ADR 0019) |
| confirm queue / answers to check | read answers a person must settle | |
| sign off | an educator's approval that a paper's results stand | |
| item result | what a child answered on one question | evidence event |
| evidence event | one append-only signal about a child on a skill; a correction is a new row | item result |
| child skill state | not_enough_yet, patterned, emerging, practising, secure, stretch_ready; written or observed | |
| status colour | green, amber, red, grey; a child is never shown red | |
| class picture / class card | every child on one skill or all skills, built on request | |
| parent report / parent note | words for parents; two approvals per line, needs consent | |
| approval | an append-only sign-off row; there is no approve-all | |
| curriculum proposal | a machine-made curriculum change waiting for a person | |
| prompt | a versioned row; a new version needs `engine eval` scored before it's active | a string in code (a defect) |
| eval case | a scored example a prompt version is tested on | |
| flow_run | one logged run of a flow, with its cost | |
| machine-made vs person | the `source` of a row; machine data never overwrites a person's edit | |
| fortnight / week A, B | the two-week timetable pattern | |
| period / session / lesson | a timetable slot / a taught lesson | |
| voice note / educator note | a K2 educator's spoken note; children said as numbers | |
| note claim | a mark drawn from a voice note, confirmed by its educator | |
| materials line | a material an activity needs on a day | catalogue item |
| catalogue item | one entry in the single materials list | |
| stock move | an append-only change in stock on hand | |
| buy list | what to buy, from stock and materials lines | |
| claim | a staff expense filed with its bill, approved then paid (`expense`) | |
