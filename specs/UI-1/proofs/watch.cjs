// UI-1 proofs: loaded into every Playwright process with NODE_OPTIONS=--require, only when UI1_WATCH_LOG is set.
// In a test worker it records, one JSON line each, to UI1_WATCH_LOG:
//   {kind: "nav", file, url}  every main-frame navigation of every page the test opens (soft navigations included)
//   {kind: "axe", file, url}  every finished @axe-core/playwright AxeBuilder.analyze(), with the page's address then
// It changes nothing a test sees: `test` is the repo's own, extended only to watch the browser context it already gets.
const Module = require("module");
const fs = require("fs");

const LOG = process.env.UI1_WATCH_LOG;
// Read per call: Playwright sets TEST_WORKER_INDEX in the worker only after this file has loaded.
const inWorker = () => process.env.TEST_WORKER_INDEX !== undefined;
let current = "";
const log = (kind, url) => fs.appendFileSync(LOG, JSON.stringify({ kind, file: current, url }) + "\n");

const wrapped = new Map();
const load = Module._load;
Module._load = function (request, parent, isMain) {
  const m = load.apply(this, arguments);
  if (!LOG || !inWorker()) return m;
  if (request === "@axe-core/playwright") {
    const B = m && (m.AxeBuilder || m.default || m);
    if (B && B.prototype && B.prototype.analyze && !B.prototype.__ui1) {
      const analyze = B.prototype.analyze;
      B.prototype.analyze = async function (...args) {
        const out = await analyze.apply(this, args);
        log("axe", this.page.url());
        return out;
      };
      B.prototype.__ui1 = true;
    }
    return m;
  }
  if (request === "@playwright/test" || request === "playwright/test") {
    if (!wrapped.has(m)) {
      const test = m.test.extend({
        context: async ({ context }, use, testInfo) => {
          current = testInfo.file;
          const watch = (page) =>
            page.on("framenavigated", (f) => f === page.mainFrame() && f.url() !== "about:blank" && log("nav", f.url()));
          context.pages().forEach(watch);
          context.on("page", watch);
          await use(context);
        },
      });
      const swap = (t, k) => k === "test" || (k === "default" && t.default === t.test);
      wrapped.set(m, new Proxy(m, { get: (t, k) => (swap(t, k) ? test : t[k]) }));
    }
    return wrapped.get(m);
  }
  return m;
};
