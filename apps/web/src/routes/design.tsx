import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { useDesignTheme } from "../components/design-providers";
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
    description: "はじめての設定、空いた日の確認、設定の画面の流れと分かれ道。",
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
    description:
      "ボタン、行、切り替え、シートなどの部品を役割ごとに。同じ役割の重複も見えます。",
    title: "部品の棚卸し",
    to: "/design/components",
  },
  {
    description: "アプリアイコンと、元になるプードルの絵、サイトの画像。",
    title: "素材",
    to: "/design/assets",
  },
  {
    description: "役割ごとの色、トーンごとのテーマ、シフトの色の見分けやすさ。",
    title: "カラーパレット",
    to: "/design/colors",
  },
] as const;

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
    </main>
  );
}
