import {
  createRootRoute,
  HeadContent,
  Link,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Footer, Header } from "../components/site-layout";

import stylesheet from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#fbfaf7" },
    ],
    links: [
      { rel: "stylesheet", href: stylesheet },
      { rel: "icon", type: "image/png", href: "/icon.png" },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: () => (
    <main className="document-page state-page" id="main">
      <p className="eyebrow">404 / NOT FOUND</p>
      <h1>ページが見つかりません。</h1>
      <p>リンクが間違っているか、ページが移動した可能性があります。</p>
      <Link className="button" to="/">
        ホームに戻る
      </Link>
    </main>
  ),
  errorComponent: ({ reset }) => (
    <main className="document-page state-page" id="main">
      <h1>ページを読み込めませんでした。</h1>
      <p>通信状態を確認して、もう一度お試しください。</p>
      <button className="button" onClick={reset} type="button">
        再読み込み
      </button>
      <Link to="/support">サポートへ</Link>
    </main>
  ),
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        <a className="skip-link" href="#main">
          本文へスキップ
        </a>
        <Header />
        {children}
        <Footer />
        <Scripts />
      </body>
    </html>
  );
}
