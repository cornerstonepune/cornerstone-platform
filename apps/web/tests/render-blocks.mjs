// Renders one block (components/<file>.tsx, an export, props as JSON) to HTML for u71-blocks.spec.ts, in a plain Node process:
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


const [file, name, json] = process.argv.slice(2);
const { createElement: h } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const mod = await import(`../components/${file}.tsx`);
process.stdout.write(renderToStaticMarkup(h(mod[name], JSON.parse(json ?? "{}"))));
