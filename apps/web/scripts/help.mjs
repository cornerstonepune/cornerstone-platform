// The help page's sections, generated from docs/frontend/screens.json (UI-12): one section per screen, so a screen added to the
// inventory has its help the day it is added, with no hand edit. tokens.mjs writes the result to design-system/help.json
// (the same way it writes built.json) and `node apps/web/scripts/tokens.mjs --check` fails when the file is stale.

/** The words under "What each control does": the control's label, then what the inventory says it does. */
function does(e, byId) {
  const says = e.effect ?? e.note ?? (e.to && byId.get(e.to) ? `Opens ${byId.get(e.to).title}.` : "");
  return { label: e.label, says };
}

/** screens.json → { sections: [{ id, title, eyebrow, group, route, purpose, does }] } in the inventory's order. */
export function help(screens) {
  const byId = new Map(screens.screens.map((s) => [s.id, s]));
  return {
    sections: screens.screens.map((s) => ({
      id: s.id,
      title: s.title,
      eyebrow: s.eyebrow ?? s.title,
      group: s.group,
      route: s.route,
      purpose: s.purpose,
      does: s.elements.filter((e) => e.t !== "child_name").map((e) => does(e, byId)),
    })),
  };
}
