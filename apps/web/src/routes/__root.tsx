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
  head: () => ({
    links: [
      { href: stylesheet, rel: "stylesheet" },
      { href: "/icon.png", rel: "icon", type: "image/png" },
    ],
    meta: [
      { charSet: "utf-8" },
      { content: "width=device-width, initial-scale=1", name: "viewport" },
      { content: "#fbfaf7", name: "theme-color" },
    ],
  }),
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
  shellComponent: RootDocument,
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
