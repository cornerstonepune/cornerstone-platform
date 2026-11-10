# UI-4c: the shared inventory class has twelve children

The class U70A (`tests/inventory-fixtures.ts`) now has twelve children, Sr. Nos 1 to 12 (was six), so one assessment of the class has more than ten copies and a screen can show its second page of them (`when: "paged"`). The other class (U70B, a class the educator does not hold) has fourteen, named from the rest of `tests/fake-names.ts` (`FAKE_CHILDREN` 12 to 25), so no name is in both.

One literal follows it: `u13-frame` "8. search is a typeahead" typed Sr. No. 7 as "a number that exists only in a class the educator does not hold". U70A now has a seventh child, so it types 13, which only U70B has. The assertion is the same.

Ran locally: `u13-frame`, `u70-inventory-proof`, `u13-route-walk` (21 pass).
