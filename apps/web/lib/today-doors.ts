// Where a door on Today opens (UI-7). The screen of the new design when its slice has merged (lib/built.ts), else the page that
// does that work today when one is live, else nothing: a door whose target is not there is not drawn, so nothing is a dead link.
// Each unbuilt target is listed in docs/notes/UI-7.md; it is drawn by itself the day its slice merges.
import { screenHref } from "./built";

export type Door = { screen: string; params?: Record<string, string>; live: string | null };
export const open = (d: Door): string | null => screenHref(d.screen, d.params) ?? d.live;

const q = (o: Record<string, string>) => new URLSearchParams(o).toString();

export const DOORS = {
  confirm: (id: string): Door => ({ screen: "confirm", params: { id }, live: `/voice/notes/${encodeURIComponent(id)}` }),
  notes: (): Door => ({ screen: "notes", live: "/today?open=notes" }),
  picture: (classId: string): Door => ({ screen: "picture", params: { class: classId }, live: `/k2/${encodeURIComponent(classId)}` }),
  period: (id: string, classId: string, day: string): Door => ({ screen: "period", params: { id }, live: `/educator/period/${encodeURIComponent(id)}?${q({ class: classId, day })}` }),
  timetable: (): Door => ({ screen: "timetable", live: "/educator/week" }),
  materials: (): Door => ({ screen: "materials", live: "/educator/materials" }),
  staff: (): Door => ({ screen: "staff", live: "/staff" }),
  moves: (): Door => ({ screen: "moves", live: null }),
  draft: (): Door => ({ screen: "draft", live: null }),
  fortnight: (n: number): Door => ({ screen: "fortnight", params: { n: String(n) }, live: null }),
};
