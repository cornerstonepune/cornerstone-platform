# CP-84: One list of materials, with categories: pick from it, add to it, never type a second "pencils"

Nimish, chat, 2026-11-19: materials are a proper list of items with categories, picked from a list; something not in the list
is added as a proper item, so "pencils" and "PENCIL pencils" never both exist.

## What today does (checked)

A class's list only takes a catalogue item (a free name is refused). A new item goes through `propose_item`, which only catches
the same name in a different case. There is no category on an item. The 1,423 activity notes are still free text; the real
words show the split already: "pencil" 87 times and "pencils" 40, "bowl" and "bowls", "crayon" and "crayons".

## What

1. **A category on every item**, one of the school's own categories (the same words money uses, a setting), so a purchase of an
   item files under its money category and budget with no re-typing.
2. **One thing, one item.** A name that is the same words as an item, or as a word a person approved for it, in any case, spacing
   or plural, is that item. Close names are offered as "did you mean".
3. **One list to pick from**, grouped by category, searched by name and approved words; "Not in the list? Add it" asks for name,
   unit and category.

## Done when

1. A catalogue item has a category from the school's list; one with none reads "needs a category".
2. `engine materials categorise` gives every item with no category the one its words name (rows of `materials.category_words`; a
   plural matches its singular), leaves the rest "needs a category", and never changes a category a person set.
3. "PENCIL pencils", "Pencils " and "pencil" are one item with "pencils": `propose_item`, and the apply step of the catalogue fill,
   return the existing item and make no second. "colour pencils" is a different item and is offered as close, never merged.
4. `POST /materials/items/search {actor, q?}` returns the items grouped by category, matching the name and approved words, and the
   close names for what was typed.
5. A new item needs name, unit and category; it is usable at once and waits for a person to give it a home and a value (as now). A
   person can set or change an item's category; the history is kept.

## Out of scope (own specs)

The screens: the Catalogue page and the picker on the class list and stock forms (CP-84b). Alternatives, "pencils or crayons"
(CP-85). Merging two items that already exist.

## Data

One column: `material_item.category text` (membership checked in the engine against the setting, because the list is a setting).
One setting: `materials.category_words` (word to category), drafted from the real notes; no new table.
