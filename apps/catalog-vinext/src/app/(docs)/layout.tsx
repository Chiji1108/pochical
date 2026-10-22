import type { Metadata } from "next";
import type { ReactNode } from "react";

import { HtmlShell } from "@/components/html-shell";

import "../styles.css";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Pochical catalog (vinext sketch)",
};

// A root layout of its own: Next.js loads a page anew when navigation
// crosses root layouts, so the documents' Tailwind CSS never reaches the
// other pages.
export default function DocsRootLayout({ children }: { children: ReactNode }) {
  return <HtmlShell themed>{children}</HtmlShell>;
}
