import type { ReactNode } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
} from "react-router";

import type { Route } from "./+types/root";

import stylesheet from "./styles.css?url";

export const links: Route.LinksFunction = () => [
  { href: stylesheet, rel: "stylesheet" },
];

export const meta: Route.MetaFunction = () => [
  // Pochical's people's own pages, kept out of search.
  { content: "noindex", name: "robots" },
  { title: "ポチカル管理" },
];

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
          <NavLink end to="/">
            サポート
          </NavLink>
          <NavLink to="/reports">通報</NavLink>
          <NavLink to="/bucket">棚卸し</NavLink>
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
