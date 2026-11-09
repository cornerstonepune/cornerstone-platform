// Renders the shadcn primitives (components/ui) to HTML for u14-ui-primitives.spec.ts, in a plain Node process:
// Playwright's own test loader rewrites React elements for component testing, so React cannot render them there.
// Node's module hooks compile the .tsx files with TypeScript (already a dev dependency). Usage: node render-ui.mjs button|tabs
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
registerHooks({
  resolve(spec, context, next) {
    const local = spec.startsWith("@/") ? path.join(web, spec.slice(2)) : spec.startsWith(".") && context.parentURL?.startsWith("file:") ? path.resolve(path.dirname(fileURLToPath(context.parentURL)), spec) : null;
    const file = local && ["", ".tsx", ".ts"].map((x) => local + x).find((f) => existsSync(f) && /\.tsx?$/.test(f));
    return file ? { url: pathToFileURL(file).href, shortCircuit: true } : next(spec, context);
  },
  load(url, context, next) {
    if (!/\.tsx?$/.test(url)) return next(url, context);
    const source = ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    return { format: "module", source, shortCircuit: true };
  },
});

const { createElement: h } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { Button } = await import("../components/ui/button.tsx");
const { Tabs, TabsList, TabsTrigger, TabsContent } = await import("../components/ui/tabs.tsx");

const VARIANTS = ["default", "outline", "secondary", "ghost", "destructive", "link"];
// every word in a span the test masks: the baseline records the primitives' shapes and colours, not one browser's glyphs
const label = (text) => h("span", { "data-label": "" }, text);
const what = {
  button: () => h("div", { style: { display: "flex", gap: "8px" } }, ...VARIANTS.map((v) => h(Button, { key: v, variant: v }, label(v)))),
  tabs: () =>
    h(
      Tabs,
      { defaultValue: "week" },
      h(TabsList, null, h(TabsTrigger, { value: "today" }, label("Today")), h(TabsTrigger, { value: "week" }, label("This week"))),
      h(TabsContent, { value: "week" }, label("The week's periods.")),
    ),
}[process.argv[2]];
if (!what) throw new Error(`render-ui.mjs: say button or tabs, not ${process.argv[2]}`);
process.stdout.write(renderToStaticMarkup(what()));
