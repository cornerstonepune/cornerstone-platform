// The help page's sections, generated from docs/frontend/screens.json (UI-12): one section per screen, so a screen added to the
// inventory has its help the day it is added, with no hand edit. tokens.mjs writes the result to design-system/help.json
// (the same way it writes built.json) and `node apps/web/scripts/tokens.mjs --check` fails when the file is stale.
//
// Only what a person sees goes in: the screen's title and purpose, and each control's label. The inventory's `effect`, `note` and
// `to` are written for builders (table names, block names) and never reach the help. An element may carry `help`, one sentence in
// the school's words, and then the help says it; u12-outside-the-bar.spec.ts holds every word of the result to the school's words.

/** "rail: Notes" is the link "Notes": the place a control sits in is the inventory's, not the person's. */
const seen = (label) => label.replace(/^(rail|page|peek|capture|next step|details):\s*/i, "");

/** screens.json → { sections: [{ id, title, eyebrow, group, route, purpose, does }] } in the inventory's order. */
export function help(screens) {
  return {
    sections: screens.screens.map((s) => ({
      id: s.id,
      title: s.title,
      eyebrow: s.eyebrow ?? s.title,
      group: s.group,
      route: s.route,
      purpose: s.purpose,
      does: s.elements.filter((e) => e.t !== "child_name").map((e) => ({ label: seen(e.label), ...(e.help ? { says: e.help } : {}) })),
    })),
  };
}
