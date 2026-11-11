// Where a door on Today opens (UI-7). The screen of the new design when its slice has merged (lib/built.ts), else the page that
// does that work today when one is live, else nothing: a door whose target is not there is not drawn, so nothing is a dead link.
// Each unbuilt target is listed in docs/notes/UI-7.md; it is drawn by itself the day its slice merges.
import { screenHref } from "./built";

export type Door = { screen: string; params?: Record<string, string>; live: string | null };
export const open = (d: Door): string | null => screenHref(d.screen, d.params) ?? d.live;

const q = (o: Record<string, string>) => new URLSearchParams(o).toString();

export const DOORS = {
  confirm: (id: string): Door => ({ screen: "confirm", params: { id }, live: `/notes/${encodeURIComponent(id)}` }),
  notes: (): Door => ({ screen: "notes", live: "/notes" }),
  picture: (classId: string): Door => ({ screen: "picture", params: { class: classId }, live: `/children/${encodeURIComponent(classId)}` }),
  /** `session`: the lesson's own id when it has one (the new page is a session's); a part of the day with none opens the old period page by its period. */
  period: (id: string, classId: string, day: string, session?: string): Door =>
    session ? { screen: "period", params: { id: session }, live: `/period/${encodeURIComponent(session)}` } : { screen: "period", params: { id }, live: `/educator/period/${encodeURIComponent(id)}?${q({ class: classId, day })}` },
  timetable: (): Door => ({ screen: "timetable", live: "/timetable" }),
  materials: (): Door => ({ screen: "materials", live: "/timetable/materials" }),
  staff: (): Door => ({ screen: "staff", live: "/setup/staff" }),
  moves: (): Door => ({ screen: "moves", live: null }),
  draft: (): Door => ({ screen: "draft", live: null }),
  activity: (code: string): Door => ({ screen: "activity", params: { code }, live: `/setup/activities/${encodeURIComponent(code)}` }),
  fortnight: (n: number): Door => ({ screen: "fortnight", params: { n: String(n) }, live: null }),
};
