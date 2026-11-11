/** Where a skill set (a row of Curriculum or of Skills to approve: its code is the skill set's, not a registry skill's) is read: its own
 *  page under Setup. Never `/setup/skills/<code>`: that screen is keyed by a registry skill's code. */
export const skillSetHref = (code: string): string => `/setup/skill-sets/${encodeURIComponent(code)}`;
