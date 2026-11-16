---
name: materials
version: 1
mode: write
writer_model: claude-sonnet-5-5
validator_model: claude-opus-5-5
active: false
sources:
  - the activity's title and steps, as given
  - the catalogue of materials the school holds (name and unit), as given
  - the group size and the class size, as given
  - the school's own materials text for the activity, where one is given, kept in its own words
replaces:
  purposes: [k2_materials_split, materials_read]
  # nearest real bar: "found" (the share of the items a person marked that the list confirmed); eval.materials_read.confirmed_wrong_at_most and held_back_right are about reading a request, not writing a list
  eval: {purpose: materials_read, measure: found}
---
# Materials

A materials list says what an educator must gather to run one activity: one line for each item, saying how many, in what
unit, for whom and whether it is used up. The list is read by the person who gets the materials ready, so a wrong name or
a wrong count means a lesson that cannot start.

## The standard

1. **One line for each item the steps use.** Read the steps and list every thing a step needs, and nothing it does not use.
   The child, the educator, the floor and the room are never listed.
2. **Catalogue names only.** `item` is a name copied from the catalogue, exactly. If a step needs a thing the catalogue does
   not hold, leave it off the list (a person adds it); never invent a name or use a near one.
3. **One line for each item.** An item is never on two lines. If it is used both by each child and by the class, give the
   larger need on one line.
4. **Quantity is a number more than 0**, counted in `per`, not in total. "2 dice per group" is `quantity` 2, `per` group.
   It is the number the steps need and no more; never a guess for "enough".
5. **Unit is the catalogue's unit** for that item (piece, set, sheet, metre), unchanged.
6. **`per` is child, group or class.** Take it from the steps: what each child uses for themself is per child; what a pair
   or group shares is per group (with the group size given); what is shared by everyone, such as a rope across the room, is
   per class.
7. **`kind` is consumable or reusable.** Consumable when the activity uses it up or marks it (paper that is torn, cut or
   written on, glue used, plates that are drawn on). Reusable when it can be put away and used again (counters, dice,
   blocks, scissors).
8. **The school's words.** "Educator", never "teacher"; "exchange" or "regroup", never "borrow".
