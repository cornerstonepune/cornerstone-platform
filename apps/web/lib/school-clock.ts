import { cache } from "react";
import { sql } from "./db";

// The school's clock (config `school.time_zone`), as the engine reads it: never the server's zone, never a name written
// in the code (CP-24, audit F5). Once per request, for every page that asks.
export const schoolZone = cache(async (): Promise<string> => {
  const [row] = await sql<{ z: string | null }[]>`select value #>> '{}' as z from config where key = 'school.time_zone'`;
  if (!row?.z) throw new Error("the school.time_zone setting is missing: run the migrations and `engine load`");
  return row.z;
});

/** Today on the school's clock, as a date input reads it ("2026-10-22"). */
export const schoolToday = async () => new Date().toLocaleDateString("en-CA", { timeZone: await schoolZone() });

/** The time now on the school's clock, "HH:MM": a page drawn at 03:54 in Pune is about that Pune day. */
export const nowAtSchool = async () => new Date().toLocaleTimeString("en-GB", { timeZone: await schoolZone(), hour: "2-digit", minute: "2-digit", hour12: false });
