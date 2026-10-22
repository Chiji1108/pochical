import { useDesignTheme } from "@pochical/prototype/components/design-providers";
import { pageStyle } from "@pochical/prototype/components/design-theme";
import { css } from "@pochical/styled-system/css";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { DesignIntro, DesignPage } from "../components/design-page";
import { pageMeta } from "../lib/page-meta";

export const Route = createFileRoute("/design/")({
  component: DocumentsPage,
  head: () => ({
    ...pageMeta("デザイン資料", "ポチカルのデザイン資料"),
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
      "月の埋まり方、6段の月 × パターンの数、休みの見せ方、テーマとライト・ダーク。",
    title: "状態の一覧",
    to: "/design/states",
  },
  {
    description:
      "ボタン、行、切り替え、シートなどの部品を役割ごとに。同じ役割の重複も見えます。",
    splat: "components",
    title: "部品の棚卸し",
    to: "/design/$",
  },
  {
    description:
      "ホーム画面とロック画面のウィジェット。サイズごとに、ライト・ダーク・色合い・クリアで。",
    title: "ウィジェット",
    to: "/design/widgets",
  },
  {
    description: "アプリアイコンと、元になるプードルの絵、サイトの画像。",
    title: "素材",
    to: "/design/assets",
  },
  {
    description: "役割ごとの色、トーンごとのテーマ、シフトの色の見分けやすさ。",
    splat: "colors",
    title: "カラーパレット",
    to: "/design/$",
  },
] as const;

// One card each.
const documentList = css({
  "& a": {
    _hover: { borderColor: "var(--border-strong)" },
    alignItems: "center",
    bg: "background.card",
    border: "1px solid token(colors.separator)",
    borderRadius: "16px",
    color: "text.tertiary",
    display: "flex",
    gap: "12px",
    padding: "16px 18px",
    textDecoration: "none",
  },
  "& a > span": {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    fontSize: "13px",
    gap: "4px",
    lineHeight: "1.6",
  },
  "& strong": { color: "text.primary", fontSize: "16px" },
  display: "grid",
  gap: "10px",
  margin: "0 auto 36px",
  width: "min(100%, 560px)",
});

function DocumentsPage() {
  const theme = useDesignTheme();
  return (
    <DesignPage style={pageStyle(theme)}>
      <DesignIntro
        eyebrow="POCHICAL / DESIGN"
        title={
          <>
            毎日のシフトに、<span>やさしい余白。</span>
          </>
        }
      >
        見るときは、すっきり。入力は、ポチッと。
      </DesignIntro>
      <nav aria-label="デザイン資料" className={documentList}>
        {documents.map((document) => (
          <Link
            key={document.title}
            params={{ _splat: "splat" in document ? document.splat : "" }}
            // The MDX documents load as a page of their own, with their
            // stylesheet (design_.$.tsx).
            reloadDocument={document.to === "/design/$"}
            to={document.to}
          >
            <span>
              <strong>{document.title}</strong>
              {document.description}
            </span>
            <ChevronRight aria-hidden="true" size={18} />
          </Link>
        ))}
      </nav>
    </DesignPage>
  );
}
