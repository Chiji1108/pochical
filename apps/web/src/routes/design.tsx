import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { useState } from "react";
import {
  DesignCalendar,
  initialDesignSchedule,
} from "../components/design-calendar";
import designStyles from "../design.css?url";
import { pageMeta } from "../lib/site";

export const Route = createFileRoute("/design")({
  head: () => ({
    ...pageMeta(
      "デザインプレビュー",
      "カレンダーとシフト入力のデザイン",
      "/design",
      true
    ),
    links: [{ rel: "stylesheet", href: designStyles }],
  }),
  component: DesignPage,
});

function DesignPage() {
  const [schedule, setSchedule] = useState(() => initialDesignSchedule());
  const [version, setVersion] = useState(0);
  return (
    <main className="design-page" id="main">
      <div className="design-toolbar">
        <Link to="/">
          <ArrowLeft aria-hidden="true" size={16} /> ポチカレ
        </Link>
        <button
          onClick={() => {
            setSchedule(initialDesignSchedule());
            setVersion((value) => value + 1);
          }}
          type="button"
        >
          <RotateCcw aria-hidden="true" size={14} /> サンプルに戻す
        </button>
      </div>
      <header className="design-intro">
        <p>POCHICAL / DESIGN STUDY</p>
        <h1>
          毎日のシフトに、<span>やさしい余白。</span>
        </h1>
        <p className="design-description">
          見るときは、すっきり。入力は、ポチッと。
        </p>
      </header>
      <nav aria-label="デザインの比較" className="design-index">
        <a href="#design-edit-title">4パターン</a>
        <a href="#design-six-weeks-title">6段の月 × 8パターン</a>
      </nav>
      <div className="design-screens" key={version}>
        <section aria-labelledby="design-view-title">
          <h2 id="design-view-title">
            <span>01</span> カレンダー表示
          </h2>
          <DesignCalendar
            initialEditing={false}
            onChange={setSchedule}
            schedule={schedule}
          />
          <p className="design-caption">ひと月の予定と、お休みをひと目で。</p>
        </section>
        <section aria-labelledby="design-edit-title">
          <h2 id="design-edit-title">
            <span>02</span> シフト入力
          </h2>
          <DesignCalendar
            initialEditing
            onChange={setSchedule}
            schedule={schedule}
          />
          <p className="design-caption">
            シフトを押すと翌日へ。日付をタップして修正もできます。
          </p>
        </section>
        <PatternStudy
          caption="2026年8月。8パターンを4列×2段で比較。"
          count={8}
          id="design-six-weeks-title"
          month={7}
          number="03"
          title="6段の月 × 8パターン"
        />
      </div>
      <p className="design-footnote">
        実際にタップして試せます。01・02は連動、03は個別に操作できます。
        <br />
        全画面を高さ844pxに固定。架空のサンプルで、再読み込みすると元に戻ります。
      </p>
    </main>
  );
}

function PatternStudy({
  count,
  month = 8,
  id,
  number,
  title,
  caption,
}: {
  count: 8;
  month?: number;
  id: string;
  number: string;
  title: string;
  caption: string;
}) {
  const [schedule, setSchedule] = useState(() =>
    initialDesignSchedule(count, month)
  );
  return (
    <section aria-labelledby={id}>
      <h2 id={id}>
        <span>{number}</span>
        {title}
      </h2>
      <DesignCalendar
        initialEditing
        initialMonth={month}
        onChange={setSchedule}
        patternCount={count}
        schedule={schedule}
      />
      <p className="design-caption">{caption}</p>
    </section>
  );
}
