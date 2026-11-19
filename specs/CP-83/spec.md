# CP-83: Fill the catalogue from the school's activity notes (every band, not only K2)

## What

`material_item` and `activity_material` are empty on live. 1,423 activities carry a materials note (G1 224, G2 317, G3 247, G4 62,
K2 573). The splitter that reads a note into catalogue items (`engine curriculum materials`) is wired to the K2 run's band only,
and has never been run live. Make it run for any band the school names, with one forecast of the whole run first.

## Done when

1. `engine curriculum materials --stage <s> --band G1 --band G2 --dry-run` prints one forecast that counts the unsplit
   notes of both bands; with no `--band` it works as it did (the K2 run's band).
2. A real run over several bands records a ledger proposal for every note of every named band, with the same checks
   (an item the school's text does not name goes to a person).
3. `--band all` means every band that has a materials note; a band the school does not have is refused in words, naming the
   school's bands.
4. Applying the proposals makes catalogue items and activity links for those activities (items keep no invented home,
   value or quantity).

## Out of scope

Running it on live (a person with live access, after reading the dry-run forecast); a unit or a value for an item; a screen
to merge two items that are the same thing (`/curriculum/review` already shows what the check could not settle).
