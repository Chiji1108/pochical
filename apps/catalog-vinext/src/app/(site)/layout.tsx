import type { Metadata } from "next";
import type { ReactNode } from "react";

import { HtmlShell } from "@/components/html-shell";

import "../styles.css";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Pochical catalog (vinext sketch)",
};

export default function SiteRootLayout({ children }: { children: ReactNode }) {
  return <HtmlShell themed={false}>{children}</HtmlShell>;
}
