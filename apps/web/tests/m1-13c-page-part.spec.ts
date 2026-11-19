/**
 * M1-13c — the page part, drawn once (goals/m1-13c-page-part-component.yaml). Nimish's brief via the orchestrator: lift the
 * rendering of one part of an activity page (its words, who wrote them) out of /curriculum into one shared component that
 * takes its actions and its gate as props, so every screen that shows a part draws it the same way, each with its own
 * actions. The old /curriculum pages are gone; the activity's panel (components/curriculum-panel.tsx), on Curriculum and opened full page at
 * /setup/activities/<code>, is where a part is drawn now; a part the machine made carries the one machine symbol (CP-48).
 * Not kept with them: the drafts' queue drew a part as a bordered card with its slip's keyword in the state's colour; no
 * screen draws that card now (the activity's panel draws parts as a list), so its two style checks went with it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const root = path.resolve(__dirname, "..");
const read = (f: string) => readFileSync(path.join(root, f), "utf8");

test("the component draws a part's words and origin and carries no gate, engine call or action of its own", () => {
  const part = read("components/page-part/part.tsx");
  expect(part).toMatch(/export (async )?function PartView\b/);
  expect(part).toMatch(/export function Words\b/);
  expect(part).toMatch(/export function Origin\b/);
  expect(part, "its actions are props").toMatch(/actions\??: React\.ReactNode/);
  expect(part, "its editor is a prop").toMatch(/editor\??: React\.ReactNode/);
  for (const forbidden of [/@\/lib\/auth/, /@\/lib\/engine/, /lib\/curriculum-screens/, /use server/, /requireStaff/, /from "next\/navigation"/]) expect(part, String(forbidden)).not.toMatch(forbidden);
});

test("the component and its styles use tokens only, and its icons come from the one Lucide lookup", () => {
  for (const f of ["components/page-part/part.tsx", "components/page-part/page-part.css", "lib/page-part.ts"]) {
    const text = read(f);
    expect(text, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
  }
  expect(read("components/page-part/part.tsx")).toContain('from "@/lib/icons"');
});

test("the activity's panel and its own page draw their parts with the component and keep no copy of it", () => {
  // the activity's page and Curriculum's panel draw the same blocks (components/activity/blocks.tsx), and those draw a part with the component
  expect(read("components/activity/blocks.tsx")).toMatch(/from "@\/components\/page-part\/part"/);
  for (const f of ["components/curriculum-panel.tsx", "components/activity-page.tsx"]) {
    const screen = read(f);
    expect(screen, f).toMatch(/from "\.\/activity\/blocks"/);
    expect(screen, f).not.toMatch(/export function (Words|Origin)\b/);
  }
  expect(read("app/(app)/setup/curriculum/page.tsx")).toContain('from "@/components/curriculum-panel"');
  expect(read("app/(app)/setup/activities/[code]/page.tsx")).toContain('from "@/components/activity-page"');
});
