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
    // The screens folded into sign in and the help (UI-12): the old addresses answer 308 to the new one.
    { source: "/login/forgot", destination: "/login?view=forgot", permanent: true },
    { source: "/login/new-password", destination: "/login?view=new-password", permanent: true },
    { source: "/account/password", destination: "/login?view=forgot", permanent: true },
    { source: "/guide/:path*", destination: "/guide", permanent: true },
    { source: "/workflows", destination: "/guide", permanent: true },
  ],
  outputFileTracingRoot: repo,
};

export default nextConfig;
