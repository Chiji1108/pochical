import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { useState } from "react";
import {
  DesignCalendar,
  initialDesignSchedule,
} from "../components/design-calendar";
import { DesignOnboarding } from "../components/design-onboarding";
import {
  IconSetContext,
  SetShiftMarkStyleContext,
  ShiftMarkStyleContext,
} from "../components/shift-mark";
import designStyles from "../design.css?url";
import {
  type DesignVariants,
  designVariantKeys,
  designVariantOptions,
  parseDesignVariants,
} from "../lib/design-variants";
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
  validateSearch: parseDesignVariants,
  component: DesignPage,
});

const screenLinks = [
  { id: "design-view-title", number: "01", title: "カレンダー表示" },
  { id: "design-edit-title", number: "02", title: "シフト入力" },
  { id: "design-six-weeks-title", number: "03", title: "6段の月 × 8パターン" },
  { id: "design-onboarding-title", number: "04", title: "はじめての設定" },
];

function DesignPage() {
  const [schedule, setSchedule] = useState(() => initialDesignSchedule());
  const [version, setVersion] = useState(0);
  const variants = Route.useSearch();
  const navigate = Route.useNavigate();
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
      <nav aria-label="画面の一覧" className="design-index">
        {screenLinks.map(({ id, number, title }) => (
          <a href={`#${id}`} key={id}>
            <span>{number}</span>
            {title}
          </a>
        ))}
      </nav>
      <VariantPanel
        onChange={(key, value) =>
          navigate({
            replace: true,
            resetScroll: false,
            search: (previous) => ({ ...previous, [key]: value }),
          })
        }
        variants={variants}
      />
      <IconSetContext value={variants.iconSet}>
        <ShiftMarkStyleContext value={variants.shiftMark}>
          <SetShiftMarkStyleContext
            value={(style) =>
              navigate({
                replace: true,
                resetScroll: false,
                search: (previous) => ({ ...previous, shiftMark: style }),
              })
            }
          >
            <div className="design-screens" key={version}>
              <section aria-labelledby="design-view-title">
                <h2 id="design-view-title">
                  <span>01</span> カレンダー表示
                </h2>
                <DesignCalendar
                  initialEditing={false}
                  onChange={setSchedule}
                  schedule={schedule}
                  variants={variants}
                />
                <p className="design-caption">
                  ひと月の予定と、お休みをひと目で。
                </p>
              </section>
              <section aria-labelledby="design-edit-title">
                <h2 id="design-edit-title">
                  <span>02</span> シフト入力
                </h2>
                <DesignCalendar
                  initialEditing
                  onChange={setSchedule}
                  schedule={schedule}
                  variants={variants}
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
                variants={variants}
              />
              <section aria-labelledby="design-onboarding-title">
                <h2 id="design-onboarding-title">
                  <span>04</span> はじめての設定
                </h2>
                <DesignOnboarding variants={variants} />
                <p className="design-caption">
                  最初の1問で、入れやすい始め方に分かれます。
                </p>
              </section>
            </div>
          </SetShiftMarkStyleContext>
        </ShiftMarkStyleContext>
      </IconSetContext>
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
  variants,
}: {
  count: 8;
  month?: number;
  id: string;
  number: string;
  title: string;
  caption: string;
  variants: DesignVariants;
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
        variants={variants}
      />
      <p className="design-caption">{caption}</p>
    </section>
  );
}

function VariantPanel({
  variants,
  onChange,
}: {
  variants: DesignVariants;
  onChange: <K extends keyof DesignVariants>(
    key: K,
    value: DesignVariants[K]
  ) => void;
}) {
  return (
    <section
      aria-labelledby="design-variants-title"
      className="design-variants"
    >
      <h2 id="design-variants-title">比べる案</h2>
      {designVariantKeys.map((key) => {
        const { label, choices } = designVariantOptions[key];
        return (
          <fieldset key={key}>
            <legend>{label}</legend>
            <div className="design-segment">
              {choices.map(({ value, label: choiceLabel }) => (
                <button
                  aria-pressed={variants[key] === value}
                  key={value}
                  onClick={() => onChange(key, value)}
                  type="button"
                >
                  {choiceLabel}
                </button>
              ))}
            </div>
          </fieldset>
        );
      })}
    </section>
  );
}
