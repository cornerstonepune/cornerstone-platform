// The test hooks (CP-72): a run of the website made for tests (`TEST_HOOKS=1`, set only by playwright.config.ts) can write down
// every read a page makes, and make the reads that match a pattern slow or failing. Off everywhere else: without the variable every
// function here returns at once and nothing is kept. The state lives on globalThis so the page, the route that sets it and the
// route that reads it, which Next may bundle apart, share one.
export type TestHook = { match: string; delayMs: number; fail: boolean; log: string[] };
declare global {
  var cornerstoneTestHook: TestHook | undefined;
}

export const testHooksOn = () => process.env.TEST_HOOKS === "1";
export const testHook = (): TestHook => (globalThis.cornerstoneTestHook ??= { match: "", delayMs: 0, fail: false, log: [] });

/** Called before a database query or an engine call runs: note it, and hold or refuse it when a test asked. */
export async function noteRead(text: string): Promise<void> {
  if (!testHooksOn()) return;
  const h = testHook();
  const line = text.replace(/\s+/g, " ").trim();
  h.log.push(line);
  if (!h.match || !line.includes(h.match)) return;
  if (h.delayMs) await new Promise((r) => setTimeout(r, h.delayMs));
  if (h.fail) throw new Error("test hook: the read was refused");
}
