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
    { source: "/taught", destination: "/setup/needs-doing", permanent: false },
    // The single-activity pages folded into one (UI-3c): the old addresses answer 308 to the new one.
    { source: "/educator/activity/:code", destination: "/setup/activities/:code", permanent: true },
    { source: "/curriculum/fill/:code((?!walk$)[^/]+)", destination: "/setup/activities/:code", permanent: true },
    // The screens folded into sign in and the help (UI-12): the old addresses answer 308 to the new one.
    { source: "/login/forgot", destination: "/login?view=forgot", permanent: true },
    { source: "/login/new-password", destination: "/login?view=new-password", permanent: true },
    { source: "/account/password", destination: "/login?view=forgot", permanent: true },
    { source: "/guide/:path+", destination: "/guide", permanent: true },
    // The old Parent reports list folded into Reports (UI-8e): the old address answers 308 to the new one, its ?class= kept.
    { source: "/growth/reports", destination: "/children/reports", permanent: true },
    // The K2 pictures folded into Children (UI-3b): the old addresses answer 308 to the new ones.
    { source: "/k2", destination: "/children", permanent: true },
    { source: "/k2/:class", destination: "/children/:class", permanent: true },
    { source: "/k2/:class/:roll", destination: "/children/:class/:roll", permanent: true },
    // UI-5 (docs/frontend/screens.json `folds`): the School page is Classes and children; a bookmark answers 308 to it.
    { source: "/school", destination: "/setup/classes", permanent: true },
    // The old voice pages folded into Record, Notes and the confirm screen (UI-3a): the old addresses answer 308 to the new ones. The form is
    // Type the marks, on Record; the class a bookmark names (`?class=`) is carried over, named so the destination has it.
    { source: "/voice/record", has: [{ type: "query", key: "class", value: "(?<class>.+)" }], destination: "/record?class=:class", permanent: true },
    { source: "/voice/record", destination: "/record", permanent: true },
    { source: "/voice/form", has: [{ type: "query", key: "class", value: "(?<class>.+)" }], destination: "/record?class=:class", permanent: true },
    { source: "/voice/form", destination: "/record", permanent: true },
    { source: "/voice/notes/:id([0-9a-f-]{36})", destination: "/notes/:id", permanent: true },
    // The period page folded into the one of UI-3a (UI-3a, repoint): the old address, with its class and day, answers 308 to the new one.
    { source: "/educator/period/:id", has: [{ type: "query", key: "class", value: "(?<class>.+)" }, { type: "query", key: "day", value: "(?<day>.+)" }], destination: "/period/:id?class=:class&day=:day", permanent: true },
    { source: "/educator/period/:id", has: [{ type: "query", key: "class", value: "(?<class>.+)" }], destination: "/period/:id?class=:class", permanent: true },
    { source: "/educator/period/:id", destination: "/period/:id", permanent: true },
  ],
  outputFileTracingRoot: repo,
};

export default nextConfig;
