import type { ReactNode } from "react";
import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  useMatch,
} from "react-router";

import type { Route } from "./+types/root";

// apps/admin's own stylesheet, as it is.
import stylesheet from "../../admin/src/styles.css?url";

export const links: Route.LinksFunction = () => [
  { href: stylesheet, rel: "stylesheet" },
];

export const meta: Route.MetaFunction = () => [
  // Pochical's people's own pages, kept out of search.
  { content: "noindex", name: "robots" },
  { title: "ポチカル管理" },
];

/** A tab, marked as the stylesheet expects of TanStack Router's Link. */
function Tab({ to, children }: { to: string; children: ReactNode }) {
  const here = useMatch(to) !== null;
  return (
    <Link data-status={here ? "active" : undefined} to={to}>
      {children}
    </Link>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <Meta />
        <Links />
      </head>
      <body>
        <nav>
          <Tab to="/">サポート</Tab>
          <Tab to="/reports">通報</Tab>
          <Tab to="/bucket">棚卸し</Tab>
        </nav>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return (
    <main>
      <h1>読めませんでした</h1>
      <p className="open" role="alert">
        {isRouteErrorResponse(error)
          ? `${error.status} ${error.statusText}`
          : String(error)}
      </p>
    </main>
  );
}
