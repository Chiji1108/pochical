import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Palette, RotateCcw } from "lucide-react";
import { useState } from "react";

import {
  DesignCalendar,
  initialDesignSchedule,
} from "../components/design-calendar";
import { DesignOnboarding } from "../components/design-onboarding";
import {
  AppearanceContext,
  ColorChoiceContext,
  ColorSchemeContext,
  SetToneContext,
  ThemeContext,
  ToneContext,
  themeOfColor,
  themeStyle,
} from "../components/design-theme";
import type { Appearance, ColorChoice } from "../components/design-theme";
import {
  CellNamesContext,
  IconWeightContext,
  LookSettingsContext,
  MonochromeContext,
  OffHighlightContext,
  ShiftMarkStyleContext,
  baseLook,
  lookDefaults,
} from "../components/shift-mark";
import type { LookSettings } from "../components/shift-mark";
import type { Tone } from "../lib/design-tokens";
import {
  designVariantKeys,
  designVariantOptions,
  parseDesignVariants,
} from "../lib/design-variants";
import type { DesignVariants } from "../lib/design-variants";
import { pageMeta } from "../lib/site";
import { useDeviceScheme } from "../lib/use-device-scheme";

import designStyles from "../design.css?url";

export const Route = createFileRoute("/design")({
  component: DesignPage,
  head: () => ({
    ...pageMeta(
      "デザインプレビュー",
      "カレンダーとシフト入力のデザイン",
      "/design",
      true
    ),
    links: [{ href: designStyles, rel: "stylesheet" }],
  }),
  validateSearch: parseDesignVariants,
});

const screenLinks = [
  { id: "design-view-title", number: "01", title: "カレンダー表示" },
  { id: "design-edit-title", number: "02", title: "シフト入力" },
  { id: "design-six-weeks-title", number: "03", title: "6段の月 × 8パターン" },
  { id: "design-onboarding-title", number: "04", title: "はじめての設定" },
];

function DesignPage() {
  const variants = Route.useSearch();
  // The 予定 variant starts over with the sample or with nothing entered.
  const startSchedule = (sample: DesignVariants["scheduleSample"]) =>
    sample === "empty" ? {} : initialDesignSchedule();
  const [schedule, setSchedule] = useState(() =>
    startSchedule(variants.scheduleSample)
  );
  const [version, setVersion] = useState(0);
  const navigate = Route.useNavigate();
  // Each style keeps its own switches, so going back to a style finds them
  // as they were left.
  const [lookStyle, setLookStyle] = useState(baseLook.style);
  const [looks, setLooks] = useState(lookDefaults);
  const look = looks[lookStyle];
  // Changes the given style's switches (the current one if none is given)
  // and makes it the current style.
  const updateLook = (change: Partial<LookSettings>) => {
    const target = change.style ?? lookStyle;
    setLookStyle(target);
    setLooks((previous) => ({
      ...previous,
      [target]: { ...previous[target], ...change },
    }));
  };
  const [color, setColor] = useState<ColorChoice>("multi");
  const theme = themeOfColor(color);
  const [tone, setTone] = useState<Tone>("deep");
  const [appearance, setAppearance] = useState<Appearance>("system");
  // 外観 in settings follows this computer's own light or dark setting
  // unless it keeps one.
  const deviceScheme = useDeviceScheme();
  const scheme = appearance === "system" ? deviceScheme : appearance;
  return (
    <main className="design-page" id="main" style={themeStyle(theme, "light")}>
      <div className="design-toolbar">
        <Link to="/">
          <ArrowLeft aria-hidden="true" size={16} /> ポチカル
        </Link>
        <div className="design-toolbar-actions">
          <Link className="design-toolbar-link" to="/design/colors">
            <Palette aria-hidden="true" size={14} /> カラーパレット
          </Link>
          <button
            onClick={() => {
              setSchedule(startSchedule(variants.scheduleSample));
              setVersion((value) => value + 1);
            }}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={14} /> サンプルに戻す
          </button>
        </div>
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
        onChange={(key, value) => {
          if (key === "scheduleSample") {
            setSchedule(
              startSchedule(value as DesignVariants["scheduleSample"])
            );
            setVersion((previous) => previous + 1);
          }
          void navigate({
            replace: true,
            resetScroll: false,
            search: (previous) => ({ ...previous, [key]: value }),
          });
        }}
        variants={variants}
      />
      <AppearanceContext value={{ appearance, setAppearance }}>
        <ColorSchemeContext value={scheme}>
          <ToneContext value={tone}>
            <SetToneContext value={setTone}>
              <ColorChoiceContext value={{ color, setColor }}>
                <ThemeContext value={{ theme }}>
                  <LookSettingsContext value={{ look, updateLook }}>
                    <IconWeightContext
                      value={look.fill ? "duotone" : "regular"}
                    >
                      <ShiftMarkStyleContext value={look.style}>
                        <CellNamesContext
                          value={{
                            names: {
                              badge: look.names,
                              emoji: look.names,
                              icon: look.names,
                            },
                            setNames: (names) => {
                              updateLook({ names: names[look.style] });
                            },
                          }}
                        >
                          <OffHighlightContext
                            value={{
                              highlight: {
                                badge: look.highlight,
                                emoji: look.highlight,
                                icon: look.highlight,
                              },
                              setHighlight: (highlight) => {
                                updateLook({
                                  highlight:
                                    highlight[look.style] ?? look.highlight,
                                });
                              },
                            }}
                          >
                            <MonochromeContext
                              value={{ monochrome: color !== "multi" }}
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
                            </MonochromeContext>
                          </OffHighlightContext>
                        </CellNamesContext>
                      </ShiftMarkStyleContext>
                    </IconWeightContext>
                  </LookSettingsContext>
                </ThemeContext>
              </ColorChoiceContext>
            </SetToneContext>
          </ToneContext>
        </ColorSchemeContext>
      </AppearanceContext>
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
                  onClick={() => {
                    onChange(key, value);
                  }}
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
