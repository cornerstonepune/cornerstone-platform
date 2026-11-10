import path from "node:path";
import type { NextConfig } from "next";

// The repository, not this folder: the How it works page reads `workflows.json` at the top of it — the one
// map the engine's code is also held to — and the builder only reads files inside its root.
const repo = path.join(__dirname, "..", "..");

const nextConfig: NextConfig = {
  // The test run builds into its own folder, so it never collides with a development server's.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: { root: repo },
  // Teaching left the menu on 26 Oct 2026 (goals/nav3_what_needs_doing.yaml): its old address, in a bookmark or a link, opens What needs doing.
  redirects: async () => [
    { source: "/taught", destination: "/today", permanent: false },
    // The K2 pictures folded into Children (UI-3b): the old addresses answer 308 to the new ones.
    { source: "/k2", destination: "/children", permanent: true },
    { source: "/k2/:class", destination: "/children/:class", permanent: true },
    { source: "/k2/:class/:roll", destination: "/children/:class/:roll", permanent: true },
  ],
  outputFileTracingRoot: repo,
};

export default nextConfig;
