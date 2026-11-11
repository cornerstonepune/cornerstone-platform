import { screenHref } from "./built";

/** Where a skill set (a row of Curriculum or of Skills to approve: its code is the skill set's, not a registry skill's) is read: its own screen
 *  once that is built, the skill sets' page until then. Never `/setup/skills/<code>`: that screen is keyed by a registry skill's code. */
export const skillSetHref = (code: string): string => screenHref("skillset", { code }) ?? `/skill-sets/${encodeURIComponent(code)}`;
