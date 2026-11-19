/**
 * U103 (CP-60, issue #793) — a voice note from the lesson. Nimish, 16 Nov 2026: "I'm on the rubric but there is no way to put a voice note
 * directly." The lesson's Record button is in the timetable's lesson panel (on its rubric) and in the lesson page's Rubric tab, for the
 * lesson's own educator while recording is on; the note is the same one the lesson page's main action makes, and it arrives in the notes
 * queue naming the lesson. The children's marks and the note are saved separately. Stands on the U74 class (tests/timetable-rows.ts),
 * held by the signed-in tester; the browser's recorder is a stand-in (no recording of anyone).
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import postgres from "postgres";
import { sessionFor } from "./inventory-fixtures";
import { timetableSwitch } from "./educator-screens";
import { voiceSwitch } from "./k2-rows";
import { timetableRows, type Fixture } from "./timetable-rows";
import { aPerson, personAsStored } from "./rows";
import { SIGNED_IN } from "../playwright.config";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const ACTIVITY = "U103-ACT";
const OTHER = { email: "u103-coordinator@cornerstone.test", name: "Voice Coordinator", role: "coordinator", classes: [], subjects: [] };
let f: Fixture;
let lesson = "";
let day = "";
let wasOn = false;

const notesOf = (session: string) => sql<{ id: string; status: string }[]>`select id::text, status from pii.educator_note where session_id = ${session} order by created_at`;
const marks = async () => (await sql<{ n: number }[]>`select count(*)::int as n from activity_observation o join session s on s.activity_code = o.activity_code where s.id = ${lesson}`)[0].n;

/** A browser whose microphone says yes, and whose recorder hands back a few kilobytes of silence. */
async function allowedMicrophone(c: BrowserContext) {
  await c.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.resolve({ getTracks: () => [{ stop() {} }] } as unknown as MediaStream);
    class FakeRecorder {
      mimeType = "audio/webm";
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {}
      stop() {
        this.ondataavailable?.({ data: new Blob([new Uint8Array(4096)], { type: "audio/webm" }) });
        this.onstop?.();
      }
    }
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder;
  });
}
const record = async (page: Page, scope: string) => {
  await page.locator(`${scope} [data-record]`).click();
  await page.locator(`${scope} [data-stop]`).click();
  await expect(page.locator(`${scope} [data-playback]`)).toBeVisible();
  await page.locator(`${scope} [data-send]`).click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
};

test.beforeAll(async () => {
  f = await timetableRows(sql);
  if (!(await personAsStored(sql, OTHER.email))) await aPerson(sql, OTHER);
  await sql`insert into activity (tenant_id, code, band, strand, name, sheet_no) values (${f.tenant}, ${ACTIVITY}, 'K1', 'Maths', 'U103 counting bears', '103') on conflict (tenant_id, code) do nothing`;
  [{ id: lesson, day }] = await sql<{ id: string; day: string }[]>`
    select s.id::text as id, d.on_date::text as day from session s join school_day d on d.id = s.school_day_id
    where s.school_class_id = ${f.klass} and d.on_date = ${f.days[2]}::date and s.subject_code = 'NUM' order by s.period_id limit 1`;
  await sql`update session set activity_code = ${ACTIVITY} where id = ${lesson}`;
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled'), false) as on`;
  wasOn = r.on;
  await timetableSwitch(sql, true);
  await voiceSwitch(sql, true);
});
test.afterAll(async () => {
  await voiceSwitch(sql, false);
  await timetableSwitch(sql, wasOn);
  await sql.end();
});

test("the timetable's lesson panel has Record on its rubric: Record, Stop, Send makes one note naming this lesson, and marks no child", async ({ browser }) => {
  const c = await browser.newContext({ storageState: SIGNED_IN, viewport: { width: 1440, height: 1000 } });
  await allowedMicrophone(c);
  const page = await c.newPage();
  const [before, marked] = [(await notesOf(lesson)).length, await marks()];
  await page.goto(`/timetable?class=${f.klass}&view=day&day=${day}&open=lesson:${lesson}`);
  await expect(page.locator("[data-block=DetailPanel] [aria-label=\"How to mark\"] [data-record]")).toBeVisible(); // on the rubric itself
  await record(page, "[data-block=DetailPanel] [aria-label=\"How to mark\"]");
  const rows = await notesOf(lesson);
  expect(rows).toHaveLength(before + 1);
  expect(rows.at(-1)!.status).toBe("received");
  expect(await marks()).toBe(marked); // the note and the children's marks are saved separately
  await c.close();
});

test("the lesson page's Rubric tab has Record too, and its note names the lesson", async ({ browser }) => {
  const c = await browser.newContext({ storageState: SIGNED_IN, viewport: { width: 1440, height: 1000 } });
  await allowedMicrophone(c);
  const page = await c.newPage();
  const before = (await notesOf(lesson)).length;
  await page.goto(`/period/${lesson}`);
  await page.getByRole("tab", { name: "Rubric" }).click();
  await record(page, "[data-tab-body=rubric]");
  expect(await notesOf(lesson)).toHaveLength(before + 1);
  await c.close();
});

test("the note arrives in the notes queue naming the lesson's activity", async ({ page }) => {
  await page.goto("/notes");
  await expect(page.getByText("U103 counting bears").first()).toBeVisible();
});

test("a coordinator who does not hold the class has no Record in the panel: it is the lesson's own educator's", async ({ browser }) => {
  const c = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 1440, height: 1000 } });
  await c.addCookies([{ name: "cs_staff", value: sessionFor(OTHER.email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  const page = await c.newPage();
  await page.goto(`/timetable?class=${f.klass}&view=day&day=${day}&open=lesson:${lesson}`);
  await expect(page.locator("[data-block=DetailPanel] [data-panel-title]")).toBeVisible();
  await expect(page.locator("[data-record]")).toHaveCount(0);
  await c.close();
});
