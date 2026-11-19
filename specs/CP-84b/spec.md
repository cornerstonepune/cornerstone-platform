# CP-84b: The Catalogue page and the item picker

The screens of CP-84 (specs/CP-84/spec.md): one list of materials, grouped by category, picked from, never typed twice.

## Done when

1. `/setup/catalogue` (a Catalogue card on Setup): every item grouped by category, "needs a category" first; a search; each item
   shows its unit, approved words and category. A coordinator or above changes an item's category; everyone else reads it.
2. A coordinator or above can teach a word: pick a word that uncategorised items end with and a category; every uncategorised
   item ending in that word takes the category and the word is kept for the next fill (a row of `materials.category_words`). A
   category a person set is never changed by it.
3. One item picker, used wherever an item is chosen: searchable, grouped by category; typing a name close to an existing item
   shows "Did you mean" and makes no second item; "Not in the list? Add it" asks name, unit and category and picks the new item at once.
4. Stock in uses the picker, so a keeper can record the first stock of an item the campus has never held.
5. The class list's add-an-item uses the picker (no free text reaches a list).
6. 1440 px and 400 px (no sideways scroll, controls of at least 44 px); the design-system guard covers the new page; the guide has
   a page for it; every page checks who is asking itself.

## Out of scope

Alternatives, "pencils or crayons" (CP-85); merging two items that already exist; a vendor or a price on an item.
