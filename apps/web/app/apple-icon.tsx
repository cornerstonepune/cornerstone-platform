import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

// The app icon a phone keeps on its home screen: the school's mark on its white tile, drawn from the official file at
// build time (UI-14). The file is used as given, never redrawn; the PNG is made by the build and never committed.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const svg = await readFile(path.join(process.cwd(), "public/brand/Cornerstone-logo-mark-on-white-tile.svg"));
  const src = `data:image/svg+xml;base64,${svg.toString("base64")}`;
  return new ImageResponse(<img src={src} width={size.width} height={size.height} alt="" />, size);
}
