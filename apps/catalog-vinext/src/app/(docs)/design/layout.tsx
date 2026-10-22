import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { ReactNode } from "react";

import { DocsThemeSwitch } from "@/components/docs-theme-switch";
import { source } from "@/lib/source";

import "./docs.css";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    // Light and dark follow the prototype's 外観 (html-shell.tsx), not
    // next-themes.
    <RootProvider theme={{ enabled: false }}>
      <DocsLayout
        nav={{ title: "デザイン資料", url: "/design/components" }}
        slots={{ themeSwitch: DocsThemeSwitch }}
        tree={source.getPageTree()}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
