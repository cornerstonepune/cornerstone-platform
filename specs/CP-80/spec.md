# CP-80: Money screens — file a claim, my claims, to approve, to pay, the rules

Go-ahead from Nimish in chat, 2026-11-19: build the screens in parallel; people upload the bill and type the entry (no bill reading); get the UI/UX, the flows and
the way information moves right. Depends on CP-76 to CP-79 (the engine they call).

## The flows (what a person does, in order)

**Every member of staff — Money, "My claims" (`/money`).** One menu line, *Money*. It opens on my claims, newest first, one card each: the vendor, the amount in
rupees (`₹4,50,000.00` grouping), the date, the category, and a status chip that says in words where it stands and what happens next: *Submitted — waiting for
your campus's operations lead*; *Sent back — "the bill is not attached"*, with **File it again**; *Approved — waiting to be paid*; *Paid on 12 Nov, ref UTR-1*;
*Withdrawn*; *Voided — "reason"*. A card opens in the detail panel (the site's pattern): the details, the bill's picture, **Withdraw** while submitted, **Add the
bill** when it has none. The one primary button is **New claim**. Empty: "You have not filed a claim yet" with that button.

**File a claim (`/money/new`).** One short form, top to bottom: the bill (a photo from the camera or a file; optional now, the claim says "no bill yet" and it
can be added later), the amount, the date (today), who was paid, what for (the school's categories), the campus (shown only when the person acts for more than
one), a note. Words say what is wrong, beside the field. **File the claim** is the one action. On success: back to My claims with the new card open and one line,
"Filed. It is with your operations lead." *File it again* opens this form with the sent-back claim's fields filled in. Phone-gate screen: a photographed bill is
the common case.

**Operations lead and founders — "To approve" (`/money/approve`).** Only for people who may approve; the tab shows a count. The claims waiting, oldest first, for
the campuses the person acts for; each row: who filed it (their name), the vendor, the amount, the date, a small bill picture. Opening one shows the bill large and
the details; two buttons: **Approve**, and **Send back** which asks for the reason (required) in place. After either, the next claim opens by itself, so a pile is
cleared without going back to the list. Empty: "Nothing is waiting for you."

**Founders — "To pay" (`/money/pay`).** Approved claims, oldest first, with the amount large. **Mark paid** asks the date (today), how (UPI, cash, bank transfer) and the
reference; after it the next claim opens. Empty: "Nothing is waiting to be paid."

**Founders — Rules (`/money/rules`; also a card on Setup).** The money rules in plain words and plain fields: the limits and deadlines as labelled number fields
with their unit ("Flag a bill still missing after [48] hours"), who approves and who pays each kind of claim as a sentence the person can change from a short list,
where the operations lead sits, the categories as a list to add to, remove from and reorder. A change asks for a reason (optional) and **Save the rules**; if the
rules cannot work, the engine's words show at the top. Below, the history in words: "Aseem raised the payment-screenshot limit from ₹500 to ₹700, 19 Nov — reason".
A person who may not change the rules sees the rules, read-only.

**The tabs.** *My claims · To approve (n) · To pay (n) · Rules* in one row at the top of every Money page; a tab a person has no use for is not drawn. The number is
the count of what waits on them.

## Contract: the engine routes (all `POST`, JSON, `actor` = the person's email as everywhere; an error is a 4xx with `{"detail": "words"}`)

Money is a string with two decimals in and out (`"450.50"`); dates are `YYYY-MM-DD`; a person is shown by first name and never by id or email.

- `/money/access` `{actor}` → `{"can": {"approve": bool, "pay": bool, "set_rules": bool}, "campuses": ["Gurukul"], "counts": {"approve": n, "pay": n}}`
- `/money/form` `{actor}` → `{"categories": [...], "campuses": [...], "today": "YYYY-MM-DD"}`
- `/money/claims/create` `{actor, amount, spent_on, vendor, category, campus, note?, bill_b64?, bill_ext?}` → `{"id"}`
- `/money/claims/mine` `{actor}` → `{"claims": [Claim]}`
- `/money/claims/withdraw` `{actor, id}` → `{}`
- `/money/claims/add_bill` `{actor, id, bill_b64, bill_ext}` → `{}`
- `/money/claims/bill` `{actor, id}` → `{"content_type", "b64"}`; allowed to the claimant, to a person who may approve it, and to a person who may pay
- `/money/queue` `{actor}` → `{"approve": [Waiting], "pay": [Waiting]}`
- `/money/approve` `{actor, id}`, `/money/send_back` `{actor, id, reason}`, `/money/pay` `{actor, id, paid_on, mode, ref}` → `{}`
- `/money/rules/get` `{actor}` → `{"rules": {...}, "categories": [...], "version": n, "can_set": bool, "history": [{"version", "on", "by", "reason", "changes": ["words"]}]}`
- `/money/rules/set` `{actor, rules, categories, reason?}` → `{"version"}`

`Claim` = `{id, amount, spent_on, vendor, category, campus, status, reason, paid_on, payment_ref, has_bill, next}` where `status` is one of `submitted`,
`sent back`, `approved`, `paid`, `withdrawn`, `voided` and `next` is the sentence saying what happens next. `Waiting` = `Claim` plus `claimant` (first name), `note`.

## Done when

1. A member of staff files a claim with a bill photo from the form, sees it in My claims with its status in words, withdraws it, and files it again from a sent-back one.
2. An operations lead approves or sends back (with a reason) the claims of the campus they act for, from a queue that opens the next claim by itself; a person who may not
   approve sees no To approve tab and is refused if they go to the address.
3. A founder marks an approved claim paid with the date, mode and reference; the claimant sees it paid with the date and reference.
4. A founder changes a limit and the categories on the Rules screen, with the history in words below; a person who may not change them sees them read-only; rules that cannot
   work are refused in the engine's words.
5. Money is one menu line for everyone; the tabs show only what a person can use and the counts are right.
6. Each screen is checked at 1440 px and at 400 px (no sideways scroll, controls of at least 44 px), and File a claim is a phone-gate screen.

## Out of scope

Reading the bill by a model (not wanted: people type the entry); floats, budgets, exceptions, the monthly report, vendors, capex, stock (MM-4 onward); notifying by message.
