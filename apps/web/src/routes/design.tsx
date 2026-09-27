import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { DesignAppIcon } from "../components/design-app-icon";
import {
  DesignCalendar,
  initialDesignSchedule,
  patternSets,
} from "../components/design-calendar";
import {
  DesignProviders,
  useDesignTheme,
} from "../components/design-providers";
import { themeStyle } from "../components/design-theme";
import { createUserStore, UserStoreContext } from "../lib/design-user-store";
import { parseDesignVariants } from "../lib/design-variants";
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
    description: "役割ごとの色、トーンごとのテーマ、シフトの色の見分けやすさ。",
    title: "カラーパレット",
    to: "/design/colors",
  },
] as const;

// Studies still on this page until they get pages of their own.
const studyLinks = [
  { id: "design-six-weeks-title", number: "01", title: "6段の月 × 8パターン" },
  { id: "design-app-icon-title", number: "02", title: "アプリアイコン" },
];

// Screens here take the defaults of the choices /demo can switch.
const defaultVariants = parseDesignVariants({});

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
          <PatternStudy />
          <section aria-labelledby="design-app-icon-title">
            <h2 id="design-app-icon-title">
              <span>02</span> アプリアイコン
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

// Someone with eight patterns, on a month six weeks tall.
function PatternStudy() {
  const count = 8;
  const month = 7;
  const [person] = useState(() =>
    createUserStore({
      patternKeys: patternSets[count],
      schedule: initialDesignSchedule(count, month),
    })
  );
  return (
    <section aria-labelledby="design-six-weeks-title">
      <h2 id="design-six-weeks-title">
        <span>01</span> 6段の月 × 8パターン
      </h2>
      <UserStoreContext value={person}>
        <DesignCalendar
          initialEditing
          initialMonth={month}
          variants={defaultVariants}
        />
      </UserStoreContext>
      <p className="design-caption">2026年8月。8パターンを4列×2段で比較。</p>
    </section>
  );
}
