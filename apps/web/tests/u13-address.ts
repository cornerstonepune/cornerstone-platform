// What a typed term may not be in (UI-13 Done-when 8): the address of a request that can carry a name or a number — a page, a
// fetch, an XHR or an RSC request (which is a fetch). A static asset's address (`/_next/static/…`, a font, an image) is a hashed
// build file name that holds any short number by chance, and carries nothing the person typed, so it is not looked at.
export type Seen = { url: string; method: string; body: string | null; type: string };

const CARRIES = new Set(["document", "fetch", "xhr"]);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/** The part of a request's address that could hold the typed term: its path and query, less an id (random hex, which can hold
 *  any number), and nothing at all for a request that is not a page or data request. */
export function addressToLookIn(r: Pick<Seen, "url" | "type">): string {
  if (!CARRIES.has(r.type)) return "";
  const u = new URL(r.url);
  return `${u.pathname}${u.search}`.replace(UUID, "");
}
