/**
 * U95 — Record merged into the lesson (docs/frontend/page-charter.md Part C, "Record: merge into B4: recording happens on the lesson").
 * Everything the Record page did is on /period/<id>: the voice note's Record, Stop, Send as the page's action, Type the marks, Add a photo,
 * the 48-hour line, and, in the History tab, who is not yet seen on the activity and the class's latest notes. The old address answers 308:
 * to the lesson it named, or to Today when it named none. Rows are the spec's own: a K2 class "U95R" (tests/k2-rows.ts, 22 children known
 * by Sr. No.) held by the signed-in tester, and one lesson of today with activity 904. No recording of anyone: the browser's recorder is a
 * stand-in. The voice and timetable switches are on only inside the spec.
 */
import { expect, test, type BrowserContext } from "@playwright/test";
import postgres from "postgres";
import { timetableSwitch } from "./educator-screens";
import { aK2Note, k2Class, k2Lesson, noNotesWaiting, voiceSwitch, type K2 } from "./k2-rows";
import { SECTIONS } from "../lib/menu";
import { SIGNED_IN } from "../playwright.config";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
let k: K2;
let lesson: string;

const notesOf = (session: string) => sql<{ id: string; status: string; audio_key: string | null }[]>`select id::text, status, audio_key from pii.educator_note where session_id = ${session} order by created_at`;
const phone = { width: 400, height: 800 };

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

test.beforeAll(async () => {
  k = await k2Class(sql, "U95R");
  lesson = await k2Lesson(sql, k.klass, "03:47");
});
test.afterAll(async () => {
  await voiceSwitch(sql, false);
  await timetableSwitch(sql, false);
  await sql.end();
});
test.beforeEach(async () => {
  await voiceSwitch(sql, true);
  await timetableSwitch(sql, true);
  await noNotesWaiting(sql, k);
});

test("the old Record address answers 308: to the lesson it named, else to Today; no menu line leads there", async ({ page }) => {
  for (const [from, to] of [
    [`/record?session=${lesson}`, `/period/${lesson}`],
    [`/record?class=${k.klass}&session=${lesson}`, `/period/${lesson}`],
    [`/record?class=${k.klass}`, "/today"],
    ["/record", "/today"],
  ]) {
    const res = await page.request.get(from, { maxRedirects: 0 });
    expect(res.status(), from).toBe(308);
    expect(new URL(res.headers().location, "http://localhost").pathname, from).toBe(to);
  }
  expect(SECTIONS.flatMap((s) => s.pages.flatMap((p) => [p.href, ...p.match])).filter((h) => h.startsWith("/record"))).toEqual([]);
  await page.goto(`/period/${lesson}`);
  await expect(page.locator('a[href^="/record"]')).toHaveCount(0);
});

test("Record, Stop, Send on the lesson writes one note with this lesson's id, status received, and nothing in activity_observation", async ({ browser }) => {
  const c = await browser.newContext({ storageState: SIGNED_IN });
  await allowedMicrophone(c);
  const page = await c.newPage();
  const before = (await notesOf(lesson)).length;
  await page.goto(`/period/${lesson}`);
  await page.locator("[data-ux=action] [data-record]").click();
  await page.locator("[data-stop]").click();
  await expect(page.locator("[data-playback]")).toBeVisible();
  await page.locator("[data-send]").click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await expect(page.locator("[data-reading]")).toContainText("Reading your note");
  const id = page.url().split("/").pop()!;
  const rows = await notesOf(lesson);
  expect(rows).toHaveLength(before + 1);
  expect(rows.find((r) => r.id === id)?.status).toBe("received");
  expect((await sql<{ n: number }[]>`select count(*)::int as n from activity_observation where note_id = ${id}`)[0].n).toBe(0);
  await c.close();
});

test("at 400 px the lesson's Record button is the full width of the action row and at least 56 px tall", async ({ browser }) => {
  const c = await browser.newContext({ storageState: SIGNED_IN, viewport: phone });
  const p = await c.newPage();
  await p.goto(`/period/${lesson}`);
  await expect(p.locator("[data-ux=action] [data-record]")).toBeVisible();
  const box = (await p.locator("[data-ux=action] [data-record]").boundingBox())!;
  const row = (await p.locator("[data-ux=action]").boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(56);
  expect(box.width).toBeGreaterThanOrEqual(row.width - 1);
  await c.close();
});

test("a denied microphone on the lesson shows Type the marks as the main action instead of an error", async ({ browser }) => {
  const c = await browser.newContext({ storageState: SIGNED_IN, viewport: phone });
  await c.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  const p = await c.newPage();
  await p.goto(`/period/${lesson}`);
  await p.locator("[data-ux=action] [data-record]").click();
  const alert = p.locator("p[role=alert]");
  await expect(alert).toContainText("The phone did not let us record. Type the marks, or allow the microphone in settings.");
  await expect(alert.getByRole("button", { name: "Type the marks" })).toBeVisible();
  await c.close();
});

test("Type the marks on the lesson writes one note with this lesson's id, no recording, nothing in activity_observation, and opens it to confirm", async ({ page }) => {
  const before = (await notesOf(lesson)).length;
  await page.goto(`/period/${lesson}`);
  await page.locator("[data-record-lesson]").getByRole("button", { name: "Type the marks" }).click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop()!;
  const rows = await notesOf(lesson);
  expect(rows).toHaveLength(before + 1);
  expect(rows.find((r) => r.id === id)?.audio_key).toBeNull();
  expect((await sql<{ n: number }[]>`select count(*)::int as n from activity_observation where note_id = ${id}`)[0].n).toBe(0);
  await expect(page.getByRole("button", { name: "Confirm this note", exact: true })).toBeVisible();
});

test("with recording off the lesson offers no Record and no microphone: Type the marks is its main action", async ({ page }) => {
  await voiceSwitch(sql, true, false);
  await page.goto(`/period/${lesson}`);
  await expect(page.locator("[data-record]")).toHaveCount(0);
  await expect(page.locator("main [data-icon=record]")).toHaveCount(0);
  await expect(page.locator("[data-ux=action]").getByRole("button", { name: "Type the marks" })).toBeVisible();
  await expect(page.locator("[data-record-lesson]").getByRole("button", { name: "Type the marks" })).toHaveCount(0); // once, as the main action
});

test("Add a photo on the lesson hangs the photo on the lesson's note, with the rule for photos and the 48-hour line beside it", async ({ page }) => {
  // a note keeps at most 6 photos and this lesson's note is kept between runs: start from none
  await sql`update pii.educator_note set photo_keys = '{}' where session_id = ${lesson}`;
  await page.goto(`/period/${lesson}`);
  await expect(page.locator("[data-add-photo] [data-photo-rule]")).toHaveText("Photograph the work or the board, never a child.");
  await expect(page.locator("[data-kept]")).toHaveText("Recordings and transcripts are cleared after 48 hours.");
  await expect(page.locator("[data-add-photo][data-ready]")).toBeAttached();
  // a 1 x 1 PNG: the engine looks at the file's first bytes, not its name
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEgAF/QualzQAAAABJRU5ErkJggg==", "base64");
  await page.locator("[data-add-photo] input[type=file]").setInputFiles({ name: "board.png", mimeType: "image/png", buffer: png });
  await expect(page.getByText("Photo added to this lesson's note.")).toBeVisible();
  const [row] = await sql<{ n: number }[]>`select coalesce(sum(array_length(photo_keys, 1)), 0)::int as n from pii.educator_note where session_id = ${lesson}`;
  expect(row.n).toBeGreaterThanOrEqual(1);
});

test("the History tab says who is not yet seen on the activity and lists the class's latest notes, each opening to confirm", async ({ page }) => {
  const note = await aK2Note(sql, k, "Activity 904, level 2. Above 3.");
  await page.goto(`/period/${lesson}`);
  const panel = page.locator("[data-block=DetailPanel]");
  await panel.getByRole("tab", { name: "History" }).click();
  await expect(panel.getByRole("region", { name: "Not yet seen on this activity" }).locator("[data-not-seen]")).toContainText("not seen yet");
  const recent = panel.getByRole("region", { name: "Recent notes for this class" });
  await expect(recent.locator(`a[href="/notes/${note}"]`)).toHaveText("A voice note");
  await recent.locator(`a[href="/notes/${note}"]`).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Confirm what the reader heard");
});
