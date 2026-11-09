import type { Metadata } from "next";
import { Source_Sans_3, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// The two typefaces of tokens.json (type.fonts), fetched once at build and served by the site itself: no page asks a
// font host for anything. Source Serif 4 for titles, Source Sans 3 for everything else.
const serif = Source_Serif_4({ subsets: ["latin"], weight: ["400", "600"], display: "swap" });
const sans = Source_Sans_3({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

export const metadata: Metadata = {
  title: "Cornerstone · Assessment",
  description: "Every child's worksheet, read and answered with the next one.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-scheme="light" className={`${serif.className} ${sans.className} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
