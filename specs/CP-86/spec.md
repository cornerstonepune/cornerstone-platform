# CP-86: Record what arrived, from the claim that bought it

The loop's last link on the buying side: the buy list makes a purchase, the purchase is a claim, and when the goods arrive the keeper
records them into stock against that claim. Today a keeper can name a claim on a stock-in, but only from the Stock page, one item at a time.

## Done when

1. A keeper of a campus sees **Record what arrived** on an approved or paid claim of that campus, in the claim's panel (My claims and To pay).
   A person who keeps no store never sees it.
2. It opens a form on that claim: any number of items (each picked with the item picker) and a quantity each; saving records one stock in per
   item, each naming the claim.
3. The claim then reads what arrived, item by item, with the date; recording more later adds to it (a correction is a new move).
4. A claim of another campus is refused to a keeper who does not act for that campus, in words.

## Out of scope

Matching a claim's amount to item prices; reading the bill; making a claim from the buy list (a later slice); a claim that arrives in parts
with a status of its own.

## Data

None new: `stock_move.expense_id` already names the claim (CP-82). One read route: what arrived against a claim.
