import icon from "@pochical/prototype/assets/icon-192.png?url";
import { css } from "@pochical/styled-system/css";
import {
  Archive,
  Flag,
  MessagesSquare,
  TriangleAlert,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  useLocation,
} from "react-router";

import type { Route } from "./+types/root";
import { SearchUsers } from "./search";
import { themeCss } from "./theme";
import { alert, page, PageHeader } from "./ui";

import stylesheet from "./styles.css?url";

export const links: Route.LinksFunction = () => [
  { href: stylesheet, rel: "stylesheet" },
  { href: icon, rel: "icon", type: "image/png" },
];

export const meta: Route.MetaFunction = () => [
  // Pochical's people's own pages, kept out of search.
  { content: "noindex", name: "robots" },
  { title: "ポチカル管理" },
];

type Place = {
  Icon: LucideIcon;
  label: string;
  // Pages under it, lit with it: a chat under サポート.
  under?: string;
  to: string;
};

// The site's pages by what they are for: answering people, and looking
// after what the server holds.
const PLACES: { group: string; places: Place[] }[] = [
  {
    group: "対応",
    places: [
      { Icon: MessagesSquare, label: "サポート", to: "/", under: "/support/" },
      { Icon: Flag, label: "通報", to: "/reports" },
      { Icon: Users, label: "ユーザー", to: "/users", under: "/users/" },
    ],
  },
  {
    group: "運用",
    places: [
      { Icon: Archive, label: "棚卸し", to: "/bucket" },
      { Icon: TriangleAlert, label: "全消去", to: "/reset" },
    ],
  },
];

// The sidebar down the left, and on a narrow screen a bar along the top
// whose links scroll sideways.
const shell = css({
  display: "grid",
  gridTemplateColumns: { base: "1fr", md: "240px 1fr" },
  minHeight: "100dvh",
});

const sidebar = css({
  background: "fill.quaternary",
  borderBottomWidth: { base: "1px", md: "0" },
  borderColor: "border.default",
  borderRightWidth: { base: "0", md: "1px" },
  display: "flex",
  flexDirection: { base: "row", md: "column" },
  gap: { base: "2", md: "6" },
  height: { md: "100dvh" },
  // Its links scroll: sideways along the bar, down a sidebar taller than
  // the window.
  overflowX: { base: "auto", md: "hidden" },
  overflowY: { base: "hidden", md: "auto" },
  paddingBlock: { base: "2", md: "5" },
  paddingInline: "3",
  position: "sticky",
  scrollbarWidth: { base: "none", md: "thin" },
  top: "0",
  zIndex: 1,
});

const brand = css({
  alignItems: "center",
  display: "flex",
  flexShrink: 0,
  fontSize: "sm",
  fontWeight: 600,
  gap: "2.5",
  paddingInline: "2",
});

const groupName = css({
  color: "text.quaternary",
  display: { base: "none", md: "block" },
  fontSize: "xs",
  fontWeight: 500,
  marginBottom: "1",
  paddingInline: "2",
});

const placeLink = css({
  // The page shown keeps its own color under the pointer.
  "&:not([aria-current=page])": {
    _hover: { background: "fill.tertiary", color: "text.primary" },
  },
  "&[aria-current=page]": {
    background: "accent.container",
    color: "accent.default",
    fontWeight: 500,
  },
  alignItems: "center",
  borderRadius: "sm",
  color: "text.secondary",
  display: "flex",
  fontSize: "sm",
  gap: "2.5",
  height: "8",
  // Closer on a narrow screen, so the five pages fit along the bar.
  paddingInline: { base: "1.5", md: "2" },
  transition: "background 120ms, color 120ms",
  whiteSpace: "nowrap",
});

function Sidebar() {
  // A path ending in a slash is the same page (/reports/ is /reports).
  const path = useLocation().pathname.replace(/(?<=.)\/+$/u, "");
  return (
    <aside className={sidebar}>
      {/* On a narrow screen the mark alone, so the four pages fit beside it. */}
      <Link aria-label="ポチカル管理" className={brand} to="/">
        <img
          alt=""
          className={css({ borderRadius: "xs", height: "6", width: "6" })}
          height={24}
          src={icon}
          width={24}
        />
        <span
          className={css({
            display: { base: "none", md: "inline-flex" },
            gap: "2",
          })}
        >
          ポチカル
          <span className={css({ color: "text.tertiary", fontWeight: 400 })}>
            管理
          </span>
        </span>
      </Link>
      <SearchUsers />
      <nav
        aria-label="ページ"
        className={css({
          display: "flex",
          flexDirection: { base: "row", md: "column" },
          gap: { base: "0.5", md: "5" },
        })}
      >
        {PLACES.map(({ group, places }) => (
          <div
            className={css({
              display: "flex",
              flexDirection: { base: "row", md: "column" },
              gap: "0.5",
            })}
            key={group}
          >
            <p className={groupName}>{group}</p>
            {places.map(({ Icon, label, to, under }) => {
              const here =
                path === to || (under !== undefined && path.startsWith(under));
              return (
                <Link
                  aria-current={here ? "page" : undefined}
                  className={placeLink}
                  key={to}
                  to={to}
                >
                  {/* Words alone on a narrow screen, where the bar is short of room. */}
                  <Icon
                    aria-hidden
                    className={css({ display: { base: "none", md: "block" } })}
                    size={16}
                    strokeWidth={1.75}
                  />
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
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
        {/* oxlint-disable-next-line react/no-danger -- design/'s colors, made on the server. */}
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      </head>
      <body className={shell}>
        <Sidebar />
        <div className={css({ minWidth: 0 })}>{children}</div>
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
    <main className={page}>
      <PageHeader title="読めませんでした" />
      <p className={alert} role="alert">
        {isRouteErrorResponse(error)
          ? `${error.status} ${error.statusText}`
          : String(error)}
      </p>
    </main>
  );
}
