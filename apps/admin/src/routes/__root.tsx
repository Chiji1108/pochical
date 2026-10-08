import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import stylesheet from "../styles.css?url";

export const Route = createRootRoute({
  component: () => <Outlet />,
  head: () => ({
    links: [{ href: stylesheet, rel: "stylesheet" }],
    meta: [
      { charSet: "utf-8" },
      { content: "width=device-width, initial-scale=1", name: "viewport" },
      // Pochical's people's own pages, kept out of search.
      { content: "noindex", name: "robots" },
      { title: "ポチカル管理" },
    ],
  }),
  shellComponent: Document,
});

function Document({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        <nav>
          <Link activeOptions={{ exact: true }} to="/">
            サポート
          </Link>
          <Link to="/reports">通報</Link>
        </nav>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
