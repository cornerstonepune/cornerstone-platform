import { dayIn } from "../lib/school-clock";
import { isoWeek } from "../lib/week";

/** This ISO week on the test school's clock (the zone its `school.time_zone` row holds), as the pages and the engine name it. */
export const THIS_WEEK = isoWeek(dayIn("Asia/Kolkata", new Date()));
