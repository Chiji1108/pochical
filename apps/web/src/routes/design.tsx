import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { DesignAppIcon } from "../components/design-app-icon";
import {
  DesignProviders,
  useDesignTheme,
} from "../components/design-providers";
import { themeStyle } from "../components/design-theme";
import { pageMeta } from "../lib/site";

import designStyles from "../design.css?url";

export const Route = createFileRoute("/design")({
  component: DesignPage,
  head: () => ({
    ...pageMeta("デザイン資料", "ポチカルのデザイン資料", "/design", true),
    links: [{ href: designStyles, rel: "stylesheet" }],
  }),
});

// The documents; the app to touch is /demo.
const documents = [
  {
    description:
      "電話1台で、ポチカルを実際に触れます。比べる案もここで切り替えます。",
    title: "デモ",
    to: "/demo",
  },
  {
    description: "はじめての設定、写真の取り込み、設定の画面の流れと分かれ道。",
    title: "画面遷移図",
    to: "/design/flows",
  },
  {
    description:
      "月の埋まり方、6段の月 × パターンの数、休みの見せ方、トーンとライト・ダーク。",
    title: "状態の一覧",
    to: "/design/states",
  },
  {
    description: "役割ごとの色、トーンごとのテーマ、シフトの色の見分けやすさ。",
    title: "カラーパレット",
    to: "/design/colors",
  },
] as const;

// Studies still on this page until they get pages of their own.
const studyLinks = [
  { id: "design-app-icon-title", number: "01", title: "アプリアイコン" },
];

function DesignPage() {
  const theme = useDesignTheme();
  return (
    <main className="design-page" id="main" style={themeStyle(theme, "light")}>
      <div className="design-toolbar">
        <Link to="/">
          <ArrowLeft aria-hidden="true" size={16} /> ポチカル
        </Link>
      </div>
      <header className="design-intro">
        <p>POCHICAL / DESIGN</p>
        <h1>
          毎日のシフトに、<span>やさしい余白。</span>
        </h1>
        <p className="design-description">
          見るときは、すっきり。入力は、ポチッと。
        </p>
      </header>
      <nav aria-label="デザイン資料" className="design-documents">
        {documents.map((document) => (
          <Link key={document.to} to={document.to}>
            <span>
              <strong>{document.title}</strong>
              {document.description}
            </span>
            <ChevronRight aria-hidden="true" size={18} />
          </Link>
        ))}
      </nav>
      <nav aria-label="このページの検討" className="design-index">
        {studyLinks.map(({ id, number, title }) => (
          <a href={`#${id}`} key={id}>
            <span>{number}</span>
            {title}
          </a>
        ))}
      </nav>
      <DesignProviders>
        <div className="design-screens">
          <section aria-labelledby="design-app-icon-title">
            <h2 id="design-app-icon-title">
              <span>01</span> アプリアイコン
            </h2>
            <DesignAppIcon />
            <p className="design-caption">
              「ポチ」カルのプードル。色を選ぶと、小さいサイズとホーム画面での見え方が変わります。
            </p>
          </section>
        </div>
      </DesignProviders>
    </main>
  );
}
