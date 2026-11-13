import path from "node:path";
import type { NextConfig } from "next";

// The repository, not this folder: the How it works page reads `workflows.json` at the top of it — the one
// map the engine's code is also held to — and the builder only reads files inside its root.
const repo = path.join(__dirname, "..", "..");

const nextConfig: NextConfig = {
  // The test run builds into its own folder, so it never collides with a development server's.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: { root: repo },
  // No old address is redirected (11 Nov 2026, "leave everything old behind"): nothing printed or sent names a page of this site
  // (a paper's QR is its sheet id, notifications carry no link), so a retired page's address simply no longer exists. One exception,
  // asked for with the page charter's B6 (Upload papers deleted into the assessment it belongs to): the Upload papers address answers 308
  // to the Assessments board, where each assessment's Upload tab now is.
  redirects: async () => [{ source: "/capture", destination: "/children/assessments", permanent: true }],
  outputFileTracingRoot: repo,
};

export default nextConfig;
