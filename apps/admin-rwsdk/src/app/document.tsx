import type { ReactNode } from "react";
import type { DocumentProps } from "rwsdk/router";

import styles from "./styles.css?url";

const PAGES = [
  { href: "/", name: "サポート" },
  { href: "/reports", name: "通報" },
  { href: "/bucket", name: "棚卸し" },
];

/** The page's shell; only a page with a form of React's loads its script. */
function Shell({
  children,
  path,
  hydrated,
}: {
  children: ReactNode;
  path: string;
  hydrated: boolean;
}) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        {/* Pochical's people's own pages, kept out of search. */}
        <meta content="noindex" name="robots" />
        <title>ポチカル管理</title>
        <link href={styles} rel="stylesheet" />
        {hydrated && <link href="/src/client.tsx" rel="modulepreload" />}
      </head>
      <body>
        <nav>
          {PAGES.map(({ href, name }) => (
            <a
              aria-current={
                (
                  href === "/"
                    ? path === "/" || path.startsWith("/support/")
                    : path.startsWith(href)
                )
                  ? "page"
                  : undefined
              }
              href={href}
              key={href}
            >
              {name}
            </a>
          ))}
        </nav>
        {children}
        {hydrated && <script src="/src/client.tsx" type="module" />}
      </body>
    </html>
  );
}

export const Document = ({ children, path }: DocumentProps) => (
  <Shell hydrated={false} path={path}>
    {children}
  </Shell>
);

export const HydratedDocument = ({ children, path }: DocumentProps) => (
  <Shell hydrated path={path}>
    {children}
  </Shell>
);
