/**
 * M1-13c — the page part, drawn once (goals/m1-13c-page-part-component.yaml). Nimish's brief via the orchestrator: lift the
 * rendering of one part of an activity page (its words, who wrote them) out of /curriculum into one shared component that
 * takes its actions and its gate as props, so every screen that shows a part draws it the same way, each with its own
 * actions. The old /curriculum pages are gone; the activity's screen (/setup/activities/<code>) is where a part is drawn now.
 * Not kept with them: the drafts' queue drew a part as a bordered card with its slip's keyword in the state's colour; no
 * screen draws that card now (the activity's screen draws parts in folds), so its two style checks went with it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { code, curriculumRows, gate } from "./m1-13-rows";

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

test("the activity's screen draws its parts with the component and keeps no copy of it", () => {
  const screen = read("app/(app)/setup/activities/[code]/page.tsx");
  expect(screen).toContain('from "@/components/page-part/part"');
  expect(screen).not.toMatch(/export function (Words|Origin)\b/);
});

test.describe("drawn on a real page", () => {
  const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
  test.beforeAll(async () => {
    await curriculumRows(sql);
    await gate(sql, "reviewer");
  });
  test.afterAll(async () => {
    await gate(sql, "closed");
    await sql`delete from activity_skill where activity_code like 'ACT-K2-M113-%'`;
    await sql`delete from activity where code like 'ACT-K2-M113-%'`;
    await sql.end();
  });

  test("the component draws whose words each part is on the activity's page", async ({ page }) => {
    await page.goto(`/setup/activities/${code(2)}`);
    await expect(page.locator("[data-part=thinking] .pp-origin")).toContainText("Drafted, check me");
    // and the school's own words on the activity's page carry the school's origin
    await expect(page.locator("[data-part=objective] .pp-origin")).toContainText("The school's words");
    await expect(page.locator("[data-part=steps] .pp-origin")).toContainText("Drafted, check me");
    await expect(page.locator("details[data-fold=steps] li")).toHaveCount(2);
  });
});
