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
  // to the Assessments board, where each assessment's Upload tab now is. And Record, merged into the lesson (page charter Part C, B4): an
  // address naming its lesson (`?session=`) answers 308 to that lesson's page, where Record, Type the marks and Add a photo now are; one
  // naming none answers 308 to Today. And What needs doing, merged into Today: its address answers 308 to Today, where its kinds of work are
  // the "waiting on you" rows (the query is carried). And Materials, moved into the Timetable's Materials. And the Fortnight and Draft pages, folded into the timetable's Fortnight view (CP-57, 16 Nov 2026: old addresses answer 308 there, query carried).
  redirects: async () => [
    // the site opens on Today (13 Nov 2026); the old skill list that stood here is Curriculum's, at /setup/curriculum/skills
    { source: "/", destination: "/my-day", permanent: false },
    { source: "/capture", destination: "/children/assessments", permanent: true },
    { source: "/record", has: [{ type: "query", key: "session", value: "(?<session>[0-9a-f-]{36})" }], destination: "/period/:session", permanent: true },
    { source: "/record", destination: "/my-day", permanent: true },
    { source: "/educator/materials", destination: "/timetable/materials", permanent: true },
    // the fortnight and draft pages are views of the one timetable page (CP-57, 16 Nov 2026); the query they carried is passed on
    { source: "/timetable/fortnight/:n(\\d+)", destination: "/timetable?view=fortnight&fn=:n", permanent: true },
    { source: "/timetable/draft", destination: "/timetable?view=fortnight&tab=draft&show=draft", permanent: true },
    // Time by subject is a view of the one timetable page (CP-65)
    { source: "/timetable/time", destination: "/timetable?view=time", permanent: true },
    // Skills to approve and Objectives are parts of the one Curriculum page (CP-65); the choices they carried are passed on
    { source: "/setup/skills/approve", destination: "/setup/curriculum?approve=1", permanent: true },
    { source: "/setup/curriculum/objectives", has: [{ type: "query", key: "origin" }], destination: "/setup/curriculum?view=appendix&part=objectives", permanent: true },
    { source: "/setup/curriculum/objectives", destination: "/setup/curriculum?view=appendix&part=objectives", permanent: true },
    { source: "/setup/needs-doing", destination: "/my-day", permanent: true },
    // Today became My day (CP-69, 17 Nov 2026): the old address answers 308 here, the query carried
    { source: "/today", destination: "/my-day", permanent: true },
  ],
  outputFileTracingRoot: repo,
  // a claim's bill is sent with the form (app/(app)/money/new): a shrunk photo is well under this, and Vercel takes 4.5 MB in all
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
