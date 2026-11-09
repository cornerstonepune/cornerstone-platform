import { appendFileSync } from "node:fs";
import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";

/**
 * The seconds each page's test took, for .claude/athena/preflight.sh (CP-21): one line `<page>\t<seconds>` per test,
 * appended to the file PREFLIGHT_TIMINGS names. The specs the preflight runs load one page per test. Not used in CI.
 */
export default class PreflightTimings implements Reporter {
  onTestEnd(test: TestCase, result: TestResult): void {
    const file = process.env.PREFLIGHT_TIMINGS;
    if (!file || result.status === "skipped") return;
    const page = test.titlePath().slice(3).join(" > ").replace(/\s+/g, " ");
    appendFileSync(file, `${page}\t${(result.duration / 1000).toFixed(1)}\n`);
  }
}
